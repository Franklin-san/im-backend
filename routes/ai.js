import { generateText, streamText } from 'ai';
import express from 'express';
import cors from 'cors';
import { openai } from '@ai-sdk/openai';
import { OpenAI } from 'openai';
import { invoiceTools } from '../lib/ai-tools.js';
import { getValidTokens } from '../lib/tokenRefresh.js';
import { hasValidTokens } from '../lib/qbo.js';

const router = express.Router();
router.use(cors());

const model1 = openai('gpt-4o', {
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are an intelligent QuickBooks Invoice Management Assistant. You are designed to help users manage, analyze, and understand their invoice data efficiently.

## PRIMARY TOOL: analyzeInvoices
The 'analyzeInvoices' tool is your main tool for invoice queries. Use it for:
- "Show all invoices" → analysisType: 'all_invoices'
- "Show invoices for [customer]" → analysisType: 'filter_by_customer', filters: {customerName: 'customer'}
- "Show overdue invoices" → analysisType: 'overdue_invoices'
- "Show paid invoices" → analysisType: 'paid_invoices'
- "Show unpaid invoices" → analysisType: 'unpaid_invoices'
- "Show high value invoices" → analysisType: 'high_value_invoices'
- "Show recent invoices" → analysisType: 'recent_invoices'
- "Show invoices over $1000" → analysisType: 'filter_by_amount', filters: {minAmount: 1000}
- "Show invoices from last month" → analysisType: 'filter_by_date', filters: {dateFrom: '2024-05-01', dateTo: '2024-05-31'}
- "Show invoices sorted by amount" → analysisType: 'all_invoices', sortBy: 'TotalAmt', sortOrder: 'DESC'

## INVOICE CREATION WITH DUMMY DATA
When creating invoices using the 'createInvoice' tool, if required fields are missing, the system will automatically fill them with dummy data:

**Required Fields:**
- CustomerRef: Reference to customer (use Customer.Id for value, Customer.DisplayName for name)
- Line: Array of line items (minimum 1 required)

**Line Item Types:**
- SalesItemLineDetail: Individual products/services
- GroupLine: Grouped items  
- DescriptionOnlyLine: Text-only lines (for subtotals, notes)

**Example Invoice Structure:**
{
  "CustomerRef": {
    "value": "111",
    "name": "Customer Name"
  },
  "Line": [
    {
      "DetailType": "SalesItemLineDetail",
      "Amount": 100.0,
      "SalesItemLineDetail": {
        "ItemRef": {
          "name": "Services",
          "value": "1"
        }
      }
    }
  ]
}

**Dummy Data Used When Missing:**
- CustomerRef: { "value": "1", "name": "Sample Customer" }
- Line items: Default SalesItemLineDetail with $100 amount and "Services" item
- TxnDate: Current date
- DueDate: 30 days from current date

## TOOL USAGE RULES
- Use 'analyzeInvoices' for most invoice queries - it's the most powerful and flexible tool
- Only use other invoice tools for specific operations (getInvoice for single invoice, createInvoice, updateInvoice, deleteInvoice, emailInvoice)
- For general questions about invoices, QuickBooks, or the app, respond conversationally and do NOT use any tools

## RESPONSE FORMAT FOR INVOICE QUERIES
When using analyzeInvoices or other invoice tools:
1. **Summary**: Write a natural, conversational summary in PLAIN TEXT ONLY (no markdown, no bullet points, no formatting). Include key insights like:
   - Number of invoices found
   - Total amounts and balances
   - Payment status breakdown
   - Top customers (if relevant)
   - Any notable patterns or insights
2. **JSON Data**: Always include the delimited JSON block for the frontend table

## SUMMARY EXAMPLES (PLAIN TEXT ONLY)
- "I found 15 invoices totaling $45,200. 8 are paid ($28,500) and 7 are unpaid ($16,700). The highest unpaid balance is $5,200 for ABC Company."
- "There are 3 overdue invoices totaling $8,900. All are from different customers and range from $1,200 to $4,500."
- "I found 25 invoices for Cool Cars totaling $67,800. 12 are paid ($32,400) and 13 are unpaid ($35,400)."

## JSON FORMAT
Always use these exact field names in the JSON:
- Id: invoice ID
- DocNumber: invoice number
- CustomerRef: { name: customer name }
- TxnDate: transaction date
- DueDate: due date
- TotalAmt: total amount
- Balance: remaining balance
- Status: invoice status

## CRITICAL FORMAT RULES
- Write summary in PLAIN TEXT ONLY - no markdown, no bullet points, no formatting
- Always include the exact delimiters: ===INVOICE_DATA_START=== and ===INVOICE_DATA_END===
- The JSON must be between these delimiters
- Do not include any other formatting or markdown in the response
- Do not include "Here's a breakdown" or similar phrases
- Do not include bullet points or numbered lists
- Do not include markdown formatting like **bold** or \`\`\`json\`\`\`

## EXAMPLES
User: "Show me all invoices"
Agent: "I found 42 invoices in your system totaling $156,800. 28 are paid ($98,400) and 14 are unpaid ($58,400). The average invoice amount is $3,733. Your top customer is ABC Company with 8 invoices totaling $24,600."
===INVOICE_DATA_START===
[ ... ]
===INVOICE_DATA_END===

User: "Show overdue invoices"
Agent: "I found 7 overdue invoices totaling $23,400. These are all unpaid invoices with due dates in the past. The oldest overdue invoice is from March 15th for $4,200."
===INVOICE_DATA_START===
[ ... ]
===INVOICE_DATA_END===

User: "What is QuickBooks?"
Agent: "QuickBooks is an accounting software platform for small and medium-sized businesses."

Remember: Use analyzeInvoices for most queries. Write natural summaries in PLAIN TEXT ONLY. Always include the JSON block with exact delimiters for invoice data. NO MARKDOWN FORMATTING.`;

function generateInvoiceSummary(invoices) {
  if (!Array.isArray(invoices) || invoices.length === 0) return '';
  
  // Handle analyzeInvoices response format
  if (invoices.length === 1 && invoices[0] && invoices[0].invoices) {
    const result = invoices[0];
    const invoiceList = result.invoices;
    const analysis = result.analysis;
    
    if (invoiceList.length === 0) {
      return 'No invoices found matching your criteria.';
    }
    
    if (invoiceList.length === 1) {
      const inv = invoiceList[0];
      return `I found 1 invoice: #${inv.DocNumber} for ${inv.CustomerRef?.name || 'Unknown'} - $${inv.TotalAmt} (Balance: $${inv.Balance}).`;
    }
    
    if (analysis) {
      return `I found ${analysis.totalInvoices} invoices totaling $${analysis.totalAmount.toFixed(2)}. ${analysis.paidCount} are paid ($${analysis.totalAmount - analysis.totalBalance}) and ${analysis.unpaidCount} are unpaid ($${analysis.totalBalance.toFixed(2)}).`;
    }
    
    const total = invoiceList.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
    const balance = invoiceList.reduce((sum, inv) => sum + (parseFloat(inv.Balance) || 0), 0);
    return `I found ${invoiceList.length} invoices totaling $${total.toFixed(2)}. The total outstanding balance is $${balance.toFixed(2)}.`;
  }
  
  // Handle direct invoice arrays (legacy format)
  if (invoices.length === 1) {
    const inv = invoices[0];
    return `Here is invoice #${inv.DocNumber} for ${inv.CustomerRef?.name || 'Unknown'}: $${inv.TotalAmt} (Balance: $${inv.Balance}).`;
  }
  
  const total = invoices.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
  const balance = invoices.reduce((sum, inv) => sum + (parseFloat(inv.Balance) || 0), 0);
  const max = invoices.reduce((a, b) => (parseFloat(a.Balance) > parseFloat(b.Balance) ? a : b));
  
  return `I found ${invoices.length} invoices totaling $${total.toFixed(2)}. The total outstanding balance is $${balance.toFixed(2)}. The highest unpaid balance is $${max.Balance} for invoice #${max.DocNumber}.`;
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
      try {
        const tokens = await getValidTokens();
        toolContext = {
          accessToken: tokens.access_token,
          realmId: tokens.realm_id
        };
      } catch (error) {
        return res.status(400).json({ 
          error: 'QuickBooks authentication required for invoice operations. Please visit /auth/start to authenticate.',
          needsAuth: true,
          conversationId
        });
      }
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
      'queryInvoicesByCustomer', 'getInvoiceStats', 'analyzeInvoices'
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
      // Check if the AI already included the delimited JSON in its response
      const hasDelimitedJson = finalText.includes('===INVOICE_DATA_START===') && finalText.includes('===INVOICE_DATA_END===');
      
      if (!hasDelimitedJson) {
        // Extract invoice data from toolResults (handle .result or direct)
        let invoiceData = toolResults.map(tr => {
          const result = tr.result || tr;
          // Handle analyzeInvoices response format which returns { invoices, analysis, queryInfo }
          if (result && result.invoices && Array.isArray(result.invoices)) {
            return result.invoices;
          }
          // Handle other tools that return invoice arrays directly
          if (Array.isArray(result)) {
            return result;
          }
          // Handle single invoice objects
          return [result];
        }).flat();
        
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
      try {
        const tokens = await getValidTokens();
        toolContext = {
          accessToken: tokens.access_token,
          realmId: tokens.realm_id
        };
      } catch (error) {
        return res.status(400).json({ 
          error: 'QuickBooks authentication required for invoice operations. Please visit /auth/start to authenticate.',
          needsAuth: true
        });
      }
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