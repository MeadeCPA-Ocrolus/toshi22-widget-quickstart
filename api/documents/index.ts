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
import { verifyBlobExists, readBlobHead, computeBlobSha256, deleteBlob } from '../shared/storage';
import {
    isUuid, isSha256Hex, validateFilenameAndYear, cleanFilename, getExtension,
    expectedBlobPrefix, headMatchesExtension, getMaxBytes,
} from '../shared/upload-validation';
import { executeQuery } from '../shared/database';
import { allowOriginHeader, serverError } from '../shared/http';

const corsHeaders = {
    ...allowOriginHeader(),
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
    taxYear: number;
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
        // Generic message plus a reference number; the real error goes to the logs only
        serverError(context, 'documents endpoint failed', err, corsHeaders);
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

        const bad = (status: number, error: string) => {
            ctx.res = {
                status,
                body: { error },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
        };

        // ---- Shape checks (nothing touches storage or the database yet) ----
        if (!isUuid(body.docId) || !isUuid(body.clientUuid)) {
            return bad(400, 'docId and clientUuid must be valid ids');
        }
        if (!isSha256Hex(body.sha256Hash)) {
            return bad(400, 'sha256Hash must be a 64-character hex string');
        }
        const validation = validateFilenameAndYear(body.filename, body.taxYear);
        if (!validation.ok) {
            return bad(400, validation.error as string);
        }

        const taxYear = body.taxYear; // validated above: required whole year

        // The blob path must be exactly the one /api/upload-url issued for this
        // client, year and document. This stops someone confirming (and so
        // "claiming") a file that belongs to another client or path.
        if (typeof body.blobPath !== 'string' || !body.blobPath.startsWith(expectedBlobPrefix(body.clientUuid, taxYear, body.docId))) {
            return bad(400, 'blobPath does not match this upload');
        }

        const clientCheck = await executeQuery<{ client_id: number }>(
            `SELECT client_id FROM clients WHERE client_uuid = @clientUuid AND is_archived = 0`,
            { clientUuid: body.clientUuid }
        );
        if (clientCheck.recordset.length === 0) {
            return bad(404, 'Client not found');
        }

        const alreadySaved = await executeQuery<{ doc_id: string }>(
            `SELECT doc_id FROM documents WHERE doc_id = @docId`,
            { docId: body.docId }
        );
        if (alreadySaved.recordset.length > 0) {
            return bad(409, 'This upload was already confirmed');
        }

        // ---- Storage checks: the browser uploaded directly, so inspect what actually arrived ----
        const blob = await verifyBlobExists(body.blobPath);
        if (!blob.exists) {
            return bad(400, 'The upload link may have expired. Please try again.');
        }

        const maxBytes = getMaxBytes();
        const rejectAndDelete = async (status: number, error: string, reason: string) => {
            await deleteBlob(body.blobPath);
            ctx.log.warn(`Rejected upload ${body.docId} (${reason}); blob deleted`);
            return bad(status, error);
        };

        if (!blob.sizeBytes || blob.sizeBytes <= 0) {
            return rejectAndDelete(400, 'The uploaded file is empty', 'empty');
        }
        if (blob.sizeBytes > maxBytes) {
            return rejectAndDelete(413, `File is too large. The limit is ${Math.floor(maxBytes / (1024 * 1024))} MB`, 'too_large');
        }

        const ext = getExtension(cleanFilename(body.filename));
        const head = await readBlobHead(body.blobPath, 16);
        if (!headMatchesExtension(head, ext)) {
            return rejectAndDelete(400, `The file contents do not match a .${ext} file`, 'content_mismatch');
        }

        const actualHash = await computeBlobSha256(body.blobPath);
        if (actualHash.toLowerCase() !== body.sha256Hash.toLowerCase()) {
            return rejectAndDelete(400, 'The uploaded file does not match its checksum. Please upload it again', 'hash_mismatch');
        }

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

        // Same file already filed under a different tax year: still saved, but staff are told
        const otherYear = await executeQuery<DocumentRecord>(
            `SELECT TOP 1 tax_year, filename, uploaded_at FROM documents
             WHERE client_uuid = @clientUuid AND tax_year <> @taxYear AND sha256_hash = @sha256Hash
             ORDER BY uploaded_at DESC`,
            { clientUuid: body.clientUuid, taxYear, sha256Hash: body.sha256Hash }
        );
        const sameFileInOtherYear = otherYear.recordset[0]
            ? {
                  taxYear: otherYear.recordset[0].tax_year,
                  filename: otherYear.recordset[0].filename,
                  uploadedAt: otherYear.recordset[0].uploaded_at,
              }
            : undefined;

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
                filename: cleanFilename(body.filename),
                fileSize: blob.sizeBytes || 0,
                sha256Hash: body.sha256Hash,
                uploadedBy: staffIdentity,
            }
        );

        ctx.log(`Document ${body.docId} saved for client ${body.clientUuid}`);

        ctx.res = {
            status: 201,
            body: { docId: body.docId, message: 'Document recorded successfully', sameFileInOtherYear },
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

        if (!clientUuid || !isUuid(clientUuid)) {
            ctx.res = {
                status: 400,
                body: { error: 'A valid clientUuid query parameter is required' },
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
            if (!Number.isInteger(params.taxYear)) {
                ctx.res = {
                    status: 400,
                    body: { error: 'taxYear must be a whole number' },
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                };
                return;
            }
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
        if (!isUuid(id)) {
            ctx.res = {
                status: 400,
                body: { error: 'docId must be a valid id' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
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