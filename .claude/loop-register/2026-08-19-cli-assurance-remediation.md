# Carry-forward register · cli-assurance-remediation

Append-only. Never rewrite or delete an item; change its `State`.
Every hop reads this before starting, closes what its chunk resolved, and appends
anything matching the trigger checklist.

**Plan file:** `.claude/plans/cli-assurance-remediation.md`
**Chain started:** 2026-08-19 (origin session, from `release/35.0` at `6729aa0`)

> **This repo has no task system.** There is no `docs/tasks/`. The closing hop's drain
> destination is therefore `docs/KNOWN_ISSUES.md` for confirmed defects, the plan file
> for deferred scope, and the relevant `CLAUDE.md` for repo conventions. Items with no
> such home stay `open` here, and the closing hop must say so plainly rather than
> pretending they were promoted.

---

### ⚑1 · beta.17's paging is published but unverified against live Dataverse
- **Kind:** assumption
- **Hop:** origin · 6729aa0
- **State:** open
- **Matters because:** `v35.0.0-beta.17` switched five `powerplatform` list commands from
  `$top` to `Prefer: odata.maxpagesize` and shipped to the beta tag. The mechanism is
  copied from `DataService.queryRecords`, which has shipped since beta.5, but the changed
  path has never run against a live environment — there are no PowerPlatform credentials
  on this machine. If the mechanism is wrong, five commands are broken on the beta tag and
  every later hop that touches `powerplatform` builds on it. Not load-bearing for the
  queue's other packages, which is why the chain proceeds. Klemens has the credentials;
  this needs him, not the loop.

### ⚑2 · T2 (X2, aggregate failure counts) is scoped to a contract plus one package
- **Kind:** dropped-scope
- **Hop:** origin · 6729aa0
- **State:** open · narrowed-by-L1
- **Matters because:** X2 as written is "every command that fans out, in every package",
  which is a repo-wide sweep across 14+ packages and cannot land in one hop. The plan
  narrows T2 to landing the shared contract in `core` plus one package as proof. The
  remaining packages are then an unscheduled sweep that nothing in this chain will do, so
  if it is not registered here it will be quietly lost the way X3's siblings nearly were.
- **L1 update:** the contract is landed (`FanOutRecorder`, `fanOutSuffix` in `core`;
  `outputResult` exits 1 on a payload whose fan-out lost items) and `azure-management` is
  converted, all 15 sites. Still outstanding, and still unscheduled: every other package
  that fans out. `grep -rn "console.error(\`Failed to" packages/*/src` finds the same
  swallowing shape elsewhere; that grep is the sweep's work-list.

### ⚑3 · `generateAuditReport` still presents a truncated assembly list as complete
- **Kind:** deferred
- **Hop:** origin · 6729aa0
- **State:** open
- **Matters because:** found during the beta.17 work and deliberately left out of it,
  because fixing it changes `gen-integration-audit`'s own output contract. It is the same
  false-completeness defect class that beta.17 closed for the five list commands, still
  live inside a command whose entire purpose is to produce a report someone acts on.

### ⚑4 · Two `powerplatform-core` services still use the `$top = maxRecords + 1` check
- **Kind:** deferred
- **Hop:** origin · 6729aa0
- **State:** open
- **Matters because:** `MetadataService.getGlobalOptionSets` and
  `WorkflowService.getWorkflows` will report `hasMore: false` on a truncated result
  wherever the result set can reach the 5,000-row page cap. Already recorded in
  `docs/KNOWN_ISSUES.md` via the master release notes, so this item exists to make sure
  the closing hop checks that record is still accurate rather than re-finding it.

### ⚑5 · 14 packages compile against a stale published `core`
- **Kind:** gotcha
- **Hop:** origin · 6729aa0
- **State:** open · reduced-by-L1
- **Matters because:** they pin `core@33.0.0` against a workspace at `34.1.0`, so npm
  installs a registry copy under their own `node_modules` rather than linking the
  workspace. Any hop that adds an export to `core` and then edits one of those packages
  will find the export missing at test time while the build passes, which cost real time
  in the beta.17 session. Check with `npm ls @mcp-consultant-tools/core` and look for
  `invalid`. Belongs in a `CLAUDE.md` if it is not fixed.
- **L1 update:** the real count was 16, not 14. `azure-management` is now on `34.1.0`,
  leaving **15**. Bumping the pin alone is not enough - npm leaves the stale copy on disk,
  so `rm -rf packages/<pkg>/node_modules/@mcp-consultant-tools/core` after the bump, then
  `npm install`. Verified by resolving the package from the fixed one and getting the
  workspace path rather than a registry copy. The other 15 are deliberately untouched: a
  16-package pin bump is a release-shaped change, not a loop hop's call.

### ⚑6 · T17 (D24/D25) may be already-fixed work
- **Kind:** assumption
- **Hop:** origin · 6729aa0
- **State:** open
- **Matters because:** the source report tested `code-review` at beta.3, but beta.14's
  release notes describe fixing both defects. If that reading is right, T17 is a retest
  and re-fixing it would revert working code. The hop that takes T17 must verify against
  the current build first and record which way it went.

### ⚑7 · `exceptiondetails ne ''` is unverified against live Dataverse
- **Kind:** assumption
- **Hop:** L1 · 8e84439
- **State:** open
- **Matters because:** T1's fix rests on Dataverse accepting an empty-string comparison
  on `exceptiondetails`, which is a memo attribute. The root cause is confirmed by the
  source report's own measurement (147 rows matched `ne null`, 0 matched
  `ne null and ne ''`), so the semantics are right, but the request the CLI now sends
  has never been executed against a live environment - same blocker as ⚑1, no
  PowerPlatform credentials on this machine. If Dataverse rejects the comparison on a
  memo field the command fails loudly rather than silently, which is the safe direction,
  but it would still be broken. Needs Klemens, or one live run at the next beta.

