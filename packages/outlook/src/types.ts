/**
 * Outlook types shared by the services, tools and CLI.
 */
import type { DelegatedGraphAuth } from '@mcp-consultant-tools/m365-core';
import type { MailReadService } from './services/mail-read-service.js';
import type { MailWriteService } from './services/mail-write-service.js';
import type { MailSendService } from './services/mail-send-service.js';

export interface MailSummary {
  id: string;
  conversationId: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  preview: string;
  webLink: string;
}

export interface MailAttachmentInfo {
  id: string;
  name: string;
  size: number;
  contentType: string;
  isInline: boolean;
}

export interface MailDetail extends MailSummary {
  to: string[];
  cc: string[];
  /** Plain text, wrapped as untrusted email content. */
  bodyText: string;
  attachments: MailAttachmentInfo[];
}

export interface MailFolder {
  id: string;
  displayName: string;
  unreadItemCount: number;
  totalItemCount: number;
}

export interface ListMessagesOptions {
  /** Well-known folder name (inbox, archive, drafts, sentitems, deleteditems) or a folder id. Default inbox. */
  folder?: string;
  /** Default 20, capped at 50. */
  top?: number;
  unreadOnly?: boolean;
  /** Sender email address. */
  from?: string;
  /** ISO date or date-time; received on or after. */
  since?: string;
  /** ISO date or date-time; received on or before. */
  until?: string;
  hasAttachments?: boolean;
}

export interface SavedAttachment {
  path: string;
  size: number;
  contentType: string;
}

export interface ServiceContext {
  readonly auth: DelegatedGraphAuth;
  readonly mail: MailReadService;
  readonly write: MailWriteService;
  readonly send: MailSendService;
}
