/**
 * ClientDetail Page - Shows client's bank connections with transaction viewing
 * @module pages/ClientDetail
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Grid,
    Chip,
    IconButton,
    Tooltip,
    Alert,
    AlertTitle,
    CircularProgress,
    Divider,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Stack,
    Collapse,
    Breadcrumbs,
    Link,
    LinearProgress,
    Skeleton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import {
    ArrowBack,
    Send,
    Refresh,
    AccountBalance,
    ExpandMore,
    ExpandLess,
    Person,
    Business,
    Email,
    Phone,
    LocationOn,
    CalendarToday,
    Delete,
    LockReset,
    LinkOff,
    Sync,
    Receipt,
    TrendingUp,
    TrendingDown,
    Schedule,
    CheckCircle,
    Warning,
    Edit,
    StarOutline,
} from '@mui/icons-material';
import {
    Client,
    ItemWithAccounts,
    Account,
    ItemStatus,
    ClientItemsResponse,
} from '../types/plaid';
import {
    TransactionWithDetails,
    TransactionListResponse,
    formatTransactionAmount,
    needsCategoryReview,
} from '../types/transactions';
import {
    getClientItems,
    getClientDisplayName,
    formatDate,
    formatRelativeTime,
    formatCurrency,
    deleteItem,
    getFailedLinkSessions,
    FailedLinkSession,
} from '../services/api';
import {
    getTransactionsForAccount,
    syncTransactionsForItem,
    refreshTransactionsForItem,
    categorizeTransaction,
} from '../services/transactions-api';
import {
    StatusBadge,
    SyncBadge,
    ConsentExpirationBadge,
    AccountTypeBadge,
} from '../Components/StatusBadge';
import { SendLinkDialog } from '../Components/SendLinkDialog';
import { CategorySelector } from '../Components/CategorySelector';
import { getCategoryDisplay } from '../constants/plaidCategories';
import { LiabilityCard } from '../Components/LiabilityCards';
import { CreditLiability, StudentLiability, MortgageLiability } from '../types/liabilities';
import {
    getCreditLiabilityForAccount,
    getStudentLiabilityForAccount,
    getMortgageLiabilityForAccount,
    hasLiabilityData,
} from '../services/liabilities-api';

// ============================================================================
// Transaction Row Component
// ============================================================================

interface TransactionRowProps {
    transaction: TransactionWithDetails;
    onCategorize: (tx: TransactionWithDetails) => void;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ transaction, onCategorize }) => {
    const isExpense = transaction.amount > 0;
    const needsReview = needsCategoryReview(
        transaction.plaid_confidence_score,
        transaction.category_verified
    );
    
    // Get display category (prefer manual if set, else Plaid)
    const primaryRaw = transaction.manual_primary_category || transaction.plaid_primary_category;
    const detailedRaw = transaction.manual_detailed_category || transaction.plaid_detailed_category;
    const categoryDisplay = getCategoryDisplay(primaryRaw, detailedRaw);
    
    // Map numeric score back to Plaid's confidence level strings
    const confidenceScore = transaction.plaid_confidence_score;
    const confidenceLevel = confidenceScore === null ? 'UNKNOWN' 
        : confidenceScore >= 0.95 ? 'VERY_HIGH'
        : confidenceScore >= 0.80 ? 'HIGH'
        : confidenceScore >= 0.50 ? 'MEDIUM'
        : 'LOW';
    const confidenceDisplay = confidenceLevel.replace('_', ' ');
    const confidenceColor = 
        confidenceLevel === 'VERY_HIGH' ? 'success.main'
        : confidenceLevel === 'HIGH' ? 'success.light'
        : confidenceLevel === 'MEDIUM' ? 'warning.main'
        : confidenceLevel === 'LOW' ? 'error.main'
        : 'text.disabled';
    
    // Build tooltip with detailed category + confidence
    const tooltipContent = (
        <Box>
            <Typography variant="body2">
                {categoryDisplay.primary}
                {categoryDisplay.detailed && ` → ${categoryDisplay.detailed}`}
            </Typography>
            <Typography variant="caption" sx={{ color: confidenceColor, display: 'block', mt: 0.5 }}>
                Plaid Confidence: {confidenceDisplay}
            </Typography>
        </Box>
    );

    return (
        <TableRow
            sx={{
                '&:hover': { bgcolor: 'action.hover' },
                bgcolor: transaction.pending ? 'rgba(255, 193, 7, 0.08)' : 'inherit',
            }}
        >
            {/* Date */}
            <TableCell sx={{ py: 1 }}>
                <Typography variant="body2" fontWeight={500}>
                    {formatDate(transaction.transaction_date)}
                </Typography>
                {transaction.pending && (
                    <Chip
                        label="Pending"
                        size="small"
                        color="warning"
                        sx={{ height: 18, fontSize: '0.65rem', mt: 0.5 }}
                    />
                )}
            </TableCell>
            
            {/* Merchant / Description */}
            <TableCell sx={{ py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {transaction.merchant_logo_url && (
                        <Box
                            component="img"
                            src={transaction.merchant_logo_url}
                            alt=""
                            sx={{ width: 24, height: 24, borderRadius: 1 }}
                        />
                    )}
                    <Box>
                        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 200 }}>
                            {transaction.merchant_name || transaction.original_description}
                        </Typography>
                        {/* Always show original description for context when merchant name exists */}
                        {transaction.merchant_name && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                                {transaction.original_description}
                            </Typography>
                        )}
                        {/* Show "Needs categorization" for ALL low-confidence transactions */}
                        {needsReview && (
                            <Typography variant="caption" color="warning.main" sx={{ fontStyle: 'italic' }}>
                                Needs categorization
                            </Typography>
                        )}
                    </Box>
                </Box>
            </TableCell>
            
            {/* Category with status indicators */}
            <TableCell sx={{ py: 1 }}>
                <Tooltip title={tooltipContent} arrow>
                    <Box 
                        sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 0.5,
                            cursor: 'pointer',
                            '&:hover': { opacity: 0.8 },
                        }}
                        onClick={() => onCategorize(transaction)}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="caption" color="text.secondary">
                                {categoryDisplay.primary}
                            </Typography>
                            {/* Show confidence level as small text */}
                            <Typography 
                                variant="caption" 
                                sx={{ 
                                    fontSize: '0.65rem', 
                                    color: confidenceColor,
                                    lineHeight: 1,
                                }}
                            >
                                {confidenceDisplay}
                            </Typography>
                        </Box>
                        
                        {/* Status indicator */}
                        {needsReview ? (
                            // Needs review - warning icon
                            <Tooltip title="Needs verification - click to categorize">
                                <Warning sx={{ fontSize: 14, color: 'warning.main' }} />
                            </Tooltip>
                        ) : transaction.manually_verified ? (
                            // Manually verified - small star
                            <Tooltip title="Manually verified by CPA">
                                <StarOutline sx={{ fontSize: 12, color: 'success.main' }} />
                            </Tooltip>
                        ) : null}
                        
                        {/* Edit icon on hover */}
                        <Edit sx={{ fontSize: 12, color: 'action.disabled', ml: 0.5 }} />
                    </Box>
                </Tooltip>
            </TableCell>
            
            {/* Amount */}
            <TableCell align="right" sx={{ py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                    {isExpense ? (
                        <TrendingDown sx={{ fontSize: 16, color: 'error.main' }} />
                    ) : (
                        <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />
                    )}
                    <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ color: isExpense ? 'error.main' : 'success.main' }}
                    >
                        {formatTransactionAmount(transaction.amount)}
                    </Typography>
                </Box>
            </TableCell>
        </TableRow>
    );
};

