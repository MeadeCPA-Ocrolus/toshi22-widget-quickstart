/**
 * Tests for Plaid Webhook Handler
 */

import { Context } from '@azure/functions';

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

import { executeQuery } from '../shared/database';
import { exchangePublicToken, getItem, getAccounts } from '../shared/plaid-client';
import { encrypt } from '../shared/encryption';
import httpTrigger from './index';

const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>;
const mockExchangePublicToken = exchangePublicToken as jest.MockedFunction<typeof exchangePublicToken>;
const mockGetItem = getItem as jest.MockedFunction<typeof getItem>;
const mockGetAccounts = getAccounts as jest.MockedFunction<typeof getAccounts>;
const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;

// Helper to create a mock Azure Function context
function createMockContext(): Context {
    return {
        log: Object.assign(
            jest.fn(),
            {
                error: jest.fn(),
                warn: jest.fn(),
                info: jest.fn(),
                verbose: jest.fn(),
            }
        ),
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
    } as unknown as Context;
}

// Helper to create a mock HTTP request
function createMockRequest(body: any, method = 'POST') {
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
        mockExecuteQuery.mockImplementation(async (query: string) => {
            if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
            }
            if (query.includes('SELECT item_id FROM items WHERE plaid_item_id')) {
                return { recordset: [{ item_id: 1 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
            }
            if (query.includes('INSERT INTO webhook_log')) {
                return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
            }
            if (query.includes('UPDATE')) {
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] } as any;
            }
            return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
        });
    });

    describe('HTTP method handling', () => {
        it('should return 200 for OPTIONS (CORS preflight)', async () => {
            const context = createMockContext();
            const req = createMockRequest({}, 'OPTIONS');

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.headers?.['Access-Control-Allow-Origin']).toBe('*');
        });

        it('should return 405 for non-POST methods', async () => {
            const context = createMockContext();
            const req = createMockRequest({}, 'GET');

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(405);
            expect(context.res?.body.error).toBe('Method not allowed');
        });
    });

    describe('webhook validation', () => {
        it('should return 400 if webhook_type is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({ webhook_code: 'TEST' });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('Missing');
        });

        it('should return 400 if webhook_code is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({ webhook_type: 'ITEM' });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('Missing');
        });
    });

    describe('idempotency', () => {
        it('should return duplicate status for already processed webhooks', async () => {
            // Mock: webhook already exists
            mockExecuteQuery.mockImplementation(async (query: string) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [{ log_id: 456 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
            });

            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'test-item-123',
            });

            await httpTrigger(context, req as any);

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

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('success');
            expect(context.res?.body.log_id).toBe(123);
        });
    });

    describe('ITEM webhooks', () => {
        it('should update item status to login_required for PENDING_DISCONNECT', async () => {
            // PENDING_DISCONNECT is a standalone webhook (not under ERROR)
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'PENDING_DISCONNECT',
                item_id: 'test-item-123',
                reason: 'INSTITUTION_TOKEN_EXPIRATION',
            });

            await httpTrigger(context, req as any);

            // Verify UPDATE was called with correct status
            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE items') && call[0].includes('SET status')
            );
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

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE items') && call[0].includes('SET status')
            );
            expect(updateCall?.[1]?.status).toBe('active');
        });

        it('should update item status to login_required for ERROR with ITEM_LOGIN_REQUIRED', async () => {
            // IMPORTANT: ITEM_LOGIN_REQUIRED comes as webhook_code: 'ERROR' 
            // with error.error_code: 'ITEM_LOGIN_REQUIRED'
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ERROR',  // The webhook_code is ERROR
                item_id: 'test-item-123',
                error: {
                    error_type: 'ITEM_ERROR',
                    error_code: 'ITEM_LOGIN_REQUIRED',  // The specific error is here
                    error_message: 'User needs to re-authenticate',
                },
            });

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE items') && call[0].includes('SET status')
            );
            expect(updateCall?.[1]?.status).toBe('login_required');  // Should be login_required, not error
            expect(updateCall?.[1]?.errorCode).toBe('ITEM_LOGIN_REQUIRED');
        });

        it('should update item status to error for ERROR with other error codes', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ERROR',
                item_id: 'test-item-123',
                error: {
                    error_type: 'ITEM_ERROR',
                    error_code: 'ITEM_NOT_SUPPORTED',
                    error_message: 'Item not supported',
                },
            });

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE items') && call[0].includes('SET status')
            );
            expect(updateCall?.[1]?.status).toBe('error');
            expect(updateCall?.[1]?.errorCode).toBe('ITEM_NOT_SUPPORTED');
        });

        it('should update item status to archived for USER_PERMISSION_REVOKED', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'USER_PERMISSION_REVOKED',
                item_id: 'test-item-123',
            });

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE items') && call[0].includes('SET status')
            );
            expect(updateCall?.[1]?.status).toBe('archived');
        });

        it('should mark specific account as inactive for USER_ACCOUNT_REVOKED', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'USER_ACCOUNT_REVOKED',
                item_id: 'test-item-123',
                account_id: 'test-account-456',  // Specific account that was revoked
            });

            await httpTrigger(context, req as any);

            // Verify UPDATE was called on accounts table (not items table)
            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE accounts') && call[0].includes('is_active = 0')
            );
            expect(updateCall).toBeDefined();
            expect(updateCall?.[1]?.plaidAccountId).toBe('test-account-456');
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

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('has_sync_updates = 1')
            );
            expect(updateCall).toBeDefined();
        });
    });

    describe('LINK webhooks', () => {
        it('should handle SESSION_FINISHED with full token exchange flow', async () => {
            // Setup mocks for the full SESSION_FINISHED flow
            mockExecuteQuery.mockImplementation(async (query: string) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('SELECT link_token, client_id, status')) {
                    return { 
                        recordset: [{ link_token: 'link-sandbox-12345', client_id: 5, status: 'pending' }], 
                        recordsets: [], output: {}, rowsAffected: [1] 
                    } as any;
                }
                if (query.includes('SELECT item_id FROM items WHERE plaid_item_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
                }
                if (query.includes('INSERT INTO items')) {
                    return { recordset: [{ item_id: 1 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('SELECT account_id FROM accounts')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
                }
                if (query.includes('INSERT INTO accounts')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('UPDATE link_tokens')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('UPDATE webhook_log')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
            });

            // Mock Plaid client functions
            mockExchangePublicToken.mockResolvedValue({
                access_token: 'access-sandbox-secret999',
                item_id: 'item-plaid-888',
                request_id: 'req-123',
            } as any);

            mockGetItem.mockResolvedValue({
                item: {
                    item_id: 'item-plaid-888',
                    institution_id: 'ins_109508',
                    institution_name: 'First Platypus Bank',
                },
                request_id: 'req-456',
            } as any);

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
            } as any);

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

            await httpTrigger(context, req as any);

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
            const updateLinkCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE link_tokens')
            );
            expect(updateLinkCall).toBeDefined();
            expect(updateLinkCall?.[1]?.linkToken).toBe('link-sandbox-12345');

            // Verify item was inserted
            const insertItemCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('INSERT INTO items')
            );
            expect(insertItemCall).toBeDefined();
            expect(insertItemCall?.[1]?.clientId).toBe(5);
            expect(insertItemCall?.[1]?.plaidItemId).toBe('item-plaid-888');
        });

        it('should skip processing if link_token not found', async () => {
            mockExecuteQuery.mockImplementation(async (query: string) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('SELECT link_token, client_id, status')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
                }
                if (query.includes('UPDATE webhook_log')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
            });

            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                public_token: 'public-sandbox-12345',
                link_token: 'link-sandbox-unknown',
                status: 'success',
            });

            await httpTrigger(context, req as any);

            // Should return 200 but with error status (link token not found)
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('error');
            expect(mockExchangePublicToken).not.toHaveBeenCalled();
        });

        it('should skip processing if link_token already used', async () => {
            mockExecuteQuery.mockImplementation(async (query: string) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('SELECT link_token, client_id, status')) {
                    return { 
                        recordset: [{ link_token: 'link-sandbox-12345', client_id: 5, status: 'used' }], 
                        recordsets: [], output: {}, rowsAffected: [1] 
                    } as any;
                }
                if (query.includes('UPDATE webhook_log')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
            });

            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                public_token: 'public-sandbox-12345',
                link_token: 'link-sandbox-12345',
                status: 'success',
            });

            await httpTrigger(context, req as any);

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

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(500);
            expect(context.res?.body.error).toBe('Internal server error');
        });

        it('should still return 200 for processing errors (after logging)', async () => {
            // First calls succeed, then UPDATE fails
            mockExecuteQuery.mockImplementation(async (query: string) => {
                if (query.includes('SELECT log_id FROM webhook_log WHERE webhook_id')) {
                    return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
                }
                if (query.includes('SELECT item_id FROM items WHERE plaid_item_id')) {
                    return { recordset: [{ item_id: 1 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('INSERT INTO webhook_log')) {
                    return { recordset: [{ log_id: 123 }], recordsets: [], output: {}, rowsAffected: [1] } as any;
                }
                if (query.includes('UPDATE items') && query.includes('SET status')) {
                    throw new Error('Update failed');
                }
                return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] } as any;
            });

            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'PENDING_DISCONNECT',
                item_id: 'test-item-123',
            });

            await httpTrigger(context, req as any);

            // Should return 200 (we logged the webhook)
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('error');
        });
    });
});