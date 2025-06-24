require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const authRoutes = require('./routes/auth.js');
const invoiceRoutes = require('./routes/invoices.js');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Routes
app.use('/auth', authRoutes);
app.use('/invoices', invoiceRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
