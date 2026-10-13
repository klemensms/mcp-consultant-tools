import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TokenCacheContext } from '@azure/msal-node';
import { TokenCache, type KeychainLibrary } from '../token-cache.js';

/** Minimal stand-in for the MSAL context the plugin is handed. */
function fakeContext(serialized: string, cacheHasChanged: boolean) {
  const received: string[] = [];
  const context = {
    cacheHasChanged,
    tokenCache: {
      serialize: () => serialized,
      deserialize: (data: string) => {
        received.push(data);
      },
    },
  } as unknown as TokenCacheContext;
  return { context, received };
}

/** An in-memory stand-in for @azure/msal-node-extensions, so no test touches the real keychain. */
function fakeKeychain(options: { createFails?: Error; createFailures?: number } = {}) {
  let stored: string | null = null;
  let failures = options.createFailures ?? Infinity;
  const configs: Array<Record<string, unknown>> = [];
  const lockOptions: unknown[] = [];
  const persistence = {
    save: vi.fn(async (contents: string) => {
      stored = contents;
    }),
    load: vi.fn(async () => stored),
    delete: vi.fn(async () => {
      const had = stored !== null;
      stored = null;
      return had;
    }),
  };
  const library: KeychainLibrary = {
    DataProtectionScope: { CurrentUser: 'CurrentUser' },
    PersistenceCreator: {
      createPersistence: vi.fn(async (config: Record<string, unknown>) => {
        configs.push(config);
        if (options.createFails && failures-- > 0) throw options.createFails;
        return persistence;
      }),
    },
    PersistenceCachePlugin: class {
      constructor(private readonly p: typeof persistence, lock?: unknown) {
        lockOptions.push(lock);
      }
      async beforeCacheAccess(context: TokenCacheContext) {
        const data = await this.p.load();
        if (data) context.tokenCache.deserialize(data);
      }
      async afterCacheAccess(context: TokenCacheContext) {
        if (context.cacheHasChanged) await this.p.save(context.tokenCache.serialize());
      }
    },
  };
  return { library, persistence, configs, lockOptions, stored: () => stored };
}

