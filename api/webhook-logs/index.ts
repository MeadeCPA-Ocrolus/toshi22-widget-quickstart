import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Webhook-logs HTTP trigger function processed a request.');

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }

    // Return empty array for now - webhook handler will be implemented later
    context.res = {
        status: 200,
        body: [],
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    };
};

export default httpTrigger;
