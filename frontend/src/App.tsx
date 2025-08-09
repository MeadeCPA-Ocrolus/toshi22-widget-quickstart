import { useEffect, useState } from 'react'
import {
  Box,
  Input,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Card,
  CardContent,
  Chip,
  Avatar,
  Grid,
  Divider,
  InputAdornment,
  AppBar,
  Toolbar
} from '@mui/material'
import {
  AccountBalance,
  Add,
  Upload,
  CheckCircle,
  Schedule,
  Error,
  Person,
  BookmarkBorder,
  CloudUpload,
  History,
  EventNote
} from '@mui/icons-material'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import IncomePrompt from 'Components/IncomePrompt'
import './App.css'
import Module from 'Components/Module'

// Light theme
const lightTheme = createTheme({
  palette: {
    primary: {
      main: '#667eea',
      light: '#94a3f7',
      dark: '#3f51b5',
    },
    secondary: {
      main: '#764ba2',
      light: '#9c7bc7',
      dark: '#5a3a7a',
    },
    success: {
      main: '#4caf50',
      light: '#81c784',
      dark: '#388e3c',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
      fontSize: '2.5rem',
    },
    h5: {
      fontWeight: 700,
      fontSize: '1.5rem',
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
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
          padding: '16px 24px',
        },
        contained: {
          boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 12px 48px rgba(102, 126, 234, 0.4)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
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
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          backdropFilter: 'blur(10px)',
        },
      },
    },
  },
})

interface Book {
  name: string
  id: number
  book_uuid: string
  xid: string | null
}

