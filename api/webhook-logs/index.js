const { BlobServiceClient } = require('@azure/storage-blob');

// Helper function to convert stream to string
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => {
            chunks.push(data.toString());
        });
        readableStream.on('end', () => {
            resolve(chunks.join(''));
        });
        readableStream.on('error', reject);
    });
}

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

    if (req.method !== 'GET') {
        context.res = { status: 405, body: "Method not allowed", headers: corsHeaders };
        return;
    }

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        let blobClient = blobServiceClient.getContainerClient('webhook-logs').getBlockBlobClient('webhook-log.json');

        try {
            const downloadResponse = await blobClient.download();
            const content = await streamToString(downloadResponse.readableStreamBody);
            const logs = JSON.parse(content);

            //Filtered to one week
            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const recentLogs = logs
                .filter(log => new Date(log.timestamp).getTime() >= oneWeekAgo)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            context.res = {
                status: 200,
                body: recentLogs,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            };
        } catch (err) {
            console.log('Failed to read webhook logs:', err);
            context.res = {
                status: 200,
                body: [],
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            };
        }
    } catch (err) {
        context.log.error('Error in webhook-logs function:', err);
        context.res = {
            status: 500,
            body: { error: 'Failed to retrieve webhook logs' },
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    }
};