import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, VIEW_BODY_EXAMPLES, SCHEMA_NAME_EXAMPLES, VIEW_FILE_PATH_EXAMPLES } from '../tool-examples.js';

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

export function registerViewTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "sql-manage-view",
    "Create or update a SQL view using CREATE OR ALTER VIEW. Requires SQL_ENABLE_VIEW_MANAGE=true.",
    {
      schemaName: z.string().describe(
        descWithExamples("Schema name for the view", SCHEMA_NAME_EXAMPLES)
      ),
      viewName: z.string().describe("Name of the view to create or update"),
      selectBody: z.string().describe(
        descWithExamples("The SELECT statement that defines the view body", VIEW_BODY_EXAMPLES)
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    // CREATE OR ALTER VIEW; defines/updates an object, additive.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ schemaName, viewName, selectBody, serverId, database }: { schemaName: string; viewName: string; selectBody: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkViewManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.manageView(resolvedServerId, resolvedDatabase, schemaName, viewName, selectBody);
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
              text: `Error managing view: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-deploy-view-file",
    "Deploy a SQL view from a local .sql file. Reads the file and executes its contents as-is. " +
    "The file must contain a complete CREATE OR ALTER VIEW statement. " +
    "Use this instead of sql-manage-view when you have the view in a local file to preserve exact formatting and comments. " +
    "Requires SQL_ENABLE_VIEW_MANAGE=true.",
    {
      filePath: z.string().describe(
        descWithExamples(
          "Path to a local .sql file containing a CREATE OR ALTER VIEW statement. Supports absolute and relative paths.",
          VIEW_FILE_PATH_EXAMPLES
        )
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    // Deploys CREATE OR ALTER VIEW from file; additive.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ filePath, serverId, database }: { filePath: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkViewManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.deployViewFromFile(resolvedServerId, resolvedDatabase, filePath);
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
              text: `Error deploying view from file: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-drop-view",
    "Drop a SQL view using DROP VIEW IF EXISTS. Requires SQL_ENABLE_VIEW_DROP=true.",
    {
      schemaName: z.string().describe(
        descWithExamples("Schema name for the view", SCHEMA_NAME_EXAMPLES)
      ),
      viewName: z.string().describe("Name of the view to drop"),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    // DROP VIEW; destructive.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ schemaName, viewName, serverId, database }: { schemaName: string; viewName: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkViewDropEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.dropView(resolvedServerId, resolvedDatabase, schemaName, viewName);
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
              text: `Error dropping view: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
