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
exports.createPlaidUser = createPlaidUser;
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
 * Create a Plaid user for Multi-Item Link
 *
 * Per Plaid docs (Dec 10, 2025+), this returns a user_id (e.g., "usr_9nSp2KuZ2x4JDw").
 * Must be called BEFORE creating multi-item link tokens.
 * The returned user_id should be stored in the clients.plaid_user_id column.
 *
 * NOTE: Calling with the same client_user_id multiple times returns the SAME user_id.
 *
 * @param clientUserId - Your internal client ID (e.g., "client-123" or "3")
 * @returns Plaid user_id (e.g., "usr_9nSp2KuZ2x4JDw")
 *
 * @example
 * const { user_id } = await createPlaidUser('client-123');
 * // user_id = "usr_9nSp2KuZ2x4JDw"
 * // Save this to clients.plaid_user_id
 */
async function createPlaidUser(clientUserId) {
    const client = getPlaidClient();
    const response = await client.userCreate({
        client_user_id: clientUserId,
    });
    return {
        user_id: response.data.user_id,
        request_id: response.data.request_id,
    };
}
/**
 * Create a Plaid Link token for Hosted Link flow
 *
 * UPDATED FOR MULTI-ITEM:
 * - NEW LINKS: Multi-item enabled if plaidUserId provided (client can connect multiple banks)
 * - UPDATE MODE: Single-item only (multi-item not supported for re-auth)
 *
 * @param options - Link token configuration
 * @returns Promise<LinkTokenCreateResponse> - Contains link_token and hosted_link_url
 *
 * @example
 * // New link with multi-item enabled (client can connect multiple banks)
 * const response = await createLinkToken({
 *   clientUserId: 'client-123',
 *   plaidUserId: 'usr_9nSp2KuZ2x4JDw',  // From createPlaidUser()
 *   email: 'client@example.com',
 * });
 *
 * // Update mode (re-authentication) - single item only
 * const response = await createLinkToken({
 *   clientUserId: 'client-123',
 *   accessToken: decryptedAccessToken,
 * });
 */
async function createLinkToken(options) {
    const client = getPlaidClient();
    // PRODUCTS CONFIGURATION:
    // - products: REQUIRED products (institution MUST support these)
    // - optional_products: Nice-to-have (retrieved if supported, no error if not)
    //
    // Using Transactions as required, Liabilities/Investments as optional
    // prevents "Connectivity not supported" errors for institutions that
    // don't support all products.
    //
    // See: https://plaid.com/docs/link/troubleshooting/#connectivity-not-supported
    const products = options.products || [plaid_1.Products.Transactions];
    // Optional products - retrieved if the institution supports them
    const optionalProducts = [plaid_1.Products.Liabilities, plaid_1.Products.Investments];
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
    // Determine if this is update mode
    const isUpdateMode = !!options.accessToken;
    // Update mode (existing item) vs new link
    if (isUpdateMode) {
        // ============================================================
        // UPDATE MODE: Re-authenticate existing item (single-item only)
        // - Do NOT specify products (uses existing item's products)
        // - Do NOT enable multi-item
        // ============================================================
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
        // ============================================================
        // NEW LINK: First-time connection
        // - Specify products (required)
        // - Specify optional_products (retrieved if supported)
        // - Enable multi-item if plaidUserId provided
        // ============================================================
        request.products = products;
        // Add optional products - these won't cause "Connectivity not supported"
        // if the institution doesn't support them
        request.optional_products = optionalProducts;
        // MULTI-ITEM LINK (Per Plaid API documentation)
        // Requirements:
        // 1. user_id (from /user/create) - goes at TOP LEVEL, not inside 'user' object
        // 2. enable_multi_item_link: true
        // 
        // Per https://plaid.com/docs/link/multi-item-link/:
        // - Use user_id (the new API, "usr_xxx" format)
        // - Set enable_multi_item_link: true
        // - SESSION_FINISHED webhook will return public_tokens[] array
        if (options.plaidUserId) {
            // Add user_id at TOP LEVEL (not inside 'user' object)
            // This is the Plaid user_id from /user/create, NOT client_user_id
            request.user_id = options.plaidUserId;
            // Enable multi-item link (default true if plaidUserId provided)
            const enableMultiItem = options.enableMultiItemLink !== false;
            if (enableMultiItem) {
                request.enable_multi_item_link = true;
            }
        }
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
    // ============================================================
    // CRITICAL FOR OAUTH BANKS: redirect_uri (TOP LEVEL parameter)
    // ============================================================
    // This is DIFFERENT from completion_redirect_uri!
    // - redirect_uri: OAuth mid-flow redirect (MUST be registered in Plaid Dashboard)
    // - completion_redirect_uri: End-of-session redirect (does NOT need registration)
    // 
    // Without redirect_uri, OAuth banks show "Connectivity not supported" error.
    // The URI must EXACTLY match one registered in Plaid Dashboard.
    if (options.redirectUri) {
        request.redirect_uri = options.redirectUri;
    }
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