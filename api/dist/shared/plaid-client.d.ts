/**
 * Plaid API Client Wrapper
 *
 * Provides a configured Plaid client instance and helper functions
 * for common Plaid API operations.
 *
 * @module shared/plaid-client
 */
import { PlaidApi, Products, LinkTokenCreateResponse, ItemPublicTokenExchangeResponse, ItemGetResponse, AccountsGetResponse, TransactionsSyncResponse, SandboxItemFireWebhookRequestWebhookCodeEnum } from 'plaid';
/**
 * Get or create the Plaid API client
 * Uses singleton pattern to reuse the client across function invocations
 *
 * @returns PlaidApi - Configured Plaid client
 * @throws Error if PLAID_CLIENT_ID or PLAID_SECRET is not set
 */
export declare function getPlaidClient(): PlaidApi;
/**
 * Get the webhook URL for Plaid callbacks
 */
export declare function getWebhookUrl(): string;
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
export declare function createLinkToken(options: CreateLinkTokenOptions): Promise<LinkTokenCreateResponse>;
/**
 * Exchange a public token for an access token
 * Called after user completes Plaid Link flow
 *
 * @param publicToken - The public_token from Plaid Link
 * @returns Promise<ItemPublicTokenExchangeResponse> - Contains access_token and item_id
 */
export declare function exchangePublicToken(publicToken: string): Promise<ItemPublicTokenExchangeResponse>;
/**
 * Get item details
 *
 * @param accessToken - The access_token for the item
 * @returns Promise<ItemGetResponse> - Item details including institution info
 */
export declare function getItem(accessToken: string): Promise<ItemGetResponse>;
/**
 * Get accounts for an item
 *
 * @param accessToken - The access_token for the item
 * @returns Promise<AccountsGetResponse> - List of accounts
 */
export declare function getAccounts(accessToken: string): Promise<AccountsGetResponse>;
/**
 * Sync transactions using cursor-based pagination
 *
 * @param accessToken - The access_token for the item
 * @param cursor - Optional cursor from previous sync (null for initial sync)
 * @returns Promise<TransactionsSyncResponse> - Transactions and next cursor
 */
export declare function syncTransactions(accessToken: string, cursor?: string | null): Promise<TransactionsSyncResponse>;
/**
 * Get link token details (to check status)
 *
 * @param linkToken - The link_token to look up
 * @returns Promise with link token metadata
 */
export declare function getLinkToken(linkToken: string): Promise<import("plaid").LinkTokenGetResponse>;
/**
 * Create a public token in sandbox (for testing)
 *
 * @param institutionId - Institution ID (e.g., 'ins_109508' for First Platypus Bank)
 * @param products - Products to enable
 * @returns Promise with public_token
 */
export declare function sandboxCreatePublicToken(institutionId?: string, products?: Products[]): Promise<import("plaid").SandboxPublicTokenCreateResponse>;
/**
 * Fire a webhook in sandbox (for testing)
 *
 * @param accessToken - The access_token for the item
 * @param webhookCode - The webhook code to fire
 */
export declare function sandboxFireWebhook(accessToken: string, webhookCode: SandboxItemFireWebhookRequestWebhookCodeEnum): Promise<import("plaid").SandboxItemFireWebhookResponse>;
/**
 * Reset item login in sandbox (to test update mode)
 *
 * @param accessToken - The access_token for the item
 */
export declare function sandboxResetLogin(accessToken: string): Promise<import("plaid").SandboxItemResetLoginResponse>;
/**
 * Available sandbox webhook codes for testing
 */
export declare const SandboxWebhookCodes: typeof SandboxItemFireWebhookRequestWebhookCodeEnum;
//# sourceMappingURL=plaid-client.d.ts.map