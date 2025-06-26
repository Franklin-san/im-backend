import { generateText, streamText } from 'ai';
import express from 'express';
import cors from 'cors';
import { openai } from '@ai-sdk/openai';
import { OpenAI } from 'openai';
import { invoiceTools } from '../lib/ai-tools.js';
import { getStoredTokens } from '../lib/qbo.js';

const router = express.Router();
router.use(cors());

const model1 = openai('gpt-4o', {
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are an intelligent QuickBooks Invoice Management Assistant. You are designed to help users manage, analyze, and understand their invoice data efficiently.

## TOOL USAGE RULES
- Only use invoice tools when the user is asking for invoice data or actions (like show, list, create, update, delete, or email invoices).
- For general questions about invoices, QuickBooks, or the app, respond conversationally and do NOT use any tools.

## MULTIPLE INVOICE QUERIES
- If the user asks for multiple invoices by ID, you may call the getInvoice tool multiple times (once for each ID), or use listInvoices and filter by ID.
- When returning invoice data, only include these fields for each invoice: id, Invoice # (DocNumber), Customer (CustomerRef.name), Date (TxnDate), Due Date (DueDate), Total (TotalAmt), Balance (Balance), Status (Paid/Unpaid/Partial based on Balance).
- Always summarize the result in a plain text paragraph (no markdown, no bullet points, no formatting). Example: 'Here are 3 invoices. The highest balance is $500 for invoice 2. The total amount is $1200.'
- After the summary, always include the delimited JSON block for the UI, but the JSON should only contain the specified fields for each invoice.

## SINGLE INVOICE QUERIES
- For a single invoice, provide a concise summary in plain text, then the delimited JSON block with only the specified fields.

## RESPONSE FORMAT
- For invoice queries: summary paragraph, then delimited JSON block.
- For general chat: respond conversationally, do not use tools, do not include any JSON or delimiters.

## EXAMPLES
User: 'Show me invoices 1, 2, 3'
Agent: 'Here are 3 invoices. The highest balance is $500 for invoice 2. The total amount is $1200.'
===INVOICE_DATA_START===
[ ... ]
===INVOICE_DATA_END===

User: 'What is QuickBooks?'
Agent: 'QuickBooks is an accounting software platform for small and medium-sized businesses.'

Remember: Only use tools for invoice data requests. Always summarize in plain text. Only include the specified fields in the JSON.`;

function generateInvoiceSummary(invoices) {
  if (!Array.isArray(invoices) || invoices.length === 0) return '';
  if (invoices.length === 1) {
    const inv = invoices[0];
    return `Here is invoice #${inv.DocNumber} for ${inv.CustomerRef?.name || 'Unknown'}: $${inv.TotalAmt} (Balance: $${inv.Balance}).`;
  }
  const max = invoices.reduce((a, b) => (parseFloat(a.Balance) > parseFloat(b.Balance) ? a : b));
  const total = invoices.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
  return `Here are ${invoices.length} invoices. The highest balance is $${max.Balance} for invoice #${max.DocNumber}. The total amount is $${total}.`;
}

