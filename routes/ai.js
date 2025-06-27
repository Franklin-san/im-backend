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

## MULTIPLE INVOICE QUERIES
For queries involving multiple specific invoice IDs, use the 'getMultipleInvoices' tool:
- "Show me invoices 119 and 1119" → getMultipleInvoices with invoiceIds: ['119', '1119']
- "Get invoices 1, 5, and 10" → getMultipleInvoices with invoiceIds: ['1', '5', '10']
- "Find invoices 100, 200, 300" → getMultipleInvoices with invoiceIds: ['100', '200', '300']

This tool provides partial results and explanations when some invoices exist and others don't, giving users meaningful responses instead of errors.

## SINGLE INVOICE QUERIES
For single invoice queries, use the 'getInvoice' tool:
- "Show me invoice 119" → getInvoice with invoiceId: '119'
- "Get invoice #123" → getInvoice with invoiceId: '123'

## INVOICE CREATION RULES:
When creating invoices, you MUST follow this exact structure:
{
  "CustomerRef": {
    "value": "CUSTOMER_ID",
    "name": "Customer Name"
  },
  "Line": [
    {
      "DetailType": "SalesItemLineDetail",
      "Amount": 100.00,
      "SalesItemLineDetail": {
        "ItemRef": {
          "value": "ITEM_ID",
          "name": "Item Name"
        }
      }
    }
  ]
}

REQUIRED FIELDS:
- CustomerRef.value (Customer ID) - ALWAYS required
- Line array with at least one item - ALWAYS required
- Each Line must have: DetailType, Amount, and ItemRef.value
- Amount must be a number, not a string

INVOICE UPDATE RULES:
- Always retrieve the object first using its Id to get the current SyncToken and existing data.
- Id and SyncToken are both required for updates and must reflect the latest state of the object.
- Modify only the fields that need changes, but always include the original Id, the updated SyncToken, and any required fields like CustomerRef or Line.
- If you are updating an Invoice, preserve existing Line items unless instructed otherwise.
- If the update fails due to a stale SyncToken, you must refetch the latest version of the object and retry with the new token.

IF FIELDS ARE MISSING:
- Assign dummy data in the missing fields
- If the user asks for a specific invoice, create a dummy invoice with the same ID as the requested invoice
- CustomerRef.value is from 1 to 31 if you need to create a dummy invoice

**CRITICAL: After creating or updating an invoice, ALWAYS show the invoice details AND ensure the invoice data is included in the response so the frontend table refreshes. Keep the summary in plain text in paragraph format.**

## TOOL USAGE RULES
- Use 'analyzeInvoices' for most invoice queries - it's the most powerful and flexible tool
- Use 'getMultipleInvoices' for queries with multiple specific invoice IDs
- Use 'getInvoice' for single invoice queries (returns {success: true/false, invoice/error, message})
- Use 'updateInvoice' for editing existing invoices
- **ALWAYS use 'createInvoice' tool when user asks to create an invoice** - NEVER respond conversationally
- Use 'getCustomers' and 'getItems' only when you need to find existing customers/items
- Only use other invoice tools for specific operations (deleteInvoice, emailInvoice)
- For general questions about invoices, QuickBooks, or the app (NOT creation requests), respond conversationally and do NOT use any tools

## GETINVOICE RESPONSE HANDLING
The getInvoice tool returns:
- Success: {success: true, invoice: {...}, message: "..."}
- Error: {success: false, error: "...", invoiceId: "...", message: "..."}

When getInvoice returns an error (success: false), use the message field to inform the user about the issue. The message will explain why the invoice wasn't found (wrong ID, deleted, wrong transaction type, etc.).

## INVOICE CREATION REQUESTS
When user asks to create an invoice, you MUST:
1. **ALWAYS use the createInvoice tool** - do NOT respond conversationally
2. **NEVER say "I have created an invoice" without actually calling the tool**
3. **Use the exact structure specified in INVOICE CREATION RULES**
4. **Generate customer IDs from 1-31 and item IDs as needed**
5. **Show the created invoice details after successful creation**

