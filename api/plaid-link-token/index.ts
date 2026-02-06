/**
 * Create Link Token Endpoint
 * 
 * Creates a Plaid Hosted Link for a client to connect their bank.
 * Supports both new connections and update mode (re-authentication).
 * 
 * MULTI-ITEM SUPPORT:
 * - NEW LINKS: Multi-item enabled (client can connect multiple banks in one session)
 * - UPDATE MODE: Single-item only (re-authenticate one existing connection)
 * 
 * POST /api/plaid/link-token
 * Body: { clientId: number, itemId?: number }
 * 
 * @module plaid-link-token
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';
import { createLinkToken, createPlaidUser } from '../shared/plaid-client';
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
    plaid_user_id: string | null;  // Added for Multi-Item Link
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

        // Fetch client from database (now includes plaid_user_id)
        const clientResult = await executeQuery<ClientRecord>(
            `SELECT client_id, first_name, last_name, email, phone_number, plaid_user_id
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

        // Determine if this is update mode
        const isUpdateMode = !!itemId;

        // ============================================================
        // UPDATE MODE: Re-authenticate existing item (single-item only)
        // ============================================================
        if (isUpdateMode) {
            context.log(`UPDATE MODE for item: ${itemId}`);
            
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
            const accessToken = await decrypt(item.access_token, item.access_token_key_id);

            // Construct redirect URIs for OAuth banks
            // Both redirect_uri and completion_redirect_uri are needed
            // We use PLAID_REDIRECT_URI_BASE env var if set, otherwise try to detect from request headers.
            const baseUrl = process.env.PLAID_REDIRECT_URI_BASE ||
                            req.headers['origin'] || 
                            req.headers['referer']?.replace(/\/[^\/]*$/, '') ||
                            'https://zealous-stone-091bace10.2.azurestaticapps.net';
            
            // OAuth redirect (must match Plaid Dashboard "Allowed redirect URIs" EXACTLY)
            const redirectUri = `${baseUrl}/bank/link-complete`;
            
            // Hosted Link completion redirect
            const completionRedirectUri = `${baseUrl}/bank/link-complete`;
            
            context.log(`Using redirect_uri (OAuth): ${redirectUri}`);
            context.log(`Using completion_redirect_uri: ${completionRedirectUri}`);

            // Create UPDATE MODE link token (single-item, no multi-item)
            const linkResponse = await createLinkToken({
                clientUserId: String(client.client_id),
                phoneNumber: client.phone_number || undefined,
                email: client.email,
                accessToken, // This triggers update mode
                redirectUri,  // REQUIRED for OAuth banks! Must be in Plaid Dashboard.
                completionRedirectUri,  // End-of-session redirect
                accountSelectionEnabled: true,
                // NOTE: No plaidUserId for update mode - single item only
            });

            context.log(`Link token created (update mode): ${linkResponse.link_token}`);

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

            // Return response for update mode
            context.res = {
                status: 200,
                body: {
                    hostedLinkUrl: linkResponse.hosted_link_url,
                    linkToken: linkResponse.link_token,
                    expiresAt: linkResponse.expiration,
                    clientName: `${client.first_name} ${client.last_name}`,
                    isUpdateMode: true,
                    multiItemEnabled: false,
                    accountSelectionEnabled: true,
                },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        // ============================================================
        // NEW LINK: Multi-item enabled (client can connect multiple banks)
        // ============================================================
        context.log(`NEW LINK (multi-item) for client: ${clientId}`);

        let plaidUserId = client.plaid_user_id;

        // Step 1: Check if client has a plaid_user_id, create one if not
        if (!plaidUserId) {
            context.log(`Client ${clientId} has no plaid_user_id, creating one...`);
            
            try {
                // Call Plaid /user/create
                const userResponse = await createPlaidUser(String(client.client_id));
                plaidUserId = userResponse.user_id;
                
                context.log(`Created Plaid user_id: ${plaidUserId} for client ${clientId}`);
                
                // Save the plaid_user_id to the clients table
                await executeQuery(
                    `UPDATE clients SET plaid_user_id = @plaidUserId WHERE client_id = @clientId`,
                    { plaidUserId, clientId }
                );
                
                context.log(`Saved plaid_user_id to clients table`);
            } catch (userError) {
                // Log the error but continue - we can still create a single-item link
                context.log.error('Error creating Plaid user:', userError);
                context.log.warn('Proceeding without multi-item link due to user creation error');
                plaidUserId = null;
            }
        } else {
            context.log(`Client ${clientId} already has plaid_user_id: ${plaidUserId}`);
        }

        // Step 2: Create link token with multi-item enabled (if we have plaidUserId)
        // 
        // IMPORTANT: TWO DIFFERENT REDIRECT URIs are needed for OAuth banks:
        // 1. redirect_uri (TOP LEVEL) - OAuth mid-flow redirect, MUST be registered in Plaid Dashboard
        // 2. completion_redirect_uri (in hosted_link) - End-of-session redirect, does NOT need registration
        //
        // Without redirect_uri, OAuth banks show "Connectivity not supported" error!
        //
        // We use PLAID_REDIRECT_URI_BASE env var if set, otherwise try to detect from request headers.
        const baseUrl = process.env.PLAID_REDIRECT_URI_BASE ||
                        req.headers['origin'] || 
                        req.headers['referer']?.replace(/\/[^\/]*$/, '') ||
                        'https://zealous-stone-091bace10.2.azurestaticapps.net';
        
        // OAuth redirect (must match Plaid Dashboard "Allowed redirect URIs" EXACTLY)
        const redirectUri = `${baseUrl}/bank/link-complete`;
        
        // Hosted Link completion redirect (where user goes after entire flow)
        const completionRedirectUri = `${baseUrl}/bank/link-complete`;
        
        context.log(`Using redirect_uri (OAuth): ${redirectUri}`);
        context.log(`Using completion_redirect_uri: ${completionRedirectUri}`);
        
        const linkResponse = await createLinkToken({
            clientUserId: String(client.client_id),
            phoneNumber: client.phone_number || undefined,
            email: client.email,
            plaidUserId: plaidUserId || undefined,  // Enable multi-item if available
            redirectUri,  // REQUIRED for OAuth banks! Must be in Plaid Dashboard.
            completionRedirectUri,  // End-of-session redirect
            // No accessToken = new link, not update mode
            accountSelectionEnabled: true,
        });

        context.log(`Link token created (new link): ${linkResponse.link_token}`);
        context.log(`Multi-item enabled: ${!!plaidUserId}`);

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

        // Return response for new link
        context.res = {
            status: 200,
            body: {
                hostedLinkUrl: linkResponse.hosted_link_url,
                linkToken: linkResponse.link_token,
                expiresAt: linkResponse.expiration,
                clientName: `${client.first_name} ${client.last_name}`,
                isUpdateMode: false,
                multiItemEnabled: !!plaidUserId,
                plaidUserId: plaidUserId,
                accountSelectionEnabled: true,
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