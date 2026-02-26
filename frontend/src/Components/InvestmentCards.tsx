/**
 * Investment Cards Component
 * 
 * Displays investment holdings with embedded security information,
 * and investment transactions for an account.
 * 
 * Layout: Holdings section first, then Investment Transactions section.
 * Security info is shown alongside each holding for context.
 * 
 * @module Components/InvestmentCards
 */

import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Divider,
    Tooltip,
    Stack,
    Alert,
    Skeleton,
} from '@mui/material';
import {
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    ShowChart as ShowChartIcon,
    AccountBalance as AccountBalanceIcon,
    Info as InfoIcon,
} from '@mui/icons-material';
import {
    InvestmentHolding,
    InvestmentTransaction,
    InvestmentsResponse,
    formatSecurityType,
    formatTransactionType,
    formatTransactionSubtype,
    getTransactionTypeColor,
    getSecurityTypeColor,
    calculateGainLoss,
    hasVestingData,
    formatOptionContract,
} from '../types/investments';

// ============================================================================
// Utility Functions
// ============================================================================

function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function formatQuantity(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    // Show more decimals for fractional shares
    if (value < 1 && value > 0) {
        return value.toFixed(6);
    }
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(value);
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatPercentage(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// ============================================================================
// Holding Card Component
// ============================================================================

interface HoldingCardProps {
    holding: InvestmentHolding;
}

export function HoldingCard({ holding }: HoldingCardProps) {
    const gainLoss = calculateGainLoss(holding);
    const hasVesting = hasVestingData(holding);
    const isOption = holding.security.type === 'derivative' && holding.security.option_contract;
    
    return (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
                {/* Header: Ticker + Name + Type */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Box>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="h6" component="span" fontWeight="bold">
                                {holding.security.ticker_symbol || 'N/A'}
                            </Typography>
                            <Chip
                                label={formatSecurityType(holding.security.type)}
                                size="small"
                                color={getSecurityTypeColor(holding.security.type) as any}
                                variant="outlined"
                            />
                            {holding.security.is_cash_equivalent && (
                                <Chip label="Cash Equiv." size="small" color="success" variant="outlined" />
                            )}
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                            {holding.security.name || 'Unknown Security'}
                        </Typography>
                        {holding.security.sector && (
                            <Typography variant="caption" color="text.secondary">
                                {holding.security.sector}
                                {holding.security.industry && ` • ${holding.security.industry}`}
                            </Typography>
                        )}
                        {isOption && (
                            <Typography variant="caption" color="warning.main" display="block">
                                {formatOptionContract(holding.security.option_contract)}
                            </Typography>
                        )}
                    </Box>
                    
                    {/* Value */}
                    <Box textAlign="right">
                        <Typography variant="h6" fontWeight="bold">
                            {formatCurrency(holding.institution_value)}
                        </Typography>
                        {gainLoss && (
                            <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                                {gainLoss.amount >= 0 ? (
                                    <TrendingUpIcon fontSize="small" color="success" />
                                ) : (
                                    <TrendingDownIcon fontSize="small" color="error" />
                                )}
                                <Typography
                                    variant="body2"
                                    color={gainLoss.amount >= 0 ? 'success.main' : 'error.main'}
                                >
                                    {formatCurrency(gainLoss.amount)} ({formatPercentage(gainLoss.percentage)})
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
                
                <Divider sx={{ my: 1.5 }} />
                
                {/* Details Grid */}
                <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(120px, 1fr))" gap={2}>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Quantity</Typography>
                        <Typography variant="body2" fontWeight="medium">
                            {formatQuantity(holding.quantity)}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Price</Typography>
                        <Typography variant="body2" fontWeight="medium">
                            {formatCurrency(holding.institution_price)}
                        </Typography>
                        {holding.institution_price_as_of && (
                            <Typography variant="caption" color="text.secondary">
                                as of {formatDate(holding.institution_price_as_of)}
                            </Typography>
                        )}
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Cost Basis</Typography>
                        <Typography variant="body2" fontWeight="medium">
                            {formatCurrency(holding.cost_basis)}
                        </Typography>
                    </Box>
                    {holding.security.close_price && (
                        <Box>
                            <Typography variant="caption" color="text.secondary">Market Price</Typography>
                            <Typography variant="body2" fontWeight="medium">
                                {formatCurrency(holding.security.close_price)}
                            </Typography>
                            {holding.security.close_price_as_of && (
                                <Typography variant="caption" color="text.secondary">
                                    as of {formatDate(holding.security.close_price_as_of)}
                                </Typography>
                            )}
                        </Box>
                    )}
                </Box>
                
                {/* Vesting Info */}
                {hasVesting && (
                    <>
                        <Divider sx={{ my: 1.5 }} />
                        <Alert severity="info" icon={<InfoIcon />} sx={{ py: 0.5 }}>
                            <Typography variant="body2">
                                <strong>Vested:</strong> {formatQuantity(holding.vested_quantity)} shares 
                                ({formatCurrency(holding.vested_value)})
                                {' | '}
                                <strong>Unvested:</strong> {formatQuantity(holding.quantity - (holding.vested_quantity || 0))} shares
                            </Typography>
                        </Alert>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

// ============================================================================
// Holdings Section Component
// ============================================================================

interface HoldingsSectionProps {
    holdings: InvestmentHolding[];
    isLoading?: boolean;
}

export function HoldingsSection({ holdings, isLoading }: HoldingsSectionProps) {
    if (isLoading) {
        return (
            <Box>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                    <ShowChartIcon /> Holdings
                </Typography>
                {[1, 2, 3].map(i => (
                    <Skeleton key={i} variant="rectangular" height={150} sx={{ mb: 2, borderRadius: 1 }} />
                ))}
            </Box>
        );
    }
    
    if (holdings.length === 0) {
        return null;
    }
    
    const totalValue = holdings.reduce((sum, h) => sum + h.institution_value, 0);
    const totalCostBasis = holdings.reduce((sum, h) => sum + (h.cost_basis || 0), 0);
    const totalGainLoss = totalCostBasis > 0 ? totalValue - totalCostBasis : null;
    const totalGainLossPercent = totalCostBasis > 0 ? ((totalValue - totalCostBasis) / totalCostBasis) * 100 : null;
    
    return (
        <Box mb={4}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                    <ShowChartIcon /> Holdings ({holdings.length})
                </Typography>
                <Box textAlign="right">
                    <Typography variant="h6" fontWeight="bold">
                        {formatCurrency(totalValue)}
                    </Typography>
                    {totalGainLoss !== null && totalGainLossPercent !== null && (
                        <Typography
                            variant="body2"
                            color={totalGainLoss >= 0 ? 'success.main' : 'error.main'}
                        >
                            {formatCurrency(totalGainLoss)} ({formatPercentage(totalGainLossPercent)})
                        </Typography>
                    )}
                </Box>
            </Box>
            
            {holdings.map(holding => (
                <HoldingCard key={holding.holding_id} holding={holding} />
            ))}
        </Box>
    );
}

// ============================================================================
// Investment Transactions Table Component
// ============================================================================

interface InvestmentTransactionsTableProps {
    transactions: InvestmentTransaction[];
    isLoading?: boolean;
}

export function InvestmentTransactionsTable({ transactions, isLoading }: InvestmentTransactionsTableProps) {
    if (isLoading) {
        return (
            <Box>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                    <AccountBalanceIcon /> Investment Transactions
                </Typography>
                <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
            </Box>
        );
    }
    
    if (transactions.length === 0) {
        return null;
    }
    
    return (
        <Box>
            <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                <AccountBalanceIcon /> Investment Transactions ({transactions.length})
            </Typography>
            
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Security</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell align="right">Quantity</TableCell>
                            <TableCell align="right">Price</TableCell>
                            <TableCell align="right">Amount</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transactions.map(txn => (
                            <TableRow key={txn.investment_transaction_id} hover>
                                <TableCell>
                                    <Typography variant="body2">
                                        {formatDate(txn.transaction_date)}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <Chip
                                            label={formatTransactionType(txn.transaction_type)}
                                            size="small"
                                            color={getTransactionTypeColor(txn.transaction_type) as any}
                                        />
                                        {txn.transaction_subtype && (
                                            <Typography variant="caption" color="text.secondary">
                                                {formatTransactionSubtype(txn.transaction_subtype)}
                                            </Typography>
                                        )}
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    {txn.security ? (
                                        <Tooltip title={txn.security.name || ''}>
                                            <Typography variant="body2" fontWeight="medium">
                                                {txn.security.ticker_symbol || 'N/A'}
                                            </Typography>
                                        </Tooltip>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            -
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                        {txn.name || '-'}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <Typography variant="body2">
                                        {txn.quantity ? formatQuantity(txn.quantity) : '-'}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <Typography variant="body2">
                                        {txn.price ? formatCurrency(txn.price) : '-'}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <Typography
                                        variant="body2"
                                        fontWeight="medium"
                                        color={txn.amount < 0 ? 'success.main' : 'text.primary'}
                                    >
                                        {formatCurrency(txn.amount)}
                                    </Typography>
                                    {txn.fees && txn.fees > 0 && (
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            Fee: {formatCurrency(txn.fees)}
                                        </Typography>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

// ============================================================================
// Main Investment Card Component
// ============================================================================

interface InvestmentCardProps {
    investmentsData: InvestmentsResponse | null;
    investmentsErrorCode?: string | null;
    isLoading?: boolean;
    accountType?: string;
}

/**
 * Get human-readable error message for investments error code
 */
function getInvestmentsErrorMessage(errorCode: string | null | undefined): string {
    if (!errorCode) return 'Investment data unavailable';
    
    switch (errorCode) {
        case 'PRODUCTS_NOT_SUPPORTED':
            return 'This institution does not support investment data retrieval.';
        case 'ITEM_LOGIN_REQUIRED':
            return 'Re-authentication required to access investment data.';
        case 'NO_INVESTMENT_ACCOUNTS':
            return 'No investment accounts found for this connection.';
        default:
            return `Unable to retrieve investment data (${errorCode})`;
    }
}

/**
 * Component shown when investments are unavailable
 */
function InvestmentsUnavailable({ errorCode }: { errorCode: string | null | undefined }) {
    return (
        <Paper
            variant="outlined"
            sx={{
                p: 3,
                textAlign: 'center',
                borderStyle: 'dashed',
                borderColor: 'grey.400',
                bgcolor: 'grey.50',
            }}
        >
            <InfoIcon sx={{ fontSize: 40, color: 'grey.500', mb: 1 }} />
            <Typography variant="body1" color="text.secondary">
                {getInvestmentsErrorMessage(errorCode)}
            </Typography>
        </Paper>
    );
}

export function InvestmentCard({
    investmentsData,
    investmentsErrorCode,
    isLoading,
    accountType,
}: InvestmentCardProps) {
    // If we have an error code and no data, show unavailable
    if (investmentsErrorCode && !investmentsData) {
        return <InvestmentsUnavailable errorCode={investmentsErrorCode} />;
    }
    
    // If not an investment account and no data, don't show anything
    if (!isLoading && !investmentsData && accountType !== 'investment') {
        return null;
    }
    
    // If loading
    if (isLoading) {
        return (
            <Box>
                <HoldingsSection holdings={[]} isLoading />
                <InvestmentTransactionsTable transactions={[]} isLoading />
            </Box>
        );
    }
    
    // If no data
    if (!investmentsData || (investmentsData.holdings.length === 0 && investmentsData.transactions.length === 0)) {
        // If it's an investment account type, show unavailable message
        if (accountType === 'investment') {
            return <InvestmentsUnavailable errorCode={investmentsErrorCode} />;
        }
        return null;
    }
    
    // Show data
    return (
        <Box>
            <HoldingsSection holdings={investmentsData.holdings} />
            <InvestmentTransactionsTable transactions={investmentsData.transactions} />
        </Box>
    );
}

export default InvestmentCard;