import QuickBooks from 'node-quickbooks';
import { getTokens, hasValidTokens as checkValidTokens, getTokenInfo } from './tokenStore.js';
import { getValidTokens, checkAndRefreshTokens } from './tokenRefresh.js';

// Get QBO client with automatic token refresh
export async function getQboClient(access_token, realmId) {
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

// Get QBO client using stored tokens with automatic refresh
export async function getQboClientFromStorage() {
  try {
    // Get valid tokens (with automatic refresh if needed)
    const tokens = await getValidTokens();
    
    if (!tokens.access_token || !tokens.realm_id) {
      throw new Error('No valid tokens available. Please complete OAuth flow first by visiting /auth/start');
    }
    
    return getQboClient(tokens.access_token, tokens.realm_id);
    
  } catch (error) {
    console.error('❌ Failed to get QBO client:', error.message);
    throw error;
  }
}

// Legacy function for backward compatibility
export function getStoredTokens() {
  return getTokens();
}

// Enhanced function that checks token validity
export function hasValidTokens() {
  return checkValidTokens();
}

// Store tokens (legacy function - now uses persistent storage)
export async function storeTokens(tokenData, realmId) {
  try {
    const { saveTokens } = await import('./tokenStore.js');
    await saveTokens(tokenData, realmId);
    console.log('✅ Tokens stored in persistent storage');
  } catch (error) {
    console.error('❌ Failed to store tokens:', error.message);
    throw error;
  }
}

// Set stored tokens (legacy function)
export function setStoredTokens(tokens) {
  console.warn('⚠️ setStoredTokens is deprecated. Use saveTokens from tokenStore.js instead.');
  // This function is kept for backward compatibility but doesn't persist data
}

// Get token information for debugging
export function getTokenStatus() {
  return getTokenInfo();
}

// Check and refresh tokens if needed
export async function ensureValidTokens() {
  try {
    await checkAndRefreshTokens();
    return checkValidTokens();
  } catch (error) {
    console.error('❌ Failed to ensure valid tokens:', error.message);
    return false;
  }
}

// Test QBO connection with current tokens
export async function testQboConnection() {
  try {
    console.log('🧪 Testing QBO connection...');
    
    const client = await getQboClientFromStorage();
    
    return new Promise((resolve, reject) => {
      // Test with a simple API call
      client.getCompanyInfo((err, companyInfo) => {
        if (err) {
          console.error('❌ QBO connection test failed:', err.message);
          reject(new Error(`QBO connection failed: ${err.message}`));
        } else {
          console.log('✅ QBO connection test successful');
          resolve({
            success: true,
            companyName: companyInfo.CompanyName,
            realmId: companyInfo.Id,
            message: 'Connection to QuickBooks Online successful'
          });
        }
      });
    });
    
  } catch (error) {
    console.error('❌ QBO connection test failed:', error.message);
    throw error;
  }
}
