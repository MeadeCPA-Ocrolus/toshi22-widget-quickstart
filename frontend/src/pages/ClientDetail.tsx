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
} from '../services/transactions-api';
import {
    StatusBadge,
    SyncBadge,
    ConsentExpirationBadge,
    AccountTypeBadge,
} from '../Components/StatusBadge';
import { SendLinkDialog } from '../Components/SendLinkDialog';

// ============================================================================
// Transaction Row Component
// ============================================================================

interface TransactionRowProps {
    transaction: TransactionWithDetails;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ transaction }) => {
    const isExpense = transaction.amount > 0;
    const needsReview = needsCategoryReview(
        transaction.plaid_confidence_score,
        transaction.category_verified
    );

    return (
        <TableRow
            sx={{
                '&:hover': { bgcolor: 'action.hover' },
                bgcolor: transaction.pending ? 'rgba(255, 193, 7, 0.08)' : 'inherit',
            }}
        >
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
                        {transaction.merchant_name && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                                {transaction.original_description}
                            </Typography>
                        )}
                    </Box>
                </Box>
            </TableCell>
            <TableCell sx={{ py: 1 }}>
                <Tooltip title={transaction.plaid_detailed_category || 'Unknown'}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                            {transaction.plaid_primary_category?.replace(/_/g, ' ') || '—'}
                        </Typography>
                        {needsReview && (
                            <Warning sx={{ fontSize: 14, color: 'warning.main' }} />
                        )}
                    </Box>
                </Tooltip>
            </TableCell>
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
}

const AccountTransactionsSection: React.FC<AccountTransactionsSectionProps> = ({
    account,
    expanded,
}) => {
    const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);

    // Load transactions when expanded for the first time
    useEffect(() => {
        if (expanded && !loaded) {
            loadTransactions();
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

    if (!expanded) return null;

    return (
        <Box sx={{ pl: 4, pr: 2, pb: 2 }}>
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
                <Alert severity="error" sx={{ my: 1 }}>
                    {error}
                </Alert>
            )}

            {!loading && !error && transactions.length === 0 && (
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50' }}>
                    <Receipt sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                        No transactions yet for this account
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
                                    <TransactionRow key={tx.transaction_id} transaction={tx} />
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
                                            <StatusBadge status={item.status} />
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