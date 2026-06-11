/**
 * list-channels tool
 *
 * Lists channels in a Teams team for discovery.
 */

import { z } from "zod";
import type { ServiceContext } from "../types.js";

// Input schema for list-channels
export const listChannelsSchema = {
  teamId: z
    .string()
    .describe("Team ID to list channels for. Use list-teams first if you don't know the ID."),
};

// Input schema for list-teams
export const listTeamsSchema = {};

/**
 * Register the list-channels tool
 */
export function registerListChannelsTool(
  server: any,
  ctx: ServiceContext
): void {
  server.tool(
    "list-channels",
    "List all channels in a Microsoft Teams team. Use this to find channel IDs for sending messages.",
    listChannelsSchema,
    async ({ teamId }: { teamId: string }) => {
      try {
        const service = ctx.teams;
        const channels = await service.listChannels(teamId);

        if (channels.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No channels found in team ${teamId}.`,
              },
            ],
          };
        }

        let output = `## Channels in Team\n\n`;
        output += `| Name | ID | Type |\n`;
        output += `|------|-------|------|\n`;

        for (const channel of channels) {
          const channelType = channel.membershipType || "standard";
          output += `| ${channel.displayName} | \`${channel.id}\` | ${channelType} |\n`;
        }

        output += `\n**Total:** ${channels.length} channel(s)`;

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to list channels: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Register the list-teams tool
 */
export function registerListTeamsTool(
  server: any,
  ctx: ServiceContext
): void {
  server.tool(
    "list-teams",
    "List Microsoft Teams that the app has access to. Use this to find team IDs.",
    listTeamsSchema,
    async () => {
      try {
        const service = ctx.teams;
        const teams = await service.listTeams();

        if (teams.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No teams found. Ensure the app has Group.Read.All permission and admin consent.`,
              },
            ],
          };
        }

        let output = `## Available Teams\n\n`;
        output += `| Name | ID | Description |\n`;
        output += `|------|-------|-------------|\n`;

        for (const team of teams) {
          const description = team.description
            ? team.description.substring(0, 50) + (team.description.length > 50 ? "..." : "")
            : "-";
          output += `| ${team.displayName} | \`${team.id}\` | ${description} |\n`;
        }

        output += `\n**Total:** ${teams.length} team(s)`;

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to list teams: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