Examples of requests that MUST use createInvoice tool:
- "Create an invoice" → use createInvoice tool
- "Create invoice for ABC Company" → use createInvoice tool
- "Make an invoice for $500" → use createInvoice tool
- "Generate an invoice" → use createInvoice tool
- "I need an invoice" → use createInvoice tool

## RESPONSE FORMAT FOR INVOICE QUERIES
When using invoice tools:
1. **Summary**: Write a natural, conversational summary in PLAIN TEXT ONLY (no markdown, no bullet points, no formatting). Include key insights like:
   - Number of invoices found
   - Total amounts and balances
   - Payment status breakdown
   - Top customers (if relevant)
   - Any notable patterns or insights
   - For multiple invoice queries: explain which were found and which were not found
2. **JSON Data**: Always include the delimited JSON block for the frontend table

## SUMMARY EXAMPLES (PLAIN TEXT ONLY - no markdown, no bullet points, no formatting)
- "I found 15 invoices totaling $45,200. 8 are paid ($28,500) and 7 are unpaid ($16,700). The highest unpaid balance is $5,200 for ABC Company."
- "There are 3 overdue invoices totaling $8,900. All are from different customers and range from $1,200 to $4,500."
- "I found 25 invoices for Cool Cars totaling $67,800. 12 are paid ($32,400) and 13 are unpaid ($35,400)."
- "Found 1 invoice: #119 for ABC Company - $500. Invoice 1119 not found."
- "Found 2 invoices totaling $1,200. Invoice 100 not found."

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

User: "Show me invoices 119 and 1119"
Agent: "Found 1 invoice: #119 for ABC Company - $500. Invoice 1119 not found."
===INVOICE_DATA_START===
[ ... ]
===INVOICE_DATA_END===

User: "Create an invoice for ABC Company for $500"
Agent: [CALLS createInvoice tool with proper structure, then shows result]

User: "What is QuickBooks?"
Agent: "QuickBooks is an accounting software platform for small and medium-sized businesses."

