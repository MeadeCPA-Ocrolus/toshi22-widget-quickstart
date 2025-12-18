/**
 * Database connection utility for Azure SQL
 * Provides connection pooling and query execution helpers
 * 
 * @module shared/database
 */

import sql, { ConnectionPool, IResult, config as SqlConfig } from 'mssql';

// Connection pool singleton
let pool: ConnectionPool | null = null;

/**
 * Parses the Azure SQL connection string into mssql config object
 * Azure connection strings use a specific format that needs conversion
 */
function parseConnectionString(connectionString: string): SqlConfig {
    const params: Record<string, string> = {};
    
    // Parse semicolon-separated key=value pairs
    connectionString.split(';').forEach(pair => {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
            params[key.trim().toLowerCase()] = valueParts.join('=').trim();
        }
    });

    // Extract server and port from "tcp:server.database.windows.net,1433"
    let server = params['server'] || params['data source'] || '';
    let port = 1433;
    
    if (server.startsWith('tcp:')) {
        server = server.substring(4);
    }
    
    if (server.includes(',')) {
        const [serverPart, portPart] = server.split(',');
        server = serverPart;
        port = parseInt(portPart, 10);
    }

    return {
        server,
        port,
        database: params['initial catalog'] || params['database'] || '',
        user: params['user id'] || params['uid'] || '',
        password: params['password'] || params['pwd'] || '',
        options: {
            encrypt: true, // Required for Azure SQL
            trustServerCertificate: false,
            enableArithAbort: true,
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
        },
    };
}

/**
 * Gets or creates a connection pool to Azure SQL
 * Uses singleton pattern to reuse connections across function invocations
 * 
 * @returns Promise<ConnectionPool> - The database connection pool
 * @throws Error if connection string is not configured or connection fails
 */
export async function getPool(): Promise<ConnectionPool> {
    if (pool && pool.connected) {
        return pool;
    }

    const connectionString = process.env.AZURE_SQL_CONNECTION_STRING;
    
    if (!connectionString) {
        throw new Error('AZURE_SQL_CONNECTION_STRING environment variable is not configured');
    }

    const config = parseConnectionString(connectionString);
    
    pool = await sql.connect(config);
    
    return pool;
}

/**
 * Executes a SQL query with parameters
 * Automatically handles connection pooling
 * 
 * @param query - SQL query string with @paramName placeholders
 * @param params - Object mapping parameter names to values
 * @returns Promise<IResult<T>> - Query results
 * 
 * @example
 * const result = await executeQuery<Client>(
 *   'SELECT * FROM clients WHERE client_id = @clientId',
 *   { clientId: 1 }
 * );
 */
export async function executeQuery<T = any>(
    query: string,
    params: Record<string, any> = {}
): Promise<IResult<T>> {
    const pool = await getPool();
    const request = pool.request();

    // Add parameters to request
    for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
    }

    return request.query<T>(query);
}

/**
 * Executes a SQL query that returns a single value
 * Useful for COUNT, MAX, etc.
 * 
 * @param query - SQL query string
 * @param params - Query parameters
 * @returns Promise<T | null> - The scalar value or null
 */
export async function executeScalar<T = any>(
    query: string,
    params: Record<string, any> = {}
): Promise<T | null> {
    const result = await executeQuery<T>(query, params);
    
    if (result.recordset && result.recordset.length > 0) {
        const firstRow = result.recordset[0] as Record<string, any>;
        const firstKey = Object.keys(firstRow)[0];
        return firstRow[firstKey] as T;
    }
    
    return null;
}

/**
 * Closes the database connection pool
 * Call this during graceful shutdown
 */
export async function closePool(): Promise<void> {
    if (pool) {
        await pool.close();
        pool = null;
    }
}

// Export the sql module for direct access to types and methods
export { sql };