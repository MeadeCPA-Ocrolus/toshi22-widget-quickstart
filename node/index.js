'use strict'

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bent = require('bent')
const bodyParser = require('body-parser')
const fs = require('fs')
const { readFile, writeFile } = require('fs/promises')

const PORT = process.env.APP_PORT || 8000
const ENV = process.env.OCROLUS_WIDGET_ENVIRONMENT || 'production'
const OCROLUS_CLIENT_ID = process.env.OCROLUS_CLIENT_ID
const OCROLUS_CLIENT_SECRET = process.env.OCROLUS_CLIENT_SECRET
const OCROLUS_WIDGET_UUID = process.env.OCROLUS_WIDGET_UUID

const DATA_DIR = './data'
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR)
}

const WEBHOOK_LOG_PATH = './data/webhook-log.json'

async function appendWebhookLog(entry) {
  try {
    let logs = []
    try {
      const content = await readFile(WEBHOOK_LOG_PATH, 'utf8')
      logs = JSON.parse(content)
    } catch (err) {
      // file doesn't exist yet
    }

    logs.push({ timestamp: new Date().toISOString(), ...entry })
    await writeFile(WEBHOOK_LOG_PATH, JSON.stringify(logs, null, 2))
  } catch (err) {
    console.error('Error appending to webhook log:', err)
  }
}

if (!OCROLUS_CLIENT_ID && !OCROLUS_CLIENT_SECRET) {
    throw Error(
        'Ocrolus client and secret undefined in env. modify .env to contain client id and secret for ocrolus widget.'
    )
}

const DOCUMENT_READY = 'document.verification_succeeded'
const DOCUMENT_CLASSIFIED = 'document.classification_succeeded'
const WIDGET_BOOK_TYPE = 'WIDGET'
const OCROLUS_API_URLS = {
    production: 'https://api.ocrolus.com',
}
const TOKEN_ISSUER_URLS = {
    production: 'https://widget.ocrolus.com',
}

const API_ISSUER_URLS = {
    production: 'https://auth.ocrolus.com',
}

const OCROLUS_IP_ALLOWLIST = [
    '18.205.30.63',
    '18.208.79.114',
    '18.213.224.210',
    '18.233.250.22',
    '35.173.140.133',
    '35.174.183.80',
    '54.164.238.206',
]

const token_issuer = TOKEN_ISSUER_URLS[ENV]
const auth_issuer = API_ISSUER_URLS[ENV]
const OCROLUS_API = OCROLUS_API_URLS[ENV]

const ocrolusBent = (method, token) =>
    bent(`${OCROLUS_API}`, method, 'json', { authorization: `Bearer ${token}` })
const downloadOcrolus = (method, token) =>
    bent(`${OCROLUS_API}`, method, 'buffer', { authorization: `Bearer ${token}` })

if (!token_issuer) {
    throw Error(`Unable to initialize environment ${ENV}. Missing Issuer URL for environment level.`)
}

const issuer = bent(token_issuer, 'POST', 'json', 200)
const api_issuer = bent(auth_issuer, 'POST', 'json', 200)

const jsonParser = bodyParser.json()

const app = express()
const path = require('path');
//app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use(express.static(path.join(__dirname, '../frontend/build')));

app.use(
    bodyParser.urlencoded({
        extended: false,
    })
)
app.use(jsonParser)
app.use(cors())

app.post('/token', function (request, response) {
    const { userId: passedUserId, bookName } = request.body

    console.log('Passed User Id', passedUserId)
    console.log('Passed Book Name', bookName)

    const finalUserId = passedUserId || 'default-user'

    return issuer(`/v1/widget/${OCROLUS_WIDGET_UUID}/token`, {
        client_id: OCROLUS_CLIENT_ID,
        client_secret: OCROLUS_CLIENT_SECRET,
        custom_id: finalUserId,
        grant_type: 'client_credentials',
        book_name: bookName || 'Widget Book',
    }).then(token_response => {
        const token = token_response.access_token
        console.log('Token Acquired for', finalUserId)
        response.json({ accessToken: token })
    }).catch(err => {
        console.error('Token Request Failed:', err)
        response.status(500).json({ error: 'Token request failed' })
    })
})

