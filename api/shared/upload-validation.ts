/**
 * Upload validation (factory item F-16)
 *
 * Pure functions, no I/O, so they are easy to unit test. The upload flow is:
 *   1. /api/upload-url   validates the request, then hands out a write-only SAS URL
 *   2. browser           uploads straight to Blob Storage (the API never sees the file)
 *   3. /api/documents    re-validates, then inspects the stored blob before saving a record
 *
 * Because the browser talks to storage directly, step 3 is where size, content
 * and hash are actually enforced. A bad blob is deleted and the request refused.
 *
 * Settings (all optional):
 *   UPLOAD_MAX_BYTES            default 52428800 (50 MB)
 *   UPLOAD_ALLOWED_EXTENSIONS   comma-separated, default below
 *
 * @module shared/upload-validation
 */

export const DEFAULT_ALLOWED_EXTENSIONS = [
    'pdf', 'png', 'jpg', 'jpeg', 'heic', 'tif', 'tiff', 'csv', 'txt', 'doc', 'docx', 'xls', 'xlsx',
];

export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 200;

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RX = /^[0-9a-f]{64}$/i;

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RX.test(value);
}

export function isSha256Hex(value: unknown): value is string {
    return typeof value === 'string' && SHA256_RX.test(value);
}

export function getMaxBytes(): number {
    const configured = parseInt(process.env.UPLOAD_MAX_BYTES || '', 10);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

export function getAllowedExtensions(): string[] {
    const configured = (process.env.UPLOAD_ALLOWED_EXTENSIONS || '')
        .split(',')
        .map(e => e.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean);
    return configured.length > 0 ? configured : DEFAULT_ALLOWED_EXTENSIONS;
}

export function getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    return idx > 0 && idx < filename.length - 1 ? filename.slice(idx + 1).toLowerCase() : '';
}

/**
 * Cleans a user-supplied filename for storing in the database:
 * strips path parts and control characters, collapses whitespace, caps the length.
 */
export function cleanFilename(raw: string): string {
    const base = raw.split(/[\\/]/).pop() || '';
    // eslint-disable-next-line no-control-regex
    const stripped = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (stripped.length <= MAX_FILENAME_LENGTH) return stripped;
    const ext = getExtension(stripped);
    const keep = MAX_FILENAME_LENGTH - (ext ? ext.length + 1 : 0);
    return ext ? `${stripped.slice(0, keep)}.${ext}` : stripped.slice(0, MAX_FILENAME_LENGTH);
}

export interface ValidationResult {
    ok: boolean;
    error?: string;
}

/** Validates the file name and tax year sent to /api/upload-url or /api/documents. */
export function validateFilenameAndYear(filename: unknown, taxYear: unknown, now: Date = new Date()): ValidationResult {
    if (typeof filename !== 'string' || filename.trim().length === 0) {
        return { ok: false, error: 'filename is required' };
    }
    const cleaned = cleanFilename(filename);
    if (!cleaned) {
        return { ok: false, error: 'filename is not valid' };
    }
    const ext = getExtension(cleaned);
    const allowed = getAllowedExtensions();
    if (!ext || !allowed.includes(ext)) {
        return { ok: false, error: `File type not allowed. Allowed types: ${allowed.join(', ')}` };
    }
    if (taxYear !== undefined && taxYear !== null) {
        const maxYear = now.getFullYear() + 1;
        if (typeof taxYear !== 'number' || !Number.isInteger(taxYear) || taxYear < 2000 || taxYear > maxYear) {
            return { ok: false, error: `taxYear must be a whole year between 2000 and ${maxYear}` };
        }
    }
    return { ok: true };
}

/** The only blob path a given upload is allowed to use. Matches buildBlobPath() in storage.ts. */
export function expectedBlobPrefix(clientUuid: string, taxYear: number, docId: string): string {
    return `clients/${clientUuid}/${taxYear}/${docId}-`;
}

/**
 * Checks the first bytes of a stored file against its extension ("magic bytes").
 * This stops, for example, an .exe renamed to .pdf. Text-like types are checked
 * for NUL bytes, which real CSV/TXT files do not contain.
 */
export function headMatchesExtension(head: Buffer, ext: string): boolean {
    if (head.length === 0) return false;
    const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);

    switch (ext) {
        case 'pdf':
            return starts(0x25, 0x50, 0x44, 0x46); // %PDF
        case 'png':
            return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
        case 'jpg':
        case 'jpeg':
            return starts(0xff, 0xd8, 0xff);
        case 'tif':
        case 'tiff':
            return starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a);
        case 'heic':
            // ISO base media file: bytes 4-7 are "ftyp"
            return head.length >= 12 && head.subarray(4, 8).toString('ascii') === 'ftyp';
        case 'docx':
        case 'xlsx':
            return starts(0x50, 0x4b, 0x03, 0x04); // ZIP container
        case 'doc':
        case 'xls':
            return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1); // OLE2
        case 'csv':
        case 'txt':
            return !head.includes(0x00);
        default:
            return false;
    }
}
