// lib/tokenStore.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory for file operations
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token storage file path
const TOKEN_FILE_PATH = path.join(__dirname, '..', 'data', 'tokens.json');

// Token data structure
let tokenData = {
  access_token: null,
  refresh_token: null,
  realm_id: null,
  expires_at: null,
  token_type: null,
  scope: null,
  last_updated: null
};

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = path.dirname(TOKEN_FILE_PATH);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    console.log('📁 Created data directory for token storage');
  }
}

// Save tokens to file
export async function saveTokens(tokens, realmId) {
  try {
    await ensureDataDirectory();
    
    // Calculate expiration time
    const expiresAt = tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null;
    
    // Update token data
    tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      realm_id: realmId,
      expires_at: expiresAt,
      token_type: tokens.token_type,
      scope: tokens.scope,
      last_updated: new Date().toISOString()
    };
    
    // Save to file
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(tokenData, null, 2));
    
    console.log('✅ Tokens saved to persistent storage');
    console.log(`📅 Token expires at: ${expiresAt ? new Date(expiresAt).toLocaleString() : 'Never'}`);
    
    return tokenData;
  } catch (error) {
    console.error('❌ Failed to save tokens to file:', error.message);
    throw new Error(`Failed to save tokens: ${error.message}`);
  }
}

// Load tokens from file
export async function loadTokens() {
  try {
    await ensureDataDirectory();
    
    // Check if token file exists
    try {
      await fs.access(TOKEN_FILE_PATH);
    } catch {
      console.log('📄 No existing token file found');
      return null;
    }
    
    // Read and parse token file
    const fileContent = await fs.readFile(TOKEN_FILE_PATH, 'utf8');
    const loadedTokens = JSON.parse(fileContent);
    
    // Validate loaded tokens
    if (!loadedTokens.access_token || !loadedTokens.realm_id) {
      console.log('⚠️ Token file exists but contains invalid data');
      return null;
    }
    
    // Update in-memory token data
    tokenData = loadedTokens;
    
    console.log('✅ Tokens loaded from persistent storage');
    console.log(`📅 Token expires at: ${tokenData.expires_at ? new Date(tokenData.expires_at).toLocaleString() : 'Never'}`);
    
    return tokenData;
  } catch (error) {
    console.error('❌ Failed to load tokens from file:', error.message);
    return null;
  }
}

// Get current tokens (from memory)
export function getTokens() {
  return tokenData;
}

// Check if tokens are valid and not expired
export function hasValidTokens() {
  if (!tokenData.access_token || !tokenData.realm_id) {
    return false;
  }
  
  // Check if token is expired (with 5 minute buffer)
  if (tokenData.expires_at && Date.now() > (tokenData.expires_at - 300000)) {
    console.log('⚠️ Access token expired or will expire soon');
    return false;
  }
  
  return true;
}

// Check if token is expired (for refresh logic)
export function isTokenExpired() {
  if (!tokenData.expires_at) {
    return false; // No expiration set
  }
  
  // Consider token expired if it expires within 5 minutes
  return Date.now() > (tokenData.expires_at - 300000);
}

// Update tokens (for refresh operations)
export async function updateTokens(newTokens) {
  try {
    // Preserve existing data that might not be in new tokens
    const updatedTokens = {
      ...tokenData,
      access_token: newTokens.access_token,
      expires_at: newTokens.expires_in ? Date.now() + (newTokens.expires_in * 1000) : tokenData.expires_at,
      last_updated: new Date().toISOString()
    };
    
    // Update refresh token if provided
    if (newTokens.refresh_token) {
      updatedTokens.refresh_token = newTokens.refresh_token;
    }
    
    // Update in-memory data
    tokenData = updatedTokens;
    
    // Save to file
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(tokenData, null, 2));
    
    console.log('✅ Tokens updated and saved');
    console.log(`📅 New expiration: ${tokenData.expires_at ? new Date(tokenData.expires_at).toLocaleString() : 'Never'}`);
    
    return tokenData;
  } catch (error) {
    console.error('❌ Failed to update tokens:', error.message);
    throw new Error(`Failed to update tokens: ${error.message}`);
  }
}

// Clear tokens (for logout or reset)
export async function clearTokens() {
  try {
    // Clear in-memory data
    tokenData = {
      access_token: null,
      refresh_token: null,
      realm_id: null,
      expires_at: null,
      token_type: null,
      scope: null,
      last_updated: null
    };
    
    // Remove token file
    try {
      await fs.unlink(TOKEN_FILE_PATH);
      console.log('🗑️ Token file removed');
    } catch (fileError) {
      console.log('📄 No token file to remove');
    }
    
    console.log('✅ Tokens cleared from memory and storage');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear tokens:', error.message);
    return false;
  }
}

// Get token info for debugging
export function getTokenInfo() {
  return {
    hasTokens: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    realmId: tokenData.realm_id,
    expiresAt: tokenData.expires_at,
    isExpired: isTokenExpired(),
    isValid: hasValidTokens(),
    lastUpdated: tokenData.last_updated,
    tokenType: tokenData.token_type,
    scope: tokenData.scope
  };
}

// Initialize token storage on module load
export async function initializeTokenStorage() {
  console.log('🔄 Initializing token storage...');
  await loadTokens();
  
  if (hasValidTokens()) {
    console.log('✅ Valid tokens loaded and ready');
  } else if (tokenData.access_token) {
    console.log('⚠️ Tokens found but expired or invalid');
  } else {
    console.log('ℹ️ No tokens found - authentication required');
  }
}

// Auto-initialize when module is imported
initializeTokenStorage().catch(error => {
  console.error('❌ Failed to initialize token storage:', error.message);
});
  