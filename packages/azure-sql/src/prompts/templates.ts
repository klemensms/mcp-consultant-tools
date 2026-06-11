import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatSqlResultsAsMarkdown,
  formatTableSchemaAsMarkdown,
  formatDatabaseOverview,
} from '../utils/sql-formatters.js';

export function registerSqlPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "sql-database-overview",
    "Get a comprehensive overview of the Azure SQL Database schema",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      const resolvedServerId = ctx.connection.resolveServerId(serverId);
      const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);

      const [tables, views, procedures, triggers, functions] = await Promise.all([
        ctx.query.listTables(resolvedServerId, resolvedDatabase),
        ctx.query.listViews(resolvedServerId, resolvedDatabase),
        ctx.query.listStoredProcedures(resolvedServerId, resolvedDatabase),
        ctx.query.listTriggers(resolvedServerId, resolvedDatabase),
        ctx.query.listFunctions(resolvedServerId, resolvedDatabase),
      ]);

      const formattedOverview = formatDatabaseOverview(tables, views, procedures, triggers, functions);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: formattedOverview,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "sql-table-details",
    "Get detailed report for a specific table with columns, indexes, and relationships",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
      schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
      tableName: z.string().describe("Table name"),
    },
    async ({ serverId, database, schemaName, tableName }: { serverId?: string; database?: string; schemaName: string; tableName: string }) => {
      const resolvedServerId = ctx.connection.resolveServerId(serverId);
      const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
      const schema = await ctx.query.getTableSchema(resolvedServerId, resolvedDatabase, schemaName, tableName);

      let template = formatTableSchemaAsMarkdown(schema);
      template += `\n\n### Sample Query\n\n\`\`\`sql\nSELECT TOP 100 * FROM ${schemaName}.${tableName}\n\`\`\``;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: template,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "sql-query-results",
    "Execute a query and return formatted results with column headers",
    {
      serverId: z.string().optional().describe("\u26A0\uFE0F OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("\u26A0\uFE0F OMIT to use default database. DO NOT GUESS."),
      query: z.string().describe("SELECT query to execute"),
    },
    async ({ serverId, database, query }: { serverId?: string; database?: string; query: string }) => {
      const resolvedServerId = ctx.connection.resolveServerId(serverId);
      const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
      const result = await ctx.query.executeSelectQuery(resolvedServerId, resolvedDatabase, query);

      let template = `## Query Results\n\n`;
      template += `**Query:**\n\`\`\`sql\n${query}\n\`\`\`\n\n`;
      template += `**Results:**\n${formatSqlResultsAsMarkdown(result)}\n\n`;
      template += `**Row Count:** ${result.rowCount}`;

      if (result.truncated) {
        template += ` (truncated)`;
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: template,
            },
          },
        ],
      };
    }
  );
}
