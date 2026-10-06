/**
 * Email tracking tool for powerplatform-data (1 tool).
 * Requires POWERPLATFORM_ENABLE_CREATE=true.
 *
 * The agent reads the email with the Outlook server (mail-get-message, and
 * mail-download-attachment for files) and passes its fields here. No Outlook
 * permission is needed by this server.
 */
import { z } from 'zod';
import { auditEmit } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../types.js';
import { descWithExamples } from '../tool-examples.js';

const REGARDING_EXAMPLES = [
  { label: 'Opportunity', value: '{"entityLogicalName":"opportunity","recordId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}' },
  { label: 'Custom table', value: '{"entityLogicalName":"new_project","recordId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}' },
];

const ATTACHMENT_EXAMPLES = [
  { label: 'Saved by mail-download-attachment', value: '[{"path":"~/Downloads/quote.pdf"}]' },
];

export function registerEmailTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'track-email',
    'Track an Outlook email in Dynamics 365 as a completed email activity, optionally regarding a record. ' +
      'Read the email first with the Outlook server\'s mail-get-message and pass its fields. ' +
      'Keyed on the internet message id: if the email is already tracked, it is reused and only Regarding is set. ' +
      'Sender and recipients are matched to users, contacts, accounts and leads by email address; unmatched addresses are kept as plain addresses. ' +
      'Attachments are only added when you pass local file paths. Requires POWERPLATFORM_ENABLE_CREATE=true.',
    {
      internetMessageId: z
        .string()
        .describe('The internet message id from mail-get-message (internetMessageId), e.g. <abc123@example.com>'),
      subject: z.string().optional().describe('Email subject'),
      body: z.string().optional().describe('Email body; HTML is kept as HTML'),
      from: z.string().describe('Sender email address'),
      to: z.array(z.string()).optional().describe('To addresses'),
      cc: z.array(z.string()).optional().describe('Cc addresses'),
      bcc: z.array(z.string()).optional().describe('Bcc addresses'),
      sentOn: z.string().optional().describe('When the email was sent, ISO 8601 (sentDateTime from mail-get-message)'),
      direction: z
        .enum(['outgoing', 'incoming'])
        .optional()
        .describe('Defaults to outgoing when the sender is the signed-in Dynamics user, otherwise incoming'),
      regarding: z
        .object({
          entityLogicalName: z.string().describe('Logical name of any table enabled for activities'),
          recordId: z.string().describe('GUID of the record'),
        })
        .optional()
        .describe(descWithExamples('The record the email is regarding', REGARDING_EXAMPLES)),
      attachments: z
        .array(
          z.object({
            path: z.string().describe('Local file path inside the home folder'),
            mimeType: z.string().optional().describe('MIME type; inferred from the extension when omitted'),
          })
        )
        .optional()
        .describe(descWithExamples('Files to attach. Omit to track the text only', ATTACHMENT_EXAMPLES)),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (input: any) => {
      try {
        ctx.checkCreateEnabled();
        const service = ctx.pp;
        const audit = ctx.audit;
        const operation = async () => service.trackEmail(input);

        let params: unknown = input;
        let inputRedaction = null;
        const pii = service.piiPipeline;
        if (audit && pii?.isEnabled) {
          const redacted = pii.redactResponse('email', input);
          params = redacted.data;
          inputRedaction = redacted.report;
        }

        const result = audit
          ? await auditEmit(audit, {
              tool: 'track-email',
              params,
              payloadInput: params,
              inputRedaction,
              resultExtractor: () => ({ recordCount: 1, outputRedaction: null }),
            }, operation)
          : await operation();

        const lines = [
          result.created
            ? `✅ Email tracked in Dynamics as a ${result.direction} email`
            : '✅ Email was already tracked; reused the existing activity',
          '',
          `**Email activity ID:** ${result.activityId}`,
        ];
        if (result.regarding) {
          lines.push(`**Regarding:** ${result.regarding.entityLogicalName} ${result.regarding.recordId}`);
        }
        if (result.previousRegarding) {
          const p = result.previousRegarding;
          lines.push(`**Previous Regarding:** ${p.entityLogicalName} ${p.recordId}${p.name ? ` (${p.name})` : ''}`);
        }
        if (result.unresolved.length > 0) {
          lines.push(`**Not matched to a Dynamics record:** ${result.unresolved.join(', ')}`);
        }
        if (result.attachments.length > 0) {
          lines.push(`**Attachments:** ${result.attachments.join(', ')}`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (error: any) {
        console.error('Error tracking email:', error);
        return {
          content: [{ type: 'text', text: `❌ Failed to track email: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
