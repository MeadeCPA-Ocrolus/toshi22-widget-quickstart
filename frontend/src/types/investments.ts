/**
 * Investments Types
 * 
 * TypeScript interfaces for investment data (holdings, securities, transactions)
 * 
 * @module types/investments
 */

// ============================================================================
// Security Types
// ============================================================================

/**
 * Security type as returned by Plaid
 */
export type SecurityType = 
    | 'cash'
    | 'cryptocurrency'
    | 'derivative'
    | 'equity'
    | 'etf'
    | 'fixed income'
    | 'loan'
    | 'mutual fund'
    | 'other';

/**
 * Security subtype - more specific classification
 */
export type SecuritySubtype =
    | 'bill'
    | 'bond'
    | 'cash'
    | 'common stock'
    | 'cryptocurrency'
    | 'etf'
    | 'mutual fund'
    | 'option'
    | 'preferred equity'
    | 'other'
    | string;

/**
 * Option contract details (for derivatives)
 */
export interface OptionContract {
    contract_type: 'put' | 'call';
    expiration_date: string | null;
    strike_price: number | null;
    underlying_ticker: string | null;
}

/**
 * Security data - information about a specific security
 */
export interface Security {
    security_id: number;
    plaid_security_id: string;
    ticker_symbol: string | null;
    name: string | null;
    type: SecurityType | null;
    subtype: SecuritySubtype | null;
    is_cash_equivalent: boolean;
    close_price: number | null;
    close_price_as_of: string | null;
    sector: string | null;
    industry: string | null;
    option_contract: OptionContract | null;
}

// ============================================================================
// Holding Types
// ============================================================================

/**
 * Investment holding - a position in a specific security within an account
 */
export interface InvestmentHolding {
    holding_id: number;
    account_id: number;
    quantity: number;
    institution_price: number;
    institution_price_as_of: string | null;
    institution_price_datetime: string | null;
    institution_value: number;
    cost_basis: number | null;
    iso_currency_code: string | null;
    unofficial_currency_code: string | null;
    vested_quantity: number | null;
    vested_value: number | null;
    security: Security;
    account_name: string;
    account_balance: number | null;
}

// ============================================================================
// Investment Transaction Types
// ============================================================================

export type InvestmentTransactionType = 
    | 'buy'
    | 'sell'
    | 'cancel'
    | 'cash'
    | 'fee'
    | 'transfer';

export type InvestmentTransactionSubtype =
    | 'dividend'
    | 'interest'
    | 'contribution'
    | 'withdrawal'
    | 'buy'
    | 'sell'
    | 'fee'
    | string;

export interface TransactionSecurity {
    security_id: number;
    ticker_symbol: string | null;
    name: string | null;
    type: string | null;
}

/**
 * Investment transaction - buy, sell, dividend, fee, etc.
 */
export interface InvestmentTransaction {
    investment_transaction_id: number;
    account_id: number;
    plaid_investment_transaction_id: string;
    transaction_date: string;
    name: string | null;
    transaction_type: InvestmentTransactionType;
    transaction_subtype: InvestmentTransactionSubtype | null;
    amount: number;
    price: number | null;
    quantity: number | null;
    fees: number | null;
    cancel_transaction_id: string | null;
    iso_currency_code: string | null;
    unofficial_currency_code: string | null;
    security: TransactionSecurity | null;
    account_name: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface InvestmentsSummary {
    total_holdings: number;
    total_transactions: number;
    total_value: number;
}

export interface InvestmentsResponse {
    holdings: InvestmentHolding[];
    transactions: InvestmentTransaction[];
    summary: InvestmentsSummary;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatSecurityType(type: SecurityType | null): string {
    if (!type) return 'Unknown';
    switch (type) {
        case 'cash': return 'Cash';
        case 'cryptocurrency': return 'Crypto';
        case 'derivative': return 'Derivative';
        case 'equity': return 'Equity';
        case 'etf': return 'ETF';
        case 'fixed income': return 'Fixed Income';
        case 'loan': return 'Loan';
        case 'mutual fund': return 'Mutual Fund';
        case 'other': return 'Other';
        default: return type;
    }
}

export function formatTransactionType(type: InvestmentTransactionType): string {
    switch (type) {
        case 'buy': return 'Buy';
        case 'sell': return 'Sell';
        case 'cancel': return 'Cancel';
        case 'cash': return 'Cash';
        case 'fee': return 'Fee';
        case 'transfer': return 'Transfer';
        default: return type;
    }
}

export function formatTransactionSubtype(subtype: string | null): string {
    if (!subtype) return '';
    return subtype
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function getTransactionTypeColor(type: InvestmentTransactionType): 'success' | 'error' | 'warning' | 'info' | 'default' {
    switch (type) {
        case 'buy': return 'success';
        case 'sell': return 'error';
        case 'fee': return 'warning';
        case 'cash': return 'info';
        case 'transfer': return 'info';
        case 'cancel': return 'default';
        default: return 'default';
    }
}

export function getSecurityTypeColor(type: SecurityType | null): 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'default' {
    switch (type) {
        case 'equity': return 'primary';
        case 'etf': return 'info';
        case 'mutual fund': return 'info';
        case 'fixed income': return 'secondary';
        case 'cash': return 'success';
        case 'cryptocurrency': return 'warning';
        case 'derivative': return 'warning';
        default: return 'default';
    }
}

export function calculateGainLoss(holding: InvestmentHolding): { amount: number; percentage: number } | null {
    if (holding.cost_basis === null || holding.cost_basis === 0) {
        return null;
    }
    const amount = holding.institution_value - holding.cost_basis;
    const percentage = (amount / holding.cost_basis) * 100;
    return { amount, percentage };
}

export function hasVestingData(holding: InvestmentHolding): boolean {
    return holding.vested_quantity !== null || holding.vested_value !== null;
}

export function formatOptionContract(option: OptionContract | null): string {
    if (!option) return '';
    const parts = [
        option.underlying_ticker || 'Unknown',
        option.contract_type?.toUpperCase(),
        option.strike_price ? `$${option.strike_price}` : null,
        option.expiration_date ? `exp ${option.expiration_date}` : null,
    ].filter(Boolean);
    return parts.join(' ');
}

export function isIncomeTransaction(transaction: InvestmentTransaction): boolean {
    const incomeSubtypes = ['dividend', 'interest', 'qualified dividend', 'non-qualified dividend'];
    return transaction.transaction_subtype !== null && 
           incomeSubtypes.includes(transaction.transaction_subtype.toLowerCase());
}