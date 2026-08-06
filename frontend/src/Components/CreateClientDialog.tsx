import React, { useState } from 'react';
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
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { AccountType } from '../types/plaid';
import { createClient } from '../services/api';

interface CreateClientDialogProps {
    open: boolean;
    onClose: () => void;
    /** Called with the new client's ID after a successful save */
   onCreated: (clientId: number) => void;
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

const EMPTY_FORM: FormState = {
    first_name: '',
    last_name: '',
    business_name: '',
    email: '',
    phone_number: '',
    account_type: '',
    fiscal_year_start_date: '',
    state: '',
};

/**
 * Minimal client-side validation, mirroring the backend's actual
 * requirements in api/clients/index.ts (createClient) — not a full
 * re-implementation, just enough to avoid an obvious round-trip failure.
 */
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

export const CreateClientDialog: React.FC<CreateClientDialogProps> = ({ open, onClose, onCreated }) => {
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (field: keyof FormState) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleClose = () => {
        if (saving) return; // don't let the dialog close mid-request
        setForm(EMPTY_FORM);
        setError(null);
        onClose();
    };

    const handleSubmit = async () => {
        const validationError = validate(form);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSaving(true);
        setError(null);

        try {
            // Only the fields the backend's createClient actually reads —
            // client_uuid is server-generated, tax-rate fields and
            // is_archived aren't part of creation at all.
            const response = await createClient({
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                business_name: form.business_name.trim() || null,
                email: form.email.trim(),
                phone_number: form.phone_number.trim() || null,
                account_type: form.account_type as AccountType,
                fiscal_year_start_date: form.fiscal_year_start_date,
                state: form.state.trim().toUpperCase(),
            });

            onCreated(response.client_id);
            setForm(EMPTY_FORM);
            onClose();
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : (err as { error?: string })?.error || 'Failed to create client';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Add New Client
                <IconButton onClick={handleClose} size="small" disabled={saving}>
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
                                disabled={saving}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Last Name"
                                value={form.last_name}
                                onChange={handleChange('last_name')}
                                fullWidth
                                required
                                disabled={saving}
                            />
                        </Grid>
                    </Grid>

                    <TextField
                        label="Business Name"
                        value={form.business_name}
                        onChange={handleChange('business_name')}
                        fullWidth
                        disabled={saving}
                        helperText="Optional"
                    />

                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField
                                label="Email"
                                type="email"
                                value={form.email}
                                onChange={handleChange('email')}
                                fullWidth
                                required
                                disabled={saving}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Phone Number"
                                value={form.phone_number}
                                onChange={handleChange('phone_number')}
                                fullWidth
                                disabled={saving}
                                helperText="Optional"
                            />
                        </Grid>
                    </Grid>

                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField
                                select
                                label="Account Type"
                                value={form.account_type}
                                onChange={handleChange('account_type')}
                                fullWidth
                                required
                                disabled={saving}
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
                                disabled={saving}
                                inputProps={{ maxLength: 2 }}
                                helperText="2-letter code, e.g. NY"
                            />
                        </Grid>
                    </Grid>

                    <TextField
                        label="Fiscal Year Start Date"
                        type="date"
                        value={form.fiscal_year_start_date}
                        onChange={handleChange('fiscal_year_start_date')}
                        fullWidth
                        required
                        disabled={saving}
                        InputLabelProps={{ shrink: true }}
                        helperText="Usually 01-01 for a calendar-year filer"
                    />
                </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={handleClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                    {saving ? 'Creating…' : 'Create Client'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};