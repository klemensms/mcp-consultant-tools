/**
 * Reading the signed-in user's mailbox: folders, message lists, search, one
 * message, one conversation, and attachment download.
 */
import type { Client } from '@microsoft/microsoft-graph-client';
import { htmlToText, wrapUntrusted } from '../mail-content.js';
import { permissionHint } from '../permissions.js';
import { saveFileAttachment } from '../download.js';
import type { GraphAttachment } from '../download.js';
import type {
  ListMessagesOptions,
  MailAttachmentInfo,
  MailDetail,
  MailFolder,
  MailSummary,
  SavedAttachment,
} from '../types.js';

const SUMMARY_FIELDS = [
  'id', 'conversationId', 'subject', 'from', 'receivedDateTime', 'isRead', 'hasAttachments', 'bodyPreview', 'webLink',
];
const DETAIL_FIELDS = [...SUMMARY_FIELDS, 'toRecipients', 'ccRecipients', 'body'];
const ATTACHMENT_EXPAND = 'attachments($select=id,name,size,contentType,isInline)';

const DEFAULT_TOP = 20;
const MAX_TOP = 50;
/** A conversation longer than this is cut at the newest messages Graph returns first. */
const CONVERSATION_TOP = 50;

/**
 * Graph accepts $filter beside $orderby on messages only when the sort
 * property also leads the filter. A list filtered on anything but a date gets
 * this always-true clause first, so the newest-first sort is accepted.
 */
const OPEN_DATE_CLAUSE = 'receivedDateTime ge 1900-01-01T00:00:00Z';

export interface GraphClientProvider {
  getGraphClient(): Client;
}

export interface MailReadOptions {
  downloadDir: string;
}

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}

function formatAddress(recipient?: GraphRecipient): string {
  const name = recipient?.emailAddress?.name?.trim();
  const address = recipient?.emailAddress?.address?.trim();
  if (name && address && name !== address) {
    return `${name} <${address}>`;
  }
  return address || name || '';
}

/**
 * The Graph client puts $filter and $search values into the URL as they are,
 * without encoding, so a "+" in a plus-address arrives as a space and an "&"
 * in search text ends the parameter. Encode every free-text value here.
 */
function urlValue(value: string): string {
  return encodeURIComponent(value);
}

