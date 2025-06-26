import { z } from 'zod';
import { tool } from 'ai';
import QuickBooks from 'node-quickbooks';
import { getStoredTokens, hasValidTokens } from './qbo.js';

// Helper to get QBO client
function getQboClientOrError() {
  if (!hasValidTokens()) {
    throw new Error('No valid tokens available. Please complete OAuth flow first by visiting /auth/start');
  }
  const tokens = getStoredTokens();
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
}

// Helper to build query string for QuickBooks
function buildQueryString(filters) {
  const queryParts = [];
  
  if (filters.customerName) {
    queryParts.push(`CustomerRef.name = '${filters.customerName}'`);
  }
  
  if (filters.customerId) {
    queryParts.push(`CustomerRef = '${filters.customerId}'`);
  }
  
  if (filters.status) {
    queryParts.push(`EmailStatus = '${filters.status}'`);
  }
  
  if (filters.docNumber) {
    queryParts.push(`DocNumber = '${filters.docNumber}'`);
  }
  
  if (filters.dateFrom) {
    queryParts.push(`TxnDate >= '${filters.dateFrom}'`);
  }
  
  if (filters.dateTo) {
    queryParts.push(`TxnDate <= '${filters.dateTo}'`);
  }
  
  if (filters.amountMin !== undefined) {
    queryParts.push(`TotalAmt >= ${filters.amountMin}`);
  }
  
  if (filters.amountMax !== undefined) {
    queryParts.push(`TotalAmt <= ${filters.amountMax}`);
  }
  
  if (filters.balanceMin !== undefined) {
    queryParts.push(`Balance >= ${filters.balanceMin}`);
  }
  
  if (filters.balanceMax !== undefined) {
    queryParts.push(`Balance <= ${filters.balanceMax}`);
  }
  
  if (filters.dueDateFrom) {
    queryParts.push(`DueDate >= '${filters.dueDateFrom}'`);
  }
  
  if (filters.dueDateTo) {
    queryParts.push(`DueDate <= '${filters.dueDateTo}'`);
  }
  
  if (filters.metaDataCreateTimeFrom) {
    queryParts.push(`MetaData.CreateTime >= '${filters.metaDataCreateTimeFrom}'`);
  }
  
  if (filters.metaDataCreateTimeTo) {
    queryParts.push(`MetaData.CreateTime <= '${filters.metaDataCreateTimeTo}'`);
  }
  
  return queryParts.join(' AND ');
}

