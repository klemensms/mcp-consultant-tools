/**
 * Sending mail as the signed-in user (OUTLOOK_ENABLE_SEND). Independent of the
 * write switch: turning on drafts does not turn on sending, and the reverse.
 */
import type { Client } from '@microsoft/microsoft-graph-client';
import { requireEnabled } from '@mcp-consultant-tools/m365-core';
import { permissionHint } from '../permissions.js';
import { toGraphMessage } from './compose.js';
import type { ComposeInput } from './compose.js';
import type { GraphClientProvider } from './mail-read-service.js';

const SEND = 'OUTLOOK_ENABLE_SEND';

export class MailSendService {
  constructor(private readonly auth: GraphClientProvider) {}

  private get graph(): Client {
    return this.auth.getGraphClient();
  }

  async sendDraft(draftId: string): Promise<void> {
    requireEnabled(SEND, 'Mail send');
    try {
      await this.graph.api(`/me/messages/${encodeURIComponent(draftId)}/send`).post({});
    } catch (error) {
      throw permissionHint(error, 'send');
    }
  }

  /** Compose and send in one call; the message is saved to Sent Items. */
  async sendMail(input: ComposeInput): Promise<void> {
    requireEnabled(SEND, 'Mail send');
    if (!input.to?.length) {
      throw new Error('Sending needs at least one recipient in to.');
    }
    const message = toGraphMessage(input);
    try {
      await this.graph.api('/me/sendMail').post({ message, saveToSentItems: true });
    } catch (error) {
      throw permissionHint(error, 'send');
    }
  }
}
