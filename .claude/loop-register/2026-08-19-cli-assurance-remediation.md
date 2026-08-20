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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list · needs Klemens
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
- **State:** open · promoted-by-L10 to the plan file's deferred scope · L1's work-list grep is exhausted and the remaining scope is unmeasured
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
- **State:** open · promoted-by-L10 to docs/KNOWN_ISSUES.md and to the plan file's deferred scope
- **Matters because:** found during the beta.17 work and deliberately left out of it,
  because fixing it changes `gen-integration-audit`'s own output contract. It is the same
  false-completeness defect class that beta.17 closed for the five list commands, still
  live inside a command whose entire purpose is to produce a report someone acts on.

### ⚑4 · Two `powerplatform-core` services still use the `$top = maxRecords + 1` check
- **Kind:** deferred
- **Hop:** origin · 6729aa0
- **State:** closed-by-L10 · the KNOWN_ISSUES record was **wrong in both directions** and is now corrected: `FlowService.getFlows` was listed as affected but was fixed in beta.17, while **`FlowService.searchWorkflows:357` and `FlowService.getFlowRuns:796` were in no record at all**. Four methods carry the pattern, not two or three. Found by sweeping both spellings (`maxRecords + 1` and `limit + 1`) rather than counting the named services
- **Matters because:** `MetadataService.getGlobalOptionSets` and
  `WorkflowService.getWorkflows` will report `hasMore: false` on a truncated result
  wherever the result set can reach the 5,000-row page cap. Already recorded in
  `docs/KNOWN_ISSUES.md` via the master release notes, so this item exists to make sure
  the closing hop checks that record is still accurate rather than re-finding it.

### ⚑5 · 14 packages compile against a stale published `core`
- **Kind:** gotcha
- **Hop:** origin · 6729aa0
- **State:** open · promoted-by-L10 to the root `CLAUDE.md` · re-measured at 16 packages
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
- **State:** closed-by-L7 · confirmed
- **Matters because:** the source report tested `code-review` at beta.3, but beta.14's
  release notes describe fixing both defects. If that reading is right, T17 is a retest
  and re-fixing it would revert working code. The hop that takes T17 must verify against
  the current build first and record which way it went.

### ⚑7 · `exceptiondetails ne ''` is unverified against live Dataverse
- **Kind:** assumption
- **Hop:** L1 · 8e84439
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** closed-by-L7 · refuted
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's deferred scope
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens
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
- **State:** open · promoted-by-L10 to docs/KNOWN_ISSUES.md and to the plan file's deferred scope
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens
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
- **State:** open · promoted-by-L10 to docs/KNOWN_ISSUES.md and to the plan file's deferred scope
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to `.claude/refs/cli-architecture.md` · the sweep itself is Klemens's action, in a repo no hop can reach
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens
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
- **State:** open · promoted-by-L10 to `.claude/refs/adding-features-checklist.md` as a convention, with pointers in the `azure-management` and `azure-defender` package `CLAUDE.md` files · the unverified live row shape is in the plan file's live-run list
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
- **State:** open · promoted-by-L10 to the plan file's deferred scope
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list · needs Klemens
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
- **State:** open · promoted-by-L10 to `packages/azure-defender/CLAUDE.md` and to the plan file's live-run list
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list · needs Klemens
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
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
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
- **State:** open · promoted-by-L10 to the plan file's deferred scope
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

### ⚑39 · T14's stated causes are all unverified, and the code points at three different ones
- **Kind:** assumption
- **Hop:** L6 · read while locating T14 for the handoff
- **State:** closed-by-L7
- **Matters because:** T14 arrives with a cause already written into it for each half, and
  neither survives a first read of the code, so a hop that trusts the plan would fix the
  wrong thing. **D11's three missing fields are gated on `includeDetails` in
  `processFrontDoorProfile`** - they are fetched only when that flag is set, so "the code
  never asked" may be literally true and controlled by a caller, which is a third
  explanation alongside the plan's mapping gap and ⚑8's swallowed 403. The three need
  different fixes and only one is a code change. **D11's `state` complaint looks like a
  documentation defect**: the mapper already reads ARM's `resourceState` and renames it
  `state` in the payload, so whatever promises `resourceState` to a consumer is what is
  wrong - the T8 pattern, where the doc seeded the defect. **D10's four fields are all
  named in the mapper**, so unlike T11 nothing is discarding them; either the ARM
  `serverfarms` **list** response omits what the detail response carries, or
  `workerCount: props.targetWorkerCount` reads the wrong key for a worker count. None of
  this is settled: no Azure credentials on this machine. The credential-free half is a spec
  read, which is what settled T13's shape this hop.
