/**
 * ClientList Page - Main CPA dashboard
 * @module pages/ClientList
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Card, CardContent, Typography, TextField, InputAdornment, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Alert, CircularProgress, FormControlLabel, Switch, Stack } from '@mui/material';
import { Search, Send, Visibility, AccountBalance, Warning, Error as ErrorIcon, CheckCircle, Refresh, FilterList, Person, Business } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Client, ClientWithAlerts } from '../types/plaid';
import { getClients, getClientDisplayName } from '../services/api';
import { SendLinkDialog } from '../Components/SendLinkDialog';

interface AlertCount { total: number; loginRequired: number; needsUpdate: number; errors: number; syncAvailable: number; }

export const ClientList: React.FC = () => {
    const navigate = useNavigate();
    const [clients, setClients] = useState<ClientWithAlerts[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showOnlyIssues, setShowOnlyIssues] = useState(false);
    const [sendLinkDialogOpen, setSendLinkDialogOpen] = useState(false);
    const [selectedClientForLink, setSelectedClientForLink] = useState<Client | null>(null);

    const fetchClients = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await getClients({ search: searchQuery || undefined, hasIssues: showOnlyIssues || undefined });
            setClients(response.clients || []);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : (err as { error?: string })?.error || 'Failed to load clients';
            setError(errorMessage);
            setClients([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchClients(); }, [showOnlyIssues]);
    useEffect(() => { const timer = setTimeout(() => { fetchClients(); }, 300); return () => clearTimeout(timer); }, [searchQuery]);

    const alertCounts = useMemo<AlertCount>(() => {
        return clients.reduce((acc, client) => ({
            total: acc.total + (client.items_needing_attention || 0),
            loginRequired: acc.loginRequired + (client.has_login_required ? 1 : 0),
            needsUpdate: acc.needsUpdate + (client.has_needs_update ? 1 : 0),
            errors: acc.errors + (client.has_error ? 1 : 0),
            syncAvailable: acc.syncAvailable + (client.has_pending_sync ? 1 : 0),
        }), { total: 0, loginRequired: 0, needsUpdate: 0, errors: 0, syncAvailable: 0 });
    }, [clients]);

    const handleViewClient = (clientId: number) => navigate(`/bank/clients/${clientId}`);
    const handleSendLink = (client: Client) => { setSelectedClientForLink(client); setSendLinkDialogOpen(true); };
    const handleSendNewLink = () => { setSelectedClientForLink(null); setSendLinkDialogOpen(true); };
    const handleLinkCreated = () => fetchClients();

    const getClientStatusIndicator = (client: ClientWithAlerts) => {
        if (client.has_error) return <Tooltip title="Has bank connection errors"><ErrorIcon color="error" sx={{ fontSize: 20 }} /></Tooltip>;
        if (client.has_login_required) return <Tooltip title="Bank login required"><Warning color="error" sx={{ fontSize: 20 }} /></Tooltip>;
        if (client.has_needs_update) return <Tooltip title="Bank connection needs update"><Warning color="warning" sx={{ fontSize: 20 }} /></Tooltip>;
        if (client.has_pending_sync) return <Tooltip title="Transactions ready to sync"><Refresh color="info" sx={{ fontSize: 20 }} /></Tooltip>;
        if ((client.item_count || 0) > 0) return <Tooltip title="All connections healthy"><CheckCircle color="success" sx={{ fontSize: 20 }} /></Tooltip>;
        return null;
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h5" fontWeight={600}>Client Dashboard</Typography>
                    <Typography variant="body2" color="text.secondary">Manage client bank connections and view alerts</Typography>
                </Box>
                <Button variant="contained" startIcon={<Send />} onClick={handleSendNewLink}>Send Bank Link</Button>
            </Box>

            {alertCounts.total > 0 && (
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    {alertCounts.loginRequired > 0 && <Card sx={{ minWidth: 140, bgcolor: 'error.light', color: 'error.contrastText' }}><CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}><Typography variant="h4" fontWeight={700}>{alertCounts.loginRequired}</Typography><Typography variant="body2">Login Required</Typography></CardContent></Card>}
                    {alertCounts.errors > 0 && <Card sx={{ minWidth: 140, bgcolor: 'error.main', color: 'error.contrastText' }}><CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}><Typography variant="h4" fontWeight={700}>{alertCounts.errors}</Typography><Typography variant="body2">Errors</Typography></CardContent></Card>}
                    {alertCounts.needsUpdate > 0 && <Card sx={{ minWidth: 140, bgcolor: 'warning.light', color: 'warning.contrastText' }}><CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}><Typography variant="h4" fontWeight={700}>{alertCounts.needsUpdate}</Typography><Typography variant="body2">Needs Update</Typography></CardContent></Card>}
                    {alertCounts.syncAvailable > 0 && <Card sx={{ minWidth: 140, bgcolor: 'info.light', color: 'info.contrastText' }}><CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}><Typography variant="h4" fontWeight={700}>{alertCounts.syncAvailable}</Typography><Typography variant="body2">Sync Available</Typography></CardContent></Card>}
                </Box>
            )}

            <Card sx={{ mb: 3 }}>
                <CardContent sx={{ py: 2 }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField placeholder="Search clients..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} size="small" sx={{ minWidth: 300 }} InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary' }} /></InputAdornment> }} />
                        <FormControlLabel control={<Switch checked={showOnlyIssues} onChange={(e) => setShowOnlyIssues(e.target.checked)} color="warning" />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><FilterList sx={{ fontSize: 18 }} /><Typography variant="body2">Show only issues</Typography></Box>} />
                        <Box sx={{ flex: 1 }} />
                        <IconButton onClick={fetchClients} title="Refresh"><Refresh /></IconButton>
                    </Box>
                </CardContent>
            </Card>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

            {!loading && (
                <TableContainer component={Paper} variant="outlined">
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.50' }}>
                                <TableCell sx={{ fontWeight: 600, width: 40 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Client</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Banks</TableCell>
                                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Alerts</TableCell>
                                <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {clients.length === 0 ? (
                                <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}><Typography color="text.secondary">{searchQuery || showOnlyIssues ? 'No clients match your filters' : 'No clients yet. Add clients to get started.'}</Typography></TableCell></TableRow>
                            ) : (
                                clients.map((client) => (
                                    <TableRow key={client.client_id} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => handleViewClient(client.client_id)}>
                                        <TableCell>{getClientStatusIndicator(client)}</TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {client.business_name ? <Business sx={{ fontSize: 20, color: 'text.secondary' }} /> : <Person sx={{ fontSize: 20, color: 'text.secondary' }} />}
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>{getClientDisplayName(client)}</Typography>
                                                    {client.business_name && <Typography variant="caption" color="text.secondary">{client.first_name} {client.last_name}</Typography>}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell><Typography variant="body2">{client.email}</Typography></TableCell>
                                        <TableCell><Chip label={client.account_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} size="small" variant="outlined" /></TableCell>
                                        <TableCell sx={{ textAlign: 'center' }}><Chip icon={<AccountBalance sx={{ fontSize: 14 }} />} label={client.item_count || 0} size="small" variant="outlined" color={(client.item_count || 0) > 0 ? 'primary' : 'default'} /></TableCell>
                                        <TableCell sx={{ textAlign: 'center' }}>{(client.items_needing_attention || 0) > 0 ? <Chip icon={<Warning sx={{ fontSize: 14 }} />} label={client.items_needing_attention} size="small" color="warning" /> : <Typography variant="body2" color="text.secondary">—</Typography>}</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <Tooltip title="Send bank link"><IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSendLink(client); }} color="primary"><Send fontSize="small" /></IconButton></Tooltip>
                                                <Tooltip title="View details"><IconButton size="small" onClick={(e) => { e.stopPropagation(); handleViewClient(client.client_id); }}><Visibility fontSize="small" /></IconButton></Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {!loading && clients.length > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'right' }}>Showing {clients.length} client{clients.length !== 1 ? 's' : ''}</Typography>}

            <SendLinkDialog open={sendLinkDialogOpen} onClose={() => setSendLinkDialogOpen(false)} client={selectedClientForLink} clients={clients} onLinkCreated={handleLinkCreated} />
        </Box>
    );
};

export default ClientList;
