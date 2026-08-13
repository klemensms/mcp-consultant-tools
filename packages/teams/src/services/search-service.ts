/**
 * Search Service - keyword search across Teams messages
 *
 * POST /search/query with entityTypes: ["chatMessage"] spans channel messages AND
 * chat messages in one call, so this is usually the cheapest way to answer "where
 * was X mentioned" without knowing which team, channel or chat to look in.
 *
 * Permission note: the Graph reference lists Chat.Read for this entity type, not
 * Chat.ReadWrite. Graph does not enforce that list literally - live testing against
 * the tenant on 2026-08-12 returned 200 with real hits on the consented scope set,
 * without Chat.Read. Recorded here because the documented table would otherwise
 * suggest a ninth scope is needed, and it is not.
 */

import type { TeamsService } from "./teams-service.js";
import { wrapGraphError } from "./message-service.js";
import { htmlToText, truncateText } from "../message-content.js";
import type { MessageSearchHit, MessageSearchResult } from "../types.js";

/** Hits returned by default. A search this wide is for skimming, not reading. */
const DEFAULT_SIZE = 20;

/** Upper bound, to keep one search from exhausting a context window. */
const MAX_SIZE = 50;

/** Per-hit body budget. Search hits are for locating a message, not reading it whole. */
const MAX_HIT_CHARS = 600;

export class SearchService {
  constructor(private teams: TeamsService) {}

  /**
   * Search Teams messages by keyword.
   *
   * `from` is a zero-based offset into the result set, for paging past the first
   * page without widening `size`.
   */
  async searchMessages(
    query: string,
    options: { size?: number; from?: number } = {}
  ): Promise<MessageSearchResult> {
    const client = await this.teams.getGraphClient();
    const queryString = query.trim();

    if (!queryString) {
      throw new Error("Search query is empty. Provide a keyword or phrase to search for.");
    }

    const size = clampSize(options.size);
    const from = Math.max(0, Math.floor(options.from ?? 0));

    try {
      // chatMessage is not in the v1.0 entityType enum the SDK was generated
      // against; without this header Graph rejects the request rather than
      // treating the value as a forward-compatible member.
      const response: any = await client
        .api("/search/query")
        .header("Prefer", "include-unknown-enum-members")
        .post({
          requests: [
            {
              entityTypes: ["chatMessage"],
              query: { queryString },
              from,
              size,
            },
          ],
        });

      const container = response?.value?.[0]?.hitsContainers?.[0];

      return {
        hits: (container?.hits ?? []).map(toSearchHit),
        totalMatches: container?.total ?? undefined,
        moreResultsAvailable: Boolean(container?.moreResultsAvailable),
      };
    } catch (error) {
      throw wrapGraphError(error, `search messages for "${queryString}"`);
    }
  }
}

/** Clamp a caller-supplied result count. */
function clampSize(size?: number): number {
  if (!size || size < 1) {
    return DEFAULT_SIZE;
  }
  return Math.min(Math.floor(size), MAX_SIZE);
}

/**
 * Map a search hit onto the reader-facing shape.
 *
 * Search hits do NOT use the `from.user.displayName` shape the message endpoints
 * return - the sender arrives as `from.emailAddress.name`/`.address` - so passing
 * one through toMessageInfo would render every hit as an unattributed "Unknown".
 */
function toSearchHit(hit: any): MessageSearchHit {
  const resource = hit?.resource ?? {};
  const emailAddress = resource.from?.emailAddress ?? {};
  const channelIdentity = resource.channelIdentity ?? {};

  const body = resource.body?.content
    ? truncateText(htmlToText(resource.body.content, resource.body.contentType), MAX_HIT_CHARS)
    : undefined;

  return {
    id: resource.id ?? hit?.hitId,
    authorName: emailAddress.name ?? emailAddress.address ?? "Unknown",
    authorAddress: emailAddress.address ?? undefined,
    createdDateTime: resource.createdDateTime ?? undefined,
    // Graph's summary marks the matched terms, which is what makes a hit skimmable.
    summary: hit?.summary ? truncateText(stripHitMarkers(hit.summary), MAX_HIT_CHARS) : undefined,
    text: body,
    teamId: channelIdentity.teamId ?? undefined,
    channelId: channelIdentity.channelId ?? undefined,
    chatId: resource.chatId ?? undefined,
    webUrl: resource.webUrl ?? undefined,
  };
}

/**
 * Graph wraps matched terms in the summary with literal <c0>...</c0> markers.
 * They are hit-highlighting markup, not content, and read as noise in plain text.
 */
function stripHitMarkers(summary: string): string {
  return summary.replace(/<\/?c\d+>/g, "");
}
