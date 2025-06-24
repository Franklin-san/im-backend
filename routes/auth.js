const express = require('express');
const router = express.Router();
const { getAuthorizationUri, getAccessToken, validateOAuthConfig } = require('../lib/oauth');

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

    console.log('=== QUICKBOOKS AUTHENTICATION SUCCESS ===');
    console.log('Access Token:', tokenData.access_token);
    console.log('Refresh Token:', tokenData.refresh_token);
    console.log('Realm ID:', realmId);
    console.log('Token Type:', tokenData.token_type);
    console.log('Expires In:', tokenData.expires_in);
    console.log('==========================================');

    res.send(`
      <h2>Authorization Success!</h2>
      <p>Your QuickBooks access token has been generated.</p>
      <p><strong>Please copy these values to your .env file:</strong></p>
      <ul>
        <li><strong>QBO_ACCESS_TOKEN:</strong> ${tokenData.access_token}</li>
        <li><strong>QBO_REALM_ID:</strong> ${realmId}</li>
      </ul>
      <p>Then restart your server to use the QuickBooks API.</p>
    `);
  } catch (err) {
    console.error('Access Token Error:', err.message);
    res.status(500).json({
      error: 'Authentication failed',
      message: err.message
    });
  }
});

// Add a status endpoint to check OAuth configuration
router.get('/status', (req, res) => {
  try {
    validateOAuthConfig();
    res.json({
      status: 'configured',
      message: 'OAuth configuration is valid',
      redirect_uri: process.env.REDIRECT_URI
    });
  } catch (error) {
    res.status(500).json({
      status: 'not_configured',
      error: error.message,
      required: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI']
    });
  }
});

module.exports = router;
