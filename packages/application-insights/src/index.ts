#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { ApplicationInsightsService } from "./ApplicationInsightsService.js";
import type { ApplicationInsightsConfig } from "./ApplicationInsightsService.js";

export function registerApplicationInsightsTools(server: any, service?: ApplicationInsightsService) {
  // TODO: Extract tool registrations from main index.ts during meta-package phase
  console.error("Application Insights tools registered (tool extraction pending)");
}

export { ApplicationInsightsService } from "./ApplicationInsightsService.js";
export type { ApplicationInsightsConfig } from "./ApplicationInsightsService.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({ name: "@mcp-consultant-tools/application-insights", version: "1.0.0", capabilities: { tools: {} } });
  registerApplicationInsightsTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => { console.error("Failed to start Application Insights server:", error); process.exit(1); });
  console.error("@mcp-consultant-tools/application-insights server running");
}
