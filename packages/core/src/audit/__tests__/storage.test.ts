import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendRecordLine, readChainState, writeChainState } from '../storage.js';
import type { ChainState } from '../types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-storage-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('chain state file', () => {
  it('returns null when state file does not exist', async () => {
    const s = await readChainState(dir);
    expect(s).toBeNull();
  });

  it('writes and reads back state', async () => {
    const state: ChainState = {
      v: 1,
      lastSeq: 7,
      lastHash: 'a'.repeat(64),
      fileChecksumAtLastWrite: 'sha256:bbb',
      currentFile: '2026-05.jsonl',
    };
    await writeChainState(dir, state);
    const back = await readChainState(dir);
    expect(back).toEqual(state);
  });

  it('returns null when state file has unsupported version', async () => {
    const tmp = join(dir, '.chain-state.tmp');
    const target = join(dir, '.chain-state');
    await writeFile(tmp, JSON.stringify({ v: 2 }), 'utf8');
    await rename(tmp, target);
    expect(await readChainState(dir)).toBeNull();
  });

  it('overwrites previous state on subsequent write', async () => {
    const first: ChainState = {
      v: 1,
      lastSeq: 1,
      lastHash: '1'.repeat(64),
      fileChecksumAtLastWrite: 'sha256:aaa',
      currentFile: '2026-04.jsonl',
    };
    const second: ChainState = {
      v: 1,
      lastSeq: 2,
      lastHash: '2'.repeat(64),
      fileChecksumAtLastWrite: 'sha256:bbb',
      currentFile: '2026-05.jsonl',
    };
    await writeChainState(dir, first);
    await writeChainState(dir, second);
    expect(await readChainState(dir)).toEqual(second);
  });

  it('throws when state file contains malformed JSON', async () => {
    await writeFile(join(dir, '.chain-state'), 'not-json', 'utf8');
    await expect(readChainState(dir)).rejects.toThrow();
  });
});

describe('appendRecordLine', () => {
  it('appends a single line with newline terminator', async () => {
    const file = join(dir, '2026-05.jsonl');
    await appendRecordLine(file, '{"v":1}');
    await appendRecordLine(file, '{"v":2}');
    const contents = await readFile(file, 'utf8');
    expect(contents).toBe('{"v":1}\n{"v":2}\n');
  });

  it('creates parent directory if missing', async () => {
    const file = join(dir, 'nested', 'subdir', '2026-05.jsonl');
    await appendRecordLine(file, '{"v":1}');
    expect(await readFile(file, 'utf8')).toBe('{"v":1}\n');
  });
});
