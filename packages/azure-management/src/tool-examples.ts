/**
 * Tool examples for Azure Management MCP.
 * Examples improve LLM accuracy from 72% to 90% (Anthropic research).
 */

export { descWithExamples } from '@mcp-consultant-tools/core';

// ============================================
// Resource Type Examples
// ============================================

export const RESOURCE_TYPE_EXAMPLES = [
  { label: 'Function App', value: 'Microsoft.Web/sites' },
  { label: 'App Service', value: 'Microsoft.Web/sites' },
  { label: 'App Service Plan', value: 'Microsoft.Web/serverfarms' },
  { label: 'Storage Account', value: 'Microsoft.Storage/storageAccounts' },
  { label: 'Key Vault', value: 'Microsoft.KeyVault/vaults' },
  { label: 'SQL Server', value: 'Microsoft.Sql/servers' },
  { label: 'SQL Database', value: 'Microsoft.Sql/servers/databases' },
  { label: 'Application Insights', value: 'Microsoft.Insights/components' },
  { label: 'Service Bus', value: 'Microsoft.ServiceBus/namespaces' },
  { label: 'Front Door', value: 'Microsoft.Cdn/profiles' },
];

// ============================================
// Resource Group Examples
// ============================================

export const RESOURCE_GROUP_EXAMPLES = [
  { label: 'Development', value: 'rg-dev-uks-01' },
  { label: 'Production', value: 'rg-prod-uks-01' },
  { label: 'Shared services', value: 'rg-shared-services' },
];

// ============================================
// Tag Filter Examples
// ============================================

export const TAG_FILTER_EXAMPLES = [
  { label: 'Environment', value: "tagName eq 'environment' and tagValue eq 'dev'" },
  { label: 'Cost center', value: "tagName eq 'costCenter' and tagValue eq '12345'" },
  { label: 'Owner', value: "tagName eq 'owner' and tagValue eq 'team-a'" },
];

// ============================================
// Function App Examples
// ============================================

export const FUNCTION_APP_NAME_EXAMPLES = [
  { label: 'Sync function', value: 'func-dev-sync-uks-01' },
  { label: 'Processing function', value: 'func-prod-processing-uks-01' },
  { label: 'API function', value: 'func-dev-api-uks-01' },
];

export const FUNCTION_TRIGGER_EXAMPLES = [
  { label: 'HTTP trigger', value: 'httpTrigger' },
  { label: 'Timer trigger', value: 'timerTrigger' },
  { label: 'Queue trigger', value: 'queueTrigger' },
  { label: 'Blob trigger', value: 'blobTrigger' },
  { label: 'Service Bus trigger', value: 'serviceBusTrigger' },
  { label: 'Event Grid trigger', value: 'eventGridTrigger' },
];

// ============================================
// App Service Examples
// ============================================

export const APP_SERVICE_NAME_EXAMPLES = [
  { label: 'Web app', value: 'app-dev-web-uks-01' },
  { label: 'API app', value: 'app-prod-api-uks-01' },
];

export const APP_SERVICE_PLAN_EXAMPLES = [
  { label: 'Development plan', value: 'plan-dev-uks-01' },
  { label: 'Production plan', value: 'plan-prod-uks-01' },
];

export const LOG_TYPE_EXAMPLES = [
  { label: 'Docker container logs (Linux)', value: 'docker' },
  { label: 'Application stdout/stderr', value: 'stdout' },
  { label: 'Windows event log', value: 'eventlog' },
  { label: 'All available', value: 'all' },
];

export const APP_SETTING_EXAMPLES = [
  { label: 'Set a feature flag', value: '{"FEATURE_V2_ENABLED": "true"}' },
  { label: 'Update API endpoint', value: '{"API_BASE_URL": "https://api.example.com"}' },
];

// ============================================
// Key Vault Examples
// ============================================

export const KEY_VAULT_NAME_EXAMPLES = [
  { label: 'Development vault', value: 'kv-dev-app-uks-01' },
  { label: 'Production vault', value: 'kv-prod-secrets-uks-01' },
];

