#!/usr/bin/env node

/**
 * @mcp-consultant-tools/azure-defender
 *
 * MCP server for Microsoft Defender for Cloud.
 * Entry point: MCP server startup + backward-compatible registerAzureDefenderTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Register Azure Defender tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerAzureDefenderTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

export { DefenderClient, AzureAuthProvider } from './defender-client.js';
export type { DefenderClientConfig } from './defender-client.js';
export { SecureScoreService } from './services/secure-score-service.js';
export { AssessmentService } from './services/assessment-service.js';
export { ComplianceService } from './services/compliance-service.js';
export { AttackPathService } from './services/attack-path-service.js';
export { createServiceContext } from './context-factory.js';
export type { ServiceContext } from './types.js';

/**
 * Standalone MCP server (when run directly).
 * Uses realpathSync to resolve symlinks created by npx.
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: 'mcp-azure-defender',
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerAzureDefenderTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start Azure Defender MCP server:', error);
    process.exit(1);
  });

  console.error('Azure Defender MCP server running');
}
