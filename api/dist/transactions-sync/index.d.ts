/**
 * Transactions Sync Endpoint
 *
 * POST /api/transactions/sync/:itemId - Trigger transaction sync for a specific item
 * POST /api/transactions/sync - Sync all items with pending updates (with pagination)
 * POST /api/transactions/refresh/:itemId - Force refresh from Plaid (triggers webhook)
 *
 * This endpoint is triggered manually by CPAs via the frontend.
 * Syncs are NOT automatic - this gives CPAs control over when data is pulled.
 *
 * @module transactions-sync
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main HTTP trigger handler
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map