### ⚑8 · The Front Door payload gaps in T14 may be swallowed 403s, not missing code
- **Kind:** assumption
- **Hop:** L1 · fan-out contract work
- **State:** open
- **Matters because:** T14 (D11) records that `networking front-doors` omits `endpoints`,
  `originGroups` and `routes` for every profile though the inventory shows the child
  resources exist. Those three calls sat behind exactly the swallowing `catch` that T2
  removed, so the fields may have been dropped because the calls were refused rather than
  because the code never asked. The hop that takes T14 should re-run against a live
  subscription and read `fanOut.failures` before writing any new code - if the operations
  are `endpoints` / `originGroups` / `routes` with a 403, T14's D11 half is a permissions
  finding, not a payload-mapping one. Cannot be settled here: no Azure credentials on this
  machine.

### ⚑9 · The fan-out contract is unit-verified only
- **Kind:** assumption
- **Hop:** L1 · fan-out contract work
- **State:** open
- **Matters because:** the exit code, the stderr line and the `fanOut` payload are proven
  by tests and by an end-to-end run through `azure-management`'s own `outputResult`
  wrapper with a stubbed 403 - not against live Azure. The specific untested claim is that
  a real Reader-credential refusal on `Microsoft.Web/sites/config/list/action` surfaces as
  an error carrying `response.status = 403`; if the ARM client wraps it differently,
  `statusCode` records null and the summary loses the "mostly HTTP 403" hint. The counts,
  the exit code and `configurationUnavailable` are unaffected either way, so the contract
  degrades rather than breaks. Same credentials blocker as items 1 and 7.

### ⚑10 · Exit-code change is a behaviour change for any batch caller
- **Kind:** klemens-call
- **Hop:** L1 · fan-out contract work
- **State:** open
- **Matters because:** `outputResult` now sets exit 1 whenever a payload's fan-out lost an
  item. That is the point of X2 - the measured run exited 0 on 32 authorisation failures -
  but a script that treats any non-zero exit as fatal will now stop on a partial
  collection where it previously continued with a quietly incomplete cache file. Stopping
  is the correct default and the reason the fix exists, so this is not a defect; it does
  need saying out loud in the release notes as a behaviour change rather than shipping as
  a silent one. Klemens's call whether it warrants the breaking-change block.

### ⚑11 · T3's root cause is inferred from the evidence, not confirmed live
- **Kind:** assumption
- **Hop:** L1 · T3
- **State:** open
- **Matters because:** the measured facts are that 752 of 752 names were unresolved with
  `roleDefinitionsTruncated` false, while all 52 distinct GUIDs resolved when fetched
  directly. Two causes fit that equally well: the role-definition query returned rows
  whose ids did not match the assignments' (a scope-prefix mismatch), or it returned no
  rows at all. Without Azure credentials neither can be ruled out here, so the fix does
  both jobs - it joins on the trailing GUID, which is correct under the first cause and
  harmless under the second, and it adds `roleDefinitionsFound` plus a `note`, which makes
  the second cause declare itself instead of looking like a plain count of unknown roles.
  What still needs one live run is which cause it actually was. If `roleDefinitionsFound`
  comes back zero on a real subscription, the join was never the problem and the
  role-definition query needs its own investigation.

### ⚑12 · T4 changes what `summary.total` counts, and pays an extra ARM call for it
- **Kind:** klemens-call
- **Hop:** L2 · 150cde3
- **State:** open
- **Matters because:** `networking event-grid-topics` used to satisfy
  `topics.length === summary.total`. It no longer does: `total` is now what exists and
  `listed` is what came back, so a default call on a subscription holding system topics
  returns `total: 15, listed: 0`. That is the point of the fix - the old identity was only
  true because the command lied about the total - but a consumer that iterates `topics`
  and reports `total` will now disagree with itself unless it reads `note`. It also costs
  one extra ARM list call per invocation, always, to count a type it may not list. Both are
  deliberate and both belong in the release notes as behaviour changes rather than shipping
  silently. Same class as ⚑10, and the same question: whether it warrants the
  breaking-change block. Klemens's call.

### ⚑13 · T5's collapse assumes the name variants are duplicate views, not disjoint subsets
- **Kind:** assumption
- **Hop:** L2 · d1cb9e5
- **State:** open
- **Matters because:** `collapseFunctionStats` keeps the highest-counting variant and
  discards the others, which is right if `ProcessOrders` and `Functions.ProcessOrders` are
  two loggings of the same executions - the reading the plan's own measurement supports,
  since 27 functions produced 61 rows at roughly three times the executions. If the two
  variants were instead partly disjoint - say the prefixed rows covered a window or a host
  the bare rows did not - `max` under-counts, and it under-counts silently. Summing would
  over-count just as silently, so `max` is the safer of the two, and `normalization.collapsed`
  names the variants so a reader can see what was dropped. What would settle it is one live
  run: compare `normalization.rows` against the function count the portal shows, and the
  collapsed `TotalExecutions` against a hand-written KQL `count()` per function. No Log
  Analytics credentials on this machine. Same blocker as ⚑1, ⚑7, ⚑9.

