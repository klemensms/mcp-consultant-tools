/**
 * 1Password CLI Secret Resolver
 *
 * Resolves op:// references in process.env via the 1Password CLI.
 * Adapted from an internal env-resolver library.
 *
 * Features:
 * - AES-256-GCM encrypted local cache (default 60min TTL)
 * - File locking for concurrent process coordination
 * - Negative caching for failed refs (10min TTL)
 * - Batch resolution via `op run`, sequential `op read` fallback
 * - Zero overhead when no op:// references exist
 * - Non-fatal failures (logged to stderr, process continues)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createCipheriv, createDecipheriv, randomBytes,
} from 'node:crypto';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  openSync, closeSync, unlinkSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

function getCacheDir(): string {
  return process.env.MCT_SECRET_CACHE_DIR || join(homedir(), '.mcp-consultant-tools', '.cache');
}

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const DEFAULT_TTL_MINUTES = 60;
const NEGATIVE_TTL_MS = 10 * 60_000;
const LOCK_STALE_MS = 60_000;
const LOCK_POLL_MS = 200;
const LOCK_TIMEOUT_MS = 45_000;

function getTtlMs(): number {
  const custom = process.env.MCT_CACHE_TTL_MINUTES;
  const minutes = custom ? parseInt(custom, 10) : DEFAULT_TTL_MINUTES;
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_TTL_MINUTES) * 60_000;
}

// ---------------------------------------------------------------------------
// File lock — serializes op calls across concurrent processes
// ---------------------------------------------------------------------------

function ensureCacheDir(): void {
  mkdirSync(getCacheDir(), { recursive: true, mode: 0o700 });
}

function lockFilePath(): string {
  return join(getCacheDir(), 'secrets.lock');
}

function isLockStale(): boolean {
  try {
    const stat = statSync(lockFilePath());
    return (Date.now() - stat.mtimeMs) > LOCK_STALE_MS;
  } catch {
    return true;
  }
}

function tryAcquireLock(): boolean {
  try {
    ensureCacheDir();
    const fd = openSync(lockFilePath(), 'wx');
    closeSync(fd);
    return true;
  } catch {
    if (isLockStale()) {
      try {
        unlinkSync(lockFilePath());
        const fd = openSync(lockFilePath(), 'wx');
        closeSync(fd);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function releaseLock(): void {
  try { unlinkSync(lockFilePath()); } catch { /* already removed */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLock(): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (existsSync(lockFilePath()) && !isLockStale()) {
    if (Date.now() > deadline) return;
    await sleep(LOCK_POLL_MS);
  }
}

// ---------------------------------------------------------------------------
// Encryption key
// ---------------------------------------------------------------------------

function keyFilePath(): string {
  return join(getCacheDir(), 'secrets.key');
}

function getOrCreateKey(): Buffer {
  if (existsSync(keyFilePath())) {
    const key = readFileSync(keyFilePath());
    if (key.length === 32) return key;
  }
  ensureCacheDir();
  const key = randomBytes(32);
  writeFileSync(keyFilePath(), key, { mode: 0o600 });
  return key;
}

// ---------------------------------------------------------------------------
// Encrypted cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  v: string;
  ts: number;
  failed?: true;
}

interface CachePool {
  entries: Record<string, CacheEntry>;
}

function cacheFilePath(): string {
  return join(getCacheDir(), 'secrets.enc');
}

function decrypt(raw: Buffer): CachePool | null {
  try {
    const key = getOrCreateKey();
    if (raw.length < IV_LEN + AUTH_TAG_LEN + 1) return null;

    const iv = raw.subarray(0, IV_LEN);
    const authTag = raw.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + AUTH_TAG_LEN);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return JSON.parse(decrypted.toString('utf8')) as CachePool;
  } catch {
    return null;
  }
}

