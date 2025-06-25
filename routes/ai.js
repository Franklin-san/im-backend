import { generateText, streamText } from 'ai';
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

// Non-streaming AI invoke endpoint
router.post('/invoke', async (req, res) => {
  try {
    const { messages: userMessages, maxSteps = 5, toolChoice = 'auto' } = req.body;
    
    const messages = userMessages || [];
    console.log('Processing AI request with messages:', messages.length);

    // Check if we need QuickBooks tokens (only if tools are being used)
    const needsTokens = toolChoice === 'auto' || toolChoice === 'required';
    let toolContext = null;
    
    if (needsTokens) {
      const tokens = getStoredTokens();
      if (!tokens || !tokens.access_token || !tokens.realm_id) {
        return res.status(400).json({ 
          error: 'QuickBooks authentication required for invoice operations. Please visit /auth/start to authenticate.',
          needsAuth: true
        });
      }
      toolContext = {
        accessToken: tokens.access_token,
        realmId: tokens.realm_id
      };
    }

    const { text, toolResults, steps } = await generateText({
      model: model1,
      messages,
      tools: needsTokens ? invoiceTools : undefined,
      maxSteps,
      toolChoice: needsTokens ? toolChoice : 'none',
      toolContext,
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        console.log('Step completed:', { text: text?.slice(0, 100), toolCalls: toolCalls?.length, toolResults: toolResults?.length });
      },
    });

    console.log('AI result:', { 
      text: text?.slice(0, 200), 
      toolResults: toolResults?.length,
      steps: steps?.length 
    });
    
    res.json({ text, toolResults, steps });
  } catch (error) {
    console.error('AI invoke error:', error);
    
    // Handle specific tool-related errors
    if (error.name === 'NoSuchToolError') {
      return res.status(400).json({ error: 'Invalid tool request', details: error.message });
    } else if (error.name === 'InvalidToolArgumentsError') {
      return res.status(400).json({ error: 'Invalid tool parameters', details: error.message });
    } else if (error.name === 'ToolExecutionError') {
      return res.status(500).json({ error: 'Tool execution failed', details: error.message });
    }
    
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Streaming AI endpoint for real-time chat experience
router.post('/stream', async (req, res) => {
  try {
    const { messages: userMessages, maxSteps = 5, toolChoice = 'auto' } = req.body;
    
    const messages = userMessages || [];
    
    // Check if we need QuickBooks tokens (only if tools are being used)
    const needsTokens = toolChoice === 'auto' || toolChoice === 'required';
    let toolContext = null;
    
    if (needsTokens) {
      const tokens = getStoredTokens();
      if (!tokens || !tokens.access_token || !tokens.realm_id) {
        return res.status(400).json({ 
          error: 'QuickBooks authentication required for invoice operations. Please visit /auth/start to authenticate.',
          needsAuth: true
        });
      }
      toolContext = {
        accessToken: tokens.access_token,
        realmId: tokens.realm_id
      };
    }
    
    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Use generateText instead of streamText
    const { text, toolResults, steps } = await generateText({
      model: model1,
      messages,
      tools: needsTokens ? invoiceTools : undefined,
      maxSteps,
      toolChoice: needsTokens ? toolChoice : 'none',
      toolContext,
    });

    // Simulate streaming by sending text in chunks
    if (text) {
      const words = text.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
        // Small delay to simulate real streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Send tool results if any
    if (toolResults && toolResults.length > 0) {
      for (const result of toolResults) {
        res.write(`data: ${JSON.stringify({ type: 'tool-result', result })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ type: 'finish', text, toolResults })}\n\n`);
    res.end();

  } catch (error) {
    console.error('AI stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
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