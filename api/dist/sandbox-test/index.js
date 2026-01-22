"use strict";
/**
 * Sandbox Testing Endpoint
 *
 * Provides endpoints for testing Plaid integration in sandbox environment.
 * NOT FOR PRODUCTION USE.
 *
 * POST /api/sandbox/test - Run a specific test scenario
 *
 * Test Scenarios:
 * - create-item: Create a new item via sandbox API
 * - reset-login: Force item into ITEM_LOGIN_REQUIRED state
 * - fire-webhook: Fire a specific webhook for testing
 * - update-mode: Test the complete update mode flow
 * - sync-available: Test SYNC_UPDATES_AVAILABLE webhook
 * - new-accounts: Test NEW_ACCOUNTS_AVAILABLE webhook
 * - full-flow: Run complete end-to-end test
 *
 * @module sandbox-test
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
const encryption_1 = require("../shared/encryption");
const plaid_client_1 = require("../shared/plaid-client");
const plaid_1 = require("plaid");
/**
 * CORS headers
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
/**
 * Verify we're in sandbox environment
 */
function verifySandbox() {
    if (process.env.PLAID_ENV !== 'sandbox') {
        throw new Error('Sandbox tests can only run in sandbox environment. Set PLAID_ENV=sandbox');
    }
}
/**
 * Test: Create a new item via sandbox API
 * This bypasses the hosted link flow for testing
 */
async function testCreateItem(context, clientId, institutionId = 'ins_109508' // First Platypus Bank
) {
    const startTime = Date.now();
    try {
        context.log(`Creating sandbox item for client ${clientId} at institution ${institutionId}`);
        const client = (0, plaid_client_1.getPlaidClient)();
        // 1. Create public token via sandbox API
        const sandboxResponse = await client.sandboxPublicTokenCreate({
            institution_id: institutionId,
            initial_products: [plaid_1.Products.Transactions],
            options: {
                webhook: process.env.PLAID_WEBHOOK_URL,
            },
        });
        const publicToken = sandboxResponse.data.public_token;
        context.log(`Created public token: ${publicToken.substring(0, 20)}...`);
        // 2. Exchange for access token
        const exchangeResult = await (0, plaid_client_1.exchangePublicToken)(publicToken);
        const accessToken = exchangeResult.access_token;
        const plaidItemId = exchangeResult.item_id;
        context.log(`Exchanged for access token, item_id: ${plaidItemId}`);
        // 3. Check for duplicate item (same client + same institution)
        const duplicateCheck = await (0, database_1.executeQuery)(`SELECT item_id, status FROM items 
             WHERE client_id = @clientId 
               AND institution_id = @institutionId 
               AND status != 'archived'`, { clientId, institutionId });
        if (duplicateCheck.recordset.length > 0) {
            // Update existing item instead of creating duplicate
            const existingItem = duplicateCheck.recordset[0];
            context.log(`Found existing item ${existingItem.item_id} for same institution - updating`);
            const { encryptedBuffer, keyId } = await (0, encryption_1.encrypt)(accessToken);
            await (0, database_1.executeQuery)(`UPDATE items 
                 SET plaid_item_id = @plaidItemId,
                     access_token = @accessToken,
                     access_token_key_id = @keyId,
                     status = 'active',
                     last_error_code = NULL,
                     last_error_message = NULL,
                     updated_at = GETDATE()
                 WHERE item_id = @itemId`, {
                plaidItemId,
                accessToken: encryptedBuffer,
                keyId,
                itemId: existingItem.item_id,
            });
            return {
                success: true,
                test: 'create-item',
                message: `Updated existing item ${existingItem.item_id} (duplicate prevention)`,
                data: {
                    item_id: existingItem.item_id,
                    plaid_item_id: plaidItemId,
                    was_duplicate: true,
                },
                duration_ms: Date.now() - startTime,
            };
        }
        // 4. Get item details
        const itemDetails = await (0, plaid_client_1.getItem)(accessToken);
        const institutionName = itemDetails.item.institution_name || 'Unknown';
        // 5. Encrypt and save new item
        const { encryptedBuffer, keyId } = await (0, encryption_1.encrypt)(accessToken);
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
        const itemId = insertResult.recordset[0].item_id;
        context.log(`Created item: ${itemId}`);
        // 6. Fetch and save accounts
        const accountsResult = await (0, plaid_client_1.getAccounts)(accessToken);
        let accountCount = 0;
        for (const account of accountsResult.accounts) {
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
            accountCount++;
        }
        return {
            success: true,
            test: 'create-item',
            message: `Created item with ${accountCount} accounts`,
            data: {
                item_id: itemId,
                plaid_item_id: plaidItemId,
                institution_id: institutionId,
                institution_name: institutionName,
                account_count: accountCount,
            },
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            test: 'create-item',
            message: 'Failed to create item',
            error: error instanceof Error ? error.message : String(error),
            duration_ms: Date.now() - startTime,
        };
    }
}
/**
 * Test: Reset item login (force ITEM_LOGIN_REQUIRED)
 */
