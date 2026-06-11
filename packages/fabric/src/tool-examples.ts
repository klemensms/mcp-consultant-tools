/**
 * Tool examples for Microsoft Fabric tools.
 * Provides examples to improve LLM accuracy when using these tools.
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

export const WORKSPACE_ID_EXAMPLES = [
  { label: 'Workspace GUID', value: 'cfafbeb1-8037-4d0c-896e-a46fb27ff229' },
];

export const CAPACITY_ID_EXAMPLES = [
  { label: 'Capacity GUID', value: '0f084df7-c13d-451b-af5f-ed0c466403b2' },
];

export const ITEM_ID_EXAMPLES = [
  { label: 'Item GUID', value: '5b218778-e7a5-4d73-8187-f10824047715' },
];

export const ITEM_TYPE_EXAMPLES = [
  { label: 'Lakehouse', value: 'Lakehouse' },
  { label: 'Warehouse', value: 'Warehouse' },
  { label: 'Notebook', value: 'Notebook' },
  { label: 'Data pipeline', value: 'DataPipeline' },
  { label: 'Semantic model', value: 'SemanticModel' },
  { label: 'Report', value: 'Report' },
];

export const DOMAIN_ID_EXAMPLES = [
  { label: 'Domain GUID', value: 'bba1da9a-1b3b-4d2f-9b3a-5a9f9c7d2e10' },
];

export const SHORTCUT_TARGET_EXAMPLES = [
  {
    label: 'ADLS Gen2 target',
    value: '{"adlsGen2":{"location":"https://account.dfs.core.windows.net","subpath":"/container/path","connectionId":"<conn-guid>"}}',
  },
  {
    label: 'OneLake target',
    value: '{"oneLake":{"workspaceId":"<workspace-guid>","itemId":"<item-guid>","path":"Tables/mytable"}}',
  },
];
