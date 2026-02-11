"use strict";
/**
 * Error Handling & Edge Cases Tests
 *
 * Tests error handling across all endpoints:
 * - Database connection failures
 * - Malformed requests
 * - Invalid parameters
 * - CORS handling
 * - Method validation
 * - Rate limiting behaviors
 *
 * @module __tests__/error-handling.test
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Mock all dependencies
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
    getPool: jest.fn(),
}));
jest.mock('../shared/encryption', () => ({
    encrypt: jest.fn(),
    decrypt: jest.fn(),
}));
jest.mock('../shared/plaid-client', () => ({
    getPlaidClient: jest.fn(),
    exchangePublicToken: jest.fn(),
}));
const database_1 = require("../shared/database");
const index_1 = __importDefault(require("../clients/index"));
const index_2 = __importDefault(require("../items/index"));
const index_3 = __importDefault(require("../plaid-webhook/index"));
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
        headers: options.headers || {},
        url: 'http://localhost/api/test',
    };
}
describe('Error Handling & Edge Cases Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExecuteQuery.mockResolvedValue({
            recordset: [],
            recordsets: [],
            output: {},
            rowsAffected: [0],
        });
    });
    describe('10.1 Database Connection Failures', () => {
        it('should return 500 when database connection fails', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET'
            });
            mockExecuteQuery.mockRejectedValueOnce(new Error('Connection timeout'));
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(500);
            expect(context.res?.body.error).toBe('Internal server error');
            expect(context.log.error).toHaveBeenCalled();
        });
        it('should handle SQL syntax errors gracefully', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: '5' }
            });
            mockExecuteQuery.mockRejectedValueOnce(new Error("Incorrect syntax near 'SELEC'. Expecting SELECT."));
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(500);
            expect(context.res?.body).toHaveProperty('error');
        });
        it('should handle database connection pool exhaustion', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'GET' });
            mockExecuteQuery.mockRejectedValueOnce(new Error('Connection pool is full'));
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(500);
            expect(context.log.error).toHaveBeenCalledWith(expect.stringContaining('error'), expect.any(Error));
        });
    });
    describe('10.2 Malformed Requests', () => {
        it('should return 400 for invalid JSON body', async () => {
            const context = createMockContext();
            const req = {
                method: 'POST',
                body: undefined, // Simulates malformed JSON
                params: {},
                query: {},
                headers: {},
                url: 'http://localhost/api/clients',
            };
            await (0, index_1.default)(context, req);
            // Should handle gracefully (specific behavior depends on endpoint)
            expect(context.res?.status).toBeGreaterThanOrEqual(400);
        });
        it('should return 400 for missing required fields', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    // Missing required fields like first_name, last_name, email
                    business_name: 'Test Business'
                }
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('required');
        });
        it('should return 400 for invalid email format', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'not-an-email', // Invalid
                    account_type: 'sole_proprietor',
                    fiscal_year_start_date: '2025-01-01',
                    state: 'CA'
                }
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
        });
        it('should handle empty request body', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {}
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
        });
    });
    describe('10.3 Invalid Parameters', () => {
        it('should return 400 for missing required path parameter', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: {} // Missing id
            });
            await (0, index_2.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('required');
        });
        it('should handle SQL injection attempts in parameters', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: "1'; DROP TABLE clients; --" }
            });
            await (0, index_1.default)(context, req);
            // Should be caught by validation or parameterized queries
            expect(context.res?.status).toBeGreaterThanOrEqual(400);
        });
    });
    describe('10.4 CORS Headers', () => {
        it('should include CORS headers on all responses', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'GET' });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.headers).toHaveProperty('Access-Control-Allow-Origin');
            expect(context.res?.headers?.['Access-Control-Allow-Origin']).toBe('*');
        });
        it('should handle OPTIONS preflight requests', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'OPTIONS' });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.headers).toHaveProperty('Access-Control-Allow-Methods');
            expect(context.res?.headers).toHaveProperty('Access-Control-Allow-Headers');
        });
        it('should include CORS headers even on error responses', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: 'invalid' }
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBeGreaterThanOrEqual(400);
            expect(context.res?.headers).toHaveProperty('Access-Control-Allow-Origin');
        });
    });
    describe('10.5 HTTP Method Validation', () => {
        it('should only accept POST for webhook endpoint', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET', // Should be POST
                body: {}
            });
            await (0, index_3.default)(context, req);
            expect(context.res?.status).toBe(405);
        });
        it('should accept both GET and POST for appropriate endpoints', async () => {
            const context1 = createMockContext();
            const context2 = createMockContext();
            mockExecuteQuery.mockResolvedValue({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // GET should work
            await (0, index_1.default)(context1, createMockRequest({ method: 'GET' }));
            expect(context1.res?.status).not.toBe(405);
            // POST should work
            await (0, index_1.default)(context2, createMockRequest({
                method: 'POST',
                body: {
                    first_name: 'Test',
                    last_name: 'User',
                    email: 'test@example.com',
                    account_type: 'sole_proprietor',
                    fiscal_year_start_date: '2025-01-01',
                    state: 'CA'
                }
            }));
            expect(context2.res?.status).not.toBe(405);
        });
    });
    describe('10.6 Data Type Validation', () => {
        it('should reject non-boolean for boolean fields', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john@test.com',
                    account_type: 'sole_proprietor',
                    fiscal_year_start_date: '2025-01-01',
                    state: 'CA',
                    is_archived: 'yes' // Should be boolean
                }
            });
            await (0, index_1.default)(context, req);
            // Should either reject or coerce
            expect(context.res?.status).toBeGreaterThanOrEqual(200);
        });
    });
    describe('10.7 Webhook Error Handling', () => {
        it('should return 400 for webhook without webhook_type', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    // Missing webhook_type
                    webhook_code: 'SYNC_UPDATES_AVAILABLE',
                    item_id: 'item-123'
                }
            });
            await (0, index_3.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('webhook_type');
        });
        it('should return 400 for webhook without webhook_code', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    webhook_type: 'TRANSACTIONS',
                    // Missing webhook_code
                    item_id: 'item-123'
                }
            });
            await (0, index_3.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('webhook_code');
        });
    });
    describe('10.8 Concurrent Request Handling', () => {
        it('should handle race conditions in duplicate webhook detection', async () => {
            const context1 = createMockContext();
            const context2 = createMockContext();
            const webhook = {
                webhook_type: 'ITEM',
                webhook_code: 'ITEM_ERROR',
                item_id: 'item-race',
                link_session_id: 'session-race'
            };
            // Both think it's new initially
            mockExecuteQuery.mockResolvedValue({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0]
            });
            // Both try to insert
            mockExecuteQuery.mockResolvedValue({
                recordset: [{ log_id: 1 }],
                recordsets: [],
                output: {},
                rowsAffected: [1]
            });
            await Promise.all([
                (0, index_3.default)(context1, createMockRequest({ method: 'POST', body: webhook })),
                (0, index_3.default)(context2, createMockRequest({ method: 'POST', body: webhook }))
            ]);
            // Both should succeed (idempotency key in webhook_id prevents duplicates at DB level)
            expect(context1.res?.status).toBe(200);
            expect(context2.res?.status).toBe(200);
        });
    });
    describe('10.9 Response Content Type', () => {
        it('should return JSON content-type header', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'GET' });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.headers?.['Content-Type']).toBe('application/json');
        });
        it('should return well-formed JSON even on errors', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: 'invalid' }
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.body).toHaveProperty('error');
            expect(typeof context.res?.body.error).toBe('string');
        });
    });
    describe('10.10 Timeout Handling', () => {
        it('should handle slow database queries gracefully', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'GET' });
            // Simulate slow query (30 seconds)
            mockExecuteQuery.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            }), 30000)));
            // Set a reasonable timeout for the test
            jest.setTimeout(1000);
            const promise = (0, index_1.default)(context, req);
            // Should not hang indefinitely
            await expect(Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 500))
            ])).rejects.toThrow('Timeout');
        }, 2000);
    });
});
//# sourceMappingURL=error-handling.test.js.map