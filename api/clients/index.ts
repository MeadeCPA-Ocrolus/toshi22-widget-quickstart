/**
 * Clients Endpoint
 * 
 * GET /api/clients - List all clients
 * GET /api/clients/:id - Get single client
 * POST /api/clients - Create new client
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
    sync_status: string;
    last_synced: string | null;
    created_at: string;
}

/**
 * Client with item counts for list view
 */
interface ClientWithCounts extends ClientRecord {
    item_count: number;
    items_needing_attention: number;
}

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }

    try {
        // Get client ID from route if present
        const clientId = req.params?.id;

        if (req.method === 'GET') {
            if (clientId) {
                // GET /api/clients/:id - Single client
                await getClient(context, corsHeaders, parseInt(clientId, 10));
            } else {
                // GET /api/clients - List all clients
                await listClients(context, corsHeaders);
            }
        } else if (req.method === 'POST') {
            // POST /api/clients - Create client
            await createClient(context, corsHeaders, req.body);
        } else if (req.method === 'PUT' && clientId) {
            // PUT /api/clients/:id - Update client
            await updateClient(context, corsHeaders, parseInt(clientId, 10), req.body);
        } else {
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
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};

/**
 * List all clients with item counts
 */
async function listClients(context: Context, corsHeaders: Record<string, string>): Promise<void> {
    context.log('Listing all clients');

    const result = await executeQuery<ClientWithCounts>(`
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
            WHERE status != 'archived'
            GROUP BY client_id
        ) item_counts ON item_counts.client_id = c.client_id
        ORDER BY c.last_name, c.first_name
    `);

    context.res = {
        status: 200,
        body: { clients: result.recordset },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Get single client by ID
 */
async function getClient(
    context: Context, 
    corsHeaders: Record<string, string>,
    clientId: number
): Promise<void> {
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
            quickbooks_id,
            created_at,
            updated_at
        FROM clients
        WHERE client_id = @clientId`,
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
 */
async function createClient(
    context: Context,
    corsHeaders: Record<string, string>,
    body: any
): Promise<void> {
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

    // Check for duplicate email
    const existingResult = await executeQuery<{ client_id: number }>(
        `SELECT client_id FROM clients WHERE email = @email`,
        { email: body.email }
    );

    if (existingResult.recordset.length > 0) {
        context.res = {
            status: 409,
            body: { error: 'A client with this email already exists' },
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
            firstName: body.first_name,
            lastName: body.last_name,
            businessName: body.business_name || null,
            email: body.email,
            phoneNumber: body.phone_number || null,
            accountType: body.account_type,
            fiscalYearStartDate: body.fiscal_year_start_date,
            state: body.state,
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
 */
async function updateClient(
    context: Context,
    corsHeaders: Record<string, string>,
    clientId: number,
    body: any
): Promise<void> {
    context.log(`Updating client: ${clientId}`);

    // Check client exists
    const existingResult = await executeQuery<{ client_id: number }>(
        `SELECT client_id FROM clients WHERE client_id = @clientId`,
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

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: Record<string, any> = { clientId };

    const allowedFields = [
        'first_name', 'last_name', 'business_name', 'email', 'phone_number',
        'account_type', 'fiscal_year_start_date', 'state',
        'federal_effective_tax_rate', 'state_effective_tax_rate',
        'self_employment_tax_rate', 'blended_effective_tax_rate',
        'target_tax_savings_percent', 'income_type', 'sync_status'
    ];

    for (const field of allowedFields) {
        if (body?.[field] !== undefined) {
            // Convert snake_case to camelCase for param name
            const paramName = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            updateFields.push(`${field} = @${paramName}`);
            params[paramName] = body[field];
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

    // Add updated_at
    updateFields.push('updated_at = GETDATE()');

    await executeQuery(
        `UPDATE clients SET ${updateFields.join(', ')} WHERE client_id = @clientId`,
        params
    );

    context.res = {
        status: 200,
        body: { message: 'Client updated successfully' },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

export default httpTrigger;