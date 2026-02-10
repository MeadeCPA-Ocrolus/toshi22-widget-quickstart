"use strict";
/**
 * Plaid Client & API Wrapper Tests
 *
 * Tests the Plaid API client wrapper functions:
 * - Token exchange
 * - Item retrieval
 * - Accounts retrieval
 * - Link token creation
 * - Update mode
 *
 * @module __tests__/plaid-client.test
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Mock the plaid SDK
jest.mock('plaid', () => {
    return {
        Configuration: jest.fn(),
        PlaidApi: jest.fn(),
        Products: {
            Transactions: 'transactions',
            Auth: 'auth'
        },
        PlaidEnvironments: {
            sandbox: 'https://sandbox.plaid.com',
            development: 'https://development.plaid.com',
            production: 'https://production.plaid.com'
        },
        CountryCode: {
            Us: 'US'
        }
    };
});
const plaid_1 = require("plaid");
const plaid_client_1 = require("../shared/plaid-client");
const mockPlaidApi = plaid_1.PlaidApi;
describe('Plaid Client & API Wrapper Tests', () => {
    let mockPlaidInstance;
    beforeEach(() => {
        jest.clearAllMocks();
        // Create mock Plaid client instance
        mockPlaidInstance = {
            itemPublicTokenExchange: jest.fn(),
            itemGet: jest.fn(),
            accountsGet: jest.fn(),
            linkTokenCreate: jest.fn(),
            itemRemove: jest.fn(),
        };
        mockPlaidApi.mockImplementation(() => mockPlaidInstance);
        // Set required env vars
        process.env.PLAID_CLIENT_ID = 'test-client-id';
        process.env.PLAID_SECRET = 'test-secret';
        process.env.PLAID_ENV = 'sandbox';
        process.env.PLAID_WEBHOOK_URL = 'https://test.com/webhook';
    });
    describe('5.1 Token Exchange', () => {
        it('should successfully exchange public token for access token', async () => {
            const mockResponse = {
                data: {
                    access_token: 'access-sandbox-abc123',
                    item_id: 'item-plaid-xyz789',
                    request_id: 'req-123'
                }
            };
            mockPlaidInstance.itemPublicTokenExchange.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.exchangePublicToken)('public-sandbox-token-test');
            expect(result.access_token).toBe('access-sandbox-abc123');
            expect(result.item_id).toBe('item-plaid-xyz789');
            expect(mockPlaidInstance.itemPublicTokenExchange).toHaveBeenCalledWith({
                public_token: 'public-sandbox-token-test'
            });
        });
        it('should handle invalid public token error', async () => {
            const plaidError = {
                response: {
                    data: {
                        error_code: 'INVALID_PUBLIC_TOKEN',
                        error_message: 'The provided public token is invalid',
                        display_message: null
                    }
                }
            };
            mockPlaidInstance.itemPublicTokenExchange.mockRejectedValueOnce(plaidError);
            await expect((0, plaid_client_1.exchangePublicToken)('invalid-token')).rejects.toMatchObject({
                response: {
                    data: {
                        error_code: 'INVALID_PUBLIC_TOKEN'
                    }
                }
            });
        });
        it('should handle expired public token', async () => {
            const plaidError = {
                response: {
                    data: {
                        error_code: 'INVALID_PUBLIC_TOKEN',
                        error_message: 'Provided public token has expired',
                        display_message: 'Token expired. Please reconnect your account.'
                    }
                }
            };
            mockPlaidInstance.itemPublicTokenExchange.mockRejectedValueOnce(plaidError);
            await expect((0, plaid_client_1.exchangePublicToken)('expired-token')).rejects.toBeDefined();
        });
        it('should handle network errors', async () => {
            mockPlaidInstance.itemPublicTokenExchange.mockRejectedValueOnce(new Error('Network request failed'));
            await expect((0, plaid_client_1.exchangePublicToken)('public-token')).rejects.toThrow('Network request failed');
        });
    });
    describe('5.2 Item Retrieval', () => {
        it('should successfully retrieve item details', async () => {
            const mockResponse = {
                data: {
                    item: {
                        item_id: 'item-abc123',
                        institution_id: 'ins_109508',
                        webhook: 'https://test.com/webhook',
                        error: null,
                        available_products: ['transactions', 'auth'],
                        billed_products: ['transactions'],
                        consent_expiration_time: null,
                        update_type: 'background'
                    },
                    status: {
                        transactions: {
                            last_successful_update: '2025-01-15T10:30:00Z',
                            last_failed_update: null
                        }
                    },
                    request_id: 'req-456'
                }
            };
            mockPlaidInstance.itemGet.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.getItem)('access-sandbox-token');
            // ItemGetResponse.data contains the whole response
            expect(result.item).toBeDefined();
            expect(result.item.item_id).toBe('item-abc123');
            expect(result.item.institution_id).toBe('ins_109508');
            expect(mockPlaidInstance.itemGet).toHaveBeenCalledWith({
                access_token: 'access-sandbox-token'
            });
        });
        it('should handle item with error state', async () => {
            const mockResponse = {
                data: {
                    item: {
                        item_id: 'item-error',
                        institution_id: 'ins_109508',
                        webhook: null,
                        error: {
                            error_code: 'ITEM_LOGIN_REQUIRED',
                            error_message: 'Item requires user login',
                            display_message: null
                        },
                        available_products: [],
                        billed_products: [],
                        consent_expiration_time: null,
                        update_type: null
                    },
                    request_id: 'req-error'
                }
            };
            mockPlaidInstance.itemGet.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.getItem)('access-token-needs-reauth');
            expect(result.item.error).toBeDefined();
            expect(result.item.error?.error_code).toBe('ITEM_LOGIN_REQUIRED');
        });
        it('should handle revoked access token', async () => {
            const plaidError = {
                response: {
                    data: {
                        error_code: 'INVALID_ACCESS_TOKEN',
                        error_message: 'Access token has been revoked'
                    }
                }
            };
            mockPlaidInstance.itemGet.mockRejectedValueOnce(plaidError);
            await expect((0, plaid_client_1.getItem)('revoked-token')).rejects.toMatchObject({
                response: {
                    data: {
                        error_code: 'INVALID_ACCESS_TOKEN'
                    }
                }
            });
        });
    });
    describe('5.3 Accounts Retrieval', () => {
        it('should successfully retrieve all accounts', async () => {
            const mockResponse = {
                data: {
                    accounts: [
                        {
                            account_id: 'acc-checking-123',
                            name: 'Premier Checking',
                            official_name: 'Premier Plus Checking Account',
                            type: 'depository',
                            subtype: 'checking',
                            balances: {
                                available: 1450.00,
                                current: 1500.00,
                                limit: null,
                                iso_currency_code: 'USD'
                            }
                        },
                        {
                            account_id: 'acc-savings-456',
                            name: 'High Yield Savings',
                            official_name: 'High Yield Savings Account',
                            type: 'depository',
                            subtype: 'savings',
                            balances: {
                                available: 5000.00,
                                current: 5000.00,
                                limit: null,
                                iso_currency_code: 'USD'
                            }
                        },
                        {
                            account_id: 'acc-credit-789',
                            name: 'Rewards Card',
                            official_name: 'Platinum Rewards Credit Card',
                            type: 'credit',
                            subtype: 'credit card',
                            balances: {
                                available: 8500.00,
                                current: 1500.00,
                                limit: 10000.00,
                                iso_currency_code: 'USD'
                            }
                        }
                    ],
                    item: {
                        item_id: 'item-abc123'
                    },
                    request_id: 'req-789'
                }
            };
            mockPlaidInstance.accountsGet.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.getAccounts)('access-sandbox-token');
            expect(result.accounts).toHaveLength(3);
            expect(result.accounts[0].account_id).toBe('acc-checking-123');
            expect(result.accounts[0].type).toBe('depository');
            expect(result.accounts[0].balances.current).toBe(1500.00);
            expect(result.accounts[2].type).toBe('credit');
            expect(result.accounts[2].balances.limit).toBe(10000.00);
            expect(mockPlaidInstance.accountsGet).toHaveBeenCalledWith({
                access_token: 'access-sandbox-token'
            });
        });
        it('should handle item with no accounts', async () => {
            const mockResponse = {
                data: {
                    accounts: [],
                    item: {
                        item_id: 'item-no-accounts'
                    }
                }
            };
            mockPlaidInstance.accountsGet.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.getAccounts)('access-token-no-accounts');
            expect(result.accounts).toEqual([]);
        });
        it('should handle accounts with missing balance data', async () => {
            const mockResponse = {
                data: {
                    accounts: [
                        {
                            account_id: 'acc-incomplete',
                            name: 'Account',
                            type: 'depository',
                            subtype: 'checking',
                            balances: {
                                available: null,
                                current: null,
                                limit: null,
                                iso_currency_code: 'USD'
                            }
                        }
                    ]
                }
            };
            mockPlaidInstance.accountsGet.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.getAccounts)('access-token');
            expect(result.accounts[0].balances.current).toBeNull();
            expect(result.accounts[0].balances.available).toBeNull();
        });
    });
    describe('5.4 Link Token Creation', () => {
        it('should create link token for new item (no access_token)', async () => {
            const mockResponse = {
                data: {
                    link_token: 'link-sandbox-new-12345',
                    expiration: '2025-02-07T10:00:00Z',
                    request_id: 'req-link-1'
                }
            };
            mockPlaidInstance.linkTokenCreate.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.createLinkToken)({
                clientUserId: '5',
                email: 'john@example.com'
            });
            expect(result.link_token).toBe('link-sandbox-new-12345');
            expect(result.expiration).toBeDefined();
            const createCall = mockPlaidInstance.linkTokenCreate.mock.calls[0][0];
            expect(createCall.user).toEqual({
                client_user_id: '5'
            });
            expect(createCall.client_name).toContain('Meade CPA');
        });
        it('should create update mode link token with access_token', async () => {
            const mockResponse = {
                data: {
                    link_token: 'link-sandbox-update-67890',
                    expiration: '2025-02-07T10:00:00Z',
                    request_id: 'req-link-2'
                }
            };
            mockPlaidInstance.linkTokenCreate.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.createLinkToken)({
                clientUserId: '10',
                email: 'jane@example.com',
                accessToken: 'access-existing-item'
            });
            expect(result.link_token).toBe('link-sandbox-update-67890');
            const createCall = mockPlaidInstance.linkTokenCreate.mock.calls[0][0];
            expect(createCall.access_token).toBe('access-existing-item');
        });
        it('should create link token with accountSelectionEnabled for new accounts', async () => {
            const mockResponse = {
                data: {
                    link_token: 'link-sandbox-account-select',
                    expiration: '2025-02-07T10:00:00Z',
                    request_id: 'req-link-3'
                }
            };
            mockPlaidInstance.linkTokenCreate.mockResolvedValueOnce(mockResponse);
            const result = await (0, plaid_client_1.createLinkToken)({
                clientUserId: '15',
                email: 'bob@example.com',
                accessToken: 'access-existing',
                accountSelectionEnabled: true
            });
            expect(result.link_token).toBe('link-sandbox-account-select');
            const createCall = mockPlaidInstance.linkTokenCreate.mock.calls[0][0];
            // Should have update configuration
            expect(createCall.access_token).toBeDefined();
        });
        it('should handle link token creation errors', async () => {
            const plaidError = {
                response: {
                    data: {
                        error_code: 'INVALID_FIELD',
                        error_message: 'Invalid field: client_user_id'
                    }
                }
            };
            mockPlaidInstance.linkTokenCreate.mockRejectedValueOnce(plaidError);
            await expect((0, plaid_client_1.createLinkToken)({
                clientUserId: '', // Invalid
                email: 'test@example.com'
            })).rejects.toBeDefined();
        });
    });
    describe('5.5 Plaid Client Initialization', () => {
        it('should initialize client with correct environment', () => {
            const client = (0, plaid_client_1.getPlaidClient)();
            expect(client).toBeDefined();
            expect(mockPlaidApi).toHaveBeenCalled();
        });
        it('should throw error if PLAID_CLIENT_ID is missing', () => {
            delete process.env.PLAID_CLIENT_ID;
            expect(() => (0, plaid_client_1.getPlaidClient)()).toThrow();
            // Restore
            process.env.PLAID_CLIENT_ID = 'test-client-id';
        });
        it('should throw error if PLAID_SECRET is missing', () => {
            delete process.env.PLAID_SECRET;
            expect(() => (0, plaid_client_1.getPlaidClient)()).toThrow();
            // Restore
            process.env.PLAID_SECRET = 'test-secret';
        });
        it('should use sandbox environment when PLAID_ENV=sandbox', () => {
            process.env.PLAID_ENV = 'sandbox';
            (0, plaid_client_1.getPlaidClient)();
            // Verify configuration uses sandbox
            expect(mockPlaidApi).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=plaid-client.test.js.map