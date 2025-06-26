import { getTokenInfo, loadTokens, clearTokens } from './lib/tokenStore.js';
import { testTokenRefresh, checkAndRefreshTokens, getValidTokens } from './lib/tokenRefresh.js';
import { testQboConnection, getTokenStatus } from './lib/qbo.js';

// Test the new token system
async function testTokenSystem() {
  console.log('🧪 Testing Enhanced Token System\n');

  try {
    // Test 1: Check current token status
    console.log('Test 1: Checking current token status...');
    const tokenInfo = getTokenInfo();
    console.log('Token Status:', JSON.stringify(tokenInfo, null, 2));
    console.log('');

    // Test 2: Load tokens from persistent storage
    console.log('Test 2: Loading tokens from persistent storage...');
    const loadedTokens = await loadTokens();
    if (loadedTokens) {
      console.log('✅ Tokens loaded successfully');
      console.log(`📅 Expires at: ${loadedTokens.expires_at ? new Date(loadedTokens.expires_at).toLocaleString() : 'Never'}`);
    } else {
      console.log('ℹ️ No tokens found in persistent storage');
    }
    console.log('');

    // Test 3: Test token refresh functionality
    console.log('Test 3: Testing token refresh functionality...');
    const refreshResult = await testTokenRefresh();
    console.log(`Refresh test result: ${refreshResult ? '✅ Success' : '❌ Failed or not needed'}`);
    console.log('');

    // Test 4: Check if refresh is needed
    console.log('Test 4: Checking if token refresh is needed...');
    const refreshNeeded = await checkAndRefreshTokens();
    console.log(`Refresh needed: ${refreshNeeded ? '✅ Yes, refreshed' : '❌ No, not needed'}`);
    console.log('');

    // Test 5: Test QBO connection
    console.log('Test 5: Testing QBO connection...');
    try {
      const connectionResult = await testQboConnection();
      console.log('✅ QBO connection successful');
      console.log('Company:', connectionResult.companyName);
      console.log('Realm ID:', connectionResult.realmId);
    } catch (error) {
      console.log('❌ QBO connection failed:', error.message);
    }
    console.log('');

    // Test 6: Get detailed token status
    console.log('Test 6: Getting detailed token status...');
    const detailedStatus = getTokenStatus();
    console.log('Detailed Status:', JSON.stringify(detailedStatus, null, 2));
    console.log('');

    console.log('✅ All token system tests completed!');
    console.log('\n📝 Available endpoints for testing:');
    console.log('- GET /auth/status - Check authentication status');
    console.log('- GET /auth/tokens - View detailed token information');
    console.log('- GET /auth/test - Test QBO connection');
    console.log('- GET /auth/test-refresh - Test token refresh');
    console.log('- POST /auth/refresh - Manually refresh tokens');
    console.log('- POST /auth/logout - Clear tokens');
    console.log('- POST /auth/auto-refresh - Manage auto-refresh');

  } catch (error) {
    console.error('❌ Token system test failed:', error.message);
  }
}

// Test token clearing (commented out to avoid accidentally clearing tokens)
async function testTokenClearing() {
  console.log('\n🧪 Testing Token Clearing (DISABLED)');
  console.log('Uncomment the following line to test token clearing:');
  console.log('// await clearTokens();');
  console.log('This would clear all stored tokens and require re-authentication.');
}

// Run the tests
testTokenSystem();
testTokenClearing(); 