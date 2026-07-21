import { describe, it, expect } from 'vitest';
import {
  PullRequestService,
  resolveBlobSides,
  looksBinary,
  countHunkLines,
} from '../pull-request-service.js';

/**
 * Minimal AzureDevOpsClient stub. Iteration + change entries are served from
 * `changeEntries`; blob fetches resolve from the `blobs` map keyed by object ID.
 */
function stubClient(changeEntries: any[], blobs: Record<string, string>) {
  const calls: string[] = [];
  return {
    calls,
    apiVersion: '7.1',
    validateProject: () => {},
    get: async (endpoint: string) => {
      calls.push(endpoint);
      if (endpoint.includes('/iterations?')) {
        return { value: [{ id: 1 }, { id: 2 }] };
      }
      return { changeEntries };
    },
    requestRaw: async (endpoint: string) => {
      calls.push(endpoint);
      const objectId = endpoint.split('/blobs/')[1].split('?')[0];
      if (!(objectId in blobs)) throw new Error(`no such blob ${objectId}`);
      return { data: Buffer.from(blobs[objectId], 'utf8') };
    },
  } as any;
}

const entry = (over: any = {}) => ({
  changeType: 'edit',
  item: { path: '/src/app.ts', objectId: 'new1', originalObjectId: 'old1', isFolder: false },
  ...over,
});

describe('resolveBlobSides', () => {
  it('uses only the new blob for an add', () => {
    expect(resolveBlobSides({ changeType: 'add', item: { objectId: 'n' } }))
      .toEqual({ oldObjectId: null, newObjectId: 'n' });
  });

  it('uses only the old blob for a delete', () => {
    expect(resolveBlobSides({ changeType: 'delete', item: { objectId: 'o', originalObjectId: null } }))
      .toEqual({ oldObjectId: 'o', newObjectId: null });
  });

  it('handles a compound "edit, rename" changeType as a two-sided edit', () => {
    expect(resolveBlobSides({ changeType: 'edit, rename', item: { objectId: 'n', originalObjectId: 'o' } }))
      .toEqual({ oldObjectId: 'o', newObjectId: 'n' });
  });
});

describe('looksBinary', () => {
  it('flags content containing a NUL byte', () => {
    expect(looksBinary(Buffer.from([0x41, 0x00, 0x42]))).toBe(true);
  });

  it('does not flag plain UTF-8 text', () => {
    expect(looksBinary(Buffer.from('hello world\n', 'utf8'))).toBe(false);
  });

  it('treats null and empty as non-binary', () => {
    expect(looksBinary(null)).toBe(false);
    expect(looksBinary(Buffer.alloc(0))).toBe(false);
  });
});

describe('countHunkLines', () => {
  it('ignores the +++/--- file headers and counts only hunk lines', () => {
    const patch = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,3 @@',
      ' unchanged',
      '-removed',
      '+added one',
      '+added two',
    ].join('\n');
    expect(countHunkLines(patch)).toEqual({ additions: 2, deletions: 1 });
  });
});

describe('PullRequestService.getPullRequestDiff', () => {
  it('produces a unified patch with correct add/delete counts', async () => {
    const client = stubClient(
      [entry()],
      { old1: 'line one\nline two\n', new1: 'line one\nline two changed\nline three\n' }
    );
    const result = await new PullRequestService(client).getPullRequestDiff('Proj', 'repo', 42);

    expect(result.iterationId).toBe(2); // latest iteration selected
    expect(result.totalCount).toBe(1);
    expect(result.files[0].patch).toContain('+line two changed');
    expect(result.files[0].patch).toContain('-line two');
    expect(result.totalAdditions).toBe(2);
    expect(result.totalDeletions).toBe(1);
  });

  it('excludes folder entries from the diff', async () => {
    const client = stubClient(
      [entry({ item: { path: '/src', isFolder: true, objectId: 'tree1' } }), entry()],
      { old1: 'a\n', new1: 'b\n' }
    );
    const result = await new PullRequestService(client).getPullRequestDiff('Proj', 'repo', 42);

    expect(result.totalCount).toBe(1);
    expect(result.files[0].path).toBe('/src/app.ts');
  });

  it('marks binary files as skipped rather than diffing them', async () => {
    // NUL written as an escape, never as a literal byte — a literal NUL makes the
    // whole source file unreadable to grep.
    const client = stubClient([entry()], { old1: 'text\n', new1: 'PNG\0\x01data' });
    const result = await new PullRequestService(client).getPullRequestDiff('Proj', 'repo', 42);

    expect(result.files[0].isBinary).toBe(true);
    expect(result.files[0].skipped).toBe('binary');
    expect(result.totalAdditions).toBe(0);
  });

  it('honours the paths filter', async () => {
    const client = stubClient(
      [entry(), entry({ item: { path: '/src/other.ts', objectId: 'new1', originalObjectId: 'old1', isFolder: false } })],
      { old1: 'a\n', new1: 'b\n' }
    );
    const result = await new PullRequestService(client).getPullRequestDiff('Proj', 'repo', 42, {
      paths: ['/src/other.ts'],
    });

    expect(result.totalCount).toBe(1);
    expect(result.files[0].path).toBe('/src/other.ts');
  });

  it('fetches no new-side blob for a deleted file', async () => {
    const client = stubClient(
      [entry({ changeType: 'delete', item: { path: '/src/gone.ts', objectId: 'old1', originalObjectId: null, isFolder: false } })],
      { old1: 'gone line\n' }
    );
    const result = await new PullRequestService(client).getPullRequestDiff('Proj', 'repo', 42);

    expect(result.files[0].patch).toContain('-gone line');
    expect(result.totalDeletions).toBe(1);
    expect(client.calls.filter((c: string) => c.includes('/blobs/')).length).toBe(1);
  });

  it('reports a blob fetch failure as skipped instead of throwing', async () => {
    const client = stubClient([entry()], { old1: 'a\n' }); // new1 missing
    const result = await new PullRequestService(client).getPullRequestDiff('Proj', 'repo', 42);

    expect(result.files[0].skipped).toBe('fetch-failed');
  });
});
