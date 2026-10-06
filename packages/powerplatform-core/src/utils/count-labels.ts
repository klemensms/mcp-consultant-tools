/**
 * Labels for record counts. An unfiltered count comes from Dataverse's stored
 * snapshot (RetrieveTotalRecordCount), which can be up to 24 hours old, so the
 * count-records tool and CLI say so rather than presenting it as exact.
 */

/** Suffix for a single count: empty for a live count. */
export function snapshotCountLabel(snapshot: boolean | undefined): string {
  return snapshot ? ' (snapshot count, up to 24 hours old)' : '';
}

/** One line for a batch of counts: empty when none of them is a snapshot. */
export function batchSnapshotNote(
  results: ReadonlyArray<{ count: number; snapshot?: boolean; error?: string }>
): string {
  const snapshots = results.filter((r) => r.snapshot && !r.error).length;
  if (snapshots === 0) return '';
  return `${snapshots} of ${results.length} counts are snapshot counts, up to 24 hours old (entries with "snapshot": true)`;
}
