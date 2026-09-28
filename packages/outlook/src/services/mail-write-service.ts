/**
 * Changing the mailbox without sending anything: drafts and draft attachments
 * (OUTLOOK_ENABLE_DRAFTS, which follows OUTLOOK_ENABLE_WRITE while unset),
 * mark read, move, flag (OUTLOOK_ENABLE_WRITE), and delete to Deleted Items
 * (OUTLOOK_ENABLE_DELETE). The switches are checked here, not in the tool
 * layer, so the CLI is held to them as well.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Client } from '@microsoft/microsoft-graph-client';
import { requireEnabled } from '@mcp-consultant-tools/m365-core';
import { ATTACH_FROM_LINK_NEEDS, draftsEnabled, draftsFollowWrite, permissionHint } from '../permissions.js';
import { assertSafeLocalFile } from '../local-file-guard.js';
import { escapeHtml, insertAboveQuote, prependToBody, toGraphMessage, toHtml, toRecipients } from './compose.js';
import type { BodyFormat, ComposeInput } from './compose.js';
import type { GraphClientProvider } from './mail-read-service.js';

const WRITE = 'OUTLOOK_ENABLE_WRITE';
const DRAFTS = 'OUTLOOK_ENABLE_DRAFTS';
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

/** Every draft result carries this, so an agent never reports a draft as sent. */
export const NOTHING_SENT = 'Saved as a draft. Nothing was sent.';

export interface DraftRef {
  id: string;
  webLink: string;
  note: string;
}

export type AttachResult =
  | { attached: true; attachmentId?: string; name: string; size: number; note: string }
  | { attached: false; linkInserted: true; url: string; reason: string; note: string };

