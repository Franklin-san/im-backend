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
    description: 'Create a new invoice. If required fields are missing, dummy data will be automatically filled.',
    parameters: z.object({
      invoice: z.object({}).passthrough().describe('The invoice object to create (QuickBooks format). Required fields: CustomerRef (customer reference), Line (array of line items). If missing, dummy data will be used.'),
    }),
    execute: async ({ invoice }) => {
      const qbo = await getQboClientOrError();
      
      // Helper function to generate dummy customer data
      const getDummyCustomer = () => ({
        value: "1",
        name: "Sample Customer"
      });
      
      // Helper function to generate dummy line items
      const getDummyLineItems = () => ([
        {
          DetailType: "SalesItemLineDetail",
          Amount: 100.0,
          SalesItemLineDetail: {
            ItemRef: {
              name: "Services",
              value: "1"
            }
          }
        }
      ]);
      
      // Fill missing required fields with dummy data
      const enhancedInvoice = { ...invoice };
      
      // Ensure CustomerRef exists
      if (!enhancedInvoice.CustomerRef) {
        console.log('⚠️ CustomerRef missing, using dummy customer data');
        enhancedInvoice.CustomerRef = getDummyCustomer();
      }
      
      // Ensure Line array exists with at least one item
      if (!enhancedInvoice.Line || !Array.isArray(enhancedInvoice.Line) || enhancedInvoice.Line.length === 0) {
        console.log('⚠️ Line items missing, using dummy line item data');
        enhancedInvoice.Line = getDummyLineItems();
      }
      
      // Validate and enhance each line item
      enhancedInvoice.Line = enhancedInvoice.Line.map((lineItem, index) => {
        const enhancedLine = { ...lineItem };
        
        // Ensure DetailType exists
        if (!enhancedLine.DetailType) {
          enhancedLine.DetailType = "SalesItemLineDetail";
        }
        
        // Ensure Amount exists
        if (!enhancedLine.Amount) {
          enhancedLine.Amount = 100.0;
        }
        
        // For SalesItemLineDetail, ensure ItemRef exists
        if (enhancedLine.DetailType === "SalesItemLineDetail" && !enhancedLine.SalesItemLineDetail) {
          enhancedLine.SalesItemLineDetail = {
            ItemRef: {
              name: "Services",
              value: "1"
            }
          };
        }
        
        // For GroupLine, ensure GroupItemRef exists
        if (enhancedLine.DetailType === "GroupLine" && !enhancedLine.GroupLineDetail) {
          enhancedLine.GroupLineDetail = {
            GroupItemRef: {
              name: "Group Services",
              value: "2"
            }
          };
        }
        
        // For DescriptionOnlyLine, ensure Description exists
        if (enhancedLine.DetailType === "DescriptionOnlyLine" && !enhancedLine.Description) {
          enhancedLine.Description = "Additional notes or subtotal";
        }
        
        return enhancedLine;
      });
      
      // Add default values for other common fields if missing
      if (!enhancedInvoice.TxnDate) {
        enhancedInvoice.TxnDate = new Date().toISOString().split('T')[0];
      }
      
      if (!enhancedInvoice.DueDate) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // 30 days from now
        enhancedInvoice.DueDate = dueDate.toISOString().split('T')[0];
      }
      
      console.log('📝 Creating invoice with enhanced data:', JSON.stringify(enhancedInvoice, null, 2));
      
      return new Promise((resolve, reject) => {
        qbo.createInvoice(enhancedInvoice, (err, createdInvoice) => {
          if (err) {
            console.error('❌ Invoice creation failed:', err);
            return reject(new Error('Failed to create invoice: ' + err.message));
          }
          console.log('✅ Invoice created successfully:', createdInvoice.Id);
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
}; 