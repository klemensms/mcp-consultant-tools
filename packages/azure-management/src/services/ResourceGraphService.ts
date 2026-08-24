import type { ArmClient } from '../client/ArmClient.js';
import { getArmErrorStatus } from '../client/ArmClient.js';
import { getApiVersion } from '../utils/arm-api-versions.js';
import { kqlString } from '../utils/kql.js';

// ──────────────────────────────────────
// Constants
// ──────────────────────────────────────

export const RESOURCE_GRAPH_PATH = '/providers/Microsoft.ResourceGraph/resources';

/** Resource Graph returns at most 1000 rows per page. */
export const RESOURCE_GRAPH_PAGE_SIZE = 1000;

export const DEFAULT_MAX_RESULTS = 500;
export const MAX_RESULTS_CEILING = 5000;

/** Diagnostic settings cost one HTTP call per resource, so the fan-out is capped separately. */
export const DEFAULT_MAX_DIAGNOSTIC_RESOURCES = 100;
export const MAX_DIAGNOSTIC_RESOURCES_CEILING = 500;
const DIAGNOSTIC_SETTINGS_CONCURRENCY = 5;

/** ceiling: a single `in (...)` clause; a resource referencing more than this is rare enough to truncate. */
const MAX_FORWARD_REFERENCES = 50;

/** Guards against a cyclic or pathologically deep `properties` blob. */
const MAX_PROPERTY_DEPTH = 6;

// ──────────────────────────────────────
// Summary types
// ──────────────────────────────────────

export interface NsgSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  associatedSubnets: Array<{ id: string; name: string }>;
  associatedNics: Array<{ id: string; name: string }>;
  securityRules: Array<{
    name: string;
    priority: number;
    direction: string;
    access: string;
    protocol: string;
    sourcePortRange?: string;
    destinationPortRange?: string;
    sourceAddressPrefix?: string;
    destinationAddressPrefix?: string;
    sourcePortRanges?: string[];
    destinationPortRanges?: string[];
    sourceAddressPrefixes?: string[];
    destinationAddressPrefixes?: string[];
  }>;
}

export interface RoleAssignmentSummary {
  id: string;
  principalId: string;
  principalType: string;
  roleDefinitionId: string;
  /** `null` when the role definition could not be read - never a placeholder that reads like a role name. */
  roleDefinitionName: string | null;
  scope: string;
  createdOn?: string;
}

export interface PrivateEndpointSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  subnetId?: string;
  targetResourceId?: string;
  targetResourceType?: string;
  connectionStatus?: string;
  groupIds?: string[];
}

export interface ResourceConsumer {
  id: string;
  name: string;
  type: string;
  resourceGroup: string;
  location: string;
  propertyPath: string;
}

export interface DiagnosticSettingSummary {
  id: string;
  name: string;
  targetResourceId: string;
  targetResourceName: string;
  targetResourceType: string;
  workspaceId?: string;
  storageAccountId?: string;
  eventHubAuthorizationRuleId?: string;
  eventHubName?: string;
  logCategories: Array<{ category: string; enabled: boolean }>;
  metricCategories: Array<{ category: string; enabled: boolean }>;
}

export interface UnreadableResource {
  resourceId: string;
  status?: number;
  error: string;
}

export interface ResourceRelationship {
  type: 'self' | 'same-vnet' | 'same-subnet' | 'references-this' | 'referenced-by-this';
  resourceId: string;
  resourceName: string;
  resourceType: string;
  resourceGroup: string;
}

interface ResourceGraphResponse {
  data?: unknown[];
  count?: number;
  totalRecords?: number;
  $skipToken?: string;
}

// ──────────────────────────────────────
// Query builders (pure - unit-tested without a subscription)
// ──────────────────────────────────────

/**
 * Every `type` comparison uses `=~`, not `==`. Microsoft's guidance and every
 * published sample use the case-insensitive operator; `==` against a lowercase
 * literal happens to match today but a provider that stops normalising casing
 * would turn the query into a permanent empty result with no error.
 *
 * Every substring match against `properties` goes through `tostring()`. KQL's
 * `contains` is typed to take a `string`, and `properties` is `dynamic`; relying
 * on the implicit coercion risks silently missing nested values.
 */
export const NSG_TYPE = 'microsoft.network/networksecuritygroups';
export const PRIVATE_ENDPOINT_TYPE = 'microsoft.network/privateendpoints';
export const ROLE_NAMES_WHOLLY_UNRESOLVED_NOTE =
  'No role name resolved for any assignment. This is not evidence that the roles are unknown to Azure - it means the role-definition lookup returned nothing usable. Check summary.roleDefinitionsFound: zero means the lookup itself came back empty. Read summary.byUnresolvedRoleDefinitionId for the ids, which are still joinable.';

