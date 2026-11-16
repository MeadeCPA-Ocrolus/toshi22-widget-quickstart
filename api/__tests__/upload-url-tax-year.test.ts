/**
 * /api/upload-url: the tax year is required and is never guessed.
 */
jest.mock('../shared/auth', () => ({
    requireAuth: jest.fn(() => ({ userId: 'u1', userDetails: 'staff@example.com', identityProvider: 'aad', userRoles: [] })),
}));
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(async () => ({ recordset: [{ client_id: 1 }] })),
}));
jest.mock('../shared/storage', () => ({
    buildBlobPath: jest.requireActual('../shared/storage').buildBlobPath,
    generateUploadSasUrl: jest.fn(async () => ({ sasUrl: 'https://example.invalid/sas', expiresAt: new Date('2026-11-16T12:00:00Z') })),
}));

import httpTrigger from '../upload-url/index';

const CLIENT = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

async function run(body: any) {
    const context: any = { log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }), res: undefined };
    const req: any = { method: 'POST', body, headers: {} };
    await httpTrigger(context, req);
    return context.res;
}

describe('POST /api/upload-url tax year', () => {
    it('rejects a request with no tax year', async () => {
        const res = await run({ clientUuid: CLIENT, filename: 'w2.pdf', fileSize: 1000 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/taxYear is required/);
    });

    it('rejects a text or out-of-range year', async () => {
        expect((await run({ clientUuid: CLIENT, filename: 'w2.pdf', taxYear: '2025' })).status).toBe(400);
        expect((await run({ clientUuid: CLIENT, filename: 'w2.pdf', taxYear: 1999 })).status).toBe(400);
    });

    it('uses exactly the year sent, in the response and the storage path', async () => {
        const res = await run({ clientUuid: CLIENT, filename: 'w2.pdf', taxYear: 2024, fileSize: 1000 });
        expect(res.status).toBe(200);
        expect(res.body.taxYear).toBe(2024);
        expect(res.body.blobPath).toMatch(new RegExp(`^clients/${CLIENT}/2024/`));
    });
});
