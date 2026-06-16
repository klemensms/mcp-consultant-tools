/**
 * Azure B2C Group Tools
 *
 * 3 tools: list-groups, get-user-groups, get-group-members
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, USER_ID_EXAMPLES, GROUP_ID_EXAMPLES } from '../tool-examples.js';

export function registerGroupTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "b2c-list-groups",
    "List all groups in the Azure AD B2C tenant.",
    {
      top: z.number().optional().describe("Maximum number of groups to return (default: 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ top }: { top?: number }) => {
      try {
        const groups = await ctx.groups.listGroups(top || 50);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(groups, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing groups: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-get-user-groups",
    "Get all groups that a user is a member of.",
    {
      userId: z.string().describe(
        descWithExamples("User ID (GUID) or email address", USER_ID_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ userId }: { userId: string }) => {
      try {
        const groups = await ctx.groups.getUserGroups(userId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(groups, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting user groups: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "b2c-get-group-members",
    "Get all members of a specific group. Set includeAllFields=true to get all fields including extension_* attributes.",
    {
      groupId: z.string().describe(
        descWithExamples("Group ID (GUID)", GROUP_ID_EXAMPLES)
      ),
      top: z.number().optional().describe("Maximum members to return (default: 50)"),
      includeAllFields: z.boolean().optional().describe("Return all fields including extension_* attributes like CrmContactId, MemberId (default: false)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ groupId, top, includeAllFields }: { groupId: string; top?: number; includeAllFields?: boolean }) => {
      try {
        const members = await ctx.groups.getGroupMembers(groupId, top || 50, includeAllFields || false);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(members, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting group members: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  console.error("azure-b2c group tools registered: 3 tools");
}
