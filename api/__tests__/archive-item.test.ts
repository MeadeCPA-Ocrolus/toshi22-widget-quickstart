/**
 * Archiving a bank connection: what is flagged, and what the caller is told
 * about Plaid. Used by "remove bank connection" and by "Delete Client".
 */
jest.mock('../shared/database', () => ({ executeQuery: jest.fn() }));
jest.mock('../shared/encryption', () => ({ decrypt: jest.fn(async () => 'access-sandbox-token') }));
jest.mock('../shared/investments-sync-service', () => ({ archiveInvestmentsForItem: jest.fn() }));
jest.mock('../shared/liabilities-sync-service', () => ({ archiveLiabilitiesForItem: jest.fn() }));
const mockItemRemove = jest.fn();
jest.mock('../shared/plaid-client', () => ({ getPlaidClient: () => ({ itemRemove: mockItemRemove }) }));

import { archiveItem, plaidWarning } from '../shared/archive-item';
import { executeQuery } from '../shared/database';
import { archiveInvestmentsForItem } from '../shared/investments-sync-service';
import { archiveLiabilitiesForItem } from '../shared/liabilities-sync-service';

const mockQuery = executeQuery as jest.Mock;
const context: any = { log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }) };

const ITEM_ROW = {
    item_id: 7, plaid_item_id: 'plaid-item-7', institution_name: 'First Platypus Bank',
    access_token: Buffer.from('x'), access_token_key_id: 1,
};

/** Answers by the SQL text, so the test does not depend on query order. */
function database(itemRows: any[] = [ITEM_ROW]) {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
        if (/^\s*SELECT/i.test(sql)) return { recordset: itemRows, rowsAffected: [itemRows.length] };
        if (/UPDATE accounts/i.test(sql)) return { recordset: [], rowsAffected: [2] };
        if (/UPDATE t SET/i.test(sql)) return { recordset: [], rowsAffected: [15] };
        return { recordset: [], rowsAffected: [1] };
    });
}
const updates = () => mockQuery.mock.calls.map((c) => c[0] as string).filter((q) => /UPDATE/i.test(q));

beforeEach(() => {
    jest.clearAllMocks();
    mockItemRemove.mockReset();
    mockItemRemove.mockResolvedValue({});
    database();
});

describe('archiveItem', () => {
    it('archives the connection, accounts, transactions, investments and liabilities', async () => {
        const r = await archiveItem(context, 7, { removeFromPlaid: true, reason: 'item_archived' });

        expect(r).toMatchObject({ found: true, plaidRemoval: 'removed', accounts: 2, transactions: 15 });
        expect(updates().some((q) => /UPDATE items SET is_archived = 1/.test(q))).toBe(true);
        expect(updates().some((q) => /UPDATE accounts SET is_active = 0/.test(q))).toBe(true);
        expect(updates().some((q) => /UPDATE t SET t.is_archived = 1/.test(q))).toBe(true);
        expect(archiveInvestmentsForItem).toHaveBeenCalledWith(7, 'item_archived');
        expect(archiveLiabilitiesForItem).toHaveBeenCalledWith(7, 'item_archived');
    });

    it('tells Plaid first, before anything is archived', async () => {
        await archiveItem(context, 7, { removeFromPlaid: true, reason: 'item_archived' });
        expect(mockItemRemove).toHaveBeenCalledWith({ access_token: 'access-sandbox-token' });
        const firstUpdate = mockQuery.mock.invocationCallOrder[mockQuery.mock.calls.findIndex((c) => /UPDATE/i.test(c[0]))];
        expect(mockItemRemove.mock.invocationCallOrder[0]).toBeLessThan(firstUpdate);
    });

    it('does not call Plaid when not asked', async () => {
        const r = await archiveItem(context, 7, { removeFromPlaid: false, reason: 'item_archived' });
        expect(mockItemRemove).not.toHaveBeenCalled();
        expect(r.plaidRemoval).toBe('not_requested');
        expect(r.found).toBe(true);
    });

    it('still archives everything when Plaid fails, and says so', async () => {
        mockItemRemove.mockRejectedValue(new Error('network down'));
        const r = await archiveItem(context, 7, { removeFromPlaid: true, reason: 'item_archived' });
        expect(r.plaidRemoval).toBe('failed');
        expect(updates().some((q) => /UPDATE items SET is_archived = 1/.test(q))).toBe(true);
        expect(archiveInvestmentsForItem).toHaveBeenCalled();
    });

    it('counts a connection Plaid no longer knows as removed', async () => {
        mockItemRemove.mockRejectedValue({ response: { data: { error_code: 'ITEM_NOT_FOUND' } } });
        const r = await archiveItem(context, 7, { removeFromPlaid: true, reason: 'item_archived' });
        expect(r.plaidRemoval).toBe('removed');
    });

    it('reports a missing token instead of pretending Plaid was told', async () => {
        database([{ ...ITEM_ROW, access_token: null, access_token_key_id: null }]);
        const r = await archiveItem(context, 7, { removeFromPlaid: true, reason: 'item_archived' });
        expect(mockItemRemove).not.toHaveBeenCalled();
        expect(r.plaidRemoval).toBe('no_token');
    });

    it('does nothing for a connection that is missing or already archived', async () => {
        database([]);
        const r = await archiveItem(context, 99, { removeFromPlaid: true, reason: 'item_archived' });
        expect(r.found).toBe(false);
        expect(mockItemRemove).not.toHaveBeenCalled();
        expect(updates()).toHaveLength(0);
    });

    it('keeps going if the investments or liabilities archive fails', async () => {
        (archiveInvestmentsForItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
        const r = await archiveItem(context, 7, { removeFromPlaid: false, reason: 'item_archived' });
        expect(archiveLiabilitiesForItem).toHaveBeenCalled();
        expect(r.found).toBe(true);
    });
});

describe('plaidWarning', () => {
    it('says nothing when nothing failed', () => expect(plaidWarning(0)).toBeUndefined());
    it('names one connection', () => expect(plaidWarning(1)).toMatch(/^1 bank connection could not/));
    it('counts several', () => expect(plaidWarning(3)).toMatch(/^3 bank connections could not/));
});
