# CLI assurance remediation plan

Remediation queue for defects found during two live assurance runs (roughly 700 CLI
invocations across six CLIs). Source report is held outside this repo and is not
reproduced here; every defect below is restated in this repo's own sanctioned terms.
All counts are real and measured, and carry nothing that identifies the estate.

## The failure mode that unites these

Roughly 22 of the first 29 defects **fail towards a clean-looking result rather than
towards an error**. A wrong number that looks like good news is not cross-checked on
an engagement, so the report reads as an all-clear. Two defects invert this and
manufacture false alarm instead.

## Acceptance criterion — applies to every task below

For each fix, add a test that asserts the **failure** case, not just the success case:

- A truncated result must not be indistinguishable from a complete one.
- A filtered result must not be indistinguishable from an empty one.
- A partially-authorised collection must not be indistinguishable from a fully-authorised one.

A fix that only proves the happy path does not close its task.

## Done

- [x] **X3 · one truncation contract** across `powerplatform` list commands. Shipped in
      `v35.0.0-beta.17`. Closed D1, D2, D3, D4 and D6. See
      `docs/release-notes/v35.0.0-beta.17.md`.
- [x] **T1 · D5 — `plugin trace-logs --exception-only`**. Filter now excludes the empty
      string as well as null, and the payload carries `exceptionCount` alongside
      `totalCount`. Not yet published; lands on `release/35.0`.
- [x] **T2 · X2 — aggregate failure counts**, scoped as planned to the shared contract
      plus one package. `FanOutRecorder` / `fanOutSuffix` in `@mcp-consultant-tools/core`,
      `outputResult` exits 1 on a payload whose fan-out lost items, and all 15 swallowing
      `catch` blocks in `azure-management` now report. The remaining packages are the
      unscheduled sweep in register item 2.
- [x] **T7 · D12 — `--include-configuration` fails silently**. Closed by T2 in the same
      edit: the 403s are now counted and named, and each site carries
      `configurationUnavailable: true` so a blank cannot read as "no settings".
- [x] **T3 · D8 — `graph role-assignments` resolves no role name**. The lookup now joins
      on the trailing GUID rather than the whole id, because the two sides carry
      different scope prefixes. A wholly unresolved result declares itself via
      `summary.note`, and `roleDefinitionsFound` separates "lookup returned nothing"
      from "returned definitions that did not match". Root cause is inferred from the
      measured evidence, not confirmed live - see register item 11.

## Queue

Ordered by the source report's own priority. One task per heading; a hop may take
more than one when its context measurement allows.

### T4 · D9 — `networking event-grid-topics` reports zero while topics exist
- **Package:** `azure-management`
- **Severity:** Major.
- **Measured:** `total: 0` in **every one of 16 subscriptions**, while the resource
  inventory from the same run shows **15** `Microsoft.EventGrid/systemTopics`.
- **Cause:** enumerates custom topics only, and reports a partial scope as a clean zero.
- **Fix:** include system topics, or name the scope in the output.
- **Failure-case test:** an out-of-scope resource type must make the result declare its
  scope rather than return a bare zero.

### T5 · D21 — `fn stats` triple-counts every function
- **Package:** `log-analytics`
- **Severity:** Major.
- **Measured:** groups by `FunctionName` without normalising, so each function appears
  three times: bare name, `Functions.`-prefixed variant, and a blank-named aggregate row.
  27 real functions became **61 rows**, and total executions inflated from 43,445 to
  **131,977**, roughly threefold. The inflation looks entirely plausible.
- **Fix:** strip the `Functions.` prefix, drop blank names, take the max per function.
- **Failure-case test:** a fixture containing all three name variants of one function must
  yield one row and the un-inflated execution count.

### T6 · D20 — `workspace metadata` returns the schema catalogue, not the workspace's tables
- **Package:** `log-analytics`
- **Severity:** Major.
- **Measured:** returns 679-691 tables for **every** workspace with near-identical content,
  including all 34 `App*` tables. Returned the same 679-table catalogue for a workspace
  that had ingested **zero records in seven days**.
- **Effect:** any consumer recording "available tables per workspace" credits every empty
  workspace with a full telemetry stack, and any "no X table present" rule can never fire.
- **Fix:** scope to tables the workspace actually holds, or document it as a schema
  catalogue and add a separate inventory command. `Usage | summarize by DataType` answers
  the real question cheaply and was the workaround used.

