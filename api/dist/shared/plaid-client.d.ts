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
 * Response from /user/create endpoint
 */
export interface PlaidUserCreateResponse {
    user_id: string;
    request_id: string;
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
export declare function createPlaidUser(clientUserId: string): Promise<PlaidUserCreateResponse>;
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
    /**
     * OAuth redirect URI (TOP LEVEL) - REQUIRED FOR OAUTH BANKS
     * This is where Plaid redirects DURING the OAuth flow (mid-flow).
     * Must be registered in Plaid Dashboard under "Allowed redirect URIs".
     * Different from completionRedirectUri!
     */
    redirectUri?: string;
    /**
     * URL to redirect to after completion (for Hosted Link)
     * This is where user goes AFTER the entire Link flow completes (end of flow).
     * Does NOT need to be registered in Dashboard.
     */
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
    /**
     * Plaid user_id from /user/create (required for multi-item)
     * Format: "usr_9nSp2KuZ2x4JDw"
     */
    plaidUserId?: string;
    /**
     * Enable multi-item link (allows connecting multiple banks in one session)
     * Only used for NEW links, not update mode
     * Requires plaidUserId to be set
     * Default: true if plaidUserId is provided and not update mode
     */
    enableMultiItemLink?: boolean;
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