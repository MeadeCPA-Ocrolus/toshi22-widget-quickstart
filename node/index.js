'use strict'

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bent = require('bent')
const bodyParser = require('body-parser')
const { writeFile } = require('fs/promises')

const PORT = process.env.APP_PORT || 8000
const ENV = process.env.OCROLUS_WIDGET_ENVIRONMENT || 'production'
const OCROLUS_CLIENT_ID = process.env.OCROLUS_CLIENT_ID
const OCROLUS_CLIENT_SECRET = process.env.OCROLUS_CLIENT_SECRET
const OCROLUS_WIDGET_UUID = process.env.OCROLUS_WIDGET_UUID

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

app.post('/upload', function (request, response) {
    const sender = request.headers['x-forwarded-for']
    console.log(sender)
    console.log(request.body)
    console.log(request.body.event_name)
    console.log(request.body.event_name !== DOCUMENT_CLASSIFIED)
    if (OCROLUS_IP_ALLOWLIST.indexOf(sender) === -1) {
        console.log('ignored sender')
        return response.sendStatus(401)
    }
    // Validate that the document is ready to be downloaded
    if (request.body.event_name !== DOCUMENT_READY && request.body.event_name !== DOCUMENT_CLASSIFIED) {
        return response.json({})
    }
    console.log('Downloading file', request.body.book_uuid, request.body.mixed_uploaded_doc_uuid)

    return api_issuer('/oauth/token', {
        client_id: OCROLUS_CLIENT_ID,
        client_secret: OCROLUS_CLIENT_SECRET,
        grant_type: 'client_credentials',
    }).then(token_response => {
        console.log('Downloading document')
        console.log(token_response)
        const webhookData = request.body
        const { access_token: accessToken } = token_response

        return ocrolusBent('GET', accessToken)(
            `/v1/book/info?book_uuid=${webhookData.book_uuid}`,
            undefined
        ).then(bookQueryResp => {
            console.log(bookQueryResp)
            const bookData = bookQueryResp.response
            if (bookData.book_type != WIDGET_BOOK_TYPE) {
                return response.json({})
            }

            return downloadOcrolus(
                'GET',
                accessToken
            )(`/v2/document/download?doc_uuid=${webhookData.doc_uuid}`).then(doc => {
                console.log(doc)
                console.log('Download of file started')
                writeFile('ocrolus_document.pdf', doc)
                response.json({})
            })
        })
    })
})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

const server = app.listen(PORT, function () {
    console.log('quickstart server listening on port ' + PORT)
})
