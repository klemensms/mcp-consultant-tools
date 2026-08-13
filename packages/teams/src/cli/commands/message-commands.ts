/**
 * Message CLI Commands - 4 commands mapping to messaging and listing MCP tools
 */

import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import type { AdaptiveCard, ReleaseTemplateData, CardTemplate } from '../../types.js';
import { getCardFromTemplate, AVAILABLE_TEMPLATES } from '../../cards/templates.js';
import { outputResult } from '../output.js';

export function registerMessageCommands(program: Command, ctx: ServiceContext): void {
  // ── list-teams ──────────────────────────────────────────────
  program
    .command('list-teams')
    .description('List Microsoft Teams the app/user has access to')
    .action(async () => {
      try {
        const teams = await ctx.teams.listTeams();
        const summary = teams.length === 0
          ? 'No teams found. Ensure the app has Group.Read.All permission and admin consent.'
          : `Found ${teams.length} team(s): ${teams.map(t => t.displayName).join(', ')}`;
        outputResult(
          { fileName: 'list-teams', data: teams, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list teams'); }
    });

  // ── list-channels ───────────────────────────────────────────
  program
    .command('list-channels')
    .description('List channels in a Microsoft Teams team')
    .argument('<teamId>', 'Team ID to list channels for')
    .action(async (teamId: string) => {
      try {
        const channels = await ctx.teams.listChannels(teamId);
        const summary = channels.length === 0
          ? `No channels found in team ${teamId}.`
          : `Found ${channels.length} channel(s): ${channels.map(c => c.displayName).join(', ')}`;
        outputResult(
          { fileName: `list-channels-${teamId}`, data: channels, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list channels'); }
    });

  // ── send-message ────────────────────────────────────────────
  program
    .command('send-message')
    .description('Send a message to a Microsoft Teams channel')
    .argument('<message>', 'Message content (text or markdown). Use @[Name or email] inline to @-mention someone.')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-f, --format <format>', 'Message format: text or markdown', 'markdown')
    .option('-i, --importance <level>', 'Importance: normal, high, or urgent', 'normal')
    .action(async (message: string, opts: any) => {
      try {
        // Conversion, sanitisation and @-mention resolution all happen in the
        // service, so this command and the MCP tool cannot diverge on any of them.
        const result = await ctx.teams.sendChannelMessage(message, {
          teamId: opts.teamId,
          channelId: opts.channelId,
          format: opts.format,
          importance: opts.importance,
        });

        outputResult(
          { fileName: 'send-message', data: result, summary: `Message sent. ID: ${result.messageId}`, persist: false },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'send message'); }
    });

  // ── send-card ───────────────────────────────────────────────
  const sendCard = program
    .command('send-card')
    .description(`Send an Adaptive Card to a Teams channel. Templates: ${AVAILABLE_TEMPLATES.join(', ')}`)
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-i, --importance <level>', 'Importance: normal, high, or urgent', 'normal')
    .option('--card-file <path>', 'Path to Adaptive Card JSON file (raw card mode)')
    .option('--template <name>', `Template name: ${AVAILABLE_TEMPLATES.join(', ')}`)
    .option('--package-name <name>', 'Package name (for template)')
    .option('--version <ver>', 'Version string (for template)')
    .option('--summary <text>', 'Release summary (for template)')
    .option('--date <date>', 'Release date (for template)')
    .option('--release-type <type>', 'Release type, e.g. "Minor Release" (for template)')
    .option('--changes <text>', 'Markdown list of changes (for template)')
    .option('--release-notes-url <url>', 'URL to release notes (for template)')
    .option('--npm-url <url>', 'URL to npm package (for template, auto-generated if not provided)');

  sendCard.action(async (opts: any) => {
    try {
      let cardToSend: AdaptiveCard;

      if (opts.cardFile) {
        // Raw card from file
        const fileContent = readFileSync(opts.cardFile, 'utf-8');
        cardToSend = JSON.parse(fileContent) as AdaptiveCard;
      } else if (opts.template) {
        // Template mode - validate required fields
        const requiredFields = ['packageName', 'version', 'summary', 'date', 'releaseType', 'changes'];
        const missing = requiredFields.filter(f => !opts[f]);
        if (missing.length > 0) {
          throw new Error(
            `Missing required template fields: ${missing.map(f => '--' + f.replace(/[A-Z]/g, (c: string) => '-' + c.toLowerCase())).join(', ')}\n` +
            `All of --package-name, --version, --summary, --date, --release-type, --changes are required when using --template.`
          );
        }

        const templateData: ReleaseTemplateData = {
          packageName: opts.packageName,
          version: opts.version,
          summary: opts.summary,
          date: opts.date,
          releaseType: opts.releaseType,
          changes: opts.changes,
          releaseNotesUrl: opts.releaseNotesUrl,
          npmUrl: opts.npmUrl,
        };

        cardToSend = getCardFromTemplate(opts.template as CardTemplate, templateData);
      } else {
        throw new Error(
          `Provide either --card-file (raw Adaptive Card JSON) or --template + template data flags.\n` +
          `Available templates: ${AVAILABLE_TEMPLATES.join(', ')}`
        );
      }

      const result = await ctx.teams.sendAdaptiveCard(cardToSend, {
        teamId: opts.teamId,
        channelId: opts.channelId,
        importance: opts.importance,
      });

      const templateInfo = opts.template ? ` (template: ${opts.template})` : '';
      outputResult(
        { fileName: 'send-card', data: result, summary: `Adaptive Card sent${templateInfo}. ID: ${result.messageId}`, persist: false },
        getGlobalFlags(program)
      );
    } catch (error) { handleCliError(error, 'send adaptive card'); }
  });
}
