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

## X2: 17 fan-outs still drop a per-item failure without recording it

**Status:** measured 2026-08-21, confirmed by reading every candidate. **Not converted.**
**Reproduce the candidate list:** `node scripts/sweep-fanout-candidates.mjs --list`.

The fan-out contract (`packages/core/src/helpers/fan-out.ts`) is applied in
`azure-management` and `azure-defender`. X2 as raised was "every command that fans out, in
every package", and the remaining scope had never been measured: the original work-list
`grep -rn "console.error(\`Failed to" packages/*/src` is exhausted and now returns two hits,
neither of them a collection fan-out.

The sweep looks for shape rather than log wording: a `catch` inside an iteration that neither
rethrows nor records the failure. It returns **42 candidates across 12 of 29 packages**. Each
was read. **17 are the defect**, in 4 packages:

| Package | Site | What goes missing |
|---|---|---|
| `powerplatform-core` | `IntegrationAuditService.ts:386` | `messageStepCount` reads 0 for every endpoint when the step-count query fails |
| | `IntegrationAuditService.ts:718` | env-var resolution degrades, so flow URLs stay unresolved |
| | `IntegrationAuditService.ts:793` | a flow whose definition will not parse vanishes from the complexity analysis, uncounted |
| | `IntegrationAuditService.ts:878` | the whole environment-variable section disappears from the audit report |
| | `ValidationService.ts:96` | an entity the principal cannot read is dropped from the validation pass |
| | `ValidationService.ts:397` | an attribute whose option set cannot be read is skipped, so its rule never fires |
| `azure-devops` | `sync-service.ts:344` | an image that failed to push is absent from the synced work item |
| | `sync-service.ts:542` | a child task that could not be fetched is missing from the task list |
| | `test-service.ts:64` | a test case that failed to link is missing from the run |
| | `test-service.ts:260` | a run whose results cannot be read is missing from the case history |
| | `sync/file-utils.ts:164` | an unparseable work-item file is skipped |
| `code-review` | `dotnet-version-service.ts:98` | an unparseable `Directory.Build.props` is skipped |
| | `dotnet-version-service.ts:136` | an unparseable project file is skipped |
| | `dotnet-version-service.ts:178` | every `.cs` file unreadable returns `isDataversePlugin: false`, so "not a plugin" and "could not tell" are the same answer |
| | `nuget-package-service.ts:172` | an unparseable central-package-management file is skipped |
| | `nuget-package-service.ts:223` | an unparseable project file is skipped, so a NuGet audit reports on the rest as if it were the repo |
| `audit-cli` | `search.ts:33` | a malformed audit line is skipped, so search results are silently short |

**5 more record the outcome but not the reason**, which is weaker rather than wrong:
`code-review/nuget-package-service.ts:241` (a failed lookup leaves `status: 'unknown'`, the same
value a package that was never looked up carries), `azure-storage/AzureStorageService.ts:311`
and `:321`, `azure-sql/connection-service.ts:183`, `service-bus/service-bus-service.ts:201`.

**6 are a related but distinct family** - an undeclared partial *value* rather than a dropped
item, so `buildTruncation` fits them better than `FanOutRecorder`:
`powerplatform-core/src/utils/complexity-calculator.ts:265` and `:300`,
`flow-url-extractor.ts:165` and `:284`, `powerplatform-data/src/tools/read-tools.ts:481`,
`azure-storage/src/services/BlobService.ts:298`.

**The remaining 14 candidates are not defects** and should not be converted: a fallback chain
where failing on one candidate *is* the loop (`1password/op-cli-adapter.ts:30` probing four
paths for the `op` binary; `powerplatform-core/src/services/MetadataService.ts:165` and `:180`,
whose caller sets an explicit `optionSetWarning` when every fallback fails;
`azure-devops/src/sync/template-loader.ts:71`), a declared default
(`core/src/helpers/resolve-version.ts:33`, `audit-cli/src/quarantine.ts:70`), a side-effect
rather than a collected item (`azure-devops/src/services/sync-service.ts:298` cleanup,
`core/src/helpers/cli-helpers.ts:119` cache write, `teams/src/services/teams-service.ts:579`
token-cache clear, `azure-devops/src/ui/src/views/genui-view.ts:181` clipboard fallback), a
missing directory yielding no files (`audit-cli/src/search.ts:25` and `:47`), or a startup
config warning (`rest-api/src/context-factory.ts:74`,
`rest-api/src/services/rest-api-service.ts:73` - the latter narrows the host allowlist, which
fails closed and is logged).

**17 packages have no candidates at all:** `application-insights`, `azure-b2c`,
`azure-data-factory`, `azure-defender`, `azure-devops-admin`, `azure-management`, `entra-id`,
`fabric`, `figma`, `github-enterprise`, `log-analytics`, `message-center`, `meta`,
`powerplatform`, `powerplatform-customization`, `sharepoint`, `todoist`.

**Caveat on the count.** The iteration test looks back 60 lines, which covers every loop body
in this repo today but is a heuristic, so **42 is a floor rather than a total**. A swallow
deeper inside a longer loop would be missed. The classification of the 42 is by reading, not by
regex.

**Fix:** convert the 17 to `FanOutRecorder` from `@mcp-consultant-tools/core` - one recorder per
fan-out, `run` per item, `result()` into the payload - and the 6 undeclared-partial sites to
`buildTruncation`. Three of the four packages need their `core` pin checked first: `code-review`
and `audit-cli` are on the stale-pin list in the root `CLAUDE.md`, and that list has already
proved wrong in both directions, so read the pin out of `package.json` **and** check for a
vendored copy under the package's own `node_modules` before assuming either way. That pin work
is why this is a release-shaped change rather than a bug fix.

---

## User-facing strings in `packages/*/src` still contain em-dashes

**Status:** confirmed by measurement, sweep unscheduled. **Affects:** repo-wide.

A recursive search of `packages/*/src` for U+2014 and U+2013 returns **534** occurrences across most packages (counted 2026-08-24; re-count rather than trusting this figure), including
hint and error strings the CLI prints. The house rule bars the character from every output channel,
code included. The `code-review` hint text is the instance that was noticed; it is not the only one.

**Fix:** a deliberate repo-wide sweep, not a side effect of unrelated work. It touches user-facing
strings that tests match on, so each replacement needs its test updated in the same change. The work-list is
`grep -rn "$(printf '\xe2\x80\x94\\|\xe2\x80\x93')" packages/*/src` (the escapes keep the barred characters out of the
command you paste).