/** Graph's share id for a sharing link or file URL: u! plus the URL in unpadded base64url. */
const shareId = (url: string) => `u!${Buffer.from(url).toString('base64url')}`;

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
    requireEnabled(WRITE, 'Mail write (mark read, move, flag)');
  }

  private requireDrafts(): void {
    if (!draftsEnabled()) {
      const follows = draftsFollowWrite() ? ` While ${DRAFTS} is unset it follows ${WRITE}, which is off too.` : '';
      throw new Error(`Mail drafts (create, change, attach) are disabled. Set ${DRAFTS}=true to enable.${follows}`);
    }
  }

  private async call<T>(group: 'write' | 'drafts' | 'delete', run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw permissionHint(error, group);
    }
  }

  async createDraft(input: ComposeInput): Promise<DraftRef> {
    this.requireDrafts();
    const message = toGraphMessage(input);
    const draft = await this.call('drafts', () => this.graph.api('/me/messages').post(message));
    return { id: draft.id, webLink: draft.webLink, note: NOTHING_SENT };
  }

  /**
   * Graph's createReply builds the quoted thread into the draft body. Posting a
   * comment with it would put plain text only, so the draft is created empty,
   * read back, and the new HTML written above the quoted thread.
   */
  async createReplyDraft(input: { messageId: string; replyAll?: boolean; body: string; format?: BodyFormat }): Promise<DraftRef> {
    this.requireDrafts();
    const action = input.replyAll ? 'createReplyAll' : 'createReply';
    const html = toHtml(input.body, input.format);
    return this.call('drafts', async () => {
      const draft = await this.graph.api(`${messagePath(input.messageId)}/${action}`).post({});
      await this.writeAboveQuote(draft.id, html);
      return { id: draft.id, webLink: draft.webLink, note: NOTHING_SENT };
    });
  }

  async createForwardDraft(input: { messageId: string; to: string[]; body?: string; format?: BodyFormat }): Promise<DraftRef> {
    this.requireDrafts();
    const toRecipientsList = toRecipients(input.to);
    const html = input.body ? toHtml(input.body, input.format) : undefined;
    return this.call('drafts', async () => {
      const draft = await this.graph
        .api(`${messagePath(input.messageId)}/createForward`)
        .post({ toRecipients: toRecipientsList });
      if (html) {
        await this.writeAboveQuote(draft.id, html);
      }
      return { id: draft.id, webLink: draft.webLink, note: NOTHING_SENT };
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
  }): Promise<{ id: string; note: string }> {
    this.requireDrafts();
    const patch: Record<string, unknown> = {};
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.body !== undefined) patch.body = { contentType: 'HTML', content: toHtml(input.body, input.format) };
    if (input.to) patch.toRecipients = toRecipients(input.to);
    if (input.cc) patch.ccRecipients = toRecipients(input.cc);
    if (input.bcc) patch.bccRecipients = toRecipients(input.bcc);
    if (Object.keys(patch).length === 0) {
      throw new Error('Nothing to update: give at least one of to, cc, bcc, subject or body.');
    }
    await this.call('drafts', () => this.graph.api(messagePath(input.draftId)).patch(patch));
    return { id: input.draftId, note: NOTHING_SENT };
  }

  /** Attach a local file (filePath) or a SharePoint or OneDrive file (url). Exactly one. */
  async addDraftAttachment(input: { draftId: string; filePath?: string; url?: string }): Promise<AttachResult> {
    this.requireDrafts();
    if (!input.filePath && !input.url) {
      throw new Error('Give filePath or url: a local file in your home folder, or a SharePoint or OneDrive link.');
    }
    if (input.filePath && input.url) {
      throw new Error('Give filePath or url, not both.');
    }
    if (input.url) {
      return this.attachFromLink(input.draftId, input.url);
    }
    const real = assertSafeLocalFile(input.filePath!, this.options.homeDir);
    const size = fs.statSync(real).size;
    this.checkSize(size);
    return this.attach(input.draftId, path.basename(real), size, (start, length) => {
      const chunk = Buffer.alloc(length);
      const handle = fs.openSync(real, 'r');
      try {
        fs.readSync(handle, chunk, 0, length, start);
      } finally {
        fs.closeSync(handle);
      }
      return chunk;
    });
  }

  private checkSize(size: number): void {
    const maxBytes = this.options.maxAttachmentMB * 1024 * 1024;
    if (size > maxBytes) {
      throw new Error(
        `The file is ${(size / 1024 / 1024).toFixed(1)} MB, above the ${this.options.maxAttachmentMB} MB limit. ` +
          'Raise OUTLOOK_MAX_ATTACHMENT_MB to attach it, or share a link instead.'
      );
    }
  }

  /**
   * Read the linked file's metadata with the Outlook sign-in, then its bytes
   * into memory from the pre-authorised download URL; nothing touches the
   * disk. When the sign-in may not read the file (403), put a link to it in
   * the draft instead, above any quoted thread.
   */
  private async attachFromLink(draftId: string, url: string): Promise<AttachResult> {
    if (!/^https:\/\//i.test(url)) {
      throw new Error('url must be an https SharePoint or OneDrive link.');
    }
    let item: any;
    try {
      item = await this.graph.api(`/shares/${shareId(url)}/driveItem`).get();
    } catch (error) {
      if ((error as { statusCode?: number } | null)?.statusCode !== 403) {
        throw error;
      }
      return this.insertLink(draftId, url);
    }
    if (item?.folder || !item?.file) {
      throw new Error(`That link points to a folder or to something that is not a file (${item?.name ?? 'unnamed'}). Link to a single file.`);
    }
    const size: number = item.size ?? 0;
    this.checkSize(size);
    const downloadUrl: string | undefined = item['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      throw new Error(`Graph returned no download URL for ${item.name}, so its content cannot be read.`);
    }
    const response = await (this.options.fetch ?? fetch)(downloadUrl);
    if (!response.ok) {
      throw new Error(`Downloading ${item.name} failed: ${response.status} ${await response.text()}`);
    }
    const data = Buffer.from(await response.arrayBuffer());
    return this.attach(draftId, item.name, data.length, (start, length) => data.subarray(start, start + length));
  }

  private async insertLink(draftId: string, url: string): Promise<AttachResult> {
    const link = `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;
    await this.call('drafts', async () => {
      const current = await this.graph.api(messagePath(draftId)).select(['body']).get();
      const content = insertAboveQuote(current?.body?.content ?? '', link);
      await this.graph.api(messagePath(draftId)).patch({ body: { contentType: 'HTML', content } });
    });
    return {
      attached: false,
      linkInserted: true,
      url,
      reason:
        'The Outlook sign-in may not read that file (403 Forbidden), so a link to it was put in the draft instead. ' +
        `Attaching the file itself needs the delegated ${ATTACH_FROM_LINK_NEEDS[0]} permission on the Outlook app registration, ` +
        'granted by an administrator with admin consent.',
      note: NOTHING_SENT,
    };
  }

  /** Inline up to 3 MB; above that an upload session fed by read(start, length). */
  private async attach(
    draftId: string,
    name: string,
    size: number,
    read: (start: number, length: number) => Buffer
  ): Promise<AttachResult> {
    const attachments = `${messagePath(draftId)}/attachments`;
    if (size <= INLINE_ATTACHMENT_LIMIT) {
      const created = await this.call('drafts', () =>
        this.graph.api(attachments).post({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name,
          contentBytes: read(0, size).toString('base64'),
        })
      );
      return { attached: true, attachmentId: created?.id, name, size, note: NOTHING_SENT };
    }
    const session = await this.call('drafts', () =>
      this.graph.api(`${attachments}/createUploadSession`).post({ AttachmentItem: { attachmentType: 'file', name, size } })
    );
    await this.uploadChunks(session.uploadUrl, size, read);
    return { attached: true, name, size, note: NOTHING_SENT };
  }

  /** PUT the bytes in chunks to the pre-authorised upload URL. No Authorization header: the URL carries its own. */
  private async uploadChunks(uploadUrl: string, size: number, read: (start: number, length: number) => Buffer): Promise<void> {
    const doFetch = this.options.fetch ?? fetch;
    for (let start = 0; start < size; start += UPLOAD_CHUNK_BYTES) {
      const length = Math.min(UPLOAD_CHUNK_BYTES, size - start);
      const response = await doFetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(length),
          'Content-Range': `bytes ${start}-${start + length - 1}/${size}`,
        },
        body: read(start, length),
      });
      if (!response.ok) {
        throw new Error(`Attachment upload failed at byte ${start}: ${response.status} ${await response.text()}`);
      }
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
