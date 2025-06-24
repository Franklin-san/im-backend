require('dotenv').config();

// Validate required environment variables
function validateOAuthConfig() {
  const required = ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please check your .env file.`);
  }
}

// Generate authorization URI manually (more reliable for QuickBooks)
function getAuthorizationUri() {
  try {
    validateOAuthConfig();
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.CLIENT_ID,
      redirect_uri: process.env.REDIRECT_URI,
      scope: 'com.intuit.quickbooks.accounting',
      state: 'testState'
    });
    
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  } catch (error) {
    console.error('Failed to generate authorization URI:', error.message);
    return null;
  }
}

// Exchange authorization code for access token
async function getAccessToken(code) {
  try {
    validateOAuthConfig();
    
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.REDIRECT_URI
      })
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
    }
    
    return await tokenResponse.json();
  } catch (error) {
    console.error('Failed to get access token:', error.message);
    throw error;
  }
}

module.exports = { 
  getAuthorizationUri,
  getAccessToken,
  validateOAuthConfig 
};
