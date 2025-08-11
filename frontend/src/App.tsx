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
  Grid,
  Divider,
  InputAdornment,
  AppBar,
  Toolbar,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack
} from '@mui/material'
import {
  Add,
  Upload,
  CheckCircle,
  Schedule,
  Error,
  Person,
  BookmarkBorder,
  CloudUpload,
  History,
  Description,
  Assignment,
  MenuBook,
  Warning
} from '@mui/icons-material'

import { professionalTheme } from './theme'
import ParticlesBackground from './Components/ParticlesBackground';
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import './App.css'
 
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
  const [initializationStatus, setInitializationStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [initializedBookName, setInitializedBookName] = useState<string>('')
  const [isInitializing, setIsInitializing] = useState(false)

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
    const interval = setInterval(fetchWebhookLogs, 20000)
    return () => clearInterval(interval)
  }, [])

  const getBookParams = () => {
    const selected = bookList.find(b => b.name === selectedBook);
    return selected
      ? { customId: selected.xid || userKey, name: selected.name }
      : { customId: userKey, name: bookName || 'Untitled Book' };
  };

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

  const handleBookSelection = (value: string) => {
    setSelectedBook(value)
    if (value !== '') {
      setUserKey('')
      setBookName('')
    }
    // Reset initialization status when changing book selection
    setInitializationStatus('idle')
    setIsInitializing(false)
  }

  const handleGetToken = () => {
    if (isInitializing) return; // Prevent multiple calls
    
    setIsInitializing(true);
    setInitializationStatus('idle'); // Reset status
    
    if ((window as any).ocrolus_script) {
      try {
        (window as any).ocrolus_script('init');
        console.log('Widget reinitialized');
        setWidgetKey(prev => prev + 1);
        
        const { name } = getBookParams();
        setInitializedBookName(name);
        setInitializationStatus('success');
      } catch (error) {
        console.error('Widget initialization failed:', error);
        setInitializationStatus('error');
      }
    } else {
      console.warn('ocrolus_script not found');
      setInitializationStatus('error');
    }
    
    // Reset the flag after a short delay
    setTimeout(() => setIsInitializing(false), 500);
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'SUCCESS':
      case 'SUCCEEDED':
      case 'COMPLETE':
      case 'COMPLETED':
        return <CheckCircle sx={{ color: '#2e7d32', fontSize: 16 }} />;
      case 'PROCESSING':
      case 'PENDING':
        return <Schedule sx={{ color: '#f57c00', fontSize: 16 }} />;
      case 'FAILED':
      case 'ERROR':
        return <Error sx={{ color: '#c62828', fontSize: 16 }} />;
      case 'IGNORED':
        return <Warning sx={{ color: '#ff9800', fontSize: 16 }} />;
      default:
        return <CheckCircle sx={{ color: '#2e7d32', fontSize: 16 }} />;
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
    } else if (eventUpper.includes('IGNORED') || eventUpper.includes('UNSUPPORTED')) {
      return 'warning';
    } else {
      return 'default';
    }
  };

  return (
    <ThemeProvider theme={professionalTheme}>
      <CssBaseline />
      {/* Particles Background - positioned behind everything */}
      <ParticlesBackground />
      
      {/* Main App Container */}
      <Box sx={{ 
        position: 'relative', 
        zIndex: 1,
        minHeight: '100vh',
        backgroundColor: 'transparent' // Ensure transparency to show particles
      }}>
        {/* Professional Header */}
        <AppBar position="fixed" elevation={0} sx={{ 
          backgroundColor: 'rgba(255, 255, 255, 0.95)', // Semi-transparent to show particles
          backdropFilter: 'blur(10px)', // Glassmorphism effect
          borderBottom: '1px solid rgba(232, 231, 231, 0.47)'
        }}>
          <Toolbar variant="dense" sx={{ minHeight: 48 }}>
            <Box
              component="img"
              src="/images/tohsi_logo_png_trans_white.png"
              alt="Company Logo"
              sx={{
                height: 40,
                width: 'auto',
                mr: 2,
                objectFit: 'contain'
              }}
            />
            <Typography variant="h6" sx={{ 
              fontWeight: 600, 
              fontSize: '1.5rem',
              color: 'text.primary',
              flexGrow: 1 
            }}>
              Document Processing System
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Box sx={{ 
          pt: 7, // Back to original header padding
          px: 3,
          pb: 3,
          minHeight: '100vh',
          position: 'relative',
          backgroundColor: 'transparent' // Ensure transparency
        }}>
          <Grid container spacing={3}>
            {/* Configuration Panel */}
            <Grid item xs={12} md={6} sx={{ mt: 4 }}>
              <Card sx={{ 
                height: '100%', 
                position: 'relative', 
                overflow: 'visible',
                backgroundColor: 'rgba(255, 255, 255, 0.95)', // Semi-transparent card
                backdropFilter: 'blur(10px)', // Glassmorphism effect
                border: '1px solid rgba(224, 224, 224, 0.3)'
              }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack sx={{ height: '100%' }} spacing={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <MenuBook sx={{ fontSize: 25, color: 'primary.main' }} />
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Book Selection
                        </Typography>
                      </Box>
                    </Box>
                    <Stack spacing={3} sx={{ flex: 1, justifyContent: 'center' }}>
                      <FormControl fullWidth size="medium">
                        <Divider sx={{ my: 1 }}>
                          <Chip label="Selecting Existing Book" size="small" variant="outlined" />
                        </Divider>
                        <Select
                          value={selectedBook}
                          onChange={(e) => handleBookSelection(e.target.value)}
                          displayEmpty
                          renderValue={(selected) => {
                            if (!selected) {
                              return (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                                  Existing Client Book
                                </Typography>
                              );
                            }
                            return selected;
                          }}
                          sx={{
                            fontSize: '0.875rem',
                            '& .MuiOutlinedInput-notchedOutline': {
                              borderColor: 'grey.300', // Default border
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                              borderColor: 'primary.main', // Border on hover
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                              borderColor: 'primary.main', // Border on focus
                            }
                          }}
                        >
                          <MenuItem value="">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <MenuBook sx={{ fontSize: 16, color: 'text.secondary' }} />
                              <Typography variant="body2" color="text.secondary">Select existing book</Typography>
                            </Box>
                          </MenuItem>
                          {bookList.map((book) => (
                            <MenuItem key={book.id} value={book.name}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                <MenuBook sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="body2">{book.name}</Typography>
                                </Box>
                                <Chip 
                                  label={book.xid} 
                                  size="small" 
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Divider sx={{ my: 1 }}>
                        <Chip label="Or Create New Book" size="small" variant="outlined" />
                      </Divider>

                      <Input
                        disableUnderline
                        fullWidth
                        placeholder="Client ID (required)"
                        value={userKey}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserKey(e.target.value)}
                        startAdornment={
                          <InputAdornment position="start">
                            <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                          </InputAdornment>
                        }
                        sx={{
                          px: 1.5,
                          py: 1.5,
                          border: '1px solid',
                          borderColor: userKey ? 'primary.main' : 'grey.300',
                          borderRadius: 1,
                          fontSize: '0.875rem',
                          bgcolor: 'rgba(255, 255, 255, 0.8)',
                          '&:hover': {
                            borderColor: 'primary.main',
                          },
                          '&:focus-within': { boxShadow: 'none', outline: 'none' },
                          '& input': { outline: 'none', boxShadow: 'none' },
                          '& input:focus, & input:focus-visible': { outline: 'none', boxShadow: 'none' },
                        }}
                      />
                      
                      <Input
                        disableUnderline
                        fullWidth
                        placeholder="Book Name"
                        value={bookName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBookName(e.target.value)}
                        startAdornment={
                          <InputAdornment position="start">
                            <BookmarkBorder sx={{ fontSize: 16, color: 'text.secondary' }} />
                          </InputAdornment>
                        }
                        sx={{
                          px: 1.5,
                          py: 1.5,
                          border: '1px solid',
                          borderColor: 'grey.300',
                          borderRadius: 1,
                          fontSize: '0.875rem',
                          bgcolor: 'rgba(255, 255, 255, 0.8)',
                          '&:hover': {
                            borderColor: 'primary.main',
                          },
                          '&:focus-within': { boxShadow: 'none', outline: 'none' },
                          '& input': { outline: 'none', boxShadow: 'none' },
                          '& input:focus, & input:focus-visible': { outline: 'none', boxShadow: 'none' },
                        }}
                      />
                    </Stack>

                    <Button
                      variant="contained"
                      fullWidth
                      onClick={handleGetToken}
                      disabled={!selectedBook && !userKey.trim()}
                      sx={{
                        py: 2,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        bgcolor: 'primary.main',
                        '&:hover': {
                          bgcolor: 'primary.dark',
                        },
                        '&:disabled': {
                          bgcolor: 'grey.300',
                          color: 'grey.500',
                        }
                      }}
                      startIcon={<CloudUpload sx={{ fontSize: 20 }} />}
                    >
                      Initialize Upload Session
                    </Button>

                    {/* Initialization Status Message - Single instance */}
                    {initializationStatus !== 'idle' && (
                      <Box 
                        key={`status-${initializationStatus}-${Date.now()}`} // Force re-render with unique key
                        sx={{ 
                          p: 2, 
                          borderRadius: 1, 
                          bgcolor: initializationStatus === 'success' ? 'rgba(46, 125, 50, 0.1)' : 'rgba(198, 40, 40, 0.1)',
                          border: `1px solid ${initializationStatus === 'success' ? '#2e7d32' : '#c62828'}`
                        }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {initializationStatus === 'success' ? (
                            <CheckCircle sx={{ color: '#2e7d32', fontSize: 16 }} />
                          ) : (
                            <Error sx={{ color: '#c62828', fontSize: 16 }} />
                          )}
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: initializationStatus === 'success' ? '#2e7d32' : '#c62828',
                              fontWeight: 500
                            }}
                          >
                            {initializationStatus === 'success' 
                              ? `Widget successfully initialized for Book: '${initializedBookName}'`
                              : 'Initialization failed. Reload and try again.'
                            }
                          </Typography>
                        </Box>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Document Upload Panel */}
            <Grid item xs={12} md={6} sx={{ mt: 4 }}>
              <Card sx={{ 
                height: '100%', 
                position: 'relative', 
                overflow: 'visible',
                backgroundColor: 'rgba(255, 255, 255, 0.95)', // Semi-transparent card
                backdropFilter: 'blur(10px)', // Glassmorphism effect
                border: '1px solid rgba(224, 224, 224, 0.3)'
              }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Upload sx={{ fontSize: 25, color: 'primary.main' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Document Upload Interface
                    </Typography>
                  </Box>
                  <Box
                    id="ocrolus-widget-frame"
                    key={widgetKey}
                    sx={{
                      minHeight: 400,
                      borderRadius: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.8)',
                    }}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Activity Log */}
            <Grid item xs={12}>
              <Card sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.93)', // Semi-transparent card
                backdropFilter: 'blur(10px)', // Glassmorphism effect
                border: '1px solid rgba(224, 224, 224, 0.3)'
              }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <History sx={{ fontSize: 25, color: 'primary.main' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600}}>
                      Processing Activity Log
                    </Typography>
                  </Box>

                  {webhookLogs.length === 0 ? (
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 4, 
                        textAlign: 'center',
                        bgcolor: 'rgba(245, 245, 245, 0.8)',
                        border: '1px solid rgba(224, 224, 224, 0.5)',
                        backdropFilter: 'blur(5px)'
                      }}
                    >
                      <History sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                      <Typography variant="body1" color="text.secondary">
                        No processing events recorded
                      </Typography>
                      <Typography variant="body2" color="text.disabled">
                        Document upload and processing events will appear here
                      </Typography>
                    </Paper>
                  ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(5px)'
                    }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'rgba(245, 245, 245, 0.8)' }}>
                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Event</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Document</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Book</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Owner</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Timestamp</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {webhookLogs.map((log, idx) => (
                            <TableRow 
                              key={idx} 
                              sx={{ 
                                '&:hover': { bgcolor: 'rgba(245, 245, 245, 0.5)' },
                                '&:last-child td': { border: 0 }
                              }}
                            >
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  {getStatusIcon(log.status)}
                                  <Chip 
                                    label={log.status || 'Unknown'} 
                                    size="small" 
                                    color={getEventColor(log.event)}
                                    variant="outlined"
                                    sx={{ fontSize: '0.65rem', height: 20 }}
                                  />
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {log.event}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="text.primary">
                                  {log.doc_uuid ? `${log.doc_uuid.substring(0, 8)}...` : 'N/A'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {log.book_name || 'N/A'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="text.secondary">
                                  {log.owner_email || 'N/A'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(log.timestamp).toLocaleString()}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
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