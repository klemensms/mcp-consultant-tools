/**
 * EmailTrackingService
 *
 * Tracks an email (read from Outlook by the agent) into Dataverse as a completed
 * email activity, optionally regarding a record. Keyed on the internet message
 * id, so tracking the same email twice reuses the first activity.
 *
 * Every check that can refuse the request (names, GUIDs, attachment paths and
 * sizes, whether the regarding table takes activities) runs before the first
 * write, so a refusal never leaves a half-made email behind.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { assertSafeLocalFile } from '../utils/local-file-guard.js';

const API = 'api/data/v9.2';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGICAL_NAME = /^[a-z_][a-z0-9_]*$/;
const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** The wrapper Outlook's mail-get-message puts round a body (outlook/src/mail-content.ts wrapUntrusted). */
const UNTRUSTED_WRAPPER =
  /^<<<UNTRUSTED ([0-9a-f]+): [^\n]*>>>\nThe text below came from an email\.[^\n]*\n([\s\S]*)\n<<<END UNTRUSTED \1>>>$/;

/** activityparty.participationtypemask values. */
const FROM = 1;
const TO = 2;
const CC = 3;
const BCC = 4;

/** email statuscode values under statecode 1 (Completed). */
const STATUS_SENT = 3;
const STATUS_RECEIVED = 4;

/** Tables an address is resolved against, in the order server-side sync uses. */
const PARTY_TABLES = [
  { entity: 'systemuser', set: 'systemusers', field: 'internalemailaddress' },
  { entity: 'contact', set: 'contacts', field: 'emailaddress1' },
  { entity: 'account', set: 'accounts', field: 'emailaddress1' },
  { entity: 'lead', set: 'leads', field: 'emailaddress1' },
] as const;

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.eml': 'message/rfc822',
  '.msg': 'application/vnd.ms-outlook',
  '.zip': 'application/zip',
};

export interface TrackEmailInput {
  /** Internet message id, e.g. `<abc@example.com>` (Graph `internetMessageId`). */
  internetMessageId: string;
  subject?: string;
  /** Email body; HTML is kept as HTML. */
  body?: string;
  from: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  /** ISO 8601 time the email was sent. */
  sentOn?: string;
  /** Defaults to outgoing when `from` is the signed-in Dynamics user, otherwise incoming. */
  direction?: 'outgoing' | 'incoming';
  regarding?: { entityLogicalName: string; recordId: string };
  /** Local files, e.g. saved by Outlook's mail-download-attachment. */
  attachments?: Array<{ path: string; mimeType?: string }>;
}

export interface TrackEmailResult {
  created: boolean;
  activityId: string;
  direction?: 'outgoing' | 'incoming';
  regarding?: { entityLogicalName: string; recordId: string };
  previousRegarding?: { entityLogicalName: string; recordId: string; name?: string };
  /** Addresses that matched no user, contact, account or lead; kept as plain addresses. */
  unresolved: string[];
  attachments: string[];
}

export interface EmailTrackingOptions {
  maxAttachmentBytes?: number;
  /** Home folder attachments must sit inside. Defaults to the OS home folder. */
  homeDir?: string;
}

interface PreparedAttachment {
  filename: string;
  mimetype: string;
  body: string;
}

interface RegardingTarget {
  entityLogicalName: string;
  recordId: string;
  navigationProperty: string;
  entitySetName: string;
}

export class EmailTrackingService {
  private readonly maxAttachmentBytes: number;
  private readonly homeDir: string;

  constructor(
    private client: PowerPlatformClient,
    options: EmailTrackingOptions = {}
  ) {
    this.maxAttachmentBytes = options.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;
    this.homeDir = options.homeDir ?? os.homedir();
  }

