/**
 * ARM API versions for each resource type.
 * These are the stable API versions recommended for each resource provider.
 */
export const ARM_API_VERSIONS: Record<string, string> = {
  // Core
  'Microsoft.Resources/resourceGroups': '2021-04-01',
  'Microsoft.Resources/subscriptions': '2021-04-01',
  'Microsoft.Resources/subscriptions/locations': '2021-04-01',
  'Microsoft.Resources/tags': '2021-04-01',

  // Compute & Web
  'Microsoft.Web/sites': '2022-09-01',
  'Microsoft.Web/serverfarms': '2022-09-01',
  'Microsoft.Web/sites/functions': '2022-09-01',
  'Microsoft.Web/sites/config': '2022-09-01',
  'Microsoft.Web/sites/slots': '2022-09-01',
  'Microsoft.Web/sites/deployments': '2022-09-01',
  'Microsoft.Web/sites/host/default/listkeys': '2022-09-01',
  'Microsoft.Web/sites/functions/listkeys': '2022-09-01',

  // Storage
  'Microsoft.Storage/storageAccounts': '2023-01-01',
  'Microsoft.Storage/storageAccounts/listKeys': '2023-01-01',

  // SQL
  'Microsoft.Sql/servers': '2021-11-01',
  'Microsoft.Sql/servers/databases': '2021-11-01',

  // Key Vault (ARM API - for management plane)
  'Microsoft.KeyVault/vaults': '2023-02-01',
  'Microsoft.KeyVault/vaults/secrets': '2023-02-01',

  // Monitoring
  'Microsoft.Insights/components': '2020-02-02',
  'Microsoft.Insights/metricAlerts': '2018-03-01',
  'Microsoft.Insights/actionGroups': '2023-01-01',
  'Microsoft.AlertsManagement/smartDetectorAlertRules': '2021-04-01',

  // Networking
  'Microsoft.Cdn/profiles': '2023-05-01',
  'Microsoft.Cdn/profiles/afdEndpoints': '2023-05-01',
  'Microsoft.Cdn/profiles/originGroups': '2023-05-01',
  'Microsoft.Cdn/profiles/ruleSets': '2023-05-01',

  // Event Grid
  'Microsoft.EventGrid/systemTopics': '2022-06-15',
  'Microsoft.EventGrid/topics': '2022-06-15',

  // Service Bus
  'Microsoft.ServiceBus/namespaces': '2022-10-01-preview',

  // Data Factory
  'Microsoft.DataFactory/factories': '2018-06-01',

  // Resource Graph
  'Microsoft.ResourceGraph/resources': '2022-10-01',
};

/**
 * Get the API version for a resource type.
 * Falls back to a default version if the type is not found.
 */
export function getApiVersion(resourceType: string): string {
  // Try exact match first
  if (ARM_API_VERSIONS[resourceType]) {
    return ARM_API_VERSIONS[resourceType];
  }

  // Try provider-level match (e.g., "Microsoft.Web" for "Microsoft.Web/sites/slots")
  const parts = resourceType.split('/');
  if (parts.length >= 2) {
    const providerType = `${parts[0]}/${parts[1]}`;
    if (ARM_API_VERSIONS[providerType]) {
      return ARM_API_VERSIONS[providerType];
    }
  }

  // Default fallback
  return '2021-04-01';
}

/**
 * Key Vault data plane API version.
 * Used for listing secrets (not ARM API).
 */
export const KEY_VAULT_API_VERSION = '7.4';
