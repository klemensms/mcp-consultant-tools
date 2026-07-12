import { describe, it, expect } from 'vitest';
import { isGuid, assertGuid } from '../guid.js';

const VALID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('isGuid', () => {
  it('accepts a canonical GUID in either case', () => {
    expect(isGuid(VALID)).toBe(true);
    expect(isGuid(VALID.toUpperCase())).toBe(true);
  });

  it.each([
    '',
    'not-a-guid',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeee', // one digit too many
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee', // one digit too few
    'aaaaaaaabbbbccccddddeeeeeeeeeeee', // unhyphenated
    `${VALID} or 1 eq 1`, // an OData clause appended
  ])('rejects %o', (value) => {
    expect(isGuid(value)).toBe(false);
  });

  it("rejects a value carrying a quote that would close an OData string literal", () => {
    expect(isGuid("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') or startswith(displayName,'")).toBe(
      false
    );
  });
});

describe('assertGuid', () => {
  it('returns the value unchanged when valid', () => {
    expect(assertGuid(VALID, 'appId')).toBe(VALID);
  });

  it('names the offending argument when invalid', () => {
    expect(() => assertGuid('nope', 'appId')).toThrow(/appId must be a GUID/);
  });
});
