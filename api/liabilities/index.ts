/**
 * Liabilities Endpoint
 * 
 * GET /api/liabilities?accountId=X - Get liability for specific account
 * GET /api/liabilities?itemId=X - Get all liabilities for an item
 * GET /api/liabilities?clientId=X - Get all liabilities for a client
 * 
 * @module liabilities
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';

// ============================================================================
// Types
// ============================================================================

interface CreditLiability {
    credit_liability_id: number;
    account_id: number;
    is_overdue: boolean;
    last_payment_amount: number | null;
    last_payment_date: string | null;
    last_statement_balance: number | null;
    last_statement_issue_date: string | null;
    minimum_payment_amount: number | null;
    next_payment_due_date: string | null;
    aprs: Apr[];
    // Joined fields
    account_name?: string;
    current_balance?: number;
}

interface Apr {
    apr_id: number;
    apr_percentage: number | null;
    apr_type: string | null;
    balance_subject_to_apr: number | null;
    interest_charge_amount: number | null;
}

interface StudentLiability {
    student_liability_id: number;
    account_id: number;
    account_number: string | null;
    loan_name: string | null;
    origination_date: string | null;
    origination_principal_amount: number | null;
    expected_payoff_date: string | null;
    guarantor: string | null;
    interest_rate_percentage: number | null;
    loan_status_type: string | null;
    loan_status_end_date: string | null;
    repayment_plan_type: string | null;
    repayment_plan_description: string | null;
    last_statement_balance: number | null;
    outstanding_interest_amount: number | null;
    is_overdue: boolean;
    last_payment_amount: number | null;
    last_payment_date: string | null;
    minimum_payment_amount: number | null;
    next_payment_due_date: string | null;
    ytd_interest_paid: number | null;
    ytd_principal_paid: number | null;
    // Joined fields
    account_name?: string;
    current_balance?: number;
}

interface MortgageLiability {
    mortgage_liability_id: number;
    account_id: number;
    account_number: string | null;
    loan_type_description: string | null;
    loan_term: string | null;
    origination_date: string | null;
    origination_principal_amount: number | null;
    maturity_date: string | null;
    interest_rate_percentage: number | null;
    interest_rate_type: string | null;
    property_address_street: string | null;
    property_address_city: string | null;
    property_address_region: string | null;
    property_address_postal_code: string | null;
    has_pmi: boolean | null;
    has_prepayment_penalty: boolean | null;
    escrow_balance: number | null;
    current_late_fee: number | null;
    past_due_amount: number | null;
    last_payment_amount: number | null;
    last_payment_date: string | null;
    next_monthly_payment: number | null;
    next_payment_due_date: string | null;
    ytd_interest_paid: number | null;
    ytd_principal_paid: number | null;
    // Joined fields
    account_name?: string;
    current_balance?: number;
}

interface LiabilitiesResponse {
    credit: CreditLiability[];
    student: StudentLiability[];
    mortgage: MortgageLiability[];
}

// ============================================================================
// CORS
// ============================================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================================================
// Main Handler
// ============================================================================

const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
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

        const response: LiabilitiesResponse = {
            credit: [],
            student: [],
            mortgage: [],
        };

        // Build WHERE clause based on params
        let whereClause = '';
        const params: Record<string, any> = {};

        if (accountId) {
            whereClause = 'a.account_id = @accountId';
            params.accountId = accountId;
        } else if (itemId) {
            whereClause = 'a.item_id = @itemId';
            params.itemId = itemId;
        } else if (clientId) {
            whereClause = 'i.client_id = @clientId';
            params.clientId = clientId;
        }

        // Fetch Credit Card liabilities
        response.credit = await getCreditLiabilities(whereClause, params);

        // Fetch Student Loan liabilities
        response.student = await getStudentLiabilities(whereClause, params);

        // Fetch Mortgage liabilities
        response.mortgage = await getMortgageLiabilities(whereClause, params);

        context.res = {
            status: 200,
            body: response,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };

    } catch (err) {
        context.log.error('Liabilities handler error:', err);
        context.res = {
            status: 500,
            body: { error: 'Internal server error', message: err instanceof Error ? err.message : 'Unknown' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};

// ============================================================================
// Query Functions
// ============================================================================

async function getCreditLiabilities(whereClause: string, params: Record<string, any>): Promise<CreditLiability[]> {
    const result = await executeQuery<CreditLiability>(
        `SELECT 
            lc.credit_liability_id, lc.account_id,
            lc.is_overdue, lc.last_payment_amount, lc.last_payment_date,
            lc.last_statement_balance, lc.last_statement_issue_date,
            lc.minimum_payment_amount, lc.next_payment_due_date,
            a.account_name, a.current_balance
        FROM liabilities_credit lc
        JOIN accounts a ON lc.account_id = a.account_id
        JOIN items i ON a.item_id = i.item_id
        WHERE lc.is_archived = 0 AND a.is_active = 1 AND ${whereClause}
        ORDER BY lc.credit_liability_id`,
        params
    );

    // Fetch APRs for each credit liability
    for (const credit of result.recordset) {
        const aprs = await executeQuery<Apr>(
            `SELECT apr_id, apr_percentage, apr_type, balance_subject_to_apr, interest_charge_amount
             FROM liabilities_credit_aprs WHERE credit_liability_id = @creditLiabilityId`,
            { creditLiabilityId: credit.credit_liability_id }
        );
        credit.aprs = aprs.recordset;
    }

    return result.recordset;
}

async function getStudentLiabilities(whereClause: string, params: Record<string, any>): Promise<StudentLiability[]> {
    const result = await executeQuery<StudentLiability>(
        `SELECT 
            ls.student_liability_id, ls.account_id,
            ls.account_number, ls.loan_name,
            ls.origination_date, ls.origination_principal_amount, ls.expected_payoff_date,
            ls.guarantor, ls.interest_rate_percentage,
            ls.loan_status_type, ls.loan_status_end_date,
            ls.repayment_plan_type, ls.repayment_plan_description,
            ls.last_statement_balance, ls.outstanding_interest_amount,
            ls.is_overdue, ls.last_payment_amount, ls.last_payment_date,
            ls.minimum_payment_amount, ls.next_payment_due_date,
            ls.ytd_interest_paid, ls.ytd_principal_paid,
            a.account_name, a.current_balance
        FROM liabilities_student ls
        JOIN accounts a ON ls.account_id = a.account_id
        JOIN items i ON a.item_id = i.item_id
        WHERE ls.is_archived = 0 AND a.is_active = 1 AND ${whereClause}
        ORDER BY ls.student_liability_id`,
        params
    );

    return result.recordset;
}

async function getMortgageLiabilities(whereClause: string, params: Record<string, any>): Promise<MortgageLiability[]> {
    const result = await executeQuery<MortgageLiability>(
        `SELECT 
            lm.mortgage_liability_id, lm.account_id,
            lm.account_number, lm.loan_type_description, lm.loan_term,
            lm.origination_date, lm.origination_principal_amount, lm.maturity_date,
            lm.interest_rate_percentage, lm.interest_rate_type,
            lm.property_address_street, lm.property_address_city,
            lm.property_address_region, lm.property_address_postal_code,
            lm.has_pmi, lm.has_prepayment_penalty, lm.escrow_balance,
            lm.current_late_fee, lm.past_due_amount,
            lm.last_payment_amount, lm.last_payment_date,
            lm.next_monthly_payment, lm.next_payment_due_date,
            lm.ytd_interest_paid, lm.ytd_principal_paid,
            a.account_name, a.current_balance
        FROM liabilities_mortgage lm
        JOIN accounts a ON lm.account_id = a.account_id
        JOIN items i ON a.item_id = i.item_id
        WHERE lm.is_archived = 0 AND a.is_active = 1 AND ${whereClause}
        ORDER BY lm.mortgage_liability_id`,
        params
    );

    return result.recordset;
}

export default httpTrigger;