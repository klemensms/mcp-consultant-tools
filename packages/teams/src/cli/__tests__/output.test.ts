/**
 * CLI output tests
 *
 * These assert where files are and are NOT written. A write command used to
 * create `.context/.mcp-teams-cache/` in whatever directory it happened to be
 * run from - which on a real machine meant a cloud-synced folder - so the
 * absence below is the point of the test, not the presence.
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
  workDir = mkdtempSync(join(tmpdir(), 'mcp-teams-output-'));
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
});

describe('CLI outputResult', () => {
  it('caches a read, because an agent greps the JSON instead of re-running the call', () => {
    outputResult({ fileName: 'list-chats', data: [{ id: '1' }], summary: 'ok' }, FLAGS);

    expect(existsSync(join(workDir, '.context', '.mcp-teams-cache', 'list-chats.json'))).toBe(true);
  });

  it('writes nothing at all for a write command, not even the directory', () => {
    outputResult(
      { fileName: 'react-to-chat-message', data: { action: 'add' }, summary: 'ok', persist: false },
      FLAGS
    );

    expect(existsSync(join(workDir, '.context', '.mcp-teams-cache', 'react-to-chat-message.json'))).toBe(false);
    expect(existsSync(join(workDir, '.context'))).toBe(false);
  });

  it('still honours --no-cache on a read', () => {
    outputResult({ fileName: 'list-chats', data: [], summary: 'ok' }, { json: false, cache: false });

    expect(existsSync(join(workDir, '.context'))).toBe(false);
  });
});
