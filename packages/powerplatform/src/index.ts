#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { PowerPlatformService } from "./PowerPlatformService.js";

export function registerPowerPlatformTools(server: any, service?: PowerPlatformService) {
  console.error("PowerPlatform tools registered (tool extraction pending)");
}

export { PowerPlatformService } from "./PowerPlatformService.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({ name: "@mcp-consultant-tools/powerplatform", version: "1.0.0", capabilities: { tools: {} } });
  registerPowerPlatformTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => { console.error("Failed to start PowerPlatform server:", error); process.exit(1); });
  console.error("@mcp-consultant-tools/powerplatform server running");
}
