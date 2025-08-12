const bent = require('bent');
const { BlobServiceClient } = require('@azure/storage-blob');

const ENV = process.env.OCROLUS_WIDGET_ENVIRONMENT || 'production';
const OCROLUS_API_URLS = { production: 'https://api.ocrolus.com' };
const API_ISSUER_URLS = { production: 'https://auth.ocrolus.com' };

const OCROLUS_API = OCROLUS_API_URLS[ENV];
const auth_issuer = API_ISSUER_URLS[ENV];

const DOCUMENT_READY = 'document.verification_succeeded';
const DOCUMENT_CLASSIFIED = 'document.classification_succeeded';
const WIDGET_BOOK_TYPE = 'WIDGET';

const OCROLUS_IP_ALLOWLIST = [
    '18.205.30.63',
    '18.208.79.114',
    '18.213.224.210',
    '18.233.250.22',
    '35.173.140.133',
    '35.174.183.80',
    '54.164.238.206',
];

const api_issuer = bent(auth_issuer, 'POST', 'json', 200);
const ocrolusBent = (method, token) =>
    bent(`${OCROLUS_API}`, method, 'json', { authorization: `Bearer ${token}` });
const downloadOcrolus = (method, token) =>
    bent(`${OCROLUS_API}`, method, 'buffer', { authorization: `Bearer ${token}` });

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

// Function to append webhook logs to blob storage
const appendWebhookLog = async (context, entry) => {
    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
        
        if (!connectionString) {
            context.log.warn('AZURE_STORAGE_CONNECTION_STRING not configured');
            return;
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Ensure container exists
        await containerClient.createIfNotExists();
        
        const logBlobName = 'webhook-logs.json';
        const blockBlobClient = containerClient.getBlockBlobClient(logBlobName);
        
        let logs = [];
        
        // Try to download existing logs
        try {
            const downloadResponse = await blockBlobClient.download();
            const content = await streamToString(downloadResponse.readableStreamBody);
            logs = JSON.parse(content);
        } catch (err) {
            // File doesn't exist yet, start with empty array
            context.log('No existing log file found, creating new one');
        }
        
        // Add new log entry
        logs.push({ 
            timestamp: new Date().toISOString(), 
            ...entry 
        });
        
        // Keep only last 1000 entries
        if (logs.length > 1000) {
            logs = logs.slice(-1000);
        }
        
        // Upload updated logs
        await blockBlobClient.upload(JSON.stringify(logs, null, 2), JSON.stringify(logs, null, 2).length, {
            overwrite: true
        });
        
        context.log('Webhook log updated successfully');
    } catch (err) {
        context.log.error('Error updating webhook log:', err);
    }
};

module.exports = async function (context, req) {
    context.log('Webhook handler function processed a request.');

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const sender = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    const webhookData = req.body;
    const event = webhookData.event_name;

    context.log('📩 Webhook received from', sender, 'event:', event);
    context.log('Webhook data:', webhookData);

    // IP allowlist check
    if (!OCROLUS_IP_ALLOWLIST.includes(sender)) {
        context.log('❌ Ignored sender: not in IP allowlist:', sender);
        await appendWebhookLog(context, {
            event, 
            status: 'rejected', 
            reason: 'ip_not_allowlisted',
            sender_ip: sender
        });
        context.res = { status: 401, body: "Unauthorized", headers: corsHeaders };
        return;
    }

    // Only handle ready/classified events
    if (![DOCUMENT_READY, DOCUMENT_CLASSIFIED].includes(event)) {
        context.log('⚠️ Event ignored:', event);
        await appendWebhookLog(context, {
            event, 
            status: 'ignored', 
            reason: 'unsupported_event'
        });
        context.res = { 
            status: 200, 
            body: { message: 'Unhandled event' }, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
        return;
    }

    try {
        // Get Ocrolus API token
        const tokenResp = await api_issuer('/oauth/token', {
            client_id: process.env.OCROLUS_API_CLIENT_ID,
            client_secret: process.env.OCROLUS_API_CLIENT_SECRET,
            grant_type: 'client_credentials',
        });
        const accessToken = tokenResp.access_token;

        // Fetch book info
        const getBookInfo = ocrolusBent('GET', accessToken);
        const bookResp = await getBookInfo(`/v1/book/info?book_uuid=${webhookData.book_uuid}`);
        const bookData = bookResp.response;

        if (bookData.book_type !== WIDGET_BOOK_TYPE) {
            context.log('📦 Skipped non-widget book');
            await appendWebhookLog(context, {
                event,
                book_uuid: webhookData.book_uuid,
                book_name: bookData.name || '',
                status: 'ignored',
                reason: 'non_widget_book'
            });
            context.res = { 
                status: 200, 
                body: { message: 'Ignored non-widget book' }, 
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            };
            return;
        }

        // Download document from Ocrolus
        const downloadFile = downloadOcrolus('GET', accessToken);
        const docBuffer = await downloadFile(`/v2/document/download?doc_uuid=${webhookData.doc_uuid}`);

        // Upload to Azure Blob Storage
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
        
        if (!connectionString) {
            throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Ensure container exists
        await containerClient.createIfNotExists();
        
        const blobName = `${webhookData.doc_uuid}.pdf`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        await blockBlobClient.upload(docBuffer, docBuffer.length, {
            overwrite: true,
            metadata: {
                bookUuid: webhookData.book_uuid,
                bookName: bookData.name || '',
                docUuid: webhookData.doc_uuid,
                docName: webhookData.doc_name || '',
                ownerEmail: bookData.owner_email || '',
                uploadedAt: new Date().toISOString(),
                event: event
            }
        });

        context.log(`✅ Document uploaded to blob storage: ${blobName}`);

        // Log success
        await appendWebhookLog(context, {
            event,
            book_uuid: webhookData.book_uuid,
            book_name: bookData.name || '',
            doc_uuid: webhookData.doc_uuid,
            doc_name: webhookData.doc_name || '',
            owner_email: bookData.owner_email || '',
            blob_name: blobName,
            file_size: docBuffer.length,
            status: 'success'
        });

        context.res = { 
            status: 200, 
            body: { 
                message: 'Document downloaded and stored successfully',
                blobName: blobName,
                fileSize: docBuffer.length
            }, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };

    } catch (err) {
        context.log.error('❌ Handler error:', err);
        await appendWebhookLog(context, {
            event,
            book_uuid: webhookData.book_uuid,
            doc_uuid: webhookData.doc_uuid,
            error: err.message || 'unknown_error',
            status: 'failed'
        });
        context.res = { 
            status: 500, 
            body: { error: 'Processing failed', details: err.message }, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        };
    }
};