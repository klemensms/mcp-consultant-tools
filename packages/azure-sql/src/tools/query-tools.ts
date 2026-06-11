import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatSqlResultsAsMarkdown,
} from '../utils/sql-formatters.js';
import { descWithExamples, SQL_QUERY_EXAMPLES, TABLE_NAME_EXAMPLES, SERVER_ID_EXAMPLES, SCHEMA_NAME_EXAMPLES, OBJECT_TYPE_EXAMPLES } from '../tool-examples.js';

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

export function registerQueryTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "sql-list-tables",
    "List all user tables in the database with row counts and sizes",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const tables = await ctx.query.listTables(resolvedServerId, resolvedDatabase);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tables, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing tables: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-list-views",
    "List all views in the database",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const views = await ctx.query.listViews(resolvedServerId, resolvedDatabase);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(views, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing views: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-list-sprocs",
    "List all stored procedures in the Azure SQL Database",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const procedures = await ctx.query.listStoredProcedures(resolvedServerId, resolvedDatabase);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(procedures, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing stored procedures: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-list-triggers",
    "List all database triggers in the Azure SQL Database",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const triggers = await ctx.query.listTriggers(resolvedServerId, resolvedDatabase);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(triggers, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing triggers: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-list-functions",
    "List all user-defined functions in the Azure SQL Database",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const functions = await ctx.query.listFunctions(resolvedServerId, resolvedDatabase);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(functions, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing functions: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-get-table-schema",
    "Get detailed schema information for a table including columns, indexes, and foreign keys",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
      schemaName: z.string().describe(
        descWithExamples("Schema name", SCHEMA_NAME_EXAMPLES)
      ),
      tableName: z.string().describe(
        descWithExamples("Table name", TABLE_NAME_EXAMPLES)
      ),
    },
    async ({ serverId, database, schemaName, tableName }: { serverId?: string; database?: string; schemaName: string; tableName: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const schema = await ctx.query.getTableSchema(resolvedServerId, resolvedDatabase, schemaName, tableName);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(schema, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting table schema: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-get-obj-def",
    "Get the SQL definition for a view, stored procedure, function, or trigger",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
      schemaName: z.string().describe(
        descWithExamples("Schema name", SCHEMA_NAME_EXAMPLES)
      ),
      objectName: z.string().describe("Name of the database object"),
      objectType: z.enum(['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER']).describe(
        descWithExamples("Type of database object", OBJECT_TYPE_EXAMPLES)
      ),
    },
    async ({ serverId, database, schemaName, objectName, objectType }: { serverId?: string; database?: string; schemaName: string; objectName: string; objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER' }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
        const definition = await ctx.query.getObjectDefinition(resolvedServerId, resolvedDatabase, schemaName, objectName, objectType);
        const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(definition, null, 2) + defaultsMsg,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting object definition: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sql-execute-query",
    `Execute a SELECT query against Azure SQL Database.
\u26A0\uFE0F IMPORTANT: DO NOT GUESS serverId or database values. If you don't know them, OMIT THEM ENTIRELY.
The server has pre-configured defaults - just provide the query parameter and defaults will be applied automatically.
Example: sql-execute-query(query: "SELECT * FROM dbo.Users") - serverId and database omitted, defaults used.`,
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT unless switching servers. DO NOT GUESS - omitting uses the pre-configured default server."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT unless switching databases. DO NOT GUESS - omitting uses the pre-configured default database."),
      query: z.string().describe(
        descWithExamples("SELECT query to execute", SQL_QUERY_EXAMPLES)
      ),
    },
    async ({ serverId, database, query }: { serverId?: string; database?: string; query: string }) => {
      try {
        const resolvedServerId = ctx.connection.resolveServerId(serverId);
        const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);

        const result = await ctx.query.executeSelectQuery(resolvedServerId, resolvedDatabase, query);

        let text = JSON.stringify(result, null, 2);

        if (result.truncated) {
          text += `\n\n\u26A0\uFE0F WARNING: Results truncated to ${result.rowCount} rows. Add WHERE clause to filter results.`;
        }

        text += buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);

        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing query: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
