/**
 * Status Badge Components
 * 
 * Reusable badge components for displaying item/account status
 * 
 * @module Components/StatusBadge
 */

import React from 'react';
import { Chip, Tooltip, Box, Typography } from '@mui/material';
import {
    CheckCircle,
    Warning,
    Error,
    LockReset,
    Sync,
    Schedule,
    NewReleases,
} from '@mui/icons-material';
import { ItemStatus } from '../types/plaid';

// ============================================================================
// Item Status Badge
// ============================================================================

interface StatusBadgeProps {
    status: ItemStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
    status, 
    errorCode, 
    errorMessage 
}) => {
    switch (status) {
        case 'active':
            return null; // Don't show badge for active items

        case 'login_required':
            return (
                <Tooltip title={errorMessage || "Client needs to re-authenticate with their bank"}>
                    <Chip
                        icon={<LockReset />}
                        label={errorCode ? `Login Required (${errorCode})` : "Login Required"}
                        color="error"
                        size="small"
                        variant="outlined"
                    />
                </Tooltip>
            );

        case 'needs_update':
            // Show specific error code if available
            const updateLabel = errorCode 
                ? `Update Needed: ${errorCode}` 
                : "Needs Update";
            const updateTooltip = errorMessage 
                ? `${errorCode || 'Error'}: ${errorMessage}`
                : errorCode 
                    ? `Error code: ${errorCode}. Client may need to re-connect.`
                    : "Bank connection needs attention";
            return (
                <Tooltip title={updateTooltip}>
                    <Chip
                        icon={<Warning />}
                        label={updateLabel}
                        color="warning"
                        size="small"
                        variant="outlined"
                    />
                </Tooltip>
            );

        case 'error':
            return (
                <Tooltip title={errorMessage || errorCode || "An error occurred with this connection"}>
                    <Chip
                        icon={<Error />}
                        label={errorCode ? `Error: ${errorCode}` : "Error"}
                        color="error"
                        size="small"
                    />
                </Tooltip>
            );

        default:
            return null;
    }
};

// ============================================================================
// Sync Status Badge
// ============================================================================

interface SyncBadgeProps {
    hasSyncUpdates: boolean;
    lastSyncDate?: string | null;
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({ hasSyncUpdates, lastSyncDate }) => {
    if (!hasSyncUpdates) return null;

    return (
        <Tooltip title="New transactions available - click Sync to fetch">
            <Chip
                icon={<Sync />}
                label="Sync Available"
                color="info"
                size="small"
                variant="outlined"
            />
        </Tooltip>
    );
};

// ============================================================================
// Consent Expiration Badge
// ============================================================================

interface ConsentExpirationBadgeProps {
    expirationDate?: string | null;
}

export const ConsentExpirationBadge: React.FC<ConsentExpirationBadgeProps> = ({ expirationDate }) => {
    if (!expirationDate) return null;

    const expDate = new Date(expirationDate);
    const now = new Date();
    const daysUntilExpiration = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Only show if expiring within 30 days
    if (daysUntilExpiration > 30) return null;

    if (daysUntilExpiration <= 0) {
        return (
            <Tooltip title="Bank consent has expired - client needs to re-authenticate">
                <Chip
                    icon={<Error />}
                    label="Consent Expired"
                    color="error"
                    size="small"
                />
            </Tooltip>
        );
    }

    return (
        <Tooltip title={`Bank consent expires in ${daysUntilExpiration} days - send update link soon`}>
            <Chip
                icon={<Schedule />}
                label={`Expires in ${daysUntilExpiration}d`}
                color="warning"
                size="small"
                variant="outlined"
            />
        </Tooltip>
    );
};

// ============================================================================
// Account Type Badge
// ============================================================================

interface AccountTypeBadgeProps {
    accountType: string;
    accountSubtype: string | null;
}

const typeColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
    depository: 'primary',
    credit: 'warning',
    loan: 'info',
    investment: 'success',
    brokerage: 'success',
    other: 'default',
};

export const AccountTypeBadge: React.FC<AccountTypeBadgeProps> = ({ accountType, accountSubtype }) => {
    const color = typeColors[accountType] || 'default';
    const label = accountSubtype 
        ? accountSubtype.charAt(0).toUpperCase() + accountSubtype.slice(1)
        : accountType.charAt(0).toUpperCase() + accountType.slice(1);

    return (
        <Chip
            label={label}
            color={color}
            size="small"
            variant="outlined"
        />
    );
};

// ============================================================================
// New Accounts Available Badge
// ============================================================================

interface NewAccountsBadgeProps {
    hasNewAccounts: boolean;
}

export const NewAccountsBadge: React.FC<NewAccountsBadgeProps> = ({ hasNewAccounts }) => {
    if (!hasNewAccounts) return null;

    return (
        <Tooltip title="New accounts detected - send update link to add them">
            <Chip
                icon={<NewReleases />}
                label="New Accounts"
                color="info"
                size="small"
                variant="outlined"
            />
        </Tooltip>
    );
};