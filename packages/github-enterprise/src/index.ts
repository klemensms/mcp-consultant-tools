#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { GitHubEnterpriseService } from "./GitHubEnterpriseService.js";

export function registerGitHubEnterpriseTools(server: any, service?: GitHubEnterpriseService) {
  console.error("GitHub Enterprise tools registered (tool extraction pending)");
}

export { GitHubEnterpriseService } from "./GitHubEnterpriseService.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({ name: "@mcp-consultant-tools/github-enterprise", version: "1.0.0", capabilities: { tools: {} } });
  registerGitHubEnterpriseTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => { console.error("Failed to start GitHub Enterprise server:", error); process.exit(1); });
  console.error("@mcp-consultant-tools/github-enterprise server running");
}
