import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, RESOURCE_GROUP_EXAMPLES, SQL_SERVER_EXAMPLES } from '../tool-examples.js';

export function registerSqlTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'list-sql-servers',
    'List all SQL Servers in the subscription or resource group',
    {
      resourceGroup: z
        .string()
        .optional()
        .describe(descWithExamples('Filter by resource group', RESOURCE_GROUP_EXAMPLES)),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.sql.listSqlServers(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing SQL servers:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'list-sql-databases',
    'List all databases on a SQL Server',
    {
      serverName: z
        .string()
        .describe(descWithExamples('SQL Server name', SQL_SERVER_EXAMPLES)),
      resourceGroup: z.string().optional().describe('Resource group (uses default if not specified)'),
    },
    async (args: any) => {
      try {
        const result = await ctx.management.sql.listSqlDatabases(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error listing SQL databases:', error);
        return { content: [{ type: 'text', text: `Failed: ${message}` }], isError: true };
      }
    }
  );
}
