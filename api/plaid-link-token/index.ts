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

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';
import { createLinkToken } from '../shared/plaid-client';
import { decrypt } from '../shared/encryption';

/**
 * Client record from database
 */
interface ClientRecord {
    client_id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string | null;
}

/**
 * Item record for update mode
 */
interface ItemRecord {
    item_id: number;
    client_id: number;
    access_token: Buffer;
    access_token_key_id: number;
    institution_name: string | null;
}

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
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
        const { clientId, itemId, accountSelectionEnabled } = req.body || {};

        // Validate clientId
        if (!clientId) {
            context.res = {
                status: 400,
                body: { error: 'clientId is required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        context.log(`Creating link token for client: ${clientId}, itemId: ${itemId || 'new'}, accountSelection: ${accountSelectionEnabled || false}`);

        // Fetch client from database
        const clientResult = await executeQuery<ClientRecord>(
            `SELECT client_id, first_name, last_name, email, phone_number
             FROM clients
             WHERE client_id = @clientId`,
            { clientId }
        );

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
        let accessToken: string | undefined;
        
        if (itemId) {
            // Fetch item for update mode
            const itemResult = await executeQuery<ItemRecord>(
                `SELECT item_id, client_id, access_token, access_token_key_id, institution_name
                 FROM items
                 WHERE item_id = @itemId AND client_id = @clientId`,
                { itemId, clientId }
            );

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
            accessToken = await decrypt(item.access_token, item.access_token_key_id);
        }

        // Create link token via Plaid
        const linkResponse = await createLinkToken({
            clientUserId: String(client.client_id),
            phoneNumber: client.phone_number || undefined,
            email: client.email,
            accessToken, // undefined for new link, set for update mode
            accountSelectionEnabled: accountSelectionEnabled || false, // Allow account changes in update mode
        });

        context.log(`Link token created: ${linkResponse.link_token}`);

        // Save link token to database
        await executeQuery(
            `INSERT INTO link_tokens (link_token, client_id, hosted_link_url, expires_at, status)
             VALUES (@linkToken, @clientId, @hostedUrl, @expiresAt, 'pending')`,
            {
                linkToken: linkResponse.link_token,
                clientId: client.client_id,
                hostedUrl: linkResponse.hosted_link_url,
                expiresAt: linkResponse.expiration,
            }
        );

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
                accountSelectionEnabled: !!(itemId && accountSelectionEnabled), // Only relevant for update mode
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };

    } catch (error) {
        context.log.error('Error creating link token:', error);
        
        // Extract Plaid error details if available
        let errorMessage = 'Unknown error';
        let plaidError = null;
        
        if (error instanceof Error) {
            errorMessage = error.message;
            
            // Plaid errors have additional details in response.data
            const plaidErr = error as any;
            if (plaidErr.response?.data) {
                plaidError = plaidErr.response.data;
                context.log.error('Plaid API error details:', JSON.stringify(plaidError));
                errorMessage = plaidError.error_message || plaidError.message || errorMessage;
            }
        }
        
        context.res = {
            status: 500,
            body: { 
                error: 'Failed to create link token',
                message: errorMessage,
                plaidError: plaidError,
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};

export default httpTrigger;