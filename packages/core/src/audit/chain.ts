import { createHash } from 'node:crypto';

export const ZERO_HASH = '0'.repeat(64);

/**
 * Canonical JSON serialisation: keys sorted recursively, undefined values
 * dropped, no whitespace. Stable hash inputs across object key insertion
 * order.
 */
export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = canonicalize(v);
    }
    return out;
  }
  return value;
}

export function computeRecordHash(record: unknown): string {
  return createHash('sha256').update(canonicalSerialize(record), 'utf8').digest('hex');
}
