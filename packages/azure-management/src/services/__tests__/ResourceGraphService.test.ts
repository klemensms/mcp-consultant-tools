import { describe, it, expect } from 'vitest';
import type { ArmClient } from '../../client/ArmClient.js';
import type { ArmRequestError } from '../../client/ArmClient.js';
import {
  ResourceGraphService,
  RESOURCE_GRAPH_PAGE_SIZE,
  buildNsgQuery,
  buildPrivateEndpointQuery,
  buildRoleAssignmentQuery,
  buildRoleDefinitionQuery,
  buildResourceConsumerQuery,
  buildDiagnosticTargetQuery,
  buildSelfResourceQuery,
  buildReferencesThisQuery,
  buildSameSubnetQuery,
  buildSameVnetQuery,
  buildForwardReferenceQuery,
  assertMaxResults,
  assertResourceId,
  findPropertyPaths,
  extractResourceIds,
  extractSubnetId,
  extractVnetId,
  mapNsgRow,
  mapPrivateEndpointRow,
} from '../ResourceGraphService.js';

const SUBSCRIPTION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const RESOURCE_ID = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-dev-uks-01/providers/Microsoft.Web/sites/app-dev-web-uks-01`;
const SUBNET_ID = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-dev-uks-01/providers/Microsoft.Network/virtualNetworks/vnet-dev-uks-01/subnets/snet-app`;

/** A payload that closes the KQL literal and appends a clause, unless escaped. */
const BREAKOUT = "x\\' or 1==1 //";

type PostHandler = (path: string, body: any) => unknown;

function stubClient(options: { post?: PostHandler; get?: (path: string) => unknown } = {}): ArmClient {
  return {
    getSubscriptionId: () => SUBSCRIPTION_ID,
    getDefaultResourceGroup: () => undefined,
    post: async (path: string, body: unknown) => options.post?.(path, body) ?? { data: [] },
    get: async (path: string) => options.get?.(path) ?? { value: [] },
  } as unknown as ArmClient;
}

/** Every query built by this service must be scoped by `=~`, never `==`. */
const ALL_BUILDERS: Array<[string, string]> = [
  ['nsg', buildNsgQuery()],
  ['privateEndpoint', buildPrivateEndpointQuery()],
  ['roleAssignment', buildRoleAssignmentQuery()],
  ['roleDefinition', buildRoleDefinitionQuery()],
  ['resourceConsumer', buildResourceConsumerQuery({ resourceId: RESOURCE_ID })],
  ['selfResource', buildSelfResourceQuery(RESOURCE_ID)],
  ['referencesThis', buildReferencesThisQuery({ resourceId: RESOURCE_ID })],
  ['sameSubnet', buildSameSubnetQuery({ resourceId: RESOURCE_ID, subnetId: SUBNET_ID })],
  ['sameVnet', buildSameVnetQuery({ resourceId: RESOURCE_ID, vnetId: 'vnet', subnetId: SUBNET_ID })],
];

describe('query builders — KQL injection', () => {
  it('neutralises a break-out payload in every string-interpolating builder', () => {
    const queries = [
      buildNsgQuery({ resourceGroup: BREAKOUT }),
      buildPrivateEndpointQuery({ resourceGroup: BREAKOUT }),
      buildRoleAssignmentQuery({ principalId: BREAKOUT }),
      buildRoleAssignmentQuery({ roleDefinitionId: BREAKOUT }),
      buildRoleAssignmentQuery({ scope: BREAKOUT }),
      buildResourceConsumerQuery({ resourceId: BREAKOUT }),
      buildDiagnosticTargetQuery({ resourceGroup: BREAKOUT, resourceType: BREAKOUT }),
      buildSelfResourceQuery(BREAKOUT),
      buildReferencesThisQuery({ resourceId: BREAKOUT }),
      buildSameSubnetQuery({ resourceId: BREAKOUT, subnetId: BREAKOUT }),
      buildSameVnetQuery({ resourceId: BREAKOUT, vnetId: BREAKOUT, subnetId: BREAKOUT }),
      buildForwardReferenceQuery({ resourceIds: [BREAKOUT] }),
    ];

    for (const query of queries) {
      // The payload survives only in escaped form: the backslash is doubled, so
      // the quote that follows it is a literal quote, not a terminator.
      expect(query).toContain("x\\\\\\' or 1==1 //");
      // And the raw, unescaped payload never appears.
      expect(query).not.toContain("'x\\' or 1==1 //'");
    }
  });

  it('rejects a control character rather than emitting a broken literal', () => {
    expect(() => buildNsgQuery({ resourceGroup: 'a\nb' })).toThrow(/control characters/);
  });
});

