"use strict";
/**
 * Transaction Sync Service
 *
 * Handles synchronization of transactions from Plaid using the /transactions/sync endpoint.
 * Implements cursor-based pagination with proper error handling for:
 * - TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION error
 * - Added, modified, and removed transactions
 * - Pending and posted transaction states
 * - Transfer detection
 *
 * Per Plaid docs:
 * - When has_more is true, continue calling with next_cursor
 * - If TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION occurs, restart from the original cursor
 * - Save cursor only after all pages are successfully fetched (has_more = false)
 *
 * @module shared/transaction-sync-service
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncTransactionsForItem = syncTransactionsForItem;
exports.getItemsWithPendingSyncUpdates = getItemsWithPendingSyncUpdates;
exports.refreshTransactions = refreshTransactions;
const database_1 = require("./database");
const encryption_1 = require("./encryption");
const plaid_client_1 = require("./plaid-client");
// ============================================================================
// Constants
// ============================================================================
/**
 * Maximum number of retry attempts for pagination errors
 */
const MAX_PAGINATION_RETRIES = 3;
/**
 * Transfer-related personal finance category primaries
 * Used to detect transfers from category data
 */
const TRANSFER_CATEGORIES = new Set([
    'TRANSFER_IN',
    'TRANSFER_OUT',
]);
/**
 * Transaction codes that indicate a transfer
 * These come from Plaid's transaction_code field
 */
const TRANSFER_TRANSACTION_CODES = new Set([
    'transfer',
    'ach',
    'wire',
]);
// ============================================================================
// Main Sync Function
// ============================================================================
/**
 * Sync transactions for a specific item
 *
 * This is the main entry point for transaction synchronization.
 * CPAs manually trigger this via the frontend button.
 *
 * @param context - Azure Function context for logging
 * @param itemId - Internal item_id from our database
 * @returns Promise<TransactionSyncResult> - Sync results
 *
 * @example
 * const result = await syncTransactionsForItem(context, 123);
 * if (result.success) {
 *   console.log(`Synced ${result.added} new, ${result.modified} modified, ${result.removed} removed`);
 * }
 */
