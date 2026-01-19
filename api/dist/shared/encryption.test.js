"use strict";
/**
 * Tests for the encryption module
 *
 * Run with: npm test
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
// Mock the database module before importing encryption
jest.mock('./database', () => ({
    executeQuery: jest.fn(),
    executeScalar: jest.fn(),
}));
const encryption_1 = require("./encryption");
const database_1 = require("./database");
const mockExecuteQuery = database_1.executeQuery;
describe('Encryption Module', () => {
    // Generate a test key (256 bits = 32 bytes)
    const testKey = crypto_1.default.randomBytes(32);
    const testKeyId = 1;
    const testKeyName = 'plaid_access_token_v1';
    beforeEach(() => {
        // Clear caches and mocks before each test
        (0, encryption_1.clearKeyCache)();
        jest.clearAllMocks();
        // Default mock: return the test key
        mockExecuteQuery.mockImplementation(async (query) => {
            if (query.includes('WHERE key_name')) {
                return {
                    recordset: [{
                            key_id: testKeyId,
                            key_name: testKeyName,
                            key_value: testKey,
                            is_active: true,
                        }],
                    recordsets: [],
                    output: {},
                    rowsAffected: [1],
                };
            }
            if (query.includes('WHERE key_id')) {
                return {
                    recordset: [{
                            key_id: testKeyId,
                            key_name: testKeyName,
                            key_value: testKey,
                            is_active: true,
                        }],
                    recordsets: [],
                    output: {},
                    rowsAffected: [1],
                };
            }
            return { recordset: [], recordsets: [], output: {}, rowsAffected: [0] };
        });
    });
    describe('encrypt', () => {
        it('should encrypt a plaintext string and return buffer with keyId', async () => {
            const plaintext = 'access-sandbox-12345-abcde';
            const result = await (0, encryption_1.encrypt)(plaintext);
            expect(result).toHaveProperty('encryptedBuffer');
            expect(result).toHaveProperty('keyId');
            expect(result.keyId).toBe(testKeyId);
            expect(Buffer.isBuffer(result.encryptedBuffer)).toBe(true);
            // Buffer should be: IV (16) + AuthTag (16) + Ciphertext (at least 1 byte)
            expect(result.encryptedBuffer.length).toBeGreaterThan(32);
        });
        it('should produce different ciphertext for same plaintext (random IV)', async () => {
            const plaintext = 'access-sandbox-12345-abcde';
            const result1 = await (0, encryption_1.encrypt)(plaintext);
            const result2 = await (0, encryption_1.encrypt)(plaintext);
            // Encrypted buffers should be different due to random IV
            expect(result1.encryptedBuffer.equals(result2.encryptedBuffer)).toBe(false);
        });
        it('should throw error if encryption key not found', async () => {
            mockExecuteQuery.mockResolvedValue({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            await expect((0, encryption_1.encrypt)('test')).rejects.toThrow('Active encryption key not found');
        });
    });
    describe('decrypt', () => {
        it('should decrypt data encrypted with encrypt()', async () => {
            const plaintext = 'access-sandbox-12345-abcde';
            const { encryptedBuffer, keyId } = await (0, encryption_1.encrypt)(plaintext);
            const decrypted = await (0, encryption_1.decrypt)(encryptedBuffer, keyId);
            expect(decrypted).toBe(plaintext);
        });
        it('should handle various plaintext lengths', async () => {
            const testCases = [
                'short',
                'medium-length-access-token-12345',
                'a'.repeat(1000), // Long token
                'special!@#$%^&*()chars',
                'unicode-émoji-🔐-测试',
            ];
            for (const plaintext of testCases) {
                const { encryptedBuffer, keyId } = await (0, encryption_1.encrypt)(plaintext);
                const decrypted = await (0, encryption_1.decrypt)(encryptedBuffer, keyId);
                expect(decrypted).toBe(plaintext);
            }
        });
        it('should throw error if key not found for decryption', async () => {
            const plaintext = 'test-token';
            const { encryptedBuffer } = await (0, encryption_1.encrypt)(plaintext);
            // Now make the key lookup fail
            mockExecuteQuery.mockResolvedValue({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            });
            (0, encryption_1.clearKeyCache)();
            await expect((0, encryption_1.decrypt)(encryptedBuffer, 999)).rejects.toThrow('Encryption key not found');
        });
        it('should fail if ciphertext is tampered with', async () => {
            const plaintext = 'access-sandbox-12345-abcde';
            const { encryptedBuffer, keyId } = await (0, encryption_1.encrypt)(plaintext);
            // Tamper with the ciphertext (last byte)
            const tamperedBuffer = Buffer.from(encryptedBuffer);
            tamperedBuffer[tamperedBuffer.length - 1] ^= 0xFF;
            await expect((0, encryption_1.decrypt)(tamperedBuffer, keyId)).rejects.toThrow();
        });
        it('should fail if auth tag is tampered with', async () => {
            const plaintext = 'access-sandbox-12345-abcde';
            const { encryptedBuffer, keyId } = await (0, encryption_1.encrypt)(plaintext);
            // Tamper with the auth tag (bytes 16-31)
            const tamperedBuffer = Buffer.from(encryptedBuffer);
            tamperedBuffer[20] ^= 0xFF;
            await expect((0, encryption_1.decrypt)(tamperedBuffer, keyId)).rejects.toThrow();
        });
    });
    describe('key caching', () => {
        it('should cache keys to reduce database queries', async () => {
            const plaintext = 'test-token';
            // Encrypt twice
            await (0, encryption_1.encrypt)(plaintext);
            await (0, encryption_1.encrypt)(plaintext);
            // Should only query the database once (for key by name)
            expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
        });
        it('should clear cache when clearKeyCache is called', async () => {
            const plaintext = 'test-token';
            await (0, encryption_1.encrypt)(plaintext);
            (0, encryption_1.clearKeyCache)();
            await (0, encryption_1.encrypt)(plaintext);
            // Should query twice (once before clear, once after)
            expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
        });
    });
});
describe('Encryption Format', () => {
    it('should match expected buffer structure', async () => {
        // This test documents the encryption format
        const testKey = crypto_1.default.randomBytes(32);
        mockExecuteQuery.mockResolvedValue({
            recordset: [{
                    key_id: 1,
                    key_value: testKey,
                    is_active: true,
                }],
            recordsets: [],
            output: {},
            rowsAffected: [1],
        });
        (0, encryption_1.clearKeyCache)();
        const { encryptedBuffer } = await (0, encryption_1.encrypt)('test');
        // Document the format:
        // Bytes 0-15: IV (16 bytes)
        // Bytes 16-31: Auth Tag (16 bytes)  
        // Bytes 32+: Ciphertext (variable length)
        const iv = encryptedBuffer.subarray(0, 16);
        const authTag = encryptedBuffer.subarray(16, 32);
        const ciphertext = encryptedBuffer.subarray(32);
        expect(iv.length).toBe(16);
        expect(authTag.length).toBe(16);
        expect(ciphertext.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=encryption.test.js.map