- **L7 resolution:** settled from the ARM swagger, and **all three of the plan's stated
  causes were wrong while two of L6's three leads were right**. D11 was the
  `includeDetails` gate: `listFrontDoors` hard-coded it `false` with no caller override, so
  the fields were never requested - not a mapping gap and not ⚑8's 403. D11's `state` was
  the documentation defect L6 predicted, with a twist: nothing in this repo promised
  `resourceState` either, so the doc was silent rather than wrong, and the fix is to state
  the rename. D10 was neither of L6's two candidates on its own but both at once:
  `AppServicePlans_List` at subscription scope drops the four fields unless `detailed=true`
  is passed (the list-versus-detail difference, confirmed in the swagger's own parameter
  description) **and** `workerCount` was reading `targetWorkerCount`, the writable scaling
  target, rather than the read-only `numberOfWorkers`. Two independent defects behind one
  symptom; fixing only the request would have populated a field that was still reporting
  the wrong number.

### ⚑40 · Whether ARM honours `detailed=true` on a live estate is unverified
- **Kind:** assumption
- **Hop:** L7 · T14 (D10)
- **State:** open · promoted-by-L10 to the plan file's live-run verification list · needs Klemens
- **Matters because:** the whole D10 fix rests on one sentence in the `AppServicePlans_List`
  swagger - `detailed` "defaults to false, which returns a subset of the properties" - and
  the parameter is documented nowhere else useful. No Azure credentials on this machine, so
  no live `serverfarms` response has been seen through the changed code. If ARM ignores the
  parameter, or if the subset it returns is scope-dependent rather than parameter-dependent,
  `numberOfSites` stays absent and the "unused App Service plan" false positive stays live -
  and the fix will *look* landed because the unit tests assert the request, not the response.
  One live `app-service plans` run at subscription scope settles it: `numberOfSites` and
  `workerCount` must be populated on a plan known to host apps. Klemens has the credentials.
- **Related:** the swagger also warns that "retrieval of all properties may increase the API
  latency", which is unmeasured here. If a subscription-wide run becomes slow, the trade-off
  is latency against a field that manufactures false alarm - and the field wins, but the
  choice should be made knowingly rather than discovered.

### ⚑41 · `workerCount` changed meaning without a breaking-change block
- **Kind:** decision-for-Klemens
- **Hop:** L7 · T14 (D10)
- **State:** open · promoted-by-L10 to the plan file's release-notes checklist · needs Klemens, and it depends on item 40's live run
- **Matters because:** `workerCount` used to carry ARM's `targetWorkerCount` and now carries
  `numberOfWorkers`. The key name is unchanged and the type is unchanged, so nothing breaks
  at the schema level, but any consumer that read it as a scaling target now reads an
  assigned-instance count, and on a plan configured to scale the two differ. In practice
  every measured value was absent, so no live consumer can have been reading a real number
  from it - which is the argument for treating this as a fix rather than a break. Recorded
  because that argument rests on ⚑40: if `detailed=true` turns out to be unnecessary and the
  field was populated all along on some scopes, this becomes a silent semantic change to a
  populated field, and the release notes need the breaking-change block. Klemens's call at
  release time, and it depends on the same live run.

### ⚑8 update (L7) · refuted, and it could have been refuted without credentials
- The three calls were never made at all. `listFrontDoors` passed `includeDetails: false`
  literally, and `processFrontDoorProfile` only fetches `endpoints`, `originGroups` and
  `routes` inside `if (includeDetails)`. So a 403 was never reachable on the path the
  assurance run took, and the empty `fanOut.failures` a live run would have shown was
  correct rather than suspicious. Nothing was swallowed; nothing was asked.
- **Worth keeping:** ⚑8 was written as "cannot be settled here: no Azure credentials", and
  that was wrong. Whether a call is *made* is a question about this repo's code, answerable
  by reading it; only whether it is *refused* needs the tenant. Six hops carried the item as
  credential-blocked when a five-line read closed it. When registering a
  live-run-only assumption, check first whether the credential-free half answers it.
- **Residual, and it is a real one:** with `--include-details` now reachable, those three
  calls will run on a live estate for the first time, and they go through `fanOut.run`. A
  403 on `afdEndpoints`, `originGroups` or a per-endpoint `routes` list is now both possible
  and reported. So the first live `--include-details` run should be read for
  `fanOut.failures` before its output is used for a WAF review - an unattached WAF policy and
  a refused route list look the same to a reader who skips it.

