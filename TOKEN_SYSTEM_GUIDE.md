# Enhanced Token System Guide

## Overview

The QuickBooks integration now features a robust, persistent token storage system with automatic refresh functionality. This ensures that your authentication remains active even after server restarts and automatically handles token expiration.

## Key Features

### 🔄 **Automatic Token Refresh**
- Tokens are automatically refreshed when they expire or are about to expire
- 5-minute buffer before expiration to prevent service interruptions
- Uses refresh tokens to obtain new access tokens without user intervention

### 💾 **Persistent Storage**
- Tokens are stored in `im-server/data/tokens.json`
- Survives server restarts and crashes
- Secure file-based storage with proper error handling

### ⏰ **Scheduled Refresh**
- Automatic refresh checks every 30 minutes
- Configurable refresh intervals
- Background process that doesn't interrupt user operations

### 🛡️ **Error Handling**
- Graceful handling of expired refresh tokens
- Clear error messages for authentication issues
- Fallback to re-authentication when needed

## Token Storage Structure

### File Location
```
im-server/
├── data/
│   └── tokens.json    # Persistent token storage
```

### Token Data Format
```json
{
  "access_token": "eyJ...",
  "refresh_token": "AB...",
  "realm_id": "123456789",
  "expires_at": 1703123456789,
  "token_type": "bearer",
  "scope": "com.intuit.quickbooks.accounting",
  "last_updated": "2024-01-15T10:30:00.000Z"
}
```

## API Endpoints

### Authentication Status
```http
GET /auth/status
```
**Response:**
```json
{
  "status": "configured",
  "message": "OAuth configuration is valid",
  "redirect_uri": "http://localhost:3001/auth/callback",
  "tokens": {
    "available": true,
    "message": "Tokens are available and valid",
    "info": {
      "hasTokens": true,
      "hasRefreshToken": true,
      "realmId": "123456789",
      "expiresAt": 1703123456789,
      "isExpired": false,
      "isValid": true,
      "lastUpdated": "2024-01-15T10:30:00.000Z",
      "tokenType": "bearer",
      "scope": "com.intuit.quickbooks.accounting"
    }
  },
  "autoRefresh": {
    "enabled": true,
    "interval": "30 minutes"
  }
}
```

### Detailed Token Information
```http
GET /auth/tokens
```
**Response:**
```json
{
  "success": true,
  "tokens": {
    "hasTokens": true,
    "hasRefreshToken": true,
    "realmId": "123456789",
    "expiresAt": 1703123456789,
    "isExpired": false,
    "isValid": true,
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "tokenType": "bearer",
    "scope": "com.intuit.quickbooks.accounting"
  },
  "storage": {
    "type": "Persistent file-based storage",
    "location": "im-server/data/tokens.json",
    "autoRefresh": true
  }
}
```

### Test QBO Connection
```http
GET /auth/test
```
**Response:**
```json
{
  "success": true,
  "connection": {
    "success": true,
    "companyName": "My Company",
    "realmId": "123456789",
    "message": "Connection to QuickBooks Online successful"
  },
  "message": "QBO connection test successful"
}
```

### Test Token Refresh
```http
GET /auth/test-refresh
```
**Response:**
```json
{
  "success": true,
  "message": "Token refresh test successful"
}
```

### Manual Token Refresh
```http
POST /auth/refresh
```
**Response:**
```json
{
  "success": true,
  "message": "Tokens refreshed successfully",
  "tokens": {
    "access_token": "✅ Updated",
    "refresh_token": "✅ Available",
    "expires_in": 3600
  }
}
```

### Logout (Clear Tokens)
```http
POST /auth/logout
```
**Response:**
```json
{
  "success": true,
  "message": "Tokens cleared successfully",
  "autoRefresh": "Stopped"
}
```

### Manage Auto-Refresh
```http
POST /auth/auto-refresh
Content-Type: application/json

{
  "action": "start",
  "interval": 30
}
```
**Response:**
```json
{
  "success": true,
  "message": "Auto-refresh started",
  "interval": "30 minutes"
}
```

## Token Lifecycle

