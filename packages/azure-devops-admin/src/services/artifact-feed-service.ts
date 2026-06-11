/**
 * Artifact feed operations for Azure DevOps Admin.
 */
import type { AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

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
}
