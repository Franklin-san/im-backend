const express = require('express');
const router = express.Router();
const { invoiceTools } = require('../lib/ai-tools');
const { streamText } = require('ai');

// POST /ai/invoke
router.post('/invoke', async (req, res) => {
  try {
    const { messages, toolChoice, maxSteps, model } = req.body;
    // Set sensible defaults
    const tool_choice = toolChoice || 'auto';
    const steps = maxSteps || 3;
    const aiModel = model || 'gpt-3.5-turbo'; // Change as needed

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const result = await streamText({
      model: aiModel,
      tools: invoiceTools,
      maxSteps: steps,
      toolChoice: tool_choice,
      messages,
      apiKey: process.env.OPENAI_API_KEY,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 