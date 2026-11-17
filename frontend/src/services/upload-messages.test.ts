import { friendlyMessage, shortReference, summarizeProblems, summarizeSuccess, GENERIC_FAILURE, SESSION_PROBLEM } from './upload-messages';

describe('friendlyMessage', () => {
    it('shows actionable API messages as sent', () => {
        expect(friendlyMessage(400, 'File type not allowed. Allowed types: pdf')).toBe('File type not allowed. Allowed types: pdf');
        expect(friendlyMessage(413, 'File is too large. The limit is 50 MB')).toBe('File is too large. The limit is 50 MB');
        expect(friendlyMessage(400, 'The file contents do not match a .pdf file')).toBe('The file contents do not match a .pdf file');
        expect(friendlyMessage(400, 'The upload link may have expired. Please try again.')).toBe('The upload link may have expired. Please try again.');
        expect(friendlyMessage(400, 'taxYear is required. Choose the tax year for this document')).toMatch(/^taxYear is required/);
    });
    it('hides internal wording behind one generic line', () => {
        expect(friendlyMessage(400, 'blobPath does not match this upload')).toBe(GENERIC_FAILURE);
        expect(friendlyMessage(400, 'docId and clientUuid must be valid ids')).toBe(GENERIC_FAILURE);
        expect(friendlyMessage(409, 'This upload was already confirmed')).toBe(GENERIC_FAILURE);
        expect(friendlyMessage(400, undefined)).toBe(GENERIC_FAILURE);
    });
    it('uses the generic line for every server error', () => {
        expect(friendlyMessage(500, 'Internal server error')).toBe(GENERIC_FAILURE);
        expect(friendlyMessage(503, 'anything')).toBe(GENERIC_FAILURE);
    });
    it('explains sign-in problems', () => {
        expect(friendlyMessage(401, undefined)).toBe(SESSION_PROBLEM);
        expect(friendlyMessage(403, 'Forbidden')).toBe(SESSION_PROBLEM);
    });
});

describe('shortReference', () => {
    it('keeps the first 8 characters', () => {
        expect(shortReference('4f2a9c1e-7b3d-4e1a-9c05-0123456789ab')).toBe('4f2a9c1e');
    });
    it('returns nothing when there is no id', () => {
        expect(shortReference(undefined)).toBeUndefined();
        expect(shortReference('')).toBeUndefined();
    });
});

describe('banner text', () => {
    it('counts what is listed', () => {
        expect(summarizeProblems(1, 0)).toBe('1 file failed');
        expect(summarizeProblems(2, 0)).toBe('2 files failed');
        expect(summarizeProblems(0, 1)).toBe('1 file already uploaded');
        expect(summarizeProblems(0, 3)).toBe('3 files already uploaded');
        expect(summarizeProblems(2, 1)).toBe('2 failed, 1 already uploaded');
        expect(summarizeSuccess(1)).toBe('1 file uploaded');
        expect(summarizeSuccess(3)).toBe('3 files uploaded');
    });
});
