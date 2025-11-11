#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { AzureSqlService } from "./AzureSqlService.js";

export function registerAzureSqlTools(server: any, service?: AzureSqlService) {
  console.error("Azure SQL tools registered (tool extraction pending)");
}

export { AzureSqlService } from "./AzureSqlService.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({ name: "@mcp-consultant-tools/azure-sql", version: "1.0.0", capabilities: { tools: {} } });
  registerAzureSqlTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => { console.error("Failed to start Azure SQL server:", error); process.exit(1); });
  console.error("@mcp-consultant-tools/azure-sql server running");
}
