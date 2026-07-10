/**
 * Pure extraction of warnings/errors from a build timeline.
 *
 * Timeline facts (Microsoft Learn, api-version 7.1):
 * - Each timeline record carries `issues[]`, each with a `message` and a
 *   `type` whose ONLY values are the lowercase `error` and `warning`.
 *   Matching `"Error"`/`"Warning"` finds nothing and reports a clean build.
 * - Records also carry `errorCount`/`warningCount`. These are independent of
 *   `issues[]`: a record can report a count with no corresponding issue entry.
 *   The si source summed the counters but only listed records with a non-empty
 *   `issues[]`, so the printed detail silently under-represented the totals.
 *   We report both, and say plainly when they disagree.
 * - Record `type` (`Stage`/`Job`/`Task`/...) is NOT a documented enum. We pass
 *   it through verbatim rather than filtering on it.
 */

export interface TimelineIssue {
  type?: string;
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface TimelineRecord {
  id?: string;
  parentId?: string;
  type?: string;
  name?: string;
  result?: string;
  state?: string;
  errorCount?: number;
  warningCount?: number;
  issues?: TimelineIssue[];
  startTime?: string;
  finishTime?: string;
}

export interface ExtractedIssue {
  type: 'error' | 'warning' | 'other';
  category?: string;
  message: string;
}

export interface RecordIssues {
  recordName: string;
  recordType: string;
  result?: string;
  issues: ExtractedIssue[];
}

export interface BuildIssuesSummary {
  totalErrors: number;
  totalWarnings: number;
  /** Sum of every record's `errorCount`/`warningCount`, independent of `issues[]`. */
  timelineCounters: { errors: number; warnings: number };
  /**
   * True when the counters exceed the issues we could actually list — the server
   * counted problems it did not attach messages for. The listed detail is then a
   * subset, not the whole story.
   */
  countersExceedListedIssues: boolean;
  records: RecordIssues[];
}

function classify(issueType: string | undefined): ExtractedIssue['type'] {
  const normalised = (issueType ?? '').toLowerCase();
  if (normalised === 'error') return 'error';
  if (normalised === 'warning') return 'warning';
  return 'other';
}

/**
 * Collect the issues attached to a timeline, optionally narrowed to one severity.
 */
export function extractBuildIssues(
  records: TimelineRecord[],
  severity: 'all' | 'errors' | 'warnings' = 'all',
): BuildIssuesSummary {
  let totalErrors = 0;
  let totalWarnings = 0;
  let counterErrors = 0;
  let counterWarnings = 0;
  const out: RecordIssues[] = [];

  for (const record of records) {
    counterErrors += record.errorCount ?? 0;
    counterWarnings += record.warningCount ?? 0;

    const extracted: ExtractedIssue[] = [];
    for (const issue of record.issues ?? []) {
      const type = classify(issue.type);
      if (type === 'error') totalErrors++;
      if (type === 'warning') totalWarnings++;

      if (severity === 'errors' && type !== 'error') continue;
      if (severity === 'warnings' && type !== 'warning') continue;

      extracted.push({
        type,
        category: issue.category,
        message: issue.message ?? '',
      });
    }

    if (extracted.length > 0) {
      out.push({
        recordName: record.name ?? '(unnamed)',
        recordType: record.type ?? '(unknown)',
        result: record.result,
        issues: extracted,
      });
    }
  }

  return {
    totalErrors,
    totalWarnings,
    timelineCounters: { errors: counterErrors, warnings: counterWarnings },
    countersExceedListedIssues: counterErrors > totalErrors || counterWarnings > totalWarnings,
    records: out,
  };
}