### ⚑14 · T5 removes `UniqueFunctions` from the `fn stats` payload
- **Kind:** dropped-scope
- **Hop:** L2 · d1cb9e5
- **State:** open
- **Matters because:** it was `dcount(FunctionName)` inside a `by FunctionName` summarize,
  so it was always exactly 1 and told a reader nothing while looking like a count. Removing
  it is a payload change, not a bug fix, and a consumer selecting that column now gets
  `undefined` with no error - the very failure shape T15 (D7) exists to close elsewhere in
  this chain. The judgement is that a column which was always 1 cannot have been carrying
  anyone's logic, but it is still worth one line in the release notes. `normalization.rows`
  is the replacement.

### ⚑15 · T4 and T5 are unit-verified only
- **Kind:** assumption
- **Hop:** L2 · 150cde3, d1cb9e5
- **State:** open
- **Matters because:** both MCP servers were booted and confirmed to register the updated
  tools, and 1002 tests pass, but neither fix has run against a live estate. The specific
  untested claims are: that `GET .../providers/Microsoft.EventGrid/systemTopics` succeeds
  wherever the provider is registered and surfaces as a recorded `FanOutRecorder` failure
  where it is not, rather than as something the recorder does not catch; and that the three
  `FunctionName` variants in live `FunctionAppLogs` are exactly the bare name, the
  `Functions.`-prefixed name and the empty string, with no fourth shape the exact-prefix
  strip would miss. Do not claim either works against a live estate. Same credentials
  blocker as ⚑1, ⚑7, ⚑9.

### ⚑16 · `Usage` is a lower bound on what a workspace holds, not a closed set
- **Kind:** assumption
- **Hop:** L2 · 144f5f3, be15147
- **State:** open
- **Matters because:** T6's new `la-list-workspace-tables` answers "what does this workspace
  actually hold" from the `Usage` table, which records ingestion-metered data types. A table
  populated outside that metering would not appear, so the command can under-report - the
  same direction of error as the catalogue it replaces, just far smaller. The mitigation is
  that `summary.caveat` says so on every call, unconditionally, and the command is named an
  inventory of ingestion rather than of tables. What would settle it is one live run against
  a workspace whose contents are known: compare the list against `search * | distinct $table`
  over the same window, and if the two disagree the caveat needs to become a documented
  limitation with the gap named. Also unverified: that `QuantityUnit` is `MBytes` for
  ordinary log ingestion. The query no longer assumes it - it groups by the unit, so a
  surprise shows as an extra row rather than a wrong total - but nobody has seen a live
  `Usage` row from this code. No Log Analytics credentials on this machine.

### ⚑17 · T6 leaves `la-get-metadata`'s payload shape intact and adds a tool instead
- **Kind:** decision
- **Hop:** L2 · 144f5f3
- **State:** open
- **Matters because:** the plan offered two routes - scope the metadata command to tables the
  workspace actually holds, or keep it as a catalogue and add a separate inventory command.
  The second was taken, so `la-get-metadata` still returns ~680 tables and any consumer
  already keying on its table count keeps the number it had; it now also gets a `scope` block
  telling it the number is not what it thought. The first route would have been a silent
  behaviour change to an existing tool, which is worse, but it does mean **an existing
  consumer that never reads `scope` is still wrong**. Whether that is acceptable, or whether
  the metadata command should eventually be scoped and the change called out as breaking, is
  Klemens's call. Tool count went 13 to 14, which is itself worth a release-notes line.

### ⚑18 · T8's fix is unit-verified only, and `FunctionInvocationId` may be blank on the rows that matter
- **Kind:** assumption
- **Hop:** L3 · T8
- **State:** open
- **Matters because:** the column now named is the documented one, so the query will no
  longer be rejected - that much is settled by the schema reference and by the tests. What is
  not settled is what it returns. `FunctionInvocationId` is documented as "the invocation ID
  that logged the message", and a host-level row is not written inside an invocation, so rows
  carrying `ExceptionDetails` but no invocation id would all collapse into a single group per
  function and under-count. That is the same silent-under-count direction as ⚑13. One live
  run settles it: run `error-summary --table FunctionAppLogs` and the same query with
  `--no-deduplicate` against a workspace known to hold errors, and compare `UniqueErrors`
  against `Count`. If `UniqueErrors` is 1 per function while `Count` is large, the invocation
  id is blank on those rows and the dedupe branch needs a `where FunctionInvocationId != ''`
  or to fall back to the undeduplicated shape. No Log Analytics credentials on this machine.
  Same blocker as ⚑1, ⚑7, ⚑9, ⚑13, ⚑15, ⚑16.

### ⚑19 · `deduplicateRetries` means something weaker on `FunctionAppLogs` than its name says
- **Kind:** decision
- **Hop:** L3 · T8
- **State:** open
- **Matters because:** on the Application Insights tables the flag collapses retries, because
  `OperationId` spans them. `FunctionAppLogs` has no such column, so the fix uses
  `FunctionInvocationId`, which collapses the several log lines one invocation emits. In Azure
  Functions a retry is a new invocation with a new id, so on that table a retried failure
  still counts once per attempt. The flag keeps one name for two different guarantees. The
  output, the tool description, the CLI help and both docs now say which key was used and what
  it collapses, which is the honest minimum, but a consumer comparing `UniqueErrors` across
  tables is comparing two different quantities. Whether that warrants a separate flag name, or
  is fine as documented, is Klemens's call - the alternative was to refuse deduplication on
  that table entirely, which loses the log-line collapsing that is genuinely useful.

