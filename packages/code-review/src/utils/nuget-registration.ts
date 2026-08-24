import type { VulnerabilityInfo } from '../models/index.js';

/**
 * Pure helpers over the NuGet v3 registration JSON shape. Kept separate from the HTTP service so
 * the version-selection and vulnerability-mapping logic - where the ported source had its worst
 * bugs - can be tested against canned registration payloads without any network.
 *
 * Registration reference: https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource
 */

export interface NugetLeaf {
  version: string;
  vulnerabilities: VulnerabilityInfo[];
}

/** A version is a prerelease when it carries a SemVer prerelease label (a hyphen). */
export function isPrerelease(version: string): boolean {
  return version.includes('-');
}

/**
 * Map a registration `catalogEntry.vulnerabilities` array to our shape. The registration schema
 * exposes only `advisoryUrl` and `severity` (0-3) - there is no version range here (that field
 * belongs to the separate bulk VulnerabilityInfo resource). The ported source read a phantom
 * `range` field that was therefore always empty.
 */
export function mapVulnerabilities(raw: unknown): VulnerabilityInfo[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => ({
    advisoryUrl: (v?.advisoryUrl ?? '').toString(),
    severity: (v?.severity ?? '').toString(),
  }));
}

/** Extract per-version leaves from an INLINED registration page. A non-inlined page (no `items`) yields []. */
export function leavesFromPage(page: unknown): NugetLeaf[] {
  const items = (page as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  return items.map((entry) => {
    const catalogEntry = (entry as { catalogEntry?: { version?: string; vulnerabilities?: unknown } })
      ?.catalogEntry;
    return {
      version: (catalogEntry?.version ?? '').toString(),
      vulnerabilities: mapVulnerabilities(catalogEntry?.vulnerabilities),
    };
  });
}

/**
 * Given version strings in the ascending order NuGet returns them, the latest is the last and the
 * latest STABLE is the last non-prerelease. Returns empty stable when every version is a prerelease.
 */
export function pickLatest(versionsAscending: string[]): {
  latestVersion: string;
  latestStableVersion: string;
} {
  let latestVersion = '';
  let latestStableVersion = '';
  for (const version of versionsAscending) {
    if (!version) continue;
    latestVersion = version;
    if (!isPrerelease(version)) latestStableVersion = version;
  }
  return { latestVersion, latestStableVersion };
}
