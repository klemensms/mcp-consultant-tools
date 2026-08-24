import { ArmClient } from '../client/ArmClient.js';
import type {
  ArmResource,
  ResourceGroup,
  AzureLocation,
  Subscription,
} from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/**
 * `GET /subscriptions` is RBAC-filtered, not tenant-wide: a principal with no
 * role assignment anywhere gets `200 []`, never a `403`. An empty list therefore
 * cannot be read as "this tenant has no subscriptions".
 */
export const NO_SUBSCRIPTIONS_NOTE =
  'No subscriptions are visible to this service principal. This is not evidence that the tenant has none: /subscriptions returns only subscriptions the caller holds a role assignment on, and returns an empty list rather than an error when it holds none.';

/**
 * Service for generic Azure resource operations.
 */
export class ResourceService {
  constructor(private client: ArmClient) {}

  /**
   * List the subscriptions this service principal can see. Tenant-level - it does
   * not use the configured subscription ID.
   */
  async listSubscriptions(): Promise<{
    subscriptions: Subscription[];
    note?: string;
    summary: { total: number; byState: Record<string, number> };
  }> {
    const subscriptions = await this.client.paginate<Subscription>(
      '/subscriptions',
      getApiVersion('Microsoft.Resources/subscriptions')
    );

    const summary = { total: subscriptions.length, byState: {} as Record<string, number> };
    for (const subscription of subscriptions) {
      summary.byState[subscription.state] = (summary.byState[subscription.state] || 0) + 1;
    }

    return {
      subscriptions,
      note: subscriptions.length === 0 ? NO_SUBSCRIPTIONS_NOTE : undefined,
      summary,
    };
  }

  /**
   * List all resources in the subscription or a specific resource group.
   */
  async listResources(options: {
    resourceGroup?: string;
    resourceType?: string;
    tagFilter?: string;
    nameContains?: string;
    maxResults?: number;
  } = {}): Promise<{
    resources: ArmResource[];
    summary: {
      total: number;
      byType: Record<string, number>;
      byResourceGroup: Record<string, number>;
      byLocation: Record<string, number>;
    };
  }> {
    const { resourceGroup, resourceType, tagFilter, nameContains, maxResults = 100 } = options;

    // Build the path
    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/resources')
      : this.client.subscriptionPath('/resources');

    // Build filter
    const filters: string[] = [];
    if (resourceType) {
      filters.push(`resourceType eq '${resourceType}'`);
    }
    if (tagFilter) {
      filters.push(tagFilter);
    }

    const params: Record<string, string> = {};
    if (filters.length > 0) {
      params['$filter'] = filters.join(' and ');
    }

    // Fetch resources
    let resources = await this.client.paginate<ArmResource>(
      path,
      getApiVersion('Microsoft.Resources/resourceGroups'),
      params,
      maxResults
    );

    // Apply name filter client-side (ARM API doesn't support name contains filter)
    if (nameContains) {
      const lowerFilter = nameContains.toLowerCase();
      resources = resources.filter((r) => r.name.toLowerCase().includes(lowerFilter));
    }

    // Build summary
    const summary = {
      total: resources.length,
      byType: {} as Record<string, number>,
      byResourceGroup: {} as Record<string, number>,
      byLocation: {} as Record<string, number>,
    };

    for (const resource of resources) {
      // Count by type
      summary.byType[resource.type] = (summary.byType[resource.type] || 0) + 1;

      // Extract resource group from ID
      const rgMatch = resource.id.match(/\/resourceGroups\/([^/]+)/i);
      if (rgMatch) {
        const rg = rgMatch[1];
        summary.byResourceGroup[rg] = (summary.byResourceGroup[rg] || 0) + 1;
      }

      // Count by location
      summary.byLocation[resource.location] = (summary.byLocation[resource.location] || 0) + 1;
    }

    return { resources, summary };
  }

  /**
   * Get a resource by its full ARM resource ID.
   * By default filters out null/undefined properties to reduce response size.
   */
  async getResource(
    resourceId: string,
    options: { includeAllProperties?: boolean } = {}
  ): Promise<ArmResource> {
    const { includeAllProperties = false } = options;
    const resource = await this.client.get<ArmResource>(resourceId);

    if (includeAllProperties) {
      return resource;
    }

    // Filter out null/undefined properties recursively to reduce token usage
    return this.filterNullProperties(resource) as ArmResource;
  }

