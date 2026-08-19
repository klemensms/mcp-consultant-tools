/**
 * D21: `fn stats` grouped `FunctionAppLogs` by `FunctionName` without normalising it.
 * The same function reaches that column under more than one name - the bare name and a
 * `Functions.`-prefixed variant - and host-level rows arrive with the column blank. In a
 * measured run 27 real functions became 61 rows and total executions inflated from 43,445
 * to 131,977, roughly threefold. Nothing in the output said so, and a threefold inflation
 * of an execution count looks entirely plausible.
 *
 * The acceptance criterion is the failure case: a fixture containing all three name
 * variants of one function must yield one row and the un-inflated execution count, and
 * must say that it collapsed them rather than quietly returning a tidier table.
 */

import { describe, it, expect } from 'vitest';
import { collapseFunctionStats } from '../function-stats.js';

const COLUMNS = [
  { name: 'FunctionName', type: 'string' },
  { name: 'TotalExecutions', type: 'long' },
  { name: 'ErrorCount', type: 'long' },
  { name: 'SuccessCount', type: 'long' },
  { name: 'UniqueHosts', type: 'long' },
  { name: 'SuccessRate', type: 'real' },
];

const table = (rows: unknown[][]) => ({ name: 'PrimaryResult', columns: COLUMNS, rows });

/** One function, as three rows: bare name, prefixed variant, blank-named host row. */
const threeVariantsOfOneFunction = table([
  ['ProcessOrders', 1000, 10, 990, 3, 99],
  ['Functions.ProcessOrders', 1000, 10, 990, 3, 99],
  ['', 1000, 10, 990, 3, 99],
]);

describe('collapseFunctionStats', () => {
  it('yields one row and the un-inflated count for one function under three names', () => {
    const { table: collapsed } = collapseFunctionStats(threeVariantsOfOneFunction);

    expect(collapsed.rows).toHaveLength(1);
    expect(collapsed.rows[0][0]).toBe('ProcessOrders');
    expect(collapsed.rows[0][1]).toBe(1000);
  });

  it('says what it collapsed, so a tidier table is not mistaken for the raw one', () => {
    const { normalization } = collapseFunctionStats(threeVariantsOfOneFunction);

    expect(normalization).toBeDefined();
    expect(normalization!.rawRows).toBe(3);
    expect(normalization!.rows).toBe(1);
    expect(normalization!.blankNameRowsDropped).toBe(1);
    expect(normalization!.collapsed).toEqual([
      { functionName: 'ProcessOrders', variants: ['ProcessOrders', 'Functions.ProcessOrders'] },
    ]);
    expect(normalization!.note).toContain('3');
    expect(normalization!.note).toContain('1');
  });

  it('keeps the higher-counting variant whole, so the success rate stays consistent', () => {
    const { table: collapsed } = collapseFunctionStats(
      table([
        ['Functions.ProcessOrders', 400, 200, 200, 2, 50],
        ['ProcessOrders', 1000, 10, 990, 3, 99],
      ])
    );

    expect(collapsed.rows).toHaveLength(1);
    expect(collapsed.rows[0]).toEqual(['ProcessOrders', 1000, 10, 990, 3, 99]);
  });

  it('leaves an already-clean table alone, and adds no note to it', () => {
    const clean = table([
      ['ProcessOrders', 1000, 10, 990, 3, 99],
      ['SendReceipts', 500, 0, 500, 2, 100],
    ]);

    const { table: collapsed, normalization } = collapseFunctionStats(clean);

    expect(collapsed.rows).toEqual(clean.rows);
    expect(normalization!.rawRows).toBe(2);
    expect(normalization!.rows).toBe(2);
    expect(normalization!.collapsed).toEqual([]);
    expect(normalization!.blankNameRowsDropped).toBe(0);
    expect(normalization!.note).toBeUndefined();
  });

  it('keeps distinct functions apart, and re-sorts by the collapsed counts', () => {
    const { table: collapsed, normalization } = collapseFunctionStats(
      table([
        ['Functions.SendReceipts', 500, 0, 500, 2, 100],
        ['ProcessOrders', 900, 9, 891, 3, 99],
        ['SendReceipts', 500, 0, 500, 2, 100],
        ['Functions.ProcessOrders', 900, 9, 891, 3, 99],
      ])
    );

    expect(collapsed.rows.map((r) => r[0])).toEqual(['ProcessOrders', 'SendReceipts']);
    expect(collapsed.rows.map((r) => r[1])).toEqual([900, 500]);
    expect(normalization!.collapsed).toHaveLength(2);
  });

  it('does not strip a prefix off a function genuinely named Functions-something', () => {
    const { table: collapsed, normalization } = collapseFunctionStats(
      table([['FunctionsHealthCheck', 12, 0, 12, 1, 100]])
    );

    expect(collapsed.rows[0][0]).toBe('FunctionsHealthCheck');
    expect(normalization!.collapsed).toEqual([]);
  });

  it('is inert on a table that has no FunctionName column at all', () => {
    const aggregated = {
      name: 'PrimaryResult',
      columns: [
        { name: 'TotalExecutions', type: 'long' },
        { name: 'ErrorCount', type: 'long' },
      ],
      rows: [[43445, 120]],
    };

    const { table: collapsed, normalization } = collapseFunctionStats(aggregated);

    expect(collapsed).toBe(aggregated);
    expect(normalization).toBeUndefined();
  });
});
