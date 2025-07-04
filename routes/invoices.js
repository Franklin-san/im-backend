import express from 'express';
import { getQboClientFromStorage, hasValidTokens, getStoredTokens } from '../lib/qbo.js';
import QuickBooks from 'node-quickbooks';
import { invoiceTools } from '../lib/ai-tools.js';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const router = express.Router();

// Helper function to get QBO client with proper error handling
function getQboClientOrError() {
  if (!hasValidTokens()) {
    throw new Error('No valid tokens available. Please complete OAuth flow first by visiting /auth/start');
  }
  const tokens = getStoredTokens();
  const qbo = new QuickBooks(
    process.env.CLIENT_ID,           // clientId
    process.env.CLIENT_SECRET,       // clientSecret  
    tokens.access_token,              // accessToken
    false,                          // refreshToken
    tokens.realm_id,                 // realmId
    process.env.NODE_ENV !== 'production', // useSandbox
    process.env.NODE_ENV !== 'production', // debug
    null,                           // minorversion
    '2.0',                          // oauthversion
    process.env.CLIENT_SECRET        // tokenSecret (using client secret)
  );
  return qbo;
}

// GET /invoices/status - Check token status
router.get('/status', (req, res) => {
  try {
    const tokens = getStoredTokens();
    const isValid = hasValidTokens();
    
    res.json({
      tokens_available: isValid,
      message: isValid ? 'Tokens are available and valid' : 'No valid tokens available',
      token_info: {
        has_access_token: !!tokens.access_token,
        has_realm_id: !!tokens.realm_id,
        has_refresh_token: !!tokens.refresh_token,
        expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
        is_expired: tokens.expires_at ? Date.now() > tokens.expires_at : false
      },
      next_steps: isValid ? 
        'You can now use the invoice endpoints' : 
        'Visit /auth/start to authenticate with QuickBooks'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /invoices/:id
router.get('/:id', (req, res) => {
  try {
    const qbo = getQboClientOrError();
    qbo.getInvoice(req.params.id, (err, invoice) => {
      if (err) {
        console.error('QBO Error:', err);
        return res.status(500).json({ error: 'Failed to fetch invoice', details: err.message });
      }
      res.json(invoice);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /invoices (list)
router.get('/', (req, res) => {
  try {
    const qbo = getQboClientOrError();
    qbo.findInvoices({}, (err, invoices) => {
      if (err) {
        console.error('QBO Error:', err);
        return res.status(500).json({ error: 'Failed to fetch invoices', details: err.message });
      }
      res.json(invoices.QueryResponse?.Invoice || []);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /invoices (create)
router.post('/', (req, res) => {
  try {
    const qbo = getQboClientOrError();
    const newInvoice = req.body;
    
    if (!newInvoice || Object.keys(newInvoice).length === 0) {
      return res.status(400).json({ error: 'Invoice data is required' });
    }
    
    qbo.createInvoice(newInvoice, (err, createdInvoice) => {
      if (err) {
        console.error('QBO Error:', err);
        return res.status(500).json({ error: 'Failed to create invoice', details: err.message });
      }
      res.status(201).json(createdInvoice);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /invoices/:id (update)
router.put('/:id', (req, res) => {
  try {
    const qbo = getQboClientOrError();
    const updatedInvoice = req.body;
    
    if (!updatedInvoice || Object.keys(updatedInvoice).length === 0) {
      return res.status(400).json({ error: 'Invoice data is required' });
    }
    
    // Ensure the invoice has the correct ID
    updatedInvoice.Id = req.params.id;
    
    qbo.updateInvoice(updatedInvoice, (err, invoice) => {
      if (err) {
        console.error('QBO Error:', err);
        return res.status(500).json({ error: 'Failed to update invoice', details: err.message });
      }
      res.json(invoice);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /invoices/:id
router.delete('/:id', (req, res) => {
  try {
    const qbo = getQboClientOrError();
    qbo.deleteInvoice(req.params.id, (err, result) => {
      if (err) {
        console.error('QBO Error:', err);
        return res.status(500).json({ error: 'Failed to delete invoice', details: err.message });
      }
      res.json({ message: 'Invoice deleted successfully', result });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /invoices/:id/email
router.post('/:id/email', (req, res) => {
  try {
    const qbo = getQboClientOrError();
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    
    qbo.sendInvoicePdf(req.params.id, email, (err, result) => {
      if (err) {
        console.error('QBO Error:', err);
        return res.status(500).json({ error: 'Failed to send invoice', details: err.message });
      }
      res.json({ message: 'Invoice sent successfully', result });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/invoke', async (req, res) => {
  try {
    const { messages, toolChoice, maxSteps, model } = req.body;
    const systemPrompt = "You are an AI assistant for invoice management. You can answer questions and perform invoice actions.";
    const accessToken = process.env.QBO_ACCESS_TOKEN; // Or however you get it
    const realmId = process.env.QBO_REALM_ID;         // Or however you get it

    // Create the OpenAI model instance
    const model1 = openai(model || 'gpt-4', {
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Generate text with tools and context
    const { text, toolResults } = await generateText({
      model: model1,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages // user and assistant messages
      ],
      tools: invoiceTools,
      toolContext: { accessToken, realmId },
      maxSteps: maxSteps || 3,
      toolChoice: toolChoice || 'auto',
    });

    // Send only the text and tool results to the frontend
    res.json({ text, toolResults });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
