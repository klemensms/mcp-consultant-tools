/**
 * The two per-item failures `SyncService` dropped without recording.
 *
 * `syncTasksToFile` fetches each child task of a parent. A task that could not be fetched
 * was logged to stderr and left out, so the generated tasks file and the `taskCount`
 * reported beside it were both silently short - a parent with four tasks and one 403 read
 * exactly like a parent with three tasks.
 *
 * `syncWorkItemsFromFile` pushes local images before updating the work item. When the whole
 * image push threw, `imageStats` stayed undefined and the work item was reported as pushed
 * cleanly, so a push that left every image behind looked like a push with no images in it.
 *
 * Both tests are PAIRS at the same visible count.
 *
 * The temp folder lives under the working directory rather than `os.tmpdir()` on purpose:
 * `validateFolderPath` rejects anything under `/var`, which is where macOS puts tmpdir. It
 * is created rather than assumed, because `npm test` runs vitest per workspace and `cwd` is
 * then the package directory, not the repo root.
 */

/** A gitignored scratch directory under the current working directory, whichever that is. */
async function makeTempFolder(prefix: string): Promise<string> {
  await mkdir(join(process.cwd(), '.context'), { recursive: true });
  return mkdtemp(join(process.cwd(), '.context', prefix));
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SyncService } from '../sync-service.js';
import { pushWorkItemImages } from '../../sync/index.js';
import { parseTasksMarkdown, tasksToMarkdown } from '../../sync/task-serializer.js';
import type { WorkItemService } from '../work-item-service.js';

// Only the image push is mocked; everything else in the sync barrel runs for real.
vi.mock('../../sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../sync/index.js')>();
  return { ...actual, pushWorkItemImages: vi.fn() };
});
const mockedPushImages = vi.mocked(pushWorkItemImages);

const parentWorkItem = (id: number) => ({
  id,
  rev: 4,
  fields: {
    'System.Id': id,
    'System.Title': `Parent ${id}`,
    'System.WorkItemType': 'User Story',
    'System.State': 'Active',
    'System.AreaPath': 'MyProject',
    'System.IterationPath': 'MyProject',
  },
});

const taskWorkItem = (id: number) => ({
  id,
  rev: 2,
  fields: {
    'System.Id': id,
    'System.Title': `Task ${id}`,
    'System.WorkItemType': 'Task',
    'System.State': 'To Do',
    'System.Description': 'Do the thing.',
  },
});

describe('SyncService.syncTasksToFile', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await makeTempFolder('ado-sync-test-');
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** Stubs the two work-item reads `syncTasksToFile` makes, failing the ids in `unreadable`. */
  const makeService = (taskIds: number[], unreadable = new Set<number>()) => {
    const workItemService = {
      async getWorkItem(_project: string, id: number) {
        if (unreadable.has(id)) {
          throw new Error(`TF401232: work item ${id} does not exist, or you do not have permission`);
        }
        return taskIds.includes(id) ? taskWorkItem(id) : parentWorkItem(id);
      },
      async queryWorkItems() {
        return { workItems: taskIds.map((id) => ({ id })) };
      },
    } as unknown as WorkItemService;

    return new SyncService(workItemService);
  };

  it('a file short by an unreadable task and a genuinely shorter one are not equal', async () => {
    const short = await makeService([501, 503]).syncTasksToFile('MyProject', [42], folder);
    const shortMarkdown = await readFile(short.pulled[0].file, 'utf-8');

    await rm(short.pulled[0].file, { force: true });

    const withDrop = await makeService([501, 502, 503], new Set([502])).syncTasksToFile(
      'MyProject',
      [42],
      folder
    );
    const withDropMarkdown = await readFile(withDrop.pulled[0].file, 'utf-8');

    // Two tasks written in both. The old result made those indistinguishable.
    expect(short.pulled[0].taskCount).toBe(2);
    expect(withDrop.pulled[0].taskCount).toBe(2);

    expect(withDrop.fanOut).not.toEqual(short.fanOut);
    expect(withDrop.fanOut.attempted).toBe(3);
    expect(withDrop.fanOut.failed).toBe(1);
    expect(withDrop.fanOut.failures[0].item).toBe('502');
    expect(withDrop.fanOut.failures[0].reason).toContain('TF401232');
    expect(short.fanOut.failed).toBe(0);

    // The file a human opens says so too, rather than looking like a complete task list.
    expect(withDropMarkdown).not.toEqual(shortMarkdown);
    expect(withDropMarkdown).toContain('could not be read');
    expect(shortMarkdown).not.toContain('could not be read');
  });
});

