/**
 * Building the sync-investigation KQL, once, for the CLI and the MCP tool alike.
 *
 * The four query shapes plus the workspace-name parse used to be written out twice,
 * inline in `cli/commands/query-commands.ts` and again in `tools/function-tools.ts`.
 * That is the same duplication that produced the invalid `FunctionAppLogs` query the
 * `error-summary` extraction closed: a column named wrongly in one copy is a defect in
 * one surface and not the other, and there is no single string a test can assert
 * against. The two copies had already drifted - one rendered its empty-result note with
 * a tick and the other without.
 *
 * The parse lives here too. It used to `process.exit(1)` in the CLI and return an
 * `isError` payload in the tool, so an unparseable workspace name failed in two
 * different ways depending on which surface asked.
 */

/** Sync-app name derived from a workspace id, plus the parts it was derived from. */
export interface SyncAppTarget {
  environment: string;
  client: string;
  /** Prefix of the sync function apps. Real app names extend it, hence `contains`. */
  appPattern: string;
}

/**
 * Derive the sync function-app name from a workspace id.
 *
 * `log-{environment}-{client}-...` yields `func-{environment}-{client}-sc-sync`.
 * Throws rather than exiting or returning a sentinel, so both surfaces fail the same way.
 */
export function parseSyncAppTarget(resourceId: string): SyncAppTarget {
  const match = resourceId.match(/^log-([^-]+)-([^-]+)/);
  if (!match) {
    throw new Error(
      `Could not parse environment/client from resourceId '${resourceId}'. Expected format: log-{environment}-{client}-...`
    );
  }

  const environment = match[1];
  const client = match[2];

  return {
    environment,
    client,
    appPattern: `func-${environment}-${client}-sc-sync`,
  };
}

/** The four queries a sync investigation runs. `recentErrors` is null when details are off. */
export interface SyncInvestigationQueries {
  errorsByFunction: string;
  errorCategory: string;
  recentErrors: string | null;
  errorTraces: string;
}

export interface SyncInvestigationQueryOptions {
  appPattern: string;
  /** Include the recent-error detail query. */
  includeDetails: boolean;
  /** Row cap on the recent-error detail query. */
  detailsLimit: number;
}

/**
 * Build the sync-investigation KQL.
 *
 * Every query collapses retries by `OperationId` before counting, so a single failing
 * operation retried twenty times reports as one error with a retry count rather than as
 * twenty errors. `AppExceptions` and `AppTraces` both carry `OperationId`, so unlike the
 * `error-summary` shapes there is no per-table column to get wrong here.
 */
export function buildSyncInvestigationQueries(
  options: SyncInvestigationQueryOptions
): SyncInvestigationQueries {
  const { appPattern, includeDetails, detailsLimit } = options;

  const errorsByFunction = `
          AppExceptions
          | where AppRoleName contains "${appPattern}"
          | extend FunctionName = tostring(Properties.AzureFunctions_FunctionName)
          | summarize
              RetryCount = count(),
              FirstSeen = min(TimeGenerated),
              LastSeen = max(TimeGenerated),
              SampleMessage = take_any(OuterMessage)
            by OperationId, FunctionName, ExceptionType
          | summarize
              UniqueErrors = count(),
              TotalRetries = sum(RetryCount),
              FirstSeen = min(FirstSeen),
              LastSeen = max(LastSeen),
              SampleMessage = take_any(SampleMessage)
            by FunctionName, ExceptionType
          | order by UniqueErrors desc
        `;

  const errorCategory = `
          AppExceptions
          | where AppRoleName contains "${appPattern}"
          | extend ErrorCategory = case(
              ExceptionType contains "FaultException" or ExceptionType contains "OrganizationService", "Dataverse",
              ExceptionType contains "ServiceBus", "ServiceBus",
              ExceptionType contains "Sql", "Database",
              ExceptionType contains "Timeout", "Timeout",
              ExceptionType contains "Socket" or ExceptionType contains "Http", "Network",
              "Other"
            )
          | summarize
              RetryCount = count(),
              UniqueOps = dcount(OperationId)
            by ErrorCategory
          | order by UniqueOps desc
        `;

  const recentErrors = includeDetails
    ? `
          AppExceptions
          | where AppRoleName contains "${appPattern}"
          | extend FunctionName = tostring(Properties.AzureFunctions_FunctionName)
          | summarize
              TimeGenerated = max(TimeGenerated),
              RetryCount = count(),
              OuterMessage = take_any(OuterMessage)
            by OperationId, FunctionName, ExceptionType
          | project TimeGenerated, FunctionName, ExceptionType, OuterMessage, RetryCount
          | order by TimeGenerated desc
          | take ${detailsLimit}
        `
    : null;

  const errorTraces = `
          AppTraces
          | where AppRoleName contains "${appPattern}"
          | where SeverityLevel >= 3
          | summarize
              RetryCount = count()
            by OperationId, Message
          | summarize
              UniqueErrors = count(),
              TotalCount = sum(RetryCount)
            by Message
          | order by UniqueErrors desc
          | take 10
        `;

  return { errorsByFunction, errorCategory, recentErrors, errorTraces };
}
