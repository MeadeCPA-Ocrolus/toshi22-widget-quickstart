/**
 * Plaid Webhook Handler
 * 
 * Receives webhooks from Plaid and processes them:
 * - SESSION_FINISHED: Exchange token, save item + accounts (with duplicate prevention)
 * - ITEM webhooks: Update item status (including ERROR with ITEM_LOGIN_REQUIRED)
 * - TRANSACTIONS webhooks: Set sync flag
 * - USER_ACCOUNT_REVOKED: Mark specific account as inactive
 * 
 * Endpoint: POST /api/plaid/webhook
 * 
 * @module plaid-webhook
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';
import { encrypt, decrypt } from '../shared/encryption';
import { exchangePublicToken, getItem, getAccounts, getPlaidClient } from '../shared/plaid-client';

// OAuth institutions - these use OAuth flow instead of credential-based
// This list is not exhaustive but covers major OAuth banks
const OAUTH_INSTITUTIONS = [
    'ins_127989', // Chase
    'ins_127991', // Wells Fargo
    'ins_56',     // Chase (alternate)
    'ins_4',      // Wells Fargo (alternate)
    'ins_5',      // Bank of America
    'ins_127990', // Bank of America
    'ins_3',      // US Bank
    'ins_12',     // US Bank (alternate)
    'ins_127987', // Capital One
    'ins_9',      // Capital One (alternate)
    'ins_10',     // American Express
    'ins_127986', // Citi
    'ins_7',      // TD Bank
    'ins_13',     // PNC
    'ins_14',     // Regions
];

/**
 * Check if an institution uses OAuth
 */
function isOAuthInstitution(institutionId: string | null): boolean {
    if (!institutionId) return false;
    return OAUTH_INSTITUTIONS.includes(institutionId);
}

/**
 * Plaid webhook payload structure
 * 
 * Note: Different webhooks have different fields.
 * - ERROR webhook has error details in the `error` object
 * - USER_ACCOUNT_REVOKED has `account_id` for the specific revoked account
 * - SESSION_FINISHED has `public_token` and `link_token`
 */
interface PlaidWebhook {
    webhook_type: string;
    webhook_code: string;
    item_id?: string;
    account_id?: string;  // For USER_ACCOUNT_REVOKED - specific account that was revoked
    error?: {
        error_type: string;
        error_code: string;        // e.g., "ITEM_LOGIN_REQUIRED" lives HERE, not in webhook_code!
        error_code_reason?: string; // e.g., "OAUTH_INVALID_TOKEN", "OAUTH_CONSENT_EXPIRED"
        error_message: string;
    };
    new_transactions?: number;
    removed_transactions?: string[];
    consent_expiration_time?: string;
    // SESSION_FINISHED specific fields
    public_token?: string;
    public_tokens?: string[];
    status?: string;
    link_session_id?: string;
    link_token?: string;
    // PENDING_DISCONNECT specific
    reason?: string;  // "INSTITUTION_MIGRATION" or "INSTITUTION_TOKEN_EXPIRATION"
}

/**
 * Result of looking up an item by plaid_item_id
 */
interface ItemLookup {
    item_id: number;
}

/**
 * Generate a unique webhook ID for idempotency
 */