### ⚑6 update (L7) · confirmed already-fixed, and the retest cost nothing
- Both defects are fixed in the current build and **nothing was rewritten**. D25 is verified
  end-to-end rather than by reading source: the built CLI run against a nonexistent Azure
  DevOps organisation returns a genuine 404, and its hint names the project, the
  organisation and `cr-list-repos` with no SAML or "Developer settings" text anywhere. The
  403 branch and the non-interactive clone environment were read out of the **built** JS,
  both correct.
- **Worth keeping:** a nonexistent organisation produces a real 404 from a real API without
  any credential, so the whole of D25 was retestable on this machine. The task had been
  carried as needing a live tenant. Before deferring an error-path retest for want of
  credentials, ask which errors a *wrong* identifier produces - 404 and 400 paths usually
  need no valid credential at all, and they are where confidently-wrong hint text lives.
- **Residual:** D24's runtime half stays unproven. Whether a clone now fails in seconds
  instead of hanging depends on a controlling terminal and a real organisation, which is
  what `v35.0.0-beta.14.md` already says and what CI cannot supply. Not reopened, because
  the mechanism (`GIT_TERMINAL_PROMPT=0` with both ASKPASS variables emptied) is present in
  the built artifact and its unit assertions invert correctly.

### ⚑42 · The plan's "already known in KNOWN_ISSUES" premise for T16 was wrong
- **Kind:** gotcha
- **Hop:** L7 · T16 (D26)
- **State:** open · promoted-by-L10 in part: the em-dash residual to docs/KNOWN_ISSUES.md; the "plan-file causes are leads" lesson has no repo home and stays here
- **Matters because:** T16 recorded that `docs/KNOWN_ISSUES.md` held the repo-wide version of
  the cache-path behaviour. It does not - that file has four entries and none is about the
  cache path - so a hop that trusted the line would have fixed the package-specific symptom
  and left the shared cause undocumented. The durable record is now
  `.claude/refs/cli-architecture.md`, which is the right home because it already documents
  the cache path and is loaded when CLI work is done. Registered rather than silently
  corrected because **this is the third wrong premise this chain has found in its own plan
  file** (T13's scope lead, T14's three causes, now this), and the pattern is the point: the
  plan file's "related, already known" and "cause" lines are restatements of a source report,
  not verified claims about this repo. Treat them as leads.
- **Second, smaller finding, deliberately not acted on:** the `code-review` hint text shipped
  by an earlier hop contains em-dashes, which Klemens's standing rule bars from every output
  channel including code. Fixing it means editing user-facing strings that two tests match
  on, which is not this task's scope. Left for whoever next touches that file, or for a
  deliberate sweep - a repo-wide `grep -rn '—' packages/*/src` is the work-list.

### ⚑33 update (L7) · the question is now answerable from this package, in one call
- `defender-list-plans` reads `Microsoft.Security/pricings` and reports `cspmEnabled` for
  the subscription it is pointed at, plus a note stating what an empty CSPM result means
  under that configuration. So the inference ⚑33 warns about - reasoning from an attack path
  in one subscription to assessment risk in another - is no longer necessary: run the command
  per subscription and read the answer. **Left open deliberately**, because the item is about
  a claim that still stands unverified until someone with credentials runs it across the
  subscriptions the measurements came from. What has changed is the cost: it is one command
  per subscription rather than a reconstruction from the source report.
- `cspmEnabled` is three-state for exactly this reason. A `null` (the plan was absent from
  the response) must not be read as "CSPM off", which is the same conflation ⚑33 warns about
  in the other direction.

### ⚑43 · The two new Defender surfaces have never seen a live row
- **Kind:** assumption
- **Hop:** L7 · T18 half 1 (D18)
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
- **Matters because:** every field the alert and pricing commands name, and every enum they
  validate against, comes from the ARM swagger rather than from a captured response. That is
  the best available source on this machine and it has been right twice this chain - but the
  same chain also found a mapper built from Microsoft's *documentation* discarding live
  payload twice, and the `2022-01-01` alert schema is four years old, so a live tenant may
  carry keys it does not define. The alert mapper passes `properties` through whole
  specifically so that cannot silently happen, but nothing has confirmed it. **First live run
  should:** check `defender-list-alerts` returns rows with `compromisedEntity` populated
  (`topEntities` is empty and useless without it), and confirm `defender-list-plans` names
  `CloudPosture` rather than some other spelling - `cspmEnabled` returns `null` if Microsoft
  ever renames that plan, which is the safe direction but is indistinguishable from a
  response that genuinely omitted it. Klemens has the credentials.

