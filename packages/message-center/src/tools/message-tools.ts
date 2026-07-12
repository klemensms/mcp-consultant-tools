import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SERVICE_MESSAGE_READ, CLIENT_SIDE_FILTER_NOTE } from './tool-helpers.js';
import type { ListMessagesOptions } from '../models/message-center-types.js';

export function registerMessageTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'm365-list-messages',
    `Microsoft 365 Message Center posts: planned changes, required actions, and stay-informed announcements. ` +
      `Use isMajorChange and actionRequiredByDateTime (on each message) to find changes that need attention. ` +
      `${CLIENT_SIDE_FILTER_NOTE} ${SERVICE_MESSAGE_READ}`,
    {
      category: z
        .enum(['preventOrFixIssue', 'planForChange', 'stayInformed'])
        .optional()
        .describe(
          'preventOrFixIssue = act to prevent/fix an issue; planForChange = an upcoming change to plan for; stayInformed = informational. Compared case-insensitively.'
        ),
      severity: z
        .enum(['normal', 'high', 'critical'])
        .optional()
        .describe('Message severity. Compared case-insensitively.'),
      service: z
        .string()
        .optional()
        .describe('Case-insensitive substring match on any of the message\'s affected service names, e.g. "Teams".'),
      isMajorChange: z
        .boolean()
        .optional()
        .describe('true = only messages flagged as a major change; false = only non-major. Omit for both.'),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum messages to return, newest first. Omit for all.'),
    },
    READ_ONLY,
    async (args: {
      category?: ListMessagesOptions['category'];
      severity?: ListMessagesOptions['severity'];
      service?: string;
      isMajorChange?: boolean;
      maxResults?: number;
    }) => runTool('listing messages', () => ctx.messages.listMessages(args))
  );

  server.tool(
    'm365-get-message',
    `Full detail for one Message Center message by ID, including its body, affected services, tags, and any action-required date. ` +
      `${SERVICE_MESSAGE_READ}`,
    {
      messageId: z
        .string()
        .describe('The Message Center message ID, e.g. "MC172851". Letters and digits only.'),
    },
    READ_ONLY,
    async ({ messageId }: { messageId: string }) =>
      runTool('getting message', () => ctx.messages.getMessage(messageId))
  );
}
