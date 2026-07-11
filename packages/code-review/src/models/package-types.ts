export interface GhePackage {
  id: number;
  name: string;
  package_type: string;
  visibility: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  owner: {
    login: string;
    id: number;
  };
  repository?: {
    id: number;
    name: string;
    full_name: string;
  };
}

export interface GhePackageVersion {
  id: number;
  name: string;
  package_html_url: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    package_type: string;
    container?: { tags: string[] };
  };
}

export interface LatestPackageVersion {
  packageName: string;
  org: string;
  latestVersion: string | null;
  allReleaseVersions: string[];
}

/**
 * A page-followed API result. `truncated` is true when a paging cap was hit before the API ran out
 * of `Link: rel="next"` pages, so callers can report that the list is a lower bound rather than
 * silently presenting a partial result as complete.
 */
export interface PaginatedResult<T> {
  items: T[];
  truncated: boolean;
}