### ⚑20 · An unsupported `--table` on `error-summary` now exits 1 where it used to return data
- **Kind:** klemens-call
- **Hop:** L3 · T8
- **State:** open
- **Matters because:** the CLI took `--table` as free text and fell through to the
  `FunctionAppLogs` shape for anything it did not recognise, so `--table AppRequests` or a
  misspelt `AppExcpetions` returned a confident answer about a different table. It now throws,
  naming the supported set, and exits 1. That is the correct direction and the whole point of
  the fix, but it is a behaviour change: a batch script passing a table name this command
  never supported used to get rows. Belongs in the release notes as a behaviour change rather
  than shipping silently. Same class as ⚑10 and ⚑12, and the same question of whether it
  warrants the breaking-change block.

### ⚑21 · `investigate-app` and `investigate-sync` still write their KQL out twice
- **Kind:** deferred
- **Hop:** L3 · T8
- **State:** open
- **Matters because:** T8 moved the four `error-summary` shapes into
  `utils/error-summary-query.ts` so the CLI and the MCP tool cannot diverge, but the same
  duplication is still live for the two investigation surfaces: the four sync queries appear
  in `cli/commands/query-commands.ts` and again in `tools/function-tools.ts`, and the
  `investigate-app` shapes are duplicated the same way. A column corrected in one copy is
  corrected in one surface only, which is exactly how D22 came to exist. Not fixed here
  because it is a larger extraction than T8's scope and touches a command the source report
  did not flag. The work-list is `grep -n "AppExceptions\|AppTraces" packages/log-analytics/src/cli/commands/query-commands.ts packages/log-analytics/src/tools/function-tools.ts`.

### ⚑22 · T15 drops the raw keys from `plugin get`, which is a breaking change for anyone reading them
- **Kind:** klemens-call
- **Hop:** L3 · T15
- **State:** open
- **Matters because:** the plan's instruction was to normalise `plugin get` to match
  `plugin list`, and the alternative - carrying `ismanaged` **and** `isManaged`,
  `isolationmode: 2` **and** `isolationMode: "Sandbox"` - is two names for one fact, which is
  its own defect the moment the two can disagree. So the raw keys and `@odata.etag` are gone.
  A consumer written against `plugin get`'s old raw shape now reads `undefined`, which is the
  exact failure D7 describes, pointed the other way. Two such consumers existed inside this
  repo and are fixed; anything outside it is not visible from here. It is the correct
  direction and it is what the plan asked for, but it belongs in the release notes as a
  breaking change rather than shipping silently. Same class as ⚑10, ⚑12 and ⚑20.

### ⚑23 · `getPluginAssemblies` never selects `description`, so the audit's external-plugin descriptions are always null
- **Kind:** deferred
- **Hop:** L3 · T15
- **State:** open
- **Matters because:** `IntegrationAuditService.generateAuditReport` builds its
  `externalPlugins` block from `getPluginAssemblies`, reading `p.description` - a column that
  query does not `$select`. Every external plugin in the report therefore carries
  `description: null`, which reads as "this assembly has no description" rather than as "not
  asked for". Same false-completeness class as ⚑3, in the same command. Not fixed here
  because it changes `plugin list`'s payload and the audit report's content, and T15's scope
  was making the two plugin shapes agree. The fix is two lines: add `description` to the
  `$select` in `getPluginAssemblies` and to `formatPluginAssembly`.

### ⚑24 · An unrecognised isolation mode changes what the audit counts as an external plugin
- **Kind:** assumption
- **Hop:** L3 · T15
- **State:** open
- **Matters because:** `isolationMode` used to fall through to `'External'` for any value
  that was not 1 or 2, so a null or unexpected `isolationmode` was reported as a deliberate
  classification and was counted by `generateAuditReport`'s `externalPlugins` filter. It now
  reports `Unknown (<value>)` and is not counted. That is the right direction - the old
  behaviour fabricated a classification - but it assumes `isolationmode` is always populated
  in practice, which is what makes the change a no-op rather than a drop in the audit's
  external-plugin count. Dataverse documents the column as required, and no test in this repo
  exercised a null, so the assumption is reasonable and unverified. One live `plugin list`
  against a real environment settles it: any assembly reporting `Unknown (...)` means the
  column is not always populated and the audit's count has genuinely changed.

### ⚑5 update (L3) · `powerplatform` was **not** on the stale `core` pin, and nothing currently resolves as `invalid`
- Recorded here rather than by editing ⚑5, per the append-only rule.
- The L3 handoff warned that T15's package was still pinned to `core@33.0.0`. It is not:
  both `powerplatform` and `powerplatform-customization` pin `34.1.0`, and
  `powerplatform-core` resolves through the workspace symlink
  (`node_modules/@mcp-consultant-tools/powerplatform-core -> ../../packages/powerplatform-core`),
  so the L3 edits were visible to the dependent packages immediately. Measured this hop:
  **16** package.json files still pin `core@33.0.0`, yet `npm ls @mcp-consultant-tools/core`
  reports **no** `invalid` lines at all, so ⚑5's symptom is not currently reproducible on this
  checkout even though the stale pins remain. Whoever takes the pin bump should re-measure
  rather than trusting either number: the count and the symptom now disagree, and the reason
  is not established here.

