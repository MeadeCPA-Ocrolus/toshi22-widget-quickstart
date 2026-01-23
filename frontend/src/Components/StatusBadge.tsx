/**
 * StatusBadge Components
 * @module Components/StatusBadge
 */

import React from 'react';
import { Chip, ChipProps, Tooltip } from '@mui/material';
import { CheckCircle, Error as ErrorIcon, Warning, Refresh, AccountBalance, Lock, AccessTime, Archive } from '@mui/icons-material';
import { ItemStatus } from '../types/plaid';

interface StatusConfig {
    label: string;
    color: ChipProps['color'];
    icon: React.ReactElement;
    description: string;
    action?: string;
}

const STATUS_CONFIG: Record<ItemStatus, StatusConfig> = {
    active: { label: 'Active', color: 'success', icon: <CheckCircle sx={{ fontSize: 16 }} />, description: 'Bank connection is healthy and working' },
    login_required: { label: 'Login Required', color: 'error', icon: <Lock sx={{ fontSize: 16 }} />, description: 'Client needs to re-authenticate with their bank', action: 'Send update link to client' },
    needs_update: { label: 'Needs Update', color: 'warning', icon: <Warning sx={{ fontSize: 16 }} />, description: 'New accounts available or consent expiring soon', action: 'Send update link to add new accounts' },
    error: { label: 'Error', color: 'error', icon: <ErrorIcon sx={{ fontSize: 16 }} />, description: 'An error occurred with this bank connection', action: 'Investigate error and consider re-connecting' },
    archived: { label: 'Archived', color: 'default', icon: <Archive sx={{ fontSize: 16 }} />, description: 'Connection has been removed or revoked' },
};

interface StatusBadgeProps {
    status: ItemStatus;
    size?: 'small' | 'medium';
    showIcon?: boolean;
    showTooltip?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'small', showIcon = true, showTooltip = true }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.error;
    const chip = (
        <Chip
            label={config.label}
            color={config.color}
            size={size}
            icon={showIcon ? config.icon : undefined}
            variant="outlined"
            sx={{ fontWeight: 500, fontSize: size === 'small' ? '0.75rem' : '0.875rem', '& .MuiChip-icon': { marginLeft: '6px' } }}
        />
    );
    if (!showTooltip) return chip;
    return (
        <Tooltip title={<><strong>{config.description}</strong>{config.action && <><br /><em>Action: {config.action}</em></>}</>} arrow placement="top">
            {chip}
        </Tooltip>
    );
};

interface SyncBadgeProps {
    hasSyncUpdates: boolean;
    lastSyncDate?: string | null;
    size?: 'small' | 'medium';
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({ hasSyncUpdates, lastSyncDate, size = 'small' }) => {
    if (!hasSyncUpdates) return null;
    const tooltipText = lastSyncDate ? `New transactions available since ${new Date(lastSyncDate).toLocaleDateString()}` : 'New transactions available for sync';
    return (
        <Tooltip title={tooltipText} arrow placement="top">
            <Chip
                label="Sync Available"
                color="info"
                size={size}
                icon={<Refresh sx={{ fontSize: 16 }} />}
                variant="filled"
                sx={{ fontWeight: 500, fontSize: size === 'small' ? '0.75rem' : '0.875rem', animation: 'pulse 2s infinite', '@keyframes pulse': { '0%': { opacity: 1 }, '50%': { opacity: 0.7 }, '100%': { opacity: 1 } } }}
            />
        </Tooltip>
    );
};

interface ConsentExpirationBadgeProps {
    expirationDate: string | null;
    warningDays?: number;
    size?: 'small' | 'medium';
}

export const ConsentExpirationBadge: React.FC<ConsentExpirationBadgeProps> = ({ expirationDate, warningDays = 30, size = 'small' }) => {
    if (!expirationDate) return null;
    const expDate = new Date(expirationDate);
    const now = new Date();
    const daysUntilExpiration = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiration > warningDays) return null;

    const isExpired = daysUntilExpiration <= 0;
    const isCritical = daysUntilExpiration <= 7;
    const isWarning = daysUntilExpiration <= 14;

    let label: string;
    let color: ChipProps['color'];
    if (isExpired) { label = 'Consent Expired'; color = 'error'; }
    else if (isCritical) { label = `Expires in ${daysUntilExpiration} day${daysUntilExpiration !== 1 ? 's' : ''}`; color = 'error'; }
    else if (isWarning) { label = `Expires in ${daysUntilExpiration} days`; color = 'warning'; }
    else { label = `Expires in ${daysUntilExpiration} days`; color = 'info'; }

    return (
        <Tooltip title={`Bank consent expires on ${expDate.toLocaleDateString()}. Send an update link to renew.`} arrow placement="top">
            <Chip label={label} color={color} size={size} icon={<AccessTime sx={{ fontSize: 16 }} />} variant="outlined" sx={{ fontWeight: 500, fontSize: size === 'small' ? '0.75rem' : '0.875rem' }} />
        </Tooltip>
    );
};

interface AccountTypeBadgeProps {
    accountType: string;
    accountSubtype?: string | null;
    size?: 'small' | 'medium';
}

export const AccountTypeBadge: React.FC<AccountTypeBadgeProps> = ({ accountType, accountSubtype, size = 'small' }) => {
    const typeColors: Record<string, ChipProps['color']> = { depository: 'success', credit: 'warning', loan: 'error', investment: 'info', other: 'default' };
    const label = accountSubtype ? `${accountSubtype.charAt(0).toUpperCase()}${accountSubtype.slice(1)}` : `${accountType.charAt(0).toUpperCase()}${accountType.slice(1)}`;
    return <Chip label={label} color={typeColors[accountType] || 'default'} size={size} icon={<AccountBalance sx={{ fontSize: 14 }} />} variant="outlined" sx={{ fontWeight: 500, fontSize: size === 'small' ? '0.7rem' : '0.8rem' }} />;
};

export default StatusBadge;
