/**
 * sweepForPii — grep every record body for known-PII fixture strings.
 *
 * Returns {leaked: [{seq, file, fixturePath, fixtureValue, foundIn}], cleanCount}
 * - cleanCount = number of records that contained NO known-PII strings
 * - leaked = list of every (record, fixture) pair where the fixture string
 *   appeared in the JSON-stringified record body. The `foundIn` field gives
 *   a coarse hint at which top-level path contained it.
 */
export function sweepForPii(records, fixtures) {
  const knownStrings = collectKnownStrings(fixtures);
  const leaked = [];
  let cleanCount = 0;

  for (const r of records) {
    if (r._parseError) continue;
    const stripped = stripMeta(r);
    const blobByPath = stringifyByPath(stripped);
    let recordLeaked = false;
    for (const { value, fixturePath } of knownStrings) {
      for (const [topPath, blob] of Object.entries(blobByPath)) {
        if (blob.includes(value)) {
          leaked.push({
            seq: r.seq,
            file: r._file,
            fixturePath,
            fixtureValue: value,
            foundIn: topPath,
          });
          recordLeaked = true;
        }
      }
    }
    if (!recordLeaked) cleanCount++;
  }

  return { leaked, cleanCount, totalScanned: records.filter((r) => !r._parseError).length };
}

function stripMeta(r) {
  const { _file, _line, _parseError, _raw, ...rest } = r;
  return rest;
}

function collectKnownStrings(fixtures) {
  const out = [];
  for (const fixture of fixtures) {
    const id = fixture.id ?? '<unknown>';
    for (const [field, value] of Object.entries(fixture.knownStrings ?? {})) {
      if (typeof value !== 'string' || value.length === 0) continue;
      out.push({ value, fixturePath: `${id}.${field}` });
    }
  }
  return out;
}

function stringifyByPath(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === '_file' || k === '_line' || k === '_parseError' || k === '_raw') continue;
    try {
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    } catch {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * Asserts that every fixture string appears NOWHERE in any record. Returns the
 * leakage report — caller should check `leaked.length === 0` and pretty-print
 * a useful failure message if not.
 */
export function assertNoLeakage(records, fixtures) {
  const report = sweepForPii(records, fixtures);
  if (report.leaked.length > 0) {
    const summary = report.leaked
      .slice(0, 10)
      .map((l) => `  - seq=${l.seq} ${l.fixturePath} → leaked into ${l.foundIn}`)
      .join('\n');
    throw new Error(
      `assertNoLeakage: ${report.leaked.length} leaks across ${report.totalScanned} records:\n${summary}` +
        (report.leaked.length > 10 ? `\n  ... and ${report.leaked.length - 10} more` : ''),
    );
  }
  return report;
}
