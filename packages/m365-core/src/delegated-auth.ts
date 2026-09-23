/**
 * Delegated (sign in as the user) Microsoft Graph authentication over the
 * device-code flow, shared by the SharePoint and Outlook servers.
 *
 * Order on every call: in-memory token, then a silent refresh from the cached
 * refresh token, then a pending device-code flow, then "not authenticated".
 *
 * Requests https://graph.microsoft.com/.default rather than a fixed scope list:
 * Entra issues whatever the registration has admin consent for, so a permission
 * that was never granted breaks only the tools that need it instead of failing
 * sign-in for the whole server.
 *
 * Ported from the device-code half of packages/teams/src/services/teams-service.ts.
 */

import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-node';
import type { AccountInfo, AuthenticationResult } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCache } from './token-cache.js';
import { decodeTokenScopes } from './token-scopes.js';

export const GRAPH_DEFAULT_SCOPE = 'https://graph.microsoft.com/.default';

/** Treat a token as expired this long before its real expiry. */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface DelegatedAuthConfig {
  /** "sharepoint" | "outlook"; used in the cache filename and messages. */
  serverName: string;
  tenantId: string;
  clientId: string;
  /** Default [GRAPH_DEFAULT_SCOPE]. */
  scopes?: string[];
  /** Default ~/.mcp-consultant-tools; tests pass a temp dir. */
  tokenDir?: string;
  /** Tool the user is told to call when not signed in. Default "authenticate". */
  authToolName?: string;
}

export type AuthState = 'authenticated' | 'pending' | 'expired' | 'not_authenticated';

export interface AuthStatus {
  state: AuthState;
  account?: string;
  expiresAt?: string;
  grantedScopes?: string[];
  message: string;
}

export interface DeviceCodeStart {
  state: 'pending' | 'authenticated';
  userCode?: string;
  verificationUri?: string;
  expiresInSeconds?: number;
  message: string;
}

interface PendingAuth {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  /** Resolves null on success, or the failure reason. Never rejects. */
  completion: Promise<string | null>;
}

export class DelegatedGraphAuth {
  private readonly config: DelegatedAuthConfig;
  private readonly scopes: string[];
  private readonly authToolName: string;
  private readonly tokenCache: TokenCache;
  private readonly msal: PublicClientApplication;
  private graphClient: Client | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime = 0;
  private account: string | undefined;
  private pendingAuth: PendingAuth | null = null;

