import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeFileName, saveToDownloadDir, resolveDownloadDir } from '../downloads.js';

describe('sanitizeFileName', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeFileName('Quarterly report v2.docx')).toBe('Quarterly report v2.docx');
  });

  it.each([
    ['../../etc/passwd', 'etc_passwd'],
    ['..\\..\\evil.bat', 'evil.bat'],
    ['a/b/c.txt', 'a_b_c.txt'],
    ['.env', 'env'],
    ['  ..hidden', 'hidden'],
    ['bad\u0000name\u0007.txt', 'badname.txt'],
    ['', 'download'],
    ['...', 'download'],
  ])('sanitises %j to %j', (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it('caps very long names while keeping the extension', () => {
    const name = sanitizeFileName(`${'x'.repeat(400)}.pdf`);
    expect(name.length).toBeLessThanOrEqual(200);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('saveToDownloadDir', () => {
  let dir: string;

  beforeEach(() => {
    dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'm365-core-dl-')), 'downloads');
  });

  afterEach(() => {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  });

  it('creates the folder, writes the file and returns an absolute path inside it', () => {
    const saved = saveToDownloadDir(dir, 'notes.txt', Buffer.from('hello'));
    expect(path.isAbsolute(saved)).toBe(true);
    expect(saved).toBe(path.join(dir, 'notes.txt'));
    expect(fs.readFileSync(saved, 'utf8')).toBe('hello');
  });

  it('cannot escape the folder through the name', () => {
    const saved = saveToDownloadDir(dir, '../../outside.txt', Buffer.from('x'));
    expect(path.dirname(saved)).toBe(dir);
  });

  it('never overwrites: appends (1), (2) before the extension', () => {
    const a = saveToDownloadDir(dir, 'deck.pdf', Buffer.from('1'));
    const b = saveToDownloadDir(dir, 'deck.pdf', Buffer.from('2'));
    const c = saveToDownloadDir(dir, 'deck.pdf', Buffer.from('3'));
    expect([a, b, c].map((p) => path.basename(p))).toEqual(['deck.pdf', 'deck (1).pdf', 'deck (2).pdf']);
    expect(fs.readFileSync(a, 'utf8')).toBe('1');
  });
});

describe('resolveDownloadDir', () => {
  it('defaults to ~/Downloads/<name>', () => {
    expect(resolveDownloadDir(undefined, 'mcp-outlook')).toBe(path.join(os.homedir(), 'Downloads', 'mcp-outlook'));
  });

  it('expands a leading ~', () => {
    expect(resolveDownloadDir('~/x/y', 'unused')).toBe(path.join(os.homedir(), 'x', 'y'));
  });

  it('resolves a relative path to an absolute one', () => {
    expect(path.isAbsolute(resolveDownloadDir('rel/dir', 'unused'))).toBe(true);
  });
});