### ⚑44 · `defender-list-alerts` cannot give a filtered subscription-wide total
- **Kind:** dropped-scope
- **Hop:** L7 · T18 half 1 (D18)
- **State:** open · promoted-by-L10 to the plan file's deferred scope
- **Matters because:** `Alerts_List` accepts no `$filter`, so `maxResults` bounds the fetch
  and the filter can only ever see the rows already fetched. A caller asking for Active
  alerts on a tenant with more than `maxResults` alerts gets Active alerts *from the first
  page*, and the payload says so in `summary.note` rather than pretending otherwise. The
  honest fix - fetch every page whenever a filter is set, ignoring `maxResults` - was not
  taken, because an unbounded fetch on a large tenant is its own failure and this chain has
  no measurement of how many alerts a real estate carries. The default of 200 is a guess.
  Registered so raising it, or making a filtered call exhaustive, is a deliberate later
  choice informed by one live run rather than a surprise on a big tenant.


### ⚑45 · The four new `azure-management` surfaces have never seen a live row
- **Kind:** assumption
- **Hop:** L8 · T18 half 2 (D13)
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
- **Matters because:** every field the four commands name, and every shape their mappers
  read, comes from an ARM swagger rather than from a captured response. That source has now
  been right three times in this chain and is the best available on a machine with no Azure
  credentials, but the same chain twice found a mapper built from Microsoft's
  *documentation* discarding live payload. All four mappers pass `properties` through whole
  so a rename cannot silently discard anything, but nothing has confirmed the fields they
  read off it. **First live run should check, per command:**
  - `compute list-vms --include-status`: that `properties.instanceView` comes back with a
    `PowerState/` entry, so `byPowerState` is not entirely `unknown`. An estate reporting
    `unknown` for every VM means the status code is somewhere else in the payload.
  - `monitoring log-alerts`: that `kind` is present on the resource rather than inside
    `properties`. If it is absent, every rule defaults to `LogAlert` and `summary.alerting`
    silently counts `LogToMetric` rules as coverage - the exact overstatement this command
    exists to stop.
  - `logic-apps list-workflows`: that `definition.triggers` and `definition.actions` are
    objects rather than arrays. An array would make `actionCount` the string-key count of an
    array, which is still a number and therefore still looks right.
  - `logic-apps list-connections`: that `statuses[0].status` spells `Connected` exactly.
    Any other spelling puts every working connection in `summary.broken`, which fails
    towards false alarm rather than false calm, so it is the safe direction - but it is
    still wrong.
- Klemens has the credentials. Same class as ⚑43 for the Defender pair.

### ⚑46 · VM power state costs one ARM call per VM, and the cheap alternative was refused on purpose
- **Kind:** dropped-scope
- **Hop:** L8 · T18 half 2 (D13)
- **State:** open · promoted-by-L10 to the plan file's deferred scope
- **Matters because:** `--include-status` fans out to `VirtualMachines_InstanceView` once per
  VM, sequentially. On the estate D13 measured that is 244 calls in one command, with no
  cap, no concurrency and no progress output - it will look like a hang before it looks like
  a result, and nothing in the payload warns a caller how much it is about to cost.
- **The cheaper route exists and was deliberately not taken.** `VirtualMachines_ListAll`
  accepts `statusOnly=true`, which the swagger describes as enabling "fetching run time
  status of all Virtual Machines in the subscription" - one call instead of N. It was
  rejected for two reasons, and only the second is solid: it exists at subscription scope
  only, so a resource-group-scoped run would still need the fan-out and the two scopes would
  disagree; and **whether it returns the full model alongside the status, or a
  status-shaped subset, is not established anywhere.** The autogenerated swagger example
  passes `statusOnly: "aaaaaa"` and returns no `instanceView` at all, so it is evidence of
  nothing. Taking it blind risked repeating T14's D10 in reverse - gaining the runtime and
  losing the configuration.
- **What settles it:** one live `ListAll` with `statusOnly=true`, comparing the returned
  `properties` keys against the same call without it. If the model survives, the
  subscription-scope path should switch to two calls (plain list plus status list, merged on
  id) and the fan-out kept only for resource-group scope. That is a real improvement worth
  making once someone can measure it, and it is invisible from here.

