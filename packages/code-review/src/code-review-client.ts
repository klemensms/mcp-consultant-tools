import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { CloneManager } from './utils/clone-manager.js';
import type { CloneResult } from './utils/clone-manager.js';
import type { GheAppAuth } from './utils/ghe-app-auth.js';
import type { AzdoEntraAuth } from './utils/azdo-entra-auth.js';
import type { GhePackage, GhePackageVersion, PaginatedResult } from './models/index.js';

export interface CodeReviewConfig {
  provider: 'azure-devops' | 'github-enterprise' | 'github-app';
  /** Defaults to 'pat' when absent, so every existing configuration keeps working untouched. */
  azdoAuthMethod?: 'pat' | 'entra-id';
  azdoOrganization?: string;
  azdoProject?: string;
  azdoPat?: string;
  azdoClientId?: string;
  azdoClientSecret?: string;
  azdoTenantId?: string;
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

const GUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';

/**
 * Azure DevOps names the rejected identity as a backslash triple - `tenant\tenant\principal` - so
 * the principal's object id is the LAST segment, not the first. Taking the first GUID hands an
 * administrator the tenant id labelled as the object id, and a Users search for it finds nothing:
 * a confident, well-formed, wrong answer. Measured against a live tenant 2026-08-13.
 */
function extractPrincipalObjectId(message: string): string | undefined {
  const identity = message.match(new RegExp(`(?:[^\\s\\\\]*\\\\)+[^\\s\\\\]*`))?.[0];
  const lastSegment = identity?.split('\\').filter(Boolean).pop();
  const fromIdentity = lastSegment?.match(new RegExp(GUID, 'i'))?.[0];
  if (fromIdentity) return fromIdentity;

  // No backslash form, or it carried no GUID: the object id is the last GUID in the message.
  const all = message.match(new RegExp(GUID, 'gi'));
  return all?.[all.length - 1];
}

/**
 * Azure DevOps answers a *valid* service-principal token with 401/TF401444 when the principal is
 * not a member of the organisation - an identity-provisioning problem, not a bad credential.
 * Surfaced as a bare 401 it reads as "wrong secret" and sends the reader to the wrong fix, so name
 * it and carry the principal's object id through from the response.
 *
 * Returns null when the body is not a TF401444, leaving the generic 401 handling in place.
 */
export function describeUnprovisionedPrincipal(organization: string | undefined, body: unknown): string | null {
  const message = (body as { message?: unknown } | undefined)?.message;
  if (typeof message !== 'string' || !message.includes('TF401444')) return null;

  const objectId = extractPrincipalObjectId(message);
  return (
    'Azure DevOps rejected the identity, not the credential (TF401444). The token was issued and accepted, but the ' +
    `service principal${objectId ? ` (object id ${objectId})` : ''} is not a member of organization ` +
    `'${organization ?? 'unknown'}'. An Azure DevOps organization administrator must add it under ` +
    'Organization settings > Users and grant it access to the project.'
  );
}

/**
 * A clone authenticates separately from REST and gets no `TF401444` body to read - git only ever
 * reports `fatal: Authentication failed`. Whoever's first command happens to clone would otherwise
 * be handed a raw git error with nothing pointing at organisation membership, so attach the same
 * explanation the REST path gives. Returns null for a non-auth clone failure, so a genuine error
 * (missing repo, bad branch) is never buried under an authentication guess.
 */
export function describeCloneAuthFailure(
  organization: string | undefined,
  authMethod: 'pat' | 'entra-id' | undefined,
  message: string,
): string | null {
  // git reports a rejected credential as "Authentication failed", and a *missing* one as
  // "could not read Username/Password ... terminal prompts disabled". Both are auth failures here.
  if (!/Authentication failed|could not read (Username|Password)|invalid credentials/i.test(message)) return null;

  if (authMethod === 'entra-id') {
    return (
      'The Entra token was rejected for this repository. Git cannot report why, but the usual cause is the one the ' +
      `REST API names explicitly as TF401444: the service principal is not a member of organization ` +
      `'${organization ?? 'unknown'}'. An Azure DevOps organization administrator must add it under Organization ` +
      'settings > Users and grant it access to the project. Run cr-list-repos to get the principal object id to quote.'
    );
  }
  return `The Azure DevOps PAT was rejected for this repository. Check that it is current and carries the Code (read) scope for organization '${organization ?? 'unknown'}'.`;
}

/**
 * SAML SSO authorization and the "Settings > Developer settings" page are GitHub concepts. Sent to
 * someone on the Azure DevOps provider they name a page that does not exist for them, so the reader
 * spends their time in the wrong product - a confidently wrong hint costs more than no hint. Branch
 * both of these on the provider actually in use.
 */
export function notFoundHint(provider: string, organization?: string): string {
  if (provider === 'azure-devops') {
    return (
      'Check the project and repository names - an Azure DevOps project name taken from a clone URL or an ' +
      `older document is often stale. Run cr-list-repos with no --project to see the projects organization ` +
      `'${organization ?? 'unknown'}' actually holds.`
    );
  }
  return (
    'Check the name; for a GitHub org the token may also need SAML SSO authorization ' +
    '(Settings > Developer settings > Personal access tokens > Configure SSO).'
  );
}

export function forbiddenHint(provider: string, authMethod?: 'pat' | 'entra-id'): string {
  if (provider === 'azure-devops') {
    return authMethod === 'entra-id'
      ? 'The Entra service principal is authenticated but not authorized for this resource. It needs at least Code (read) on the project, granted under Project settings > Repositories > Security.'
      : "The Azure DevOps PAT lacks the required scope. It needs at least Code (read), and a PAT is scoped per organization - check it was issued for this one.";
  }
  return `The ${provider} token lacks the required scope/permission (or is rate-limited, or needs SAML SSO authorization).`;
}

export class CodeReviewClient {
  private readonly config: CodeReviewConfig;
  private readonly httpClient: AxiosInstance;
  private readonly cloneManager: CloneManager;
  private readonly gheAppAuth?: GheAppAuth;
  private readonly azdoEntraAuth?: AzdoEntraAuth;

