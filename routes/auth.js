import express from 'express';
import { getAuthorizationUri, getAccessToken, validateOAuthConfig } from '../lib/oauth.js';
import { storeTokens, hasValidTokens } from '../lib/qbo.js';

const router = express.Router();

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

    // Store tokens in memory for runtime use
    storeTokens(tokenData, realmId);

    console.log('=== QUICKBOOKS AUTHENTICATION SUCCESS ===');
    console.log('Access Token:', tokenData.access_token);
    console.log('Refresh Token:', tokenData.refresh_token);
    console.log('Realm ID:', realmId);
    console.log('Token Type:', tokenData.token_type);
    console.log('Expires In:', tokenData.expires_in);
    console.log('==========================================');

    res.send(`
      <h2>🎉 Authorization Success!</h2>
      <p>Your QuickBooks access token has been stored in memory and is ready to use!</p>
      
      <h3>✅ What's Ready:</h3>
      <ul>
        <li>✅ Access Token: Stored and ready</li>
        <li>✅ Realm ID: Stored and ready</li>
        <li>✅ QBO Client: Ready to use</li>
      </ul>
      
      <h3>🚀 Test Your Integration:</h3>
      <ul>
        <li><a href="/invoices" target="_blank">List Invoices</a></li>
        <li><a href="/auth/status" target="_blank">Check Auth Status</a></li>
      </ul>
      
      <p><strong>Note:</strong> Tokens are stored in memory and will be available until the server restarts.</p>
      <p>If you need to refresh tokens, simply visit <a href="/auth/start">/auth/start</a> again.</p>
    `);
  } catch (err) {
    console.error('Access Token Error:', err.message);
    res.status(500).json({
      error: 'Authentication failed',
      message: err.message
    });
  }
});

// Add a status endpoint to check OAuth configuration and token status
router.get('/status', (req, res) => {
  try {
    validateOAuthConfig();
    
    const tokenStatus = hasValidTokens();
    
    res.json({
      status: 'configured',
      message: 'OAuth configuration is valid',
      redirect_uri: process.env.REDIRECT_URI,
      tokens: {
        available: tokenStatus,
        message: tokenStatus ? 'Tokens are available and valid' : 'No valid tokens available. Visit /auth/start to authenticate.'
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

export default router;