### T8 · D22 — `query error-summary --table FunctionAppLogs` builds an invalid query
- **Package:** `log-analytics`
- **Severity:** Major.
- **Measured:** fails with `Bad request: The request had some invalid properties` on **all
  7 workspaces** holding the table, including one with 79,576 records in it.
- **Not permissions or data:** a hand-written KQL query over the same table with the same
  credential returns normally. `--table AppExceptions` works fine.
- **Fix:** repair the query shape for this table, or restrict `--table` to values the
  command actually supports.

### T9 · X1 — the documented invocation idiom fails on macOS, in all six CLIs
- **Scope:** documentation only, every `SKILL.md` and `cli-reference.md`.
- **Severity:** Major by blast radius.
- **Cause:** the docs show `ARM="npx -y --package=... mcp-azure-mgmt ..."` then `$ARM ...`.
  zsh does not word-split an unquoted variable and is the macOS default shell, so **every
  documented command fails** with `no such file or directory: npx -y --package=...`.
- **Measured cost:** once failing loudly, and once far worse — a collection ran to
  completion, **exited 0 and wrote zero files**.
- **Fix:** document a shell function or ship a wrapper script, not a string variable.

### T10 · D14 — Defender assessment list omits identity- and subscription-scoped assessments
- **Package:** `azure-defender`
- **Severity:** Major.
- **Measured:** diffed set-against-set across 16 subscriptions, **39 unhealthy assessments
  present in Resource Graph are absent from CLI output, and 39 of 39 are scoped to an
  identity object ID or to the subscription itself** rather than to a resource group. On
  one subscription the CLI returned 6 of the 16 unhealthy assessments that exist.
- **What is lost:** the highest-value RBAC content a Defender report produces — disabled
  accounts with read/write permissions, overprovisioned identities, permissions of
  inactive identities, guest accounts with write permissions, disabled accounts with
  owner permissions.
- **Reverse blind spot:** Resource Graph returns nothing for subscriptions with no paid
  Defender plan, where the CLI does return data. Neither source is complete alone.
- **Fix:** include non-resource-group-scoped assessments.

### T11 · D15 — `attack-path` drops the entire risk payload
- **Package:** `azure-defender`
- **Severity:** Major.
- **Measured:** the CLI payload carries only `assessments`, `attackPathType`, `description`,
  `displayName`, `graphComponent`, `manualRemediationSteps`, `refreshInterval`. The same
  path from Resource Graph also carries `riskLevel`, `riskFactors`, `entryPoint`, `target`,
  `attackPathSteps`, `mITRETacticsAndTechniques`, `attackStory`, `isPartialAttackPath`.
- **Effect measured:** a path printed as `Potential impact: Unknown, Risk categories: none`
  was in fact `riskLevel: High` with risk factors Internet exposure and Weak authorization,
  and a named entry point and target.
- **Fix:** map `riskLevel` / `riskFactors` through, or pass the raw payload.

### T12 · D17 — api-version predates two features the payload is expected to carry
- **Package:** `azure-defender`
- **Severity:** Major.
- **Measured:** no assessment carries `Critical` severity (catalogue is High 410, Medium
  606, Low 286), and none of 4,886 unhealthy assessments carries a `properties.risk`
  object. Both arrived with api-version **2025-05-04**.
- **Effect:** a "Critical" row always reads 0, indistinguishable from "checked and none
  found", when the tier was never available.
- **Fix:** raise the api-version.

### T13 · D16 — `assessment list-assessment-metadata` returns null for the ranking fields
- **Package:** `azure-defender`
- **Severity:** Major.
- **Measured:** `implementationEffort` and `userImpact` are `null` on **all 1,302**
  assessment definitions, so any effort/impact ranking is uncomputable and a "top
  remediation opportunities" section renders empty.

### T14 · D10, D11 — App Service and Front Door payload gaps
- **Package:** `azure-management`
- **Severity:** Minor each.
- **D10 measured:** `numberOfSites: 0` for **all 24 plans**, including plans demonstrably
  hosting running apps; `workerCount`, `reserved`, `zoneRedundant` null for all 24. An
  "unused App Service plan" rule keyed on `numberOfSites === 0` fires on every row, which
  is worse than no rule. Fix: populate the fields, or drop them so consumers cannot key on them.
- **D11 measured:** `networking front-doors` omits `endpoints`, `originGroups` and `routes`
  for all profiles though the inventory shows an `afdendpoints` child under each; the field
  is `state`, not `resourceState` as documented. Without routes a consumer cannot tell
  whether a WAF policy is attached, which is the security-relevant part.

