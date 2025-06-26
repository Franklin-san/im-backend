# Multiple Invoice Query Guide

## Overview

The invoice management system now includes intelligent handling of multiple invoice queries. When users search for multiple invoices where some exist and others don't, the system provides meaningful responses with partial results instead of showing errors.

## Key Features

### 🔍 **Intelligent Partial Results**
- Shows found invoices in the table
- Explains which invoices were not found
- Provides clear, conversational responses
- No more error messages for missing invoices

### 🛠️ **Smart Tool Selection**
- **Single Invoice**: Uses `getInvoice` tool
- **Multiple Invoices**: Uses `getMultipleInvoices` tool
- **General Queries**: Uses `listInvoices` tool

### 💬 **User-Friendly Responses**
- Natural language explanations
- Clear status for each requested invoice
- Helpful suggestions when appropriate

## Tool Usage

### Single Invoice Queries
```javascript
// Tool: getInvoice
// Use for: "Show me invoice 119"
{
  invoiceId: "119"
}
```

### Multiple Invoice Queries
```javascript
// Tool: getMultipleInvoices
// Use for: "Show me invoices 119 and 1119"
{
  invoiceIds: ["119", "1119"]
}
```

## Response Format

### getMultipleInvoices Response Structure
```json
{
  "found": [
    {
      "Id": "119",
      "DocNumber": "INV-119",
      "CustomerRef": { "name": "ABC Company" },
      "TotalAmt": "500.00",
      "Balance": "0.00",
      "TxnDate": "2024-01-15",
      "DueDate": "2024-02-15"
    }
  ],
  "notFound": ["1119"],
  "errors": [],
  "summary": {
    "totalRequested": 2,
    "found": 1,
    "notFound": 1,
    "errors": 0
  },
  "responseMessage": "Found 1 invoice(s): #INV-119 (ABC Company). 1 invoice(s) not found: 1119."
}
```

## Chat Response Examples

### Scenario 1: Some Invoices Found, Some Not Found
**User Query**: "Show me invoices 119 and 1119"

**Chat Response**: "Found 1 invoice: #119 for ABC Company - $500. Invoice 1119 not found."

**Table Data**: Shows only invoice 119

### Scenario 2: All Invoices Found
**User Query**: "Get invoices 1, 5, and 10"

**Chat Response**: "Found all 3 requested invoices totaling $1,200."

**Table Data**: Shows all 3 invoices

### Scenario 3: No Invoices Found
**User Query**: "Find invoices 999, 888, 777"

**Chat Response**: "I searched for 3 invoice(s) but none were found. The following invoice IDs do not exist: 999, 888, 777."

**Table Data**: Empty (no data to show)

### Scenario 4: Mixed Results with Errors
**User Query**: "Show me invoices 119, invalid-id, 1119"

**Chat Response**: "Found 1 invoice(s). 1 invoice(s) had errors: invalid-id (Invalid ID format). Invoice 1119 not found."

**Table Data**: Shows only invoice 119

## Implementation Details

### Error Handling
The system categorizes different types of issues:

1. **Not Found**: Invoice ID doesn't exist in QuickBooks
2. **Errors**: Invalid ID format, permission issues, etc.
3. **Found**: Successfully retrieved invoices

### Response Processing
```javascript
// Extract only found invoices for table display
if (result && result.found !== undefined) {
  return result.found; // Return only the found invoices
}
```

### Summary Generation
The system automatically generates meaningful summaries based on the results:

- **All Found**: "Found all X requested invoices totaling $Y."
- **Partial Results**: "Found X invoice(s). Y invoice(s) not found: [list]."
- **No Results**: "I searched for X invoice(s) but none were found."
- **With Errors**: Includes error details in the response

## User Experience Improvements

### Before (Error-Based)
```
❌ Error: Invoice with ID 1119 not found
❌ Error: Failed to fetch invoice 1119
```

### After (User-Friendly)
```
✅ Found 1 invoice: #119 for ABC Company - $500. Invoice 1119 not found.
```

### Benefits
1. **No More Errors**: Users see helpful explanations instead of error messages
2. **Partial Results**: Available data is still shown in the table
3. **Clear Communication**: Users understand exactly what was found and what wasn't
4. **Better UX**: More professional and user-friendly experience

## API Endpoints

### AI Chat Endpoint
```http
POST /ai/invoke
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "Show me invoices 119 and 1119"
    }
  ]
}
```

**Response**:
```json
{
  "text": "Found 1 invoice: #119 for ABC Company - $500. Invoice 1119 not found.\n\n===INVOICE_DATA_START===\n[{\"Id\":\"119\",\"DocNumber\":\"INV-119\",...}]\n===INVOICE_DATA_END===",
  "toolResults": [...],
  "success": true
}
```

## Testing

### Test Commands
```bash
# Test the functionality
node test-multiple-invoices.js

# Test with real data via AI chat
curl -X POST http://localhost:3001/ai/invoke \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Show me invoices 119 and 1119"}]}'
```

### Test Scenarios
1. **Partial Results**: Some invoices exist, some don't
2. **All Found**: All requested invoices exist
3. **None Found**: No requested invoices exist
4. **With Errors**: Invalid IDs or permission issues
5. **Mixed Results**: Combination of found, not found, and errors

## Best Practices

### For Users
- Use specific invoice IDs for precise queries
- Use general terms for broader searches
- Check invoice IDs before requesting specific ones

### For Developers
- Always handle partial results gracefully
- Provide clear explanations for missing data
- Show available data even when some items are missing
- Use appropriate tool selection based on query type

### For System Design
- Categorize different types of failures
- Provide meaningful error messages
- Maintain data consistency in responses
- Ensure backward compatibility

## Migration from Old System

### Changes Made
1. **New Tool**: Added `getMultipleInvoices` tool
2. **Enhanced Response Handling**: Updated to process partial results
3. **Improved Error Handling**: Better categorization of issues
4. **Updated System Prompt**: AI now knows when to use which tool

### Backward Compatibility
- Single invoice queries still work as before
- General queries still use `listInvoices`
- Error handling is more graceful but still functional

## Future Enhancements

### Potential Improvements
1. **Batch Processing**: Handle larger sets of invoice IDs
2. **Caching**: Cache frequently requested invoices
3. **Suggestions**: Suggest similar invoice IDs when exact matches fail
4. **Analytics**: Track which invoice IDs are commonly not found

### Advanced Features
1. **Fuzzy Matching**: Find invoices with similar IDs
2. **Auto-complete**: Suggest invoice IDs as user types
3. **Bulk Operations**: Perform operations on multiple found invoices
4. **Export Options**: Export partial results with explanations

## Troubleshooting

### Common Issues

#### No Results Found
- Verify invoice IDs exist in QuickBooks
- Check user permissions
- Ensure proper authentication

#### Partial Results
- This is expected behavior
- Check which specific IDs were not found
- Verify the found results are correct

#### Error Messages
- Check QuickBooks API status
- Verify network connectivity
- Review authentication tokens

### Debug Information
The system provides detailed logging for troubleshooting:
- Requested invoice IDs
- Found/not found status
- Error details
- Response processing steps 