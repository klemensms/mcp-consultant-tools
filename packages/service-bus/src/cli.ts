#!/usr/bin/env node

/**
 * @mcp-consultant-tools/service-bus CLI
 *
 * Command-line interface for Azure Service Bus operations.
 * Reuses the same ServiceContext and services as the MCP server.
 */

import { createRequire } from 'node:module';
import { createCliProgram, loadEnvAndResolve } from '@mcp-consultant-tools/core';
import { createServiceContext } from './context-factory.js';
import { registerAllCommands } from './cli/commands/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = createCliProgram({
  name: 'mcp-sb-cli',
  description: 'Service Bus CLI - queue inspection, message peek, dead letter analysis',
  version: pkg.version,
});

// Load env before parsing (--env-file handled by commander hook)
program.hook('preAction', async (thisCommand: { opts: () => { envFile?: string } }) => {
  const opts = thisCommand.opts();
  await loadEnvAndResolve(opts.envFile);
});

const ctx = createServiceContext();
registerAllCommands(program, ctx);

program.parseAsync(process.argv).catch((error: Error) => {
  console.error('CLI error:', error.message);
  process.exit(1);
});
