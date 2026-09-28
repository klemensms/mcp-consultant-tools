/**
 * Shared plumbing for the content tools: find a file from a link or ids, read
 * its bytes into memory, and write bytes back as a new version guarded by the
 * eTag from the read. Nothing here touches the local disk.
 */
import { ResponseType } from '@microsoft/microsoft-graph-client';
import type { Client } from '@microsoft/microsoft-graph-client';
import { formatLabel, formatOf, type ContentAccess, type ContentFormat } from './content-access.js';

/** A file named by a SharePoint or OneDrive link, or by its drive and item ids. */
export interface ItemRef {
  url?: string;
  driveId?: string;
  itemId?: string;
}

export interface ContentItem {
  driveId: string;
  itemId: string;
  name: string;
  format: ContentFormat;
  eTag: string;
  webUrl: string;
  size: number;
  lastModifiedDateTime?: string;
}

export interface WriteResult {
  itemId: string;
  name: string;
  webUrl: string;
  /** The eTag after the write; pass it to the next write of the same file. */
  eTag: string;
  /** The version label the write created, such as "4.0", when SharePoint reports one. */
  version?: string;
  size: number;
}

export interface ContentDeps {
  spo: {
    getAuthenticatedGraphClient(): Promise<Client>;
    handleError(error: unknown, context: string): Error;
  };
  resolveLink(url: string): Promise<{ driveId?: string; itemId: string; isFolder?: boolean }>;
  access: ContentAccess;
}

const ITEM_FIELDS = 'id,name,eTag,webUrl,size,lastModifiedDateTime,file,folder,parentReference';

export function statusOf(error: unknown): number | undefined {
  const e = error as { statusCode?: number; response?: { status?: number } } | null;
  return e?.statusCode ?? e?.response?.status;
}

export class ContentCore {
  constructor(private readonly deps: ContentDeps) {}

  get access(): ContentAccess {
    return this.deps.access;
  }

  client(): Promise<Client> {
    return this.deps.spo.getAuthenticatedGraphClient();
  }

  fail(error: unknown, context: string): Error {
    return this.deps.spo.handleError(error, context);
  }

  /** Find the file, check it is one of the expected formats, and return its current eTag. */
  async locate(ref: ItemRef, expected: ContentFormat[]): Promise<ContentItem> {
    let driveId = ref.driveId;
    let itemId = ref.itemId;
    if (ref.url) {
      if (driveId || itemId) throw new Error('Give either url, or driveId and itemId, not both.');
      const resolved = await this.deps.resolveLink(ref.url);
      driveId = resolved.driveId;
      itemId = resolved.itemId;
    }
    if (!driveId || !itemId) {
      throw new Error('Name the file with url (a SharePoint or OneDrive link), or with both driveId and itemId.');
    }

    let meta: any;
    try {
      const client = await this.client();
      meta = await client.api(`/drives/${driveId}/items/${itemId}`).select(ITEM_FIELDS).get();
    } catch (error) {
      throw this.fail(error, 'find file');
    }

    if (meta.folder || !meta.file) {
      throw new Error(`'${meta.name}' is a folder, not a file.`);
    }
    const format = formatOf(meta.name);
    if (!format || !expected.includes(format)) {
      const wanted = expected.map(formatLabel).join(' or ');
      throw new Error(
        format
          ? `'${meta.name}' is a ${formatLabel(format)} file; this tool handles ${wanted} files.`
          : `'${meta.name}' is not a format the content tools handle; this tool handles ${wanted} files.`
      );
    }

    return {
      driveId: meta.parentReference?.driveId ?? driveId,
      itemId: meta.id,
      name: meta.name,
      format,
      eTag: meta.eTag,
      webUrl: meta.webUrl,
      size: meta.size,
      lastModifiedDateTime: meta.lastModifiedDateTime,
    };
  }

  /** The file's bytes, in memory, refused above SHAREPOINT_CONTENT_MAX_MB. */
  async readBytes(item: ContentItem): Promise<Buffer> {
    this.checkSize(item.name, item.size);
    try {
      const client = await this.client();
      const response = await client
        .api(`/drives/${item.driveId}/items/${item.itemId}/content`)
        .responseType(ResponseType.ARRAYBUFFER)
        .get();
      return Buffer.from(response as ArrayBuffer);
    } catch (error) {
      throw this.fail(error, 'read file');
    }
  }

  checkSize(name: string, size: number): void {
    if (size > this.deps.access.maxBytes) {
      const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
      throw new Error(
        `'${name}' is ${mb(size)} MB, over the ${mb(this.deps.access.maxBytes)} MB limit for in-memory editing. ` +
          'Raise SHAREPOINT_CONTENT_MAX_MB to allow it.'
      );
    }
  }

  /**
   * Replace the file's content with these bytes, only if its eTag still
   * matches the one the caller read. A changed file is refused, never merged.
   */
  async writeBytes(item: ContentItem, bytes: Buffer, eTag: string): Promise<WriteResult> {
    if (!eTag) {
      throw new Error('An eTag is required to change a file. Read the file first and pass the eTag it returned.');
    }
    this.checkSize(item.name, bytes.length);

    let saved: any;
    try {
      const client = await this.client();
      saved = await client
        .api(`/drives/${item.driveId}/items/${item.itemId}/content`)
        .header('Content-Type', 'application/octet-stream')
        .header('If-Match', eTag)
        .put(bytes);
    } catch (error) {
      if (statusOf(error) === 412) {
        throw new Error(
          `'${item.name}' has changed since it was read, so nothing was written. Read it again and reapply the change.`
        );
      }
      throw this.fail(error, 'write file');
    }

    return {
      itemId: saved.id ?? item.itemId,
      name: saved.name ?? item.name,
      webUrl: saved.webUrl ?? item.webUrl,
      eTag: saved.eTag,
      version: await this.latestVersion(item),
      size: saved.size ?? bytes.length,
    };
  }

  /** The newest version label, or undefined when the drive keeps no history (some OneDrive plans). */
  async latestVersion(item: { driveId: string; itemId: string }): Promise<string | undefined> {
    try {
      const client = await this.client();
      const result = await client.api(`/drives/${item.driveId}/items/${item.itemId}/versions`).get();
      const versions: Array<{ id: string; lastModifiedDateTime?: string }> = result?.value ?? [];
      const newest = [...versions].sort((a, b) =>
        (b.lastModifiedDateTime ?? '').localeCompare(a.lastModifiedDateTime ?? '')
      )[0];
      return newest?.id;
    } catch {
      return undefined;
    }
  }
}
