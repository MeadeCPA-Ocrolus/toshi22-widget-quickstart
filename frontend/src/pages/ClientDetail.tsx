/**
 * ClientDetail Page - Shows client's bank connections
 * @module pages/ClientDetail
 */

import React, { useState, useEffect } from 'react';
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
} from '@mui/icons-material';
import {
    Client,
    ItemWithAccounts,
    Account,
    ItemStatus,
    ClientItemsResponse,
} from '../types/plaid';
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
    StatusBadge,
    SyncBadge,
    ConsentExpirationBadge,
    AccountTypeBadge,
} from '../Components/StatusBadge';
import { SendLinkDialog } from '../Components/SendLinkDialog';

export const ClientDetail: React.FC = () => {
    const { clientId } = useParams<{ clientId: string }>();
    const navigate = useNavigate();

    const [client, setClient] = useState<Client | null>(null);
    const [items, setItems] = useState<ItemWithAccounts[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

    // Failed link sessions
    const [failedLinks, setFailedLinks] = useState<FailedLinkSession[]>([]);
    const [showFailedLinks, setShowFailedLinks] = useState(true);

    // Dialog state
    const [sendLinkDialogOpen, setSendLinkDialogOpen] = useState(false);
    const [selectedItemForUpdate, setSelectedItemForUpdate] = useState<ItemWithAccounts | null>(null);
    const [isNewLinkMode, setIsNewLinkMode] = useState(false);

    const fetchClientData = async () => {
        if (!clientId) return;

        setLoading(true);
        setError(null);

        try {
            const response: ClientItemsResponse = await getClientItems(parseInt(clientId, 10));
            setClient(response.client);

            // Filter out archived items, keep accounts as-is (we filter in render)
            const activeItems = response.items
                .filter((item) => !item.is_archived)
                .map((item) => ({
                    ...item,
                    accounts: item.accounts.filter((acc) => acc.is_active),
                }));

            setItems(activeItems);

            // Auto-expand items needing attention
            const needsAttention = new Set(
                activeItems
                    .filter(
                        (item) =>
                            ['login_required', 'needs_update', 'error'].includes(item.status) ||
                            item.has_sync_updates
                    )
                    .map((item) => item.item_id)
            );
            setExpandedItems(needsAttention);

            // Fetch failed link sessions for this client
            try {
                const failed = await getFailedLinkSessions(parseInt(clientId, 10));
                setFailedLinks(failed);
            } catch {
                // Endpoint may not exist yet - silently fail
            }
        } catch (err) {
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : (err as { error?: string })?.error || 'Failed to load client data';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClientData();
    }, [clientId]);

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

    // Open dialog for NEW bank connection
    const handleSendNewLink = () => {
        setSelectedItemForUpdate(null);
        setIsNewLinkMode(true);
        setSendLinkDialogOpen(true);
    };

    // Open dialog for UPDATE mode (specific item)
    const handleSendUpdateLink = (item: ItemWithAccounts) => {
        setSelectedItemForUpdate(item);
        setIsNewLinkMode(false);
        setSendLinkDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setSendLinkDialogOpen(false);
        setSelectedItemForUpdate(null);
        setIsNewLinkMode(false);
    };

    const handleDeleteItem = async (item: ItemWithAccounts) => {
        if (
            !window.confirm(
                `Are you sure you want to remove the connection to ${item.institution_name || 'this bank'}?`
            )
        ) {
            return;
        }

        try {
            await deleteItem(item.item_id, true);
            fetchClientData();
        } catch (err) {
            alert('Failed to delete item. Please try again.');
        }
    };

    const handleLinkCreated = () => {
        fetchClientData();
    };

    const getItemBorderColor = (status: ItemStatus): string => {
        switch (status) {
            case 'login_required':
            case 'error':
                return 'error.main';
            case 'needs_update':
                return 'warning.main';
            case 'active':
                return 'success.main';
            default:
                return 'grey.300';
        }
    };

    const calculateTotalBalance = (accounts: Account[]): number => {
        return accounts.reduce((sum, acc) => {
            const balance = acc.current_balance || 0;
            // Credit and loan balances are liabilities (negative)
            if (acc.account_type === 'credit' || acc.account_type === 'loan') {
                return sum - Math.abs(balance);
            }
            return sum + balance;
        }, 0);
    };

    // Check if item needs update mode
    const itemNeedsUpdate = (item: ItemWithAccounts): boolean => {
        return ['login_required', 'needs_update', 'error'].includes(item.status);
    };

    // Get human-readable message for failed link status
    const getFailedLinkMessage = (session: FailedLinkSession): string => {
        switch (session.last_session_status) {
            case 'EXITED':
                return 'Client exited without completing';
            case 'REQUIRES_CREDENTIALS':
                return 'Client did not enter bank credentials';
            case 'REQUIRES_QUESTIONS':
                return 'Client did not answer security questions';
            case 'REQUIRES_SELECTIONS':
                return 'Client did not select accounts';
            case 'INSTITUTION_NOT_SUPPORTED':
                return 'Bank not supported';
            case 'INSTITUTION_NOT_FOUND':
                return 'Bank not found';
            default:
                return session.last_session_status || 'Link failed';
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error || !client) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error || 'Client not found'}
                </Alert>
                <Button startIcon={<ArrowBack />} onClick={() => navigate('/bank/clients')}>
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
                        <Stack direction="row" spacing={1}>
                            <Button variant="outlined" startIcon={<Refresh />} onClick={fetchClientData}>
                                Refresh
                            </Button>
                            <Button variant="contained" startIcon={<Send />} onClick={handleSendNewLink}>
                                Send Bank Link
                            </Button>
                        </Stack>
                    </Box>
                </CardContent>
            </Card>

            {/* Client Info Card */}
            <Card sx={{ mb: 3, bgcolor: 'rgba(255, 255, 255, 0.95)' }}>
                <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom>
                        Client Information
                    </Typography>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Stack spacing={1.5}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {client.business_name ? (
                                        <Business sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    ) : (
                                        <Person sx={{ color: 'text.secondary', fontSize: 20 }} />
                                    )}
                                    <Typography variant="body2">
                                        <strong>Type:</strong>{' '}
                                        {client.account_type
                                            .replace(/_/g, ' ')
                                            .replace(/\b\w/g, (c) => c.toUpperCase())}
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
                                        <strong>Connected Banks:</strong> {items.length}
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

                    {items.length === 0 ? (
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
                            {items.map((item) => (
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
                                                {item.accounts.length} account
                                                {item.accounts.length !== 1 ? 's' : ''} • Connected{' '}
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

                                            {/* Accounts Table */}
                                            <TableContainer component={Paper} variant="outlined">
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell sx={{ fontWeight: 600 }}>
                                                                Account
                                                            </TableCell>
                                                            <TableCell sx={{ fontWeight: 600 }}>
                                                                Type
                                                            </TableCell>
                                                            <TableCell
                                                                sx={{ fontWeight: 600, textAlign: 'right' }}
                                                            >
                                                                Balance
                                                            </TableCell>
                                                            <TableCell
                                                                sx={{ fontWeight: 600, textAlign: 'right' }}
                                                            >
                                                                Available
                                                            </TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {item.accounts.map((account) => (
                                                            <TableRow key={account.account_id}>
                                                                <TableCell>
                                                                    <Typography
                                                                        variant="body2"
                                                                        fontWeight={500}
                                                                    >
                                                                        {account.account_name ||
                                                                            account.official_name ||
                                                                            'Unnamed Account'}
                                                                    </Typography>
                                                                    {account.official_name &&
                                                                        account.account_name && (
                                                                            <Typography
                                                                                variant="caption"
                                                                                color="text.secondary"
                                                                            >
                                                                                {account.official_name}
                                                                            </Typography>
                                                                        )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <AccountTypeBadge
                                                                        accountType={account.account_type}
                                                                        accountSubtype={account.account_subtype}
                                                                    />
                                                                </TableCell>
                                                                <TableCell sx={{ textAlign: 'right' }}>
                                                                    <Typography
                                                                        variant="body2"
                                                                        fontWeight={500}
                                                                        color={
                                                                            (account.current_balance || 0) < 0
                                                                                ? 'error.main'
                                                                                : 'text.primary'
                                                                        }
                                                                    >
                                                                        {formatCurrency(account.current_balance)}
                                                                    </Typography>
                                                                </TableCell>
                                                                <TableCell sx={{ textAlign: 'right' }}>
                                                                    <Typography
                                                                        variant="body2"
                                                                        color="text.secondary"
                                                                    >
                                                                        {formatCurrency(account.available_balance)}
                                                                    </Typography>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {/* Net Position Row */}
                                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                                            <TableCell colSpan={2}>
                                                                <Typography variant="body2" fontWeight={600}>
                                                                    Net Position
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell sx={{ textAlign: 'right' }}>
                                                                <Typography variant="body2" fontWeight={600}>
                                                                    {formatCurrency(
                                                                        calculateTotalBalance(item.accounts)
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell />
                                                        </TableRow>
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>

                                            {/* Action Buttons */}
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: 'flex-end',
                                                    gap: 1,
                                                    mt: 2,
                                                }}
                                            >
                                                {/* Update Link Button - only show if item needs update */}
                                                {itemNeedsUpdate(item) && (
                                                    <Button
                                                        variant="contained"
                                                        size="small"
                                                        color="warning"
                                                        startIcon={<LockReset />}
                                                        onClick={() => handleSendUpdateLink(item)}
                                                    >
                                                        Send Update Link
                                                    </Button>
                                                )}

                                                {/* Sync button - disabled for now */}
                                                {item.has_sync_updates && (
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        startIcon={<Refresh />}
                                                        color="info"
                                                        disabled
                                                    >
                                                        Sync Transactions
                                                    </Button>
                                                )}

                                                {/* Delete button */}
                                                <Tooltip title="Remove this bank connection">
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleDeleteItem(item)}
                                                    >
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>

                                            {/* Item metadata */}
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ display: 'block', mt: 2 }}
                                            >
                                                Last synced:{' '}
                                                {formatRelativeTime(
                                                    item.transactions_last_successful_update
                                                )}{' '}
                                                • Item ID: {item.plaid_item_id.substring(0, 12)}...
                                            </Typography>
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
                onClose={handleCloseDialog}
                client={client}
                item={isNewLinkMode ? null : selectedItemForUpdate}
                onLinkCreated={handleLinkCreated}
            />
        </Box>
    );
};

export default ClientDetail;