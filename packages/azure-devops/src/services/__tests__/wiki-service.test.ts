import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiService } from '../wiki-service.js';
import type { AzureDevOpsClient } from '../../azure-devops-client.js';

const requestRaw = vi.fn();
const client = {
  validateProject: vi.fn(),
  requestRaw,
  apiVersion: '7.1',
} as unknown as AzureDevOpsClient;

const service = new WikiService(client);

const pageResponse = (overrides: any = {}) => ({
  data: {
    id: 42,
    path: '/Setup',
    content: '# Setup',
    gitItemPath: '/Setup.md',
    url: 'https://dev.azure.com/org/proj/_apis/wiki/wikis/wiki/pages/42',
    remoteUrl: 'https://dev.azure.com/org/proj/_wiki/wikis/wiki/42/Setup',
    ...overrides,
  },
  headers: { etag: '"v1"' },
});

describe('WikiService.getWikiPage recursionLevel', () => {
  beforeEach(() => {
    requestRaw.mockReset();
  });

  // Regression: the page request never passed recursionLevel, so the ADO API
  // (default 'none') never populated subPages - the field was always [].
  it('passes recursionLevel through to the request URL and populates subPages', async () => {
    requestRaw.mockResolvedValueOnce(
      pageResponse({
        subPages: [
          { id: 43, path: '/Setup/Authentication', subPages: [] },
          { id: 44, path: '/Setup/Deployment', subPages: [] },
        ],
      })
    );

    const result = await service.getWikiPage('MyProject', 'MyWiki', '/Setup', true, 'full');

    const url = requestRaw.mock.calls[0][0] as string;
    expect(url).toContain('recursionLevel=full');
    expect(result.subPages).toHaveLength(2);
    expect(result.subPages[0].path).toBe('/Setup/Authentication');
  });

  it('omits recursionLevel from the URL by default and annotates instead of returning a bare empty subPages', async () => {
    requestRaw.mockResolvedValueOnce(pageResponse());

    const result = await service.getWikiPage('MyProject', 'MyWiki', '/Setup');

    const url = requestRaw.mock.calls[0][0] as string;
    expect(url).not.toContain('recursionLevel');
    expect(result.subPages).toBeUndefined();
    expect(result.subPagesNote).toContain('recursionLevel');
    expect(result.content).toBe('# Setup');
    expect(result.version).toBe('"v1"');
  });

  it('treats an explicit recursionLevel of none the same as the default', async () => {
    requestRaw.mockResolvedValueOnce(pageResponse());

    const result = await service.getWikiPage('MyProject', 'MyWiki', '/Setup', true, 'none');

    const url = requestRaw.mock.calls[0][0] as string;
    expect(url).not.toContain('recursionLevel');
    expect(result.subPages).toBeUndefined();
  });

  it('supports recursionLevel on lookup by page id too', async () => {
    requestRaw.mockResolvedValueOnce(
      pageResponse({ subPages: [{ id: 43, path: '/Setup/Authentication', subPages: [] }] })
    );

    const result = await service.getWikiPageById('MyProject', 'MyWiki', 42, true, 'oneLevel');

    const url = requestRaw.mock.calls[0][0] as string;
    expect(url).toContain('/pages/42');
    expect(url).toContain('recursionLevel=oneLevel');
    expect(result.subPages).toHaveLength(1);
  });
});

describe('WikiService.getWikiPageTree', () => {
  beforeEach(() => {
    requestRaw.mockReset();
  });

  it('requests the full hierarchy without content and returns a slim tree', async () => {
    requestRaw.mockResolvedValueOnce(
      pageResponse({
        id: 1,
        path: '/',
        content: undefined,
        subPages: [
          {
            id: 42,
            path: '/Setup',
            gitItemPath: '/Setup.md',
            subPages: [{ id: 43, path: '/Setup/Authentication', gitItemPath: '/Setup/Authentication.md', subPages: [] }],
          },
          { id: 50, path: '/FAQ', gitItemPath: '/FAQ.md', subPages: [] },
        ],
      })
    );

    const result = await service.getWikiPageTree('MyProject', 'MyWiki');

    const url = requestRaw.mock.calls[0][0] as string;
    expect(url).toContain('recursionLevel=full');
    expect(url).toContain('includeContent=false');

    expect(result.pageCount).toBe(4);
    expect(result.tree.path).toBe('/');
    expect(result.tree.subPages[0].path).toBe('/Setup');
    expect(result.tree.subPages[0].subPages[0].path).toBe('/Setup/Authentication');
    // slim tree - no content fields anywhere
    expect(JSON.stringify(result)).not.toContain('"content"');
  });
});
