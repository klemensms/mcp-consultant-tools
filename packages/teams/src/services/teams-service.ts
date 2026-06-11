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

import { ConfidentialClientApplication, PublicClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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
} from "../types.js";

// Token storage path for device code flow
const TOKEN_DIR = path.join(os.homedir(), ".mcp-consultant-tools");
const TOKEN_FILE = path.join(TOKEN_DIR, "teams-auth.json");

interface StoredToken {
  accessToken: string;
  expiresAt: string;
  clientId: string;
  authenticatedAt: string;
}

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
      // Device code flow uses PublicClientApplication
      this.msalPublicClient = new PublicClientApplication({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
        },
      });
      console.error("Teams service created (device-code mode)");

      // Try to load existing token
      this.loadStoredToken();
    }
  }

  /**
   * Load stored token from disk (device-code mode)
   */
  private loadStoredToken(): void {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const data = fs.readFileSync(TOKEN_FILE, "utf8");
        const stored: StoredToken = JSON.parse(data);

        // Check if token matches current client and hasn't expired
        if (stored.clientId === this.config.clientId) {
          const expiresAt = new Date(stored.expiresAt).getTime();
          if (expiresAt > Date.now()) {
            this.accessToken = stored.accessToken;
            this.tokenExpirationTime = expiresAt - 5 * 60 * 1000; // 5 min buffer
            console.error("Loaded existing Teams token (expires: " + stored.expiresAt + ")");
          } else {
            console.error("Stored Teams token has expired, will need to re-authenticate");
          }
        }
      }
    } catch (error) {
      console.error("Could not load stored token:", error);
    }
  }

  /**
   * Save token to disk (device-code mode)
   */
  private saveToken(token: string, expiresAt: Date): void {
    try {
      if (!fs.existsSync(TOKEN_DIR)) {
        fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
      }

      const stored: StoredToken = {
        accessToken: token,
        expiresAt: expiresAt.toISOString(),
        clientId: this.config.clientId,
        authenticatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(TOKEN_FILE, JSON.stringify(stored, null, 2), { mode: 0o600 });
      console.error("Teams token saved to " + TOKEN_FILE);
    } catch (error) {
      console.error("Could not save token:", error);
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

      this.accessToken = result.accessToken;
      this.tokenExpirationTime = result.expiresOn
        ? result.expiresOn.getTime() - 5 * 60 * 1000
        : Date.now() + 55 * 60 * 1000;

      console.error("Teams access token acquired (client-credentials)");
      return this.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get Teams access token: ${message}`);
    }
  }

  /**
   * Get token using device code flow
   * This method checks for existing/cached tokens or waits for pending auth.
   * It does NOT start a new auth flow - use startAuthentication() for that.
   */
  private async getTokenDeviceCode(): Promise<string> {
    if (!this.msalPublicClient) {
      throw new Error("MSAL client not initialized for device-code mode");
    }

    // Check if we have a valid token in memory
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return this.accessToken;
    }

    // Try to load stored token
    this.loadStoredToken();
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return this.accessToken;
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
   * Get current authentication status
   */
  getAuthStatus(): AuthStatusResponse {
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

    // Check for stored token
    if (fs.existsSync(TOKEN_FILE)) {
      try {
        const data = fs.readFileSync(TOKEN_FILE, "utf8");
        const stored: StoredToken = JSON.parse(data);
        if (stored.clientId === this.config.clientId) {
          const expiresAt = new Date(stored.expiresAt).getTime();
          if (expiresAt > Date.now()) {
            // Load the token
            this.accessToken = stored.accessToken;
            this.tokenExpirationTime = expiresAt - 5 * 60 * 1000;
            return {
              status: "authenticated",
              authMode: "device-code",
              expiresAt: stored.expiresAt,
              message: "Authenticated (from cached token). Valid until " + new Date(expiresAt).toLocaleString(),
            };
          }
          return {
            status: "expired",
            authMode: "device-code",
            message: "Token has expired. Please re-authenticate.",
          };
        }
      } catch {
        // Ignore errors reading stored token
      }
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

    const scopes = [
      "User.Read",
      "Team.ReadBasic.All",
      "Channel.ReadBasic.All",
      "ChannelMessage.Send",
      "Group.Read.All",
    ];

    return new Promise((resolve) => {
      let deviceCodeInfo: { userCode: string; verificationUri: string; expiresIn: number } | null = null;

      const authPromise = this.msalPublicClient!.acquireTokenByDeviceCode({
        scopes,
        deviceCodeCallback: (response) => {
          deviceCodeInfo = {
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            expiresIn: response.expiresIn || 900, // Default 15 minutes
          };

          // Store pending auth state
          this.pendingAuth = {
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            expiresAt: Date.now() + (response.expiresIn || 900) * 1000,
            promise: authPromise.then(
              (result) => {
                if (result && result.accessToken) {
                  this.accessToken = result.accessToken;
                  const expiresAt = result.expiresOn || new Date(Date.now() + 60 * 60 * 1000);
                  this.tokenExpirationTime = expiresAt.getTime() - 5 * 60 * 1000;
                  this.saveToken(result.accessToken, expiresAt);
                  this.pendingAuth = null;
                  return {
                    status: "authenticated" as const,
                    message: "Authentication successful!",
                    expiresAt: expiresAt.toISOString(),
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
  requireAuth(): void {
    const status = this.getAuthStatus();
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
   * Clear stored authentication (device-code mode)
   */
  logout(): void {
    this.accessToken = null;
    this.tokenExpirationTime = 0;
    this.pendingAuth = null;

    try {
      if (fs.existsSync(TOKEN_FILE)) {
        fs.unlinkSync(TOKEN_FILE);
        console.error("Teams authentication cleared");
      }
    } catch (error) {
      console.error("Could not clear token file:", error);
    }
  }

  /**
   * Get or create Graph client with current access token
   */
  private async getGraphClient(): Promise<Client> {
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
  private getTeamId(teamId?: string): string {
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
  private getChannelId(channelId?: string): string {
    const effectiveChannelId = channelId || this.config.defaultChannelId;
    if (!effectiveChannelId) {
      throw new Error(
        "Channel ID is required. Either provide channelId parameter or set TEAMS_DEFAULT_CHANNEL_ID environment variable."
      );
    }
    return effectiveChannelId;
  }

  /**
   * List teams the user/app has access to
   */
  async listTeams(): Promise<TeamInfo[]> {
    const client = await this.getGraphClient();

    try {
      // For user auth, use /me/joinedTeams; for app auth, use /groups filter
      const endpoint = this.config.authMode === "device-code"
        ? "/me/joinedTeams"
        : "/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')";

      const response = await client
        .api(endpoint)
        .select("id,displayName,description")
        .top(100)
        .get();

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
