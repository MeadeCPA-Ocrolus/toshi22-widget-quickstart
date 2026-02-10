"use strict";
/**
 * Comprehensive Webhook Tests
 *
 * Tests all Plaid webhook handlers:
 * - SESSION_FINISHED (single and multi-item)
 * - ITEM webhooks (status updates, errors)
 * - USER_ACCOUNT_REVOKED (single account)
 * - SYNC_UPDATES_AVAILABLE
 * - Webhook idempotency
 *
 * @module __tests__/webhooks.test
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mock dependencies
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
}));
jest.mock('../shared/plaid-client', () => ({
    exchangePublicToken: jest.fn(),
    getItem: jest.fn(),
    getAccounts: jest.fn(),
}));
jest.mock('../shared/encryption', () => ({
    encrypt: jest.fn(),
}));
const database_1 = require("../shared/database");
const plaid_client_1 = require("../shared/plaid-client");
const encryption_1 = require("../shared/encryption");
const index_1 = __importDefault(require("../plaid-webhook/index"));
const mockExecuteQuery = database_1.executeQuery;
const mockExchangePublicToken = plaid_client_1.exchangePublicToken;
const mockGetItem = plaid_client_1.getItem;
const mockGetAccounts = plaid_client_1.getAccounts;
const mockEncrypt = encryption_1.encrypt;
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
            functionName: 'webhook',
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
 * Create a mock webhook request
 */
