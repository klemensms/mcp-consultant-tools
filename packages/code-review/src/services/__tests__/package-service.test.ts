import { describe, it, expect } from 'vitest';
import { PackageService, selectLatestRelease } from '../package-service.js';
import type { GhePackage, GhePackageVersion, PaginatedResult } from '../../models/index.js';

describe('selectLatestRelease', () => {
  it('excludes pre-release/feature versions and returns the highest stable', () => {
    const result = selectLatestRelease(['1.0.0', '2.0.0', '2.1.0-g066b9a3212']);
    expect(result.latestVersion).toBe('2.0.0');
    expect(result.allReleaseVersions).toEqual(['2.0.0', '1.0.0']);
  });

  it('sorts by semver, not lexically (1.10.0 > 1.9.0)', () => {
    expect(selectLatestRelease(['1.9.0', '1.10.0']).latestVersion).toBe('1.10.0');
  });

  it('returns null when there is no stable release version', () => {
    expect(selectLatestRelease(['1.0.0-beta', '2.0.0-alpha']).latestVersion).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(selectLatestRelease([]).latestVersion).toBeNull();
  });
});

// Minimal stub client — plain object, no mocking framework.
function stubClient(versions: string[]): any {
  const versionResult: PaginatedResult<GhePackageVersion> = {
    items: versions.map((name, i) => ({
      id: i,
      name,
      package_html_url: '',
      created_at: '',
      updated_at: '',
    })),
    truncated: false,
  };
  const packagesResult: PaginatedResult<GhePackage> = { items: [], truncated: false };
  return {
    listOrgPackages: async () => packagesResult,
    getPackageVersions: async () => versionResult,
  };
}

describe('PackageService.getLatestReleaseVersion', () => {
  it('selects the latest stable version via the Packages API', async () => {
    const svc = new PackageService(stubClient(['1.0.0', '1.2.0', '1.2.1-preview']));
    const result = await svc.getLatestReleaseVersion('contoso', 'some-package');
    expect(result.latestVersion).toBe('1.2.0');
    expect(result.packageName).toBe('@contoso/some-package');
  });

  it('keeps an already-scoped package name as given', async () => {
    const svc = new PackageService(stubClient(['3.0.0']));
    const result = await svc.getLatestReleaseVersion('contoso', '@contoso/pkg');
    expect(result.packageName).toBe('@contoso/pkg');
  });
});