### 1. Initial Authentication
1. User visits `/auth/start`
2. Redirected to QuickBooks OAuth
3. User authorizes the application
4. Redirected back to `/auth/callback`
5. Tokens are stored persistently
6. Auto-refresh is enabled

### 2. Token Usage
1. Application checks token validity
2. If valid, uses access token for API calls
3. If expired, automatically refreshes using refresh token
4. If refresh fails, prompts for re-authentication

### 3. Automatic Refresh
1. Background process checks tokens every 30 minutes
2. If token expires within 5 minutes, triggers refresh
3. New tokens are stored and used for subsequent requests
4. If refresh fails, logs error and continues with current token

### 4. Token Expiration
1. Access token expires (typically 1 hour)
2. System detects expiration (5-minute buffer)
3. Uses refresh token to get new access token
4. If refresh token is invalid, requires re-authentication

## Error Handling

### Common Error Scenarios

#### 1. Expired Refresh Token
```
❌ Failed to refresh access token: Invalid refresh token - re-authentication required
```
**Solution:** Visit `/auth/start` to re-authenticate

#### 2. Invalid Client Credentials
```
❌ Failed to refresh access token: Unauthorized - check client credentials
```
**Solution:** Verify `CLIENT_ID` and `CLIENT_SECRET` environment variables

#### 3. Network Issues
```
❌ Failed to refresh access token: Network error
```
**Solution:** Check internet connection and QuickBooks API status

#### 4. Token Storage Issues
```
❌ Failed to save tokens to file: EACCES: permission denied
```
**Solution:** Check file permissions for `im-server/data/` directory

## Configuration

### Environment Variables
```bash
CLIENT_ID=your_quickbooks_client_id
CLIENT_SECRET=your_quickbooks_client_secret
REDIRECT_URI=http://localhost:3001/auth/callback
NODE_ENV=development
```

### Auto-Refresh Settings
- **Default Interval:** 30 minutes
- **Expiration Buffer:** 5 minutes
- **Configurable:** Yes, via `/auth/auto-refresh` endpoint

## Testing

### Run Token System Tests
```bash
node test-token-system.js
```

### Manual Testing Steps
1. **Check Status:** `GET /auth/status`
2. **View Tokens:** `GET /auth/tokens`
3. **Test Connection:** `GET /auth/test`
4. **Test Refresh:** `GET /auth/test-refresh`
5. **Manual Refresh:** `POST /auth/refresh`

## Security Considerations

### Token Storage
- Tokens are stored in JSON format
- File permissions should be restricted
- Consider encryption for production environments
- Tokens are automatically cleared on logout

### Refresh Token Security
- Refresh tokens have longer expiration (typically 100 days)
- Automatically renewed during successful refreshes
- Invalidated on logout or security events
- Stored securely with access tokens

### API Security
- All endpoints validate token authenticity
- Automatic refresh prevents token exposure
- Clear error messages without sensitive data
- Proper HTTP status codes for different scenarios

## Troubleshooting

### Token Not Persisting
1. Check `im-server/data/` directory exists
2. Verify file permissions
3. Check disk space
4. Review error logs

### Auto-Refresh Not Working
1. Verify refresh token exists
2. Check network connectivity
3. Validate client credentials
4. Review refresh interval settings

### Connection Failures
1. Test with `/auth/test` endpoint
2. Check token validity
3. Verify QuickBooks API status
4. Review authentication flow

## Migration from Old System

### Automatic Migration
- Old in-memory tokens are not automatically migrated
- New authentication flow stores tokens persistently
- Existing tokens remain in memory until server restart

### Manual Migration
1. Complete new authentication flow
2. Tokens will be stored persistently
3. Auto-refresh will be enabled
4. Old tokens can be cleared

## Best Practices

### For Development
- Use sandbox environment for testing
- Monitor token expiration times
- Test refresh scenarios regularly
- Keep environment variables secure

### For Production
- Use production QuickBooks environment
- Implement proper logging
- Monitor token refresh success rates
- Set up alerts for authentication failures
- Consider implementing token encryption

### For Maintenance
- Regularly test token refresh functionality
- Monitor storage file size and permissions
- Review authentication logs
- Update client credentials as needed 