#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { SharePointService } from "./SharePointService.js";

export function registerSharePointTools(server: any, service?: SharePointService) {
  console.error("SharePoint tools registered (tool extraction pending)");
}

export { SharePointService } from "./SharePointService.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({ name: "@mcp-consultant-tools/sharepoint", version: "1.0.0", capabilities: { tools: {} } });
  registerSharePointTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => { console.error("Failed to start SharePoint server:", error); process.exit(1); });
  console.error("@mcp-consultant-tools/sharepoint server running");
}
