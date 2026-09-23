/**
 * Changing the mailbox without sending anything: drafts, draft attachments,
 * mark read, move, flag (OUTLOOK_ENABLE_WRITE), and delete to Deleted Items
 * (OUTLOOK_ENABLE_DELETE). The switch is checked here, not in the tool layer,
 * so the CLI is held to it as well.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Client } from '@microsoft/microsoft-graph-client';
import { requireEnabled } from '@mcp-consultant-tools/m365-core';
import { permissionHint } from '../permissions.js';
import { assertSafeLocalFile } from '../local-file-guard.js';
import { prependToBody, toGraphMessage, toHtml, toRecipients } from './compose.js';
import type { BodyFormat, ComposeInput } from './compose.js';
import type { GraphClientProvider } from './mail-read-service.js';

const WRITE = 'OUTLOOK_ENABLE_WRITE';
const DELETE = 'OUTLOOK_ENABLE_DELETE';

/** Graph takes a file attachment inline up to 3 MB; above that it needs an upload session. */
const INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
/** Upload-session chunks must be multiples of 320 KiB. */
const UPLOAD_CHUNK_BYTES = 10 * 320 * 1024;

export interface MailWriteOptions {
  /** OUTLOOK_MAX_ATTACHMENT_MB, default 25. */
  maxAttachmentMB: number;
  /** Home folder for the local-file guard; tests pass a temp folder. */
  homeDir?: string;
  /** fetch used for upload-session chunks, which go to a pre-authorised URL outside Graph. */
  fetch?: typeof fetch;
}

export interface DraftRef {
  id: string;
  webLink: string;
}

const messagePath = (id: string) => `/me/messages/${encodeURIComponent(id)}`;

export class MailWriteService {
  constructor(
    private readonly auth: GraphClientProvider,
    private readonly options: MailWriteOptions
  ) {}

  private get graph(): Client {
    return this.auth.getGraphClient();
  }

  private requireWrite(): void {
    requireEnabled(WRITE, 'Mail write (drafts, mark read, move, flag)');
  }

