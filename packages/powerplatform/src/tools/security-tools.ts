/**
 * Security Tools - 4 tools for connection references and security roles
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerSecurityTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-connection-references",
    `Get all connection references in the environment with their connection status and connector details.

Connection references define the connector configurations used by Power Automate flows and other components.
Returns a summary with counts by connector type, plus the full list of connection references.`,
    {
      maxRecords: z.number().optional().describe("Maximum records to return (default: 100)"),
      managedOnly: z.boolean().optional().describe("Filter to managed connection references only (default: false)"),
      hasConnection: z.boolean().optional().describe("Filter: true = only with connections set, false = only without connections"),
    },
    async ({ maxRecords, managedOnly, hasConnection }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getConnectionReferences({
          maxRecords,
          managedOnly,
          hasConnection,
        });

        const summaryLines = [
          `Total: ${result.summary.total}`,
          `With connection: ${result.summary.withConnection}`,
          `Without connection: ${result.summary.withoutConnection}`,
          `Managed: ${result.summary.managed}, Unmanaged: ${result.summary.unmanaged}`,
          '',
          'By connector:',
          ...Object.entries(result.summary.byConnector)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([name, count]) => `  ${name}: ${count}`),
        ];

        const refLines = result.references.map((r: any) =>
          `- ${r.displayName} (${r.logicalName})\n` +
          `  Connector: ${r.connectorId}\n` +
          `  Connection: ${r.connectionId ? r.connectionId : 'Not set'}\n` +
          `  State: ${r.stateCode === 0 ? 'Active' : 'Inactive'} | Managed: ${r.isManaged}`
        );

        return {
          content: [{
            type: "text",
            text: `Connection References\n\n${summaryLines.join('\n')}\n\n${refLines.join('\n\n')}`,
          }],
        };
      } catch (error: any) {
        console.error("Error getting connection references:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get connection references: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-security-roles",
    `Get custom security roles defined in the environment. By default excludes well-known system roles (System Administrator, System Customizer, etc.).

Useful for security audits and understanding what custom roles exist in the environment.`,
    {
      solutionUniqueName: z.string().optional().describe(
        descWithExamples("Filter to roles in a specific solution", SOLUTION_NAME_EXAMPLES)
      ),
      excludeSystemRoles: z.boolean().optional().describe("Exclude System Administrator, System Customizer, and other built-in roles (default: true)"),
      maxRecords: z.number().optional().describe("Maximum records to return (default: 100)"),
    },
    async ({ solutionUniqueName, excludeSystemRoles, maxRecords }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getSecurityRoles({
          solutionUniqueName,
          excludeSystemRoles,
          maxRecords,
        });

        const summaryLines = [
          `Total: ${result.summary.total}`,
          `Managed: ${result.summary.managed}, Unmanaged: ${result.summary.unmanaged}`,
          result.summary.systemRolesExcluded > 0
            ? `System roles excluded: ${result.summary.systemRolesExcluded}`
            : null,
        ].filter(Boolean);

        const roleLines = result.roles.map((r: any) =>
          `- ${r.name}\n` +
          `  ID: ${r.roleId}\n` +
          `  Unique ID: ${r.roleIdUnique}\n` +
          `  Managed: ${r.isManaged} | Customizable: ${r.isCustomizable}`
        );

        return {
          content: [{
            type: "text",
            text: `Security Roles\n\n${summaryLines.join('\n')}\n\n${roleLines.join('\n\n')}`,
          }],
        };
      } catch (error: any) {
        console.error("Error getting security roles:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get security roles: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-security-role-privileges",
    `Get the privilege assignments for a specific security role, showing what entities/actions the role grants access to.

Results are grouped by entity, showing the access depth (User/Business Unit/Parent:Child BU/Organization) for each action (Create, Read, Write, Delete, Append, AppendTo, Assign, Share).`,
    {
      roleId: z.string().describe("The role ID (GUID) to get privileges for"),
      entityFilter: z.string().optional().describe("Filter privileges to a specific entity name (partial match)"),
      accessRightFilter: z.string().optional().describe("Filter by access right: Create, Read, Write, Delete, Append, AppendTo, Assign, Share"),
    },
    async ({ roleId, entityFilter, accessRightFilter }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getSecurityRolePrivileges({
          roleId,
          entityFilter,
          accessRightFilter,
        });

        const summaryLines = [
          `Role ID: ${result.roleId}`,
          `Total privileges: ${result.summary.total}`,
          `Entities: ${result.summary.entityCount}`,
          '',
          'By access right:',
          ...Object.entries(result.summary.byAccessRight)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([right, count]) => `  ${right}: ${count}`),
        ];

        const entityLines = Object.entries(result.groupedByEntity)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([entity, privs]) => {
            const privLines = (privs as any[]).map(
              (p: any) => `    ${p.accessRight}: ${p.depth}`
            );
            return `  ${entity}:\n${privLines.join('\n')}`;
          });

        return {
          content: [{
            type: "text",
            text: `Security Role Privileges\n\n${summaryLines.join('\n')}\n\nPrivileges by Entity:\n${entityLines.join('\n\n')}`,
          }],
        };
      } catch (error: any) {
        console.error("Error getting security role privileges:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get security role privileges: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-security-roles-by-solution",
    `Get all security roles that are components of a specific solution.

Queries solution components with componenttype=20 (Security Role) and fetches role details.
Optionally includes a privilege summary for each role (slower due to additional API calls).`,
    {
      solutionUniqueName: z.string().describe(
        descWithExamples("The solution unique name to get roles from", SOLUTION_NAME_EXAMPLES)
      ),
      includePrivileges: z.boolean().optional().describe("Include privilege count summary per role (default: false, slower)"),
    },
    async ({ solutionUniqueName, includePrivileges }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getSecurityRolesBySolution({
          solutionUniqueName,
          includePrivileges,
        });

        const roleLines = result.roles.map((r: any) => {
          let line = `- ${r.name}\n` +
            `  ID: ${r.roleId}\n` +
            `  Managed: ${r.isManaged} | Customizable: ${r.isCustomizable}`;
          if (r.privilegeSummary) {
            line += `\n  Privileges: ${r.privilegeSummary.total} across ${r.privilegeSummary.entityCount} entities`;
          }
          return line;
        });

        return {
          content: [{
            type: "text",
            text: `Security Roles in Solution '${result.solutionUniqueName}'\n\n` +
              `Total: ${result.summary.total}\n\n${roleLines.join('\n\n')}`,
          }],
        };
      } catch (error: any) {
        console.error("Error getting security roles by solution:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get security roles by solution: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );
}
