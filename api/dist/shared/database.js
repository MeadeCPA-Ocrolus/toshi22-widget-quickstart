"use strict";
/**
 * Database connection utility for Azure SQL
 * Provides connection pooling and query execution helpers
 *
 * @module shared/database
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = void 0;
exports.getPool = getPool;
exports.executeQuery = executeQuery;
exports.executeScalar = executeScalar;
exports.closePool = closePool;
const mssql_1 = __importDefault(require("mssql"));
exports.sql = mssql_1.default;
// Connection pool singleton
let pool = null;
/**
 * Parses the Azure SQL connection string into mssql config object
 * Azure connection strings use a specific format that needs conversion
 */
function parseConnectionString(connectionString) {
    const params = {};
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
async function getPool() {
    if (pool && pool.connected) {
        return pool;
    }
    const connectionString = process.env.AZURE_SQL_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('AZURE_SQL_CONNECTION_STRING environment variable is not configured');
    }
    const config = parseConnectionString(connectionString);
    pool = await mssql_1.default.connect(config);
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
async function executeQuery(query, params = {}) {
    const pool = await getPool();
    const request = pool.request();
    // Add parameters to request
    for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
    }
    return request.query(query);
}
/**
 * Executes a SQL query that returns a single value
 * Useful for COUNT, MAX, etc.
 *
 * @param query - SQL query string
 * @param params - Query parameters
 * @returns Promise<T | null> - The scalar value or null
 */
async function executeScalar(query, params = {}) {
    const result = await executeQuery(query, params);
    if (result.recordset && result.recordset.length > 0) {
        const firstRow = result.recordset[0];
        const firstKey = Object.keys(firstRow)[0];
        return firstRow[firstKey];
    }
    return null;
}
/**
 * Closes the database connection pool
 * Call this during graceful shutdown
 */
async function closePool() {
    if (pool) {
        await pool.close();
        pool = null;
    }
}
//# sourceMappingURL=database.js.map