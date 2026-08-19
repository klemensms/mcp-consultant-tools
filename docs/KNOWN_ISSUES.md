# Known Issues

Confirmed defects that are deliberately not fixed yet. Each entry records what was verified in
source, what was not, and where to start.

---

## PII protection: the options argument is discarded

**Status:** confirmed in source. **Affects:** every caller of `createPiiPipelineFromEnv`.

`packages/core/src/pii/pipeline.ts:104` declares the parameter as `_options` — the underscore
convention for "deliberately unused" — and the body ignores it entirely:

```ts
export function createPiiPipelineFromEnv(
  _options?: CreatePiiPipelineOptions
): PiiProtectionPipeline {
  const ctx = loadPiiConfig();
  return new PiiProtectionPipeline(ctx);
}
```

Callers pass a populated options object that goes nowhere:

- `packages/azure-devops/src/context-factory.ts:28`
- `packages/azure-sql/src/context-factory.ts:36`
- `packages/azure-sql/src/index.ts:46`
- `packages/powerplatform-data/src/context-factory.ts:18`

Each supplies `{ environmentIdentifier: pickEnvironmentIdentifier() }`. The pipeline never sees it,
so nothing downstream can vary by environment.

**Fix:** either honour `options.environmentIdentifier` in `loadPiiConfig`, or delete
`CreatePiiPipelineOptions` and the four call sites' arguments so the signature stops advertising a
capability that does not exist.

---

## PII protection: the "unprotected environment" warning is dead code

**Status:** confirmed in source.

`checkEnvironmentLooksUnprotected` is defined at `packages/core/src/pii/config.ts:440` and has
**zero call sites** across the monorepo — it appears only in its own definition, the generated
`build/*.d.ts`, and vendored `node_modules` copies of `core`.

Related: `MCP_ENVIRONMENT_TYPE` is **read by no production code path**. Its only non-test occurrence
is inside that dead function's message string (`config.ts:457`), which tells the operator to
"Set `PII_PROTECTION=true` and `MCP_ENVIRONMENT_TYPE=production` to enable protection" — advice for
a control that does not exist. `packages/core/src/pii/__tests__/config.test.ts:274` enshrines the
gap: *"does not throw when `MCP_ENVIRONMENT_TYPE` is unset (no env-aware gating)"*.

`example.mcp.json` in the toolkit repo deliberately omits `MCP_ENVIRONMENT_TYPE` rather than teach a
control that is not wired up.

**Fix:** call the check at pipeline construction, or delete the function, the env var and the
message together. Do not leave it half-live.

---

## `$top`-based completeness checks survive in three PowerPlatform services

**Status:** confirmed in source. **Affects:** `MetadataService.getGlobalOptionSets`,
`WorkflowService.getWorkflows`, `FlowService.getFlows`.

Each requests `$top = maxRecords + 1` and infers `hasMore` from the returned row count:

```ts
const hasMore = response.value.length > maxRecords;   // wrong at the page cap
```

This is the defect fixed in `DataService.queryRecords` in v35.0.0-beta.5, left in place elsewhere.
Dataverse caps every response at 5,000 rows whatever `$top` asks for, so once `maxRecords` reaches
5,000 the sentinel row can never come back: the server returns exactly 5,000, `5000 > 5000` is
false, and the caller is told a truncated result set is complete. `$top` cannot detect the
truncation either — it is client-driven paging, so no `@odata.nextLink` accompanies it, and
Dataverse ignores `$top` outright when `Prefer: odata.maxpagesize` is present.

The exposure is lower than it was for `query-records` — these three query metadata and workflow
tables, which reach 5,000 rows far less often than a filtered data query does — but the failure mode
is identical and silent when it happens.

`FlowService.getFlowInventory` is **not** affected: it already pages via `@odata.nextLink` and
derives its truncation flag from the continuation token.

**Fix:** the same change made in `DataService.queryRecords` — drop `$top`, send
`Prefer: odata.maxpagesize=<n>`, follow `@odata.nextLink` until the cap is satisfied or the set is
exhausted, and derive `hasMore` from the continuation token. See
`packages/powerplatform-core/src/services/DataService.ts` and its
`__tests__/DataService.queryRecords.test.ts` for the shape, including a stub that reproduces the
real Dataverse page-cap behaviour.

---

## Unverified: does `PII_PROTECTION` reach the CLI path?

**Status:** NOT confirmed — recorded so it is not lost, and so the wrong mechanism is not chased.

An earlier investigation reported that `PII_PROTECTION` set in `.mcp.json` never reaches the CLI on
`azure-sql`, `azure-devops`, `rest-api` and `azure-b2c`, because `createPiiPipelineFromEnv()` runs
eagerly at module load, before the `preAction` hook injects the config env.

**The stated mechanism does not match the code.** `createServiceContext()` in
`packages/azure-sql/src/context-factory.ts:35` is an exported function, not module-level
initialisation, so the pipeline is built when it is called — not at import. The `preAction` hooks
are at `packages/azure-sql/src/cli.ts:25` and `packages/azure-devops/src/cli.ts:21`.

The symptom may still be real; the explanation is wrong. Anyone picking this up should establish the
actual call ordering between the `preAction` hook and the first `createServiceContext()` call before
changing anything.

**Note:** the two confirmed defects above are sufficient on their own to make `PII_PROTECTION`
behave unpredictably. Fix those first, then re-test whether a symptom remains.

---

## `gen-integration-audit` presents a capped plugin-assembly list as complete

**Status:** confirmed in source. **Affects:** `IntegrationAuditService.generateAuditReport`.

