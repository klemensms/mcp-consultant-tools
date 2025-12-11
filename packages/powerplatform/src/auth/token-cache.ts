/**
 * Token Cache for Interactive Authentication
 *
 * Provides encrypted file-based storage for MSAL tokens.
 * Tokens are encrypted using AES-256-GCM with a machine-specific key.
 *
 * Storage location: ~/.mcp-consultant-tools/token-cache-{clientId}.enc
 */

import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export class TokenCache {
  private cacheFile: string;
  private encryptionKey: Buffer;
  private cacheDir: string;

  constructor(clientId: string) {
    this.cacheDir = path.join(os.homedir(), '.mcp-consultant-tools');

    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 });
    }

    this.cacheFile = path.join(this.cacheDir, `token-cache-${clientId}.enc`);

    // Derive encryption key from machine-specific data
    // Uses hostname + username as salt for key derivation
    const machineId = os.hostname() + os.userInfo().username;
    this.encryptionKey = crypto.scryptSync(machineId, 'mcp-powerplatform-auth', 32);
  }

  /**
   * Create MSAL cache plugin for automatic token persistence
   */
  createPlugin(): ICachePlugin {
    return {
      beforeCacheAccess: async (context: TokenCacheContext) => {
        if (fs.existsSync(this.cacheFile)) {
          try {
            const encrypted = fs.readFileSync(this.cacheFile);
            const decrypted = this.decrypt(encrypted);
            context.tokenCache.deserialize(decrypted);
          } catch (error) {
            // Cache corrupted or from different machine, ignore
            // MSAL will proceed with empty cache
            console.error('Token cache read error (will re-authenticate):', (error as Error).message);
          }
        }
      },
      afterCacheAccess: async (context: TokenCacheContext) => {
        if (context.cacheHasChanged) {
          try {
            const data = context.tokenCache.serialize();
            const encrypted = this.encrypt(data);
            fs.writeFileSync(this.cacheFile, encrypted, { mode: 0o600 });
          } catch (error) {
            console.error('Token cache write error:', (error as Error).message);
          }
        }
      },
    };
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: string): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: IV (16 bytes) + Auth Tag (16 bytes) + Encrypted Data
    return Buffer.concat([iv, tag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(data: Buffer): string {
    if (data.length < 33) {
      throw new Error('Invalid encrypted data: too short');
    }

    const iv = data.subarray(0, 16);
    const tag = data.subarray(16, 32);
    const encrypted = data.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted) + decipher.final('utf8');
  }

  /**
   * Clear the token cache (logout)
   */
  clear(): void {
    if (fs.existsSync(this.cacheFile)) {
      fs.unlinkSync(this.cacheFile);
    }
  }

  /**
   * Check if a token cache exists
   */
  exists(): boolean {
    return fs.existsSync(this.cacheFile);
  }

  /**
   * Get the cache file path (for diagnostics)
   */
  getCachePath(): string {
    return this.cacheFile;
  }
}
