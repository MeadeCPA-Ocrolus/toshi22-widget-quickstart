"use strict";
/**
 * Items Endpoint
 *
 * GET /api/items/:id - Get single item with accounts
 * DELETE /api/items/:id - Remove item and all related data (with optional Plaid removal)
 *
 * Note: Listing items by client is handled by /api/clients/:clientId/items
 * This endpoint is for operations on individual items.
 *
 * @module items
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
const encryption_1 = require("../shared/encryption");
/**
 * CORS headers for all responses
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
/**
 * Main HTTP trigger handler
 */
const httpTrigger = async function (context, req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
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
    }
    catch (error) {
        context.log.error('Items endpoint error:', error);
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
 * Get single item with its accounts
 *
 * @param context - Azure Function context
 * @param itemId - Item ID to fetch
 */
async function getItem(context, itemId) {
    context.log(`Getting item: ${itemId}`);
    // Fetch item (excluding access_token for security)
    const itemResult = await (0, database_1.executeQuery)(`SELECT 
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
            transactions_cursor,
            transactions_last_successful_update,
            created_at,
            updated_at
        FROM items
        WHERE item_id = @itemId`, { itemId });
    if (itemResult.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Item not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    const item = itemResult.recordset[0];
    // Fetch accounts for this item
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
        WHERE item_id = @itemId
        ORDER BY account_type, account_name`, { itemId });
    const response = {
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
 * Optionally removes the item from Plaid as well (invalidates access token).
 *
 * WARNING: This permanently deletes:
 * - All transactions for all accounts
 * - All accounts
 * - Webhook logs for this item
 * - The item record
 * - (Optionally) Removes from Plaid
 *
 * @param context - Azure Function context
 * @param itemId - Item ID to delete
 * @param removeFromPlaid - If true, also call Plaid API to remove the item
 */
async function deleteItem(context, itemId, removeFromPlaid = false) {
    context.log(`Deleting item: ${itemId}, removeFromPlaid: ${removeFromPlaid}`);
    // Fetch item with access token (needed if removing from Plaid)
    const itemResult = await (0, database_1.executeQuery)(`SELECT 
            item_id,
            client_id,
            plaid_item_id,
            access_token,
            access_token_key_id,
            institution_name,
            status
        FROM items
        WHERE item_id = @itemId`, { itemId });
    if (itemResult.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Item not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    const item = itemResult.recordset[0];
    context.log(`Deleting item: ${item.institution_name} (plaid_item_id: ${item.plaid_item_id})`);
    // Track what we're deleting
    const deleteCounts = {
        transactions: 0,
        accounts: 0,
        webhook_logs: 0,
        removed_from_plaid: false,
    };
    // Optionally remove from Plaid first (before we lose the access token)
    if (removeFromPlaid && item.access_token && item.access_token_key_id) {
        try {
            // Decrypt the access token
            const accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
            // Import plaid-client dynamically to avoid circular dependencies
            const { getPlaidClient } = await Promise.resolve().then(() => __importStar(require('../shared/plaid-client')));
            const plaidClient = getPlaidClient();
            // Remove item from Plaid
            await plaidClient.itemRemove({
                access_token: accessToken,
            });
            deleteCounts.removed_from_plaid = true;
            context.log(`Removed item from Plaid: ${item.plaid_item_id}`);
        }
        catch (plaidError) {
            // Log but don't fail - we still want to clean up our database
            context.log.warn(`Failed to remove item from Plaid: ${plaidError}`);
            // Continue with local deletion
        }
    }
    // Delete in order (respecting foreign key constraints)
    // 1. Get account IDs for this item
    const accountsResult = await (0, database_1.executeQuery)(`SELECT account_id FROM accounts WHERE item_id = @itemId`, { itemId });
    const accountIds = accountsResult.recordset.map(a => a.account_id);
    // 2. Delete transactions
    if (accountIds.length > 0) {
        const txResult = await (0, database_1.executeQuery)(`SELECT COUNT(*) as count FROM transactions 
             WHERE account_id IN (${accountIds.join(',')})`);
        deleteCounts.transactions = txResult.recordset[0]?.count || 0;
        await (0, database_1.executeQuery)(`DELETE FROM transactions WHERE account_id IN (${accountIds.join(',')})`);
        context.log(`Deleted ${deleteCounts.transactions} transactions`);
    }
    // 3. Delete accounts
    deleteCounts.accounts = accountIds.length;
    await (0, database_1.executeQuery)(`DELETE FROM accounts WHERE item_id = @itemId`, { itemId });
    context.log(`Deleted ${deleteCounts.accounts} accounts`);
    // 4. Delete webhook logs
    const whResult = await (0, database_1.executeQuery)(`SELECT COUNT(*) as count FROM webhook_log WHERE item_id = @itemId`, { itemId });
    deleteCounts.webhook_logs = whResult.recordset[0]?.count || 0;
    await (0, database_1.executeQuery)(`DELETE FROM webhook_log WHERE item_id = @itemId`, { itemId });
    context.log(`Deleted ${deleteCounts.webhook_logs} webhook logs`);
    // 5. Delete the item
    await (0, database_1.executeQuery)(`DELETE FROM items WHERE item_id = @itemId`, { itemId });
    context.log(`Item ${itemId} deleted successfully`);
    context.res = {
        status: 200,
        body: {
            message: 'Item and all related data deleted successfully',
            item_id: itemId,
            plaid_item_id: item.plaid_item_id,
            institution_name: item.institution_name,
            deleted: deleteCounts,
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map