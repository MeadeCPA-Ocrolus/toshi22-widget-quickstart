/**
 * Main App Component - with routing for Document Upload and Bank Connections
 * REPLACE your existing src/App.tsx with this file
 */

import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link as RouterLink, useLocation, Navigate } from 'react-router-dom';
import { Box, Button, Typography, Card, AppBar, Toolbar, Avatar, Menu, MenuItem as MenuItemComponent, IconButton, Tabs, Tab } from '@mui/material';
import { AccountCircle, ExitToApp, CloudUpload, AccountBalance } from '@mui/icons-material';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import { professionalTheme } from './theme';
import ParticlesBackground from './Components/ParticlesBackground';
import DocumentUploadPage from './pages/DocumentUploadPage';
import { PlaidDashboard } from './pages/PlaidDashboard';
import './App.css';

interface UserInfo { userId: string; userDetails: string; userRoles: string[]; claims: any[]; }

interface NavigationProps { userInfo: UserInfo | null; onLogout: () => void; }

const Navigation: React.FC<NavigationProps> = ({ userInfo, onLogout }) => {
    const location = useLocation();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleMenuClose = () => setAnchorEl(null);
    const getActiveTab = () => location.pathname.startsWith('/bank') ? 1 : 0;

    return (
        <AppBar position="fixed" elevation={0} sx={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(232, 231, 231, 0.47)' }}>
            <Toolbar variant="dense" sx={{ minHeight: 48 }}>
                <Box component="img" src="/images/tohsi_logo_png_trans_white.png" alt="Company Logo" sx={{ height: 40, width: 'auto', mr: 2, objectFit: 'contain' }} />
                <Typography variant="h6" sx={{ fontFamily: '"Inter", sans-serif', fontWeight: 600, fontSize: '1.25rem', color: 'text.primary', mr: 4 }}>Meade CPA</Typography>
                <Tabs value={getActiveTab()} sx={{ flex: 1, '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 500 } }}>
                    <Tab icon={<CloudUpload sx={{ fontSize: 20 }} />} iconPosition="start" label="Document Upload" component={RouterLink} to="/" />
                    <Tab icon={<AccountBalance sx={{ fontSize: 20 }} />} iconPosition="start" label="Bank Connections" component={RouterLink} to="/bank" />
                </Tabs>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">{userInfo?.userDetails}</Typography>
                    <IconButton onClick={handleMenuOpen} sx={{ p: 0 }}><Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}><AccountCircle /></Avatar></IconButton>
                    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                        <MenuItemComponent onClick={onLogout}><ExitToApp sx={{ mr: 1 }} />Sign Out</MenuItemComponent>
                    </Menu>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

function App() {
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { checkAuthStatus(); }, []);

    const checkAuthStatus = async () => {
        try {
            const response = await fetch('/.auth/me');
            if (response.ok) {
                const authData = await response.json();
                if (authData.clientPrincipal) { setUserInfo(authData.clientPrincipal); setIsAuthenticated(true); }
            }
        } catch (error) { console.error('Auth check failed:', error); }
        finally { setIsLoading(false); }
    };

    const handleLogin = () => { window.location.href = '/.auth/login/aad'; };
    const handleLogout = () => { window.location.href = '/.auth/logout'; };

    if (isLoading) {
        return (
            <ThemeProvider theme={professionalTheme}>
                <CssBaseline />
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
                    <Typography variant="h6">Loading...</Typography>
                </Box>
            </ThemeProvider>
        );
    }

    if (!isAuthenticated) {
        return (
            <ThemeProvider theme={professionalTheme}>
                <CssBaseline />
                <ParticlesBackground />
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
                    <Card sx={{ p: 4, maxWidth: 400, width: '100%', textAlign: 'center', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)' }}>
                        <Typography variant="h4" gutterBottom>Meade CPA Portal</Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>Please sign in with your Microsoft account to continue</Typography>
                        <Button variant="contained" fullWidth onClick={handleLogin} startIcon={<AccountCircle />} sx={{ py: 1.5 }}>Sign in with Microsoft</Button>
                    </Card>
                </Box>
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider theme={professionalTheme}>
            <CssBaseline />
            <Router>
                <ParticlesBackground />
                <Box sx={{ position: 'relative', zIndex: 1, minHeight: '100vh', backgroundColor: 'transparent' }}>
                    <Navigation userInfo={userInfo} onLogout={handleLogout} />
                    <Box sx={{ pt: 7, minHeight: '100vh', backgroundColor: 'transparent' }}>
                        <Routes>
                            <Route path="/" element={<DocumentUploadPage />} />
                            <Route path="/bank/*" element={<PlaidDashboard />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Box>
                </Box>
            </Router>
        </ThemeProvider>
    );
}

export default App;
