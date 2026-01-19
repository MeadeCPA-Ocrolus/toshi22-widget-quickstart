"use strict";
/**
 * Create Link Token Endpoint
 *
 * Creates a Plaid Hosted Link for a client to connect their bank.
 * Supports both new connections and update mode (re-authentication).
 *
 * POST /api/plaid/link-token
 * Body: { clientId: number, itemId?: number }
 *
 * @module plaid-link-token
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
const plaid_client_1 = require("../shared/plaid-client");
const encryption_1 = require("../shared/encryption");
const httpTrigger = async function (context, req) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
    // Only accept POST
    if (req.method !== 'POST') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    try {
        const { clientId, itemId } = req.body || {};
        // Validate clientId
        if (!clientId) {
            context.res = {
                status: 400,
                body: { error: 'clientId is required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        context.log(`Creating link token for client: ${clientId}, itemId: ${itemId || 'new'}`);
        // Fetch client from database
        const clientResult = await (0, database_1.executeQuery)(`SELECT client_id, first_name, last_name, email, phone_number
             FROM clients
             WHERE client_id = @clientId`, { clientId });
        if (clientResult.recordset.length === 0) {
            context.res = {
                status: 404,
                body: { error: 'Client not found' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        const client = clientResult.recordset[0];
        context.log(`Found client: ${client.first_name} ${client.last_name}`);
        // Check for update mode (re-authentication)
        let accessToken;
        if (itemId) {
            // Fetch item for update mode
            const itemResult = await (0, database_1.executeQuery)(`SELECT item_id, client_id, access_token, access_token_key_id, institution_name
                 FROM items
                 WHERE item_id = @itemId AND client_id = @clientId`, { itemId, clientId });
            if (itemResult.recordset.length === 0) {
                context.res = {
                    status: 404,
                    body: { error: 'Item not found or does not belong to this client' },
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                };
                return;
            }
            const item = itemResult.recordset[0];
            context.log(`Update mode for item: ${item.institution_name}`);
            // Decrypt the access token for update mode
            accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
        }
        // Create link token via Plaid
        const linkResponse = await (0, plaid_client_1.createLinkToken)({
            clientUserId: String(client.client_id),
            phoneNumber: client.phone_number || undefined,
            email: client.email,
            accessToken, // undefined for new link, set for update mode
        });
        context.log(`Link token created: ${linkResponse.link_token}`);
        // Save link token to database
        await (0, database_1.executeQuery)(`INSERT INTO link_tokens (link_token, client_id, hosted_link_url, expires_at, status)
             VALUES (@linkToken, @clientId, @hostedUrl, @expiresAt, 'pending')`, {
            linkToken: linkResponse.link_token,
            clientId: client.client_id,
            hostedUrl: linkResponse.hosted_link_url,
            expiresAt: linkResponse.expiration,
        });
        context.log(`Link token saved to database`);
        // Return response
        context.res = {
            status: 200,
            body: {
                hostedLinkUrl: linkResponse.hosted_link_url,
                linkToken: linkResponse.link_token,
                expiresAt: linkResponse.expiration,
                clientName: `${client.first_name} ${client.last_name}`,
                isUpdateMode: !!itemId,
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
    catch (error) {
        context.log.error('Error creating link token:', error);
        context.res = {
            status: 500,
            body: {
                error: 'Failed to create link token',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map