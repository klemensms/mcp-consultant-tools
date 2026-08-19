/**
 * Building the `error-summary` KQL, once, for the CLI and the MCP tool alike.
 *
 * The four query shapes - three tables, each with and without retry deduplication - used
 * to be written out twice, inline in `cli/commands/query-commands.ts` and again in
 * `tools/function-tools.ts`. A column named wrongly in one copy was a defect in one
 * surface and not the other, and there was no single string a test could assert against.
 *
 * The tables carry different columns for the same idea, and that is where the defect came
 * from: the Application Insights tables group a retry by `OperationId`, which
 * `FunctionAppLogs` does not have. Its invocation column is `FunctionInvocationId`. A
 * query naming a column the table does not carry is rejected by the query API before it
 * reads a row, so the command failed identically on every workspace regardless of what
 * was in it.
 *
 * An unsupported table name now throws rather than falling through to the
 * `FunctionAppLogs` shape, so a typo cannot answer a different question from the one it
 * was asked.
 */

/** Tables `error-summary` knows how to aggregate. */
export const ERROR_SUMMARY_TABLES = ['AppExceptions', 'AppTraces', 'FunctionAppLogs'] as const;

export type ErrorSummaryTable = (typeof ERROR_SUMMARY_TABLES)[number];

export interface ErrorSummaryQuery {
  /** The KQL to execute. */
  kql: string;
  /**
   * The column a deduplicated query collapses repeats by, so the output can name it
   * rather than claiming `OperationId` on a table that has no such column. Undefined
   * when deduplication is off.
   */
  dedupeKey?: string;
}

export interface ErrorSummaryQueryOptions {
  table: string;
  /** Collapse repeats of the same error before counting error types. */
  dedupe: boolean;
  /** Minimum count for an error type to be reported. */
  minCount: number;
}

/**
 * The column each table carries the "one attempt of one operation" identity in.
 *
 * `FunctionAppLogs` is not an Application Insights table and does not carry `OperationId`.
 * Grouping its rows by `FunctionInvocationId` collapses the several log lines one
 * invocation emits, which is a narrower guarantee than the App Insights tables give -
 * a retry there is a new invocation with a new id.
 */
const DEDUPE_KEYS: Record<ErrorSummaryTable, string> = {
  AppExceptions: 'OperationId',
  AppTraces: 'OperationId',
  FunctionAppLogs: 'FunctionInvocationId',
};

function isSupportedTable(table: string): table is ErrorSummaryTable {
  return (ERROR_SUMMARY_TABLES as readonly string[]).includes(table);
}

/**
 * Build the aggregation for one table.
 *
 * Throws on a table this command has no shape for, naming the ones it does.
 */
export function buildErrorSummaryQuery(opts: ErrorSummaryQueryOptions): ErrorSummaryQuery {
  const { table, dedupe, minCount } = opts;

  if (!isSupportedTable(table)) {
    throw new Error(
      `Unsupported table '${table}' for error-summary. Supported tables: ${ERROR_SUMMARY_TABLES.join(', ')}.`
    );
  }

  const dedupeKey = dedupe ? DEDUPE_KEYS[table] : undefined;

  if (table === 'AppExceptions') {
    const kql = dedupe
      ? `
              AppExceptions
              | summarize
                  RetryCount = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(OuterMessage)
                by OperationId, ExceptionType, AppRoleName
              | summarize
                  UniqueErrors = count(),
                  TotalRetries = sum(RetryCount),
                  FirstSeen = min(FirstSeen),
                  LastSeen = max(LastSeen),
                  SampleMessage = take_any(SampleMessage)
                by ExceptionType, AppRoleName
              | where UniqueErrors >= ${minCount}
              | order by UniqueErrors desc
            `
      : `
              AppExceptions
              | summarize
                  Count = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(OuterMessage)
                by ExceptionType, AppRoleName
              | where Count >= ${minCount}
              | order by Count desc
            `;
    return { kql, dedupeKey };
  }

  if (table === 'AppTraces') {
    const kql = dedupe
      ? `
              AppTraces
              | where SeverityLevel >= 3
              | summarize
                  RetryCount = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by OperationId, AppRoleName, SeverityLevel
              | summarize
                  UniqueErrors = count(),
                  TotalRetries = sum(RetryCount),
                  FirstSeen = min(FirstSeen),
                  LastSeen = max(LastSeen),
                  SampleMessage = take_any(SampleMessage)
                by AppRoleName, SeverityLevel
              | where UniqueErrors >= ${minCount}
              | order by UniqueErrors desc
            `
      : `
              AppTraces
              | where SeverityLevel >= 3
              | summarize
                  Count = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by AppRoleName, SeverityLevel
              | where Count >= ${minCount}
              | order by Count desc
            `;
    return { kql, dedupeKey };
  }

  const kql = dedupe
    ? `
              FunctionAppLogs
              | where ExceptionDetails != ''
              | summarize
                  RetryCount = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by FunctionInvocationId, FunctionName
              | summarize
                  UniqueErrors = count(),
                  TotalRetries = sum(RetryCount),
                  FirstSeen = min(FirstSeen),
                  LastSeen = max(LastSeen),
                  SampleMessage = take_any(SampleMessage)
                by FunctionName
              | where UniqueErrors >= ${minCount}
              | order by UniqueErrors desc
            `
    : `
              FunctionAppLogs
              | where ExceptionDetails != ''
              | summarize
                  Count = count(),
                  FirstSeen = min(TimeGenerated),
                  LastSeen = max(TimeGenerated),
                  SampleMessage = take_any(Message)
                by FunctionName
              | where Count >= ${minCount}
              | order by Count desc
            `;
  return { kql, dedupeKey };
}
