/**
 * Labels for record counts. Counts are live, except an unfiltered table over
 * Dataverse's 50,000-row live limit, which falls back to the stored count
 * (RetrieveTotalRecordCount): the whole table, not limited to the caller's
 * access, up to 24 hours old. The count-records tool and CLI say so.
 */

/** Suffix for a single count: empty for a live count. */
export function snapshotCountLabel(snapshot: boolean | undefined): string {
  return snapshot
    ? ' (over the 50,000 live limit: stored count for the whole table, not limited to your access, up to 24 hours old)'
    : '';
}

/** One line for a batch of counts: empty when none of them is a snapshot. */
export function batchSnapshotNote(
  results: ReadonlyArray<{ count: number; snapshot?: boolean; error?: string }>
): string {
  const snapshots = results.filter((r) => r.snapshot && !r.error).length;
  if (snapshots === 0) return '';
  return `${snapshots} of ${results.length} counts are over the 50,000 live limit and use the stored count for the whole table, not limited to your access, up to 24 hours old (entries with "snapshot": true)`;
}
