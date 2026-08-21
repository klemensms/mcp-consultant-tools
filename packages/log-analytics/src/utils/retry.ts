/**
 * Transient-failure retry for the Log Analytics query API.
 *
 * `LogAnalyticsService.executeQuery` made exactly one `axios.post` and had no retry
 * policy at all, while `azure-management`'s `ArmClient` and `azure-defender`'s
 * `DefenderClient` both retry the standard transient set with backoff and honour
 * `Retry-After`. Its 429 branch read that header purely to print it in the error
 * message, so the caller was told how long to wait and then left to wait themselves.
 *
 * Lives in this package rather than in `@mcp-consultant-tools/core`: `log-analytics`
 * pins `core` at `33.0.0` and carries a vendored copy of that version under its own
 * `node_modules`, so a helper hoisted into `core` would be invisible here until the pin
 * moves and the stale copy is deleted. That is a release-shaped change, not part of a
 * bug fix.
 */

/**
 * Statuses worth retrying identically.
 *
 * **Deliberately excludes 504**, where `ArmClient` and `DefenderClient` include it. On a
 * control-plane list a 504 is a gateway hiccup; on the query API it means the query
 * itself did not finish inside the service's own window, so an identical retry buys
 * another 30-second wait and then the same answer. The existing error message for 504
 * already says the right thing - reduce the time range or simplify the query - and
 * retrying delays the caller from reading it.
 */
export const RETRY_STATUS_CODES = [429, 500, 502, 503];

/** Attempts after the first. Matches `ArmClient`'s default. */
export const DEFAULT_MAX_RETRIES = 3;

/** Base for the exponential backoff, in ms, when the response carries no `Retry-After`. */
export const DEFAULT_RETRY_DELAY_MS = 1000;

export interface RetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  /** Label used in the stderr notice, so a reader knows which call is being retried. */
  label?: string;
  /** Injected in tests so the suite does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The bit of an axios error this policy needs, without importing axios's types. */
interface HttpErrorLike {
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
  };
}

function retryDelay(
  error: HttpErrorLike,
  attempt: number,
  retryDelayMs: number
): number {
  const raw = error.response?.headers?.['retry-after'];
  const seconds = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);

  // Honour Retry-After when the service sends a usable one. A malformed or absent
  // header falls back to backoff rather than to zero, which would hammer the service
  // exactly when it asked us not to.
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  return retryDelayMs * Math.pow(2, attempt);
}

/**
 * Run `operation`, retrying it on a transient status.
 *
 * The original error is rethrown unchanged once the retries are spent, so the caller's
 * own error mapping still sees exactly what the API returned.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    label = 'Log Analytics API request',
    sleep = defaultSleep,
  } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const status = (error as HttpErrorLike).response?.status;

      if (
        status === undefined ||
        !RETRY_STATUS_CODES.includes(status) ||
        attempt >= maxRetries
      ) {
        throw error;
      }

      const delayMs = retryDelay(error as HttpErrorLike, attempt, retryDelayMs);

      console.error(
        `${label} failed with status ${status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
      );

      await sleep(delayMs);
    }
  }
}
