/**
 * Encryption utility for sensitive data (Plaid access tokens, etc.)
 * Uses AES-256-GCM for authenticated encryption
 *
 * Security notes:
 * - Keys are stored in the encryption_keys table (migrate to Azure Key Vault for production)
 * - Each encrypted value includes a random IV for uniqueness
 * - GCM mode provides both encryption and authentication (tamper detection)
 *
 * @module shared/encryption
 */
/**
 * Encrypted data structure stored in the database
 * Format: [IV (16 bytes)][Auth Tag (16 bytes)][Ciphertext (variable)]
 */
export interface EncryptedData {
    /** The encrypted data as a Buffer (to store in VARBINARY column) */
    encryptedBuffer: Buffer;
    /** The key_id used for encryption (store in access_token_key_id column) */
    keyId: number;
}
/**
 * Encrypts a plaintext string using AES-256-GCM
 *
 * @param plaintext - The string to encrypt (e.g., Plaid access token)
 * @param keyName - The encryption key name (default: 'plaid_access_token_v1')
 * @returns Promise<EncryptedData> - Encrypted buffer and key ID
 *
 * @example
 * const { encryptedBuffer, keyId } = await encrypt(accessToken);
 * // Store encryptedBuffer in items.access_token
 * // Store keyId in items.access_token_key_id
 */
export declare function encrypt(plaintext: string, keyName?: string): Promise<EncryptedData>;
/**
 * Decrypts data that was encrypted with the encrypt() function
 *
 * @param encryptedBuffer - The encrypted buffer from the database
 * @param keyId - The key_id used for encryption
 * @returns Promise<string> - The decrypted plaintext
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 *
 * @example
 * const accessToken = await decrypt(item.access_token, item.access_token_key_id);
 */
export declare function decrypt(encryptedBuffer: Buffer, keyId: number): Promise<string>;
/**
 * Clears the key cache
 * Call this if keys are rotated while the function is running
 */
export declare function clearKeyCache(): void;
/**
 * Rotates to a new encryption key
 * Creates a new key and marks the old one as inactive
 *
 * NOTE: This does NOT re-encrypt existing data. You would need to:
 * 1. Decrypt all data with old key
 * 2. Re-encrypt with new key
 * 3. Update the key_id references
 *
 * @param newKeyName - Name for the new key (e.g., 'plaid_access_token_v2')
 * @param oldKeyName - Name of the key to deactivate (optional)
 * @returns Promise<number> - The new key's key_id
 */
export declare function rotateKey(newKeyName: string, oldKeyName?: string): Promise<number>;
//# sourceMappingURL=encryption.d.ts.map