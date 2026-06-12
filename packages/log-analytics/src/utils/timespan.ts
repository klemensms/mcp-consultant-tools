/**
 * Timespan resolution for Log Analytics queries.
 *
 * The Azure Monitor Logs API treats the request-level timespan as the OUTER
 * BOUND on a query: the effective window is the intersection of the timespan
 * and any ago() filter inside the KQL. A timespan narrower than the query's
 * own ago() silently clips the results.
 */

export interface ResolvedTimespan {
  effectiveTimespan: string;
  timespanWarning?: string;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Widest ago() window in the KQL, in milliseconds (null if no ago() found). */
function widestAgoMs(query: string): { ms: number; literal: string } | null {
  const agoPattern = /ago\(\s*(\d+(?:\.\d+)?)\s*(d|h|m|s)\s*\)/g;
  const unitMs: Record<string, number> = {
    d: MS_PER_DAY,
    h: MS_PER_HOUR,
    m: MS_PER_MINUTE,
    s: MS_PER_SECOND,
  };

  let widest: { ms: number; literal: string } | null = null;
  for (const match of query.matchAll(agoPattern)) {
    const ms = parseFloat(match[1]) * unitMs[match[2]];
    if (!widest || ms > widest.ms) {
      widest = { ms, literal: `${match[1]}${match[2]}` };
    }
  }
  return widest;
}

/** Parse an ISO 8601 duration (e.g. P30D, PT1H, P1DT12H) to milliseconds. Null if not a duration. */
function isoDurationToMs(timespan: string): number | null {
  const match = timespan.match(
    /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );
  if (!match || match.slice(1).every((g) => g === undefined)) {
    return null;
  }
  const [, weeks, days, hours, minutes, seconds] = match;
  return (
    (parseFloat(weeks || '0') * 7 + parseFloat(days || '0')) * MS_PER_DAY +
    parseFloat(hours || '0') * MS_PER_HOUR +
    parseFloat(minutes || '0') * MS_PER_MINUTE +
    parseFloat(seconds || '0') * MS_PER_SECOND
  );
}

/** Render milliseconds as an ISO 8601 duration, using the largest whole unit. */
function msToIsoDuration(ms: number): string {
  if (ms % MS_PER_DAY === 0) return `P${ms / MS_PER_DAY}D`;
  if (ms % MS_PER_HOUR === 0) return `PT${ms / MS_PER_HOUR}H`;
  if (ms % MS_PER_MINUTE === 0) return `PT${ms / MS_PER_MINUTE}M`;
  return `PT${Math.ceil(ms / MS_PER_SECOND)}S`;
}

export function resolveEffectiveTimespan(
  query: string,
  explicitTimespan?: string
): ResolvedTimespan {
  const widest = widestAgoMs(query);

  if (explicitTimespan) {
    const explicitMs = isoDurationToMs(explicitTimespan);
    // Start/end datetime timespans (or anything unparseable) pass through untouched
    if (widest && explicitMs !== null && widest.ms > explicitMs) {
      return {
        effectiveTimespan: explicitTimespan,
        timespanWarning:
          `KQL requests ago(${widest.literal}) but the timespan caps the window at ${explicitTimespan} — ` +
          `results are clipped to ${explicitTimespan}. Pass a wider timespan explicitly ` +
          `(e.g. ${msToIsoDuration(widest.ms)}) if clipping is not intended.`,
      };
    }
    return { effectiveTimespan: explicitTimespan };
  }

  if (widest) {
    return { effectiveTimespan: msToIsoDuration(widest.ms) };
  }

  return { effectiveTimespan: 'PT1H' };
}
