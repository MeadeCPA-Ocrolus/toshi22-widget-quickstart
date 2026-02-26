/**
 * Investments Sync Service
 *
 * Fetches investment data from Plaid and syncs to database.
 * Handles holdings, securities, and investment transactions.
 *
 * Key differences from regular transactions:
 * - Uses /investments/holdings/get for current positions
 * - Uses /investments/transactions/get for historical activity (offset-based, not cursor)
 * - Securities are stored globally (deduplicated by plaid_security_id)
 * - Both holdings AND transactions sync automatically on SESSION_FINISHED
 *
 * @module shared/investments-sync-service
 */
import { Context } from '@azure/functions';
import { PlaidApi } from 'plaid';
export interface InvestmentsSyncResult {
    success: boolean;
    item_id: number;
    holdings: {
        added: number;
        updated: number;
        removed: number;
    };
    securities: {
        added: number;
        updated: number;
    };
    transactions: {
        added: number;
        updated: number;
    };
    error?: string;
}
/**
 * Sync all investment data for an item (holdings + transactions)
 * Called on SESSION_FINISHED and on webhook updates
 */
export declare function syncInvestmentsForItem(plaidClient: PlaidApi, itemId: number, accessToken: string, context: Context): Promise<InvestmentsSyncResult>;
/**
 * Sync only holdings (for HOLDINGS: DEFAULT_UPDATE webhook)
 */
export declare function syncHoldingsOnly(plaidClient: PlaidApi, itemId: number, accessToken: string, context: Context): Promise<InvestmentsSyncResult>;
/**
 * Archive all investment holdings and transactions for an item
 */
export declare function archiveInvestmentsForItem(itemId: number, reason: string): Promise<void>;
/**
 * Archive investment holdings and transactions for specific accounts
 */
export declare function archiveInvestmentsForAccounts(accountIds: number[], reason: string): Promise<void>;
//# sourceMappingURL=investments-sync-service.d.ts.map