/**
 * Azure B2C prompt templates
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatUserWithGroups,
  formatTenantSummary,
} from '../utils/formatters.js';

export function registerB2CPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "b2c-user-overview",
    "Get a comprehensive overview of a user including profile details and group memberships",
    {
      userId: z.string().describe("User ID or email address"),
    },
    async ({ userId }: { userId: string }) => {
      try {
        const [user, groups] = await Promise.all([
          ctx.users.getUser(userId),
          ctx.groups.getUserGroups(userId),
        ]);

        const output = formatUserWithGroups(user, groups);

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: output,
              },
            },
          ],
        };
      } catch (error: any) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Error getting user overview: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "b2c-tenant-summary",
    "Get a summary of the Azure AD B2C tenant including user and group statistics",
    {},
    async () => {
      try {
        const summary = await ctx.groups.getTenantSummary();
        const output = formatTenantSummary(summary);

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: output,
              },
            },
          ],
        };
      } catch (error: any) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Error getting tenant summary: ${error.message}`,
              },
            },
          ],
        };
      }
    }
  );

  console.error("azure-b2c prompts registered: 2 prompts");
}
