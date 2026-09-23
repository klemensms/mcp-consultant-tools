import { describe, it, expect } from 'vitest';
import { DiscoveryService } from '../services/discovery-service.js';
import { FileOperationsService } from '../services/file-operations-service.js';
import { ListService } from '../services/list-service.js';
import { fakeGraph } from './fake-graph.js';
import { recordingGraph, type RecordedRequest } from './graph-recorder.js';

const ONEDRIVE_ID = 'b!OneDriveDriveId000';
const ONEDRIVE_URL = 'https://contoso-my.sharepoint.com/personal/jdoe_contoso_com/Documents';

const MY_DRIVE = {
  id: ONEDRIVE_ID,
  driveType: 'business',
  webUrl: ONEDRIVE_URL,
  owner: { user: { displayName: 'Jane Doe' } },
  quota: { total: 1099511627776, used: 52428800, remaining: 1099459198976, deleted: 0, state: 'normal' },
};

const CHILDREN = {
  value: [
    { id: 'f1', name: 'Reports', webUrl: `${ONEDRIVE_URL}/Reports`, folder: { childCount: 3 }, parentReference: { driveId: ONEDRIVE_ID, path: '/drive/root:' } },
    {
      id: 'i1', name: 'Plan.docx', webUrl: `${ONEDRIVE_URL}/Plan.docx`, size: 1234, lastModifiedDateTime: '2026-09-01T10:00:00Z',
      file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      parentReference: { driveId: ONEDRIVE_ID, path: '/drive/root:' },
    },
  ],
};

function discovery(responses: Record<string, unknown>, mode: 'device-code' | 'client-credentials' = 'device-code') {
  const graph = fakeGraph(responses);
  const spo = { getAuthMode: () => mode, getAuthenticatedGraphClient: async () => graph.client, handleError: (e: any) => e };
  return { service: new DiscoveryService(spo as any), calls: graph.calls };
}

describe('getMyDrive', () => {
  it('reads /me/drive and returns the drive id, web URL, the site URL to pass as siteId, owner and quota', async () => {
    const { service, calls } = discovery({ '/me/drive': MY_DRIVE });
    expect(await service.getMyDrive()).toEqual({
      driveId: ONEDRIVE_ID,
      driveType: 'business',
      webUrl: ONEDRIVE_URL,
      siteUrl: 'https://contoso-my.sharepoint.com/personal/jdoe_contoso_com',
      owner: 'Jane Doe',
      quota: { total: 1099511627776, used: 52428800, remaining: 1099459198976, deleted: 0, state: 'normal' },
    });
    expect(calls.map((c) => c.path)).toEqual(['/me/drive']);
  });

  it('refuses in app-only mode without calling Graph', async () => {
    const { service, calls } = discovery({ '/me/drive': MY_DRIVE }, 'client-credentials');
    await expect(service.getMyDrive()).rejects.toThrow(/sign-in \(device-code\) mode/);
    expect(calls).toEqual([]);
  });
});

describe('listMyDrive', () => {
  it('with no path lists /me/drive/root/children and maps files and folders', async () => {
    const { service, calls } = discovery({ '/me/drive/root/children': CHILDREN });
    const items = await service.listMyDrive();
    expect(calls.map((c) => c.path)).toEqual(['/me/drive/root/children']);
    expect(items).toEqual([
      { name: 'Reports', itemId: 'f1', driveId: ONEDRIVE_ID, webUrl: `${ONEDRIVE_URL}/Reports`, isFolder: true, childCount: 3, mimeType: undefined, size: undefined, lastModifiedDateTime: undefined },
      {
        name: 'Plan.docx', itemId: 'i1', driveId: ONEDRIVE_ID, webUrl: `${ONEDRIVE_URL}/Plan.docx`, isFolder: false, childCount: undefined,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1234, lastModifiedDateTime: '2026-09-01T10:00:00Z',
      },
    ]);
  });

  it('"/" and "" mean the root', async () => {
    const { service, calls } = discovery({ '/me/drive/root/children': CHILDREN });
    await service.listMyDrive('/');
    await service.listMyDrive('');
    expect(calls.map((c) => c.path)).toEqual(['/me/drive/root/children', '/me/drive/root/children']);
  });

  it('a folder path lists /me/drive/root:/{path}:/children, each segment encoded, outer slashes trimmed', async () => {
    const path = '/me/drive/root:/Documents/Q1%20%232:/children';
    const { service, calls } = discovery({ [path]: CHILDREN });
    await service.listMyDrive('/Documents/Q1 #2/');
    expect(calls.map((c) => c.path)).toEqual([path]);
  });

  it('refuses in app-only mode without calling Graph', async () => {
    const { service, calls } = discovery({ '/me/drive/root/children': CHILDREN }, 'client-credentials');
    await expect(service.listMyDrive()).rejects.toThrow(/sign-in \(device-code\) mode/);
    expect(calls).toEqual([]);
  });
});

