import * as semver from 'semver';
import type { CodeReviewClient } from '../code-review-client.js';
import type {
  GhePackage,
  GhePackageVersion,
  LatestPackageVersion,
  PaginatedResult,
} from '../models/index.js';

/**
 * From a list of version names, keep only stable release versions (valid SemVer with no prerelease
 * label - so `2.1.0-g066b9a3212` feature builds are excluded) and sort them descending by SemVer.
 * Exported for direct testing: the ported source used a `^\d+\.\d+\.\d+$` regex plus a locale string
 * sort, which mis-orders (`1.9.0` after `1.10.0`); SemVer ordering is correct.
 */
export function selectLatestRelease(versionNames: string[]): {
  latestVersion: string | null;
  allReleaseVersions: string[];
} {
  const releaseVersions = versionNames
    .filter((name) => semver.valid(name) !== null && semver.prerelease(name) === null)
    .sort(semver.rcompare);
  return {
    latestVersion: releaseVersions[0] ?? null,
    allReleaseVersions: releaseVersions,
  };
}

export class PackageService {
  constructor(private readonly client: CodeReviewClient) {}

  async listPackages(org: string, packageType?: string): Promise<PaginatedResult<GhePackage>> {
    return this.client.listOrgPackages(org, packageType);
  }

  async getPackageVersions(
    org: string,
    packageName: string,
    packageType?: string,
  ): Promise<PaginatedResult<GhePackageVersion>> {
    return this.client.getPackageVersions(org, packageName, packageType);
  }

  async getLatestReleaseVersion(org: string, packageName: string): Promise<LatestPackageVersion> {
    const scopedName = packageName.startsWith('@') ? packageName : `@${org}/${packageName}`;
    const versions = await this.client.getPackageVersions(org, packageName);
    const { latestVersion, allReleaseVersions } = selectLatestRelease(versions.items.map((v) => v.name));
    return { packageName: scopedName, org, latestVersion, allReleaseVersions };
  }
}
