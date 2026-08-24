/**
 * Task 46 — mcp-audit-cli search filter × format matrix.
 *
 * Generates a small synthetic corpus by running pp-data multiple times
 * with varied (client, operator, engagement) tuples, then exercises every
 * filter option and every output format.
 */
import { setEngagement, queryRecords, countRecords } from '../harness/client.mjs';
import { AUDIT_CLI_BUILD } from '../harness/creds.mjs';
import { spawnSync } from 'node:child_process';
import { readAuditDir } from '../assert/jsonl.mjs';
import path from 'node:path';

async function runSession(ctx, env) {
  const session = await ctx.startClient({
    MCP_ENVIRONMENT_TYPE: 'uat',
    PII_PROTECTION: 'true',
    MCP_AUDIT_LEVEL: 'lean',
    MCP_AUDIT_PATH: ctx.auditPath,
    ...env,
  });
  await setEngagement(session.client, env.WORK_ITEMS, env.REASON ?? 'search corpus');
  for (let i = 0; i < (env.QUERIES ?? 2); i++) {
    await queryRecords(session.client, { entityNamePlural: 'contacts', filter: 'firstname ne null', maxRecords: 1 });
  }
  if (env.COUNT_ONCE) {
    await countRecords(session.client, { entityNamePlural: 'contacts', filter: 'firstname ne null' });
  }
  await session.close();
}

