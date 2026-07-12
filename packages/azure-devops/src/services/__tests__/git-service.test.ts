import { describe, it, expect } from 'vitest';
import {
  GitService,
  selectLatestRelease,
  compareVersionsDescending,
  isVersionLike,
} from '../git-service.js';

/** Minimal AzureDevOpsClient stub: the service only needs these three members. */
function stubClient(pages: Array<{ value: any[]; continuationToken?: string }>) {
  const calls: string[] = [];
  let index = 0;
  return {
    calls,
    apiVersion: '7.1',
    validateProject: () => {},
    requestRaw: async (endpoint: string) => {
      calls.push(endpoint);
      const page = pages[Math.min(index++, pages.length - 1)];
      return {
        data: { value: page.value, count: page.value.length },
        headers: page.continuationToken ? { 'x-ms-continuationtoken': page.continuationToken } : {},
      };
    },
  } as any;
}

const ref = (name: string, objectId = 'sha-' + name) => ({ name: `refs/heads/${name}`, objectId });

describe('compareVersionsDescending', () => {
  it('ranks release/10 above release/9 (a lexical sort gets this backwards)', () => {
    const sorted = ['9', '10', '2'].sort(compareVersionsDescending);
    expect(sorted).toEqual(['10', '9', '2']);
  });

  it('handles dotted versions', () => {
    const sorted = ['1.9', '1.10', '1.2'].sort(compareVersionsDescending);
    expect(sorted[0]).toBe('1.10');
  });
});

describe('isVersionLike', () => {
  it('requires at least one digit', () => {
    expect(isVersionLike('35.0')).toBe(true);
    expect(isVersionLike('2024-Q1')).toBe(true);
    expect(isVersionLike('next')).toBe(false);
    expect(isVersionLike('hotfix-login')).toBe(false);
  });
});

describe('selectLatestRelease', () => {
  it('picks the highest version, not the lexically largest name', () => {
    const result = selectLatestRelease(
      ['release/9', 'release/10', 'release/2'],
      'release/',
    );
    expect(result.branchName).toBe('release/10');
    expect(result.version).toBe('10');
  });

  it('never lets a non-version branch win, and reports it instead of dropping it', () => {
    // 'next' > '35.0' under any string comparison. The si source let it win.
    const result = selectLatestRelease(['release/35.0', 'release/next'], 'release/');

    expect(result.branchName).toBe('release/35.0');
    expect(result.ignored).toEqual(['release/next']);
  });

  it('returns null when every candidate is unrankable', () => {
    const result = selectLatestRelease(['release/next', 'release/hotfix'], 'release/');

    expect(result.branchName).toBeNull();
    expect(result.version).toBeNull();
    expect(result.ignored).toEqual(['release/next', 'release/hotfix']);
  });

  it('ignores branches outside the prefix and the bare prefix itself', () => {
    const result = selectLatestRelease(['main', 'release/', 'release/1.0'], 'release/');

    expect(result.branchName).toBe('release/1.0');
    expect(result.candidates).toEqual(['1.0']);
  });

  it('returns nothing when there are no branches at all', () => {
    expect(selectLatestRelease([], 'release/').branchName).toBeNull();
  });
});

describe('GitService.listBranches', () => {
  it('strips refs/heads/ and keeps the full ref name', async () => {
    const client = stubClient([{ value: [ref('main'), ref('develop')] }]);
    const result = await new GitService(client).listBranches('MyProject', 'MyRepo');

    expect(result.branches).toEqual([
      { name: 'main', fullName: 'refs/heads/main', objectId: 'sha-main', isLocked: false },
      { name: 'develop', fullName: 'refs/heads/develop', objectId: 'sha-develop', isLocked: false },
    ]);
    expect(result.truncated).toBe(false);
    expect(result.branchCount).toBe(2);
  });

  it('follows the x-ms-continuationtoken header across pages', async () => {
    const client = stubClient([
      { value: [ref('a')], continuationToken: 'tok1' },
      { value: [ref('b')] },
    ]);

    const result = await new GitService(client).listBranches('MyProject', 'MyRepo');

    expect(result.branches.map((b) => b.name)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(false);
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]).toContain('continuationToken=tok1');
  });

  it('reports truncated when maxResults stops us mid-stream', async () => {
    const client = stubClient([
      { value: [ref('a'), ref('b')], continuationToken: 'tok1' },
      { value: [ref('c')], continuationToken: 'tok2' },
    ]);

    const result = await new GitService(client).listBranches('MyProject', 'MyRepo', { maxResults: 2 });

    expect(result.branchCount).toBe(2);
    expect(result.truncated).toBe(true);
    // Stopped after the first page: maxResults was already met.
    expect(client.calls).toHaveLength(1);
  });

  it('never returns more than maxResults even if a page overshoots', async () => {
    const client = stubClient([{ value: [ref('a'), ref('b'), ref('c')] }]);

    const result = await new GitService(client).listBranches('MyProject', 'MyRepo', { maxResults: 2 });

    expect(result.branchCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('passes the caller filter through and defaults to heads/', async () => {
    const client = stubClient([{ value: [] }]);
    await new GitService(client).listBranches('MyProject', 'MyRepo');
    expect(client.calls[0]).toContain('filter=heads%2F');

    const client2 = stubClient([{ value: [] }]);
    await new GitService(client2).listBranches('MyProject', 'MyRepo', { filter: 'heads/feature/' });
    expect(client2.calls[0]).toContain('filter=heads%2Ffeature%2F');
  });
});

describe('GitService.getLatestReleaseBranch', () => {
  it('queries only the release prefix and returns the winning tip SHA', async () => {
    const client = stubClient([
      { value: [ref('release/9', 'sha9'), ref('release/10', 'sha10')] },
    ]);

    const result = await new GitService(client).getLatestReleaseBranch('MyProject', 'MyRepo');

    expect(client.calls[0]).toContain('filter=heads%2Frelease%2F');
    expect(result.branchName).toBe('release/10');
    expect(result.objectId).toBe('sha10');
    expect(result.candidateCount).toBe(2);
  });

  it('returns a null branch and no SHA when nothing is rankable', async () => {
    const client = stubClient([{ value: [ref('release/next')] }]);

    const result = await new GitService(client).getLatestReleaseBranch('MyProject', 'MyRepo');

    expect(result.branchName).toBeNull();
    expect(result.objectId).toBeNull();
    expect(result.ignoredNonVersionBranches).toEqual(['release/next']);
  });

  it('honours a custom prefix', async () => {
    const client = stubClient([{ value: [{ name: 'refs/heads/rel/2.0', objectId: 'x' }] }]);

    const result = await new GitService(client).getLatestReleaseBranch('MyProject', 'MyRepo', { prefix: 'rel/' });

    expect(client.calls[0]).toContain('filter=heads%2Frel%2F');
    expect(result.branchName).toBe('rel/2.0');
  });
});