### ⚑25 · T9 (X1) cannot be fixed from this repo, and the plan listed it as if it could
- **Kind:** dropped-scope
- **Hop:** L3 · T9 triage
- **State:** open
- **Matters because:** the plan queued T9 as "documentation only, every `SKILL.md` and
  `cli-reference.md`", which reads as a cheap sweep a hop could take. Those files are not in
  this repository. Verified three ways at L3: no file named `cli-reference.md` exists in the
  tree; **zero** tracked `.md` files assign an `npx` or `node` command string to a shell
  variable; and no `.md` uses a bare `$VAR` as a command. This repo's own docs use the direct
  inline form, which is correct under zsh. `docs/release-notes/v35.0.0-beta.11.md` and
  `v35.0.0-beta.14.md` both already say the sweep belongs in the consuming skills - so the
  plan restated, as an open task here, something the release notes had already ruled out
  twice. Left open rather than closed because **the defect itself is not fixed**: every
  command documented that way still fails on macOS, and one measured failure exited 0 having
  written zero files, which is the silent direction. The work is a sweep of six files in the
  private skills repo, replacing the string variable with a shell function
  (`arm() { npx -y --package=... "$@"; }`). That is Klemens's to do or to delegate; no hop of
  this chain can reach those files. The moved plan section now says so, so a later hop does
  not spend a session rediscovering it.

### ⚑26 · T12's api-version bump may resolve part of T11 and T13, so their order matters
- **Kind:** assumption
- **Hop:** L3 · queue triage
- **State:** closed-by-L5 — the ordering dependency is void (the api-version was never
  stale, see the L4 update) and T11 landed without needing T12. T12 is re-scoped in the plan
  file from "raise the api-version" to "find out why the fields are absent", with the
  candidate causes ranked; the open question moved to ⚑33 and ⚑34.
- **Matters because:** T11, T12 and T13 are all `azure-defender` and the plan orders them by
  the source report's priority, not by dependency. T12 is "raise the api-version", and the
  plan's own measurement says both things it would unlock arrived **with** api-version
  2025-05-04: `Critical` severity, and the `properties.risk` object. T11 is "`attack-path`
  drops `riskLevel`, `riskFactors`, `entryPoint`, `target`, `attackPathSteps`,
  `mITRETacticsAndTechniques`, `attackStory`, `isPartialAttackPath`" - which is the same risk
  payload, and Resource Graph returning them while the CLI does not is equally explained by
  the CLI asking an older api-version. T13's `implementationEffort` / `userImpact` being null
  on all 1,302 definitions may be the same story. So a hop that takes T11 or T13 first could
  write mapping code for fields that the T12 one-line bump would deliver for free, or "fix" a
  null by hard-coding around a version that never carried the field. **Recommended order:
  T12 before T11 and T13**, and whichever hop takes T12 should re-read T11's and T13's
  measured evidence afterwards and say plainly whether either is now moot. Cannot be settled
  here: no Azure credentials on this machine, so nobody can see what the newer api-version
  actually returns. Same blocker as ⚑1, ⚑7, ⚑8, ⚑9. T10 is unaffected - it is about scope
  filtering, not payload version - which is why it stays next.

### ⚑27 · T10's mechanism is inferred from the measurement, not confirmed against live Azure
- **Kind:** assumption
- **Hop:** L4 · T10
- **State:** open
- **Matters because:** the plan states the *measurement* (39 of 39 assessments present in
  Resource Graph but absent from CLI output were scoped to an identity object or to the
  subscription) but not the *mechanism*, and this repo's code contains no scope filter to
  relax - the CLI made one call, `GET /subscriptions/{sub}/providers/Microsoft.Security/
  assessments`, and returned what came back. The reading taken is that the ARM list
  enumerates assessments on resources **inside** the subscription, so an assessment whose
  subject is an AAD identity (not an ARM resource) or the subscription itself (not a
  resource in it) is never in the response. That reading fits the measurement exactly and
  is why the fix adds a second source rather than changing a filter. It is not confirmed:
  nobody has seen the two responses side by side from this code. If the real cause were
  something else - a paging bug in the ARM response, a permissions difference - the union
  still recovers the rows, because Resource Graph has them either way, so the fix is
  correct under both readings and the open question is only *why*. One live run settles
  it: compare `summary.sources.arm.returned` against
  `summary.sources.resourceGraph.returned` and read `resourceGraph.unique` on a
  subscription with a paid Defender plan. No Azure credentials on this machine. Same
  blocker as ⚑1, ⚑7, ⚑8, ⚑9, ⚑26.

### ⚑28 · `defender-list-assessments` now costs a full scan of two sources on every call
- **Kind:** klemens-call
- **Hop:** L4 · T10
- **State:** open
- **Matters because:** `maxResults` used to be handed to the ARM list, so a small limit was
  a cheap call. It no longer is: the cut would fall on ARM's rows and take out exactly the
  identity- and subscription-scoped assessments the second source recovers, so both
  sources are scanned in full and the trim happens after the union. Every call now also
  makes at least one Resource Graph POST it did not make before. On a subscription holding
  thousands of assessments an unfiltered `--max-results 10` goes from one page to the whole
  set plus a Resource Graph scan. That is the price of the fix being correct rather than
  fast, and the same trade the existing `statusFilter` branch already made, but it is a
  performance change to a command an assurance run invokes per subscription. Belongs in the
  release notes as a behaviour change. Same class as ⚑10, ⚑12 and ⚑20.

