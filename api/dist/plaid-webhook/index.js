"use strict";
/**
 * Plaid Webhook Handler
 *
 * Receives webhooks from Plaid and processes them:
 * - SESSION_FINISHED: Exchange token, save item + accounts
 * - ITEM webhooks: Update item status
 * - TRANSACTIONS webhooks: Set sync flag
 *
 * Endpoint: POST /api/plaid/webhook
 *
 * @module plaid-webhook
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
const encryption_1 = require("../shared/encryption");
const plaid_client_1 = require("../shared/plaid-client");
/**
 * Generate a unique webhook ID for idempotency
 */
function generateWebhookId(webhook, timestamp) {
    const components = [
        webhook.webhook_type,
        webhook.webhook_code,
        webhook.item_id || 'no-item',
        webhook.link_session_id || '',
        timestamp.toISOString().substring(0, 16),
    ];
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `wh_${Math.abs(hash).toString(16)}_${Date.now()}`;
}
/**
 * Log the webhook to the database
 */
async function logWebhook(context, webhook, webhookId) {
    const existingResult = await (0, database_1.executeQuery)(`SELECT log_id FROM webhook_log WHERE webhook_id = @webhookId`, { webhookId });
    if (existingResult.recordset.length > 0) {
        context.log.warn(`Duplicate webhook received: ${webhookId}`);
        return { isNew: false, logId: existingResult.recordset[0].log_id };
    }
    let internalItemId = null;
    if (webhook.item_id) {
        const itemResult = await (0, database_1.executeQuery)(`SELECT item_id FROM items WHERE plaid_item_id = @plaidItemId`, { plaidItemId: webhook.item_id });
        if (itemResult.recordset.length > 0) {
            internalItemId = itemResult.recordset[0].item_id;
        }
    }
    const insertResult = await (0, database_1.executeQuery)(`INSERT INTO webhook_log (
            webhook_type, webhook_code, item_id, plaid_item_id, 
            payload, webhook_id, processed, created_at
        )
        OUTPUT INSERTED.log_id
        VALUES (
            @webhookType, @webhookCode, @itemId, @plaidItemId,
            @payload, @webhookId, 0, GETDATE()
        )`, {
        webhookType: webhook.webhook_type,
        webhookCode: webhook.webhook_code,
        itemId: internalItemId,
        plaidItemId: webhook.item_id || null,
        payload: JSON.stringify(webhook),
        webhookId,
    });
    return { isNew: true, logId: insertResult.recordset[0].log_id };
}
/**
 * Update item status based on webhook code
 */
async function updateItemStatus(context, webhook) {
    if (!webhook.item_id)
        return;
    let newStatus = null;
    let errorCode = null;
    let errorMessage = null;
    switch (webhook.webhook_code) {
        case 'ITEM_LOGIN_REQUIRED':
        case 'PENDING_EXPIRATION':
        case 'PENDING_DISCONNECT':
            newStatus = 'login_required';
            break;
        case 'ITEM_ERROR':
            newStatus = 'error';
            if (webhook.error) {
                errorCode = webhook.error.error_code;
                errorMessage = webhook.error.error_message;
            }
            break;
        case 'LOGIN_REPAIRED':
            newStatus = 'active';
            errorCode = null;
            errorMessage = null;
            break;
        case 'USER_PERMISSION_REVOKED':
            newStatus = 'archived';
            break;
        case 'SYNC_UPDATES_AVAILABLE':
            await (0, database_1.executeQuery)(`UPDATE items 
                 SET has_sync_updates = 1, updated_at = GETDATE()
                 WHERE plaid_item_id = @plaidItemId`, { plaidItemId: webhook.item_id });
            context.log(`Set has_sync_updates flag for item: ${webhook.item_id}`);
            return;
        case 'NEW_ACCOUNTS_AVAILABLE':
            newStatus = 'needs_update';
            break;
        default:
            return;
    }
    if (newStatus) {
        await (0, database_1.executeQuery)(`UPDATE items 
             SET status = @status,
                 last_error_code = @errorCode,
                 last_error_message = @errorMessage,
                 last_error_timestamp = CASE WHEN @errorCode IS NOT NULL THEN GETDATE() ELSE last_error_timestamp END,
                 consent_expiration_time = @consentExpiration,
                 updated_at = GETDATE()
             WHERE plaid_item_id = @plaidItemId`, {
            status: newStatus,
            errorCode,
            errorMessage,
            consentExpiration: webhook.consent_expiration_time || null,
            plaidItemId: webhook.item_id,
        });
        context.log(`Updated item ${webhook.item_id} status to: ${newStatus}`);
    }
}
/**
 * Handle SESSION_FINISHED webhook - the main flow!
 *
 * 1. Look up client_id from link_token
 * 2. Exchange public_token → access_token
 * 3. Get item details
 * 4. Encrypt and save item
 * 5. Fetch and save accounts
 */
