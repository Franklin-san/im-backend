import { invoiceTools } from './lib/ai-tools.js';

async function debugInvoices() {
  console.log('🔍 Debugging Invoice System\n');

  try {
    // Step 1: List all available invoices
    console.log('1. Checking all available invoices...');
    try {
      const allInvoices = await invoiceTools.listInvoices.execute({});
      console.log(`✅ Found ${allInvoices.length} total invoices in the system`);
      
      if (allInvoices.length > 0) {
        console.log('\n📋 Sample invoices:');
        allInvoices.slice(0, 5).forEach((invoice, index) => {
          console.log(`   ${index + 1}. ID: ${invoice.Id}, Number: ${invoice.DocNumber || 'N/A'}, Customer: ${invoice.CustomerRef?.name || 'N/A'}, Amount: $${invoice.TotalAmt || 0}, Balance: $${invoice.Balance || 0}`);
        });
        
        if (allInvoices.length > 5) {
          console.log(`   ... and ${allInvoices.length - 5} more invoices`);
        }
      } else {
        console.log('⚠️  No invoices found in the system');
      }
    } catch (error) {
      console.log(`❌ Error listing invoices: ${error.message}`);
    }

    // Step 2: Test the specific invoice IDs mentioned
    console.log('\n2. Testing specific invoice IDs: 60, 49, 27, 34, 16');
    const testIds = ['60', '49', '27', '34', '16'];
    
    try {
      const result = await invoiceTools.getMultipleInvoices.execute({
        invoiceIds: testIds,
        analyze: true,
        analysisType: 'max_balance'
      });
      
      console.log('✅ getMultipleInvoices executed successfully!');
      console.log(`   Successful fetches: ${result.analysis.successfulFetches}`);
      console.log(`   Failed fetches: ${result.analysis.failedFetches}`);
      
      if (result.analysis.errors && result.analysis.errors.length > 0) {
        console.log('   Errors:');
        result.analysis.errors.forEach(error => console.log(`     - ${error}`));
      }
      
      if (result.analysis.maxBalanceInvoice) {
        console.log('\n🏆 Invoice with highest balance:');
        console.log(`   ID: ${result.analysis.maxBalanceInvoice.id}`);
        console.log(`   Number: ${result.analysis.maxBalanceInvoice.docNumber}`);
        console.log(`   Customer: ${result.analysis.maxBalanceInvoice.customer}`);
        console.log(`   Balance: $${result.analysis.maxBalanceInvoice.balance}`);
        console.log(`   Total Amount: $${result.analysis.maxBalanceInvoice.totalAmount}`);
      }
      
      if (result.invoices && result.invoices.length > 0) {
        console.log('\n📄 Retrieved invoices:');
        result.invoices.forEach(invoice => {
          console.log(`   ID: ${invoice.Id}, Number: ${invoice.DocNumber || 'N/A'}, Customer: ${invoice.CustomerRef?.name || 'N/A'}, Balance: $${invoice.Balance || 0}`);
        });
      }
      
    } catch (error) {
      console.log(`❌ Error with getMultipleInvoices: ${error.message}`);
    }

    // Step 3: Test individual invoice fetching
    console.log('\n3. Testing individual invoice fetching...');
    for (const id of testIds) {
      try {
        const invoice = await invoiceTools.getInvoice.execute({ invoiceId: id });
        console.log(`✅ Invoice ${id}: Found - ${invoice.DocNumber || invoice.Id}, Balance: $${invoice.Balance || 0}`);
      } catch (error) {
        console.log(`❌ Invoice ${id}: ${error.message}`);
      }
    }

    // Step 4: Check if there are any invoices with similar IDs
    console.log('\n4. Looking for invoices with similar IDs...');
    try {
      const allInvoices = await invoiceTools.listInvoices.execute({});
      const availableIds = allInvoices.map(inv => inv.Id);
      
      console.log('Available invoice IDs:');
      availableIds.slice(0, 20).forEach(id => console.log(`   ${id}`));
      
      if (availableIds.length > 20) {
        console.log(`   ... and ${availableIds.length - 20} more`);
      }
      
      // Check if any of our test IDs exist
      const existingIds = testIds.filter(id => availableIds.includes(id));
      const missingIds = testIds.filter(id => !availableIds.includes(id));
      
      console.log(`\nTest IDs found: ${existingIds.length}/${testIds.length}`);
      if (existingIds.length > 0) {
        console.log(`   Found: ${existingIds.join(', ')}`);
      }
      if (missingIds.length > 0) {
        console.log(`   Missing: ${missingIds.join(', ')}`);
      }
      
    } catch (error) {
      console.log(`❌ Error checking available IDs: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugInvoices(); 