async function testResetLogin(context, itemId) {
    const startTime = Date.now();
    try {
        context.log(`Resetting login for item ${itemId}`);
        // 1. Get item with access token
        const itemResult = await (0, database_1.executeQuery)(`SELECT access_token, access_token_key_id, plaid_item_id
             FROM items WHERE item_id = @itemId`, { itemId });
        if (itemResult.recordset.length === 0) {
            throw new Error(`Item ${itemId} not found`);
        }
        const item = itemResult.recordset[0];
        const accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
        // 2. Call sandbox reset login
        await (0, plaid_client_1.sandboxResetLogin)(accessToken);
        context.log(`Reset login called for item ${item.plaid_item_id}`);
        // 3. Update item status in our DB (the webhook would do this too)
        await (0, database_1.executeQuery)(`UPDATE items 
             SET status = 'login_required',
                 last_error_code = 'ITEM_LOGIN_REQUIRED',
                 last_error_message = 'Login reset via sandbox API',
                 last_error_timestamp = GETDATE(),
                 updated_at = GETDATE()
             WHERE item_id = @itemId`, { itemId });
        return {
            success: true,
            test: 'reset-login',
            message: `Item ${itemId} reset to ITEM_LOGIN_REQUIRED state`,
            data: {
                item_id: itemId,
                plaid_item_id: item.plaid_item_id,
                new_status: 'login_required',
            },
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            test: 'reset-login',
            message: 'Failed to reset login',
            error: error instanceof Error ? error.message : String(error),
            duration_ms: Date.now() - startTime,
        };
    }
}
/**
 * Test: Fire a webhook
 */
async function testFireWebhook(context, itemId, webhookCode) {
    const startTime = Date.now();
    try {
        context.log(`Firing webhook ${webhookCode} for item ${itemId}`);
        // 1. Get item with access token
        const itemResult = await (0, database_1.executeQuery)(`SELECT access_token, access_token_key_id, plaid_item_id
             FROM items WHERE item_id = @itemId`, { itemId });
        if (itemResult.recordset.length === 0) {
            throw new Error(`Item ${itemId} not found`);
        }
        const item = itemResult.recordset[0];
        const accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
        // 2. Validate webhook code
        const validCodes = Object.values(plaid_client_1.SandboxWebhookCodes);
        if (!validCodes.includes(webhookCode)) {
            throw new Error(`Invalid webhook code: ${webhookCode}. Valid codes: ${validCodes.join(', ')}`);
        }
        // 3. Fire the webhook
        await (0, plaid_client_1.sandboxFireWebhook)(accessToken, webhookCode);
        return {
            success: true,
            test: 'fire-webhook',
            message: `Fired ${webhookCode} webhook for item ${itemId}`,
            data: {
                item_id: itemId,
                plaid_item_id: item.plaid_item_id,
                webhook_code: webhookCode,
            },
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            test: 'fire-webhook',
            message: `Failed to fire webhook ${webhookCode}`,
            error: error instanceof Error ? error.message : String(error),
            duration_ms: Date.now() - startTime,
        };
    }
}
/**
 * Test: Complete Update Mode flow
 * 1. Reset login (force error state)
 * 2. Create update mode link token
 * 3. Verify item is ready for update
 */
