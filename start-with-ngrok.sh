#!/bin/bash

# Start ngrok to expose port 3000 (or 8000 if that’s your backend)
ngrok http 3000 > /dev/null &

# Wait a few seconds for ngrok to establish
sleep 5

# Print the public URL so you can use it for webhooks
curl --silent http://127.0.0.1:4040/api/tunnels | grep -o 'https://[a-z0-9]*\.ngrok-free\.app'

# Now start the server (same as npm run start)
npm run start