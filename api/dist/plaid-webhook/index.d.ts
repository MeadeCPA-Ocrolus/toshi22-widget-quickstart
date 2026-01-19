/**
 * Plaid Webhook Handler
 *
 * Receives webhooks from Plaid and processes them:
 * - SESSION_FINISHED: Exchange token, save item + accounts
 * - ITEM webhooks: Update item status
 * - TRANSACTIONS webhooks: Set sync flag
 *
 * Endpoint: POST /api/plaid/webhook
 *
 * @module plaid-webhook
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main webhook handler function
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map