Remember: Use analyzeInvoices for most queries, getMultipleInvoices for multiple specific IDs, getInvoice for single IDs. Write natural summaries in PLAIN TEXT ONLY. Always include the JSON block with exact delimiters for invoice data. NO MARKDOWN FORMATTING.`;

function generateInvoiceSummary(invoices) {
  if (!Array.isArray(invoices) || invoices.length === 0) return '';
  
  // Handle getMultipleInvoices response format
  if (invoices.length === 1 && invoices[0] && invoices[0].found !== undefined) {
    const result = invoices[0];
    
    // If no invoices found at all
    if (result.found.length === 0 && result.notFound.length > 0) {
      return `I searched for ${result.summary.totalRequested} invoice(s) but none were found. The following invoice IDs do not exist: ${result.notFound.join(', ')}.`;
    }
    
    // If some invoices found and some not found
    if (result.found.length > 0 && result.notFound.length > 0) {
      const foundSummary = result.found.length === 1 
        ? `Found 1 invoice: #${result.found[0].DocNumber} for ${result.found[0].CustomerRef?.name || 'Unknown'} - $${result.found[0].TotalAmt}`
        : `Found ${result.found.length} invoices totaling $${result.found.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0).toFixed(2)}`;
      
      return `${foundSummary}. ${result.notFound.length} invoice(s) not found: ${result.notFound.join(', ')}.`;
    }
    
    // If all invoices found
    if (result.found.length > 0 && result.notFound.length === 0) {
      if (result.found.length === 1) {
        const inv = result.found[0];
        return `Found invoice #${inv.DocNumber} for ${inv.CustomerRef?.name || 'Unknown'}: $${inv.TotalAmt} (Balance: $${inv.Balance}).`;
      } else {
        const total = result.found.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
        return `Found all ${result.found.length} requested invoices totaling $${total.toFixed(2)}.`;
      }
    }
    
    // If there were errors
    if (result.errors.length > 0) {
      let message = '';
      if (result.found.length > 0) {
        message += `Found ${result.found.length} invoice(s). `;
      }
      message += `${result.errors.length} invoice(s) had errors: ${result.errors.map(e => `${e.invoiceId} (${e.error})`).join(', ')}.`;
      return message;
    }
    
    // Fallback to response message if available
    if (result.responseMessage) {
      return result.responseMessage;
    }
  }
  
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
    const isCreateInvoiceTool = lastToolCall && lastToolCall.name === 'createInvoice';
    const isUpdateInvoiceTool = lastToolCall && lastToolCall.name === 'updateInvoice';
    const isGetInvoiceTool = lastToolCall && lastToolCall.name === 'getInvoice';

    let finalText = text;
    
    // Special handling for getInvoice - handle error responses gracefully
    if (isGetInvoiceTool && toolResults && toolResults.length > 0) {
      const result = toolResults[0].result || toolResults[0];
      if (result && result.success === false) {
        // Handle error case from getInvoice
        finalText = result.message || `Invoice not found: ${result.error}`;
        
        // Add empty array to delimited JSON to trigger frontend refresh
        finalText += '\n\n===INVOICE_DATA_START===\n[]\n===INVOICE_DATA_END===';
      } else if (result && result.success === true && result.invoice) {
        // Handle success case from getInvoice
        finalText = `Found invoice: ${result.invoice.DocNumber || result.invoice.Id} for ${result.invoice.CustomerRef?.name || 'Unknown Customer'}, Amount: $${result.invoice.TotalAmt || '0.00'}`;
      }
    } else if (isCreateInvoiceTool && toolResults && toolResults.length > 0) {
      const createdInvoice = toolResults[0].result || toolResults[0];
      if (createdInvoice && createdInvoice.Id) {
        finalText = `Invoice created successfully! Invoice #: ${createdInvoice.DocNumber || createdInvoice.Id}, Customer: ${createdInvoice.CustomerRef?.name || 'Unknown'}, Amount: $${createdInvoice.TotalAmt || createdInvoice.Balance || '0.00'}, Date: ${createdInvoice.TxnDate || 'Today'}, Due Date: ${createdInvoice.DueDate || '30 days'}, Status: ${createdInvoice.Balance > 0 ? 'Unpaid' : 'Paid'}`;
      } else {
        finalText = 'Invoice created successfully!';
      }
    } else if (isUpdateInvoiceTool && toolResults && toolResults.length > 0) {
      // Special handling for updateInvoice - show the updated invoice
      const updatedInvoice = toolResults[0].result || toolResults[0];
      if (updatedInvoice && updatedInvoice.Id) {
        finalText = `Invoice updated successfully! Invoice #: ${updatedInvoice.DocNumber || updatedInvoice.Id}, Customer: ${updatedInvoice.CustomerRef?.name || 'Unknown'}, Amount: $${updatedInvoice.TotalAmt || updatedInvoice.Balance || '0.00'}, Date: ${updatedInvoice.TxnDate || 'Today'}, Due Date: ${updatedInvoice.DueDate || '30 days'}, Status: ${updatedInvoice.Balance > 0 ? 'Unpaid' : 'Paid'}`;
      } else {
        finalText = 'Invoice updated successfully!';
      }
    } else if (isUpdateInvoiceTool && stepLogs && stepLogs.length > 0) {
      // Fallback: If toolResults is empty but we have stepLogs, try to extract from the tool call
      console.log('⚠️ updateInvoice tool called but toolResults is empty, checking stepLogs...');
      const updateStep = stepLogs.find(step => step.toolCalls && step.toolCalls.some(tc => tc.name === 'updateInvoice'));
      if (updateStep) {
        const toolCall = updateStep.toolCalls.find(tc => tc.name === 'updateInvoice');
        if (toolCall && toolCall.args && toolCall.args.invoice) {
          const invoiceData = toolCall.args.invoice;
          finalText = `Invoice updated successfully! Invoice #: ${invoiceData.Id || 'Unknown'}, Customer: ${invoiceData.CustomerRef?.name || 'Unknown'}, Amount: $${invoiceData.Line?.[0]?.Amount || '0.00'}`;
          
          // Create a mock result for the frontend
          const mockResult = {
            Id: invoiceData.Id,
            DocNumber: invoiceData.DocNumber || invoiceData.Id,
            CustomerRef: invoiceData.CustomerRef,
            TxnDate: invoiceData.TxnDate || new Date().toISOString().split('T')[0],
            DueDate: invoiceData.DueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            TotalAmt: invoiceData.Line?.[0]?.Amount || 0,
            Balance: invoiceData.Line?.[0]?.Amount || 0,
            Status: 'Unpaid'
          };
          
          // Add to toolResults if it doesn't exist
          if (!toolResults) toolResults = [];
          toolResults.push({ result: mockResult });
        }
      }
    } else if ((!finalText || !finalText.trim()) && isInvoiceTool && toolResults && toolResults.length > 0) {
      let invoiceData = toolResults.map(tr => {
        const result = tr.result || tr;
        
        // Handle getMultipleInvoices response format
        if (result && result.found !== undefined) {
          return result.found; // Return only the found invoices
        }
        
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
      
      finalText = generateInvoiceSummary(invoiceData);
    }
    if (!finalText || !finalText.trim()) {
      finalText = 'I processed your request but did not receive a response.';
    }

    // Only append delimited JSON if an invoice tool was used and results are present
    if ((isInvoiceTool || isCreateInvoiceTool || isUpdateInvoiceTool) && toolResults && toolResults.length > 0) {
      // Check if the AI already included the delimited JSON in its response
      const hasDelimitedJson = finalText.includes('===INVOICE_DATA_START===') && finalText.includes('===INVOICE_DATA_END===');
      
      if (!hasDelimitedJson) {
        // Extract invoice data from toolResults (handle .result or direct)
        let invoiceData = toolResults.map(tr => {
          const result = tr.result || tr;
          
          // Handle getMultipleInvoices response format
          if (result && result.found !== undefined) {
            return result.found; // Return only the found invoices
          }
          
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
    
    // Special handling for createInvoice in streaming
    if (toolResults && toolResults.length > 0) {
      const lastToolResult = toolResults[toolResults.length - 1];
      if (lastToolResult && lastToolResult.toolName === 'createInvoice') {
        const createdInvoice = lastToolResult.result || lastToolResult;
        if (createdInvoice && createdInvoice.Id) {
          const invoiceDetails = `\n\nInvoice created successfully! Invoice #: ${createdInvoice.DocNumber || createdInvoice.Id}, Customer: ${createdInvoice.CustomerRef?.name || 'Unknown'}, Amount: $${createdInvoice.TotalAmt || createdInvoice.Balance || '0.00'}, Date: ${createdInvoice.TxnDate || 'Today'}, Due Date: ${createdInvoice.DueDate || '30 days'}, Status: ${createdInvoice.Balance > 0 ? 'Unpaid' : 'Paid'}`;
          res.write(`data: ${JSON.stringify({ type: 'text', content: invoiceDetails })}\n\n`);
        }
      } else if (lastToolResult && lastToolResult.toolName === 'updateInvoice') {
        const updatedInvoice = lastToolResult.result || lastToolResult;
        if (updatedInvoice && updatedInvoice.Id) {
          const invoiceDetails = `\n\nInvoice updated successfully! Invoice #: ${updatedInvoice.DocNumber || updatedInvoice.Id}, Customer: ${updatedInvoice.CustomerRef?.name || 'Unknown'}, Amount: $${updatedInvoice.TotalAmt || updatedInvoice.Balance || '0.00'}, Date: ${updatedInvoice.TxnDate || 'Today'}, Due Date: ${updatedInvoice.DueDate || '30 days'}, Status: ${updatedInvoice.Balance > 0 ? 'Unpaid' : 'Paid'}`;
          res.write(`data: ${JSON.stringify({ type: 'text', content: invoiceDetails })}\n\n`);
        }
      }
      
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