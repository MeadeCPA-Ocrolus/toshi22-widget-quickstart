/**
 * Database Cascade Tests - Soft Delete Operations
 *
 * Tests the cascade behavior of soft deletes across the hierarchy:
 * Client -> Items -> Accounts -> Transactions (and holdings, investment
 * transactions and liabilities, which are archived with the item).
 *
 * The database is a stand-in that answers by the SQL text, so these tests do
 * not depend on the order of queries. Plaid is not called for real.
 *
 * @module __tests__/database-cascade.test
 */

import { Context } from '@azure/functions';

// Pretend the staff member is signed in (the app rejects anything else with 401).
jest.mock('../shared/auth', () => ({
    requireAuth: jest.fn(() => ({ userId: 'u1', userDetails: 'staff@example.com', identityProvider: 'aad', userRoles: [] })),
    getStaffIdentity: jest.fn(() => 'staff@example.com'),
}));
jest.mock('../shared/database', () => ({ executeQuery: jest.fn() }));
jest.mock('../shared/encryption', () => ({ decrypt: jest.fn(async () => 'access-sandbox-token') }));
jest.mock('../shared/investments-sync-service', () => ({ archiveInvestmentsForItem: jest.fn() }));
jest.mock('../shared/liabilities-sync-service', () => ({ archiveLiabilitiesForItem: jest.fn() }));
const mockItemRemove = jest.fn();
jest.mock('../shared/plaid-client', () => ({ getPlaidClient: () => ({ itemRemove: mockItemRemove }) }));

import { executeQuery } from '../shared/database';
import { archiveInvestmentsForItem } from '../shared/investments-sync-service';
import { archiveLiabilitiesForItem } from '../shared/liabilities-sync-service';
import clientsHandler from '../clients/index';
import itemsHandler from '../items/index';

const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>;

function createMockContext(): Context {
    return {
        log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn(), info: jest.fn(), verbose: jest.fn() }),
        done: jest.fn(),
        res: undefined,
        bindings: {},
    } as unknown as Context;
}

function createMockRequest(options: { method: string; params?: Record<string, string>; query?: Record<string, string> }) {
    return { method: options.method, params: options.params || {}, query: options.query || {}, headers: {}, url: 'http://localhost/api/test' };
}

interface World {
    /** The client, or null when it is missing or already archived. */
    client?: { client_id: number; first_name: string; last_name: string } | null;
    /** Active (not archived) items of the client, by item_id. */
    items: number[];
    accountsPerItem?: number;
    transactionsPerItem?: number;
    /** When true, the transactions table "does not exist". */
    noTransactionsTable?: boolean;
}

/** Answers every query by its SQL text. */
function database(world: World) {
    const accountsPerItem = world.accountsPerItem ?? 2;
    const transactionsPerItem = world.transactionsPerItem ?? 10;
    mockExecuteQuery.mockReset();
    mockExecuteQuery.mockImplementation((async (sql: string, params?: any) => {
        if (/FROM clients WHERE client_id/i.test(sql)) {
            return { recordset: world.client ? [world.client] : [], rowsAffected: [1] };
        }
        if (/SELECT item_id FROM items WHERE client_id/i.test(sql)) {
            return { recordset: world.items.map((item_id) => ({ item_id })), rowsAffected: [world.items.length] };
        }
        if (/SELECT item_id, plaid_item_id.*FROM items\s+WHERE item_id = @itemId AND is_archived = 0/is.test(sql)) {
            const found = world.items.includes(params.itemId);
            return {
                recordset: found
                    ? [{ item_id: params.itemId, plaid_item_id: `item-${params.itemId}`, institution_name: 'Bank', access_token: Buffer.from('x'), access_token_key_id: 1 }]
                    : [],
                rowsAffected: [found ? 1 : 0],
            };
        }
        if (/UPDATE accounts/i.test(sql)) return { recordset: [], rowsAffected: [accountsPerItem] };
        if (/UPDATE t SET/i.test(sql)) {
            if (world.noTransactionsTable) throw new Error("Invalid object name 'transactions'");
            return { recordset: [], rowsAffected: [transactionsPerItem] };
        }
        return { recordset: [], rowsAffected: [1] };
    }) as any);
}

const sqlCalls = () => mockExecuteQuery.mock.calls.map((c) => c[0] as string);
const ran = (pattern: RegExp) => sqlCalls().some((q) => pattern.test(q));