async function syncTransactionsForItem(context, itemId) {
    context.log(`Starting transaction sync for item ${itemId}`);
    try {
        // 1. Get item details with encrypted access token
        const item = await getItemWithAccessToken(itemId);
        if (!item) {
            return {
                success: false,
                itemId,
                plaidItemId: '',
                added: 0,
                modified: 0,
                removed: 0,
                cursor: null,
                error: 'Item not found',
                isInitialSync: false,
            };
        }
        // Check if item is in error state
        if (item.status === 'error' || item.status === 'login_required') {
            return {
                success: false,
                itemId,
                plaidItemId: item.plaid_item_id,
                added: 0,
                modified: 0,
                removed: 0,
                cursor: item.transactions_cursor,
                error: `Item is in ${item.status} state. Re-authentication required.`,
                isInitialSync: false,
            };
        }
        // 2. Decrypt access token
        const accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
        // 3. Get account ID mapping for this item
        const accountMap = await getAccountIdMap(itemId);
        if (accountMap.size === 0) {
            return {
                success: false,
                itemId,
                plaidItemId: item.plaid_item_id,
                added: 0,
                modified: 0,
                removed: 0,
                cursor: item.transactions_cursor,
                error: 'No accounts found for this item',
                isInitialSync: false,
            };
        }
        // 4. Fetch all transaction updates with pagination
        const isInitialSync = !item.transactions_cursor;
        const syncData = await fetchAllTransactionUpdates(context, accessToken, item.transactions_cursor);
        // 5. Process the transactions
        const counts = await processTransactionUpdates(context, syncData.added, syncData.modified, syncData.removed, accountMap);
        // 6. Update item with new cursor and clear sync flag
        await updateItemAfterSync(itemId, syncData.cursor);
        context.log(`Transaction sync complete for item ${itemId}: ` +
            `${counts.added} added, ${counts.modified} modified, ${counts.removed} removed`);
        return {
            success: true,
            itemId,
            plaidItemId: item.plaid_item_id,
            added: counts.added,
            modified: counts.modified,
            removed: counts.removed,
            cursor: syncData.cursor,
            isInitialSync,
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        context.log.error(`Transaction sync failed for item ${itemId}: ${errorMessage}`);
        return {
            success: false,
            itemId,
            plaidItemId: '',
            added: 0,
            modified: 0,
            removed: 0,
            cursor: null,
            error: errorMessage,
            isInitialSync: false,
        };
    }
}
// ============================================================================
// Database Helpers
// ============================================================================
/**
 * Get item record with encrypted access token
 */
async function getItemWithAccessToken(itemId) {
    const result = await (0, database_1.executeQuery)(`SELECT 
            item_id,
            client_id,
            plaid_item_id,
            access_token,
            access_token_key_id,
            transactions_cursor,
            has_sync_updates,
            status
        FROM items
        WHERE item_id = @itemId AND is_archived = 0`, { itemId });
    return result.recordset.length > 0 ? result.recordset[0] : null;
}
/**
 * Get mapping of Plaid account IDs to internal account IDs
 */
async function getAccountIdMap(itemId) {
    const result = await (0, database_1.executeQuery)(`SELECT account_id, plaid_account_id
         FROM accounts
         WHERE item_id = @itemId AND is_active = 1`, { itemId });
    const map = new Map();
    for (const row of result.recordset) {
        map.set(row.plaid_account_id, row.account_id);
    }
    return map;
}
/**
 * Update item after successful sync
 */
async function updateItemAfterSync(itemId, cursor) {
    await (0, database_1.executeQuery)(`UPDATE items 
         SET transactions_cursor = @cursor,
             transactions_cursor_last_updated = GETDATE(),
             transactions_last_successful_update = GETDATE(),
             has_sync_updates = 0,
             updated_at = GETDATE()
         WHERE item_id = @itemId`, { itemId, cursor });
}
// ============================================================================
// Plaid API Helpers
// ============================================================================
/**
 * Fetch all transaction updates with full pagination handling
 *
 * Per Plaid docs:
 * - Continue calling while has_more is true
 * - If TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION occurs, restart from original cursor
 * - Only save cursor after all pages are fetched
 */
async function fetchAllTransactionUpdates(context, accessToken, existingCursor) {
    let added = [];
    let modified = [];
    let removed = [];
    let retryCount = 0;
    let originalCursor = existingCursor;
    while (retryCount < MAX_PAGINATION_RETRIES) {
        try {
            // Reset collections for each attempt
            added = [];
            modified = [];
            removed = [];
            let cursor = originalCursor;
            let hasMore = true;
            let pageCount = 0;
            // Paginate through all updates
            while (hasMore) {
                pageCount++;
                context.log(`Fetching transaction page ${pageCount}, cursor: ${cursor ? 'set' : 'null'}`);
                const response = await (0, plaid_client_1.syncTransactions)(accessToken, cursor);
                // Accumulate results from this page
                added = added.concat(response.added);
                modified = modified.concat(response.modified);
                removed = removed.concat(response.removed);
                // Update pagination state
                hasMore = response.has_more;
                cursor = response.next_cursor;
                context.log(`Page ${pageCount}: +${response.added.length} added, ` +
                    `${response.modified.length} modified, ${response.removed.length} removed, ` +
                    `has_more: ${hasMore}`);
            }
            // Success! Return all accumulated data
            return { added, modified, removed, cursor: cursor || '' };
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            // Check for pagination mutation error
            if (errorMessage.includes('TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION')) {
                retryCount++;
                context.log.warn(`TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION error, ` +
                    `restarting from original cursor (attempt ${retryCount}/${MAX_PAGINATION_RETRIES})`);
                if (retryCount >= MAX_PAGINATION_RETRIES) {
                    throw new Error(`Failed after ${MAX_PAGINATION_RETRIES} attempts due to ` +
                        `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`);
                }
                // Continue to retry from the original cursor
                continue;
            }
            // Other errors - throw immediately
            throw err;
        }
    }
    // Should never reach here, but TypeScript needs this
    throw new Error('Unexpected state in fetchAllTransactionUpdates');
}
// ============================================================================
// Transaction Processing
// ============================================================================
/**
 * Process all transaction updates (added, modified, removed)
 *
 * IMPORTANT: When a pending transaction posts, Plaid sends:
 * - The old pending transaction_id in the 'removed' array
 * - A new posted transaction with pending_transaction_id pointing to the old one
 *
 * Our strategy: REPLACE the pending transaction with the posted data
 * (update the existing record rather than delete + insert)
 */
async function processTransactionUpdates(context, added, modified, removed, accountMap) {
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;
    // Build a map of pending_transaction_id -> posted transaction
    // This lets us identify which "added" transactions are actually posting of pending ones
    const pendingToPostedMap = new Map();
    for (const tx of added) {
        if (tx.pending_transaction_id) {
            pendingToPostedMap.set(tx.pending_transaction_id, tx);
        }
    }
    // Build set of removed transaction IDs for quick lookup
    const removedIds = new Set(removed.map(r => r.transaction_id));
    // Process added transactions
    for (const tx of added) {
        const accountId = accountMap.get(tx.account_id);
        if (!accountId) {
            context.log.warn(`Unknown account ${tx.account_id} for transaction ${tx.transaction_id}`);
            continue;
        }
        // Check if this posted transaction replaces a pending one
        if (tx.pending_transaction_id && removedIds.has(tx.pending_transaction_id)) {
            // This is a pending->posted transition
            // Replace the old pending transaction with new posted data
            context.log(`Replacing pending transaction ${tx.pending_transaction_id} with posted ${tx.transaction_id}`);
            await replacePendingWithPosted(context, tx.pending_transaction_id, tx);
            modifiedCount++; // Count as modified since we're updating existing record
        }
        else {
            // Truly new transaction
            const record = mapPlaidTransactionToRecord(tx, accountId, 'added');
            await upsertTransaction(context, record);
            addedCount++;
        }
    }
    // Process modified transactions
    for (const tx of modified) {
        const accountId = accountMap.get(tx.account_id);
        if (!accountId) {
            context.log.warn(`Unknown account ${tx.account_id} for transaction ${tx.transaction_id}`);
            continue;
        }
        const record = mapPlaidTransactionToRecord(tx, accountId, 'modified');
        await upsertTransaction(context, record);
        modifiedCount++;
    }
    // Process removed transactions
    // Skip any that were replaced by posted transactions (handled above)
    for (const removedTx of removed) {
        // Check if this removed pending was replaced by a posted transaction
        if (pendingToPostedMap.has(removedTx.transaction_id)) {
            // Already handled in the added loop - skip
            context.log(`Skipping removal of ${removedTx.transaction_id} - replaced by posted transaction`);
            continue;
        }
        // Truly removed transaction (e.g., canceled authorization)
        await markTransactionRemoved(context, removedTx.transaction_id);
        removedCount++;
    }
    return { added: addedCount, modified: modifiedCount, removed: removedCount };
}
/**
 * Map Plaid Transaction to our database record structure
 */
function mapPlaidTransactionToRecord(tx, accountId, status) {
    // Detect transfers from category or transaction code
    const isTransfer = detectIsTransfer(tx);
    // Extract personal finance category data
    const pfc = tx.personal_finance_category;
    // Map confidence level string to numeric score
    const confidenceScore = mapConfidenceLevel(pfc?.confidence_level);
    return {
        account_id: accountId,
        plaid_transaction_id: tx.transaction_id,
        transaction_date: new Date(tx.date),
        transaction_datetime: tx.datetime ? new Date(tx.datetime) : null,
        posted_date: tx.date && !tx.pending ? new Date(tx.date) : null,
        authorized_date: tx.authorized_date ? new Date(tx.authorized_date) : null,
        merchant_name: tx.merchant_name || null,
        original_description: tx.name || tx.original_description || '',
        merchant_logo_url: tx.logo_url || null,
        merchant_website: tx.website || null,
        amount: tx.amount,
        iso_currency_code: tx.iso_currency_code || null,
        payment_channel: tx.payment_channel || null,
        transaction_code: tx.transaction_code || null,
        pending: tx.pending,
        is_transfer: isTransfer,
        transaction_status: status,
        is_removed: false,
        plaid_primary_category: pfc?.primary || null,
        plaid_detailed_category: pfc?.detailed || null,
        plaid_confidence_score: confidenceScore,
    };
}
/**
 * Detect if a transaction is a transfer
 * Uses category data and transaction codes
 */
function detectIsTransfer(tx) {
    // Check personal finance category
    const pfc = tx.personal_finance_category;
    if (pfc && TRANSFER_CATEGORIES.has(pfc.primary)) {
        return true;
    }
    // Check transaction code
    if (tx.transaction_code && TRANSFER_TRANSACTION_CODES.has(tx.transaction_code.toLowerCase())) {
        return true;
    }
    // Check for detailed category containing 'transfer'
    if (pfc?.detailed && pfc.detailed.toLowerCase().includes('transfer')) {
        return true;
    }
    return false;
}
/**
 * Map Plaid confidence level string to numeric score
 *
 * VERY_HIGH: >98% -> 0.99
 * HIGH: >90% -> 0.92
 * MEDIUM: moderate -> 0.70
 * LOW: may reflect -> 0.40
 * UNKNOWN: don't know -> null
 */
function mapConfidenceLevel(level) {
    switch (level) {
        case 'VERY_HIGH':
            return 0.99;
        case 'HIGH':
            return 0.92;
        case 'MEDIUM':
            return 0.70;
        case 'LOW':
            return 0.40;
        case 'UNKNOWN':
        default:
            return null;
    }
}
/**
 * Upsert a transaction (insert or update)
 *
 * Uses MERGE for atomic upsert based on plaid_transaction_id
 */
async function upsertTransaction(context, record) {
    try {
        await (0, database_1.executeQuery)(`MERGE INTO transactions AS target
             USING (SELECT @plaid_transaction_id AS plaid_transaction_id) AS source
             ON target.plaid_transaction_id = source.plaid_transaction_id
             WHEN MATCHED THEN
                 UPDATE SET
                     account_id = @account_id,
                     transaction_date = @transaction_date,
                     transaction_datetime = @transaction_datetime,
                     posted_date = @posted_date,
                     authorized_date = @authorized_date,
                     merchant_name = @merchant_name,
                     original_description = @original_description,
                     merchant_logo_url = @merchant_logo_url,
                     merchant_website = @merchant_website,
                     amount = @amount,
                     iso_currency_code = @iso_currency_code,
                     payment_channel = @payment_channel,
                     transaction_code = @transaction_code,
                     pending = @pending,
                     is_transfer = @is_transfer,
                     transaction_status = @transaction_status,
                     is_removed = 0,
                     plaid_primary_category = @plaid_primary_category,
                     plaid_detailed_category = @plaid_detailed_category,
                     plaid_confidence_score = @plaid_confidence_score,
                     updated_since_process = CASE WHEN target.processed_into_ledger = 1 THEN 1 ELSE 0 END,
                     updated_at = GETDATE()
             WHEN NOT MATCHED THEN
                 INSERT (
                     account_id,
                     plaid_transaction_id,
                     transaction_date,
                     transaction_datetime,
                     posted_date,
                     authorized_date,
                     merchant_name,
                     original_description,
                     merchant_logo_url,
                     merchant_website,
                     amount,
                     iso_currency_code,
                     payment_channel,
                     transaction_code,
                     pending,
                     is_transfer,
                     transaction_status,
                     is_removed,
                     plaid_primary_category,
                     plaid_detailed_category,
                     plaid_confidence_score
                 )
                 VALUES (
                     @account_id,
                     @plaid_transaction_id,
                     @transaction_date,
                     @transaction_datetime,
                     @posted_date,
                     @authorized_date,
                     @merchant_name,
                     @original_description,
                     @merchant_logo_url,
                     @merchant_website,
                     @amount,
                     @iso_currency_code,
                     @payment_channel,
                     @transaction_code,
                     @pending,
                     @is_transfer,
                     @transaction_status,
                     0,
                     @plaid_primary_category,
                     @plaid_detailed_category,
                     @plaid_confidence_score
                 );`, {
            account_id: record.account_id,
            plaid_transaction_id: record.plaid_transaction_id,
            transaction_date: record.transaction_date,
            transaction_datetime: record.transaction_datetime,
            posted_date: record.posted_date,
            authorized_date: record.authorized_date,
            merchant_name: record.merchant_name,
            original_description: record.original_description,
            merchant_logo_url: record.merchant_logo_url,
            merchant_website: record.merchant_website,
            amount: record.amount,
            iso_currency_code: record.iso_currency_code,
            payment_channel: record.payment_channel,
            transaction_code: record.transaction_code,
            pending: record.pending,
            is_transfer: record.is_transfer,
            transaction_status: record.transaction_status,
            plaid_primary_category: record.plaid_primary_category,
            plaid_detailed_category: record.plaid_detailed_category,
            plaid_confidence_score: record.plaid_confidence_score,
        });
    }
    catch (err) {
        context.log.error(`Failed to upsert transaction ${record.plaid_transaction_id}: ` +
            (err instanceof Error ? err.message : String(err)));
        throw err;
    }
}
/**
 * Mark a transaction as removed
 *
 * Plaid removes pending transactions when they post as new transactions.
 * We mark them as removed but keep the record for audit purposes.
 */
async function markTransactionRemoved(context, plaidTransactionId) {
    try {
        const result = await (0, database_1.executeQuery)(`UPDATE transactions
             SET is_removed = 1,
                 transaction_status = 'removed',
                 updated_at = GETDATE()
             WHERE plaid_transaction_id = @plaidTransactionId`, { plaidTransactionId });
        if (result.rowsAffected[0] === 0) {
            // Transaction might not exist (e.g., removed before we synced it)
            context.log.warn(`Transaction ${plaidTransactionId} not found for removal`);
        }
    }
    catch (err) {
        context.log.error(`Failed to mark transaction ${plaidTransactionId} as removed: ` +
            (err instanceof Error ? err.message : String(err)));
        // Don't throw - removed transactions are not critical
    }
}
/**
 * Replace a pending transaction with its posted version
 *
 * When a pending transaction posts, we update the existing record with:
 * - New plaid_transaction_id (the posted transaction's ID)
 * - All new transaction data from the posted version
 * - pending = false
 * - posted_date set
 *
 * This preserves the original transaction_id (our internal ID) and any
 * manual categorization that was done on the pending transaction.
 */
async function replacePendingWithPosted(context, pendingPlaidId, postedTx) {
    try {
        // Detect if it's a transfer
        const isTransfer = detectIsTransfer(postedTx);
        // Extract personal finance category data
        const pfc = postedTx.personal_finance_category;
        const confidenceScore = mapConfidenceLevel(pfc?.confidence_level);
        await (0, database_1.executeQuery)(`UPDATE transactions
             SET 
                 -- Update to new posted transaction ID
                 plaid_transaction_id = @newPlaidTransactionId,
                 
                 -- Update dates
                 transaction_date = @transactionDate,
                 transaction_datetime = @transactionDatetime,
                 posted_date = @postedDate,
                 authorized_date = @authorizedDate,
                 
                 -- Update merchant info (may change from pending to posted)
                 merchant_name = @merchantName,
                 original_description = @originalDescription,
                 merchant_logo_url = @merchantLogoUrl,
                 merchant_website = @merchantWebsite,
                 
                 -- Update amount (tip may be added, etc.)
                 amount = @amount,
                 iso_currency_code = @isoCurrencyCode,
                 
                 -- Update status
                 payment_channel = @paymentChannel,
                 transaction_code = @transactionCode,
                 pending = 0,
                 is_transfer = @isTransfer,
                 transaction_status = 'modified',
                 
                 -- Update categories (posted version may have better data)
                 plaid_primary_category = @plaidPrimaryCategory,
                 plaid_detailed_category = @plaidDetailedCategory,
                 plaid_confidence_score = @plaidConfidenceScore,
                 
                 -- Mark as updated if already processed
                 updated_since_process = CASE WHEN processed_into_ledger = 1 THEN 1 ELSE updated_since_process END,
                 
                 updated_at = GETDATE()
             WHERE plaid_transaction_id = @pendingPlaidId`, {
            pendingPlaidId,
            newPlaidTransactionId: postedTx.transaction_id,
            transactionDate: new Date(postedTx.date),
            transactionDatetime: postedTx.datetime ? new Date(postedTx.datetime) : null,
            postedDate: new Date(postedTx.date), // Posted date is the transaction date for posted txns
            authorizedDate: postedTx.authorized_date ? new Date(postedTx.authorized_date) : null,
            merchantName: postedTx.merchant_name || null,
            originalDescription: postedTx.name || postedTx.original_description || '',
            merchantLogoUrl: postedTx.logo_url || null,
            merchantWebsite: postedTx.website || null,
            amount: postedTx.amount,
            isoCurrencyCode: postedTx.iso_currency_code || null,
            paymentChannel: postedTx.payment_channel || null,
            transactionCode: postedTx.transaction_code || null,
            isTransfer,
            plaidPrimaryCategory: pfc?.primary || null,
            plaidDetailedCategory: pfc?.detailed || null,
            plaidConfidenceScore: confidenceScore,
        });
        context.log(`Successfully replaced pending ${pendingPlaidId} with posted ${postedTx.transaction_id}`);
    }
    catch (err) {
        context.log.error(`Failed to replace pending transaction ${pendingPlaidId}: ` +
            (err instanceof Error ? err.message : String(err)));
        throw err;
    }
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Get items that have pending sync updates
 * Used by background jobs or admin dashboard
 */
async function getItemsWithPendingSyncUpdates() {
    const result = await (0, database_1.executeQuery)(`SELECT item_id, client_id, plaid_item_id, institution_name
         FROM items
         WHERE has_sync_updates = 1 
           AND status = 'active'
           AND is_archived = 0
         ORDER BY updated_at ASC`);
    return result.recordset;
}
/**
 * Force refresh transactions for an item
 * Calls Plaid's /transactions/refresh endpoint to trigger a refresh
 *
 * Note: This is a Plaid add-on feature. The actual refresh happens async
 * and we'll receive a SYNC_UPDATES_AVAILABLE webhook when data is ready.
 */
async function refreshTransactions(context, itemId) {
    try {
        const item = await getItemWithAccessToken(itemId);
        if (!item) {
            return { success: false, error: 'Item not found' };
        }
        const accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
        // Import the Plaid client and call refresh
        const { getPlaidClient } = await Promise.resolve().then(() => __importStar(require('./plaid-client')));
        const client = getPlaidClient();
        await client.transactionsRefresh({
            access_token: accessToken,
        });
        context.log(`Transactions refresh requested for item ${itemId}`);
        return { success: true };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        context.log.error(`Failed to refresh transactions for item ${itemId}: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
//# sourceMappingURL=transaction-sync-service.js.map