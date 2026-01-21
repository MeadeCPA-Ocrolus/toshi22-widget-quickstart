"use strict";
/**
 * Plaid API Client Wrapper
 *
 * Provides a configured Plaid client instance and helper functions
 * for common Plaid API operations.
 *
 * @module shared/plaid-client
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxWebhookCodes = void 0;
exports.getPlaidClient = getPlaidClient;
exports.getWebhookUrl = getWebhookUrl;
exports.createLinkToken = createLinkToken;
exports.exchangePublicToken = exchangePublicToken;
exports.getItem = getItem;
exports.getAccounts = getAccounts;
exports.syncTransactions = syncTransactions;
exports.getLinkToken = getLinkToken;
exports.sandboxCreatePublicToken = sandboxCreatePublicToken;
exports.sandboxFireWebhook = sandboxFireWebhook;
exports.sandboxResetLogin = sandboxResetLogin;
const plaid_1 = require("plaid");
/**
 * Get the Plaid environment URL based on PLAID_ENV
 */
function getPlaidEnvironment() {
    const env = (process.env.PLAID_ENV || 'sandbox');
    switch (env) {
        case 'production':
            return plaid_1.PlaidEnvironments.production;
        case 'development':
            return plaid_1.PlaidEnvironments.development;
        case 'sandbox':
        default:
            return plaid_1.PlaidEnvironments.sandbox;
    }
}
/**
 * Plaid client singleton
 */
let plaidClient = null;
/**
 * Get or create the Plaid API client
 * Uses singleton pattern to reuse the client across function invocations
 *
 * @returns PlaidApi - Configured Plaid client
 * @throws Error if PLAID_CLIENT_ID or PLAID_SECRET is not set
 */
function getPlaidClient() {
    if (plaidClient) {
        return plaidClient;
    }
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    if (!clientId || !secret) {
        throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set in environment variables');
    }
    const configuration = new plaid_1.Configuration({
        basePath: getPlaidEnvironment(),
        baseOptions: {
            headers: {
                'PLAID-CLIENT-ID': clientId,
                'PLAID-SECRET': secret,
            },
        },
    });
    plaidClient = new plaid_1.PlaidApi(configuration);
    return plaidClient;
}
/**
 * Get the webhook URL for Plaid callbacks
 */
function getWebhookUrl() {
    return process.env.PLAID_WEBHOOK_URL ||
        'https://zealous-stone-091bace10.2.azurestaticapps.net/api/plaid/webhook';
}
/**
 * Create a Plaid Link token for Hosted Link flow
 *
 * @param options - Link token configuration
 * @returns Promise<LinkTokenCreateResponse> - Contains link_token and hosted_link_url
 *
 * @example
 * // New link (initial connection)
 * const response = await createLinkToken({
 *   clientUserId: 'client-123',
 *   phoneNumber: '+15551234567',
 *   products: [Products.Transactions],
 * });
 *
 * // Update mode (re-authentication)
 * const response = await createLinkToken({
 *   clientUserId: 'client-123',
 *   accessToken: decryptedAccessToken,
 * });
 */
async function createLinkToken(options) {
    const client = getPlaidClient();
    // Default products: transactions (includes accounts)
    const products = options.products || [plaid_1.Products.Transactions];
    // Build the request
    const request = {
        client_name: 'Meade CPA',
        language: 'en',
        country_codes: [plaid_1.CountryCode.Us],
        user: {
            client_user_id: options.clientUserId,
            // Note: phone_number and email_address are only needed for Link Delivery (beta)
            // which requires special enablement from Plaid
        },
        webhook: getWebhookUrl(),
    };
    // Update mode (existing item) vs new link
    if (options.accessToken) {
        // Update mode - don't specify products, use existing access token
        request.access_token = options.accessToken;
        // Enable account selection in update mode if requested
        // This allows users to add/remove accounts during re-authentication
        if (options.accountSelectionEnabled) {
            request.update = {
                account_selection_enabled: true,
            };
        }
    }
    else {
        // New link - specify products
        request.products = products;
    }
    // Hosted Link configuration
    // Note: delivery_method (sms/email) requires Link Delivery beta access
    // Without it, we just get the hosted_link_url and can share it manually
    const hostedLink = {};
    if (options.completionRedirectUri) {
        hostedLink.completion_redirect_uri = options.completionRedirectUri;
    }
    hostedLink.url_lifetime_seconds = options.urlLifetimeSeconds || 14400; // 4 hours default
    hostedLink.is_mobile_app = false;
    request.hosted_link = hostedLink;
    const response = await client.linkTokenCreate(request);
    return response.data;
}
/**
 * Exchange a public token for an access token
 * Called after user completes Plaid Link flow
 *
 * @param publicToken - The public_token from Plaid Link
 * @returns Promise<ItemPublicTokenExchangeResponse> - Contains access_token and item_id
 */
