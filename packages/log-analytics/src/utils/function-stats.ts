/**
 * Normalising `FunctionAppLogs`'s `FunctionName` column.
 *
 * One Azure Function reaches that column under more than one name. The host writes rows
 * carrying the bare name, the functions runtime writes rows carrying a `Functions.`
 * prefix, and host-level rows arrive with the column blank. A `summarize ... by
 * FunctionName` over the raw column therefore returns one row per *name*, not one per
 * *function*, and a consumer summing the column gets a multiple of the real total. In one
 * measured run 27 functions became 61 rows and 43,445 executions became 131,977.
 *
 * That is the defect class this repo keeps closing: a wrong number that looks like good
 * news. A threefold execution count is not obviously wrong on sight, so it is not
 * cross-checked. Collapsing the variants silently would swap one unverifiable number for
 * another, so the result also carries what was collapsed and what was dropped.
 *
 * The prefix is stripped only when it is exactly `Functions.` - a function genuinely named
 * `FunctionsHealthCheck` keeps its name.
 */

const FUNCTIONS_PREFIX = 'Functions.';

/** One Azure Monitor result table, as the query API returns it. */
export interface StatsTable {
  name: string;
  columns: { name: string; type: string }[];
  rows: any[][];
}

/** What collapsing the name variants changed, so the tidier table is not mistaken for the raw one. */
export interface FunctionStatsNormalization {
  /** Rows the query returned. */
  rawRows: number;
  /** Rows after collapsing. */
  rows: number;
  /** Rows dropped because `FunctionName` was blank - host-level rows, not a function. */
  blankNameRowsDropped: number;
  /** One entry per function that arrived under more than one name. */
  collapsed: Array<{ functionName: string; variants: string[] }>;
  /** Present only when something was actually collapsed or dropped. */
  note?: string;
}

/**
 * Strip the `Functions.` prefix, if it is there.
 */
export function normaliseFunctionName(name: string): string {
  return name.startsWith(FUNCTIONS_PREFIX) ? name.slice(FUNCTIONS_PREFIX.length) : name;
}

/**
 * Collapse a per-function stats table onto one row per function.
 *
 * Where a function arrived under several names, the row with the highest
 * `TotalExecutions` is kept **whole** rather than the columns being maximised
 * independently, so `SuccessRate` stays consistent with the counts beside it. The rows are
 * re-sorted by `TotalExecutions` descending, because collapsing changes the order the
 * query's own `order by` produced.
 *
 * A table with no `FunctionName` column is already aggregated across functions and is
 * returned untouched, with no normalisation block - there is nothing to collapse and
 * nothing to declare.
 */
export function collapseFunctionStats(table: StatsTable): {
  table: StatsTable;
  normalization?: FunctionStatsNormalization;
} {
  const nameIndex = table.columns?.findIndex((c) => c.name === 'FunctionName') ?? -1;
  if (nameIndex < 0) return { table };

  const totalIndex = table.columns.findIndex((c) => c.name === 'TotalExecutions');
  const rawRows = table.rows.length;

  let blankNameRowsDropped = 0;
  /** Normalised name -> the rows that carried it, in the order they arrived. */
  const groups = new Map<string, { variants: string[]; rows: any[][] }>();

  for (const row of table.rows) {
    const raw = row[nameIndex] === null || row[nameIndex] === undefined ? '' : String(row[nameIndex]);
    if (raw.trim() === '') {
      blankNameRowsDropped++;
      continue;
    }

    const name = normaliseFunctionName(raw);
    const group = groups.get(name) ?? { variants: [], rows: [] };
    group.variants.push(raw);
    group.rows.push(row);
    groups.set(name, group);
  }

  const kept: any[][] = [];
  const collapsed: Array<{ functionName: string; variants: string[] }> = [];

  for (const [name, group] of groups) {
    const winner =
      totalIndex < 0
        ? group.rows[0]
        : group.rows.reduce((best, row) =>
            Number(row[totalIndex] ?? 0) > Number(best[totalIndex] ?? 0) ? row : best
          );

    // Report the function under its normalised name, whichever variant won.
    const out = [...winner];
    out[nameIndex] = name;
    kept.push(out);

    if (group.variants.length > 1) collapsed.push({ functionName: name, variants: group.variants });
  }

  if (totalIndex >= 0) {
    kept.sort((a, b) => Number(b[totalIndex] ?? 0) - Number(a[totalIndex] ?? 0));
  }

  const normalization: FunctionStatsNormalization = {
    rawRows,
    rows: kept.length,
    blankNameRowsDropped,
    collapsed,
  };

  if (collapsed.length > 0 || blankNameRowsDropped > 0) {
    const parts: string[] = [];
    if (collapsed.length > 0) {
      parts.push(
        `${collapsed.length} function(s) reported under more than one FunctionName were collapsed onto one row each, keeping the highest-counting variant`
      );
    }
    if (blankNameRowsDropped > 0) {
      parts.push(`${blankNameRowsDropped} row(s) with a blank FunctionName were dropped as host-level, not per-function`);
    }
    normalization.note = `${rawRows} raw row(s) became ${kept.length}: ${parts.join('; ')}.`;
  }

  return { table: { ...table, rows: kept }, normalization };
}
