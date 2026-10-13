/**
 * MSAL token cache for delegated (device-code) Graph servers, kept in the OS
 * keychain.
 *
 * Persists the serialized MSAL cache - including the refresh token - so an
 * expired access token is renewed silently instead of forcing another
 * device-code sign-in every hour.
 *
 * Storage, through @azure/msal-node-extensions: the macOS Keychain or the
 * Linux Secret Service (service "mcp-consultant-tools", account
 * "{prefix}-{clientId}"), or on Windows a file encrypted with the data
 * protection API at {tokenDir}/{prefix}-{clientId}.cache. That library has
 * native parts and is an optional dependency: when it is missing or the
 * keychain cannot be used, tokens are kept in memory only and the user signs in
 * again at each server start. Nothing is ever written to disk in readable form.
 *
 * The library guards each write with a lock file holding the writer's process
 * ID. A lock left by a server that was killed mid-write is removed here before
 * each read, and waits are kept short, so it can never stall sign-in.
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

/** Wait up to 3 seconds for another server's write, then carry on from memory. */
const LOCK_OPTIONS = { retryNumber: 30, retryDelay: 100 };

/** A lock older than this is stale even if its process ID now belongs to something else. */
const STALE_LOCK_MS = 60 * 1000;

/** After a keychain that failed to open, try again no sooner than this. */
const REOPEN_DELAY_MS = 30 * 1000;

/** The parts of @azure/msal-node-extensions this cache uses. */
export interface KeychainLibrary {
  DataProtectionScope: { CurrentUser: unknown };
  PersistenceCreator: {
    createPersistence(config: Record<string, unknown>): Promise<KeychainPersistence>;
  };
  PersistenceCachePlugin: new (
    persistence: KeychainPersistence,
    lockOptions?: { retryNumber: number; retryDelay: number },
  ) => ICachePlugin;
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
  private readonly syncFile: string;
  private readonly accountName: string;
  private readonly loadLibrary: () => Promise<KeychainLibrary>;
  private keychain: Promise<Keychain | null> | null = null;
  private memoryOnly = false;
  private libraryMissing = false;
  private reopenAfter = 0;

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
    this.syncFile = path.join(tokenDir, `${this.accountName}.cache`);
    this.loadLibrary = loadLibrary;
  }

  /**
   * Open the keychain once; null means tokens stay in memory only. A missing
   * library is final, but a keychain that failed to open (a cancelled prompt, a
   * locked keychain, two servers checking it at once) is tried again later.
   */
  private open(): Promise<Keychain | null> {
    if (this.memoryOnly && !this.libraryMissing && Date.now() >= this.reopenAfter) {
      this.keychain = null;
    }
    this.keychain ??= this.openKeychain();
    return this.keychain;
  }

  private async openKeychain(): Promise<Keychain | null> {
    try {
      fs.rmSync(this.legacyFile, { force: true });
    } catch {
      // A leftover file we cannot remove is no reason to stop signing in.
    }
    let library: KeychainLibrary;
    try {
      fs.mkdirSync(this.tokenDir, { recursive: true, mode: 0o700 });
      library = await this.loadLibrary();
    } catch (error) {
      this.libraryMissing = true;
      return this.fallBackToMemory(error);
    }
    try {
      const persistence = await library.PersistenceCreator.createPersistence({
        // On macOS and Linux only a timestamp goes here; on Windows the
        // DPAPI-encrypted cache itself.
        cachePath: this.syncFile,
        dataProtectionScope: library.DataProtectionScope.CurrentUser,
        serviceName: KEYCHAIN_SERVICE,
        accountName: this.accountName,
        usePlaintextFileOnLinux: false,
      });
      this.memoryOnly = false;
      return { plugin: new library.PersistenceCachePlugin(persistence, LOCK_OPTIONS), persistence };
    } catch (error) {
      this.reopenAfter = Date.now() + REOPEN_DELAY_MS;
      return this.fallBackToMemory(error);
    }
  }

  private fallBackToMemory(error: unknown): null {
    if (!this.memoryOnly) {
      console.error(
        `${this.filePrefix} token cache: the OS keychain is not available (${(error as Error).message}). ` +
          'Tokens are kept in memory only, so you will sign in again each time the server starts.',
      );
    }
    this.memoryOnly = true;
    return null;
  }

  /** Remove a lock file whose writer is gone, or that is too old to be live. */
  private removeStaleLock(): void {
    const lockFile = `${this.syncFile}.lockfile`;
    try {
      const age = Date.now() - fs.statSync(lockFile).mtimeMs;
      const pid = Number.parseInt(fs.readFileSync(lockFile, 'utf8'), 10);
      if (age > STALE_LOCK_MS || !Number.isInteger(pid) || !isRunning(pid)) {
        fs.rmSync(lockFile, { force: true });
      }
    } catch {
      // No lock file, or it went away while we looked.
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
      if (step === 'beforeCacheAccess') this.removeStaleLock();
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
      fs.rmSync(`${this.syncFile}.lockfile`, { force: true });
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

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
