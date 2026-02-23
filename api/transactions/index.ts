/**
 * Transactions Endpoint
 * 
 * GET /api/transactions - List transactions with filtering
 * GET /api/transactions/:id - Get single transaction
 * PUT /api/transactions/:id/categorize - Manually categorize a transaction
 * PUT /api/transactions/:id/verify - Verify existing category without changing
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

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';

/**
 * Transaction record from database
 */
interface TransactionRecord {
    transaction_id: number;
    account_id: number;
    plaid_transaction_id: string;
    transaction_date: string;
    transaction_datetime: string | null;
    posted_date: string | null;
    authorized_date: string | null;
    merchant_name: string | null;
    original_description: string;
    merchant_logo_url: string | null;
    merchant_website: string | null;
    amount: number;
    iso_currency_code: string | null;
    payment_channel: string | null;
    transaction_code: string | null;
    pending: boolean;
    is_transfer: boolean;
    transaction_status: string;
    is_removed: boolean;
    plaid_primary_category: string | null;
    plaid_detailed_category: string | null;
    plaid_confidence_score: number | null;
    category_verified: boolean;
    manually_verified: boolean;
    manual_primary_category: string | null;
    manual_detailed_category: string | null;
    processed_into_ledger: boolean;
    updated_since_process: boolean;
    sync_status: string;
    created_at: string;
    updated_at: string;
}

/**
 * Extended transaction with account and item info
 */
interface TransactionWithDetails extends TransactionRecord {
    account_name: string | null;
    account_type: string;
    account_subtype: string | null;
    item_id: number;
    institution_name: string | null;
    client_id: number;
}

/**
 * CORS headers for all responses
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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
        const transactionId = req.params?.id;
        const action = req.params?.action; // 'categorize' or 'verify'

        if (req.method === 'PUT' && transactionId) {
            if (action === 'categorize') {
                await categorizeTransaction(context, req, parseInt(transactionId, 10));
            } else if (action === 'verify') {
                await verifyTransaction(context, parseInt(transactionId, 10));
            } else {
                context.res = {
                    status: 400,
                    body: { error: 'Invalid action. Use /categorize or /verify' },
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                };
            }
        } else if (req.method === 'GET') {
            if (transactionId) {
                await getTransaction(context, parseInt(transactionId, 10));
            } else {
                await listTransactions(context, req);
            }
        } else {
            context.res = {
                status: 405,
                body: { error: 'Method not allowed' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
        }

    } catch (err) {
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
 * Manually categorize a transaction
 */
async function categorizeTransaction(
    context: Context,
    req: HttpRequest,
    transactionId: number
): Promise<void> {
    context.log(`Categorizing transaction: ${transactionId}`);

    const body = req.body || {};
    const { primary_category, detailed_category } = body;

    if (!primary_category || !detailed_category) {
        context.res = {
            status: 400,
            body: { error: 'primary_category and detailed_category are required' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    // Validate transaction exists
    const existing = await executeQuery<{ transaction_id: number }>(
        `SELECT transaction_id FROM transactions WHERE transaction_id = @transactionId AND is_archived = 0`,
        { transactionId }
    );

    if (existing.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Transaction not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    // Update transaction with manual category
    await executeQuery(
        `UPDATE transactions
         SET manual_primary_category = @primaryCategory,
             manual_detailed_category = @detailedCategory,
             category_verified = 1,
             manually_verified = 1,
             updated_at = GETDATE()
         WHERE transaction_id = @transactionId`,
        {
            transactionId,
            primaryCategory: primary_category,
            detailedCategory: detailed_category,
        }
    );

    context.log(`Transaction ${transactionId} categorized: ${primary_category} / ${detailed_category}`);

    context.res = {
        status: 200,
        body: {
            success: true,
            transaction_id: transactionId,
            primary_category,
            detailed_category,
            manually_verified: true,
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Verify a transaction's existing category without changing it
 */
async function verifyTransaction(
    context: Context,
    transactionId: number
): Promise<void> {
    context.log(`Verifying transaction: ${transactionId}`);

    // Validate transaction exists
    const existing = await executeQuery<{ 
        transaction_id: number;
        plaid_primary_category: string | null;
        plaid_detailed_category: string | null;
    }>(
        `SELECT transaction_id, plaid_primary_category, plaid_detailed_category 
         FROM transactions WHERE transaction_id = @transactionId AND is_archived = 0`,
        { transactionId }
    );

    if (existing.recordset.length === 0) {
        context.res = {
            status: 404,
            body: { error: 'Transaction not found' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    const tx = existing.recordset[0];

    // Mark as verified (use Plaid category as manual if not already set)
    await executeQuery(
        `UPDATE transactions
         SET category_verified = 1,
             manually_verified = 1,
             manual_primary_category = COALESCE(manual_primary_category, plaid_primary_category),
             manual_detailed_category = COALESCE(manual_detailed_category, plaid_detailed_category),
             updated_at = GETDATE()
         WHERE transaction_id = @transactionId`,
        { transactionId }
    );

    context.log(`Transaction ${transactionId} verified`);

    context.res = {
        status: 200,
        body: {
            success: true,
            transaction_id: transactionId,
            primary_category: tx.plaid_primary_category,
            detailed_category: tx.plaid_detailed_category,
            manually_verified: true,
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}

/**
 * Get a single transaction by ID
 */
async function getTransaction(
    context: Context,
    transactionId: number
): Promise<void> {
    context.log(`Getting transaction: ${transactionId}`);

    const result = await executeQuery<TransactionWithDetails>(
        `SELECT 
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
          AND t.is_archived = 0`,
        { transactionId }
    );

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
async function listTransactions(
    context: Context,
    req: HttpRequest
): Promise<void> {
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
    const conditions: string[] = [
        't.is_archived = 0',
        't.is_removed = 0',
    ];
    const params: Record<string, any> = { limit, offset };

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
        // - confidence score is below HIGH threshold (< 0.80)
        conditions.push(
            '(t.category_verified = 0 AND (t.plaid_confidence_score IS NULL OR t.plaid_confidence_score < 0.80))'
        );
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await executeQuery<{ total: number }>(
        `SELECT COUNT(*) as total
         FROM transactions t
         JOIN accounts a ON t.account_id = a.account_id
         JOIN items i ON a.item_id = i.item_id
         WHERE ${whereClause}`,
        params
    );
    const total = countResult.recordset[0].total;

    // Get transactions
    const result = await executeQuery<TransactionWithDetails>(
        `SELECT 
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
            t.manually_verified,
            t.manual_primary_category,
            t.manual_detailed_category,
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
        FETCH NEXT @limit ROWS ONLY`,
        params
    );

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

export default httpTrigger;