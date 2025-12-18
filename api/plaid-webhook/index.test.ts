/**
 * Tests for Plaid Webhook Handler
 */

import { Context } from '@azure/functions';

// Mock the database module
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
}));

import { executeQuery } from '../shared/database';
import httpTrigger from './index';

const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>;

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
        it('should update item status to login_required for ITEM_LOGIN_REQUIRED', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'test-item-123',
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

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE items') && call[0].includes('SET status')
            );
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

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE items') && call[0].includes('SET status')
            );
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

            await httpTrigger(context, req as any);

            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('has_sync_updates = 1')
            );
            expect(updateCall).toBeDefined();
        });
    });

    describe('LINK webhooks', () => {
        it('should handle SESSION_FINISHED and update link_token status', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                webhook_type: 'LINK',
                webhook_code: 'SESSION_FINISHED',
                public_token: 'public-sandbox-12345',
                link_token: 'link-sandbox-12345',
                status: 'success',
            });

            await httpTrigger(context, req as any);

            // Verify link_token was updated
            const updateCall = mockExecuteQuery.mock.calls.find(
                call => call[0].includes('UPDATE link_tokens')
            );
            expect(updateCall).toBeDefined();
            expect(updateCall?.[1]?.linkToken).toBe('link-sandbox-12345');
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
            let callCount = 0;
            mockExecuteQuery.mockImplementation(async (query: string) => {
                callCount++;
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
                webhook_code: 'ITEM_LOGIN_REQUIRED',
                item_id: 'test-item-123',
            });

            await httpTrigger(context, req as any);

            // Should return 200 (we logged the webhook)
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.status).toBe('error');
        });
    });
});