### ⚑47 · The API connection sweep is unbounded in resource groups, and ARM's own paging parameters are unused
- **Kind:** dropped-scope
- **Hop:** L8 · T18 half 2 (D13)
- **State:** open · promoted-by-L10 to the plan file's deferred scope
- **Matters because:** `Microsoft.Web/connections` has no subscription-wide list operation, so
  `list-api-connections` walks every resource group in the subscription and asks each one.
  There is no cap on that walk. A subscription with several hundred resource groups pays
  several hundred ARM calls for a command whose summary line is two numbers, and the only
  visible symptom is elapsed time. The count is honest (`resourceGroupsSwept`,
  `complete`, `fanOut.failures`), the cost is not stated anywhere.
- **Two ways out, neither taken here.** `Connections_List` accepts `$top` and `$filter`,
  both unused - `$top` cannot help because the sweep's cost is the number of groups rather
  than the rows per group. The real alternative is Azure Resource Graph, which this package
  already has a service for and which would answer the whole thing in one query. That was
  refused because a Resource Graph row shape is a projection mapped from documentation, and
  ⚑29 is the standing record of that going wrong twice in this repo. Registered so a later
  hop chooses between "many calls, ARM-native shape" and "one call, projected shape"
  deliberately, rather than discovering the cost on a large tenant.

### ⚑48 · Two of the four api-version pins were chosen for maturity, not measured, and one is ten years old
- **Kind:** assumption
- **Hop:** L8 · T18 half 2 (D13)
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
- **Matters because:** `Microsoft.Compute/virtualMachines` has **54** stable api-versions in
  the spec repo and `2024-07-01` was picked as a mature one rather than because anything
  measured its payload against a newer one. A VM's `properties` block is explicitly
  version-dependent, so a field a later version added is simply absent here - and because
  the mapper passes `properties` through whole, absent looks like a VM that does not have it.
  `Microsoft.Web/connections` is worse in a different way: `2016-06-01` is the **only** stable
  version that has ever shipped for that resource type, so a live tenant may well return keys
  the schema does not define. The passthrough covers that, but nothing has checked it.
- **What settles it:** one live `compute list-vms` compared against `az vm list` on the same
  subscription. A field present in the CLI output and absent from ours is a version gap, not
  a mapper gap. Cheap to run, impossible to fake here.

### ⚑49 · Connection redaction trusts ARM's naming of which parameter map holds secrets
- **Kind:** assumption
- **Hop:** L8 · T18 half 2 (D13)
- **State:** open · promoted-by-L10 to docs/KNOWN_ISSUES.md, and first in the plan file's live-run list · needs Klemens
- **Matters because:** `list-api-connections` redacts `parameterValues` to its keys and leaves
  `nonSecretParameterValues` whole. That is not a guess about key names - it is ARM's own
  distinction, and it is a better instrument than the name-pattern redaction
  `AppServiceService.redactValue` uses, which would miss a secret under a key called
  `server`. But it is still a single point of trust: **if a live response ever carries a
  credential in `nonSecretParameterValues`, or renames either map, the redaction stops
  working silently and the payload is cached to disk by the CLI.** Nothing tests the live
  shape, and this is the one assumption in the hop whose failure mode is a written secret
  rather than a wrong number.
- **First live run should:** run `logic-apps list-connections` against a subscription with a
  SQL or Office 365 connection and read `nonSecretParameterValues` before the JSON is shared
  anywhere. If it holds anything credential-shaped, the redaction must move to redacting
  both maps by default.

### ⚑25 update (L8) · T9 is real, and it bit inside this repo's own tooling
- Recorded here rather than by editing ⚑25, per the append-only rule.
- ⚑25 carries T9 (X1) as "the documented `VAR="npx …"` then `$VAR` idiom fails under zsh, but
  the files are in the private skills repo, so it cannot be fixed from here". This hop hit
  the identical defect **in its own verification script**: a loop written as
  `for cmd in "logic-apps list-workflows" …; do node "$CLI" $cmd; done` failed with
  `unknown command 'logic-apps list-connections'`, because zsh does not word-split an
  unquoted variable and passed the whole string as one argument.
- **Worth keeping for two reasons.** First, it is independent confirmation that T9's
  mechanism is exactly as described, from a different direction than the report - so the
  sweep of the six skill files is worth doing and not a theoretical tidy-up. Second, it
  failed *loudly* here, which is the lucky half of T9: the measured cost in the assurance
  run included a collection that exited 0 and wrote zero files. Any script this chain
  writes should pass arguments literally rather than through a variable.

