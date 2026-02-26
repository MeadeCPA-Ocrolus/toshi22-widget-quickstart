"use strict";
/**
 * Investments API Endpoint
 *
 * GET /api/investments?accountId=X - Get investments for a specific account
 * GET /api/investments?itemId=X - Get investments for all accounts in an item
 * GET /api/investments?clientId=X - Get investments for all accounts for a client
 *
 * Returns holdings with embedded security data, and investment transactions.
 *
 * @module investments
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
    if (req.method !== 'GET') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }
    try {
        const accountId = req.query.accountId ? parseInt(req.query.accountId, 10) : null;
        const itemId = req.query.itemId ? parseInt(req.query.itemId, 10) : null;
        const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
        if (!accountId && !itemId && !clientId) {
            context.res = {
                status: 400,
                body: { error: 'Must provide accountId, itemId, or clientId' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Build WHERE clause based on query params
        let whereClause = '';
        let params = {};
        if (accountId) {
            whereClause = 'WHERE h.account_id = @accountId AND h.is_archived = 0 AND a.is_active = 1';
            params = { accountId };
        }
        else if (itemId) {
            whereClause = 'WHERE a.item_id = @itemId AND h.is_archived = 0 AND a.is_active = 1';
            params = { itemId };
        }
        else if (clientId) {
            whereClause = `
                WHERE i.client_id = @clientId 
                AND h.is_archived = 0 
                AND a.is_active = 1 
                AND i.is_archived = 0
            `;
            params = { clientId };
        }
        // Query holdings with security and account info
        const holdingsQuery = `
            SELECT 
                h.holding_id,
                h.account_id,
                h.security_id,
                h.quantity,
                h.institution_price,
                h.institution_price_as_of,
                h.institution_price_datetime,
                h.institution_value,
                h.cost_basis,
                h.iso_currency_code,
                h.unofficial_currency_code,
                h.vested_quantity,
                h.vested_value,
                -- Security fields
                s.plaid_security_id,
                s.ticker_symbol,
                s.name AS security_name,
                s.security_type,
                s.security_subtype,
                s.is_cash_equivalent,
                s.close_price,
                s.close_price_as_of,
                s.sector,
                s.industry,
                s.option_contract,
                s.fixed_income,
                -- Account fields
                a.account_name,
                a.current_balance
            FROM holdings h
            JOIN securities s ON h.security_id = s.security_id
            JOIN accounts a ON h.account_id = a.account_id
            ${itemId || clientId ? 'JOIN items i ON a.item_id = i.item_id' : ''}
            ${whereClause}
            ORDER BY h.institution_value DESC
        `;
        const holdingsResult = await (0, database_1.executeQuery)(holdingsQuery, params);
        // Build WHERE clause for transactions
        let txnWhereClause = '';
        if (accountId) {
            txnWhereClause = 'WHERE t.account_id = @accountId AND t.is_archived = 0 AND a.is_active = 1';
        }
        else if (itemId) {
            txnWhereClause = 'WHERE a.item_id = @itemId AND t.is_archived = 0 AND a.is_active = 1';
        }
        else if (clientId) {
            txnWhereClause = `
                WHERE i.client_id = @clientId 
                AND t.is_archived = 0 
                AND a.is_active = 1 
                AND i.is_archived = 0
            `;
        }
        // Query investment transactions
        const transactionsQuery = `
            SELECT TOP 500
                t.investment_transaction_id,
                t.account_id,
                t.security_id,
                t.plaid_investment_transaction_id,
                t.transaction_date,
                t.name,
                t.transaction_type,
                t.transaction_subtype,
                t.amount,
                t.price,
                t.quantity,
                t.fees,
                t.cancel_transaction_id,
                t.iso_currency_code,
                t.unofficial_currency_code,
                -- Security fields (may be null)
                s.ticker_symbol,
                s.name AS security_name,
                s.security_type,
                -- Account fields
                a.account_name
            FROM investment_transactions t
            JOIN accounts a ON t.account_id = a.account_id
            LEFT JOIN securities s ON t.security_id = s.security_id
            ${itemId || clientId ? 'JOIN items i ON a.item_id = i.item_id' : ''}
            ${txnWhereClause}
            ORDER BY t.transaction_date DESC, t.investment_transaction_id DESC
        `;
        const transactionsResult = await (0, database_1.executeQuery)(transactionsQuery, params);
        // Format response
        const holdings = holdingsResult.recordset.map(h => {
            // Parse JSON columns
            let optionContract = null;
            let fixedIncome = null;
            try {
                if (h.option_contract) {
                    optionContract = JSON.parse(h.option_contract);
                }
                if (h.fixed_income) {
                    fixedIncome = JSON.parse(h.fixed_income);
                }
            }
            catch (e) {
                // Invalid JSON, leave as null
            }
            return {
                holding_id: h.holding_id,
                account_id: h.account_id,
                quantity: h.quantity,
                institution_price: h.institution_price,
                institution_price_as_of: h.institution_price_as_of,
                institution_price_datetime: h.institution_price_datetime,
                institution_value: h.institution_value,
                cost_basis: h.cost_basis,
                iso_currency_code: h.iso_currency_code,
                unofficial_currency_code: h.unofficial_currency_code,
                vested_quantity: h.vested_quantity,
                vested_value: h.vested_value,
                // Embedded security
                security: {
                    security_id: h.security_id,
                    plaid_security_id: h.plaid_security_id,
                    ticker_symbol: h.ticker_symbol,
                    name: h.security_name,
                    type: h.security_type,
                    subtype: h.security_subtype,
                    is_cash_equivalent: h.is_cash_equivalent,
                    close_price: h.close_price,
                    close_price_as_of: h.close_price_as_of,
                    sector: h.sector,
                    industry: h.industry,
                    option_contract: optionContract,
                    fixed_income: fixedIncome,
                },
                // Account info
                account_name: h.account_name,
                account_balance: h.current_balance,
            };
        });
        const transactions = transactionsResult.recordset.map(t => ({
            investment_transaction_id: t.investment_transaction_id,
            account_id: t.account_id,
            plaid_investment_transaction_id: t.plaid_investment_transaction_id,
            transaction_date: t.transaction_date,
            name: t.name,
            transaction_type: t.transaction_type,
            transaction_subtype: t.transaction_subtype,
            amount: t.amount,
            price: t.price,
            quantity: t.quantity,
            fees: t.fees,
            cancel_transaction_id: t.cancel_transaction_id,
            iso_currency_code: t.iso_currency_code,
            unofficial_currency_code: t.unofficial_currency_code,
            // Security info (if available)
            security: t.security_id ? {
                security_id: t.security_id,
                ticker_symbol: t.ticker_symbol,
                name: t.security_name,
                type: t.security_type,
            } : null,
            // Account info
            account_name: t.account_name,
        }));
        context.res = {
            status: 200,
            body: {
                holdings,
                transactions,
                summary: {
                    total_holdings: holdings.length,
                    total_transactions: transactions.length,
                    total_value: holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0),
                },
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
    catch (err) {
        context.log.error('Investments endpoint error:', err);
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