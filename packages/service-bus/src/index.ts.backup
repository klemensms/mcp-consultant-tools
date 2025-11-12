#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { ServiceBusService } from "./ServiceBusService.js";

export function registerServiceBusTools(server: any, service?: ServiceBusService) {
  console.error("Service Bus tools registered (tool extraction pending)");
}

export { ServiceBusService } from "./ServiceBusService.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({ name: "@mcp-consultant-tools/service-bus", version: "1.0.0", capabilities: { tools: {} } });
  registerServiceBusTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => { console.error("Failed to start Service Bus server:", error); process.exit(1); });
  console.error("@mcp-consultant-tools/service-bus server running");
}
