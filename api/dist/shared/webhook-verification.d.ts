/**
 * Plaid Webhook Signature Verification
 *
 * Verifies the Plaid-Verification header on incoming webhooks, per Plaid's
 * documented approach: https://plaid.com/docs/api/webhooks/webhook-verification/
 *
 * Two checks, both required:
 *   1. The JWT's signature is valid, verified against Plaid's own JWK
 *      (fetched via their /webhook_verification_key/get endpoint) — proves
 *      the header was genuinely signed by Plaid.
 *   2. The JWT's `request_body_sha256` claim matches a fresh SHA-256 hash of
 *      the actual request body we received — proves the body wasn't altered
 *      or swapped after Plaid signed it.
 *
 * Plaid's keys rotate infrequently; they explicitly recommend caching by
 * `kid` rather than fetching on every webhook.
 *
 * @module shared/webhook-verification
 */
import { PlaidApi } from 'plaid';
/**
 * Verifies a Plaid webhook request. Throws a descriptive Error on any
 * failure — callers should catch and respond 401, never let a webhook
 * through on an unhandled exception.
 *
 * @param signedJwt   The raw value of the Plaid-Verification header
 * @param rawBody     The exact, unparsed request body as received
 * @param plaidClient An initialized Plaid API client
 */
export declare function verifyPlaidWebhook(signedJwt: string | undefined, rawBody: string, plaidClient: PlaidApi): Promise<void>;
//# sourceMappingURL=webhook-verification.d.ts.map