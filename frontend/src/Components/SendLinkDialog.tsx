/**
 * SendLinkDialog Component
 * @module Components/SendLinkDialog
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Alert, CircularProgress, TextField, Autocomplete, FormControlLabel, Switch, Divider, IconButton, Paper } from '@mui/material';
import { Send, ContentCopy, OpenInNew, Close, AccountBalance, Person, Refresh } from '@mui/icons-material';
import { Client, Item, CreateLinkTokenResponse } from '../types/plaid';
import { createLinkToken, getClientDisplayName } from '../services/api';

interface SendLinkDialogProps {
    open: boolean;
    onClose: () => void;
    client?: Client | null;
    item?: Item | null;
    clients?: Client[];
    onLinkCreated?: (response: CreateLinkTokenResponse) => void;
}

type DialogMode = 'select' | 'creating' | 'success' | 'error';

export const SendLinkDialog: React.FC<SendLinkDialogProps> = ({ open, onClose, client: preSelectedClient, item: preSelectedItem, clients = [], onLinkCreated }) => {
    const [mode, setMode] = useState<DialogMode>('select');
    const [selectedClient, setSelectedClient] = useState<Client | null>(preSelectedClient || null);
    const [accountSelectionEnabled, setAccountSelectionEnabled] = useState(false);
    const [linkResponse, setLinkResponse] = useState<CreateLinkTokenResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isUpdateMode = !!preSelectedItem;
    const canCreate = !!selectedClient;

    useEffect(() => {
        if (open) {
            setMode('select');
            setSelectedClient(preSelectedClient || null);
            setAccountSelectionEnabled(false);
            setLinkResponse(null);
            setError(null);
            setCopied(false);
        }
    }, [open, preSelectedClient]);

    const handleCreate = async () => {
        if (!selectedClient) return;
        setMode('creating');
        setError(null);
        try {
            const response = await createLinkToken({
                clientId: selectedClient.client_id,
                itemId: preSelectedItem?.item_id,
                accountSelectionEnabled: isUpdateMode ? accountSelectionEnabled : undefined,
            });
            setLinkResponse(response);
            setMode('success');
            onLinkCreated?.(response);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : (err as { error?: string })?.error || 'Failed to create link';
            setError(errorMessage);
            setMode('error');
        }
    };

    const handleCopyLink = async () => {
        if (!linkResponse?.hostedLinkUrl) return;
        try {
            await navigator.clipboard.writeText(linkResponse.hostedLinkUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = linkResponse.hostedLinkUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleOpenLink = () => {
        if (linkResponse?.hostedLinkUrl) {
            window.open(linkResponse.hostedLinkUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const renderContent = () => {
        switch (mode) {
            case 'select':
                return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Alert severity={isUpdateMode ? 'info' : 'success'} icon={isUpdateMode ? <Refresh /> : <AccountBalance />}>
                            {isUpdateMode ? `Update mode: Re-authenticate ${preSelectedItem?.institution_name || 'bank connection'}` : 'Create a new bank connection link'}
                        </Alert>
                        {!preSelectedClient && clients.length > 0 && (
                            <Autocomplete
                                options={clients}
                                value={selectedClient}
                                onChange={(_, newValue) => setSelectedClient(newValue)}
                                getOptionLabel={(option) => getClientDisplayName(option)}
                                renderOption={(props, option) => (
                                    <Box component="li" {...props}>
                                        <Person sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                                        <Box>
                                            <Typography variant="body2">{getClientDisplayName(option)}</Typography>
                                            <Typography variant="caption" color="text.secondary">{option.email}</Typography>
                                        </Box>
                                    </Box>
                                )}
                                renderInput={(params) => <TextField {...params} label="Select Client" placeholder="Search by name or email..." fullWidth />}
                                noOptionsText="No clients found"
                            />
                        )}
                        {selectedClient && (
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Selected Client</Typography>
                                <Typography variant="body1" fontWeight={600}>{getClientDisplayName(selectedClient)}</Typography>
                                <Typography variant="body2" color="text.secondary">{selectedClient.email}</Typography>
                                {selectedClient.phone_number && <Typography variant="body2" color="text.secondary">{selectedClient.phone_number}</Typography>}
                            </Paper>
                        )}
                        {isUpdateMode && (
                            <>
                                <Divider />
                                <FormControlLabel
                                    control={<Switch checked={accountSelectionEnabled} onChange={(e) => setAccountSelectionEnabled(e.target.checked)} />}
                                    label={<Box><Typography variant="body2">Allow account selection</Typography><Typography variant="caption" color="text.secondary">Let client add or remove accounts from this connection</Typography></Box>}
                                />
                            </>
                        )}
                        <Typography variant="body2" color="text.secondary">
                            {isUpdateMode ? 'The client will receive a link to update their bank credentials. The link expires in 4 hours.' : 'The client will receive a link to securely connect their bank. The link expires in 4 hours.'}
                        </Typography>
                    </Box>
                );
            case 'creating':
                return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
                        <CircularProgress size={48} />
                        <Typography>Creating secure link...</Typography>
                    </Box>
                );
            case 'success':
                return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Alert severity="success">Link created successfully! Share it with your client.</Alert>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem' }}>{linkResponse?.hostedLinkUrl}</Typography>
                            <IconButton onClick={handleCopyLink} size="small" color={copied ? 'success' : 'default'} title="Copy link"><ContentCopy fontSize="small" /></IconButton>
                        </Paper>
                        {copied && <Alert severity="info" sx={{ py: 0.5 }}>Link copied to clipboard!</Alert>}
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <Button variant="contained" startIcon={<OpenInNew />} onClick={handleOpenLink} fullWidth>Open Link</Button>
                            <Button variant="outlined" startIcon={<ContentCopy />} onClick={handleCopyLink} fullWidth>{copied ? 'Copied!' : 'Copy Link'}</Button>
                        </Box>
                        <Typography variant="caption" color="text.secondary" textAlign="center">Link expires: {linkResponse?.expiresAt ? new Date(linkResponse.expiresAt).toLocaleString() : 'in 4 hours'}</Typography>
                    </Box>
                );
            case 'error':
                return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Alert severity="error">{error || 'An error occurred'}</Alert>
                        <Button variant="outlined" onClick={() => setMode('select')}>Try Again</Button>
                    </Box>
                );
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isUpdateMode ? <Refresh /> : <Send />}
                    <Typography variant="h6">{isUpdateMode ? 'Send Update Link' : 'Send Bank Connection Link'}</Typography>
                </Box>
                <IconButton onClick={onClose} size="small"><Close /></IconButton>
            </DialogTitle>
            <DialogContent dividers>{renderContent()}</DialogContent>
            {mode === 'select' && (
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={onClose} color="inherit">Cancel</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={!canCreate} startIcon={<Send />}>Create Link</Button>
                </DialogActions>
            )}
            {mode === 'success' && (
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={onClose} variant="contained">Done</Button>
                </DialogActions>
            )}
        </Dialog>
    );
};

export default SendLinkDialog;