// Non-streaming AI invoke endpoint
router.post('/invoke', async (req, res) => {
  try {
    const { messages: userMessages, maxSteps = 5, conversationId } = req.body;
    
    // Prepend the system prompt
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(userMessages || [])
    ];
    
    console.log(`Processing AI request for conversation ${conversationId || 'unknown'}:`, {
      messageCount: messages.length,
      lastUserMessage: userMessages?.[userMessages.length - 1]?.content?.slice(0, 100)
    });

    // Let the AI decide when to use tools
    const toolChoice = 'auto';
    const needsTokens = true;
    let toolContext = null;
    
    if (needsTokens) {
      const tokens = getStoredTokens();
      if (!tokens || !tokens.access_token || !tokens.realm_id) {
        return res.status(400).json({ 
          error: 'QuickBooks authentication required for invoice operations. Please visit /auth/start to authenticate.',
          needsAuth: true,
          conversationId
        });
      }
      toolContext = {
        accessToken: tokens.access_token,
        realmId: tokens.realm_id
      };
    }

    // Enhanced step tracking for better debugging
    let stepCount = 0;
    const stepLogs = [];

    const { text, toolResults, steps } = await generateText({
      model: model1,
      messages,
      tools: invoiceTools,
      maxSteps,
      toolChoice,
      toolContext,
      onStepFinish: ({ text, toolCalls, toolResults, step }) => {
        stepCount++;
        const stepLog = {
          step: stepCount,
          text: text?.slice(0, 200),
          toolCalls: toolCalls?.map(tc => ({ name: tc.toolName, args: tc.args })),
          toolResults: toolResults?.length || 0,
          timestamp: new Date().toISOString()
        };
        stepLogs.push(stepLog);
        
        console.log(`Step ${stepCount} completed:`, {
          text: stepLog.text,
          toolCalls: stepLog.toolCalls?.length || 0,
          toolResults: stepLog.toolResults
        });
      },
    });

    console.log('AI result:', { 
      text: text?.slice(0, 200), 
      toolResults: toolResults?.length,
      steps: steps?.length,
      conversationId
    });
    
    // Determine if the last step used an invoice tool
    const lastToolCall = stepLogs
      .flatMap(log => log.toolCalls || [])
      .filter(tc => tc && tc.name)
      .pop();

    const invoiceToolNames = [
      'getInvoice', 'getMultipleInvoices', 'listInvoices',
      'queryInvoicesByAmount', 'queryInvoicesByDate',
      'queryInvoicesByCustomer', 'getInvoiceStats'
    ];
    const isInvoiceTool = lastToolCall && invoiceToolNames.includes(lastToolCall.name);

    let finalText = text;
    if ((!finalText || !finalText.trim()) && isInvoiceTool && toolResults && toolResults.length > 0) {
      let invoiceData = toolResults.map(tr => tr.result || tr);
      finalText = generateInvoiceSummary(invoiceData);
    }
    if (!finalText || !finalText.trim()) {
      finalText = 'I processed your request but did not receive a response.';
    }

    // Only append delimited JSON if an invoice tool was used and results are present
    if (isInvoiceTool && toolResults && toolResults.length > 0) {
      // Extract invoice data from toolResults (handle .result or direct)
      let invoiceData = toolResults.map(tr => tr.result || tr);
      // If the AI returned custom/flat fields, map them to standard names
      const mapped = invoiceData.map(inv => ({
        Id: inv.id || inv.Id,
        DocNumber: inv.DocNumber || inv["Invoice #"],
        CustomerRef: { name: inv.Customer || (inv.CustomerRef && inv.CustomerRef.name) },
        TxnDate: inv.TxnDate || inv["Date"],
        DueDate: inv.DueDate || inv["Due Date"],
        TotalAmt: inv.TotalAmt || inv["Total"],
        Balance: inv.Balance,
        Status: inv.Status,
      }));
      finalText += '\n\n===INVOICE_DATA_START===\n';
      finalText += JSON.stringify(mapped, null, 2);
      finalText += '\n===INVOICE_DATA_END===';
    }
    
    // Enhanced response object with more context
    const response = {
      text: finalText,
      toolResults,
      steps: steps?.length || 0,
      stepLogs,
      conversationId,
      timestamp: new Date().toISOString(),
      success: true
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('AI invoke error:', error);
    
    // Enhanced error handling with specific error types
    let errorResponse = {
      error: 'An error occurred while processing your request',
      details: error.message,
      conversationId: req.body.conversationId,
      timestamp: new Date().toISOString(),
      success: false
    };
    
    if (error.name === 'NoSuchToolError') {
      errorResponse.error = 'Invalid tool request';
      errorResponse.details = error.message;
      errorResponse.errorType = 'INVALID_TOOL';
    } else if (error.name === 'InvalidToolArgumentsError') {
      errorResponse.error = 'Invalid tool parameters';
      errorResponse.details = error.message;
      errorResponse.errorType = 'INVALID_PARAMETERS';
    } else if (error.name === 'ToolExecutionError') {
      errorResponse.error = 'Tool execution failed';
      errorResponse.details = error.message;
      errorResponse.errorType = 'TOOL_EXECUTION_ERROR';
      
      // Provide helpful suggestions based on error type
      if (error.message.includes('not found')) {
        errorResponse.suggestion = 'The requested invoice or data may not exist. Try listing all invoices first to see what\'s available.';
      } else if (error.message.includes('authentication')) {
        errorResponse.suggestion = 'Please check your QuickBooks connection and try again.';
      } else if (error.message.includes('permission')) {
        errorResponse.suggestion = 'You may not have permission to access this data. Please check your QuickBooks permissions.';
      }
    } else if (error.message.includes('rate limit')) {
      errorResponse.error = 'Too many requests';
      errorResponse.details = 'Please wait a moment and try again.';
      errorResponse.errorType = 'RATE_LIMIT';
    } else if (error.message.includes('network')) {
      errorResponse.error = 'Network error';
      errorResponse.details = 'Unable to connect to QuickBooks. Please check your internet connection.';
      errorResponse.errorType = 'NETWORK_ERROR';
    }
    
    res.status(500).json(errorResponse);
  }
});

// Streaming AI endpoint for real-time chat experience
router.post('/stream', async (req, res) => {
  try {
    const { messages: userMessages, maxSteps = 5 } = req.body;
    
    // Prepend the system prompt
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(userMessages || [])
    ];
    // Always require tool usage for invoice data
    const toolChoice = 'auto';
    const needsTokens = true;
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
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    // Use generateText instead of streamText
    const { text, toolResults, steps } = await generateText({
      model: model1,
      messages,
      tools: invoiceTools,
      maxSteps,
      toolChoice,
      toolContext,
    });
    // Simulate streaming by sending text in chunks
    if (text) {
      const words = text.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    if (toolResults && toolResults.length > 0) {
      for (const result of toolResults) {
        res.write(`data: ${JSON.stringify({ type: 'tool-result', result })}\n\n`);
      }
    }
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