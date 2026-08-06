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
import { AzureFunction } from '@azure/functions';
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map