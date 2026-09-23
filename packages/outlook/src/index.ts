#!/usr/bin/env node

/**
 * @mcp-consultant-tools/outlook
 *
 * MCP server for Outlook mail as the signed-in user (device code).
 * Entry point: MCP server startup + registerOutlookTools() for the meta package.
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader, resolveSecrets } from '@mcp-consultant-tools/core';

import { createServiceContext } from './context-factory.js';
import { registerAllTools } from './tools/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/** Register Outlook tools to an MCP server. */
export function registerOutlookTools(server: any): void {
  registerAllTools(server, createServiceContext());
}

export { MailReadService } from './services/mail-read-service.js';
export { MailWriteService } from './services/mail-write-service.js';
export { MailSendService } from './services/mail-send-service.js';
export { assertSafeLocalFile } from './local-file-guard.js';
export { htmlToText, markdownToHtml, wrapUntrusted } from './mail-content.js';
export type * from './types.js';

/**
 * Standalone server (when run directly).
 * Uses realpathSync to resolve symlinks created by npx.
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/outlook',
    version: pkg.version,
    capabilities: {
      tools: {},
    },
  });

  registerOutlookTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start @mcp-consultant-tools/outlook MCP server:', error);
    process.exit(1);
  });

  console.error('@mcp-consultant-tools/outlook server running on stdio');
}
