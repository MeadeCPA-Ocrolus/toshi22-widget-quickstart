/**
 * Plaid API Client Wrapper
 * 
 * Provides a configured Plaid client instance and helper functions
 * for common Plaid API operations.
 * 
 * @module shared/plaid-client
 */

import {
    Configuration,
    PlaidApi,
    PlaidEnvironments,
    Products,
    CountryCode,
    LinkTokenCreateRequest,
    LinkTokenCreateResponse,
    ItemPublicTokenExchangeResponse,
    ItemGetResponse,
    AccountsGetResponse,
    TransactionsSyncRequest,
    TransactionsSyncResponse,
    SandboxItemFireWebhookRequestWebhookCodeEnum,
    //HostedLinkDeliveryMethod,
} from 'plaid';

/**
 * Plaid environment type
 */
type PlaidEnv = 'sandbox' | 'development' | 'production';

/**
 * Get the Plaid environment URL based on PLAID_ENV
 */
function getPlaidEnvironment(): string {
    const env = (process.env.PLAID_ENV || 'sandbox') as PlaidEnv;
    
    switch (env) {
        case 'production':
            return PlaidEnvironments.production;
        case 'development':
            return PlaidEnvironments.development;
        case 'sandbox':
        default:
            return PlaidEnvironments.sandbox;
    }
}

/**
 * Plaid client singleton
 */
let plaidClient: PlaidApi | null = null;

/**
 * Get or create the Plaid API client
 * Uses singleton pattern to reuse the client across function invocations
 * 
 * @returns PlaidApi - Configured Plaid client
 * @throws Error if PLAID_CLIENT_ID or PLAID_SECRET is not set
 */
export function getPlaidClient(): PlaidApi {
    if (plaidClient) {
        return plaidClient;
    }

    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;

    if (!clientId || !secret) {
        throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set in environment variables');
    }

    const configuration = new Configuration({
        basePath: getPlaidEnvironment(),
        baseOptions: {
            headers: {
                'PLAID-CLIENT-ID': clientId,
                'PLAID-SECRET': secret,
            },
        },
    });

    plaidClient = new PlaidApi(configuration);
    return plaidClient;
}

/**
 * Get the webhook URL for Plaid callbacks
 */
export function getWebhookUrl(): string {
    return process.env.PLAID_WEBHOOK_URL || 
        'https://zealous-stone-091bace10.2.azurestaticapps.net/api/plaid/webhook';
}

/**
 * Options for creating a link token
 */
export interface CreateLinkTokenOptions {
    /** Client's unique ID in our system */
    clientUserId: string;
    /** Client's phone number for SMS delivery (E.164 format: +1XXXXXXXXXX) */
    phoneNumber?: string;
    /** Client's email for email delivery */
    email?: string;
    /** Products to request access to */
    products?: Products[];
    /** URL to redirect to after completion (for Hosted Link) */
    completionRedirectUri?: string;
    /** How long the link URL is valid (seconds, max 21600 = 6 hours) */
    urlLifetimeSeconds?: number;
    /** Existing access token for update mode */
    accessToken?: string;
    /** 
     * Enable account selection in update mode
     * When true, user can add/remove accounts during re-authentication
     * Only used when accessToken is also provided (update mode)
     */
    accountSelectionEnabled?: boolean;
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
export async function createLinkToken(
    options: CreateLinkTokenOptions
): Promise<LinkTokenCreateResponse> {
    const client = getPlaidClient();

    // Default products: transactions (includes accounts)
    const products = options.products || [Products.Transactions];

    // Build the request
    const request: LinkTokenCreateRequest = {
        client_name: 'Meade CPA',
        language: 'en',
        country_codes: [CountryCode.Us],
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
            (request as any).update = {
                account_selection_enabled: true,
            };
        }
    } else {
        // New link - specify products
        request.products = products;
    }

    // Hosted Link configuration
    // Note: delivery_method (sms/email) requires Link Delivery beta access
    // Without it, we just get the hosted_link_url and can share it manually
    const hostedLink: any = {};
    
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
export async function exchangePublicToken(
    publicToken: string
): Promise<ItemPublicTokenExchangeResponse> {
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
export async function getItem(accessToken: string): Promise<ItemGetResponse> {
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
export async function getAccounts(accessToken: string): Promise<AccountsGetResponse> {
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
export async function syncTransactions(
    accessToken: string,
    cursor?: string | null
): Promise<TransactionsSyncResponse> {
    const client = getPlaidClient();
    
    const request: TransactionsSyncRequest = {
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
export async function getLinkToken(linkToken: string) {
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
export async function sandboxCreatePublicToken(
    institutionId: string = 'ins_109508',
    products: Products[] = [Products.Transactions]
) {
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
export async function sandboxFireWebhook(
    accessToken: string,
    webhookCode: SandboxItemFireWebhookRequestWebhookCodeEnum
) {
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
export async function sandboxResetLogin(accessToken: string) {
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
export const SandboxWebhookCodes = SandboxItemFireWebhookRequestWebhookCodeEnum;