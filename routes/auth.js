import express from 'express';
import { getAuthorizationUri, getAccessToken, validateOAuthConfig } from '../lib/oauth.js';
import { storeTokens, hasValidTokens, getTokenStatus, testQboConnection } from '../lib/qbo.js';
import { clearTokens, getTokenInfo } from '../lib/tokenStore.js';
import { testTokenRefresh, scheduleTokenRefresh, stopScheduledRefresh } from '../lib/tokenRefresh.js';

const router = express.Router();

// Global variable to track refresh interval
let refreshIntervalId = null;

router.get('/start', (req, res) => {
  try {
    const authorizationUri = getAuthorizationUri();
    
    if (!authorizationUri) {
      return res.status(500).json({
        error: 'OAuth configuration error',
        message: 'Unable to generate authorization URI. Please check your environment variables.',
        required: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI']
      });
    }
    
    console.log('Redirecting to authorization URI:', authorizationUri);
    res.redirect(authorizationUri);
  } catch (error) {
    console.error('Auth start error:', error);
    res.status(500).json({
      error: 'OAuth configuration error',
      message: error.message
    });
  }
});

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  const realmId = req.query.realmId;

  if (!code) {
    return res.status(400).json({
      error: 'Authorization code missing',
      message: 'No authorization code received from QuickBooks'
    });
  }

  try {
    const tokenData = await getAccessToken(code);

    // Store tokens in persistent storage
    await storeTokens(tokenData, realmId);

    // Start automatic token refresh scheduling
    if (refreshIntervalId) {
      stopScheduledRefresh(refreshIntervalId);
    }
    refreshIntervalId = scheduleTokenRefresh(30); // Check every 30 minutes

    console.log('=== QUICKBOOKS AUTHENTICATION SUCCESS ===');
    console.log('Access Token:', tokenData.access_token ? '✅ Stored' : '❌ Missing');
    console.log('Refresh Token:', tokenData.refresh_token ? '✅ Stored' : '❌ Missing');
    console.log('Realm ID:', realmId);
    console.log('Token Type:', tokenData.token_type);
    console.log('Expires In:', tokenData.expires_in ? `${tokenData.expires_in} seconds` : 'Never');
    console.log('Storage: Persistent file-based storage');
    console.log('Auto-refresh: Enabled (every 30 minutes)');
    console.log('==========================================');

    res.send(`
      <h2>🎉 Authorization Success!</h2>
      <p>Your QuickBooks access token has been stored persistently and is ready to use!</p>
      
      <h3>✅ What's Ready:</h3>
      <ul>
        <li>✅ Access Token: Stored persistently</li>
        <li>✅ Refresh Token: Stored for automatic renewal</li>
        <li>✅ Realm ID: Stored and ready</li>
        <li>✅ Auto-refresh: Enabled (every 30 minutes)</li>
        <li>✅ QBO Client: Ready to use</li>
      </ul>
      
      <h3>🚀 Test Your Integration:</h3>
      <ul>
        <li><a href="/invoices" target="_blank">List Invoices</a></li>
        <li><a href="/auth/status" target="_blank">Check Auth Status</a></li>
        <li><a href="/auth/test" target="_blank">Test Connection</a></li>
        <li><a href="/auth/tokens" target="_blank">View Token Info</a></li>
      </ul>
      
      <h3>💾 Storage Information:</h3>
      <ul>
        <li>📁 Location: <code>im-server/data/tokens.json</code></li>
        <li>🔄 Auto-refresh: Every 30 minutes</li>
        <li>⏰ Expiration: ${tokenData.expires_in ? `${Math.round(tokenData.expires_in / 3600)} hours` : 'Never'}</li>
        <li>💾 Persistence: Survives server restarts</li>
      </ul>
      
      <p><strong>Note:</strong> Tokens are now stored persistently and will survive server restarts. 
      Automatic refresh is enabled to keep your connection active.</p>
    `);
  } catch (err) {
    console.error('Access Token Error:', err.message);
    res.status(500).json({
      error: 'Authentication failed',
      message: err.message
    });
  }
});

// Enhanced status endpoint with token information
router.get('/status', async (req, res) => {
  try {
    validateOAuthConfig();
    
    const tokenStatus = hasValidTokens();
    const tokenInfo = getTokenInfo();
    
    res.json({
      status: 'configured',
      message: 'OAuth configuration is valid',
      redirect_uri: process.env.REDIRECT_URI,
      tokens: {
        available: tokenStatus,
        message: tokenStatus ? 'Tokens are available and valid' : 'No valid tokens available. Visit /auth/start to authenticate.',
        info: tokenInfo
      },
      autoRefresh: {
        enabled: !!refreshIntervalId,
        interval: '30 minutes'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'not_configured',
      error: error.message,
      required: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI']
    });
  }
});

// New endpoint to view detailed token information
router.get('/tokens', async (req, res) => {
  try {
    const tokenInfo = getTokenInfo();
    
    res.json({
      success: true,
      tokens: tokenInfo,
      storage: {
        type: 'Persistent file-based storage',
        location: 'im-server/data/tokens.json',
        autoRefresh: !!refreshIntervalId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// New endpoint to test QBO connection
router.get('/test', async (req, res) => {
  try {
    const connectionResult = await testQboConnection();
    
    res.json({
      success: true,
      connection: connectionResult,
      message: 'QBO connection test successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'QBO connection test failed'
    });
  }
});

// New endpoint to test token refresh
router.get('/test-refresh', async (req, res) => {
  try {
    const refreshResult = await testTokenRefresh();
    
    res.json({
      success: refreshResult,
      message: refreshResult ? 'Token refresh test successful' : 'Token refresh test failed or not needed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Token refresh test failed'
    });
  }
});

// New endpoint to manually refresh tokens
router.post('/refresh', async (req, res) => {
  try {
    const { refreshAccessToken } = await import('../lib/tokenRefresh.js');
    const newTokens = await refreshAccessToken();
    
    res.json({
      success: true,
      message: 'Tokens refreshed successfully',
      tokens: {
        access_token: newTokens.access_token ? '✅ Updated' : '❌ Missing',
        refresh_token: newTokens.refresh_token ? '✅ Available' : '❌ Missing',
        expires_in: newTokens.expires_in
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Token refresh failed'
    });
  }
});

// New endpoint to clear tokens (logout)
router.post('/logout', async (req, res) => {
  try {
    // Stop auto-refresh
    if (refreshIntervalId) {
      stopScheduledRefresh(refreshIntervalId);
      refreshIntervalId = null;
    }
    
    // Clear tokens
    const cleared = await clearTokens();
    
    res.json({
      success: cleared,
      message: cleared ? 'Tokens cleared successfully' : 'Failed to clear tokens',
      autoRefresh: 'Stopped'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Logout failed'
    });
  }
});

// New endpoint to manage auto-refresh
router.post('/auto-refresh', (req, res) => {
  try {
    const { action, interval } = req.body;
    
    if (action === 'start') {
      if (refreshIntervalId) {
        stopScheduledRefresh(refreshIntervalId);
      }
      refreshIntervalId = scheduleTokenRefresh(interval || 30);
      
      res.json({
        success: true,
        message: 'Auto-refresh started',
        interval: `${interval || 30} minutes`
      });
    } else if (action === 'stop') {
      if (refreshIntervalId) {
        stopScheduledRefresh(refreshIntervalId);
        refreshIntervalId = null;
      }
      
      res.json({
        success: true,
        message: 'Auto-refresh stopped'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid action. Use "start" or "stop"'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
