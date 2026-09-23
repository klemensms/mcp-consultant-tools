/**
 * Encrypted MSAL token cache for delegated (device-code) Graph servers.
 *
 * Persists the serialized MSAL cache - including the refresh token - so an
 * expired access token is renewed silently instead of forcing another
 * device-code sign-in every hour.
 *
 * Tokens are encrypted with AES-256-GCM under a machine-derived key and written
 * at mode 0600. The key salt includes the file prefix, so a cache written by one
 * server cannot be read by another.
 *
 * Ported from packages/teams/src/auth/token-cache.ts; the prefix and directory
 * are constructor arguments so each server keeps its own file.
 *
 * Storage location: {tokenDir}/{prefix}-token-cache-{clientId}.enc
 * (default tokenDir: ~/.mcp-consultant-tools)
 */

import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const DEFAULT_TOKEN_DIR = path.join(os.homedir(), '.mcp-consultant-tools');

export class TokenCache {
  private cacheFile: string;
  private encryptionKey: Buffer;
  private filePrefix: string;

  constructor(filePrefix: string, clientId: string, tokenDir: string = DEFAULT_TOKEN_DIR) {
    this.filePrefix = filePrefix;

    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
    }

    this.cacheFile = path.join(tokenDir, `${filePrefix}-token-cache-${clientId}.enc`);

    // Derive the key from machine-specific data so a copied cache file is
    // useless on another host.
    const machineId = os.hostname() + os.userInfo().username;
    this.encryptionKey = crypto.scryptSync(machineId, `mcp-${filePrefix}-auth`, 32);
  }

  /**
   * Create the MSAL cache plugin for automatic token persistence.
   */
  createPlugin(): ICachePlugin {
    return {
      beforeCacheAccess: async (context: TokenCacheContext) => {
        if (fs.existsSync(this.cacheFile)) {
          try {
            const decrypted = this.decrypt(fs.readFileSync(this.cacheFile));
            context.tokenCache.deserialize(decrypted);
          } catch (error) {
            // Corrupted, or written on a different machine or by another server.
            // Proceed with an empty cache; the user signs in again.
            console.error(`${this.filePrefix} token cache read error (will re-authenticate):`, (error as Error).message);
          }
        }
      },
      afterCacheAccess: async (context: TokenCacheContext) => {
        if (context.cacheHasChanged) {
          try {
            const encrypted = this.encrypt(context.tokenCache.serialize());
            fs.writeFileSync(this.cacheFile, encrypted, { mode: 0o600 });
            // writeFileSync only applies mode when it creates the file.
            fs.chmodSync(this.cacheFile, 0o600);
          } catch (error) {
            console.error(`${this.filePrefix} token cache write error:`, (error as Error).message);
          }
        }
      },
    };
  }

  /** Format: IV (16 bytes) + auth tag (16 bytes) + ciphertext. */
  private encrypt(data: string): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }

  private decrypt(data: Buffer): string {
    if (data.length < 33) {
      throw new Error('Invalid encrypted data: too short');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, data.subarray(0, 16));
    decipher.setAuthTag(data.subarray(16, 32));
    return decipher.update(data.subarray(32)) + decipher.final('utf8');
  }

  /** Remove the cache file (logout). */
  clear(): void {
    if (fs.existsSync(this.cacheFile)) {
      fs.unlinkSync(this.cacheFile);
    }
  }

  exists(): boolean {
    return fs.existsSync(this.cacheFile);
  }

  /** The cache file path, for diagnostics. */
  getCachePath(): string {
    return this.cacheFile;
  }
}
