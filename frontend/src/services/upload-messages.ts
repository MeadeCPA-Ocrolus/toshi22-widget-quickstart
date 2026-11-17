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

/**
 * Banner text with one count per outcome, left out when zero,
 * e.g. "6 uploaded, 5 failed, 13 duplicates".
 */
export function summarizeOutcome(uploaded: number, failed: number, duplicates: number): string {
    const parts: string[] = [];
    if (uploaded > 0) parts.push(`${uploaded} uploaded`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (duplicates > 0) parts.push(duplicates === 1 ? '1 duplicate' : `${duplicates} duplicates`);
    return parts.join(', ');
}

/** Small label on a Documents list row, e.g. "also in 2022" or "also in 2022, 2023". Empty when none. */
export function alsoInLabel(years: number[] | undefined): string {
    return years && years.length > 0 ? `also in ${years.join(', ')}` : '';
}
