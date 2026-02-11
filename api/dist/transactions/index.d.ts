/**
 * Transactions Endpoint
 *
 * GET /api/transactions - List transactions with filtering
 * GET /api/transactions/:id - Get single transaction
 *
 * Query Parameters for GET /api/transactions:
 * - accountId: Filter by account
 * - itemId: Filter by item (all accounts for that item)
 * - clientId: Filter by client (all accounts for that client)
 * - startDate: Filter by date range (YYYY-MM-DD)
 * - endDate: Filter by date range (YYYY-MM-DD)
 * - pending: Filter by pending status ('true' or 'false')
 * - isTransfer: Filter transfers ('true' or 'false')
 * - uncategorized: Only show transactions needing categorization ('true')
 * - limit: Max results (default 100, max 500)
 * - offset: Pagination offset
 *
 * @module transactions
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main HTTP trigger handler
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map