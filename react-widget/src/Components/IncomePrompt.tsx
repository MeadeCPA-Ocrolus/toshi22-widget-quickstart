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
            <Box>
                <Box sx={{ display: 'flex', paddingLeft: '10%', paddingRight: '10%', fontSize: 'large' }}>
                    <Box>
                        You've almost finished! We just need to confirm your financials to get you a speedy
                        deicsion. To get pre approval for financing connect upload your income statements.{' '}
                    </Box>
                </Box>
            </Box>
        </Module>
    )
}