function generateWebhookId(webhook: PlaidWebhook, timestamp: Date): string {
    const components = [
        webhook.webhook_type,
        webhook.webhook_code,
        webhook.item_id || 'no-item',
        webhook.account_id || '',  // Include account_id for USER_ACCOUNT_REVOKED
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
async function logWebhook(
    context: Context,
    webhook: PlaidWebhook,
    webhookId: string
): Promise<{ isNew: boolean; logId?: number }> {
    const existingResult = await executeQuery<{ log_id: number }>(
        `SELECT log_id FROM webhook_log WHERE webhook_id = @webhookId`,
        { webhookId }
    );

    if (existingResult.recordset.length > 0) {
        context.log.warn(`Duplicate webhook received: ${webhookId}`);
        return { isNew: false, logId: existingResult.recordset[0].log_id };
    }

    let internalItemId: number | null = null;
    if (webhook.item_id) {
        const itemResult = await executeQuery<ItemLookup>(
            `SELECT item_id FROM items WHERE plaid_item_id = @plaidItemId`,
            { plaidItemId: webhook.item_id }
        );
        if (itemResult.recordset.length > 0) {
            internalItemId = itemResult.recordset[0].item_id;
        }
    }

    const insertResult = await executeQuery<{ log_id: number }>(
        `INSERT INTO webhook_log (
            webhook_type, webhook_code, item_id, plaid_item_id, 
            payload, webhook_id, processed, created_at
        )
        OUTPUT INSERTED.log_id
        VALUES (
            @webhookType, @webhookCode, @itemId, @plaidItemId,
            @payload, @webhookId, 0, GETDATE()
        )`,
        {
            webhookType: webhook.webhook_type,
            webhookCode: webhook.webhook_code,
            itemId: internalItemId,
            plaidItemId: webhook.item_id || null,
            payload: JSON.stringify(webhook),
            webhookId,
        }
    );

    return { isNew: true, logId: insertResult.recordset[0].log_id };
}

/**
 * Update item status based on webhook
 * 
 * IMPORTANT: The ERROR webhook contains the specific error code (like ITEM_LOGIN_REQUIRED)
 * inside the `error.error_code` field, NOT in `webhook_code`.
 * 
 * Webhook structure for ERROR:
 * {
 *   webhook_type: "ITEM",
 *   webhook_code: "ERROR",           <-- This is always "ERROR"
 *   error: {
 *     error_code: "ITEM_LOGIN_REQUIRED"  <-- The specific error is HERE
 *   }
 * }
 */
async function updateItemStatus(
    context: Context,
    webhook: PlaidWebhook
): Promise<void> {
    if (!webhook.item_id) return;

    let newStatus: string | null = null;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    switch (webhook.webhook_code) {
        // ============================================================
        // ERROR webhook - Must check error.error_code for specifics!
        // This is how ITEM_LOGIN_REQUIRED actually arrives.
        // ============================================================
        case 'ERROR':
            if (webhook.error) {
                errorCode = webhook.error.error_code;
                errorMessage = webhook.error.error_message;

                // Check the ACTUAL error code inside the error object
                switch (webhook.error.error_code) {
                    case 'ITEM_LOGIN_REQUIRED':
                        newStatus = 'login_required';
                        context.log(`Item ${webhook.item_id} requires re-authentication (ITEM_LOGIN_REQUIRED)`);
                        break;
                    default:
                        newStatus = 'error';
                        context.log(`Item ${webhook.item_id} has error: ${webhook.error.error_code}`);
                }
            } else {
                newStatus = 'error';
            }
            break;

        // ============================================================
        // These webhooks come as standalone codes (not under ERROR)
        // ============================================================

        case 'PENDING_DISCONNECT':
            // US/CA: Item will be disconnected in 7 days
            newStatus = 'login_required';
            context.log(`Item ${webhook.item_id} pending disconnect. Reason: ${webhook.reason}`);
            break;

        case 'LOGIN_REPAIRED':
            // User fixed the item (possibly in another app)
            newStatus = 'active';
            errorCode = null;
            errorMessage = null;
            context.log(`Item ${webhook.item_id} login repaired`);
            break;

        case 'USER_PERMISSION_REVOKED':
            // User revoked ALL permissions for this Item
            newStatus = 'archived';
            context.log(`Item ${webhook.item_id} permissions revoked by user`);
            
            // Get internal item_id
            const itemLookup = await executeQuery<{ item_id: number }>(
                `SELECT item_id FROM items WHERE plaid_item_id = @plaidItemId`,
                { plaidItemId: webhook.item_id }
            );
            
            if (itemLookup.recordset.length > 0) {
                const internalItemId = itemLookup.recordset[0].item_id;
                
                // Archive all transactions for this item (excludes from financial calculations)
                // Uses stored procedure if available, falls back to direct update
                try {
                    await executeQuery(
                        `EXEC sp_archive_item_transactions @item_id = @itemId, @reason = 'item_archived'`,
                        { itemId: internalItemId }
                    );
                    context.log(`Archived transactions for item ${internalItemId}`);
                } catch (spError) {
                    // Stored procedure might not exist yet, fall back to direct update
                    context.log.warn(`sp_archive_item_transactions not available, using direct update`);
                    
                    // Mark all accounts for this item as inactive
                    await executeQuery(
                        `UPDATE accounts 
                         SET is_active = 0, updated_at = GETDATE()
                         WHERE item_id = @itemId`,
                        { itemId: internalItemId }
                    );
                    
                    // Archive transactions if the column exists
                    try {
                        await executeQuery(
                            `UPDATE t
                             SET t.is_archived = 1, t.archived_at = GETDATE(), t.archive_reason = 'item_archived'
                             FROM transactions t
                             JOIN accounts a ON t.account_id = a.account_id
                             WHERE a.item_id = @itemId AND t.is_archived = 0`,
                            { itemId: internalItemId }
                        );
                    } catch (txnError) {
                        // is_archived column might not exist yet
                        context.log.warn(`Could not archive transactions (column may not exist yet)`);
                    }
                }
            }
            break;

        case 'NEW_ACCOUNTS_AVAILABLE':
            // New accounts detected - CPA should send update mode link
            newStatus = 'needs_update';
            context.log(`Item ${webhook.item_id} has new accounts available`);
            break;

        case 'PENDING_EXPIRATION':
            // EU/UK: Consent expiring in 7 days
            newStatus = 'login_required';
            context.log(`Item ${webhook.item_id} consent expiring: ${webhook.consent_expiration_time}`);
            break;

        case 'SYNC_UPDATES_AVAILABLE':
            // Transactions are ready to sync
            // Don't change status, just set a flag
            context.log(`Item ${webhook.item_id} has transaction updates available`);
            await executeQuery(
                `UPDATE items 
                 SET has_sync_updates = 1, updated_at = GETDATE()
                 WHERE plaid_item_id = @plaidItemId`,
                { plaidItemId: webhook.item_id }
            );
            return; // Don't update status
    }

    if (newStatus) {
        await executeQuery(
            `UPDATE items 
             SET status = @status,
                 last_error_code = @errorCode,
                 last_error_message = @errorMessage,
                 last_error_timestamp = CASE WHEN @errorCode IS NOT NULL THEN GETDATE() ELSE last_error_timestamp END,
                 updated_at = GETDATE()
             WHERE plaid_item_id = @plaidItemId`,
            {
                plaidItemId: webhook.item_id,
                status: newStatus,
                errorCode,
                errorMessage,
            }
        );
        context.log(`Updated item ${webhook.item_id} status to: ${newStatus}`);
    }
}

/**
 * Handle USER_ACCOUNT_REVOKED webhook
 * This is for when a user revokes access to a SINGLE account, not the whole item
 */
async function handleAccountRevoked(
    context: Context,
    webhook: PlaidWebhook
): Promise<void> {
    if (!webhook.account_id) {
        context.log.warn('USER_ACCOUNT_REVOKED webhook missing account_id');
        return;
    }

    context.log(`Account ${webhook.account_id} permissions revoked by user`);

    // Mark the specific account as inactive
    await executeQuery(
        `UPDATE accounts 
         SET is_active = 0, updated_at = GETDATE()
         WHERE plaid_account_id = @plaidAccountId`,
        { plaidAccountId: webhook.account_id }
    );

    context.log(`Marked account ${webhook.account_id} as inactive`);
}

/**
 * Handle SESSION_FINISHED webhook - the main flow!
 * 
 * This fires when a client completes the Plaid Link flow (initial or update mode).
 * 
 * Key logic:
 * 1. Checking if same plaid_item_id exists (update mode)
 * 2. Checking if same client + institution exists (duplicate prevention)
 * 3. Creating or updating item
 * 4. Fetching and saving accounts
 */
async function handleSessionFinished(
    context: Context,
    webhook: PlaidWebhook
): Promise<void> {
    context.log('SESSION_FINISHED webhook received');
    
    // Validate link_token exists
    if (!webhook.link_token) {
        context.log.warn('SESSION_FINISHED webhook missing link_token');
        return;
    }

    // Look up client_id from link_token
    // Note: link_token (the string) IS the primary key, not a separate link_token_id
    const linkLookup = await executeQuery<{ link_token: string; client_id: number; status: string }>(
        `SELECT link_token, client_id, status 
         FROM link_tokens 
         WHERE link_token = @linkToken`,
        { linkToken: webhook.link_token }
    );

    if (linkLookup.recordset.length === 0) {
        context.log.error(`Link token not found: ${webhook.link_token}`);
        throw new Error('Link token not found in database');
    }

    const linkRecord = linkLookup.recordset[0];
    const linkToken = linkRecord.link_token;  // The PK
    const clientId = linkRecord.client_id;
    
    // Record the session attempt
    // Note: webhook.status should be 'SUCCESS' for successful completions per Plaid docs
    // But we also check for public_token presence as a fallback
    const sessionStatus = webhook.status || (webhook.public_token || webhook.public_tokens?.[0] ? 'SUCCESS' : 'UNKNOWN');
    const errorCode = webhook.error?.error_code || null;
    const errorMessage = webhook.error?.error_message || null;
    const errorType = webhook.error?.error_type || null;

    // Insert into link_sessions for history tracking
    try {
        await executeQuery(
            `INSERT INTO link_sessions (
                link_token, link_session_id, status, 
                error_code, error_message, error_type
            )
            VALUES (
                @linkToken, @linkSessionId, @status,
                @errorCode, @errorMessage, @errorType
            )`,
            {
                linkToken,
                linkSessionId: webhook.link_session_id || null,
                status: sessionStatus,
                errorCode,
                errorMessage,
                errorType,
            }
        );
    } catch (sessionErr) {
        // Table might not exist yet - log but continue
        context.log.warn(`Could not insert link_session (table may not exist): ${sessionErr}`);
    }

    // Update link_tokens with session info
    try {
        await executeQuery(
            `UPDATE link_tokens 
             SET last_session_status = @status,
                 last_session_error_code = @errorCode,
                 last_session_error_message = @errorMessage,
                 attempt_count = ISNULL(attempt_count, 0) + 1,
                 link_session_id = @linkSessionId
             WHERE link_token = @linkToken`,
            {
                linkToken,
                status: sessionStatus,
                errorCode,
                errorMessage,
                linkSessionId: webhook.link_session_id || null,
            }
        );
    } catch (updateErr) {
        // Columns might not exist yet - log but continue
        context.log.warn(`Could not update link_token session info: ${updateErr}`);
    }

    // Handle non-success statuses
    // Note: Plaid sends "success" (lowercase), so we normalize to lowercase for comparison
    if (sessionStatus?.toLowerCase() !== 'success') {
        context.log(`Link session ended with status: ${sessionStatus}`);
        
        // Log details for CPA visibility
        if (errorCode) {
            context.log(`Error code: ${errorCode}`);
            context.log(`Error message: ${errorMessage}`);
        }

        // Determine what happened and log appropriately
        switch (sessionStatus) {
            case 'EXITED':
                context.log(`Client exited Link without completing for client ${clientId}`);
                break;
            case 'REQUIRES_CREDENTIALS':
                context.log(`Client didn't provide credentials for client ${clientId}`);
                break;
            case 'REQUIRES_QUESTIONS':
                context.log(`Client didn't answer security questions for client ${clientId}`);
                break;
            case 'REQUIRES_SELECTIONS':
                context.log(`Client didn't select accounts for client ${clientId}`);
                break;
            case 'INSTITUTION_NOT_FOUND':
                context.log(`Institution not found for client ${clientId}`);
                break;
            case 'INSTITUTION_NOT_SUPPORTED':
                context.log(`Institution not supported for client ${clientId}`);
                break;
            default:
                context.log(`Unknown status: ${sessionStatus} for client ${clientId}`);
        }

        // Don't process further - no public_token to exchange
        return;
    }

    // SUCCESS flow continues below...
    context.log('Processing successful Link completion');
    
    // Get public_token - can be in public_token or public_tokens array
    const publicToken = webhook.public_token || webhook.public_tokens?.[0];
    
    if (!publicToken) {
        context.log.warn('SESSION_FINISHED SUCCESS but missing public_token');
        return;
    }

    // Check if already processed
    if (linkRecord.status === 'used') {
        context.log.warn(`Link token already used: ${webhook.link_token}`);
        return;
    }

    context.log(`Found client_id: ${clientId} for link_token`);

    // Step 2: Exchange public_token → access_token
    context.log('Exchanging public_token for access_token...');
    const exchangeResult = await exchangePublicToken(publicToken);
    const accessToken = exchangeResult.access_token;
    const plaidItemId = exchangeResult.item_id;
    context.log(`Got access_token and item_id: ${plaidItemId}`);

    // Step 3: Get item details (institution name, etc.)
    context.log('Fetching item details...');
    const itemDetails = await getItem(accessToken);
    const institutionId = itemDetails.item.institution_id || null;
    // Note: institution_name is on the item object but TypeScript types are incomplete
    const institutionName = (itemDetails.item as any).institution_name as string | null || null;
    context.log(`Institution: ${institutionName} (${institutionId})`);

    // Determine if this is an OAuth institution
    const isOAuth = isOAuthInstitution(institutionId);
    if (isOAuth) {
        context.log(`Institution ${institutionId} uses OAuth flow`);
    }

    // Step 4: Encrypt access_token
    context.log('Encrypting access_token...');
    const { encryptedBuffer, keyId } = await encrypt(accessToken);

    // Step 5: Check for existing item - DUPLICATE PREVENTION
    // 
    // Per Plaid docs (https://plaid.com/docs/link/duplicate-items/):
    // "A duplicate Item will be created if the end user logs into the same 
    // institution using the same credentials again using Plaid Link"
    //
    // Detection methods (in order of priority):
    // A. Same plaid_item_id = UPDATE MODE (user re-authenticated existing Item)
    // B. Same client + institution_id (active) = DUPLICATE (user linked same bank again)
    // C. Same client + institution_id (archived) = NEW ITEM (don't restore archived)
    // D. Neither = NEW ITEM
    //
    // Note: Plaid docs also suggest comparing account mask/name, but institution_id
    // is sufficient for our use case since we want to prevent ANY duplicate at same bank.
    // This is more conservative but prevents all billing duplicates.
    //
    // Special handling for Chase/PNC/NFCU/Schwab:
    // Per Plaid docs, at these institutions, creating a duplicate Item may invalidate
    // the old Item. We handle this by updating the existing item with the new credentials.
    
    const existingItemByPlaidId = await executeQuery<{ 
        item_id: number; 
        status: string; 
        institution_id: string | null;
    }>(
        `SELECT item_id, status, institution_id FROM items WHERE plaid_item_id = @plaidItemId`,
        { plaidItemId }
    );

    // Check for same client + institution (active items - duplicate prevention)
    const existingActiveItemByInstitution = await executeQuery<{ item_id: number; plaid_item_id: string }>(
        `SELECT item_id, plaid_item_id FROM items 
         WHERE client_id = @clientId 
           AND institution_id = @institutionId 
           AND status != 'archived'
           AND plaid_item_id != @plaidItemId`,
        { clientId, institutionId, plaidItemId }
    );

    let itemId: number;
    let isDuplicate = false;

    if (existingItemByPlaidId.recordset.length > 0) {
        // Case A: Same plaid_item_id - this is UPDATE MODE
        // User went through Link to re-authenticate or update accounts
        const existingItem = existingItemByPlaidId.recordset[0];
        
        // VALIDATION 1: Reject update mode on archived items
        // Archived means user revoked permissions or CPA intentionally removed
        // Should require fresh new link, not update mode
        if (existingItem.status === 'archived') {
            context.log.error(`REJECTED: Update mode attempted on archived item ${existingItem.item_id}`);
            context.log.error(`Archived items cannot be updated - CPA should create a new link instead`);
            throw new Error('Cannot update archived item. Please create a new link for this client.');
        }
        
        // VALIDATION 2: Reject if institution changed during update mode
        // This shouldn't happen but indicates something is wrong
        if (existingItem.institution_id && institutionId && existingItem.institution_id !== institutionId) {
            context.log.error(`REJECTED: Institution mismatch during update mode`);
            context.log.error(`Expected institution: ${existingItem.institution_id}, Got: ${institutionId}`);
            context.log.error(`This indicates a potential security issue or data corruption`);
            throw new Error(`Institution mismatch during update mode. Expected ${existingItem.institution_id}, got ${institutionId}. Please investigate.`);
        }
        
        itemId = existingItem.item_id;
        context.log(`Update mode: Updating existing item ${itemId}`);
        
        await executeQuery(
            `UPDATE items 
             SET access_token = @accessToken,
                 access_token_key_id = @keyId,
                 status = 'active',
                 is_oauth = @isOAuth,
                 last_error_code = NULL,
                 last_error_message = NULL,
                 last_error_timestamp = NULL,
                 updated_at = GETDATE()
             WHERE item_id = @itemId`,
            {
                accessToken: encryptedBuffer,
                keyId,
                isOAuth: isOAuth ? 1 : 0,
                itemId,
            }
        );
        context.log(`Updated item ${itemId} - cleared errors, set status to active`);
        
    } else if (existingActiveItemByInstitution.recordset.length > 0) {
        // Case B: DUPLICATE PREVENTION
        // Same client already has an active item at this institution
        // This can happen if user goes through Link again for the same bank
        // 
        // Per Plaid docs: We should NOT create a new item, but update the existing one
        // The old plaid_item_id may become invalid, so we update to the new one
        //
        // For Chase/PNC/NFCU/Schwab: The old Item is automatically invalidated
        // For other institutions: We should call /item/remove on the old Item
        
        const existingItem = existingActiveItemByInstitution.recordset[0];
        itemId = existingItem.item_id;
        isDuplicate = true;
        
        context.log(`DUPLICATE PREVENTION: Client ${clientId} already has item ${itemId} at ${institutionName}`);
        context.log(`Old plaid_item_id: ${existingItem.plaid_item_id}, New: ${plaidItemId}`);
        
        // Try to remove the OLD item from Plaid (best effort - may already be invalid)
        // This prevents "ghost" items on Plaid's side
        try {
            const oldItemResult = await executeQuery<{ access_token: Buffer; access_token_key_id: number }>(
                `SELECT access_token, access_token_key_id FROM items WHERE item_id = @itemId`,
                { itemId }
            );
            
            if (oldItemResult.recordset.length > 0) {
                const oldAccessToken = await decrypt(
                    oldItemResult.recordset[0].access_token,
                    oldItemResult.recordset[0].access_token_key_id
                );
                
                const plaidClient = getPlaidClient();
                await plaidClient.itemRemove({ access_token: oldAccessToken });
                context.log(`Removed old Plaid item: ${existingItem.plaid_item_id}`);
            }
        } catch (removeErr) {
            // Expected to fail if item already invalid (e.g., Chase/PNC auto-invalidation)
            context.log.warn(`Could not remove old Plaid item (may already be invalid): ${removeErr}`);
        }
        
        // Update the existing item with the new plaid_item_id and access_token
        // The old access_token is now invalid per Plaid docs for Chase/PNC/etc
        await executeQuery(
            `UPDATE items 
             SET plaid_item_id = @plaidItemId,
                 access_token = @accessToken,
                 access_token_key_id = @keyId,
                 status = 'active',
                 is_oauth = @isOAuth,
                 last_error_code = NULL,
                 last_error_message = NULL,
                 last_error_timestamp = NULL,
                 updated_at = GETDATE()
             WHERE item_id = @itemId`,
            {
                plaidItemId,
                accessToken: encryptedBuffer,
                keyId,
                isOAuth: isOAuth ? 1 : 0,
                itemId,
            }
        );
        context.log(`Updated existing item ${itemId} with new plaid_item_id (duplicate prevention)`);
        
    } else {
        // Case C & D: New item - INSERT
        // Note: We no longer restore archived items - they stay archived
        // This gives a clean separation between old and new connections
        context.log('Inserting new item...');
        const insertResult = await executeQuery<{ item_id: number }>(
            `INSERT INTO items (
                client_id, plaid_item_id, access_token, access_token_key_id,
                institution_id, institution_name, status, is_oauth
            )
            OUTPUT INSERTED.item_id
            VALUES (
                @clientId, @plaidItemId, @accessToken, @keyId,
                @institutionId, @institutionName, 'active', @isOAuth
            )`,
            {
                clientId,
                plaidItemId,
                accessToken: encryptedBuffer,
                keyId,
                institutionId,
                institutionName,
                isOAuth: isOAuth ? 1 : 0,
            }
        );
        itemId = insertResult.recordset[0].item_id;
        context.log(`Created new item: ${itemId}${isOAuth ? ' (OAuth)' : ''}`);
    }

    // Step 6: Fetch and save accounts
    // 
    // ACCOUNT HANDLING LOGIC:
    // - If plaid_account_id exists → update that account (same Plaid session/update mode)
    // - Otherwise → create NEW account
    // - Mark any accounts for this item NOT in Plaid response as inactive
    // 
    // This means:
    // - Deselected accounts stay inactive with their history preserved
    // - Re-selected accounts become NEW records (fresh start)
    // - Old inactive accounts are never overwritten
    
    context.log('Fetching accounts from Plaid...');
    const accountsResult = await getAccounts(accessToken);
    
    // Track which plaid_account_ids we've processed (for Step 7)
    const processedPlaidAccountIds: string[] = [];
    
    for (const account of accountsResult.accounts) {
        const mask = account.mask || null;
        
        // Check if this exact plaid_account_id already exists
        const existingAccount = await executeQuery<{ account_id: number }>(
            `SELECT account_id FROM accounts WHERE plaid_account_id = @plaidAccountId`,
            { plaidAccountId: account.account_id }
        );

        if (existingAccount.recordset.length > 0) {
            // Exact plaid_account_id match - update existing account
            const accountId = existingAccount.recordset[0].account_id;
            
            await executeQuery(
                `UPDATE accounts 
                 SET account_name = @accountName,
                     official_name = @officialName,
                     current_balance = @currentBalance,
                     available_balance = @availableBalance,
                     credit_limit = @creditLimit,
                     mask = @mask,
                     is_active = 1,
                     last_updated_datetime = GETDATE(),
                     updated_at = GETDATE()
                 WHERE account_id = @accountId`,
                {
                    accountName: account.name,
                    officialName: account.official_name,
                    currentBalance: account.balances.current,
                    availableBalance: account.balances.available,
                    creditLimit: account.balances.limit,
                    mask,
                    accountId,
                }
            );
            context.log(`Updated existing account: ${account.name} (${account.account_id})`);
            
        } else {
            // No match - create new account
            // This happens for:
            // - Brand new accounts
            // - Re-selected accounts that were previously deselected (new plaid_account_id)
            await executeQuery(
                `INSERT INTO accounts (
                    item_id, plaid_account_id, account_name, official_name,
                    account_type, account_subtype, mask,
                    current_balance, available_balance, credit_limit,
                    is_active, last_updated_datetime
                )
                VALUES (
                    @itemId, @plaidAccountId, @accountName, @officialName,
                    @accountType, @accountSubtype, @mask,
                    @currentBalance, @availableBalance, @creditLimit,
                    1, GETDATE()
                )`,
                {
                    itemId,
                    plaidAccountId: account.account_id,
                    accountName: account.name,
                    officialName: account.official_name,
                    accountType: account.type,
                    accountSubtype: account.subtype,
                    mask,
                    currentBalance: account.balances.current,
                    availableBalance: account.balances.available,
                    creditLimit: account.balances.limit,
                }
            );
            context.log(`Created new account: ${account.name} (mask: ${mask})`);
        }
        
        processedPlaidAccountIds.push(account.account_id);
    }

    // Step 7: Mark accounts NOT in Plaid response as inactive
    // These are accounts the user deselected or that no longer exist at the bank
    if (processedPlaidAccountIds.length > 0) {
        // Build parameterized list for IN clause
        const placeholders = processedPlaidAccountIds.map((_, i) => `@id${i}`).join(',');
        const params: Record<string, any> = { itemId };
        processedPlaidAccountIds.forEach((id, i) => {
            params[`id${i}`] = id;
        });
        
        await executeQuery(
            `UPDATE accounts 
             SET is_active = 0, updated_at = GETDATE()
             WHERE item_id = @itemId 
               AND plaid_account_id NOT IN (${placeholders})
               AND is_active = 1`,
            params
        );
        context.log(`Marked deselected accounts as inactive for item ${itemId}`);
    }

    // Step 8: Mark link_token as used
    await executeQuery(
        `UPDATE link_tokens 
         SET status = 'used', used_at = GETDATE()
         WHERE link_token = @linkToken`,
        { linkToken: webhook.link_token }
    );

    context.log(`SESSION_FINISHED processing complete for client ${clientId}, item ${itemId}${isDuplicate ? ' (duplicate prevented)' : ''}${isOAuth ? ' (OAuth)' : ''}`);
}

/**
 * Mark webhook as processed
 */
async function markWebhookProcessed(
    logId: number,
    errorMessage?: string
): Promise<void> {
    await executeQuery(
        `UPDATE webhook_log 
         SET processed = 1, 
             processed_at = GETDATE(),
             error_message = @errorMessage
         WHERE log_id = @logId`,
        { logId, errorMessage: errorMessage || null }
    );
}

/**
 * Main webhook handler function
 */
const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
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
        const webhook = req.body as PlaidWebhook;

        if (!webhook.webhook_type || !webhook.webhook_code) {
            context.res = {
                status: 400,
                body: { error: 'Missing webhook_type or webhook_code' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        context.log(`Webhook: ${webhook.webhook_type} / ${webhook.webhook_code}`);
        
        // Log additional details for debugging
        if (webhook.error) {
            context.log(`Error details: ${webhook.error.error_code} - ${webhook.error.error_message}`);
        }

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

        let processingError: string | undefined;

        try {
            // ============================================================
            // Route webhooks to appropriate handlers
            // ============================================================

            if (webhook.webhook_type === 'ITEM') {
                if (webhook.webhook_code === 'USER_ACCOUNT_REVOKED') {
                    // Special handler for single account revocation
                    await handleAccountRevoked(context, webhook);
                } else {
                    // All other ITEM webhooks (ERROR, LOGIN_REPAIRED, etc.)
                    await updateItemStatus(context, webhook);
                }
            }

            if (webhook.webhook_type === 'TRANSACTIONS') {
                if (webhook.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
                    // Reuse the updateItemStatus handler for this
                    await updateItemStatus(context, webhook);
                }
                // Note: Other TRANSACTIONS webhooks (INITIAL_UPDATE, HISTORICAL_UPDATE, etc.)
                // are deprecated in favor of SYNC_UPDATES_AVAILABLE
            }

            if (webhook.webhook_type === 'LINK') {
                if (webhook.webhook_code === 'SESSION_FINISHED') {
                    await handleSessionFinished(context, webhook);
                }
                // Note: Other LINK webhooks exist but SESSION_FINISHED is the main one
            }

        } catch (err) {
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

    } catch (err) {
        context.log.error('Webhook handler error (early failure):', err);
        
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

export default httpTrigger;