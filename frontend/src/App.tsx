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
} from '@mui/material'
import Sidebar from 'Components/Sidebar'
import IncomePrompt from 'Components/IncomePrompt'
import './App.css'
import Module from 'Components/Module'

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

  return (
    <Box sx={{ display: 'flex' }}>
      <Box component="main" className="content-column" sx={{ flexGrow: 1, p: 3 }}>
      <IncomePrompt />

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Book Selection Card */}
        <Box
          sx={{
            flex: 1,
            minWidth: 340,
            padding: 3,
            border: '1px solid #ddd',
            borderRadius: 2,
            boxShadow: 1,
            backgroundColor: '#fafafa',
          }}
        >
          <Typography variant="h6" sx={{ mb: 2 }}>
            Choose an existing book or create a new one
          </Typography>
          <FormControl fullWidth variant="outlined">
            <InputLabel id="existing-book-label">Existing Book</InputLabel>
            <Select
              labelId="existing-book-label"
              value={selectedBook}
              label="Existing Book"
              onChange={(e) => setSelectedBook(e.target.value)}
            >
              <MenuItem value="">
                <em>-- Create New Book --</em>
              </MenuItem>
              {bookList.map((book) => (
                <MenuItem key={book.id} value={book.name}>
                  {book.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Input
            fullWidth
            placeholder="Custom ID (required)"
            value={userKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserKey(e.target.value)}
          />
          <Input
            fullWidth
            placeholder="Book Name"
            value={bookName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBookName(e.target.value)}
            sx={{ mb: 2 }}
          />

        <Button variant="contained" fullWidth onClick={handleGetToken}>
          Initialize Token
        </Button>
      </Box>

        {/* Widget Display */}
        <Box
          sx={{
            flex: 1,
            minWidth: 340,
            padding: 3,
            border: '1px solid #ddd',
            borderRadius: 2,
            boxShadow: 1,
            backgroundColor: '#fff',
          }}
        >
          <Module>
            <Box id="ocrolus-widget-frame" key={widgetKey}></Box>
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6">Webhook Event Logs</Typography>

              {webhookLogs.length === 0 ? (
                <Typography>No webhook events yet.</Typography>
              ) : (
                webhookLogs.map((log, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      mt: 1,
                      p: 2,
                      border: '1px solid #ccc',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{log.event}</Typography>
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
                ))
              )}
            </Box>
          </Module>
        </Box>
      </Box>
    </Box>
    </Box>
  )
}

export default App
