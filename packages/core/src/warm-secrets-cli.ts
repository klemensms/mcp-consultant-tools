#!/usr/bin/env node
/**
 * mcp-warm-secrets — resolve every op:// reference in an .mcp.json up front, in
 * one 1Password authorization per account, so the MCP servers start against a
 * warm cache and don't each trigger their own prompt.
 *
 * Usage:
 *   mcp-warm-secrets [path-to-.mcp.json]   (default: ./.mcp.json)
 *
 * Intended to run just before launching Claude Code, e.g. as a shell wrapper:
 *   claude() { mcp-warm-secrets >/dev/null 2>&1; command claude "$@"; }
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isOpCliAvailable, isOpSignedIn } from './helpers/secret-resolver.js';
import { warmSecretsFromConfig } from './helpers/warm-secrets.js';

function usage(): void {
  process.stdout.write(
    'Usage: mcp-warm-secrets [path-to-.mcp.json]\n\n' +
    'Pre-resolves all op:// references in the config into the shared encrypted\n' +
    'secret cache (~/.mcp-consultant-tools/.cache), so each MCP server starts\n' +
    'from cache instead of prompting 1Password individually.\n\n' +
    '  path   Path to .mcp.json (default: ./.mcp.json in the current directory)\n',
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === '--help' || arg === '-h') {
    usage();
    return;
  }

  const configPath = arg ?? join(process.cwd(), '.mcp.json');

  if (!existsSync(configPath)) {
    process.stderr.write(
      `mcp-warm-secrets: no MCP config at ${configPath}\n` +
      'Pass the path explicitly: mcp-warm-secrets /path/to/.mcp.json\n',
    );
    process.exit(1);
  }

  if (!(await isOpCliAvailable())) {
    process.stderr.write(
      'mcp-warm-secrets: the 1Password CLI (op) is not installed or not on PATH.\n' +
      'Install it from https://developer.1password.com/docs/cli/get-started/\n',
    );
    process.exit(1);
  }

  // Pre-flight: refuse to resolve unless op can authenticate. A failed/cancelled
  // resolution negative-caches the refs for 10 minutes, which would block the
  // very MCP servers we are warming. Bailing here leaves the cache untouched.
  if (!(await isOpSignedIn())) {
    process.stderr.write(
      'mcp-warm-secrets: 1Password is not signed in / unlocked, so nothing was resolved (cache left untouched).\n' +
      'Sign in first, then re-run:\n' +
      '  eval $(op signin)   # or unlock the 1Password app if CLI integration is enabled\n' +
      '  mcp-warm-secrets\n',
    );
    process.exit(1);
  }

  const { groups, refs } = await warmSecretsFromConfig(configPath);

  if (refs === 0) {
    process.stdout.write(`mcp-warm-secrets: no op:// references found in ${configPath} — nothing to warm.\n`);
    return;
  }

  process.stdout.write(
    `mcp-warm-secrets: warmed ${refs} secret(s) across ${groups} account group(s) from ${configPath}.\n` +
    'MCP servers will now resolve these from cache without prompting.\n',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mcp-warm-secrets: ${message}\n`);
  process.exit(1);
});
