/**
 * `listSyncedWorkItems` skipped any work-item file it could not parse.
 *
 * The skip logged a warning to stderr and moved on, so the returned list - and the `count`
 * the sync tools print from it - was silently short. A folder with one corrupt file read
 * exactly like a folder with one fewer work item, which is the wrong conclusion to draw
 * before a push.
 *
 * The test is a PAIR at the same returned count, because the count is what gets quoted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSyncedWorkItems } from '../file-utils.js';

const validFile = (id: number) => `---
id: ${id}
title: Work item ${id}
state: Active
type: User Story
lastSyncedRevision: 3
---

# Work item ${id}

Body text.
`;

describe('listSyncedWorkItems', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'ado-sync-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('a list short by an unparseable file and a genuinely shorter one are not equal', async () => {
    await writeFile(join(folder, '1234.md'), validFile(1234));
    await writeFile(join(folder, '1236.md'), validFile(1236));
    const complete = await listSyncedWorkItems(folder);

    // Same two readable files, plus one that has no frontmatter at all.
    await writeFile(join(folder, '1235.md'), 'no frontmatter here, just prose');
    const withCorrupt = await listSyncedWorkItems(folder);

    expect(complete.workItems).toHaveLength(2);
    expect(withCorrupt.workItems).toHaveLength(2);

    expect(withCorrupt.fanOut).not.toEqual(complete.fanOut);
    expect(withCorrupt.fanOut.attempted).toBe(3);
    expect(withCorrupt.fanOut.failed).toBe(1);
    expect(withCorrupt.fanOut.failures[0].item).toContain('1235.md');
    expect(complete.fanOut.attempted).toBe(2);
    expect(complete.fanOut.failed).toBe(0);
  });

  it('reports an empty folder as read rather than as nothing attempted', async () => {
    const result = await listSyncedWorkItems(folder);

    expect(result.workItems).toEqual([]);
    expect(result.fanOut.attempted).toBe(0);
    expect(result.fanOut.failed).toBe(0);
  });
});
