/**
 * Search CLI Commands - 2 commands mapping to the search and delta MCP tools
 *
 * CLI parity: search-messages, get-channel-messages-delta.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

/** Commander gives option values as strings; the service wants a number. */
function parseCount(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${flag} must be a number, got "${value}"`);
  }
  return parsed;
}

export function registerSearchCommands(program: Command, ctx: ServiceContext): void {
  // ── search-messages ─────────────────────────────────────────
  program
    .command('search-messages')
    .description('Search Teams messages by keyword across both channels and chats')
    .argument('<query>', 'Keyword or phrase (KQL: quote a phrase, or scope with from:)')
    .option('-n, --top <count>', 'Number of hits to return (default 20, max 50)')
    .option('--from <offset>', 'Zero-based offset into the result set, for paging')
    .action(async (query: string, opts: any) => {
      try {
        const result = await ctx.search.searchMessages(query, {
          top: parseCount(opts.top, '--top'),
          from: parseCount(opts.from, '--from'),
        });
        const total = result.totalMatches && result.totalMatches > result.hits.length
          ? ` of about ${result.totalMatches}`
          : '';
        const summary = result.hits.length === 0
          ? `No messages found matching "${query}".`
          : `Found ${result.hits.length}${total} match(es). Most recent from ${result.hits[0].authorName}.`;
        outputResult(
          { fileName: 'search-messages', data: result, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'search messages'); }
    });

  // ── get-channel-messages-delta ──────────────────────────────
  program
    .command('get-channel-messages-delta')
    .description('Read only the messages created or changed in a channel since a previous call')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-d, --delta-link <url>', 'deltaLink from a previous call (omit for a cold start)')
    .option('--max-pages <count>', 'Pages to walk on a cold start before giving up (default 10)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.messages.getChannelMessagesDelta({
          teamId: opts.teamId,
          channelId: opts.channelId,
          deltaLink: opts.deltaLink,
          maxPages: parseCount(opts.maxPages, '--max-pages'),
        });
        // Say plainly when the walk was cut short - a caller who reads only the
        // summary would otherwise take a partial first pass for a complete one.
        const truncationNote = result.truncated
          ? ` Stopped after ${result.pagesFetched} page(s) without reaching the end of history, so no deltaLink was issued - re-run with a higher --max-pages.`
          : '';
        const summary = `${result.messages.length} new or changed message(s) over ${result.pagesFetched} page(s).${truncationNote}`;
        outputResult(
          { fileName: 'get-channel-messages-delta', data: result, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'read channel delta'); }
    });
}
