#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { AzureSqlService } from "./AzureSqlService.js";
import type { AzureSqlConfig, DefaultConfiguration } from "./AzureSqlService.js";
import { z } from 'zod';
import { formatSqlResultsAsMarkdown, formatTableList, formatViewList, formatProcedureList, formatTableSchemaAsMarkdown, formatDatabaseOverview } from './utils/sql-formatters.js';

export function registerAzureSqlTools(server: any, azuresqlService?: AzureSqlService) {
  let service: AzureSqlService | null = azuresqlService || null;

  function getAzureSqlService(): AzureSqlService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.AZURE_SQL_SERVERS) {
        try {
          resources = JSON.parse(process.env.AZURE_SQL_SERVERS);
        } catch (error) {
          throw new Error("Failed to parse AZURE_SQL_SERVERS JSON");
        }
      } else if (process.env.AZURE_SQL_SERVER && process.env.AZURE_SQL_DATABASE) {
        resources = [{
          id: 'default',
          name: 'Default SQL Server',
          server: process.env.AZURE_SQL_SERVER,
          port: parseInt(process.env.AZURE_SQL_PORT || "1433"),
          active: true,
          databases: [{
            name: process.env.AZURE_SQL_DATABASE,
            active: true,
          }],
          username: process.env.AZURE_SQL_USERNAME || '',
          password: process.env.AZURE_SQL_PASSWORD || '',
        }];
      } else {
        missingConfig.push("AZURE_SQL_SERVERS or AZURE_SQL_SERVER/AZURE_SQL_DATABASE");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure SQL configuration: ${missingConfig.join(", ")}`);
      }

      const config: AzureSqlConfig = {
        resources,
        queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
        maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
      };

      service = new AzureSqlService(config);
      console.error("Azure SQL service initialized");
    }
    return service;
  }

  // ========================================
  // PROMPTS
  // ========================================

  server.prompt(
    "sql-database-overview",
    "Get a comprehensive overview of the Azure SQL Database schema",
    {
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      const sqlService = getAzureSqlService();
      const resolvedServerId = sqlService.resolveServerId(serverId);
      const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);

      const [tables, views, procedures, triggers, functions] = await Promise.all([
        sqlService.listTables(resolvedServerId, resolvedDatabase),
        sqlService.listViews(resolvedServerId, resolvedDatabase),
        sqlService.listStoredProcedures(resolvedServerId, resolvedDatabase),
        sqlService.listTriggers(resolvedServerId, resolvedDatabase),
        sqlService.listFunctions(resolvedServerId, resolvedDatabase),
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
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
      schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
      tableName: z.string().describe("Table name"),
    },
    async ({ serverId, database, schemaName, tableName }: { serverId?: string; database?: string; schemaName: string; tableName: string }) => {
      const sqlService = getAzureSqlService();
      const resolvedServerId = sqlService.resolveServerId(serverId);
      const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
      const schema = await sqlService.getTableSchema(resolvedServerId, resolvedDatabase, schemaName, tableName);
  
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
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
      query: z.string().describe("SELECT query to execute"),
    },
    async ({ serverId, database, query }: { serverId?: string; database?: string; query: string }) => {
      const sqlService = getAzureSqlService();
      const resolvedServerId = sqlService.resolveServerId(serverId);
      const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
      const result = await sqlService.executeSelectQuery(resolvedServerId, resolvedDatabase, query);
  
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

  // ========================================
  // TOOLS
  // ========================================

  server.tool(
    "sql-list-servers",
    `List all configured SQL servers.
⚠️ SKIP THIS for most queries. You DO NOT need to call this before querying - defaults are automatic.
Only use this tool if: (1) you got an explicit error about server not found, OR (2) user specifically asks about available servers.`,
    {},
    async () => {
      try {
        const sqlService = getAzureSqlService();
        const servers = await sqlService.listServers();
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
⚠️ SKIP THIS for most queries. You DO NOT need to call this before querying - defaults are automatic.
Only use this tool if: (1) you got an explicit error about database not found, OR (2) user specifically asks about available databases.`,
    {
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
    },
    async ({ serverId }: { serverId?: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const databases = await sqlService.listDatabases(resolvedServerId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(databases, null, 2),
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
⚠️ SKIP THIS - you do NOT need to call this before querying. Just call sql-execute-query with only the query parameter.
Only use this if: user specifically asks what server/database is configured, or you need to confirm defaults after an error.`,
    {},
    async () => {
      try {
        const sqlService = getAzureSqlService();
        const defaults = sqlService.getDefaultConfiguration();
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
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const result = await sqlService.testConnection(resolvedServerId, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
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

  server.tool(
    "sql-list-tables",
    "List all user tables in the database with row counts and sizes",
    {
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const tables = await sqlService.listTables(resolvedServerId, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tables, null, 2),
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
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const views = await sqlService.listViews(resolvedServerId, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(views, null, 2),
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
    "sql-list-stored-procedures",
    "List all stored procedures in the Azure SQL Database",
    {
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const procedures = await sqlService.listStoredProcedures(resolvedServerId, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(procedures, null, 2),
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
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const triggers = await sqlService.listTriggers(resolvedServerId, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(triggers, null, 2),
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
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
    },
    async ({ serverId, database }: { serverId?: string; database?: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const functions = await sqlService.listFunctions(resolvedServerId, resolvedDatabase);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(functions, null, 2),
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
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
      schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
      tableName: z.string().describe("Table name (e.g., 'Users')"),
    },
    async ({ serverId, database, schemaName, tableName }: { serverId?: string; database?: string; schemaName: string; tableName: string }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const schema = await sqlService.getTableSchema(resolvedServerId, resolvedDatabase, schemaName, tableName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(schema, null, 2),
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
    "sql-get-object-definition",
    "Get the SQL definition for a view, stored procedure, function, or trigger",
    {
      serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
      database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
      schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
      objectName: z.string().describe("Object name"),
      objectType: z.enum(['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER']).describe("Object type"),
    },
    async ({ serverId, database, schemaName, objectName, objectType }: { serverId?: string; database?: string; schemaName: string; objectName: string; objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER' }) => {
      try {
        const sqlService = getAzureSqlService();
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);
        const definition = await sqlService.getObjectDefinition(resolvedServerId, resolvedDatabase, schemaName, objectName, objectType);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(definition, null, 2),
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
⚠️ IMPORTANT: DO NOT GUESS serverId or database values. If you don't know them, OMIT THEM ENTIRELY.
The server has pre-configured defaults - just provide the query parameter and defaults will be applied automatically.
Example: sql-execute-query(query: "SELECT * FROM dbo.Users") - serverId and database omitted, defaults used.`,
    {
      serverId: z.string().optional().describe("⚠️ OMIT unless switching servers. DO NOT GUESS - omitting uses the pre-configured default server."),
      database: z.string().optional().describe("⚠️ OMIT unless switching databases. DO NOT GUESS - omitting uses the pre-configured default database."),
      query: z.string().describe("SELECT query to execute (e.g., 'SELECT TOP 10 * FROM dbo.Users WHERE IsActive = 1')"),
    },
    async ({ serverId, database, query }: { serverId?: string; database?: string; query: string }) => {
      try {
        const sqlService = getAzureSqlService();

        // Resolve defaults for optional parameters
        const resolvedServerId = sqlService.resolveServerId(serverId);
        const resolvedDatabase = sqlService.resolveDatabase(resolvedServerId, database);

        const result = await sqlService.executeSelectQuery(resolvedServerId, resolvedDatabase, query);

        let text = JSON.stringify(result, null, 2);

        if (result.truncated) {
          text += `\n\n⚠️ WARNING: Results truncated to ${result.rowCount} rows. Add WHERE clause to filter results.`;
        }

        // Add context about resolved defaults if parameters were omitted
        if (!serverId || !database) {
          const defaultsUsed: string[] = [];
          if (!serverId) defaultsUsed.push(`server='${resolvedServerId}'`);
          if (!database) defaultsUsed.push(`database='${resolvedDatabase}'`);
          text += `\n\nℹ️ Used defaults: ${defaultsUsed.join(', ')}`;
        }

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

  console.error("Azure SQL tools registered: 12 tools, 3 prompts");
}

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-azure-sql",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerAzureSqlTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Azure SQL MCP server:", error);
    process.exit(1);
  });
  console.error("Azure SQL MCP server running");
}
