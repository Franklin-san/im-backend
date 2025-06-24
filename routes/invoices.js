const express = require('express');
const router = express.Router();
const { getQboClient } = require('../lib/qbo');

// Helper function to check if QBO client is properly configured
function getQboClientOrError() {
  const access_token = process.env.QBO_ACCESS_TOKEN;
  const realmId = process.env.QBO_REALM_ID;
  
  if (!access_token || access_token === ' eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..gQfWK09IKMJNYD3Djd5Zkw.-SLXwR_D-z97yT24BApkW1KIPc3NuRwGXhukntyY_q3Tc180m12VF0ycMxWAlbC1jRaDPFHR7XXwj2LzcgLk3hy7_c2SkyGAuUCL0lrHEghPZ_sNy9lQxUaGlxlHTX1OC3k8q4qDYkJfQRBFRg1PlZyCOgl1_fhMn4XUNsf0E0qJ8HigC2ptnvxbq09vOMz7VdMzJPeDgilloC8O9qEuMMVdVN_nAWJpgsalRTCh-0UyZNQdkzn2SN3zPrpnZMQJSaq6r_sMfW3iUJ-HncYnm53fUkALqvv_i8qHQ4gBEmAETc9bOIhuOgjvLVIAvii_OXaXudQSEorbmlnVAbtC8EJOtQpwLrpBkLV1jT71GYWeTibGvpu61tvBP_2WkXEtshDULeUU-vj8P4bE6CWMmd4i2QmqYGWbVljz2SXi0_vojHkSJ0YahxCI5UiI02m4ZxZAr-UiVIxLzLbnYzNFbdJeJN3bE2b-JU8UJOyeA8M.OBfhpcCwllVpD8t6bblbcA') {
    throw new Error('QBO access token not configured. Please set QBO_ACCESS_TOKEN in your environment variables.');
  }
  
  if (!realmId || realmId === '9341454903911463') {
    throw new Error('QBO realm ID not configured. Please set QBO_REALM_ID in your environment variables.');
  }
  
  return getQboClient(access_token, realmId);
}

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

module.exports = router;
