import { createTheme } from '@mui/material/styles';

export const customTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#667eea',
      light: '#94a3f7',
      dark: '#3f51b5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#764ba2',
      light: '#9c7bc7',
      dark: '#5a3a7a',
      contrastText: '#ffffff',
    },
    success: {
      main: '#4caf50',
      light: '#81c784',
      dark: '#388e3c',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
    },
    error: {
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f',
    },
    info: {
      main: '#2196f3',
      light: '#64b5f6',
      dark: '#1976d2',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a1a1a',
      secondary: '#666666',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 800,
      fontSize: '3rem',
      lineHeight: 1.2,
    },
    h2: {
      fontWeight: 700,
      fontSize: '2.5rem',
      lineHeight: 1.3,
    },
    h3: {
      fontWeight: 700,
      fontSize: '2rem',
      lineHeight: 1.3,
    },
    h4: {
      fontWeight: 700,
      fontSize: '1.75rem',
      lineHeight: 1.4,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
      fontSize: '1rem',
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0 2px 4px rgba(0,0,0,0.05)',
    '0 4px 8px rgba(0,0,0,0.08)',
    '0 8px 16px rgba(0,0,0,0.1)',
    '0 12px 24px rgba(0,0,0,0.12)',
    '0 16px 32px rgba(0,0,0,0.14)',
    '0 20px 40px rgba(0,0,0,0.16)',
    '0 24px 48px rgba(0,0,0,0.18)',
    '0 28px 56px rgba(0,0,0,0.2)',
    '0 32px 64px rgba(0,0,0,0.22)',
    '0 36px 72px rgba(0,0,0,0.24)',
    '0 40px 80px rgba(0,0,0,0.26)',
    '0 44px 88px rgba(0,0,0,0.28)',
    '0 48px 96px rgba(0,0,0,0.3)',
    '0 52px 104px rgba(0,0,0,0.32)',
    '0 56px 112px rgba(0,0,0,0.34)',
    '0 60px 120px rgba(0,0,0,0.36)',
    '0 64px 128px rgba(0,0,0,0.38)',
    '0 68px 136px rgba(0,0,0,0.4)',
    '0 72px 144px rgba(0,0,0,0.42)',
    '0 76px 152px rgba(0,0,0,0.44)',
    '0 80px 160px rgba(0,0,0,0.46)',
    '0 84px 168px rgba(0,0,0,0.48)',
    '0 88px 176px rgba(0,0,0,0.5)',
    '0 92px 184px rgba(0,0,0,0.52)',
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          minHeight: '100vh',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 600,
          padding: '12px 24px',
          fontSize: '1rem',
        },
        contained: {
          boxShadow: '0 4px 16px rgba(102, 126, 234, 0.3)',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 8px 32px rgba(102, 126, 234, 0.4)',
          },
        },
        outlined: {
          borderWidth: '2px',
          '&:hover': {
            borderWidth: '2px',
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            '& fieldset': {
              borderWidth: '2px',
            },
            '&:hover fieldset': {
              borderWidth: '2px',
            },
            '&.Mui-focused fieldset': {
              borderWidth: '2px',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

export default customTheme;