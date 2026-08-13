/**
 * Search and delta tools
 *
 * - search-messages:            keyword search across channels AND chats at once
 * - get-channel-messages-delta: only what changed in a channel since last time
 *
 * These answer the two questions the plain reads cannot: "where was X mentioned"
 * without knowing which channel to look in, and "what have I missed" without
 * re-reading everything.
 */

import { z } from "zod";
import type { ServiceContext, ChannelDeltaResult, MessageSearchResult } from "../types.js";
import {
  descWithExamples,
  SEARCH_QUERY_EXAMPLES,
  DELTA_LINK_EXAMPLES,
} from "../tool-examples.js";
import { formatDelta, formatSearchResults } from "./format-messages.js";

export const searchMessagesSchema = {
  query: z
    .string()
    .describe(
      descWithExamples(
        "Keyword or phrase to search for. Supports KQL: quote a phrase for an exact match, or scope with from:.",
        SEARCH_QUERY_EXAMPLES
      )
    ),
  top: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of hits to return. Defaults to 20, maximum 50."),
  from: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based offset into the result set, for paging past the first page."),
};

export const getChannelMessagesDeltaSchema = {
  teamId: z.string().optional().describe("Team ID. Uses TEAMS_DEFAULT_TEAM_ID if not set."),
  channelId: z
    .string()
    .optional()
    .describe("Channel ID. Uses TEAMS_DEFAULT_CHANNEL_ID if not set."),
  deltaLink: z
    .string()
    .optional()
    .describe(
      descWithExamples(
        "The deltaLink returned by a previous call. Omit for a cold start, which walks the channel's history to establish one.",
        DELTA_LINK_EXAMPLES
      )
    ),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Pages to walk before giving up on a cold start. Defaults to 10. A truncated walk returns no deltaLink."
    ),
};

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function registerSearchMessagesTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "search-messages",
    "Search Microsoft Teams messages by keyword across both channels and chats in one call. Use this to find where something was discussed without knowing which team, channel or chat to look in. Each hit shows the author, timestamp, matching text, message ID, and the team/channel or chat IDs needed to read the surrounding thread.",
    searchMessagesSchema,
    { readOnlyHint: true, openWorldHint: true },
    async (args: { query: string; top?: number; from?: number }) => {
      try {
        const result: MessageSearchResult = await ctx.search.searchMessages(args.query, {
          top: args.top,
          from: args.from,
        });
        return {
          content: [{ type: "text", text: formatSearchResults(result, args.query) }],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to search messages: ${error.message}`);
      }
    }
  );
}

export function registerGetChannelMessagesDeltaTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-channel-messages-delta",
    "Read only the messages created or changed in a Teams channel since a previous call, using a deltaLink. Use this to catch up on a channel without re-reading it. The first call has no deltaLink and must walk the channel's history to establish one, which is expensive on a busy channel - get-channel-messages is cheaper for a one-off skim.",
    getChannelMessagesDeltaSchema,
    { readOnlyHint: true, openWorldHint: true },
    async (args: {
      teamId?: string;
      channelId?: string;
      deltaLink?: string;
      maxPages?: number;
    }) => {
      try {
        const result: ChannelDeltaResult = await ctx.messages.getChannelMessagesDelta(args);
        return { content: [{ type: "text", text: formatDelta(result) }] };
      } catch (error: any) {
        return errorResult(`❌ Failed to read channel delta: ${error.message}`);
      }
    }
  );
}