### ⚑29 · The Resource Graph row shape is mapped from documentation and community usage, not from a row anyone has seen
- **Kind:** assumption
- **Hop:** L4 · T10
- **State:** open
- **Matters because:** `mapAssessmentGraphRow` reads `properties.resourceDetails.Id` and
  `.Source` (the PascalCase keys the published `securityresources` queries use) while
  falling back to the lowercase ARM spelling, and reads `properties.status.code` for the
  health status. If Resource Graph names any of those differently in practice, the
  recovered rows arrive with `resourceDetails.id` undefined - which reads as "assessment
  with no resource" rather than as a mapping miss - or, for `status.code`, drop out of a
  filtered list entirely. The status comparison is case-insensitive precisely because a
  casing difference between two APIs would otherwise delete rows silently, but a *different
  key* is not defended against. Also unverified: that Resource Graph's assessment `id` and
  ARM's differ only by case, which is what the union's lower-cased key assumes. If they
  differ by more - a doubled provider segment, say - the union would double-count instead of
  deduplicating, and `summary.total` would be too high rather than too low. One live run
  settles all of it: read `summary.sources.resourceGraph.unique` against the portal's
  recommendation count, and check a recovered row carries a `resourceDetails.id`. No Azure
  credentials on this machine.

### ⚑30 · Resource Graph paging is capped at 20 pages, and the cap is not reachable in any test
- **Kind:** decision
- **Hop:** L4 · T10
- **State:** open
- **Matters because:** `queryResourceGraph` follows `$skipToken` up to `MAX_RESOURCE_GRAPH_PAGES`
  (20), which is 20,000 assessment rows, then stops and sets `truncated`. The ceiling exists
  so a malformed token loop cannot run forever, and hitting it is declared rather than
  silent - the truncation contract holds. But 20,000 is a guess at "more than any real
  subscription", not a measured bound: the estate that produced this defect held 4,886
  unhealthy assessments across 16 subscriptions, so the cap is roughly 60x the largest
  single-subscription figure anyone has seen, and no test exercises a real overrun because
  the test drives it with a stub. If a subscription ever does exceed it, the result is a
  lower bound that says so, which is the safe direction. Worth revisiting only if a live run
  ever reports `truncated: true` with no `maxResults` set.

### ⚑26 update (L4) · T12's premise does not hold in this repo: the assessments api-version was never stale
- Recorded here rather than by editing ⚑26, per the append-only rule.
- ⚑26 recommended taking T12 ("raise the api-version") before T11 and T13, on the reading
  that both the `Critical` severity tier and the `properties.risk` object arrived with
  api-version 2025-05-04 and the CLI was asking for an older one. **The CLI is already on
  2025-05-04.** `DEFENDER_API_VERSIONS.assessments` and `.assessmentMetadata` have been
  `2025-05-04` since the package's first commit (`1ea2564`, 2026-07-10), which is the only
  commit that file has ever had, so every published build carries it. Measured this hop
  while reading the same file for T10.
- **What that means for the queue:** T12 as written is a no-op, and the ordering dependency
  ⚑26 raised is void - T11 and T13 can be taken in any order. It does **not** mean the
  measurement behind T12 was wrong: the source report still measured zero `Critical`
  assessments and zero `properties.risk` objects, and that now needs a different explanation
  from the one the plan assumed. Two candidates, neither settled here: the payload may need
  an `$expand` the code does not send, or the tenant may genuinely hold no Critical-severity
  findings and no risk objects (the latter requires Defender CSPM, which the same report
  found disabled on most of the estate). Whoever takes T11 or T13 should read this first and
  re-scope T12 to "find out why the fields are absent" rather than "bump the version". No
  Azure credentials on this machine, so which candidate it is cannot be settled from here.

### ⚑31 · The Exposure Management attack-path field *types* are guessed, only their names are measured
- **Kind:** assumption
- **Hop:** L5 · T11
- **State:** open
- **Matters because:** the plan measured the field **names** on a live row and the value of
  two of them (`riskLevel: High`; risk factors Internet exposure and Weak authorization).
  Everything else about the shape is inferred. `riskFactors` is typed `unknown[]` and
  `entryPoint` / `target` / `attackPathSteps` / `mITRETacticsAndTechniques` as `unknown`,
  precisely so a wrong guess cannot be a type error, and `labelOf()` turns a value into a
  display label by trying `name`, `displayName`, `riskFactorName`, `type`, `id` in that
  order before falling back to `JSON.stringify`. **That order is a guess.** If a live entity
  object carries a human name under some other key, `labelOf` returns the serialized object
  instead - visibly odd in the CLI summary, and a distinct bucket key in
  `summary.byRiskFactor`, so a wrong label inflates the number of distinct factors rather
  than collapsing them. That is the safe direction and it is why the fallback serializes
  rather than returning `undefined`, but a breakdown keyed on JSON blobs is not usable and
  nobody has seen one. One live `defender-get-attack-path` settles it: read `entryPoint`,
  `target` and the first element of `riskFactors` and check `labelOf` picked the readable
  field. No Azure credentials on this machine. Same blocker as ⚑1, ⚑7, ⚑8, ⚑9, ⚑26, ⚑27, ⚑29.

### ⚑32 · T11 renamed two summary keys, which is a breaking payload change
- **Kind:** klemens-call
- **Hop:** L5 · T11
- **State:** open
- **Matters because:** `defender-list-attack-paths` returned
  `summary.byPotentialImpact` and `summary.byRiskCategory`; it now returns
  `summary.byRiskLevel`, `summary.byRiskFactor`, `summary.riskLevelNotReported` and an
  optional `summary.note`. Any consumer keying on the old names breaks. The judgement taken
  was that leaving a key named `byPotentialImpact` while feeding it `riskLevel` values is
  the T8 defect pattern - a name asserting something the value is not - and that on a
  live-shape tenant the old keys only ever held `{ Unknown: N }` and `{}`, so what breaks was
  already worthless there. On a legacy-shape tenant the old keys **did** hold real values, so
  a consumer there loses a working field to a rename. **This needs the breaking-change block
  in the release notes** (warning plus copy-paste agent block), which is Klemens's call to
  make when he cuts the beta, not the loop's. Same class as ⚑10, ⚑12, ⚑20, ⚑28.

