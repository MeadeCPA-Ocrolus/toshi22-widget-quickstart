/**
 * Transactions API Service
 * 
 * Frontend service functions for interacting with the transactions endpoints.
 * Imports the shared fetchApi helper from api.ts for consistency.
 * 
 * @module services/transactions-api
 */

import {
    TransactionWithDetails,
    TransactionListParams,
    TransactionListResponse,
    TransactionSyncResult,
    BulkSyncResponse,
    RefreshResponse,
} from '../types/transactions';

// Import shared API helper from main api service
// NOTE: You need to export fetchApi from api.ts for this to work
// Add this line to the bottom of api.ts:
//   export { fetchApi };
import { fetchApi } from './api';

// ============================================================================
// Transaction Read Operations
// ============================================================================

/**
 * Get a list of transactions with optional filtering
 * 
 * @param params - Query parameters for filtering
 * @returns Promise with transactions and pagination info
 * 
 * @example
 * // Get all transactions for a client
 * const result = await getTransactions({ clientId: 1, limit: 50 });
 * 
 * // Get uncategorized transactions only
 * const uncategorized = await getTransactions({ clientId: 1, uncategorized: true });
 * 
 * // Get transactions in date range
 * const ranged = await getTransactions({
 *   clientId: 1,
 *   startDate: '2025-01-01',
 *   endDate: '2025-01-31',
 * });
 */
export async function getTransactions(
    params?: TransactionListParams
): Promise<TransactionListResponse> {
    const queryParts: string[] = [];
    
    if (params?.accountId) queryParts.push(`accountId=${params.accountId}`);
    if (params?.itemId) queryParts.push(`itemId=${params.itemId}`);
    if (params?.clientId) queryParts.push(`clientId=${params.clientId}`);
    if (params?.startDate) queryParts.push(`startDate=${params.startDate}`);
    if (params?.endDate) queryParts.push(`endDate=${params.endDate}`);
    if (params?.pending !== undefined) queryParts.push(`pending=${params.pending}`);
    if (params?.isTransfer !== undefined) queryParts.push(`isTransfer=${params.isTransfer}`);
    if (params?.uncategorized) queryParts.push('uncategorized=true');
    if (params?.limit) queryParts.push(`limit=${params.limit}`);
    if (params?.offset) queryParts.push(`offset=${params.offset}`);
    
    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    
    return fetchApi<TransactionListResponse>(`/transactions${queryString}`);
}

/**
 * Get a single transaction by ID
 * 
 * @param transactionId - Internal transaction_id
 * @returns Promise with transaction details
 */
export async function getTransaction(
    transactionId: number
): Promise<TransactionWithDetails> {
    return fetchApi<TransactionWithDetails>(`/transactions/${transactionId}`);
}

/**
 * Get transactions for a specific item (bank connection)
 * Convenience wrapper around getTransactions
 */
export async function getTransactionsForItem(
    itemId: number,
    params?: Omit<TransactionListParams, 'itemId'>
): Promise<TransactionListResponse> {
    return getTransactions({ ...params, itemId });
}

/**
 * Get transactions for a specific account
 * Convenience wrapper around getTransactions
 */
export async function getTransactionsForAccount(
    accountId: number,
    params?: Omit<TransactionListParams, 'accountId'>
): Promise<TransactionListResponse> {
    return getTransactions({ ...params, accountId });
}

/**
 * Get transactions needing categorization
 * Returns only uncategorized transactions with low confidence scores
 */
export async function getUncategorizedTransactions(
    clientId?: number,
    limit = 50
): Promise<TransactionListResponse> {
    return getTransactions({
        clientId,
        uncategorized: true,
        limit,
    });
}

// ============================================================================
// Transaction Sync Operations
// ============================================================================

/**
 * Sync transactions for a specific item
 * 
 * This triggers the sync manually. CPAs use this to pull latest transactions.
 * 
 * @param itemId - Internal item_id to sync
 * @returns Promise with sync results
 * 
 * @example
 * const result = await syncTransactionsForItem(123);
 * if (result.success) {
 *   console.log(`Added ${result.transactions.added} transactions`);
 * } else {
 *   console.error(`Sync failed: ${result.error}`);
 * }
 */
export async function syncTransactionsForItem(
    itemId: number
): Promise<TransactionSyncResult> {
    return fetchApi<TransactionSyncResult>(`/transactions/sync/${itemId}`, {
        method: 'POST',
    });
}

/**
 * Sync all items with pending updates
 * 
 * @param limit - Max number of items to sync (default 10)
 * @param clientId - Only sync items for this client
 * @returns Promise with bulk sync results
 */
export async function syncAllPendingTransactions(
    limit = 10,
    clientId?: number
): Promise<BulkSyncResponse> {
    const queryParts: string[] = [`limit=${limit}`];
    if (clientId) queryParts.push(`clientId=${clientId}`);
    const queryString = `?${queryParts.join('&')}`;
    
    return fetchApi<BulkSyncResponse>(`/transactions/sync${queryString}`, {
        method: 'POST',
    });
}

/**
 * Force refresh transactions from Plaid
 * 
 * This calls Plaid's /transactions/refresh endpoint to request fresh data.
 * The actual sync happens later when the SYNC_UPDATES_AVAILABLE webhook fires.
 * 
 * @param itemId - Internal item_id to refresh
 * @returns Promise with refresh result
 */
export async function refreshTransactionsForItem(
    itemId: number
): Promise<RefreshResponse> {
    return fetchApi<RefreshResponse>(`/transactions/refresh/${itemId}`, {
        method: 'POST',
    });
}

// ============================================================================
// Transaction Statistics
// ============================================================================

/**
 * Summary statistics for transactions
 */
export interface TransactionStats {
    totalCount: number;
    pendingCount: number;
    uncategorizedCount: number;
    transferCount: number;
    dateRange: {
        earliest: string;
        latest: string;
    };
    totalIncome: number;
    totalExpenses: number;
}

/**
 * Calculate statistics from a list of transactions
 * Client-side helper for dashboard display
 */
export function calculateTransactionStats(
    transactions: TransactionWithDetails[]
): TransactionStats {
    let pendingCount = 0;
    let uncategorizedCount = 0;
    let transferCount = 0;
    let totalIncome = 0;
    let totalExpenses = 0;
    let earliest = '';
    let latest = '';
    
    for (const tx of transactions) {
        // Count pending
        if (tx.pending) pendingCount++;
        
        // Count uncategorized
        if (!tx.category_verified && 
            (tx.plaid_confidence_score === null || tx.plaid_confidence_score < 0.7)) {
            uncategorizedCount++;
        }
        
        // Count transfers
        if (tx.is_transfer) transferCount++;
        
        // Sum amounts (Plaid convention: positive = expense, negative = income)
        if (tx.amount > 0) {
            totalExpenses += tx.amount;
        } else {
            totalIncome += Math.abs(tx.amount);
        }
        
        // Track date range
        if (!earliest || tx.transaction_date < earliest) {
            earliest = tx.transaction_date;
        }
        if (!latest || tx.transaction_date > latest) {
            latest = tx.transaction_date;
        }
    }
    
    return {
        totalCount: transactions.length,
        pendingCount,
        uncategorizedCount,
        transferCount,
        dateRange: { earliest, latest },
        totalIncome,
        totalExpenses,
    };
}