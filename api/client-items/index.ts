/**
 * Client Items Endpoint
 * 
 * GET /api/clients/:clientId/items - Get all items (connected banks) for a client
 * 
 * Returns items with their accounts nested.
 * 
 * @module client-items
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';

/**
 * Item record from database
 */
interface ItemRecord {
    item_id: number;
    client_id: number;
    plaid_item_id: string;
    institution_id: string | null;
    institution_name: string | null;
    status: string;
    last_error_code: string | null;
    last_error_message: string | null;
    consent_expiration_time: string | null;
    has_sync_updates: boolean;
    transactions_last_successful_update: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Account record from database
 */
interface AccountRecord {
    account_id: number;
    item_id: number;
    plaid_account_id: string;
    account_name: string | null;
    official_name: string | null;
    account_type: string;
    account_subtype: string | null;
    current_balance: number | null;
    available_balance: number | null;
    credit_limit: number | null;
    is_active: boolean;
    last_updated_datetime: string | null;
}

/**
 * Item with nested accounts for response
 */
interface ItemWithAccounts extends ItemRecord {
    accounts: AccountRecord[];
}

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
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
        const clientResult = await executeQuery<{ client_id: number }>(
            `SELECT client_id FROM clients WHERE client_id = @clientId`,
            { clientId: clientIdNum }
        );

        if (clientResult.recordset.length === 0) {
            context.res = {
                status: 404,
                body: { error: 'Client not found' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        // Fetch items
        const itemsResult = await executeQuery<ItemRecord>(
            `SELECT 
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
              AND status != 'archived'
            ORDER BY created_at DESC`,
            { clientId: clientIdNum }
        );

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
        const accountsResult = await executeQuery<AccountRecord>(
            `SELECT 
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
            ORDER BY account_type, account_name`
        );

        // Group accounts by item_id
        const accountsByItem = new Map<number, AccountRecord[]>();
        for (const account of accountsResult.recordset) {
            const existing = accountsByItem.get(account.item_id) || [];
            existing.push(account);
            accountsByItem.set(account.item_id, existing);
        }

        // Build response with nested accounts
        const itemsWithAccounts: ItemWithAccounts[] = itemsResult.recordset.map(item => ({
            ...item,
            accounts: accountsByItem.get(item.item_id) || [],
        }));

        context.res = {
            status: 200,
            body: { items: itemsWithAccounts },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };

    } catch (error) {
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

export default httpTrigger;