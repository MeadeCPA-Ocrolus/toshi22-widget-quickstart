/**
 * API Service for Document Uploads
 * @module services/documents-api
 */

import { friendlyMessage, GENERIC_FAILURE, NETWORK_PROBLEM } from './upload-messages';

const API_BASE_URL = '/api';

/** An upload failure with a message that is safe to show on screen. */
export class UploadError extends Error {
    status?: number;
    /** Reference id the API returns with server errors (the screen shows its first 8 characters) */
    correlationId?: string;

    constructor(message: string, opts: { status?: number; correlationId?: string } = {}) {
        super(message);
        this.name = 'UploadError';
        this.status = opts.status;
        this.correlationId = opts.correlationId;
        Object.setPrototypeOf(this, UploadError.prototype);
    }
}

/** Fetch that turns a network failure into a readable UploadError. */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch {
        throw new UploadError(NETWORK_PROBLEM);
    }
}

/** Builds an UploadError from a failed API response, using plain-language wording. */
async function errorFromResponse(response: Response): Promise<UploadError> {
    const body = await response.json().catch(() => ({} as { error?: string; correlationId?: string }));
    return new UploadError(friendlyMessage(response.status, body?.error), {
        status: response.status,
        correlationId: body?.correlationId,
    });
}

export interface DocumentRecord {
    doc_id: string;
    client_uuid: string;
    tax_year: number;
    blob_path: string;
    filename: string;
    file_size: number;
    sha256_hash: string;
    uploaded_by: string;
    uploaded_at: string;
    /** Other tax years in which this client has the same file (same checksum), oldest first */
    also_in_years?: number[];
}

export interface UploadResult {
    docId: string;
    filename: string;
    duplicate: boolean;
    /** For a duplicate: the name and upload time of the file that is already saved */
    existingFilename?: string;
    existingUploadedAt?: string;
    /** The same file is already filed under a different tax year (it was still saved) */
    sameFileInOtherYear?: { taxYear: number; filename: string; uploadedAt: string };
}

export interface UploadFailure {
    filename: string;
    /** Plain-language reason, safe to show on screen */
    error: string;
    correlationId?: string;
    status?: number;
}

/**
 * Computes the SHA-256 hash of a file client-side, using the browser's
 * built-in SubtleCrypto — no extra dependency needed.
 */
async function computeSha256(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Uploads a single file for a client, following the 3-step flow:
 *   1. Request a short-lived SAS URL from the API
 *   2. Upload the file directly to Blob Storage (bypasses the API — no size bottleneck)
 *   3. Tell the API the upload is done so it can save the record
 *
 * clientUuid is required — never pass the internal client_id here.
 */
export async function uploadDocument(
    clientUuid: string,
    file: File,
    taxYear: number
): Promise<UploadResult> {
    // Step 1: get the SAS URL
    const urlResponse = await safeFetch(`${API_BASE_URL}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientUuid, filename: file.name, taxYear, fileSize: file.size }),
    });

    if (!urlResponse.ok) {
        throw await errorFromResponse(urlResponse);
    }

    const { docId, blobPath, sasUrl, taxYear: resolvedTaxYear } = await urlResponse.json();

    // Step 2: upload directly to Blob Storage
    const blobResponse = await safeFetch(sasUrl, {
        method: 'PUT',
        headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
    });

    if (!blobResponse.ok) {
        throw new UploadError(
            blobResponse.status === 403
                ? 'Upload to storage failed (403). The upload link may have expired. Try again.'
                : `Upload to storage failed (${blobResponse.status}). Try again.`,
            { status: blobResponse.status }
        );
    }

    // Step 3: confirm with the API, including the file hash for duplicate detection
    const sha256Hash = await computeSha256(file);

    const confirmResponse = await safeFetch(`${API_BASE_URL}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            docId,
            clientUuid,
            blobPath,
            filename: file.name,
            sha256Hash,
            taxYear: resolvedTaxYear,
        }),
    });

    if (!confirmResponse.ok) {
        throw await errorFromResponse(confirmResponse);
    }

    const result = await confirmResponse.json();

    return {
        docId: result.duplicate ? result.existingDoc.doc_id : docId,
        filename: file.name,
        duplicate: !!result.duplicate,
        existingFilename: result.duplicate ? result.existingDoc?.filename : undefined,
        existingUploadedAt: result.duplicate ? result.existingDoc?.uploaded_at : undefined,
        sameFileInOtherYear: result.sameFileInOtherYear,
    };
}

/**
 * Uploads multiple files one after another. A failure on one file never stops
 * the rest. `onFileDone` is called as soon as each file finishes, so the screen
 * can update its line and its "Uploading 2 of 5" count right away.
 */
export async function uploadDocuments(
    clientUuid: string,
    files: File[],
    taxYear: number,
    onFileDone?: (index: number, result: UploadResult | UploadFailure) => void
): Promise<Array<UploadResult | UploadFailure>> {
    const results: Array<UploadResult | UploadFailure> = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let result: UploadResult | UploadFailure;
        try {
            result = await uploadDocument(clientUuid, file, taxYear);
        } catch (err) {
            result =
                err instanceof UploadError
                    ? { filename: file.name, error: err.message, correlationId: err.correlationId, status: err.status }
                    : { filename: file.name, error: GENERIC_FAILURE };
        }
        results.push(result);
        onFileDone?.(i, result);
    }

    return results;
}

/**
 * Lists documents for a client, optionally narrowed to one tax year.
 */
export async function getDocuments(clientUuid: string, taxYear?: number): Promise<DocumentRecord[]> {
    const params = new URLSearchParams({ clientUuid });
    if (taxYear) params.set('taxYear', String(taxYear));

    const response = await fetch(`${API_BASE_URL}/documents?${params.toString()}`);

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to load documents (${response.status})`);
    }

    const data = await response.json();
    return data.documents;
}