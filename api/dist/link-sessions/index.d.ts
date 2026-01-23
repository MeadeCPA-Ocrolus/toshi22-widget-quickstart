/**
 * Link Sessions Endpoint
 *
 * GET /api/link-sessions - List all link tokens with status
 * GET /api/link-sessions?needsAction=true - Only links needing CPA attention
 * GET /api/link-sessions?clientId=3 - Links for specific client
 *
 * Note: The link_token table uses link_token (the string) as the primary key,
 *       NOT a separate link_token_id column.
 *
 * This endpoint helps CPAs see:
 * - Failed link attempts (client exited, didn't complete, etc.)
 * - Expired links that need to be resent
 * - Pending links that haven't been used yet
 *
 * @module link-sessions
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main HTTP trigger handler
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map