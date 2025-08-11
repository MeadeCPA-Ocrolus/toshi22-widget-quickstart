import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Avatar, Box, Typography, Divider } from '@mui/material'
import { Home, Assessment, People, Settings, AccountBalance } from '@mui/icons-material'

export default function Sidebar() {
    return (
        <Drawer
            sx={{
                width: 280,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: 280,
                    boxSizing: 'border-box',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%)',
                    color: 'white',
                    boxShadow: '4px 0 16px rgba(0,0,0,0.3)',
                    borderRight: '1px solid #333',
                },
            }}
            variant="permanent"
            anchor="left"
        >
            {/* Header */}
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Avatar sx={{ 
                    bgcolor: 'rgba(144, 202, 249, 0.2)', 
                    width: 64, 
                    height: 64,
                    mx: 'auto',
                    mb: 2,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    border: '1px solid rgba(144, 202, 249, 0.3)'
                }}>
                    <AccountBalance sx={{ fontSize: 32, color: '#90caf9' }} />
                </Avatar>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'white' }}>
                    Tax Pro Suite
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7, color: 'text.secondary' }}>
                    Document Management
                </Typography>
            </Box>

            <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)', mx: 2 }} />

            {/* Navigation */}
            <List sx={{ px: 2, pt: 2 }}>
                <ListItem disablePadding sx={{ mb: 1 }}>
                    <ListItemButton 
                        selected 
                        sx={{
                            borderRadius: 2,
                            '&.Mui-selected': {
                                bgcolor: 'rgba(144, 202, 249, 0.15)',
                                border: '1px solid rgba(144, 202, 249, 0.3)',
                                '&:hover': {
                                    bgcolor: 'rgba(144, 202, 249, 0.25)',
                                },
                            },
                            '&:hover': {
                                bgcolor: 'rgba(255,255,255,0.05)',
                            },
                        }}
                    >
                        <ListItemIcon sx={{ color: '#90caf9', minWidth: 40 }}>
                            <Home />
                        </ListItemIcon>
                        <ListItemText 
                            primary="Dashboard" 
                            primaryTypographyProps={{ fontWeight: 600, color: 'white' }}
                        />
                    </ListItemButton>
                </ListItem>

                <ListItem disablePadding sx={{ mb: 1 }}>
                    <ListItemButton sx={{
                        borderRadius: 2,
                        '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.05)',
                        },
                    }}>
                        <ListItemIcon sx={{ color: 'rgba(255,255,255,0.7)', minWidth: 40 }}>
                            <Assessment />
                        </ListItemIcon>
                        <ListItemText 
                            primary="Reports" 
                            primaryTypographyProps={{ fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}
                        />
                    </ListItemButton>
                </ListItem>

                <ListItem disablePadding sx={{ mb: 1 }}>
                    <ListItemButton sx={{
                        borderRadius: 2,
                        '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.05)',
                        },
                    }}>
                        <ListItemIcon sx={{ color: 'rgba(255,255,255,0.7)', minWidth: 40 }}>
                            <People />
                        </ListItemIcon>
                        <ListItemText 
                            primary="Clients" 
                            primaryTypographyProps={{ fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}
                        />
                    </ListItemButton>
                </ListItem>

                <ListItem disablePadding sx={{ mb: 1 }}>
                    <ListItemButton sx={{
                        borderRadius: 2,
                        '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.05)',
                        },
                    }}>
                        <ListItemIcon sx={{ color: 'rgba(255,255,255,0.7)', minWidth: 40 }}>
                            <Settings />
                        </ListItemIcon>
                        <ListItemText 
                            primary="Settings" 
                            primaryTypographyProps={{ fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}
                        />
                    </ListItemButton>
                </ListItem>
            </List>
        </Drawer>
    )
}