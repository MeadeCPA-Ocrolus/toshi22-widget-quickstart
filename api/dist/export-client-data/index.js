"use strict";
/**
 * Client Data Export Endpoint
 *
 * GET /api/export-client-data?clientUuid=... — exports everything Azure
 * holds for one client as a downloadable ZIP: one folder per bank
 * connection, with a single-schema CSV per data type (accounts,
 * transactions, liabilities, holdings, securities, investment
 * transactions), plus a top-level client_info.csv.
 *
 * This is a staff-facing audit/export tool — not the TaxDome push itself.
 * Structuring it this way (clean, single-schema CSVs, clearly labeled
 * folders) also happens to be the right shape for a future automated
 * TaxDome hand-off or MCP consumption, without redesigning anything later.
 *
 * @module export-client-data
 */
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
const auth_1 = require("../shared/auth");
const database_1 = require("../shared/database");
const csv_export_1 = require("../shared/csv-export");
const { ZipArchive } = require('archiver');
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-client-principal',
};
const httpTrigger = async function (context, req) {
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
    const principal = (0, auth_1.requireAuth)(context, req, corsHeaders);
    if (!principal)
        return;
    try {
        const clientUuid = req.query?.clientUuid;
        if (!clientUuid) {
            context.res = {
                status: 400,
                body: { error: 'clientUuid query parameter is required' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        // Look up the client — need client_id for internal joins, never expose it in the export
        const clientResult = await (0, database_1.executeQuery)(`SELECT client_id, first_name, last_name, business_name, email, phone_number,
                    account_type, state, fiscal_year_start_date,
                    federal_effective_tax_rate, state_effective_tax_rate,
                    self_employment_tax_rate, income_type
             FROM clients WHERE client_uuid = @clientUuid AND is_archived = 0`, { clientUuid });
        if (clientResult.recordset.length === 0) {
            context.res = {
                status: 404,
                body: { error: 'Client not found' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }
        const client = clientResult.recordset[0];
        const clientId = client.client_id;
        const clientName = `${client.first_name}_${client.last_name}`;
        // All bank connections for this client
        const itemsResult = await (0, database_1.executeQuery)(`SELECT item_id, institution_name, institution_id, status
             FROM items WHERE client_id = @clientId`, { clientId });
        const archive = new ZipArchive({ zlib: { level: 9 } });
        const chunks = [];
        const passthrough = new stream_1.PassThrough();
        passthrough.on('data', (chunk) => chunks.push(chunk));
        archive.pipe(passthrough);
        // --- client_info.csv, at the root of the zip ---
        const clientInfoCsv = (0, csv_export_1.toCsv)([client], [
            { key: 'first_name', header: 'First Name' },
            { key: 'last_name', header: 'Last Name' },
            { key: 'business_name', header: 'Business Name' },
            { key: 'email', header: 'Email' },
            { key: 'phone_number', header: 'Phone Number' },
            { key: 'account_type', header: 'Account Type' },
            { key: 'state', header: 'State' },
            { key: 'fiscal_year_start_date', header: 'Fiscal Year Start' },
            { key: 'federal_effective_tax_rate', header: 'Federal Tax Rate' },
            { key: 'state_effective_tax_rate', header: 'State Tax Rate' },
            { key: 'self_employment_tax_rate', header: 'Self-Employment Tax Rate' },
            { key: 'income_type', header: 'Income Type' },
        ]);
        archive.append(clientInfoCsv, { name: 'client_info.csv' });
        // --- one folder per bank connection ---
        for (const item of itemsResult.recordset) {
            const folderName = (0, csv_export_1.sanitizeFilename)(`${item.institution_name || 'Unknown_Bank'}_${item.item_id}`);
            // Accounts for this item
            const accountsResult = await (0, database_1.executeQuery)(`SELECT account_id, account_name, official_name, account_type, account_subtype, mask,
                        current_balance, available_balance, credit_limit, is_active
                 FROM accounts WHERE item_id = @itemId`, { itemId: item.item_id });
            const accountIds = accountsResult.recordset.map((a) => a.account_id);
            archive.append((0, csv_export_1.toCsv)(accountsResult.recordset, [
                { key: 'account_id', header: 'Account ID' },
                { key: 'account_name', header: 'Account Name' },
                { key: 'official_name', header: 'Official Name' },
                { key: 'account_type', header: 'Type' },
                { key: 'account_subtype', header: 'Subtype' },
                { key: 'mask', header: 'Mask (Last 4)' },
                { key: 'current_balance', header: 'Current Balance' },
                { key: 'available_balance', header: 'Available Balance' },
                { key: 'credit_limit', header: 'Credit Limit' },
                { key: 'is_active', header: 'Status' },
            ]), { name: `${folderName}/accounts.csv` });
            if (accountIds.length === 0)
                continue; // nothing else to export for an item with no accounts
            // Transactions — one query per item, matches this codebase's existing per-item pattern
            const transactionsResult = await (0, database_1.executeQuery)(`SELECT t.account_id, a.account_name, t.transaction_date, t.merchant_name, t.original_description,
                        t.amount, t.iso_currency_code, t.pending, t.final_category, t.manual_primary_category
                 FROM transactions t
                 JOIN accounts a ON t.account_id = a.account_id
                 WHERE a.item_id = @itemId AND t.is_removed = 0 AND t.is_archived = 0
                 ORDER BY t.transaction_date DESC`, { itemId: item.item_id });
            if (transactionsResult.recordset.length > 0) {
                archive.append((0, csv_export_1.toCsv)(transactionsResult.recordset, [
                    { key: 'account_id', header: 'Account ID' },
                    { key: 'account_name', header: 'Account Name' },
                    { key: 'transaction_date', header: 'Date' },
                    { key: 'merchant_name', header: 'Merchant' },
                    { key: 'original_description', header: 'Description' },
                    { key: 'amount', header: 'Amount' },
                    { key: 'iso_currency_code', header: 'Currency' },
                    { key: 'pending', header: 'Pending' },
                    { key: 'final_category', header: 'Category' },
                    { key: 'manual_primary_category', header: 'Manual Category' },
                ]), { name: `${folderName}/transactions.csv` });
            }
            // Liabilities — three distinct shapes, only written if present
            const creditResult = await (0, database_1.executeQuery)(`SELECT l.credit_liability_id, l.account_id, a.account_name, l.is_overdue, l.last_payment_amount, l.last_payment_date,
                        l.last_statement_balance, l.last_statement_issue_date, l.minimum_payment_amount, l.next_payment_due_date
                 FROM liabilities_credit l JOIN accounts a ON l.account_id = a.account_id
                 WHERE a.item_id = @itemId AND l.is_archived = 0`, { itemId: item.item_id });
            if (creditResult.recordset.length > 0) {
                archive.append((0, csv_export_1.toCsv)(creditResult.recordset, [
                    { key: 'account_id', header: 'Account ID' },
                    { key: 'account_name', header: 'Account Name' },
                    { key: 'is_overdue', header: 'Overdue' },
                    { key: 'last_payment_amount', header: 'Last Payment Amount' },
                    { key: 'last_payment_date', header: 'Last Payment Date' },
                    { key: 'last_statement_balance', header: 'Last Statement Balance' },
                    { key: 'last_statement_issue_date', header: 'Last Statement Date' },
                    { key: 'minimum_payment_amount', header: 'Minimum Payment' },
                    { key: 'next_payment_due_date', header: 'Next Payment Due' },
                ]), { name: `${folderName}/liabilities_credit.csv` });
            }
            // Credit APRs — separate one-to-many child table (purchase/cash-advance/
            // balance-transfer APRs can each have their own rate on one card)
            const creditAprsResult = await (0, database_1.executeQuery)(`SELECT ca.credit_liability_id, l.account_id, a.account_name, ca.apr_percentage, ca.apr_type,
                        ca.balance_subject_to_apr, ca.interest_charge_amount
                 FROM liabilities_credit_aprs ca
                 JOIN liabilities_credit l ON ca.credit_liability_id = l.credit_liability_id
                 JOIN accounts a ON l.account_id = a.account_id
                 WHERE a.item_id = @itemId AND l.is_archived = 0`, { itemId: item.item_id });
            if (creditAprsResult.recordset.length > 0) {
                archive.append((0, csv_export_1.toCsv)(creditAprsResult.recordset, [
                    { key: 'account_id', header: 'Account ID' },
                    { key: 'account_name', header: 'Account Name' },
                    { key: 'apr_type', header: 'APR Type' },
                    { key: 'apr_percentage', header: 'APR %' },
                    { key: 'balance_subject_to_apr', header: 'Balance Subject to APR' },
                    { key: 'interest_charge_amount', header: 'Interest Charge Amount' },
                ]), { name: `${folderName}/liabilities_credit_aprs.csv` });
            }
            const studentResult = await (0, database_1.executeQuery)(`SELECT l.account_id, a.account_name, l.loan_name, l.origination_date, l.origination_principal_amount,
                        l.interest_rate_percentage, l.loan_status_type, l.outstanding_interest_amount,
                        l.last_statement_balance, l.last_statement_issue_date,
                        l.is_overdue, l.last_payment_amount, l.last_payment_date, l.next_payment_due_date
                 FROM liabilities_student l JOIN accounts a ON l.account_id = a.account_id
                 WHERE a.item_id = @itemId AND l.is_archived = 0`, { itemId: item.item_id });
            if (studentResult.recordset.length > 0) {
                archive.append((0, csv_export_1.toCsv)(studentResult.recordset, [
                    { key: 'account_id', header: 'Account ID' },
                    { key: 'account_name', header: 'Account Name' },
                    { key: 'loan_name', header: 'Loan Name' },
                    { key: 'origination_date', header: 'Origination Date' },
                    { key: 'origination_principal_amount', header: 'Original Principal' },
                    { key: 'interest_rate_percentage', header: 'Interest Rate' },
                    { key: 'loan_status_type', header: 'Status' },
                    { key: 'outstanding_interest_amount', header: 'Outstanding Interest' },
                    { key: 'last_statement_balance', header: 'Last Statement Balance' },
                    { key: 'last_statement_issue_date', header: 'Last Statement Date' },
                    { key: 'is_overdue', header: 'Overdue' },
                    { key: 'last_payment_amount', header: 'Last Payment Amount' },
                    { key: 'last_payment_date', header: 'Last Payment Date' },
                    { key: 'next_payment_due_date', header: 'Next Payment Due' },
                ]), { name: `${folderName}/liabilities_student.csv` });
            }
            const mortgageResult = await (0, database_1.executeQuery)(`SELECT l.account_id, a.account_name, l.loan_type_description, l.origination_date,
                        l.origination_principal_amount, l.maturity_date, l.interest_rate_percentage,
                        l.interest_rate_type, l.escrow_balance, l.last_statement_balance, l.past_due_amount,
                        l.last_payment_amount, l.last_payment_date, l.next_monthly_payment, l.next_payment_due_date
                 FROM liabilities_mortgage l JOIN accounts a ON l.account_id = a.account_id
                 WHERE a.item_id = @itemId AND l.is_archived = 0`, { itemId: item.item_id });
            if (mortgageResult.recordset.length > 0) {
                archive.append((0, csv_export_1.toCsv)(mortgageResult.recordset, [
                    { key: 'account_id', header: 'Account ID' },
                    { key: 'account_name', header: 'Account Name' },
                    { key: 'loan_type_description', header: 'Loan Type' },
                    { key: 'origination_date', header: 'Origination Date' },
                    { key: 'origination_principal_amount', header: 'Original Principal' },
                    { key: 'maturity_date', header: 'Maturity Date' },
                    { key: 'interest_rate_percentage', header: 'Interest Rate' },
                    { key: 'interest_rate_type', header: 'Rate Type' },
                    { key: 'escrow_balance', header: 'Escrow Balance' },
                    { key: 'last_statement_balance', header: 'Last Statement Balance' },
                    { key: 'past_due_amount', header: 'Past Due' },
                    { key: 'last_payment_amount', header: 'Last Payment Amount' },
                    { key: 'last_payment_date', header: 'Last Payment Date' },
                    { key: 'next_monthly_payment', header: 'Next Monthly Payment' },
                    { key: 'next_payment_due_date', header: 'Next Payment Due' },
                ]), { name: `${folderName}/liabilities_mortgage.csv` });
            }
            // Holdings + securities (joined, so ticker/name are readable, not just IDs)
            const holdingsResult = await (0, database_1.executeQuery)(`SELECT h.account_id, a.account_name, s.ticker_symbol, s.name AS security_name, s.security_type,
                        h.quantity, h.institution_price, h.institution_value, h.cost_basis, h.iso_currency_code
                 FROM holdings h
                 JOIN accounts a ON h.account_id = a.account_id
                 LEFT JOIN securities s ON h.security_id = s.security_id
                 WHERE a.item_id = @itemId AND h.is_archived = 0`, { itemId: item.item_id });
            if (holdingsResult.recordset.length > 0) {
                archive.append((0, csv_export_1.toCsv)(holdingsResult.recordset, [
                    { key: 'account_id', header: 'Account ID' },
                    { key: 'account_name', header: 'Account Name' },
                    { key: 'ticker_symbol', header: 'Ticker' },
                    { key: 'security_name', header: 'Security Name' },
                    { key: 'security_type', header: 'Type' },
                    { key: 'quantity', header: 'Quantity' },
                    { key: 'institution_price', header: 'Price' },
                    { key: 'institution_value', header: 'Value' },
                    { key: 'cost_basis', header: 'Cost Basis' },
                    { key: 'iso_currency_code', header: 'Currency' },
                ]), { name: `${folderName}/holdings.csv` });
            }
            // Investment transactions (joined with securities for readable names)
            const invTxnResult = await (0, database_1.executeQuery)(`SELECT it.account_id, a.account_name, s.ticker_symbol, s.name AS security_name,
                        it.transaction_date, it.name AS transaction_name, it.transaction_type,
                        it.transaction_subtype, it.amount, it.price, it.quantity, it.fees, it.iso_currency_code
                 FROM investment_transactions it
                 JOIN accounts a ON it.account_id = a.account_id
                 LEFT JOIN securities s ON it.security_id = s.security_id
                 WHERE a.item_id = @itemId AND it.is_archived = 0
                 ORDER BY it.transaction_date DESC`, { itemId: item.item_id });
            if (invTxnResult.recordset.length > 0) {
                archive.append((0, csv_export_1.toCsv)(invTxnResult.recordset, [
                    { key: 'account_id', header: 'Account ID' },
                    { key: 'account_name', header: 'Account Name' },
                    { key: 'ticker_symbol', header: 'Ticker' },
                    { key: 'security_name', header: 'Security Name' },
                    { key: 'transaction_date', header: 'Date' },
                    { key: 'transaction_name', header: 'Description' },
                    { key: 'transaction_type', header: 'Type' },
                    { key: 'transaction_subtype', header: 'Subtype' },
                    { key: 'amount', header: 'Amount' },
                    { key: 'price', header: 'Price' },
                    { key: 'quantity', header: 'Quantity' },
                    { key: 'fees', header: 'Fees' },
                    { key: 'iso_currency_code', header: 'Currency' },
                ]), { name: `${folderName}/investment_transactions.csv` });
            }
        }
        await archive.finalize();
        const zipBuffer = Buffer.concat(chunks);
        const filename = `${(0, csv_export_1.sanitizeFilename)(clientName)}_export.zip`;
        context.log(`Exported data for client ${clientUuid}: ${itemsResult.recordset.length} banks, ${zipBuffer.length} bytes`);
        context.res = {
            status: 200,
            isRaw: true,
            body: zipBuffer,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        context.log.error(`Export failed: ${errorMessage}`);
        context.res = {
            status: 500,
            body: { error: 'Failed to generate export' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map