export const ROLE_ASSIGNMENT_TYPE = 'microsoft.authorization/roleassignments';
export const ROLE_DEFINITION_TYPE = 'microsoft.authorization/roledefinitions';

export function buildNsgQuery(options: { resourceGroup?: string } = {}): string {
  const lines = ['resources', `| where type =~ ${kqlString(NSG_TYPE)}`];
  if (options.resourceGroup) {
    lines.push(`| where resourceGroup =~ ${kqlString(options.resourceGroup)}`);
  }
  lines.push('| project id, name, type, resourceGroup, location, properties');
  lines.push('| order by id asc');
  return lines.join('\n');
}

export function buildPrivateEndpointQuery(options: { resourceGroup?: string } = {}): string {
  const lines = ['resources', `| where type =~ ${kqlString(PRIVATE_ENDPOINT_TYPE)}`];
  if (options.resourceGroup) {
    lines.push(`| where resourceGroup =~ ${kqlString(options.resourceGroup)}`);
  }
  lines.push('| project id, name, type, resourceGroup, location, properties');
  lines.push('| order by id asc');
  return lines.join('\n');
}

export function buildRoleAssignmentQuery(
  options: { principalId?: string; roleDefinitionId?: string; scope?: string } = {}
): string {
  const lines = ['authorizationresources', `| where type =~ ${kqlString(ROLE_ASSIGNMENT_TYPE)}`];
  if (options.principalId) {
    lines.push(`| where tostring(properties['principalId']) =~ ${kqlString(options.principalId)}`);
  }
  if (options.roleDefinitionId) {
    lines.push(
      `| where tostring(properties['roleDefinitionId']) contains ${kqlString(options.roleDefinitionId)}`
    );
  }
  if (options.scope) {
    lines.push(`| where tostring(properties['scope']) =~ ${kqlString(options.scope)}`);
  }
  lines.push('| project id, properties');
  lines.push('| order by id asc');
  return lines.join('\n');
}

/**
 * The two sides of this join do NOT carry the same scope prefix. An assignment's
 * `properties.roleDefinitionId` is written subscription-qualified, while a built-in
 * definition's own `id` is tenant-scoped, so a whole-id join misses every built-in
 * role - which is almost every role. Measured: 752 of 752 assignments unresolved
 * across 16 subscriptions, while all 52 distinct GUIDs resolved when fetched
 * directly.
 *
 * Join on the trailing GUID instead. It is the one part of a role definition id
 * that is identical whichever scope either side was written at, and it is unique
 * per role definition, so nothing is lost by ignoring the prefix.
 */
/**
 * The trailing path segment of a role definition id - the GUID - lowercased.
 * Returns an empty string for anything that is not a path, so a malformed id
 * cannot collide with another under a shared empty key.
 */
export function roleDefinitionGuid(roleDefinitionId: string): string {
  const segments = roleDefinitionId.split('/').filter(Boolean);
  return (segments[segments.length - 1] ?? '').toLowerCase();
}

export function buildRoleDefinitionQuery(): string {
  return [
    'authorizationresources',
    `| where type =~ ${kqlString(ROLE_DEFINITION_TYPE)}`,
    "| project roleDefinitionId = tolower(id), roleName = tostring(properties['roleName'])",
    '| order by roleDefinitionId asc',
  ].join('\n');
}

export function buildResourceConsumerQuery(options: { resourceId: string }): string {
  return [
    'resources',
    `| where id !~ ${kqlString(options.resourceId)}`,
    `| where tostring(properties) contains ${kqlString(options.resourceId)}`,
    '| project id, name, type, resourceGroup, location, properties',
    '| order by id asc',
  ].join('\n');
}

export function buildDiagnosticTargetQuery(
  options: { resourceGroup?: string; resourceType?: string } = {}
): string {
  const lines = ['resources'];
  if (options.resourceType) {
    lines.push(`| where type =~ ${kqlString(options.resourceType)}`);
  }
  if (options.resourceGroup) {
    lines.push(`| where resourceGroup =~ ${kqlString(options.resourceGroup)}`);
  }
  lines.push('| project id');
  lines.push('| order by id asc');
  return lines.join('\n');
}

export function buildSelfResourceQuery(resourceId: string): string {
  return [
    'resources',
    `| where id =~ ${kqlString(resourceId)}`,
    '| project id, name, type, resourceGroup, location, properties',
    '| limit 1',
  ].join('\n');
}

export function buildReferencesThisQuery(options: { resourceId: string }): string {
  return [
    'resources',
    `| where id !~ ${kqlString(options.resourceId)}`,
    `| where tostring(properties) contains ${kqlString(options.resourceId)}`,
    '| project id, name, type, resourceGroup, location',
    '| order by id asc',
  ].join('\n');
}

