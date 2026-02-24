/**
 * Liabilities Types
 * 
 * TypeScript interfaces for liability data (credit cards, student loans, mortgages)
 * 
 * @module types/liabilities
 */

// ============================================================================
// Credit Card Liability
// ============================================================================

export interface Apr {
    apr_id: number;
    apr_percentage: number | null;
    apr_type: 'purchase_apr' | 'cash_apr' | 'balance_transfer_apr' | 'special' | string | null;
    balance_subject_to_apr: number | null;
    interest_charge_amount: number | null;
}

export interface CreditLiability {
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
    // Joined from accounts
    account_name?: string;
    current_balance?: number;
}

// ============================================================================
// Student Loan Liability
// ============================================================================

export type LoanStatusType = 
    | 'cancelled'
    | 'deferment'
    | 'extended'
    | 'forbearance'
    | 'in_grace'
    | 'in_military'
    | 'in_school'
    | 'not_fully_disbursed'
    | 'other'
    | 'paid_in_full'
    | 'pending_idr'
    | 'refund'
    | 'repayment'
    | 'transferred';

export type RepaymentPlanType =
    | 'standard'
    | 'graduated'
    | 'extended_graduated'
    | 'extended_standard'
    | 'income_contingent'
    | 'income_based'
    | 'pay_as_you_earn'
    | 'revised_pay_as_you_earn'
    | 'saving_on_a_valuable_education'
    | 'other';

export interface StudentLiability {
    student_liability_id: number;
    account_id: number;
    account_number: string | null;
    loan_name: string | null;
    origination_date: string | null;
    origination_principal_amount: number | null;
    expected_payoff_date: string | null;
    guarantor: string | null;
    interest_rate_percentage: number | null;
    loan_status_type: LoanStatusType | null;
    loan_status_end_date: string | null;
    repayment_plan_type: RepaymentPlanType | null;
    repayment_plan_description: string | null;
    outstanding_interest_amount: number | null;
    is_overdue: boolean;
    last_payment_amount: number | null;
    last_payment_date: string | null;
    minimum_payment_amount: number | null;
    next_payment_due_date: string | null;
    ytd_interest_paid: number | null;
    ytd_principal_paid: number | null;
    // Joined from accounts
    account_name?: string;
    current_balance?: number;
}

// ============================================================================
// Mortgage Liability
// ============================================================================

export interface MortgageLiability {
    mortgage_liability_id: number;
    account_id: number;
    account_number: string | null;
    loan_type_description: string | null;  // conventional, FHA, VA, etc.
    loan_term: string | null;              // e.g., "30 year"
    origination_date: string | null;
    origination_principal_amount: number | null;
    maturity_date: string | null;
    interest_rate_percentage: number | null;
    interest_rate_type: 'fixed' | 'variable' | string | null;
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
    // Joined from accounts
    account_name?: string;
    current_balance?: number;
}

// ============================================================================
// Combined Response
// ============================================================================

export interface LiabilitiesResponse {
    credit: CreditLiability[];
    student: StudentLiability[];
    mortgage: MortgageLiability[];
}

// ============================================================================
// Utility Types for Alerts
// ============================================================================

export interface LiabilityAlert {
    type: 'overdue' | 'past_due' | 'payment_due_soon' | 'late_fee';
    liability_type: 'credit' | 'student' | 'mortgage';
    account_id: number;
    account_name: string;
    message: string;
    amount?: number;
    due_date?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format APR type for display
 */
export function formatAprType(aprType: string | null): string {
    if (!aprType) return 'Unknown';
    return aprType
        .replace(/_/g, ' ')
        .replace(/apr/gi, 'APR')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Format loan status for display
 */
export function formatLoanStatus(status: string | null): string {
    if (!status) return 'Unknown';
    return status
        .replace(/_/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Get property address as single string
 */
export function formatPropertyAddress(mortgage: MortgageLiability): string {
    const parts = [
        mortgage.property_address_street,
        mortgage.property_address_city,
        mortgage.property_address_region,
        mortgage.property_address_postal_code,
    ].filter(Boolean);
    return parts.join(', ') || 'Address not available';
}

/**
 * Check if payment is due soon (within 7 days)
 */
export function isPaymentDueSoon(dueDate: string | null): boolean {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
}

/**
 * Check if payment is overdue
 */
export function isPaymentOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const now = new Date();
    return due < now;
}

/**
 * Generate alerts from liabilities
 */
export function generateLiabilityAlerts(liabilities: LiabilitiesResponse): LiabilityAlert[] {
    const alerts: LiabilityAlert[] = [];

    // Credit card alerts
    for (const cc of liabilities.credit) {
        if (cc.is_overdue) {
            alerts.push({
                type: 'overdue',
                liability_type: 'credit',
                account_id: cc.account_id,
                account_name: cc.account_name || 'Credit Card',
                message: 'Payment is overdue',
                amount: cc.minimum_payment_amount || undefined,
                due_date: cc.next_payment_due_date || undefined,
            });
        } else if (isPaymentDueSoon(cc.next_payment_due_date)) {
            alerts.push({
                type: 'payment_due_soon',
                liability_type: 'credit',
                account_id: cc.account_id,
                account_name: cc.account_name || 'Credit Card',
                message: 'Payment due soon',
                amount: cc.minimum_payment_amount || undefined,
                due_date: cc.next_payment_due_date || undefined,
            });
        }
    }

    // Student loan alerts
    for (const loan of liabilities.student) {
        if (loan.is_overdue) {
            alerts.push({
                type: 'overdue',
                liability_type: 'student',
                account_id: loan.account_id,
                account_name: loan.loan_name || loan.account_name || 'Student Loan',
                message: 'Payment is overdue',
                amount: loan.minimum_payment_amount || undefined,
                due_date: loan.next_payment_due_date || undefined,
            });
        } else if (isPaymentDueSoon(loan.next_payment_due_date)) {
            alerts.push({
                type: 'payment_due_soon',
                liability_type: 'student',
                account_id: loan.account_id,
                account_name: loan.loan_name || loan.account_name || 'Student Loan',
                message: 'Payment due soon',
                amount: loan.minimum_payment_amount || undefined,
                due_date: loan.next_payment_due_date || undefined,
            });
        }
    }

    // Mortgage alerts
    for (const m of liabilities.mortgage) {
        if (m.past_due_amount && m.past_due_amount > 0) {
            alerts.push({
                type: 'past_due',
                liability_type: 'mortgage',
                account_id: m.account_id,
                account_name: m.account_name || 'Mortgage',
                message: `Past due amount: $${m.past_due_amount.toFixed(2)}`,
                amount: m.past_due_amount,
            });
        }
        if (m.current_late_fee && m.current_late_fee > 0) {
            alerts.push({
                type: 'late_fee',
                liability_type: 'mortgage',
                account_id: m.account_id,
                account_name: m.account_name || 'Mortgage',
                message: `Late fee: $${m.current_late_fee.toFixed(2)}`,
                amount: m.current_late_fee,
            });
        }
        if (isPaymentDueSoon(m.next_payment_due_date)) {
            alerts.push({
                type: 'payment_due_soon',
                liability_type: 'mortgage',
                account_id: m.account_id,
                account_name: m.account_name || 'Mortgage',
                message: 'Payment due soon',
                amount: m.next_monthly_payment || undefined,
                due_date: m.next_payment_due_date || undefined,
            });
        }
    }

    return alerts;
}