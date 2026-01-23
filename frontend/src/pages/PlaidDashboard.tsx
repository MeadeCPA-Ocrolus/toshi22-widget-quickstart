/**
 * PlaidDashboard - Main container for Plaid pages with routing
 * @module pages/PlaidDashboard
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Typography, Container } from '@mui/material';
import { AccountBalance } from '@mui/icons-material';
import { ClientList } from './ClientList';
import { ClientDetail } from './ClientDetail';

export const PlaidDashboard: React.FC = () => {
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'transparent' }}>
            <Box sx={{ bgcolor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)', borderBottom: 1, borderColor: 'divider' }}>
                <Container maxWidth="xl">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
                        <AccountBalance sx={{ color: 'primary.main' }} />
                        <Typography variant="h6" fontWeight={600}>Bank Connections</Typography>
                    </Box>
                </Container>
            </Box>
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Routes>
                    <Route path="/" element={<ClientList />} />
                    <Route path="/clients" element={<ClientList />} />
                    <Route path="/clients/:clientId" element={<ClientDetail />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Container>
        </Box>
    );
};

export default PlaidDashboard;
