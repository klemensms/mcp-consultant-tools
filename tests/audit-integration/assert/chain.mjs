import { computeRecordHash, ZERO_HASH } from '@mcp-consultant-tools/core';

export function walkChain(records) {
  const valid = records.filter((r) => !r._parseError);
  if (valid.length === 0) return { ok: true, recordCount: 0 };

  let expectedPrev = ZERO_HASH;
  for (const r of valid) {
    if (r.prevHash !== expectedPrev) {
      return {
        ok: false,
        brokenAt: r.seq,
        expected: expectedPrev,
        actual: r.prevHash,
        file: r._file,
        line: r._line,
      };
    }
    expectedPrev = computeRecordHash(stripMeta(r));
  }
  return { ok: true, recordCount: valid.length };
}

function stripMeta(r) {
  const { _file, _line, _parseError, _raw, ...rest } = r;
  return rest;
}

export function findUnexpectedSequenceJumps(records) {
  const valid = records.filter((r) => !r._parseError && typeof r.seq === 'number');
  const jumps = [];
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1].seq;
    const curr = valid[i].seq;
    if (curr !== prev + 1) {
      jumps.push({ at: curr, fromSeq: prev, toSeq: curr });
    }
  }
  return jumps;
}
