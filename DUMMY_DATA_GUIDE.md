# Invoice Creation with Dummy Data Guide

## Overview

The invoice creation system now includes automatic dummy data filling functionality. When users don't provide all required fields, the system intelligently fills missing data with sensible defaults to ensure successful invoice creation.

## Required Fields

### CustomerRef
- **Purpose**: References the customer for the invoice
- **Format**: `{ "value": "customer_id", "name": "customer_name" }`
- **Dummy Data**: `{ "value": "1", "name": "Sample Customer" }`

### Line (Array of Line Items)
- **Purpose**: Contains the products/services being invoiced
- **Minimum**: 1 line item required
- **Dummy Data**: Single SalesItemLineDetail with $100 amount

## Line Item Types

### 1. SalesItemLineDetail
**Purpose**: Individual products or services
```json
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
```

### 2. GroupLine
**Purpose**: Grouped items (bundles, packages)
```json
{
  "DetailType": "GroupLine",
  "Amount": 200.0,
  "GroupLineDetail": {
    "GroupItemRef": {
      "name": "Group Services",
      "value": "2"
    }
  }
}
```

### 3. DescriptionOnlyLine
**Purpose**: Text-only lines (notes, subtotals, discounts)
```json
{
  "DetailType": "DescriptionOnlyLine",
  "Amount": 0.0,
  "Description": "Additional notes or subtotal"
}
```

## Dummy Data Filling Logic

### CustomerRef Enhancement
```javascript
if (!enhancedInvoice.CustomerRef) {
  enhancedInvoice.CustomerRef = {
    value: "1",
    name: "Sample Customer"
  };
}
```

### Line Items Enhancement
```javascript
if (!enhancedInvoice.Line || !Array.isArray(enhancedInvoice.Line) || enhancedInvoice.Line.length === 0) {
  enhancedInvoice.Line = [{
    DetailType: "SalesItemLineDetail",
    Amount: 100.0,
    SalesItemLineDetail: {
      ItemRef: {
        name: "Services",
        value: "1"
      }
    }
  }];
}
```

### Individual Line Item Enhancement
For each line item, the system ensures:
- **DetailType**: Defaults to "SalesItemLineDetail"
- **Amount**: Defaults to 100.0 if missing
- **SalesItemLineDetail**: Added with default "Services" item if missing
- **GroupLineDetail**: Added with default "Group Services" if DetailType is "GroupLine"
- **Description**: Added for "DescriptionOnlyLine" items

### Date Enhancement
- **TxnDate**: Current date if missing
- **DueDate**: 30 days from current date if missing

## Usage Examples

### 1. Minimal Invoice Creation
**User Input**: `{}`
**Enhanced Output**:
```json
{
  "CustomerRef": {
    "value": "1",
    "name": "Sample Customer"
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
  ],
  "TxnDate": "2024-01-15",
  "DueDate": "2024-02-14"
}
```

### 2. Partial Customer Data
**User Input**:
```json
{
  "CustomerRef": {
    "value": "123",
    "name": "ABC Company"
  }
}
```
**Enhanced Output**:
```json
{
  "CustomerRef": {
    "value": "123",
    "name": "ABC Company"
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
  ],
  "TxnDate": "2024-01-15",
  "DueDate": "2024-02-14"
}
```

### 3. Incomplete Line Items
**User Input**:
```json
{
  "CustomerRef": {
    "value": "456",
    "name": "XYZ Corp"
  },
  "Line": [
    {
      "Amount": 250.0
    }
  ]
}
```
**Enhanced Output**:
```json
{
  "CustomerRef": {
    "value": "456",
    "name": "XYZ Corp"
  },
  "Line": [
    {
      "DetailType": "SalesItemLineDetail",
      "Amount": 250.0,
      "SalesItemLineDetail": {
        "ItemRef": {
          "name": "Services",
          "value": "1"
        }
      }
    }
  ],
  "TxnDate": "2024-01-15",
  "DueDate": "2024-02-14"
}
```

## AI Chat Commands

Users can create invoices through natural language commands:

### Basic Commands
- "Create a new invoice"
- "Create an invoice for $500"
- "Create invoice with customer ABC Company"

### Detailed Commands
- "Create invoice with line items: Consulting $300, Travel $200"
- "Create invoice for customer XYZ Corp with services totaling $750"
- "Create invoice with due date in 45 days"

### Mixed Commands
- "Create invoice for $1000 with customer John Doe"
- "Create invoice with consulting services $400 and travel expenses $150"

## System Prompt Integration

The AI system prompt includes detailed information about:
- Required fields and their formats
- Line item types and structures
- Dummy data behavior
- Example invoice structures

This ensures the AI assistant can guide users appropriately and understand when dummy data will be applied.

## Error Handling

The system provides clear logging when dummy data is applied:
- `⚠️ CustomerRef missing, using dummy customer data`
- `⚠️ Line items missing, using dummy line item data`
- `📝 Creating invoice with enhanced data: [JSON]`
- `✅ Invoice created successfully: [ID]`

## Benefits

1. **User-Friendly**: Users don't need to know all QuickBooks field requirements
2. **Fault-Tolerant**: Prevents creation failures due to missing required fields
3. **Flexible**: Works with partial data while preserving user-provided information
4. **Transparent**: Clear logging shows what dummy data was applied
5. **Consistent**: Standardized defaults ensure predictable behavior

## Testing

Use the test script to verify functionality:
```bash
node test-dummy-invoice.js
```

This script demonstrates various scenarios and expected behaviors without actually creating invoices in QuickBooks. 