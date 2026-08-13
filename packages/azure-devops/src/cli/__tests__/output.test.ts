/**
 * CLI output tests
 *
 * These assert where files are and are NOT written. Write commands used to
 * create `.context/.mcp-ado-cache/` in whatever directory they happened to be
 * run from, so the absence below is the point of the test, not the presence.
 *
 * `azure-devops` is the reference package for CLI conventions, so this guard
 * stands for the whole sweep - every package sharing the core wrapper behaves
 * the same way.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { outputResult } from '../output.js';

const FLAGS = { json: false, cache: true };

let workDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'mcp-ado-output-'));
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
});

describe('CLI outputResult', () => {
  it('caches a read, because an agent greps the JSON instead of re-running the call', () => {
    outputResult({ fileName: 'work-items', data: [{ id: 1234 }], summary: 'ok' }, FLAGS);

    expect(existsSync(join(workDir, '.context', '.mcp-ado-cache', 'work-items.json'))).toBe(true);
  });

  it('writes nothing at all for a write command, not even the directory', () => {
    outputResult(
      { fileName: 'work-item-created', data: { id: 1234 }, summary: 'ok', persist: false },
      FLAGS
    );

    expect(existsSync(join(workDir, '.context', '.mcp-ado-cache', 'work-item-created.json'))).toBe(false);
    expect(existsSync(join(workDir, '.context'))).toBe(false);
  });

  it('still honours --no-cache on a read', () => {
    outputResult({ fileName: 'work-items', data: [], summary: 'ok' }, { json: false, cache: false });

    expect(existsSync(join(workDir, '.context'))).toBe(false);
  });
});
