import { PropsWithChildren } from 'react'
import { Card } from '@mui/material'

interface ModuleProps extends PropsWithChildren {
  elevation?: number;
  sx?: any;
}

export default function Module({ children, elevation = 3, sx = {} }: ModuleProps) {
    return (
      <Card 
        elevation={elevation}
        sx={{
          padding: '24px',
          borderRadius: 3,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          },
          ...sx
        }}
      >
        {children}
      </Card>
    )
}