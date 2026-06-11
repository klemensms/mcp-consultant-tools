/**
 * Tool Examples for PowerPlatform Read-Only Tools
 * Provides examples to improve LLM accuracy when using these tools.
 *
 * Anthropic research shows 72% -> 90% accuracy improvement with examples.
 */
export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// Entity / Metadata Examples
// ========================================

export const ENTITY_NAME_EXAMPLES = [
  { label: "Account", value: "account" },
  { label: "Contact", value: "contact" },
  { label: "Opportunity", value: "opportunity" },
  { label: "Lead", value: "lead" },
];

export const ATTRIBUTE_TYPE_EXAMPLES = [
  { label: "Text field", value: "String" },
  { label: "Whole number", value: "Integer" },
  { label: "Decimal number", value: "Decimal" },
  { label: "Currency", value: "Money" },
  { label: "Date and time", value: "DateTime" },
  { label: "Related record", value: "Lookup" },
  { label: "Yes/No", value: "Boolean" },
  { label: "Choice", value: "Picklist" },
  { label: "Multi-line text", value: "Memo" },
  { label: "Unique identifier", value: "Uniqueidentifier" },
];

// ========================================
// Flow / Workflow Examples
// ========================================

export const FLOW_CATEGORY_EXAMPLES = [
  { label: "Classic Workflow", value: "0" },
  { label: "Dialog (deprecated)", value: "1" },
  { label: "Business Rule", value: "2" },
  { label: "Action", value: "3" },
  { label: "Business Process Flow", value: "4" },
  { label: "Power Automate (Modern Flow)", value: "5" },
];

export const STATECODE_EXAMPLES = [
  { label: "Draft", value: "0" },
  { label: "Activated", value: "1" },
  { label: "Suspended", value: "2" },
];

export const FLOW_RUN_STATUS_EXAMPLES = [
  { label: "Completed successfully", value: "Succeeded" },
  { label: "Errored", value: "Failed" },
  { label: "Currently executing", value: "Running" },
  { label: "Awaiting trigger/action", value: "Waiting" },
  { label: "Manually stopped", value: "Cancelled" },
];

// ========================================
// Plugin Examples
// ========================================

export const MESSAGE_FILTER_EXAMPLES = [
  { label: "Record creation", value: "Create" },
  { label: "Record modification", value: "Update" },
  { label: "Record removal", value: "Delete" },
  { label: "Single record read", value: "Retrieve" },
  { label: "Query/list read", value: "RetrieveMultiple" },
];

export const HOURS_BACK_EXAMPLES = [
  { label: "Last hour", value: "1" },
  { label: "Last day (default)", value: "24" },
  { label: "Last week", value: "168" },
];

// ========================================
// Solution Examples
// ========================================

export const SOLUTION_NAME_EXAMPLES = [
  { label: "Default solution", value: "DefaultSolution" },
  { label: "Custom solution", value: "MyCustomSolution" },
  { label: "Test solution", value: "MCPTestCore" },
];

export const COMPONENT_TYPE_EXAMPLES = [
  { label: "Entity", value: "1" },
  { label: "Attribute", value: "2" },
  { label: "OptionSet", value: "9" },
  { label: "Workflow", value: "29" },
  { label: "SystemForm", value: "60" },
  { label: "WebResource", value: "61" },
  { label: "AppModule", value: "80" },
];

// ========================================
// Output Format Examples
// ========================================

export const OUTPUT_FORMAT_EXAMPLES = [
  { label: "Compact (flagged items and stats only)", value: "summary" },
  { label: "All details (default)", value: "full" },
];
