import { useEffect, useState } from 'react'
import { Box, Input, Button, Select, MenuItem, FormControl, InputLabel } from '@mui/material'
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

  // Fetch list of books on mount
  useEffect(() => {
    async function fetchBooks() {
      try {
        const response = await fetch('/books')
        const data = await response.json()
        console.log('Fetched books:', data)

        if (Array.isArray(data.response.books)) {
          const books = data.response.books.map((book: any) => ({
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

  // Set window.getAuthToken for widget
  useEffect(() => {
    ;(window as any).getAuthToken = async () => {
      const selected = bookList.find(book => book.name === selectedBook)
      const customId = selected?.xid || userKey
      const name = bookName || selected?.name || 'Untitled Book'

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
    const customId = selected?.xid || userKey
    const name = selected?.name || bookName || 'Untitled Book'

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
      <Sidebar />
      <Box component="main" className="content-column" sx={{ flexGrow: 1, p: 3 }}>
        <IncomePrompt />
        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl style={{ marginRight: '15px', minWidth: '180px', marginBottom: '10px' }}>
            <InputLabel>Select Existing Book</InputLabel>
            <Select
              value={selectedBook}
              label="Select Existing Book"
              onChange={(e) => setSelectedBook(e.target.value)}
            >
              {bookList.map((book) => (
                <MenuItem key={book.id} value={book.name}>
                  {book.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Input
            style={{ marginRight: '15px', marginBottom: '10px' }}
            type="text"
            placeholder="Or enter new Book Name"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBookName(e.target.value)}
          />

          <Input
            style={{ marginRight: '15px', marginBottom: '10px' }}
            type="text"
            placeholder="Optional: Enter Custom ID"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserKey(e.target.value)}
          />

          <Button variant="contained" onClick={handleGetToken}>
            Get Token
          </Button>
        </Box>

        <Module>
          <Box id="ocrolus-widget-frame" key={widgetKey}></Box>
        </Module>
      </Box>
    </Box>
  )
}

export default App