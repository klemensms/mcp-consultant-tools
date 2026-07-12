import { describe, it, expect } from 'vitest';
import {
  equalsIgnoreCase,
  includesIgnoreCase,
  someIncludesIgnoreCase,
  sortByLastModifiedDesc,
} from '../filters.js';

describe('equalsIgnoreCase', () => {
  it('matches across the docs-vs-wire casing gap', () => {
    // The schema documents `advisory`; live payloads return `Advisory`. A case-sensitive
    // check here would silently match zero rows — the exact false all-clear to avoid.
    expect(equalsIgnoreCase('Advisory', 'advisory')).toBe(true);
    expect(equalsIgnoreCase('StayInformed', 'stayInformed')).toBe(true);
    expect(equalsIgnoreCase('Normal', 'normal')).toBe(true);
  });

  it('does not match different values', () => {
    expect(equalsIgnoreCase('incident', 'advisory')).toBe(false);
  });

  it('treats null/undefined as no-value (never matches)', () => {
    expect(equalsIgnoreCase(null, 'advisory')).toBe(false);
    expect(equalsIgnoreCase('advisory', undefined)).toBe(false);
    expect(equalsIgnoreCase(null, null)).toBe(false);
  });
});

describe('includesIgnoreCase', () => {
  it('matches a case-insensitive substring, not just a prefix', () => {
    expect(includesIgnoreCase('Exchange Online', 'exchange')).toBe(true);
    expect(includesIgnoreCase('Exchange Online', 'ONLINE')).toBe(true);
  });

  it('does not match an absent substring or a null haystack', () => {
    expect(includesIgnoreCase('Exchange Online', 'teams')).toBe(false);
    expect(includesIgnoreCase(null, 'x')).toBe(false);
  });
});

describe('someIncludesIgnoreCase', () => {
  it('matches when any element contains the needle', () => {
    expect(someIncludesIgnoreCase(['SharePoint Online', 'Exchange Online'], 'exchange')).toBe(true);
  });

  it('is false for an empty or missing collection', () => {
    expect(someIncludesIgnoreCase([], 'x')).toBe(false);
    expect(someIncludesIgnoreCase(undefined, 'x')).toBe(false);
  });
});

describe('sortByLastModifiedDesc', () => {
  it('orders newest first and sorts missing/unparseable dates last', () => {
    const input = [
      { id: 'a', lastModifiedDateTime: '2026-01-01T00:00:00Z' },
      { id: 'b' },
      { id: 'c', lastModifiedDateTime: '2026-06-01T00:00:00Z' },
      { id: 'd', lastModifiedDateTime: 'not-a-date' },
    ];
    expect(sortByLastModifiedDesc(input).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('does not mutate the input array', () => {
    const input = [
      { id: 'a', lastModifiedDateTime: '2026-01-01T00:00:00Z' },
      { id: 'c', lastModifiedDateTime: '2026-06-01T00:00:00Z' },
    ];
    const before = input.map((x) => x.id);
    sortByLastModifiedDesc(input);
    expect(input.map((x) => x.id)).toEqual(before);
  });
});
