/**
 * Delete Client: every bank connection is disconnected at Plaid and archived
 * one at a time, the client is archived last, and Plaid failures come back as
 * a warning rather than an error.
 */
jest.mock('../shared/auth', () => ({
    requireAuth: jest.fn(() => ({ userId: 'u1', userDetails: 'staff@example.com', identityProvider: 'aad', userRoles: [] })),
    getStaffIdentity: jest.fn(() => 'staff@example.com'),
}));
jest.mock('../shared/database', () => ({ executeQuery: jest.fn() }));
const mockArchive = jest.fn();
jest.mock('../shared/archive-item', () => ({
    archiveItem: (...a: any[]) => mockArchive(...a),
    plaidWarning: jest.requireActual('../shared/archive-item').plaidWarning,
}));

import clients from '../clients/index';
import { executeQuery } from '../shared/database';

const mockQuery = executeQuery as jest.Mock;

function database(itemIds: number[], clientExists = true) {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
        if (/FROM clients WHERE client_id/i.test(sql)) {
            return { recordset: clientExists ? [{ client_id: 5, first_name: 'Pat', last_name: 'Lee' }] : [] };
        }
        if (/FROM items WHERE client_id/i.test(sql)) return { recordset: itemIds.map((item_id) => ({ item_id })) };
        return { recordset: [], rowsAffected: [1] };
    });
}
function found(itemId: number, plaidRemoval: string) {
    return { found: true, itemId, plaidRemoval, accounts: 2, transactions: 10 };
}
async function call() {
    const context: any = { log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }), res: undefined };
    await clients(context, { method: 'DELETE', params: { id: '5' }, headers: {}, query: {} } as any);
    return context.res;
}

beforeEach(() => mockArchive.mockReset());

it('disconnects each bank at Plaid and archives the client last', async () => {
    database([1, 2]);
    mockArchive.mockImplementation(async (_c: any, id: number) => found(id, 'removed'));
    const res = await call();

    expect(mockArchive).toHaveBeenCalledTimes(2);
    expect(mockArchive.mock.calls[0][2]).toEqual({ removeFromPlaid: true, reason: 'client_archived' });
    expect(res.status).toBe(200);
    expect(res.body.warning).toBeUndefined();
    expect(res.body.plaid_removal).toEqual({ requested: 2, removed: 2, failed: 0 });
    expect(res.body.deleted).toMatchObject({ items: 2, accounts: 4, transactions: 20 });

    const calls = mockQuery.mock.calls.map((c) => c[0] as string);
    const clientUpdate = calls.findIndex((q) => /UPDATE clients SET is_archived = 1/.test(q));
    expect(clientUpdate).toBeGreaterThan(-1);
    expect(mockArchive.mock.invocationCallOrder[1]).toBeLessThan(mockQuery.mock.invocationCallOrder[clientUpdate]);
});

it('warns, but still archives, when Plaid could not be told for some connections', async () => {
    database([1, 2, 3]);
    mockArchive.mockImplementation(async (_c: any, id: number) => found(id, id === 2 ? 'failed' : 'removed'));
    const res = await call();

    expect(res.status).toBe(200);
    expect(res.body.plaid_removal).toEqual({ requested: 3, removed: 2, failed: 1 });
    expect(res.body.warning).toMatch(/^1 bank connection could not be disconnected at Plaid/);
    expect(mockQuery.mock.calls.some((c) => /UPDATE clients SET is_archived = 1/.test(c[0]))).toBe(true);
});

it('a client with no bank connections never calls Plaid', async () => {
    database([]);
    const res = await call();
    expect(mockArchive).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.plaid_removal).toEqual({ requested: 0, removed: 0, failed: 0 });
    expect(res.body.warning).toBeUndefined();
});

it('returns 404 and changes nothing for a client that is already archived', async () => {
    database([1], false);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mockArchive).not.toHaveBeenCalled();
});
