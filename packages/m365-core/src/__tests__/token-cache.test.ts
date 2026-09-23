import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TokenCacheContext } from '@azure/msal-node';
import { TokenCache } from '../token-cache.js';

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

describe('TokenCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm365-core-cache-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('names the file {prefix}-token-cache-{clientId}.enc inside the token dir', () => {
    const cache = new TokenCache('outlook', 'client-1', dir);
    expect(cache.getCachePath()).toBe(path.join(dir, 'outlook-token-cache-client-1.enc'));
  });

  it('round-trips the serialized cache through the plugin', async () => {
    const cache = new TokenCache('sharepoint', 'client-1', dir);
    const plugin = cache.createPlugin();

    await plugin.afterCacheAccess(fakeContext('{"Account":{"a":1}}', true).context);
    expect(cache.exists()).toBe(true);
    expect(fs.readFileSync(cache.getCachePath(), 'utf8')).not.toContain('Account');

    const { context, received } = fakeContext('', false);
    await plugin.beforeCacheAccess(context);
    expect(received).toEqual(['{"Account":{"a":1}}']);
  });

  it('writes the file at mode 0600', async () => {
    const cache = new TokenCache('sharepoint', 'client-1', dir);
    await cache.createPlugin().afterCacheAccess(fakeContext('{}', true).context);
    expect(fs.statSync(cache.getCachePath()).mode & 0o777).toBe(0o600);
  });

  it('does not write when the cache has not changed', async () => {
    const cache = new TokenCache('sharepoint', 'client-1', dir);
    await cache.createPlugin().afterCacheAccess(fakeContext('{}', false).context);
    expect(cache.exists()).toBe(false);
  });

  it('treats a file encrypted under a different key as empty rather than throwing', async () => {
    const other = new TokenCache('outlook', 'client-1', dir);
    await other.createPlugin().afterCacheAccess(fakeContext('{"secret":1}', true).context);

    const cache = new TokenCache('sharepoint', 'client-1', dir);
    fs.copyFileSync(other.getCachePath(), cache.getCachePath());

    const { context, received } = fakeContext('', false);
    await expect(cache.createPlugin().beforeCacheAccess(context)).resolves.toBeUndefined();
    expect(received).toEqual([]);
  });

  it('treats a truncated file as empty rather than throwing', async () => {
    const cache = new TokenCache('sharepoint', 'client-1', dir);
    fs.writeFileSync(cache.getCachePath(), Buffer.from('short'));
    const { context, received } = fakeContext('', false);
    await expect(cache.createPlugin().beforeCacheAccess(context)).resolves.toBeUndefined();
    expect(received).toEqual([]);
  });

  it('clear() removes the file', async () => {
    const cache = new TokenCache('sharepoint', 'client-1', dir);
    await cache.createPlugin().afterCacheAccess(fakeContext('{}', true).context);
    cache.clear();
    expect(cache.exists()).toBe(false);
    expect(() => cache.clear()).not.toThrow();
  });
});
