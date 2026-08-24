/**
 * `search` skipped any malformed audit line it could not parse.
 *
 * The skip wrote a warning to stderr and moved on, so the result set - and the
 * `(N records)` footer printed under it - was silently short. An audit search is read as
 * evidence of what happened, and "no record of that" is the conclusion someone draws from
 * a short result. A truncated JSONL line, which is what an interrupted write leaves behind,
 * produced exactly that.
 *
 * The test is a PAIR at the same match count.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchAuditRecords } from '../search.js';

const record = (tool: string, ts: string) =>
  JSON.stringify({
    ts,
    operator: { identity: 'jdoe@example.com' },
    engagement: { client: 'Contoso' },
    tool: { name: tool, params: { entityNamePlural: 'accounts' } },
    result: { success: true, recordCount: 3 },
  });

describe('searchAuditRecords', () => {
  let base: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'mcp-audit-'));
    await mkdir(join(base, 'Contoso'), { recursive: true });
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('a result set short by a malformed line and a genuinely shorter one are not equal', async () => {
    await writeFile(
      join(base, 'Contoso', '2026-08.jsonl'),
      [record('query-records', '2026-08-01T09:00:00Z'), record('get-entity', '2026-08-02T09:00:00Z')].join('\n')
    );
    const complete = await searchAuditRecords(base, {});

    // A line cut off mid-write, which is what an interrupted append leaves.
    await writeFile(
      join(base, 'Contoso', '2026-08.jsonl'),
      [
        record('query-records', '2026-08-01T09:00:00Z'),
        '{"ts":"2026-08-03T09:00:00Z","tool":{"na',
        record('get-entity', '2026-08-02T09:00:00Z'),
      ].join('\n')
    );
    const withMalformed = await searchAuditRecords(base, {});

    // Two matches in both. The footer printed under them was identical.
    expect(complete.matches).toHaveLength(2);
    expect(withMalformed.matches).toHaveLength(2);

    expect(withMalformed.lines).not.toEqual(complete.lines);
    expect(withMalformed.lines.attempted).toBe(3);
    expect(withMalformed.lines.failed).toBe(1);
    expect(withMalformed.lines.failures[0].item).toContain('2026-08.jsonl');
    expect(complete.lines.failed).toBe(0);
    expect(withMalformed.sources.failed).toBe(0);
  });

  it('counts every line it read, so a clean search says so rather than saying nothing', async () => {
    await writeFile(
      join(base, 'Contoso', '2026-08.jsonl'),
      record('query-records', '2026-08-01T09:00:00Z')
    );

    const result = await searchAuditRecords(base, { tool: 'nothing-matches-this' });

    expect(result.matches).toHaveLength(0);
    expect(result.lines.attempted).toBe(1);
    expect(result.lines.failed).toBe(0);
  });

  it('records a client folder it could not read rather than returning no records for it', async () => {
    const result = await searchAuditRecords(base, { client: 'Fabrikam' });

    expect(result.matches).toHaveLength(0);
    expect(result.sources.failed).toBe(1);
    expect(result.sources.failures[0].item).toContain('Fabrikam');
  });
});
