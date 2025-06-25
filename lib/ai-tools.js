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
          if (err) return reject(new Error('Failed to fetch invoice: ' + err.message));
          resolve(invoice);
        });
      });
    },
  }),
  listInvoices: tool({
    description: 'List all invoices',
    parameters: z.object({}),
    execute: async () => {
      const qbo = getQboClientOrError();
      return new Promise((resolve, reject) => {
        qbo.findInvoices({}, (err, invoices) => {
          if (err) return reject(new Error('Failed to fetch invoices: ' + err.message));
          resolve(invoices.QueryResponse?.Invoice || []);
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
}; 