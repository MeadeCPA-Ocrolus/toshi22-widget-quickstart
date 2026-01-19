"use strict";
/**
 * Tests for Create Link Token Endpoint
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
    createLinkToken: jest.fn(),
}));
jest.mock('../shared/encryption', () => ({
    decrypt: jest.fn(),
}));
const database_1 = require("../shared/database");
const plaid_client_1 = require("../shared/plaid-client");
const encryption_1 = require("../shared/encryption");
const index_1 = __importDefault(require("./index"));
const mockExecuteQuery = database_1.executeQuery;
const mockCreateLinkToken = plaid_client_1.createLinkToken;
const mockDecrypt = encryption_1.decrypt;
// Helper to create mock context
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
            invocationId: 'test',
            functionName: 'plaid-link-token',
            functionDirectory: '/test',
            retryContext: null,
        },
        traceContext: { traceparent: null, tracestate: null, attributes: {} },
        invocationId: 'test',
        done: jest.fn(),
        res: undefined,
    };
}
// Helper to create mock request
function createMockRequest(body, method = 'POST') {
    return { method, body, headers: {}, query: {}, params: {} };
}
describe('Create Link Token Endpoint', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
        });
    });
    describe('validation', () => {
        it('should return 400 if clientId is missing', async () => {
            const context = createMockContext();
            const req = createMockRequest({});
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(400);
            expect(context.res?.body.error).toBe('clientId is required');
        });
        it('should return 404 if client not found', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            const context = createMockContext();
            const req = createMockRequest({ clientId: 999 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(404);
            expect(context.res?.body.error).toBe('Client not found');
        });
    });
    describe('new link creation', () => {
        it('should create link token for valid client', async () => {
            // Mock client lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 5,
                        first_name: 'Aya',
                        last_name: 'Troyer',
                        email: 'aya@test.com',
                        phone_number: '+15551234567',
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock Plaid response
            mockCreateLinkToken.mockResolvedValueOnce({
                link_token: 'link-sandbox-abc123',
                hosted_link_url: 'https://secure.plaid.com/hl/abc123',
                expiration: '2025-01-15T16:00:00Z',
                request_id: 'req-123',
            });
            // Mock insert
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({ clientId: 5 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.hostedLinkUrl).toBe('https://secure.plaid.com/hl/abc123');
            expect(context.res?.body.linkToken).toBe('link-sandbox-abc123');
            expect(context.res?.body.clientName).toBe('Aya Troyer');
            expect(context.res?.body.isUpdateMode).toBe(false);
            // Verify Plaid was called with correct params
            expect(mockCreateLinkToken).toHaveBeenCalledWith({
                clientUserId: '5',
                phoneNumber: '+15551234567',
                email: 'aya@test.com',
                accessToken: undefined,
            });
        });
        it('should handle client without phone number', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 5,
                        first_name: 'John',
                        last_name: 'Smith',
                        email: 'john@test.com',
                        phone_number: null,
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockCreateLinkToken.mockResolvedValueOnce({
                link_token: 'link-sandbox-abc123',
                hosted_link_url: 'https://secure.plaid.com/hl/abc123',
                expiration: '2025-01-15T16:00:00Z',
                request_id: 'req-123',
            });
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({ clientId: 5 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(mockCreateLinkToken).toHaveBeenCalledWith({
                clientUserId: '5',
                phoneNumber: undefined,
                email: 'john@test.com',
                accessToken: undefined,
            });
        });
    });
    describe('update mode', () => {
        it('should create update mode link with access token', async () => {
            // Mock client lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 5,
                        first_name: 'Aya',
                        last_name: 'Troyer',
                        email: 'aya@test.com',
                        phone_number: '+15551234567',
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock item lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        item_id: 1,
                        client_id: 5,
                        access_token: Buffer.from('encrypted'),
                        access_token_key_id: 1,
                        institution_name: 'First Platypus Bank',
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock decrypt
            mockDecrypt.mockResolvedValueOnce('access-sandbox-secret999');
            // Mock Plaid response
            mockCreateLinkToken.mockResolvedValueOnce({
                link_token: 'link-sandbox-update123',
                hosted_link_url: 'https://secure.plaid.com/hl/update123',
                expiration: '2025-01-15T16:00:00Z',
                request_id: 'req-123',
            });
            // Mock insert
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            const context = createMockContext();
            const req = createMockRequest({ clientId: 5, itemId: 1 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(200);
            expect(context.res?.body.isUpdateMode).toBe(true);
            // Verify Plaid was called with access token
            expect(mockCreateLinkToken).toHaveBeenCalledWith({
                clientUserId: '5',
                phoneNumber: '+15551234567',
                email: 'aya@test.com',
                accessToken: 'access-sandbox-secret999',
            });
        });
        it('should return 404 if item not found', async () => {
            // Mock client lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 5,
                        first_name: 'Aya',
                        last_name: 'Troyer',
                        email: 'aya@test.com',
                        phone_number: '+15551234567',
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock item lookup - not found
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            const context = createMockContext();
            const req = createMockRequest({ clientId: 5, itemId: 999 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(404);
            expect(context.res?.body.error).toContain('Item not found');
        });
        it('should return 404 if item belongs to different client', async () => {
            // Mock client lookup
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 5,
                        first_name: 'Aya',
                        last_name: 'Troyer',
                        email: 'aya@test.com',
                        phone_number: '+15551234567',
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            // Mock item lookup - item exists but belongs to client 6, not 5
            // The query includes WHERE client_id = @clientId so it won't find it
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            const context = createMockContext();
            const req = createMockRequest({ clientId: 5, itemId: 1 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(404);
        });
    });
    describe('error handling', () => {
        it('should return 500 on Plaid API error', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                        client_id: 5,
                        first_name: 'Aya',
                        last_name: 'Troyer',
                        email: 'aya@test.com',
                        phone_number: '+15551234567',
                    }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            });
            mockCreateLinkToken.mockRejectedValueOnce(new Error('Plaid API error'));
            const context = createMockContext();
            const req = createMockRequest({ clientId: 5 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(500);
            expect(context.res?.body.error).toBe('Failed to create link token');
        });
        it('should return 500 on database error', async () => {
            mockExecuteQuery.mockRejectedValueOnce(new Error('Database connection failed'));
            const context = createMockContext();
            const req = createMockRequest({ clientId: 5 });
            await (0, index_1.default)(context, req);
            expect(context.res?.status).toBe(500);
        });
    });
});
//# sourceMappingURL=index.tests.js.map