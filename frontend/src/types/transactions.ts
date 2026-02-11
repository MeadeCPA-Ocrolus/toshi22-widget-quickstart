/**
 * Transaction Types
 * 
 * TypeScript interfaces for transaction data used across frontend and API.
 * These types map to the transactions table schema and Plaid API responses.
 * 
 * @module types/transactions
 */

import type { PlaidAccountType, PlaidAccountSubtype } from './plaid';

// ============================================================================
// Database Record Types
// ============================================================================

/**
 * Transaction record as stored in the database
 */
export interface TransactionRecord {
    transaction_id: number;
    account_id: number;
    plaid_transaction_id: string;
    
    // Date fields
    transaction_date: string; // DATE format: YYYY-MM-DD
    transaction_datetime: string | null; // DATETIME2 format
    posted_date: string | null;
    authorized_date: string | null;
    
    // Merchant information
    merchant_name: string | null;
    original_description: string;
    merchant_logo_url: string | null;
    merchant_website: string | null;
    
    // Financial details
    amount: number; // Positive = debit/expense, Negative = credit/income
    iso_currency_code: string | null;
    
    // Transaction type & status
    payment_channel: 'online' | 'in_store' | 'other' | null;
    transaction_code: string | null;
    pending: boolean;
    is_transfer: boolean;
    
    // Lifecycle status
    transaction_status: 'added' | 'modified' | 'removed';
    is_removed: boolean;
    
    // Plaid categorization
    plaid_primary_category: string | null;
    plaid_detailed_category: string | null;
    plaid_confidence_score: number | null; // 0.00 to 1.00
    
    // Manual categorization
    category_verified: boolean;
    final_category: string;
    
    // Processing status
    processed_into_ledger: boolean;
    updated_since_process: boolean;
    sync_status: string;
    
    // Timestamps
    created_at: string;
    updated_at: string;
    
    // Archive status
    is_archived: boolean;
    archived_at: string | null;
    archive_reason: string | null;
}

/**
 * Transaction with related account and item details
 * Returned from list/get endpoints
 */
export interface TransactionWithDetails extends TransactionRecord {
    // Account info (using shared types from plaid.ts)
    account_name: string | null;
    account_type: PlaidAccountType;
    account_subtype: PlaidAccountSubtype | null;
    
    // Item info
    item_id: number;
    institution_name: string | null;
    
    // Client info
    client_id: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Transaction list query parameters
 */
export interface TransactionListParams {
    accountId?: number;
    itemId?: number;
    clientId?: number;
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
    pending?: boolean;
    isTransfer?: boolean;
    uncategorized?: boolean;
    limit?: number;
    offset?: number;
}

/**
 * Response from GET /api/transactions
 */
export interface TransactionListResponse {
    transactions: TransactionWithDetails[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

/**
 * Result of a sync operation
 */
export interface TransactionSyncResult {
    success: boolean;
    item_id: number;
    plaid_item_id: string;
    transactions: {
        added: number;
        modified: number;
        removed: number;
    };
    is_initial_sync: boolean;
    error?: string;
}

/**
 * Response from POST /api/transactions/sync (bulk)
 */
export interface BulkSyncResponse {
    success: boolean;
    synced: number;
    failed: number;
    totals: {
        added: number;
        modified: number;
        removed: number;
    };
    results: Array<{
        item_id: number;
        plaid_item_id: string;
        success: boolean;
        added: number;
        modified: number;
        removed: number;
        error?: string;
    }>;
}

/**
 * Response from POST /api/transactions/refresh
 */
export interface RefreshResponse {
    success: boolean;
    item_id: number;
    message: string;
}

// ============================================================================
// Category Types
// ============================================================================

/**
 * Plaid Personal Finance Category
 */
export interface PersonalFinanceCategory {
    primary: string;
    detailed: string;
    confidence_level: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
}

/**
 * Primary categories from Plaid PFC taxonomy
 */
export type PlaidPrimaryCategory =
    | 'INCOME'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'LOAN_PAYMENTS'
    | 'BANK_FEES'
    | 'ENTERTAINMENT'
    | 'FOOD_AND_DRINK'
    | 'GENERAL_MERCHANDISE'
    | 'HOME_IMPROVEMENT'
    | 'MEDICAL'
    | 'PERSONAL_CARE'
    | 'GENERAL_SERVICES'
    | 'GOVERNMENT_AND_NON_PROFIT'
    | 'TRANSPORTATION'
    | 'TRAVEL'
    | 'RENT_AND_UTILITIES';

// ============================================================================
// CPA Alert Types
// ============================================================================

/**
 * Alert type for transactions needing CPA attention
 */
export type TransactionAlertType =
    | 'uncategorized'      // Low confidence, needs manual categorization
    | 'low_confidence'     // Medium confidence, might need review
    | 'large_amount'       // Large transaction, might need review
    | 'potential_transfer' // Detected as transfer, needs verification
    | 'modified'           // Recently modified, might need re-review
    | 'error';             // Sync error

/**
 * Transaction alert for CPA dashboard
 */
export interface TransactionAlert {
    transaction_id: number;
    alert_type: TransactionAlertType;
    transaction_date: string;
    amount: number;
    merchant_name: string | null;
    original_description: string;
    client_id: number;
    client_name?: string;
    confidence_score: number | null;
    suggested_category?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Transaction amount sign convention
 * - Positive: Money out (expense/debit)
 * - Negative: Money in (income/credit)
 */
export type AmountDirection = 'expense' | 'income';

/**
 * Get the direction based on amount
 */
export function getAmountDirection(amount: number): AmountDirection {
    return amount > 0 ? 'expense' : 'income';
}

/**
 * Format amount for display (absolute value with direction indicator)
 */
export function formatTransactionAmount(amount: number, currencyCode = 'USD'): string {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
    });
    const formatted = formatter.format(Math.abs(amount));
    return amount > 0 ? `-${formatted}` : `+${formatted}`;
}

/**
 * Check if a transaction needs CPA review based on confidence score
 */
export function needsCategoryReview(
    confidenceScore: number | null,
    categoryVerified: boolean
): boolean {
    if (categoryVerified) return false;
    if (confidenceScore === null) return true;
    return confidenceScore < 0.7; // MEDIUM threshold
}