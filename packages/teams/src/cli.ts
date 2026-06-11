#!/usr/bin/env node

/**
 * @mcp-consultant-tools/teams CLI
 *
 * Command-line interface for Microsoft Teams operations.
 * Reuses the same ServiceContext and services as the MCP server.
 */

import { createCliProgram, loadEnvAndResolve } from '@mcp-consultant-tools/core';
import { createServiceContext } from './context-factory.js';
import { registerAllCommands } from './cli/commands/index.js';

const program = createCliProgram({
  name: 'mcp-teams-cli',
  description: 'Microsoft Teams CLI - send messages, adaptive cards, list teams and channels',
  version: '27.0.0',
});

// Load env before parsing (--env-file handled by commander hook)
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
