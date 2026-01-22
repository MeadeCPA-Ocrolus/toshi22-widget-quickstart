/**
 * Sandbox Testing Endpoint
 *
 * Provides endpoints for testing Plaid integration in sandbox environment.
 * NOT FOR PRODUCTION USE.
 *
 * POST /api/sandbox/test - Run a specific test scenario
 *
 * Test Scenarios:
 * - create-item: Create a new item via sandbox API
 * - reset-login: Force item into ITEM_LOGIN_REQUIRED state
 * - fire-webhook: Fire a specific webhook for testing
 * - update-mode: Test the complete update mode flow
 * - sync-available: Test SYNC_UPDATES_AVAILABLE webhook
 * - new-accounts: Test NEW_ACCOUNTS_AVAILABLE webhook
 * - full-flow: Run complete end-to-end test
 *
 * @module sandbox-test
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main HTTP trigger handler
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map