  async trackEmail(input: TrackEmailInput): Promise<TrackEmailResult> {
    if (!input.internetMessageId?.trim()) {
      throw new Error('internetMessageId is required: it is how a tracked email is recognised.');
    }
    if (input.regarding) {
      if (!LOGICAL_NAME.test(input.regarding.entityLogicalName)) {
        throw new Error(
          `Invalid table name "${input.regarding.entityLogicalName}". Use the logical name, e.g. opportunity.`
        );
      }
      if (!GUID.test(input.regarding.recordId)) {
        throw new Error(`Invalid record ID "${input.regarding.recordId}". Must be a GUID.`);
      }
    }

    const attachments = (input.attachments ?? []).map((a) => this.prepareAttachment(a));
    const regarding = input.regarding ? await this.resolveRegarding(input.regarding) : undefined;
    const regardingBind = regarding
      ? { [`${regarding.navigationProperty}@odata.bind`]: `/${regarding.entitySetName}(${regarding.recordId})` }
      : {};
    const regardingOut = regarding
      ? { entityLogicalName: regarding.entityLogicalName, recordId: regarding.recordId }
      : undefined;

    const existing = await this.findExisting(input.internetMessageId);
    if (existing) {
      const activityId = existing.activityid as string;
      if (regarding) {
        await this.client.makeRequestNoContent(`${API}/emails(${activityId})`, 'PATCH', regardingBind);
      }
      return {
        created: false,
        activityId,
        regarding: regardingOut,
        previousRegarding: readRegarding(existing),
        unresolved: [],
        attachments: [],
      };
    }

    const unresolved: string[] = [];
    const parties: Record<string, unknown>[] = [];
    const groups: Array<[number, string[] | undefined]> = [
      [FROM, [input.from]],
      [TO, input.to],
      [CC, input.cc],
      [BCC, input.bcc],
    ];
    for (const [mask, addresses] of groups) {
      for (const address of (addresses ?? []).map(bareAddress)) {
        const party = await this.resolveParty(address);
        if (party) {
          parties.push({ participationtypemask: mask, [`partyid_${party.entity}@odata.bind`]: `/${party.set}(${party.id})` });
        } else {
          parties.push({ participationtypemask: mask, addressused: address });
          if (!unresolved.includes(address)) unresolved.push(address);
        }
      }
    }

    const direction = input.direction ?? ((await this.isSignedInUser(input.from)) ? 'outgoing' : 'incoming');

    const email: Record<string, unknown> = {
      messageid: input.internetMessageId,
      directioncode: direction === 'outgoing',
      email_activity_parties: parties,
      ...regardingBind,
    };
    if (input.subject !== undefined) email.subject = input.subject;
    if (input.body !== undefined) email.description = input.body.replace(UNTRUSTED_WRAPPER, '$2');
    if (input.sentOn) email.senton = input.sentOn;

    const created = await this.client.makeRequest<Record<string, unknown>>(`${API}/emails`, 'POST', email, {
      Prefer: 'return=representation',
    });
    const activityId = created.activityid as string;

    try {
      for (const attachment of attachments) {
        await this.client.makeRequest(`${API}/activitymimeattachments`, 'POST', {
          'objectid_activitypointer@odata.bind': `/activitypointers(${activityId})`,
          objecttypecode: 'email',
          ...attachment,
        });
      }
      await this.client.makeRequestNoContent(`${API}/emails(${activityId})`, 'PATCH', {
        statecode: 1,
        statuscode: direction === 'outgoing' ? STATUS_SENT : STATUS_RECEIVED,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Email ${activityId} was created but not finished (attachments or closing it as completed failed): ${message}`
      );
    }

    return {
      created: true,
      activityId,
      direction,
      regarding: regardingOut,
      unresolved,
      attachments: attachments.map((a) => a.filename),
    };
  }

  private prepareAttachment(attachment: { path: string; mimeType?: string }): PreparedAttachment {
    const real = assertSafeLocalFile(attachment.path, this.homeDir);
    const size = fs.statSync(real).size;
    if (size > this.maxAttachmentBytes) {
      throw new Error(
        `Attachment ${attachment.path} is too large (${size} bytes; the limit is ${this.maxAttachmentBytes}).`
      );
    }
    const filename = path.basename(real);
    return {
      filename,
      mimetype: attachment.mimeType ?? MIME_TYPES[path.extname(filename).toLowerCase()] ?? 'application/octet-stream',
      body: fs.readFileSync(real).toString('base64'),
    };
  }

  private async resolveRegarding(regarding: { entityLogicalName: string; recordId: string }): Promise<RegardingTarget> {
    const name = regarding.entityLogicalName;
    let definition: { EntitySetName?: string; HasActivities?: boolean };
    try {
      definition = await this.client.makeRequest(
        `${API}/EntityDefinitions(LogicalName='${name}')?$select=EntitySetName,HasActivities`
      );
    } catch {
      throw new Error(`Table "${name}" was not found. Use its logical name, e.g. opportunity.`);
    }
    if (!definition.HasActivities || !definition.EntitySetName) {
      throw new Error(`Table "${name}" is not enabled for activities, so an email cannot be regarding it.`);
    }

    const relationships = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
      `${API}/EntityDefinitions(LogicalName='${name}')/OneToManyRelationships` +
        `?$select=ReferencingEntityNavigationPropertyName` +
        `&$filter=ReferencingEntity eq 'email' and ReferencingAttribute eq 'regardingobjectid'`
    );
    const navigationProperty =
      (relationships.value?.[0]?.ReferencingEntityNavigationPropertyName as string | undefined) ??
      `regardingobjectid_${name}_email`;

    return { ...regarding, navigationProperty, entitySetName: definition.EntitySetName };
  }

  private async findExisting(messageId: string): Promise<Record<string, unknown> | undefined> {
    const literal = encodeURIComponent(messageId.replace(/'/g, "''"));
    const response = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
      `${API}/emails?$filter=messageid eq '${literal}'&$select=activityid,subject,_regardingobjectid_value&$top=1`,
      'GET',
      undefined,
      { Prefer: 'odata.include-annotations="*"' }
    );
    return response.value?.[0];
  }

  private partyCache = new Map<string, { entity: string; set: string; id: string } | null>();

  private async resolveParty(address: string): Promise<{ entity: string; set: string; id: string } | null> {
    const key = address.trim().toLowerCase();
    if (this.partyCache.has(key)) return this.partyCache.get(key)!;

    let found: { entity: string; set: string; id: string } | null = null;
    const literal = encodeURIComponent(key.replace(/'/g, "''"));
    for (const table of PARTY_TABLES) {
      const response = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
        `${API}/${table.set}?$filter=${table.field} eq '${literal}'&$select=${table.entity}id&$top=1`
      );
      const row = response.value?.[0];
      if (row) {
        found = { entity: table.entity, set: table.set, id: row[`${table.entity}id`] as string };
        break;
      }
    }
    this.partyCache.set(key, found);
    return found;
  }

  private async isSignedInUser(address: string): Promise<boolean> {
    const whoAmI = await this.client.makeRequest<{ UserId: string }>(`${API}/WhoAmI`);
    const user = await this.client.makeRequest<{ internalemailaddress?: string }>(
      `${API}/systemusers(${whoAmI.UserId})?$select=internalemailaddress`
    );
    return !!user.internalemailaddress && user.internalemailaddress.toLowerCase() === bareAddress(address).toLowerCase();
  }
}

/** `Jane Doe <jdoe@example.com>` becomes `jdoe@example.com`; a bare address is returned trimmed. */
function bareAddress(address: string): string {
  const match = address.match(/<([^<>\s]+@[^<>\s]+)>\s*$/);
  return (match ? match[1] : address).trim();
}

function readRegarding(
  email: Record<string, unknown>
): { entityLogicalName: string; recordId: string; name?: string } | undefined {
  const recordId = email._regardingobjectid_value as string | undefined;
  if (!recordId) return undefined;
  return {
    entityLogicalName: email['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] as string,
    recordId,
    name: email['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined,
  };
}
