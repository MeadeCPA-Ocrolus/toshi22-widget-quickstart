/**
 * Plaid Webhook Handler
 *
 * Receives webhooks from Plaid and processes them:
 * - SESSION_FINISHED: Exchange token(s), save item(s) + accounts (with duplicate prevention)
 *   - SUPPORTS MULTI-ITEM: Loops through public_tokens[] array
 * - ITEM webhooks: Update item status (including ERROR with ITEM_LOGIN_REQUIRED)
 * - TRANSACTIONS webhooks: Set sync flag (only when historical_update_complete=true for new items)
 * - USER_ACCOUNT_REVOKED: Mark specific account as inactive
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