async function handleSessionFinished(context, webhook) {
    context.log('SESSION_FINISHED webhook received');
    // Get public_token - can be in public_token or public_tokens array
    const publicToken = webhook.public_token || webhook.public_tokens?.[0];
    if (!publicToken) {
        context.log.warn('SESSION_FINISHED webhook missing public_token');
        return;
    }
    if (!webhook.link_token) {
        context.log.warn('SESSION_FINISHED webhook missing link_token');
        return;
    }
    // Step 1: Look up client_id from link_token
    context.log(`Looking up link_token: ${webhook.link_token}`);
    const linkResult = await (0, database_1.executeQuery)(`SELECT link_token, client_id, status 
         FROM link_tokens 
         WHERE link_token = @linkToken`, { linkToken: webhook.link_token });
    if (linkResult.recordset.length === 0) {
        context.log.error(`Link token not found: ${webhook.link_token}`);
        throw new Error('Link token not found in database');
    }
    const linkRecord = linkResult.recordset[0];
    const clientId = linkRecord.client_id;
    context.log(`Found client_id: ${clientId} for link_token`);
    // Check if already processed
    if (linkRecord.status === 'used') {
        context.log.warn(`Link token already used: ${webhook.link_token}`);
        return;
    }
    // Step 2: Exchange public_token → access_token
    context.log('Exchanging public_token for access_token...');
    const exchangeResult = await (0, plaid_client_1.exchangePublicToken)(publicToken);
    const accessToken = exchangeResult.access_token;
    const plaidItemId = exchangeResult.item_id;
    context.log(`Got access_token and item_id: ${plaidItemId}`);
    // Step 3: Get item details (institution name, etc.)
    context.log('Fetching item details...');
    const itemDetails = await (0, plaid_client_1.getItem)(accessToken);
    const institutionId = itemDetails.item.institution_id || null;
    const institutionName = itemDetails.item.institution_name || null;
    context.log(`Institution: ${institutionName} (${institutionId})`);
    // Step 4: Encrypt access_token and save item
    context.log('Encrypting access_token...');
    const { encryptedBuffer, keyId } = await (0, encryption_1.encrypt)(accessToken);
    // Check if item already exists (shouldn't happen, but be safe)
    const existingItem = await (0, database_1.executeQuery)(`SELECT item_id FROM items WHERE plaid_item_id = @plaidItemId`, { plaidItemId });
    let itemId;
    if (existingItem.recordset.length > 0) {
        // Item exists - update it (update mode scenario)
        itemId = existingItem.recordset[0].item_id;
        context.log(`Updating existing item: ${itemId}`);
        await (0, database_1.executeQuery)(`UPDATE items 
             SET access_token = @accessToken,
                 access_token_key_id = @keyId,
                 status = 'active',
                 last_error_code = NULL,
                 last_error_message = NULL,
                 updated_at = GETDATE()
             WHERE item_id = @itemId`, {
            accessToken: encryptedBuffer,
            keyId,
            itemId,
        });
    }
    else {
        // New item - insert it
        context.log('Inserting new item...');
        const insertResult = await (0, database_1.executeQuery)(`INSERT INTO items (
                client_id, plaid_item_id, access_token, access_token_key_id,
                institution_id, institution_name, status
            )
            OUTPUT INSERTED.item_id
            VALUES (
                @clientId, @plaidItemId, @accessToken, @keyId,
                @institutionId, @institutionName, 'active'
            )`, {
            clientId,
            plaidItemId,
            accessToken: encryptedBuffer,
            keyId,
            institutionId,
            institutionName,
        });
        itemId = insertResult.recordset[0].item_id;
        context.log(`Created new item: ${itemId}`);
    }
    // Step 5: Fetch and save accounts
    context.log('Fetching accounts...');
    const accountsResult = await (0, plaid_client_1.getAccounts)(accessToken);
    for (const account of accountsResult.accounts) {
        // Check if account exists
        const existingAccount = await (0, database_1.executeQuery)(`SELECT account_id FROM accounts WHERE plaid_account_id = @plaidAccountId`, { plaidAccountId: account.account_id });
        if (existingAccount.recordset.length > 0) {
            // Update existing account
            await (0, database_1.executeQuery)(`UPDATE accounts 
                 SET account_name = @accountName,
                     official_name = @officialName,
                     current_balance = @currentBalance,
                     available_balance = @availableBalance,
                     credit_limit = @creditLimit,
                     is_active = 1,
                     last_updated_datetime = GETDATE(),
                     updated_at = GETDATE()
                 WHERE plaid_account_id = @plaidAccountId`, {
                accountName: account.name,
                officialName: account.official_name,
                currentBalance: account.balances.current,
                availableBalance: account.balances.available,
                creditLimit: account.balances.limit,
                plaidAccountId: account.account_id,
            });
            context.log(`Updated account: ${account.name}`);
        }
        else {
            // Insert new account
            await (0, database_1.executeQuery)(`INSERT INTO accounts (
                    item_id, plaid_account_id, account_name, official_name,
                    account_type, account_subtype,
                    current_balance, available_balance, credit_limit,
                    is_active, last_updated_datetime
                )
                VALUES (
                    @itemId, @plaidAccountId, @accountName, @officialName,
                    @accountType, @accountSubtype,
                    @currentBalance, @availableBalance, @creditLimit,
                    1, GETDATE()
                )`, {
                itemId,
                plaidAccountId: account.account_id,
                accountName: account.name,
                officialName: account.official_name,
                accountType: account.type,
                accountSubtype: account.subtype,
                currentBalance: account.balances.current,
                availableBalance: account.balances.available,
                creditLimit: account.balances.limit,
            });
            context.log(`Created account: ${account.name}`);
        }
    }
    // Step 6: Mark link_token as used
    await (0, database_1.executeQuery)(`UPDATE link_tokens 
         SET status = 'used', used_at = GETDATE()
         WHERE link_token = @linkToken`, { linkToken: webhook.link_token });
    context.log(`SESSION_FINISHED processing complete for client ${clientId}`);
}
/**
 * Mark webhook as processed
 */