export function buildSameSubnetQuery(options: { resourceId: string; subnetId: string }): string {
  return [
    'resources',
    `| where id !~ ${kqlString(options.resourceId)}`,
    `| where tostring(properties) contains ${kqlString(options.subnetId)}`,
    '| project id, name, type, resourceGroup, location',
    '| order by id asc',
  ].join('\n');
}

export function buildSameVnetQuery(options: {
  resourceId: string;
  vnetId: string;
  subnetId?: string;
}): string {
  const lines = [
    'resources',
    `| where id !~ ${kqlString(options.resourceId)}`,
    `| where tostring(properties) contains ${kqlString(options.vnetId)}`,
  ];
  // A subnet ID starts with its VNet ID, so same-subnet resources also match the
  // VNet filter. Exclude them so the two buckets stay disjoint.
  if (options.subnetId) {
    lines.push(`| where not(tostring(properties) contains ${kqlString(options.subnetId)})`);
  }
  lines.push('| project id, name, type, resourceGroup, location');
  lines.push('| order by id asc');
  return lines.join('\n');
}

export function buildForwardReferenceQuery(options: { resourceIds: string[] }): string {
  const idList = options.resourceIds
    .slice(0, MAX_FORWARD_REFERENCES)
    .map((id) => kqlString(id.toLowerCase()))
    .join(', ');

  return [
    'resources',
    `| where tolower(id) in (${idList})`,
    '| project id, name, type, resourceGroup, location',
    '| order by id asc',
  ].join('\n');
}

// ──────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────

export function assertMaxResults(maxResults: number, ceiling = MAX_RESULTS_CEILING): void {
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > ceiling) {
    throw new Error(`maxResults must be an integer between 1 and ${ceiling}, got: ${maxResults}`);
  }
}

export function assertResourceId(resourceId: string): void {
  if (!resourceId || !resourceId.trim().startsWith('/subscriptions/')) {
    throw new Error(
      "resourceId must be a full ARM resource ID starting with '/subscriptions/', e.g. /subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/rg-dev-uks-01/providers/Microsoft.Web/sites/app-dev-web-uks-01"
    );
  }
}

export function extractResourceGroup(id: string): string {
  const match = id.match(/\/resourceGroups\/([^/]+)/i);
  return match ? match[1] : '';
}

export function extractResourceType(id: string): string | undefined {
  const match = id.match(/\/providers\/([^/]+\/[^/]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Recursively find dot-notation property paths whose string value contains
 * `searchValue`. Used to explain *why* a resource showed up as a consumer.
 */
export function findPropertyPaths(
  obj: Record<string, unknown>,
  searchValue: string,
  prefix = 'properties',
  depth = 0
): string[] {
  if (depth > MAX_PROPERTY_DEPTH) return [];
  const paths: string[] = [];
  const lowerSearch = searchValue.toLowerCase();

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = `${prefix}.${key}`;

    if (typeof value === 'string') {
      if (value.toLowerCase().includes(lowerSearch)) paths.push(currentPath);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string' && item.toLowerCase().includes(lowerSearch)) {
          paths.push(`${currentPath}[${index}]`);
        } else if (typeof item === 'object' && item !== null) {
          paths.push(
            ...findPropertyPaths(
              item as Record<string, unknown>,
              searchValue,
              `${currentPath}[${index}]`,
              depth + 1
            )
          );
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      paths.push(
        ...findPropertyPaths(value as Record<string, unknown>, searchValue, currentPath, depth + 1)
      );
    }
  }

  return paths;
}

/** Extract ARM resource IDs referenced anywhere inside a resource's properties. */
export function extractResourceIds(obj: Record<string, unknown>, depth = 0): string[] {
  if (depth > MAX_PROPERTY_DEPTH) return [];
  const ids: string[] = [];
  const armIdPattern = /^\/subscriptions\/[0-9a-f-]+\//i;

  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      if (armIdPattern.test(value)) ids.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && armIdPattern.test(item)) {
          ids.push(item);
        } else if (typeof item === 'object' && item !== null) {
          ids.push(...extractResourceIds(item as Record<string, unknown>, depth + 1));
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      ids.push(...extractResourceIds(value as Record<string, unknown>, depth + 1));
    }
  }

  return ids;
}

export function extractSubnetId(props: Record<string, unknown>): string | undefined {
  if (typeof props.virtualNetworkSubnetId === 'string') return props.virtualNetworkSubnetId;

  const subnet = props.subnet as { id?: string } | undefined;
  if (typeof subnet?.id === 'string') return subnet.id;

  const ipConfigs = props.ipConfigurations as Array<Record<string, unknown>> | undefined;
  if (ipConfigs && ipConfigs.length > 0) {
    const first = (ipConfigs[0].properties || ipConfigs[0]) as Record<string, unknown>;
    const configSubnet = first.subnet as { id?: string } | undefined;
    if (configSubnet?.id) return configSubnet.id;
  }

  return undefined;
}