`generateAuditReport` defaults `maxRecords` to 100
(`packages/powerplatform-core/src/services/IntegrationAuditService.ts:822`) and passes it to
`getPluginAssemblies` at line 835. That call returns `{ rows, hasMore, truncationReason }`, but the
report reads only the rows: `assemblies: pluginAssemblies.assemblies` at line 1027, and the
`externalPlugins` filter at line 861. **Neither `hasMore` nor `truncationReason` is read anywhere in
the method**, so an environment holding more than 100 assemblies produces a report that names 100 and
says nothing about the rest.

This is the same false-completeness class that `v35.0.0-beta.17` closed for the five `powerplatform`
list commands, still live inside a command whose entire purpose is to produce a report someone acts
on.

**Fix:** carry `hasMore` and `truncationReason` into the report's `plugins` block, and surface them
in the summary the same way the beta.17 commands do. Changing the report's output contract is why it
was left out of beta.17.

---

## `plugin list` and the integration audit always report a null assembly description

**Status:** confirmed in source. **Affects:** `PluginService.getPluginAssemblies`,
`IntegrationAuditService.generateAuditReport`.

`formatPluginAssembly` reads `row.description`
(`packages/powerplatform-core/src/services/PluginService.ts:136`), but the list query at line 162
does not `$select` it. The single-assembly query at line 209 does. So every assembly from
`plugin list` carries `description: undefined`, and the audit's `externalPlugins` block renders it
as `null` (`IntegrationAuditService.ts:865`), which reads as "this assembly has no description"
rather than "not asked for".

**Fix:** two lines. Add `description` to the `$select` in `getPluginAssemblies` and confirm
`formatPluginAssembly` passes it through. It changes `plugin list`'s payload and the audit report's
content, which is why it was not taken inside a task scoped to making `plugin get` and `plugin list`
agree.

---

## `investigate-app` and `investigate-sync` still write their KQL out twice

**Status:** confirmed in source. **Affects:** `packages/log-analytics`.

The four `error-summary` query shapes were moved into `utils/error-summary-query.ts` so the CLI and
the MCP tool cannot diverge. The two investigation surfaces were not: `AppExceptions` and
`AppTraces` still appear 7 times in `src/cli/commands/query-commands.ts` and 8 times in
`src/tools/function-tools.ts`. A column corrected in one copy is corrected on one surface only,
which is exactly how the invalid `FunctionAppLogs` query came to exist.

**Fix:** extract the `investigate-app` and `investigate-sync` shapes the same way. Work-list:
`grep -n "AppExceptions\|AppTraces" packages/log-analytics/src/cli/commands/query-commands.ts packages/log-analytics/src/tools/function-tools.ts`.

---

## `log-analytics` retries nothing, while its sibling clients retry the standard transient set

**Status:** confirmed in source. **Affects:** every command in `packages/log-analytics`.

`LogAnalyticsService.executeQuery` makes exactly one `axios.post`
(`packages/log-analytics/src/services/log-analytics-service.ts:201`) and throws on any failure. It
has no retry policy at all. Its 429 branch reads the `Retry-After` header purely to print it in the
error message (line 228). By contrast `DefenderClient` and `azure-management`'s `ArmClient` both
retry `[429, 500, 502, 503, 504]` with exponential backoff and honour `Retry-After`
(`packages/azure-defender/src/defender-client.ts:113`,
`packages/azure-management/src/client/ArmClient.ts:46`).

An assurance run that queries a workspace 180 times therefore has no protection against the one
failure class everybody agrees is transient, and every such failure is a hard stop.

**Fix:** add the sibling packages' retry policy once for the package rather than once for
`executeQuery`. If the helper is hoisted into `core`, note that `packages/log-analytics` still pins
`@mcp-consultant-tools/core` at `33.0.0`, so the pin must be bumped and
`packages/log-analytics/node_modules/@mcp-consultant-tools/core` removed before `npm install`.

**Deliberately not fixed:** a 400 is not retried, and a test named `does not retry a 400` pins that.
A blind retry on `Bad request` would mask a malformed query for every caller of the package.

---

## Unverified: `list-api-connections` trusts ARM's own split between secret and non-secret parameters

**Status:** NOT confirmed against a live response. **Affects:**
`logic-apps list-connections` / `azmgmt-list-api-connections` (`packages/azure-management`).

The command redacts `parameterValues` to its keys and leaves `nonSecretParameterValues` whole. That
is ARM's own distinction rather than a guess at key names, and it is a better instrument than
name-pattern redaction, which would miss a secret under a key called `server`. But it is a single
point of trust, and **the CLI caches the payload to disk**.

If a live response ever carries a credential in `nonSecretParameterValues`, or ARM renames either
map, the redaction stops working silently. `Microsoft.Web/connections` has exactly one stable
api-version (`2016-06-01`), so a live tenant may return keys the schema does not define.

**⚠️ Before sharing a connection listing anywhere, read `nonSecretParameterValues` in the output.**
The first live run should use a subscription holding a SQL or Office 365 connection. If that map
holds anything credential-shaped, redaction must move to redacting both maps by default.

---

## User-facing strings in `packages/*/src` still contain em-dashes

**Status:** confirmed by measurement, sweep unscheduled. **Affects:** repo-wide.

A recursive search of `packages/*/src` for U+2014 and U+2013 returns **535** occurrences across most packages, including
hint and error strings the CLI prints. The house rule bars the character from every output channel,
code included. The `code-review` hint text is the instance that was noticed; it is not the only one.

**Fix:** a deliberate repo-wide sweep, not a side effect of unrelated work. It touches user-facing
strings that tests match on, so each replacement needs its test updated in the same change. The work-list is
`grep -rn "$(printf '\xe2\x80\x94\\|\xe2\x80\x93')" packages/*/src` (the escapes keep the barred characters out of the
command you paste).
