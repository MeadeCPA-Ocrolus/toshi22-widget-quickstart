/**
 * SendLinkDialog Component
 * 
 * Two modes:
 * 1. New connection - Select client, create hosted link (always has account selection)
 * 2. Update mode - Pre-selected client + item, for re-authentication
 * 
 * @module Components/SendLinkDialog
 */

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Alert,
    CircularProgress,
    TextField,
    Autocomplete,
    Divider,
    IconButton,
    Paper,
} from '@mui/material';
import {
    Send,
    ContentCopy,
    OpenInNew,
    Close,
    AccountBalance,
    Person,
    Refresh,
    CheckCircle,
} from '@mui/icons-material';
import { Client, Item, CreateLinkTokenResponse } from '../types/plaid';
import { createLinkToken, getClientDisplayName } from '../services/api';

interface SendLinkDialogProps {
    open: boolean;
    onClose: () => void;
    /** Pre-selected client (for update mode or when opened from client detail) */
    client?: Client | null;
    /** Pre-selected item (triggers update mode) */
    item?: Item | null;
    /** List of clients for selection dropdown (new connection mode) */
    clients?: Client[];
    /** Callback when link is successfully created */
    onLinkCreated?: (response: CreateLinkTokenResponse) => void;
}

type DialogState = 'form' | 'creating' | 'success' | 'error';

