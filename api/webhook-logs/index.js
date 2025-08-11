module.exports = async function (context, req) {
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

    // Return empty array for now
    context.res = {
        status: 200,
        body: [],
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    };
};
