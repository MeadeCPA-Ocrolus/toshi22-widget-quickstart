/**
 * Clients Endpoint
 * 
 * GET /api/clients - List all clients (with optional search)
 * GET /api/clients/:id - Get single client
 * POST /api/clients - Create new client
 * PUT /api/clients/:id - Update client
 * DELETE /api/clients/:id - Delete client (with cascade) - NOW SOFT DELETE
 * 
 * Query Parameters for GET /api/clients:
 * - search: Search by name, email, or business name (case-insensitive)
 * - status: Filter by sync_status ('active', 'needs_sync', 'error')
 * - hasIssues: Filter to clients with items needing attention ('true'/'false')
 * 
 * @module clients
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';

/**
 * Client record from database
 */
interface ClientRecord {
    client_id: number;
    first_name: string;
    last_name: string;
    business_name: string | null;
    email: string;
    phone_number: string | null;
    account_type: string;
    fiscal_year_start_date: string;
    state: string;
    federal_effective_tax_rate: number | null;
    state_effective_tax_rate: number | null;
    self_employment_tax_rate: number | null;
    blended_effective_tax_rate: number | null;
    target_tax_savings_percent: number | null;
    income_type: string | null;
    sync_status: string;
    last_synced: string | null;
    created_at: string;
    updated_at: string | null;
    is_archived: boolean;
}

/**
 * Client with item counts for list view
 */
interface ClientWithCounts extends ClientRecord {
    item_count: number;
    items_needing_attention: number;
}

/**
 * CORS headers for all responses
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Main HTTP trigger handler
 */
