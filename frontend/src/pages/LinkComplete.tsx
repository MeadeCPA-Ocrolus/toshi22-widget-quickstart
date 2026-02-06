/**
 * Link Complete Page
 * 
 * This is a PUBLIC page (no authentication required) that clients see
 * after completing the Plaid Hosted Link flow for OAuth banks.
 * 
 * Flow:
 * 1. CPA sends Hosted Link URL to client
 * 2. Client connects bank (OAuth banks redirect through this page)
 * 3. Client sees this "success" message and closes the window
 * 
 * This page is intentionally a dead-end with no navigation.
 * Clients should NOT have access to any other part of the app.
 * 
 * @route /bank/link-complete
 */

import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const LinkComplete: React.FC = () => {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                backgroundColor: '#f5f5f5',
                padding: 3,
            }}
        >
            <Paper
                elevation={3}
                sx={{
                    padding: 5,
                    textAlign: 'center',
                    maxWidth: 450,
                    borderRadius: 2,
                }}
            >
                <CheckCircleIcon 
                    sx={{ 
                        fontSize: 64, 
                        color: '#287f43',  // Your theme green
                        marginBottom: 2,
                    }} 
                />
                
                <Typography 
                    variant="h4" 
                    component="h1" 
                    sx={{ 
                        color: '#287f43', 
                        marginBottom: 2,
                        fontWeight: 500,
                    }}
                >
                    Bank Connected Successfully
                </Typography>
                
                <Typography 
                    variant="body1" 
                    sx={{ 
                        color: '#666', 
                        marginBottom: 3,
                    }}
                >
                    Your bank account has been linked successfully. 
                    You can now close this window.
                </Typography>
                
                <Typography 
                    variant="body2" 
                    sx={{ 
                        color: '#999',
                    }}
                >
                    Your CPA will be notified automatically.
                </Typography>
            </Paper>
        </Box>
    );
};

export default LinkComplete;