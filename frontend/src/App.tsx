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
    ;(window as any).getAuthToken = async () => {
      const selected = bookList.find(book => book.name === selectedBook)

      let customId = ''
      let name = ''

      if (selected) {
        customId = selected.xid || userKey
        name = selected.name
      } else {
        customId = userKey
        name = bookName || 'Untitled Book'
      }

      const res = await fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userKey,
          custom_id: customId,
          bookName: name,
        }),
      })

      const json = await res.json()
      return json.accessToken
    }
  }, [userKey, selectedBook, bookName, bookList])

  const handleGetToken = async () => {
    const selected = bookList.find(book => book.name === selectedBook)

    let customId = ''
    let name = ''

    if (selected) {
      customId = selected.xid || userKey
      name = selected.name
    } else {
      customId = userKey
      name = bookName || 'Untitled Book'
    }

    const res = await fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userKey,
        custom_id: customId,
        bookName: name,
      }),
    })

    const json = await res.json()
    console.log('New token acquired for:', customId)

    if ((window as any).ocrolus_script) {
      (window as any).ocrolus_script('init')
      console.log('Widget reinitialized')
    } else {
      console.warn('ocrolus_script not found')
    }

    setWidgetKey(prev => prev + 1)
  }

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
          </Module>
        </Box>
      </Box>
    </Box>
    </Box>
  )
}

export default App