function App() {
  const [userKey, setUserKey] = useState('')
  const [bookName, setBookName] = useState('')
  const [widgetKey, setWidgetKey] = useState(0)
  const [bookList, setBookList] = useState<Book[]>([])
  const [selectedBook, setSelectedBook] = useState<string>('')
  const [webhookLogs, setWebhookLogs] = useState<any[]>([])

  useEffect(() => {
    async function fetchBooks() {
      try {
        const response = await fetch('/books')
        const data = await response.json()
        console.log('Fetched books:', data)

        if (Array.isArray(data.response.books)) {
          const books = data.response.books
            .filter((book: any) => book.book_type === 'WIDGET')
            .map((book: any) => ({
              id: book.pk,
              name: book.name,
              book_uuid: book.book_uuid,
              xid: book.xid || null,
            }))
          setBookList(books)
        } else {
          console.warn('Expected books array in data.response but got:', data.response)
          setBookList([])
        }
      } catch (err) {
        console.error('Failed to fetch books:', err)
      }
    }

    fetchBooks()
  }, [])

  // Original webhook polling implementation
  useEffect(() => {
    const fetchWebhookLogs = async () => {
      try {
        const res = await fetch('/webhook-logs')
        const data = await res.json()
        setWebhookLogs(data)
      } catch (err) {
        console.error('Failed to fetch webhook logs:', err)
      }
    }

    fetchWebhookLogs()
    const interval = setInterval(fetchWebhookLogs, 5000)
    return () => clearInterval(interval)
  }, [])

  const getBookParams = () => {
    const selected = bookList.find(b => b.name === selectedBook);
    return selected
      ? { customId: selected.xid || userKey, name: selected.name }
      : { customId: userKey, name: bookName || 'Untitled Book' };
  };

  // Global token provider for widget
  useEffect(() => {
    (window as any).getAuthToken = async () => {
      const { customId, name } = getBookParams()
      const res = await fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_id: customId,
          bookName: name,
        }),
      })
      const json = await res.json()
      return json.accessToken
    }
  }, [userKey, selectedBook, bookName, bookList])

  // Handle book selection - Clear inputs when selecting existing book
  const handleBookSelection = (value: string) => {
    setSelectedBook(value)
    
    // If user selects an existing book, clear the new book creation inputs
    if (value !== '') {
      setUserKey('')
      setBookName('')
    }
  }

  // Re-init widget
  const handleGetToken = () => {
    if ((window as any).ocrolus_script) {
      (window as any).ocrolus_script('init');
      console.log('Widget reinitialized');
      setWidgetKey(prev => prev + 1);
    } else {
      console.warn('ocrolus_script not found');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'SUCCESS':
      case 'SUCCEEDED':
      case 'COMPLETE':
      case 'COMPLETED':
        return <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} />;
      case 'PROCESSING':
      case 'PENDING':
        return <Schedule sx={{ color: '#ff9800', fontSize: 20 }} />;
      case 'FAILED':
      case 'ERROR':
        return <Error sx={{ color: '#f44336', fontSize: 20 }} />;
      default:
        return <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} />; // Default to success for unknown
    }
  };

  const getEventColor = (event: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    const eventUpper = event?.toUpperCase() || '';
    if (eventUpper.includes('UPLOAD') || eventUpper.includes('DOCUMENT')) {
      return 'primary';
    } else if (eventUpper.includes('COMPLETE') || eventUpper.includes('SUCCESS') || eventUpper.includes('SUCCEEDED')) {
      return 'success';
    } else if (eventUpper.includes('FAIL') || eventUpper.includes('ERROR')) {
      return 'error';
    } else if (eventUpper.includes('PROCESSING')) {
      return 'warning';
    } else {
      return 'info';
    }
  };

  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1 }}>
        {/* Fixed Header - Simplified without bell/user icons */}
        <AppBar position="fixed" elevation={0}>
          <Toolbar sx={{ py: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
              <Avatar sx={{ 
                bgcolor: 'white', 
                color: 'primary.main', 
                width: 48, 
                height: 48,
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
              }}>
                <AccountBalance sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h5" sx={{ color: 'white', fontWeight: 700 }}>
                  Tax Document Manager
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                  Professional Document Processing Suite
                </Typography>
              </Box>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Main Content with top margin for fixed header */}
        <Box sx={{ 
          pt: 10, // Space for fixed header
          px: 3,
          pb: 3,
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}>
          <Grid container spacing={3}>
            {/* Book Management Card */}
            <Grid item xs={12} md={6}>
              <Card 
                elevation={8}
                sx={{ 
                  height: '100%',
                  background: 'linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%)',
                  position: 'relative',
                  overflow: 'visible'
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    top: -10,
                    right: 20,
                    bgcolor: 'primary.main',
                    color: 'white',
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                  }}
                >
                  Step 1
                </Box>
                
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <Avatar sx={{ 
                      bgcolor: 'primary.main',
                      boxShadow: '0 4px 16px rgba(102, 126, 234, 0.3)'
                    }}>
                      <BookmarkBorder />
                    </Avatar>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a1a1a' }}>
                        Book Selection
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Choose existing book or create new
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <FormControl fullWidth>
                      <InputLabel>Select Existing Book</InputLabel>
                      <Select
                        value={selectedBook}
                        label="Select Existing Book"
                        onChange={(e) => handleBookSelection(e.target.value)}
                      >
                        <MenuItem value="">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Add sx={{ color: 'primary.main' }} />
                            <em>Create New Book</em>
                          </Box>
                        </MenuItem>
                        {bookList.map((book) => (
                          <MenuItem key={book.id} value={book.name}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                              <BookmarkBorder sx={{ color: 'text.secondary' }} />
                              <Box sx={{ flex: 1 }}>
                                {book.name}
                              </Box>
                              <Chip label={book.xid} size="small" variant="outlined" />
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Divider>
                      <Chip label="OR CREATE NEW" size="small" />
                    </Divider>

                    <Input
                      fullWidth
                      placeholder="Custom ID (required)"
                      value={userKey}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserKey(e.target.value)}
                      startAdornment={
                        <InputAdornment position="start">
                          <Person sx={{ color: 'text.secondary' }} />
                        </InputAdornment>
                      }
                      sx={{
                        px: 2,
                        py: 1.5,
                        border: '2px solid',
                        borderColor: userKey ? 'primary.main' : 'rgba(0,0,0,0.12)',
                        borderRadius: 3,
                        '&:hover': {
                          borderColor: 'primary.main',
                        },
                        '&.Mui-focused': {
                          borderColor: 'primary.main',
                        }
                      }}
                    />
                    
                    <Input
                      fullWidth
                      placeholder="Book Name"
                      value={bookName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBookName(e.target.value)}
                      startAdornment={
                        <InputAdornment position="start">
                          <BookmarkBorder sx={{ color: 'text.secondary' }} />
                        </InputAdornment>
                      }
                      sx={{
                        px: 2,
                        py: 1.5,
                        border: '2px solid',
                        borderColor: 'rgba(0,0,0,0.12)',
                        borderRadius: 3,
                        '&:hover': {
                          borderColor: 'primary.main',
                        },
                        '&.Mui-focused': {
                          borderColor: 'primary.main',
                        }
                      }}
                    />

                    <Button
                      variant="contained"
                      size="large"
                      fullWidth
                      onClick={handleGetToken}
                      sx={{
                        py: 2,
                        fontSize: '1.1rem',
                        fontWeight: 600,
                        background: 'linear-gradient(45deg, #667eea 30%, #764ba2 90%)',
                      }}
                      startIcon={<CloudUpload />}
                    >
                      Initialize Document Upload
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Widget Display Card */}
            <Grid item xs={12} md={6}>
              <Card 
                elevation={8}
                sx={{ 
                  height: '100%',
                  background: 'linear-gradient(145deg, #ffffff 0%, #f0f4f8 100%)',
                  position: 'relative',
                  overflow: 'visible'
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    top: -10,
                    right: 20,
                    bgcolor: 'success.main',
                    color: 'white',
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)'
                  }}
                >
                  Step 2
                </Box>

                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <Avatar sx={{ 
                      bgcolor: 'success.main',
                      boxShadow: '0 4px 16px rgba(76, 175, 80, 0.3)'
                    }}>
                      <Upload />
                    </Avatar>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a1a1a' }}>
                        Document Upload
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Ocrolus widget will load here
                      </Typography>
                    </Box>
                  </Box>

                  {/* Widget Container - Clean, no placeholder */}
                  <Box
                    id="ocrolus-widget-frame"
                    key={widgetKey}
                    sx={{
                      minHeight: 300,
                      borderRadius: 2,
                    }}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Activity Log Card */}
            <Grid item xs={12}>
              <Card 
                elevation={8}
                sx={{ 
                  background: 'linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%)'
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <Avatar sx={{ 
                      bgcolor: 'info.main',
                      boxShadow: '0 4px 16px rgba(33, 150, 243, 0.3)'
                    }}>
                      <History />
                    </Avatar>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a1a1a' }}>
                        Webhook Event Logs
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Real-time webhook events and processing status
                      </Typography>
                    </Box>
                  </Box>

                  {webhookLogs.length === 0 ? (
                    <Typography>No webhook events yet.</Typography>
                  ) : (
                    <Grid container spacing={2}>
                      {webhookLogs.map((log, idx) => (
                        <Grid item xs={12} md={6} key={idx}>
                          <Box
                            sx={{
                              p: 2,
                              border: '1px solid #ccc',
                              borderRadius: 2,
                              bgcolor: 'white',
                              boxShadow: 1,
                              transition: 'transform 0.2s, box-shadow 0.2s',
                              '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: 3
                              }
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                              {getStatusIcon(log.status)}
                              <Box sx={{ flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                                  <Chip 
                                    label={log.event} 
                                    size="small" 
                                    color={getEventColor(log.event)}
                                    icon={<EventNote />}
                                  />
                                </Box>
                                
                                <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                                  {log.event}
                                </Typography>
                                <Typography><strong>Book Name:</strong> {log.book_name || 'N/A'}</Typography>
                                <Typography><strong>Book UUID:</strong> {log.book_uuid || 'N/A'}</Typography>
                                <Typography><strong>Document Name:</strong> {log.doc_name || 'N/A'}</Typography>
                                <Typography><strong>Document UUID:</strong> {log.doc_uuid || 'N/A'}</Typography>
                                <Typography><strong>Owner Email:</strong> {log.owner_email || 'N/A'}</Typography>
                                {log.status && <Typography><strong>Status:</strong> {log.status}</Typography>}
                                {log.reason && <Typography><strong>Reason:</strong> {log.reason}</Typography>}
                                {log.file_path && <Typography><strong>Saved Path:</strong> {log.file_path}</Typography>}
                                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                                  Received at: {new Date(log.timestamp).toLocaleString()}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
