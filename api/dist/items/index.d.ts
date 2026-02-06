/**
 * Items Endpoint
 *
 * GET /api/items/:id - Get single item with accounts
 * DELETE /api/items/:id - Remove item and all related data (with optional Plaid removal) - NOW SOFT DELETE
 *
 * Note: Listing items by client is handled by /api/clients/:clientId/items
 * This endpoint is for operations on individual items.
 *
 * @module items
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main HTTP trigger handler
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map