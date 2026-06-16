import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SERVER_ID_EXAMPLES } from '../tool-examples.js';

/**
 * Helper to build "defaults used" message for tool responses.
 * Only shows message when defaults were actually used (parameters were omitted).
 */
function buildDefaultsUsedMessage(
  providedServerId: string | undefined,
  resolvedServerId: string,
  providedDatabase?: string | undefined,
  resolvedDatabase?: string
): string {
  const defaultsUsed: string[] = [];
  if (!providedServerId) defaultsUsed.push(`server='${resolvedServerId}'`);
  if (resolvedDatabase !== undefined && !providedDatabase) defaultsUsed.push(`database='${resolvedDatabase}'`);

  if (defaultsUsed.length > 0) {
    return `\n\n\u2139\uFE0F Used defaults: ${defaultsUsed.join(', ')}`;
  }
  return '';
}

export function registerConnectionTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "sql-list-servers",
    `List all configured SQL servers.
\u26A0\uFE0F SKIP THIS for most queries. You DO NOT need to call this before querying - defaults are automatic.
Only use this tool if: (1) you got an explicit error about server not found, OR (2) user specifically asks about available servers.`,
    {},
    // Reads local server configuration only.
    { readOnlyHint: true },
    async () => {
      try {
        const servers = await ctx.connection.listServers();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(servers, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing servers: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-list-databases",
    `List databases on a SQL server.
\u26A0\uFE0F SKIP THIS for most queries. You DO NOT need to call this before querying - defaults are automatic.
Only use this tool if: (1) you got an explicit error about database not found, OR (2) user specifically asks about available databases.`,
    {
      serverId: z.string().optional().describe(
        descWithExamples("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS", SERVER_ID_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ serverId }: { serverId?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const databases = await ctx.connection.listDatabases(resolvedServerId);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(databases, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing databases: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-get-defaults",
    `Get the default server and database configuration.
\u26A0\uFE0F SKIP THIS - you do NOT need to call this before querying. Just call sql-execute-query with only the query parameter.
Only use this if: user specifically asks what server/database is configured, or you need to confirm defaults after an error.`,
    {},
    // Reads local default configuration only.
    { readOnlyHint: true },
    async () => {
      try {
        const defaults = ctx.connection.getDefaultConfiguration();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(defaults, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting defaults: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-test-connection",
    "Test SQL Server connectivity and return connection information",
    {
      serverId: z.string().optional().describe(
        descWithExamples("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS", SERVER_ID_EXAMPLES)
      ),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.connection.testConnection(resolvedServerId, resolvedDatabase);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error testing connection: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