describe('query builders — operators', () => {
  it('compares `type` with =~, never ==', () => {
    for (const [name, query] of ALL_BUILDERS) {
      if (!query.includes('where type')) continue;
      expect(query, `${name} must use =~ for type`).toMatch(/where type =~ /);
      expect(query, `${name} must not use == for type`).not.toMatch(/where type == /);
    }
  });

  it('stringifies the dynamic `properties` column before a substring match', () => {
    const queries = [
      buildResourceConsumerQuery({ resourceId: RESOURCE_ID }),
      buildReferencesThisQuery({ resourceId: RESOURCE_ID }),
      buildSameSubnetQuery({ resourceId: RESOURCE_ID, subnetId: SUBNET_ID }),
      buildSameVnetQuery({ resourceId: RESOURCE_ID, vnetId: 'vnet' }),
    ];
    for (const query of queries) {
      expect(query).toContain('tostring(properties) contains');
      expect(query).not.toMatch(/\bwhere properties contains\b/);
    }
  });

  it('orders paged queries by a projected unique key so $skipToken cannot drop or duplicate rows', () => {
    for (const [name, query] of ALL_BUILDERS) {
      if (query.includes('| limit ')) continue; // single-row lookups do not page

      const orderBy = query.match(/\| order by (\w+) asc$/m);
      expect(orderBy, `${name} must end with an ascending order-by`).not.toBeNull();

      const sortColumn = orderBy![1];
      const projection = query.match(/\| project (.+)$/m);
      if (projection) {
        expect(projection[1], `${name} must sort on a projected column`).toContain(sortColumn);
      }
      // Both `id` and the lowercased `roleDefinitionId` alias are unique per row.
      expect(['id', 'roleDefinitionId']).toContain(sortColumn);
    }
  });

  it('excludes same-subnet resources from the same-VNet bucket', () => {
    const query = buildSameVnetQuery({ resourceId: RESOURCE_ID, vnetId: 'vnet-dev-uks-01', subnetId: SUBNET_ID });
    expect(query).toContain('| where not(tostring(properties) contains');
  });

  it('omits the subnet exclusion when the resource has no subnet', () => {
    const query = buildSameVnetQuery({ resourceId: RESOURCE_ID, vnetId: 'vnet-dev-uks-01' });
    expect(query).not.toContain('not(');
  });

  it('caps the forward-reference `in (...)` list at 50 ids', () => {
    const ids = Array.from({ length: 80 }, (_, i) => `/subscriptions/${SUBSCRIPTION_ID}/r${i}`);
    const query = buildForwardReferenceQuery({ resourceIds: ids });
    expect(query.match(/\/r\d+'/g)?.length).toBe(50);
  });

  it('lowercases ids on both sides of the forward-reference comparison', () => {
    const query = buildForwardReferenceQuery({ resourceIds: ['/SUBSCRIPTIONS/ABC'] });
    expect(query).toContain('| where tolower(id) in (');
    expect(query).toContain("'/subscriptions/abc'");
  });

  it('joins role definitions on the whole lowercased id, matching ARG normalisation', () => {
    expect(buildRoleDefinitionQuery()).toContain('roleDefinitionId = tolower(id)');
  });
});

describe('argument validation', () => {
  it('rejects a non-integer or out-of-range maxResults', () => {
    expect(() => assertMaxResults(0)).toThrow(/between 1 and/);
    expect(() => assertMaxResults(1.5)).toThrow(/between 1 and/);
    expect(() => assertMaxResults(5001)).toThrow(/between 1 and/);
    expect(() => assertMaxResults(500)).not.toThrow();
  });

  it('rejects a resource id that is not a full ARM path', () => {
    expect(() => assertResourceId('app-dev-web-uks-01')).toThrow(/full ARM resource ID/);
    expect(() => assertResourceId('')).toThrow(/full ARM resource ID/);
    expect(() => assertResourceId(RESOURCE_ID)).not.toThrow();
  });
});

describe('property helpers', () => {
  it('reports the dot path of a nested reference', () => {
    const props = { siteConfig: { appSettings: [{ value: `x${RESOURCE_ID}y` }] } };
    expect(findPropertyPaths(props, RESOURCE_ID)).toEqual([
      'properties.siteConfig.appSettings[0].value',
    ]);
  });

  it('matches case-insensitively', () => {
    expect(findPropertyPaths({ a: RESOURCE_ID.toUpperCase() }, RESOURCE_ID)).toEqual(['properties.a']);
  });

  it('stops recursing past the depth cap instead of hanging', () => {
    let deep: Record<string, unknown> = { value: RESOURCE_ID };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => findPropertyPaths(deep, RESOURCE_ID)).not.toThrow();
    expect(findPropertyPaths(deep, RESOURCE_ID)).toEqual([]);
  });

  it('extracts ARM ids from strings, arrays and nested objects', () => {
    const props = {
      plain: RESOURCE_ID,
      list: [SUBNET_ID],
      nested: { deeper: { id: RESOURCE_ID } },
      notAnId: 'hello',
    };
    const ids = extractResourceIds(props);
    expect(ids).toContain(RESOURCE_ID);
    expect(ids).toContain(SUBNET_ID);
    expect(ids).not.toContain('hello');
  });

  it('finds a subnet id from each documented property shape', () => {
    expect(extractSubnetId({ virtualNetworkSubnetId: SUBNET_ID })).toBe(SUBNET_ID);
    expect(extractSubnetId({ subnet: { id: SUBNET_ID } })).toBe(SUBNET_ID);
    expect(extractSubnetId({ ipConfigurations: [{ properties: { subnet: { id: SUBNET_ID } } }] })).toBe(SUBNET_ID);
    expect(extractSubnetId({})).toBeUndefined();
  });

  it('derives a vnet id from a container-app style subnet resource id', () => {
    expect(extractVnetId({ vnetConfiguration: { subnetResourceId: SUBNET_ID } })).toBe(
      SUBNET_ID.replace(/\/subnets\/.*$/, '')
    );
  });
});

describe('row mappers', () => {
  it('reads NSG rules from properties.securityRules and both association arrays', () => {
    const nsg = mapNsgRow({
      id: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg-dev-uks-01/providers/Microsoft.Network/networkSecurityGroups/nsg-1`,
      name: 'nsg-1',
      resourceGroup: 'rg-dev-uks-01',
      location: 'uksouth',
      properties: {
        subnets: [{ id: SUBNET_ID }],
        networkInterfaces: [{ id: '/subscriptions/x/nic-1' }],
        securityRules: [
          { name: 'allow-https', properties: { priority: 100, direction: 'Inbound', access: 'Allow', protocol: 'Tcp' } },
        ],
      },
    });

    expect(nsg.associatedSubnets).toEqual([{ id: SUBNET_ID, name: 'snet-app' }]);
    expect(nsg.associatedNics[0].name).toBe('nic-1');
    expect(nsg.securityRules[0]).toMatchObject({ name: 'allow-https', priority: 100, access: 'Allow' });
  });

  it('does not invent an Inbound/Deny default for a rule missing direction or access', () => {
    // The source this was ported from defaulted to Inbound/Deny, which reads as a
    // real rule rather than a gap in the data.
    const nsg = mapNsgRow({
      id: '/subscriptions/x/resourceGroups/rg/providers/Microsoft.Network/networkSecurityGroups/nsg-1',
      name: 'nsg-1',
      location: 'uksouth',
      properties: { securityRules: [{ name: 'r' }] },
    });
    expect(nsg.securityRules[0].direction).toBe('');
    expect(nsg.securityRules[0].access).toBe('');
  });

  it('falls back to the manual connection array and derives the target type', () => {
    const pe = mapPrivateEndpointRow({
      id: '/subscriptions/x/resourceGroups/rg-dev-uks-01/providers/Microsoft.Network/privateEndpoints/pe-1',
      name: 'pe-1',
      location: 'uksouth',
      properties: {
        subnet: { id: SUBNET_ID },
        manualPrivateLinkServiceConnections: [
          {
            properties: {
              privateLinkServiceId: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv-1`,
              privateLinkServiceConnectionState: { status: 'Pending' },
              groupIds: ['vault'],
            },
          },
        ],
      },
    });

    expect(pe.targetResourceType).toBe('Microsoft.KeyVault/vaults');
    expect(pe.connectionStatus).toBe('Pending');
    expect(pe.groupIds).toEqual(['vault']);
    expect(pe.resourceGroup).toBe('rg-dev-uks-01');
  });
});

