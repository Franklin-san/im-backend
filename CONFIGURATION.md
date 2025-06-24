# QuickBooks Online Configuration Guide

## Environment Variables Required

Create a `.env` file in the root directory with the following variables:

```env
# QuickBooks Online OAuth Configuration
CLIENT_ID=your_quickbooks_client_id_here
CLIENT_SECRET=your_quickbooks_client_secret_here
REDIRECT_URI=http://localhost:3000/auth/callback

# QuickBooks Online Access Token (obtained after OAuth flow)
QBO_ACCESS_TOKEN=your_access_token_here
QBO_REALM_ID=your_realm_id_here

# Environment
NODE_ENV=development
```

## Setup Steps

1. **Get QuickBooks Developer Credentials**:
   - Go to [Intuit Developer](https://developer.intuit.com/)
   - Create a new app or use existing one
   - Note down your Client ID and Client Secret

2. **Configure OAuth Redirect URI**:
   - In your Intuit app settings, set the redirect URI to: `http://localhost:3000/auth/callback`

3. **Get Access Token**:
   - Start the server: `node server.js`
   - Visit: `http://localhost:3000/auth/start`
   - Complete the OAuth flow
   - Copy the access token and realm ID from server logs
   - Add them to your `.env` file

4. **Test the Integration**:
   - Try accessing: `http://localhost:3000/invoices` to list invoices
   - Use the other endpoints as needed

## API Endpoints

- `GET /invoices` - List all invoices
- `GET /invoices/:id` - Get specific invoice
- `POST /invoices` - Create new invoice
- `PUT /invoices/:id` - Update invoice
- `DELETE /invoices/:id` - Delete invoice
- `POST /invoices/:id/email` - Send invoice via email

## Error Handling

The server now includes proper error handling for:
- Missing environment variables
- Invalid credentials
- QBO API errors
- Missing request data

All errors will return structured JSON responses with error details. 