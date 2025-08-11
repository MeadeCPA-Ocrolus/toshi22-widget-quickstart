import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as bent from "bent";

const ENV = process.env.OCROLUS_WIDGET_ENVIRONMENT || 'production';
const OCROLUS_CLIENT_ID = process.env.OCROLUS_CLIENT_ID;
const OCROLUS_CLIENT_SECRET = process.env.OCROLUS_CLIENT_SECRET;
const OCROLUS_WIDGET_UUID = process.env.OCROLUS_WIDGET_UUID;

const TOKEN_ISSUER_URLS = {
    production: 'https://widget.ocrolus.com',
};

const token_issuer = TOKEN_ISSUER_URLS[ENV];
const issuer = bent(token_issuer, 'POST', 'json', 200);

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
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

        const token_response = await issuer(`/v1/widget/${OCROLUS_WIDGET_UUID}/token`, {
            client_id: OCROLUS_CLIENT_ID,
            client_secret: OCROLUS_CLIENT_SECRET,
            custom_id: finalUserId,
            grant_type: 'client_credentials',
            book_name: bookName || 'Widget Book',
        });

        const token = token_response.access_token;
        context.log('Token Acquired for', finalUserId);
        
        context.res = {
            status: 200,
            body: { accessToken: token },
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    } catch (err) {
        context.log.error('Token Request Failed:', err);
        context.res = {
            status: 500,
            body: { error: 'Token request failed' },
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    }
};

export default httpTrigger;
