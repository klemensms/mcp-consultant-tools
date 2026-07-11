import { describe, it, expect } from 'vitest';
import { CodeReviewClient, parseNextLink, normalizeGheApiBase } from '../code-review-client.js';

describe('parseNextLink', () => {
  it('extracts the rel="next" URL from a Link header', () => {
    const header =
      '<https://ghe.example.com/api/v3/orgs/o/repos?page=2>; rel="next", <https://ghe.example.com/api/v3/orgs/o/repos?page=5>; rel="last"';
    expect(parseNextLink(header)).toBe('https://ghe.example.com/api/v3/orgs/o/repos?page=2');
  });

  it('returns null when there is no next page', () => {
    expect(parseNextLink('<https://x/page=5>; rel="last"')).toBeNull();
    expect(parseNextLink(undefined)).toBeNull();
  });
});

describe('normalizeGheApiBase', () => {
  it('appends /api/v3 when absent', () => {
    expect(normalizeGheApiBase('https://ghe.example.com')).toBe('https://ghe.example.com/api/v3');
  });
  it('leaves an existing /api/v3 alone', () => {
    expect(normalizeGheApiBase('https://ghe.example.com/api/v3')).toBe('https://ghe.example.com/api/v3');
  });
});

describe('constructor config validation', () => {
  it('rejects azure-devops without organization/PAT', () => {
    expect(() => new CodeReviewClient({ provider: 'azure-devops' })).toThrow(/AZDO_ORGANIZATION|AZDO_PAT/);
  });
  it('rejects github-enterprise without base URL/token', () => {
    expect(() => new CodeReviewClient({ provider: 'github-enterprise' })).toThrow(/GHE_BASE_URL|GHE_TOKEN/);
  });
});

describe('Packages API provider guards (surface the real limitation, never a masked 403)', () => {
  it('github-app: package operations refuse with a clear message (Apps cannot use the Packages API)', async () => {
    const client = new CodeReviewClient(
      { provider: 'github-app', gheBaseUrl: 'https://ghe.example.com', gheAppId: '1', gheInstallationId: '2' },
      { getToken: async () => 'tok' } as any,
    );
    await expect(client.listOrgPackages('contoso')).rejects.toThrow(/github-app|GitHub App|read:packages/);
    await expect(client.getPackageVersions('contoso', 'pkg')).rejects.toThrow(/github-app|GitHub App|read:packages/);
  });

  it('azure-devops: package operations refuse (GitHub-only feature)', async () => {
    const client = new CodeReviewClient({
      provider: 'azure-devops',
      azdoOrganization: 'contoso',
      azdoPat: 'pat',
    });
    await expect(client.listOrgPackages('contoso')).rejects.toThrow(/github-enterprise/);
  });
});
