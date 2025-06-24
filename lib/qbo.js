const QuickBooks = require('node-quickbooks');

function getQboClient(access_token, realmId) {
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

  return new QuickBooks(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    access_token,
    false, // no refresh token for now
    realmId,
    process.env.NODE_ENV !== 'production', // use sandbox in non-production
    process.env.NODE_ENV !== 'production'  // enable debug logging in non-production
  );
}

module.exports = { getQboClient };
