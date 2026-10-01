/**
 * Teams Authentication Tools
 *
 * Handles authentication for device-code flow.
 * - authenticate: Start sign-in flow, returns URL and code
 * - auth-status: Check current authentication status
 * - logout: Clear stored authentication
 */

import { z } from "zod";
import type { ServiceContext } from "../types.js";

/**
 * Register the authenticate tool
 */
export function registerAuthenticateTool(
  server: any,
  ctx: ServiceContext
): void {
  server.tool(
    "authenticate",
    "Authenticate to Microsoft Teams. For device-code mode (default), returns a URL and code - open the URL in your browser and enter the code to sign in. Required before using other Teams tools when using personal credentials. For client-credentials mode, validates the app credentials.",
    {
      // No parameters needed
    },
    // Initiates sign-in against Microsoft Graph/Entra and establishes a token (additive, destroys no data).
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async () => {
      try {
        const result = await ctx.teams.startAuthentication();

        if (result.status === "authenticated") {
          return {
            content: [
              {
                type: "text",
                text: `✅ **Already Authenticated**\n\n${result.message}`,
              },
            ],
          };
        }

        if (result.status === "pending") {
          // Return clear instructions for the user
          return {
            content: [
              {
                type: "text",
                text:
                  `🔐 **Teams Authentication Required**\n\n` +
                  `Please complete sign-in:\n\n` +
                  `1. **Open this URL:** ${result.verificationUri}\n` +
                  `2. **Enter this code:** \`${result.userCode}\`\n` +
                  `3. **Sign in** with your Microsoft account\n\n` +
                  `⏱️ This code expires in ${Math.floor(result.expiresInSeconds / 60)} minutes.\n\n` +
                  `Once you've signed in, you can use the other Teams tools (send-channel-message, send-adaptive-card, etc.).\n\n` +
                  `_The authentication will complete automatically in the background once you sign in._`,
              },
            ],
          };
        }

        // Failed or other status
        return {
          content: [
            {
              type: "text",
              text: `❌ **Authentication Failed**\n\n${result.message}`,
            },
          ],
          isError: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Authentication Error**\n\n${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Register the auth-status tool
 */
export function registerAuthStatusTool(
  server: any,
  ctx: ServiceContext
): void {
  server.tool(
    "auth-status",
    "Check the current Teams authentication status: whether you are authenticated and the auth mode. A device-code sign-in renews itself automatically; the access-token time shown is not when the sign-in ends, and needs no action.",
    {
      // No parameters needed
    },
    // Reads local cached auth state only; no external calls.
    { readOnlyHint: true },
    async () => {
      try {
        const status = await ctx.teams.getAuthStatus();

        const emoji =
          status.status === "authenticated"
            ? "✅"
            : status.status === "pending"
              ? "⏳"
              : status.status === "expired"
                ? "⚠️"
                : "❌";

        return {
          content: [
            {
              type: "text",
              text:
                `${emoji} **Authentication Status: ${status.status}**\n\n` +
                `**Mode:** ${status.authMode}\n` +
                (status.renewsAutomatically ? `**Sign-in:** renews automatically, no action needed\n` : "") +
                `\n${status.message}`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error checking status**\n\n${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Register the logout tool
 */
export function registerLogoutTool(
  server: any,
  ctx: ServiceContext
): void {
  server.tool(
    "logout",
    "Sign out of Teams completely: deletes the cached refresh token, so the next use needs a new device-code sign-in. " +
      "Never use it to refresh or extend a sign-in; renewal is automatic. Needs confirm: true.",
    {
      confirm: z.boolean().optional().describe("Must be true to sign out"),
    },
    // Deletes the cached refresh token: only a fresh device-code sign-in undoes it.
    { readOnlyHint: false, destructiveHint: true },
    async ({ confirm }: any = {}) => {
      if (confirm !== true) {
        return {
          content: [{
            type: "text",
            text:
              "Not logged out: logout needs confirm: true. You do not need to log out to renew the sign-in; it renews itself automatically. " +
              "Log out only to switch accounts or remove the cached sign-in.",
          }],
          isError: true,
        };
      }
      try {
        await ctx.teams.logout();

        return {
          content: [
            {
              type: "text",
              text: "✅ **Logged out**\n\nTeams authentication has been cleared. Use the 'authenticate' tool to sign in again.",
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error logging out**\n\n${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
