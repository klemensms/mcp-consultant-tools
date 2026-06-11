import { ArmClient } from '../client/ArmClient.js';
import type {
  FrontDoorProfile,
  FrontDoorEndpoint,
  EventGridTopic,
  EventGridSystemTopic,
} from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/**
 * Processed Front Door profile summary.
 */
export interface FrontDoorSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  sku?: string;
  state?: string;
  frontDoorId?: string;
  originResponseTimeoutSeconds?: number;
  endpoints?: Array<{
    name: string;
    hostName?: string;
    enabledState?: string;
  }>;
  originGroups?: Array<{
    name: string;
    origins?: string[];
  }>;
  routes?: Array<{
    name: string;
    patterns?: string[];
  }>;
}

/**
 * Processed Event Grid topic summary.
 */
export interface EventGridTopicSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  type: 'custom' | 'system';
  endpoint?: string;
  inputSchema?: string;
  publicNetworkAccess?: string;
  source?: string;
  topicType?: string;
}

/**
 * Service for Azure Networking operations (Front Door, Event Grid).
 */
export class NetworkingService {
  constructor(private client: ArmClient) {}

  /**
   * List all Azure Front Door profiles.
   */
  async listFrontDoors(options: { resourceGroup?: string } = {}): Promise<{
    frontDoors: FrontDoorSummary[];
    summary: {
      total: number;
      bySku: Record<string, number>;
      byState: Record<string, number>;
    };
  }> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Cdn/profiles')
      : this.client.subscriptionPath('/providers/Microsoft.Cdn/profiles');

    const profiles = await this.client.paginate<FrontDoorProfile>(
      path,
      getApiVersion('Microsoft.Cdn/profiles')
    );

    // Filter to Front Door profiles only (sku contains 'AzureFrontDoor')
    const frontDoors = profiles.filter((p) =>
      p.sku?.name?.toLowerCase().includes('azurefrontdoor')
    );

    const results: FrontDoorSummary[] = [];
    const summary = {
      total: frontDoors.length,
      bySku: {} as Record<string, number>,
      byState: {} as Record<string, number>,
    };

    for (const fd of frontDoors) {
      const processed = await this.processFrontDoorProfile(fd);
      results.push(processed);

      const sku = processed.sku || 'Unknown';
      summary.bySku[sku] = (summary.bySku[sku] || 0) + 1;

      const state = processed.state || 'Unknown';
      summary.byState[state] = (summary.byState[state] || 0) + 1;
    }

