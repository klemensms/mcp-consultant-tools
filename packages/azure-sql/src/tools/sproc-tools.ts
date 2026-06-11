import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SPROC_DEFINITION_EXAMPLES, SPROC_PARAMS_EXAMPLES, SCHEMA_NAME_EXAMPLES, SPROC_FILE_PATH_EXAMPLES } from '../tool-examples.js';

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

export function registerSprocTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "sql-manage-sproc",
    "Create or update a stored procedure using CREATE OR ALTER PROCEDURE. Requires SQL_ENABLE_SPROC_MANAGE=true.",
    {
      schemaName: z.string().describe(
        descWithExamples("Schema name for the stored procedure", SCHEMA_NAME_EXAMPLES)
      ),
      sprocName: z.string().describe("Name of the stored procedure to create or update"),
      definition: z.string().describe(
        descWithExamples("The procedure definition (parameters + body, without CREATE PROCEDURE prefix)", SPROC_DEFINITION_EXAMPLES)
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ schemaName, sprocName, definition, serverId, database }: { schemaName: string; sprocName: string; definition: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkSprocManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.manageSproc(resolvedServerId, resolvedDatabase, schemaName, sprocName, definition);
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
              text: `Error managing stored procedure: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-deploy-sproc-file",
    "Deploy a stored procedure from a local .sql file. Reads the file and executes its contents as-is. " +
    "The file must contain a complete CREATE OR ALTER PROCEDURE statement. " +
    "Use this instead of sql-manage-sproc when you have the procedure in a local file to preserve exact formatting, comments, and avoid rewriting. " +
    "Requires SQL_ENABLE_SPROC_MANAGE=true.",
    {
      filePath: z.string().describe(
        descWithExamples(
          "Path to a local .sql file containing a CREATE OR ALTER PROCEDURE statement. Supports absolute and relative paths.",
          SPROC_FILE_PATH_EXAMPLES
        )
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ filePath, serverId, database }: { filePath: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkSprocManageEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.deploySprocFromFile(resolvedServerId, resolvedDatabase, filePath);
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
              text: `Error deploying stored procedure from file: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-drop-sproc",
    "Drop a stored procedure using DROP PROCEDURE IF EXISTS. Requires SQL_ENABLE_SPROC_DROP=true.",
    {
      schemaName: z.string().describe(
        descWithExamples("Schema name for the stored procedure", SCHEMA_NAME_EXAMPLES)
      ),
      sprocName: z.string().describe("Name of the stored procedure to drop"),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ schemaName, sprocName, serverId, database }: { schemaName: string; sprocName: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkSprocDropEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const result = await ctx.write.dropSproc(resolvedServerId, resolvedDatabase, schemaName, sprocName);
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
              text: `Error dropping stored procedure: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-execute-sproc",
    "Execute a stored procedure with optional parameters. Returns result set(s). Requires SQL_ENABLE_SPROC_EXECUTE=true.",
    {
      schemaName: z.string().describe(
        descWithExamples("Schema name for the stored procedure", SCHEMA_NAME_EXAMPLES)
      ),
      sprocName: z.string().describe("Name of the stored procedure to execute"),
      parameters: z.string().optional().describe(
        descWithExamples("JSON string of parameter name-value pairs to pass to the stored procedure", SPROC_PARAMS_EXAMPLES)
      ),
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ schemaName, sprocName, parameters, serverId, database }: { schemaName: string; sprocName: string; parameters?: string; serverId?: string; database?: string }) => {
      try {
        ctx.checkSprocExecuteEnabled();
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);

        let parsedParams: Record<string, any> | undefined;
        if (parameters) {
          try {
            parsedParams = JSON.parse(parameters);
          } catch {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Invalid JSON in parameters. Expected a JSON object like {"key": "value"}.`,
                },
              ],
              isError: true,
            };
          }
        }

        const result = await ctx.write.executeSproc(resolvedServerId, resolvedDatabase, schemaName, sprocName, parsedParams);
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
              text: `Error executing stored procedure: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
