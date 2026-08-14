"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPlaidWebhook = verifyPlaidWebhook;
const crypto_1 = require("crypto");
const jose_1 = require("jose");
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, per Plaid's guidance
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000; // reject anything claiming to be older than 5 minutes
const keyCache = new Map();
/**
 * Fetches a Plaid webhook verification key by kid, using the in-memory
 * cache when possible. Never caches negative results — a genuinely new key
 * from Plaid should always succeed on the next fetch.
 */
async function getVerificationKey(kid, plaidClient) {
    const cached = keyCache.get(kid);
    if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) {
        return cached.jwk;
    }
    const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
    const jwk = response.data.key;
    keyCache.set(kid, { jwk, fetchedAt: Date.now() });
    return jwk;
}
/**
 * Verifies a Plaid webhook request. Throws a descriptive Error on any
 * failure — callers should catch and respond 401, never let a webhook
 * through on an unhandled exception.
 *
 * @param signedJwt   The raw value of the Plaid-Verification header
 * @param rawBody     The exact, unparsed request body as received
 * @param plaidClient An initialized Plaid API client
 */
async function verifyPlaidWebhook(signedJwt, rawBody, plaidClient) {
    if (!signedJwt) {
        throw new Error('Missing Plaid-Verification header');
    }
    let kid;
    try {
        const header = (0, jose_1.decodeProtectedHeader)(signedJwt);
        if (!header.kid) {
            throw new Error('JWT header missing kid');
        }
        kid = header.kid;
    }
    catch (err) {
        throw new Error(`Malformed Plaid-Verification JWT: ${err instanceof Error ? err.message : String(err)}`);
    }
    const jwk = await getVerificationKey(kid, plaidClient);
    const key = await (0, jose_1.importJWK)(jwk, 'ES256');
    let payload;
    try {
        const result = await (0, jose_1.jwtVerify)(signedJwt, key, { algorithms: ['ES256'] });
        payload = result.payload;
    }
    catch (err) {
        throw new Error(`Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Reject stale webhooks — guards against a captured header being replayed later
    if (payload.iat) {
        const ageMs = Date.now() - payload.iat * 1000;
        if (ageMs > MAX_WEBHOOK_AGE_MS) {
            throw new Error(`Webhook too old (${Math.round(ageMs / 1000)}s) — possible replay`);
        }
    }
    // Confirm the body we actually received matches what Plaid signed
    const actualBodyHash = (0, crypto_1.createHash)('sha256').update(rawBody, 'utf8').digest('hex');
    if (payload.request_body_sha256 !== actualBodyHash) {
        throw new Error('Webhook body hash mismatch — body may have been altered');
    }
}
//# sourceMappingURL=webhook-verification.js.map