"use strict";
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
    // Fetch item (excluding access_token for security, only non-archived)
    const itemResult = await (0, database_1.executeQuery)(`SELECT 
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
        WHERE item_id = @itemId AND is_archived = 0`, { itemId });
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
        WHERE item_id = @itemId AND is_active = 1
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
 * CHANGED: Now a SOFT DELETE - sets is_archived=1 instead of physical deletion
 *
 * Optionally removes the item from Plaid as well (invalidates access token).
 *
 * Sets:
 * - Item: is_archived = 1 (status field remains for link status)
 * - Accounts: is_active = 0, closed_at = NOW
 * - Transactions: is_archived = 1 (if table exists)
 *
 * Preserves: webhook_log (for audit trail)
 *
 * @param context - Azure Function context
 * @param itemId - Item ID to delete (archive)
 * @param removeFromPlaid - If true, also call Plaid API to remove the item
 */
async function deleteItem(context, itemId, removeFromPlaid = false) {
    context.log(`Deleting (archiving) item: ${itemId}, removeFromPlaid: ${removeFromPlaid}`);
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
        WHERE item_id = @itemId AND is_archived = 0`, { itemId });
    if (itemResult.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Item not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    const item = itemResult.recordset[0];
    context.log(`Archiving item: ${item.institution_name} (plaid_item_id: ${item.plaid_item_id})`);
    // Track what we're archiving
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
    // SOFT DELETE CASCADE
    // 1. Archive the item (status field remains unchanged for link status tracking)
    await (0, database_1.executeQuery)(`UPDATE items SET is_archived = 1, updated_at = GETDATE() WHERE item_id = @itemId`, { itemId });
    // 2. Get account IDs for this item
    const accountsResult = await (0, database_1.executeQuery)(`SELECT account_id FROM accounts WHERE item_id = @itemId AND is_active = 1`, { itemId });
    const accountIds = accountsResult.recordset.map(a => a.account_id);
    deleteCounts.accounts = accountIds.length;
    // 3. Deactivate accounts
    if (accountIds.length > 0) {
        await (0, database_1.executeQuery)(`UPDATE accounts SET is_active = 0, closed_at = GETDATE(), updated_at = GETDATE() 
             WHERE item_id = @itemId AND is_active = 1`, { itemId });
        context.log(`Deactivated ${deleteCounts.accounts} accounts`);
        // 4. Archive transactions (if table exists)
        try {
            const txResult = await (0, database_1.executeQuery)(`SELECT COUNT(*) as count FROM transactions 
                 WHERE account_id IN (${accountIds.join(',')}) AND is_archived = 0`);
            deleteCounts.transactions = txResult.recordset[0]?.count || 0;
            if (deleteCounts.transactions > 0) {
                await (0, database_1.executeQuery)(`UPDATE transactions SET is_archived = 1, updated_at = GETDATE() 
                     WHERE account_id IN (${accountIds.join(',')}) AND is_archived = 0`);
                context.log(`Archived ${deleteCounts.transactions} transactions`);
            }
        }
        catch (txError) {
            // Transactions table might not exist yet (Sprint 3)
            context.log.warn('Could not archive transactions (table may not exist yet)');
        }
    }
    // NOTE: webhook_log is NOT modified
    context.log(`Item ${itemId} archived successfully`);
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