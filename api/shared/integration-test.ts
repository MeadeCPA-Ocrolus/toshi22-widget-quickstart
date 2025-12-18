/**
 * Integration test for database connection and encryption
 * 
 * Run with: npx ts-node shared/integration-test.ts
 * 
 * Make sure AZURE_SQL_CONNECTION_STRING is set in your environment first!
 */

import { getPool, executeQuery, closePool } from './database';
import { encrypt, decrypt, clearKeyCache } from './encryption';

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message: string, status: 'pass' | 'fail' | 'info') {
    const icon = status === 'pass' ? `${GREEN}✓${RESET}` 
               : status === 'fail' ? `${RED}✗${RESET}` 
               : `${YELLOW}→${RESET}`;
    console.log(`${icon} ${message}`);
}

async function testDatabaseConnection(): Promise<boolean> {
    console.log('\n--- Testing Database Connection ---\n');
    
    try {
        // Test 1: Basic connection
        log('Connecting to Azure SQL...', 'info');
        const pool = await getPool();
        log('Connection pool established', 'pass');

        // Test 2: Simple query
        log('Running test query...', 'info');
        const result = await executeQuery<{ test: number }>('SELECT 1 AS test');
        if (result.recordset[0].test === 1) {
            log('Basic query works', 'pass');
        } else {
            log('Query returned unexpected result', 'fail');
            return false;
        }

        // Test 3: Check tables exist
        log('Checking tables exist...', 'info');
        const tables = await executeQuery<{ name: string }>(
            `SELECT name FROM sys.tables ORDER BY name`
        );
        const tableNames = tables.recordset.map(t => t.name);
        const expectedTables = [
            'accounts', 'clients', 'encryption_keys', 'items', 
            'link_tokens', 'quickbooks_tokens', 'transactions', 'webhook_log'
        ];
        
        for (const table of expectedTables) {
            if (tableNames.includes(table)) {
                log(`  Table '${table}' exists`, 'pass');
            } else {
                log(`  Table '${table}' MISSING`, 'fail');
                return false;
            }
        }

        // Test 4: Check encryption_keys has a key
        log('Checking encryption key exists...', 'info');
        const keys = await executeQuery<{ key_id: number; key_name: string; is_active: boolean }>(
            `SELECT key_id, key_name, is_active FROM encryption_keys WHERE is_active = 1`
        );
        if (keys.recordset.length > 0) {
            log(`  Found active key: ${keys.recordset[0].key_name} (id: ${keys.recordset[0].key_id})`, 'pass');
        } else {
            log('  No active encryption key found!', 'fail');
            return false;
        }

        return true;
    } catch (error) {
        log(`Database connection failed: ${error}`, 'fail');
        return false;
    }
}

async function testEncryption(): Promise<boolean> {
    console.log('\n--- Testing Encryption ---\n');
    
    try {
        // Clear cache to ensure fresh key fetch
        clearKeyCache();

        // Test 1: Encrypt a test token
        const testToken = 'access-sandbox-test-12345-abcdef';
        log(`Encrypting test token: "${testToken.substring(0, 20)}..."`, 'info');
        
        const { encryptedBuffer, keyId } = await encrypt(testToken);
        log(`Encrypted successfully (keyId: ${keyId}, length: ${encryptedBuffer.length} bytes)`, 'pass');

        // Test 2: Decrypt it back
        log('Decrypting...', 'info');
        const decrypted = await decrypt(encryptedBuffer, keyId);
        
        if (decrypted === testToken) {
            log('Decryption matches original!', 'pass');
        } else {
            log(`Decryption mismatch: got "${decrypted}"`, 'fail');
            return false;
        }

        // Test 3: Verify encrypted data is different each time (random IV)
        log('Testing random IV (encrypting same value twice)...', 'info');
        const { encryptedBuffer: encrypted2 } = await encrypt(testToken);
        
        if (!encryptedBuffer.equals(encrypted2)) {
            log('Different ciphertext produced (random IV working)', 'pass');
        } else {
            log('Same ciphertext produced - IV not random!', 'fail');
            return false;
        }

        // Test 4: Simulate storing and retrieving from database
        log('Testing database round-trip...', 'info');
        
        // Insert encrypted data
        await executeQuery(
            `IF NOT EXISTS (SELECT 1 FROM clients WHERE email = 'test@integration.local')
             INSERT INTO clients (first_name, last_name, email, account_type, fiscal_year_start_date, state)
             VALUES ('Integration', 'Test', 'test@integration.local', 'personal', '2025-01-01', 'TX')`
        );

        const clientResult = await executeQuery<{ client_id: number }>(
            `SELECT client_id FROM clients WHERE email = 'test@integration.local'`
        );
        const testClientId = clientResult.recordset[0].client_id;

        // Create a test item with encrypted access token
        const testPlaidItemId = `test-item-${Date.now()}`;
        await executeQuery(
            `INSERT INTO items (client_id, plaid_item_id, access_token, access_token_key_id, institution_id, institution_name)
             VALUES (@clientId, @plaidItemId, @accessToken, @keyId, 'ins_test', 'Test Bank')`,
            {
                clientId: testClientId,
                plaidItemId: testPlaidItemId,
                accessToken: encryptedBuffer,
                keyId: keyId
            }
        );
        log('  Inserted encrypted token into items table', 'pass');

        // Retrieve and decrypt
        const itemResult = await executeQuery<{ access_token: Buffer; access_token_key_id: number }>(
            `SELECT access_token, access_token_key_id FROM items WHERE plaid_item_id = @plaidItemId`,
            { plaidItemId: testPlaidItemId }
        );

        const retrievedToken = await decrypt(
            itemResult.recordset[0].access_token,
            itemResult.recordset[0].access_token_key_id
        );

        if (retrievedToken === testToken) {
            log('  Retrieved and decrypted successfully!', 'pass');
        } else {
            log('  Retrieved token does not match original', 'fail');
            return false;
        }

        // Cleanup test data
        await executeQuery(
            `DELETE FROM items WHERE plaid_item_id = @plaidItemId`,
            { plaidItemId: testPlaidItemId }
        );
        log('  Cleaned up test item', 'pass');

        return true;
    } catch (error) {
        log(`Encryption test failed: ${error}`, 'fail');
        return false;
    }
}

async function main() {
    console.log('='.repeat(50));
    console.log('  Meade CPA - Integration Test');
    console.log('='.repeat(50));

    // Check for connection string
    if (!process.env.AZURE_SQL_CONNECTION_STRING) {
        log('AZURE_SQL_CONNECTION_STRING not set!', 'fail');
        console.log('\nSet it with:');
        console.log('  export AZURE_SQL_CONNECTION_STRING="Server=tcp:..."');
        process.exit(1);
    }

    let allPassed = true;

    // Run tests
    const dbPassed = await testDatabaseConnection();
    if (!dbPassed) allPassed = false;

    if (dbPassed) {
        const encPassed = await testEncryption();
        if (!encPassed) allPassed = false;
    }

    // Cleanup
    await closePool();

    // Summary
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        log('All tests passed! Sprint 1 Task 3 complete.', 'pass');
    } else {
        log('Some tests failed. Check the errors above.', 'fail');
    }
    console.log('='.repeat(50) + '\n');

    process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);