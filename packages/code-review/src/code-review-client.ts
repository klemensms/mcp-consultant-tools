import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { CloneManager } from './utils/clone-manager.js';
import type { CloneResult } from './utils/clone-manager.js';
import type { GheAppAuth } from './utils/ghe-app-auth.js';
import type { GhePackage, GhePackageVersion, PaginatedResult } from './models/index.js';

export interface CodeReviewConfig {
  provider: 'azure-devops' | 'github-enterprise' | 'github-app';
  azdoOrganization?: string;
  azdoProject?: string;
  azdoPat?: string;
  gheBaseUrl?: string;
  gheToken?: string;
  gheAppId?: string;
  gheInstallationId?: string;
  ghePrivateKeyPath?: string;
  ghePrivateKey?: string;
}

export interface RepositoryInfo {
  id: string;
  name: string;
  defaultBranch: string;
  url: string;
  size: number;
  project: string;
}

// Ceiling: follow at most this many Link pages (~100 items each) before reporting truncated.
// Raise if an org ever legitimately exceeds ~2000 repos/packages/versions.
const PAGE_CAP = 20;
const PER_PAGE = 100;

/** Extract the rel="next" URL from a GitHub `Link` header, or null when there is no next page. */
export function parseNextLink(linkHeader?: string): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/** Ensure a GHE base URL carries the REST `/api/v3` prefix (GitHub Enterprise Server), added once. */
export function normalizeGheApiBase(gheBaseUrl: string): string {
  return gheBaseUrl.endsWith('/api/v3') ? gheBaseUrl : `${gheBaseUrl}/api/v3`;
}

export class CodeReviewClient {
  private readonly config: CodeReviewConfig;
  private readonly httpClient: AxiosInstance;
  private readonly cloneManager: CloneManager;
  private readonly gheAppAuth?: GheAppAuth;