  constructor(config: DelegatedAuthConfig) {
    this.config = config;
    this.scopes = config.scopes ?? [GRAPH_DEFAULT_SCOPE];
    this.authToolName = config.authToolName ?? 'authenticate';
    this.tokenCache = new TokenCache(config.serverName, config.clientId, config.tokenDir);
    this.msal = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
      cache: {
        cachePlugin: this.tokenCache.createPlugin(),
      },
    });
  }

  /** Path of the encrypted cache file, for diagnostics. */
  getCachePath(): string {
    return this.tokenCache.getCachePath();
  }

  private hasValidToken(): boolean {
    return this.accessToken !== null && this.tokenExpirationTime > Date.now();
  }

  private isPending(): boolean {
    return this.pendingAuth !== null && this.pendingAuth.expiresAt > Date.now();
  }

  private applyResult(result: AuthenticationResult): void {
    this.accessToken = result.accessToken;
    const expiresAt = result.expiresOn ?? new Date(Date.now() + 60 * 60 * 1000);
    this.tokenExpirationTime = expiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS;
    this.account = result.account?.username ?? this.account;
  }

  /**
   * Renew from the cached refresh token without user interaction. Returns null
   * when nothing is cached, or when the refresh token is dead and a new
   * device-code sign-in is required.
   */
  private async acquireTokenSilentIfPossible(): Promise<string | null> {
    const accounts: AccountInfo[] = await this.msal.getTokenCache().getAllAccounts();
    if (accounts.length === 0) {
      return null;
    }
    try {
      const result = await this.msal.acquireTokenSilent({ account: accounts[0], scopes: this.scopes });
      if (!result?.accessToken) {
        return null;
      }
      this.applyResult(result);
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        console.error(`${this.config.serverName}: refresh token expired or revoked - device-code sign-in required`);
        return null;
      }
      throw error;
    }
  }

  private pendingMessage(): string {
    return (
      `Sign-in in progress. Open ${this.pendingAuth?.verificationUri} and enter code ` +
      `${this.pendingAuth?.userCode}, then sign in with your Microsoft account.`
    );
  }

  private notAuthenticatedMessage(): string {
    return (
      `Not signed in to Microsoft Graph for the ${this.config.serverName} server. ` +
      `Call the '${this.authToolName}' tool (or run "auth login" on the CLI) to sign in.`
    );
  }

  /**
   * Current access token: memory, then silent refresh, then a pending sign-in
   * (waited on briefly), else throws. Never starts a new sign-in.
   */
  async getAccessToken(): Promise<string> {
    if (this.hasValidToken()) {
      return this.accessToken!;
    }

    const refreshed = await this.acquireTokenSilentIfPossible();
    if (refreshed) {
      return refreshed;
    }

    if (this.isPending()) {
      // The user may have just finished signing in.
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        this.pendingAuth!.completion,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 2000);
        }),
      ]);
      clearTimeout(timer);
      if (this.hasValidToken()) {
        return this.accessToken!;
      }
      throw new Error(`${this.pendingMessage()} Then try this operation again.`);
    }

    throw new Error(this.notAuthenticatedMessage());
  }

  private authenticatedStatus(prefix: string): AuthStatus {
    const expiresAt = new Date(this.tokenExpirationTime).toISOString();
    return {
      state: 'authenticated',
      account: this.account,
      expiresAt,
      grantedScopes: decodeTokenScopes(this.accessToken!),
      message: `${prefix} Token valid until ${expiresAt}.`,
    };
  }

  /**
   * Current state. Attempts a silent refresh so an expired access token backed by
   * a live refresh token reports as authenticated.
   */
  async getStatus(): Promise<AuthStatus> {
    if (this.hasValidToken()) {
      return this.authenticatedStatus('Signed in.');
    }
    if (this.isPending()) {
      return { state: 'pending', message: this.pendingMessage() };
    }
    if (await this.acquireTokenSilentIfPossible()) {
      return this.authenticatedStatus('Signed in (renewed silently from the cached refresh token).');
    }
    if (this.tokenCache.exists()) {
      return {
        state: 'expired',
        message: `Cached sign-in is no longer usable (refresh token expired or revoked). Call '${this.authToolName}' to sign in again.`,
      };
    }
    return { state: 'not_authenticated', message: this.notAuthenticatedMessage() };
  }

  /**
   * Start a device-code sign-in. Returns as soon as Entra issues the code; the
   * sign-in completes in the background. Returns the existing code when one is
   * already pending, and "authenticated" when no sign-in is needed.
   */
  async startDeviceCode(): Promise<DeviceCodeStart> {
    if (this.hasValidToken() || (await this.acquireTokenSilentIfPossible())) {
      return {
        state: 'authenticated',
        message: `Already signed in. Token valid until ${new Date(this.tokenExpirationTime).toISOString()}.`,
      };
    }

    if (this.isPending()) {
      return {
        state: 'pending',
        userCode: this.pendingAuth!.userCode,
        verificationUri: this.pendingAuth!.verificationUri,
        expiresInSeconds: Math.floor((this.pendingAuth!.expiresAt - Date.now()) / 1000),
        message: `Sign-in already in progress. ${this.pendingMessage()}`,
      };
    }

    return new Promise<DeviceCodeStart>((resolve, reject) => {
      let codeIssued = false;

      const flow = this.msal.acquireTokenByDeviceCode({
        scopes: this.scopes,
        deviceCodeCallback: (response) => {
          codeIssued = true;
          const expiresInSeconds = response.expiresIn || 900;
          this.pendingAuth = {
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            expiresAt: Date.now() + expiresInSeconds * 1000,
            completion,
          };
          console.error(
            `${this.config.serverName}: sign-in required - open ${response.verificationUri} and enter code ${response.userCode}`
          );
          resolve({
            state: 'pending',
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            expiresInSeconds,
            message:
              `Open ${response.verificationUri}, enter code ${response.userCode} and sign in with your Microsoft account. ` +
              `Sign-in completes automatically; the code expires in ${Math.round(expiresInSeconds / 60)} minutes.`,
          });
        },
      });

      const completion: Promise<string | null> = flow.then(
        (result) => {
          this.pendingAuth = null;
          if (result?.accessToken) {
            // The cache plugin has persisted the refresh token by now.
            this.applyResult(result);
            return null;
          }
          return 'No access token received.';
        },
        (error) => {
          this.pendingAuth = null;
          const reason = error instanceof Error ? error.message : String(error);
          if (!codeIssued) {
            reject(new Error(`Could not start sign-in: ${reason}`));
          }
          return reason;
        }
      );
    });
  }

  /**
   * Wait for a pending sign-in to finish (the CLI "auth login" uses this).
   * Returns the pending status if the timeout passes first.
   */
  async waitForCompletion(timeoutMs: number): Promise<AuthStatus> {
    if (this.hasValidToken() || !this.pendingAuth) {
      return this.getStatus();
    }

    let timer: NodeJS.Timeout | undefined;
    const outcome = await Promise.race([
      this.pendingAuth.completion.then((failure) => ({ done: true as const, failure })),
      new Promise<{ done: false }>((resolve) => {
        timer = setTimeout(() => resolve({ done: false }), timeoutMs);
      }),
    ]);
    clearTimeout(timer);

    if (!outcome.done) {
      return {
        state: 'pending',
        message: `Timed out waiting for sign-in. ${this.pendingMessage()}`,
      };
    }
    if (outcome.failure) {
      return { state: 'not_authenticated', message: `Sign-in failed: ${outcome.failure}` };
    }
    return this.authenticatedStatus('Signed in.');
  }

  /**
   * Sign out: remove every account from MSAL's in-memory cache and delete the
   * encrypted file, so a later status check in the same process does not
   * resurrect the account.
   */
  async logout(): Promise<void> {
    this.accessToken = null;
    this.tokenExpirationTime = 0;
    this.account = undefined;
    this.pendingAuth = null;

    const msalCache = this.msal.getTokenCache();
    for (const account of await msalCache.getAllAccounts()) {
      await msalCache.removeAccount(account);
    }
    this.tokenCache.clear();
  }

  /**
   * Graph client whose auth provider fetches the current token on every request,
   * so a long-lived client keeps working across silent refreshes.
   */
  getGraphClient(): Client {
    if (!this.graphClient) {
      this.graphClient = Client.initWithMiddleware({
        authProvider: { getAccessToken: () => this.getAccessToken() },
      });
    }
    return this.graphClient;
  }
}