export function extractVnetId(props: Record<string, unknown>): string | undefined {
  if (typeof props.virtualNetworkId === 'string') return props.virtualNetworkId;
  const vnetConfig = props.vnetConfiguration as Record<string, unknown> | undefined;
  if (vnetConfig && typeof vnetConfig.subnetResourceId === 'string') {
    return vnetConfig.subnetResourceId.replace(/\/subnets\/[^/]+$/i, '');
  }
  return undefined;
}

export function mapNsgRow(row: Record<string, unknown>): NsgSummary {
  const props = (row.properties || {}) as Record<string, unknown>;
  const subnets = (props.subnets as Array<{ id: string }> | undefined) || [];
  const nics = (props.networkInterfaces as Array<{ id: string }> | undefined) || [];
  const securityRules = (props.securityRules as Array<Record<string, unknown>>) || [];

  return {
    id: row.id as string,
    name: row.name as string,
    resourceGroup: (row.resourceGroup as string) || extractResourceGroup(row.id as string),
    location: row.location as string,
    associatedSubnets: subnets.map((s) => ({ id: s.id, name: s.id.split('/').pop() || s.id })),
    associatedNics: nics.map((n) => ({ id: n.id, name: n.id.split('/').pop() || n.id })),
    securityRules: securityRules.map((rule) => {
      const ruleProps = (rule.properties || rule) as Record<string, unknown>;
      return {
        name: (rule.name || ruleProps.name || '') as string,
        priority: (ruleProps.priority || 0) as number,
        direction: (ruleProps.direction || '') as string,
        access: (ruleProps.access || '') as string,
        protocol: (ruleProps.protocol || '*') as string,
        sourcePortRange: ruleProps.sourcePortRange as string | undefined,
        destinationPortRange: ruleProps.destinationPortRange as string | undefined,
        sourceAddressPrefix: ruleProps.sourceAddressPrefix as string | undefined,
        destinationAddressPrefix: ruleProps.destinationAddressPrefix as string | undefined,
        sourcePortRanges: ruleProps.sourcePortRanges as string[] | undefined,
        destinationPortRanges: ruleProps.destinationPortRanges as string[] | undefined,
        sourceAddressPrefixes: ruleProps.sourceAddressPrefixes as string[] | undefined,
        destinationAddressPrefixes: ruleProps.destinationAddressPrefixes as string[] | undefined,
      };
    }),
  };
}

export function mapPrivateEndpointRow(row: Record<string, unknown>): PrivateEndpointSummary {
  const props = (row.properties || {}) as Record<string, unknown>;
  const subnet = props.subnet as { id?: string } | undefined;

  const connections =
    (props.privateLinkServiceConnections as Array<Record<string, unknown>>) ||
    (props.manualPrivateLinkServiceConnections as Array<Record<string, unknown>>) ||
    [];

  let targetResourceId: string | undefined;
  let targetResourceType: string | undefined;
  let connectionStatus: string | undefined;
  let groupIds: string[] | undefined;

  if (connections.length > 0) {
    const connProps = (connections[0].properties || connections[0]) as Record<string, unknown>;
    targetResourceId = connProps.privateLinkServiceId as string | undefined;
    if (targetResourceId) targetResourceType = extractResourceType(targetResourceId);
    const connState = connProps.privateLinkServiceConnectionState as
      | Record<string, unknown>
      | undefined;
    connectionStatus = connState?.status as string | undefined;
    groupIds = connProps.groupIds as string[] | undefined;
  }

  return {
    id: row.id as string,
    name: row.name as string,
    resourceGroup: (row.resourceGroup as string) || extractResourceGroup(row.id as string),
    location: row.location as string,
    subnetId: subnet?.id,
    targetResourceId,
    targetResourceType,
    connectionStatus,
    groupIds,
  };
}

export function mapDiagnosticSetting(
  setting: Record<string, unknown>,
  targetResourceId: string
): DiagnosticSettingSummary {
  const props = (setting.properties || setting) as Record<string, unknown>;
  const nameMatch = targetResourceId.match(/\/([^/]+)$/);
  const logs = (props.logs as Array<Record<string, unknown>>) || [];
  const metrics = (props.metrics as Array<Record<string, unknown>>) || [];

  return {
    id: (setting.id || '') as string,
    name: (setting.name || '') as string,
    targetResourceId,
    targetResourceName: nameMatch ? nameMatch[1] : targetResourceId,
    targetResourceType: extractResourceType(targetResourceId) || 'Unknown',
    workspaceId: props.workspaceId as string | undefined,
    storageAccountId: props.storageAccountId as string | undefined,
    eventHubAuthorizationRuleId: props.eventHubAuthorizationRuleId as string | undefined,
    eventHubName: props.eventHubName as string | undefined,
    logCategories: logs.map((log) => ({
      category: (log.category || log.categoryGroup || '') as string,
      enabled: (log.enabled ?? false) as boolean,
    })),
    metricCategories: metrics.map((metric) => ({
      category: (metric.category || '') as string,
      enabled: (metric.enabled ?? false) as boolean,
    })),
  };
}

