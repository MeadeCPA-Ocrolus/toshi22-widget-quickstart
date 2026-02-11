"use strict";
/**
 * Tests for Items Endpoint
 *
 * @module items/index.test
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mock the database module
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
}));
// Mock the encryption module
jest.mock('../shared/encryption', () => ({
    decrypt: jest.fn(),
}));
// Mock the plaid-client module
jest.mock('../shared/plaid-client', () => ({
    getPlaidClient: jest.fn(),
}));
const database_1 = require("../shared/database");
const encryption_1 = require("../shared/encryption");
const plaid_client_1 = require("../shared/plaid-client");
const index_1 = __importDefault(require("./index"));
const mockExecuteQuery = database_1.executeQuery;
const mockDecrypt = encryption_1.decrypt;
const mockGetPlaidClient = plaid_client_1.getPlaidClient;
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
            functionName: 'items',
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
        url: 'http://localhost/api/items',
    };
}
describe('Items Endpoint', () => {
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
    describe('OPTIONS (CORS preflight)', () => {
        it('should return 200 with CORS headers', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'OPTIONS', params: { id: '1' } });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.headers?.['Access-Control-Allow-Origin']).toBe('*');
            expect(context.res?.headers?.['Access-Control-Allow-Methods']).toContain('DELETE');
        });
    });
    describe('GET /api/items/:id', () => {
        it('should return item with accounts', async () => {
            // First call: fetch item
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    {
                        item_id: 1,
                        client_id: 5,
                        plaid_item_id: 'item-plaid-123',
                        institution_id: 'ins_109508',
                        institution_name: 'First Platypus Bank',
                        status: 'active',
                        has_sync_updates: false,
                    },
                ],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Second call: fetch accounts
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    {
                        account_id: 10,
                        item_id: 1,
                        plaid_account_id: 'acc-123',
                        account_name: 'Checking',
                        account_type: 'depository',
                        current_balance: 1000,
                        is_active: true,
                    },
                    {
                        account_id: 11,
                        item_id: 1,
                        plaid_account_id: 'acc-456',
                        account_name: 'Savings',
                        account_type: 'depository',
                        current_balance: 5000,
                        is_active: true,
                    },
                ],
                recordsets: [],
                output: {},
                rowsAffected: [2],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: '1' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.item_id).toBe(1);
            expect(context.res?.body.institution_name).toBe('First Platypus Bank');
            expect(context.res?.body.accounts).toHaveLength(2);
            expect(context.res?.body.accounts[0].account_name).toBe('Checking');
        });
        it('should return 400 for missing item ID', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: {},
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('Item ID is required');
        });
        it('should return 400 for invalid item ID format', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: 'invalid' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('Invalid item ID format');
        });
    });
    describe('DELETE /api/items/:id', () => {
        it('should continue deletion even if Plaid removal fails', async () => {
            // Mock the Plaid client to throw an error
            const mockItemRemove = jest.fn().mockRejectedValue(new Error('Plaid API error'));
            mockGetPlaidClient.mockReturnValue({
                itemRemove: mockItemRemove,
            });
            // Mock decrypt
            mockDecrypt.mockResolvedValue('access-sandbox-decrypted-token');
            // 1. Fetch item
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    {
                        item_id: 1,
                        client_id: 5,
                        plaid_item_id: 'item-plaid-123',
                        access_token: Buffer.from('encrypted-token'),
                        access_token_key_id: 1,
                        institution_name: 'First Platypus Bank',
                        status: 'active',
                    },
                ],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // 2. Get account IDs (empty)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // 3. Count webhook logs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 0 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // 4. Delete webhook logs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // 5. Delete item
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '1' },
                query: { removeFromPlaid: 'true' },
            });
            await (0, index_1.default)(context, req);
            // Should still succeed with local deletion
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.deleted.removed_from_plaid).toBe(false);
            expect(context.log.warn).toHaveBeenCalled();
        });
    });
    describe('Error handling', () => {
        it('should return 405 for unsupported methods', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                params: { id: '1' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(405);
            expect(context.res?.body.error).toBe('Method not allowed');
        });
    });
});
//# sourceMappingURL=index.test.js.map