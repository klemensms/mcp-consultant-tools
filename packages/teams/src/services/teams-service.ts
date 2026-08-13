/**
 * Teams Service - Microsoft Graph API client for Teams operations
 *
 * Supports two authentication modes:
 * - Client Credentials (app-only) - for automation, requires client secret
 * - Device Code (user auth) - for interactive use, authenticates via browser
 *
 * For device-code mode, use the authenticate() method first, which returns
 * the URL and code for the user to complete authentication.
 */

import {
  ConfidentialClientApplication,
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TokenCache } from "../auth/token-cache.js";
import type {
  TeamsConfig,
  AdaptiveCard,
  TeamInfo,
  ChannelInfo,
  SendMessageResult,
  MessageImportance,
  AuthStatus,
  AuthStatusResponse,
  DeviceCodeResponse,
  AuthResult,
  MeInfo,
} from "../types.js";

const TOKEN_DIR = path.join(os.homedir(), ".mcp-consultant-tools");

/**
 * Pre-v35 device-code builds persisted a bare access token here: five scopes, no
 * refresh token. Reusing it silently produces 403s on every read tool with no
 * visible cause, so it is discarded rather than migrated.
 */
const LEGACY_TOKEN_FILE = path.join(TOKEN_DIR, "teams-auth.json");

/**
 * The delegated scopes consented tenant-wide for this app registration.
 *
 * Do not add a scope that is not consented - an unconsented scope cannot be
 * self-consented in this tenant, so it fails at sign-in rather than degrading.
 *
 * offline_access is what makes silent renewal possible. MSAL strips OIDC scopes
 * (openid/profile/offline_access/email) from cache-matching scope sets, so listing
 * it here does not interfere with acquireTokenSilent lookups.
 *
 * ChannelMessage.Edit is consented but deliberately NOT requested: no published
 * Graph method accepts it. Editing a channel message's content is
 * PATCH /teams/{t}/channels/{c}/messages/{m}, whose delegated permission is
 * ChannelMessage.ReadWrite or Group.ReadWrite.All - neither of which is consented.
 * Requesting it would widen the token without buying a single capability.
 *
 * Widening this array invalidates cached access tokens minted against the old set.
 * That is handled rather than breaking: acquireTokenSilent redeems the cached
 * refresh token for the wider set (consent is tenant-wide, so no prompt), and only
 * falls back to device code if the refresh token itself is dead.
 */
const DEVICE_CODE_SCOPES = [
  "User.Read",
  "User.ReadBasic.All",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Chat.ReadWrite",
  "Chat.Create",
  "Group.Read.All",
  "offline_access",
];

/** Treat a token as expired this long before its real expiry. */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface PendingAuth {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  promise: Promise<AuthResult>;
}

export class TeamsService {
  private config: TeamsConfig;
  private msalConfidentialClient: ConfidentialClientApplication | null = null;
  private msalPublicClient: PublicClientApplication | null = null;
  private graphClient: Client | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private pendingAuth: PendingAuth | null = null;
  private tokenCache: TokenCache | null = null;
  private me: MeInfo | null = null;

  constructor(config: TeamsConfig) {
    this.config = config;

    if (config.authMode === "client-credentials") {
      if (!config.clientSecret) {
        throw new Error("Client secret is required for client-credentials auth mode");
      }
      this.msalConfidentialClient = new ConfidentialClientApplication({
        auth: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
        },
      });
      console.error("Teams service created (client-credentials mode)");
    } else {
      // Device code flow uses PublicClientApplication, with an encrypted on-disk
      // cache so the refresh token survives process restarts.
      this.tokenCache = new TokenCache(config.clientId);
      this.msalPublicClient = new PublicClientApplication({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
        },
        cache: {
          cachePlugin: this.tokenCache.createPlugin(),
        },
      });
      console.error("Teams service created (device-code mode)");

