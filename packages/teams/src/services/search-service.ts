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
const DEFAULT_TOP = 20;

/** Upper bound, to keep one search from exhausting a context window. */
const MAX_TOP = 50;

/** Per-hit body budget. Search hits are for locating a message, not reading it whole. */
const MAX_HIT_CHARS = 600;

/**
 * Teams walked when placing a channel hit whose team id Graph got wrong.
 *
 * ceiling: a hit in a channel of the 21st team keeps no team id at all. Raise it,
 * or index channels once per process, if anyone is actually in that many teams.
 */
const MAX_TEAM_SCAN = 20;

export class SearchService {
  constructor(private teams: TeamsService) {}

  /**
   * Search Teams messages by keyword.
   *
   * `from` is a zero-based offset into the result set, for paging past the first
   * page without widening `top`.
   */
  async searchMessages(
    query: string,
    options: { top?: number; from?: number } = {}
  ): Promise<MessageSearchResult> {
    const client = await this.teams.getGraphClient();
    const queryString = query.trim();

    if (!queryString) {
      throw new Error("Search query is empty. Provide a keyword or phrase to search for.");
    }

    const size = clampTop(options.top);
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
      const hits: MessageSearchHit[] = (container?.hits ?? []).map(toSearchHit);

      await this.confirmChannelTeams(hits);

      return {
        hits,
        totalMatches: container?.total ?? undefined,
        moreResultsAvailable: Boolean(container?.moreResultsAvailable),
      };
    } catch (error) {
      throw wrapGraphError(error, `search messages for "${queryString}"`);
    }
  }

  /**
   * Confirm - and where necessary repair - the team id on each channel hit.
   *
   * `channelIdentity.teamId` is not always the group id the read endpoints want. A
   * hit from a private channel carries that channel's own backing group instead, and
   * `GET /teams/{that}` answers "Group ID ... is not found". Relayed untouched the
   * field is a trap: it looks like a team id, so every follow-up read built from it
   * fails with an error that reads like a permission or deletion problem rather than
   * a wrong argument.
   *
   * One `/me/joinedTeams` call settles the ordinary case. Only a hit whose team is
   * not among them costs a channel walk, and that walk stops as soon as every
   * unplaced channel has been found. A hit that cannot be placed loses the field
   * rather than keeping a value that does not work - the point of returning ids at
   * all is that a follow-up read can use them.
   */
  private async confirmChannelTeams(hits: MessageSearchHit[]): Promise<void> {
    const channelHits = hits.filter((hit) => hit.channelId);
    if (channelHits.length === 0) {
      return;
    }

    try {
      const teams = await this.teams.listTeams();
      const joined = new Set(teams.map((team) => team.id));
      const unplaced = channelHits.filter((hit) => !hit.teamId || !joined.has(hit.teamId));

      // Cleared up front: whatever the walk cannot place must not be handed back.
      for (const hit of unplaced) {
        hit.teamId = undefined;
      }

      if (unplaced.length === 0) {
        return;
      }

      const wanted = new Set(unplaced.map((hit) => hit.channelId as string));
      const teamByChannel = new Map<string, string>();

      for (const team of teams.slice(0, MAX_TEAM_SCAN)) {
        if (wanted.size === 0) {
          break;
        }
        for (const channel of await this.teams.listChannels(team.id)) {
          if (wanted.delete(channel.id)) {
            teamByChannel.set(channel.id, team.id);
          }
        }
      }

      for (const hit of unplaced) {
        hit.teamId = teamByChannel.get(hit.channelId as string);
      }
    } catch {
      // A directory read that fails is no reason to fail the search - the hits are
      // still worth having. It is a reason not to hand back an unconfirmed id, so
      // every channel hit loses one, including any this pass had already confirmed.
      for (const hit of channelHits) {
        hit.teamId = undefined;
      }
    }
  }
}

/** Clamp a caller-supplied result count. */
function clampTop(top?: number): number {
  if (!top || top < 1) {
    return DEFAULT_TOP;
  }
  return Math.min(Math.floor(top), MAX_TOP);
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
    // A search hit names its deep link `webLink`, NOT the `webUrl` every other
    // message endpoint in Graph uses. Reading the wrong one is silent - the property
    // is simply absent, so every hit came back linkless and nothing said why.
    // `webUrl` is kept as a fallback in case the shape is ever aligned.
    webUrl: resource.webLink ?? resource.webUrl ?? undefined,
  };
}

/**
 * Graph wraps matched terms in the summary with literal <c0>...</c0> markers.
 * They are hit-highlighting markup, not content, and read as noise in plain text.
 */
function stripHitMarkers(summary: string): string {
  return summary.replace(/<\/?c\d+>/g, "");
}