function runSearch(args) {
  const r = spawnSync('node', [AUDIT_CLI_BUILD, 'search', '--base', args.base, ...args.extra], { encoding: 'utf8' });
  return { exitCode: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export default async function searchCli(ctx) {
  // ============================================================
  // PHASE 1 — generate corpus: 3 clients × varied operators
  // ============================================================
  await runSession(ctx, {
    MCP_AUDIT_CLIENT: 'AlphaCo',
    MCP_AUDIT_OPERATOR: 'alice@search.test',
    WORK_ITEMS: ['ALPHA-1', 'SHARED-1'],
    QUERIES: 2,
    COUNT_ONCE: true,
  });
  await runSession(ctx, {
    MCP_AUDIT_CLIENT: 'BetaCo',
    MCP_AUDIT_OPERATOR: 'bob@search.test',
    WORK_ITEMS: ['BETA-1', 'SHARED-1'],
    QUERIES: 2,
    COUNT_ONCE: false,
  });
  await runSession(ctx, {
    MCP_AUDIT_CLIENT: 'GammaCo',
    MCP_AUDIT_OPERATOR: 'alice@search.test', // alice operates on TWO clients
    WORK_ITEMS: ['GAMMA-1'],
    QUERIES: 3,
    COUNT_ONCE: false,
  });

  // Sanity: count what's on disk
  const allAlpha = await readAuditDir(path.join(ctx.auditPath, 'AlphaCo'));
  const allBeta = await readAuditDir(path.join(ctx.auditPath, 'BetaCo'));
  const allGamma = await readAuditDir(path.join(ctx.auditPath, 'GammaCo'));
  ctx.log('info', `corpus: AlphaCo=${allAlpha.length} BetaCo=${allBeta.length} GammaCo=${allGamma.length}`);

  // Expected:
  //   AlphaCo = 1 set-engagement + 2 query + 1 count = 4
  //   BetaCo  = 1 set-engagement + 2 query           = 3
  //   GammaCo = 1 set-engagement + 3 query           = 4
  //   total   = 11
  if (allAlpha.length !== 4) throw new Error(`AlphaCo expected 4 records, got ${allAlpha.length}`);
  if (allBeta.length !== 3) throw new Error(`BetaCo expected 3 records, got ${allBeta.length}`);
  if (allGamma.length !== 4) throw new Error(`GammaCo expected 4 records, got ${allGamma.length}`);

  // ============================================================
  // PHASE 2 — filter option matrix
  // ============================================================
  // Helper that runs search and counts data lines (table/json/csv all
  // include header lines — count rows by parsing).
  function countResults(out, fmt) {
    if (fmt === 'json') {
      try {
        // `search --format json` emits `{ records, sources, lines }`: the records plus the
        // two fan-outs that say what could not be read. Reading `.records` rather than
        // treating the payload as a bare array is what keeps a short result explainable.
        const payload = JSON.parse(out);
        return Array.isArray(payload?.records) ? payload.records.length : 0;
      } catch {
        return -1;
      }
    } else if (fmt === 'csv') {
      const lines = out.trim().split('\n').filter(Boolean);
      return Math.max(0, lines.length - 1); // minus header
    } else {
      // table: count lines that don't look like headers/separators
      const lines = out.trim().split('\n').filter(Boolean);
      // heuristic: drop first 1-2 header lines and any pure-separator lines
      return lines.filter((l) => /^\d{4}-\d{2}-\d{2}T/.test(l) || /\s\d{4}-\d{2}-\d{2}T/.test(l)).length;
    }
  }

  const cases = [
    {
      name: '--client AlphaCo',
      extra: ['--client', 'AlphaCo'],
      expectAtLeast: 4, expectAtMost: 4,
    },
    {
      name: '--operator alice (substring matches alice@search.test in 2 clients)',
      extra: ['--operator', 'alice'],
      expectAtLeast: 8, expectAtMost: 8, // AlphaCo (4) + GammaCo (4)
    },
    {
      name: '--operator bob',
      extra: ['--operator', 'bob'],
      expectAtLeast: 3, expectAtMost: 3, // BetaCo only
    },
    {
      name: '--tool query-records',
      extra: ['--tool', 'query-records'],
      expectAtLeast: 7, expectAtMost: 7, // 2+2+3 query records
    },
    {
      name: '--tool count-records',
      extra: ['--tool', 'count-records'],
      expectAtLeast: 1, expectAtMost: 1, // only AlphaCo did one count
    },
    {
      name: '--tool set-audit-engagement',
      extra: ['--tool', 'set-audit-engagement'],
      expectAtLeast: 3, expectAtMost: 3,
    },
    {
      name: '--workItem SHARED-1 (across 2 clients)',
      extra: ['--workItem', 'SHARED-1'],
      expectAtLeast: 7, expectAtMost: 7, // AlphaCo (4) + BetaCo (3)
    },
    {
      name: '--workItem GAMMA-1',
      extra: ['--workItem', 'GAMMA-1'],
      expectAtLeast: 4, expectAtMost: 4,
    },
    {
      name: '--entity contacts (substring on tool.params.entityNamePlural)',
      extra: ['--entity', 'contact'],
      // applies to query-records (7) and count-records (1) — set-engagement has no entityNamePlural.
      // The exact count depends on whether `--entity` filters out records without the field.
      // We assert "at least 7, at most 11".
      expectAtLeast: 7, expectAtMost: 11,
    },
    {
      name: '--since (ISO timestamp 1 hour ago — should match all)',
      extra: ['--since', new Date(Date.now() - 60 * 60 * 1000).toISOString()],
      expectAtLeast: 11, expectAtMost: 11,
    },
    {
      name: '--until (ISO timestamp 1 hour ago — should match none)',
      extra: ['--until', new Date(Date.now() - 60 * 60 * 1000).toISOString()],
      expectAtLeast: 0, expectAtMost: 0,
    },
    {
      name: '--client AlphaCo --tool query-records (combined)',
      extra: ['--client', 'AlphaCo', '--tool', 'query-records'],
      expectAtLeast: 2, expectAtMost: 2,
    },
  ];

  let passed = 0;
  for (const c of cases) {
    const r = runSearch({ base: ctx.auditPath, extra: [...c.extra, '--format', 'json'] });
    if (r.exitCode !== 0) {
      throw new Error(`${c.name} → exit=${r.exitCode}, stderr=${r.stderr.slice(0, 200)}`);
    }
    const count = countResults(r.stdout, 'json');
    if (count < c.expectAtLeast || count > c.expectAtMost) {
      throw new Error(
        `${c.name} → expected [${c.expectAtLeast}..${c.expectAtMost}] results, got ${count}.\n` +
        `stdout: ${r.stdout.slice(0, 300)}`,
      );
    }
    ctx.log('info', `✓ ${c.name} → ${count} results`);
    passed++;
  }
  ctx.log('info', `${passed}/${cases.length} filter cases passed`);

  // ============================================================
  // PHASE 3 — output format matrix
  // ============================================================
  for (const fmt of ['table', 'json', 'csv']) {
    const r = runSearch({ base: ctx.auditPath, extra: ['--format', fmt] });
    if (r.exitCode !== 0) {
      throw new Error(`format=${fmt} exit=${r.exitCode}`);
    }
    if (r.stdout.trim().length === 0) throw new Error(`format=${fmt} produced empty output`);
    if (fmt === 'json') {
      try {
        const arr = JSON.parse(r.stdout);
        if (!Array.isArray(arr) || arr.length !== 11) {
          throw new Error(`json output: expected array of 11, got ${Array.isArray(arr) ? arr.length : typeof arr}`);
        }
      } catch (e) {
        throw new Error(`json output not parseable: ${e.message}`);
      }
    } else if (fmt === 'csv') {
      const lines = r.stdout.trim().split('\n');
      // header + 11 data rows = 12 lines minimum
      if (lines.length < 12) throw new Error(`csv output: expected ≥12 lines, got ${lines.length}`);
      // Comma-separated check on data rows
      if (!lines[1].includes(',')) throw new Error(`csv first data row has no commas: ${lines[1]}`);
    } else {
      // table
      if (r.stdout.length < 100) throw new Error(`table output suspiciously short: ${r.stdout}`);
    }
    ctx.log('info', `✓ format=${fmt} produces valid output (${r.stdout.split('\n').length} lines)`);
  }

  ctx.log('info', '✓ search-cli matrix complete');
}
