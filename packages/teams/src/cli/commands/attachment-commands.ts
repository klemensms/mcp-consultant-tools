/**
 * Attachment CLI Commands - 1 command mapping to the attachment MCP tool
 *
 * CLI parity: download-message-attachments.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerAttachmentCommands(program: Command, ctx: ServiceContext): void {
  // ── download-message-attachments ────────────────────────────
  program
    .command('download-message-attachments')
    .description('Save the images and files attached to a Teams chat or channel message')
    .argument('<messageId>', 'ID of the message')
    .option('--chat-id <id>', 'Chat ID, for a chat message (omit for a channel message)')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-r, --reply-id <id>', 'A reply inside the channel thread, instead of the parent message')
    .option('-o, --output-dir <path>', 'Folder to save into (default: a per-message folder under the system temp directory)')
    .action(async (messageId: string, opts: any) => {
      try {
        const result = await ctx.attachments.downloadMessageAttachments(messageId, {
          chatId: opts.chatId,
          teamId: opts.teamId,
          channelId: opts.channelId,
          replyId: opts.replyId,
          outputDir: opts.outputDir,
        });
        const saved = result.downloaded.length > 0
          ? `Saved ${result.downloaded.length} item(s) to ${result.outputDir}:\n` +
            result.downloaded.map((d) => `  ${d.path}`).join('\n')
          : `Nothing downloaded from message ${messageId}.`;
        // A failure is the thing a reader acts on, so its reason goes in the summary.
        const failed = result.failed.length > 0
          ? `\n${result.failed.length} failed:\n` +
            result.failed.map((f) => `  ${f.name ? `${f.name}: ` : ''}${f.reason}`).join('\n')
          : '';
        const summary = saved + failed;
        outputResult(
          // The saved files are the output; a cached JSON copy of their paths adds nothing.
          { fileName: 'download-message-attachments', data: result, summary, persist: false },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'download message attachments'); }
    });
}
