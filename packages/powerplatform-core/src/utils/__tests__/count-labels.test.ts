import { describe, it, expect } from 'vitest';
import { snapshotCountLabel, batchSnapshotNote } from '../count-labels.js';

describe('snapshotCountLabel', () => {
  it('labels a snapshot count as up to 24 hours old', () => {
    expect(snapshotCountLabel(true)).toBe(' (snapshot count, up to 24 hours old)');
  });

  it('adds nothing to a live count', () => {
    expect(snapshotCountLabel(false)).toBe('');
    expect(snapshotCountLabel(undefined)).toBe('');
  });
});

describe('batchSnapshotNote', () => {
  it('says how many batch counts are snapshots', () => {
    expect(
      batchSnapshotNote([
        { count: 1, snapshot: true },
        { count: 2, snapshot: false },
        { count: 3, snapshot: true },
        { count: -1, error: 'x' },
      ])
    ).toBe('2 of 4 counts are snapshot counts, up to 24 hours old (entries with "snapshot": true)');
  });

  it('is empty when every count is live', () => {
    expect(batchSnapshotNote([{ count: 2, snapshot: false }])).toBe('');
  });
});
