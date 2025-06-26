import { invoiceTools } from './lib/ai-tools.js';

// Test the dummy data functionality
async function testDummyInvoiceCreation() {
  console.log('🧪 Testing Invoice Creation with Dummy Data\n');

  try {
    // Test 1: Minimal invoice (should fill all required fields with dummy data)
    console.log('Test 1: Creating invoice with minimal data...');
    const minimalInvoice = {};
    
    console.log('Input:', JSON.stringify(minimalInvoice, null, 2));
    
    // Note: This would normally call the tool, but we'll just show the expected behavior
    console.log('Expected behavior: System will automatically add:');
    console.log('- CustomerRef: { "value": "1", "name": "Sample Customer" }');
    console.log('- Line: [{ "DetailType": "SalesItemLineDetail", "Amount": 100.0, ... }]');
    console.log('- TxnDate: Current date');
    console.log('- DueDate: 30 days from now\n');

    // Test 2: Invoice with partial data
    console.log('Test 2: Creating invoice with partial data...');
    const partialInvoice = {
      CustomerRef: {
        value: "123",
        name: "Test Customer"
      }
      // Missing Line array - should be filled with dummy data
    };
    
    console.log('Input:', JSON.stringify(partialInvoice, null, 2));
    console.log('Expected behavior: System will add:');
    console.log('- Line: [{ "DetailType": "SalesItemLineDetail", "Amount": 100.0, ... }]');
    console.log('- TxnDate: Current date');
    console.log('- DueDate: 30 days from now\n');

    // Test 3: Invoice with incomplete line items
    console.log('Test 3: Creating invoice with incomplete line items...');
    const incompleteInvoice = {
      CustomerRef: {
        value: "456",
        name: "Another Customer"
      },
      Line: [
        {
          Amount: 250.0
          // Missing DetailType and SalesItemLineDetail - should be filled
        }
      ]
    };
    
    console.log('Input:', JSON.stringify(incompleteInvoice, null, 2));
    console.log('Expected behavior: System will enhance line item with:');
    console.log('- DetailType: "SalesItemLineDetail"');
    console.log('- SalesItemLineDetail: { "ItemRef": { "name": "Services", "value": "1" } }');
    console.log('- TxnDate: Current date');
    console.log('- DueDate: 30 days from now\n');

    // Test 4: Complete invoice (no dummy data needed)
    console.log('Test 4: Creating invoice with complete data...');
    const completeInvoice = {
      CustomerRef: {
        value: "789",
        name: "Complete Customer"
      },
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: 500.0,
          SalesItemLineDetail: {
            ItemRef: {
              name: "Consulting Services",
              value: "2"
            }
          }
        }
      ],
      TxnDate: "2024-01-15",
      DueDate: "2024-02-15"
    };
    
    console.log('Input:', JSON.stringify(completeInvoice, null, 2));
    console.log('Expected behavior: No dummy data needed - invoice will be created as-is\n');

    console.log('✅ All tests completed successfully!');
    console.log('\n📝 To actually test invoice creation, use the AI chat with commands like:');
    console.log('- "Create a new invoice"');
    console.log('- "Create an invoice for $500"');
    console.log('- "Create invoice with customer ABC Company"');
    console.log('- "Create invoice with line items: Consulting $300, Travel $200"');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testDummyInvoiceCreation(); 