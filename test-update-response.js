// Test script to verify update response behavior
import { updateInvoice } from './lib/ai-tools.js';

// Mock QBO client for testing
const mockQboClient = {
  getInvoice: (id, callback) => {
    const currentInvoice = {
      Id: id,
      SyncToken: "1",
      DocNumber: "TEST-001",
      TotalAmt: 100.0,
      DueDate: "2024-01-15",
      CustomerRef: { value: "1", name: "Test Customer" }
    };
    callback(null, currentInvoice);
  },
  updateInvoice: (payload, callback) => {
    const updatedInvoice = {
      ...payload,
      SyncToken: "2",
      DocNumber: "TEST-001",
      TotalAmt: payload.TotalAmt || 100.0,
      DueDate: payload.DueDate || "2024-01-15"
    };
    callback(null, updatedInvoice);
  }
};

// Mock getQboClientOrError
global.getQboClientOrError = async () => mockQboClient;

async function testUpdateResponse() {
  console.log('🧪 Testing update response behavior...');
  
  try {
    const result = await updateInvoice.execute({
      invoiceId: "123",
      updates: {
        DueDate: "2024-02-15",
        TotalAmt: 150.0
      }
    });
    
    console.log('✅ Update result:', {
      responseMessage: result.responseMessage,
      hasInvoice: !!result.Invoice,
      docNumber: result.DocNumber,
      updatedFields: Object.keys(result).filter(key => key !== 'Id' && key !== 'SyncToken' && key !== 'responseMessage')
    });
    
    // Verify the response has the expected structure
    if (result.responseMessage && result.responseMessage.includes('updated successfully')) {
      console.log('✅ Response message is clean summary');
    } else {
      console.log('❌ Response message is not a clean summary');
    }
    
    if (result.Invoice) {
      console.log('✅ Invoice data is available for table update');
    } else {
      console.log('❌ Invoice data is missing');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testUpdateResponse(); 