export const invoiceTools = {
  getInvoice: tool({
    description: 'Get details of a specific invoice by ID',
    parameters: z.object({
      invoiceId: z.string().describe('The ID of the invoice to retrieve'),
    }),
    execute: async ({ invoiceId }) => {
      const qbo = getQboClientOrError();
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
    description: 'Get details of multiple invoices by their IDs and optionally perform analysis',
    parameters: z.object({
      invoiceIds: z.array(z.string()).describe('Array of invoice IDs to retrieve'),
      analyze: z.boolean().optional().describe('Whether to perform analysis on the invoices (default: true)'),
      analysisType: z.enum(['max_balance', 'max_amount', 'min_balance', 'min_amount', 'total_summary']).optional().describe('Type of analysis to perform'),
    }),
    execute: async ({ invoiceIds, analyze = true, analysisType = 'total_summary' }) => {
      const qbo = getQboClientOrError();
      
      // Fetch all invoices
      const invoices = [];
      const errors = [];
      
      for (const invoiceId of invoiceIds) {
        try {
          const invoice = await new Promise((resolve, reject) => {
            qbo.getInvoice(invoiceId, (err, invoice) => {
              if (err) {
                const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
                reject(new Error(`Invoice ${invoiceId}: ${errorMsg}`));
              } else if (!invoice) {
                reject(new Error(`Invoice ${invoiceId}: Not found`));
              } else {
                resolve(invoice);
              }
            });
          });
          invoices.push(invoice);
        } catch (error) {
          errors.push(error.message);
        }
      }
      
      // If no invoices found, return error
      if (invoices.length === 0) {
        throw new Error(`No invoices found. Errors: ${errors.join(', ')}`);
      }
      
      // Perform analysis if requested
      if (analyze && invoices.length > 0) {
        const analysis = {
          totalInvoices: invoices.length,
          successfulFetches: invoices.length,
          failedFetches: errors.length,
          errors: errors,
        };
        
        if (analysisType === 'max_balance' || analysisType === 'total_summary') {
          const maxBalanceInvoice = invoices.reduce((max, invoice) => {
            const balance = parseFloat(invoice.Balance) || 0;
            const maxBalance = parseFloat(max.Balance) || 0;
            return balance > maxBalance ? invoice : max;
          });
          analysis.maxBalanceInvoice = {
            id: maxBalanceInvoice.Id,
            docNumber: maxBalanceInvoice.DocNumber,
            customer: maxBalanceInvoice.CustomerRef?.name,
            balance: parseFloat(maxBalanceInvoice.Balance) || 0,
            totalAmount: parseFloat(maxBalanceInvoice.TotalAmt) || 0,
          };
        }
        
        if (analysisType === 'max_amount' || analysisType === 'total_summary') {
          const maxAmountInvoice = invoices.reduce((max, invoice) => {
            const amount = parseFloat(invoice.TotalAmt) || 0;
            const maxAmount = parseFloat(max.TotalAmt) || 0;
            return amount > maxAmount ? invoice : max;
          });
          analysis.maxAmountInvoice = {
            id: maxAmountInvoice.Id,
            docNumber: maxAmountInvoice.DocNumber,
            customer: maxAmountInvoice.CustomerRef?.name,
            totalAmount: parseFloat(maxAmountInvoice.TotalAmt) || 0,
            balance: parseFloat(maxAmountInvoice.Balance) || 0,
          };
        }
        
        if (analysisType === 'min_balance' || analysisType === 'total_summary') {
          const minBalanceInvoice = invoices.reduce((min, invoice) => {
            const balance = parseFloat(invoice.Balance) || 0;
            const minBalance = parseFloat(min.Balance) || 0;
            return balance < minBalance ? invoice : min;
          });
          analysis.minBalanceInvoice = {
            id: minBalanceInvoice.Id,
            docNumber: minBalanceInvoice.DocNumber,
            customer: minBalanceInvoice.CustomerRef?.name,
            balance: parseFloat(minBalanceInvoice.Balance) || 0,
            totalAmount: parseFloat(minBalanceInvoice.TotalAmt) || 0,
          };
        }
        
        if (analysisType === 'min_amount' || analysisType === 'total_summary') {
          const minAmountInvoice = invoices.reduce((min, invoice) => {
            const amount = parseFloat(invoice.TotalAmt) || 0;
            const minAmount = parseFloat(min.TotalAmt) || 0;
            return amount < minAmount ? invoice : min;
          });
          analysis.minAmountInvoice = {
            id: minAmountInvoice.Id,
            docNumber: minAmountInvoice.DocNumber,
            customer: minAmountInvoice.CustomerRef?.name,
            totalAmount: parseFloat(minAmountInvoice.TotalAmt) || 0,
            balance: parseFloat(minAmountInvoice.Balance) || 0,
          };
        }
        
        if (analysisType === 'total_summary') {
          analysis.summary = {
            totalAmount: invoices.reduce((sum, invoice) => sum + (parseFloat(invoice.TotalAmt) || 0), 0),
            totalBalance: invoices.reduce((sum, invoice) => sum + (parseFloat(invoice.Balance) || 0), 0),
            averageAmount: invoices.reduce((sum, invoice) => sum + (parseFloat(invoice.TotalAmt) || 0), 0) / invoices.length,
            averageBalance: invoices.reduce((sum, invoice) => sum + (parseFloat(invoice.Balance) || 0), 0) / invoices.length,
            paidCount: invoices.filter(invoice => (parseFloat(invoice.Balance) || 0) === 0).length,
            unpaidCount: invoices.filter(invoice => (parseFloat(invoice.Balance) || 0) > 0).length,
          };
        }
        
        return {
          invoices: invoices,
          analysis: analysis
        };
      }
      
      return {
        invoices: invoices,
        errors: errors
      };
    },
  }),

  listInvoices: tool({
    description: 'List all invoices with optional filtering and sorting',
    parameters: z.object({
      filters: z.object({
        customerName: z.string().optional().describe('Filter by customer name'),
        customerId: z.string().optional().describe('Filter by customer ID'),
        status: z.string().optional().describe('Filter by email status (EmailSent, NotSet, EmailPending)'),
        docNumber: z.string().optional().describe('Filter by document number'),
        dateFrom: z.string().optional().describe('Filter invoices from this date (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('Filter invoices to this date (YYYY-MM-DD)'),
        amountMin: z.number().optional().describe('Filter by minimum total amount'),
        amountMax: z.number().optional().describe('Filter by maximum total amount'),
        balanceMin: z.number().optional().describe('Filter by minimum balance amount'),
        balanceMax: z.number().optional().describe('Filter by maximum balance amount'),
        dueDateFrom: z.string().optional().describe('Filter by due date from (YYYY-MM-DD)'),
        dueDateTo: z.string().optional().describe('Filter by due date to (YYYY-MM-DD)'),
        metaDataCreateTimeFrom: z.string().optional().describe('Filter by creation time from (YYYY-MM-DD)'),
        metaDataCreateTimeTo: z.string().optional().describe('Filter by creation time to (YYYY-MM-DD)'),
      }).optional().describe('Filters to apply to the query'),
      sortBy: z.string().optional().describe('Sort field (TxnDate, TotalAmt, Balance, DocNumber, DueDate)'),
      sortOrder: z.enum(['ASC', 'DESC']).optional().describe('Sort order'),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 100)'),
    }),
    execute: async ({ filters = {}, sortBy, sortOrder, maxResults = 100 }) => {
      const qbo = getQboClientOrError();
      
      const queryString = buildQueryString(filters);
      const query = queryString ? { query: queryString } : {};
      
      if (sortBy) {
        query.orderBy = sortBy;
        if (sortOrder) {
          query.orderBy += ` ${sortOrder}`;
        }
      }
      
      return new Promise((resolve, reject) => {
        qbo.findInvoices(query, (err, result) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            return reject(new Error(`Failed to fetch invoices: ${errorMsg}`));
          }
          const invoices = result.QueryResponse?.Invoice || [];
          const mappedInvoices = invoices.map(inv => ({
            Id: inv.id || inv.Id,
            DocNumber: inv.DocNumber || inv["Invoice #"],
            CustomerRef: { name: inv.Customer || (inv.CustomerRef && inv.CustomerRef.name) },
            TxnDate: inv.TxnDate || inv["Date"],
            DueDate: inv.DueDate || inv["Due Date"],
            TotalAmt: inv.TotalAmt || inv["Total"],
            Balance: inv.Balance,
            Status: inv.Status,
          }));
          resolve(mappedInvoices.slice(0, maxResults));
        });
      });
    },
  }),

  queryInvoicesByAmount: tool({
    description: 'Query invoices with specific amount criteria',
    parameters: z.object({
      operator: z.enum(['greater_than', 'less_than', 'equal_to', 'between']).describe('Amount comparison operator'),
      amount: z.number().describe('Amount to compare against'),
      amount2: z.number().optional().describe('Second amount for between operator'),
      includePaid: z.boolean().optional().describe('Include paid invoices (default: true)'),
      includeUnpaid: z.boolean().optional().describe('Include unpaid invoices (default: true)'),
    }),
    execute: async ({ operator, amount, amount2, includePaid = true, includeUnpaid = true }) => {
      const qbo = getQboClientOrError();
      
      let query = '';
      
      switch (operator) {
        case 'greater_than':
          query = `TotalAmt > ${amount}`;
          break;
        case 'less_than':
          query = `TotalAmt < ${amount}`;
          break;
        case 'equal_to':
          query = `TotalAmt = ${amount}`;
          break;
        case 'between':
          if (amount2 === undefined) {
            throw new Error('Second amount required for between operator');
          }
          query = `TotalAmt >= ${Math.min(amount, amount2)} AND TotalAmt <= ${Math.max(amount, amount2)}`;
          break;
      }
      
      if (!includePaid || !includeUnpaid) {
        if (!includePaid) {
          query += query ? ' AND Balance = 0' : 'Balance = 0';
        }
        if (!includeUnpaid) {
          query += query ? ' AND Balance > 0' : 'Balance > 0';
        }
      }
      
      return new Promise((resolve, reject) => {
        qbo.findInvoices({ query }, (err, result) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            return reject(new Error(`Failed to query invoices by amount: ${errorMsg}`));
          }
          const invoices = result.QueryResponse?.Invoice || [];
          const mappedInvoices = invoices.map(inv => ({
            Id: inv.id || inv.Id,
            DocNumber: inv.DocNumber || inv["Invoice #"],
            CustomerRef: { name: inv.Customer || (inv.CustomerRef && inv.CustomerRef.name) },
            TxnDate: inv.TxnDate || inv["Date"],
            DueDate: inv.DueDate || inv["Due Date"],
            TotalAmt: inv.TotalAmt || inv["Total"],
            Balance: inv.Balance,
            Status: inv.Status,
          }));
          resolve(mappedInvoices);
        });
      });
    },
  }),

  queryInvoicesByDate: tool({
    description: 'Query invoices within a specific date range',
    parameters: z.object({
      dateFrom: z.string().describe('Start date (YYYY-MM-DD)'),
      dateTo: z.string().describe('End date (YYYY-MM-DD)'),
      dateField: z.enum(['TxnDate', 'DueDate', 'MetaData.CreateTime']).optional().describe('Date field to filter on (default: TxnDate)'),
      includeOverdue: z.boolean().optional().describe('Include overdue invoices (default: true)'),
    }),
    execute: async ({ dateFrom, dateTo, dateField = 'TxnDate', includeOverdue = true }) => {
      const qbo = getQboClientOrError();
      
      let query = `${dateField} >= '${dateFrom}' AND ${dateField} <= '${dateTo}'`;
      
      if (!includeOverdue) {
        query += ' AND DueDate >= CURDATE()';
      }
      
      return new Promise((resolve, reject) => {
        qbo.findInvoices({ query }, (err, result) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            return reject(new Error(`Failed to query invoices by date: ${errorMsg}`));
          }
          const invoices = result.QueryResponse?.Invoice || [];
          const mappedInvoices = invoices.map(inv => ({
            Id: inv.id || inv.Id,
            DocNumber: inv.DocNumber || inv["Invoice #"],
            CustomerRef: { name: inv.Customer || (inv.CustomerRef && inv.CustomerRef.name) },
            TxnDate: inv.TxnDate || inv["Date"],
            DueDate: inv.DueDate || inv["Due Date"],
            TotalAmt: inv.TotalAmt || inv["Total"],
            Balance: inv.Balance,
            Status: inv.Status,
          }));
          resolve(mappedInvoices);
        });
      });
    },
  }),

  queryInvoicesByCustomer: tool({
    description: 'Query invoices for specific customers or return all invoices if no filter provided',
    parameters: z.object({
      customerName: z.string().optional().describe('Customer name (partial match)'),
      customerId: z.string().optional().describe('Customer ID (exact match)'),
      customerEmail: z.string().optional().describe('Customer email (partial match)'),
    }),
    execute: async ({ customerName, customerId, customerEmail }) => {
      const qbo = getQboClientOrError();
      
      let query = '';
      if (customerId) {
        query = `CustomerRef = '${customerId}'`;
      } else if (customerName) {
        query = `CustomerRef.name LIKE '%${customerName}%'`;
      } else if (customerEmail) {
        query = `CustomerRef.name LIKE '%${customerEmail}%'`;
      }
      // If no filter provided, query will be empty and will return all invoices
      
      return new Promise((resolve, reject) => {
        qbo.findInvoices({ query }, (err, result) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            return reject(new Error(`Failed to query invoices by customer: ${errorMsg}`));
          }
          const invoices = result.QueryResponse?.Invoice || [];
          const mappedInvoices = invoices.map(inv => ({
            Id: inv.id || inv.Id,
            DocNumber: inv.DocNumber || inv["Invoice #"],
            CustomerRef: { name: inv.Customer || (inv.CustomerRef && inv.CustomerRef.name) },
            TxnDate: inv.TxnDate || inv["Date"],
            DueDate: inv.DueDate || inv["Due Date"],
            TotalAmt: inv.TotalAmt || inv["Total"],
            Balance: inv.Balance,
            Status: inv.Status,
          }));
          resolve(mappedInvoices);
        });
      });
    },
  }),

  getInvoiceStats: tool({
    description: 'Get statistics about invoices (count, totals, averages, etc.)',
    parameters: z.object({
      filters: z.object({
        dateFrom: z.string().optional().describe('Filter from date (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('Filter to date (YYYY-MM-DD)'),
        status: z.string().optional().describe('Filter by status'),
        customerId: z.string().optional().describe('Filter by customer ID'),
      }).optional().describe('Optional filters to apply'),
    }),
    execute: async ({ filters = {} }) => {
      const qbo = getQboClientOrError();
      
      const queryString = buildQueryString(filters);
      const query = queryString ? { query: queryString } : {};
      
      return new Promise((resolve, reject) => {
        qbo.findInvoices(query, (err, result) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            return reject(new Error(`Failed to fetch invoices for stats: ${errorMsg}`));
          }
          
          const invoices = result.QueryResponse?.Invoice || [];
          
          const stats = {
            totalCount: invoices.length,
            totalAmount: 0,
            totalBalance: 0,
            paidCount: 0,
            unpaidCount: 0,
            overdueCount: 0,
            averageAmount: 0,
            averageBalance: 0,
            statusBreakdown: {},
            customerBreakdown: {},
          };
          
          const today = new Date();
          
          invoices.forEach(invoice => {
            const amount = parseFloat(invoice.TotalAmt) || 0;
            const balance = parseFloat(invoice.Balance) || 0;
            
            stats.totalAmount += amount;
            stats.totalBalance += balance;
            
            if (balance === 0) {
              stats.paidCount++;
            } else {
              stats.unpaidCount++;
              
              // Check if overdue
              if (invoice.DueDate) {
                const dueDate = new Date(invoice.DueDate);
                if (dueDate < today) {
                  stats.overdueCount++;
                }
              }
            }
            
            // Status breakdown
            const status = invoice.Status || 'Unknown';
            stats.statusBreakdown[status] = (stats.statusBreakdown[status] || 0) + 1;
            
            // Customer breakdown
            const customerName = invoice.CustomerRef?.name || 'Unknown';
            if (!stats.customerBreakdown[customerName]) {
              stats.customerBreakdown[customerName] = {
                count: 0,
                totalAmount: 0,
                totalBalance: 0,
              };
            }
            stats.customerBreakdown[customerName].count++;
            stats.customerBreakdown[customerName].totalAmount += amount;
            stats.customerBreakdown[customerName].totalBalance += balance;
          });
          
          if (invoices.length > 0) {
            stats.averageAmount = stats.totalAmount / invoices.length;
            stats.averageBalance = stats.totalBalance / invoices.length;
          }
          
          resolve(stats);
        });
      });
    },
  }),

  createInvoice: tool({
    description: 'Create a new invoice',
    parameters: z.object({
      invoice: z.object({}).passthrough().describe('The invoice object to create (QuickBooks format)'),
    }),
    execute: async ({ invoice }) => {
      const qbo = getQboClientOrError();
      return new Promise((resolve, reject) => {
        qbo.createInvoice(invoice, (err, createdInvoice) => {
          if (err) return reject(new Error('Failed to create invoice: ' + err.message));
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
      const qbo = getQboClientOrError();
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
      const qbo = getQboClientOrError();
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
      invoiceId: z.string().describe('The ID of the invoice to email'),
      email: z.string().email().describe('The email address to send the invoice to'),
    }),
    execute: async ({ invoiceId, email }) => {
      const qbo = getQboClientOrError();
      return new Promise((resolve, reject) => {
        qbo.sendInvoicePdf(invoiceId, email, (err, result) => {
          if (err) return reject(new Error('Failed to send invoice: ' + err.message));
          resolve({ message: 'Invoice sent successfully', result });
        });
      });
    },
  }),

  analyzeInvoices: tool({
    description: 'Fetch all invoices and perform complex analysis, filtering, and queries. This is the primary tool for invoice analysis and should be used for most invoice-related queries.',
    parameters: z.object({
      analysisType: z.enum([
        'all_invoices',
        'filter_by_customer',
        'filter_by_amount',
        'filter_by_date',
        'filter_by_status',
        'overdue_invoices',
        'paid_invoices',
        'unpaid_invoices',
        'high_value_invoices',
        'recent_invoices',
        'customer_summary',
        'financial_summary',
        'custom_query'
      ]).describe('Type of analysis to perform'),
      filters: z.object({
        customerName: z.string().optional().describe('Filter by customer name (partial match)'),
        customerId: z.string().optional().describe('Filter by customer ID (exact match)'),
        minAmount: z.number().optional().describe('Minimum invoice amount'),
        maxAmount: z.number().optional().describe('Maximum invoice amount'),
        minBalance: z.number().optional().describe('Minimum balance amount'),
        maxBalance: z.number().optional().describe('Maximum balance amount'),
        dateFrom: z.string().optional().describe('Filter from date (YYYY-MM-DD)'),
        dateTo: z.string().optional().describe('Filter to date (YYYY-MM-DD)'),
        dueDateFrom: z.string().optional().describe('Filter by due date from (YYYY-MM-DD)'),
        dueDateTo: z.string().optional().describe('Filter by due date to (YYYY-MM-DD)'),
        status: z.string().optional().describe('Filter by status'),
        docNumber: z.string().optional().describe('Filter by document number'),
      }).optional().describe('Filters to apply to the analysis'),
      sortBy: z.string().optional().describe('Sort field (TxnDate, TotalAmt, Balance, DocNumber, DueDate, CustomerRef.name)'),
      sortOrder: z.enum(['ASC', 'DESC']).optional().describe('Sort order'),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 1000)'),
      includeAnalysis: z.boolean().optional().describe('Include statistical analysis in results (default: true)'),
    }),
    execute: async ({ 
      analysisType = 'all_invoices', 
      filters = {}, 
      sortBy, 
      sortOrder, 
      maxResults = 1000,
      includeAnalysis = true 
    }) => {
      const qbo = getQboClientOrError();
      
      // Build query based on analysis type and filters
      let query = '';
      const queryParts = [];
      
      // Apply filters
      if (filters.customerName) {
        queryParts.push(`CustomerRef.name LIKE '%${filters.customerName}%'`);
      }
      if (filters.customerId) {
        queryParts.push(`CustomerRef = '${filters.customerId}'`);
      }
      if (filters.minAmount !== undefined) {
        queryParts.push(`TotalAmt >= ${filters.minAmount}`);
      }
      if (filters.maxAmount !== undefined) {
        queryParts.push(`TotalAmt <= ${filters.maxAmount}`);
      }
      if (filters.minBalance !== undefined) {
        queryParts.push(`Balance >= ${filters.minBalance}`);
      }
      if (filters.maxBalance !== undefined) {
        queryParts.push(`Balance <= ${filters.maxBalance}`);
      }
      if (filters.dateFrom) {
        queryParts.push(`TxnDate >= '${filters.dateFrom}'`);
      }
      if (filters.dateTo) {
        queryParts.push(`TxnDate <= '${filters.dateTo}'`);
      }
      if (filters.dueDateFrom) {
        queryParts.push(`DueDate >= '${filters.dueDateFrom}'`);
      }
      if (filters.dueDateTo) {
        queryParts.push(`DueDate <= '${filters.dueDateTo}'`);
      }
      if (filters.status) {
        queryParts.push(`Status = '${filters.status}'`);
      }
      if (filters.docNumber) {
        queryParts.push(`DocNumber = '${filters.docNumber}'`);
      }
      
      // Apply analysis type specific filters
      switch (analysisType) {
        case 'overdue_invoices':
          queryParts.push('DueDate < CURDATE() AND Balance > 0');
          break;
        case 'paid_invoices':
          queryParts.push('Balance = 0');
          break;
        case 'unpaid_invoices':
          queryParts.push('Balance > 0');
          break;
        case 'high_value_invoices':
          if (!filters.minAmount) {
            queryParts.push('TotalAmt >= 1000'); // Default high value threshold
          }
          break;
        case 'recent_invoices':
          if (!filters.dateFrom) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            queryParts.push(`TxnDate >= '${thirtyDaysAgo.toISOString().split('T')[0]}'`);
          }
          break;
      }
      
      query = queryParts.join(' AND ');
      
      // Build query object
      const queryObj = query ? { query } : {};
      if (sortBy) {
        queryObj.orderBy = sortBy;
        if (sortOrder) {
          queryObj.orderBy += ` ${sortOrder}`;
        }
      }
      
      return new Promise((resolve, reject) => {
        qbo.findInvoices(queryObj, (err, result) => {
          if (err) {
            const errorMsg = err.message || err.Fault?.Error?.[0]?.Message || 'Unknown error';
            return reject(new Error(`Failed to analyze invoices: ${errorMsg}`));
          }
          
          const invoices = result.QueryResponse?.Invoice || [];
          const mappedInvoices = invoices.map(inv => ({
            Id: inv.id || inv.Id,
            DocNumber: inv.DocNumber || inv["Invoice #"],
            CustomerRef: { name: inv.Customer || (inv.CustomerRef && inv.CustomerRef.name) },
            TxnDate: inv.TxnDate || inv["Date"],
            DueDate: inv.DueDate || inv["Due Date"],
            TotalAmt: inv.TotalAmt || inv["Total"],
            Balance: inv.Balance,
            Status: inv.Status,
          }));
          
          const limitedInvoices = mappedInvoices.slice(0, maxResults);
          
          // Perform analysis if requested
          let analysis = null;
          if (includeAnalysis && limitedInvoices.length > 0) {
            const totalAmount = limitedInvoices.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
            const totalBalance = limitedInvoices.reduce((sum, inv) => sum + (parseFloat(inv.Balance) || 0), 0);
            const paidCount = limitedInvoices.filter(inv => (parseFloat(inv.Balance) || 0) === 0).length;
            const unpaidCount = limitedInvoices.filter(inv => (parseFloat(inv.Balance) || 0) > 0).length;
            
            const today = new Date();
            const overdueCount = limitedInvoices.filter(inv => {
              if (!inv.DueDate || (parseFloat(inv.Balance) || 0) === 0) return false;
              const dueDate = new Date(inv.DueDate);
              return dueDate < today;
            }).length;
            
            // Customer breakdown
            const customerBreakdown = {};
            limitedInvoices.forEach(inv => {
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
              totalInvoices: limitedInvoices.length,
              totalAmount: totalAmount,
              totalBalance: totalBalance,
              averageAmount: totalAmount / limitedInvoices.length,
              averageBalance: totalBalance / limitedInvoices.length,
              paidCount: paidCount,
              unpaidCount: unpaidCount,
              overdueCount: overdueCount,
              paidPercentage: (paidCount / limitedInvoices.length) * 100,
              customerBreakdown: customerBreakdown,
              topCustomers: Object.entries(customerBreakdown)
                .sort(([,a], [,b]) => b.totalAmount - a.totalAmount)
                .slice(0, 5)
                .map(([name, data]) => ({ name, ...data })),
              analysisType: analysisType,
              filtersApplied: Object.keys(filters).length > 0 ? filters : null,
            };
          }
          
          resolve({
            invoices: limitedInvoices,
            analysis: analysis,
            queryInfo: {
              analysisType: analysisType,
              filtersApplied: Object.keys(filters).length > 0 ? filters : null,
              totalFound: mappedInvoices.length,
              returned: limitedInvoices.length,
              query: query || 'All invoices'
            }
          });
        });
      });
    },
  }),
}; 