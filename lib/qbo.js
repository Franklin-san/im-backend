import QuickBooks from 'node-quickbooks';

// In-memory storage for runtime tokens
let runtimeTokens = {
  access_token: null,
  realm_id: null,
  refresh_token: null,
  expires_at: null
};

// Store tokens in memory
export function storeTokens(tokenData, realmId) {
  runtimeTokens = {
    access_token: tokenData.access_token,
    realm_id: realmId,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : null
  };
  console.log('✅ Tokens stored in memory for runtime use');
}

// Get stored tokens
export function getStoredTokens() {
  return runtimeTokens;
}

// Check if tokens are available and valid
export function hasValidTokens() {
  if (!runtimeTokens.access_token || !runtimeTokens.realm_id) {
    return false;
  }
  
  // Check if token is expired (with 5 minute buffer)
  if (runtimeTokens.expires_at && Date.now() > (runtimeTokens.expires_at - 300000)) {
    console.log('⚠️ Access token expired, need to refresh');
    return false;
  }
  
  return true;
}

export function getQboClient(access_token, realmId) {
  // Validate required environment variables
  if (!process.env.CLIENT_ID) {
    throw new Error('CLIENT_ID environment variable is required for QBO integration');
  }
  
  if (!process.env.CLIENT_SECRET) {
    throw new Error('CLIENT_SECRET environment variable is required for QBO integration');
  }
  
  if (!access_token) {
    throw new Error('Access token is required for QBO integration');
  }
  
  if (!realmId) {
    throw new Error('Realm ID is required for QBO integration');
  }

  // Use the correct QuickBooks constructor parameters:
  // new QuickBooks(clientId, clientSecret, accessToken, refreshToken, realmId, useSandbox, debug, minorversion, oauthversion, tokenSecret)
  return new QuickBooks(
    process.env.CLIENT_ID,           // clientId
    process.env.CLIENT_SECRET,       // clientSecret
    access_token,                    // accessToken
    false,                          // refreshToken (not using for now)
    realmId,                        // realmId
    process.env.NODE_ENV !== 'production', // useSandbox
    process.env.NODE_ENV !== 'production', // debug
    null,                           // minorversion
    '2.0',                          // oauthversion
    process.env.CLIENT_SECRET        // tokenSecret (using client secret as token secret)
  );
}

// Get QBO client using stored tokens
export function getQboClientFromStorage() {
  if (!hasValidTokens()) {
    throw new Error('No valid tokens available. Please complete OAuth flow first by visiting /auth/start');
  }
  
  return getQboClient(runtimeTokens.access_token, runtimeTokens.realm_id);
}

export function setStoredTokens(tokens) {
  runtimeTokens = tokens;
}

// export function hasValidTokens() {
//   return runtimeTokens && runtimeTokens.access_token && runtimeTokens.realm_id;
// }
