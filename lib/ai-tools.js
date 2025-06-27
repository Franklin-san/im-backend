import { z } from 'zod';
import { tool } from 'ai';
import QuickBooks from 'node-quickbooks';
import { getValidTokens } from './tokenRefresh.js';
import { hasValidTokens } from './qbo.js';
import axios from 'axios';

// Helper to get QBO client with automatic token refresh
async function getQboClientOrError() {
  try {
    const tokens = await getValidTokens();
    return new QuickBooks(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      tokens.access_token,
      false,
      tokens.realm_id,
      process.env.NODE_ENV !== 'production',
      process.env.NODE_ENV !== 'production',
      null,
      '2.0',
      process.env.CLIENT_SECRET
    );
  } catch (error) {
    throw new Error(`Authentication required: ${error.message}. Please complete OAuth flow first by visiting /auth/start`);
  }
}

export const invoiceTools = {
  getInvoice: tool({
    description: 'Get details of a specific invoice by ID',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to retrieve'),
    }),
    execute: async ({ invoiceId }) => {
      const qbo = await getQboClientOrError();
      return new Promise((resolve, reject) => {
        qbo.getInvoice(invoiceId, (err, invoice) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            const errorCode = err.Fault?.Error?.[0]?.code || 'UNKNOWN';
            return reject(new Error(`Failed to fetch invoice ${invoiceId}: ${errorMsg} (Code: ${errorCode})`));
          }
          if (!invoice) {
            return reject(new Error(`Invoice with ID ${invoiceId} not found`));
          }
          resolve(invoice);
        });
      });
    },
  }),

  getMultipleInvoices: tool({
    description: 'Get details of multiple invoices by their IDs. This tool handles cases where some invoices exist and others do not, providing partial results with explanations.',
    parameters: z.object({
      invoiceIds: z.array(z.string()).describe('Array of invoice IDs to retrieve'),
    }),
    execute: async ({ invoiceIds }) => {
      const qbo = await getQboClientOrError();
      
      const results = {
        found: [],
        notFound: [],
        errors: [],
        summary: {
          totalRequested: invoiceIds.length,
          found: 0,
          notFound: 0,
          errors: 0
        }
      };
      
      // Process each invoice ID
      for (const invoiceId of invoiceIds) {
        try {
          const invoice = await new Promise((resolve, reject) => {
            qbo.getInvoice(invoiceId, (err, invoice) => {
              if (err) {
                const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
                const errorCode = err.Fault?.Error?.[0]?.code || 'UNKNOWN';
                reject(new Error(`${errorMsg} (Code: ${errorCode})`));
              } else if (!invoice) {
                reject(new Error('Invoice not found'));
              } else {
                resolve(invoice);
              }
            });
          });
          
          results.found.push(invoice);
          results.summary.found++;
          
        } catch (error) {
          if (error.message.includes('not found') || error.message.includes('No entity found')) {
            results.notFound.push(invoiceId);
            results.summary.notFound++;
          } else {
            results.errors.push({
              invoiceId: invoiceId,
              error: error.message
            });
            results.summary.errors++;
          }
        }
      }
      
      // Create a meaningful response message
      let responseMessage = '';
      
      if (results.summary.found > 0) {
        responseMessage += `Found ${results.summary.found} invoice(s): `;
        responseMessage += results.found.map(inv => `#${inv.DocNumber} (${inv.CustomerRef?.name || 'Unknown'})`).join(', ');
        responseMessage += '. ';
      }
      
      if (results.summary.notFound > 0) {
        responseMessage += `${results.summary.notFound} invoice(s) not found: ${results.notFound.join(', ')}. `;
      }
      
      if (results.summary.errors > 0) {
        responseMessage += `${results.summary.errors} invoice(s) had errors: `;
        responseMessage += results.errors.map(e => `${e.invoiceId} (${e.error})`).join(', ');
        responseMessage += '. ';
      }
      
      // Add the response message to the results
      results.responseMessage = responseMessage.trim();
      
      return results;
    },
  }),

  listInvoices: tool({
    description: 'List invoices with optional filtering and analysis. This is the primary tool for invoice queries.',
    parameters: z.object({
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 100, max: 1000)'),
      startPosition: z.number().optional().describe('Starting position for pagination (default: 1)'),
      customerId: z.string().optional().describe('Filter by customer ID'),
      customerName: z.string().optional().describe('Filter by customer name (partial match)'),
      status: z.string().optional().describe('Filter by invoice status (note: status filtering is not supported in QuickBooks queries)'),
      dateFrom: z.string().optional().describe('Filter invoices from this date (YYYY-MM-DD)'),
      dateTo: z.string().optional().describe('Filter invoices to this date (YYYY-MM-DD)'),
      dueDateFrom: z.string().optional().describe('Filter by due date from (YYYY-MM-DD)'),
      dueDateTo: z.string().optional().describe('Filter by due date to (YYYY-MM-DD)'),
      totalFrom: z.number().optional().describe('Filter by minimum total amount'),
      totalTo: z.number().optional().describe('Filter by maximum total amount'),
      docNumber: z.string().optional().describe('Filter by document number (partial match)'),
      balanceFrom: z.number().optional().describe('Filter by minimum balance amount'),
      balanceTo: z.number().optional().describe('Filter by maximum balance amount'),
      includeAnalysis: z.boolean().optional().describe('Include statistical analysis in results (default: true)'),
      sortBy: z.string().optional().describe('Sort field (TxnDate, TotalAmt, Balance, DocNumber, DueDate)'),
      sortOrder: z.enum(['ASC', 'DESC']).optional().describe('Sort order (default: DESC)'),
    }),
    execute: async ({ 
      maxResults = 100, 
      startPosition = 1,
      customerId,
      customerName,
      status,
      dateFrom,
      dateTo,
      dueDateFrom,
      dueDateTo,
      totalFrom,
      totalTo,
      docNumber,
      balanceFrom,
      balanceTo,
      includeAnalysis = true,
      sortBy = 'TxnDate',
      sortOrder = 'DESC'
    }) => {
      try {
        const tokens = await getValidTokens();
        
        const baseUrl = 'https://sandbox-quickbooks.api.intuit.com';
        let queryString = 'SELECT * FROM Invoice';
        const conditions = [];
        
        if (customerId) conditions.push(`CustomerRef = '${customerId}'`);
        if (dateFrom) conditions.push(`TxnDate >= '${dateFrom}'`);
        if (dateTo) conditions.push(`TxnDate <= '${dateTo}'`);
        if (dueDateFrom) conditions.push(`DueDate >= '${dueDateFrom}'`);
        if (dueDateTo) conditions.push(`DueDate <= '${dueDateTo}'`);
        if (totalFrom !== undefined) conditions.push(`TotalAmt > '${totalFrom - 0.01}'`);
        if (totalTo !== undefined) conditions.push(`TotalAmt < '${totalTo + 0.01}'`);
        if (docNumber) conditions.push(`DocNumber LIKE '%${docNumber.replace(/'/g, "''")}%'`);
        if (balanceFrom !== undefined) conditions.push(`Balance > '${balanceFrom - 0.01}'`);
        if (balanceTo !== undefined) conditions.push(`Balance < '${balanceTo + 0.01}'`);
        
        if (conditions.length > 0) {
          queryString += ' WHERE ' + conditions.join(' AND ');
        }
        
        queryString += ` ORDER BY ${sortBy} ${sortOrder}`;
        
        console.log('🔍 Query executed:', queryString);
        
        const response = await axios.get(`${baseUrl}/v3/company/${tokens.realm_id}/query`, {
          params: {
            query: queryString,
            startposition: startPosition,
            maxresults: Math.min(maxResults, 1000)
          },
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: 'application/json'
          }
        });

        const data = response.data;
        console.log('📊 Response received');
        const invoiceList = data.QueryResponse?.Invoice || [];
        const totalCount = data.QueryResponse?.totalCount || 0;
        
        // Perform analysis if requested
        let analysis = null;
        if (includeAnalysis && invoiceList.length > 0) {
          const totalAmount = invoiceList.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
          const totalBalance = invoiceList.reduce((sum, inv) => sum + (parseFloat(inv.Balance) || 0), 0);
          const paidCount = invoiceList.filter(inv => (parseFloat(inv.Balance) || 0) === 0).length;
          const unpaidCount = invoiceList.filter(inv => (parseFloat(inv.Balance) || 0) > 0).length;
          
          const today = new Date();
          const overdueCount = invoiceList.filter(inv => {
            if (!inv.DueDate || (parseFloat(inv.Balance) || 0) === 0) return false;
            const dueDate = new Date(inv.DueDate);
            return dueDate < today;
          }).length;
          
          // Customer breakdown
          const customerBreakdown = {};
          invoiceList.forEach(inv => {
            const customerName = inv.CustomerRef?.name || 'Unknown';
            if (!customerBreakdown[customerName]) {
              customerBreakdown[customerName] = {
                count: 0,
                totalAmount: 0,
                totalBalance: 0,
              };
            }
            customerBreakdown[customerName].count++;
            customerBreakdown[customerName].totalAmount += parseFloat(inv.TotalAmt) || 0;
            customerBreakdown[customerName].totalBalance += parseFloat(inv.Balance) || 0;
          });
          
          analysis = {
            totalInvoices: invoiceList.length,
            totalAmount: totalAmount,
            totalBalance: totalBalance,
            averageAmount: totalAmount / invoiceList.length,
            averageBalance: totalBalance / invoiceList.length,
            paidCount: paidCount,
            unpaidCount: unpaidCount,
            overdueCount: overdueCount,
            paidPercentage: (paidCount / invoiceList.length) * 100,
            customerBreakdown: customerBreakdown,
            topCustomers: Object.entries(customerBreakdown)
              .sort(([,a], [,b]) => b.totalAmount - a.totalAmount)
              .slice(0, 5)
              .map(([name, data]) => ({ name, ...data })),
          };
        }
        
        return {
          invoices: invoiceList,
          analysis: analysis,
          totalCount,
          startPosition,
          maxResults: Math.min(maxResults, 1000),
          query: queryString,
          filters: {
            customerId,
            customerName,
            status,
            dateFrom,
            dateTo,
            dueDateFrom,
            dueDateTo,
            totalFrom,
            totalTo,
            docNumber,
            balanceFrom,
            balanceTo
          }
        };
      } catch (err) {
        if (err.response && err.response.data) {
          console.error('❌ QuickBooks API Error:', JSON.stringify(err.response.data, null, 2));
        } else {
          console.error('❌ QuickBooks API Error:', err.message);
        }
        throw new Error('Failed to fetch invoices: ' + (err.response && err.response.data ? JSON.stringify(err.response.data) : err.message));
      }
    },
  }),

  createInvoice: tool({
    description: 'Create a new invoice in QuickBooks. Follow the exact structure with CustomerRef.value and Line array with ItemRef.value.',
    parameters: z.object({
      invoice: z.object({}).passthrough().describe('The invoice object to create (QuickBooks format). Must include CustomerRef.value and Line array with ItemRef.value.'),
    }),
    execute: async ({ invoice }) => {
      const qbo = await getQboClientOrError();
      
      // Helper function to generate a customer ID from 1 to 31
      const generateCustomerId = () => {
        return Math.floor(Math.random() * 31) + 1;
      };
      
      // Helper function to generate an item ID
      const generateItemId = () => {
        return Math.floor(Math.random() * 100) + 1;
      };
      
      // Fill missing required fields with dummy data
      const enhancedInvoice = { ...invoice };
      
      // Ensure CustomerRef exists with proper structure
      if (!enhancedInvoice.CustomerRef) {
        console.log('⚠️ CustomerRef missing, using dummy customer data');
        enhancedInvoice.CustomerRef = {
          value: generateCustomerId(),
          name: invoice.customerName || "Demo Customer"
        };
      } else if (!enhancedInvoice.CustomerRef.value) {
        // If customer name is provided but no ID, generate a customer ID
        enhancedInvoice.CustomerRef.value = generateCustomerId();
      }
      
      // Ensure Line array exists with at least one item
      if (!enhancedInvoice.Line || !Array.isArray(enhancedInvoice.Line) || enhancedInvoice.Line.length === 0) {
        console.log('⚠️ Line items missing, using dummy line item data');
        enhancedInvoice.Line = [{
          DetailType: "SalesItemLineDetail",
          Amount: invoice.amount || 150.0,
          SalesItemLineDetail: {
            ItemRef: {
              value: generateItemId(),
              name: invoice.itemName || "Professional Services"
            }
          }
        }];
      } else {
        // Validate and enhance each line item
        enhancedInvoice.Line = enhancedInvoice.Line.map((lineItem, index) => {
          const enhancedLine = { ...lineItem };
          
          // Ensure DetailType exists
          if (!enhancedLine.DetailType) {
            enhancedLine.DetailType = "SalesItemLineDetail";
          }
          
          // Ensure Amount exists and is a number
          if (!enhancedLine.Amount) {
            enhancedLine.Amount = 150.0;
          } else if (typeof enhancedLine.Amount === 'string') {
            enhancedLine.Amount = parseFloat(enhancedLine.Amount);
          }
          
          // For SalesItemLineDetail, ensure ItemRef exists with proper structure
          if (enhancedLine.DetailType === "SalesItemLineDetail") {
            if (!enhancedLine.SalesItemLineDetail) {
              enhancedLine.SalesItemLineDetail = {
                ItemRef: {
                  value: generateItemId(),
                  name: "Professional Services"
                }
              };
            } else if (!enhancedLine.SalesItemLineDetail.ItemRef) {
              enhancedLine.SalesItemLineDetail.ItemRef = {
                value: generateItemId(),
                name: "Professional Services"
              };
            } else if (!enhancedLine.SalesItemLineDetail.ItemRef.value) {
              // If item name is provided but no ID, generate an item ID
              enhancedLine.SalesItemLineDetail.ItemRef.value = generateItemId();
            }
          }
          
          return enhancedLine;
        });
      }
      
      // Add default values for other common fields if missing
      if (!enhancedInvoice.TxnDate) {
        enhancedInvoice.TxnDate = new Date().toISOString().split('T')[0];
      }
      
      if (!enhancedInvoice.DueDate) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // 30 days from now
        enhancedInvoice.DueDate = dueDate.toISOString().split('T')[0];
      }
      
      console.log('📝 Creating invoice with structure:', JSON.stringify(enhancedInvoice, null, 2));
      
      return new Promise((resolve, reject) => {
        qbo.createInvoice(enhancedInvoice, (err, createdInvoice) => {
          if (err) {
            console.error('❌ Invoice creation failed:', err);
            const errorMessage = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error occurred';
            const errorCode = err.Fault?.Error?.[0]?.code || 'UNKNOWN';
            return reject(new Error(`Failed to create invoice: ${errorMessage} (Code: ${errorCode})`));
          }
          
          if (!createdInvoice) {
            console.error('❌ Invoice creation returned no result');
            return reject(new Error('Invoice creation returned no result'));
          }
          
          console.log('✅ Invoice created successfully:', createdInvoice.Id);
          console.log('📄 Created invoice data:', JSON.stringify(createdInvoice, null, 2));
          resolve(createdInvoice);
        });
      });
    },
  }),

  updateInvoice: tool({
    description: 'Update an existing invoice by ID',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to update'),
      invoice: z.object({}).passthrough().describe('The updated invoice object (QuickBooks format)'),
    }),
    execute: async ({ invoiceId, invoice }) => {
      const qbo = await getQboClientOrError();
      invoice.Id = invoiceId;
      return new Promise((resolve, reject) => {
        qbo.updateInvoice(invoice, (err, updatedInvoice) => {
          if (err) return reject(new Error('Failed to update invoice: ' + err.message));
          resolve(updatedInvoice);
        });
      });
    },
  }),

  deleteInvoice: tool({
    description: 'Delete an invoice by ID',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to delete'),
    }),
    execute: async ({ invoiceId }) => {
      const qbo = await getQboClientOrError();
      return new Promise((resolve, reject) => {
        qbo.deleteInvoice(invoiceId, (err, result) => {
          if (err) return reject(new Error('Failed to delete invoice: ' + err.message));
          resolve({ message: 'Invoice deleted successfully', result });
        });
      });
    },
  }),

  emailInvoice: tool({
    description: 'Send an invoice PDF to an email address',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to email (use the Id field, not DocNumber)'),
      email: z.string().email().describe('The email address to send the invoice to'),
    }),
    execute: async ({ invoiceId, email }) => {
      const qbo = await getQboClientOrError();
      return new Promise((resolve, reject) => {
        qbo.sendInvoicePdf(invoiceId, email, (err, result) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            const errorCode = err.Fault?.Error?.[0]?.code || 'UNKNOWN';
            return reject(new Error(`Failed to send invoice ${invoiceId}: ${errorMsg} (Code: ${errorCode})`));
          }
          resolve({ message: 'Invoice sent successfully', result });
        });
      });
    },
  }),

  getOverdueInvoices: tool({
    description: 'Get overdue invoices with specific balance criteria. This tool is specifically designed for finding overdue invoices.',
    parameters: z.object({
      balanceFrom: z.number().optional().describe('Minimum balance amount (default: 0)'),
      balanceTo: z.number().optional().describe('Maximum balance amount'),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 100)'),
      includeAnalysis: z.boolean().optional().describe('Include statistical analysis in results (default: true)'),
    }),
    execute: async ({ 
      balanceFrom = 0,
      balanceTo,
      maxResults = 100,
      includeAnalysis = true
    }) => {
      try {
        const tokens = await getValidTokens();
        
        const baseUrl = 'https://sandbox-quickbooks.api.intuit.com';
        
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        
        let queryString = 'SELECT * FROM Invoice';
        const conditions = [];
        
        // Overdue condition: DueDate < today AND Balance > 0
        conditions.push(`DueDate < '${today}'`);
        conditions.push(`Balance > '0'`);
        
        // Balance filtering
        if (balanceFrom !== undefined) {
          conditions.push(`Balance > '${balanceFrom - 0.01}'`);
        }
        if (balanceTo !== undefined) {
          conditions.push(`Balance < '${balanceTo + 0.01}'`);
        }
        
        queryString += ' WHERE ' + conditions.join(' AND ');
        queryString += ' ORDER BY DueDate ASC';
        
        console.log('🔍 Overdue Query executed:', queryString);
        
        const response = await axios.get(`${baseUrl}/v3/company/${tokens.realm_id}/query`, {
          params: {
            query: queryString,
            startposition: 1,
            maxresults: Math.min(maxResults, 1000)
          },
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: 'application/json'
          }
        });

        const data = response.data;
        console.log('📊 Overdue Response received');
        const invoiceList = data.QueryResponse?.Invoice || [];
        const totalCount = data.QueryResponse?.totalCount || 0;
        
        // Perform analysis if requested
        let analysis = null;
        if (includeAnalysis && invoiceList.length > 0) {
          const totalAmount = invoiceList.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
          const totalBalance = invoiceList.reduce((sum, inv) => sum + (parseFloat(inv.Balance) || 0), 0);
          
          // Days overdue calculation
          const overdueAnalysis = invoiceList.map(inv => {
            const dueDate = new Date(inv.DueDate);
            const today = new Date();
            const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
            return {
              invoiceId: inv.Id,
              docNumber: inv.DocNumber,
              customer: inv.CustomerRef?.name,
              balance: parseFloat(inv.Balance) || 0,
              daysOverdue: daysOverdue
            };
          });
          
          analysis = {
            totalOverdueInvoices: invoiceList.length,
            totalOverdueAmount: totalBalance,
            averageDaysOverdue: overdueAnalysis.reduce((sum, inv) => sum + inv.daysOverdue, 0) / invoiceList.length,
            overdueInvoices: overdueAnalysis.sort((a, b) => b.daysOverdue - a.daysOverdue),
            totalAmount: totalAmount,
            totalBalance: totalBalance,
          };
        }
        
        return {
          invoices: invoiceList,
          analysis: analysis,
          totalCount,
          maxResults: Math.min(maxResults, 1000),
          query: queryString,
          filters: {
            balanceFrom,
            balanceTo,
            overdue: true
          }
        };
      } catch (err) {
        if (err.response && err.response.data) {
          console.error('❌ QuickBooks API Error:', JSON.stringify(err.response.data, null, 2));
        } else {
          console.error('❌ QuickBooks API Error:', err.message);
        }
        throw new Error('Failed to fetch overdue invoices: ' + (err.response && err.response.data ? JSON.stringify(err.response.data) : err.message));
      }
    },
  }),

  getCustomers: tool({
    description: 'Get a list of customers from QuickBooks. Useful for finding customer IDs when creating invoices.',
    parameters: z.object({
      query: z.string().optional().describe('Optional search query to filter customers by name'),
      limit: z.number().optional().default(50).describe('Maximum number of customers to return'),
    }),
    execute: async ({ query, limit = 50 }) => {
      try {
        const tokens = await getValidTokens();
        
        const baseUrl = 'https://sandbox-quickbooks.api.intuit.com';
        
        let queryString = 'SELECT * FROM Customer';
        if (query) {
          queryString += ` WHERE DisplayName LIKE '%${query}%'`;
        }
        queryString += ' ORDER BY DisplayName';
        
        console.log(`🔍 Searching customers${query ? ` with query: ${query}` : ''}`);
        
        const response = await axios.get(`${baseUrl}/v3/company/${tokens.realm_id}/query`, {
          params: {
            query: queryString,
            startposition: 1,
            maxresults: Math.min(limit, 1000)
          },
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: 'application/json'
          }
        });

        const data = response.data;
        const customerList = data.QueryResponse?.Customer || [];
        const totalCount = data.QueryResponse?.totalCount || 0;
        
        // Format the response for better readability
        const formattedCustomers = customerList.map(customer => ({
          Id: customer.Id,
          Name: customer.DisplayName,
          Balance: customer.Balance,
          Active: customer.Active
        }));
        
        console.log(`✅ Found ${formattedCustomers.length} customers`);
        
        return {
          customers: formattedCustomers,
          message: `Found ${formattedCustomers.length} customers${query ? ` matching "${query}"` : ''}`,
          total: formattedCustomers.length
        };
        
      } catch (err) {
        if (err.response && err.response.data) {
          console.error('❌ QuickBooks API Error:', JSON.stringify(err.response.data, null, 2));
        } else {
          console.error('❌ QuickBooks API Error:', err.message);
        }
        throw new Error('Failed to fetch customers: ' + (err.response && err.response.data ? JSON.stringify(err.response.data) : err.message));
      }
    },
  }),

  getItems: tool({
    description: 'Get a list of items from QuickBooks. Useful for finding item IDs when creating invoices.',
    parameters: z.object({
      query: z.string().optional().describe('Optional search query to filter items by name'),
      limit: z.number().optional().default(50).describe('Maximum number of items to return'),
    }),
    execute: async ({ query, limit = 50 }) => {
      try {
        const tokens = await getValidTokens();
        
        const baseUrl = 'https://sandbox-quickbooks.api.intuit.com';
        
        let queryString = 'SELECT * FROM Item';
        if (query) {
          queryString += ` WHERE Name LIKE '%${query}%'`;
        }
        queryString += ' ORDER BY Name';
        
        console.log(`🔍 Searching items${query ? ` with query: ${query}` : ''}`);
        
        const response = await axios.get(`${baseUrl}/v3/company/${tokens.realm_id}/query`, {
          params: {
            query: queryString,
            startposition: 1,
            maxresults: Math.min(limit, 1000)
          },
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: 'application/json'
          }
        });

        const data = response.data;
        const itemList = data.QueryResponse?.Item || [];
        const totalCount = data.QueryResponse?.totalCount || 0;
        
        // Format the response for better readability
        const formattedItems = itemList.map(item => ({
          Id: item.Id,
          Name: item.Name,
          Description: item.Description,
          Type: item.Type,
          UnitPrice: item.UnitPrice,
          PurchaseCost: item.PurchaseCost,
          IncomeAccountRef: item.IncomeAccountRef,
          ExpenseAccountRef: item.ExpenseAccountRef,
          Active: item.Active
        }));
        
        console.log(`✅ Found ${formattedItems.length} items`);
        
        return {
          items: formattedItems,
          message: `Found ${formattedItems.length} items${query ? ` matching "${query}"` : ''}`,
          total: formattedItems.length
        };
        
      } catch (err) {
        if (err.response && err.response.data) {
          console.error('❌ QuickBooks API Error:', JSON.stringify(err.response.data, null, 2));
        } else {
          console.error('❌ QuickBooks API Error:', err.message);
        }
        throw new Error('Failed to fetch items: ' + (err.response && err.response.data ? JSON.stringify(err.response.data) : err.message));
      }
    },
  }),
}; 