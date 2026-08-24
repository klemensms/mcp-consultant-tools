#!/usr/bin/env node

/**
 * @mcp-consultant-tools/powerplatform-data CLI
 *
 * Command-line interface for PowerPlatform data CRUD operations.
 * Reuses the same ServiceContext and services as the MCP server.
 */

import { createRequire } from 'node:module';
import { createCliProgram, bootstrapCliEnv } from '@mcp-consultant-tools/core';
import { createServiceContext } from './context-factory.js';
import type { ServiceContext } from './types.js';
import { registerAllCommands } from './cli/commands/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = createCliProgram({
  name: 'mcp-pp-data-cli',
  description: 'PowerPlatform Data CLI - records, metadata, flows',
  version: pkg.version,
});

// Bootstrap env BEFORE service-context construction. Top-level await is
// available because tsconfig targets ES2022 + Node16 module. See
// docs/programmes/pii-and-audit/pending/cli-bridge-fix-and-nag.md for
// why the previous Commander-preAction approach was insufficient.
const { skipContextInit } = await bootstrapCliEnv({ programName: 'mcp-pp-data-cli' });

// In help/version mode, skip service-context construction so the CLI can
// display its surface without paying the cost of PII/audit env validation.
// The proxy throws if any subcommand action accidentally fires in this mode
// (it never should - Commander's --help / --version short-circuits parsing).
const ctx: ServiceContext = skipContextInit
  ? new Proxy({} as ServiceContext, {
      get() {
        throw new Error(
          'mcp-pp-data-cli: service context not initialised (help/version mode)'
        );
      },
    })
  : createServiceContext();

registerAllCommands(program, ctx);

await program.parseAsync(process.argv);
