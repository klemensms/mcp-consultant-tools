/**
 * SharePoint cross-site discovery (device-code mode only).
 *
 * Searches, resolves links and finds sites as the signed-in user, across every
 * site, OneDrive and Teams library they can open. App-only mode has no user to
 * search as, so these operations refuse there.
 *
 * Not built: drive "recent" and "sharedWithMe". Both Graph endpoints are
 * deprecated and stop returning data after November 2026.
 */

import type { SharePointService } from './sharepoint-service.js';
import { toSiteUrl } from './sharepoint-service.js';

const DEFAULT_PAGE = 25;
const MAX_PAGE = 100;

export interface FileHit {
  name: string;
  webUrl: string;
  /** Host and folder path of the file, decoded from its web URL. */
  location: string;
  siteId?: string;
  driveId?: string;
  itemId: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: string;
  size?: number;
  /** Search hit summary with highlight markup removed. */
  summary: string;
}

export interface FileSearchResult {
  total: number;
  moreResultsAvailable: boolean;
  hits: FileHit[];
}

export interface DriveItemInfo {
  name: string;
  itemId: string;
  driveId?: string;
  siteId?: string;
  webUrl?: string;
  isFolder: boolean;
  mimeType?: string;
  size?: number;
  lastModifiedDateTime?: string;
  parentPath?: string;
}

export interface SiteSummary {
  id: string;
  name?: string;
  displayName?: string;
  webUrl?: string;
  description?: string;
}

/** Encode a sharing or document URL for /shares/{id}: "u!" + unpadded base64url. */
export function encodeSharingUrl(url: string): string {
  return 'u!' + Buffer.from(url, 'utf8').toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

/** Search summaries mark hits with <c0>..</c0> and elisions with <ddd/>. */
function plainSummary(summary: string | undefined): string {
  return (summary ?? '').replace(/<ddd\/>/g, '...').replace(/<\/?c\d+>/g, '');
}

function locationOf(webUrl: string | undefined): string {
  if (!webUrl) return '';
  try {
    const url = new URL(webUrl);
    const folder = url.pathname.split('/').slice(0, -1).join('/');
    return decodeURIComponent(`${url.hostname}${folder}`);
  } catch {
    return '';
  }
}

export class DiscoveryService {
  constructor(private readonly spo: SharePointService) {}

  private requireDelegated(operation: string): void {
    if (this.spo.getAuthMode() !== 'device-code') {
      throw new Error(
        `${operation} needs sign-in (device-code) mode: it acts as the signed-in user. ` +
        'This server runs app-only because SHAREPOINT_CLIENT_SECRET is set.'
      );
    }
  }

  /** Microsoft Search across every file the signed-in user can see. */
  async searchFiles(query: string, opts: { top?: number; from?: number } = {}): Promise<FileSearchResult> {
    this.requireDelegated('File search');
    const size = Math.min(Math.max(opts.top ?? DEFAULT_PAGE, 1), MAX_PAGE);
    const from = Math.max(opts.from ?? 0, 0);

    try {
      const client = await this.spo.getAuthenticatedGraphClient();
      const response = await client.api('/search/query').post({
        requests: [{ entityTypes: ['driveItem'], query: { queryString: query }, from, size }],
      });

      const container = response?.value?.[0]?.hitsContainers?.[0];
      if (!container) {
        return { total: 0, moreResultsAvailable: false, hits: [] };
      }

      const hits: FileHit[] = (container.hits ?? []).map((hit: any) => {
        const r = hit.resource ?? {};
        return {
          name: r.name,
          webUrl: r.webUrl,
          location: locationOf(r.webUrl),
          siteId: r.parentReference?.siteId,
          driveId: r.parentReference?.driveId,
          itemId: r.id ?? hit.hitId,
          lastModifiedDateTime: r.lastModifiedDateTime,
          lastModifiedBy: r.lastModifiedBy?.user?.displayName,
          size: r.size,
          summary: plainSummary(hit.summary),
        };
      });

      return {
        total: container.total ?? hits.length,
        moreResultsAvailable: Boolean(container.moreResultsAvailable),
        hits,
      };
    } catch (error) {
      throw this.spo.handleError(error, 'search files');
    }
  }

  /** Turn any SharePoint or OneDrive URL, including a sharing link, into a drive item. */
  async resolveLink(url: string): Promise<DriveItemInfo> {
    this.requireDelegated('Link resolution');
    if (!/^https:\/\//i.test(url)) {
      throw new Error(`Expected a full https:// SharePoint or OneDrive URL, got '${url}'.`);
    }

    try {
      const client = await this.spo.getAuthenticatedGraphClient();
      const item = await client.api(`/shares/${encodeSharingUrl(url)}/driveItem`).get();
      return {
        name: item.name,
        itemId: item.id,
        driveId: item.parentReference?.driveId,
        siteId: item.parentReference?.siteId,
        webUrl: item.webUrl,
        isFolder: Boolean(item.folder),
        mimeType: item.file?.mimeType,
        size: item.size,
        lastModifiedDateTime: item.lastModifiedDateTime,
        parentPath: item.parentReference?.path,
      };
    } catch (error) {
      throw this.spo.handleError(error, 'resolve link');
    }
  }

  /** Resolve a site by URL, or search sites by keyword. */
  async findSites(queryOrUrl: string): Promise<SiteSummary[]> {
    this.requireDelegated('Site search');
    const toSummary = (s: any): SiteSummary => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName,
      webUrl: s.webUrl,
      description: s.description,
    });

    try {
      const client = await this.spo.getAuthenticatedGraphClient();
      const siteUrl = toSiteUrl(queryOrUrl);
      if (siteUrl) {
        const url = new URL(siteUrl);
        return [toSummary(await client.api(`/sites/${url.hostname}:${url.pathname}`).get())];
      }
      const response = await client.api(`/sites?search=${encodeURIComponent(queryOrUrl)}`).get();
      return (response?.value ?? []).map(toSummary);
    } catch (error) {
      throw this.spo.handleError(error, 'find sites');
    }
  }
}