### ⚑33 · T12's "the estate simply had CSPM off" explanation is weakened by an inference across two measurements
- **Kind:** assumption
- **Hop:** L5 · T11
- **State:** open
- **Matters because:** the ⚑26 update left T12 with two candidate explanations for zero
  `Critical` severities and zero `properties.risk` objects, one being that the estate
  genuinely held neither, since a risk object requires Defender CSPM and the same report
  found CSPM disabled on most of the estate. T11's own measurement cuts against that: the
  attack path the report measured carried `riskLevel: High` **and existed at all**, and
  attack paths are a CSPM-only artefact. So CSPM was producing risk data somewhere on that
  estate. **This is an inference, and a weak one:** the report covered 16 subscriptions, the
  attack path and the 4,886 assessments need not be from the same one, and "CSPM on for one
  subscription" does not imply "risk objects on assessments in another". It is recorded so
  whoever takes T12 does not treat "CSPM was off" as settled, and knows to check which
  subscription each measurement came from - which requires the source report, held outside
  this repo, plus credentials this machine does not have.

### ⚑34 · T13 is not a mapper drop, and the assessment mapper may still carry T11's defect class
- **Kind:** deferred
- **Hop:** L5 · T11
- **State:** part-closed-by-L6
- **Matters because:** two separate things, both measured this hop while reading the
  assessment service for T11's sake, and both worth a hop's first ten minutes:
  1. **T13 cannot be fixed by changing a mapper, because there is no mapper.**
     `listAssessmentMetadata` returns `client.paginate<AssessmentMetadata>` items straight
     through; the type parameter is a cast and discards nothing at runtime. Whatever ARM
     returned is what the caller saw, so `implementationEffort` / `userImpact` being null on
     all 1,302 definitions is a fact about the request or the API. Untested lead, recorded in
     the plan: the call is subscription-scoped, and the definition catalogue the portal ranks
     by effort and impact may only carry those fields at tenant/default scope.
  2. **`mapAssessmentGraphRow` still names a fixed allowlist** (`displayName`, `status`,
     `resourceDetails`, `risk`, `additionalData`, `metadata`, `links`) and was written from
     Microsoft's documentation, exactly as `mapAttackPathRow` was. T11 proved that
     documentation is behind the live API on this surface. If a live Resource Graph
     assessment row carries risk data under any key that allowlist does not name, it is
     discarded, and T12's "no assessment carries a `properties.risk` object" would be an
     artefact of this repo rather than a fact about Azure. **Cheap to close:** give the
     assessment mapper the same `unmappedProperties` passthrough T11 gave attack paths, then
     one live call shows what is actually arriving. Deliberately not done this hop - T11's
     scope was attack paths, and widening a fix into a second service on a hunch is how a
     hop stops being reviewable. This is the sweep ⚑29 anticipated, now with a confirmed
     instance behind it.

### ⚑35 · The CLI half of the T11 fix is unit-untested, because this package has no CLI tests
- **Kind:** gotcha
- **Hop:** L5 · T11
- **State:** open
- **Matters because:** the user-visible half of the fix is a CLI summary block - "Risk level:
  not reported by the API" instead of "Unknown", the entry point and target labels, the
  `isPartialAttackPath` warning, the `unmappedProperties` key list, and the printed
  `summary.note`. **Nothing asserts any of it.** `packages/azure-defender` has seven test
  files and none covers `src/cli/`, so the convention this hop followed is "no CLI tests
  here", and adding the first one is a package-shaped decision rather than a hop's. What was
  verified instead, without credentials: the package builds, the built MCP server lists
  `defender-list-attack-paths` with the new `riskLevel` parameter and no longer carries the
  wrong claim in either description, `--help` shows `-l, --risk-level`, and a run with fake
  credentials fails loudly and exits 1 rather than returning an empty list. What is **not**
  verified is that any of those strings render correctly against a real payload, including
  the "not reported by the API" line, which is the one the whole absent-versus-none decision
  rests on. Same class as ⚑15 if that is the CLI-coverage item; if not, this is the first.

### ⚑29 update (L5) · The class ⚑29 warned about is now confirmed, on attack paths rather than assessments
- Recorded here rather than by editing ⚑29, per the append-only rule.
- ⚑29 registered that `mapAssessmentGraphRow` reads a row shape taken from documentation and
  community usage, not from a row anyone has seen, and that a differently-named key would
  arrive as a silent mapping miss rather than an error. **T11 is that exact failure, found in
  the sibling mapper.** `mapAttackPathRow` was built from Microsoft's published attack-path
  field table, the live rows carry a different set of names, and every field off the
  documented list was discarded - so a `riskLevel: High` path reported no risk at all, on
  every path of a real estate. The documentation is not merely incomplete: it was checked on
  2026-08-19 and still describes only the legacy shape.
- **What that changes:** ⚑29 was a theoretical risk and is now a demonstrated one on the same
  API, in the same package, from the same cause. It should be read as a defect to go and
  find rather than an assumption to note, and ⚑34 names the cheap way to test it. It also
  generalises: any mapper in this repo whose field list came from a vendor doc rather than
  from a captured response can be silently dropping payload. Whoever runs the closing hop
  should decide whether that belongs in `docs/KNOWN_ISSUES.md` as a class, not just as
  instances.

