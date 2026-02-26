/**
 * Investments Sync Endpoint
 *
 * POST /api/investments/sync/:itemId - Manually trigger investments sync for an item
 *
 * This endpoint syncs both holdings and investment transactions.
 * Unlike regular transactions, investments sync automatically on webhooks,
 * but this endpoint allows CPAs to manually trigger a refresh if needed.
 *
 * @module investments-sync
 */
import { AzureFunction } from '@azure/functions';
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map