/**
 * Tests for Clients Endpoint
 * 
 * @module clients/index.test
 */

import { Context } from '@azure/functions';

// Mock the database module
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
}));

import { executeQuery } from '../shared/database';
import httpTrigger from './index';

const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>;

/**
 * Create a mock Azure Function context
 */
function createMockContext(): Context {
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
    } as unknown as Context;
}

/**
 * Create a mock HTTP request
 */
function createMockRequest(options: {
    method: string;
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: any;
}) {
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
        } as any);
    });

    describe('OPTIONS (CORS preflight)', () => {
        it('should return 200 with CORS headers', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'OPTIONS' });

            await httpTrigger(context, req as any);

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
            } as any);

            const context = createMockContext();
            const req = createMockRequest({ method: 'GET' });

            await httpTrigger(context, req as any);

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
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                query: { search: 'John' },
            });

            await httpTrigger(context, req as any);

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
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                query: { search: 'john@test.com' },
            });

            await httpTrigger(context, req as any);

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
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                query: { status: 'active' },
            });

            await httpTrigger(context, req as any);

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

            await httpTrigger(context, req as any);

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
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: '1' },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.client_id).toBe(1);
            expect(context.res?.body.first_name).toBe('John');
        });

        it('should return 404 for non-existent client', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'GET',
                params: { id: '999' },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(404);
            expect(context.res?.body.error).toBe('Client not found');
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
            } as any);

            // Second call: insert client
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ client_id: 5 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

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

            await httpTrigger(context, req as any);

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

            await httpTrigger(context, req as any);

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

            await httpTrigger(context, req as any);

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
            } as any);

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

            await httpTrigger(context, req as any);

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
            } as any);

            // Second call: update
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'PUT',
                params: { id: '1' },
                body: {
                    first_name: 'Updated',
                    state: 'tx', // Test lowercase conversion
                },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.message).toBe('Client updated successfully');
        });

        it('should return 404 for non-existent client', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'PUT',
                params: { id: '999' },
                body: { first_name: 'Updated' },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(404);
        });

        it('should return 400 if no valid fields to update', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ client_id: 1 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'PUT',
                params: { id: '1' },
                body: {
                    invalid_field: 'value',
                },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('No valid fields to update');
        });

        it('should return 400 if client ID is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'PUT',
                body: { first_name: 'Updated' },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('Client ID is required for updates');
        });
    });

    describe('DELETE /api/clients/:id', () => {
        it('should delete client and cascade delete related data', async () => {
            // 1. Check client exists
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ client_id: 1, first_name: 'John', last_name: 'Smith' }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            // 2. Get item IDs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ item_id: 10 }, { item_id: 11 }],
                recordsets: [],
                output: {},
                rowsAffected: [2],
            } as any);

            // 3. Count transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 50 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            // 4. Delete transactions
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [50],
            } as any);

            // 5. Count accounts
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 5 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            // 6. Delete accounts
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [5],
            } as any);

            // 7. Count webhook logs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 10 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            // 8. Delete webhook logs
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [10],
            } as any);

            // 9. Delete items
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [2],
            } as any);

            // 10. Count link tokens
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{ count: 3 }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            // 11. Delete link tokens
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [3],
            } as any);

            // 12. Delete client
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '1' },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(200);
            expect(context.res?.body.message).toContain('deleted successfully');
            expect(context.res?.body.client_name).toBe('John Smith');
            expect(context.res?.body.deleted.transactions).toBe(50);
            expect(context.res?.body.deleted.accounts).toBe(5);
            expect(context.res?.body.deleted.items).toBe(2);
            expect(context.res?.body.deleted.link_tokens).toBe(3);
        });

        it('should return 404 for non-existent client', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            } as any);

            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
                params: { id: '999' },
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(404);
        });

        it('should return 400 if client ID is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({
                method: 'DELETE',
            });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('Client ID is required for deletion');
        });
    });

    describe('Error handling', () => {
        it('should return 500 on database errors', async () => {
            mockExecuteQuery.mockRejectedValueOnce(new Error('Database connection failed'));

            const context = createMockContext();
            const req = createMockRequest({ method: 'GET' });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(500);
            expect(context.res?.body.error).toBe('Internal server error');
            expect(context.res?.body.message).toBe('Database connection failed');
        });

        it('should return 405 for unsupported methods', async () => {
            const context = createMockContext();
            const req = createMockRequest({ method: 'PATCH' });

            await httpTrigger(context, req as any);

            expect(context.res?.status).toBe(405);
            expect(context.res?.body.error).toBe('Method not allowed');
        });
    });
});