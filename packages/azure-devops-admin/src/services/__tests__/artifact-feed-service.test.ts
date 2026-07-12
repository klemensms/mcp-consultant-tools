import { describe, it, expect } from 'vitest';
import { ArtifactFeedService } from '../artifact-feed-service.js';
import type { AdoRequestError } from '../admin-client.js';

function httpError(message: string, status?: number): AdoRequestError {
  const error: AdoRequestError = new Error(message);
  if (status !== undefined) error.status = status;
  return error;
}

/**
 * Stub AdminClient. `handler` receives the endpoint and returns a payload, or
 * throws to simulate an HTTP failure.
 */
function stubClient(handler: (endpoint: string) => any) {
  const calls: string[] = [];
  return {
    calls,
    apiVersion: '7.1',
    feedsUrl: 'https://feeds.dev.azure.com/org',
    validateProject: () => {},
    validateFeed: () => {},
    makeRequest: async (endpoint: string) => {
      calls.push(endpoint);
      return handler(endpoint);
    },
  } as any;
}

const pkgPage = (n: number) => ({ value: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `pkg${i}` })) });

describe('getFeedSummaries', () => {
  it('counts packages by paging, not by trusting one page', async () => {
    // 250 packages across a 200-item page then a 50-item page.
    const client = stubClient((endpoint) => {
      if (endpoint.includes('_apis/packaging/feeds?')) return { value: [{ id: 'f1', name: 'Feed1' }] };
      const skip = Number(new URL(`https://x/${endpoint}`).searchParams.get('$skip'));
      return skip === 0 ? pkgPage(200) : pkgPage(50);
    });

    const result = await new ArtifactFeedService(client).getFeedSummaries();

    expect(result.feeds[0].packageCount).toBe(250);
    expect(result.feeds[0].packageCountTruncated).toBe(false);
    expect(result.totalPackages).toBe(250);
    expect(result.totalPackagesIsLowerBound).toBe(false);
  });

  it('marks the count as a lower bound when it hits maxPackagesPerFeed', async () => {
    // The si source hardcoded top:10, no paging, and reported the capped
    // number as an unqualified total.
    const client = stubClient((endpoint) => {
      if (endpoint.includes('_apis/packaging/feeds?')) return { value: [{ id: 'f1', name: 'Feed1' }] };
      return pkgPage(200);
    });

    const result = await new ArtifactFeedService(client).getFeedSummaries({ maxPackagesPerFeed: 200 });

    expect(result.feeds[0].packageCount).toBe(200);
    expect(result.feeds[0].packageCountTruncated).toBe(true);
    expect(result.totalPackagesIsLowerBound).toBe(true);
  });

  it('reports a 403 feed as unreadable, NOT as a feed with zero packages', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('_apis/packaging/feeds?')) {
        return { value: [{ id: 'ok', name: 'Readable' }, { id: 'no', name: 'Forbidden' }] };
      }
      if (endpoint.includes('/Feeds/no/')) throw httpError('Azure DevOps access denied', 403);
      return pkgPage(3);
    });

    const result = await new ArtifactFeedService(client).getFeedSummaries();

    expect(result.feedCount).toBe(2);
    expect(result.readableFeedCount).toBe(1);
    expect(result.feeds.map((f: any) => f.name)).toEqual(['Readable']);
    expect(result.unreadableFeeds).toHaveLength(1);
    expect(result.unreadableFeeds[0]).toMatchObject({ name: 'Forbidden', status: 403 });
    // A permissions gap must never present as a confident total.
    expect(result.totalPackagesIsLowerBound).toBe(true);
  });

  it('distinguishes a genuinely empty feed from an unreadable one', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('_apis/packaging/feeds?')) return { value: [{ id: 'f1', name: 'Empty' }] };
      return pkgPage(0);
    });

    const result = await new ArtifactFeedService(client).getFeedSummaries();

    expect(result.feeds[0].packageCount).toBe(0);
    expect(result.unreadableFeeds).toEqual([]);
    expect(result.totalPackagesIsLowerBound).toBe(false);
  });

  it('records a null status when the error carries none', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('_apis/packaging/feeds?')) return { value: [{ id: 'f1', name: 'Flaky' }] };
      throw new Error('socket hang up');
    });

    const result = await new ArtifactFeedService(client).getFeedSummaries();

    expect(result.unreadableFeeds[0]).toMatchObject({ name: 'Flaky', status: null });
    expect(result.unreadableFeeds[0].reason).toContain('socket hang up');
  });

  it('uses the feeds host, not the main dev.azure.com host', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('_apis/packaging/feeds?')) return { value: [] };
      return pkgPage(0);
    });
    await new ArtifactFeedService(client).getFeedSummaries();
    expect(client.calls[0]).toContain('_apis/packaging/feeds?');
  });
});