describe('SyncService.syncWorkItemsFromFile image push', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await makeTempFolder('ado-push-test-');
    mockedPushImages.mockReset();
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  const workItemFile = (id: number, title: string) => `---
id: ${id}
type: User Story
title: ${title}
state: Active
lastSyncedRevision: 3
---

## Description
<!-- ado-field: System.Description -->

Updated body text for ${title}.
`;

  const makeService = () =>
    new SyncService({
      async getWorkItem(_project: string, id: number) {
        return {
          id,
          rev: 3,
          fields: {
            'System.Id': id,
            'System.Title': 'Original title',
            'System.WorkItemType': 'User Story',
            'System.State': 'Active',
            'System.Description': 'Original body.',
          },
        };
      },
      async updateWorkItem(_project: string, id: number) {
        return { id, rev: 4 };
      },
    } as unknown as WorkItemService);

  it('a push whose images all failed is not reported as a clean push', async () => {
    await writeFile(join(folder, '1044.md'), workItemFile(1044, 'Contoso story'));

    mockedPushImages.mockRejectedValueOnce(new Error('ENOENT: attachments folder missing'));
    const brokenImages = await makeService().syncWorkItemsFromFile('MyProject', [1044], folder);

    await writeFile(join(folder, '1044.md'), workItemFile(1044, 'Contoso story'));
    mockedPushImages.mockResolvedValueOnce({ uploaded: 0, reused: 0, failed: [] } as any);
    const noImages = await makeService().syncWorkItemsFromFile('MyProject', [1044], folder);

    // Both report one work item pushed and no images uploaded.
    expect(brokenImages.pushed).toHaveLength(1);
    expect(noImages.pushed).toHaveLength(1);

    expect(brokenImages.imagePushes).not.toEqual(noImages.imagePushes);
    expect(brokenImages.imagePushes.attempted).toBe(1);
    expect(brokenImages.imagePushes.failed).toBe(1);
    expect(brokenImages.imagePushes.failures[0].item).toBe('1044');
    expect(brokenImages.imagePushes.failures[0].reason).toContain('ENOENT');
    expect(noImages.imagePushes.failed).toBe(0);

    // And the per-item entry says so, which is what a caller reads first.
    expect(brokenImages.pushed[0].images?.pushFailed).toContain('ENOENT');
    expect(noImages.pushed[0].images?.pushFailed).toBeUndefined();
  });
});

describe('tasksToMarkdown unreadable-task warning', () => {
  // The tasks file round-trips: a human edits it and pushes it back. A warning block that
  // the push parser mistook for a task, or that swallowed the task after it, would be a
  // silent data-loss bug of exactly the kind this package's guide warns about.
  it('does not disturb the push parser', async () => {
    const parent = { id: 42, fields: { 'System.Title': 'Parent 42' } };
    const tasks = [
      { id: 501, rev: 1, fields: { 'System.Title': 'First task', 'System.State': 'To Do' } },
      { id: 503, rev: 1, fields: { 'System.Title': 'Third task', 'System.State': 'Done' } },
    ];

    const clean = parseTasksMarkdown(tasksToMarkdown(parent, tasks, 'MyProject'));
    const warned = parseTasksMarkdown(
      tasksToMarkdown(parent, tasks, 'MyProject', [
        { id: '502', reason: 'TF401232: work item 502 does not exist' },
      ])
    );

    expect(warned.tasks.map((t) => t.id)).toEqual([501, 503]);
    expect(warned.tasks.map((t) => t.title)).toEqual(clean.tasks.map((t) => t.title));
    expect(warned.frontmatter.parentId).toBe(42);
  });
});
