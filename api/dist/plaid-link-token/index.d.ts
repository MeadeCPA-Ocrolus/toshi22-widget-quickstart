/**
 * Create Link Token Endpoint
 *
 * Creates a Plaid Hosted Link for a client to connect their bank.
 * Supports both new connections and update mode (re-authentication).
 *
 * POST /api/plaid/link-token
 * Body: { clientId: number, itemId?: number }
 *
 * @module plaid-link-token
 */
import { AzureFunction } from '@azure/functions';
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map