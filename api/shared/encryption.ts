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

import crypto from 'crypto';
import { executeQuery } from './database';

// AES-256-GCM configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits - recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits - GCM authentication tag

/**
 * Represents an encryption key from the database
 */
interface EncryptionKey {
    key_id: number;
    key_name: string;
    key_value: Buffer;
    is_active: boolean;
}

/**
 * Cache for encryption keys to reduce database calls
 * In production, consider using a proper caching solution
 */
const keyCache: Map<number, Buffer> = new Map();
const keyNameCache: Map<string, number> = new Map();

/**
 * Retrieves an encryption key by ID from the database
 * Uses caching to minimize database queries
 * 
 * @param keyId - The key_id from encryption_keys table
 * @returns Promise<Buffer> - The raw encryption key bytes
 * @throws Error if key not found or inactive
 */
async function getKeyById(keyId: number): Promise<Buffer> {
    // Check cache first
    const cached = keyCache.get(keyId);
    if (cached) {
        return cached;
    }

    const result = await executeQuery<EncryptionKey>(
        `SELECT key_id, key_value, is_active 
         FROM encryption_keys 
         WHERE key_id = @keyId`,
        { keyId }
    );

    if (!result.recordset || result.recordset.length === 0) {
        throw new Error(`Encryption key not found: ${keyId}`);
    }

    const key = result.recordset[0];
    
    if (!key.is_active) {
        throw new Error(`Encryption key is inactive: ${keyId}`);
    }

    // Cache the key
    keyCache.set(keyId, key.key_value);
    
    return key.key_value;
}

/**
 * Retrieves the active encryption key by name
 * Used when encrypting new data
 * 
 * @param keyName - The key_name (e.g., 'plaid_access_token_v1')
 * @returns Promise<{ keyId: number; keyValue: Buffer }> - Key ID and value
 * @throws Error if key not found or inactive
 */
async function getActiveKeyByName(keyName: string): Promise<{ keyId: number; keyValue: Buffer }> {
    // Check cache first
    const cachedKeyId = keyNameCache.get(keyName);
    if (cachedKeyId !== undefined) {
        const keyValue = await getKeyById(cachedKeyId);
        return { keyId: cachedKeyId, keyValue };
    }

    const result = await executeQuery<EncryptionKey>(
        `SELECT key_id, key_value, is_active 
         FROM encryption_keys 
         WHERE key_name = @keyName AND is_active = 1`,
        { keyName }
    );

    if (!result.recordset || result.recordset.length === 0) {
        throw new Error(`Active encryption key not found: ${keyName}`);
    }

    const key = result.recordset[0];
    
    // Cache both mappings
    keyCache.set(key.key_id, key.key_value);
    keyNameCache.set(keyName, key.key_id);
    
    return { keyId: key.key_id, keyValue: key.key_value };
}

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
export async function encrypt(
    plaintext: string,
    keyName: string = 'plaid_access_token_v1'
): Promise<EncryptedData> {
    const { keyId, keyValue } = await getActiveKeyByName(keyName);
    
    // Generate random IV for each encryption
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, keyValue, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    
    // Encrypt the plaintext
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine: IV + AuthTag + Ciphertext
    const encryptedBuffer = Buffer.concat([iv, authTag, encrypted]);
    
    return { encryptedBuffer, keyId };
}

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
export async function decrypt(
    encryptedBuffer: Buffer,
    keyId: number
): Promise<string> {
    const keyValue = await getKeyById(keyId);
    
    // Extract components: IV + AuthTag + Ciphertext
    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, keyValue, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    
    // Set the authentication tag
    decipher.setAuthTag(authTag);
    
    // Decrypt
    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
}

/**
 * Clears the key cache
 * Call this if keys are rotated while the function is running
 */
export function clearKeyCache(): void {
    keyCache.clear();
    keyNameCache.clear();
}

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
export async function rotateKey(
    newKeyName: string,
    oldKeyName?: string
): Promise<number> {
    // Generate new 256-bit key
    const newKeyValue = crypto.randomBytes(32);
    
    // Insert new key
    const insertResult = await executeQuery<{ key_id: number }>(
        `INSERT INTO encryption_keys (key_name, key_value, is_active)
         OUTPUT INSERTED.key_id
         VALUES (@keyName, @keyValue, 1)`,
        { keyName: newKeyName, keyValue: newKeyValue }
    );
    
    const newKeyId = insertResult.recordset[0].key_id;
    
    // Deactivate old key if specified
    if (oldKeyName) {
        await executeQuery(
            `UPDATE encryption_keys 
             SET is_active = 0 
             WHERE key_name = @keyName`,
            { keyName: oldKeyName }
        );
    }
    
    // Clear cache to pick up changes
    clearKeyCache();
    
    return newKeyId;
}