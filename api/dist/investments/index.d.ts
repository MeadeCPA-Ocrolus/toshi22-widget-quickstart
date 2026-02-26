/**
 * Investments API Endpoint
 *
 * GET /api/investments?accountId=X - Get investments for a specific account
 * GET /api/investments?itemId=X - Get investments for all accounts in an item
 * GET /api/investments?clientId=X - Get investments for all accounts for a client
 *
 * Returns holdings with embedded security data, and investment transactions.
 *
 * @module investments
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main HTTP trigger handler
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map