import fetch from 'node-fetch';

async function testAI() {
  try {
    // Test the AI invoke endpoint
    const response = await fetch('http://localhost:3000/ai/invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello, can you help me with invoices?' }
        ]
      })
    });

    const result = await response.json();
    console.log('AI Invoke Response:', result);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAI(); 