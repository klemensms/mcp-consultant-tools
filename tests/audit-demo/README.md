# Synthetic audit demo

> **Status: scaffold only — live run pending MCPTest credentials.**
> The 6 scenarios documented here are not yet executed. `.mcp.json` carries
> placeholder secrets; nothing under `audit-out/` or `output/` is committed.
> When credentials are available, follow the manual run procedure below to
> regenerate the demo.

End-to-end synthetic demo for the Phase A PII audit logging subsystem against
`mcptests.crm4.dynamics.com`. Six scenarios exercise the refuse-to-start
matrix, refuse-to-execute behaviour, lean and full happy paths, context
switching across engagements, and chain quarantine + recovery.

## Files

- `.mcp.json` — MCP server config for the demo (placeholder secrets).
- `scenarios.mjs` — ES module exporting the 6 scenario descriptors as data.
  Read this first for the exact tool calls and expected outcomes per
  scenario. Not a runner — the operator drives the steps.
- `README.md` — this file: manual run procedure, verification commands.
- `audit-out/` — gitignored. Where the live `MCPTest/YYYY-MM.jsonl` chain
  lands when scenarios are run.
- `output/` — gitignored. Where stderr captures, JSONL snapshots, and the
  generated `demo.md` summary land.

## Prerequisites

1. Build the powerplatform-data server:

   ```bash
   npm run build --workspace=packages/powerplatform-data
   ```

2. Build the audit CLI:

   ```bash
   npm run build --workspace=packages/audit-cli
   ```

3. Substitute MCPTest credentials (from 1Password) into `.mcp.json` —
   replace each `<from 1Password>` placeholder.

4. From this directory:

   ```bash
   cd tests/audit-demo
   ```

## Run procedure

The scenarios are NOT scripted — they are documented in `scenarios.mjs` and
driven manually. The recommended driver is the `mcp-local-tester` agent (or
the `/test-mcp-local` slash command), which can pass `.mcp.json` directly.

For each scenario, capture:
- Stdout from each tool call.
- Stderr when refuse-to-start scenarios are exercised.
- The contents of `audit-out/MCPTest/YYYY-MM.jsonl` after the scenario completes.

Persist captures into `output/scenario-N-<short-name>/` so the demo can be
regenerated and diffed across releases.

### Scenario 1 — refuse-to-start matrix (5 sub-scenarios)

Five subprocess invocations with deliberately-bad config. Each must exit 1
with a clear refuse-to-start error on stderr. Run each as a one-shot:

```bash
# 1a — production + MCP_AUDIT_LEVEL unset
MCP_ENVIRONMENT_TYPE=production \
POWERPLATFORM_URL=https://mcptests.crm4.dynamics.com \
POWERPLATFORM_CLIENT_ID=<from 1Password> \
POWERPLATFORM_CLIENT_SECRET=<from 1Password> \
POWERPLATFORM_TENANT_ID=<from 1Password> \
node ../../packages/powerplatform-data/build/index.js
# expect: exit 1; stderr contains "MCP_AUDIT_LEVEL must be set explicitly"
```

Repeat for sub-scenarios 1b–1e per the env blocks in
`scenarios.mjs:1-refuse-to-start-matrix`. Sub-scenario 1e requires
pre-staging `./audit-out/MCPTest/.chain-state` with garbage JSON before
spawning the server.

### Scenario 2 — refuse-to-execute (no engagement)

Spawn the server with the demo `.mcp.json`. Without calling
`set-audit-engagement` first, call:

```
query-records('contacts', "firstname eq 'Maria'", null, 5)
```

Expected: tool returns `AuditEngagementUnsetError` with the message
"Audit engagement not set. Call set-audit-engagement(workItemIds, reason)
first …". Nothing written to `./audit-out/`.

### Scenario 3 — happy path lean

Confirm `MCP_AUDIT_LEVEL=lean` in `.mcp.json` (default for this demo). Drive
the 6 calls in `scenarios.mjs:3-happy-path-lean`:

1. `set-audit-engagement(['MCPTEST-001'], 'audit demo lean happy path')`
2. `query-records('contacts', "firstname eq 'Maria'", null, 5)`
3. `get-record('contacts', '<GUID from step 2>')`
4. `count-records('contacts')`
5. `get-entity-metadata('contact')`
6. `get-lookup-target('contact', 'parentcustomerid')`

Verify:

