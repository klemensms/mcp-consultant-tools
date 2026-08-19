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
