export { descWithExamples } from '@mcp-consultant-tools/core';

export const PIPELINE_PARAM_EXAMPLES = [
  { label: 'File paths', value: '{"inputPath":"data/raw","outputPath":"data/processed"}' },
  { label: 'Date range', value: '{"dateFrom":"2026-01-01","dateTo":"2026-01-31"}' },
];

export const RUN_STATUS_EXAMPLES = [
  { label: 'Completed successfully', value: 'Succeeded' },
  { label: 'Execution error', value: 'Failed' },
  { label: 'Currently running', value: 'InProgress' },
  { label: 'Waiting to start', value: 'Queued' },
  { label: 'User cancelled', value: 'Cancelled' },
];

export const DATETIME_RANGE_EXAMPLES = [
  { label: 'Start of year', value: '2026-01-01T00:00:00Z' },
  { label: 'End of January', value: '2026-01-31T23:59:59Z' },
];

export const FACTORY_ID_EXAMPLES = [
  { label: 'Default factory', value: 'default' },
  { label: 'Production', value: 'prod' },
  { label: 'Development', value: 'dev' },
];

export const TRIGGER_TYPE_EXAMPLES = [
  { label: 'Time-based schedule', value: 'ScheduleTrigger' },
  { label: 'Tumbling window', value: 'TumblingWindowTrigger' },
  { label: 'Blob storage events', value: 'BlobEventsTrigger' },
];

export const TRIGGER_RUN_STATUS_EXAMPLES = [
  { label: 'Completed successfully', value: 'Succeeded' },
  { label: 'Execution error', value: 'Failed' },
  { label: 'Currently running', value: 'Inprogress' },
];
