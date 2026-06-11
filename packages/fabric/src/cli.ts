#!/usr/bin/env node

/**
 * @mcp-consultant-tools/fabric CLI
 *
 * Command-line interface for Microsoft Fabric operations.
 * Reuses the same ServiceContext and services as the MCP server.
 */

import { createCliProgram, loadEnvAndResolve } from '@mcp-consultant-tools/core';
import { createServiceContext } from './context-factory.js';
import { registerAllCommands } from './cli/commands/index.js';

const program = createCliProgram({
  name: 'mcp-fabric-cli',
  description: 'Microsoft Fabric CLI - workspaces, capacities, items, shortcuts, domains, admin',
  version: '31.0.0-beta.4',
});

// Load env before parsing. The built-in createCliProgram preAction hook handles
// --mcp-config / --mcp-server; this hook adds .env / --env-file loading.
program.hook('preAction', async (thisCommand: any) => {
  const opts = thisCommand.opts();
  await loadEnvAndResolve(opts.envFile);
});

const ctx = createServiceContext();
registerAllCommands(program, ctx);

program.parseAsync(process.argv).catch((error: any) => {
  console.error('CLI error:', error.message);
  process.exit(1);
});
