/**
 * Pre-warm 1Password secrets from an .mcp.json before the MCP servers launch.
 *
 * Problem: each MCP server resolves its own op:// references at startup via the
 * 1Password CLI. Claude Code launches all servers concurrently, so on a machine
 * without biometric unlock the desktop app shows one authorization prompt per
 * server (the grant cache never warms because they all fire at once).
 *
 * Fix: resolve every op:// reference across all servers ONCE, up front, in a
 * single `op` invocation per account - one prompt - and write the values into
 * the shared encrypted cache that the servers already read from. The servers
 * then start against a warm cache and never call `op` themselves.
 *
 * This module only drives the existing {@link resolveSecrets} resolver/cache;
 * it does not change resolution or caching behaviour.
 */

import { readFileSync } from 'node:fs';
import { resolveSecrets } from './secret-resolver.js';

/** A set of op:// references that resolve under the same 1Password account. */
export interface OpRefGroup {
  /** The OP_ACCOUNT the refs resolve under, or undefined to use op's default. */
  account: string | undefined;
  /** Distinct op:// references for this account. */
  refs: string[];
}

export interface WarmResult {
  /** Number of distinct account groups warmed. */
  groups: number;
  /** Total number of distinct op:// references warmed across all groups. */
  refs: number;
}

/**
 * Scan a parsed .mcp.json for op:// references across every server's `env`
 * block, grouped by the server's OP_ACCOUNT (so refs are resolved under the
 * correct account and never cross-poison the negative cache). Refs are deduped
 * within each group.
 */
export function collectOpRefGroups(parsed: unknown): OpRefGroup[] {
  const servers = (parsed as { mcpServers?: Record<string, unknown> })?.mcpServers;
  if (!servers || typeof servers !== 'object') return [];

  // Use '' as the key for "no explicit account"; map back to undefined on output.
  const byAccount = new Map<string, Set<string>>();

  for (const cfg of Object.values(servers)) {
    const env = (cfg as { env?: Record<string, unknown> })?.env;
    if (!env || typeof env !== 'object') continue;

    const account = typeof env.OP_ACCOUNT === 'string' ? env.OP_ACCOUNT : '';

    for (const value of Object.values(env)) {
      if (typeof value === 'string' && value.startsWith('op://')) {
        let refs = byAccount.get(account);
        if (!refs) {
          refs = new Set<string>();
          byAccount.set(account, refs);
        }
        refs.add(value);
      }
    }
  }

  return [...byAccount.entries()].map(([account, refs]) => ({
    account: account || undefined,
    refs: [...refs],
  }));
}

/**
 * Resolve and cache each group's refs by driving {@link resolveSecrets} once per
 * group. Refs are injected into process.env under throwaway keys (resolveSecrets
 * scans process.env and caches by the op:// ref string, independent of the key),
 * with OP_ACCOUNT set for the group's duration. Temp keys and OP_ACCOUNT are
 * always restored afterwards.
 */
export async function warmGroups(groups: OpRefGroup[]): Promise<void> {
  for (const group of groups) {
    const tempKeys: string[] = [];
    const hadAccount = Object.prototype.hasOwnProperty.call(process.env, 'OP_ACCOUNT');
    const savedAccount = process.env.OP_ACCOUNT;

    if (group.account !== undefined) process.env.OP_ACCOUNT = group.account;

    group.refs.forEach((ref, i) => {
      const key = `__WARM_OP_${i}`;
      process.env[key] = ref;
      tempKeys.push(key);
    });

    try {
      await resolveSecrets();
    } finally {
      for (const key of tempKeys) delete process.env[key];
      if (group.account !== undefined) {
        if (hadAccount) process.env.OP_ACCOUNT = savedAccount;
        else delete process.env.OP_ACCOUNT;
      }
    }
  }
}

/**
 * Read an .mcp.json, resolve every op:// reference it contains (grouped by
 * account, one `op` invocation per account), and populate the shared encrypted
 * secret cache. Returns counts for reporting.
 *
 * @throws if the config file is missing or contains invalid JSON.
 */
export async function warmSecretsFromConfig(configPath: string): Promise<WarmResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read MCP config at ${configPath}: ${message}`);
  }

  const groups = collectOpRefGroups(parsed);
  await warmGroups(groups);

  return {
    groups: groups.length,
    refs: groups.reduce((sum, g) => sum + g.refs.length, 0),
  };
}
