const bent = require('bent');

const ENV = process.env.OCROLUS_WIDGET_ENVIRONMENT || 'production';
const OCROLUS_CLIENT_ID = process.env.OCROLUS_CLIENT_ID;
const OCROLUS_CLIENT_SECRET = process.env.OCROLUS_CLIENT_SECRET;
const OCROLUS_WIDGET_UUID = process.env.OCROLUS_WIDGET_UUID;

const TOKEN_ISSUER_URLS = {
    production: 'https://widget.ocrolus.com',
};

const token_issuer = TOKEN_ISSUER_URLS[ENV];
const issuer = bent(token_issuer, 'POST', 'json', 200);

module.exports = async function (context, req) {
    context.log('Token HTTP trigger function processed a request.');

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }

    if (req.method !== 'POST') {
        context.res = { status: 405, body: "Method not allowed", headers: corsHeaders };
        return;
    }

    try {
        const { custom_id, bookName } = req.body || {};
        
        context.log('Passed User Id', custom_id);
        context.log('Passed Book Name', bookName);

        const finalUserId = custom_id || 'default-user';

        const tokenPayload = {
            client_id: OCROLUS_CLIENT_ID,
            client_secret: OCROLUS_CLIENT_SECRET,
            custom_id: finalUserId,
            grant_type: 'client_credentials',
            book_name: bookName || 'Widget Book',
            // Add Plaid credentials for bank connections
            plaid_client_id: process.env.PLAID_CLIENT_ID,
            plaid_secret: process.env.PLAID_SECRET,
        };

        context.log('Token request payload:', JSON.stringify(tokenPayload, null, 2));

        const token_response = await issuer(`/v1/widget/${OCROLUS_WIDGET_UUID}/token`, tokenPayload);

        const token = token_response.access_token;
        context.log('Token Acquired for', finalUserId);
        context.log('Token response:', JSON.stringify(token_response, null, 2));
        
        context.res = {
            status: 200,
            body: { 
                accessToken: token,
                // Include additional token info for debugging
                tokenInfo: {
                    scope: token_response.scope,
                    expiresIn: token_response.expires_in,
                    tokenType: token_response.token_type
                }
            },
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    } catch (err) {
        context.log.error('Token Request Failed:', err);
        context.log.error('Error details:', err.response?.data || err.message);
        
        context.res = {
            status: 500,
            body: { 
                error: 'Token request failed',
                details: err.response?.data || err.message,
                // Include request details for debugging
                debugInfo: process.env.NODE_ENV === 'development' ? {
                    clientId: OCROLUS_CLIENT_ID ? 'SET' : 'NOT_SET',
                    clientSecret: OCROLUS_CLIENT_SECRET ? 'SET' : 'NOT_SET',
                    widgetUuid: OCROLUS_WIDGET_UUID,
                    environment: ENV
                } : undefined
            },
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    }
};