#!/usr/bin/env node

/**
 * @mcp-consultant-tools/azure-b2c CLI
 *
 * Command-line interface for Azure AD B2C operations.
 * Reuses the same ServiceContext and services as the MCP server.
 */

import type { Command } from 'commander';
import { createCliProgram, loadEnvAndResolve } from '@mcp-consultant-tools/core';
import { createServiceContext } from './context-factory.js';
import { registerAllCommands } from './cli/commands/index.js';

const program = createCliProgram({
  name: 'mcp-azure-b2c-cli',
  description: 'Azure AD B2C CLI - users, groups, passwords, tenant management',
  version: '27.0.0',
});

// Load env before parsing (--env-file handled by commander hook)
program.hook('preAction', async (thisCommand: Command) => {
  const opts = thisCommand.opts();
  await loadEnvAndResolve(opts.envFile);
});

const ctx = createServiceContext();
registerAllCommands(program, ctx);

program.parseAsync(process.argv).catch((error: Error) => {
  console.error('CLI error:', error.message);
  process.exit(1);
});
