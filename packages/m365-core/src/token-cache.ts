/**
 * MSAL token cache for delegated (device-code) Graph servers, kept in the OS
 * keychain.
 *
 * Persists the serialized MSAL cache - including the refresh token - so an
 * expired access token is renewed silently instead of forcing another
 * device-code sign-in every hour.
 *
 * Storage: the macOS Keychain, the Windows data protection API, or the Linux
 * Secret Service, through @azure/msal-node-extensions (service
 * "mcp-consultant-tools", account "{prefix}-{clientId}"). That library has
 * native parts and is an optional dependency: when it is missing or the
 * keychain cannot be used, tokens are kept in memory only and the user signs in
 * again at each server start. Nothing is ever written to disk in readable form.
 *
 * The old encrypted file ({tokenDir}/{prefix}-token-cache-{clientId}.enc) is
 * deleted on first use; its key could be derived by anyone with a copy.
 *
 * Mirrored in packages/powerplatform-core/src/auth/token-cache.ts; keep the two
 * in step.
 */

import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DEFAULT_TOKEN_DIR = path.join(os.homedir(), '.mcp-consultant-tools');

const KEYCHAIN_SERVICE = 'mcp-consultant-tools';

/** The parts of @azure/msal-node-extensions this cache uses. */
export interface KeychainLibrary {
  DataProtectionScope: { CurrentUser: unknown };
  PersistenceCreator: {
    createPersistence(config: Record<string, unknown>): Promise<KeychainPersistence>;
  };
  PersistenceCachePlugin: new (persistence: KeychainPersistence) => ICachePlugin;
}

interface KeychainPersistence {
  load(): Promise<string | null>;
  delete(): Promise<boolean>;
}

interface Keychain {
  plugin: ICachePlugin;
  persistence: KeychainPersistence;
}

// A variable specifier keeps the build independent of the optional install.
const KEYCHAIN_MODULE = '@azure/msal-node-extensions';
const loadKeychainLibrary = async (): Promise<KeychainLibrary> =>
  (await import(KEYCHAIN_MODULE)) as KeychainLibrary;

export class TokenCache {
  private readonly filePrefix: string;
  private readonly tokenDir: string;
  private readonly legacyFile: string;
  private readonly accountName: string;
  private readonly loadLibrary: () => Promise<KeychainLibrary>;
  private keychain: Promise<Keychain | null> | null = null;
  private memoryOnly = false;

  constructor(
    filePrefix: string,
    clientId: string,
    tokenDir: string = DEFAULT_TOKEN_DIR,
    loadLibrary: () => Promise<KeychainLibrary> = loadKeychainLibrary,
  ) {
    this.filePrefix = filePrefix;
    this.tokenDir = tokenDir;
    this.legacyFile = path.join(tokenDir, `${filePrefix}-token-cache-${clientId}.enc`);
    this.accountName = `${filePrefix}-${clientId}`;
    this.loadLibrary = loadLibrary;
  }

  /** Open the keychain once; null means tokens stay in memory only. */
  private open(): Promise<Keychain | null> {
    this.keychain ??= this.openKeychain();
    return this.keychain;
  }

  private async openKeychain(): Promise<Keychain | null> {
    try {
      fs.rmSync(this.legacyFile, { force: true });
    } catch {
      // A leftover file we cannot remove is no reason to stop signing in.
    }
    try {
      fs.mkdirSync(this.tokenDir, { recursive: true, mode: 0o700 });
      const library = await this.loadLibrary();
      const persistence = await library.PersistenceCreator.createPersistence({
        // The library keeps a timestamp and lock file here, never the tokens.
        cachePath: path.join(this.tokenDir, `${this.accountName}.keychain-sync`),
        dataProtectionScope: library.DataProtectionScope.CurrentUser,
        serviceName: KEYCHAIN_SERVICE,
        accountName: this.accountName,
        usePlaintextFileOnLinux: false,
      });
      return { plugin: new library.PersistenceCachePlugin(persistence), persistence };
    } catch (error) {
      this.memoryOnly = true;
      console.error(
        `${this.filePrefix} token cache: the OS keychain is not available (${(error as Error).message}). ` +
          'Tokens are kept in memory only, so you will sign in again each time the server starts.',
      );
      return null;
    }
  }

  /**
   * Create the MSAL cache plugin for automatic token persistence. A keychain
   * failure is reported on stderr and never fails the token request: MSAL keeps
   * its own in-memory cache either way.
   */
  createPlugin(): ICachePlugin {
    const run = async (step: 'beforeCacheAccess' | 'afterCacheAccess', context: TokenCacheContext) => {
      const keychain = await this.open();
      if (!keychain) return;
      try {
        await keychain.plugin[step](context);
      } catch (error) {
        console.error(`${this.filePrefix} token cache: keychain ${step === 'beforeCacheAccess' ? 'read' : 'write'} failed:`, (error as Error).message);
      }
    };
    return {
      beforeCacheAccess: (context) => run('beforeCacheAccess', context),
      afterCacheAccess: (context) => run('afterCacheAccess', context),
    };
  }

  /** Remove the stored sign-in (logout). */
  async clear(): Promise<void> {
    const keychain = await this.open();
    try {
      await keychain?.persistence.delete();
    } catch (error) {
      console.error(`${this.filePrefix} token cache: keychain delete failed:`, (error as Error).message);
    }
  }

  /** True when a stored sign-in exists. */
  async exists(): Promise<boolean> {
    const keychain = await this.open();
    try {
      return Boolean(await keychain?.persistence.load());
    } catch {
      return false;
    }
  }

  /** Where the cache lives, for diagnostics. */
  getCachePath(): string {
    return this.memoryOnly
      ? 'memory only (OS keychain not available)'
      : `OS keychain (service "${KEYCHAIN_SERVICE}", account "${this.accountName}")`;
  }
}