  /**
   * Recursively filter out null/undefined properties from an object.
   */
  private filterNullProperties(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return undefined;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.filterNullProperties(item)).filter((item) => item !== undefined);
    }

    if (typeof obj === 'object') {
      const filtered: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const filteredValue = this.filterNullProperties(value);
        if (filteredValue !== undefined && filteredValue !== null) {
          // Also filter out empty objects and empty arrays
          if (typeof filteredValue === 'object') {
            if (Array.isArray(filteredValue) && filteredValue.length === 0) {
              continue;
            }
            if (!Array.isArray(filteredValue) && Object.keys(filteredValue).length === 0) {
              continue;
            }
          }
          filtered[key] = filteredValue;
        }
      }
      return filtered;
    }

    return obj;
  }

  /**
   * Get a resource by name, type, and resource group.
   * By default filters out null/undefined properties to reduce response size.
   */
  async getResourceByName(
    resourceGroup: string,
    resourceType: string,
    resourceName: string,
    options: { includeAllProperties?: boolean } = {}
  ): Promise<ArmResource> {
    const { includeAllProperties = false } = options;
    const path = this.client.resourceGroupPath(
      resourceGroup,
      `/providers/${resourceType}/${resourceName}`
    );
    const resource = await this.client.get<ArmResource>(path, getApiVersion(resourceType));

    if (includeAllProperties) {
      return resource;
    }

    return this.filterNullProperties(resource) as ArmResource;
  }

  /**
   * List all resource groups in the subscription.
   */
  async listResourceGroups(options: {
    tagFilter?: string;
    nameContains?: string;
  } = {}): Promise<{
    resourceGroups: Array<ResourceGroup & { resourceCount?: number }>;
  }> {
    const { tagFilter, nameContains } = options;

    const path = this.client.subscriptionPath('/resourcegroups');

    const params: Record<string, string> = {};
    if (tagFilter) {
      params['$filter'] = tagFilter;
    }

    let resourceGroups = await this.client.paginate<ResourceGroup>(
      path,
      getApiVersion('Microsoft.Resources/resourceGroups'),
      params
    );

    // Apply name filter client-side
    if (nameContains) {
      const lowerFilter = nameContains.toLowerCase();
      resourceGroups = resourceGroups.filter((rg) => rg.name.toLowerCase().includes(lowerFilter));
    }

    return { resourceGroups };
  }

  /**
   * Get tags for a resource.
   */
  async getResourceTags(resourceId: string): Promise<Record<string, string>> {
    const resource = await this.getResource(resourceId);
    return resource.tags || {};
  }

  /**
   * List available Azure locations for the subscription.
   * By default returns only recommended physical regions with minimal data.
   */
  async listLocations(options: {
    regionCategory?: 'Recommended' | 'Other' | 'all';
    geographyGroup?: string;
    includeMetadata?: boolean;
  } = {}): Promise<{
    locations: Array<{
      name: string;
      displayName: string;
      regionalDisplayName?: string;
      geographyGroup?: string;
      metadata?: AzureLocation['metadata'];
    }>;
  }> {
    const { regionCategory = 'Recommended', geographyGroup, includeMetadata = false } = options;

    const path = this.client.subscriptionPath('/locations');
    let locations = await this.client.paginate<AzureLocation>(
      path,
      getApiVersion('Microsoft.Resources/subscriptions/locations')
    );

    // Filter by region category (default: only Recommended physical regions)
    if (regionCategory !== 'all') {
      locations = locations.filter(
        (loc) => loc.metadata?.regionCategory === regionCategory
      );
    }

    // Filter by geography group if specified
    if (geographyGroup) {
      const lowerGeo = geographyGroup.toLowerCase();
      locations = locations.filter(
        (loc) => loc.metadata?.geographyGroup?.toLowerCase().includes(lowerGeo)
      );
    }

    // Return slim or full data based on includeMetadata flag
    const result = locations.map((loc) => {
      const slim: {
        name: string;
        displayName: string;
        regionalDisplayName?: string;
        geographyGroup?: string;
        metadata?: AzureLocation['metadata'];
      } = {
        name: loc.name,
        displayName: loc.displayName,
      };

      // Always include geography group for context
      if (loc.metadata?.geographyGroup) {
        slim.geographyGroup = loc.metadata.geographyGroup;
      }

      // Include full metadata only if requested
      if (includeMetadata) {
        slim.regionalDisplayName = loc.regionalDisplayName;
        slim.metadata = loc.metadata;
      }

      return slim;
    });

    return { locations: result };
  }

  /**
   * Query resources using Azure Resource Graph.
   */
  async queryResourceGraph(
    query: string,
    subscriptions?: string[]
  ): Promise<{
    data: unknown[];
    count: number;
  }> {
    const subs = subscriptions || [this.client.getSubscriptionId()];

    const body = {
      query,
      subscriptions: subs,
      options: {
        resultFormat: 'objectArray',
      },
    };

    const response = await this.client.post<{
      data: unknown[];
      count: number;
      totalRecords: number;
      resultTruncated: string;
    }>('/providers/Microsoft.ResourceGraph/resources', body, '2022-10-01');

    return {
      data: response.data,
      count: response.totalRecords || response.data.length,
    };
  }
}
