// Test script to simulate the complete update flow
import { invoiceTools } from './lib/ai-tools.js';

// Get the updateInvoice tool from the invoiceTools object
const updateInvoice = invoiceTools.updateInvoice;

// Mock QBO client for testing
const mockQboClient = {
  getInvoice: (id, callback) => {
    console.log(`🔍 Fetching invoice ${id}...`);
    const currentInvoice = {
      Id: id,
      SyncToken: "1",
      DocNumber: "TEST-001",
      TotalAmt: 100.0,
      DueDate: "2024-01-15",
      CustomerRef: { value: "1", name: "Test Customer" },
      Balance: 100.0
    };
    callback(null, currentInvoice);
  },
  updateInvoice: (payload, callback) => {
    console.log(`📝 Updating invoice with payload:`, payload);
    const updatedInvoice = {
      ...payload,
      SyncToken: "2",
      DocNumber: "TEST-001",
      TotalAmt: payload.TotalAmt || 100.0,
      DueDate: payload.DueDate || "2024-01-15",
      CustomerRef: { value: "1", name: "Test Customer" },
      Balance: payload.TotalAmt || 100.0
    };
    callback(null, updatedInvoice);
  }
};

// Mock getQboClientOrError
global.getQboClientOrError = async () => mockQboClient;

// Simulate the frontend response handling
function simulateFrontendResponse(toolResult) {
  console.log('\n🧪 Simulating frontend response handling...');
  console.log('Tool result received:', toolResult);
  
  // Check if this was an update operation
  if (toolResult && toolResult.Invoice) {
    console.log('✅ Update operation detected');
    
    const updatedInvoice = {
      Id: toolResult.Invoice.Id,
      DocNumber: toolResult.Invoice.DocNumber,
      CustomerRef: toolResult.Invoice.CustomerRef,
      TxnDate: toolResult.Invoice.TxnDate,
      DueDate: toolResult.Invoice.DueDate,
      TotalAmt: toolResult.Invoice.TotalAmt,
      Balance: toolResult.Invoice.Balance,
      Status: toolResult.Balance === 0 ? 'Paid' : toolResult.Balance < toolResult.TotalAmt ? 'Partial' : 'Unpaid'
    };
    
    console.log('✅ Mapped invoice for table:', updatedInvoice);
    return updatedInvoice;
  } else {
    console.log('❌ No invoice data found in tool result');
    return null;
  }
}

async function testCompleteUpdateFlow() {
  console.log('🧪 Testing complete update flow...\n');
  
  try {
    // Step 1: Execute the update
    console.log('Step 1: Executing update...');
    const result = await updateInvoice.execute({
      invoiceId: "123",
      updates: {
        DueDate: "2024-02-15",
        TotalAmt: 150.0
      }
    });
    
    console.log('✅ Update executed successfully');
    console.log('Result:', {
      responseMessage: result.responseMessage,
      hasInvoice: !!result.Invoice,
      docNumber: result.DocNumber,
      dueDate: result.DueDate,
      totalAmt: result.TotalAmt
    });
    
    // Step 2: Simulate backend response structure
    console.log('\nStep 2: Simulating backend response...');
    const backendResponse = {
      text: result.responseMessage,
      toolResults: [{
        toolName: 'updateInvoice',
        result: result
      }],
      steps: 1,
      success: true
    };
    
    console.log('Backend response structure:', {
      text: backendResponse.text,
      toolResultsCount: backendResponse.toolResults.length,
      toolName: backendResponse.toolResults[0].toolName,
      hasResult: !!backendResponse.toolResults[0].result,
      hasInvoice: !!backendResponse.toolResults[0].result.Invoice
    });
    
    // Step 3: Simulate frontend processing
    console.log('\nStep 3: Simulating frontend processing...');
    const toolResults = backendResponse.toolResults;
    
    if (toolResults && toolResults.length > 0) {
      console.log('Tool results found:', toolResults.length);
      
      const updateResults = toolResults.filter(tool => 
        tool.toolName === 'updateInvoice' && tool.result && tool.result.Invoice
      );
      
      console.log('Update results found:', updateResults.length);
      
      if (updateResults.length > 0) {
        const updatedInvoices = updateResults.map(tool => {
          const invoice = tool.result.Invoice;
          return {
            Id: invoice.Id,
            DocNumber: invoice.DocNumber,
            CustomerRef: invoice.CustomerRef,
            TxnDate: invoice.TxnDate,
            DueDate: invoice.DueDate,
            TotalAmt: invoice.TotalAmt,
            Balance: invoice.Balance,
            Status: invoice.Balance === 0 ? 'Paid' : invoice.Balance < invoice.TotalAmt ? 'Partial' : 'Unpaid'
          };
        });
        
        console.log('✅ Frontend would update table with:', updatedInvoices);
        return updatedInvoices;
      } else {
        console.log('❌ No update results found in tool results');
      }
    } else {
      console.log('❌ No tool results found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCompleteUpdateFlow(); 