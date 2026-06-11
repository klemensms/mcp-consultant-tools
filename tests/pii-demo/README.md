# PII Protection Demo Test Harness

Captures a reproducible (scenario × query) matrix of MCP responses that show
exactly what the LLM sees as the PII redaction pipeline is toggled on / off /
layer-by-layer. Output feeds the demo markdown doc and the branded
HTML visual explainer.

## Scope (current)

- **Server:** `pp-data` only. `rest-api`, `azure-devops`, `azure-sql`,
  `azure-b2c` will be added when test environments are available.
- **Scenarios:** 6 — no-protection, L1 exclusion, L2 only, L2 + L3,
  full L1–L4, observe-mode.
- **Queries:** 4 — Maria contact (run 1), Maria contact (run 2 — exercises
  cross-call correlation), Maria's annotation note, Contoso account with
  primary-contact lookup.
- **Data target:** `acmedev.crm.dynamics.com` with the seeded fixtures
  documented under "Fixtures" below.

## Fixtures (seeded in the test environment 2026-04-30)

| Record | ID | Notes |
| --- | --- | --- |
| Contact: Maria Schmidt | `91484a2f-7f44-f111-bec5-6045bdf2343f` | German PII, Layer 4 multilingual NER target. `description` field contains embedded John Smith name + email + Klaus Müller name + DOB-shape date. |
| Contact: John Smith | `0779294e-7f44-f111-bec5-7c1e5204526a` | English baseline. Description contains embedded phone number. |
| Contact: Klaus Müller | `78503054-7f44-f111-bec5-7c1e5204526a` | Unicode handling check. |
| Account: Contoso Deutschland GmbH | `3d8ca556-7f44-f111-bec5-6045bdf2343f` | Lookup `_primarycontactid_value` points at Maria. |
| Annotation on Maria | `5c8ca556-7f44-f111-bec5-6045bdf2343f` | `notetext` packs all four PII shapes (email, phone, DOB-shape, two person names) into one free-text field. |

To re-seed (e.g. fresh tenant): see `seed.md` for the canonical sequence.
*[seed.md is a TODO — the seed is currently captured in the conversation log;
extract before next re-seed].*

## Capture workflow

There are two paths. Both produce the same `output/manifest.json` schema.

### Method A — Multi-MCP-server capture (CURRENT, RECOMMENDED)

Pre-configure 6 MCP servers in `.mcp.json`, one per scenario, with the
scenario's PII env vars baked into each. Restart Claude Code so all 6 load,
then call them in parallel from a single session.

The 6 servers used: `pii-demo-1-no-protection`, `pii-demo-2-l1-exclusion`,
`pii-demo-3-l2-only`, `pii-demo-4-l2-l3`, `pii-demo-5-full-l1-l4`,
`pii-demo-6-observe-mode`. All point at `acmedev.crm.dynamics.com`. All
have write tools disabled (`POWERPLATFORM_ENABLE_*=false`) for read-only
safety.

Steps:

1. Verify the 6 entries exist in `.mcp.json` (search for `pii-demo-`).
2. Restart Claude Code so the new entries load.
3. In a single prompt, fire 4 queries × 6 servers = 24 calls in parallel
   via the `mcp__pii-demo-N-*__query-records` tools.
4. Persist the response texts to `output/responses/` (one file per row,
   named `{scenario}__{query}.txt`).
5. `node tests/pii-demo/output/_build-manifest.mjs` to regenerate
   `manifest.json` from the response files.

This is what was used to produce the current `output/`.

### Method B — Subprocess runner (NOT CURRENTLY WORKING)

A `run.mjs` Node script that spawns the pp-data MCP server as a subprocess
per scenario and runs the queries through the SDK. Requires a working
service-principal credential. Currently blocked because the
`POWERPLATFORM_CLIENT_SECRET` for `MCPTest-pp-data` (the original test
target) is rejected by Azure AD.

Once a working SP credential is available (either refreshed for mcptests
or repointed at a new service principal), this method works end-to-end without needing
the multi-MCP setup. See `run.mjs` and the precedence order in its
`loadCredentialsFromMcpJson` helper.

## Output structure

```
output/
├── manifest.json              # Indexed results: scenario × query rows
├── _build-manifest.mjs        # One-shot script that regenerates the manifest from response files
└── responses/
    ├── no-protection__pp-maria-1.txt
    ├── no-protection__pp-maria-2.txt
    ├── ...
    └── observe-mode__pp-account-lookup.txt
```

Manifest schema (per result row):

| Field | Notes |
| --- | --- |
| `scenario_id` | Matches an entry in `scenarios.mjs`. |
| `query_id` | Matches an entry in `queries.mjs`. |
| `server_id` | Which MCP server (`pp-data` for now). |
| `response_file` | Relative path under `output/`. |
| `response_chars` | Length of the captured response text. |
| `footer` | Extracted `[PII protection: ...]` summary, or `null` for unprotected scenarios. |
| `extracted` | Map of `field → value` for the fields the query declares in `extractFields`. `undefined` means the field was absent from the response — interesting signal for L1 exclusion. |

The manifest also includes top-level `scenarios`, `queries`, `servers`,
and `package_versions` so a single file is enough to reproduce the
matrix from scratch.

## Adding a surface

To add another MCP server (e.g. rest-api):

1. Add an entry to `servers` in `queries.mjs` with the build path and the
   env vars to forward.
2. Add queries that target that server.
3. Method A: pre-configure 6 MCP servers in `.mcp.json` for the new server
   too (or one combined-server-per-scenario approach if multi-server
   testing in one process is supported). Restart Claude Code, run, persist.
4. Method B: re-run `node tests/pii-demo/run.mjs`.

## Adding a scenario

Add an entry to `scenarios` in `scenarios.mjs`. If it needs a custom PII
config, add a JSON file under `configs/` and reference it via
`PII_CONFIG_PATH`. For Method A also add a matching MCP-server entry to
`.mcp.json` and re-restart.

## Files

| File | Purpose |
| --- | --- |
| `scenarios.mjs` | Declarative toggle matrix consumed by `_build-manifest.mjs`. |
| `queries.mjs` | Server registry + query catalogue + `extractFields` per query. |
| `configs/*.json` | Per-layer toggle PII configs referenced by Method A's MCP entries (and Method B's runner). |
| `run.mjs` | Method B subprocess runner (blocked on SP credential). |
| `output/_build-manifest.mjs` | Reads `output/responses/` and writes `output/manifest.json`. Method A uses this; Method B builds the manifest inline. |
| `output/` | Generated. Gitignored. |
