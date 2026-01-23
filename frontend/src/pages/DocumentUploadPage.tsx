/**
 * DocumentUploadPage - Ocrolus document upload (extracted from original App.tsx)
 * @module pages/DocumentUploadPage
 */

import { useEffect, useState } from 'react';
import { Box, Input, Button, FormControl, Typography, Card, CardContent, Chip, Grid, Divider, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Stack } from '@mui/material';
import { Autocomplete, TextField } from '@mui/material';
import { Upload, CheckCircle, Schedule, Error, Person, BookmarkBorder, CloudUpload, History, MenuBook, Warning } from '@mui/icons-material';

interface Book { name: string; id: number; book_uuid: string; xid: string | null; }

export const DocumentUploadPage: React.FC = () => {
    const [userKey, setUserKey] = useState('');
    const [bookName, setBookName] = useState('');
    const [widgetKey, setWidgetKey] = useState(0);
    const [bookList, setBookList] = useState<Book[]>([]);
    const [selectedBook, setSelectedBook] = useState<string>('');
    const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
    const [initializationStatus, setInitializationStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [initializedBookName, setInitializedBookName] = useState<string>('');
    const [isInitializing, setIsInitializing] = useState(false);
    const [selectedBookObject, setSelectedBookObject] = useState<Book | null>(null);

    useEffect(() => {
        async function fetchBooks() {
            try {
                const response = await fetch('/api/books');
                const data = await response.json();
                if (Array.isArray(data.response?.books)) {
                    const books = data.response.books.filter((book: any) => book.book_type === 'WIDGET').map((book: any) => ({ id: book.pk, name: book.name, book_uuid: book.book_uuid, xid: book.xid || null }));
                    setBookList(books);
                } else { setBookList([]); }
            } catch (err) { console.error('Failed to fetch books:', err); }
        }
        fetchBooks();
    }, []);

    useEffect(() => {
        const fetchWebhookLogs = async () => {
            try { const res = await fetch('/api/webhook-logs'); const data = await res.json(); setWebhookLogs(data); } catch (err) { console.error('Failed to fetch webhook logs:', err); }
        };
        fetchWebhookLogs();
        const interval = setInterval(fetchWebhookLogs, 20000);
        return () => clearInterval(interval);
    }, []);

    const getBookParams = () => {
        const selected = bookList.find(b => b.name === selectedBook);
        return selected ? { customId: selected.xid || userKey, name: selected.name } : { customId: userKey, name: bookName || 'Untitled Book' };
    };

    useEffect(() => {
        (window as any).getAuthToken = async () => {
            const { customId, name } = getBookParams();
            const res = await fetch('/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_id: customId, bookName: name }) });
            const json = await res.json();
            return json.accessToken;
        };
    }, [userKey, selectedBook, bookName, bookList]);

    const handleBookSelection = (value: string) => {
        setSelectedBook(value);
        if (value !== '') { setUserKey(''); setBookName(''); }
        setInitializationStatus('idle');
        setIsInitializing(false);
    };

    const handleGetToken = async () => {
        if (isInitializing) return;
        setIsInitializing(true);
        setInitializationStatus('idle');
        if (!(window as any).ocrolus_script) { console.warn('ocrolus_script not found'); setInitializationStatus('error'); setIsInitializing(false); return; }
        try {
            (window as any).ocrolus_script('init');
            setWidgetKey(prev => prev + 1);
            const token = await (window as any).getAuthToken();
            if (!token) throw new TypeError('No token returned from getAuthToken');
            const { name } = getBookParams();
            setInitializedBookName(name);
            setInitializationStatus('success');
        } catch (error) { console.error('Widget initialization or token validation failed:', error); setInitializationStatus('error'); }
        finally { setTimeout(() => setIsInitializing(false), 500); }
    };

    const getStatusIcon = (status: string) => {
        switch (status?.toUpperCase()) {
            case 'SUCCESS': case 'SUCCEEDED': case 'COMPLETE': case 'COMPLETED': return <CheckCircle sx={{ color: '#2e7d32', fontSize: 16 }} />;
            case 'PROCESSING': case 'PENDING': return <Schedule sx={{ color: '#f57c00', fontSize: 16 }} />;
            case 'FAILED': case 'ERROR': return <Error sx={{ color: '#c62828', fontSize: 16 }} />;
            case 'IGNORED': return <Warning sx={{ color: '#ff9800', fontSize: 16 }} />;
            default: return <CheckCircle sx={{ color: '#2e7d32', fontSize: 16 }} />;
        }
    };

    const getEventColor = (event: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
        const eventUpper = event?.toUpperCase() || '';
        if (eventUpper.includes('UPLOAD') || eventUpper.includes('DOCUMENT')) return 'primary';
        if (eventUpper.includes('COMPLETE') || eventUpper.includes('SUCCESS') || eventUpper.includes('SUCCEEDED')) return 'success';
        if (eventUpper.includes('FAIL') || eventUpper.includes('ERROR')) return 'error';
        if (eventUpper.includes('PROCESSING') || eventUpper.includes('IGNORED') || eventUpper.includes('UNSUPPORTED')) return 'warning';
        return 'default';
    };

    return (
        <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', position: 'relative', overflow: 'visible', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)', border: '1px solid rgba(224, 224, 224, 0.3)' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Stack sx={{ height: '100%' }} spacing={3}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <MenuBook sx={{ fontSize: 25, color: 'primary.main' }} />
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>Book Selection</Typography>
                                </Box>
                                <Stack spacing={3} sx={{ flex: 1, justifyContent: 'center' }}>
                                    <FormControl fullWidth size="medium">
                                        <Divider sx={{ my: 1 }}><Chip label="Selecting Existing Book" size="small" variant="outlined" /></Divider>
                                        <Autocomplete
                                            value={selectedBookObject}
                                            onChange={(event, newValue) => { setSelectedBookObject(newValue); handleBookSelection(newValue ? newValue.name : ''); }}
                                            options={bookList}
                                            getOptionLabel={(option) => option.name}
                                            renderOption={(props, option) => (
                                                <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                                    <MenuBook sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                    <Box sx={{ flex: 1 }}><Typography variant="body2">{option.name}</Typography></Box>
                                                    <Chip label={option.xid || 'No ID'} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                                                </Box>
                                            )}
                                            renderInput={(params) => <TextField {...params} placeholder="Search and select existing book..." variant="outlined" size="medium" />}
                                            noOptionsText="No books found" clearOnBlur={false} selectOnFocus handleHomeEndKeys
                                        />
                                    </FormControl>
                                    <Divider sx={{ my: 1 }}><Chip label="Or Create New Book" size="small" variant="outlined" /></Divider>
                                    <Input disableUnderline fullWidth placeholder="Client ID (required for new books)" value={userKey} onChange={(e) => setUserKey(e.target.value)} startAdornment={<InputAdornment position="start"><Person sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment>} sx={{ px: 1.5, py: 1.5, border: '1px solid', borderColor: userKey ? 'primary.main' : 'grey.300', borderRadius: 1, fontSize: '0.875rem', bgcolor: 'rgba(255, 255, 255, 0.8)', '&:hover': { borderColor: 'primary.main' } }} />
                                    <Input disableUnderline fullWidth placeholder="Book Name" value={bookName} onChange={(e) => setBookName(e.target.value)} startAdornment={<InputAdornment position="start"><BookmarkBorder sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment>} sx={{ px: 1.5, py: 1.5, border: '1px solid', borderColor: 'grey.300', borderRadius: 1, fontSize: '0.875rem', bgcolor: 'rgba(255, 255, 255, 0.8)', '&:hover': { borderColor: 'primary.main' } }} />
                                </Stack>
                                <Button variant="contained" fullWidth onClick={handleGetToken} disabled={!selectedBook && !userKey.trim()} sx={{ py: 2, fontSize: '0.875rem', fontWeight: 500 }} startIcon={<CloudUpload sx={{ fontSize: 20 }} />}>Initialize Upload Session</Button>
                                {initializationStatus !== 'idle' && (
                                    <Box sx={{ p: 2, borderRadius: 1, bgcolor: initializationStatus === 'success' ? 'rgba(46, 125, 50, 0.1)' : 'rgba(198, 40, 40, 0.1)', border: `1px solid ${initializationStatus === 'success' ? '#2e7d32' : '#c62828'}` }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {initializationStatus === 'success' ? <CheckCircle sx={{ color: '#2e7d32', fontSize: 16 }} /> : <Error sx={{ color: '#c62828', fontSize: 16 }} />}
                                            <Typography variant="body2" sx={{ color: initializationStatus === 'success' ? '#2e7d32' : '#c62828', fontWeight: 500 }}>{initializationStatus === 'success' ? `Widget successfully initialized for Book: '${initializedBookName}'` : 'Initialization failed. Reload and try again.'}</Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', position: 'relative', overflow: 'visible', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)', border: '1px solid rgba(224, 224, 224, 0.3)' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <Upload sx={{ fontSize: 25, color: 'primary.main' }} />
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>Document Upload Interface</Typography>
                            </Box>
                            <Box id="ocrolus-widget-frame" key={widgetKey} sx={{ minHeight: 400, borderRadius: 1, bgcolor: 'rgba(255, 255, 255, 0.8)' }} />
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12}>
                    <Card sx={{ backgroundColor: 'rgba(255, 255, 255, 0.93)', backdropFilter: 'blur(10px)', border: '1px solid rgba(224, 224, 224, 0.3)' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                <History sx={{ fontSize: 25, color: 'primary.main' }} />
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>Processing Activity Log</Typography>
                            </Box>
                            {webhookLogs.length === 0 ? (
                                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(245, 245, 245, 0.8)' }}>
                                    <History sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                                    <Typography variant="body1" color="text.secondary">No processing events recorded</Typography>
                                    <Typography variant="body2" color="text.disabled">Document upload and processing events will appear here</Typography>
                                </Paper>
                            ) : (
                                <TableContainer component={Paper} variant="outlined">
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
                                                <TableRow key={idx} sx={{ '&:hover': { bgcolor: 'rgba(245, 245, 245, 0.5)' } }}>
                                                    <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{getStatusIcon(log.status)}<Chip label={log.status || 'Unknown'} size="small" color={getEventColor(log.event)} variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} /></Box></TableCell>
                                                    <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{log.event}</Typography></TableCell>
                                                    <TableCell><Typography variant="body2" color="text.primary">{log.doc_uuid ? `${log.doc_uuid.substring(0, 8)}...` : 'N/A'}</Typography></TableCell>
                                                    <TableCell><Typography variant="body2">{log.book_name || 'N/A'}</Typography></TableCell>
                                                    <TableCell><Typography variant="body2" color="text.secondary">{log.owner_email || 'N/A'}</Typography></TableCell>
                                                    <TableCell><Typography variant="caption" color="text.secondary">{new Date(log.timestamp).toLocaleString()}</Typography></TableCell>
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
    );
};

export default DocumentUploadPage;
