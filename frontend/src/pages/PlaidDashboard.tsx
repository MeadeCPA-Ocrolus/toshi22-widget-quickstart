/**
 * PlaidDashboard - Main container for Plaid pages with routing
 * @module pages/PlaidDashboard
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Container } from '@mui/material';
import { ClientList } from './ClientList';
import { ClientDetail } from './ClientDetail';

export const PlaidDashboard: React.FC = () => {
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'transparent' }}>
            {/* Removed the redundant "Bank Connections" sub-header - 
                the main Navigation tabs already show which section we're in */}
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