async function testUpdateModeFlow(context, itemId, clientId) {
    const startTime = Date.now();
    const steps = [];
    try {
        context.log(`Testing update mode flow for item ${itemId}`);
        // Step 1: Get current item state
        const itemResult = await (0, database_1.executeQuery)(`SELECT access_token, access_token_key_id, plaid_item_id, status, institution_name
             FROM items WHERE item_id = @itemId AND client_id = @clientId`, { itemId, clientId });
        if (itemResult.recordset.length === 0) {
            throw new Error(`Item ${itemId} not found for client ${clientId}`);
        }
        const item = itemResult.recordset[0];
        steps.push({ step: 'get-item', status: item.status, institution: item.institution_name });
        // Step 2: Reset login to force error state
        const accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
        await (0, plaid_client_1.sandboxResetLogin)(accessToken);
        await (0, database_1.executeQuery)(`UPDATE items 
             SET status = 'login_required',
                 last_error_code = 'ITEM_LOGIN_REQUIRED',
                 updated_at = GETDATE()
             WHERE item_id = @itemId`, { itemId });
        steps.push({ step: 'reset-login', new_status: 'login_required' });
        // Step 3: Get client info for link token
        const clientResult = await (0, database_1.executeQuery)(`SELECT email, phone_number FROM clients WHERE client_id = @clientId`, { clientId });
        const clientInfo = clientResult.recordset[0];
        // Step 4: Create update mode link token
        const linkResponse = await (0, plaid_client_1.createLinkToken)({
            clientUserId: String(clientId),
            email: clientInfo.email,
            phoneNumber: clientInfo.phone_number || undefined,
            accessToken, // This makes it update mode
            accountSelectionEnabled: true, // Allow adding/removing accounts
        });
        steps.push({
            step: 'create-update-link',
            link_token: linkResponse.link_token.substring(0, 30) + '...',
            hosted_link_url: linkResponse.hosted_link_url,
            expires_at: linkResponse.expiration,
        });
        // Step 5: Save link token
        await (0, database_1.executeQuery)(`INSERT INTO link_tokens (link_token, client_id, hosted_link_url, expires_at, status)
             VALUES (@linkToken, @clientId, @hostedUrl, @expiresAt, 'pending')`, {
            linkToken: linkResponse.link_token,
            clientId,
            hostedUrl: linkResponse.hosted_link_url,
            expiresAt: linkResponse.expiration,
        });
        steps.push({ step: 'save-link-token', status: 'pending' });
        return {
            success: true,
            test: 'update-mode-flow',
            message: 'Update mode flow ready - client can complete reauth via hosted link',
            data: {
                item_id: itemId,
                client_id: clientId,
                hosted_link_url: linkResponse.hosted_link_url,
                link_token: linkResponse.link_token,
                expires_at: linkResponse.expiration,
                steps,
                next_action: 'Client should open the hosted_link_url to complete re-authentication',
            },
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            test: 'update-mode-flow',
            message: 'Update mode flow failed',
            error: error instanceof Error ? error.message : String(error),
            data: { steps },
            duration_ms: Date.now() - startTime,
        };
    }
}
/**
 * Test: SYNC_UPDATES_AVAILABLE flow
 */
async function testSyncUpdatesAvailable(context, itemId) {
    const startTime = Date.now();
    try {
        context.log(`Testing SYNC_UPDATES_AVAILABLE for item ${itemId}`);
        // 1. Fire the webhook
        const fireResult = await testFireWebhook(context, itemId, 'SYNC_UPDATES_AVAILABLE');
        if (!fireResult.success) {
            throw new Error(fireResult.error);
        }
        // 2. Wait a moment for webhook to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 3. Check item has sync flag set
        const itemResult = await (0, database_1.executeQuery)(`SELECT has_sync_updates, status FROM items WHERE item_id = @itemId`, { itemId });
        const item = itemResult.recordset[0];
        return {
            success: true,
            test: 'sync-updates-available',
            message: `SYNC_UPDATES_AVAILABLE fired. has_sync_updates=${item.has_sync_updates}`,
            data: {
                item_id: itemId,
                has_sync_updates: item.has_sync_updates,
                status: item.status,
                note: 'In production, CPA would click "Sync" button to trigger /transactions/sync',
            },
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            test: 'sync-updates-available',
            message: 'SYNC_UPDATES_AVAILABLE test failed',
            error: error instanceof Error ? error.message : String(error),
            duration_ms: Date.now() - startTime,
        };
    }
}
/**
 * Test: NEW_ACCOUNTS_AVAILABLE flow
 */
async function testNewAccountsAvailable(context, itemId) {
    const startTime = Date.now();
    try {
        context.log(`Testing NEW_ACCOUNTS_AVAILABLE for item ${itemId}`);
        // 1. Fire the webhook
        const fireResult = await testFireWebhook(context, itemId, 'NEW_ACCOUNTS_AVAILABLE');
        if (!fireResult.success) {
            throw new Error(fireResult.error);
        }
        // 2. Wait for webhook to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 3. Check item status changed to needs_update
        const itemResult = await (0, database_1.executeQuery)(`SELECT status FROM items WHERE item_id = @itemId`, { itemId });
        const item = itemResult.recordset[0];
        return {
            success: true,
            test: 'new-accounts-available',
            message: `NEW_ACCOUNTS_AVAILABLE fired. status=${item.status}`,
            data: {
                item_id: itemId,
                status: item.status,
                expected_status: 'needs_update',
                note: 'CPA should send update mode link with accountSelectionEnabled=true',
            },
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            test: 'new-accounts-available',
            message: 'NEW_ACCOUNTS_AVAILABLE test failed',
            error: error instanceof Error ? error.message : String(error),
            duration_ms: Date.now() - startTime,
        };
    }
}
/**
 * Test: Full end-to-end flow
 */
