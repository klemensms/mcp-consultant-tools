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

## `ValidationService.validateBestPractices` truncates its entity list and says nothing

**Status:** confirmed in source. **Affects:** `packages/powerplatform-core/src/services/ValidationService.ts:102`.

The solution-scoped path builds the entity list one `EntityDefinitions` read at a time, then applies
the cap client-side and discards the surplus with no flag anywhere in the returned shape:

```ts
if (maxEntities > 0 && entities.length > maxEntities) {
  entities = entities.slice(0, maxEntities);
}
```

Nothing in `EntityValidationResult` or the aggregate report records that a cap was hit, so a
validation report over the first `maxEntities` tables of a large solution is indistinguishable from
one that covered the whole solution. This is the same false-completeness class as the `$top`
defects, arriving by a different route: there is no `hasMore` field to get wrong because there is no
`hasMore` field at all.

The per-entity loop above it also swallows every failure (`catch {}` at line 96, commented "Skip
entities that can't be queried"), so an entity the service principal cannot read is dropped with no
trace and no count. A validation pass that could not see half the solution reports clean.

**Fix:** return a `TruncationInfo` block built by `buildTruncation` from `@mcp-consultant-tools/core`
alongside the results, and record the skipped entities as a counted, named list rather than a bare
`catch`. The paging contract in `packages/powerplatform-core/src/services/paginate.ts` covers the
first half; the fan-out recorder used by `azure-management` and `azure-defender` covers the second.

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

## Three `IntegrationAuditService` collections still fetch with `$top` and report no truncation

**Status:** confirmed in source. **Affects:**
`packages/powerplatform-core/src/services/IntegrationAuditService.ts` -
`getServiceEndpoints:326`, `getEnvironmentVariables:490`, `getWebhookRegistrations:597`.

Each fetches with `&$top=${maxRecords}` and returns a summary whose `total` is the returned row
count, with no `hasMore`, no `truncation` block and nothing else a caller could read to tell a
capped page from a population. `gen-integration-audit` calls all three at a default cap of 100, so
`Service Endpoints: 100` in the report can mean "there are 100" or "there are 400 and you were
shown the first 100", and the report cannot say which. The audit's `summary.completeness.unverified`
names these three plus flows for exactly that reason.

All three also apply their OOTB exclusion **after** fetching (`filterOotb`), so filtering a full
page below the cap makes a truncated fetch look exhausted - the client-side-filter half of the same
defect, which `paginateDataverse`'s `keep` callback exists to close.

Two more silent gaps in the same file, found in the same sweep:

- **`getServiceEndpoints`' step-count query is capped at `$top=5000` and wrapped in a bare
  `catch {}`** (line 335). When it fails or caps out, every affected endpoint reports
  `messageStepCount: 0`, which reads as "no steps registered" rather than "not counted".
- **`analyzeFlowComplexity` discards the `truncation` block `getFlows` now returns** (line 709) and
  swallows every per-flow `getFlowDefinition` failure in a `catch {}` (line 751), so a flow that
  could not be parsed vanishes from the analysis uncounted and `summary.total` under-reports with no
  trace. Its `queryEnvironmentVariables` failure is swallowed too (line 676), which silently
  degrades URL resolution.

**Fix:** convert the three collection methods to `paginateDataverse` with the OOTB predicate moved
into `keep`, and return a `TruncationInfo` from `buildTruncation` the way
`PluginService.getPluginAssemblies` does. Then remove the collections from
`UNVERIFIED_AUDIT_COLLECTIONS` as each one lands, so the report's own scope note shrinks with the
work. For the swallowed failures, count and name them rather than dropping them - the fan-out
recorder used by `azure-management` and `azure-defender` is the existing pattern.

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

## Unverified: no assessment carries `Critical` severity or a `properties.risk` object

**Status:** measured live; **every candidate cause in this package is closed in source**, and what
is left is a question about the estate. **Affects:** `defender-list-assessments`,
`defender-list-assessment-metadata` (`packages/azure-defender`).

Across a real estate, no assessment definition carried `Critical` severity (the catalogue was High
410, Medium 606, Low 286) and none of 4,886 unhealthy assessments carried a `properties.risk`
object. A "Critical" row therefore always reads 0, which is indistinguishable from "checked and
none found".

**Three candidates were checked against the published contract and none of them leaves work here:**

- **The api-version is right.** `assessments` and `assessmentMetadata` have been pinned to
  `2025-05-04` since the file's only commit, and at that version `Common.Severity` is
  `Low | Medium | High | Critical` and `properties.risk` sits on
  `SecurityAssessmentPropertiesBase`, which the response model extends. Both are in the documented
  response of the version already being asked for.
- **The mapper is not discarding them.** `mapAssessmentGraphRow` used to name a
  documentation-derived allowlist, which could have thrown a risk payload away; anything it does
  not name now rides along in `properties.unmappedProperties`, with the distinct keys aggregated
  into `summary.unmappedPropertyKeys`. Read that before concluding a field is absent.
- **`$expand` cannot deliver it.** At `2025-05-04` the `ExpandEnum` has exactly two members,
  `links` and `metadata`; the *list* operation accepts no `$expand` at all, only *get* does; and
  `risk?` is optional on the base the list response inherits. There is no request-side change to
  make.

**What is left, and it is the whole of it: run `defender-list-plans` once per subscription and read
`summary.cspmEnabled`.** Attack paths and assessment `risk` objects are Defender CSPM artefacts, so
with the `CloudPosture` plan on Free an empty result is explained by the configuration rather than
being a finding about the estate. `cspmEnabled` is three-state on purpose - `null` means the plan
was absent from the response, which is **unknown**, not off.

**Do not report this as fixed.** Closing an investigation is not the same as verifying an estate,
and the reason this entry exists is that the two read identically in a report.

---

## `implementationEffort` and `userImpact` are unpopulated on every assessment definition

**Status:** measured live on all 1,302 definitions; **cause unknown, and there is now a command that
finds it.** **Affects:** `defender-list-assessment-metadata` (`packages/azure-defender`).

Both ranking fields were empty on every definition, so an effort/impact ranking is uncomputable and
a "top remediation opportunities" section renders empty. `listAssessmentMetadata` performs no
mapping at all - it returns the paginated items straight through - so nothing in this repo is
removing them. Whatever ARM returned is what the caller saw.

**Two explanations are open and neither is established:**

- **The api-version.** The `2025-05-04` examples omit both fields while the `2020-01-01` examples
  include them. That is much weaker than it looks: **both** versions mark the two fields optional,
  so the only evidence of a difference is which autogenerated examples happen to carry them.
- **The scope.** The tenant-scope operation at `/providers/Microsoft.Security/assessmentMetadata`
  has never been called by this package, which only ever reads the subscription-scoped path. Both
  operations return the same response definition, but that is a fact about the schema and says
  nothing about whether the service populates an optional field the same way at both scopes.

**Run `assessment diagnose-metadata-fields` (`defender-diagnose-metadata-fields` over MCP).** It
reads the catalogue at all four combinations of those two axes and reports, per combination, how
many definitions carry each field, how many carry it **empty**, how many **omit** it entirely, and
one example value. Absent and present-but-empty are counted separately because they have different
causes: an optional field the service never sent is absent, not null, and the original report said
"null". Read `summary.verdict` and then `fanOut.failures` - a tenant-scope 403 is expected on a
subscription-scoped service principal, and a probe that could not be read is unknown, not empty.

If only the `2020-01-01` probes populate the fields, the choice is a trade-off rather than a patch:
that version's severity enum has no `Critical`, which is exactly what the package needs
`2025-05-04` for. The verdict says so when that is what the probes show.

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