function toRelationship(
  row: Record<string, unknown>,
  type: ResourceRelationship['type']
): ResourceRelationship {
  return {
    type,
    resourceId: row.id as string,
    resourceName: row.name as string,
    resourceType: row.type as string,
    resourceGroup: (row.resourceGroup as string) || extractResourceGroup(row.id as string),
  };
}

// ──────────────────────────────────────
// Service
// ──────────────────────────────────────

/**
 * Cross-resource queries over Azure Resource Graph: network security, RBAC,
 * private connectivity, diagnostic coverage and resource relationships.
 *
 * Scope is the client's subscription. Resource Graph returns results only for
 * subscriptions the service principal can read, and says nothing when some are
 * missing - a partial answer is indistinguishable from a complete one.
 */
export class ResourceGraphService {
  constructor(private client: ArmClient) {}

  /**
   * Run a Resource Graph query, following `$skipToken` until the rows run out or
   * `maxResults` is reached. `truncated` is true whenever rows may have been left
   * behind - callers must not read an empty or short result as "nothing exists".
   */
  private async queryResourceGraph(
    query: string,
    maxResults: number
  ): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
    const subscriptions = [this.client.getSubscriptionId()];
    const rows: Record<string, unknown>[] = [];
    let skipToken: string | undefined;

    do {
      const response: ResourceGraphResponse = await this.client.post<ResourceGraphResponse>(
        RESOURCE_GRAPH_PATH,
        {
          query,
          subscriptions,
          options: {
            resultFormat: 'objectArray',
            ...(skipToken ? { $skipToken: skipToken } : {}),
          },
        },
        getApiVersion('Microsoft.ResourceGraph/resources')
      );

      const page = (response.data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      skipToken = response.$skipToken;

      if (rows.length >= maxResults) {
        return {
          rows: rows.slice(0, maxResults),
          truncated: rows.length > maxResults || Boolean(skipToken),
        };
      }

      // Resource Graph withholds `$skipToken` whenever it truncates - a `limit`
      // clause, or a projection of only dynamic columns, disables paging entirely.
      // A full page with no continuation token therefore cannot be told apart from
      // "exactly one page of rows exists". Reporting `truncated` is the honest read;
      // a false positive at exactly 1000 rows is cheaper than silently dropping rows.
      if (!skipToken && page.length >= RESOURCE_GRAPH_PAGE_SIZE) {
        return { rows, truncated: true };
      }
    } while (skipToken);

    return { rows, truncated: false };
  }

  // 1. Network security groups

  async listNetworkSecurityGroups(
    options: {
      resourceGroup?: string;
      associatedSubnet?: string;
      associatedNic?: string;
      maxResults?: number;
    } = {}
  ): Promise<{
    data: NsgSummary[];
    truncated: boolean;
    summary: {
      total: number;
      byResourceGroup: Record<string, number>;
      associated: number;
      unassociated: number;
    };
  }> {
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    assertMaxResults(maxResults);

    const { rows, truncated } = await this.queryResourceGraph(
      buildNsgQuery({ resourceGroup: options.resourceGroup }),
      maxResults
    );

    let data = rows.map(mapNsgRow);

    // Subnet/NIC association lives inside the dynamic `properties` blob, so these
    // two filters run over the rows already fetched - they narrow the page, they
    // do not narrow the query. With `truncated: true` a match may sit past the cut.
    if (options.associatedSubnet) {
      const needle = options.associatedSubnet.toLowerCase();
      data = data.filter((nsg) => nsg.associatedSubnets.some((s) => s.id.toLowerCase().includes(needle)));
    }
    if (options.associatedNic) {
      const needle = options.associatedNic.toLowerCase();
      data = data.filter((nsg) => nsg.associatedNics.some((n) => n.id.toLowerCase().includes(needle)));
    }

    const summary = {
      total: data.length,
      byResourceGroup: {} as Record<string, number>,
      associated: 0,
      unassociated: 0,
    };

    for (const nsg of data) {
      summary.byResourceGroup[nsg.resourceGroup] = (summary.byResourceGroup[nsg.resourceGroup] || 0) + 1;
      if (nsg.associatedSubnets.length > 0 || nsg.associatedNics.length > 0) summary.associated++;
      else summary.unassociated++;
    }

    return { data, truncated, summary };
  }

  // 2. Role assignments

