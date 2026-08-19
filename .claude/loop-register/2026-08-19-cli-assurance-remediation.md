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
