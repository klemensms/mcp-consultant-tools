/**
 * Changing the mailbox without sending anything: drafts and draft attachments
 * (OUTLOOK_ENABLE_DRAFTS, which follows OUTLOOK_ENABLE_WRITE while unset),
 * mark read, move, flag (OUTLOOK_ENABLE_WRITE), categories
 * (OUTLOOK_ENABLE_CATEGORIES), and delete to Deleted Items
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
import type { CategoryChange } from '../types.js';
import { graphTime, toUtc, userTimeZone } from './calendar-shared.js';

const WRITE = 'OUTLOOK_ENABLE_WRITE';
const DRAFTS = 'OUTLOOK_ENABLE_DRAFTS';
const DELETE = 'OUTLOOK_ENABLE_DELETE';
const CATEGORIES = 'OUTLOOK_ENABLE_CATEGORIES';

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

export type FlagStatus = 'flagged' | 'complete' | 'notFlagged';

export interface FlagOptions {
  /** ISO date or date-time; read in timeZone unless it ends in Z or an offset. */
  dueDateTime?: string;
  /** ISO date or date-time; needs dueDateTime. Defaults to now (or the due date, if that is already past). */
  startDateTime?: string;
  /** IANA name (converted to UTC here) or Windows name (passed to Graph as given). Default OUTLOOK_TIME_ZONE, else the machine's zone. */
  timeZone?: string;
  /** ISO date or date-time for the reminder; read in timeZone unless it ends in Z or an offset. */
  reminderDateTime?: string;
}

export interface FlagResult {
  messageId: string;
  flag: FlagStatus;
  startDateTime?: { dateTime: string; timeZone: string };
  dueDateTime?: { dateTime: string; timeZone: string };
  reminderUtc?: string;
  reminderCleared?: boolean;
}

/*
 * Reminder properties, set through MAPI named properties in PSETID_Common
 * {00062008-0000-0000-C000-000000000046}, because Graph's message resource
 * exposes no reminder of its own:
 *   PidLidReminderSet        LID 0x8503 PT_BOOLEAN
 *   PidLidReminderTime       LID 0x8502 PT_SYSTIME (UTC)
 *   PidLidReminderSignalTime LID 0x8560 PT_SYSTIME (UTC; must be set when ReminderSet is true)
 * Sources (Microsoft Learn, checked 2026-10-06):
 *   Outlook MAPI reference, "PidLidReminderSet / PidLidReminderTime /
 *   PidLidReminderSignalTime Canonical Property" (property set, LID, type, UTC rule).
 *   MS-OXPROPS "Commonly Used Property Sets" (the PSETID_Common GUID):
 *   https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxprops/cc9d955b-1492-47de-9dce-5bdea80a3323
 *   Graph id format "{type} {guid} Id {id}":
 *   https://learn.microsoft.com/en-us/graph/api/resources/extended-properties-overview
 *   Graph "Create single-value extended property" (PATCH on an existing message).
 */
const PSETID_COMMON = '{00062008-0000-0000-C000-000000000046}';
export const REMINDER_SET_ID = `Boolean ${PSETID_COMMON} Id 0x8503`;
export const REMINDER_TIME_ID = `SystemTime ${PSETID_COMMON} Id 0x8502`;
export const REMINDER_SIGNAL_TIME_ID = `SystemTime ${PSETID_COMMON} Id 0x8560`;

const isIanaZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const nowUtc = () => new Date().toISOString().slice(0, 19);

