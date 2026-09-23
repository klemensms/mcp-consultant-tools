import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSafeLocalFile } from '../local-file-guard.js';

let home: string;
let outside: string;

function touch(relative: string, root = home): string {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'x');
  return full;
}

beforeAll(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-home-')));
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-outside-')));
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe('assertSafeLocalFile', () => {
  it('accepts an ordinary document in the home folder and returns its real path', () => {
    const deck = touch('Documents/deck.pptx');
    expect(assertSafeLocalFile(deck, home)).toBe(deck);
  });

  it('expands a leading ~ against the home folder', () => {
    const deck = touch('Documents/deck.pptx');
    expect(assertSafeLocalFile('~/Documents/deck.pptx', home)).toBe(deck);
  });

  it('refuses a file outside the home folder', () => {
    const file = touch('report.pdf', outside);
    expect(() => assertSafeLocalFile(file, home)).toThrow(/home folder/i);
  });

  it.each([
    '.ssh/id_ed25519',
    'project/.env',
    'project/.env.local',
    'x.pem',
    'x.key',
    'x.p12',
    'x.pfx',
    'keys/id_rsa',
    '.config/tool/settings.json',
  ])('refuses %s', (relative) => {
    const file = touch(relative);
    expect(() => assertSafeLocalFile(file, home)).toThrow(/refused/i);
  });

  it('refuses a symlink inside home that points outside it', () => {
    const target = touch('secret.txt', outside);
    const link = path.join(home, 'innocent.txt');
    fs.symlinkSync(target, link);
    expect(() => assertSafeLocalFile(link, home)).toThrow(/home folder/i);
  });

  it('refuses a symlink whose real target is a credential file', () => {
    const target = touch('certs/server.pem');
    const link = path.join(home, 'Documents', 'notes.txt');
    fs.symlinkSync(target, link);
    expect(() => assertSafeLocalFile(link, home)).toThrow(/refused/i);
  });

  it('refuses a folder and a missing file', () => {
    fs.mkdirSync(path.join(home, 'Folder'), { recursive: true });
    expect(() => assertSafeLocalFile(path.join(home, 'Folder'), home)).toThrow(/not a file/i);
    expect(() => assertSafeLocalFile(path.join(home, 'missing.docx'), home)).toThrow(/not found/i);
  });
});