app.get('/books', async function (req, res) {
    try {
        const tokenResp = await api_issuer('/oauth/token', {
            client_id: process.env.OCROLUS_API_CLIENT_ID,
            client_secret: process.env.OCROLUS_API_CLIENT_SECRET,
            grant_type: 'client_credentials',
        })

        const getBooks = ocrolusBent('GET', tokenResp.access_token)
        const books = await getBooks('/v1/books?limit=50&order_by=created')

        res.json(books)
    } catch (err) {
        console.error('Error fetching book list:', err)
        res.status(500).json({ error: 'Failed to retrieve book list' })
    }
})

app.post('/handler', async (req, res) => {
  const event = req.body.event_name;
  const webhookData = req.body;
  const timestamp = new Date().toISOString();

  console.log('📩 Webhook received:', event);
  
  await appendWebhookLog({
    event,
    book_uuid: webhookData.book_uuid,
    doc_uuid: webhookData.doc_uuid,
    status: 'received',
    timestamp,
  });

  const allowedEvents = ['document.ready', 'document.classified', 'document.verification_succeeded'];
  
  if (!allowedEvents.includes(event)) {
    console.log('⚠️ Unhandled event, skipping');
    return res.json({ message: 'Unhandled event' });
  }

  let accessToken;
  try {
    const tokenResp = await api_issuer('/oauth/token', {
      client_id: process.env.OCROLUS_API_CLIENT_ID,
      client_secret: process.env.OCROLUS_API_CLIENT_SECRET,
      grant_type: 'client_credentials',
    });
    accessToken = tokenResp.access_token;
  } catch (err) {
    console.error('❌ Token error:', err.message || err);
    await appendWebhookLog({ event, error: 'token_error', timestamp });
    return res.status(500).json({ error: 'Token failure' });
  }

  let bookData;
  try {
    const getBookInfo = ocrolusBent('GET', accessToken);
    bookData = await getBookInfo(`/v1/book/info?book_uuid=${webhookData.book_uuid}`);
  } catch (err) {
    console.error('❌ Book info error:', err.message || err);
    await appendWebhookLog({ event, error: 'book_info_error', timestamp });
    return res.status(500).json({ error: 'Book info failure' });
  }
  //const actualBook = bookData.book || bookData;
  //bookData.book.book_type? 
  //actualBook.book_type !== 'WIDGET';
  if (bookData.book_type !== 'WIDGET') {
    console.log('📦 Skipped non-widget book');
    await appendWebhookLog({
      event,
      book_uuid: webhookData.book_uuid,
      ignored: true,
      reason: 'non-widget book',
      timestamp,
    });
    return res.json({ message: 'Ignored non-widget book' });
  }

  await appendWebhookLog({
    event,
    book_uuid: webhookData.book_uuid,
    book_name: bookData.book_name || '',
    doc_uuid: webhookData.doc_uuid || webhookData.uploaded_doc_uuid || webhookData.mixed_uploaded_doc_uuid || '',
    doc_name: webhookData.doc_name || '',
    status: 'success',
    timestamp,
  });

  res.sendStatus(200);
});

app.get('/webhook-logs', async (req, res) => {
  try {
    const content = await readFile(WEBHOOK_LOG_PATH, 'utf8');
    const logs = JSON.parse(content);

    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recentLogs = logs.filter(log => new Date(log.timestamp).getTime() >= tenMinutesAgo);

    res.json(recentLogs);
  } catch (err) {
    console.error('❌ Failed to read webhook logs:', err);
    res.json([]);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

const server = app.listen(PORT, function () {
    console.log('quickstart server listening on port ' + PORT)
})
