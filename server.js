require('dotenv').config();
const cors = require('cors');

const express = require('express');
const bodyParser = require('body-parser');

const authRoutes = require('./routes/auth.js');
const invoiceRoutes = require('./routes/invoices.js');
const aiRoutes = require('./routes/ai.js');

const app = express();


app.use(bodyParser.json());
app.use(cors());

// Routes
app.use('/auth', authRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/ai', aiRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});