function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function isoDate(value: string, parameter: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${parameter} must be an ISO date or date-time, such as 2026-09-01 or 2026-09-01T09:00:00Z; got "${value}".`);
  }
  return date.toISOString();
}

function clampTop(top: number | undefined): number {
  if (top === undefined || !Number.isFinite(top)) {
    return DEFAULT_TOP;
  }
  return Math.min(Math.max(Math.trunc(top), 1), MAX_TOP);
}

function toSummary(message: any): MailSummary {
  return {
    id: message.id,
    conversationId: message.conversationId,
    subject: message.subject ?? '',
    from: formatAddress(message.from),
    receivedDateTime: message.receivedDateTime,
    isRead: Boolean(message.isRead),
    hasAttachments: Boolean(message.hasAttachments),
    preview: message.bodyPreview ?? '',
    webLink: message.webLink ?? '',
  };
}

function toDetail(message: any): MailDetail {
  const summary = toSummary(message);
  const body = message.body ?? {};
  const text = body.contentType === 'text' ? String(body.content ?? '').trim() : htmlToText(body.content ?? '');
  const attachments: MailAttachmentInfo[] = (message.attachments ?? []).map((a: any) => ({
    id: a.id,
    name: a.name ?? '',
    size: a.size ?? 0,
    contentType: a.contentType ?? '',
    isInline: Boolean(a.isInline),
  }));
  return {
    ...summary,
    to: (message.toRecipients ?? []).map(formatAddress),
    cc: (message.ccRecipients ?? []).map(formatAddress),
    bodyText: wrapUntrusted(text, `email from ${summary.from || 'an unknown sender'}`),
    attachments,
  };
}

export class MailReadService {
  constructor(
    private readonly auth: GraphClientProvider,
    private readonly options: MailReadOptions
  ) {}

  private get graph(): Client {
    return this.auth.getGraphClient();
  }

  async listFolders(): Promise<MailFolder[]> {
    try {
      const response = await this.graph
        .api('/me/mailFolders')
        .select(['id', 'displayName', 'unreadItemCount', 'totalItemCount'])
        .top(100)
        .get();
      return (response.value ?? []).map((f: any) => ({
        id: f.id,
        displayName: f.displayName,
        unreadItemCount: f.unreadItemCount ?? 0,
        totalItemCount: f.totalItemCount ?? 0,
      }));
    } catch (error) {
      throw permissionHint(error, 'read');
    }
  }

  async listMessages(options: ListMessagesOptions): Promise<MailSummary[]> {
    const dates: string[] = [];
    if (options.since) dates.push(`receivedDateTime ge ${isoDate(options.since, 'since')}`);
    if (options.until) dates.push(`receivedDateTime le ${isoDate(options.until, 'until')}`);

    const others: string[] = [];
    if (options.unreadOnly) others.push('isRead eq false');
    if (options.from) others.push(`from/emailAddress/address eq ${odataString(options.from.trim())}`);
    if (options.hasAttachments !== undefined) others.push(`hasAttachments eq ${options.hasAttachments}`);

    const clauses = others.length > 0 && dates.length === 0 ? [OPEN_DATE_CLAUSE, ...others] : [...dates, ...others];
    const folder = encodeURIComponent(options.folder?.trim() || 'inbox');

    try {
      let request = this.graph
        .api(`/me/mailFolders/${folder}/messages`)
        .select(SUMMARY_FIELDS)
        .top(clampTop(options.top))
        .orderby('receivedDateTime desc');
      if (clauses.length > 0) {
        request = request.filter(urlValue(clauses.join(' and ')));
      }
      const response = await request.get();
      return (response.value ?? []).map(toSummary);
    } catch (error) {
      throw permissionHint(error, 'read');
    }
  }

  /**
   * Full-text search across the mailbox. Graph rejects $search combined with
   * $orderby or $filter on messages, so results come in Graph's relevance order.
   */
  async searchMessages(query: string, top?: number): Promise<MailSummary[]> {
    const text = query.trim();
    if (!text) {
      throw new Error('query must not be empty.');
    }
    try {
      const response = await this.graph
        .api('/me/messages')
        .search(urlValue(`"${text.replace(/"/g, '\\"')}"`))
        .select(SUMMARY_FIELDS)
        .top(clampTop(top))
        .get();
      return (response.value ?? []).map(toSummary);
    } catch (error) {
      throw permissionHint(error, 'read');
    }
  }

  async getMessage(id: string): Promise<MailDetail> {
    try {
      const message = await this.graph
        .api(`/me/messages/${encodeURIComponent(id)}`)
        .select(DETAIL_FIELDS)
        .expand(ATTACHMENT_EXPAND)
        .get();
      return toDetail(message);
    } catch (error) {
      throw permissionHint(error, 'read');
    }
  }

  /** Every message in a conversation, oldest first. Sorted here: see OPEN_DATE_CLAUSE. */
  async getConversation(conversationId: string): Promise<MailDetail[]> {
    try {
      const response = await this.graph
        .api('/me/messages')
        .filter(urlValue(`conversationId eq ${odataString(conversationId)}`))
        .select(DETAIL_FIELDS)
        .expand(ATTACHMENT_EXPAND)
        .top(CONVERSATION_TOP)
        .get();
      return (response.value ?? [])
        .map(toDetail)
        .sort((a: MailDetail, b: MailDetail) => a.receivedDateTime.localeCompare(b.receivedDateTime));
    } catch (error) {
      throw permissionHint(error, 'read');
    }
  }

  async downloadAttachment(messageId: string, attachmentId: string): Promise<SavedAttachment> {
    let attachment: GraphAttachment;
    try {
      attachment = await this.graph
        .api(`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
        .get();
    } catch (error) {
      throw permissionHint(error, 'read');
    }
    return saveFileAttachment(attachment, this.options.downloadDir);
  }
}