```bash
node ../../packages/audit-cli/build/index.js verify ./audit-out/MCPTest --quiet
node ../../packages/audit-cli/build/index.js search --base ./audit-out --client MCPTest --tool query-records --format table
```

Expected: 6 records emitted (sequential `seq` 1–6, monotonic `prevHash`
chain). `verify` reports OK. `search` returns the `query-records` row.

### Scenario 4 — happy path full

Stop the server, change `MCP_AUDIT_LEVEL` to `full` in `.mcp.json`, restart,
then re-run the same 6 calls (with new engagement reason "audit demo full
happy path"). Verify:

```bash
node ../../packages/audit-cli/build/index.js verify ./audit-out/MCPTest --quiet

# Confirm payload populated — lean mode would have null payload here.
jq -c 'select(.tool.name=="query-records") | {seq, has_input: (.payload.input != null), has_output: (.payload.output != null)}' \
  ./audit-out/MCPTest/$(date +%Y-%m).jsonl
```

Expected: `verify` reports OK. Every record has `payload.input` populated
(PII-redacted via the standard pipeline). Read-tool records also have
`payload.output` populated.

### Scenario 5 — context switch

Two engagements in a single session. Drive
`scenarios.mjs:5-context-switch`:

1. `set-audit-engagement(['MCPTEST-001'], 'context switch — engagement A')`
2. `query-records('contacts', null, null, 1)`
3. `count-records('accounts')`
4. `set-audit-engagement(['MCPTEST-002'], 'context switch — engagement B')`
5. `query-records('accounts', null, null, 1)`
6. `count-records('contacts')`

Verify:

```bash
jq -c '{seq, tool: .tool.name, wi: .engagement.workItemIds, ctxFrom: (.tool.contextChange.from.workItemIds // null), ctxTo: (.tool.contextChange.to.workItemIds // null)}' \
  ./audit-out/MCPTest/$(date +%Y-%m).jsonl

node ../../packages/audit-cli/build/index.js verify ./audit-out/MCPTest --quiet
```

Expected: records 1–3 carry `engagement.workItemIds = ["MCPTEST-001"]`;
record 4 (the second `set-audit-engagement`) carries
`contextChange.from.workItemIds = ["MCPTEST-001"]` and
`contextChange.to.workItemIds = ["MCPTEST-002"]`; records 5–6 carry
`engagement.workItemIds = ["MCPTEST-002"]`. Chain verifies OK.

### Scenario 6 — quarantine recovery

Snapshot the JSONL file, then deliberately corrupt one byte:

```bash
AUDIT_FILE=./audit-out/MCPTest/$(date +%Y-%m).jsonl
cp "$AUDIT_FILE" "$AUDIT_FILE.pre-corruption.bak"
# Flip one hex char in line 3's prevHash:
python3 -c "
import sys
lines = open('$AUDIT_FILE').readlines()
lines[2] = lines[2].replace('\"prevHash\":\"a', '\"prevHash\":\"b', 1) if 'a' in lines[2][:200] else lines[2].replace('\"prevHash\":\"0', '\"prevHash\":\"1', 1)
open('$AUDIT_FILE','w').writelines(lines)
"
```

Verify (expect failure):

```bash
node ../../packages/audit-cli/build/index.js verify "$AUDIT_FILE"
# expect: exit 2; "BROKEN ... prevHash mismatch ... at line 3 (seq 3)"
```

Quarantine and re-verify:

```bash
node ../../packages/audit-cli/build/index.js quarantine "$AUDIT_FILE" --reason "demo corruption — synthetic byte flip on line 3"
node ../../packages/audit-cli/build/index.js verify "$AUDIT_FILE"
# expect: exit 0; OK; records=1 (the sentinel)
```

Restart the server, fire one fresh `set-audit-engagement`, and verify
again — the new chain should extend cleanly:

```bash
node ../../packages/audit-cli/build/index.js verify "$AUDIT_FILE"
# expect: exit 0; OK; records=2
```

The original `<name>.broken-<ts>` file remains alongside for forensic
review.

## DO NOT commit `audit-out/`

The `audit-out/` directory contains live Dataverse responses (even at
`MCP_AUDIT_LEVEL=lean`, redaction reports + tool inputs are recorded). At
`full`, full record payloads land too. It is `.gitignore`'d at this test
scope alongside `output/`. Only `.mcp.json` (with placeholder credentials)
is checked in.
