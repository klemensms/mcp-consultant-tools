# Audit subsystem smoke test

End-to-end smoke test for the Phase A PII audit logging subsystem against `mcptests.crm4.dynamics.com`.

## Prerequisites

1. The local `packages/powerplatform-data/build/index.js` is built (`npm run build --workspace=packages/powerplatform-data`).
2. MCPTest credentials retrieved from 1Password and substituted into `.mcp.json` (replace each `<from 1Password>` placeholder).

## Run

From the repo root, drive the following sequence via `mcp-local-tester` agent or the `/test-mcp-local` slash command, pointing at `tests/audit-smoke/.mcp.json`:

1. `set-audit-engagement(['MCPTEST-001'], 'smoke test of audit subsystem')` — establishes the engagement.
2. `query-records('contacts', "firstname eq 'Maria'", null, 5)` — first read.
3. `query-records('contacts', "lastname eq 'Schmidt'", null, 5)` — second read.
4. **In a fresh subprocess** (engagement not set), try `query-records('contacts', "firstname eq 'Maria'", null, 5)` and expect `AuditEngagementUnsetError`.

## Manual verification

After the run, the audit file should be at `audit-out/MCPTest/YYYY-MM.jsonl`.

```bash
cat tests/audit-smoke/audit-out/MCPTest/$(date +%Y-%m).jsonl | \
  jq -c '{ts,seq,tool:.tool.name,rec:.result.recordCount}'
```

Expected: 3+ entries, sequential `seq` starting at 1, `tool.name` includes `set-audit-engagement` followed by two `query-records`.

## Hash-chain verification

Until `mcp-audit-cli verify` lands (Task 21), use this inline script:

```bash
AUDIT_FILE=tests/audit-smoke/audit-out/MCPTest/$(date +%Y-%m).jsonl \
  node --eval '
import("@mcp-consultant-tools/core").then(async (m) => {
  const fs = await import("node:fs");
  const lines = fs.readFileSync(process.env.AUDIT_FILE, "utf8").trim().split("\n");
  let prev = "0".repeat(64);
  for (const line of lines) {
    const r = JSON.parse(line);
    if (r.prevHash !== prev) { console.error("CHAIN BROKEN at seq", r.seq); process.exit(1); }
    prev = m.computeRecordHash(r);
  }
  console.error("OK", lines.length, "records");
});'
```

## DO NOT commit `audit-out/`

The `audit-out/` directory contains live Dataverse responses (even at level=lean, redaction reports + tool inputs are recorded). It is `.gitignore`'d at the test scope. Only the `.mcp.json` config is checked in (with placeholder credentials).
