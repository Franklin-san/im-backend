import { generateText } from 'ai';
import express from 'express';
import cors from 'cors';
import { openai } from '@ai-sdk/openai';
import { OpenAI } from 'openai';
import { invoiceTools } from '../lib/ai-tools.js';
import { getStoredTokens } from '../lib/qbo.js';

const router = express.Router();
router.use(cors());

const model1 = openai('gpt-4', {
  apiKey: process.env.OPENAI_API_KEY,
});

router.post('/invoke', async (req, res) => {
  try {
    const { messages: userMessages } = req.body;
    const tokens = getStoredTokens();

    if (!tokens || !tokens.access_token || !tokens.realm_id) {
      return res.status(400).json({ error: 'Access token or realmId missing. Please authenticate.' });
    }

    const messages = userMessages || [];
    console.log('Messages:', messages);

    const { text, toolResults, steps } = await generateText({
      model: model1,
      messages,
      tools: invoiceTools,
      toolContext: {
        accessToken: tokens.access_token,
        realmId: tokens.realm_id
      },
    });

    console.log('AI result:', { text, toolResults });
    res.json({ text, toolResults, steps });
  } catch (error) {
    console.error('AI invoke error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Temporary test route for OpenAI API key and model
router.post('/test', async (req, res) => {
  try {
    const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello, what can you do?' }],
    });
    const text = completion.choices[0].message.content;
    console.log('OpenAI completion:', text);
    res.json({ text });
  } catch (error) {
    console.error('OpenAI test error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 