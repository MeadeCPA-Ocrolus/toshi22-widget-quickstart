"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBlobPath = buildBlobPath;
exports.generateUploadSasUrl = generateUploadSasUrl;
exports.verifyBlobExists = verifyBlobExists;
const storage_blob_1 = require("@azure/storage-blob");
const CONTAINER_NAME = 'documents';
const SAS_EXPIRY_MINUTES = 15;
let blobServiceClient = null;
let sharedKeyCredential = null;
/**
 * Parses AZURE_STORAGE_CONNECTION_STRING into account name/key and returns
 * a singleton BlobServiceClient + credential pair.
 */
function getBlobClients() {
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
    sharedKeyCredential = new storage_blob_1.StorageSharedKeyCredential(accountNameMatch[1], accountKeyMatch[1]);
    blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
    return { client: blobServiceClient, credential: sharedKeyCredential };
}
/**
 * Builds the blob path for a document. client_uuid only — never client_id.
 */
function buildBlobPath(clientUuid, taxYear, docId, filename) {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `clients/${clientUuid}/${taxYear}/${docId}-${safeFilename}`;
}
/**
 * Generates a short-lived, write-only SAS URL for a single blob path.
 * The browser uploads directly to this URL, bypassing the API entirely —
 * that's what avoids the size bottleneck of proxying the file through a Function.
 */
async function generateUploadSasUrl(blobPath) {
    const { client, credential } = getBlobClients();
    const containerClient = client.getContainerClient(CONTAINER_NAME);
    const expiresAt = new Date(Date.now() + SAS_EXPIRY_MINUTES * 60 * 1000);
    const sasOptions = {
        containerName: CONTAINER_NAME,
        blobName: blobPath,
        permissions: storage_blob_1.BlobSASPermissions.parse('cw'), // create + write only — no read, no delete
        protocol: storage_blob_1.SASProtocol.Https,
        startsOn: new Date(Date.now() - 5 * 60 * 1000), // 5 min clock-skew buffer
        expiresOn: expiresAt,
    };
    const sasToken = (0, storage_blob_1.generateBlobSASQueryParameters)(sasOptions, credential).toString();
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    const sasUrl = `${blockBlobClient.url}?${sasToken}`;
    return { sasUrl, expiresAt };
}
/**
 * Confirms a blob actually exists and returns its size — called after the
 * browser reports the upload is done, so we don't trust the client's word
 * for it when writing the documents row.
 */
async function verifyBlobExists(blobPath) {
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
//# sourceMappingURL=storage.js.map