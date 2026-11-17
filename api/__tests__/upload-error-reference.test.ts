/**
 * Server errors on the two upload endpoints return a generic message plus a
 * reference id. The real error goes to the logs, next to that id.
 */
jest.mock('../shared/auth', () => ({
    requireAuth: jest.fn(() => ({ userId: 'u1', userDetails: 'staff@example.com', identityProvider: 'aad', userRoles: [] })),
    getStaffIdentity: jest.fn(() => 'staff@example.com'),
}));
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(async () => {
        throw new Error('Login failed; AccountKey=SuperSecretKey123456 for staff@example.com');
    }),
}));
jest.mock('../shared/storage', () => ({
    buildBlobPath: jest.requireActual('../shared/storage').buildBlobPath,
    generateUploadSasUrl: jest.fn(),
    verifyBlobExists: jest.fn(),
    readBlobHead: jest.fn(),
    computeBlobSha256: jest.fn(),
    deleteBlob: jest.fn(),
}));

import uploadUrl from '../upload-url/index';
import documents from '../documents/index';

const CLIENT = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const DOC = 'b0c4e1d2-77aa-4f10-8b2e-1c9d0a5e6f41';
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function call(handler: any, body: any) {
    const context: any = { log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }), res: undefined };
    await handler(context, { method: 'POST', body, headers: {}, params: {} });
    return context;
}

describe.each([
    ['/api/upload-url', uploadUrl, { clientUuid: CLIENT, filename: 'w2.pdf', taxYear: 2025, fileSize: 1000 }],
    ['/api/documents', documents, {
        docId: DOC, clientUuid: CLIENT, filename: 'w2.pdf', taxYear: 2025,
        blobPath: `clients/${CLIENT}/2025/${DOC}-w2.pdf`, sha256Hash: 'a'.repeat(64),
    }],
])('%s server error', (_name, handler, body) => {
    it('returns a generic message and a reference id', async () => {
        const context = await call(handler, body);
        expect(context.res.status).toBe(500);
        expect(context.res.body.error).toBe('Internal server error');
        expect(context.res.body.correlationId).toMatch(UUID_RX);
    });

    it('does not leak the real error to the browser', async () => {
        const context = await call(handler, body);
        const sent = JSON.stringify(context.res.body);
        expect(sent).not.toMatch(/SuperSecretKey|AccountKey|staff@example\.com|Login failed/);
    });

    it('logs the reference id with a masked version of the error', async () => {
        const context = await call(handler, body);
        const logged = context.log.error.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
        expect(logged).toContain(context.res.body.correlationId);
        expect(logged).not.toMatch(/SuperSecretKey|staff@example\.com/);
    });
});