  async listRoleAssignments(
    options: {
      principalId?: string;
      roleDefinitionId?: string;
      scope?: string;
      maxResults?: number;
    } = {}
  ): Promise<{
    data: RoleAssignmentSummary[];
    truncated: boolean;
    summary: {
      total: number;
      byRole: Record<string, number>;
      byPrincipalType: Record<string, number>;
      /** Assignments whose role definition could not be read. Their names are `null`, not guessed. */
      unresolvedRoleNames: number;
      /**
       * Unresolved assignments counted by their raw `roleDefinitionId`, so the data is
       * still joinable against a role-definition list obtained some other way.
       */
      byUnresolvedRoleDefinitionId: Record<string, number>;
      /** Role definitions the lookup returned. Zero means the lookup itself found nothing. */
      roleDefinitionsFound: number;
      /** True when the role-definition lookup itself was cut short, so names may be missing for that reason alone. */
      roleDefinitionsTruncated: boolean;
      /** Set when the result is wholly unresolved, which is a failure rather than a finding. */
      note: string | null;
    };
  }> {
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    assertMaxResults(maxResults);

    const { rows: assignmentRows, truncated } = await this.queryResourceGraph(
      buildRoleAssignmentQuery(options),
      maxResults
    );

    // Built-ins alone run to several hundred definitions, so the lookup gets the
    // full ceiling - a short map would silently null out real role names.
    const { rows: roleDefRows, truncated: roleDefinitionsTruncated } = await this.queryResourceGraph(
      buildRoleDefinitionQuery(),
      MAX_RESULTS_CEILING
    );

    const roleNameMap = new Map<string, string>();
    for (const row of roleDefRows) {
      const guid = roleDefinitionGuid((row.roleDefinitionId as string) || '');
      const roleName = (row.roleName as string) || '';
      if (guid && roleName) roleNameMap.set(guid, roleName);
    }

    const data: RoleAssignmentSummary[] = assignmentRows.map((row) => {
      const props = (row.properties || {}) as Record<string, unknown>;
      const roleDefinitionId = (props.roleDefinitionId || '') as string;
      return {
        id: row.id as string,
        principalId: (props.principalId || '') as string,
        principalType: (props.principalType || 'Unknown') as string,
        roleDefinitionId,
        roleDefinitionName: roleNameMap.get(roleDefinitionGuid(roleDefinitionId)) ?? null,
        scope: (props.scope || '') as string,
        createdOn: props.createdOn as string | undefined,
      };
    });

    const summary = {
      total: data.length,
      byRole: {} as Record<string, number>,
      byPrincipalType: {} as Record<string, number>,
      unresolvedRoleNames: 0,
      byUnresolvedRoleDefinitionId: {} as Record<string, number>,
      roleDefinitionsFound: roleNameMap.size,
      roleDefinitionsTruncated,
      note: null as string | null,
    };

    for (const item of data) {
      // An unresolved name is counted on its own rather than bucketed under a
      // fabricated 'Unknown' role, which would read as a real role in the summary.
      if (item.roleDefinitionName === null) {
        summary.unresolvedRoleNames++;
        const key = item.roleDefinitionId || '(none)';
        summary.byUnresolvedRoleDefinitionId[key] =
          (summary.byUnresolvedRoleDefinitionId[key] || 0) + 1;
      } else {
        summary.byRole[item.roleDefinitionName] = (summary.byRole[item.roleDefinitionName] || 0) + 1;
      }

      summary.byPrincipalType[item.principalType] = (summary.byPrincipalType[item.principalType] || 0) + 1;
    }

    // Some assignments referencing a role this principal cannot read is ordinary.
    // Every one of them is not: it means the lookup failed, not that the roles are
    // unknown to Azure, and a bare count of unresolved names reads like a finding.
    if (data.length > 0 && summary.unresolvedRoleNames === data.length) {
      summary.note = ROLE_NAMES_WHOLLY_UNRESOLVED_NOTE;
    }

    return { data, truncated, summary };
  }

  // 3. Private endpoints

  async listPrivateEndpoints(
    options: { resourceGroup?: string; targetResourceId?: string; maxResults?: number } = {}
  ): Promise<{
    data: PrivateEndpointSummary[];
    truncated: boolean;
    summary: {
      total: number;
      byResourceGroup: Record<string, number>;
      byTargetResourceType: Record<string, number>;
      byConnectionStatus: Record<string, number>;
    };
  }> {
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    assertMaxResults(maxResults);

    const { rows, truncated } = await this.queryResourceGraph(
      buildPrivateEndpointQuery({ resourceGroup: options.resourceGroup }),
      maxResults
    );

    let data = rows.map(mapPrivateEndpointRow);

    // Same caveat as the NSG association filters: this narrows the fetched page.
    if (options.targetResourceId) {
      const needle = options.targetResourceId.toLowerCase();
      data = data.filter((pe) => pe.targetResourceId?.toLowerCase().includes(needle));
    }

    const summary = {
      total: data.length,
      byResourceGroup: {} as Record<string, number>,
      byTargetResourceType: {} as Record<string, number>,
      byConnectionStatus: {} as Record<string, number>,
    };

    for (const pe of data) {
      summary.byResourceGroup[pe.resourceGroup] = (summary.byResourceGroup[pe.resourceGroup] || 0) + 1;
      const targetType = pe.targetResourceType || 'Unknown';
      summary.byTargetResourceType[targetType] = (summary.byTargetResourceType[targetType] || 0) + 1;
      const status = pe.connectionStatus || 'Unknown';
      summary.byConnectionStatus[status] = (summary.byConnectionStatus[status] || 0) + 1;
    }

    return { data, truncated, summary };
  }