describe('TokenCache', () => {
  let dir: string;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm365-core-cache-'));
    stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    stderr.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stores the cache in the OS keychain under this server and client', async () => {
    const keychain = fakeKeychain();
    const cache = new TokenCache('outlook', 'client-1', dir, async () => keychain.library);
    const plugin = cache.createPlugin();

    await plugin.afterCacheAccess(fakeContext('{"Account":{"a":1}}', true).context);
    expect(keychain.stored()).toBe('{"Account":{"a":1}}');
    expect(keychain.configs[0]).toMatchObject({
      serviceName: 'mcp-consultant-tools',
      accountName: 'outlook-client-1',
      usePlaintextFileOnLinux: false,
    });
    expect(String(keychain.configs[0].cachePath).startsWith(dir)).toBe(true);

    const { context, received } = fakeContext('', false);
    await plugin.beforeCacheAccess(context);
    expect(received).toEqual(['{"Account":{"a":1}}']);
    expect(await cache.exists()).toBe(true);
    expect(cache.getCachePath()).toContain('OS keychain');
  });

  it('writes no token file to disk', async () => {
    const keychain = fakeKeychain();
    const cache = new TokenCache('outlook', 'client-1', dir, async () => keychain.library);
    await cache.createPlugin().afterCacheAccess(fakeContext('{"secret":1}', true).context);
    for (const name of fs.readdirSync(dir)) {
      expect(fs.readFileSync(path.join(dir, name), 'utf8')).not.toContain('secret');
    }
  });

  it('keeps tokens in memory only when the keychain library cannot be loaded', async () => {
    const cache = new TokenCache('outlook', 'client-1', dir, async () => {
      throw new Error('Cannot find module keytar');
    });
    const plugin = cache.createPlugin();

    await expect(plugin.afterCacheAccess(fakeContext('{"a":1}', true).context)).resolves.toBeUndefined();
    const { context, received } = fakeContext('', false);
    await expect(plugin.beforeCacheAccess(context)).resolves.toBeUndefined();
    expect(received).toEqual([]);
    expect(await cache.exists()).toBe(false);
    expect(cache.getCachePath()).toContain('memory only');
    expect(fs.readdirSync(dir)).toEqual([]);
    // One explanation on stderr, not one per call.
    const fallbackLines = stderr.mock.calls.filter((c) => String(c[0]).includes('memory only'));
    expect(fallbackLines).toHaveLength(1);
  });

  it('keeps tokens in memory only when the keychain is unavailable', async () => {
    const keychain = fakeKeychain({ createFails: new Error('libsecret not installed') });
    const cache = new TokenCache('outlook', 'client-1', dir, async () => keychain.library);
    await expect(cache.createPlugin().afterCacheAccess(fakeContext('{}', true).context)).resolves.toBeUndefined();
    expect(cache.getCachePath()).toContain('memory only');
  });

  it('keeps tokens in memory only when the token folder cannot be created', async () => {
    const blocker = path.join(dir, 'not-a-folder');
    fs.writeFileSync(blocker, 'x');
    const keychain = fakeKeychain();
    const cache = new TokenCache('outlook', 'client-1', path.join(blocker, 'sub'), async () => keychain.library);
    await expect(cache.createPlugin().afterCacheAccess(fakeContext('{}', true).context)).resolves.toBeUndefined();
    expect(cache.getCachePath()).toContain('memory only');
    expect(keychain.configs).toEqual([]);
  });

  it('reports a keychain read or write failure on stderr instead of failing the call', async () => {
    const keychain = fakeKeychain();
    keychain.persistence.save.mockRejectedValueOnce(new Error('user denied keychain access'));
    const cache = new TokenCache('outlook', 'client-1', dir, async () => keychain.library);
    await expect(cache.createPlugin().afterCacheAccess(fakeContext('{}', true).context)).resolves.toBeUndefined();
    expect(stderr.mock.calls.some((c) => String(c.join(' ')).includes('user denied keychain access'))).toBe(true);
  });

  it('deletes the old encrypted cache file on first use', async () => {
    const legacy = path.join(dir, 'outlook-token-cache-client-1.enc');
    fs.writeFileSync(legacy, 'old');
    const cache = new TokenCache('outlook', 'client-1', dir, async () => fakeKeychain().library);
    await cache.createPlugin().beforeCacheAccess(fakeContext('', false).context);
    expect(fs.existsSync(legacy)).toBe(false);
  });

  it('deletes the old encrypted cache file even when falling back to memory', async () => {
    const legacy = path.join(dir, 'outlook-token-cache-client-1.enc');
    fs.writeFileSync(legacy, 'old');
    const cache = new TokenCache('outlook', 'client-1', dir, async () => {
      throw new Error('no native module');
    });
    await cache.createPlugin().beforeCacheAccess(fakeContext('', false).context);
    expect(fs.existsSync(legacy)).toBe(false);
  });

  it('clear() removes the keychain entry and is safe to repeat', async () => {
    const keychain = fakeKeychain();
    const cache = new TokenCache('outlook', 'client-1', dir, async () => keychain.library);
    await cache.createPlugin().afterCacheAccess(fakeContext('{}', true).context);
    await cache.clear();
    expect(await cache.exists()).toBe(false);
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it('loads the keychain library once however many calls arrive together', async () => {
    const keychain = fakeKeychain();
    const loader = vi.fn(async () => keychain.library);
    const cache = new TokenCache('outlook', 'client-1', dir, loader);
    const plugin = cache.createPlugin();
    await Promise.all([1, 2, 3].map(() => plugin.beforeCacheAccess(fakeContext('', false).context)));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  describe('write lock', () => {
    const lockFile = () => path.join(dir, 'outlook-client-1.cache.lockfile');

    it('waits at most about 3 seconds for another server', async () => {
      const keychain = fakeKeychain();
      const cache = new TokenCache('outlook', 'client-1', dir, async () => keychain.library);
      await cache.createPlugin().beforeCacheAccess(fakeContext('', false).context);
      expect(keychain.lockOptions[0]).toEqual({ retryNumber: 30, retryDelay: 100 });
    });

    it('removes a lock left by a server that is no longer running', async () => {
      const dead = spawnSync(process.execPath, ['-e', '']).pid!;
      const cache = new TokenCache('outlook', 'client-1', dir, async () => fakeKeychain().library);
      fs.writeFileSync(lockFile(), String(dead));
      await cache.createPlugin().beforeCacheAccess(fakeContext('', false).context);
      expect(fs.existsSync(lockFile())).toBe(false);
    });

    it('keeps a fresh lock held by a running server', async () => {
      const cache = new TokenCache('outlook', 'client-1', dir, async () => fakeKeychain().library);
      fs.writeFileSync(lockFile(), String(process.pid));
      await cache.createPlugin().beforeCacheAccess(fakeContext('', false).context);
      expect(fs.existsSync(lockFile())).toBe(true);
    });

    it('removes a lock older than a minute, whoever holds it', async () => {
      const cache = new TokenCache('outlook', 'client-1', dir, async () => fakeKeychain().library);
      fs.writeFileSync(lockFile(), String(process.pid));
      const old = new Date(Date.now() - 2 * 60 * 1000);
      fs.utimesSync(lockFile(), old, old);
      await cache.createPlugin().beforeCacheAccess(fakeContext('', false).context);
      expect(fs.existsSync(lockFile())).toBe(false);
    });

    it('clear() removes the lock file too', async () => {
      const cache = new TokenCache('outlook', 'client-1', dir, async () => fakeKeychain().library);
      fs.writeFileSync(lockFile(), String(process.pid));
      await cache.clear();
      expect(fs.existsSync(lockFile())).toBe(false);
    });
  });

  describe('reopening', () => {
    afterEach(() => vi.restoreAllMocks());

    it('tries a keychain that failed to open again after 30 seconds', async () => {
      const keychain = fakeKeychain({ createFails: new Error('user cancelled'), createFailures: 1 });
      const cache = new TokenCache('outlook', 'client-1', dir, async () => keychain.library);
      const plugin = cache.createPlugin();
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);

      await plugin.afterCacheAccess(fakeContext('{"a":1}', true).context);
      expect(cache.getCachePath()).toContain('memory only');
      await plugin.afterCacheAccess(fakeContext('{"a":1}', true).context);
      expect(keychain.configs).toHaveLength(1);

      clock.mockReturnValue(now + 31_000);
      await plugin.afterCacheAccess(fakeContext('{"a":1}', true).context);
      expect(keychain.configs).toHaveLength(2);
      expect(keychain.stored()).toBe('{"a":1}');
      expect(cache.getCachePath()).toContain('OS keychain');
    });

    it('does not retry when the keychain library is missing', async () => {
      const loader = vi.fn(async (): Promise<KeychainLibrary> => {
        throw new Error('Cannot find module');
      });
      const cache = new TokenCache('outlook', 'client-1', dir, loader);
      const plugin = cache.createPlugin();
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      await plugin.beforeCacheAccess(fakeContext('', false).context);
      clock.mockReturnValue(now + 10 * 60_000);
      await plugin.beforeCacheAccess(fakeContext('', false).context);
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });
});

