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

**Status:** confirmed in source. **Affects:**
`packages/powerplatform-core/src/services/ValidationService.ts:112`.
Line number verified 2026-08-24; grep for `maxEntities > 0` if it has drifted again.

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

**Fix:** return a `TruncationInfo` block built by `buildTruncation` from `@mcp-consultant-tools/core`
alongside the results. The paging contract in
`packages/powerplatform-core/src/services/paginate.ts` is the pattern; the reads that populate the
list already report their failures through `result.fanOut`, so only the cap is unaccounted for.

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

## X2: 11 fan-outs record the outcome but not the reason, or the value but not that it is partial

**Status:** measured 2026-08-21, re-measured 2026-08-24 after the conversions. **Not converted.**
**Reproduce the candidate list:** `node scripts/sweep-fanout-candidates.mjs --list`.

The fan-out contract (`packages/core/src/helpers/fan-out.ts`) is applied in `azure-management`,
`azure-defender`, `powerplatform-core`, `azure-devops`, `code-review` and `audit-cli`. The sweep
looks for shape rather than log wording: a `catch` inside an iteration that neither rethrows nor
records the failure. It returns **23 candidates across 12 of 29 packages**, each read rather than
regex-classified. **None of the 23 is the "dropped item, no record" defect** - those were converted -
but two weaker families remain, and they are worth taking together when someone next opens this.

**5 record the outcome but not the reason.** Weaker rather than wrong: a caller can see something is
off, but not what:

| Package | Site | What is missing |
|---|---|---|
| `code-review` | `nuget-package-service.ts:245` | a failed lookup leaves `status: 'unknown'`, the same value a package that was never looked up carries |
| `azure-storage` | `AzureStorageService.ts:311` and `:321` | the operation continues with a logged error and no payload trace |
| `azure-sql` | `connection-service.ts:183` | as above |
| `service-bus` | `service-bus-service.ts:201` | as above |

**6 are an undeclared partial *value* rather than a dropped item**, so `buildTruncation` fits them
better than `FanOutRecorder`: `powerplatform-core/src/utils/complexity-calculator.ts:265` and `:300`,
`flow-url-extractor.ts:165` and `:284`, `powerplatform-data/src/tools/read-tools.ts:481`,
`azure-storage/src/services/BlobService.ts:298`.

**The remaining 12 candidates are not defects** and should not be converted: a fallback chain where
failing on one candidate *is* the loop (`1password/op-cli-adapter.ts:30` probing four paths for the
`op` binary; `powerplatform-core/src/services/MetadataService.ts:165` and `:180`, whose caller sets an
explicit `optionSetWarning` when every fallback fails; `azure-devops/src/sync/template-loader.ts:71`),
a declared default (`core/src/helpers/resolve-version.ts:33`, `audit-cli/src/quarantine.ts:70`), a
side-effect rather than a collected item (`azure-devops/src/services/sync-service.ts:304` cleanup,
`core/src/helpers/cli-helpers.ts:119` cache write, `teams/src/services/teams-service.ts:579`
token-cache clear, `azure-devops/src/ui/src/views/genui-view.ts:181` clipboard fallback), a missing
directory yielding no files (`audit-cli/src/search.ts` base-directory probe), or a startup config
warning (`rest-api/src/context-factory.ts:74`, `rest-api/src/services/rest-api-service.ts:73` - the
latter narrows the host allowlist, which fails closed and is logged).

**17 packages have no candidates at all:** `application-insights`, `azure-b2c`,
`azure-data-factory`, `azure-defender`, `azure-devops-admin`, `azure-management`, `entra-id`,
`fabric`, `figma`, `github-enterprise`, `log-analytics`, `message-center`, `meta`,
`powerplatform`, `powerplatform-customization`, `sharepoint`, `todoist`.

⚠️ **The count is a floor, not a total.** The iteration test looks back 60 lines. That is a
heuristic, and it has already missed one real defect: `ValidationService.validateBestPractices`
dropped every entity whose metadata could not be read, in a loop body longer than the look-back, so
the sweep never saw it. It was found by reading the file while fixing the two sites the sweep *did*
report. Read around any site the sweep names; do not treat the list as exhaustive.

**Fix:** convert the 5 outcome-only sites to `FanOutRecorder` and the 6 undeclared-partial sites to
`buildTruncation`.

---

## Em-dashes remain outside `packages/*/src`

**Status:** measured 2026-08-24. **Affects:** `docs/` (98 files), `tests/` (35), `packages/**/*.md`
(18), `scripts/` (5).

The house rule bars U+2014 and U+2013 from every output channel, code and comments included.
`packages/*/src` is clean: 529 lines were swept, leaving one deliberate exemption at
`packages/core/src/pii/ner-redaction.ts:18`, where both characters are members of a regex character
class the code strips from a string. There the character is data, not prose, and replacing it would
change behaviour.

Everything outside `packages/*/src` was not in that sweep's scope and still carries them. Re-count
before starting rather than trusting these figures:

```
grep -rlIP '\x{2014}|\x{2013}' docs/ tests/ scripts/
grep -rlIP '\x{2014}|\x{2013}' --include='*.md' packages/
```

**Fix:** the same mechanical replacement (` - ` for a spaced dash, `-` for a range), with one
caution learned from the source sweep. Test files were swept alongside the sources they assert on,
so a green suite proves nothing on its own: check that no changed line inside a test is an assertion
value rather than a `describe`/`it` title. In the source sweep all 33 were titles, which is why it
came back green honestly.

⚠️ **A CLI's own output format is not prose.** The `--format json` payload of
`mcp-audit-cli search` is read by `tests/audit-integration/scenarios/search-cli.mjs`, which
`npm test` does not run. Anything under `tests/` that parses a command's output has to be checked
against that command by hand, because nothing else will.

---

## teams: files can be seen but neither sent nor fetched

**Status:** confirmed in source and by a live read (2026-08-31). **Affects:** the whole `teams`
package.

A message read names its attachments and hands back the file's URL, so an agent can see that a
document was shared and what it is called:

```
[attachment: Report.docx - https://contoso.sharepoint.com/personal/.../Microsoft%20Teams%20Chat%20Files/Report.docx]
```

**That URL is the end of the road inside this package.** There is no tool that fetches it and no tool
that sends a file. Grepping `packages/teams/src` for `driveItem`, `hostedContents`, `/content`,
`createUploadSession` or `multipart` returns nothing outside a comment; the only `readFileSync` on a
caller-supplied path is `cli/commands/message-commands.ts:100`, which reads an Adaptive Card JSON
body. All 26 tools are message, chat, people, reaction and search operations.

**A neighbouring package already does the file half, and is not wired to this one.**
`packages/sharepoint` ships `spo-download-file` (`tools/read-tools.ts:315`) and `spo-upload-file`
(`tools/write-tools.ts:19`) over `/drives/{driveId}/items/{itemId}/content`. Using it on a Teams
attachment means resolving that `contentUrl` into a site id, a drive id and an item path by hand,
which nothing in either package does.

**Fix:** Graph resolves a sharing URL in one call - `GET /shares/{base64url-encoded-url}/driveItem`,
then `/content` - so a `get-message-attachment` tool needs no site or drive lookup and no new
package dependency. It does need a `Files.Read.All` scope, which is **not** in `DEVICE_CODE_SCOPES`,
so read the Scope Boundary rule in `packages/teams/CLAUDE.md` first: an unconsented scope fails at
sign-in and takes all 26 tools down, not one. Sending a file is a larger job - a Teams file share is
an upload to the chat's own SharePoint folder followed by a message carrying a reference attachment,
not a message parameter - and is worth treating as separate work.

---

