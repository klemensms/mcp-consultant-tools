import { describe, it, expect } from 'vitest';
import { NugetPackageService, determinePackageStatus } from '../nuget-package-service.js';
import type { PackageInfo } from '../../models/index.js';

const SERVICE_INDEX_URL = 'https://api.nuget.org/v3/index.json';
const REG_BASE = 'https://api.nuget.org/v3/registration5-gz-semver2';

/** Build a fetchJson stub backed by a URL→payload map that records every URL it was asked for. */
function stubFetch(payloads: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url);
    if (!(url in payloads)) {
      const err: any = new Error(`404 for ${url}`);
      err.status = 404;
      throw err;
    }
    return payloads[url];
  };
  return { fetchJson, calls };
}

const SERVICE_INDEX = {
  resources: [
    { '@id': 'https://api.nuget.org/v3/registration5-semver1', '@type': 'RegistrationsBaseUrl' },
    { '@id': REG_BASE, '@type': 'RegistrationsBaseUrl/3.6.0' },
    { '@id': 'https://azuresearch-usnc.nuget.org/query', '@type': 'SearchQueryService/3.0.0' },
  ],
};

describe('getRegistrationBase — discovered from the service index, not hardcoded', () => {
  it('prefers RegistrationsBaseUrl/3.6.0 (gzip + SemVer2) and caches it', async () => {
    const { fetchJson, calls } = stubFetch({ [SERVICE_INDEX_URL]: SERVICE_INDEX });
    const svc = new NugetPackageService(fetchJson);

    expect(await svc.getRegistrationBase()).toBe(REG_BASE);
    await svc.getRegistrationBase();
    expect(calls.filter((u) => u === SERVICE_INDEX_URL)).toHaveLength(1); // cached
  });
});

describe('fetchPackageData', () => {
  it('reads latest and latest-stable from an inlined registration', async () => {
    const { fetchJson } = stubFetch({
      [SERVICE_INDEX_URL]: SERVICE_INDEX,
      [`${REG_BASE}/newtonsoft.json/index.json`]: {
        items: [
          {
            lower: '13.0.0',
            upper: '13.0.4-beta1',
            items: [
              { catalogEntry: { version: '13.0.3', vulnerabilities: [] } },
              { catalogEntry: { version: '13.0.4-beta1', vulnerabilities: [] } },
            ],
          },
        ],
      },
    });
    const svc = new NugetPackageService(fetchJson);
    const data = await svc.fetchPackageData('Newtonsoft.Json');
    expect(data.latestVersion).toBe('13.0.4-beta1');
    expect(data.latestStableVersion).toBe('13.0.3');
  });

  it('fetches a NON-INLINED last page by its @id (the 128+ version case the source dropped)', async () => {
    const pageUrl = `${REG_BASE}/popular.package/page/last.json`;
    const { fetchJson, calls } = stubFetch({
      [SERVICE_INDEX_URL]: SERVICE_INDEX,
      [`${REG_BASE}/popular.package/index.json`]: {
        // last page is non-inlined: only @id/lower/upper/count, no items
        items: [{ '@id': pageUrl, lower: '9.0.0', upper: '9.0.5', count: 130 }],
      },
      [pageUrl]: {
        items: [
          { catalogEntry: { version: '9.0.4', vulnerabilities: [] } },
          { catalogEntry: { version: '9.0.5', vulnerabilities: [] } },
        ],
      },
    });
    const svc = new NugetPackageService(fetchJson);
    const data = await svc.fetchPackageData('Popular.Package');

    expect(calls).toContain(pageUrl); // it actually followed the page @id
    expect(data.latestStableVersion).toBe('9.0.5'); // not silently blank
  });

  it('reports vulnerabilities for the CURRENT version only, not every version ever', async () => {
    const { fetchJson } = stubFetch({
      [SERVICE_INDEX_URL]: SERVICE_INDEX,
      [`${REG_BASE}/vuln.package/index.json`]: {
        items: [
          {
            lower: '1.0.0',
            upper: '2.0.0',
            items: [
              {
                catalogEntry: {
                  version: '1.0.0',
                  vulnerabilities: [{ advisoryUrl: 'https://advisory/1', severity: 2 }],
                },
              },
              { catalogEntry: { version: '2.0.0', vulnerabilities: [] } },
            ],
          },
        ],
      },
    });
    const svc = new NugetPackageService(fetchJson);

    const vulnerable = await svc.fetchPackageData('Vuln.Package', '1.0.0');
    expect(vulnerable.vulnerabilities).toHaveLength(1);

    const patched = await svc.fetchPackageData('Vuln.Package', '2.0.0');
    expect(patched.vulnerabilities).toHaveLength(0);
  });

  it('returns empty data for a package not found on nuget.org (404), does not throw', async () => {
    const { fetchJson } = stubFetch({ [SERVICE_INDEX_URL]: SERVICE_INDEX });
    const svc = new NugetPackageService(fetchJson);
    const data = await svc.fetchPackageData('Private.Internal.Package', '1.0.0');
    expect(data).toEqual({ latestVersion: '', latestStableVersion: '', vulnerabilities: [] });
  });
});

describe('determinePackageStatus', () => {
  const base = (over: Partial<PackageInfo>): PackageInfo => ({
    id: 'X',
    currentVersion: '1.0.0',
    status: 'unknown',
    ...over,
  });

  it('flags vulnerable first, regardless of version freshness', () => {
    expect(
      determinePackageStatus(base({ vulnerabilities: [{ advisoryUrl: 'u', severity: '2' }], latestStableVersion: '1.0.0' })),
    ).toBe('vulnerable');
  });

  it('is up-to-date when current >= latest stable', () => {
    expect(determinePackageStatus(base({ currentVersion: '2.0.0', latestStableVersion: '2.0.0' }))).toBe('up-to-date');
  });

  it('is a major update when the major version is behind', () => {
    expect(determinePackageStatus(base({ currentVersion: '1.0.0', latestStableVersion: '3.0.0' }))).toBe('major-update');
  });

  it('is a minor update when only minor/patch is behind', () => {
    expect(determinePackageStatus(base({ currentVersion: '1.0.0', latestStableVersion: '1.4.0' }))).toBe('minor-update');
  });

  it('is unknown without a comparable version', () => {
    expect(determinePackageStatus(base({ currentVersion: '', latestStableVersion: '' }))).toBe('unknown');
  });
});
