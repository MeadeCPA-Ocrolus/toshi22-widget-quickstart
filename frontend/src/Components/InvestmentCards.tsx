/**
 * Investment Cards Component
 * 
 * Displays investment holdings with embedded security information,
 * and investment transactions for an account.
 * 
 * Layout: Summary section, Holdings section, then Investment Transactions section.
 * Security info is shown alongside each holding for context.
 * 
 * @module Components/InvestmentCards
 */

import React, { useState } from 'react';
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
    Collapse,
    IconButton,
    Grid,
    LinearProgress,
} from '@mui/material';
import {
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    ShowChart as ShowChartIcon,
    Info as InfoIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    LocalAtm as CashIcon,
    Business as BusinessIcon,
    Receipt as ReceiptIcon,
    Star as StarIcon,
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
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function formatQuantity(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
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
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatPercentage(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}

// ============================================================================
// Summary Card Component
// ============================================================================

interface SummaryCardProps {
    holdings: InvestmentHolding[];
    transactions: InvestmentTransaction[];
}

function SummaryCard({ holdings, transactions }: SummaryCardProps) {
    // Calculate totals
    const totalValue = holdings.reduce((sum, h) => sum + (h.institution_value || 0), 0);
    const totalCostBasis = holdings.reduce((sum, h) => sum + (h.cost_basis || 0), 0);
    const totalGainLoss = totalValue - totalCostBasis;
    const gainLossPercentage = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
    
    // Count by type
    const typeBreakdown = holdings.reduce((acc, h) => {
        const type = h.security.type || 'other';
        acc[type] = (acc[type] || 0) + (h.institution_value || 0);
        return acc;
    }, {} as Record<string, number>);
    
    // Recent activity
    const recentBuys = transactions.filter(t => t.transaction_type === 'buy').length;
    const recentSells = transactions.filter(t => t.transaction_type === 'sell').length;
    const recentDividends = transactions.filter(t => 
        t.transaction_subtype === 'dividend' || t.transaction_subtype === 'interest'
    ).length;
    
    return (
        <Paper 
            elevation={0} 
            sx={{ 
                p: 2.5, 
                mb: 2, 
                bgcolor: 'primary.50', 
                border: '1px solid',
                borderColor: 'primary.200',
                borderRadius: 2,
            }}
        >
            <Grid container spacing={3}>
                {/* Total Portfolio Value */}
                <Grid item xs={12} sm={4}>
                    <Box>
                        <Typography variant="overline" color="text.secondary" fontWeight="medium">
                            Total Portfolio Value
                        </Typography>
                        <Typography variant="h4" fontWeight="bold" color="primary.main">
                            {formatCurrency(totalValue)}
                        </Typography>
                        <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                            {totalGainLoss >= 0 ? (
                                <TrendingUpIcon fontSize="small" color="success" />
                            ) : (
                                <TrendingDownIcon fontSize="small" color="error" />
                            )}
                            <Typography 
                                variant="body2" 
                                color={totalGainLoss >= 0 ? 'success.main' : 'error.main'}
                                fontWeight="medium"
                            >
                                {formatCurrency(Math.abs(totalGainLoss))} ({formatPercentage(gainLossPercentage)})
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {totalGainLoss >= 0 ? 'gain' : 'loss'}
                            </Typography>
                        </Box>
                    </Box>
                </Grid>
                
                {/* Cost Basis */}
                <Grid item xs={6} sm={2}>
                    <Typography variant="overline" color="text.secondary" fontWeight="medium">
                        Cost Basis
                    </Typography>
                    <Typography variant="h6" fontWeight="medium">
                        {formatCurrency(totalCostBasis)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Total invested
                    </Typography>
                </Grid>
                
                {/* Holdings Count */}
                <Grid item xs={6} sm={2}>
                    <Typography variant="overline" color="text.secondary" fontWeight="medium">
                        Holdings
                    </Typography>
                    <Typography variant="h6" fontWeight="medium">
                        {holdings.length}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {Object.keys(typeBreakdown).length} types
                    </Typography>
                </Grid>
                
                {/* Recent Activity */}
                <Grid item xs={12} sm={4}>
                    <Typography variant="overline" color="text.secondary" fontWeight="medium">
                        Recent Activity
                    </Typography>
                    <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap" useFlexGap>
                        {recentBuys > 0 && (
                            <Chip 
                                label={`${recentBuys} Buys`} 
                                size="small" 
                                color="success" 
                                variant="outlined"
                            />
                        )}
                        {recentSells > 0 && (
                            <Chip 
                                label={`${recentSells} Sells`} 
                                size="small" 
                                color="error" 
                                variant="outlined"
                            />
                        )}
                        {recentDividends > 0 && (
                            <Chip 
                                label={`${recentDividends} Dividends`} 
                                size="small" 
                                color="info" 
                                variant="outlined"
                            />
                        )}
                        {transactions.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                No recent transactions
                            </Typography>
                        )}
                    </Stack>
                </Grid>
            </Grid>
        </Paper>
    );
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
    const isCash = holding.security.is_cash_equivalent;
    
    return (
        <Card 
            variant="outlined" 
            sx={{ 
                mb: 2,
                '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
                transition: 'all 0.2s',
            }}
        >
            <CardContent sx={{ pb: '16px !important' }}>
                {/* Header: Ticker + Name + Type */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                    <Box flex={1}>
                        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Typography variant="h6" component="span" fontWeight="bold">
                                {holding.security.ticker_symbol || 'N/A'}
                            </Typography>
                            <Chip
                                label={formatSecurityType(holding.security.type)}
                                size="small"
                                color={getSecurityTypeColor(holding.security.type) as any}
                                variant="outlined"
                                sx={{ fontWeight: 500 }}
                            />
                            {isCash && (
                                <Chip 
                                    icon={<CashIcon sx={{ fontSize: 16 }} />}
                                    label="Cash Equivalent" 
                                    size="small" 
                                    color="success" 
                                    variant="filled"
                                    sx={{ fontWeight: 500 }}
                                />
                            )}
                            {hasVesting && (
                                <Chip 
                                    icon={<StarIcon sx={{ fontSize: 14 }} />}
                                    label="Vesting" 
                                    size="small" 
                                    color="warning" 
                                    variant="filled"
                                    sx={{ fontWeight: 500 }}
                                />
                            )}
                        </Box>
                        <Typography variant="body1" color="text.secondary" mt={0.5}>
                            {holding.security.name || 'Unknown Security'}
                        </Typography>
                        {holding.security.sector && (
                            <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
                                <BusinessIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                                <Typography variant="caption" color="text.secondary">
                                    {holding.security.sector}
                                    {holding.security.industry && ` › ${holding.security.industry}`}
                                </Typography>
                            </Stack>
                        )}
                        {isOption && (
                            <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                                <Typography variant="caption">
                                    Option: {formatOptionContract(holding.security.option_contract)}
                                </Typography>
                            </Alert>
                        )}
                    </Box>
                    
                    {/* Value Section */}
                    <Box textAlign="right" minWidth={160}>
                        <Typography variant="overline" color="text.secondary" display="block">
                            Current Value
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="primary.main">
                            {formatCurrency(holding.institution_value)}
                        </Typography>
                        {gainLoss && (
                            <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5} mt={0.5}>
                                {gainLoss.amount >= 0 ? (
                                    <TrendingUpIcon fontSize="small" sx={{ color: 'success.main' }} />
                                ) : (
                                    <TrendingDownIcon fontSize="small" sx={{ color: 'error.main' }} />
                                )}
                                <Typography
                                    variant="body2"
                                    fontWeight="medium"
                                    color={gainLoss.amount >= 0 ? 'success.main' : 'error.main'}
                                >
                                    {formatCurrency(Math.abs(gainLoss.amount))}
                                </Typography>
                                <Chip
                                    label={formatPercentage(gainLoss.percentage)}
                                    size="small"
                                    color={gainLoss.amount >= 0 ? 'success' : 'error'}
                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                            </Box>
                        )}
                    </Box>
                </Box>
                
                <Divider sx={{ my: 2 }} />
                
                {/* Details Grid - Better labeled */}
                <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                            <Typography variant="overline" color="text.secondary" fontSize="0.65rem">
                                Shares Owned
                            </Typography>
                            <Typography variant="body1" fontWeight="bold">
                                {formatQuantity(holding.quantity)}
                            </Typography>
                        </Paper>
                    </Grid>
                    
                    <Grid item xs={6} sm={3}>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                            <Typography variant="overline" color="text.secondary" fontSize="0.65rem">
                                Price Per Share
                            </Typography>
                            <Typography variant="body1" fontWeight="bold">
                                {formatCurrency(holding.institution_price)}
                            </Typography>
                            {holding.institution_price_as_of && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                    as of {formatDate(holding.institution_price_as_of)}
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                    
                    <Grid item xs={6} sm={3}>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                            <Typography variant="overline" color="text.secondary" fontSize="0.65rem">
                                Cost Basis (Total)
                            </Typography>
                            <Typography variant="body1" fontWeight="bold">
                                {formatCurrency(holding.cost_basis)}
                            </Typography>
                            {holding.cost_basis && holding.quantity && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                    {formatCurrency(holding.cost_basis / holding.quantity)}/share avg
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                    
                    <Grid item xs={6} sm={3}>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                            <Typography variant="overline" color="text.secondary" fontSize="0.65rem">
                                Market Price
                            </Typography>
                            <Typography variant="body1" fontWeight="bold">
                                {formatCurrency(holding.security.close_price)}
                            </Typography>
                            {holding.security.close_price_as_of && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                    close {formatDate(holding.security.close_price_as_of)}
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
                
                {/* Vesting Information - Prominent display */}
                {hasVesting && (
                    <Alert 
                        severity="info" 
                        icon={<StarIcon />}
                        sx={{ mt: 2 }}
                    >
                        <Typography variant="subtitle2" fontWeight="bold">
                            Vesting Schedule
                        </Typography>
                        <Grid container spacing={2} mt={0.5}>
                            <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Vested Shares
                                </Typography>
                                <Typography variant="body2" fontWeight="bold">
                                    {formatQuantity(holding.vested_quantity)} of {formatQuantity(holding.quantity)}
                                </Typography>
                            </Grid>
                            <Grid item xs={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Vested Value
                                </Typography>
                                <Typography variant="body2" fontWeight="bold">
                                    {formatCurrency(holding.vested_value)}
                                </Typography>
                            </Grid>
                        </Grid>
                        {holding.quantity && holding.vested_quantity && (
                            <Box mt={1}>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={(holding.vested_quantity / holding.quantity) * 100}
                                    sx={{ height: 8, borderRadius: 4 }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                    {((holding.vested_quantity / holding.quantity) * 100).toFixed(1)}% vested
                                </Typography>
                            </Box>
                        )}
                    </Alert>
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
    const [expanded, setExpanded] = useState(true);
    
    if (isLoading) {
        return (
            <Box mb={3}>
                <Skeleton variant="text" width={200} height={32} />
                <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
            </Box>
        );
    }
    
    if (holdings.length === 0) {
        return null;
    }
    
    // Sort by value descending
    const sortedHoldings = [...holdings].sort((a, b) => 
        (b.institution_value || 0) - (a.institution_value || 0)
    );
    
    return (
        <Box mb={3}>
            <Box 
                display="flex" 
                alignItems="center" 
                justifyContent="space-between"
                sx={{ cursor: 'pointer', mb: 1 }}
                onClick={() => setExpanded(!expanded)}
            >
                <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                    <ShowChartIcon color="primary" />
                    Holdings ({holdings.length})
                </Typography>
                <IconButton size="small">
                    {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
            </Box>
            
            <Collapse in={expanded}>
                {sortedHoldings.map((holding, index) => (
                    <HoldingCard 
                        key={holding.holding_id || index} 
                        holding={holding}
                    />
                ))}
            </Collapse>
        </Box>
    );
}

// ============================================================================
// Investment Transactions Table
// ============================================================================

interface InvestmentTransactionsTableProps {
    transactions: InvestmentTransaction[];
    isLoading?: boolean;
}

export function InvestmentTransactionsTable({ transactions, isLoading }: InvestmentTransactionsTableProps) {
    const [expanded, setExpanded] = useState(true);
    
    if (isLoading) {
        return (
            <Box>
                <Skeleton variant="text" width={250} height={32} />
                <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
            </Box>
        );
    }
    
    if (transactions.length === 0) {
        return null;
    }
    
    return (
        <Box>
            <Box 
                display="flex" 
                alignItems="center" 
                justifyContent="space-between"
                sx={{ cursor: 'pointer', mb: 1 }}
                onClick={() => setExpanded(!expanded)}
            >
                <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                    <ReceiptIcon color="primary" />
                    Recent Investment Transactions ({transactions.length})
                </Typography>
                <IconButton size="small">
                    {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
            </Box>
            
            <Collapse in={expanded}>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Security</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Qty</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Price</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {transactions.map((txn, index) => (
                                <TableRow 
                                    key={txn.investment_transaction_id || index} 
                                    hover
                                    sx={{
                                        '&:nth-of-type(odd)': { bgcolor: 'action.hover' },
                                    }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="medium">
                                            {formatDate(txn.transaction_date)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Stack spacing={0.5}>
                                            <Chip
                                                label={formatTransactionType(txn.transaction_type)}
                                                size="small"
                                                color={getTransactionTypeColor(txn.transaction_type) as any}
                                                sx={{ fontWeight: 500, width: 'fit-content' }}
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
                                            <Tooltip 
                                                title={
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="bold">
                                                            {txn.security.name}
                                                        </Typography>
                                                        <Typography variant="caption">
                                                            {formatSecurityType(txn.security.type as any)}
                                                        </Typography>
                                                    </Box>
                                                }
                                                arrow
                                            >
                                                <Chip
                                                    label={txn.security.ticker_symbol || 'N/A'}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ fontWeight: 'bold' }}
                                                />
                                            </Tooltip>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                Cash
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title={txn.name || ''}>
                                            <Typography 
                                                variant="body2" 
                                                noWrap 
                                                sx={{ maxWidth: 180 }}
                                            >
                                                {txn.name || '—'}
                                            </Typography>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="body2" fontFamily="monospace">
                                            {txn.quantity ? formatQuantity(txn.quantity) : '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="body2" fontFamily="monospace">
                                            {txn.price ? formatCurrency(txn.price) : '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography
                                            variant="body2"
                                            fontWeight="bold"
                                            fontFamily="monospace"
                                            color={txn.amount < 0 ? 'success.main' : 'error.main'}
                                        >
                                            {txn.amount < 0 ? '+' : '-'}{formatCurrency(Math.abs(txn.amount))}
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
            </Collapse>
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
                mb: 2,
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
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 2 }} />
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
    
    // Show data with summary
    return (
        <Box sx={{ mb: 2 }}>
            <SummaryCard 
                holdings={investmentsData.holdings} 
                transactions={investmentsData.transactions} 
            />
            <HoldingsSection holdings={investmentsData.holdings} />
            <InvestmentTransactionsTable transactions={investmentsData.transactions} />
        </Box>
    );
}

export default InvestmentCard;