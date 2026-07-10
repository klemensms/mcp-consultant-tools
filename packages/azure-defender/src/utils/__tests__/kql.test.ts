import { describe, it, expect } from 'vitest';
import { escapeKqlStringLiteral, kqlString } from '../kql.js';

describe('escapeKqlStringLiteral', () => {
  it('leaves an ordinary value untouched', () => {
    expect(escapeKqlStringLiteral('Internet exposed VM')).toBe('Internet exposed VM');
  });

  it('escapes a single quote', () => {
    expect(escapeKqlStringLiteral("o'brien")).toBe("o\\'brien");
  });

  it('escapes a backslash', () => {
    expect(escapeKqlStringLiteral('a\\b')).toBe('a\\\\b');
  });

  it('escapes the backslash BEFORE the quote', () => {
    // The ported source escaped only the quote, so `x\` became `x\` and the
    // trailing backslash escaped the literal's closing quote.
    expect(escapeKqlStringLiteral("x\\'")).toBe("x\\\\\\'");
  });

  it('does not let a trailing backslash escape the closing quote', () => {
    const rendered = kqlString('x\\');
    expect(rendered).toBe("'x\\\\'");
    // The character immediately before the closing quote is an escaped backslash,
    // not a lone one, so the literal terminates where we intend.
    expect(rendered.endsWith("\\\\'")).toBe(true);
  });

  it('rejects control characters rather than emitting a broken literal', () => {
    expect(() => escapeKqlStringLiteral('a\nb')).toThrow(/control characters/);
    expect(() => escapeKqlStringLiteral(`a${String.fromCharCode(0x00)}b`)).toThrow(/control characters/);
    expect(() => escapeKqlStringLiteral(`a${String.fromCharCode(0x7f)}b`)).toThrow(/control characters/);
  });

  it('neutralises an attempt to break out and append a clause', () => {
    // Without backslash escaping this payload would close the literal and inject
    // `or 1==1`. With it, the whole payload stays inside the quotes.
    const payload = "x\\' or 1==1 //";
    const rendered = kqlString(payload);
    expect(rendered).toBe("'x\\\\\\' or 1==1 //'");
  });
});

describe('kqlString', () => {
  it('wraps the escaped value in single quotes', () => {
    expect(kqlString('abc')).toBe("'abc'");
  });
});
