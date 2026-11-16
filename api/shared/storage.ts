/**
 * Blob storage utility — SAS URL generation and path building
 *
 * Blob layout: clients/{client_uuid}/{taxYear}/{docId}-{filename}
 * One folder per client, subfolder per tax year, unique doc ID prefix so
 * files never collide even with duplicate filenames.
 *
 * client_uuid is used here deliberately, never client_id — this is exactly
 * the kind of externally-facing, durable path the UUID exists for.
 *
 * @module shared/storage
 */

import {
    BlobServiceClient,
    StorageSharedKeyCredential,
    generateBlobSASQueryParameters,
    BlobSASPermissions,
    SASProtocol,
} from '@azure/storage-blob';

const CONTAINER_NAME = 'documents';
const SAS_EXPIRY_MINUTES = 15;

let blobServiceClient: BlobServiceClient | null = null;
let sharedKeyCredential: StorageSharedKeyCredential | null = null;

/**
 * Parses AZURE_STORAGE_CONNECTION_STRING into account name/key and returns
 * a singleton BlobServiceClient + credential pair.
 */
function getBlobClients(): { client: BlobServiceClient; credential: StorageSharedKeyCredential } {
    if (blobServiceClient && sharedKeyCredential) {
        return { client: blobServiceClient, credential: sharedKeyCredential };
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('AZURE_STORAGE_CONNECTION_STRING app setting is not configured');
    }

    const accountNameMatch = connectionString.match(/AccountName=([^;]+)/i);
    const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/i);

    if (!accountNameMatch || !accountKeyMatch) {
        throw new Error('AZURE_STORAGE_CONNECTION_STRING is malformed — missing AccountName/AccountKey');
    }

    sharedKeyCredential = new StorageSharedKeyCredential(accountNameMatch[1], accountKeyMatch[1]);
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    return { client: blobServiceClient, credential: sharedKeyCredential };
}

/**
 * Builds the blob path for a document. client_uuid only — never client_id.
 */
export function buildBlobPath(clientUuid: string, taxYear: number, docId: string, filename: string): string {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `clients/${clientUuid}/${taxYear}/${docId}-${safeFilename}`;
}

/**
 * Generates a short-lived, write-only SAS URL for a single blob path.
 * The browser uploads directly to this URL, bypassing the API entirely —
 * that's what avoids the size bottleneck of proxying the file through a Function.
 */
export async function generateUploadSasUrl(blobPath: string): Promise<{ sasUrl: string; expiresAt: Date }> {
    const { client, credential } = getBlobClients();
    const containerClient = client.getContainerClient(CONTAINER_NAME);

    const expiresAt = new Date(Date.now() + SAS_EXPIRY_MINUTES * 60 * 1000);

    const sasOptions = {
        containerName: CONTAINER_NAME,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('cw'), // create + write only — no read, no delete
        protocol: SASProtocol.Https,
        startsOn: new Date(Date.now() - 5 * 60 * 1000), // 5 min clock-skew buffer
        expiresOn: expiresAt,
    };

    const sasToken = generateBlobSASQueryParameters(sasOptions, credential).toString();
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    const sasUrl = `${blockBlobClient.url}?${sasToken}`;

    return { sasUrl, expiresAt };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

/**
 * Reads the first few bytes of a stored blob so the API can check the real
 * file type (magic bytes) instead of trusting the file name.
 */
export async function readBlobHead(blobPath: string, bytes = 16): Promise<Buffer> {
    const { client } = getBlobClients();
    const blockBlobClient = client.getContainerClient(CONTAINER_NAME).getBlockBlobClient(blobPath);
    const response = await blockBlobClient.download(0, bytes);
    if (!response.readableStreamBody) return Buffer.alloc(0);
    return streamToBuffer(response.readableStreamBody);
}

/**
 * Computes the SHA-256 of a stored blob by streaming it, so the API never
 * trusts a hash supplied by the browser.
 */
export async function computeBlobSha256(blobPath: string): Promise<string> {
    const { createHash } = await import('crypto');
    const { client } = getBlobClients();
    const blockBlobClient = client.getContainerClient(CONTAINER_NAME).getBlockBlobClient(blobPath);
    const response = await blockBlobClient.download();
    if (!response.readableStreamBody) throw new Error('Blob has no content');
    const hash = createHash('sha256');
    for await (const chunk of response.readableStreamBody) {
        hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return hash.digest('hex');
}

/** Deletes a rejected upload so bad files do not stay in storage. */
export async function deleteBlob(blobPath: string): Promise<void> {
    const { client } = getBlobClients();
    await client.getContainerClient(CONTAINER_NAME).getBlockBlobClient(blobPath).deleteIfExists();
}

/**
 * Confirms a blob actually exists and returns its size — called after the
 * browser reports the upload is done, so we don't trust the client's word
 * for it when writing the documents row.
 */
export async function verifyBlobExists(blobPath: string): Promise<{ exists: boolean; sizeBytes?: number }> {
    const { client } = getBlobClients();
    const containerClient = client.getContainerClient(CONTAINER_NAME);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    const exists = await blockBlobClient.exists();
    if (!exists) {
        return { exists: false };
    }

    const properties = await blockBlobClient.getProperties();
    return { exists: true, sizeBytes: properties.contentLength };
}