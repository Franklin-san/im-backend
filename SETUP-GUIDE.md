# QuickBooks Authentication Setup Guide

## Step 1: Create .env file

Create a `.env` file in the `im-server` directory with the following content:

```env
# QuickBooks Online OAuth Configuration
CLIENT_ID=your_quickbooks_client_id_here
CLIENT_SECRET=your_quickbooks_client_secret_here
REDIRECT_URI=http://localhost:3000/auth/callback

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Environment
NODE_ENV=development
```

## Step 2: Get QuickBooks Credentials

1. Go to [Intuit Developer](https://developer.intuit.com/)
2. Sign in with your Intuit account
3. Create a new app or use an existing one
4. Go to "Keys" section
5. Copy your `Client ID` and `Client Secret`
6. Add `http://localhost:3000/auth/callback` to your app's redirect URIs

## Step 3: Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in and create a new API key
3. Copy the API key

## Step 4: Update .env file

Replace the placeholder values in your `.env` file with your actual credentials.

## Step 5: Authenticate with QuickBooks

1. Start your server: `npm run dev`
2. Visit: `http://localhost:3000/auth/start`
3. Complete the OAuth flow
4. You'll be redirected back with success message

## Step 6: Test AI Tools

After authentication, test the tools:

```bash
node test-tools.js
```

Or use the frontend chat to ask:
- "Show me all invoices"
- "Get invoice details for invoice ID 1"
- "Create an invoice for John Doe"

## Troubleshooting

- If you get "No valid tokens found", make sure you completed the OAuth flow
- If you get "Missing credentials", check your `.env` file
- If OAuth fails, verify your redirect URI matches exactly 