  constructor(config: CodeReviewConfig, gheAppAuth?: GheAppAuth) {
    this.config = config;
    this.cloneManager = new CloneManager();
    this.gheAppAuth = gheAppAuth;

    if (config.provider === 'azure-devops') {
      if (!config.azdoOrganization || !config.azdoPat) {
        throw new Error('Azure DevOps requires AZDO_ORGANIZATION and AZDO_PAT');
      }
      this.httpClient = axios.create({
        baseURL: `https://dev.azure.com/${config.azdoOrganization}`,
        headers: {
          Authorization: `Basic ${Buffer.from(`:${config.azdoPat}`).toString('base64')}`,
        },
        params: { 'api-version': '7.1' },
      });
    } else if (config.provider === 'github-app') {
      if (!config.gheBaseUrl || !gheAppAuth) {
        throw new Error('GitHub App requires GHE_BASE_URL and a configured GitHub App (GHE_APP_ID, GHE_INSTALLATION_ID, GHE_PRIVATE_KEY[_PATH])');
      }
      this.httpClient = axios.create({
        baseURL: normalizeGheApiBase(config.gheBaseUrl),
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      this.httpClient.interceptors.request.use(async (reqConfig) => {
        const token = await gheAppAuth.getToken();
        reqConfig.headers.Authorization = `Bearer ${token}`;
        return reqConfig;
      });
    } else {
      if (!config.gheBaseUrl || !config.gheToken) {
        throw new Error('GitHub Enterprise requires GHE_BASE_URL and GHE_TOKEN');
      }
      this.httpClient = axios.create({
        baseURL: normalizeGheApiBase(config.gheBaseUrl),
        headers: {
          Authorization: `Bearer ${config.gheToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
    }
  }

  async listRepositories(project?: string): Promise<PaginatedResult<RepositoryInfo>> {
    if (this.config.provider === 'azure-devops') {
      return this.listAzdoRepositories(project);
    }
    return this.listGheRepositories(project);
  }

  async getDefaultBranch(project: string, repo: string): Promise<string> {
    if (this.config.provider === 'azure-devops') {
      const response = await this.httpClient
        .get(`/${project}/_apis/git/repositories/${repo}`)
        .catch((e) => this.raiseGitError(e, `getting default branch for ${repo}`));
      const branch = response.data.defaultBranch as string;
      return (branch ?? '').replace('refs/heads/', '');
    }
    const response = await this.httpClient
      .get(`/repos/${project}/${repo}`)
      .catch((e) => this.raiseGitError(e, `getting default branch for ${project}/${repo}`));
    return response.data.default_branch as string;
  }

  async cloneRepository(project: string, repo: string, branch?: string): Promise<CloneResult> {
    let cloneUrl: string;
    if (this.config.provider === 'azure-devops') {
      cloneUrl = this.cloneManager.buildAzdoCloneUrl(this.config.azdoOrganization!, project, repo, this.config.azdoPat!);
    } else if (this.config.provider === 'github-app') {
      const token = await this.gheAppAuth!.getToken();
      cloneUrl = this.cloneManager.buildGheAppCloneUrl(this.config.gheBaseUrl!, project, repo, token);
    } else {
      cloneUrl = this.cloneManager.buildGheCloneUrl(this.config.gheBaseUrl!, project, repo, this.config.gheToken!);
    }
    return this.cloneManager.clone(cloneUrl, { branch });
  }

  async listOrgPackages(org: string, packageType: string = 'npm'): Promise<PaginatedResult<GhePackage>> {
    this.requireGhePackagesProvider();
    return this.getPaged<GhePackage>(`/orgs/${org}/packages`, { package_type: packageType }, `listing packages for ${org}`);
  }

  async getPackageVersions(
    org: string,
    packageName: string,
    packageType: string = 'npm',
  ): Promise<PaginatedResult<GhePackageVersion>> {
    this.requireGhePackagesProvider();
    const encodedName = encodeURIComponent(packageName);
    return this.getPaged<GhePackageVersion>(
      `/orgs/${org}/packages/${packageType}/${encodedName}/versions`,
      {},
      `getting versions for ${packageName}`,
    );
  }

  /**
   * The GitHub Packages REST API works only with a classic PAT that has `read:packages`. Azure
   * DevOps has no equivalent, and GitHub App installation tokens are rejected with 403 (a
   * long-standing, GitHub-confirmed limitation). Refuse up front with a clear message instead of
   * letting the request 403 and be masked as some other failure.
   */
  private requireGhePackagesProvider(): void {
    if (this.config.provider === 'azure-devops') {
      throw new Error('GitHub Packages API requires the github-enterprise provider (set CODE_REVIEW_PROVIDER=github-enterprise).');
    }
    if (this.config.provider === 'github-app') {
      throw new Error(
        'GitHub Packages API cannot be used with the github-app provider: GitHub Apps cannot authenticate to the Packages API (they receive 403). ' +
          'Use CODE_REVIEW_PROVIDER=github-enterprise with a classic PAT that has the read:packages scope.',
      );
    }
  }

  private async getPaged<T>(
    url: string,
    params: Record<string, unknown>,
    context: string,
  ): Promise<PaginatedResult<T>> {
    const items: T[] = [];
    let nextUrl: string | null = url;
    let nextParams: Record<string, unknown> | undefined = { ...params, per_page: PER_PAGE };
    let pages = 0;
    let truncated = false;

    while (nextUrl) {
      if (pages >= PAGE_CAP) {
        truncated = true;
        break;
      }
      let response;
      try {
        response = await this.httpClient.get(nextUrl, nextParams ? { params: nextParams } : undefined);
      } catch (e) {
        this.raiseGitError(e, context);
      }
      if (Array.isArray(response!.data)) items.push(...(response!.data as T[]));
      // The Link "next" URL is absolute and already carries its query string.
      nextUrl = parseNextLink(response!.headers?.link);
      nextParams = undefined;
      pages++;
    }

    return { items, truncated };
  }

  private async listAzdoRepositories(project?: string): Promise<PaginatedResult<RepositoryInfo>> {
    const proj = project ?? this.config.azdoProject;
    if (!proj) {
      throw new Error('Project is required. Set AZDO_PROJECT or pass --project.');
    }
    const response = await this.httpClient
      .get(`/${proj}/_apis/git/repositories`)
      .catch((e) => this.raiseGitError(e, `listing repositories for ${proj}`));
    const items = (response.data.value as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      defaultBranch: ((r.defaultBranch as string) || '').replace('refs/heads/', ''),
      url: r.remoteUrl as string,
      size: r.size as number,
      project: proj,
    }));
    return { items, truncated: false };
  }

  private async listGheRepositories(org?: string): Promise<PaginatedResult<RepositoryInfo>> {
    const owner = org ?? new URL(this.config.gheBaseUrl!).pathname.split('/')[1];
    if (!owner) {
      throw new Error('Organization/owner is required for GitHub Enterprise.');
    }
    const paged = await this.getPaged<Record<string, unknown>>(
      `/orgs/${owner}/repos`,
      { sort: 'updated' },
      `listing repositories for ${owner}`,
    );
    return {
      items: paged.items.map((r) => ({
        id: String(r.id),
        name: r.name as string,
        defaultBranch: r.default_branch as string,
        url: r.clone_url as string,
        size: r.size as number,
        project: owner,
      })),
      truncated: paged.truncated,
    };
  }

  /**
   * Translate an axios error into a clear, status-aware message for every GHE/AzDO call — not just
   * the one repository-list path the ported source handled. A 401/403 should say "auth/permission",
   * not surface as a raw axios stack.
   */
  private raiseGitError(error: unknown, context: string): never {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const provider = this.config.provider;
      if (status === 401) {
        throw new Error(`Authentication failed while ${context} (401). The ${provider} token is missing, invalid, or expired.`);
      }
      if (status === 403) {
        throw new Error(
          `Forbidden while ${context} (403). The ${provider} token lacks the required scope/permission (or is rate-limited, or needs SAML SSO authorization).`,
        );
      }
      if (status === 404) {
        throw new Error(
          `Not found while ${context} (404). Check the name; for a GitHub org the token may also need SAML SSO authorization (Settings > Developer settings > Personal access tokens > Configure SSO).`,
        );
      }
      throw new Error(`Request failed while ${context} (${status}).`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
