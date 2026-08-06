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
/**
 * Builds the blob path for a document. client_uuid only — never client_id.
 */
export declare function buildBlobPath(clientUuid: string, taxYear: number, docId: string, filename: string): string;
/**
 * Generates a short-lived, write-only SAS URL for a single blob path.
 * The browser uploads directly to this URL, bypassing the API entirely —
 * that's what avoids the size bottleneck of proxying the file through a Function.
 */
export declare function generateUploadSasUrl(blobPath: string): Promise<{
    sasUrl: string;
    expiresAt: Date;
}>;
/**
 * Confirms a blob actually exists and returns its size — called after the
 * browser reports the upload is done, so we don't trust the client's word
 * for it when writing the documents row.
 */
export declare function verifyBlobExists(blobPath: string): Promise<{
    exists: boolean;
    sizeBytes?: number;
}>;
//# sourceMappingURL=storage.d.ts.map