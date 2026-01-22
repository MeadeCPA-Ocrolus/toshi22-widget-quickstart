"use strict";
/**
 * Client Items Endpoint
 *
 * GET /api/clients/:clientId/items - Get all items (connected banks) for a client
 *
 * Returns items with their accounts nested.
 *
 * @module client-items
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
const httpTrigger = async function (context, req) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
    // Only accept GET
    if (req.method !== 'GET') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    try {
        const clientId = req.params?.clientId;
        if (!clientId) {
            context.res = {
                status: 400,
                body: { error: 'clientId is required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        const clientIdNum = parseInt(clientId, 10);
        context.log(`Getting items for client: ${clientIdNum}`);
        // Verify client exists
        const clientResult = await (0, database_1.executeQuery)(`SELECT client_id FROM clients WHERE client_id = @clientId`, { clientId: clientIdNum });
        if (clientResult.recordset.length === 0) {
            context.res = {
                status: 404,
                body: { error: 'Client not found' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Fetch items
        const itemsResult = await (0, database_1.executeQuery)(`SELECT 
                item_id,
                client_id,
                plaid_item_id,
                institution_id,
                institution_name,
                status,
                last_error_code,
                last_error_message,
                consent_expiration_time,
                has_sync_updates,
                transactions_last_successful_update,
                created_at,
                updated_at
            FROM items
            WHERE client_id = @clientId
            ORDER BY created_at DESC`, { clientId: clientIdNum });
        // If no items, return empty array
        if (itemsResult.recordset.length === 0) {
            context.res = {
                status: 200,
                body: { items: [] },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Fetch accounts for all items
        const itemIds = itemsResult.recordset.map(i => i.item_id);
        const accountsResult = await (0, database_1.executeQuery)(`SELECT 
                account_id,
                item_id,
                plaid_account_id,
                account_name,
                official_name,
                account_type,
                account_subtype,
                current_balance,
                available_balance,
                credit_limit,
                is_active,
                last_updated_datetime
            FROM accounts
            WHERE item_id IN (${itemIds.join(',')})
            ORDER BY account_type, account_name`);
        // Group accounts by item_id
        const accountsByItem = new Map();
        for (const account of accountsResult.recordset) {
            const existing = accountsByItem.get(account.item_id) || [];
            existing.push(account);
            accountsByItem.set(account.item_id, existing);
        }
        // Build response with nested accounts
        const itemsWithAccounts = itemsResult.recordset.map(item => ({
            ...item,
            accounts: accountsByItem.get(item.item_id) || [],
        }));
        context.res = {
            status: 200,
            body: { items: itemsWithAccounts },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
    catch (error) {
        context.log.error('Client items endpoint error:', error);
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
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map