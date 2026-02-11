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
import { Context } from '@azure/functions';
/**
 * Result of a sync operation
 */
export interface TransactionSyncResult {
    success: boolean;
    itemId: number;
    plaidItemId: string;
    added: number;
    modified: number;
    removed: number;
    cursor: string | null;
    error?: string;
    /** True if this was the first sync (no previous cursor) */
    isInitialSync: boolean;
}
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
export declare function syncTransactionsForItem(context: Context, itemId: number): Promise<TransactionSyncResult>;
/**
 * Get items that have pending sync updates
 * Used by background jobs or admin dashboard
 */
export declare function getItemsWithPendingSyncUpdates(): Promise<Array<{
    item_id: number;
    client_id: number;
    plaid_item_id: string;
    institution_name: string;
}>>;
/**
 * Force refresh transactions for an item
 * Calls Plaid's /transactions/refresh endpoint to trigger a refresh
 *
 * Note: This is a Plaid add-on feature. The actual refresh happens async
 * and we'll receive a SYNC_UPDATES_AVAILABLE webhook when data is ready.
 */
export declare function refreshTransactions(context: Context, itemId: number): Promise<{
    success: boolean;
    error?: string;
}>;
//# sourceMappingURL=transaction-sync-service.d.ts.map