### T15 · D7 — `plugin get` returns a different assembly shape from `plugin list`
- **Package:** `powerplatform`
- **Severity:** Minor.
- **Measured:** `plugin list` emits camelCase decoded values (`isManaged: true`,
  `isolationMode: "Sandbox"`, `modifiedBy` as a display name). `plugin get` returns the
  raw row instead: `ismanaged`, `isolationmode: 2`, `modifiedon`, plus `@odata.etag` and a
  nested `ishidden` managed-property object. A consumer written against the first shape
  reads `undefined` for every one of those fields in the second, with no error.
- **Fix:** normalise `plugin get`'s assembly block to match `plugin list`.

### T16 · D26 — the `code-review` cache path follows the working directory
- **Package:** `code-review`
- **Severity:** Minor, documented behaviour, but worth a warning.
- **Measured:** running from a temporary directory created `.context/.mcp-code-review-cache/`
  there, holding a 2 MB review JSON. On an engagement that scatters repository metadata
  into whatever directory the run started in.
- **Related, already known:** `docs/KNOWN_ISSUES.md` records the repo-wide version of this.

### T17 · D24, D25 — retest, do not re-fix
- **Package:** `code-review`
- **Status:** **likely already fixed.** The source report tested `code-review` at
  `35.0.0-beta.3`, but `v35.0.0-beta.14` (2026-08-13) describes fixing both: the clone now
  runs unattended so the membership hint actually appears, and `notFoundHint()` /
  `forbiddenHint()` branch on provider instead of giving GitHub SAML advice under Azure
  DevOps. See `docs/release-notes/v35.0.0-beta.14.md`.
- **Task:** verify against the current build and close, or reopen with evidence. Do not
  rewrite a fix that already shipped.

### T18 · D13, D18 — coverage gaps (new commands, largest tasks)
- **Severity:** coverage gaps, not defects. Take these last.
- **D13 (`azure-management`):** no command for `Microsoft.Logic/workflows`,
  `Microsoft.Web/connections`, `Microsoft.Compute/virtualMachines` or
  `Microsoft.Insights/scheduledqueryrules`. In the estate measured, VMs and their
  dependants alone were 244 of 1,117 resources, and 19 log-based alert rules were
  invisible, which overstates any "alerting gap" finding.
- **D18 (`azure-defender`):** no command for `Microsoft.Security/locations/alerts` or
  `Microsoft.Security/pricings`. Alerts were the most operationally urgent Defender data
  in the estate measured — 32 existed, 25 Active, clustered on domain controllers — and
  the CLI cannot see any of them. Pricing plans are what distinguishes "no attack paths
  found" from "Defender CSPM is not enabled". Both were reachable from ARM and Resource
  Graph with the credential already held.

### T19 · D19, D23 — optional polish
- **D19 (`azure-defender`):** regulatory-compliance commands hard-fail on subscriptions
  with no paid plan, on 8 of 16. The CLI behaves correctly and the message is clear;
  consider returning an empty result with `notApplicable: true` so a batch consumer does
  not special-case an error string.
- **D23 (`log-analytics`):** two transient `Bad request` failures in ~180 `query execute`
  invocations, both succeeding unchanged on immediate retry. Exit code is correct.
  Consider a bounded internal retry, since the flat cache leaves no trace of a gap.

## Carried over from the beta.17 work, not in the source report

- **`IntegrationAuditService.generateAuditReport` still caps plugin assemblies at 100** and
  discards the `truncation` block, so `gen-integration-audit` presents a truncated assembly
  list as complete — the same defect class beta.17 closed elsewhere.
- **Two `powerplatform-core` services still use the `$top = maxRecords + 1` check:**
  `MetadataService.getGlobalOptionSets` and `WorkflowService.getWorkflows`.
- **14 packages remain pinned to `core@33.0.0`**, so npm installs a stale registry copy
  under their own `node_modules` instead of linking the workspace. They compile against
  published code and cannot see local changes. `npm ls <pkg>` reports these as `invalid`.

## Release discipline for this chain

- Do not publish per task. Land fixes on `release/35.0` and let Klemens decide when to cut
  the next beta via `/release_workflow_beta`.
- `v35.0.0-beta.17` is **published but not yet verified against a live Dataverse
  environment**. Do not build anything on the assumption that its paging is confirmed.
