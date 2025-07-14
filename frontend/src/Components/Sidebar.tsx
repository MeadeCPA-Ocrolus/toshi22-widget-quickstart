import { Drawer, List, ListItem, ListItemButton } from '@mui/material'

export default function Sidebar() {
    return (
        <Drawer
            sx={{
                width: 240,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: 240,
                    boxSizing: 'border-box',
                },
            }}
            variant="permanent"
            anchor="left"
        >
            <List>
                <ListItem>
                    <ListItemButton selected>Home</ListItemButton>
                </ListItem>
            </List>
        </Drawer>
    )
}