import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import { Box } from '@mui/material'
import Module from 'Components/Module'

export default function IncomePrompt() {
    return (
        <Module>
            <Box sx={{ display: 'flex', marginBottom: '24px' }}>
                <AccountBalanceIcon
                    sx={{ height: '100px', width: '100px', marginLeft: 'auto', marginRight: 'auto' }}
                />
            </Box>
        </Module>
    )
}
