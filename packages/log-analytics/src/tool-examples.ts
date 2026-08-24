/**
 * Tool Use Examples for Log Analytics MCP Tools
 *
 * Provides inline examples embedded in Zod `.describe()` strings to improve
 * LLM accuracy when calling these tools. Based on Anthropic research showing
 * 72% → 90% accuracy improvement with examples.
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ========================================
// KQL Query Examples
// ========================================

export const KQL_EXAMPLES = [
  {
    label: "Recent errors",
    value: "AppTraces | where SeverityLevel >= 3 | take 50"
  },
  {
    label: "Exception summary",
    value: "AppExceptions | summarize count() by ExceptionType"
  },
  {
    label: "Function errors",
    value: "FunctionAppLogs | where ExceptionDetails != '' | project TimeGenerated, FunctionName, Message"
  },
  {
    label: "Errors by app",
    value: "AppTraces | where SeverityLevel >= 3 | summarize count() by AppRoleName"
  },
];

// ========================================
// Timespan Examples
// ========================================

export const TIMESPAN_EXAMPLES = [
  { label: "Last hour", value: "PT1H" },
  { label: "Last 6 hours", value: "PT6H" },
  { label: "Last day", value: "P1D" },
  { label: "Last 7 days", value: "P7D" },
  { label: "Last 90 days", value: "P90D" },
];

// ========================================
// Column Preset Examples
// ========================================

export const COLUMN_PRESET_EXAMPLES = [
  { label: "Quick overview (4 cols)", value: "minimal" },
  { label: "Error investigation (8 cols)", value: "investigation" },
  { label: "Full data export", value: "full" },
];

// ========================================
// Table Name Examples
// ========================================

export const TABLE_NAME_EXAMPLES = [
  { label: "App Insights traces", value: "AppTraces" },
  { label: "App Insights exceptions", value: "AppExceptions" },
  { label: "App Insights requests", value: "AppRequests" },
  { label: "Azure Function logs", value: "FunctionAppLogs" },
  { label: "Custom events", value: "AppEvents" },
];

// ========================================
// App Name Pattern Examples
// ========================================

export const APP_NAME_EXAMPLES = [
  { label: "Exact match", value: "my-function-app" },
  { label: "Contains pattern", value: "sync" },
  { label: "Prefix pattern", value: "func-" },
];

// ========================================
// Output Format Examples
// ========================================

// Deliberately no "(default)" label - the default differs per tool (json for most,
// markdown for the report-style la-get-error-summary / la-investigate-app), and each
// tool's own description states it.
export const OUTPUT_FORMAT_EXAMPLES = [
  { label: "JSON", value: "json" },
  { label: "Markdown table", value: "markdown" },
];

// ========================================
// Severity Level Examples
// ========================================

export const SEVERITY_EXAMPLES = [
  { label: "Verbose and above", value: "0" },
  { label: "Info and above", value: "1" },
  { label: "Warnings and above", value: "2" },
  { label: "Errors only", value: "3" },
  { label: "Critical only", value: "4" },
];
