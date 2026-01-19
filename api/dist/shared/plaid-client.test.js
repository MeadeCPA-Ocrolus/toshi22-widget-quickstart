"use strict";
/**
 * Tests for Plaid Client Wrapper
 */
// Store original env
const originalEnv = process.env;
describe('Plaid Client', () => {
    beforeEach(() => {
        // Reset modules to clear singleton
        jest.resetModules();
        // Reset env
        process.env = { ...originalEnv };
        process.env.PLAID_CLIENT_ID = 'test-client-id';
        process.env.PLAID_SECRET = 'test-secret';
        process.env.PLAID_ENV = 'sandbox';
    });
    afterEach(() => {
        process.env = originalEnv;
    });
    describe('getPlaidClient', () => {
        it('should throw error if PLAID_CLIENT_ID is not set', () => {
            delete process.env.PLAID_CLIENT_ID;
            const { getPlaidClient } = require('./plaid-client');
            expect(() => getPlaidClient()).toThrow('PLAID_CLIENT_ID and PLAID_SECRET must be set');
        });
        it('should throw error if PLAID_SECRET is not set', () => {
            delete process.env.PLAID_SECRET;
            const { getPlaidClient } = require('./plaid-client');
            expect(() => getPlaidClient()).toThrow('PLAID_CLIENT_ID and PLAID_SECRET must be set');
        });
        it('should return a PlaidApi instance when credentials are set', () => {
            const { getPlaidClient } = require('./plaid-client');
            const client = getPlaidClient();
            expect(client).toBeDefined();
            expect(typeof client.linkTokenCreate).toBe('function');
        });
        it('should return the same instance on subsequent calls (singleton)', () => {
            const { getPlaidClient } = require('./plaid-client');
            const client1 = getPlaidClient();
            const client2 = getPlaidClient();
            expect(client1).toBe(client2);
        });
    });
    describe('getWebhookUrl', () => {
        it('should return PLAID_WEBHOOK_URL if set', () => {
            process.env.PLAID_WEBHOOK_URL = 'https://custom.webhook.url/api/webhook';
            const { getWebhookUrl } = require('./plaid-client');
            expect(getWebhookUrl()).toBe('https://custom.webhook.url/api/webhook');
        });
        it('should return default URL if PLAID_WEBHOOK_URL is not set', () => {
            delete process.env.PLAID_WEBHOOK_URL;
            const { getWebhookUrl } = require('./plaid-client');
            expect(getWebhookUrl()).toContain('zealous-stone');
            expect(getWebhookUrl()).toContain('/api/plaid/webhook');
        });
    });
    describe('sandbox functions', () => {
        it('sandboxCreatePublicToken should throw in non-sandbox environment', async () => {
            process.env.PLAID_ENV = 'production';
            const { sandboxCreatePublicToken } = require('./plaid-client');
            await expect(sandboxCreatePublicToken()).rejects.toThrow('only available in sandbox');
        });
        it('sandboxFireWebhook should throw in non-sandbox environment', async () => {
            process.env.PLAID_ENV = 'production';
            const { sandboxFireWebhook, SandboxWebhookCodes } = require('./plaid-client');
            await expect(sandboxFireWebhook('access-token', SandboxWebhookCodes.DefaultUpdate)).rejects.toThrow('only available in sandbox');
        });
        it('sandboxResetLogin should throw in non-sandbox environment', async () => {
            process.env.PLAID_ENV = 'production';
            const { sandboxResetLogin } = require('./plaid-client');
            await expect(sandboxResetLogin('access-token')).rejects.toThrow('only available in sandbox');
        });
    });
    describe('createLinkToken options', () => {
        it('should be exported and callable', () => {
            const { createLinkToken } = require('./plaid-client');
            expect(typeof createLinkToken).toBe('function');
        });
    });
    describe('environment configuration', () => {
        it('should default to sandbox if PLAID_ENV is not set', () => {
            delete process.env.PLAID_ENV;
            // We can't easily test the internal getPlaidEnvironment function,
            // but we can verify the client is created without errors
            const { getPlaidClient } = require('./plaid-client');
            expect(() => getPlaidClient()).not.toThrow();
        });
    });
});
describe('Plaid Client Type Exports', () => {
    it('should export SandboxWebhookCodes', () => {
        const { SandboxWebhookCodes } = require('./plaid-client');
        expect(SandboxWebhookCodes).toBeDefined();
        expect(SandboxWebhookCodes.DefaultUpdate).toBeDefined();
        expect(SandboxWebhookCodes.SyncUpdatesAvailable).toBeDefined();
    });
});
//# sourceMappingURL=plaid-client.test.js.map