### ⚑34 update (L6) · half 2 is closed; half 1 is answered but not fixed
- Recorded here rather than by editing ⚑34, per the append-only rule. ⚑34's `State` moves to
  `part-closed-by-L6`.
- **Half 2 (the assessment mapper's allowlist) is done.** `mapAssessmentGraphRow` now carries
  every unnamed `properties` key in `properties.unmappedProperties`, and `listAssessments`
  aggregates the distinct names into `summary.unmappedPropertyKeys` plus a sentence in
  `summary.note`. The aggregate is taken across all Resource Graph rows **before** the union
  drops duplicates and **before** `maxResults` trims, because an ARM row wins a shared id and
  the cut falls somewhere - so the surface an assurance run actually reads cannot lose a field
  that only one row of thousands carried. 6 tests, 4 of which failed against the shipped
  mapper. T12's mapper-artefact candidate is therefore decided by reading one field on the
  first live run, which is what this half existed to achieve.
- **Half 1 (T13) is answered, and the answer is that it is credential-blocked.** The L5 lead
  was that the ranking fields might exist only at tenant/default scope. **Refuted from the
  published schema:** the subscription-scoped operation returns the same
  `SecurityAssessmentMetadataList` definition and its own published sample carries both
  fields. Also refuted: that `2025-05-04` might be unrecognised on this surface - it is a real
  `stable/` folder in `Azure/azure-rest-api-specs` with subscription-scope metadata examples.
  What is left is in ⚑36. **No code was written for T13**, deliberately: there is nothing to
  fix until a live call says which side of the version boundary the fields live on.
- **Still open inside ⚑34 half 1, and unresolvable here:** the report says the two fields were
  `null`, but an optional field ARM does not populate arrives **absent**, not null. Either the
  reporting consumer rendered absent as null, or ARM sent explicit nulls, and those have
  different causes. Settling it needs the source report (held outside this repo) or one live
  call.

### ⚑36 · T13's remaining cause is one live comparison, and the likely fix is a capability trade-off Klemens has to make
- **Kind:** klemens-call
- **Hop:** L6 · ⚑34
- **State:** open
- **Matters because:** L6 narrowed T13 to a single testable hypothesis. At `2025-05-04` both
  `implementationEffort` and `userImpact` are **optional** in the response model and **absent
  from every 2025-05-04 example**, while the 2020-01-01 examples for the same operation carry
  them. The one test is to call `assessmentMetadata` twice against the same subscription, once
  at each api-version, and compare. **If the old version populates them and the new one does
  not, there is no patch that keeps everything:** `2025-05-04` is exactly what this package
  needs for `Critical` severity (that is T12's subject, and the pin's stated reason), so the
  options are to make two calls per invocation and merge the two shapes, or to accept losing
  either `Critical` severity or any effort/impact ranking. Two calls per invocation is a
  performance and behaviour change to a command an assurance run makes per subscription - the
  same class as ⚑10, ⚑12, ⚑20 and ⚑28 - and choosing which capability matters more is a
  product call, not a loop's. No Azure credentials on this machine. Same blocker as ⚑1, ⚑7,
  ⚑8, ⚑9, ⚑26, ⚑27, ⚑29, ⚑31.

### ⚑37 · The assessment passthrough is unit-verified only, and covers just one of the two sources
- **Kind:** assumption
- **Hop:** L6 · ⚑34
- **State:** open
- **Matters because:** two things a reader could get wrong. First, **nothing has seen a live
  assessment row through this code.** The passthrough's whole value is diagnostic - it exists
  so one live run tells T12 whether the mapper was discarding risk data - and until that run
  happens, "no assessment carries a `properties.risk` object" is still unexplained rather than
  explained. The fixtures prove the mechanism, not the finding. Second, **the passthrough only
  covers the Resource Graph half of the union.** ARM's rows are returned verbatim with no
  mapper at all, so they can drop nothing and need no passthrough - but that also means
  `summary.unmappedPropertyKeys` is silent about anything unexpected in an ARM row, and an
  empty list must be read as "Resource Graph carried nothing unrecognised", never as "this
  command now reads every field both sources return". Same class as ⚑29, which anticipated
  exactly this on the same mapper, and the reason ⚑29's L5 update asked whether
  "mappers built from vendor docs" belongs in `docs/KNOWN_ISSUES.md` as a class.
- **What settles it:** one `defender-list-assessments` against a subscription with a paid
  Defender plan. Read `summary.unmappedPropertyKeys`, then read
  `properties.unmappedProperties` on a row that has one.

### ⚑38 · `summary.note` now carries a list that a live tenant could make long
- **Kind:** decision
- **Hop:** L6 · ⚑34
- **State:** open
- **Matters because:** the unmapped-key sentence names every distinct key, and the CLI prints
  `summary.note` verbatim. On a tenant whose rows carry many unrecognised fields the note
  grows with them, and `note` is the same field that carries the "this list is incomplete"
  warning - the one message that must not be skimmed. The judgement taken was that naming the
  keys is worth it, because a note saying only "some fields were not mapped" would send the
  reader back to the rows, which is the cost the aggregate exists to remove, and because a
  long list is itself the finding. If a live run shows the note becoming unreadable, the fix is
  to cap the names in the note (the full set stays in `unmappedPropertyKeys`), not to drop the
  sentence. Recorded so the cap is a deliberate later choice rather than a surprise. Payload
  change is additive - `unmappedPropertyKeys` is new and `note` was always variable text - so
  unlike ⚑32 this needs no breaking-change block.
