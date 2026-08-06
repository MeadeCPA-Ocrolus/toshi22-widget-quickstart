"use strict";
/**
 * Upload URL Endpoint
 *
 * POST /api/upload-url - Get a short-lived, write-only SAS URL for uploading
 * a single document directly to Blob Storage.
 *
 * Flow this supports (step 1 of 3):
 *   1. Browser calls this endpoint with { clientUuid, taxYear, filename } <- here
 *   2. Browser uploads the file directly to Blob using the returned SAS URL
 *   3. Browser calls POST /api/documents to confirm the upload and save the record
 *
 * @module upload-url
 */
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const auth_1 = require("../shared/auth");
const storage_1 = require("../shared/storage");
const tax_year_1 = require("../shared/tax-year");
const database_1 = require("../shared/database");
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-principal',
};
const httpTrigger = async function (context, req) {
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
    // Second, independent auth lock — don't rely solely on the edge gate
    const principal = (0, auth_1.requireAuth)(context, req, corsHeaders);
    if (!principal)
        return;
    try {
        const body = req.body;
        if (!body?.clientUuid || !body?.filename) {
            context.res = {
                status: 400,
                body: { error: 'clientUuid and filename are required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Confirm the client_uuid actually exists before handing out a SAS URL for it
        const clientCheck = await (0, database_1.executeQuery)(`SELECT client_id FROM clients WHERE client_uuid = @clientUuid AND is_archived = 0`, { clientUuid: body.clientUuid });
        if (clientCheck.recordset.length === 0) {
            context.res = {
                status: 404,
                body: { error: 'Client not found' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        const taxYear = body.taxYear || (0, tax_year_1.getDefaultTaxYear)();
        const docId = (0, crypto_1.randomUUID)();
        const blobPath = (0, storage_1.buildBlobPath)(body.clientUuid, taxYear, docId, body.filename);
        const { sasUrl, expiresAt } = await (0, storage_1.generateUploadSasUrl)(blobPath);
        context.log(`Issued upload URL for client ${body.clientUuid}, doc ${docId}`);
        context.res = {
            status: 200,
            body: {
                docId,
                blobPath,
                sasUrl,
                expiresAt: expiresAt.toISOString(),
                taxYear,
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        context.log.error(`Failed to generate upload URL: ${errorMessage}`);
        context.res = {
            status: 500,
            body: { error: 'Failed to generate upload URL' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map