/**
 * Parsed ARM resource ID components.
 */
export interface ParsedResourceId {
  subscriptionId: string;
  resourceGroup: string;
  provider: string;
  resourceType: string;
  resourceName: string;
  parentType?: string;
  parentName?: string;
  fullResourceType: string;
}

/**
 * Parse an ARM resource ID into its components.
 *
 * Example resource IDs:
 * - /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}
 * - /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/functions/{fn}
 * - /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Sql/servers/{name}/databases/{db}
 */
export function parseResourceId(resourceId: string): ParsedResourceId | null {
  if (!resourceId || !resourceId.startsWith('/subscriptions/')) {
    return null;
  }

  const parts = resourceId.split('/').filter(p => p.length > 0);

  // Minimum structure: subscriptions/{sub}/resourceGroups/{rg}/providers/{provider}/{type}/{name}
  if (parts.length < 8) {
    return null;
  }

  const subscriptionIdx = parts.indexOf('subscriptions');
  const resourceGroupIdx = parts.indexOf('resourceGroups');
  const providersIdx = parts.indexOf('providers');

  if (subscriptionIdx === -1 || resourceGroupIdx === -1 || providersIdx === -1) {
    return null;
  }

  const subscriptionId = parts[subscriptionIdx + 1];
  const resourceGroup = parts[resourceGroupIdx + 1];
  const provider = parts[providersIdx + 1];

  // Everything after the provider is type/name pairs
  const afterProvider = parts.slice(providersIdx + 2);

  if (afterProvider.length < 2) {
    return null;
  }

  // For nested resources like Microsoft.Web/sites/functions
  // afterProvider would be: ['sites', 'myapp', 'functions', 'myfunc']
  if (afterProvider.length >= 4) {
    const parentType = afterProvider[0];
    const parentName = afterProvider[1];
    const resourceType = afterProvider[2];
    const resourceName = afterProvider[3];

    return {
      subscriptionId,
      resourceGroup,
      provider,
      resourceType,
      resourceName,
      parentType,
      parentName,
      fullResourceType: `${provider}/${parentType}/${resourceType}`,
    };
  }

  // Simple resource like Microsoft.Web/sites
  const resourceType = afterProvider[0];
  const resourceName = afterProvider[1];

  return {
    subscriptionId,
    resourceGroup,
    provider,
    resourceType,
    resourceName,
    fullResourceType: `${provider}/${resourceType}`,
  };
}

/**
 * Build an ARM resource ID from components.
 */
export function buildResourceId(
  subscriptionId: string,
  resourceGroup: string,
  provider: string,
  resourceType: string,
  resourceName: string,
  parentType?: string,
  parentName?: string
): string {
  let id = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${provider}`;

  if (parentType && parentName) {
    id += `/${parentType}/${parentName}`;
  }

  id += `/${resourceType}/${resourceName}`;

  return id;
}

/**
 * Extract resource group from a resource ID.
 */
export function extractResourceGroup(resourceId: string): string | null {
  const parsed = parseResourceId(resourceId);
  return parsed?.resourceGroup || null;
}

/**
 * Extract subscription ID from a resource ID.
 */
export function extractSubscriptionId(resourceId: string): string | null {
  const parsed = parseResourceId(resourceId);
  return parsed?.subscriptionId || null;
}
