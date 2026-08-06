/**
 * API Service for Document Uploads
 * @module services/documents-api
 */

const API_BASE_URL = '/api';

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
}

export interface UploadResult {
    docId: string;
    filename: string;
    duplicate: boolean;
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
    taxYear?: number
): Promise<UploadResult> {
    // Step 1: get the SAS URL
    const urlResponse = await fetch(`${API_BASE_URL}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientUuid, filename: file.name, taxYear }),
    });

    if (!urlResponse.ok) {
        const err = await urlResponse.json().catch(() => ({}));
        throw new Error(err.error || `Failed to get upload URL (${urlResponse.status})`);
    }

    const { docId, blobPath, sasUrl, taxYear: resolvedTaxYear } = await urlResponse.json();

    // Step 2: upload directly to Blob Storage
    const blobResponse = await fetch(sasUrl, {
        method: 'PUT',
        headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
    });

    if (!blobResponse.ok) {
        throw new Error(`Upload to storage failed (${blobResponse.status})`);
    }

    // Step 3: confirm with the API, including the file hash for duplicate detection
    const sha256Hash = await computeSha256(file);

    const confirmResponse = await fetch(`${API_BASE_URL}/documents`, {
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
        const err = await confirmResponse.json().catch(() => ({}));
        throw new Error(err.error || `Failed to save document record (${confirmResponse.status})`);
    }

    const result = await confirmResponse.json();

    return {
        docId: result.duplicate ? result.existingDoc.doc_id : docId,
        filename: file.name,
        duplicate: !!result.duplicate,
    };
}

/**
 * Uploads multiple files sequentially, returning results (and any per-file
 * errors) so the UI can show a per-file status instead of failing the whole batch.
 */
export async function uploadDocuments(
    clientUuid: string,
    files: File[],
    taxYear?: number
): Promise<Array<UploadResult | { filename: string; error: string }>> {
    const results: Array<UploadResult | { filename: string; error: string }> = [];

    for (const file of files) {
        try {
            const result = await uploadDocument(clientUuid, file, taxYear);
            results.push(result);
        } catch (err) {
            results.push({
                filename: file.name,
                error: err instanceof Error ? err.message : String(err),
            });
        }
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