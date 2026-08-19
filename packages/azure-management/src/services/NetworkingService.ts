import { ArmClient } from '../client/ArmClient.js';
import { FanOutRecorder, type FanOutInfo } from '@mcp-consultant-tools/core';
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
    fanOut: FanOutInfo;
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
    const fanOut = new FanOutRecorder();
    const summary = {
      total: frontDoors.length,
      bySku: {} as Record<string, number>,
      byState: {} as Record<string, number>,
    };

    for (const fd of frontDoors) {
      const processed = await this.processFrontDoorProfile(fd, false, fanOut);
      results.push(processed);

      const sku = processed.sku || 'Unknown';
      summary.bySku[sku] = (summary.bySku[sku] || 0) + 1;

      const state = processed.state || 'Unknown';
      summary.byState[state] = (summary.byState[state] || 0) + 1;
    }

    return { frontDoors: results, summary, fanOut: fanOut.result() };
  }

  /**
   * Get detailed information about a Front Door profile.
   */
  async getFrontDoor(options: {
    name: string;
    resourceGroup?: string;
  }): Promise<{ frontDoor: FrontDoorSummary; fanOut: FanOutInfo }> {
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

    const fanOut = new FanOutRecorder();
    const frontDoor = await this.processFrontDoorProfile(profile, true, fanOut);

    return { frontDoor, fanOut: fanOut.result() };
  }

  /**
   * List all Event Grid topics.
   *
   * `includeSystemTopics` controls whether system topics are **listed**, not whether they
   * are **looked for**. Both types are always enumerated, so `summary.total` is the number
   * that exist rather than the number that happened to be in scope: a subscription holding
   * 15 system topics and no custom ones used to report a clean `total: 0`, which is
   * indistinguishable from a subscription holding nothing at all. System topics stay out of
   * `topics` by default because they carry GUID-shaped names and add bulk; `summary.note`
   * says how many were left out and how to ask for them.
   */
  async listEventGridTopics(options: {
    resourceGroup?: string;
    includeSystemTopics?: boolean;
  } = {}): Promise<{
    topics: EventGridTopicSummary[];
    summary: {
      /** Topics that exist in scope, whether or not they are in `topics`. */
      total: number;
      /** Entries in `topics`. Short of `total` when a type was counted but not listed. */
      listed: number;
      custom: number;
      system: number;
      systemTopicsListed: boolean;
      /** Present only when the system-topic query was refused, so 0 is not a count. */
      systemTopicsUnavailable?: true;
      /** Present only when the custom-topic query was refused, so 0 is not a count. */
      customTopicsUnavailable?: true;
      byInputSchema: Record<string, number>;
      /** Present only when topics exist that this call did not list. */
      note?: string;
    };
    fanOut: FanOutInfo;
  }> {
    const { resourceGroup, includeSystemTopics = false } = options;

    const fanOut = new FanOutRecorder();
    const results: EventGridTopicSummary[] = [];
    const summary = {
      total: 0,
      listed: 0,
      custom: 0,
      system: 0,
      systemTopicsListed: includeSystemTopics,
      byInputSchema: {} as Record<string, number>,
    } as {
      total: number;
      listed: number;
      custom: number;
      system: number;
      systemTopicsListed: boolean;
      systemTopicsUnavailable?: true;
      customTopicsUnavailable?: true;
      byInputSchema: Record<string, number>;
      note?: string;
    };

    // Get custom topics
    const customPath = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.EventGrid/topics')
      : this.client.subscriptionPath('/providers/Microsoft.EventGrid/topics');

    const customTopics = await fanOut.run(
      resourceGroup || 'subscription',
      'customTopics',
      () =>
        this.client.paginate<EventGridTopic>(
          customPath,
          getApiVersion('Microsoft.EventGrid/topics')
        )
    );

    if (customTopics === null) {
      summary.customTopicsUnavailable = true;
    } else {
      for (const topic of customTopics) {
        const processed = this.processEventGridTopic(topic);
        results.push(processed);
        summary.custom++;

        const schema = processed.inputSchema || 'Unknown';
        summary.byInputSchema[schema] = (summary.byInputSchema[schema] || 0) + 1;
      }
    }

    // System topics are always counted; `includeSystemTopics` only decides whether they
    // are listed. A partial scope reported as a clean zero is the defect this closes.
    const systemPath = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.EventGrid/systemTopics')
      : this.client.subscriptionPath('/providers/Microsoft.EventGrid/systemTopics');

    const systemTopics = await fanOut.run(
      resourceGroup || 'subscription',
      'systemTopics',
      () =>
        this.client.paginate<EventGridSystemTopic>(
          systemPath,
          getApiVersion('Microsoft.EventGrid/systemTopics')
        )
    );

    if (systemTopics === null) {
      summary.systemTopicsUnavailable = true;
    } else {
      for (const topic of systemTopics) {
        summary.system++;
        if (includeSystemTopics) results.push(this.processEventGridSystemTopic(topic));
      }
    }

    summary.listed = results.length;
    summary.total = summary.custom + summary.system;

    const unlisted = summary.total - summary.listed;
    if (unlisted > 0) {
      summary.note =
        `${unlisted} of ${summary.total} topic(s) are system topics and are counted but not ` +
        `listed. Pass includeSystemTopics to list them.`;
    }

    return { topics: results, summary, fanOut: fanOut.result() };
  }

  /**
   * Process a Front Door profile.
   */
  private async processFrontDoorProfile(
    profile: FrontDoorProfile,
    includeDetails = false,
    fanOut: FanOutRecorder = new FanOutRecorder()
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
      const endpoints = await fanOut.run(profile.name, 'endpoints', () =>
        this.getFrontDoorEndpoints(profile.id)
      );
      if (endpoints) result.endpoints = endpoints;

      const originGroups = await fanOut.run(profile.name, 'originGroups', () =>
        this.getFrontDoorOriginGroups(profile.id)
      );
      if (originGroups) result.originGroups = originGroups;

      const routes = await fanOut.run(profile.name, 'routes', () =>
        this.getFrontDoorRoutes(profile.id, fanOut)
      );
      if (routes) result.routes = routes;
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
    profileId: string,
    fanOut: FanOutRecorder = new FanOutRecorder()
  ): Promise<Array<{ name: string; patterns?: string[] }>> {
    // Routes are under endpoints, so we need to get endpoints first
    const endpointsPath = `${profileId}/afdEndpoints`;
    const endpoints = await this.client.paginate<{ id: string; name: string }>(
      endpointsPath,
      getApiVersion('Microsoft.Cdn/profiles/afdEndpoints')
    );

    const allRoutes: Array<{ name: string; patterns?: string[] }> = [];

    for (const endpoint of endpoints) {
      const routesPath = `${endpoint.id}/routes`;
      const routes = await fanOut.run(endpoint.name, 'endpointRoutes', () =>
        this.client.paginate<{
          name: string;
          properties?: { patternsToMatch?: string[] };
        }>(routesPath, getApiVersion('Microsoft.Cdn/profiles/afdEndpoints'))
      );

      for (const route of routes ?? []) {
        allRoutes.push({
          name: `${endpoint.name}/${route.name}`,
          patterns: route.properties?.patternsToMatch,
        });
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
