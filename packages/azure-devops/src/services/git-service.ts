/**
 * Git Service - Azure DevOps repository branch operations
 *
 * Refs API notes (Microsoft Learn, api-version 7.1):
 * - `filter` is a PREFIX match, and `ref.name` comes back as the FULL ref
 *   (`refs/heads/main`), never the short name.
 * - A ref carries `objectId` (the commit SHA) and NO date. Ordering branches by
 *   time is therefore impossible from this endpoint alone.
 * - `$top` caps at 1000; more results arrive via the `x-ms-continuationtoken`
 *   RESPONSE header, fed back as a `continuationToken` query param.
 */
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { AdoApiCollectionResponse } from '../models/index.js';

/** Azure DevOps caps `$top` on the refs endpoint at 1000. */
const MAX_PAGE_SIZE = 1000;

const DEFAULT_RELEASE_PREFIX = 'release/';

export interface GitRef {
  name: string;
  objectId: string;
  isLocked?: boolean;
  creator?: { displayName?: string };
}

export interface Branch {
  /** Short name, e.g. `main` (the `refs/heads/` prefix stripped). */
  name: string;
  /** Full ref name exactly as Azure DevOps returned it, e.g. `refs/heads/main`. */
  fullName: string;
  /** Commit SHA at the tip. The refs API exposes no commit date. */
  objectId: string;
  isLocked: boolean;
}

export interface ListBranchesResult {
  project: string;
  repositoryId: string;
  filter: string;
  branchCount: number;
  /** True when more branches exist than `maxResults` allowed us to return. */
  truncated: boolean;
  branches: Branch[];
}

export interface LatestReleaseBranchResult {
  project: string;
  repositoryId: string;
  prefix: string;
  /** Null when no release branch carries a comparable version. */
  branchName: string | null;
  /** The portion after `prefix`, e.g. `35.0` for `release/35.0`. */
  version: string | null;
  objectId: string | null;
  sortedBy: 'version (digit-aware natural sort, descending)';
  candidateCount: number;
  /** Versions considered, best first. Capped for readability. */
  candidates: string[];
  /**
   * Branches under `prefix` with no digit in their name (`release/next`).
   * Natural sort cannot rank these against `release/35.0`, and letting one win
   * would be arbitrary, so they are excluded — but never silently.
   */
  ignoredNonVersionBranches: string[];
  truncated: boolean;
}

/** `refs/heads/main` -> `main`. Leaves an already-short name alone. */
function shortBranchName(fullRefName: string): string {
  return fullRefName.startsWith('refs/heads/')
    ? fullRefName.slice('refs/heads/'.length)
    : fullRefName;
}

/**
 * Digit-aware descending comparison, so `release/10` beats `release/9`.
 * A plain lexical sort gets this backwards.
 */
export function compareVersionsDescending(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
}

/** A version string is only rankable if it contains at least one digit. */
export function isVersionLike(version: string): boolean {
  return /\d/.test(version);
}

/**
 * Pick the newest release branch by version name.
 *
 * Exported and pure so the ordering rules can be tested without a repository.
 */
export function selectLatestRelease(
  branchNames: string[],
  prefix: string,
): { branchName: string | null; version: string | null; candidates: string[]; ignored: string[] } {
  const ignored: string[] = [];
  const candidates: string[] = [];

  for (const name of branchNames) {
    if (!name.startsWith(prefix)) continue;
    const version = name.slice(prefix.length);
    if (version.length === 0) continue;
    if (isVersionLike(version)) candidates.push(version);
    else ignored.push(name);
  }

  candidates.sort(compareVersionsDescending);
  const version = candidates[0] ?? null;

  return {
    branchName: version === null ? null : `${prefix}${version}`,
    version,
    candidates,
    ignored,
  };
}

export class GitService {
  constructor(private readonly client: AzureDevOpsClient) {}

  /**
   * Fetch refs, following `x-ms-continuationtoken` until `maxResults` is met.
   *
   * Returns `truncated: true` when the server still had a continuation token but
   * we stopped. Never reports a partial list as complete.
   */
  private async fetchRefs(
    project: string,
    repositoryId: string,
    filter: string,
    maxResults: number,
  ): Promise<{ refs: GitRef[]; truncated: boolean }> {
    const refs: GitRef[] = [];
    let continuationToken: string | undefined;

    do {
      const remaining = maxResults - refs.length;
      const params = new URLSearchParams({
        'api-version': this.client.apiVersion,
        filter,
        $top: String(Math.min(MAX_PAGE_SIZE, remaining)),
      });
      if (continuationToken) params.append('continuationToken', continuationToken);

      const endpoint = `${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/refs?${params.toString()}`;
      const response = await this.client.requestRaw(endpoint, 'GET');
      const body = response.data as AdoApiCollectionResponse<GitRef>;

      refs.push(...(body.value ?? []));

      const header = response.headers?.['x-ms-continuationtoken'];
      continuationToken = typeof header === 'string' && header.length > 0 ? header : undefined;
    } while (continuationToken && refs.length < maxResults);

    return { refs: refs.slice(0, maxResults), truncated: Boolean(continuationToken) };
  }

  async listBranches(
    project: string,
    repositoryId: string,
    options?: { filter?: string; maxResults?: number },
  ): Promise<ListBranchesResult> {
    this.client.validateProject(project);

    const filter = options?.filter ?? 'heads/';
    const maxResults = options?.maxResults ?? 200;

    const { refs, truncated } = await this.fetchRefs(project, repositoryId, filter, maxResults);

    return {
      project,
      repositoryId,
      filter,
      branchCount: refs.length,
      truncated,
      branches: refs.map((ref) => ({
        name: shortBranchName(ref.name),
        fullName: ref.name,
        objectId: ref.objectId,
        isLocked: ref.isLocked ?? false,
      })),
    };
  }

  async getLatestReleaseBranch(
    project: string,
    repositoryId: string,
    options?: { prefix?: string; maxResults?: number },
  ): Promise<LatestReleaseBranchResult> {
    this.client.validateProject(project);

    const prefix = options?.prefix ?? DEFAULT_RELEASE_PREFIX;
    const maxResults = options?.maxResults ?? MAX_PAGE_SIZE;

    const { refs, truncated } = await this.fetchRefs(
      project,
      repositoryId,
      `heads/${prefix}`,
      maxResults,
    );

    const branchNames = refs.map((ref) => shortBranchName(ref.name));
    const { branchName, version, candidates, ignored } = selectLatestRelease(branchNames, prefix);

    const winner = branchName === null ? undefined : refs.find((ref) => shortBranchName(ref.name) === branchName);

    return {
      project,
      repositoryId,
      prefix,
      branchName,
      version,
      objectId: winner?.objectId ?? null,
      sortedBy: 'version (digit-aware natural sort, descending)',
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 10),
      ignoredNonVersionBranches: ignored,
      truncated,
    };
  }
}