async function markWebhookProcessed(logId, errorMessage) {
    await (0, database_1.executeQuery)(`UPDATE webhook_log 
         SET processed = 1, 
             processed_at = GETDATE(),
             error_message = @errorMessage
         WHERE log_id = @logId`, { logId, errorMessage: errorMessage || null });
}
/**
 * Main webhook handler function
 */
const httpTrigger = async function (context, req) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Plaid-Verification',
    };
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
    if (req.method !== 'POST') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    context.log('Plaid webhook received');
    try {
        const webhook = req.body;
        if (!webhook.webhook_type || !webhook.webhook_code) {
            context.res = {
                status: 400,
                body: { error: 'Missing webhook_type or webhook_code' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        context.log(`Webhook: ${webhook.webhook_type} / ${webhook.webhook_code}`);
        const webhookId = generateWebhookId(webhook, new Date());
        const { isNew, logId } = await logWebhook(context, webhook, webhookId);
        if (!isNew) {
            context.res = {
                status: 200,
                body: {
                    status: 'duplicate',
                    message: 'Webhook already processed',
                    webhook_id: webhookId,
                },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        let processingError;
        try {
            // Handle ITEM webhooks
            if (webhook.webhook_type === 'ITEM') {
                await updateItemStatus(context, webhook);
            }
            // Handle TRANSACTIONS webhooks
            if (webhook.webhook_type === 'TRANSACTIONS') {
                if (webhook.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
                    await updateItemStatus(context, webhook);
                }
            }
            // Handle SESSION_FINISHED - the main flow!
            if (webhook.webhook_type === 'LINK' && webhook.webhook_code === 'SESSION_FINISHED') {
                await handleSessionFinished(context, webhook);
            }
        }
        catch (err) {
            processingError = err instanceof Error ? err.message : String(err);
            context.log.error(`Error processing webhook: ${processingError}`);
        }
        if (logId) {
            await markWebhookProcessed(logId, processingError);
        }
        context.res = {
            status: 200,
            body: {
                status: processingError ? 'error' : 'success',
                message: processingError || 'Webhook processed',
                webhook_id: webhookId,
                log_id: logId,
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
    catch (err) {
        context.log.error('Webhook handler error:', err);
        context.res = {
            status: 500,
            body: {
                error: 'Internal server error',
                message: err instanceof Error ? err.message : 'Unknown error',
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map