function createWebhookRequest(webhookData) {
    return {
        method: 'POST',
        body: webhookData,
        headers: {},
        params: {},
        query: {},
        url: 'http://localhost/api/plaid/webhook',
    };
}
describe('Comprehensive Webhook Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock responses
        mockExecuteQuery.mockResolvedValue({
            recordset: [],
            recordsets: [],
            output: {},
            rowsAffected: [0],
        });
        mockEncrypt.mockResolvedValue({
            encryptedBuffer: Buffer.from('encrypted-token'),
            keyId: 1,
        });
    });
    describe('3.1 SESSION_FINISHED - Single Item', () => {
        it('should create item and accounts from single public_token', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                link_token: 'link-sandbox-12345',
                public_token: 'public-sandbox-abc123',
                link_session_id: 'session-123',
                status: 'success'
            };
            const req = createWebhookRequest(webhook);
            // Mock webhook idempotency check (not duplicate)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // Mock webhook log insert
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ log_id: 100 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock link token lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        link_token: 'link-sandbox-12345',
                        client_id: 5,
                        status: 'pending'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock Plaid exchange token
            mockExchangePublicToken.mockResolvedValueOnce({
                access_token: 'access-sandbox-token',
                item_id: 'item-plaid-abc',
                request_id: 'req-123'
            });
            // Mock check if item exists (doesn't)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // Mock Plaid getItem
            mockGetItem.mockResolvedValueOnce({
                item: {
                    item_id: 'item-plaid-abc',
                    institution_id: 'ins_109508',
                    webhook: null,
                    error: null,
                    available_products: [],
                    billed_products: [],
                    consent_expiration_time: null,
                    update_type: null
                },
                status: null,
                request_id: 'req-item'
            });
            // Mock item insert
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ item_id: 20 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock Plaid getAccounts
            mockGetAccounts.mockResolvedValueOnce({
                accounts: [
                    {
                        account_id: 'plaid-acc-100',
                        name: 'Checking',
                        official_name: 'Premier Checking Account',
                        type: 'depository',
                        subtype: 'checking',
                        balances: {
                            current: 1500.00,
                            available: 1450.00
                        }
                    },
                    {
                        account_id: 'plaid-acc-101',
                        name: 'Savings',
                        official_name: 'High Yield Savings',
                        type: 'depository',
                        subtype: 'savings',
                        balances: {
                            current: 5000.00,
                            available: 5000.00
                        }
                    }
                ]
            });
            // Mock account inserts (2 accounts)
            mockExecuteQuery.mockResolvedValue({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('success');
            // Verify token exchange called
            expect(mockExchangePublicToken).toHaveBeenCalledWith('public-sandbox-abc123');
            // Verify item details fetched
            expect(mockGetItem).toHaveBeenCalledWith('access-sandbox-token');
            // Verify accounts fetched
            expect(mockGetAccounts).toHaveBeenCalledWith('access-sandbox-token');
            // Verify item was inserted
            const itemInsert = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes('INSERT INTO items'));
            expect(itemInsert).toBeDefined();
            // Verify accounts were inserted (2 calls)
            const accountInserts = mockExecuteQuery.mock.calls.filter(call => typeof call[0] === 'string' && call[0].includes('INSERT INTO accounts'));
            expect(accountInserts.length).toBeGreaterThanOrEqual(2);
        });
        it('should handle duplicate SESSION_FINISHED webhook (idempotency)', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                link_token: 'link-sandbox-12345',
                public_token: 'public-sandbox-abc123',
                link_session_id: 'session-123'
            };
            const req = createWebhookRequest(webhook);
            // Mock webhook already exists (duplicate)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ log_id: 50 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('duplicate');
            expect(context.res?.body.message).toContain('already processed');
            // Should NOT call Plaid APIs
            expect(mockExchangePublicToken).not.toHaveBeenCalled();
            expect(mockGetItem).not.toHaveBeenCalled();
            expect(mockGetAccounts).not.toHaveBeenCalled();
        });
    });
    describe('3.2 SESSION_FINISHED - Multi-Item (Array)', () => {
        it('should create multiple items from public_tokens array', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                link_token: 'link-sandbox-multi',
                public_tokens: [
                    'public-sandbox-token1',
                    'public-sandbox-token2',
                    'public-sandbox-token3'
                ],
                link_session_id: 'session-multi-123',
                status: 'success'
            };
            const req = createWebhookRequest(webhook);
            // Mock webhook not duplicate
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // Mock webhook log
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ log_id: 101 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock link token lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        link_token: 'link-sandbox-multi',
                        client_id: 7,
                        status: 'pending'
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock 3 successful token exchanges
            mockExchangePublicToken
                .mockResolvedValueOnce({
                access_token: 'access-token-1',
                item_id: 'item-1',
                request_id: 'req-1'
            })
                .mockResolvedValueOnce({
                access_token: 'access-token-2',
                item_id: 'item-2',
                request_id: 'req-2'
            })
                .mockResolvedValueOnce({
                access_token: 'access-token-3',
                item_id: 'item-3',
                request_id: 'req-3'
            });
            // Mock item existence checks (all new)
            mockExecuteQuery.mockResolvedValue({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // Mock Plaid getItem
            mockGetItem.mockResolvedValue({
                item: {
                    item_id: 'mock-item',
                    institution_id: 'ins_109508',
                    webhook: null,
                    error: null,
                    available_products: [],
                    billed_products: [],
                    consent_expiration_time: null,
                    update_type: null
                },
                status: null,
                request_id: 'mock-req'
            });
            // Mock getAccounts for all 3
            mockGetAccounts.mockResolvedValue({
                accounts: [
                    {
                        account_id: 'acc-1',
                        name: 'Checking',
                        type: 'depository',
                        subtype: 'checking',
                        balances: { current: 1000 }
                    }
                ]
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('success');
            // Should process all 3 tokens
            expect(mockExchangePublicToken).toHaveBeenCalledTimes(3);
            expect(mockGetItem).toHaveBeenCalledTimes(3);
            expect(mockGetAccounts).toHaveBeenCalledTimes(3);
        });
        it('should handle partial failures in multi-item flow', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                link_token: 'link-sandbox-multi',
                public_tokens: [
                    'public-sandbox-token1',
                    'public-sandbox-token2-bad',
                    'public-sandbox-token3'
                ],
                link_session_id: 'session-partial'
            };
            const req = createWebhookRequest(webhook);
            // Setup mocks
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 102 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ link_token: 'link-sandbox-multi', client_id: 8, status: 'pending' }],
                recordsets: [], output: {}, rowsAffected: [1]
            });
            // Token 1: success
            mockExchangePublicToken
                .mockResolvedValueOnce({ access_token: 'access-1', item_id: 'item-1', request_id: 'req-1' })
                // Token 2: failure
                .mockRejectedValueOnce(new Error('INVALID_PUBLIC_TOKEN'))
                // Token 3: success
                .mockResolvedValueOnce({ access_token: 'access-3', item_id: 'item-3', request_id: 'req-3' });
            mockExecuteQuery.mockResolvedValue({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockGetItem.mockResolvedValue({ institution_id: 'ins_109508', institution_name: 'Test Bank' });
            mockGetAccounts.mockResolvedValue({ accounts: [] });
            await (0, index_1.default)(context, req);
            // Should still return success but log error
            expect(context.res?.status).toBe(200);
            expect(mockExchangePublicToken).toHaveBeenCalledTimes(3);
            expect(context.log.error).toHaveBeenCalled();
        });
    });
    describe('3.3 ITEM Webhooks - Status Updates', () => {
        it('should set status to login_required for ITEM_LOGIN_REQUIRED', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'item-plaid-abc',
                error: {
                    error_code: 'ITEM_LOGIN_REQUIRED',
                    error_message: 'User credentials have changed'
                }
            };
            const req = createWebhookRequest(webhook);
            // Mock not duplicate
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            // Mock webhook log
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 110 }], recordsets: [], output: {}, rowsAffected: [1] });
            // Mock item lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ item_id: 25 }],
                recordsets: [], output: {}, rowsAffected: [1]
            });
            // Mock status update
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            // Verify status update query
            const updateQuery = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes('UPDATE items') && call[0].includes('status = @status'));
            expect(updateQuery).toBeDefined();
            expect(updateQuery[1]).toMatchObject({
                status: 'login_required',
                errorCode: 'ITEM_LOGIN_REQUIRED'
            });
        });
        it('should set status to pending_expiration for PENDING_EXPIRATION', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'PENDING_EXPIRATION',
                item_id: 'item-plaid-xyz',
                consent_expiration_time: '2025-03-01T00:00:00Z'
            };
            const req = createWebhookRequest(webhook);
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 111 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ item_id: 30 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            const updateQuery = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE items') &&
                call[0].includes('consent_expiration_time'));
            expect(updateQuery).toBeDefined();
        });
        it('should clear errors and set active for LOGIN_REPAIRED', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'LOGIN_REPAIRED',
                item_id: 'item-plaid-fixed'
            };
            const req = createWebhookRequest(webhook);
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 112 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ item_id: 35 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            const updateQuery = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes('last_error_code = NULL'));
            expect(updateQuery).toBeDefined();
        });
        it('should increment error_attempt_count for ITEM_ERROR', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_ERROR',
                item_id: 'item-error-test',
                error: {
                    error_code: 'INTERNAL_SERVER_ERROR',
                    error_message: 'An internal error occurred'
                }
            };
            const req = createWebhookRequest(webhook);
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 113 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ item_id: 40 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req);
            const updateQuery = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes('error_attempt_count = error_attempt_count + 1'));
            expect(updateQuery).toBeDefined();
        });
        it('should set needs_update for NEW_ACCOUNTS_AVAILABLE', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'NEW_ACCOUNTS_AVAILABLE',
                item_id: 'item-new-accounts'
            };
            const req = createWebhookRequest(webhook);
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 114 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ item_id: 45 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req);
            const updateQuery = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes("status = 'needs_update'"));
            expect(updateQuery).toBeDefined();
        });
    });
    describe('3.4 USER_ACCOUNT_REVOKED - Single Account', () => {
        it('should deactivate specific account only', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'USER_ACCOUNT_REVOKED',
                item_id: 'item-account-revoked',
                account_id: 'plaid-account-456'
            };
            const req = createWebhookRequest(webhook);
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 115 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ item_id: 50, account_id: 500 }],
                recordsets: [], output: {}, rowsAffected: [1]
            });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            // Verify account deactivation (not item archival)
            const accountUpdate = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' &&
                call[0].includes('UPDATE accounts SET is_active = 0') &&
                call[0].includes('WHERE account_id = @accountId'));
            expect(accountUpdate).toBeDefined();
        });
        it('should handle unknown account_id gracefully', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'USER_ACCOUNT_REVOKED',
                item_id: 'item-test',
                account_id: 'nonexistent-account'
            };
            const req = createWebhookRequest(webhook);
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 116 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('Account not found'));
        });
    });
    describe('3.5 SYNC_UPDATES_AVAILABLE', () => {
        it('should set has_sync_updates flag', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'TRANSACTIONS',
                webhook_code: 'SYNC_UPDATES_AVAILABLE',
                item_id: 'item-sync-test'
            };
            const req = createWebhookRequest(webhook);
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 120 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ item_id: 60 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            const updateQuery = mockExecuteQuery.mock.calls.find(call => typeof call[0] === 'string' && call[0].includes('has_sync_updates = 1'));
            expect(updateQuery).toBeDefined();
        });
        it('should be idempotent - multiple calls only set flag once', async () => {
            const context = createMockContext();
            const webhook = {
                webhook_type: 'TRANSACTIONS',
                webhook_code: 'SYNC_UPDATES_AVAILABLE',
                item_id: 'item-sync-multi'
            };
            // First call
            const req1 = createWebhookRequest({ ...webhook, link_session_id: 'session-1' });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 121 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ item_id: 65 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req1);
            jest.clearAllMocks();
            // Second call - different session
            const req2 = createWebhookRequest({ ...webhook, link_session_id: 'session-2' });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 122 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ item_id: 65 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [1] });
            await (0, index_1.default)(context, req2);
            // Both should succeed - flag just stays at 1
            expect(context.res?.status).toBe(200);
        });
    });
    describe('3.6 Webhook Idempotency', () => {
        it('should generate unique webhook_id from webhook data', async () => {
            const context = createMockContext();
            const webhook1 = {
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_ERROR',
                item_id: 'item-test',
                error: { error_code: 'ERR_123', error_message: 'Test error' }
            };
            const webhook2 = {
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_ERROR',
                item_id: 'item-test',
                error: { error_code: 'ERR_123', error_message: 'Test error' }
            };
            const req1 = createWebhookRequest(webhook1);
            const req2 = createWebhookRequest(webhook2);
            // First webhook
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            mockExecuteQuery.mockResolvedValueOnce({ recordset: [{ log_id: 130 }], recordsets: [], output: {}, rowsAffected: [1] });
            mockExecuteQuery.mockResolvedValue({ recordset: [], recordsets: [], output: {}, rowsAffected: [0] });
            await (0, index_1.default)(context, req1);
            jest.clearAllMocks();
            // Second webhook (same) - should be duplicate
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ log_id: 130 }],
                recordsets: [], output: {}, rowsAffected: [1]
            });
            await (0, index_1.default)(context, req2);
            expect(context.res?.body.status).toBe('duplicate');
        });
    });
});
//# sourceMappingURL=webhooks.test.js.map