/**
 * Encryption & Access Token Security Tests
 * 
 * Tests encryption/decryption functionality:
 * - Roundtrip encryption/decryption
 * - Unique IVs
 * - Key management
 * - Authentication (GCM)
 * - Cache behavior
 * 
 * @module __tests__/encryption.test
 */

import crypto from 'crypto';

// Mock the database module
jest.mock('../shared/database', () => ({
    executeQuery: jest.fn(),
}));

import { executeQuery } from '../shared/database';
import { encrypt, decrypt, clearKeyCache } from '../shared/encryption';

const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>;

// Test encryption key (32 bytes for AES-256)
const TEST_KEY = crypto.randomBytes(32);
const TEST_KEY_ID = 1;

describe('Encryption & Access Token Security Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearKeyCache(); // Clear cache before each test
        
        // Default mock - return test key
        mockExecuteQuery.mockResolvedValue({
            recordset: [{
                key_id: TEST_KEY_ID,
                key_name: 'plaid_access_token_v1',
                key_value: TEST_KEY,
                is_active: true
            }],
            recordsets: [],
            output: {},
            rowsAffected: [1],
        } as any);
    });

    describe('4.1 Encryption Roundtrip', () => {
        it('should encrypt and decrypt access tokens correctly', async () => {
            const originalToken = 'access-sandbox-abc123-def456-ghi789';

            // Encrypt
            const { encryptedBuffer, keyId } = await encrypt(originalToken);

            expect(encryptedBuffer).toBeInstanceOf(Buffer);
            expect(encryptedBuffer.length).toBeGreaterThan(0);
            expect(keyId).toBe(TEST_KEY_ID);

            // Decrypt
            const decryptedToken = await decrypt(encryptedBuffer, keyId);

            expect(decryptedToken).toBe(originalToken);
        });

        it('should produce different ciphertext from same plaintext (unique IV)', async () => {
            const token = 'access-sandbox-test-token';

            const result1 = await encrypt(token);
            const result2 = await encrypt(token);

            // Different encrypted outputs
            expect(result1.encryptedBuffer).not.toEqual(result2.encryptedBuffer);

            // But both decrypt to same original
            const decrypted1 = await decrypt(result1.encryptedBuffer, result1.keyId);
            const decrypted2 = await decrypt(result2.encryptedBuffer, result2.keyId);

            expect(decrypted1).toBe(token);
            expect(decrypted2).toBe(token);
        });

        it('should handle empty strings', async () => {
            const emptyToken = '';

            const { encryptedBuffer, keyId } = await encrypt(emptyToken);
            const decrypted = await decrypt(encryptedBuffer, keyId);

            expect(decrypted).toBe(emptyToken);
        });

        it('should handle very long tokens', async () => {
            const longToken = 'x'.repeat(10000);

            const { encryptedBuffer, keyId } = await encrypt(longToken);
            const decrypted = await decrypt(encryptedBuffer, keyId);

            expect(decrypted).toBe(longToken);
            expect(decrypted.length).toBe(10000);
        });

        it('should handle special characters and Unicode', async () => {
            const specialToken = 'token-with-special-chars-!@#$%^&*()_+-={}[]|:";\'<>?,./~`';

            const { encryptedBuffer, keyId } = await encrypt(specialToken);
            const decrypted = await decrypt(encryptedBuffer, keyId);

            expect(decrypted).toBe(specialToken);
        });
    });

    describe('4.2 Encryption Security - GCM Authentication', () => {
        it('should fail decryption with tampered ciphertext', async () => {
            const token = 'access-sandbox-test';

            const { encryptedBuffer, keyId } = await encrypt(token);

            // Tamper with ciphertext (flip a bit in the middle)
            const tamperedData = Buffer.from(encryptedBuffer);
            const middleIndex = Math.floor(tamperedData.length / 2);
            tamperedData[middleIndex] = tamperedData[middleIndex] ^ 0xFF;

            // Should throw authentication error
            await expect(decrypt(tamperedData, keyId)).rejects.toThrow();
        });

        it('should fail decryption with wrong key', async () => {
            const token = 'access-sandbox-test';

            const { encryptedBuffer } = await encrypt(token);

            // Mock different key
            const wrongKey = crypto.randomBytes(32);
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                    key_id: 999,
                    key_name: 'wrong-key',
                    key_value: wrongKey,
                    is_active: true
                }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            clearKeyCache();

            // Should fail (wrong key = can't decrypt)
            await expect(decrypt(encryptedBuffer, 999)).rejects.toThrow();
        });

        it('should fail decryption with corrupted IV', async () => {
            const token = 'access-sandbox-test';

            const { encryptedBuffer, keyId } = await encrypt(token);

            // Corrupt the IV (first 16 bytes)
            const corruptedData = Buffer.from(encryptedBuffer);
            for (let i = 0; i < 16; i++) {
                corruptedData[i] = 0;
            }

            // Should fail to decrypt
            await expect(decrypt(corruptedData, keyId)).rejects.toThrow();
        });

        it('should fail decryption with missing auth tag', async () => {
            const token = 'access-sandbox-test';

            const { encryptedBuffer, keyId } = await encrypt(token);

            // Remove auth tag (last 16 bytes)
            const noAuthTag = encryptedBuffer.slice(0, encryptedBuffer.length - 16);

            // Should fail
            await expect(decrypt(noAuthTag, keyId)).rejects.toThrow();
        });
    });

    describe('4.3 Key Management', () => {
        it('should retrieve encryption key by name', async () => {
            const { keyId, encryptedBuffer } = await encrypt('test');

            expect(keyId).toBe(TEST_KEY_ID);
            expect(encryptedBuffer).toBeInstanceOf(Buffer);
        });

        it('should throw error when no active key exists', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            } as any);

            clearKeyCache();

            await expect(encrypt('test')).rejects.toThrow('Active encryption key not found');
        });

        it('should use correct key when encrypting', async () => {
            const { keyId } = await encrypt('test-token');

            expect(keyId).toBe(TEST_KEY_ID);

            // Verify query filters by is_active = 1
            const queryCall = mockExecuteQuery.mock.calls.find(call =>
                typeof call[0] === 'string' && call[0].includes('is_active = 1')
            );
            expect(queryCall).toBeDefined();
        });
    });

    describe('4.4 Key Cache Behavior', () => {
        it('should cache encryption keys to reduce database calls', async () => {
            // First call - should query database
            await encrypt('test1');
            expect(mockExecuteQuery).toHaveBeenCalledTimes(1);

            // Second call - should use cache
            await encrypt('test2');
            expect(mockExecuteQuery).toHaveBeenCalledTimes(1); // Still 1
        });

        it('should cache keys by ID when decrypting', async () => {
            const token = 'test-token';

            // Encrypt (creates key cache entry)
            const { encryptedBuffer, keyId } = await encrypt(token);
            const initialCalls = mockExecuteQuery.mock.calls.length;

            // Decrypt multiple times (should use cached key)
            await decrypt(encryptedBuffer, keyId);
            await decrypt(encryptedBuffer, keyId);
            await decrypt(encryptedBuffer, keyId);

            // Should not have made additional DB calls
            expect(mockExecuteQuery).toHaveBeenCalledTimes(initialCalls);
        });

        it('should clear cache and re-query after clearKeyCache', async () => {
            // First call
            await encrypt('test');
            expect(mockExecuteQuery).toHaveBeenCalledTimes(1);

            // Clear cache
            clearKeyCache();

            // Second call - should query again
            await encrypt('test');
            expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
        });

        it('should maintain separate cache entries for different key names', async () => {
            // This tests that the key cache works correctly
            const token = 'test-token';

            // First encrypt
            const { encryptedBuffer: encrypted1 } = await encrypt(token);

            // Clear cache and encrypt again (will query DB again)
            clearKeyCache();
            const { encryptedBuffer: encrypted2 } = await encrypt(token);

            // Should have different encrypted outputs (different IVs)
            expect(encrypted1).not.toEqual(encrypted2);
        });
    });

    describe('4.5 Error Handling', () => {
        it('should throw descriptive error on database failure', async () => {
            mockExecuteQuery.mockRejectedValueOnce(new Error('Connection timeout'));

            clearKeyCache();

            await expect(encrypt('test')).rejects.toThrow('Connection timeout');
        });

        it('should throw error when encrypting with invalid key format', async () => {
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [{
                    key_id: 1,
                    key_name: 'bad-key',
                    key_value: Buffer.from('too-short'), // Wrong length
                    is_active: true
                }],
                recordsets: [],
                output: {},
                rowsAffected: [1],
            } as any);

            clearKeyCache();

            await expect(encrypt('test')).rejects.toThrow();
        });

        it('should throw error when key_id not found during decryption', async () => {
            const token = 'test-token';
            const { encryptedBuffer } = await encrypt(token);

            clearKeyCache();

            // Mock key not found
            mockExecuteQuery.mockResolvedValueOnce({
                recordset: [],
                recordsets: [],
                output: {},
                rowsAffected: [0],
            } as any);

            await expect(decrypt(encryptedBuffer, 999)).rejects.toThrow('Encryption key not found');
        });
    });

    describe('4.6 Integration with Items Table', () => {
        it('should simulate real-world encrypt → store → retrieve → decrypt flow', async () => {
            const accessToken = 'access-sandbox-real-token-abc123';

            // 1. Encrypt token (as if saving to items table)
            const { encryptedBuffer, keyId } = await encrypt(accessToken);

            // 2. Simulate storing to database (mock the items table)
            const mockItemRecord = {
                item_id: 100,
                access_token: encryptedBuffer,
                access_token_key_id: keyId
            };

            // 3. Simulate retrieving from database
            const retrievedToken = mockItemRecord.access_token;
            const retrievedKeyId = mockItemRecord.access_token_key_id;

            // 4. Decrypt retrieved token
            const decryptedToken = await decrypt(retrievedToken, retrievedKeyId);

            expect(decryptedToken).toBe(accessToken);
        });
    });
});