### ⚑29 update (L8) · the class was avoided four more times, deliberately, and that is now the house rule
- Recorded here rather than by editing ⚑29, per the append-only rule.
- ⚑29 registered "a mapper whose field list came from a vendor doc rather than a captured
  response can be silently dropping payload", and its L5 update confirmed it on attack paths.
  All four mappers written this hop pass `properties` through whole with no field allowlist,
  specifically so they cannot become instances five to eight. Two of the four also read the
  swagger and found a **request-side** version of the same problem, which ⚑29 does not
  cover: with VMs, the field is not in the response at all unless the request asks, so a
  perfect mapper still returns nothing.
- **What that changes for the closing hop.** ⚑29 asks whether "mappers built from vendor
  docs" belongs in `docs/KNOWN_ISSUES.md` as a class. It now has three confirmed instances
  (attack paths, assessments, the alert mapper) and four deliberate avoidances, so it is a
  convention rather than a bug class - and its home is arguably
  `packages/azure-management/CLAUDE.md` and its siblings, phrased as a rule for the next
  mapper, rather than `KNOWN_ISSUES.md` phrased as a defect. The closing hop should pick
  one home and say which, because it is currently recorded only in this register and in
  four commit messages.

### ⚑50 · D19 was answered with a hint rather than a `notApplicable` payload, and the payload version is still open
- **Kind:** klemens-call
- **Hop:** L9 · T19 (D19)
- **State:** open · promoted-by-L10 to the plan file's live-run verification list · needs Klemens
- **Matters because:** the plan file's suggestion was to return an empty result with
  `notApplicable: true` so a batch consumer stops parsing an error string. L9 did not do
  that, and the reason is evidence rather than taste: **nothing anywhere in this repo
  records which ARM error code a paid-plan refusal carries.** Recognising it would mean
  matching on a guessed string, and a wrong match converts a genuine failure - a 403, a
  wrong subscription id, an ARM outage - into a clean compliance report showing no gaps.
  In a compliance command that is the worst possible direction to fail in. It would also
  flip the exit code for every batch caller (⚑10's class). What landed instead is a
  trailing hint naming `defender-list-plans`, appended to ARM's own code and message, with
  the throw and the exit code unchanged.
- **What settles it:** one live run of any `compliance list-*` command against a
  subscription with no paid Defender plan, capturing the ARM error code and status
  verbatim. With that code in hand, `notApplicable: true` becomes a real option rather than
  a guess, and Klemens can then decide whether the payload change is worth the exit-code
  behaviour change. Until then the hint is the honest answer, not a placeholder for a
  better one. No Azure credentials on this machine.
- **Known trade-off, accepted deliberately:** the hint is attached to **every** failure of
  those four commands, including an authentication failure, because `DefenderClient`
  collapses an ARM error to a plain `Error` and discards the HTTP status, so the service
  cannot tell a 400 from a 403. Verified against fake credentials: an `AADSTS90002` tenant
  error now ends with the plan hint. The original error is first and unmistakable and the
  hint is phrased as a condition, so it misleads nobody, but it is noise on failures that
  have nothing to do with plans. Carrying the status through `DefenderClient.handleError`
  would let the hint be conditional; that is a client-wide change, not a T19 one.

### ⚑51 · `log-analytics` retries nothing at all, and only the 400 case is a decision
- **Kind:** deferred
- **Hop:** L9 · T19 (D23)
- **State:** open · promoted-by-L10 to docs/KNOWN_ISSUES.md and to the plan file's deferred scope
- **Matters because:** found while reading the error path for D23.
  `LogAnalyticsService.executeQuery` makes exactly one `axios.post` and throws on any
  failure. It does not retry `429`, `503`, `500` or a socket reset, while `DefenderClient`
  and `azure-management`'s `ArmClient` both retry `[429, 500, 502, 503, 504]` with
  exponential backoff and honour `Retry-After`. The 429 branch even reads the `Retry-After`
  header, purely to print it in the error message. So an assurance run that queries a
  workspace 180 times has no protection against the one failure class everybody agrees is
  transient, and every such failure is a hard stop.
- **Not fixed here on purpose.** Adding a retry policy to this package is a behaviour change
  to every command in it, not a T19 polish item, and T19 is explicitly optional. It also
  wants doing once for the package rather than once for `executeQuery`.
- **Note for whoever takes it:** `log-analytics` still pins `@mcp-consultant-tools/core`
  at `33.0.0` (see ⚑5), so if the retry helper is hoisted into `core` the pin must be
  bumped and `packages/log-analytics/node_modules/@mcp-consultant-tools/core` removed
  before `npm install`, or the stale copy stays on disk.

### ⚑52 · The two transient `Bad request` failures are still unexplained, and now they are at least diagnosable
- **Kind:** assumption
- **Hop:** L9 · T19 (D23)
- **State:** open · promoted-by-L10 to the plan file's live-run verification list
- **Matters because:** D23's two failures in roughly 180 `query execute` invocations both
  succeeded unchanged on immediate retry, which is the signature of something transient
  surfacing as a 400. **L9 did not identify them and could not:** the two original
  responses exist only in the assurance run's output, which is held outside this repo, and
  the code path that produced the message computed ARM's error code into a local and then
  discarded it, so even the run itself never had the code. That is now fixed - the message
  reads `Bad request (<code>): <message>` - but the fix makes the **next** occurrence
  answerable, it does not explain these two.
- **What settles it:** the next `Bad request` from a real workspace, read with its code.
  A `BadArgumentError` or `PathNotFoundError` means the query or the workspace id was the
  problem; anything that looks like throttling or a gateway means the 400 is a mislabelled
  transient and a bounded retry becomes defensible.
- **Until then, no retry.** A blind "retry once on Bad request" would mask a genuinely
  malformed query for every caller of the package in order to paper over two failures
  nobody has identified. A test named `does not retry a 400` pins that decision so it has
  to be changed on purpose rather than drifted into.

### ⚑10 update (L9) · the exit-code class was faced and declined for the first time
- Recorded here rather than by editing ⚑10, per the append-only rule.
- ⚑10 registered that changing an exit code is a behaviour change for any batch caller
  keyed on it, arising from `outputResult` exiting 1 on a lossy fan-out. T19's D19 is the
  first item in this chain where the *opposite* change was on the table: turning a hard
  failure into a success payload, which would move an exit code from 1 to 0 on 8 of 16
  subscriptions in the measured run. **It was declined** (see ⚑50), for evidence reasons
  rather than for the exit code alone, but the exit code is the reason it should not be
  done casually later either.
- **What this means for the release notes:** ⚑10 still needs its breaking-change decision
  from Klemens. T19 adds nothing to that list - the defender hint and the Log Analytics
  error code are both message-only changes, no exit code and no payload shape moves.

### ⚑5 update (L9) · `log-analytics` is on the stale pin, and it did not matter this time
- Recorded here rather than by editing ⚑5, per the append-only rule.
- The L8 handoff warned to check the pin before editing `log-analytics`. Measured this hop:
  `packages/log-analytics/package.json` does pin `@mcp-consultant-tools/core` at `33.0.0`,
  while `azure-defender` is on `34.1.0`. **No bump was needed**, because the T19 change
  touches only `LogAnalyticsService`'s own error path and uses nothing from `core`, and the
  package built and tested clean. Recorded so the next hop knows the pin is still there and
  still untested rather than assuming L9 cleared it: the moment a fix in that package needs
  a `core` export, ⚑5's full procedure applies.

---

## Closing hop (L10) · reconciliation and drain

The chain's queue is empty. This hop took no task, wrote no code and chained nothing. It read all
52 items and their 11 appended updates, read every commit from `6729aa0` to `a89ddf0`, checked each
open item against what is on disk rather than against what a hop said, and gave every survivor a
durable home.

### Reconciliation: what a later hop resolved without saying so

The expected failure mode was a hop resolving an item as a side effect and never closing it. It
found almost nothing, which is itself the result: **one item closes, one has advanced, and the other
45 are genuinely open.** Verified on disk this hop:

| Item | Checked | Result |
|---|---|---|
| ⚑2 | `grep -rn "FanOutRecorder\|fanOut.run" packages/*/src` | **Advanced, not closed.** `core` (18 sites), `azure-management` (43), `azure-defender` (3). L1's stated work-list grep now returns two hits and neither is a collection fan-out, so the grep is spent and the remaining scope is unmeasured. |
| ⚑3 | `IntegrationAuditService.ts:822`, `:835`, `:1027`, `:861` | **Still live.** `maxRecords` defaults to 100 and neither `hasMore` nor `truncationReason` is read anywhere in the method. |
| ⚑4 | `MetadataService.ts:293`, `WorkflowService.ts:26`, `FlowService.ts:357`, `FlowService.ts:796`, `docs/KNOWN_ISSUES.md` | **Closed, and the record was wrong.** It named `FlowService.getFlows`, which beta.17 fixed, and missed `FlowService.searchWorkflows` and `FlowService.getFlowRuns` entirely. Four methods carry the pattern. `getFlowRuns` uses `limit + 1` rather than `maxRecords + 1`, so a grep for one spelling misses it, which is how it stayed hidden. `KNOWN_ISSUES.md` corrected. |
| ⚑5 | every `packages/*/package.json` | **Still live, re-measured at 16.** ⚑5's title says 14, L1 said 15, L3 measured 16. Sixteen is the current number. |
| ⚑21 | both log-analytics files | **Still live:** 7 and 8 occurrences. |
| ⚑23 | `PluginService.ts:136` against `:162` and `:209` | **Still live.** The list query omits `description`; the single-assembly query has it. |
| ⚑35 | `find packages/azure-defender/src -name "*.test.ts"` | **Still live.** Nine test files, none under `src/cli/`. |
| ⚑42 | a recursive dash search over `packages/*/src` | **Still live and larger than recorded:** 535 occurrences, not just the `code-review` hints. |
| all | `docs/release-notes/v35.0.0.md` | **Nothing from this chain is in the master release notes.** Nine hops of fixes sit unreleased on `release/35.0`, so every "belongs in the release notes" item is genuinely undrained. |

⚑34 stays `part-closed-by-L6`: half 2 is done, and half 1 is carried in full by ⚑36.

### Where everything went

- **`docs/KNOWN_ISSUES.md`, six new entries:** ⚑3 (capped assembly list), ⚑23 (null assembly
  description), ⚑21 (duplicated investigation KQL), ⚑51 (no retry policy in `log-analytics`), ⚑49
  (the connection-redaction assumption, written as the warning a reader needs before sharing a
  listing), and ⚑42's em-dash residual.
- **The plan file, three new sections:** a **release-notes checklist for the next beta** (⚑10, ⚑12,
  ⚑14, ⚑17, ⚑20, ⚑22, ⚑28, ⚑32, ⚑41, with the four breaking-change candidates separated out); a
  **live-run verification list** (⚑1, ⚑7, ⚑9, ⚑11, ⚑13, ⚑15, ⚑16, ⚑18, ⚑24, ⚑27, ⚑29, ⚑31, ⚑33,
  ⚑35, ⚑36, ⚑37, ⚑40, ⚑43, ⚑45, ⚑48, ⚑49, ⚑50, ⚑52, each reduced to one command and the one field
  to read); and **deferred scope, unscheduled** (⚑2, ⚑3, ⚑19, ⚑21, ⚑23, ⚑30, ⚑38, ⚑44, ⚑46, ⚑47,
  ⚑51).
- **Conventions, four durable homes.** ⚑29's mapper rule went to
  `.claude/refs/adding-features-checklist.md` as a new "Writing a response mapper (hard rule)"
  section, with a pointer bullet in `packages/azure-management/CLAUDE.md` and
  `packages/azure-defender/CLAUDE.md`. **That was the closing hop's choice**: one home that is
  already loaded whenever a service or mapper is written beats three copies that drift, and the
  package pointers are where a package-scoped reader looks. It also covers the request-side half
  (`detailed=true`, per-VM instance view) and the api-version half, neither of which a
  `KNOWN_ISSUES` defect entry could carry. ⚑5's stale-pin procedure went to the root `CLAUDE.md`.
  ⚑25's zsh word-splitting rule went to `.claude/refs/cli-architecture.md`. ⚑35's "no CLI tests
  here" went to `packages/azure-defender/CLAUDE.md`.

### What has no home, stated plainly

**This repo has no task system, so nothing was promoted to a task, and nothing was closed by being
written down.** Every item above except ⚑4 is still `open`: the record moved, the question did not
get answered.

- **Roughly twenty items are one assumption wearing different hats:** no Azure, PowerPlatform or Log
  Analytics credentials on the machine the chain ran on. They are answerable only by running the
  command, which is why they are a list of commands in the plan file rather than twenty questions.
- **⚑42's other half has no repo home at all.** The lesson is that this plan file's stated causes
  were leads rather than facts, four times out of four (T13's scope lead, T14's three causes,
  T16's "already in KNOWN_ISSUES", and the pattern itself). It is not a defect, not a convention
  and not a task, so it stays here and in the work log.
- **Fourteen items need Klemens rather than a hop:** ⚑1, ⚑10, ⚑12, ⚑17, ⚑20, ⚑22, ⚑25, ⚑28, ⚑32,
  ⚑33, ⚑36, ⚑41, ⚑49, ⚑50. Seven were walked with him at the close of this hop; the rest are
  release-notes wording decisions that belong to whoever runs `/product-releasenotes beta`.
