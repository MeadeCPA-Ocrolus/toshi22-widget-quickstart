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
import { AzureFunction } from '@azure/functions';
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map