export const SendLinkDialog: React.FC<SendLinkDialogProps> = ({
    open,
    onClose,
    client: preSelectedClient,
    item: preSelectedItem,
    clients = [],
    onLinkCreated,
}) => {
    const [state, setState] = useState<DialogState>('form');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [linkResponse, setLinkResponse] = useState<CreateLinkTokenResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Determine mode based on whether item is provided
    const isUpdateMode = !!preSelectedItem;

    // Reset state when dialog opens/closes or pre-selections change
    useEffect(() => {
        if (open) {
            setState('form');
            setSelectedClient(preSelectedClient || null);
            setLinkResponse(null);
            setError(null);
            setCopied(false);
        }
    }, [open, preSelectedClient]);

    const canCreate = !!selectedClient;

    const handleCreate = async () => {
        if (!selectedClient) return;

        setState('creating');
        setError(null);

        try {
            const response = await createLinkToken({
                clientId: selectedClient.client_id,
                itemId: preSelectedItem?.item_id,
                // Always enable account selection for all flows
                accountSelectionEnabled: true,
            });

            setLinkResponse(response);
            setState('success');
            // Don't call onLinkCreated here - wait until user closes dialog
        } catch (err) {
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : (err as { error?: string })?.error || 'Failed to create link';
            setError(errorMessage);
            setState('error');
        }
    };

    const handleCopyLink = async () => {
        if (!linkResponse?.hostedLinkUrl) return;

        try {
            await navigator.clipboard.writeText(linkResponse.hostedLinkUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
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

    const handleClose = () => {
        // If we successfully created a link, notify parent to refresh data
        if (state === 'success' && linkResponse) {
            onLinkCreated?.(linkResponse);
        }
        onClose();
    };

    const renderForm = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Mode indicator */}
            <Alert
                severity={isUpdateMode ? 'info' : 'success'}
                icon={isUpdateMode ? <Refresh /> : <AccountBalance />}
            >
                {isUpdateMode
                    ? `Update mode: Re-authenticate "${preSelectedItem?.institution_name || 'bank connection'}"`
                    : 'Create a new bank connection link for the client'}
            </Alert>

            {/* Client selection - only show if not pre-selected and we have a client list */}
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
                                <Typography variant="body2">
                                    {getClientDisplayName(option)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {option.email}
                                </Typography>
                            </Box>
                        </Box>
                    )}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Select Client"
                            placeholder="Search by name or email..."
                            fullWidth
                        />
                    )}
                    noOptionsText="No clients found"
                />
            )}

            {/* Selected client display */}
            {selectedClient && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Selected Client
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                        {getClientDisplayName(selectedClient)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {selectedClient.email}
                    </Typography>
                    {selectedClient.phone_number && (
                        <Typography variant="body2" color="text.secondary">
                            {selectedClient.phone_number}
                        </Typography>
                    )}
                </Paper>
            )}

            {/* Update mode item info */}
            {isUpdateMode && preSelectedItem && (
                <>
                    <Divider />
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'info.light', color: 'info.contrastText' }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Bank to Update
                        </Typography>
                        <Typography variant="body1" fontWeight={600}>
                            {preSelectedItem.institution_name || 'Unknown Bank'}
                        </Typography>
                        <Typography variant="body2">
                            Status: {preSelectedItem.status.replace(/_/g, ' ')}
                        </Typography>
                    </Paper>
                </>
            )}

            {/* Info text */}
            <Typography variant="body2" color="text.secondary">
                {isUpdateMode
                    ? 'The client will receive a link to update their bank credentials and can add or remove accounts. The link expires in 4 hours.'
                    : 'The client will receive a link to securely connect their bank and select which accounts to share. The link expires in 4 hours.'}
            </Typography>
        </Box>
    );

    const renderCreating = () => (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                py: 4,
            }}
        >
            <CircularProgress size={48} />
            <Typography>Creating secure link...</Typography>
        </Box>
    );

    const renderSuccess = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Alert severity="success" icon={<CheckCircle />}>
                Link created successfully! Share it with your client.
            </Alert>

            {/* Link display */}
            <Paper
                variant="outlined"
                sx={{
                    p: 2,
                    bgcolor: 'grey.50',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                }}
            >
                <Typography
                    variant="body2"
                    sx={{
                        flex: 1,
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                    }}
                >
                    {linkResponse?.hostedLinkUrl}
                </Typography>
                <IconButton
                    onClick={handleCopyLink}
                    size="small"
                    color={copied ? 'success' : 'default'}
                    title="Copy link"
                >
                    <ContentCopy fontSize="small" />
                </IconButton>
            </Paper>

            {/* Copy confirmation */}
            {copied && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                    Link copied to clipboard!
                </Alert>
            )}

            {/* Action buttons */}
            <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                    variant="contained"
                    startIcon={<OpenInNew />}
                    onClick={handleOpenLink}
                    fullWidth
                >
                    Open Link
                </Button>
                <Button
                    variant="outlined"
                    startIcon={<ContentCopy />}
                    onClick={handleCopyLink}
                    fullWidth
                >
                    {copied ? 'Copied!' : 'Copy Link'}
                </Button>
            </Box>

            {/* Expiration info */}
            <Typography variant="caption" color="text.secondary" textAlign="center">
                Link expires:{' '}
                {linkResponse?.expiresAt
                    ? new Date(linkResponse.expiresAt).toLocaleString()
                    : 'in 4 hours'}
            </Typography>
        </Box>
    );

    const renderError = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="error">{error || 'An error occurred'}</Alert>
            <Button variant="outlined" onClick={() => setState('form')}>
                Try Again
            </Button>
        </Box>
    );

    const renderContent = () => {
        switch (state) {
            case 'form':
                return renderForm();
            case 'creating':
                return renderCreating();
            case 'success':
                return renderSuccess();
            case 'error':
                return renderError();
        }
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{ sx: { borderRadius: 2 } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isUpdateMode ? <Refresh /> : <Send />}
                    <Typography variant="h6">
                        {isUpdateMode ? 'Send Update Link' : 'Send Bank Connection Link'}
                    </Typography>
                </Box>
                <IconButton onClick={handleClose} size="small">
                    <Close />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers>{renderContent()}</DialogContent>

            {state === 'form' && (
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={handleClose} color="inherit">
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleCreate}
                        disabled={!canCreate}
                        startIcon={<Send />}
                    >
                        Create Link
                    </Button>
                </DialogActions>
            )}

            {state === 'success' && (
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={handleClose} variant="contained">
                        Done
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
};

export default SendLinkDialog;