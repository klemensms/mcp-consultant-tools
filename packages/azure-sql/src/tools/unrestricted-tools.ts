import { z } from 'zod';
import type { ServiceContext } from '../types.js';

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
    return `\n\nUsed defaults: ${defaultsUsed.join(', ')}`;
  }
  return '';
}

/**
 * Conditionally register the unrestricted SQL execution tool.
 * Only registers when SQL_ENABLE_UNRESTRICTED=true.
 */
export function registerUnrestrictedTools(server: any, ctx: ServiceContext): void {
  if (process.env.SQL_ENABLE_UNRESTRICTED !== 'true') return;

  server.tool(
    "sql-execute-unrestricted",
    "Execute ANY T-SQL without restrictions: DDL, DML, EXEC, multi-batch with GO. " +
    "This is the 'break glass' tool for incident response and environment resets. " +
    "No statement filtering, no keyword restrictions. Uses same credentials as other tools. " +
    "Requires SQL_ENABLE_UNRESTRICTED=true.",
    {
      sql: z.string().describe(
        "Any valid T-SQL. Supports multi-batch scripts separated by GO on its own line. " +
        "Each batch executes sequentially; execution stops on first failure. " +
        "Timeout is governed by the pool-level AZURE_SQL_QUERY_TIMEOUT setting."
      ),
      serverId: z.string().optional().describe("OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("OMIT to use default database. DO NOT GUESS."),
    },
    async ({ sql, serverId, database }: { sql: string; serverId?: string; database?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.executeUnrestricted(
          resolvedServerId, resolvedDatabase, sql
        );
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);

        const summary = result.completedBatches === result.totalBatches
          ? `All ${result.totalBatches} batch(es) executed successfully.`
          : `${result.completedBatches}/${result.totalBatches} batch(es) completed. Batch ${result.completedBatches} failed.`;

        return {
          content: [
            {
              type: "text",
              text: summary + '\n\n' + JSON.stringify(result, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing unrestricted SQL: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
