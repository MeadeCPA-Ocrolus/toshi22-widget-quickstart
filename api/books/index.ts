import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as bent from "bent";

const ENV = process.env.OCROLUS_WIDGET_ENVIRONMENT || 'production';
const OCROLUS_API_URLS = { production: 'https://api.ocrolus.com' };
const API_ISSUER_URLS = { production: 'https://auth.ocrolus.com' };

const OCROLUS_API = OCROLUS_API_URLS[ENV];
const auth_issuer = API_ISSUER_URLS[ENV];

const api_issuer = bent(auth_issuer, 'POST', 'json', 200);
const ocrolusBent = (method: string, token: string) =>
    bent(`${OCROLUS_API}`, method, 'json', { authorization: `Bearer ${token}` });

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Books HTTP trigger function processed a request.');

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }

    if (req.method !== 'GET') {
        context.res = { status: 405, body: "Method not allowed", headers: corsHeaders };
        return;
    }

    try {
        const tokenResp = await api_issuer('/oauth/token', {
            client_id: process.env.OCROLUS_API_CLIENT_ID,
            client_secret: process.env.OCROLUS_API_CLIENT_SECRET,
            grant_type: 'client_credentials',
        });

        const getBooks = ocrolusBent('GET', tokenResp.access_token);
        const books = await getBooks('/v1/books?limit=50&order_by=created');
        
        context.res = {
            status: 200,
            body: books,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    } catch (err) {
        context.log.error('Error fetching book list:', err);
        context.res = {
            status: 500,
            body: { error: 'Failed to retrieve book list' },
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    }
};

export default httpTrigger;
