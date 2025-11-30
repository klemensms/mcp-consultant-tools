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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
    },
    async ({ serverId, database }: any) => {
      const sqlService = getAzureSqlService();
  
      const [tables, views, procedures, triggers, functions] = await Promise.all([
        sqlService.listTables(serverId, database),
        sqlService.listViews(serverId, database),
        sqlService.listStoredProcedures(serverId, database),
        sqlService.listTriggers(serverId, database),
        sqlService.listFunctions(serverId, database),
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
      schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
      tableName: z.string().describe("Table name"),
    },
    async ({ serverId, database, schemaName, tableName }: any) => {
      const sqlService = getAzureSqlService();
      const schema = await sqlService.getTableSchema(serverId, database, schemaName, tableName);
  
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
      query: z.string().describe("SELECT query to execute"),
    },
    async ({ serverId, database, query }: any) => {
      const sqlService = getAzureSqlService();
      const result = await sqlService.executeSelectQuery(serverId, database, query);
  
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
    "List all configured SQL servers with active/inactive status",
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
    "List databases on a SQL server (configured or discovered)",
    {
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
    },
    async ({ serverId }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const databases = await sqlService.listDatabases(serverId);
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
    "Get the default server and database configuration. Use this once at the start of a session to understand the SQL environment, or skip entirely and use the defaults directly in sql-execute-query by omitting serverId and database parameters.",
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
    },
    async ({ serverId, database }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const result = await sqlService.testConnection(serverId, database);
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
    },
    async ({ serverId, database }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const tables = await sqlService.listTables(serverId, database);
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
    },
    async ({ serverId, database }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const views = await sqlService.listViews(serverId, database);
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
    },
    async ({ serverId, database }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const procedures = await sqlService.listStoredProcedures(serverId, database);
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
    },
    async ({ serverId, database }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const triggers = await sqlService.listTriggers(serverId, database);
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
    },
    async ({ serverId, database }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const functions = await sqlService.listFunctions(serverId, database);
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
      schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
      tableName: z.string().describe("Table name (e.g., 'Users')"),
    },
    async ({ serverId, database, schemaName, tableName }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const schema = await sqlService.getTableSchema(serverId, database, schemaName, tableName);
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
      serverId: z.string().describe("Server ID (use sql-list-servers to find IDs)"),
      database: z.string().describe("Database name (use sql-list-databases to find databases)"),
      schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
      objectName: z.string().describe("Object name"),
      objectType: z.enum(['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER']).describe("Object type"),
    },
    async ({ serverId, database, schemaName, objectName, objectType }: any) => {
      try {
        const sqlService = getAzureSqlService();
        const definition = await sqlService.getObjectDefinition(serverId, database, schemaName, objectName, objectType);
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
    "Execute a SELECT query against the Azure SQL Database (read-only, with result limits). For most use cases, you can omit serverId and database - they will default to the primary configured server and database.",
    {
      serverId: z.string().optional().describe("Server ID. Optional - defaults to the primary configured server if omitted. Use sql-list-servers to see available servers."),
      database: z.string().optional().describe("Database name. Optional - defaults to the primary database on the selected server if omitted. Use sql-list-databases to see available databases."),
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
