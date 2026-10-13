/**
 * The server and CLI report the version the package passes in, never one read
 * from whatever package.json sits above `process.argv[1]`. Under npx the entry
 * script is a bin shim in the consumer's tree, and inside `meta` every bundled
 * server shares meta's entry script, so a walk from there reports another
 * package's version.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../mcp-helpers.js';
import { createCliProgram } from '../cli-helpers.js';

let dir: string;
let originalArgv1: string | undefined;

beforeEach(() => {
  // A consumer project with its own package.json and an npx-style bin shim below it.
  dir = mkdtempSync(join(tmpdir(), 'reported-version-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', version: '9.9.9' }));
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
  originalArgv1 = process.argv[1];
  process.argv[1] = join(dir, 'node_modules', '.bin', 'mcp-example');
});

afterEach(() => {
  process.argv[1] = originalArgv1 as string;
  rmSync(dir, { recursive: true, force: true });
});

describe('reported version', () => {
  it('createMcpServer reports the version passed in, in the initialize handshake', async () => {
    const server = createMcpServer({ name: 'example', version: '1.2.3' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    expect(client.getServerVersion()?.version).toBe('1.2.3');
    await client.close();
  });

  it('createCliProgram reports the version passed in', () => {
    const program = createCliProgram({ name: 'example', description: 'x', version: '1.2.3' });
    expect(program.version()).toBe('1.2.3');
  });
});
