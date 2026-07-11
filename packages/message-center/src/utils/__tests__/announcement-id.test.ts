import { describe, it, expect } from 'vitest';
import { isAnnouncementId, assertAnnouncementId } from '../announcement-id.js';

describe('isAnnouncementId', () => {
  it('accepts real service-announcement IDs', () => {
    expect(isAnnouncementId('EX226792')).toBe(true);
    expect(isAnnouncementId('MC172851')).toBe(true);
    expect(isAnnouncementId('SP391284')).toBe(true);
    expect(isAnnouncementId('TM12345')).toBe(true);
  });

  it('rejects anything that could break out of a URL path segment', () => {
    expect(isAnnouncementId('EX226792/incidentReport')).toBe(false);
    expect(isAnnouncementId("EX' or '1'='1")).toBe(false);
    expect(isAnnouncementId('EX 226792')).toBe(false);
    expect(isAnnouncementId('EX-226792')).toBe(false);
    expect(isAnnouncementId('EX.226792')).toBe(false);
    expect(isAnnouncementId('')).toBe(false);
    expect(isAnnouncementId('../messages/MC1')).toBe(false);
  });
});

describe('assertAnnouncementId', () => {
  it('returns the value unchanged when valid', () => {
    expect(assertAnnouncementId('MC172851', 'messageId')).toBe('MC172851');
  });

  it('throws, naming the label, when invalid', () => {
    expect(() => assertAnnouncementId("x'/y", 'issueId')).toThrow(/issueId must be a service-announcement ID/);
  });
});