  constructor(config: CodeReviewConfig, gheAppAuth?: GheAppAuth, azdoEntraAuth?: AzdoEntraAuth) {
    this.config = config;
    this.cloneManager = new CloneManager();
    this.gheAppAuth = gheAppAuth;
    this.azdoEntraAuth = config.azdoAuthMethod === 'entra-id' ? azdoEntraAuth : undefined;

    if (config.provider === 'azure-devops') {
      if (!config.azdoOrganization) {
        throw new Error('Azure DevOps requires AZDO_ORGANIZATION');
      }
      const azdoAxios = {
        baseURL: `https://dev.azure.com/${config.azdoOrganization}`,
        params: { 'api-version': '7.1' },
        // Azure DevOps answers an unauthenticated REST call with a 302 to a sign-in page rather
        // than a 401. Followed, that yields an HTML body with no `value` array and the caller dies
        // on `undefined.map` - an auth failure disguised as a parse crash. Refuse the redirect so
        // it surfaces as the authentication error it is.
        maxRedirects: 0,
      };
      if (config.azdoAuthMethod === 'entra-id') {
        if (!azdoEntraAuth) {
          throw new Error(
            'Azure DevOps entra-id auth requires AZDO_CLIENT_ID, AZDO_CLIENT_SECRET, and AZDO_TENANT_ID',
          );
        }
        this.httpClient = axios.create(azdoAxios);
        this.httpClient.interceptors.request.use(async (reqConfig) => {
          reqConfig.headers.Authorization = `Bearer ${await azdoEntraAuth.getToken()}`;
          return reqConfig;
        });
      } else {
        if (!config.azdoPat) {
          throw new Error('Azure DevOps requires AZDO_ORGANIZATION and AZDO_PAT');
        }
        this.httpClient = axios.create({
          ...azdoAxios,
          headers: {
            Authorization: `Basic ${Buffer.from(`:${config.azdoPat}`).toString('base64')}`,
          },
        });
      }
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
    // Set only for the Azure DevOps entra-id path, where the credential travels in a git header
    // instead of the clone URL. Every other provider keeps embedding its token as URL userinfo.
    let bearerToken: string | undefined;
    if (this.config.provider === 'azure-devops') {
      if (this.azdoEntraAuth) {
        bearerToken = await this.azdoEntraAuth.getToken();
        cloneUrl = this.cloneManager.buildAzdoBearerCloneUrl(this.config.azdoOrganization!, project, repo);
      } else {
        cloneUrl = this.cloneManager.buildAzdoCloneUrl(this.config.azdoOrganization!, project, repo, this.config.azdoPat!);
      }
    } else if (this.config.provider === 'github-app') {
      const token = await this.gheAppAuth!.getToken();
      cloneUrl = this.cloneManager.buildGheAppCloneUrl(this.config.gheBaseUrl!, project, repo, token);
    } else {
      cloneUrl = this.cloneManager.buildGheCloneUrl(this.config.gheBaseUrl!, project, repo, this.config.gheToken!);
    }
    return this.cloneManager.clone(cloneUrl, { branch, bearerToken }).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.config.provider !== 'azure-devops') throw err;
      const hint = describeCloneAuthFailure(this.config.azdoOrganization, this.config.azdoAuthMethod, err.message);
      throw hint ? new Error(`${err.message}\n\n${hint}`) : err;
    });
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
   * Translate an axios error into a clear, status-aware message for every GHE/AzDO call - not just
   * the one repository-list path the ported source handled. A 401/403 should say "auth/permission",
   * not surface as a raw axios stack.
   */
  private raiseGitError(error: unknown, context: string): never {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const provider = this.config.provider;
      // Azure DevOps redirects to sign-in instead of answering 401 when the credential is rejected.
      if (status === 302 || status === 203) {
        throw new Error(
          `Authentication failed while ${context} (${status}: Azure DevOps redirected to sign-in). ` +
            `The ${this.config.azdoAuthMethod === 'entra-id' ? 'Entra access token' : 'PAT'} was rejected - check the credential and the organization name.`,
        );
      }
      if (status === 401) {
        const unprovisioned = describeUnprovisionedPrincipal(this.config.azdoOrganization, error.response.data);
        if (unprovisioned) {
          throw new Error(`${unprovisioned} (while ${context})`);
        }
        throw new Error(`Authentication failed while ${context} (401). The ${provider} token is missing, invalid, or expired.`);
      }
      if (status === 403) {
        throw new Error(`Forbidden while ${context} (403). ${forbiddenHint(provider, this.config.azdoAuthMethod)}`);
      }
      if (status === 404) {
        throw new Error(`Not found while ${context} (404). ${notFoundHint(provider, this.config.azdoOrganization)}`);
      }
      throw new Error(`Request failed while ${context} (${status}).`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
