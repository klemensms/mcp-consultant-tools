/**
 * X2, the exit-code half: a command whose fan-out lost items must not exit 0. The
 * measured case exited 0 on 32 authorisation failures and still wrote its cache file,
 * so a batch caller saw success and a complete-looking artifact.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputResult } from '../cli-helpers.js';
import { FanOutRecorder } from '../fan-out.js';

const flags = { json: false, cache: false };

const forbidden = () => {
  const error = new Error('Request failed with status code 403') as Error & {
    response: { status: number };
  };
  error.response = { status: 403 };
  return error;
};

let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.exitCode = undefined;
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdout.mockRestore();
  stderr.mockRestore();
  process.exitCode = undefined;
});

describe('outputResult', () => {
  it('exits non-zero when the payload reports a lost item', async () => {
    const recorder = new FanOutRecorder();
    await recorder.run('site-a', 'configuration', async () => ({ ok: true }));
    await recorder.run('site-b', 'configuration', async () => {
      throw forbidden();
    });

    outputResult(
      {
        fileName: 'function-apps',
        data: { functionApps: [], fanOut: recorder.result() },
        summary: 'Found 2 function apps',
        cacheDir: '.mcp-arm-cache',
      },
      flags
    );

    expect(process.exitCode).toBe(1);
  });

  it('leaves the exit code alone when everything was collected', async () => {
    const recorder = new FanOutRecorder();
    await recorder.run('site-a', 'configuration', async () => ({ ok: true }));

    outputResult(
      {
        fileName: 'function-apps',
        data: { functionApps: [], fanOut: recorder.result() },
        summary: 'Found 1 function app',
        cacheDir: '.mcp-arm-cache',
      },
      flags
    );

    expect(process.exitCode).toBeUndefined();
  });

  it('leaves the exit code alone for a payload with no fan-out at all', () => {
    outputResult(
      {
        fileName: 'resources',
        data: { resources: [] },
        summary: 'Found 0 resources',
        cacheDir: '.mcp-arm-cache',
      },
      flags
    );

    expect(process.exitCode).toBeUndefined();
  });

  it('says on stderr what was lost, so a --json caller is told too', async () => {
    const recorder = new FanOutRecorder();
    await recorder.run('site-b', 'configuration', async () => {
      throw forbidden();
    });

    outputResult(
      {
        fileName: 'function-apps',
        data: { functionApps: [], fanOut: recorder.result() },
        summary: 'Found 1 function app',
        cacheDir: '.mcp-arm-cache',
      },
      { json: true, cache: false }
    );

    const written = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toContain('INCOMPLETE');
    expect(written).toContain('1 of 1');
  });
});