/** Pure: the PATCH body for a flag change, validated before any request. */
export function buildFlagPatch(
  flag: FlagStatus,
  options: FlagOptions
): { patch: Record<string, unknown>; summary: Omit<FlagResult, 'messageId' | 'flag'> } {
  const { dueDateTime, startDateTime, reminderDateTime } = options;
  const given = (['dueDateTime', 'startDateTime', 'timeZone', 'reminderDateTime'] as const).filter(
    (key) => options[key] !== undefined && options[key] !== ''
  );
  if (flag === 'notFlagged') {
    if (given.length > 0) {
      throw new Error(
        `notFlagged clears the flag and its reminder, so it takes no dates or reminder (got ${given.join(', ')}). ` +
          "Use flag 'flagged' to set a due date or a reminder."
      );
    }
    return {
      patch: { flag: { flagStatus: flag }, singleValueExtendedProperties: [{ id: REMINDER_SET_ID, value: 'false' }] },
      summary: { reminderCleared: true },
    };
  }
  if (flag === 'complete') {
    if (given.length > 0) {
      throw new Error(`Dates and reminders go only with flag 'flagged', not 'complete' (got ${given.join(', ')}).`);
    }
    // Outlook switches the reminder off when a follow-up is marked complete; do the same.
    return {
      patch: { flag: { flagStatus: flag }, singleValueExtendedProperties: [{ id: REMINDER_SET_ID, value: 'false' }] },
      summary: { reminderCleared: true },
    };
  }

  if (startDateTime && !dueDateTime) {
    throw new Error('startDateTime needs dueDateTime: Graph takes a start date only alongside a due date.');
  }
  const zone = options.timeZone?.trim() || userTimeZone();
  const iana = isIanaZone(zone);
  const followUp: Record<string, unknown> = { flagStatus: flag };
  const summary: Omit<FlagResult, 'messageId' | 'flag'> = {};

  if (dueDateTime) {
    let due: { dateTime: string; timeZone: string };
    let start: { dateTime: string; timeZone: string };
    if (iana) {
      due = graphTime(dueDateTime, 'dueDateTime', zone);
      if (startDateTime) {
        start = graphTime(startDateTime, 'startDateTime', zone);
      } else {
        const now = nowUtc();
        start = { dateTime: now < due.dateTime ? now : due.dateTime, timeZone: 'UTC' };
      }
    } else {
      // A Windows zone name cannot be converted here, so Graph converts it.
      due = { dateTime: localDateTime(dueDateTime, 'dueDateTime', zone), timeZone: zone };
      start = startDateTime
        ? { dateTime: localDateTime(startDateTime, 'startDateTime', zone), timeZone: zone }
        : { ...due };
    }
    if (start.dateTime > due.dateTime) {
      throw new Error(`startDateTime (${startDateTime}) is after dueDateTime (${dueDateTime}).`);
    }
    followUp.startDateTime = start;
    followUp.dueDateTime = due;
    summary.startDateTime = start;
    summary.dueDateTime = due;
  }

  const patch: Record<string, unknown> = { flag: followUp };
  if (reminderDateTime) {
    if (!iana && !HAS_ZONE.test(reminderDateTime.trim())) {
      throw new Error(
        `reminderDateTime must end in Z or an offset when timeZone is a Windows name ("${zone}"), ` +
          'or give an IANA zone such as Europe/London.'
      );
    }
    const reminderUtc = `${toUtc(reminderDateTime, 'reminderDateTime', iana ? zone : 'UTC')}Z`;
    patch.singleValueExtendedProperties = [
      { id: REMINDER_SET_ID, value: 'true' },
      { id: REMINDER_TIME_ID, value: reminderUtc },
      { id: REMINDER_SIGNAL_TIME_ID, value: reminderUtc },
    ];
    summary.reminderUtc = reminderUtc;
  }
  return { patch, summary };
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** A zone-less local date-time, normalised to YYYY-MM-DDTHH:MM:SS, for a zone Graph converts. */
function localDateTime(value: string, parameter: string, zone: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `${parameter} must be an ISO date or date-time without Z or an offset, such as 2026-10-01T09:00, when timeZone is a Windows name ("${zone}"); got "${value}".`
    );
  }
  const [, date, h = '00', m = '00', s = '00'] = match;
  return `${date}T${h}:${m}:${s}`;
}

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

  private async call<T>(group: 'write' | 'drafts' | 'categories' | 'delete', run: () => Promise<T>): Promise<T> {
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

  /**
   * Set, complete or clear a follow-up flag. With flag 'flagged' it can also
   * carry a start and due date and a reminder: Graph has no snooze for mail,
   * so "remind me about this later" is a flagged message that stays in the
   * Inbox with a reminder at the chosen time. Clearing the flag (notFlagged)
   * and marking it complete
   * both switch the reminder off, as Outlook does.
   */
  async flagMessage(
    messageId: string,
    flag: FlagStatus,
    options: FlagOptions = {}
  ): Promise<FlagResult> {
    this.requireWrite();
    const body = buildFlagPatch(flag, options);
    await this.call('write', () => this.graph.api(messagePath(messageId)).patch(body.patch));
    return { messageId, flag, ...body.summary };
  }

  /**
   * Add and remove named categories on one message. Graph's PATCH replaces the
   * whole list, so the current list is read first and merged: categories the
   * caller did not name are always kept. Names match without regard to case,
   * as Outlook matches them, and an existing name keeps its spelling.
   */
  async setCategories(input: { messageId: string; add?: string[]; remove?: string[] }): Promise<CategoryChange> {
    requireEnabled(CATEGORIES, 'Mail categories (add and remove)');
    const clean = (names?: string[]) => (names ?? []).map((n) => n.trim()).filter(Boolean);
    const add = clean(input.add);
    const remove = clean(input.remove);
    if (add.length === 0 && remove.length === 0) {
      throw new Error('Give at least one category name to add or remove.');
    }
    const key = (name: string) => name.toLowerCase();
    const removing = new Set(remove.map(key));
    const both = add.filter((name) => removing.has(key(name)));
    if (both.length > 0) {
      throw new Error(`A category cannot be added and removed at once: ${both.join(', ')}. Name it in add or remove, not both.`);
    }
    return this.call('categories', async () => {
      const current = await this.graph.api(messagePath(input.messageId)).select(['categories']).get();
      const before: string[] = Array.isArray(current?.categories) ? current.categories : [];
      const kept = before.filter((name) => !removing.has(key(name)));
      const present = new Set(kept.map(key));
      const added = add.filter((name) => {
        if (present.has(key(name))) return false;
        present.add(key(name));
        return true;
      });
      const categories = [...kept, ...added];
      const changed = categories.length !== before.length || categories.some((name, i) => name !== before[i]);
      if (changed) {
        await this.graph.api(messagePath(input.messageId)).patch({ categories });
      }
      return { messageId: input.messageId, before, categories, changed };
    });
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
