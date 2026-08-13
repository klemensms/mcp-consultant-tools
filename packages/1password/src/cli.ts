#!/usr/bin/env node

/**
 * @mcp-consultant-tools/1password CLI
 *
 * Command-line interface for 1Password vault, item, and secret operations.
 * Reuses the same ServiceContext and services as the MCP server.
 */

import { createRequire } from 'node:module';
import type { Command } from 'commander';
import { createCliProgram, loadEnvAndResolve } from '@mcp-consultant-tools/core';
import { createServiceContext } from './context-factory.js';
import { registerAllCommands } from './cli/commands/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = createCliProgram({
  name: 'mcp-op-cli',
  description: '1Password CLI - vaults, items, secrets',
  version: pkg.version,
});

// Load env before parsing (--env-file handled by commander hook)
program.hook('preAction', async (thisCommand: Command) => {
  const opts = thisCommand.opts();
  await loadEnvAndResolve(opts.envFile);
});

const ctx = createServiceContext();
registerAllCommands(program, ctx);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error('CLI error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