// ============================================
// Storage Account Examples
// ============================================

export const STORAGE_ACCOUNT_EXAMPLES = [
  { label: 'Blob storage', value: 'stdevblobsuks01' },
  { label: 'Function storage', value: 'stprodfuncuks01' },
];

// ============================================
// SQL Examples
// ============================================

export const SQL_SERVER_EXAMPLES = [
  { label: 'Development SQL', value: 'sql-dev-app-uks-01' },
  { label: 'Production SQL', value: 'sql-prod-app-uks-01' },
];

export const SQL_DATABASE_EXAMPLES = [
  { label: 'Main database', value: 'db-main' },
  { label: 'Reporting database', value: 'db-reporting' },
];

// ============================================
// Alert Examples
// ============================================

export const ALERT_SEVERITY_EXAMPLES = [
  { label: 'Critical (0)', value: '0' },
  { label: 'Error (1)', value: '1' },
  { label: 'Warning (2)', value: '2' },
  { label: 'Informational (3)', value: '3' },
  { label: 'Verbose (4)', value: '4' },
];

// ============================================
// Resource Graph Query Examples
// ============================================

export const RESOURCE_GRAPH_EXAMPLES = [
  {
    label: 'All Function Apps',
    value: "Resources | where type == 'microsoft.web/sites' | where kind contains 'functionapp'",
  },
  {
    label: 'Resources by tag',
    value: "Resources | where tags.environment == 'dev'",
  },
  {
    label: 'Count by resource type',
    value: 'Resources | summarize count() by type | order by count_ desc',
  },
  {
    label: 'Stopped VMs',
    value:
      "Resources | where type == 'microsoft.compute/virtualmachines' | where properties.extended.instanceView.powerState.code != 'PowerState/running'",
  },
];

// ============================================
// Resource Graph Examples
// ============================================

export const ARM_RESOURCE_ID_EXAMPLES = [
  {
    label: 'App Service',
    value:
      '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/rg-dev-uks-01/providers/Microsoft.Web/sites/app-dev-web-uks-01',
  },
  {
    label: 'Key Vault',
    value:
      '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/rg-dev-uks-01/providers/Microsoft.KeyVault/vaults/kv-dev-app-uks-01',
  },
  {
    label: 'Subnet',
    value:
      '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/rg-dev-uks-01/providers/Microsoft.Network/virtualNetworks/vnet-dev-uks-01/subnets/snet-app',
  },
];

export const PRINCIPAL_ID_EXAMPLES = [
  { label: 'Service principal object ID', value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
];

/**
 * Microsoft's published built-in role definition IDs. These are public constants,
 * identical in every Azure tenant — not identifiers from any environment. A
 * placeholder GUID here would make the example useless.
 * https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles
 */
export const ROLE_DEFINITION_ID_EXAMPLES = [
  { label: 'Reader (built-in role GUID)', value: 'acdd72a7-3385-48ef-bd42-f606fba81ae7' },
  { label: 'Contributor (built-in role GUID)', value: 'b24988ac-6180-42a0-ab88-20f7382dd24c' },
];

export const LOG_STREAM_TYPE_EXAMPLES = [
  { label: 'Application logs', value: 'application' },
  { label: 'HTTP request logs', value: 'http' },
  { label: 'Every provider', value: 'all' },
];

export const DETECTOR_NAME_EXAMPLES = [
  { label: 'Availability and performance', value: 'availability' },
  { label: 'Application crashes', value: 'servicehealth' },
];

// ============================================
// Location Examples
// ============================================

export const LOCATION_EXAMPLES = [
  { label: 'UK South', value: 'uksouth' },
  { label: 'UK West', value: 'ukwest' },
  { label: 'West Europe', value: 'westeurope' },
  { label: 'North Europe', value: 'northeurope' },
  { label: 'East US', value: 'eastus' },
];