describe('pagination and truncation', () => {
  const row = (i: number) => ({ id: `/subscriptions/${SUBSCRIPTION_ID}/r${i}`, name: `r${i}`, location: 'uksouth', properties: {} });

  it('reports truncated when maxResults cuts the result short', async () => {
    const service = new ResourceGraphService(stubClient({ post: () => ({ data: [row(1), row(2), row(3)] }) }));
    const result = await service.listNetworkSecurityGroups({ maxResults: 2 });
    expect(result.data).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('reports truncated on a full page with no continuation token', async () => {
    // Resource Graph withholds $skipToken when it truncates, so a full page with
    // no token is indistinguishable from silent row loss.
    const full = Array.from({ length: RESOURCE_GRAPH_PAGE_SIZE }, (_, i) => row(i));
    const service = new ResourceGraphService(stubClient({ post: () => ({ data: full }) }));
    const result = await service.listNetworkSecurityGroups({ maxResults: 5000 });
    expect(result.truncated).toBe(true);
  });

  it('does not report truncated for a short single page', async () => {
    const service = new ResourceGraphService(stubClient({ post: () => ({ data: [row(1)] }) }));
    const result = await service.listNetworkSecurityGroups({});
    expect(result.truncated).toBe(false);
  });

  it('follows $skipToken across pages', async () => {
    let call = 0;
    const service = new ResourceGraphService(
      stubClient({
        post: () => {
          call++;
          return call === 1 ? { data: [row(1)], $skipToken: 'more' } : { data: [row(2)] };
        },
      })
    );
    const result = await service.listNetworkSecurityGroups({});
    expect(result.data).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(call).toBe(2);
  });
});

describe('listRoleAssignments', () => {
  function roleStub(roleDefinitions: Array<{ roleDefinitionId: string; roleName: string }>): ArmClient {
    return stubClient({
      post: (_path, body) => {
        const query = String(body.query);
        if (query.includes('roledefinitions')) return { data: roleDefinitions };
        return {
          data: [
            {
              id: '/ra/1',
              properties: {
                principalId: SUBSCRIPTION_ID,
                principalType: 'ServicePrincipal',
                roleDefinitionId: '/providers/Microsoft.Authorization/roleDefinitions/READER-GUID',
                scope: `/subscriptions/${SUBSCRIPTION_ID}`,
                createdOn: '2026-07-01T00:00:00Z',
              },
            },
          ],
        };
      },
    });
  }

  it('resolves the role name through a case-insensitive whole-id join', async () => {
    const service = new ResourceGraphService(
      roleStub([{ roleDefinitionId: '/providers/microsoft.authorization/roledefinitions/reader-guid', roleName: 'Reader' }])
    );
    const result = await service.listRoleAssignments({});
    expect(result.data[0].roleDefinitionName).toBe('Reader');
    expect(result.summary.byRole).toEqual({ Reader: 1 });
    expect(result.summary.unresolvedRoleNames).toBe(0);
  });

  it('leaves an unresolved role name null and counts it, rather than labelling it "Unknown"', async () => {
    // A fabricated 'Unknown' role would appear in byRole as though Azure had a
    // role by that name, hiding a failed lookup behind a plausible summary.
    const service = new ResourceGraphService(roleStub([]));
    const result = await service.listRoleAssignments({});
    expect(result.data[0].roleDefinitionName).toBeNull();
    expect(result.summary.byRole).toEqual({});
    expect(result.summary.unresolvedRoleNames).toBe(1);
  });

  it('drops the undocumented createdDateTime fallback and reads createdOn', async () => {
    const service = new ResourceGraphService(roleStub([]));
    const result = await service.listRoleAssignments({});
    expect(result.data[0].createdOn).toBe('2026-07-01T00:00:00Z');
  });
});

describe('listDiagnosticSettings', () => {
  function armError(status: number, message: string): ArmRequestError {
    const error = new Error(message) as ArmRequestError;
    error.status = status;
    return error;
  }

  it('counts a 200 with an empty list as genuinely nothing configured', async () => {
    const service = new ResourceGraphService(stubClient({ get: () => ({ value: [] }) }));
    const result = await service.listDiagnosticSettings({ resourceIds: [RESOURCE_ID] });
    expect(result.summary.resourcesWithoutSettings).toBe(1);
    expect(result.summary.resourcesUnreadable).toBe(0);
  });

  it('does NOT count a 403 as "no diagnostic settings configured"', async () => {
    // The source this was ported from bucketed every rejection as "not
    // configured", turning a permissions gap into a clean audit result.
    const service = new ResourceGraphService(
      stubClient({
        get: () => {
          throw armError(403, 'AuthorizationFailed: caller lacks Microsoft.Insights/diagnosticSettings/read');
        },
      })
    );
    const result = await service.listDiagnosticSettings({ resourceIds: [RESOURCE_ID] });

    expect(result.summary.resourcesWithoutSettings).toBe(0);
    expect(result.summary.resourcesUnreadable).toBe(1);
    expect(result.unreadableResources[0]).toMatchObject({ resourceId: RESOURCE_ID, status: 403 });
  });

  it('attributes each unreadable resource to the right id when a batch partly fails', async () => {
    const otherId = RESOURCE_ID.replace('app-dev-web-uks-01', 'app-dev-api-uks-01');
    const service = new ResourceGraphService(
      stubClient({
        get: (path: string) => {
          if (path.startsWith(otherId)) throw armError(404, 'ResourceNotFound');
          return { value: [{ id: '/ds/1', name: 'to-law', properties: { workspaceId: '/ws/1', logs: [], metrics: [] } }] };
        },
      })
    );
    const result = await service.listDiagnosticSettings({ resourceIds: [RESOURCE_ID, otherId] });

    expect(result.summary.resourcesWithSettings).toBe(1);
    expect(result.summary.resourcesUnreadable).toBe(1);
    expect(result.unreadableResources[0].resourceId).toBe(otherId);
    expect(result.summary.byDestinationType).toEqual({ workspace: 1 });
  });

  it('truncates an over-long explicit resource list rather than fanning out unbounded', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `${RESOURCE_ID}-${i}`);
    const service = new ResourceGraphService(stubClient({ get: () => ({ value: [] }) }));
    const result = await service.listDiagnosticSettings({ resourceIds: ids, maxResources: 5 });
    expect(result.summary.resourcesInspected).toBe(5);
    expect(result.truncated).toBe(true);
  });
});

describe('getResourceRelationships', () => {
  it('returns a null self and empty buckets when the resource does not exist', async () => {
    const service = new ResourceGraphService(stubClient({ post: () => ({ data: [] }) }));
    const result = await service.getResourceRelationships({ resourceId: RESOURCE_ID });
    expect(result.data.self).toBeNull();
    expect(result.summary.referencesThis).toBe(0);
  });

  it('flags forwardReferencesTruncated when a resource references more than the in-clause cap', async () => {
    const manyIds = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`ref${i}`, `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg/providers/X/y/r${i}`])
    );
    const service = new ResourceGraphService(
      stubClient({
        post: (_path, body) => {
          const query = String(body.query);
          if (query.includes('| limit 1')) {
            return { data: [{ id: RESOURCE_ID, name: 'app', type: 'microsoft.web/sites', location: 'uksouth', properties: manyIds }] };
          }
          return { data: [] };
        },
      })
    );

    const result = await service.getResourceRelationships({ resourceId: RESOURCE_ID });
    expect(result.summary.forwardReferencesTruncated).toBe(true);
    expect(result.truncated).toBe(true);
  });
});
