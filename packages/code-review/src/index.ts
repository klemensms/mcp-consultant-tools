#!/usr/bin/env node

/**
 * @mcp-consultant-tools/code-review
 *
 * MCP server for provider-agnostic repository code review — .NET framework EOL scanning, NuGet
 * package auditing, cyclomatic-complexity estimation, and GitHub Packages inventory across Azure
 * DevOps and GitHub Enterprise. Entry point: MCP server startup + backward-compatible
 * registerCodeReviewTools().
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
 * Register code-review tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerCodeReviewTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);
}

export { CodeReviewClient, parseNextLink, normalizeGheApiBase } from './code-review-client.js';
export type { CodeReviewConfig, RepositoryInfo } from './code-review-client.js';
export { buildCodeReviewConfig, parseAllowedRepositories, createServiceContext } from './context-factory.js';
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
    name: 'mcp-code-review',
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerCodeReviewTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start code-review MCP server:', error);
    process.exit(1);
  });

  console.error('code-review MCP server running');
}
