/**
 * Database connection utility for Azure SQL
 * Provides connection pooling and query execution helpers
 *
 * @module shared/database
 */
import sql, { ConnectionPool, IResult } from 'mssql';
/**
 * Gets or creates a connection pool to Azure SQL
 * Uses singleton pattern to reuse connections across function invocations
 *
 * @returns Promise<ConnectionPool> - The database connection pool
 * @throws Error if connection string is not configured or connection fails
 */
export declare function getPool(): Promise<ConnectionPool>;
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
export declare function executeQuery<T = any>(query: string, params?: Record<string, any>): Promise<IResult<T>>;
/**
 * Executes a SQL query that returns a single value
 * Useful for COUNT, MAX, etc.
 *
 * @param query - SQL query string
 * @param params - Query parameters
 * @returns Promise<T | null> - The scalar value or null
 */
export declare function executeScalar<T = any>(query: string, params?: Record<string, any>): Promise<T | null>;
/**
 * Closes the database connection pool
 * Call this during graceful shutdown
 */
export declare function closePool(): Promise<void>;
export { sql };
//# sourceMappingURL=database.d.ts.map