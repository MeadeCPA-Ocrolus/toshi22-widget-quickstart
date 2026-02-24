/**
 * Liabilities Sync Service
 *
 * Fetches liability data from Plaid and syncs to database.
 * Handles credit cards, student loans, and mortgages.
 *
 * @module shared/liabilities-sync-service
 */
import { Context } from '@azure/functions';
import { PlaidApi } from 'plaid';
interface SyncResult {
    success: boolean;
    item_id: number;
    credit: {
        added: number;
        updated: number;
        removed: number;
    };
    student: {
        added: number;
        updated: number;
        removed: number;
    };
    mortgage: {
        added: number;
        updated: number;
        removed: number;
    };
    error?: string;
}
/**
 * Sync liabilities for an item from Plaid
 */
export declare function syncLiabilitiesForItem(plaidClient: PlaidApi, itemId: number, accessToken: string, context: Context): Promise<SyncResult>;
/**
 * Archive all liabilities for an item
 */
export declare function archiveLiabilitiesForItem(itemId: number, reason: string): Promise<void>;
/**
 * Archive all liabilities for specific accounts
 */
export declare function archiveLiabilitiesForAccounts(accountIds: number[], reason: string): Promise<void>;
export {};
//# sourceMappingURL=liabilities-sync-service.d.ts.map