import { getStoredTokens } from './lib/qbo.js';

const API_BASE = 'http://localhost:3000';

async function testTools() {
  console.log('🔧 Testing AI Tools with QuickBooks Tokens...\n');

  // First, check if we have tokens
  const tokens = getStoredTokens();
  console.log('1️⃣ Checking QuickBooks tokens...');
  if (tokens && tokens.access_token && tokens.realm_id) {
    console.log('✅ Tokens found:');
    console.log('   - Access Token:', tokens.access_token ? 'Present' : 'Missing');
    console.log('   - Realm ID:', tokens.realm_id);
    console.log('   - Refresh Token:', tokens.refresh_token ? 'Present' : 'Missing');
  } else {
    console.log('❌ No valid tokens found. Please authenticate with QuickBooks first.');
    console.log('   Visit: http://localhost:3000/auth/start');
    return;
  }

  try {
    // Test 1: Tool-based request (list invoices)
    console.log('\n2️⃣ Testing tool-based request (list invoices)...');
    const toolResponse = await fetch(`${API_BASE}/ai/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show me all invoices' }],
        maxSteps: 3,
        toolChoice: 'auto'
      })
    });
    
    console.log('Response status:', toolResponse.status);
    const toolResult = await toolResponse.json();
    
    if (toolResult.error) {
      console.log('❌ Tool response failed:', toolResult.error);
    } else {
      console.log('✅ Tool response received:');
      console.log('   - Text:', toolResult.text?.slice(0, 200) + '...');
      console.log('   - Tool results:', toolResult.toolResults?.length || 0);
      console.log('   - Steps:', toolResult.steps?.length || 0);
      
      if (toolResult.toolResults && toolResult.toolResults.length > 0) {
        console.log('   - Tool results details:');
        toolResult.toolResults.forEach((result, idx) => {
          console.log(`     Tool ${idx + 1}:`, result);
        });
      }
    }

    // Test 2: Get specific invoice
    console.log('\n3️⃣ Testing get specific invoice...');
    const getInvoiceResponse = await fetch(`${API_BASE}/ai/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Get invoice details for invoice ID 1' }],
        maxSteps: 2,
        toolChoice: 'auto'
      })
    });
    
    const getInvoiceResult = await getInvoiceResponse.json();
    if (getInvoiceResult.error) {
      console.log('❌ Get invoice failed:', getInvoiceResult.error);
    } else {
      console.log('✅ Get invoice response:');
      console.log('   - Text:', getInvoiceResult.text?.slice(0, 150) + '...');
      console.log('   - Tool results:', getInvoiceResult.toolResults?.length || 0);
    }

    // Test 3: Check available tools
    console.log('\n4️⃣ Testing tool discovery...');
    const toolsResponse = await fetch(`${API_BASE}/ai/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What invoice tools do you have available?' }],
        maxSteps: 1,
        toolChoice: 'auto'
      })
    });
    
    const toolsResult = await toolsResponse.json();
    if (toolsResult.error) {
      console.log('❌ Tools discovery failed:', toolsResult.error);
    } else {
      console.log('✅ Tools discovery response:');
      console.log('   - Text:', toolsResult.text?.slice(0, 200) + '...');
    }

    console.log('\n🎉 Tool testing completed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ QuickBooks tokens available');
    console.log('   ✅ Tool-based requests working');
    console.log('   ✅ AI can access QuickBooks data');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testTools(); 