// ============================================================================
// Account Transactions Section
// ============================================================================

interface AccountTransactionsSectionProps {
    account: Account;
    expanded: boolean;
    liabilitiesErrorCode?: string | null;
}

const AccountTransactionsSection: React.FC<AccountTransactionsSectionProps> = ({
    account,
    expanded,
    liabilitiesErrorCode,
}) => {
    const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    
    // Liability state
    const [creditLiability, setCreditLiability] = useState<CreditLiability | null>(null);
    const [studentLiability, setStudentLiability] = useState<StudentLiability | null>(null);
    const [mortgageLiability, setMortgageLiability] = useState<MortgageLiability | null>(null);
    const [liabilityLoading, setLiabilityLoading] = useState(false);
    
    // Categorization dialog state
    const [categorizeDialogOpen, setCategorizeDialogOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithDetails | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    
    // Confirmation dialog for high confidence transactions
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [pendingTransaction, setPendingTransaction] = useState<TransactionWithDetails | null>(null);

    // Check if account has liability data
    const hasLiability = hasLiabilityData(account.account_type, account.account_subtype);

    // Load transactions and liabilities when expanded for the first time
    useEffect(() => {
        if (expanded && !loaded) {
            loadTransactions();
            if (hasLiability) {
                loadLiability();
            }
        }
    }, [expanded, loaded]);

    const loadTransactions = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await getTransactionsForAccount(account.account_id, { limit: 20 });
            setTransactions(response.transactions);
            setTotal(response.pagination.total);
            setLoaded(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load transactions');
        } finally {
            setLoading(false);
        }
    };

    const loadLiability = async () => {
        setLiabilityLoading(true);
        try {
            // For credit accounts, try to load credit liability
            // For loan accounts, try to load both student and mortgage (one will match)
            // This handles edge cases where account type doesn't match expected liability type
            if (account.account_type === 'credit') {
                const liability = await getCreditLiabilityForAccount(account.account_id);
                setCreditLiability(liability);
            } else if (account.account_type === 'loan') {
                // Try both student and mortgage - the API returns data if it exists
                const [studentLiab, mortgageLiab] = await Promise.all([
                    getStudentLiabilityForAccount(account.account_id).catch(() => null),
                    getMortgageLiabilityForAccount(account.account_id).catch(() => null),
                ]);
                setStudentLiability(studentLiab);
                setMortgageLiability(mortgageLiab);
            }
        } catch (err) {
            // Liability data might not be available, don't show error
            console.warn('Could not load liability data:', err);
        } finally {
            setLiabilityLoading(false);
        }
    };

    // Check if transaction has high confidence
    const isHighConfidence = (tx: TransactionWithDetails): boolean => {
        const score = tx.plaid_confidence_score;
        return score !== null && score >= 0.80; // HIGH or VERY_HIGH
    };

    const handleOpenCategorize = (tx: TransactionWithDetails) => {
        // If high confidence, show confirmation first
        if (isHighConfidence(tx)) {
            setPendingTransaction(tx);
            setConfirmDialogOpen(true);
        } else {
            openCategorizeDialog(tx);
        }
    };

    const handleConfirmOverride = () => {
        if (pendingTransaction) {
            openCategorizeDialog(pendingTransaction);
        }
        setConfirmDialogOpen(false);
        setPendingTransaction(null);
    };

    const openCategorizeDialog = (tx: TransactionWithDetails) => {
        setSelectedTransaction(tx);
        // Pre-select current category if exists
        setSelectedCategory(
            tx.manual_detailed_category || tx.plaid_detailed_category || null
        );
        setCategorizeDialogOpen(true);
    };

    const handleCategoryChange = (primary: string, detailed: string) => {
        setSelectedCategory(detailed);
    };

    const handleSaveCategory = async () => {
        if (!selectedTransaction || !selectedCategory) return;
        
        setSaving(true);
        try {
            // Find the primary category from detailed
            const category = await import('../constants/plaidCategories').then(m => 
                m.ALL_CATEGORIES.find(c => c.detailed === selectedCategory)
            );
            
            if (!category) {
                throw new Error('Invalid category selected');
            }
            
            await categorizeTransaction(selectedTransaction.transaction_id, {
                primary_category: category.primary,
                detailed_category: category.detailed,
            });
            
            // Update local state
            setTransactions(prev => prev.map(tx => 
                tx.transaction_id === selectedTransaction.transaction_id
                    ? {
                        ...tx,
                        manual_primary_category: category.primary,
                        manual_detailed_category: category.detailed,
                        category_verified: true,
                        manually_verified: true,
                    }
                    : tx
            ));
            
            setCategorizeDialogOpen(false);
            setSelectedTransaction(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save category');
        } finally {
            setSaving(false);
        }
    };

    if (!expanded) return null;

    // Get display info for selected transaction in dialog
    const selectedTxDisplay = selectedTransaction ? getCategoryDisplay(
        selectedTransaction.plaid_primary_category,
        selectedTransaction.plaid_detailed_category
    ) : null;
    
    // Get confidence level for selected transaction
    const getConfidenceInfo = (score: number | null) => {
        if (score === null) return { level: 'UNKNOWN', color: 'text.disabled' };
        if (score >= 0.95) return { level: 'VERY HIGH', color: 'success.main' };
        if (score >= 0.80) return { level: 'HIGH', color: 'success.light' };
        if (score >= 0.50) return { level: 'MEDIUM', color: 'warning.main' };
        return { level: 'LOW', color: 'error.main' };
    };

    return (
        <Box sx={{ pl: 4, pr: 2, pb: 2, pt: 2 }}>
            {/* Liability Card - shown above transactions for applicable accounts */}
            {hasLiability && !liabilityLoading && (
                <LiabilityCard
                    accountType={account.account_type}
                    accountSubtype={account.account_subtype}
                    accountId={account.account_id}
                    creditLiability={creditLiability}
                    studentLiability={studentLiability}
                    mortgageLiability={mortgageLiability}
                    liabilitiesErrorCode={liabilitiesErrorCode}
                    onRefresh={loadLiability}
                />
            )}
            
            {liabilityLoading && (
                <Skeleton variant="rectangular" height={120} sx={{ mb: 2, borderRadius: 1 }} />
            )}

            {loading && (
                <Box sx={{ py: 2 }}>
                    <LinearProgress />
                    <Stack spacing={1} sx={{ mt: 2 }}>
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} variant="rectangular" height={40} />
                        ))}
                    </Stack>
                </Box>
            )}

            {error && (
                <Alert severity="error" sx={{ my: 1 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {!loading && !error && transactions.length === 0 && !creditLiability && !studentLiability && !mortgageLiability && (
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50' }}>
                    <Receipt sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                        Nothing here yet
                    </Typography>
                </Paper>
            )}

            {!loading && !error && transactions.length > 0 && (
                <>
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell sx={{ fontWeight: 600, width: 100 }}>Date</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                                    <TableCell sx={{ fontWeight: 600, width: 150 }}>Category</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, width: 100 }}>Amount</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {transactions.map((tx) => (
                                    <TransactionRow 
                                        key={tx.transaction_id} 
                                        transaction={tx}
                                        onCategorize={handleOpenCategorize}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {total > transactions.length && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                            Showing {transactions.length} of {total} transactions
                        </Typography>
                    )}
                </>
            )}

            {/* Confirmation Dialog for High Confidence Override */}
            <Dialog 
                open={confirmDialogOpen} 
                onClose={() => {
                    setConfirmDialogOpen(false);
                    setPendingTransaction(null);
                }}
                maxWidth="xs"
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning sx={{ color: 'warning.main' }} />
                    High Confidence Category
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        This transaction already has a <strong>{pendingTransaction && getConfidenceInfo(pendingTransaction.plaid_confidence_score).level}</strong> confidence score from Plaid.
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                        Are you sure you want to manually change the category?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button 
                        onClick={() => {
                            setConfirmDialogOpen(false);
                            setPendingTransaction(null);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirmOverride}
                        variant="contained"
                        color="warning"
                    >
                        Yes, Change Category
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Categorization Dialog */}
            <Dialog 
                open={categorizeDialogOpen} 
                onClose={() => setCategorizeDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Categorize Transaction</DialogTitle>
                <DialogContent>
                    {selectedTransaction && (
                        <Box>
                            {/* Transaction Details Section */}
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                                <Grid container spacing={2}>
                                    {/* Left Column - Basic Info */}
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="overline" color="text.secondary">
                                            Date
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                                            {formatDate(selectedTransaction.transaction_date)}
                                            {selectedTransaction.pending && (
                                                <Chip label="Pending" size="small" color="warning" sx={{ ml: 1, height: 18 }} />
                                            )}
                                        </Typography>
                                        
                                        <Typography variant="overline" color="text.secondary">
                                            Merchant
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                                            {selectedTransaction.merchant_name || 'Unknown'}
                                        </Typography>
                                        
                                        <Typography variant="overline" color="text.secondary">
                                            Amount
                                        </Typography>
                                        <Typography 
                                            variant="h6" 
                                            sx={{ 
                                                color: selectedTransaction.amount > 0 ? 'error.main' : 'success.main',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {formatTransactionAmount(selectedTransaction.amount)}
                                        </Typography>
                                    </Grid>
                                    
                                    {/* Right Column - Additional Info */}
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="overline" color="text.secondary">
                                            Payment Channel
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                                            {selectedTransaction.payment_channel?.replace('_', ' ') || 'N/A'}
                                        </Typography>
                                        
                                        <Typography variant="overline" color="text.secondary">
                                            Transaction Type
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                                            {selectedTransaction.is_transfer ? 'Transfer' : selectedTransaction.amount > 0 ? 'Expense' : 'Income'}
                                        </Typography>
                                        
                                        <Typography variant="overline" color="text.secondary">
                                            Account
                                        </Typography>
                                        <Typography variant="body2" fontWeight={500}>
                                            {account.account_name}
                                        </Typography>
                                    </Grid>
                                    
                                    {/* Full Width - Original Description */}
                                    <Grid item xs={12}>
                                        <Divider sx={{ my: 1 }} />
                                        <Typography variant="overline" color="text.secondary">
                                            Original Bank Description
                                        </Typography>
                                        <Typography 
                                            variant="body2" 
                                            sx={{ 
                                                bgcolor: 'background.paper', 
                                                p: 1, 
                                                borderRadius: 1,
                                                fontFamily: 'monospace',
                                                fontSize: '0.85rem',
                                            }}
                                        >
                                            {selectedTransaction.original_description}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Paper>
                            
                            {/* Plaid's Suggestion with Confidence */}
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'primary.50' }}>
                                <Typography variant="overline" color="text.secondary">
                                    Plaid's Suggestion
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                                    <Box>
                                        <Typography variant="body1" fontWeight={500}>
                                            {selectedTxDisplay?.primary || 'Uncategorized'}
                                            {selectedTxDisplay?.detailed && (
                                                <Typography component="span" color="text.secondary">
                                                    {' → '}{selectedTxDisplay.detailed}
                                                </Typography>
                                            )}
                                        </Typography>
                                    </Box>
                                    <Chip 
                                        label={getConfidenceInfo(selectedTransaction.plaid_confidence_score).level}
                                        size="small"
                                        sx={{ 
                                            bgcolor: getConfidenceInfo(selectedTransaction.plaid_confidence_score).color,
                                            color: 'white',
                                            fontWeight: 600,
                                        }}
                                    />
                                </Box>
                            </Paper>
                            
                            {/* Current Manual Override (if exists) */}
                            {selectedTransaction.manually_verified && selectedTransaction.manual_detailed_category && (
                                <Alert severity="info" sx={{ mb: 2 }} icon={<StarOutline />}>
                                    <Typography variant="body2">
                                        <strong>Current Manual Override:</strong>{' '}
                                        {getCategoryDisplay(
                                            selectedTransaction.manual_primary_category,
                                            selectedTransaction.manual_detailed_category
                                        ).primary}
                                        {' → '}
                                        {getCategoryDisplay(
                                            selectedTransaction.manual_primary_category,
                                            selectedTransaction.manual_detailed_category
                                        ).detailed}
                                    </Typography>
                                </Alert>
                            )}
                            
                            {/* Category Selector */}
                            <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                Select New Category
                            </Typography>
                            <CategorySelector
                                value={selectedCategory}
                                onChange={handleCategoryChange}
                                label="Category"
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCategorizeDialogOpen(false)}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSaveCategory}
                        variant="contained"
                        disabled={!selectedCategory || saving}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save Category'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const ClientDetail: React.FC = () => {
    const { clientId } = useParams<{ clientId: string }>();
    const navigate = useNavigate();

    const [client, setClient] = useState<Client | null>(null);
    const [items, setItems] = useState<ItemWithAccounts[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
    const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());

    // Failed link sessions
    const [failedLinks, setFailedLinks] = useState<FailedLinkSession[]>([]);
    const [showFailedLinks, setShowFailedLinks] = useState(true);

    // Dialog state
    const [sendLinkDialogOpen, setSendLinkDialogOpen] = useState(false);
    const [selectedItemForUpdate, setSelectedItemForUpdate] = useState<ItemWithAccounts | null>(null);
    const [isNewLinkMode, setIsNewLinkMode] = useState(false);

    // Sync/Refresh state
    const [syncingItems, setSyncingItems] = useState<Set<number>>(new Set());
    const [refreshingItems, setRefreshingItems] = useState<Set<number>>(new Set());
    const [syncResults, setSyncResults] = useState<Map<number, { success: boolean; message: string }>>(new Map());

    const fetchClientData = useCallback(async () => {
        if (!clientId) return;

        setLoading(true);
        setError(null);

        try {
            const response: ClientItemsResponse = await getClientItems(parseInt(clientId, 10));
            setClient(response.client);
            setItems(response.items || []);

            // Also fetch failed link sessions
            try {
                const failed = await getFailedLinkSessions(parseInt(clientId, 10));
                setFailedLinks(failed);
            } catch {
                // Ignore errors for failed links
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load client data');
        } finally {
            setLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        fetchClientData();
    }, [fetchClientData]);

    // Toggle item expansion
    const toggleItemExpanded = (itemId: number) => {
        setExpandedItems((prev) => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    // Toggle account expansion (for transactions)
    const toggleAccountExpanded = (accountId: number) => {
        setExpandedAccounts((prev) => {
            const next = new Set(prev);
            if (next.has(accountId)) {
                next.delete(accountId);
            } else {
                next.add(accountId);
            }
            return next;
        });
    };

    // Handle sync transactions for an item
    const handleSyncTransactions = async (itemId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        setSyncingItems((prev) => new Set(prev).add(itemId));
        setSyncResults((prev) => {
            const next = new Map(prev);
            next.delete(itemId);
            return next;
        });

        try {
            const result = await syncTransactionsForItem(itemId);
            setSyncResults((prev) => {
                const next = new Map(prev);
                next.set(itemId, {
                    success: result.success,
                    message: result.success
                        ? `Synced: +${result.transactions.added}, ~${result.transactions.modified}, -${result.transactions.removed}`
                        : result.error || 'Sync failed',
                });
                return next;
            });
            // Refresh data to update has_sync_updates flag
            await fetchClientData();
        } catch (err) {
            setSyncResults((prev) => {
                const next = new Map(prev);
                next.set(itemId, {
                    success: false,
                    message: err instanceof Error ? err.message : 'Sync failed',
                });
                return next;
            });
        } finally {
            setSyncingItems((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
            });
        }
    };

    // Handle refresh transactions for an item
    const handleRefreshTransactions = async (itemId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        setRefreshingItems((prev) => new Set(prev).add(itemId));

        try {
            await refreshTransactionsForItem(itemId);
            // Show a quick message
            setSyncResults((prev) => {
                const next = new Map(prev);
                next.set(itemId, {
                    success: true,
                    message: 'Refresh requested - sync will be available shortly',
                });
                return next;
            });
            // Wait a moment then refresh data
            setTimeout(() => {
                fetchClientData();
            }, 2000);
        } catch (err) {
            setSyncResults((prev) => {
                const next = new Map(prev);
                next.set(itemId, {
                    success: false,
                    message: err instanceof Error ? err.message : 'Refresh failed',
                });
                return next;
            });
        } finally {
            setRefreshingItems((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
            });
        }
    };

    // Handle delete item
    const handleDeleteItem = async (itemId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to remove this bank connection?')) {
            return;
        }

        try {
            await deleteItem(itemId, true);
            await fetchClientData();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete item');
        }
    };

    // Handle send new link
    const handleSendNewLink = () => {
        setSelectedItemForUpdate(null);
        setIsNewLinkMode(true);
        setSendLinkDialogOpen(true);
    };

    // Handle send update link
    const handleSendUpdateLink = (item: ItemWithAccounts, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedItemForUpdate(item);
        setIsNewLinkMode(false);
        setSendLinkDialogOpen(true);
    };

    // Get border color based on item status
    const getItemBorderColor = (status: ItemStatus): string => {
        switch (status) {
            case 'active':
                return 'success.main';
            case 'login_required':
            case 'needs_update':
                return 'warning.main';
            case 'error':
                return 'error.main';
            default:
                return 'grey.400';
        }
    };

    // Get failed link message
    const getFailedLinkMessage = (session: FailedLinkSession): string => {
        if (session.last_session_status === 'REQUIRES_CREDENTIALS') {
            return 'User needs to enter credentials';
        }
        if (session.last_session_status === 'REQUIRES_QUESTIONS') {
            return 'Security questions required';
        }
        if (session.last_session_status === 'REQUIRES_SELECTIONS') {
            return 'Account selection needed';
        }
        if (session.last_session_status === 'INSTITUTION_NOT_FOUND') {
            return 'Bank not supported';
        }
        if (session.last_session_status === 'EXITED') {
            return 'Client exited without completing';
        }
        return session.last_session_status || 'Link incomplete';
    };

    // Loading state
    if (loading) {
        return (
            <Box sx={{ p: 3 }}>
                <CircularProgress />
            </Box>
        );
    }

    // Error state
    if (error || !client) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">{error || 'Client not found'}</Alert>
                <Button
                    startIcon={<ArrowBack />}
                    onClick={() => navigate('/bank/clients')}
                    sx={{ mt: 2 }}
                >
                    Back to Clients
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Breadcrumbs */}
            <Paper sx={{ p: 1, px: 2, mb: 2, bgcolor: 'rgba(255, 255, 255, 0.95)' }}>
                <Breadcrumbs>
                    <Link
                        component="button"
                        variant="body2"
                        onClick={() => navigate('/bank/clients')}
                        sx={{ cursor: 'pointer' }}
                    >
                        Clients
                    </Link>
                    <Typography variant="body2" color="text.primary">
                        {getClientDisplayName(client)}
                    </Typography>
                </Breadcrumbs>
            </Paper>

            {/* Failed Link Sessions Alert */}
            {failedLinks.length > 0 && showFailedLinks && (
                <Alert 
                    severity="warning" 
                    sx={{ mb: 2, bgcolor: 'rgba(255, 255, 255, 0.95)' }}
                    icon={<LinkOff />}
                    onClose={() => setShowFailedLinks(false)}
                >
                    <AlertTitle>
                        {failedLinks.length} Failed Link Attempt{failedLinks.length > 1 ? 's' : ''}
                    </AlertTitle>
                    <Box sx={{ mt: 1 }}>
                        {failedLinks.slice(0, 3).map((session, idx) => (
                            <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                                • {getFailedLinkMessage(session)}
                                {session.created_at && (
                                    <Typography component="span" variant="caption" color="text.secondary">
                                        {' '}— {formatRelativeTime(session.created_at)}
                                    </Typography>
                                )}
                            </Typography>
                        ))}
                        {failedLinks.length > 3 && (
                            <Typography variant="body2" color="text.secondary">
                                ... and {failedLinks.length - 3} more
                            </Typography>
                        )}
                    </Box>
                    <Button 
                        size="small" 
                        variant="outlined" 
                        sx={{ mt: 1 }}
                        onClick={handleSendNewLink}
                        startIcon={<Send />}
                    >
                        Resend Link
                    </Button>
                </Alert>
            )}

            {/* Header */}
            <Card sx={{ mb: 3, bgcolor: 'rgba(255, 255, 255, 0.95)' }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <IconButton onClick={() => navigate('/bank/clients')}>
                                <ArrowBack />
                            </IconButton>
                            <Box>
                                <Typography variant="h5" fontWeight={600}>
                                    {getClientDisplayName(client)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {client.business_name
                                        ? `${client.first_name} ${client.last_name}`
                                        : client.email}
                                </Typography>
                            </Box>
                        </Box>
                        <Button
                            variant="contained"
                            startIcon={<Send />}
                            onClick={handleSendNewLink}
                        >
                            Send Bank Link
                        </Button>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Client Info Grid */}
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Stack spacing={1.5}>
                                {client.business_name && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Business sx={{ color: 'text.secondary', fontSize: 20 }} />
                                        <Typography variant="body2">{client.business_name}</Typography>
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Person sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    <Typography variant="body2">
                                        {client.first_name} {client.last_name}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Email sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    <Typography variant="body2">{client.email}</Typography>
                                </Box>
                                {client.phone_number && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Phone sx={{ color: 'text.secondary', fontSize: 20 }} />
                                        <Typography variant="body2">{client.phone_number}</Typography>
                                    </Box>
                                )}
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Stack spacing={1.5}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <LocationOn sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    <Typography variant="body2">
                                        <strong>State:</strong> {client.state}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CalendarToday sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    <Typography variant="body2">
                                        <strong>Fiscal Year:</strong> {formatDate(client.fiscal_year_start_date)}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AccountBalance sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    <Typography variant="body2">
                                        <strong>Connected Banks:</strong> {items.filter((i) => !i.is_archived).length}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Connected Banks Section */}
            <Card sx={{ bgcolor: 'rgba(255, 255, 255, 0.95)' }}>
                <CardContent>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                        Connected Banks
                    </Typography>

                    {items.filter((i) => !i.is_archived).length === 0 ? (
                        <Paper
                            variant="outlined"
                            sx={{ p: 4, textAlign: 'center', bgcolor: 'grey.50' }}
                        >
                            <AccountBalance sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                            <Typography variant="body1" color="text.secondary" gutterBottom>
                                No bank connections yet
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Send a bank link to this client to get started
                            </Typography>
                            <Button
                                variant="contained"
                                startIcon={<Send />}
                                onClick={handleSendNewLink}
                            >
                                Send Bank Link
                            </Button>
                        </Paper>
                    ) : (
                        <Stack spacing={2}>
                            {items
                                .filter((item) => !item.is_archived)
                                .map((item) => (
                                <Card
                                    key={item.item_id}
                                    variant="outlined"
                                    sx={{
                                        borderLeft: 4,
                                        borderLeftColor: getItemBorderColor(item.status),
                                    }}
                                >
                                    {/* Item Header */}
                                    <CardContent
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 2,
                                            cursor: 'pointer',
                                            '&:hover': { bgcolor: 'action.hover' },
                                        }}
                                        onClick={() => toggleItemExpanded(item.item_id)}
                                    >
                                        <AccountBalance sx={{ fontSize: 32, color: 'primary.main' }} />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="subtitle1" fontWeight={600}>
                                                {item.institution_name || 'Unknown Bank'}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {item.accounts.filter((a) => a.is_active).length} account
                                                {item.accounts.filter((a) => a.is_active).length !== 1 ? 's' : ''} • Connected{' '}
                                                {formatRelativeTime(item.created_at)}
                                            </Typography>
                                        </Box>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <StatusBadge 
                                                status={item.status} 
                                                errorCode={item.last_error_code}
                                                errorMessage={item.last_error_message}
                                            />
                                            <SyncBadge
                                                hasSyncUpdates={item.has_sync_updates}
                                                lastSyncDate={item.transactions_last_successful_update}
                                            />
                                            <ConsentExpirationBadge
                                                expirationDate={item.consent_expiration_time}
                                            />
                                        </Stack>
                                        <IconButton size="small">
                                            {expandedItems.has(item.item_id) ? (
                                                <ExpandLess />
                                            ) : (
                                                <ExpandMore />
                                            )}
                                        </IconButton>
                                    </CardContent>

                                    {/* Expanded Content */}
                                    <Collapse in={expandedItems.has(item.item_id)}>
                                        <Divider />
                                        <CardContent sx={{ bgcolor: 'grey.50' }}>
                                            {/* Error Alert */}
                                            {item.last_error_code && (
                                                <Alert severity="error" sx={{ mb: 2 }}>
                                                    <strong>Error:</strong> {item.last_error_code}
                                                    {item.last_error_message && (
                                                        <> - {item.last_error_message}</>
                                                    )}
                                                </Alert>
                                            )}

                                            {/* Sync Result Alert */}
                                            {syncResults.has(item.item_id) && (
                                                <Alert 
                                                    severity={syncResults.get(item.item_id)?.success ? 'success' : 'error'}
                                                    sx={{ mb: 2 }}
                                                    onClose={() => {
                                                        setSyncResults((prev) => {
                                                            const next = new Map(prev);
                                                            next.delete(item.item_id);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    {syncResults.get(item.item_id)?.message}
                                                </Alert>
                                            )}

                                            {/* Accounts Table */}
                                            <TableContainer component={Paper} variant="outlined">
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                                            <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
                                                            <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600 }}>Balance</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600 }}>Available</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {item.accounts
                                                            .filter((account) => account.is_active)
                                                            .map((account) => (
                                                            <React.Fragment key={account.account_id}>
                                                                <TableRow
                                                                    sx={{
                                                                        cursor: 'pointer',
                                                                        '&:hover': { bgcolor: 'action.hover' },
                                                                        bgcolor: expandedAccounts.has(account.account_id) ? 'primary.50' : 'inherit',
                                                                    }}
                                                                    onClick={() => toggleAccountExpanded(account.account_id)}
                                                                >
                                                                    <TableCell>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <IconButton size="small" sx={{ p: 0 }}>
                                                                                {expandedAccounts.has(account.account_id) ? (
                                                                                    <ExpandLess fontSize="small" />
                                                                                ) : (
                                                                                    <ExpandMore fontSize="small" />
                                                                                )}
                                                                            </IconButton>
                                                                            <Box>
                                                                                <Typography variant="body2" fontWeight={500}>
                                                                                    {account.account_name}
                                                                                </Typography>
                                                                                <Typography variant="caption" color="text.secondary">
                                                                                    {account.official_name}
                                                                                </Typography>
                                                                            </Box>
                                                                        </Box>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <AccountTypeBadge
                                                                            accountType={account.account_type}
                                                                            accountSubtype={account.account_subtype}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell align="right">
                                                                        {formatCurrency(account.current_balance)}
                                                                    </TableCell>
                                                                    <TableCell align="right">
                                                                        {formatCurrency(account.available_balance)}
                                                                    </TableCell>
                                                                </TableRow>
                                                                <TableRow>
                                                                    <TableCell colSpan={4} sx={{ p: 0, borderBottom: expandedAccounts.has(account.account_id) ? 1 : 0 }}>
                                                                        <Collapse in={expandedAccounts.has(account.account_id)}>
                                                                            <AccountTransactionsSection
                                                                                account={account}
                                                                                expanded={expandedAccounts.has(account.account_id)}
                                                                                liabilitiesErrorCode={item.liabilities_error_code}
                                                                            />
                                                                        </Collapse>
                                                                    </TableCell>
                                                                </TableRow>
                                                            </React.Fragment>
                                                        ))}
                                                        {/* Net Position Row */}
                                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                                            <TableCell colSpan={2}>
                                                                <Typography variant="body2" fontWeight={600}>
                                                                    Net Position
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography variant="body2" fontWeight={600}>
                                                                    {formatCurrency(
                                                                        item.accounts
                                                                            .filter((a) => a.is_active)
                                                                            .reduce(
                                                                            (sum, a) => sum + (a.current_balance || 0),
                                                                            0
                                                                        )
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right" />
                                                        </TableRow>
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>

                                            {/* Action Buttons */}
                                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Last synced: {formatRelativeTime(item.transactions_last_successful_update) || '—'} • Item ID: {item.plaid_item_id?.slice(0, 12)}...
                                                </Typography>
                                                <Stack direction="row" spacing={1}>
                                                    {/* Refresh Button - always enabled */}
                                                    <Tooltip title="Request fresh data from bank">
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={refreshingItems.has(item.item_id) ? (
                                                                <CircularProgress size={16} />
                                                            ) : (
                                                                <Refresh />
                                                            )}
                                                            onClick={(e) => handleRefreshTransactions(item.item_id, e)}
                                                            disabled={refreshingItems.has(item.item_id)}
                                                        >
                                                            Refresh
                                                        </Button>
                                                    </Tooltip>

                                                    {/* Sync Button - enabled when has_sync_updates is true */}
                                                    <Tooltip title={item.has_sync_updates ? 'Pull new transactions' : 'No updates available'}>
                                                        <span>
                                                            <Button
                                                                size="small"
                                                                variant={item.has_sync_updates ? 'contained' : 'outlined'}
                                                                color={item.has_sync_updates ? 'primary' : 'inherit'}
                                                                startIcon={syncingItems.has(item.item_id) ? (
                                                                    <CircularProgress size={16} color="inherit" />
                                                                ) : (
                                                                    <Sync />
                                                                )}
                                                                onClick={(e) => handleSyncTransactions(item.item_id, e)}
                                                                disabled={!item.has_sync_updates || syncingItems.has(item.item_id)}
                                                            >
                                                                Sync Transactions
                                                            </Button>
                                                        </span>
                                                    </Tooltip>

                                                    {/* Re-auth Button for login_required status */}
                                                    {(item.status === 'login_required' || item.status === 'needs_update') && (
                                                        <Tooltip title="Send re-authentication link">
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                color="warning"
                                                                startIcon={<LockReset />}
                                                                onClick={(e) => handleSendUpdateLink(item, e)}
                                                            >
                                                                Re-authenticate
                                                            </Button>
                                                        </Tooltip>
                                                    )}

                                                    {/* Delete Button */}
                                                    <Tooltip title="Remove bank connection">
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={(e) => handleDeleteItem(item.item_id, e)}
                                                        >
                                                            <Delete />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            </Box>
                                        </CardContent>
                                    </Collapse>
                                </Card>
                            ))}
                        </Stack>
                    )}
                </CardContent>
            </Card>

            {/* Send Link Dialog */}
            <SendLinkDialog
                open={sendLinkDialogOpen}
                onClose={() => {
                    setSendLinkDialogOpen(false);
                    setSelectedItemForUpdate(null);
                }}
                client={client}
                item={isNewLinkMode ? null : selectedItemForUpdate}
                onLinkCreated={() => {
                    setSendLinkDialogOpen(false);
                    setSelectedItemForUpdate(null);
                    fetchClientData();
                }}
            />
        </Box>
    );
};

export default ClientDetail;