/**
 * Documents Endpoint
 *
 * POST /api/documents - Confirm a completed upload and save the record
 *                        (step 3 of 3, after the browser has uploaded
 *                        directly to Blob using a SAS URL from /api/upload-url)
 * GET  /api/documents?clientUuid=...&taxYear=... - List documents for a client/year
 * GET  /api/documents/:docId - Get a single document record
 *
 * No doc_type, review_status, or extracted fields yet — this is a plain
 * filing-cabinet index with an audit trail. Classification/extraction
 * bolts on later without changing this table.
 *
 * @module documents
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { requireAuth, getStaffIdentity, ClientPrincipal } from '../shared/auth';
import { verifyBlobExists } from '../shared/storage';
import { getDefaultTaxYear } from '../shared/tax-year';
import { executeQuery } from '../shared/database';

const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-principal',
};

interface DocumentRecord {
    doc_id: string;
    client_uuid: string;
    tax_year: number;
    blob_path: string;
    filename: string;
    file_size: number;
    sha256_hash: string;
    uploaded_by: string;
    uploaded_at: string;
}

interface ConfirmUploadRequest {
    docId: string;
    clientUuid: string;
    blobPath: string;
    filename: string;
    sha256Hash: string;
    taxYear?: number;
}

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }

    const principal = requireAuth(context, req, corsHeaders);
    if (!principal) return;

    try {
        const docId = req.params?.docId;

        switch (req.method) {
            case 'GET':
                if (docId) {
                    await getDocument(context, docId);
                } else {
                    await listDocuments(context, req);
                }
                break;

            case 'POST':
                await confirmUpload(context, req.body, principal);
                break;

            default:
                context.res = {
                    status: 405,
                    body: { error: 'Method not allowed' },
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                };
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        context.log.error(`Documents endpoint error: ${errorMessage}`);
        context.res = {
            status: 500,
            body: { error: 'Internal server error' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }

    /**
     * POST /api/documents — confirm a completed upload and save the record.
     * Verifies the blob genuinely exists (doesn't trust the browser's word for it)
     * and checks for duplicates via SHA-256 hash before inserting.
     */
    async function confirmUpload(
        ctx: Context,
        body: ConfirmUploadRequest,
        principal: ClientPrincipal
    ): Promise<void> {
        if (!body?.docId || !body?.clientUuid || !body?.blobPath || !body?.filename || !body?.sha256Hash) {
            ctx.res = {
                status: 400,
                body: { error: 'docId, clientUuid, blobPath, filename, and sha256Hash are required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        const blob = await verifyBlobExists(body.blobPath);
        if (!blob.exists) {
            ctx.res = {
                status: 400,
                body: { error: 'Upload not found in storage — the SAS URL may have expired before the upload completed' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        const taxYear = body.taxYear || getDefaultTaxYear();

        // Duplicate check: same client, same tax year, same file content
        const existing = await executeQuery<DocumentRecord>(
            `SELECT doc_id, filename, uploaded_at FROM documents
             WHERE client_uuid = @clientUuid AND tax_year = @taxYear AND sha256_hash = @sha256Hash`,
            { clientUuid: body.clientUuid, taxYear, sha256Hash: body.sha256Hash }
        );

        if (existing.recordset.length > 0) {
            ctx.log(`Duplicate upload detected for client ${body.clientUuid}: matches ${existing.recordset[0].doc_id}`);
            ctx.res = {
                status: 200,
                body: {
                    duplicate: true,
                    existingDoc: existing.recordset[0],
                    message: 'This file was already uploaded for this client and tax year',
                },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        const staffIdentity = getStaffIdentity(principal);

        await executeQuery(
            `INSERT INTO documents (
                doc_id, client_uuid, tax_year, blob_path, filename,
                file_size, sha256_hash, uploaded_by
            )
            VALUES (
                @docId, @clientUuid, @taxYear, @blobPath, @filename,
                @fileSize, @sha256Hash, @uploadedBy
            )`,
            {
                docId: body.docId,
                clientUuid: body.clientUuid,
                taxYear,
                blobPath: body.blobPath,
                filename: body.filename,
                fileSize: blob.sizeBytes || 0,
                sha256Hash: body.sha256Hash,
                uploadedBy: staffIdentity,
            }
        );

        ctx.log(`Document ${body.docId} saved for client ${body.clientUuid} (uploaded by ${staffIdentity})`);

        ctx.res = {
            status: 201,
            body: { docId: body.docId, message: 'Document recorded successfully' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }

    /**
     * GET /api/documents?clientUuid=...&taxYear=... — list documents.
     * clientUuid is required; taxYear optionally narrows to one filing year.
     */
    async function listDocuments(ctx: Context, request: HttpRequest): Promise<void> {
        const clientUuid = request.query?.clientUuid;
        const taxYear = request.query?.taxYear;

        if (!clientUuid) {
            ctx.res = {
                status: 400,
                body: { error: 'clientUuid query parameter is required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        let query = `
            SELECT doc_id, client_uuid, tax_year, blob_path, filename,
                   file_size, sha256_hash, uploaded_by, uploaded_at
            FROM documents
            WHERE client_uuid = @clientUuid`;

        const params: Record<string, any> = { clientUuid };

        if (taxYear) {
            query += ` AND tax_year = @taxYear`;
            params.taxYear = parseInt(taxYear, 10);
        }

        query += ` ORDER BY uploaded_at DESC`;

        const result = await executeQuery<DocumentRecord>(query, params);

        ctx.log(`Listed ${result.recordset.length} documents for client ${clientUuid}`);

        ctx.res = {
            status: 200,
            body: { documents: result.recordset },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }

    /**
     * GET /api/documents/:docId — single document record.
     */
    async function getDocument(ctx: Context, id: string): Promise<void> {
        const result = await executeQuery<DocumentRecord>(
            `SELECT doc_id, client_uuid, tax_year, blob_path, filename,
                    file_size, sha256_hash, uploaded_by, uploaded_at
             FROM documents
             WHERE doc_id = @docId`,
            { docId: id }
        );

        if (result.recordset.length === 0) {
            ctx.res = {
                status: 404,
                body: { error: 'Document not found' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        ctx.res = {
            status: 200,
            body: result.recordset[0],
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};

export default httpTrigger;