import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import { Box, Typography, Fade } from '@mui/material'
import Module from 'Components/Module'

export default function IncomePrompt() {
    return (
        <Fade in timeout={800}>
          <Box>
            <Module 
              sx={{ 
                background: 'linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%)',
                textAlign: 'center',
                mb: 4
              }}
            >
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2
                }}>
                    <AccountBalanceIcon
                        sx={{ 
                          height: '80px', 
                          width: '80px',
                          color: 'primary.main',
                          filter: 'drop-shadow(0 4px 8px rgba(102, 126, 234, 0.3))'
                        }}
                    />
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        color: 'text.primary',
                        fontWeight: 600
                      }}
                    >
                      Professional Tax Document Processing
                    </Typography>
                    <Typography 
                      variant="body2" 
                      color="text.secondary"
                      sx={{ maxWidth: 400 }}
                    >
                      Streamline your tax document workflow with our integrated processing system
                    </Typography>
                </Box>
            </Module>
          </Box>
        </Fade>
    )
}