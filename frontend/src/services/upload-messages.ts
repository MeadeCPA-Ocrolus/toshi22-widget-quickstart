/**
 * Plain-language messages for the upload screen.
 *
 * The API sends its own error text. Messages a staff member can act on are shown
 * as they are. Anything else (internal checks, server errors) becomes one generic
 * line, so the screen never shows technical wording.
 *
 * @module services/upload-messages
 */

export const GENERIC_FAILURE = 'Upload failed. Try again.';
export const SESSION_PROBLEM = 'You are not signed in or not allowed to upload. Reload the page and try again.';
export const NETWORK_PROBLEM = 'Network problem. Check your connection and try again.';

/** API messages that are safe and useful to show exactly as sent (matched by start of text). */
const SHOWN_AS_SENT = [
    'File type not allowed',
    'File is too large',
    'The file contents do not match',
    'The uploaded file is empty',
    'The uploaded file does not match its checksum',
    'The upload link may have expired',
    'taxYear',
    'Client not found',
];

export function friendlyMessage(status: number | undefined, apiMessage: string | undefined): string {
    if (status === 401 || status === 403) return SESSION_PROBLEM;
    if (status !== undefined && status >= 500) return GENERIC_FAILURE;
    if (!apiMessage) return GENERIC_FAILURE;
    return SHOWN_AS_SENT.some((start) => apiMessage.startsWith(start)) ? apiMessage : GENERIC_FAILURE;
}

/** First 8 characters of the reference id the API returns with server errors. */
export function shortReference(correlationId: string | undefined | null): string | undefined {
    return correlationId ? correlationId.slice(0, 8) : undefined;
}

const files = (n: number) => (n === 1 ? '1 file' : `${n} files`);

/** Banner text for failed and duplicate lines, e.g. "2 failed, 1 already uploaded". */
export function summarizeProblems(failed: number, duplicates: number): string {
    if (failed > 0 && duplicates > 0) return `${failed} failed, ${duplicates} already uploaded`;
    if (failed > 0) return `${files(failed)} failed`;
    return `${files(duplicates)} already uploaded`;
}

/** Banner text when everything on screen succeeded, e.g. "3 files uploaded". */
export function summarizeSuccess(done: number): string {
    return `${files(done)} uploaded`;
}