  private async call<T>(group: 'write' | 'delete', run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw permissionHint(error, group);
    }
  }

  async createDraft(input: ComposeInput): Promise<DraftRef> {
    this.requireWrite();
    const message = toGraphMessage(input);
    const draft = await this.call('write', () => this.graph.api('/me/messages').post(message));
    return { id: draft.id, webLink: draft.webLink };
  }

  /**
   * Graph's createReply builds the quoted thread into the draft body. Posting a
   * comment with it would put plain text only, so the draft is created empty,
   * read back, and the new HTML written above the quoted thread.
   */
  async createReplyDraft(input: { messageId: string; replyAll?: boolean; body: string; format?: BodyFormat }): Promise<DraftRef> {
    this.requireWrite();
    const action = input.replyAll ? 'createReplyAll' : 'createReply';
    const html = toHtml(input.body, input.format);
    return this.call('write', async () => {
      const draft = await this.graph.api(`${messagePath(input.messageId)}/${action}`).post({});
      await this.writeAboveQuote(draft.id, html);
      return { id: draft.id, webLink: draft.webLink };
    });
  }

  async createForwardDraft(input: { messageId: string; to: string[]; body?: string; format?: BodyFormat }): Promise<DraftRef> {
    this.requireWrite();
    const toRecipientsList = toRecipients(input.to);
    const html = input.body ? toHtml(input.body, input.format) : undefined;
    return this.call('write', async () => {
      const draft = await this.graph
        .api(`${messagePath(input.messageId)}/createForward`)
        .post({ toRecipients: toRecipientsList });
      if (html) {
        await this.writeAboveQuote(draft.id, html);
      }
      return { id: draft.id, webLink: draft.webLink };
    });
  }

  private async writeAboveQuote(draftId: string, html: string): Promise<void> {
    const current = await this.graph.api(messagePath(draftId)).select(['body']).get();
    const content = prependToBody(current?.body?.content ?? '', html);
    await this.graph.api(messagePath(draftId)).patch({ body: { contentType: 'HTML', content } });
  }

  async updateDraft(input: {
    draftId: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    format?: BodyFormat;
  }): Promise<{ id: string }> {
    this.requireWrite();
    const patch: Record<string, unknown> = {};
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.body !== undefined) patch.body = { contentType: 'HTML', content: toHtml(input.body, input.format) };
    if (input.to) patch.toRecipients = toRecipients(input.to);
    if (input.cc) patch.ccRecipients = toRecipients(input.cc);
    if (input.bcc) patch.bccRecipients = toRecipients(input.bcc);
    if (Object.keys(patch).length === 0) {
      throw new Error('Nothing to update: give at least one of to, cc, bcc, subject or body.');
    }
    await this.call('write', () => this.graph.api(messagePath(input.draftId)).patch(patch));
    return { id: input.draftId };
  }

  async addDraftAttachment(input: { draftId: string; filePath: string }): Promise<{ attachmentId?: string; name: string; size: number }> {
    this.requireWrite();
    const real = assertSafeLocalFile(input.filePath, this.options.homeDir);
    const size = fs.statSync(real).size;
    const maxBytes = this.options.maxAttachmentMB * 1024 * 1024;
    if (size > maxBytes) {
      throw new Error(
        `The file is ${(size / 1024 / 1024).toFixed(1)} MB, above the ${this.options.maxAttachmentMB} MB limit. ` +
          'Raise OUTLOOK_MAX_ATTACHMENT_MB to attach it, or share a link instead.'
      );
    }
    const name = path.basename(real);
    const attachments = `${messagePath(input.draftId)}/attachments`;

    if (size <= INLINE_ATTACHMENT_LIMIT) {
      const data = fs.readFileSync(real);
      const created = await this.call('write', () =>
        this.graph.api(attachments).post({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name,
          contentBytes: data.toString('base64'),
        })
      );
      return { attachmentId: created?.id, name, size };
    }

    const session = await this.call('write', () =>
      this.graph.api(`${attachments}/createUploadSession`).post({ AttachmentItem: { attachmentType: 'file', name, size } })
    );
    await this.uploadChunks(session.uploadUrl, real, size);
    return { name, size };
  }

  /** PUT the file in chunks to the pre-authorised upload URL. No Authorization header: the URL carries its own. */
  private async uploadChunks(uploadUrl: string, filePath: string, size: number): Promise<void> {
    const doFetch = this.options.fetch ?? fetch;
    const handle = fs.openSync(filePath, 'r');
    try {
      for (let start = 0; start < size; start += UPLOAD_CHUNK_BYTES) {
        const length = Math.min(UPLOAD_CHUNK_BYTES, size - start);
        const chunk = Buffer.alloc(length);
        fs.readSync(handle, chunk, 0, length, start);
        const response = await doFetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(length),
            'Content-Range': `bytes ${start}-${start + length - 1}/${size}`,
          },
          body: chunk,
        });
        if (!response.ok) {
          throw new Error(`Attachment upload failed at byte ${start}: ${response.status} ${await response.text()}`);
        }
      }
    } finally {
      fs.closeSync(handle);
    }
  }

  async markRead(messageId: string, isRead: boolean): Promise<void> {
    this.requireWrite();
    await this.call('write', () => this.graph.api(messagePath(messageId)).patch({ isRead }));
  }

  /** destinationFolder: a well-known name (archive, deleteditems, inbox, drafts, ...) or a folder id. */
  async moveMessage(messageId: string, destinationFolder: string): Promise<{ newId: string }> {
    this.requireWrite();
    const moved = await this.call('write', () =>
      this.graph.api(`${messagePath(messageId)}/move`).post({ destinationId: destinationFolder })
    );
    return { newId: moved.id };
  }

  async flagMessage(messageId: string, flag: 'flagged' | 'complete' | 'notFlagged'): Promise<void> {
    this.requireWrite();
    await this.call('write', () => this.graph.api(messagePath(messageId)).patch({ flag: { flagStatus: flag } }));
  }

  /**
   * Moves the message to Deleted Items, where it can be recovered. There is
   * deliberately no permanent delete.
   */
  async deleteMessage(messageId: string, confirm: boolean): Promise<void> {
    requireEnabled(DELETE, 'Mail delete');
    if (confirm !== true) {
      throw new Error('Deleting needs confirm: true. The message moves to Deleted Items and can be recovered from there.');
    }
    await this.call('delete', () => this.graph.api(messagePath(messageId)).delete());
  }
}
