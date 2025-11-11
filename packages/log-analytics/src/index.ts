#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { LogAnalyticsService } from "./LogAnalyticsService.js";

export function registerLogAnalyticsTools(server: any, service?: LogAnalyticsService) {
  console.error("Log Analytics tools registered (tool extraction pending)");
}

export { LogAnalyticsService } from "./LogAnalyticsService.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({ name: "@mcp-consultant-tools/log-analytics", version: "1.0.0", capabilities: { tools: {} } });
  registerLogAnalyticsTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => { console.error("Failed to start Log Analytics server:", error); process.exit(1); });
  console.error("@mcp-consultant-tools/log-analytics server running");
}
