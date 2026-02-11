"use strict";
/**
 * Tests for Clients Endpoint
 *
 * @module clients/index.test
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
const index_1 = __importDefault(require("./index"));
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
            functionName: 'clients',
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
        url: 'http://localhost/api/clients',
    };
}
describe('Clients Endpoint', () => {
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
            const req = createMockRequest({ method: 'OPTIONS' });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.headers?.['Access-Control-Allow-Origin']).toBe('*');
            expect(context.res?.headers?.['Access-Control-Allow-Methods']).toContain('DELETE');
        });
    });
    describe('GET /api/clients (list)', () => {
        it('should return all clients with item counts', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    {
                        client_id: 1,
                        first_name: 'John',
                        last_name: 'Smith',
                        email: 'john@test.com',
                        item_count: 2,
                        items_needing_attention: 1,
                    },
                    {
                        client_id: 2,
                        first_name: 'Jane',
                        last_name: 'Doe',
                        email: 'jane@test.com',
                        item_count: 0,
                        items_needing_attention: 0,
                    },
                ],
                recordsets: [],
                output: {},
                rowsAffected: [2],
            });
            const context = createMockContext();
            const req = createMockRequest({ method: 'GET' });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.clients).toHaveLength(2);
            expect(context.res?.body.count).toBe(2);
        });
        it('should search by name', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    {
                        client_id: 1,
                        first_name: 'John',
                        last_name: 'Smith',
                        email: 'john@test.com',
                    },
                ],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                query: { search: 'John' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.filters.search).toBe('John');
            // Verify the search parameter was passed
            const queryCall = mockExecuteQuery.mock.calls[0];
            expect(queryCall[1]?.search).toBe('%John%');
        });
        it('should search by email', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    {
                        client_id: 1,
                        first_name: 'John',
                        last_name: 'Smith',
                        email: 'john@test.com',
                    },
                ],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                query: { search: 'john@test.com' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            const queryCall = mockExecuteQuery.mock.calls[0];
            expect(queryCall[1]?.search).toBe('%john@test.com%');
        });
        it('should filter by status', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                query: { status: 'active' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.filters.status).toBe('active');
            const queryCall = mockExecuteQuery.mock.calls[0];
            expect(queryCall[1]?.status).toBe('active');
        });
        it('should filter by hasIssues', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                query: { hasIssues: 'true' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.filters.hasIssues).toBe('true');
            // Verify subquery wrapper with WHERE clause is in the query
            const queryCall = mockExecuteQuery.mock.calls[0];
            expect(queryCall[0]).toContain('WHERE items_needing_attention > 0');
        });
    });
    describe('GET /api/clients/:id (single)', () => {
        it('should return single client', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [
                    {
                        client_id: 1,
                        first_name: 'John',
                        last_name: 'Smith',
                        email: 'john@test.com',
                        account_type: 'sole_proprietor',
                    },
                ],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: '1' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.client_id).toBe(1);
            expect(context.res?.body.first_name).toBe('John');
        });
    });
    describe('POST /api/clients (create)', () => {
        it('should create new client', async () => {
            // First call: check for duplicate email (none found)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            // Second call: insert client
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ client_id: 5 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    first_name: 'New',
                    last_name: 'Client',
                    email: 'new@test.com',
                    account_type: 'llc',
                    fiscal_year_start_date: '2025-01-01',
                    state: 'CA',
                },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(201);
            expect(context.res?.body.client_id).toBe(5);
            expect(context.res?.body.message).toBe('Client created successfully');
        });
        it('should return 400 for missing required fields', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    first_name: 'New',
                    // Missing other required fields
                },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toContain('Missing required fields');
        });
        it('should return 400 for invalid email format', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    first_name: 'New',
                    last_name: 'Client',
                    email: 'invalid-email',
                    account_type: 'llc',
                    fiscal_year_start_date: '2025-01-01',
                    state: 'CA',
                },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('Invalid email format');
        });
        it('should return 409 for duplicate email', async () => {
            // First call: check for duplicate email (found)
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ client_id: 3 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'POST',
                body: {
                    first_name: 'New',
                    last_name: 'Client',
                    email: 'existing@test.com',
                    account_type: 'llc',
                    fiscal_year_start_date: '2025-01-01',
                    state: 'CA',
                },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(409);
            expect(context.res?.body.error).toContain('already exists');
            expect(context.res?.body.existing_client_id).toBe(3);
        });
    });
    describe('PUT /api/clients/:id (update)', () => {
        it('should update client', async () => {
            // First call: check client exists
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ client_id: 1 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Second call: update
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'PUT',
                params: { id: '1' },
                body: {
                    first_name: 'Updated',
                    state: 'tx', // Test lowercase conversion
                },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.message).toBe('Client updated successfully');
        });
        it('should return 400 if no valid fields to update', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ client_id: 1 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({
                method: 'PUT',
                params: { id: '1' },
                body: {
                    invalid_field: 'value',
                },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('No valid fields to update');
        });
        it('should return 400 if client ID is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'PUT',
                body: { first_name: 'Updated' },
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('Client ID is required for updates');
        });
    });
    describe('DELETE /api/clients/:id', () => {
        it('should return 400 if client ID is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
            });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('Client ID is required for deletion');
        });
    });
    describe('Error handling', () => {
        it('should return 405 for unsupported methods', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'PATCH' });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(405);
            expect(context.res?.body.error).toBe('Method not allowed');
        });
    });
});
//# sourceMappingURL=index.test.js.map