import type { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

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
      const clientDirs = opts.client ? [join(base, opts.client)] : await listSubdirs(base);

      const matches: any[] = [];
      for (const dir of clientDirs) {
        const files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.jsonl')).sort();
        for (const f of files) {
          const content = await fs.readFile(join(dir, f), 'utf8');
          for (const line of content.split('\n')) {
            if (!line) continue;
            let r: any;
            try {
              r = JSON.parse(line);
            } catch (err) {
              console.error(`[search] skipping malformed line in ${join(dir, f)}: ${(err as Error).message}`);
              continue;
            }
            if (matchesFilters(r, opts)) matches.push(r);
          }
        }
      }

      output(matches, opts.format ?? 'table');
    });
}

async function listSubdirs(base: string): Promise<string[]> {
  const ents = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
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

function output(rows: any[], format: string) {
  if (format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
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
  console.log(`(${rows.length} records)`);
}