function encrypt(pool: CachePool): Buffer {
  const key = getOrCreateKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(pool), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function readCachePool(): CachePool {
  if (!existsSync(cacheFilePath())) return { entries: {} };
  const raw = readFileSync(cacheFilePath());
  return decrypt(raw) ?? { entries: {} };
}

function writeCachePool(pool: CachePool): void {
  try {
    ensureCacheDir();
    writeFileSync(cacheFilePath(), encrypt(pool), { mode: 0o600 });
  } catch {
    // Cache write failure is non-fatal
  }
}

function lookupCache(
  opEntries: [string, string][],
  pool: CachePool,
): { resolved: Record<string, string>; missing: [string, string][]; skippedFailed: string[] } {
  const ttl = getTtlMs();
  const now = Date.now();
  const resolved: Record<string, string> = {};
  const missing: [string, string][] = [];
  const skippedFailed: string[] = [];

  for (const [key, ref] of opEntries) {
    const cached = pool.entries[ref];
    if (!cached) {
      missing.push([key, ref]);
      continue;
    }

    if (cached.failed) {
      if ((now - cached.ts) <= NEGATIVE_TTL_MS) {
        skippedFailed.push(ref);
        continue;
      }
      missing.push([key, ref]);
    } else if ((now - cached.ts) <= ttl) {
      resolved[key] = cached.v;
    } else {
      missing.push([key, ref]);
    }
  }

  return { resolved, missing, skippedFailed };
}

function mergeIntoPool(
  pool: CachePool,
  newEntries: Map<string, string>,
  failedRefs?: Set<string>,
): CachePool {
  const now = Date.now();
  const ttl = getTtlMs();

  const pruned: CachePool['entries'] = {};
  for (const [ref, entry] of Object.entries(pool.entries)) {
    const entryTtl = entry.failed ? NEGATIVE_TTL_MS : ttl;
    if ((now - entry.ts) <= entryTtl) {
      pruned[ref] = entry;
    }
  }

  for (const [ref, value] of newEntries) {
    pruned[ref] = { v: value, ts: now };
  }

  if (failedRefs) {
    for (const ref of failedRefs) {
      pruned[ref] = { v: '', ts: now, failed: true };
    }
  }

  return { entries: pruned };
}

// ---------------------------------------------------------------------------
// Resolution via op CLI
// ---------------------------------------------------------------------------

async function resolveViaOpRun(
  entries: [string, string][],
): Promise<Map<string, string>> {
  const { stdout } = await execFileAsync(
    'op',
    ['run', '--no-masking', '--', 'node', '-e', 'process.stdout.write(JSON.stringify(process.env))'],
    { env: process.env, maxBuffer: 10 * 1024 * 1024 },
  );

  const env: Record<string, string> = JSON.parse(stdout);
  const resolved = new Map<string, string>();

  for (const [key, ref] of entries) {
    if (key in env && !env[key].startsWith('op://')) {
      resolved.set(ref, env[key]);
    }
  }

  return resolved;
}

async function resolveViaOpRead(
  entries: [string, string][],
): Promise<{ resolved: Map<string, string>; failedRefs: Set<string> }> {
  const resolved = new Map<string, string>();
  const failedRefs = new Set<string>();
  const seen = new Set<string>();

  for (const [, ref] of entries) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    try {
      const { stdout } = await execFileAsync('op', ['read', ref, '--no-newline']);
      resolved.set(ref, stdout);
    } catch {
      failedRefs.add(ref);
    }
  }

  if (failedRefs.size > 0) {
    console.error(
      `Warning: Failed to resolve ${failedRefs.size} 1Password secret(s):`,
    );
    for (const ref of failedRefs) {
      console.error(`  - ${ref}`);
    }
    console.error(
      'Ensure the 1Password CLI (op) is installed and you are signed in. ' +
      'Failed refs are cached for 10 minutes to avoid repeated auth prompts.',
    );
  }

  return { resolved, failedRefs };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveAndCache(
  opEntries: [string, string][],
  missing: [string, string][],
  pool: CachePool,
): Promise<void> {
  let resolved: Map<string, string>;
  let failedRefs = new Set<string>();

  try {
    resolved = await resolveViaOpRun(missing);
  } catch {
    const result = await resolveViaOpRead(missing);
    resolved = result.resolved;
    failedRefs = result.failedRefs;
  }

  for (const [key, ref] of missing) {
    const value = resolved.get(ref);
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  if (resolved.size > 0 || failedRefs.size > 0) {
    const freshPool = readCachePool();
    const updated = mergeIntoPool(freshPool, resolved, failedRefs);
    writeCachePool(updated);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan process.env for op:// references and resolve them via the 1Password CLI.
 *
 * Resolution strategy:
 * 1. Encrypted cache — shared pool of op:// ref -> value pairs. If all references
 *    are cached and non-expired, no `op` process is spawned (zero overhead).
 * 2. File lock — concurrent processes serialize op calls so only one triggers
 *    a biometric prompt.
 * 3. `op run` — batch resolution in a single process spawn.
 * 4. `op read` — sequential fallback if `op run` fails.
 *
 * If no op:// references exist in process.env, returns immediately (zero overhead).
 * Resolution failures are logged to stderr but do not crash the process.
 */
export async function resolveSecrets(): Promise<void> {
  const opEntries = Object.entries(process.env)
    .filter((entry): entry is [string, string] => entry[1]?.startsWith('op://') === true);

  if (opEntries.length === 0) return;

  // 1. Try cache
  const pool = readCachePool();
  const { resolved: cached, missing } = lookupCache(opEntries, pool);

  for (const [key, value] of Object.entries(cached)) {
    process.env[key] = value;
  }

  if (missing.length === 0) return;

  // 2. Try to acquire lock — only one process calls op
  if (tryAcquireLock()) {
    try {
      await resolveAndCache(opEntries, missing, pool);
    } finally {
      releaseLock();
    }
    return;
  }

  // 3. Lock held by another process — wait for it to finish
  await waitForLock();

  // 4. Re-read cache — the winner should have populated it
  const freshPool = readCachePool();
  const { resolved: nowCached, missing: stillMissing } = lookupCache(opEntries, freshPool);

  for (const [key, value] of Object.entries(nowCached)) {
    process.env[key] = value;
  }

  if (stillMissing.length === 0) return;

  // 5. Still missing (different refs) — resolve ourselves
  await resolveAndCache(opEntries, stillMissing, freshPool);
}

/**
 * Check if the 1Password CLI is available on the system.
 * Returns true if `op --version` succeeds, false otherwise.
 */
export async function isOpCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync('op', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether the 1Password CLI has an authenticated session (or, with
 * desktop-app integration, can obtain one). Returns true if `op whoami`
 * succeeds, false otherwise.
 *
 * Used as a pre-flight before bulk resolution so callers can refuse to run when
 * `op` cannot authenticate — a failed resolution negative-caches the refs for
 * 10 minutes, which would block the very MCP servers the caller is warming.
 */
export async function isOpSignedIn(): Promise<boolean> {
  try {
    await execFileAsync('op', ['whoami']);
    return true;
  } catch {
    return false;
  }
}
