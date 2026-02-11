"use strict";
/**
 * Transactions Endpoint
 *
 * GET /api/transactions - List transactions with filtering
 * GET /api/transactions/:id - Get single transaction
 *
 * Query Parameters for GET /api/transactions:
 * - accountId: Filter by account
 * - itemId: Filter by item (all accounts for that item)
 * - clientId: Filter by client (all accounts for that client)
 * - startDate: Filter by date range (YYYY-MM-DD)
 * - endDate: Filter by date range (YYYY-MM-DD)
 * - pending: Filter by pending status ('true' or 'false')
 * - isTransfer: Filter transfers ('true' or 'false')
 * - uncategorized: Only show transactions needing categorization ('true')
 * - limit: Max results (default 100, max 500)
 * - offset: Pagination offset
 *
 * @module transactions
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
/**
 * CORS headers for all responses
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
        const transactionId = req.params?.id;
        if (transactionId) {
            await getTransaction(context, parseInt(transactionId, 10));
        }
        else {
            await listTransactions(context, req);
        }
    }
    catch (err) {
        context.log.error('Transactions handler error:', err);
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
 * Get a single transaction by ID
 */
async function getTransaction(context, transactionId) {
    context.log(`Getting transaction: ${transactionId}`);
    const result = await (0, database_1.executeQuery)(`SELECT 
            t.*,
            a.account_name,
            a.account_type,
            a.account_subtype,
            a.item_id,
            i.institution_name,
            i.client_id
        FROM transactions t
        JOIN accounts a ON t.account_id = a.account_id
        JOIN items i ON a.item_id = i.item_id
        WHERE t.transaction_id = @transactionId
          AND t.is_archived = 0`, { transactionId });
    if (result.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Transaction not found' },
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
 * List transactions with filtering and pagination
 */
async function listTransactions(context, req) {
    context.log('Listing transactions');
    // Parse query parameters
    const accountId = req.query.accountId ? parseInt(req.query.accountId, 10) : null;
    const itemId = req.query.itemId ? parseInt(req.query.itemId, 10) : null;
    const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const pendingFilter = req.query.pending; // 'true' or 'false'
    const isTransferFilter = req.query.isTransfer; // 'true' or 'false'
    const uncategorizedOnly = req.query.uncategorized === 'true';
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    // Build dynamic query
    const conditions = [
        't.is_archived = 0',
        't.is_removed = 0',
    ];
    const params = { limit, offset };
    if (accountId) {
        conditions.push('t.account_id = @accountId');
        params.accountId = accountId;
    }
    if (itemId) {
        conditions.push('a.item_id = @itemId');
        params.itemId = itemId;
    }
    if (clientId) {
        conditions.push('i.client_id = @clientId');
        params.clientId = clientId;
    }
    if (startDate) {
        conditions.push('t.transaction_date >= @startDate');
        params.startDate = startDate;
    }
    if (endDate) {
        conditions.push('t.transaction_date <= @endDate');
        params.endDate = endDate;
    }
    if (pendingFilter !== undefined) {
        conditions.push('t.pending = @pending');
        params.pending = pendingFilter === 'true';
    }
    if (isTransferFilter !== undefined) {
        conditions.push('t.is_transfer = @isTransfer');
        params.isTransfer = isTransferFilter === 'true';
    }
    if (uncategorizedOnly) {
        // Transactions that need categorization:
        // - category_verified is false AND
        // - confidence score is low/null OR final_category is 'not_verified'
        conditions.push('(t.category_verified = 0 AND (t.plaid_confidence_score IS NULL OR t.plaid_confidence_score < 0.7))');
    }
    const whereClause = conditions.join(' AND ');
    // Get total count
    const countResult = await (0, database_1.executeQuery)(`SELECT COUNT(*) as total
         FROM transactions t
         JOIN accounts a ON t.account_id = a.account_id
         JOIN items i ON a.item_id = i.item_id
         WHERE ${whereClause}`, params);
    const total = countResult.recordset[0].total;
    // Get transactions
    const result = await (0, database_1.executeQuery)(`SELECT 
            t.transaction_id,
            t.account_id,
            t.plaid_transaction_id,
            t.transaction_date,
            t.transaction_datetime,
            t.posted_date,
            t.authorized_date,
            t.merchant_name,
            t.original_description,
            t.merchant_logo_url,
            t.merchant_website,
            t.amount,
            t.iso_currency_code,
            t.payment_channel,
            t.pending,
            t.is_transfer,
            t.transaction_status,
            t.plaid_primary_category,
            t.plaid_detailed_category,
            t.plaid_confidence_score,
            t.category_verified,
            t.final_category,
            t.created_at,
            t.updated_at,
            a.account_name,
            a.account_type,
            a.account_subtype,
            a.item_id,
            i.institution_name,
            i.client_id
        FROM transactions t
        JOIN accounts a ON t.account_id = a.account_id
        JOIN items i ON a.item_id = i.item_id
        WHERE ${whereClause}
        ORDER BY t.transaction_date DESC, t.created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY`, params);
    context.res = {
        status: 200,
        body: {
            transactions: result.recordset,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + result.recordset.length < total,
            },
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map