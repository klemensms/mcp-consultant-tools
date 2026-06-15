import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import {
  resolveSafePath,
  assertNoTraversal,
  safeBasename,
  getFileRoot,
} from '../safe-path.js';

const ROOT = '/tmp/mcp-safe-root';

describe('getFileRoot', () => {
  const original = process.env.MCP_FILE_ROOT;
  afterEach(() => {
    if (original === undefined) delete process.env.MCP_FILE_ROOT;
    else process.env.MCP_FILE_ROOT = original;
  });

  it('prefers an explicit root arg', () => {
    expect(getFileRoot('/tmp/explicit')).toBe('/tmp/explicit');
  });

  it('falls back to MCP_FILE_ROOT', () => {
    process.env.MCP_FILE_ROOT = '/tmp/from-env';
    expect(getFileRoot()).toBe('/tmp/from-env');
  });

  it('falls back to cwd when nothing is set', () => {
    delete process.env.MCP_FILE_ROOT;
    expect(getFileRoot()).toBe(path.resolve(process.cwd()));
  });
});

describe('resolveSafePath (write confinement)', () => {
  it('allows a relative path inside the root', () => {
    expect(resolveSafePath('docs/forms/contact.xml', { root: ROOT })).toBe(
      `${ROOT}/docs/forms/contact.xml`
    );
  });

  it('allows an absolute path inside the root', () => {
    expect(resolveSafePath(`${ROOT}/sub/file.md`, { root: ROOT })).toBe(
      `${ROOT}/sub/file.md`
    );
  });

  it('allows the root itself', () => {
    expect(resolveSafePath('.', { root: ROOT })).toBe(ROOT);
  });

  it('rejects ../ traversal that escapes the root', () => {
    expect(() => resolveSafePath('../../etc/passwd', { root: ROOT })).toThrow(
      /escapes the permitted root/
    );
  });

  it('rejects an absolute path outside the root', () => {
    expect(() => resolveSafePath('/etc/passwd', { root: ROOT })).toThrow(
      /escapes the permitted root/
    );
  });

  it('rejects a sibling-prefix path that is not actually inside the root', () => {
    // /tmp/mcp-safe-root-evil must not be treated as inside /tmp/mcp-safe-root
    expect(() => resolveSafePath(`${ROOT}-evil/x`, { root: ROOT })).toThrow(
      /escapes the permitted root/
    );
  });

  it('rejects empty and null-byte paths', () => {
    expect(() => resolveSafePath('', { root: ROOT })).toThrow(/required/);
    expect(() => resolveSafePath('a\0b', { root: ROOT })).toThrow(/null byte/);
  });
});

describe('assertNoTraversal (read guard)', () => {
  it('allows an absolute path', () => {
    expect(assertNoTraversal('/var/data/form.xml')).toBe('/var/data/form.xml');
  });

  it('allows a clean relative path (resolved against cwd)', () => {
    expect(assertNoTraversal('forms/a.xml')).toBe(
      path.resolve('forms/a.xml')
    );
  });

  it('rejects ../ traversal', () => {
    expect(() => assertNoTraversal('../../etc/shadow')).toThrow(/traversal/);
  });

  it('rejects backslash traversal', () => {
    expect(() => assertNoTraversal('..\\..\\secret')).toThrow(/traversal/);
  });

  it('rejects empty and null-byte paths', () => {
    expect(() => assertNoTraversal('')).toThrow(/required/);
    expect(() => assertNoTraversal('a\0b')).toThrow(/null byte/);
  });
});

describe('safeBasename (untrusted filename component)', () => {
  it('returns a plain filename unchanged', () => {
    expect(safeBasename('screenshot.png')).toBe('screenshot.png');
  });

  it('collapses a traversal path to its basename', () => {
    expect(safeBasename('../../../../etc/passwd')).toBe('passwd');
    expect(safeBasename('a/b/c/file.txt')).toBe('file.txt');
  });

  it('collapses backslash paths to basename', () => {
    expect(safeBasename('..\\..\\evil.exe')).toBe('evil.exe');
  });

  it('rejects names that collapse to nothing dangerous', () => {
    expect(() => safeBasename('..')).toThrow(/Unsafe file name/);
    expect(() => safeBasename('a/b/..')).toThrow(/Unsafe file name/);
  });
});
