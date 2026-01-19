"use strict";
/**
 * Tests for Plaid Webhook Handler
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mock the database module
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
}));
// Mock the Plaid client module
jest.mock('../shared/plaid-client', () => ({
    exchangePublicToken: jest.fn(),
    getItem: jest.fn(),
    getAccounts: jest.fn(),
}));
// Mock the encryption module
jest.mock('../shared/encryption', () => ({
    encrypt: jest.fn(),
}));
const database_1 = require("../shared/database");
const plaid_client_1 = require("../shared/plaid-client");
const encryption_1 = require("../shared/encryption");
const index_1 = __importDefault(require("./index"));
const mockExecuteQuery = database_1.executeQuery;
const mockExchangePublicToken = plaid_client_1.exchangePublicToken;
const mockGetItem = plaid_client_1.getItem;
const mockGetAccounts = plaid_client_1.getAccounts;
const mockEncrypt = encryption_1.encrypt;
// Helper to create a mock Azure Function context
function createMockContext() {
    return {
        log: Object.assign(jest.fn(), {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            verbose: jest.fn(),
        }),
        bindings: {},
        bindingData: {},
        bindingDefinitions: [],
        executionContext: {
            invocationId: 'test-invocation',
            functionName: 'plaid-webhook',
            functionDirectory: '/test',
            retryContext: null,
        },
        traceContext: {
            traceparent: null,
            tracestate: null,
            attributes: {},
        },
        invocationId: 'test-invocation',
        done: jest.fn(),
        res: undefined,
    };
}
// Helper to create a mock HTTP request
function createMockRequest(body, method = 'POST') {
    return {
        method,
        body,
        headers: {},
        query: {},
        params: {},
    };
}
describe('Plaid Webhook Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock: no duplicate found, insert succeeds
        mockExecuteQuery.mockImplementation(async (query) => {
            if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
            }
            if (query.includes('SELECT item_id FROM items WHERE plaid_item_id')) {
                return { recordset: [{ item_id: 1 }], recordsets: [], output: {}, rowsAffected: [1] };
            }
            if (query.includes('INSERT INTO webhook_log')) {
                return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] };
            }
            if (query.includes('UPDATE')) {
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] };
            }
            return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
        });
    });
    describe('HTTP method handling', () => {
        it('should return 200 for OPTIONS (CORS preflight)', async () => {
            const context = createMockContext();
            const req = createMockRequest({}, 'OPTIONS');
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.headers?.['Access-Control-Allow-Origin']).toBe('*');
        });
        it('should return 405 for non-POST methods', async () => {
            const context = createMockContext();
            const req = createMockRequest({}, 'GET');
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(405);
            expect(context.res?.body.error).toBe('Method not allowed');
        });
    });
    describe('webhook validation', () => {
        it('should return 400 if webhook_type is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({ webhook_code: 'TEST' });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('Missing');
        });
        it('should return 400 if webhook_code is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({ webhook_type: 'ITEM' });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('Missing');
        });
    });
    describe('idempotency', () => {
        it('should return duplicate status for already processed webhooks', async () => {
            // Mock: webhook already exists
            mockExecuteQuery.mockImplementation(async (query) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [{ log_id: 456 }], recordsets: [], output: {}, rowsAffected: [1] };
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
            });
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'test-item-123',
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('duplicate');
        });
        it('should process new webhooks', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'test-item-123',
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('success');
            expect(context.res?.body.log_id).toBe(123);
        });
    });
    describe('ITEM webhooks', () => {
        it('should update item status to login_required for ITEM_LOGIN_REQUIRED', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'test-item-123',
            });
            await (0, index_1.default)(context, req);
            // Verify UPDATE was called with correct status
            const updateCall = mockExecuteQuery.mock.calls.find(call => call[0].includes('UPDATE items') && call[0].includes('SET status'));
            expect(updateCall).toBeDefined();
            expect(updateCall?.[1]?.status).toBe('login_required');
        });
        it('should update item status to active for LOGIN_REPAIRED', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'LOGIN_REPAIRED',
                item_id: 'test-item-123',
            });
            await (0, index_1.default)(context, req);
            const updateCall = mockExecuteQuery.mock.calls.find(call => call[0].includes('UPDATE items') && call[0].includes('SET status'));
            expect(updateCall?.[1]?.status).toBe('active');
        });
        it('should update item status to error for ITEM_ERROR', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_ERROR',
                item_id: 'test-item-123',
                error: {
                    error_type: 'ITEM_ERROR',
                    error_code: 'ITEM_LOGIN_REQUIRED',
                    error_message: 'User needs to re-authenticate',
                },
            });
            await (0, index_1.default)(context, req);
            const updateCall = mockExecuteQuery.mock.calls.find(call => call[0].includes('UPDATE items') && call[0].includes('SET status'));
            expect(updateCall?.[1]?.status).toBe('error');
            expect(updateCall?.[1]?.errorCode).toBe('ITEM_LOGIN_REQUIRED');
        });
        it('should update item status to archived for USER_PERMISSION_REVOKED', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'USER_PERMISSION_REVOKED',
                item_id: 'test-item-123',
            });
            await (0, index_1.default)(context, req);
            const updateCall = mockExecuteQuery.mock.calls.find(call => call[0].includes('UPDATE items') && call[0].includes('SET status'));
            expect(updateCall?.[1]?.status).toBe('archived');
        });
    });
    describe('TRANSACTIONS webhooks', () => {
        it('should set has_sync_updates flag for SYNC_UPDATES_AVAILABLE', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'TRANSACTIONS',
                webhook_code: 'SYNC_UPDATES_AVAILABLE',
                item_id: 'test-item-123',
            });
            await (0, index_1.default)(context, req);
            const updateCall = mockExecuteQuery.mock.calls.find(call => call[0].includes('has_sync_updates = 1'));
            expect(updateCall).toBeDefined();
        });
    });
    describe('LINK webhooks', () => {
        it('should handle SESSION_FINISHED with full token exchange flow', async () => {
            // Setup mocks for the full SESSION_FINISHED flow
            mockExecuteQuery.mockImplementation(async (query) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('SELECT link_token, client_id, status')) {
                    return {
                        recordset: [{ link_token: 'link-sandbox-12345', client_id: 5, status: 'pending' }],
                        recordsets: [], output: {}, rowsAffected: [1]
                    };
                }
                if (query.includes('SELECT item_id FROM items WHERE plaid_item_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
                }
                if (query.includes('INSERT INTO items')) {
                    return { recordset: [{ item_id: 1 }], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('SELECT account_id FROM accounts')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
                }
                if (query.includes('INSERT INTO accounts')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('UPDATE link_tokens')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('UPDATE webhook_log')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] };
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
            });
            // Mock Plaid client functions
            mockExchangePublicToken.mockResolvedValue({
                access_token: 'access-sandbox-secret999',
                item_id: 'item-plaid-888',
                request_id: 'req-123',
            });
            mockGetItem.mockResolvedValue({
                item: {
                    item_id: 'item-plaid-888',
                    institution_id: 'ins_109508',
                    institution_name: 'First Platypus Bank',
                },
                request_id: 'req-456',
            });
            mockGetAccounts.mockResolvedValue({
                accounts: [
                    {
                        account_id: 'acc-123',
                        name: 'Plaid Checking',
                        official_name: 'Plaid Gold Checking',
                        type: 'depository',
                        subtype: 'checking',
                        balances: {
                            current: 1000,
                            available: 950,
                            limit: null,
                        },
                    },
                ],
                item: { item_id: 'item-plaid-888' },
                request_id: 'req-789',
            });
            // Mock encryption
            mockEncrypt.mockResolvedValue({
                encryptedBuffer: Buffer.from('encrypted-data'),
                keyId: 1,
            });
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                public_token: 'public-sandbox-12345',
                link_token: 'link-sandbox-12345',
                status: 'success',
            });
            await (0, index_1.default)(context, req);
            // Verify the flow completed successfully
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('success');
            // Verify token exchange was called
            expect(mockExchangePublicToken).toHaveBeenCalledWith('public-sandbox-12345');
            // Verify item details were fetched
            expect(mockGetItem).toHaveBeenCalledWith('access-sandbox-secret999');
            // Verify accounts were fetched
            expect(mockGetAccounts).toHaveBeenCalledWith('access-sandbox-secret999');
            // Verify encryption was called
            expect(mockEncrypt).toHaveBeenCalledWith('access-sandbox-secret999');
            // Verify link_token was updated to 'used'
            const updateLinkCall = mockExecuteQuery.mock.calls.find(call => call[0].includes('UPDATE link_tokens'));
            expect(updateLinkCall).toBeDefined();
            expect(updateLinkCall?.[1]?.linkToken).toBe('link-sandbox-12345');
            // Verify item was inserted
            const insertItemCall = mockExecuteQuery.mock.calls.find(call => call[0].includes('INSERT INTO items'));
            expect(insertItemCall).toBeDefined();
            expect(insertItemCall?.[1]?.clientId).toBe(5);
            expect(insertItemCall?.[1]?.plaidItemId).toBe('item-plaid-888');
        });
        it('should skip processing if link_token not found', async () => {
            mockExecuteQuery.mockImplementation(async (query) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('SELECT link_token, client_id, status')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
                }
                if (query.includes('UPDATE webhook_log')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] };
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
            });
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                public_token: 'public-sandbox-12345',
                link_token: 'link-sandbox-unknown',
                status: 'success',
            });
            await (0, index_1.default)(context, req);
            // Should return 200 but with error status (link token not found)
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('error');
            expect(mockExchangePublicToken).not.toHaveBeenCalled();
        });
        it('should skip processing if link_token already used', async () => {
            mockExecuteQuery.mockImplementation(async (query) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('SELECT link_token, client_id, status')) {
                    return {
                        recordset: [{ link_token: 'link-sandbox-12345', client_id: 5, status: 'used' }],
                        recordsets: [], output: {}, rowsAffected: [1]
                    };
                }
                if (query.includes('UPDATE webhook_log')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] };
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
            });
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                public_token: 'public-sandbox-12345',
                link_token: 'link-sandbox-12345',
                status: 'success',
            });
            await (0, index_1.default)(context, req);
            // Should succeed but not exchange token
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('success');
            expect(mockExchangePublicToken).not.toHaveBeenCalled();
        });
    });
    describe('error handling', () => {
        it('should return 500 on database errors', async () => {
            mockExecuteQuery.mockRejectedValue(new Error('Database connection failed'));
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'TEST',
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(500);
            expect(context.res?.body.error).toBe('Internal server error');
        });
        it('should still return 200 for processing errors (after logging)', async () => {
            // First calls succeed, then UPDATE fails
            mockExecuteQuery.mockImplementation(async (query) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
                }
                if (query.includes('SELECT item_id FROM items WHERE plaid_item_id')) {
                    return { recordset: [{ item_id: 1 }], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] };
                }
                if (query.includes('UPDATE items') && query.includes('SET status')) {
                    throw new Error('Update failed');
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
            });
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'test-item-123',
            });
            await (0, index_1.default)(context, req);
            // Should return 200 (we logged the webhook)
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('error');
        });
    });
});
//# sourceMappingURL=index.test.js.map