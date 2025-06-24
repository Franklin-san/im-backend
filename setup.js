const fs = require('fs');
const path = require('path');

console.log('=== QuickBooks Online Setup ===\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('✅ .env file already exists');
} else {
  console.log('❌ .env file not found');
  console.log('\nPlease create a .env file with the following content:');
  console.log(`
# QuickBooks Online OAuth Configuration
CLIENT_ID=your_quickbooks_client_id_here
CLIENT_SECRET=your_quickbooks_client_secret_here
REDIRECT_URI=http://localhost:3000/auth/callback

# QuickBooks Online Access Token (obtained after OAuth flow)
QBO_ACCESS_TOKEN=your_access_token_here
QBO_REALM_ID=your_realm_id_here

# Environment
NODE_ENV=development
  `);
}

// Test OAuth configuration
console.log('\n=== Testing OAuth Configuration ===');
try {
  const { validateOAuthConfig, getAuthorizationUri } = require('./lib/oauth');
  
  // Test validation
  validateOAuthConfig();
  console.log('✅ OAuth configuration is valid');
  
  // Test authorization URI generation
  const authUri = getAuthorizationUri();
  if (authUri) {
    console.log('✅ Authorization URI generated successfully');
    console.log('🔗 Auth URI:', authUri);
  } else {
    console.log('❌ Failed to generate authorization URI');
  }
  
} catch (error) {
  console.log('❌ OAuth configuration error:', error.message);
  console.log('\nTo fix this:');
  console.log('1. Get your Client ID and Client Secret from Intuit Developer');
  console.log('2. Create a .env file with the required variables');
  console.log('3. Run this setup script again');
}

console.log('\n=== Setup Complete ===');
console.log('Next steps:');
console.log('1. Start the server: node server.js');
console.log('2. Visit: http://localhost:3000/auth/status (to check config)');
console.log('3. Visit: http://localhost:3000/auth/start (to begin OAuth flow)'); 