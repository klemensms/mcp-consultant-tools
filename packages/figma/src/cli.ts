#!/usr/bin/env node

/**
 * @mcp-consultant-tools/figma CLI
 *
 * Command-line interface for Figma operations.
 * Reuses the same ServiceContext and services as the MCP server.
 */

import { createRequire } from 'node:module';
import { createCliProgram, loadEnvAndResolve } from '@mcp-consultant-tools/core';
import { createServiceContext } from './context-factory.js';
import { registerAllCommands } from './cli/commands/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = createCliProgram({
  name: 'mcp-figma-cli',
  description: 'Figma CLI - design data extraction, semantic analysis, ADO story extraction',
  version: pkg.version,
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