const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }

    try {
        // Get client ID from route if present
        const clientId = req.params?.id;

        switch (req.method) {
            case 'GET':
                if (clientId) {
                    await getClient(context, parseInt(clientId, 10));
                } else {
                    await listClients(context, req);
                }
                break;

            case 'POST':
                await createClient(context, req.body);
                break;

            case 'PUT':
                if (!clientId) {
                    context.res = {
                        status: 400,
                        body: { error: 'Client ID is required for updates' },
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    };
                    return;
                }
                await updateClient(context, parseInt(clientId, 10), req.body);
                break;

            case 'DELETE':
                if (!clientId) {
                    context.res = {
                        status: 400,
                        body: { error: 'Client ID is required for deletion' },
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    };
                    return;
                }
                await deleteClient(context, parseInt(clientId, 10));
                break;

            default:
                context.res = {
                    status: 405,
                    body: { error: 'Method not allowed' },
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                };
        }

    } catch (error) {
        context.log.error('Clients endpoint error:', error);
        context.res = {
            status: 500,
            body: {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',

                node: process.version,
                hasDbConnString: Boolean(process.env.SQL_CONNECTION_STRING || process.env.DB_CONNECTION_STRING),
                
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};

/**
 * List all clients with item counts
 * Supports search by name/email and filtering
 * 
 * @param context - Azure Function context
 * @param req - HTTP request with query parameters
 */
async function listClients(context: Context, req: HttpRequest): Promise<void> {
    context.log('Listing clients');

    // Extract query parameters
    const search = req.query?.search?.trim() || '';
    const status = req.query?.status || '';
    const hasIssues = req.query?.hasIssues || '';

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    // SOFT DELETE: Only show non-archived clients
    conditions.push('c.is_archived = 0');

    // Search filter - searches across name, email, and business name
    if (search) {
        conditions.push(`(
            c.first_name LIKE @search 
            OR c.last_name LIKE @search 
            OR c.email LIKE @search 
            OR c.business_name LIKE @search
            OR CONCAT(c.first_name, ' ', c.last_name) LIKE @search
        )`);
        params.search = `%${search}%`;
        context.log(`Searching for: ${search}`);
    }

    // Status filter
    if (status) {
        conditions.push('c.sync_status = @status');
        params.status = status;
        context.log(`Filtering by status: ${status}`);
    }

    // Build the WHERE clause
    const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}` 
        : '';

    // Main query with item counts
    // Note: hasIssues filter uses WHERE on outer query since we can't HAVING on a LEFT JOIN alias
    let query = `
        SELECT 
            c.client_id,
            c.first_name,
            c.last_name,
            c.business_name,
            c.email,
            c.phone_number,
            c.account_type,
            c.fiscal_year_start_date,
            c.state,
            c.sync_status,
            c.last_synced,
            c.created_at,
            ISNULL(item_counts.item_count, 0) AS item_count,
            ISNULL(item_counts.items_needing_attention, 0) AS items_needing_attention
        FROM clients c
        LEFT JOIN (
            SELECT 
                client_id,
                COUNT(*) AS item_count,
                SUM(CASE 
                    WHEN status IN ('login_required', 'needs_update', 'error') 
                      OR has_sync_updates = 1 
                    THEN 1 ELSE 0 
                END) AS items_needing_attention
            FROM items
            WHERE is_archived = 0
            GROUP BY client_id
        ) item_counts ON item_counts.client_id = c.client_id
        ${whereClause}
    `;

    // hasIssues filter - wrap query to filter on computed column
    if (hasIssues === 'true') {
        query = `
            SELECT * FROM (${query}) AS filtered
            WHERE items_needing_attention > 0
            ORDER BY last_name, first_name
        `;
    } else {
        query += ` ORDER BY c.last_name, c.first_name`;
    }

    const result = await executeQuery<ClientWithCounts>(query, params);

    context.log(`Found ${result.recordset.length} clients`);

    context.res = {
        status: 200,
        body: { 
            clients: result.recordset,
            count: result.recordset.length,
            filters: {
                search: search || null,
                status: status || null,
                hasIssues: hasIssues || null,
            },
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Get single client by ID with full details
 * 
 * @param context - Azure Function context
 * @param clientId - Client ID to fetch
 */
async function getClient(context: Context, clientId: number): Promise<void> {
    context.log(`Getting client: ${clientId}`);

    const result = await executeQuery<ClientRecord>(
        `SELECT 
            client_id,
            first_name,
            last_name,
            business_name,
            email,
            phone_number,
            account_type,
            fiscal_year_start_date,
            state,
            federal_effective_tax_rate,
            state_effective_tax_rate,
            self_employment_tax_rate,
            blended_effective_tax_rate,
            target_tax_savings_percent,
            income_type,
            sync_status,
            last_synced,
            created_at,
            updated_at
        FROM clients
        WHERE client_id = @clientId AND is_archived = 0`,
        { clientId }
    );

    if (result.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Client not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    context.res = {
        status: 200,
        body: result.recordset[0],
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Create new client
 * 
 * @param context - Azure Function context
 * @param body - Request body with client data
 */
async function createClient(context: Context, body: any): Promise<void> {
    context.log('Creating new client');

    // Validate required fields
    const required = ['first_name', 'last_name', 'email', 'account_type', 'fiscal_year_start_date', 'state'];
    const missing = required.filter(field => !body?.[field]);

    if (missing.length > 0) {
        context.res = {
            status: 400,
            body: { error: `Missing required fields: ${missing.join(', ')}` },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
        context.res = {
            status: 400,
            body: { error: 'Invalid email format' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    // Check for duplicate email (only among non-archived)
    const existingResult = await executeQuery<{ client_id: number }>(
        `SELECT client_id FROM clients WHERE email = @email AND is_archived = 0`,
        { email: body.email.toLowerCase().trim() }
    );

    if (existingResult.recordset.length > 0) {
        context.res = {
            status: 409,
            body: { 
                error: 'A client with this email already exists',
                existing_client_id: existingResult.recordset[0].client_id,
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    // Insert client
    const insertResult = await executeQuery<{ client_id: number }>(
        `INSERT INTO clients (
            first_name, last_name, business_name, email, phone_number,
            account_type, fiscal_year_start_date, state
        )
        OUTPUT INSERTED.client_id
        VALUES (
            @firstName, @lastName, @businessName, @email, @phoneNumber,
            @accountType, @fiscalYearStartDate, @state
        )`,
        {
            firstName: body.first_name.trim(),
            lastName: body.last_name.trim(),
            businessName: body.business_name?.trim() || null,
            email: body.email.toLowerCase().trim(),
            phoneNumber: body.phone_number?.trim() || null,
            accountType: body.account_type,
            fiscalYearStartDate: body.fiscal_year_start_date,
            state: body.state.toUpperCase(),
        }
    );

    const newClientId = insertResult.recordset[0].client_id;
    context.log(`Created client: ${newClientId}`);

    context.res = {
        status: 201,
        body: {
            client_id: newClientId,
            message: 'Client created successfully',
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Update existing client
 * 
 * @param context - Azure Function context
 * @param clientId - Client ID to update
 * @param body - Request body with fields to update
 */
async function updateClient(
    context: Context,
    clientId: number,
    body: any
): Promise<void> {
    context.log(`Updating client: ${clientId}`);

    // Check client exists and is not archived
    const existingResult = await executeQuery<{ client_id: number }>(
        `SELECT client_id FROM clients WHERE client_id = @clientId AND is_archived = 0`,
        { clientId }
    );

    if (existingResult.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Client not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    // If updating email, check for duplicates (only among non-archived)
    if (body?.email) {
        const emailCheck = await executeQuery<{ client_id: number }>(
            `SELECT client_id FROM clients WHERE email = @email AND client_id != @clientId AND is_archived = 0`,
            { email: body.email.toLowerCase().trim(), clientId }
        );
        
        if (emailCheck.recordset.length > 0) {
            context.res = {
                status: 409,
                body: { error: 'Another client with this email already exists' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: Record<string, any> = { clientId };

    // Map of allowed fields to their database column names
    const allowedFields: Record<string, string> = {
        'first_name': 'first_name',
        'last_name': 'last_name',
        'business_name': 'business_name',
        'email': 'email',
        'phone_number': 'phone_number',
        'account_type': 'account_type',
        'fiscal_year_start_date': 'fiscal_year_start_date',
        'state': 'state',
        'federal_effective_tax_rate': 'federal_effective_tax_rate',
        'state_effective_tax_rate': 'state_effective_tax_rate',
        'self_employment_tax_rate': 'self_employment_tax_rate',
        'blended_effective_tax_rate': 'blended_effective_tax_rate',
        'target_tax_savings_percent': 'target_tax_savings_percent',
        'income_type': 'income_type',
        'sync_status': 'sync_status',
    };

    for (const [jsonField, dbColumn] of Object.entries(allowedFields)) {
        if (body?.[jsonField] !== undefined) {
            // Create a safe parameter name (remove underscores for SQL param)
            const paramName = jsonField.replace(/_/g, '');
            updateFields.push(`${dbColumn} = @${paramName}`);
            
            // Apply transformations for specific fields
            let value = body[jsonField];
            if (jsonField === 'email' && value) {
                value = value.toLowerCase().trim();
            } else if (jsonField === 'state' && value) {
                value = value.toUpperCase();
            } else if (typeof value === 'string') {
                value = value.trim();
            }
            
            params[paramName] = value;
        }
    }

    if (updateFields.length === 0) {
        context.res = {
            status: 400,
            body: { error: 'No valid fields to update' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    // Add updated_at timestamp
    updateFields.push('updated_at = GETDATE()');

    await executeQuery(
        `UPDATE clients SET ${updateFields.join(', ')} WHERE client_id = @clientId`,
        params
    );

    context.log(`Updated client: ${clientId}`);

    context.res = {
        status: 200,
        body: { 
            message: 'Client updated successfully',
            client_id: clientId,
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Delete client and all related data (cascade delete)
 * 
 * CHANGED: Now a SOFT DELETE - sets is_archived flag instead of physical deletion
 * 
 * Sets:
 * - Client: is_archived = 1
 * - Items: status = 'archived'
 * - Accounts: is_active = 0, closed_at = NOW
 * - Transactions: is_archived = 1 (if table exists)
 * 
 * Preserves: link_tokens, webhook_log (for audit trail)
 * 
 * @param context - Azure Function context
 * @param clientId - Client ID to delete (archive)
 */
async function deleteClient(context: Context, clientId: number): Promise<void> {
    context.log(`Deleting (archiving) client: ${clientId}`);

    // Check client exists
    const existingResult = await executeQuery<{ client_id: number; first_name: string; last_name: string }>(
        `SELECT client_id, first_name, last_name FROM clients WHERE client_id = @clientId AND is_archived = 0`,
        { clientId }
    );

    if (existingResult.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Client not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    const client = existingResult.recordset[0];
    context.log(`Archiving client: ${client.first_name} ${client.last_name} (ID: ${clientId})`);

    // Get all item IDs for this client (for cascade)
    const itemsResult = await executeQuery<{ item_id: number }>(
        `SELECT item_id FROM items WHERE client_id = @clientId AND is_archived = 0`,
        { clientId }
    );
    const itemIds = itemsResult.recordset.map(i => i.item_id);

    // Track what we're archiving
    const deleteCounts = {
        transactions: 0,
        accounts: 0,
        items: itemIds.length,
        link_tokens: 0,
        webhook_logs: 0,
    };

    // SOFT DELETE CASCADE
    
    // 1. Archive the client
    await executeQuery(
        `UPDATE clients SET is_archived = 1, updated_at = GETDATE() WHERE client_id = @clientId`,
        { clientId }
    );

    // 2. Archive items (status field remains for link status tracking)
    if (itemIds.length > 0) {
        await executeQuery(
            `UPDATE items SET is_archived = 1, updated_at = GETDATE() WHERE client_id = @clientId AND is_archived = 0`,
            { clientId }
        );
        context.log(`Archived ${deleteCounts.items} items`);

        // 3. Deactivate accounts
        const accResult = await executeQuery<{ count: number }>(
            `SELECT COUNT(*) as count FROM accounts WHERE item_id IN (${itemIds.join(',')}) AND is_active = 1`
        );
        deleteCounts.accounts = accResult.recordset[0]?.count || 0;

        if (deleteCounts.accounts > 0) {
            await executeQuery(
                `UPDATE accounts SET is_active = 0, closed_at = GETDATE(), updated_at = GETDATE() 
                 WHERE item_id IN (${itemIds.join(',')}) AND is_active = 1`
            );
            context.log(`Deactivated ${deleteCounts.accounts} accounts`);
        }

        // 4. Archive transactions (if table exists)
        try {
            const accountIds = await executeQuery<{ account_id: number }>(
                `SELECT account_id FROM accounts WHERE item_id IN (${itemIds.join(',')})`
            );
            const accountIdList = accountIds.recordset.map(a => a.account_id);

            if (accountIdList.length > 0) {
                const txResult = await executeQuery<{ count: number }>(
                    `SELECT COUNT(*) as count FROM transactions 
                     WHERE account_id IN (${accountIdList.join(',')}) AND is_archived = 0`
                );
                deleteCounts.transactions = txResult.recordset[0]?.count || 0;

                if (deleteCounts.transactions > 0) {
                    await executeQuery(
                        `UPDATE transactions SET is_archived = 1, updated_at = GETDATE() 
                         WHERE account_id IN (${accountIdList.join(',')}) AND is_archived = 0`
                    );
                    context.log(`Archived ${deleteCounts.transactions} transactions`);
                }
            }
        } catch (txError) {
            // Transactions table might not exist yet (Sprint 3)
            context.log.warn('Could not archive transactions (table may not exist yet)');
        }
    }

    // NOTE: link_tokens and webhook_log are NOT modified

    context.log(`Client ${clientId} archived successfully`);

    context.res = {
        status: 200,
        body: {
            message: 'Client and all related data deleted successfully',
            client_id: clientId,
            client_name: `${client.first_name} ${client.last_name}`,
            deleted: deleteCounts,
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

export default httpTrigger;