async function testFullFlow(context, clientId) {
    const startTime = Date.now();
    const results = [];
    try {
        context.log(`Running full flow test for client ${clientId}`);
        // 1. Create item
        const createResult = await testCreateItem(context, clientId);
        results.push(createResult);
        if (!createResult.success) {
            throw new Error(`Create item failed: ${createResult.error}`);
        }
        const itemId = createResult.data.item_id;
        // 2. Test SYNC_UPDATES_AVAILABLE
        const syncResult = await testSyncUpdatesAvailable(context, itemId);
        results.push(syncResult);
        // 3. Test NEW_ACCOUNTS_AVAILABLE  
        const newAccountsResult = await testNewAccountsAvailable(context, itemId);
        results.push(newAccountsResult);
        // 4. Test Update Mode flow
        const updateResult = await testUpdateModeFlow(context, itemId, clientId);
        results.push(updateResult);
        // 5. Test LOGIN_REPAIRED webhook
        const loginRepairedResult = await testFireWebhook(context, itemId, 'LOGIN_REPAIRED');
        results.push(loginRepairedResult);
        // Wait for webhook
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Check final status
        const finalItem = await (0, database_1.executeQuery)(`SELECT status FROM items WHERE item_id = @itemId`, { itemId });
        const passed = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        return {
            success: failed === 0,
            test: 'full-flow',
            message: `Full flow complete: ${passed} passed, ${failed} failed`,
            data: {
                item_id: itemId,
                final_status: finalItem.recordset[0]?.status,
                results,
            },
            duration_ms: Date.now() - startTime,
        };
    }
    catch (error) {
        return {
            success: false,
            test: 'full-flow',
            message: 'Full flow test failed',
            error: error instanceof Error ? error.message : String(error),
            data: { results },
            duration_ms: Date.now() - startTime,
        };
    }
}
/**
 * List all available webhook codes for testing
 */
function getAvailableWebhooks() {
    return [
        'DEFAULT_UPDATE',
        'NEW_ACCOUNTS_AVAILABLE',
        'LOGIN_REPAIRED',
        'PENDING_DISCONNECT',
        'SYNC_UPDATES_AVAILABLE',
        'USER_PERMISSION_REVOKED',
        'USER_ACCOUNT_REVOKED',
        'ERROR',
        'PRODUCT_READY',
    ];
}
/**
 * Main HTTP trigger handler
 */
const httpTrigger = async function (context, req) {
    // Handle CORS preflight
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
    try {
        // Verify sandbox environment
        verifySandbox();
        const { test, clientId, itemId, webhookCode, institutionId } = req.body || {};
        if (!test) {
            context.res = {
                status: 400,
                body: {
                    error: 'Missing test parameter',
                    available_tests: [
                        'create-item',
                        'reset-login',
                        'fire-webhook',
                        'update-mode',
                        'sync-available',
                        'new-accounts',
                        'full-flow',
                    ],
                    available_webhooks: getAvailableWebhooks(),
                    example: {
                        'create-item': { test: 'create-item', clientId: 1, institutionId: 'ins_109508' },
                        'reset-login': { test: 'reset-login', itemId: 1 },
                        'fire-webhook': { test: 'fire-webhook', itemId: 1, webhookCode: 'SYNC_UPDATES_AVAILABLE' },
                        'update-mode': { test: 'update-mode', itemId: 1, clientId: 1 },
                        'full-flow': { test: 'full-flow', clientId: 1 },
                    },
                },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        let result;
        switch (test) {
            case 'create-item':
                if (!clientId)
                    throw new Error('clientId is required');
                result = await testCreateItem(context, clientId, institutionId);
                break;
            case 'reset-login':
                if (!itemId)
                    throw new Error('itemId is required');
                result = await testResetLogin(context, itemId);
                break;
            case 'fire-webhook':
                if (!itemId)
                    throw new Error('itemId is required');
                if (!webhookCode)
                    throw new Error('webhookCode is required');
                result = await testFireWebhook(context, itemId, webhookCode);
                break;
            case 'update-mode':
                if (!itemId)
                    throw new Error('itemId is required');
                if (!clientId)
                    throw new Error('clientId is required');
                result = await testUpdateModeFlow(context, itemId, clientId);
                break;
            case 'sync-available':
                if (!itemId)
                    throw new Error('itemId is required');
                result = await testSyncUpdatesAvailable(context, itemId);
                break;
            case 'new-accounts':
                if (!itemId)
                    throw new Error('itemId is required');
                result = await testNewAccountsAvailable(context, itemId);
                break;
            case 'full-flow':
                if (!clientId)
                    throw new Error('clientId is required');
                result = await testFullFlow(context, clientId);
                break;
            default:
                throw new Error(`Unknown test: ${test}`);
        }
        context.res = {
            status: result.success ? 200 : 500,
            body: result,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
    catch (error) {
        context.log.error('Sandbox test error:', error);
        context.res = {
            status: 500,
            body: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map