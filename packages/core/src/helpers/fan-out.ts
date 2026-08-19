/**
 * Fan-out contract
 *
 * One shape, used by every command that collects from more than one thing and can
 * come back with fewer answers than it asked questions.
 *
 * The failure this guards against is the same one the truncation contract guards
 * against, one level up: a partially-authorised collection that is byte-for-byte
 * indistinguishable from a fully-authorised one. A per-item `catch` that logs to
 * stderr and moves on produces exactly that - the command exits 0, writes its cache
 * file, and the gap is visible only to whoever was watching the terminal at the time.
 *
 * Two rules make that impossible:
 *
 * 1. Every attempt is counted, whether or not it returned. `attempted` is the number
 *    of questions asked, so `succeeded` short of it is arithmetic rather than
 *    inference.
 * 2. Every failure is named in the payload, with what was being collected and why it
 *    could not be. A count on its own says a gap exists; the list says where.
 *
 * `FanOutRecorder.run` exists so the correct thing is shorter to write than the
 * swallowing `try`/`catch` it replaces.
 */

/** One thing that could not be collected, and why. */
export interface FanOutFailure {
  /** What was being collected from - a resource name or id, whatever identifies it. */
  item: string;
  /** What was attempted on it, e.g. `configuration`, `slots`, `databases`. */
  operation: string;
  /** The error's own message, unmodified. */
  reason: string;
  /** HTTP status where the error carried one, otherwise null. */
  statusCode: number | null;
}

/** Aggregate outcome of one fan-out. */
export interface FanOutInfo {
  /** Items this command tried to collect from. */
  attempted: number;
  /** Items that returned. */
  succeeded: number;
  /** Items that did not. */
  failed: number;
  /** One entry per failure, in the order they happened. */
  failures: FanOutFailure[];
}

/**
 * Pull an HTTP status out of whatever the client threw, without depending on a
 * particular HTTP library. Axios puts it on `response.status`, some SDKs put it on
 * `statusCode`, and a transport error carries neither.
 */
function extractStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;

  const response = (error as { response?: { status?: unknown } }).response;
  if (response && typeof response.status === 'number') return response.status;

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number') return statusCode;

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') return status;

  return null;
}

/**
 * Collects the outcome of a fan-out as it happens.
 *
 * One recorder per fan-out, `run` per item, `result()` into the payload.
 */
export class FanOutRecorder {
  private attempted = 0;
  private readonly failures: FanOutFailure[] = [];

  /**
   * Attempt one item. Returns what `fn` returned, or null when it threw.
   *
   * Returning null rather than rethrowing is deliberate: the point of a fan-out is
   * that one item's failure does not abandon the rest. The difference from the
   * `catch`-and-continue this replaces is that the failure is now in the payload
   * rather than only on stderr.
   */
  async run<T>(item: string, operation: string, fn: () => Promise<T>): Promise<T | null> {
    this.attempted++;
    try {
      return await fn();
    } catch (error) {
      this.failures.push({
        item,
        operation,
        reason: error instanceof Error ? error.message : String(error),
        statusCode: extractStatusCode(error),
      });
      return null;
    }
  }

  /** The aggregate, for the command's payload. */
  result(): FanOutInfo {
    return {
      attempted: this.attempted,
      succeeded: this.attempted - this.failures.length,
      failed: this.failures.length,
      failures: [...this.failures],
    };
  }
}

/**
 * Suffix for a summary line, in a CLI summary or an MCP tool's text response.
 * Empty when everything was collected, loud when it was not, because the summary
 * line is often the only part of the payload read before a report is written from it.
 */
export function fanOutSuffix(fanOut: FanOutInfo): string {
  if (fanOut.failed === 0) return '';

  const codes = fanOut.failures
    .map((f) => f.statusCode)
    .filter((c): c is number => c !== null);

  let commonest: number | null = null;
  let commonestCount = 0;
  for (const code of codes) {
    const count = codes.filter((c) => c === code).length;
    if (count > commonestCount) {
      commonest = code;
      commonestCount = count;
    }
  }

  const detail = commonest === null ? '' : `, mostly HTTP ${commonest}`;

  return ` [INCOMPLETE: ${fanOut.failed} of ${fanOut.attempted} could not be collected${detail}. See failures[] - do not read this as a complete set]`;
}
