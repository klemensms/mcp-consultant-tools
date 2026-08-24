import type { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { FanOutRecorder, fanOutSuffix, type FanOutInfo } from '@mcp-consultant-tools/core';

export interface SearchResult {
  matches: any[];
  /**
   * Client folders and audit files the search opened. A folder it cannot read is a
   * permissions problem that looks exactly like a client with no audit history.
   */
  sources: FanOutInfo;
  /**
   * Individual audit lines. A malformed line used to be skipped with a stderr warning, so
   * the result set and the `(N records)` footer under it were silently short. An audit
   * search is read as evidence, and "no record of that" is what a short result looks like.
   */
  lines: FanOutInfo;
}

export function registerSearch(program: Command): void {
  program
    .command('search')
    .description('Search audit JSONL files by metadata')
    .option('--client <name>', 'Restrict to one client folder')
    .option('--operator <id>', 'Match operator.identity OR operator.fingerprint substring')
    .option('--since <iso>', 'Records on or after this ISO timestamp (e.g. 2026-05-01)')
    .option('--until <iso>', 'Records on or before this ISO timestamp')
    .option('--tool <name>', 'Filter by tool.name (exact match)')
    .option('--entity <name>', 'Filter by tool.params.entityNamePlural (substring)')
    .option('--workItem <id>', 'Filter records whose engagement.workItemIds contains this ID')
    .option('--base <path>', `Override base audit dir (default: ${join(homedir(), '.mcp-audit')})`)
    .option('--format <fmt>', 'Output format: table|json|csv', 'table')
    .action(async (opts: any) => {
      const base = opts.base ?? join(homedir(), '.mcp-audit');
      const result = await searchAuditRecords(base, opts);
      output(result, opts.format ?? 'table');
    });
}

/**
 * Read every audit line under `base` and return the ones matching the filters, plus what
 * could not be read. Extracted from the command action so it is testable without a CLI.
 */
export async function searchAuditRecords(base: string, opts: any): Promise<SearchResult> {
  const sources = new FanOutRecorder();
  const lines = new FanOutRecorder();
  const clientDirs = opts.client ? [join(base, opts.client)] : await listSubdirs(base, sources);

  const matches: any[] = [];
  for (const dir of clientDirs) {
    const listed = await sources.run(dir, 'list client folder', () => fs.readdir(dir));
    if (listed === null) continue;

    const files = listed.filter((f) => f.endsWith('.jsonl')).sort();
    for (const f of files) {
      const path = join(dir, f);
      const content = await sources.run(path, 'read audit file', () => fs.readFile(path, 'utf8'));
      if (content === null) continue;

      let lineNumber = 0;
      for (const line of content.split('\n')) {
        lineNumber++;
        if (!line) continue;

        const record = await lines.run(`${path}:${lineNumber}`, 'parse audit line', async () =>
          JSON.parse(line)
        );
        if (record === null) continue;

        if (matchesFilters(record, opts)) matches.push(record);
      }
    }
  }

  return { matches, sources: sources.result(), lines: lines.result() };
}

async function listSubdirs(base: string, reads: FanOutRecorder): Promise<string[]> {
  // A missing base directory genuinely means no audit records, so it is not recorded as a
  // failure - but an unreadable one is, because that is a permissions problem wearing the
  // same clothes.
  const ents = await fs
    .readdir(base, { withFileTypes: true })
    .catch(async (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      await reads.run(base, 'list audit base', async () => {
        throw error;
      });
      return [];
    });
  return ents.filter((e) => e.isDirectory()).map((e) => join(base, e.name));
}

function matchesFilters(r: any, o: any): boolean {
  if (o.operator) {
    const hay = `${r.operator?.identity ?? ''} ${r.operator?.fingerprint ?? ''}`;
    if (!hay.toLowerCase().includes(String(o.operator).toLowerCase())) return false;
  }
  if (o.since && (r.ts ?? '') < o.since) return false;
  if (o.until && (r.ts ?? '') > o.until) return false;
  if (o.tool && r.tool?.name !== o.tool) return false;
  if (o.entity) {
    const e = r.tool?.params?.entityNamePlural ?? '';
    if (!String(e).toLowerCase().includes(String(o.entity).toLowerCase())) return false;
  }
  if (o.workItem) {
    const ids: string[] = r.engagement?.workItemIds ?? [];
    if (!ids.includes(o.workItem)) return false;
  }
  return true;
}

function output(result: SearchResult, format: string) {
  const rows = result.matches;

  if (format === 'json') {
    // The gaps travel inside the payload here, because a JSON consumer never sees the
    // footer the table format prints.
    console.log(
      JSON.stringify({ records: rows, sources: result.sources, lines: result.lines }, null, 2)
    );
    return;
  }
  if (format === 'csv') {
    console.log('ts,operator,client,workItems,tool,entity,success,recordCount');
    for (const r of rows) {
      const cols = [
        r.ts,
        r.operator?.identity ?? r.operator?.fingerprint ?? '',
        r.engagement?.client ?? '',
        (r.engagement?.workItemIds ?? []).join('|'),
        r.tool?.name ?? '',
        r.tool?.params?.entityNamePlural ?? '',
        r.result?.success ? 'true' : 'false',
        r.result?.recordCount ?? '',
      ].map((s: any) => `"${String(s).replace(/"/g, '""')}"`);
      console.log(cols.join(','));
    }
    return;
  }
  // table
  console.log(['ts'.padEnd(24), 'operator'.padEnd(30), 'client'.padEnd(10), 'tool'.padEnd(20), 'entity'.padEnd(20), 'success', 'count'].join(' | '));
  for (const r of rows) {
    console.log([
      (r.ts ?? '').padEnd(24),
      (r.operator?.identity ?? r.operator?.fingerprint ?? '').padEnd(30).slice(0, 30),
      (r.engagement?.client ?? '').padEnd(10),
      (r.tool?.name ?? '').padEnd(20),
      String(r.tool?.params?.entityNamePlural ?? '').padEnd(20),
      r.result?.success ? 'OK' : 'FAIL',
      String(r.result?.recordCount ?? ''),
    ].join(' | '));
  }
  console.log(`(${rows.length} records)${fanOutSuffix(result.sources)}${fanOutSuffix(result.lines)}`);
}