    return { frontDoors: results, summary };
  }

  /**
   * Get detailed information about a Front Door profile.
   */
  async getFrontDoor(options: {
    name: string;
    resourceGroup?: string;
  }): Promise<{ frontDoor: FrontDoorSummary }> {
    const { name, resourceGroup } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    const path = this.client.resourceGroupPath(rg, `/providers/Microsoft.Cdn/profiles/${name}`);
    const profile = await this.client.get<FrontDoorProfile>(
      path,
      getApiVersion('Microsoft.Cdn/profiles')
    );

    const frontDoor = await this.processFrontDoorProfile(profile, true);

    return { frontDoor };
  }

  /**
   * List all Event Grid topics.
   * By default excludes system topics to reduce response size (they often have GUID names).
   */
  async listEventGridTopics(options: {
    resourceGroup?: string;
    includeSystemTopics?: boolean;
  } = {}): Promise<{
    topics: EventGridTopicSummary[];
    summary: {
      total: number;
      custom: number;
      system: number;
      byInputSchema: Record<string, number>;
    };
  }> {
    const { resourceGroup, includeSystemTopics = false } = options;

    const results: EventGridTopicSummary[] = [];
    const summary = {
      total: 0,
      custom: 0,
      system: 0,
      byInputSchema: {} as Record<string, number>,
    };

    // Get custom topics
    const customPath = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.EventGrid/topics')
      : this.client.subscriptionPath('/providers/Microsoft.EventGrid/topics');

    const customTopics = await this.client.paginate<EventGridTopic>(
      customPath,
      getApiVersion('Microsoft.EventGrid/topics')
    );

    for (const topic of customTopics) {
      const processed = this.processEventGridTopic(topic);
      results.push(processed);
      summary.custom++;

      const schema = processed.inputSchema || 'Unknown';
      summary.byInputSchema[schema] = (summary.byInputSchema[schema] || 0) + 1;
    }

    // Get system topics if requested
    if (includeSystemTopics) {
      const systemPath = resourceGroup
        ? this.client.resourceGroupPath(
            resourceGroup,
            '/providers/Microsoft.EventGrid/systemTopics'
          )
        : this.client.subscriptionPath('/providers/Microsoft.EventGrid/systemTopics');

      const systemTopics = await this.client.paginate<EventGridSystemTopic>(
        systemPath,
        getApiVersion('Microsoft.EventGrid/systemTopics')
      );

      for (const topic of systemTopics) {
        const processed = this.processEventGridSystemTopic(topic);
        results.push(processed);
        summary.system++;
      }
    }

    summary.total = results.length;

    return { topics: results, summary };
  }

  /**
   * Process a Front Door profile.
   */
  private async processFrontDoorProfile(
    profile: FrontDoorProfile,
    includeDetails = false
  ): Promise<FrontDoorSummary> {
    const props = profile.properties || {};

    const rgMatch = profile.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    const result: FrontDoorSummary = {
      id: profile.id,
      name: profile.name,
      resourceGroup,
      location: profile.location,
      sku: profile.sku?.name,
      state: props.resourceState,
      frontDoorId: props.frontDoorId,
      originResponseTimeoutSeconds: props.originResponseTimeoutSeconds,
    };

    // Get endpoints if detailed info requested
    if (includeDetails) {
      try {
        result.endpoints = await this.getFrontDoorEndpoints(profile.id);
      } catch (error) {
        console.error(`Failed to get endpoints for ${profile.name}:`, error);
      }

      try {
        result.originGroups = await this.getFrontDoorOriginGroups(profile.id);
      } catch (error) {
        console.error(`Failed to get origin groups for ${profile.name}:`, error);
      }

      try {
        result.routes = await this.getFrontDoorRoutes(profile.id);
      } catch (error) {
        console.error(`Failed to get routes for ${profile.name}:`, error);
      }
    }

    return result;
  }

  /**
   * Get Front Door endpoints.
   */
  private async getFrontDoorEndpoints(
    profileId: string
  ): Promise<Array<{ name: string; hostName?: string; enabledState?: string }>> {
    const path = `${profileId}/afdEndpoints`;
    const endpoints = await this.client.paginate<FrontDoorEndpoint>(
      path,
      getApiVersion('Microsoft.Cdn/profiles/afdEndpoints')
    );

    return endpoints.map((e) => ({
      name: e.name,
      hostName: e.properties?.hostName,
      enabledState: e.properties?.enabledState,
    }));
  }

  /**
   * Get Front Door origin groups.
   */
  private async getFrontDoorOriginGroups(
    profileId: string
  ): Promise<Array<{ name: string; origins?: string[] }>> {
    const path = `${profileId}/originGroups`;
    const groups = await this.client.paginate<{
      id: string;
      name: string;
      properties?: { origins?: Array<{ id: string }> };
    }>(path, getApiVersion('Microsoft.Cdn/profiles/originGroups'));

    return groups.map((g) => ({
      name: g.name,
      origins: g.properties?.origins?.map((o) => o.id.split('/').pop() || o.id),
    }));
  }

  /**
   * Get Front Door routes.
   */
  private async getFrontDoorRoutes(
    profileId: string
  ): Promise<Array<{ name: string; patterns?: string[] }>> {
    // Routes are under endpoints, so we need to get endpoints first
    const endpointsPath = `${profileId}/afdEndpoints`;
    const endpoints = await this.client.paginate<{ id: string; name: string }>(
      endpointsPath,
      getApiVersion('Microsoft.Cdn/profiles/afdEndpoints')
    );

    const allRoutes: Array<{ name: string; patterns?: string[] }> = [];

    for (const endpoint of endpoints) {
      try {
        const routesPath = `${endpoint.id}/routes`;
        const routes = await this.client.paginate<{
          name: string;
          properties?: { patternsToMatch?: string[] };
        }>(routesPath, getApiVersion('Microsoft.Cdn/profiles/afdEndpoints'));

        for (const route of routes) {
          allRoutes.push({
            name: `${endpoint.name}/${route.name}`,
            patterns: route.properties?.patternsToMatch,
          });
        }
      } catch (error) {
        console.error(`Failed to get routes for endpoint ${endpoint.name}:`, error);
      }
    }

    return allRoutes;
  }

  /**
   * Process an Event Grid custom topic.
   */
  private processEventGridTopic(topic: EventGridTopic): EventGridTopicSummary {
    const props = topic.properties || {};

    const rgMatch = topic.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    return {
      id: topic.id,
      name: topic.name,
      resourceGroup,
      location: topic.location,
      type: 'custom',
      endpoint: props.endpoint,
      inputSchema: props.inputSchema,
      publicNetworkAccess: props.publicNetworkAccess,
    };
  }

  /**
   * Process an Event Grid system topic.
   */
  private processEventGridSystemTopic(topic: EventGridSystemTopic): EventGridTopicSummary {
    const props = topic.properties || {};

    const rgMatch = topic.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    return {
      id: topic.id,
      name: topic.name,
      resourceGroup,
      location: topic.location,
      type: 'system',
      source: props.source,
      topicType: props.topicType,
    };
  }
}