      this.discardLegacyToken();
    }
  }

  /**
   * Remove the pre-v35 plaintext token file if present.
   */
  private discardLegacyToken(): void {
    try {
      if (fs.existsSync(LEGACY_TOKEN_FILE)) {
        fs.unlinkSync(LEGACY_TOKEN_FILE);
        console.error(
          "Discarded pre-v35 Teams token file (narrower scope set, no refresh token) - re-authentication required once"
        );
      }
    } catch (error) {
      console.error("Could not remove legacy Teams token file:", (error as Error).message);
    }
  }

  /**
   * Record a freshly acquired token in memory.
   */
  private applyToken(token: string, expiresOn: Date | null | undefined): void {
    this.accessToken = token;
    const expiresAt = expiresOn ?? new Date(Date.now() + 60 * 60 * 1000);
    this.tokenExpirationTime = expiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Renew the access token from the cached refresh token, without user interaction.
   * Returns null when there is nothing cached, or when the refresh token itself has
   * expired or been revoked and a fresh device-code sign-in is required.
   */
  private async acquireTokenSilentIfPossible(): Promise<string | null> {
    if (!this.msalPublicClient) {
      return null;
    }

    const accounts = await this.msalPublicClient.getTokenCache().getAllAccounts();
    if (accounts.length === 0) {
      return null;
    }

    try {
      const result = await this.msalPublicClient.acquireTokenSilent({
        account: accounts[0],
        scopes: DEVICE_CODE_SCOPES,
      });

      if (!result?.accessToken) {
        return null;
      }

      this.applyToken(result.accessToken, result.expiresOn);
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        console.error("Teams refresh token expired or revoked - device-code sign-in required");
        return null;
      }
      throw error;
    }
  }

  /**
   * Get access token - handles both auth modes
   */
  private async getAccessToken(): Promise<string> {
    const currentTime = Date.now();

    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    if (this.config.authMode === "client-credentials") {
      return this.getTokenClientCredentials();
    } else {
      return this.getTokenDeviceCode();
    }
  }

  /**
   * Get token using client credentials flow
   */
  private async getTokenClientCredentials(): Promise<string> {
    if (!this.msalConfidentialClient) {
      throw new Error("MSAL client not initialized for client-credentials mode");
    }

    try {
      const result = await this.msalConfidentialClient.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
      });

      if (!result || !result.accessToken) {
        throw new Error("Failed to acquire access token from Azure AD");
      }

      this.applyToken(result.accessToken, result.expiresOn);

      console.error("Teams access token acquired (client-credentials)");
      return result.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get Teams access token: ${message}`);
    }
  }

  /**
   * Get token using device code flow.
   * Uses the in-memory token, then a silent refresh from the cached refresh token,
   * then any pending interactive auth. It does NOT start a new auth flow - use
   * startAuthentication() for that.
   */
  private async getTokenDeviceCode(): Promise<string> {
    if (!this.msalPublicClient) {
      throw new Error("MSAL client not initialized for device-code mode");
    }

    // Check if we have a valid token in memory
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return this.accessToken;
    }

    // Renew silently from the cached refresh token
    const refreshed = await this.acquireTokenSilentIfPossible();
    if (refreshed) {
      return refreshed;
    }

    // Check if there's a pending authentication
    if (this.pendingAuth && this.pendingAuth.expiresAt > Date.now()) {
      // Wait briefly for the auth to complete (user might have just finished)
      const result = await Promise.race([
        this.pendingAuth.promise,
        new Promise<AuthResult>((resolve) =>
          setTimeout(() => resolve({ status: "timeout", message: "Still waiting..." }), 2000)
        ),
      ]);

      if (result.status === "authenticated" && this.accessToken) {
        return this.accessToken;
      }

      // Auth still pending - throw helpful error
      throw new Error(
        `Authentication in progress.\n\n` +
        `Please complete sign-in:\n` +
        `1. Open: ${this.pendingAuth.verificationUri}\n` +
        `2. Enter code: ${this.pendingAuth.userCode}\n` +
        `3. Sign in with your Microsoft account\n\n` +
        `Then try this operation again.`
      );
    }

    // No token and no pending auth - need to authenticate
    throw new Error(
      `Not authenticated to Microsoft Teams.\n\n` +
      `Please use the 'authenticate' tool first to sign in.\n\n` +
      `This will provide you with a URL and code to complete authentication in your browser.`
    );
  }

  /**
   * Check if authenticated (device-code mode)
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null && this.tokenExpirationTime > Date.now();
  }

  /**
   * Get current authentication status.
   * Attempts a silent refresh so an expired access token backed by a live refresh
   * token reports as authenticated rather than sending the user to sign in again.
   */
  async getAuthStatus(): Promise<AuthStatusResponse> {
    // Client credentials mode is always ready (auth happens on first call)
    if (this.config.authMode === "client-credentials") {
      return {
        status: "authenticated",
        authMode: "client-credentials",
        message: "Client credentials mode - authentication happens automatically on first API call.",
      };
    }

    // Device-code mode - check various states
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return {
        status: "authenticated",
        authMode: "device-code",
        expiresAt: new Date(this.tokenExpirationTime).toISOString(),
        message: "Authenticated. Token valid until " + new Date(this.tokenExpirationTime).toLocaleString(),
      };
    }

    if (this.pendingAuth && this.pendingAuth.expiresAt > Date.now()) {
      return {
        status: "pending",
        authMode: "device-code",
        message: `Authentication in progress. Go to ${this.pendingAuth.verificationUri} and enter code: ${this.pendingAuth.userCode}`,
      };
    }

    // Renew silently from the cached refresh token
    const refreshed = await this.acquireTokenSilentIfPossible();
    if (refreshed) {
      return {
        status: "authenticated",
        authMode: "device-code",
        expiresAt: new Date(this.tokenExpirationTime).toISOString(),
        message:
          "Authenticated (renewed silently from cached refresh token). Token valid until " +
          new Date(this.tokenExpirationTime).toLocaleString(),
      };
    }

    if (this.tokenCache?.exists()) {
      return {
        status: "expired",
        authMode: "device-code",
        message:
          "Cached credentials are no longer usable (refresh token expired or revoked). Please re-authenticate.",
      };
    }

    return {
      status: "not_authenticated",
      authMode: "device-code",
      message: "Not authenticated. Call the 'authenticate' tool to sign in.",
    };
  }

  /**
   * Start device-code authentication flow
   * Returns immediately with the URL and code for the user
   * Polls in background and resolves when complete
   */
  async startAuthentication(): Promise<DeviceCodeResponse | AuthResult> {
    // Client credentials mode doesn't need explicit authentication
    if (this.config.authMode === "client-credentials") {
      // Try to get a token to verify credentials work
      try {
        await this.getTokenClientCredentials();
        return {
          status: "authenticated",
          message: "Client credentials authentication successful.",
          expiresAt: new Date(this.tokenExpirationTime).toISOString(),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          status: "failed",
          message: `Client credentials authentication failed: ${msg}`,
        };
      }
    }

    // Check if already authenticated
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return {
        status: "authenticated",
        message: "Already authenticated. Token valid until " + new Date(this.tokenExpirationTime).toLocaleString(),
        expiresAt: new Date(this.tokenExpirationTime).toISOString(),
      };
    }

    // Cached refresh token may still be good - avoid an unnecessary device-code prompt
    if (await this.acquireTokenSilentIfPossible()) {
      return {
        status: "authenticated",
        message:
          "Already authenticated (renewed silently from cached refresh token). Token valid until " +
          new Date(this.tokenExpirationTime).toLocaleString(),
        expiresAt: new Date(this.tokenExpirationTime).toISOString(),
      };
    }

    // Check if auth is already pending
    if (this.pendingAuth && this.pendingAuth.expiresAt > Date.now()) {
      return {
        status: "pending",
        userCode: this.pendingAuth.userCode,
        verificationUri: this.pendingAuth.verificationUri,
        message: "Authentication already in progress. Please complete sign-in.",
        expiresInSeconds: Math.floor((this.pendingAuth.expiresAt - Date.now()) / 1000),
      };
    }

    // Start new device code flow
    if (!this.msalPublicClient) {
      throw new Error("MSAL client not initialized for device-code mode");
    }

    return new Promise((resolve) => {
      const authPromise = this.msalPublicClient!.acquireTokenByDeviceCode({
        scopes: DEVICE_CODE_SCOPES,
        deviceCodeCallback: (response) => {
          // Store pending auth state
          this.pendingAuth = {
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            expiresAt: Date.now() + (response.expiresIn || 900) * 1000,
            promise: authPromise.then(
              (result) => {
                if (result && result.accessToken) {
                  // The MSAL cache plugin persists the refresh token to disk here.
                  this.applyToken(result.accessToken, result.expiresOn);
                  this.pendingAuth = null;
                  return {
                    status: "authenticated" as const,
                    message: "Authentication successful!",
                    expiresAt: new Date(this.tokenExpirationTime).toISOString(),
                  };
                }
                this.pendingAuth = null;
                return { status: "failed" as const, message: "No access token received" };
              },
              (error) => {
                this.pendingAuth = null;
                const msg = error instanceof Error ? error.message : String(error);
                if (msg.includes("expired") || msg.includes("timeout")) {
                  return { status: "timeout" as const, message: "Authentication timed out. Please try again." };
                }
                return { status: "failed" as const, message: `Authentication failed: ${msg}` };
              }
            ),
          };

          // Return immediately with the device code info
          console.error("\n" + "=".repeat(60));
          console.error("🔐 TEAMS AUTHENTICATION REQUIRED");
          console.error("=".repeat(60));
          console.error(`\n1. Open: ${response.verificationUri}`);
          console.error(`2. Enter code: ${response.userCode}`);
          console.error("3. Sign in with your Microsoft account");
          console.error("=".repeat(60) + "\n");

          resolve({
            status: "pending",
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            message: `Please authenticate:\n\n1. Open this URL: ${response.verificationUri}\n2. Enter this code: ${response.userCode}\n3. Sign in with your Microsoft account\n\nThe authentication will complete automatically once you sign in.`,
            expiresInSeconds: response.expiresIn || 900,
          });
        },
      });
    });
  }

  /**
   * Wait for pending authentication to complete
   * @param timeoutMs Maximum time to wait (default 5 minutes)
   */
  async waitForAuthentication(timeoutMs: number = 300000): Promise<AuthResult> {
    if (this.config.authMode === "client-credentials") {
      try {
        await this.getTokenClientCredentials();
        return {
          status: "authenticated",
          message: "Client credentials authentication successful.",
          expiresAt: new Date(this.tokenExpirationTime).toISOString(),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { status: "failed", message: `Authentication failed: ${msg}` };
      }
    }

    // Already authenticated
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return {
        status: "authenticated",
        message: "Already authenticated.",
        expiresAt: new Date(this.tokenExpirationTime).toISOString(),
      };
    }

    // No pending auth
    if (!this.pendingAuth) {
      return {
        status: "failed",
        message: "No authentication in progress. Call startAuthentication() first.",
      };
    }

    // Wait for pending auth with timeout
    const timeoutPromise = new Promise<AuthResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: "timeout",
          message: "Timed out waiting for authentication. The authentication may still complete if you sign in.",
        });
      }, timeoutMs);
    });

    return Promise.race([this.pendingAuth.promise, timeoutPromise]);
  }

  /**
   * Require authentication before proceeding
   * Throws a helpful error if not authenticated
   */
  async requireAuth(): Promise<void> {
    const status = await this.getAuthStatus();
    if (status.status === "authenticated") {
      return;
    }
    if (status.status === "pending") {
      throw new Error(
        `Authentication in progress.\n\n` +
        `Please complete sign-in:\n` +
        `1. Open: ${this.pendingAuth?.verificationUri}\n` +
        `2. Enter code: ${this.pendingAuth?.userCode}\n` +
        `3. Sign in with your Microsoft account\n\n` +
        `Then try this operation again.`
      );
    }
    throw new Error(
      `Not authenticated.\n\n` +
      `Please use the 'authenticate' tool first to sign in to Microsoft Teams.\n\n` +
      `Example: Call the 'authenticate' tool, then follow the instructions to sign in.`
    );
  }

  /**
   * Clear stored authentication (device-code mode).
   * Removes the account from MSAL's in-memory cache as well as the encrypted file,
   * so a logout followed by an auth-status check in the same process reports
   * not_authenticated rather than resurrecting the cached account.
   */
  async logout(): Promise<void> {
    this.accessToken = null;
    this.tokenExpirationTime = 0;
    this.pendingAuth = null;
    this.me = null;

    try {
      if (this.msalPublicClient) {
        const msalCache = this.msalPublicClient.getTokenCache();
        for (const account of await msalCache.getAllAccounts()) {
          await msalCache.removeAccount(account);
        }
      }
      this.tokenCache?.clear();
      this.discardLegacyToken();
      console.error("Teams authentication cleared");
    } catch (error) {
      console.error("Could not clear Teams token cache:", (error as Error).message);
    }
  }

  /**
   * Get or create Graph client with current access token.
   * Public so MessageService can share this service's authenticated client.
   */
  async getGraphClient(): Promise<Client> {
    const token = await this.getAccessToken();

    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => token,
      },
    });

    return this.graphClient;
  }

  /**
   * Get the effective team ID (from parameter or default)
   */
  getTeamId(teamId?: string): string {
    const effectiveTeamId = teamId || this.config.defaultTeamId;
    if (!effectiveTeamId) {
      throw new Error(
        "Team ID is required. Either provide teamId parameter or set TEAMS_DEFAULT_TEAM_ID environment variable."
      );
    }
    return effectiveTeamId;
  }

  /**
   * Get the effective channel ID (from parameter or default)
   */
  getChannelId(channelId?: string): string {
    const effectiveChannelId = channelId || this.config.defaultChannelId;
    if (!effectiveChannelId) {
      throw new Error(
        "Channel ID is required. Either provide channelId parameter or set TEAMS_DEFAULT_CHANNEL_ID environment variable."
      );
    }
    return effectiveChannelId;
  }

  /**
   * Get the signed-in user (User.Read). Cached for the process lifetime.
   * markChatReadForUser needs the caller's own AAD id in the request body.
   */
  async getMe(): Promise<MeInfo> {
    if (this.me) {
      return this.me;
    }

    const client = await this.getGraphClient();

    try {
      const response = await client.api("/me").select("id,displayName,userPrincipalName").get();
      this.me = {
        id: response.id,
        displayName: response.displayName,
        userPrincipalName: response.userPrincipalName,
      };
      return this.me;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get signed-in user: ${message}`);
    }
  }

  /**
   * The tenant this service is configured against - needed alongside the user id
   * in teamworkUserIdentity payloads.
   */
  getTenantId(): string {
    return this.config.tenantId;
  }

  /**
   * List teams the user/app has access to
   */
  async listTeams(): Promise<TeamInfo[]> {
    const client = await this.getGraphClient();

    try {
      // For user auth, use /me/joinedTeams; for app auth, use /groups filter
      const isDeviceCode = this.config.authMode === "device-code";
      const endpoint = isDeviceCode
        ? "/me/joinedTeams"
        : "/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')";

      let request = client.api(endpoint).select("id,displayName,description");

      // $top is only valid on the /groups path. /me/joinedTeams rejects it outright
      // with "Query option 'Top' is not allowed", failing every call in device-code
      // mode. No result bound is applied there - what that endpoint does for a user
      // in very many teams is untested.
      if (!isDeviceCode) {
        request = request.top(100);
      }

      const response = await request.get();

      return (response.value || []).map((team: any) => ({
        id: team.id,
        displayName: team.displayName,
        description: team.description,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list teams: ${message}`);
    }
  }

  /**
   * List channels in a team
   */
  async listChannels(teamId?: string): Promise<ChannelInfo[]> {
    const client = await this.getGraphClient();
    const effectiveTeamId = this.getTeamId(teamId);

    try {
      const response = await client
        .api(`/teams/${effectiveTeamId}/channels`)
        .select("id,displayName,description,membershipType")
        .get();

      return (response.value || []).map((channel: any) => ({
        id: channel.id,
        displayName: channel.displayName,
        description: channel.description,
        membershipType: channel.membershipType,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list channels: ${message}`);
    }
  }

  /**
   * Send a text or HTML message to a channel
   */
  async sendChannelMessage(
    content: string,
    options: {
      teamId?: string;
      channelId?: string;
      contentType?: "text" | "html";
      importance?: MessageImportance;
    } = {}
  ): Promise<SendMessageResult> {
    const client = await this.getGraphClient();
    const effectiveTeamId = this.getTeamId(options.teamId);
    const effectiveChannelId = this.getChannelId(options.channelId);

    const messagePayload: any = {
      body: {
        content,
        contentType: options.contentType || "html",
      },
    };

    if (options.importance && options.importance !== "normal") {
      messagePayload.importance = options.importance;
    }

    try {
      const result = await client
        .api(`/teams/${effectiveTeamId}/channels/${effectiveChannelId}/messages`)
        .post(messagePayload);

      return {
        messageId: result.id,
        webUrl: result.webUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send channel message: ${message}`);
    }
  }

  /**
   * Send an Adaptive Card to a channel
   */
  async sendAdaptiveCard(
    card: AdaptiveCard,
    options: {
      teamId?: string;
      channelId?: string;
      importance?: MessageImportance;
    } = {}
  ): Promise<SendMessageResult> {
    const client = await this.getGraphClient();
    const effectiveTeamId = this.getTeamId(options.teamId);
    const effectiveChannelId = this.getChannelId(options.channelId);

    const messagePayload: any = {
      body: {
        contentType: "html",
        content: "",
      },
      attachments: [
        {
          id: "adaptive-card-1",
          contentType: "application/vnd.microsoft.card.adaptive",
          content: JSON.stringify(card),
        },
      ],
    };

    if (options.importance && options.importance !== "normal") {
      messagePayload.importance = options.importance;
    }

    try {
      const result = await client
        .api(`/teams/${effectiveTeamId}/channels/${effectiveChannelId}/messages`)
        .post(messagePayload);

      return {
        messageId: result.id,
        webUrl: result.webUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send adaptive card: ${message}`);
    }
  }
}

export type { TeamsConfig };
