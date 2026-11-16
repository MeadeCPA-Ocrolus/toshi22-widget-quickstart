import {
    isUuid, isSha256Hex, cleanFilename, validateFilenameAndYear,
    headMatchesExtension, expectedBlobPrefix, getMaxBytes,
} from '../shared/upload-validation';

describe('ids and hashes', () => {
    it('accepts real uuids and sha256, rejects junk', () => {
        expect(isUuid('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')).toBe(true);
        expect(isUuid('../../etc/passwd')).toBe(false);
        expect(isSha256Hex('a'.repeat(64))).toBe(true);
        expect(isSha256Hex('a'.repeat(63))).toBe(false);
    });
});

describe('cleanFilename', () => {
    it('removes path parts and control characters', () => {
        expect(cleanFilename('..\\..\\Windows\\evil.pdf')).toBe('evil.pdf');
        expect(cleanFilename('a/b/c\u0000.pdf')).toBe('c.pdf');
    });
    it('caps long names but keeps the extension', () => {
        const out = cleanFilename('x'.repeat(500) + '.pdf');
        expect(out.length).toBeLessThanOrEqual(200);
        expect(out.endsWith('.pdf')).toBe(true);
    });
});

describe('validateFilenameAndYear', () => {
    const now = new Date('2026-11-16');
    it('allows normal documents', () => {
        expect(validateFilenameAndYear('2025 W-2.PDF', 2025, now).ok).toBe(true);
        expect(validateFilenameAndYear('statement.xlsx', undefined, now).ok).toBe(true);
    });
    it('rejects executables, double extensions that end badly, and no extension', () => {
        expect(validateFilenameAndYear('setup.exe', 2025, now).ok).toBe(false);
        expect(validateFilenameAndYear('invoice.pdf.exe', 2025, now).ok).toBe(false);
        expect(validateFilenameAndYear('README', 2025, now).ok).toBe(false);
        expect(validateFilenameAndYear('page.html', 2025, now).ok).toBe(false);
        expect(validateFilenameAndYear('image.svg', 2025, now).ok).toBe(false);
    });
    it('rejects bad tax years', () => {
        expect(validateFilenameAndYear('a.pdf', 1999, now).ok).toBe(false);
        expect(validateFilenameAndYear('a.pdf', 2028, now).ok).toBe(false);
        expect(validateFilenameAndYear('a.pdf', '2025', now).ok).toBe(false);
        expect(validateFilenameAndYear('a.pdf', 2025.5, now).ok).toBe(false);
    });
    it('rejects missing filenames', () => {
        expect(validateFilenameAndYear('', 2025, now).ok).toBe(false);
        expect(validateFilenameAndYear(undefined, 2025, now).ok).toBe(false);
    });
});

describe('headMatchesExtension', () => {
    it('recognises real files', () => {
        expect(headMatchesExtension(Buffer.from('%PDF-1.7 ...'), 'pdf')).toBe(true);
        expect(headMatchesExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png')).toBe(true);
        expect(headMatchesExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'jpg')).toBe(true);
        expect(headMatchesExtension(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'xlsx')).toBe(true);
        expect(headMatchesExtension(Buffer.from('a,b,c\n1,2,3\n'), 'csv')).toBe(true);
    });
    it('rejects a program renamed to a document', () => {
        expect(headMatchesExtension(Buffer.from('MZ\x90\x00\x03'), 'pdf')).toBe(false);
        expect(headMatchesExtension(Buffer.from('MZ\x90\x00\x03'), 'xlsx')).toBe(false);
        expect(headMatchesExtension(Buffer.from([0x4d, 0x5a, 0x00, 0x00]), 'csv')).toBe(false);
    });
    it('rejects empty files and unknown types', () => {
        expect(headMatchesExtension(Buffer.alloc(0), 'pdf')).toBe(false);
        expect(headMatchesExtension(Buffer.from('anything'), 'exe')).toBe(false);
    });
});

describe('misc', () => {
    it('builds the only allowed blob prefix', () => {
        expect(expectedBlobPrefix('c', 2025, 'd')).toBe('clients/c/2025/d-');
    });
    it('defaults the size limit to 50 MB', () => {
        delete process.env.UPLOAD_MAX_BYTES;
        expect(getMaxBytes()).toBe(52428800);
    });
});
