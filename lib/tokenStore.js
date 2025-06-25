// lib/tokenStore.js

let tokenData = {
    access_token: null,
    realmId: null
  };
  
  function saveTokens(tokens, realmId) {
    tokenData.access_token = tokens.access_token;
    tokenData.realmId = realmId;
  }
  
  function getTokens() {
    return tokenData;
  }
  
  export { saveTokens, getTokens };
  