async function exchangePublicToken(publicToken) {
    const client = getPlaidClient();
    const response = await client.itemPublicTokenExchange({
        public_token: publicToken,
    });
    return response.data;
}
/**
 * Get item details
 *
 * @param accessToken - The access_token for the item
 * @returns Promise<ItemGetResponse> - Item details including institution info
 */
async function getItem(accessToken) {
    const client = getPlaidClient();
    const response = await client.itemGet({
        access_token: accessToken,
    });
    return response.data;
}
/**
 * Get accounts for an item
 *
 * @param accessToken - The access_token for the item
 * @returns Promise<AccountsGetResponse> - List of accounts
 */
async function getAccounts(accessToken) {
    const client = getPlaidClient();
    const response = await client.accountsGet({
        access_token: accessToken,
    });
    return response.data;
}
/**
 * Sync transactions using cursor-based pagination
 *
 * @param accessToken - The access_token for the item
 * @param cursor - Optional cursor from previous sync (null for initial sync)
 * @returns Promise<TransactionsSyncResponse> - Transactions and next cursor
 */
async function syncTransactions(accessToken, cursor) {
    const client = getPlaidClient();
    const request = {
        access_token: accessToken,
    };
    if (cursor) {
        request.cursor = cursor;
    }
    const response = await client.transactionsSync(request);
    return response.data;
}
/**
 * Get link token details (to check status)
 *
 * @param linkToken - The link_token to look up
 * @returns Promise with link token metadata
 */
async function getLinkToken(linkToken) {
    const client = getPlaidClient();
    const response = await client.linkTokenGet({
        link_token: linkToken,
    });
    return response.data;
}
// ============================================
// SANDBOX-ONLY FUNCTIONS
// These are only available in sandbox environment
// ============================================
/**
 * Create a public token in sandbox (for testing)
 *
 * @param institutionId - Institution ID (e.g., 'ins_109508' for First Platypus Bank)
 * @param products - Products to enable
 * @returns Promise with public_token
 */
async function sandboxCreatePublicToken(institutionId = 'ins_109508', products = [plaid_1.Products.Transactions]) {
    if (process.env.PLAID_ENV !== 'sandbox') {
        throw new Error('sandboxCreatePublicToken is only available in sandbox environment');
    }
    const client = getPlaidClient();
    const response = await client.sandboxPublicTokenCreate({
        institution_id: institutionId,
        initial_products: products,
    });
    return response.data;
}
/**
 * Fire a webhook in sandbox (for testing)
 *
 * @param accessToken - The access_token for the item
 * @param webhookCode - The webhook code to fire
 */
async function sandboxFireWebhook(accessToken, webhookCode) {
    if (process.env.PLAID_ENV !== 'sandbox') {
        throw new Error('sandboxFireWebhook is only available in sandbox environment');
    }
    const client = getPlaidClient();
    const response = await client.sandboxItemFireWebhook({
        access_token: accessToken,
        webhook_code: webhookCode,
    });
    return response.data;
}
/**
 * Reset item login in sandbox (to test update mode)
 *
 * @param accessToken - The access_token for the item
 */
async function sandboxResetLogin(accessToken) {
    if (process.env.PLAID_ENV !== 'sandbox') {
        throw new Error('sandboxResetLogin is only available in sandbox environment');
    }
    const client = getPlaidClient();
    const response = await client.sandboxItemResetLogin({
        access_token: accessToken,
    });
    return response.data;
}
/**
 * Available sandbox webhook codes for testing
 */
exports.SandboxWebhookCodes = plaid_1.SandboxItemFireWebhookRequestWebhookCodeEnum;
//# sourceMappingURL=plaid-client.js.map