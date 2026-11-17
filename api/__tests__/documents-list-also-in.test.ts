/**
 * The Documents list tells staff when the same file (same checksum) is also filed
 * under another tax year. Nothing is stored for this: the list query works it out.
 */
jest.mock('../shared/auth', () => ({
    requireAuth: jest.fn(() => ({ userId: 'u1', userDetails: 'staff@example.com', identityProvider: 'aad', userRoles: [] })),
    getStaffIdentity: jest.fn(() => 'staff@example.com'),
}));
jest.mock('../shared/database', () => ({ executeQuery: jest.fn() }));
jest.mock('../shared/storage', () => ({
    buildBlobPath: jest.requireActual('../shared/storage').buildBlobPath,
    generateUploadSasUrl: jest.fn(),
    verifyBlobExists: jest.fn(),
    readBlobHead: jest.fn(),
    computeBlobSha256: jest.fn(),
    deleteBlob: jest.fn(),
}));

import documents from '../documents/index';
import { executeQuery } from '../shared/database';

const CLIENT = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const mockQuery = executeQuery as jest.Mock;

const row = (name: string, year: number, alsoIn: string | null) => ({
    doc_id: `id-${name}`, client_uuid: CLIENT, tax_year: year, blob_path: 'p', filename: name,
    file_size: 5, sha256_hash: 'a'.repeat(64), uploaded_by: 'staff@example.com', uploaded_at: '2026-11-17T00:00:00Z',
    also_in_years: alsoIn,
});

async function list(query: Record<string, string> = { clientUuid: CLIENT }) {
    const context: any = { log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }), res: undefined };
    await documents(context, { method: 'GET', query, headers: {}, params: {} } as any);
    return context;
}

describe('GET /api/documents also_in_years', () => {
    beforeEach(() => mockQuery.mockReset());

    it('turns the year list into numbers, and nothing into an empty list', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [row('w2.pdf', 2024, '2022,2023'), row('1099.pdf', 2024, null)] });
        const context = await list();
        expect(context.res.status).toBe(200);
        expect(context.res.body.documents[0].also_in_years).toEqual([2022, 2023]);
        expect(context.res.body.documents[1].also_in_years).toEqual([]);
    });

    it('looks at other years only, for the same client and checksum', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [] });
        await list();
        const sql = String(mockQuery.mock.calls[0][0]);
        expect(sql).toContain('o.client_uuid = d.client_uuid');
        expect(sql).toContain('o.sha256_hash = d.sha256_hash');
        expect(sql).toContain('o.tax_year <> d.tax_year');
    });

    it('still looks at every year when the list is narrowed to one year', async () => {
        mockQuery.mockResolvedValueOnce({ recordset: [row('w2.pdf', 2024, '2022')] });
        const context = await list({ clientUuid: CLIENT, taxYear: '2024' });
        const sql = String(mockQuery.mock.calls[0][0]);
        expect(sql).toContain('AND d.tax_year = @taxYear');
        expect(context.res.body.documents[0].also_in_years).toEqual([2022]);
    });
});
