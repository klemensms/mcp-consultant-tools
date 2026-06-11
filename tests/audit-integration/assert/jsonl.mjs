import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function readAuditFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const lines = raw.split('\n');
  const records = [];
  let lineNum = 0;
  for (const line of lines) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      records.push({ ...parsed, _file: filePath, _line: lineNum });
    } catch (err) {
      records.push({ _file: filePath, _line: lineNum, _parseError: err.message, _raw: line });
    }
  }
  return records;
}

export async function readAuditDir(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const jsonlFiles = entries.filter((e) => e.endsWith('.jsonl')).sort();
  const all = [];
  for (const fname of jsonlFiles) {
    const full = path.join(dir, fname);
    const recs = await readAuditFile(full);
    all.push(...recs);
  }
  return all;
}

export async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function listAuditFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries.filter((e) => e.endsWith('.jsonl')).sort().map((f) => path.join(dir, f));
}