describe('getPackageProvenance', () => {
  const feedList = { value: [{ id: 'pkg-id', name: 'Core', protocolType: 'NuGet' }] };
  const versionList = { value: [{ id: 'ver-id', version: '1.2.3' }] };

  it('returns null (never "unknown") when Azure DevOps exposes no build or branch', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('/packages?')) return feedList;
      if (endpoint.includes('/versions?')) return versionList;
      return { provenanceSource: 'InternalBuild', userAgent: 'NuGet', data: {} };
    });

    const result = await new ArtifactFeedService(client).getPackageProvenance('Acme', 'Core', '1.2.3');

    expect(result.buildId).toBeNull();
    expect(result.branch).toBeNull();
    expect(result.structuredProvenanceAvailable).toBe(false);
    expect(JSON.stringify(result)).not.toContain('unknown');
  });

  it('extracts build and branch from the untyped data bag when present', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('/packages?')) return feedList;
      if (endpoint.includes('/versions?')) return versionList;
      return { provenanceSource: 'InternalBuild', data: { 'build.id': '4242', 'repository.branch': 'refs/heads/main' } };
    });

    const result = await new ArtifactFeedService(client).getPackageProvenance('Acme', 'Core', '1.2.3');

    expect(result.buildId).toBe('4242');
    expect(result.branch).toBe('refs/heads/main');
    expect(result.structuredProvenanceAvailable).toBe(true);
  });

  it('calls the provenance route with its preview api-version, not the client default', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('/packages?')) return feedList;
      if (endpoint.includes('/versions?')) return versionList;
      return { data: {} };
    });

    await new ArtifactFeedService(client).getPackageProvenance('Acme', 'Core', '1.2.3');

    const provenanceCall = client.calls.find((c: string) => c.includes('/provenance?'));
    expect(provenanceCall).toContain('api-version=7.1-preview.1');
  });

  it('matches package name and version case-insensitively', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('/packages?')) return feedList;
      if (endpoint.includes('/versions?')) return versionList;
      return { data: {} };
    });

    const result = await new ArtifactFeedService(client).getPackageProvenance('Acme', 'core', '1.2.3');
    expect(result.packageName).toBe('Core');
  });

  it('names nearby packages when the package is missing', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('/packages?')) return { value: [{ id: 'x', name: 'Other' }] };
      return { value: [] };
    });

    await expect(
      new ArtifactFeedService(client).getPackageProvenance('Acme', 'Core', '1.2.3'),
    ).rejects.toThrow(/not found in feed 'Acme'. Similar packages: Other/);
  });

  it('names available versions when the version is missing', async () => {
    const client = stubClient((endpoint) => {
      if (endpoint.includes('/packages?')) return feedList;
      return { value: [{ id: 'v', version: '9.9.9' }] };
    });

    await expect(
      new ArtifactFeedService(client).getPackageProvenance('Acme', 'Core', '1.2.3'),
    ).rejects.toThrow(/Available versions: 9.9.9/);
  });
});
