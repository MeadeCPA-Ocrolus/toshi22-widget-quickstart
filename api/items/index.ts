/**
 * Items Endpoint
 * 
 * GET /api/items/:id - Get single item with accounts
 * DELETE /api/items/:id - Remove item and all related data (with optional Plaid removal) - NOW SOFT DELETE
 * 
 * Note: Listing items by client is handled by /api/clients/:clientId/items
 * This endpoint is for operations on individual items.
 * 
 * @module items
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';
import { archiveItem, plaidWarning } from '../shared/archive-item';
import { requireAuth } from '../shared/auth';
import { serverError, allowOriginHeader } from '../shared/http';

/**
 * Item record from database
 */
interface ItemRecord {
    item_id: number;
    client_id: number;
    plaid_item_id: string;
    access_token: Buffer;
    access_token_key_id: number;
    institution_id: string | null;
    institution_name: string | null;
    status: string;
    last_error_code: string | null;
    last_error_message: string | null;
    consent_expiration_time: string | null;
    has_sync_updates: boolean;
    transactions_cursor: string | null;
    transactions_last_successful_update: string | null;
    created_at: string;
    updated_at: string;
    is_archived: boolean;
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
interface ItemWithAccounts {
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
    transactions_cursor: string | null;
    transactions_last_successful_update: string | null;
    created_at: string;
    updated_at: string;
    is_archived: boolean;
    accounts: AccountRecord[];
}

/**
 * CORS headers for all responses
 */
const corsHeaders = {
    ...allowOriginHeader(),
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

    const principal = requireAuth(context, req, corsHeaders);
    if (!principal) return;

    try {
        const itemId = req.params?.id;

        if (!itemId) {
            context.res = {
                status: 400,
                body: { error: 'Item ID is required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        const itemIdNum = parseInt(itemId, 10);

        if (isNaN(itemIdNum)) {
            context.res = {
                status: 400,
                body: { error: 'Invalid item ID format' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        switch (req.method) {
            case 'GET':
                await getItem(context, itemIdNum);
                break;

            case 'DELETE':
                const removeFromPlaid = req.query?.removeFromPlaid === 'true';
                await deleteItem(context, itemIdNum, removeFromPlaid);
                break;

            default:
                context.res = {
                    status: 405,
                    body: { error: 'Method not allowed' },
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                };
        }

    } catch (error) {
        serverError(context, 'Items endpoint error', error, corsHeaders);
    }
};

/**
 * Get single item with its accounts
 * 
 * @param context - Azure Function context
 * @param itemId - Item ID to fetch
 */
async function getItem(context: Context, itemId: number): Promise<void> {
    context.log(`Getting item: ${itemId}`);

    // Fetch item (excluding access_token for security, only non-archived)
    const itemResult = await executeQuery<Omit<ItemRecord, 'access_token' | 'access_token_key_id'>>(
        `SELECT 
            item_id,
            client_id,
            plaid_item_id,
            institution_id,
            institution_name,
            is_oauth,
            status,
            last_error_code,
            last_error_message,
            consent_expiration_time,
            has_sync_updates,
            transactions_cursor,
            transactions_last_successful_update,
            created_at,
            updated_at
        FROM items
        WHERE item_id = @itemId AND is_archived = 0`,
        { itemId }
    );

    if (itemResult.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Item not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    const item = itemResult.recordset[0];

    // Fetch accounts for this item (only active)
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
        WHERE item_id = @itemId AND is_active = 1
        ORDER BY account_type, account_name`,
        { itemId }
    );

    const response: ItemWithAccounts = {
        ...item,
        accounts: accountsResult.recordset,
    };

    context.res = {
        status: 200,
        body: response,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Delete item and all related data (cascade delete)
 *
 * SOFT DELETE: flags rows instead of physically deleting them (see
 * shared/archive-item.ts for exactly what is archived).
 *
 * Optionally removes the item from Plaid as well (invalidates access token).
 * If Plaid cannot be told, the item is still archived here and the response
 * carries a `warning` so the user is told.
 *
 * @param context - Azure Function context
 * @param itemId - Item ID to delete (archive)
 * @param removeFromPlaid - If true, also call Plaid API to remove the item
 */
async function deleteItem(
    context: Context,
    itemId: number,
    removeFromPlaid: boolean = false
): Promise<void> {
    context.log(`Deleting (archiving) item: ${itemId}, removeFromPlaid: ${removeFromPlaid}`);

    const result = await archiveItem(context, itemId, {
        removeFromPlaid,
        reason: 'item_archived',
    });

    if (!result.found) {
        context.res = {
            status: 404,
            body: { error: 'Item not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    const plaidFailed = result.plaidRemoval === 'failed' || result.plaidRemoval === 'no_token';
    context.log(`Item ${itemId} archived successfully`);

    context.res = {
        status: 200,
        body: {
            message: 'Item and all related data deleted successfully',
            item_id: itemId,
            plaid_item_id: result.plaidItemId,
            institution_name: result.institutionName,
            plaid_removal: result.plaidRemoval,
            warning: plaidWarning(plaidFailed ? 1 : 0),
            deleted: {
                transactions: result.transactions,
                accounts: result.accounts,
                webhook_logs: 0,
                removed_from_plaid: result.plaidRemoval === 'removed',
            },
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

export default httpTrigger;