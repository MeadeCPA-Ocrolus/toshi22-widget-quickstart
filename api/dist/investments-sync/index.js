"use strict";
/**
 * Investments Sync Endpoint
 *
 * POST /api/investments/sync/:itemId - Manually trigger investments sync for an item
 *
 * This endpoint syncs both holdings and investment transactions.
 * Unlike regular transactions, investments sync automatically on webhooks,
 * but this endpoint allows CPAs to manually trigger a refresh if needed.
 *
 * @module investments-sync
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
const encryption_1 = require("../shared/encryption");
const plaid_client_1 = require("../shared/plaid-client");
const investments_sync_service_1 = require("../shared/investments-sync-service");
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const httpTrigger = async function (context, req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
    if (req.method !== 'POST') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    try {
        const itemId = parseInt(req.params.itemId, 10);
        if (isNaN(itemId)) {
            context.res = {
                status: 400,
                body: { error: 'Invalid itemId' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Get item and validate
        const itemResult = await (0, database_1.executeQuery)(`SELECT item_id, access_token, access_token_key_id, status, is_archived
             FROM items WHERE item_id = @itemId`, { itemId });
        if (itemResult.recordset.length === 0) {
            context.res = {
                status: 404,
                body: { error: 'Item not found' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        const item = itemResult.recordset[0];
        // Check if archived
        if (item.is_archived) {
            context.res = {
                status: 400,
                body: { error: 'Cannot sync investments for archived item' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Check if item needs re-auth
        if (item.status === 'login_required' || item.status === 'error') {
            context.res = {
                status: 400,
                body: {
                    error: 'Item requires re-authentication before syncing',
                    status: item.status,
                },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Decrypt access token
        const accessToken = await (0, encryption_1.decrypt)(item.access_token, item.access_token_key_id);
        // Get Plaid client and sync
        const plaidClient = (0, plaid_client_1.getPlaidClient)();
        const result = await (0, investments_sync_service_1.syncInvestmentsForItem)(plaidClient, itemId, accessToken, context);
        if (!result.success) {
            context.res = {
                status: 500,
                body: {
                    error: 'Investments sync failed',
                    details: result.error,
                },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        context.res = {
            status: 200,
            body: {
                success: true,
                item_id: itemId,
                holdings: result.holdings,
                securities: result.securities,
                transactions: result.transactions,
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
    catch (err) {
        context.log.error('Investments sync endpoint error:', err);
        context.res = {
            status: 500,
            body: {
                error: 'Internal server error',
                message: err instanceof Error ? err.message : 'Unknown error',
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map