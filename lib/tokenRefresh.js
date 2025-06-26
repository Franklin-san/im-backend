import axios from 'axios';
import { getTokens, updateTokens, isTokenExpired, hasValidTokens } from './tokenStore.js';

// Refresh token using QuickBooks OAuth API
export async function refreshAccessToken() {
  try {
    const tokens = getTokens();
    
    if (!tokens.refresh_token) {
      throw new Error('No refresh token available');
    }
    
    console.log('🔄 Refreshing access token...');
    
    // Prepare refresh token request
    const refreshData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    });
    
    // Make refresh request to QuickBooks
    const response = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', refreshData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`
      }
    });
    
    const newTokens = response.data;
    
    // Validate response
    if (!newTokens.access_token) {
      throw new Error('No access token received in refresh response');
    }
    
    console.log('✅ Access token refreshed successfully');
    
    // Update stored tokens
    await updateTokens(newTokens);
    
    return newTokens;
    
  } catch (error) {
    console.error('❌ Failed to refresh access token:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      // Handle specific error cases
      if (error.response.status === 400) {
        throw new Error('Invalid refresh token - re-authentication required');
      } else if (error.response.status === 401) {
        throw new Error('Unauthorized - check client credentials');
      }
    }
    
    throw new Error(`Token refresh failed: ${error.message}`);
  }
}

// Get valid tokens with automatic refresh if needed
export async function getValidTokens() {
  try {
    // Check if we have valid tokens
    if (hasValidTokens()) {
      return getTokens();
    }
    
    // Check if token is expired and we have a refresh token
    if (isTokenExpired()) {
      const tokens = getTokens();
      if (tokens.refresh_token) {
        console.log('🔄 Token expired, attempting automatic refresh...');
        await refreshAccessToken();
        return getTokens();
      } else {
        throw new Error('Token expired and no refresh token available');
      }
    }
    
    // No tokens available
    throw new Error('No tokens available - authentication required');
    
  } catch (error) {
    console.error('❌ Failed to get valid tokens:', error.message);
    throw error;
  }
}

// Check if refresh is needed and perform it
export async function checkAndRefreshTokens() {
  try {
    const tokens = getTokens();
    
    if (!tokens.access_token) {
      return false; // No tokens to refresh
    }
    
    if (isTokenExpired() && tokens.refresh_token) {
      console.log('🔄 Performing automatic token refresh...');
      await refreshAccessToken();
      return true;
    }
    
    return false; // No refresh needed
    
  } catch (error) {
    console.error('❌ Automatic token refresh failed:', error.message);
    return false;
  }
}

// Test token refresh functionality
export async function testTokenRefresh() {
  try {
    console.log('🧪 Testing token refresh functionality...');
    
    const tokens = getTokens();
    console.log('Current token status:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      isExpired: isTokenExpired(),
      isValid: hasValidTokens()
    });
    
    if (!tokens.refresh_token) {
      console.log('⚠️ No refresh token available for testing');
      return false;
    }
    
    if (!isTokenExpired()) {
      console.log('ℹ️ Token not expired, no refresh needed');
      return true;
    }
    
    console.log('🔄 Attempting token refresh...');
    await refreshAccessToken();
    
    console.log('✅ Token refresh test completed successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Token refresh test failed:', error.message);
    return false;
  }
}

// Schedule periodic token refresh checks
export function scheduleTokenRefresh(intervalMinutes = 30) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`⏰ Scheduling token refresh checks every ${intervalMinutes} minutes`);
  
  const refreshInterval = setInterval(async () => {
    try {
      await checkAndRefreshTokens();
    } catch (error) {
      console.error('❌ Scheduled token refresh failed:', error.message);
    }
  }, intervalMs);
  
  // Return interval ID for cleanup
  return refreshInterval;
}

// Stop scheduled refresh
export function stopScheduledRefresh(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('⏹️ Stopped scheduled token refresh');
  }
} 