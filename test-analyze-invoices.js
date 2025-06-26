import { invoiceTools } from './lib/ai-tools.js';
import { getStoredTokens, hasValidTokens } from './lib/qbo.js';

async function testAnalyzeInvoices() {
  console.log('🧪 Testing analyzeInvoices tool...\n');
  
  if (!hasValidTokens()) {
    console.log('❌ No valid tokens available. Please complete OAuth flow first.');
    return;
  }
  
  const tokens = getStoredTokens();
  console.log('✅ Using tokens for realm:', tokens.realm_id);
  
  try {
    // Test 1: Get all invoices
    console.log('\n📋 Test 1: Getting all invoices...');
    const allInvoices = await invoiceTools.analyzeInvoices.execute({
      analysisType: 'all_invoices',
      maxResults: 10
    });
    console.log(`✅ Found ${allInvoices.invoices.length} invoices`);
    console.log(`📊 Analysis: ${allInvoices.analysis?.totalInvoices} total, $${allInvoices.analysis?.totalAmount?.toFixed(2)} total amount`);
    
    // Test 2: Get overdue invoices
    console.log('\n📋 Test 2: Getting overdue invoices...');
    const overdueInvoices = await invoiceTools.analyzeInvoices.execute({
      analysisType: 'overdue_invoices',
      maxResults: 5
    });
    console.log(`✅ Found ${overdueInvoices.invoices.length} overdue invoices`);
    console.log(`📊 Analysis: ${overdueInvoices.analysis?.overdueCount} overdue, $${overdueInvoices.analysis?.totalBalance?.toFixed(2)} outstanding`);
    
    // Test 3: Get paid invoices
    console.log('\n📋 Test 3: Getting paid invoices...');
    const paidInvoices = await invoiceTools.analyzeInvoices.execute({
      analysisType: 'paid_invoices',
      maxResults: 5
    });
    console.log(`✅ Found ${paidInvoices.invoices.length} paid invoices`);
    console.log(`📊 Analysis: ${paidInvoices.analysis?.paidCount} paid, $${paidInvoices.analysis?.totalAmount?.toFixed(2)} total`);
    
    // Test 4: Filter by customer (if we have invoices)
    if (allInvoices.invoices.length > 0) {
      const firstCustomer = allInvoices.invoices[0].CustomerRef?.name;
      if (firstCustomer) {
        console.log(`\n📋 Test 4: Filtering by customer "${firstCustomer}"...`);
        const customerInvoices = await invoiceTools.analyzeInvoices.execute({
          analysisType: 'filter_by_customer',
          filters: { customerName: firstCustomer },
          maxResults: 5
        });
        console.log(`✅ Found ${customerInvoices.invoices.length} invoices for ${firstCustomer}`);
        console.log(`📊 Analysis: $${customerInvoices.analysis?.totalAmount?.toFixed(2)} total amount`);
      }
    }
    
    // Test 5: High value invoices
    console.log('\n📋 Test 5: Getting high value invoices...');
    const highValueInvoices = await invoiceTools.analyzeInvoices.execute({
      analysisType: 'high_value_invoices',
      maxResults: 5
    });
    console.log(`✅ Found ${highValueInvoices.invoices.length} high value invoices`);
    console.log(`📊 Analysis: $${highValueInvoices.analysis?.totalAmount?.toFixed(2)} total amount`);
    
    // Test 6: Recent invoices
    console.log('\n📋 Test 6: Getting recent invoices...');
    const recentInvoices = await invoiceTools.analyzeInvoices.execute({
      analysisType: 'recent_invoices',
      maxResults: 5
    });
    console.log(`✅ Found ${recentInvoices.invoices.length} recent invoices`);
    console.log(`📊 Analysis: $${recentInvoices.analysis?.totalAmount?.toFixed(2)} total amount`);
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause.message);
    }
  }
}

// Run the test
testAnalyzeInvoices().catch(console.error); 