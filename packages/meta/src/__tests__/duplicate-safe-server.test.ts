import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  duplicateSafeServer,
  formatDuplicates,
  type SkippedRegistration,
} from '../duplicate-safe-server.js';

const handler = async () => ({ content: [{ type: 'text' as const, text: 'ok' }] });

function newServer(): any {
  return new McpServer({ name: 'test', version: '1.0.0' });
}

/** Tool names currently registered on a real McpServer, via listTools(). */
function toolNames(server: any): string[] {
  return Object.keys((server as any)._registeredTools ?? {}).sort();
}

describe('duplicateSafeServer', () => {
  it('skips a duplicate tool name instead of aborting the rest of the package', () => {
    const server = newServer();
    const skipped: SkippedRegistration[] = [];

    // Package A claims "shared".
    server.tool('shared', 'first owner', handler);

    // Package B hits the collision on its second tool, then must keep going.
    const safe = duplicateSafeServer(server, 'Package B', skipped);
    safe.tool('b-first', 'desc', handler);
    safe.tool('shared', 'desc', handler);
    safe.tool('b-after-collision', 'desc', handler);

    expect(toolNames(server)).toEqual(['b-after-collision', 'b-first', 'shared']);
    expect(skipped).toEqual([{ package: 'Package B', kind: 'tool', name: 'shared' }]);
  });

  it('leaves the first registration in place (first package wins the name)', () => {
    const server = newServer();
    const skipped: SkippedRegistration[] = [];

    server.tool('shared', 'first owner', handler);
    const before = (server as any)._registeredTools['shared'];

    duplicateSafeServer(server, 'Package B', skipped).tool('shared', 'second owner', handler);

    expect((server as any)._registeredTools['shared']).toBe(before);
    expect((server as any)._registeredTools['shared'].description).toBe('first owner');
  });

  it('skips a duplicate prompt name the same way', () => {
    const server = newServer();
    const skipped: SkippedRegistration[] = [];

    server.prompt('shared-prompt', 'first', () => ({ messages: [] }));

    const safe = duplicateSafeServer(server, 'Package B', skipped);
    safe.prompt('shared-prompt', 'second', () => ({ messages: [] }));
    safe.prompt('b-prompt', 'desc', () => ({ messages: [] }));

    expect(Object.keys((server as any)._registeredPrompts).sort()).toEqual([
      'b-prompt',
      'shared-prompt',
    ]);
    expect(skipped).toEqual([
      { package: 'Package B', kind: 'prompt', name: 'shared-prompt' },
    ]);
  });

  it('rethrows an error that is not a duplicate registration', () => {
    const skipped: SkippedRegistration[] = [];
    const exploding = {
      tool() {
        throw new Error('schema validation failed');
      },
    };

    const safe = duplicateSafeServer(exploding, 'Package B', skipped);

    expect(() => safe.tool('x', 'desc', handler)).toThrow('schema validation failed');
    expect(skipped).toEqual([]);
  });

  it('does not swallow an error whose message merely mentions registration', () => {
    const skipped: SkippedRegistration[] = [];
    const exploding = {
      tool() {
        // Not the SDK's duplicate error: must not be treated as a skip.
        throw new Error('tool is already registered with another transport, aborting');
      },
    };

    const safe = duplicateSafeServer(exploding, 'Package B', skipped);

    expect(() => safe.tool('x', 'desc', handler)).toThrow(/another transport/);
    expect(skipped).toEqual([]);
  });

  it('preserves access to the underlying server (methods keep their private state)', () => {
    const server = newServer();
    const safe = duplicateSafeServer(server, 'Package B', []);

    // `server` is a getter returning the inner Server; reaching it through the
    // proxy must not break McpServer's private-field access.
    expect(() => safe.server).not.toThrow();
    expect(safe.server).toBe(server.server);

    // A non-wrapped method invoked via the proxy must still bind to the target.
    safe.tool('t', 'desc', handler);
    expect(toolNames(server)).toEqual(['t']);
  });

  it('records skips across several packages independently', () => {
    const server = newServer();
    const skipped: SkippedRegistration[] = [];

    server.tool('shared', 'owner', handler);
    duplicateSafeServer(server, 'Package B', skipped).tool('shared', 'desc', handler);
    duplicateSafeServer(server, 'Package C', skipped).tool('shared', 'desc', handler);

    expect(skipped).toEqual([
      { package: 'Package B', kind: 'tool', name: 'shared' },
      { package: 'Package C', kind: 'tool', name: 'shared' },
    ]);
  });
});

describe('formatDuplicates', () => {
  it('returns nothing when there were no duplicates', () => {
    expect(formatDuplicates([])).toEqual([]);
  });

  it('groups by package and never emits the reserved "<Package> skipped:" phrase', () => {
    const lines = formatDuplicates([
      { package: 'Azure DevOps Admin', kind: 'tool', name: 'get-build-status' },
      { package: 'Azure DevOps Admin', kind: 'tool', name: 'get-build-logs' },
      { package: 'PowerPlatform Data', kind: 'tool', name: 'get-entity-metadata' },
    ]);

    expect(lines[0]).toContain('3 duplicate name(s) not registered');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('  Azure DevOps Admin: tool get-build-status, tool get-build-logs');
    expect(lines[2]).toBe('  PowerPlatform Data: tool get-entity-metadata');

    // Release checks grep stderr for "<Package> skipped:" to mean "package failed
    // to load". A duplicate must never produce that phrase.
    for (const line of lines) expect(line).not.toMatch(/skipped:/);
  });
});
