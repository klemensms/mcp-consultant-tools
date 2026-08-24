/**
 * Artifact feed operations for Azure DevOps Admin.
 *
 * Packaging API facts (Microsoft Learn, api-version 7.1):
 * - Feeds live on `feeds.dev.azure.com`, NOT `pkgs.dev.azure.com` (which serves
 *   protocol-specific routes only). `AdminClient.feedsUrl` is the right host.
 * - The packages list returns a bare array with NO total count and NO
 *   continuation token; counting means paging with `$top`/`$skip`.
 * - Package version PROVENANCE has no GA version - it is `7.1-preview.1` - and
 *   exposes no documented build/branch/commit field. Everything of that sort
 *   lives in an untyped `data` bag whose keys vary by protocol.
 */
import { getAdoErrorStatus, type AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

/** Page size used when counting packages in a feed. */
const PACKAGE_PAGE_SIZE = 200;

/**
 * The provenance endpoint has never gone GA. Pinning `7.1` (the client default)
 * would not resolve it, so this route carries its own preview api-version.
 */
const PROVENANCE_API_VERSION = '7.1-preview.1';

/**
 * Keys under `provenance.data` that have been observed to carry build/branch
 * information. Undocumented and protocol-dependent: absence means "not exposed",
 * never "unknown build".
 */
const PROVENANCE_BUILD_KEYS = ['build.id', 'buildId', 'System.DefinitionId'];
const PROVENANCE_BRANCH_KEYS = ['repository.branch', 'branch', 'Build.SourceBranch'];

function firstPresent(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return null;
}

export class ArtifactFeedService {
  constructor(private client: AdminClient) {}

  async listFeedPackages(
    feedName: string,
    options?: { project?: string; namePrefix?: string; packageType?: string; top?: number }
  ): Promise<any> {
    this.client.validateFeed(feedName);
    if (options?.project) {
      this.client.validateProject(options.project);
    }

    const projectPrefix = options?.project ? `${options.project}/` : '';
    const queryParams = new URLSearchParams();
    queryParams.append('api-version', this.client.apiVersion);
    if (options?.namePrefix) queryParams.append('packageNameQuery', options.namePrefix);
    if (options?.packageType) queryParams.append('protocolType', options.packageType);
    if (options?.top) queryParams.append('$top', String(options.top));

    const endpoint = `${projectPrefix}_apis/packaging/Feeds/${encodeURIComponent(feedName)}/packages?${queryParams.toString()}`;

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      endpoint, 'GET', undefined, undefined, undefined, this.client.feedsUrl
    );

    return {
      feed: feedName,
      project: options?.project || '(org-scoped)',
      totalCount: response.value.length,
      packages: response.value.map((pkg: any) => ({
        id: pkg.id,
        name: pkg.name,
        protocolType: pkg.protocolType,
        latestVersion: pkg.versions?.[0]?.version,
        publishDate: pkg.versions?.[0]?.publishDate,
        description: pkg.description,
      })),
    };
  }

  async getPackageVersions(
    feedName: string,
    packageName: string,
    options?: { project?: string; packageType?: string; top?: number; includeDelisted?: boolean }
  ): Promise<any> {
    this.client.validateFeed(feedName);
    if (options?.project) {
      this.client.validateProject(options.project);
    }

    // Step 1: Resolve package name -> package ID
    const projectPrefix = options?.project ? `${options.project}/` : '';
    const listParams = new URLSearchParams();
    listParams.append('api-version', this.client.apiVersion);
    listParams.append('packageNameQuery', packageName);
    if (options?.packageType) listParams.append('protocolType', options.packageType);

    const listEndpoint = `${projectPrefix}_apis/packaging/Feeds/${encodeURIComponent(feedName)}/packages?${listParams.toString()}`;
    const listResponse = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      listEndpoint, 'GET', undefined, undefined, undefined, this.client.feedsUrl
    );

    const exactMatch = listResponse.value.find(
      (pkg: any) => pkg.name.toLowerCase() === packageName.toLowerCase()
    );

    if (!exactMatch) {
      const available = listResponse.value.map((pkg: any) => pkg.name).slice(0, 10);
      throw new Error(
        `Package '${packageName}' not found in feed '${feedName}'. ` +
        (available.length > 0
          ? `Similar packages: ${available.join(', ')}`
          : 'No matching packages found.')
      );
    }

    // Step 2: Get versions for the resolved package ID
    const versionParams = new URLSearchParams();
    versionParams.append('api-version', this.client.apiVersion);
    if (options?.top) versionParams.append('$top', String(options.top));
    if (options?.includeDelisted) versionParams.append('includeDelisted', 'true');

    const versionEndpoint = `${projectPrefix}_apis/packaging/Feeds/${encodeURIComponent(feedName)}/packages/${exactMatch.id}/versions?${versionParams.toString()}`;
    const versionResponse = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      versionEndpoint, 'GET', undefined, undefined, undefined, this.client.feedsUrl
    );

    return {
      feed: feedName,
      project: options?.project || '(org-scoped)',
      packageName: exactMatch.name,
      packageId: exactMatch.id,
      protocolType: exactMatch.protocolType,
      versions: versionResponse.value.map((v: any) => ({
        version: v.version,
        publishDate: v.publishDate,
        isLatest: v.isLatest ?? false,
        isListed: v.isListed ?? true,
        description: v.description,
      })),
    };
  }

  /** List feeds. Omit `project` for organisation-scoped feeds. */
  async listFeeds(project?: string): Promise<any[]> {
    if (project) this.client.validateProject(project);

    const projectPrefix = project ? `${project}/` : '';
    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${projectPrefix}_apis/packaging/feeds?api-version=${this.client.apiVersion}`,
      'GET', undefined, undefined, undefined, this.client.feedsUrl
    );
    return response.value ?? [];
  }

  /**
   * Count packages in one feed by paging until a short page arrives.
   *
   * Returns `truncated: true` when `maxPackages` was reached first, in which
   * case `count` is a lower bound. The API exposes no total, so a single
   * unpaged call would silently cap the count.
   */
  private async countPackages(
    feedId: string,
    project: string | undefined,
    maxPackages: number
  ): Promise<{ count: number; truncated: boolean }> {
    const projectPrefix = project ? `${project}/` : '';
    let count = 0;

    while (count < maxPackages) {
      const params = new URLSearchParams({
        'api-version': this.client.apiVersion,
        $top: String(Math.min(PACKAGE_PAGE_SIZE, maxPackages - count)),
        $skip: String(count),
      });
      const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
        `${projectPrefix}_apis/packaging/Feeds/${encodeURIComponent(feedId)}/packages?${params.toString()}`,
        'GET', undefined, undefined, undefined, this.client.feedsUrl
      );
      const page = response.value ?? [];
      count += page.length;

      // A short page means we reached the end of the feed.
      if (page.length < Number(params.get('$top'))) {
        return { count, truncated: false };
      }
    }

    return { count, truncated: true };
  }

  /**
   * All feeds with their package counts.
   *
   * A feed we could not read is reported under `unreadableFeeds` with its HTTP
   * status - never as a feed with zero packages. The si source caught every
   * error and recorded `packageCount: 0`, so a 403 was indistinguishable from
   * an empty feed.
   */
  async getFeedSummaries(
    options?: { project?: string; maxPackagesPerFeed?: number }
  ): Promise<any> {
    const maxPackagesPerFeed = options?.maxPackagesPerFeed ?? 1000;
    const feeds = await this.listFeeds(options?.project);

    const summaries: any[] = [];
    const unreadableFeeds: any[] = [];

    for (const feed of feeds) {
      const feedProject = feed.project?.name ?? options?.project;
      try {
        const { count, truncated } = await this.countPackages(feed.id, feedProject, maxPackagesPerFeed);
        summaries.push({
          id: feed.id,
          name: feed.name,
          project: feed.project?.name ?? '(org-scoped)',
          packageCount: count,
          /** When true, packageCount is a lower bound, not a total. */
          packageCountTruncated: truncated,
        });
      } catch (error: any) {
        unreadableFeeds.push({
          id: feed.id,
          name: feed.name,
          project: feed.project?.name ?? '(org-scoped)',
          status: getAdoErrorStatus(error) ?? null,
          reason: error?.message ?? 'unknown error',
        });
      }
    }

    const anyTruncated = summaries.some((feed) => feed.packageCountTruncated);

    return {
      project: options?.project ?? '(org-scoped)',
      feedCount: feeds.length,
      readableFeedCount: summaries.length,
      totalPackages: summaries.reduce((sum, feed) => sum + feed.packageCount, 0),
      /** True when any feed hit its cap, or any feed could not be read. */
      totalPackagesIsLowerBound: anyTruncated || unreadableFeeds.length > 0,
      feeds: summaries,
      unreadableFeeds,
    };
  }

  /**
   * Publish provenance for one package version.
   *
   * Azure DevOps publishes NO structured build/branch/commit field for a package
   * version. `provenanceSource`, `publisherUserIdentity` and `userAgent` are the
   * only typed fields; everything else lives in an untyped `data` bag. We surface
   * `data` verbatim and additionally attempt a best-effort build/branch lookup
   * over known key names, returning `null` - never the string "unknown" - when a
   * key is absent, so an agent cannot mistake absence for a real value.
   */
  async getPackageProvenance(
    feedName: string,
    packageName: string,
    version: string,
    options?: { project?: string; packageType?: string }
  ): Promise<any> {
    this.client.validateFeed(feedName);
    if (options?.project) this.client.validateProject(options.project);

    const projectPrefix = options?.project ? `${options.project}/` : '';

    // Resolve package name -> id.
    const listParams = new URLSearchParams({
      'api-version': this.client.apiVersion,
      packageNameQuery: packageName,
    });
    if (options?.packageType) listParams.append('protocolType', options.packageType);

    const listResponse = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${projectPrefix}_apis/packaging/Feeds/${encodeURIComponent(feedName)}/packages?${listParams.toString()}`,
      'GET', undefined, undefined, undefined, this.client.feedsUrl
    );
    const pkg = (listResponse.value ?? []).find(
      (candidate: any) => String(candidate.name ?? '').toLowerCase() === packageName.toLowerCase()
    );
    if (!pkg) {
      const nearby = (listResponse.value ?? []).map((p: any) => p.name).slice(0, 10);
      throw new Error(
        `Package '${packageName}' not found in feed '${feedName}'.` +
        (nearby.length ? ` Similar packages: ${nearby.join(', ')}` : '')
      );
    }

    // Resolve version string -> version id.
    const versionsResponse = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `${projectPrefix}_apis/packaging/Feeds/${encodeURIComponent(feedName)}/packages/${pkg.id}/versions?api-version=${this.client.apiVersion}`,
      'GET', undefined, undefined, undefined, this.client.feedsUrl
    );
    const packageVersion = (versionsResponse.value ?? []).find(
      (candidate: any) => String(candidate.version ?? '').toLowerCase() === version.toLowerCase()
    );
    if (!packageVersion) {
      const nearby = (versionsResponse.value ?? []).map((v: any) => v.version).slice(0, 10);
      throw new Error(
        `Version '${version}' not found for package '${packageName}' in feed '${feedName}'.` +
        (nearby.length ? ` Available versions: ${nearby.join(', ')}` : '')
      );
    }

    const provenance = await this.client.makeRequest<any>(
      `${projectPrefix}_apis/packaging/Feeds/${encodeURIComponent(feedName)}/Packages/${pkg.id}/Versions/${packageVersion.id}/provenance?api-version=${PROVENANCE_API_VERSION}`,
      'GET', undefined, undefined, undefined, this.client.feedsUrl
    );

    const data: Record<string, unknown> = provenance?.provenance?.data ?? provenance?.data ?? {};
    const buildId = firstPresent(data, PROVENANCE_BUILD_KEYS);
    const branch = firstPresent(data, PROVENANCE_BRANCH_KEYS);

    return {
      feed: feedName,
      project: options?.project ?? '(org-scoped)',
      packageName: pkg.name,
      packageId: pkg.id,
      version: packageVersion.version,
      packageVersionId: packageVersion.id,
      protocolType: pkg.protocolType,
      provenanceApiVersion: PROVENANCE_API_VERSION,
      provenanceSource: provenance?.provenanceSource ?? null,
      publisherUserIdentity: provenance?.publisherUserIdentity ?? null,
      userAgent: provenance?.userAgent ?? null,
      /** Best-effort. Null means Azure DevOps did not expose it, not "unknown". */
      buildId,
      branch,
      /** True when neither a build nor a branch could be read from `data`. */
      structuredProvenanceAvailable: buildId !== null || branch !== null,
      /** The raw, untyped provenance bag, verbatim. Keys vary by package protocol. */
      data,
    };
  }
}
