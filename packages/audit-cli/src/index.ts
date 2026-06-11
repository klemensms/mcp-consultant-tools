#!/usr/bin/env node
import { Command } from 'commander';
import { registerVerify } from './verify.js';
import { registerQuarantine } from './quarantine.js';
import { registerSearch } from './search.js';

const program = new Command();
program
  .name('mcp-audit-cli')
  // Keep in sync with packages/audit-cli/package.json
  .version('0.1.0')
  .description('Audit log tooling for the MCP Consultant Tools audit subsystem');

registerVerify(program);
registerQuarantine(program);
registerSearch(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