/**
 * The item tools take a drive id, so they work on OneDrive unchanged once given the id
 * spo-get-my-drive returns. Pinned so a later change cannot route them through a site lookup.
 */
describe('item operations given the OneDrive drive id', () => {
  function recorded() {
    const graph = recordingGraph((req: RecordedRequest) => {
      if (req.path.endsWith('/content') && req.method === 'GET') return 'text';
      return { id: 'x1', name: 'Plan.docx', size: 4, webUrl: `${ONEDRIVE_URL}/Plan.docx`, file: { mimeType: 'text/plain' } };
    });
    const spo = {
      getAuthenticatedGraphClient: async () => graph.client,
      getSiteById: (id: string) => ({ id, name: id, siteUrl: id, active: true }),
      handleError: (e: any) => e,
      sanitizeErrorMessage: (e: any) => String(e?.message ?? e),
    };
    const files = new FileOperationsService(spo as any, { maxDownloadSizeMB: 50, maxUploadSizeMB: 100, downloadDir: '/tmp' });
    const list = new ListService(spo as any);
    const paths = () => graph.requests.map((r) => `${r.method} ${decodeURIComponent(r.path)}`);
    return { files, list, paths };
  }

  it('get-item, download, upload, create-folder, rename, move, copy and delete all address /drives/{OneDrive id}', async () => {
    const { files, list, paths } = recorded();
    await list.getItem(ONEDRIVE_URL, ONEDRIVE_ID, 'i1');
    await files.downloadFile(ONEDRIVE_URL, ONEDRIVE_ID, 'i1');
    await files.uploadFile(ONEDRIVE_URL, ONEDRIVE_ID, 'Notes/a.txt', 'hi', 'utf-8', false);
    await files.createFolder(ONEDRIVE_URL, ONEDRIVE_ID, '/', 'New');
    await files.renameItem(ONEDRIVE_URL, ONEDRIVE_ID, 'i1', 'B.docx');
    await files.moveItem(ONEDRIVE_URL, ONEDRIVE_ID, 'i1', ONEDRIVE_ID, 'Archive');
    await files.copyItem(ONEDRIVE_URL, ONEDRIVE_ID, 'i1', ONEDRIVE_ID, '/');
    await files.deleteItem(ONEDRIVE_URL, ONEDRIVE_ID, 'i1');
    const all = paths();
    expect(all.every((p) => p.split(' ')[1].startsWith(`/drives/${ONEDRIVE_ID}/`))).toBe(true);
    expect(all.some((p) => p.includes('/sites/'))).toBe(false);
    expect(all).toEqual(expect.arrayContaining([
      `GET /drives/${ONEDRIVE_ID}/items/i1`,
      `PUT /drives/${ONEDRIVE_ID}/root:/Notes/a.txt:/content`,
      `POST /drives/${ONEDRIVE_ID}/root/children`,
      `PATCH /drives/${ONEDRIVE_ID}/items/i1`,
      `GET /drives/${ONEDRIVE_ID}/root:/Archive`,
      `POST /drives/${ONEDRIVE_ID}/items/i1/copy`,
      `DELETE /drives/${ONEDRIVE_ID}/items/i1`,
    ]));
  });
});