  // 4. Resource consumers

  async findResourceConsumers(options: { resourceId: string; maxResults?: number }): Promise<{
    data: ResourceConsumer[];
    truncated: boolean;
    summary: { total: number; byResourceType: Record<string, number> };
  }> {
    assertResourceId(options.resourceId);
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    assertMaxResults(maxResults);

    const { rows, truncated } = await this.queryResourceGraph(
      buildResourceConsumerQuery({ resourceId: options.resourceId }),
      maxResults
    );

    const data: ResourceConsumer[] = [];
    for (const row of rows) {
      const props = (row.properties || {}) as Record<string, unknown>;
      const paths = findPropertyPaths(props, options.resourceId);
      if (paths.length === 0) continue;

      data.push({
        id: row.id as string,
        name: row.name as string,
        type: row.type as string,
        resourceGroup: (row.resourceGroup as string) || extractResourceGroup(row.id as string),
        location: row.location as string,
        propertyPath: paths.join(', '),
      });
    }

    const summary = { total: data.length, byResourceType: {} as Record<string, number> };
    for (const item of data) {
      summary.byResourceType[item.type] = (summary.byResourceType[item.type] || 0) + 1;
    }

    return { data, truncated, summary };
  }

  // 5. Diagnostic settings

  /**
   * Diagnostic settings are an extension resource and are not indexed by Resource
   * Graph, so this costs one ARM call per target resource. Resource Graph only
   * supplies the target list.
   */
  async listDiagnosticSettings(
    options: {
      resourceIds?: string[];
      resourceGroup?: string;
      resourceType?: string;
      maxResources?: number;
    } = {}
  ): Promise<{
    data: DiagnosticSettingSummary[];
    truncated: boolean;
    unreadableResources: UnreadableResource[];
    summary: {
      total: number;
      resourcesInspected: number;
      resourcesWithSettings: number;
      resourcesWithoutSettings: number;
      /** Resources whose settings could not be read at all - NOT evidence that none are configured. */
      resourcesUnreadable: number;
      byTargetResourceType: Record<string, number>;
      byDestinationType: Record<string, number>;
    };
  }> {
    const maxResources = options.maxResources ?? DEFAULT_MAX_DIAGNOSTIC_RESOURCES;
    assertMaxResults(maxResources, MAX_DIAGNOSTIC_RESOURCES_CEILING);

    let targetResourceIds = options.resourceIds ?? [];
    let truncated = false;

    if (targetResourceIds.length === 0) {
      const result = await this.queryResourceGraph(
        buildDiagnosticTargetQuery({
          resourceGroup: options.resourceGroup,
          resourceType: options.resourceType,
        }),
        maxResources
      );
      targetResourceIds = result.rows.map((row) => row.id as string);
      truncated = result.truncated;
    } else if (targetResourceIds.length > maxResources) {
      targetResourceIds = targetResourceIds.slice(0, maxResources);
      truncated = true;
    }

    const apiVersion = getApiVersion('Microsoft.Insights/diagnosticSettings');
    const data: DiagnosticSettingSummary[] = [];
    const unreadableResources: UnreadableResource[] = [];
    let resourcesWithSettings = 0;
    let resourcesWithoutSettings = 0;

    for (let i = 0; i < targetResourceIds.length; i += DIAGNOSTIC_SETTINGS_CONCURRENCY) {
      const batch = targetResourceIds.slice(i, i + DIAGNOSTIC_SETTINGS_CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(async (resourceId) => {
          const path = `${resourceId}/providers/Microsoft.Insights/diagnosticSettings`;
          const response = await this.client.get<{ value: Array<Record<string, unknown>> }>(
            path,
            apiVersion
          );
          return { resourceId, settings: response.value || [] };
        })
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { resourceId, settings } = result.value;
          if (settings.length === 0) {
            // A resource type that does not support diagnostic settings answers
            // 200 with an empty list, exactly as one that supports them but has
            // none configured. Both are genuinely "nothing configured".
            resourcesWithoutSettings++;
            return;
          }
          resourcesWithSettings++;
          for (const setting of settings) data.push(mapDiagnosticSetting(setting, resourceId));
          return;
        }

        // A rejection means we could not look: 403 (no Monitoring Reader), 404
        // (resource gone), or a transport failure. Counting these as "no settings
        // configured" - as the source this was ported from did - turns a
        // permissions gap into a clean audit result.
        const reason: unknown = result.reason;
        unreadableResources.push({
          resourceId: batch[index],
          status: getArmErrorStatus(reason),
          error: reason instanceof Error ? reason.message : String(reason),
        });
      });
    }

    const summary = {
      total: data.length,
      resourcesInspected: targetResourceIds.length,
      resourcesWithSettings,
      resourcesWithoutSettings,
      resourcesUnreadable: unreadableResources.length,
      byTargetResourceType: {} as Record<string, number>,
      byDestinationType: {} as Record<string, number>,
    };

    for (const setting of data) {
      summary.byTargetResourceType[setting.targetResourceType] =
        (summary.byTargetResourceType[setting.targetResourceType] || 0) + 1;
      if (setting.workspaceId) summary.byDestinationType.workspace = (summary.byDestinationType.workspace || 0) + 1;
      if (setting.storageAccountId) summary.byDestinationType.storage = (summary.byDestinationType.storage || 0) + 1;
      if (setting.eventHubAuthorizationRuleId)
        summary.byDestinationType.eventHub = (summary.byDestinationType.eventHub || 0) + 1;
    }

    return { data, truncated, unreadableResources, summary };
  }

  // 6. Resource relationships

  async getResourceRelationships(options: { resourceId: string; maxResults?: number }): Promise<{
    data: {
      self: ResourceRelationship | null;
      sameSubnet: ResourceRelationship[];
      sameVnet: ResourceRelationship[];
      referencesThis: ResourceRelationship[];
      referencedByThis: ResourceRelationship[];
    };
    truncated: boolean;
    summary: {
      sameSubnet: number;
      sameVnet: number;
      referencesThis: number;
      referencedByThis: number;
      forwardReferencesTruncated: boolean;
    };
  }> {
    assertResourceId(options.resourceId);
    const { resourceId } = options;
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    assertMaxResults(maxResults);

    let truncated = false;
    const track = <T>(result: { rows: T[]; truncated: boolean }): T[] => {
      truncated = truncated || result.truncated;
      return result.rows;
    };

    const selfRows = track(await this.queryResourceGraph(buildSelfResourceQuery(resourceId), 1));
    const selfResource = selfRows.length > 0 ? selfRows[0] : null;
    const self = selfResource ? toRelationship(selfResource, 'self') : null;

    let sameSubnet: ResourceRelationship[] = [];
    let sameVnet: ResourceRelationship[] = [];
    let referencedByThis: ResourceRelationship[] = [];
    let forwardReferencesTruncated = false;

    if (selfResource) {
      const props = (selfResource.properties || {}) as Record<string, unknown>;
      const subnetId = extractSubnetId(props);
      const vnetId = subnetId ? subnetId.replace(/\/subnets\/[^/]+$/i, '') : extractVnetId(props);

      if (subnetId) {
        const rows = track(
          await this.queryResourceGraph(buildSameSubnetQuery({ resourceId, subnetId }), maxResults)
        );
        sameSubnet = rows.map((row) => toRelationship(row, 'same-subnet'));
      }

      if (vnetId) {
        const rows = track(
          await this.queryResourceGraph(buildSameVnetQuery({ resourceId, vnetId, subnetId }), maxResults)
        );
        sameVnet = rows.map((row) => toRelationship(row, 'same-vnet'));
      }

      const referencedIds = [
        ...new Set(
          extractResourceIds(props).filter((id) => id.toLowerCase() !== resourceId.toLowerCase())
        ),
      ];

      if (referencedIds.length > 0) {
        forwardReferencesTruncated = referencedIds.length > MAX_FORWARD_REFERENCES;
        const rows = track(
          await this.queryResourceGraph(buildForwardReferenceQuery({ resourceIds: referencedIds }), maxResults)
        );
        referencedByThis = rows.map((row) => toRelationship(row, 'referenced-by-this'));
      }
    }

    const referencesThisRows = track(
      await this.queryResourceGraph(buildReferencesThisQuery({ resourceId }), maxResults)
    );
    const referencesThis = referencesThisRows.map((row) => toRelationship(row, 'references-this'));

    return {
      data: { self, sameSubnet, sameVnet, referencesThis, referencedByThis },
      truncated: truncated || forwardReferencesTruncated,
      summary: {
        sameSubnet: sameSubnet.length,
        sameVnet: sameVnet.length,
        referencesThis: referencesThis.length,
        referencedByThis: referencedByThis.length,
        forwardReferencesTruncated,
      },
    };
  }
}
