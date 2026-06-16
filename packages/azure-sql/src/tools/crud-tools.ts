import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, INSERT_QUERY_EXAMPLES, UPDATE_QUERY_EXAMPLES, DELETE_QUERY_EXAMPLES } from '../tool-examples.js';

/**
 * Helper to build "defaults used" message for tool responses.
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

export function registerCrudTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "sql-insert-records",
    "Execute an INSERT statement against Azure SQL Database. Requires SQL_ENABLE_INSERT=true.",
    {
      query: z.string().describe(
        descWithExamples("INSERT SQL statement to execute", INSERT_QUERY_EXAMPLES)
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    // INSERT adds rows; additive, not destructive.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ query, serverId, database }: { query: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkInsertEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.executeInsert(resolvedServerId, resolvedDatabase, query);
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
              text: `Error executing INSERT: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-update-records",
    "Execute an UPDATE statement against Azure SQL Database. Requires SQL_ENABLE_UPDATE=true.",
    {
      query: z.string().describe(
        descWithExamples("UPDATE SQL statement to execute", UPDATE_QUERY_EXAMPLES)
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ query, serverId, database }: { query: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkUpdateEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.executeUpdate(resolvedServerId, resolvedDatabase, query);
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
              text: `Error executing UPDATE: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-delete-records",
    "Execute a DELETE statement against Azure SQL Database. WHERE clause is required for safety. Requires SQL_ENABLE_DELETE=true.",
    {
      query: z.string().describe(
        descWithExamples("DELETE SQL statement to execute (must include WHERE clause)", DELETE_QUERY_EXAMPLES)
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    // DELETE removes rows; destructive.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ query, serverId, database }: { query: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkDeleteEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.executeDelete(resolvedServerId, resolvedDatabase, query);
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
              text: `Error executing DELETE: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
