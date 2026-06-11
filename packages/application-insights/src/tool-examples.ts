export { descWithExamples } from '@mcp-consultant-tools/core';

export const KQL_QUERY_EXAMPLES = [
  { label: 'Exceptions in last 24h', value: "exceptions | where timestamp > ago(24h) | summarize count() by type" },
  { label: 'Slow requests over 5s', value: "requests | where duration > 5000 | project timestamp, name, duration" },
  { label: 'Failed dependencies by target', value: "dependencies | where success == false | summarize count() by target, type" },
  { label: 'Error rate by operation', value: "requests | summarize total=count(), failed=countif(success == false) by name | extend errorRate=round(100.0*failed/total, 2)" },
];

export const TIMESPAN_EXAMPLES = [
  { label: '1 hour', value: 'PT1H' },
  { label: '12 hours', value: 'PT12H' },
  { label: '1 day', value: 'P1D' },
  { label: '7 days', value: 'P7D' },
  { label: '30 days', value: 'P30D' },
];

export const TABLE_EXAMPLES = [
  { label: 'HTTP requests', value: 'requests' },
  { label: 'Unhandled exceptions', value: 'exceptions' },
  { label: 'External calls', value: 'dependencies' },
  { label: 'Log messages', value: 'traces' },
  { label: 'Custom telemetry', value: 'customEvents' },
  { label: 'Perf counters', value: 'performanceCounters' },
  { label: 'Uptime tests', value: 'availabilityResults' },
];

export const RESOURCE_ID_EXAMPLES = [
  { label: 'Use ai-list-resources to find IDs', value: 'prod-api' },
];
