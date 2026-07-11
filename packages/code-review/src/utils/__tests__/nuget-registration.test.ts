import { describe, it, expect } from 'vitest';
import {
  isPrerelease,
  mapVulnerabilities,
  pickLatest,
  leavesFromPage,
} from '../nuget-registration.js';

describe('isPrerelease', () => {
  it('treats a hyphenated version as prerelease', () => {
    expect(isPrerelease('2.1.0-preview.1')).toBe(true);
    expect(isPrerelease('13.0.3')).toBe(false);
  });
});

describe('pickLatest (registration items are ascending by version)', () => {
  it('returns the last version as latest and the last non-prerelease as stable', () => {
    expect(pickLatest(['1.0.0', '1.1.0', '2.0.0'])).toEqual({
      latestVersion: '2.0.0',
      latestStableVersion: '2.0.0',
    });
  });

  it('excludes a trailing prerelease from latestStableVersion', () => {
    expect(pickLatest(['1.0.0', '2.0.0', '2.1.0-preview.1'])).toEqual({
      latestVersion: '2.1.0-preview.1',
      latestStableVersion: '2.0.0',
    });
  });

  it('reports an empty stable when every version is a prerelease', () => {
    expect(pickLatest(['1.0.0-alpha', '1.0.0-beta'])).toEqual({
      latestVersion: '1.0.0-beta',
      latestStableVersion: '',
    });
  });
});

describe('mapVulnerabilities — registration schema is advisoryUrl + severity only', () => {
  it('maps advisoryUrl and severity and never invents a version range', () => {
    const raw = [{ advisoryUrl: 'https://github.com/advisories/GHSA-x', severity: 2 }];
    expect(mapVulnerabilities(raw)).toEqual([
      { advisoryUrl: 'https://github.com/advisories/GHSA-x', severity: '2' },
    ]);
  });

  it('returns [] for a missing or non-array node', () => {
    expect(mapVulnerabilities(undefined)).toEqual([]);
    expect(mapVulnerabilities(null)).toEqual([]);
  });
});

describe('leavesFromPage', () => {
  it('extracts version + vulnerabilities from an inlined page', () => {
    const page = {
      items: [
        { catalogEntry: { version: '1.0.0', vulnerabilities: [] } },
        {
          catalogEntry: {
            version: '1.1.0',
            vulnerabilities: [{ advisoryUrl: 'https://a', severity: 1 }],
          },
        },
      ],
    };
    expect(leavesFromPage(page)).toEqual([
      { version: '1.0.0', vulnerabilities: [] },
      { version: '1.1.0', vulnerabilities: [{ advisoryUrl: 'https://a', severity: '1' }] },
    ]);
  });

  it('returns [] for a non-inlined page (no items array)', () => {
    expect(leavesFromPage({ '@id': 'https://x/page1.json', lower: '1.0.0', upper: '2.0.0', count: 200 })).toEqual([]);
  });
});
