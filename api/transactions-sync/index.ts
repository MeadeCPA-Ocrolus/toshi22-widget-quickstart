/**
 * Transactions Sync Endpoint
 * 
 * POST /api/transactions/sync/:itemId - Trigger transaction sync for a specific item
 * POST /api/transactions/sync - Sync all items with pending updates (with pagination)
 * POST /api/transactions/refresh/:itemId - Force refresh from Plaid (triggers webhook)
 * 
 * This endpoint is triggered manually by CPAs via the frontend.
 * Syncs are NOT automatic - this gives CPAs control over when data is pulled.
 * 
 * @module transactions-sync
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { 
    syncTransactionsForItem, 
    getItemsWithPendingSyncUpdates,
    refreshTransactions,
    TransactionSyncResult 
} from '../shared/transaction-sync-service';

/**
 * CORS headers for all responses
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
        const itemId = req.params?.itemId;
        const action = req.params?.action; // 'sync' or 'refresh'

        // Route based on action
        if (action === 'refresh' && itemId) {
            await handleRefresh(context, parseInt(itemId, 10));
        } else if (itemId) {
            await handleSingleItemSync(context, parseInt(itemId, 10));
        } else {
            await handleBulkSync(context, req);
        }

    } catch (err) {
        context.log.error('Transactions sync handler error:', err);
        
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

/**
 * Handle sync for a single item
 * 
 * POST /api/transactions/sync/:itemId
 */
async function handleSingleItemSync(
    context: Context,
    itemId: number
): Promise<void> {
    context.log(`Single item sync requested for item ${itemId}`);

    if (isNaN(itemId) || itemId <= 0) {
        context.res = {
            status: 400,
            body: { error: 'Invalid item ID' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    const result = await syncTransactionsForItem(context, itemId);

    context.res = {
        status: result.success ? 200 : 400,
        body: {
            success: result.success,
            item_id: result.itemId,
            plaid_item_id: result.plaidItemId,
            transactions: {
                added: result.added,
                modified: result.modified,
                removed: result.removed,
            },
            is_initial_sync: result.isInitialSync,
            error: result.error,
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Handle bulk sync for all items with pending updates
 * 
 * POST /api/transactions/sync
 * 
 * Query params:
 * - limit: Max items to sync (default 10)
 * - clientId: Only sync items for a specific client
 */
async function handleBulkSync(
    context: Context,
    req: HttpRequest
): Promise<void> {
    context.log('Bulk sync requested');

    const limit = parseInt(req.query.limit || '10', 10);
    const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;

    // Get items with pending sync updates
    let items = await getItemsWithPendingSyncUpdates();

    // Filter by client if specified
    if (clientId) {
        items = items.filter(item => item.client_id === clientId);
    }

    // Apply limit
    items = items.slice(0, limit);

    if (items.length === 0) {
        context.res = {
            status: 200,
            body: {
                success: true,
                message: 'No items with pending sync updates',
                synced: 0,
                results: [],
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    context.log(`Syncing ${items.length} items with pending updates`);

    // Sync each item
    const results: TransactionSyncResult[] = [];
    for (const item of items) {
        const result = await syncTransactionsForItem(context, item.item_id);
        results.push(result);
    }

    // Summary stats
    const successCount = results.filter(r => r.success).length;
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    const totalModified = results.reduce((sum, r) => sum + r.modified, 0);
    const totalRemoved = results.reduce((sum, r) => sum + r.removed, 0);

    context.res = {
        status: 200,
        body: {
            success: successCount === results.length,
            synced: successCount,
            failed: results.length - successCount,
            totals: {
                added: totalAdded,
                modified: totalModified,
                removed: totalRemoved,
            },
            results: results.map(r => ({
                item_id: r.itemId,
                plaid_item_id: r.plaidItemId,
                success: r.success,
                added: r.added,
                modified: r.modified,
                removed: r.removed,
                error: r.error,
            })),
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Handle refresh request for a single item
 * 
 * POST /api/transactions/refresh/:itemId
 * 
 * This calls Plaid's /transactions/refresh endpoint to trigger a refresh.
 * The actual data arrives via webhook (SYNC_UPDATES_AVAILABLE) later.
 */
async function handleRefresh(
    context: Context,
    itemId: number
): Promise<void> {
    context.log(`Refresh requested for item ${itemId}`);

    if (isNaN(itemId) || itemId <= 0) {
        context.res = {
            status: 400,
            body: { error: 'Invalid item ID' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    const result = await refreshTransactions(context, itemId);

    context.res = {
        status: result.success ? 200 : 400,
        body: {
            success: result.success,
            item_id: itemId,
            message: result.success 
                ? 'Refresh requested. Sync will be available shortly via webhook.'
                : result.error,
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

export default httpTrigger;