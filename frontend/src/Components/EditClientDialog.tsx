import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    Stack,
    Alert,
    CircularProgress,
    IconButton,
    Grid,
    Divider,
} from '@mui/material';
import { Close, Delete } from '@mui/icons-material';
import { Client, AccountType } from '../types/plaid';
import { updateClient, deleteClient, getClientDisplayName } from '../services/api';

interface EditClientDialogProps {
    open: boolean;
    client: Client;
    onClose: () => void;
    /** Called after a successful save — parent should refetch client data */
    onSaved: () => void;
    /** Called after a successful delete — parent should navigate away */
    onDeleted: () => void;
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
    { value: 'sole_proprietor', label: 'Sole Proprietor' },
    { value: 'partnership', label: 'Partnership' },
    { value: 's_corp', label: 'S-Corp' },
    { value: 'c_corp', label: 'C-Corp' },
    { value: 'llc', label: 'LLC' },
    { value: 'personal', label: 'Personal' },
];

interface FormState {
    first_name: string;
    last_name: string;
    business_name: string;
    email: string;
    phone_number: string;
    account_type: AccountType | '';
    fiscal_year_start_date: string;
    state: string;
}

function clientToForm(client: Client): FormState {
    return {
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        business_name: client.business_name || '',
        email: client.email || '',
        phone_number: client.phone_number || '',
        account_type: client.account_type || '',
        // Trim to YYYY-MM-DD for the date input, same as how it's stored
        fiscal_year_start_date: client.fiscal_year_start_date
            ? String(client.fiscal_year_start_date).slice(0, 10)
            : '',
        state: client.state || '',
    };
}

/** Same validation rules as CreateClientDialog */
function validate(form: FormState): string | null {
    if (!form.first_name.trim()) return 'First name is required';
    if (!form.last_name.trim()) return 'Last name is required';
    if (!form.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email address';
    if (!form.account_type) return 'Account type is required';
    if (!form.fiscal_year_start_date) return 'Fiscal year start date is required';
    if (!form.state.trim()) return 'State is required';
    if (form.state.trim().length !== 2) return 'State should be a 2-letter code (e.g. NY)';
    return null;
}

export const EditClientDialog: React.FC<EditClientDialogProps> = ({
    open,
    client,
    onClose,
    onSaved,
    onDeleted,
}) => {
    const [form, setForm] = useState<FormState>(clientToForm(client));
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Re-sync form whenever a different client's dialog is opened
    useEffect(() => {
        if (open) {
            setForm(clientToForm(client));
            setError(null);
        }
    }, [open, client]);

    const handleChange = (field: keyof FormState) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleClose = () => {
        if (saving || deleting) return; // don't close mid-request
        onClose();
    };

    const handleSave = async () => {
        const validationError = validate(form);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSaving(true);
        setError(null);

        try {
            await updateClient(client.client_id, {
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                business_name: form.business_name.trim() || null,
                email: form.email.trim(),
                phone_number: form.phone_number.trim() || null,
                account_type: form.account_type as AccountType,
                fiscal_year_start_date: form.fiscal_year_start_date,
                state: form.state.trim().toUpperCase(),
            });

            onSaved();
            onClose();
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : (err as { error?: string })?.error || 'Failed to update client';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Delete ${getClientDisplayName(client)}? This can't be undone from the UI.`)) {
            return;
        }

        setDeleting(true);
        setError(null);

        try {
            await deleteClient(client.client_id);
            onDeleted();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete client';
            setError(message);
            setDeleting(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Edit Client
                <IconButton onClick={handleClose} size="small" disabled={saving || deleting}>
                    <Close />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField
                                label="First Name"
                                value={form.first_name}
                                onChange={handleChange('first_name')}
                                fullWidth
                                required
                                disabled={saving || deleting}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Last Name"
                                value={form.last_name}
                                onChange={handleChange('last_name')}
                                fullWidth
                                required
                                disabled={saving || deleting}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                label="Business Name"
                                value={form.business_name}
                                onChange={handleChange('business_name')}
                                fullWidth
                                disabled={saving || deleting}
                                helperText="Optional"
                            />
                        </Grid>

                        <Grid item xs={6}>
                            <TextField
                                label="Email"
                                type="email"
                                value={form.email}
                                onChange={handleChange('email')}
                                fullWidth
                                required
                                disabled={saving || deleting}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Phone Number"
                                value={form.phone_number}
                                onChange={handleChange('phone_number')}
                                fullWidth
                                disabled={saving || deleting}
                                helperText="Optional"
                            />
                        </Grid>

                        <Grid item xs={6}>
                            <TextField
                                select
                                label="Account Type"
                                value={form.account_type}
                                onChange={handleChange('account_type')}
                                fullWidth
                                required
                                disabled={saving || deleting}
                            >
                                {ACCOUNT_TYPES.map((opt) => (
                                    <MenuItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="State"
                                value={form.state}
                                onChange={handleChange('state')}
                                fullWidth
                                required
                                disabled={saving || deleting}
                                inputProps={{ maxLength: 2 }}
                                helperText="2-letter code, e.g. NY"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                label="Fiscal Year Start Date"
                                type="date"
                                value={form.fiscal_year_start_date}
                                onChange={handleChange('fiscal_year_start_date')}
                                fullWidth
                                required
                                disabled={saving || deleting}
                                InputLabelProps={{ shrink: true }}
                                helperText="Usually 01-01 for a calendar-year filer"
                            />
                        </Grid>
                    </Grid>

                    <Divider sx={{ pt: 1 }} />

                    <Button
                        color="error"
                        variant="outlined"
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <Delete />}
                        onClick={handleDelete}
                        disabled={saving || deleting}
                    >
                        {deleting ? 'Deleting…' : 'Delete Client'}
                    </Button>
                </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={handleClose} disabled={saving || deleting}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || deleting}
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                    {saving ? 'Saving…' : 'Save Changes'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};