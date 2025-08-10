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
  EventNote,
  BusinessCenter,
  Description,
  Assignment
} from '@mui/icons-material'

import { professionalTheme } from './theme'
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
  }

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
        return <CheckCircle sx={{ color: '#2e7d32', fontSize: 16 }} />;
      case 'PROCESSING':
      case 'PENDING':
        return <Schedule sx={{ color: '#f57c00', fontSize: 16 }} />;
      case 'FAILED':
      case 'ERROR':
        return <Error sx={{ color: '#c62828', fontSize: 16 }} />;
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
    } else {
      return 'default';
    }
  };

  return (
    <ThemeProvider theme={professionalTheme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, bgcolor: 'background.default' }}>
        {/* Professional Header */}
        <AppBar position="fixed" elevation={0}>
          <Toolbar variant="dense" sx={{ minHeight: 48 }}>
            {/* Replace BusinessCenter icon with your logo */}
            <Box
              component="img"
              src="https://img1.wsimg.com/isteam/ip/d51bd3c3-fbbd-490d-a10e-ec30e2b6f238/logo/adfe4ed3-f4cd-4ae4-b04c-6c47da461047.png/:/rs=h:160,cg:true,m/qt=q:95"
              alt="Company Logo"
              sx={{
                height: 36, // Adjust height as needed
                width: 'auto',
                mr: 2,
                objectFit: 'contain'
              }}
            />
            <Typography variant="h6" sx={{ 
              fontWeight: 500, 
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
          pt: 7, // Compact header spacing
          px: 3,
          pb: 3,
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}>
          <Grid container spacing={3}>
            {/* Configuration Panel */}
            <Grid item xs={12} md={6} sx={{ mt: 1.5 }}>
              <Card sx={{ height: '100%', position: 'relative', overflow: 'visible'}}>
                <Box
                  sx={{
                    position: 'absolute',
                    top: -10,
                    right: 20,
                    bgcolor: 'primary.light',
                    color: 'white',
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(21, 101, 192, 0.3)',
                    zIndex: 1
                  }}
                >
                  Step 1
                </Box>
                <CardContent sx={{ p: 3 }}>
                  <Stack sx={{ height: '100%' }} spacing={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Assignment sx={{ fontSize: 25, color: 'primary.main' }} />
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          Book Selection
                        </Typography>
                        <Typography variant="body2" color= '#bdbdbd'>
                          Choose Existing Book or Create a New Book
                        </Typography>
                      </Box>
                    </Box>
                    <Stack spacing={3} sx={{ flex: 1, justifyContent: 'center' }}>
                      <FormControl fullWidth size="medium">
                        <InputLabel sx={{ fontSize: '0.875rem'}}>
                          Existing Client Book
                        </InputLabel>
                        <Select
                          value={selectedBook}
                          label="Existing Client Book"
                          onChange={(e) => handleBookSelection(e.target.value)}
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
                              <Add sx={{ fontSize: 16, color: 'primary.main' }} />
                              <Typography variant="body2">Create New Book</Typography>
                            </Box>
                          </MenuItem>
                          {bookList.map((book) => (
                            <MenuItem key={book.id} value={book.name}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                <Description sx={{ fontSize: 16, color: 'text.secondary' }} />
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
                          bgcolor: 'background.paper',
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
                          bgcolor: 'background.paper',
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
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Document Upload Panel */}
            <Grid item xs={12} md={6} sx={{ mt: 1.5 }}>
              <Card sx={{ height: '100%', position: 'relative', overflow: 'visible'}}>
                <Box
                  sx={{
                    position: 'absolute',
                    top: -10,
                    right: 20,
                    bgcolor: 'primary.light',
                    color: 'white',
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(46, 125, 50, 0.3)',
                    zIndex: 1
                  }}
                >
                  Step 2
                </Box>
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
                        bgcolor: 'background.paper',
                      }}
                    />
                </CardContent>
              </Card>
            </Grid>

            {/* Activity Log */}
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <History sx={{ fontSize: 25, color: 'primary.main' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Processing Activity Log
                    </Typography>
                  </Box>

                  {webhookLogs.length === 0 ? (
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 4, 
                        textAlign: 'center',
                        bgcolor: 'grey.50',
                        border: '1px solid #e0e0e0'
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
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'grey.50' }}>
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
                                '&:hover': { bgcolor: 'grey.50' },
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