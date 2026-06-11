/**
 * Domain Tools - Microsoft Fabric domain (governance) MCP tools.
 *
 * Domain routes use the Fabric admin API and require Fabric admin rights.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, DOMAIN_ID_EXAMPLES } from '../tool-examples.js';

export function registerDomainTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'fabric-list-domains',
    'List all Microsoft Fabric domains in the tenant. Uses the Fabric admin API - requires Fabric admin rights.',
    {},
    async () => {
      try {
        const result = await ctx.domains.listDomains();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error listing Fabric domains:', error);
        return { content: [{ type: 'text', text: `Failed to list domains: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-get-domain',
    'Get details of a single Microsoft Fabric domain by ID. Uses the Fabric admin API - requires Fabric admin rights.',
    {
      domainId: z.string().describe(descWithExamples('Domain ID (GUID)', DOMAIN_ID_EXAMPLES)),
    },
    async ({ domainId }: any) => {
      try {
        const result = await ctx.domains.getDomain(domainId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error getting Fabric domain:', error);
        return { content: [{ type: 'text', text: `Failed to get domain: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-assign-domain-workspaces',
    'Assign one or more workspaces to a Microsoft Fabric domain. WRITE operation - requires FABRIC_ENABLE_WRITE=true. Uses the Fabric admin API.',
    {
      domainId: z.string().describe('Domain ID (GUID)'),
      workspaceIds: z.array(z.string()).describe('Array of workspace IDs (GUIDs) to assign to the domain'),
    },
    async ({ domainId, workspaceIds }: any) => {
      try {
        const result = await ctx.domains.assignWorkspaces(domainId, workspaceIds);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error assigning workspaces to Fabric domain:', error);
        return { content: [{ type: 'text', text: `Failed to assign workspaces to domain: ${error.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'fabric-unassign-domain-workspaces',
    'Unassign one or more workspaces from a Microsoft Fabric domain. WRITE operation - requires FABRIC_ENABLE_WRITE=true. Uses the Fabric admin API.',
    {
      domainId: z.string().describe('Domain ID (GUID)'),
      workspaceIds: z.array(z.string()).describe('Array of workspace IDs (GUIDs) to unassign from the domain'),
    },
    async ({ domainId, workspaceIds }: any) => {
      try {
        const result = await ctx.domains.unassignWorkspaces(domainId, workspaceIds);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error('Error unassigning workspaces from Fabric domain:', error);
        return { content: [{ type: 'text', text: `Failed to unassign workspaces from domain: ${error.message}` }], isError: true };
      }
    },
  );
}
