import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { outputResult, setJsonOutput } from '../cli/output.js';

describe('outputResult and the global --json flag', () => {
  const data = { id: 'item-1', name: 'Report.docx', size: 42 };
  let dir: string;
  let cwd: string;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    cwd = process.cwd();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-output-'));
    process.chdir(dir);
    stdout = [];
    stderr = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { stdout.push(a.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { stderr.push(a.join(' ')); });
  });

  afterEach(() => {
    setJsonOutput(false);
    vi.restoreAllMocks();
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prints the summary and the cache path when --json is not set', () => {
    outputResult({ fileName: 'item', data, summary: 'Report.docx (42 bytes)' });

    expect(stdout[0]).toBe('Report.docx (42 bytes)');
    expect(stdout.join('\n')).toContain('Full output:');
    expect(stdout.join('\n')).not.toContain('"id"');
  });

  it('prints only the full JSON on stdout when --json is set, and still writes the cache', () => {
    setJsonOutput(true);
    outputResult({ fileName: 'item', data, summary: 'Report.docx (42 bytes)' });

    expect(stdout).toEqual([JSON.stringify(data, null, 2)]);
    expect(JSON.parse(stdout[0])).toEqual(data);
    const cached = path.join(fs.realpathSync(dir), '.context');
    const files = fs.readdirSync(cached, { recursive: true }) as string[];
    expect(files.some((f) => f.endsWith('item.json'))).toBe(true);
    expect(stderr.join('\n')).toContain('item.json');
  });

  it('prints the full JSON for a write that does not persist', () => {
    setJsonOutput(true);
    outputResult({ fileName: 'write', data, summary: 'Done', persist: false });

    expect(stdout).toEqual([JSON.stringify(data, null, 2)]);
    expect(fs.existsSync(path.join(dir, '.context'))).toBe(false);
  });
});
