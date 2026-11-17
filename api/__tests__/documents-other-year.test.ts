/**
 * The confirm step saves a file even when the same content is filed under a
 * different tax year, and tells the browser about it. A match in the same year
 * is still a duplicate and is not saved.
 */
jest.mock('../shared/auth', () => ({
    requireAuth: jest.fn(() => ({ userId: 'u1', userDetails: 'staff@example.com', identityProvider: 'aad', userRoles: [] })),
    getStaffIdentity: jest.fn(() => 'staff@example.com'),
}));
jest.mock('../shared/database', () => ({ executeQuery: jest.fn() }));
jest.mock('../shared/storage', () => ({
    buildBlobPath: jest.requireActual('../shared/storage').buildBlobPath,
    generateUploadSasUrl: jest.fn(),
    verifyBlobExists: jest.fn(async () => ({ exists: true, sizeBytes: 5 })),
    readBlobHead: jest.fn(async () => Buffer.from('%PDF-1.7')),
    computeBlobSha256: jest.fn(async () => 'a'.repeat(64)),
    deleteBlob: jest.fn(),
}));

import documents from '../documents/index';
import { executeQuery } from '../shared/database';

const CLIENT = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const DOC = 'b0c4e1d2-77aa-4f10-8b2e-1c9d0a5e6f41';
const body = {
    docId: DOC, clientUuid: CLIENT, filename: 'w2.pdf', taxYear: 2025,
    blobPath: `clients/${CLIENT}/2025/${DOC}-w2.pdf`, sha256Hash: 'a'.repeat(64),
};

async function call() {
    const context: any = { log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }), res: undefined };
    await documents(context, { method: 'POST', body, headers: {}, params: {} } as any);
    return context;
}

const mockQuery = executeQuery as jest.Mock;

/** Answers each query by its SQL text, so the test does not depend on query order. */
function database(opts: { sameYear?: any[]; otherYear?: any[] }) {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM clients')) return { recordset: [{ client_id: 1 }] };
        if (sql.includes('WHERE doc_id = @docId')) return { recordset: [] };
        if (sql.includes('tax_year = @taxYear')) return { recordset: opts.sameYear || [] };
        if (sql.includes('tax_year <> @taxYear')) return { recordset: opts.otherYear || [] };
        return { recordset: [] }; // INSERT
    });
}
const inserted = () => mockQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO documents'));

describe('POST /api/documents with the same file in another year', () => {
    it('saves the file and reports the other year', async () => {
        database({ otherYear: [{ tax_year: 2022, filename: 'w2-old.pdf', uploaded_at: '2026-01-01T00:00:00Z' }] });
        const context = await call();
        expect(context.res.status).toBe(201);
        expect(context.res.body.sameFileInOtherYear).toEqual({ taxYear: 2022, filename: 'w2-old.pdf', uploadedAt: '2026-01-01T00:00:00Z' });
        expect(inserted()).toBe(true);
    });

    it('reports nothing extra when the file is new', async () => {
        database({});
        const context = await call();
        expect(context.res.status).toBe(201);
        expect(context.res.body.sameFileInOtherYear).toBeUndefined();
        expect(inserted()).toBe(true);
    });

    it('still blocks a match in the same year', async () => {
        database({ sameYear: [{ doc_id: 'x', filename: 'w2.pdf', uploaded_at: '2026-11-01T00:00:00Z' }] });
        const context = await call();
        expect(context.res.body.duplicate).toBe(true);
        expect(inserted()).toBe(false);
    });
});