describe('Database Cascade Tests - Soft Delete Operations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockItemRemove.mockReset();
        mockItemRemove.mockResolvedValue({});
    });

    describe('1.1 Soft Delete Cascade - Client Level', () => {
        it('should soft-delete entire hierarchy when client is deleted', async () => {
            database({ client: { client_id: 5, first_name: 'John', last_name: 'Doe' }, items: [10, 11, 12], accountsPerItem: 2, transactionsPerItem: 20 });
            const context = createMockContext();

            await clientsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '5' } }) as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.items).toBe(3);
            expect(context.res?.body.deleted.accounts).toBe(6);
            expect(context.res?.body.deleted.transactions).toBe(60);
            expect(ran(/UPDATE clients SET is_archived = 1/)).toBe(true);
            expect(ran(/UPDATE items SET is_archived = 1/)).toBe(true);
            expect(ran(/UPDATE accounts SET is_active = 0/)).toBe(true);
            expect(ran(/UPDATE t SET t\.is_archived = 1/)).toBe(true);
            // holdings, investment transactions and liabilities go with each item
            expect(archiveInvestmentsForItem).toHaveBeenCalledTimes(3);
            expect(archiveLiabilitiesForItem).toHaveBeenCalledTimes(3);
        });

        it('should handle client with NO items gracefully', async () => {
            database({ client: { client_id: 99, first_name: 'Jane', last_name: 'Smith' }, items: [] });
            const context = createMockContext();

            await clientsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '99' } }) as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.items).toBe(0);
            expect(context.res?.body.deleted.accounts).toBe(0);
            expect(context.res?.body.deleted.transactions).toBe(0);
            expect(ran(/UPDATE clients SET is_archived = 1/)).toBe(true);
            expect(ran(/UPDATE items/)).toBe(false);
            expect(mockItemRemove).not.toHaveBeenCalled();
        });

        it('should handle client with multiple items correctly', async () => {
            database({ client: { client_id: 7, first_name: 'Sam', last_name: 'Lee' }, items: [20, 21, 22], accountsPerItem: 2, transactionsPerItem: 20 });
            const context = createMockContext();

            await clientsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '7' } }) as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted).toMatchObject({ items: 3, accounts: 6, transactions: 60 });
            expect(context.res?.body.message).toContain('deleted successfully');
            // every bank is disconnected at Plaid
            expect(mockItemRemove).toHaveBeenCalledTimes(3);
        });
    });

    describe('1.2 Soft Delete Cascade - Item Level', () => {
        it('should soft-delete item and its children only (not sibling items)', async () => {
            database({ items: [30, 31], accountsPerItem: 3, transactionsPerItem: 15 });
            const context = createMockContext();

            await itemsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '30' } }) as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.accounts).toBe(3);
            expect(context.res?.body.deleted.transactions).toBe(15);
            expect(ran(/UPDATE items SET is_archived = 1/)).toBe(true);
            expect(archiveInvestmentsForItem).toHaveBeenCalledWith(30, 'item_archived');
            expect(archiveLiabilitiesForItem).toHaveBeenCalledWith(30, 'item_archived');
        });

        it('should NOT affect sibling items when one item is deleted', async () => {
            database({ items: [40, 41] });
            const context = createMockContext();

            await itemsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '40' } }) as any);

            // every archive update is scoped to this one item
            const itemUpdates = mockExecuteQuery.mock.calls.filter((c) => /UPDATE/i.test(c[0] as string));
            expect(itemUpdates.length).toBeGreaterThan(0);
            for (const [sql, params] of itemUpdates) {
                expect(sql).toMatch(/item_id = @itemId/);
                expect((params as any).itemId).toBe(40);
            }
            expect(archiveInvestmentsForItem).not.toHaveBeenCalledWith(41, expect.anything());
        });

        it('should handle item deletion gracefully when transactions table does not exist', async () => {
            database({ items: [25], accountsPerItem: 1, noTransactionsTable: true });
            const context = createMockContext();

            await itemsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '25' } }) as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.accounts).toBe(1);
            expect(context.res?.body.deleted.transactions).toBe(0);
            expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('Could not archive transactions'));
        });
    });

    describe('1.3 Soft Delete Idempotency', () => {
        it('should return 404 when deleting already-archived client', async () => {
            database({ client: null, items: [] });
            const context = createMockContext();

            await clientsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '5' } }) as any);

            expect(context.res?.status).toBe(404);
            expect(context.res?.body.error).toBe('Client not found');
            expect(ran(/UPDATE/)).toBe(false);
        });

        it('should return 404 when deleting already-archived item', async () => {
            database({ items: [] });
            const context = createMockContext();

            await itemsHandler(context, createMockRequest({ method: 'DELETE', params: { id: '25' } }) as any);

            expect(context.res?.status).toBe(404);
            expect(context.res?.body.error).toBe('Item not found');
            expect(ran(/UPDATE/)).toBe(false);
        });
    });
});
