/**
 * Liability Display Components
 * 
 * Cards showing liability details for credit cards, student loans, and mortgages.
 * Displayed above transaction list for applicable accounts.
 * 
 * @module Components/LiabilityCards
 */

import React from 'react';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Chip,
    Divider,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Alert,
    Tooltip,
    IconButton,
} from '@mui/material';
import {
    CreditCard,
    School,
    Home,
    AttachMoney,
    Refresh,
    Info,
} from '@mui/icons-material';
import {
    CreditLiability,
    StudentLiability,
    MortgageLiability,
    formatAprType,
    formatLoanStatus,
    formatPropertyAddress,
} from '../types/liabilities';
import { formatCurrency, formatDate } from '../services/api';

// Helper to handle undefined values for formatCurrency
const safeCurrency = (value: number | null | undefined): string => {
    return formatCurrency(value ?? null);
};

// ============================================================================
// Credit Card Liability Card
// ============================================================================

interface CreditLiabilityCardProps {
    liability: CreditLiability;
    onRefresh?: () => void;
}

export const CreditLiabilityCard: React.FC<CreditLiabilityCardProps> = ({ liability, onRefresh }) => {
    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CreditCard sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" fontWeight={600}>
                    Credit Card Details
                </Typography>
                {liability.account_name && (
                    <Typography variant="body2" color="text.secondary">
                        — {liability.account_name}
                    </Typography>
                )}
                {liability.is_overdue && (
                    <Chip label="OVERDUE" color="error" size="small" />
                )}
                <Box sx={{ flex: 1 }} />
                {onRefresh && (
                    <Tooltip title="Refresh liability data">
                        <IconButton size="small" onClick={onRefresh}>
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Current Balance</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {safeCurrency(liability.current_balance)}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Minimum Payment</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {safeCurrency(liability.minimum_payment_amount)}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Next Due Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {formatDate(liability.next_payment_due_date) || '—'}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Last Payment</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {safeCurrency(liability.last_payment_amount)} 
                        {liability.last_payment_date && (
                            <Typography component="span" variant="caption" color="text.secondary">
                                {' '}on {formatDate(liability.last_payment_date)}
                            </Typography>
                        )}
                    </Typography>
                </Grid>
            </Grid>

            {/* APRs with clearer labels */}
            {liability.aprs && liability.aprs.length > 0 && (
                <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Interest Rates (APRs)
                    </Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ border: 0, py: 0.5, pl: 0, fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                                    Type
                                </TableCell>
                                <TableCell align="right" sx={{ border: 0, py: 0.5, fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                                    Rate
                                </TableCell>
                                <TableCell align="right" sx={{ border: 0, py: 0.5, fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                                    Balance at Rate
                                </TableCell>
                                <TableCell align="right" sx={{ border: 0, py: 0.5, fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                                    Interest Charged
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {liability.aprs.map((apr, idx) => (
                                <TableRow key={idx}>
                                    <TableCell sx={{ border: 0, py: 0.5, pl: 0 }}>
                                        <Chip 
                                            label={formatAprType(apr.apr_type)} 
                                            size="small" 
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell align="right" sx={{ border: 0, py: 0.5 }}>
                                        <Typography variant="body2" fontWeight={500}>
                                            {apr.apr_percentage?.toFixed(2)}%
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right" sx={{ border: 0, py: 0.5 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            {safeCurrency(apr.balance_subject_to_apr)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right" sx={{ border: 0, py: 0.5 }}>
                                        {apr.interest_charge_amount != null && apr.interest_charge_amount > 0 ? (
                                            <Typography variant="body2" color="error.main">
                                                +{safeCurrency(apr.interest_charge_amount)}
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">—</Typography>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </>
            )}

            {/* Statement Info */}
            {liability.last_statement_balance && (
                <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">
                        Last Statement: {safeCurrency(liability.last_statement_balance)} on {formatDate(liability.last_statement_issue_date)}
                    </Typography>
                </Box>
            )}
        </Paper>
    );
};

// ============================================================================
// Student Loan Liability Card
// ============================================================================

interface StudentLiabilityCardProps {
    liability: StudentLiability;
    onRefresh?: () => void;
}

export const StudentLiabilityCard: React.FC<StudentLiabilityCardProps> = ({ liability, onRefresh }) => {
    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <School sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" fontWeight={600}>
                    Student Loan Details
                </Typography>
                {(liability.loan_name || liability.account_name) && (
                    <Typography variant="body2" color="text.secondary">
                        — {liability.loan_name || liability.account_name}
                    </Typography>
                )}
                {liability.is_overdue && (
                    <Chip label="OVERDUE" color="error" size="small" />
                )}
                {liability.account_number && (
                    <Chip label={`#${liability.account_number}`} size="small" variant="outlined" />
                )}
                <Box sx={{ flex: 1 }} />
                {onRefresh && (
                    <Tooltip title="Refresh liability data">
                        <IconButton size="small" onClick={onRefresh}>
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Current Balance</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {safeCurrency(liability.current_balance)}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Interest Rate</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {liability.interest_rate_percentage?.toFixed(2)}%
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Next Due Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {formatDate(liability.next_payment_due_date) || '—'}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Minimum Payment</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {safeCurrency(liability.minimum_payment_amount)}
                    </Typography>
                </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Loan Status</Typography>
                    <Typography variant="body2">
                        <Chip
                            label={formatLoanStatus(liability.loan_status_type)}
                            size="small"
                            color={liability.loan_status_type === 'repayment' ? 'primary' : 'default'}
                            variant="outlined"
                        />
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Repayment Plan</Typography>
                    <Typography variant="body2">
                        {formatLoanStatus(liability.repayment_plan_type) || '—'}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Outstanding Interest</Typography>
                    <Typography variant="body2" fontWeight={500}>
                        {safeCurrency(liability.outstanding_interest_amount)}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Expected Payoff</Typography>
                    <Typography variant="body2">
                        {formatDate(liability.expected_payoff_date) || '—'}
                    </Typography>
                </Grid>
            </Grid>

            {/* Tax-Deductible Interest */}
            {(liability.ytd_interest_paid != null && liability.ytd_interest_paid > 0) && (
                <>
                    <Divider sx={{ my: 2 }} />
                    <Alert severity="info" icon={<AttachMoney />}>
                        <Typography variant="body2">
                            <strong>YTD Interest Paid (Tax Deductible up to $2,500):</strong> {safeCurrency(liability.ytd_interest_paid)}
                            {liability.ytd_principal_paid != null && (
                                <> • <strong>YTD Principal Paid:</strong> {safeCurrency(liability.ytd_principal_paid)}</>
                            )}
                        </Typography>
                    </Alert>
                </>
            )}

            {/* Origination Info */}
            <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                    Originated: {formatDate(liability.origination_date)} •
                    Original Amount: {safeCurrency(liability.origination_principal_amount)}
                    {liability.guarantor && <> • Guarantor: {liability.guarantor}</>}
                </Typography>
            </Box>
        </Paper>
    );
};

// ============================================================================
// Mortgage Liability Card
// ============================================================================

interface MortgageLiabilityCardProps {
    liability: MortgageLiability;
    onRefresh?: () => void;
}

export const MortgageLiabilityCard: React.FC<MortgageLiabilityCardProps> = ({ liability, onRefresh }) => {
    const hasPaymentIssues = (liability.past_due_amount && liability.past_due_amount > 0) || 
                             (liability.current_late_fee && liability.current_late_fee > 0);
    
    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Home sx={{ color: 'primary.main' }} />
                <Typography variant="subtitle1" fontWeight={600}>
                    Mortgage Details
                </Typography>
                {liability.account_name && (
                    <Typography variant="body2" color="text.secondary">
                        — {liability.account_name}
                    </Typography>
                )}
                {liability.loan_type_description && (
                    <Chip label={liability.loan_type_description} size="small" variant="outlined" />
                )}
                {hasPaymentIssues && (
                    <Chip label="PAST DUE" color="error" size="small" />
                )}
                {liability.account_number && (
                    <Chip label={`Loan #${liability.account_number}`} size="small" variant="outlined" />
                )}
                <Box sx={{ flex: 1 }} />
                {onRefresh && (
                    <Tooltip title="Refresh liability data">
                        <IconButton size="small" onClick={onRefresh}>
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {/* Past Due Alert */}
            {hasPaymentIssues && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {liability.past_due_amount && liability.past_due_amount > 0 && (
                        <Typography variant="body2">
                            <strong>Past Due Amount:</strong> {safeCurrency(liability.past_due_amount)}
                        </Typography>
                    )}
                    {liability.current_late_fee && liability.current_late_fee > 0 && (
                        <Typography variant="body2">
                            <strong>Late Fee:</strong> {safeCurrency(liability.current_late_fee)}
                        </Typography>
                    )}
                </Alert>
            )}

            <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Current Balance</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {safeCurrency(liability.current_balance)}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Monthly Payment</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {safeCurrency(liability.next_monthly_payment)}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Next Due Date</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {formatDate(liability.next_payment_due_date) || '—'}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Interest Rate</Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {liability.interest_rate_percentage?.toFixed(3)}%{' '}
                        <Typography component="span" variant="caption" color="text.secondary">
                            ({liability.interest_rate_type || 'fixed'})
                        </Typography>
                    </Typography>
                </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Loan Term</Typography>
                    <Typography variant="body2">{liability.loan_term || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Maturity Date</Typography>
                    <Typography variant="body2">{formatDate(liability.maturity_date) || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Escrow Balance</Typography>
                    <Typography variant="body2">{safeCurrency(liability.escrow_balance)}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Last Payment</Typography>
                    <Typography variant="body2">
                        {safeCurrency(liability.last_payment_amount)}
                        {liability.last_payment_date && (
                            <Typography component="span" variant="caption" color="text.secondary">
                                {' '}on {formatDate(liability.last_payment_date)}
                            </Typography>
                        )}
                    </Typography>
                </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Original Amount</Typography>
                    <Typography variant="body2">{safeCurrency(liability.origination_principal_amount)}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Origination Date</Typography>
                    <Typography variant="body2">{formatDate(liability.origination_date) || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">PMI</Typography>
                    <Typography variant="body2">
                        {liability.has_pmi === true ? 'Yes' : liability.has_pmi === false ? 'No' : '—'}
                    </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Prepayment Penalty</Typography>
                    <Typography variant="body2">
                        {liability.has_prepayment_penalty === true ? 'Yes' : liability.has_prepayment_penalty === false ? 'No' : '—'}
                    </Typography>
                </Grid>
            </Grid>

            {/* Tax-Deductible Interest (Important!) */}
            {(liability.ytd_interest_paid != null && liability.ytd_interest_paid > 0) && (
                <>
                    <Divider sx={{ my: 2 }} />
                    <Alert severity="info" icon={<AttachMoney />}>
                        <Typography variant="body2">
                            <strong>YTD Interest Paid (Tax Deductible):</strong> {safeCurrency(liability.ytd_interest_paid)}
                            {liability.ytd_principal_paid != null && (
                                <> • <strong>YTD Principal Paid:</strong> {safeCurrency(liability.ytd_principal_paid)}</>
                            )}
                        </Typography>
                    </Alert>
                </>
            )}

            {/* Property Address & Origination */}
            <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                    <strong>Property Address:</strong> {formatPropertyAddress(liability)}
                </Typography>
            </Box>
        </Paper>
    );
};

// ============================================================================
// Wrapper that displays correct card based on account type
// ============================================================================

// Helper to get human-readable error message
const getLiabilityErrorMessage = (errorCode: string | null | undefined): string => {
    if (!errorCode) return 'Liability details are not available for this account.';
    
    switch (errorCode) {
        case 'PRODUCTS_NOT_SUPPORTED':
            return 'This bank does not support liability data through Plaid. Detailed credit card, loan, and mortgage information is not available for accounts at this institution.';
        case 'NO_ACCOUNTS':
            return 'No liability accounts found for this item.';
        case 'ITEM_LOGIN_REQUIRED':
            return 'Re-authentication required to access liability data.';
        default:
            return `Unable to retrieve liability data (${errorCode}).`;
    }
};

// Component to show when liabilities are unavailable
interface LiabilityUnavailableProps {
    accountType: string;
    accountSubtype: string | null;
    errorCode?: string | null;
}

const LiabilityUnavailable: React.FC<LiabilityUnavailableProps> = ({ 
    accountType, 
    accountSubtype,
    errorCode 
}) => {
    // Determine what type of liability this account should have
    let liabilityType = '';
    if (accountType === 'credit') {
        liabilityType = 'Credit Card';
    } else if (accountType === 'loan' && accountSubtype === 'student') {
        liabilityType = 'Student Loan';
    } else if (accountType === 'loan' && accountSubtype === 'mortgage') {
        liabilityType = 'Mortgage';
    }

    if (!liabilityType) return null;

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.100', borderStyle: 'dashed' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Info sx={{ color: 'text.secondary', mt: 0.25 }} />
                <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        {liabilityType} Details Unavailable
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {getLiabilityErrorMessage(errorCode)}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

interface LiabilityCardProps {
    accountType: string;
    accountSubtype: string | null;
    accountId: number;
    creditLiability?: CreditLiability | null;
    studentLiability?: StudentLiability | null;
    mortgageLiability?: MortgageLiability | null;
    liabilitiesErrorCode?: string | null;
    onRefresh?: () => void;
}

export const LiabilityCard: React.FC<LiabilityCardProps> = ({
    accountType,
    accountSubtype,
    creditLiability,
    studentLiability,
    mortgageLiability,
    liabilitiesErrorCode,
    onRefresh,
}) => {
    // PRIORITY 1: If we have liability data, show it regardless of account type
    // This handles cases where Plaid returns liability data for accounts with unexpected types
    if (creditLiability) {
        return <CreditLiabilityCard liability={creditLiability} onRefresh={onRefresh} />;
    }
    if (studentLiability) {
        return <StudentLiabilityCard liability={studentLiability} onRefresh={onRefresh} />;
    }
    if (mortgageLiability) {
        return <MortgageLiabilityCard liability={mortgageLiability} onRefresh={onRefresh} />;
    }
    
    // PRIORITY 2: No liability data - show "unavailable" only for expected liability account types
    // Credit card accounts
    if (accountType === 'credit' && (accountSubtype === 'credit card' || accountSubtype === 'paypal')) {
        return <LiabilityUnavailable accountType={accountType} accountSubtype={accountSubtype} errorCode={liabilitiesErrorCode} />;
    }
    // Student loan accounts
    if (accountType === 'loan' && accountSubtype === 'student') {
        return <LiabilityUnavailable accountType={accountType} accountSubtype={accountSubtype} errorCode={liabilitiesErrorCode} />;
    }
    // Mortgage accounts
    if (accountType === 'loan' && accountSubtype === 'mortgage') {
        return <LiabilityUnavailable accountType={accountType} accountSubtype={accountSubtype} errorCode={liabilitiesErrorCode} />;
    }

    // For other account types (checking, savings, etc.) - don't show anything
    return null;
};

export default LiabilityCard;