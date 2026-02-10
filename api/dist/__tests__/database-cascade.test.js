"use strict";
/**
 * Database Cascade Tests - Soft Delete Operations
 *
 * Tests the cascade behavior of soft deletes across the database hierarchy:
 * - Client → Items → Accounts → Transactions
 *
 * @module __tests__/database-cascade.test
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mock the database module
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
}));
const database_1 = require("../shared/database");
const index_1 = __importDefault(require("../clients/index"));
const index_2 = __importDefault(require("../items/index"));
const mockExecuteQuery = database_1.executeQuery;
/**
 * Create a mock Azure Function context
 */
function createMockContext() {
    return {
        log: Object.assign(jest.fn(), {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            verbose: jest.fn(),
        }),
        done: jest.fn(),
        res: undefined,
        bindings: {},
        bindingData: {},
        bindingDefinitions: [],
        executionContext: {
            invocationId: 'test-invocation-id',
            functionName: 'test',
            functionDirectory: '/test',
            retryContext: null,
        },
        traceContext: {
            traceparent: null,
            tracestate: null,
            attributes: {},
        },
    };
}
/**
 * Create a mock HTTP request
 */
function createMockRequest(options) {
    return {
        method: options.method,
        params: options.params || {},
        query: options.query || {},
        body: options.body,
        headers: {},
        url: 'http://localhost/api/test',
    };
}
describe('Database Cascade Tests - Soft Delete Operations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock implementation
        mockExecuteQuery.mockResolvedValue({
            recordset: [],
            recordsets: [],
            output: {},
            rowsAffected: [0],
        });
    });
    describe('1.1 Soft Delete Cascade - Client Level', () => {
        it('should soft-delete entire hierarchy when client is deleted', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '5' }
            });
            // Mock client exists check
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 5,
                        first_name: 'John',
                        last_name: 'Doe'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock getting item IDs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    { item_id: 10 },
                    { item_id: 11 },
                    { item_id: 12 }
                ],
                recordsets: [],
                output: {},
                rowsAffected: [3],
            });
            // Mock archive client
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock archive items
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [3],
            });
            // Mock count accounts
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 6 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock deactivate accounts
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [6],
            });
            // Mock get account IDs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    { account_id: 100 },
                    { account_id: 101 },
                    { account_id: 102 },
                    { account_id: 103 },
                    { account_id: 104 },
                    { account_id: 105 }
                ],
                recordsets: [],
                output: {},
                rowsAffected: [6],
            });
            // Mock count transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 60 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock archive transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [60],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.items).toBe(3);
            expect(context.res?.body.deleted.accounts).toBe(6);
            expect(context.res?.body.deleted.transactions).toBe(60);
            // Verify cascade update calls
            const updateCalls = mockExecuteQuery.mock.calls;
            // Check client archived
            expect(updateCalls.some(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE clients SET is_archived = 1'))).toBe(true);
            // Check items archived
            expect(updateCalls.some(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE items SET is_archived = 1'))).toBe(true);
            // Check accounts deactivated
            expect(updateCalls.some(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE accounts SET is_active = 0'))).toBe(true);
            // Check transactions archived
            expect(updateCalls.some(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE transactions SET is_archived = 1'))).toBe(true);
        });
        it('should handle client with NO items gracefully', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '99' }
            });
            // Mock client exists
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 99,
                        first_name: 'Jane',
                        last_name: 'Smith'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock no items
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // Mock archive client
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.items).toBe(0);
            expect(context.res?.body.deleted.accounts).toBe(0);
            expect(context.res?.body.deleted.transactions).toBe(0);
        });
        it('should handle client with multiple items correctly', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '7' }
            });
            // Mock client exists
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 7,
                        first_name: 'Bob',
                        last_name: 'Johnson'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock 3 items
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    { item_id: 20 },
                    { item_id: 21 },
                    { item_id: 22 }
                ],
                recordsets: [],
                output: {},
                rowsAffected: [3],
            });
            // Mock archive client
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock archive items
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [3],
            });
            // Mock 6 accounts total (2 per item)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 6 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock deactivate accounts
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [6],
            });
            // Mock account IDs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    { account_id: 200 }, { account_id: 201 },
                    { account_id: 202 }, { account_id: 203 },
                    { account_id: 204 }, { account_id: 205 }
                ],
                recordsets: [],
                output: {},
                rowsAffected: [6],
            });
            // Mock 60 transactions (10 per account)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 60 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock archive transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [60],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.items).toBe(3);
            expect(context.res?.body.deleted.accounts).toBe(6);
            expect(context.res?.body.deleted.transactions).toBe(60);
            expect(context.res?.body.message).toContain('deleted successfully');
        });
    });
    describe('1.2 Soft Delete Cascade - Item Level', () => {
        it('should soft-delete item and its children only (not sibling items)', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '15' }
            });
            // Mock item exists with 3 accounts and 15 transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        item_id: 15,
                        client_id: 5,
                        plaid_item_id: 'item-sandbox-abc',
                        access_token: Buffer.from('encrypted'),
                        access_token_key_id: 1,
                        institution_name: 'Test Bank',
                        status: 'active'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock archive item
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock get accounts for this item
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    { account_id: 150 },
                    { account_id: 151 },
                    { account_id: 152 }
                ],
                recordsets: [],
                output: {},
                rowsAffected: [3],
            });
            // Mock deactivate accounts
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [3],
            });
            // Mock count transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 15 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock archive transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [15],
            });
            await (0, index_2.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.accounts).toBe(3);
            expect(context.res?.body.deleted.transactions).toBe(15);
            // Verify ONLY this item was affected
            const updateCalls = mockExecuteQuery.mock.calls;
            const itemUpdateCall = updateCalls.find(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE items SET is_archived = 1') &&
                call[1]?.itemId === 15);
            expect(itemUpdateCall).toBeDefined();
        });
        it('should NOT affect sibling items when one item is deleted', async () => {
            // This test verifies isolation by checking that queries are scoped to specific item_id
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '20' }
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        item_id: 20,
                        client_id: 5,
                        plaid_item_id: 'item-20',
                        access_token: Buffer.from('encrypted'),
                        access_token_key_id: 1,
                        institution_name: 'Bank A',
                        status: 'active'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ account_id: 200 }, { account_id: 201 }],
                recordsets: [],
                output: {},
                rowsAffected: [2],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [2],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 10 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [10],
            });
            await (0, index_2.default)(context, req);
            // Verify all queries include WHERE item_id = @itemId
            const updateCalls = mockExecuteQuery.mock.calls;
            const accountsQuery = updateCalls.find(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE accounts') &&
                call[0].includes('WHERE item_id = @itemId'));
            expect(accountsQuery).toBeDefined();
        });
        it('should handle item deletion gracefully when transactions table does not exist', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '25' }
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        item_id: 25,
                        client_id: 5,
                        plaid_item_id: 'item-25',
                        access_token: Buffer.from('encrypted'),
                        access_token_key_id: 1,
                        institution_name: 'Bank B',
                        status: 'active'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ account_id: 250 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Transactions query throws (table doesn't exist)
            mockExecuteQuery.mockRejectedValueOnce(new Error('Invalid object name \'transactions\''));
            await (0, index_2.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.accounts).toBe(1);
            expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('Could not archive transactions'));
        });
    });
    describe('1.3 Soft Delete Idempotency', () => {
        it('should return 404 when deleting already-archived client', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '100' }
            });
            // Mock client not found (already archived)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(404);
            expect(context.res?.body.error).toBe('Client not found');
            // Should only have made one query (the check)
            expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
        });
        it('should return 404 when deleting already-archived item', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '200' }
            });
            // Mock item not found (already archived)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            await (0, index_2.default)(context, req);
            expect(context.res?.status).toBe(404);
            expect(context.res?.body.error).toBe('Item not found');
            // Should only have made one query
            expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
        });
    });
});
//# sourceMappingURL=database-cascade.test.js.map