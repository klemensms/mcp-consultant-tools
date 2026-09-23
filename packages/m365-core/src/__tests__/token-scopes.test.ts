import { describe, it, expect } from 'vitest';
import { decodeTokenScopes } from '../token-scopes.js';

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function jwt(payload: object): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

describe('decodeTokenScopes', () => {
  it('splits the scp claim on spaces', () => {
    expect(decodeTokenScopes(jwt({ scp: 'Mail.Read Mail.Send' }))).toEqual(['Mail.Read', 'Mail.Send']);
  });

  it('ignores repeated whitespace', () => {
    expect(decodeTokenScopes(jwt({ scp: ' User.Read   Sites.ReadWrite.All ' }))).toEqual([
      'User.Read',
      'Sites.ReadWrite.All',
    ]);
  });

  it('returns [] when there is no scp claim', () => {
    expect(decodeTokenScopes(jwt({ roles: ['Sites.Read.All'] }))).toEqual([]);
  });

  it.each(['', 'not-a-jwt', 'a.b', 'a.!!!.c', `${b64url({})}.${Buffer.from('not json').toString('base64url')}.`])(
    'returns [] for malformed input %j without throwing',
    (input) => {
      expect(decodeTokenScopes(input)).toEqual([]);
    }
  );
});
