# Carry-forward register - known-issues sweep

Chain started 2026-08-31 from `docs/KNOWN_ISSUES.md`. Origin session closed the teams
truncation entry and published `35.0.0-beta.22`.

Append-only. Close an item by changing its `State`; never rewrite or delete one.

---

### ⚑1 · PII warning is being wired up rather than deleted
- **Kind:** assumption
- **Hop:** origin · d3a49c9
- **State:** implemented in hop 1; still open for Klemens to redirect
- **Outcome (hop 1):** `createPiiPipelineFromEnv` now honours `options.environmentIdentifier` and calls `checkEnvironmentLooksUnprotected` at construction. Confirmed live in the built `azure-devops` CLI: warns on identifier `contoso`, silent on `contoso-dev`, silent with `PII_PROTECTION=true`. The function was not deleted. Reversing to deletion is still small and local; nothing built on top of it.
- **Matters because:** `KNOWN_ISSUES` offered two directions and said not to leave the check half-live. The origin session chose to call `checkEnvironmentLooksUnprotected` at pipeline construction rather than delete it, on the grounds that removing a safety net is the more consequential direction and a stderr warning breaks nothing. Klemens was told the decision in one line and can redirect. If he prefers deletion, the reversal is small and local, and no later hop builds on it.

### ⚑2 · `MCP_ENVIRONMENT_TYPE` stays a dead env var for now
- **Kind:** decision
- **Hop:** origin · d3a49c9
- **State:** open, but no longer advertised anywhere
- **Outcome (hop 1):** the variable is still read by nothing. What changed is that it no longer *claims* to do something: it was removed from the warning's message string, and eleven docs that said it "feeds the looks unprotected warning" were corrected to say it is inert. The remaining decision is unchanged - wire it as a real control, or delete it and its documentation entirely. Until then the toolkit still ships a documented env var that does nothing, it just no longer tells operators to set it.
- **Matters because:** wiring ⚑1 up leaves the env var still read by nothing. Turning it into a real control would be a new configuration contract and a possible breaking change, so it was deliberately left out of scope. Until it is either wired or removed, the toolkit ships a documented env var that does nothing, which is the exact false-affordance class this register's parent file exists to track.

### ⚑3 · `list-api-connections` redaction is a trade-off, not a patch
- **Kind:** decision
- **Hop:** origin · d3a49c9
- **State:** open
- **Matters because:** the entry cannot be verified without a live subscription holding a SQL or Office 365 connection, which this chain does not have. Two choices: harden now by redacting both parameter maps by default, losing readable non-secret values for everyone, or wait for evidence and keep a documented warning. The CLI caches the payload to disk, so a wrong answer here writes a credential to a file. Klemens's call.

### ⚑4 · The two azure-defender entries need a live tenant run, not code
- **Kind:** deferred
- **Hop:** origin · d3a49c9
- **State:** open
- **Matters because:** both were deliberately excluded from this chain. One needs `defender-list-plans` run per subscription to read `summary.cspmEnabled`; the other needs `defender-diagnose-metadata-fields` against a real tenant, expecting a 403 at tenant scope. Neither is a code change and neither can be closed by any hop here. They stay open in `KNOWN_ISSUES.md` and the entries say plainly not to report them as fixed.

### ⚑5 · Teams cannot send or fetch a file, and closing it needs a consented scope
- **Kind:** decision
- **Hop:** origin · d3a49c9
- **State:** open
- **Matters because:** written up as a new `KNOWN_ISSUES` entry. The download half is small - Graph resolves a sharing URL through `/shares/` with no site or drive lookup - but it needs `Files.Read.All`, and an unconsented scope fails at sign-in and takes all 26 tools down rather than one. So it cannot be built speculatively: admin consent has to come first. Sending a file is larger and separate.

### ⚑6 · Channel message delete was not retested
- **Kind:** gotcha
- **Hop:** origin · d3a49c9
- **State:** open
- **Matters because:** chat delete returned 403 on 2026-08-20 and succeeded on 2026-08-31, so the tenant messaging policy changed in between. The channel surface was not retested, because it would have meant posting a throwaway message to a real channel. `packages/teams/CLAUDE.md` now records it as unknown rather than blocked. Anyone who reads it as blocked will skip a capability that may work.

### ⚑7 · The core fix reaches only two of its five callers, and that is measured
- **Kind:** gotcha
- **Hop:** 1 · known-issues sweep
- **State:** open
- **Matters because:** `createPiiPipelineFromEnv` has five callers. `azure-devops` and `powerplatform-data` pin `core` at the workspace version and get the new warning. `azure-b2c` and `azure-sql` pin `33.0.0` and `rest-api` pins `34.1.0`, so all three resolve an old published `core` and get nothing - locally and on an end user's machine. Proven by running both built CLIs with identical inputs: `azure-devops` warned, `azure-sql` did not. Eighteen packages are stale in total, so this is not specific to the PII fix; every `core` change lands the same way. Written up as its own `KNOWN_ISSUES` entry and the counts in the root `CLAUDE.md` were corrected (they said 16 at `33.0.0` against a `34.1.0` workspace). Deliberately not fixed here: an eighteen-package, two-major bump is release-shaped.

### ⚑8 · The CLI env-file question is answered, and the answer is worse than recorded
- **Kind:** decision
- **Hop:** 1 · known-issues sweep
- **State:** closed-by-L1
- **Outcome (hop 1):** fixed in the same session that found it, ahead of its queue position, because the misfiring warning was this hop's own doing. All six factories (`azure-devops`, `azure-sql` x2, `rest-api`, `azure-b2c` x2) now build the PII pipeline through a memoised thunk instead of an eager `const`, so nothing reads PII env until a service is first used, which on the CLI is inside an action handler and therefore after `preAction`. No signature changed: every use site was already inside a lazy getter. Verified against the compiled output, not only the source: a script reproducing `cli.ts`'s module order shows silence at construction, silence when `PII_PROTECTION` is set after construction, and the warning when protection is genuinely off. `docs/KNOWN_ISSUES.md` entry removed. **One behavioural change to note:** the warning now fires on first service use rather than at process start, so it appears at the first tool call rather than at server boot. Same stream, slightly later, and closer to the moment data would actually flow.
- **Matters because:** queue item 3 was recorded as unverified with the note that the stated mechanism was wrong. It is now confirmed, and the original mechanism was right after all. All four CLIs (`azure-sql`, `azure-devops`, `rest-api`, `azure-b2c`) run `const ctx = createServiceContext();` at module top level, one line above `program.parseAsync`, so it executes before Commander can run the `preAction` hook that calls `loadEnvAndResolve`. Anything supplied only via `--env-file` is invisible to the PII pipeline. The earlier rebuttal looked at `context-factory.ts`, which is indeed an exported function, and missed that `cli.ts` calls it at import. The `KNOWN_ISSUES` entry has been rewritten as confirmed with the fix sketch. **This interacts with ⚑1:** on the CLI path the new warning is evaluated against unloaded env, so a run whose `--env-file` sets `PII_PROTECTION=true` still warns. The warning is wrong there until the lazy-context fix lands, which makes item 3 a higher priority than its queue position suggests.

### ⚑9 · `buildTruncation` cannot express a client-side cap, and the X2 sweep will hit this
- **Kind:** gotcha
- **Hop:** 1 · known-issues sweep
- **State:** closed-by-L2
- **Outcome (hop 2):** the warning was right and the answer turned out to be that `buildTruncation`
  should not be used at those sites at all. Five of the six the entry sent to it are not caps: they
  are a whole analysis crashing and returning its empty accumulator, so the helper would have had to
  write `hasMore: true` and `truncationReason: 'requestedMax'`, both false. No `totalAvailable`
  workaround was needed because no truncation block was built. The sixth (`BlobService.ts:298`) is a
  genuine undeclared partial and is still open, blocked by ⚑12. The general rule is now in
  `packages/powerplatform-core/CLAUDE.md` as a three-row table, so it is not register-only.
- **Matters because:** `buildTruncation` sets `totalAvailable: hasMore ? null : returnedCount`, which is right for a paged read that genuinely cannot know the population and wrong for a cap applied client-side *after* an enumeration has finished, where the total is a count you already hold. `ValidationService` needed the built block spread and `totalAvailable` set from the counted value, or its report would have said "2 of unknown" when it could say "2 of 5". **The next hop's X2 sweep sends six sites to `buildTruncation`;** any of those that cap client-side needs the same treatment, and taking the helper's output unmodified will silently discard a known total. Recorded in `packages/powerplatform-core/CLAUDE.md` beside the paging rules, so it is not register-only. The alternative - adding an optional `totalAvailable` to `buildTruncation` itself - was not taken, because it is a `core` API change and ⚑7 means it would not reach the eighteen stale-pinned packages anyway.

### ⚑10 · An unrelated `CLAUDE.md` edit was swept into commit 023dd49
- **Kind:** gotcha
- **Hop:** 1 · known-issues sweep
- **State:** open
- **Matters because:** a "Reporting defects and ideas" section (never raise a GitHub issue against this repo) appeared in the root `CLAUDE.md` mid-session, written by something other than this hop, and `git add -A` carried it into the ValidationService commit. Nothing is lost and the content looks deliberate, so it was not reverted - but the commit message does not mention it, so anyone reading that commit's diff will find a change the message does not explain. Flagged rather than fixed: rewriting a pushed-to-branch commit to tidy it is worse than a one-line note. Later hops in this chain should expect concurrent edits to shared files and prefer staging explicit paths over `git add -A`.

### ⚑11 · A `KNOWN_ISSUES` entry's own prescription was wrong, and reading beat it again
- **Kind:** gotcha
- **Hop:** 2 · known-issues sweep
- **State:** open
- **Matters because:** the X2 entry named eleven sites and told the next hop which helper each
  needed. On reading them, five of the six sent to `buildTruncation` were misclassified - not caps
  at all - and following the sweep's prescription would have written false fields into the payloads
  of the contract that exists to prevent exactly that. This is the second time in this chain that
  reading the code contradicted the register of the code: hop 1 found `ValidationService` by reading
  around a site rather than trusting the sweep, and hop 2 found the real NuGet swallow two frames
  below the site the sweep named. **A `KNOWN_ISSUES` entry is a lead, not a specification.** Its own
  fix line is the least reliable part of it, because it was written from the sweep output rather
  than from the code. The entry has been rewritten to carry the correction rather than the wrong
  advice, and the three-shapes rule is in `packages/powerplatform-core/CLAUDE.md`.

### ⚑12 · Five fan-out sites are blocked by the stale `core` pin, and the block is now measured
- **Kind:** deferred
- **Hop:** 2 · known-issues sweep
- **State:** open
- **Matters because:** `azure-sql`, `azure-storage` and `service-bus` pin `@mcp-consultant-tools/core`
  at `33.0.0`, which predates both `FanOutRecorder` and `buildTruncation`. A probe importing
  `FanOutRecorder` into `azure-sql` fails with `TS2305: Module '"@mcp-consultant-tools/core"' has no
  exported member 'FanOutRecorder'`, so the failure mode here is a loud build break rather than the
  silent runtime divergence ⚑7 measured for a *changed* `core` behaviour. That distinction is worth
  keeping: adding a new `core` export to a stale-pinned package fails at build; changing an existing
  one passes the build and diverges at runtime. Four `FanOutRecorder` sites and one `buildTruncation`
  site stay open until the pin bump tracked in `KNOWN_ISSUES` happens. The bump was deliberately not
  pulled into this fix - eighteen packages across two majors is release-shaped.

### ⚑13 · `powerplatform-data` ships no test harness, so one fix has no unit test
- **Kind:** gotcha
- **Hop:** 2 · known-issues sweep
- **State:** open
- **Matters because:** the package has no `test` script and no `vitest.config.ts`, and its tool
  handlers are inline closures inside `server.tool(...)` registrations, so nothing in it is testable
  without both adding the harness and extracting the handlers. The `get-lookup-target` fix
  (a guessed `EntitySetName` printed into a copy-paste `@odata.bind` URL as if it had been read) is
  therefore verified by driving the compiled handler with a stub server and a stub client, not by a
  unit test. That probe did confirm both branches. Anyone changing this package should know its
  `npm test` runs nothing, which is a quieter version of the "green suite proves little" gotcha:
  here there is no suite at all. Adding vitest to it is a small, separate, worthwhile change.

### ⚑14 · The fan-out sweep now reports 24 candidates, not 23
- **Kind:** gotcha
- **Hop:** 2 · known-issues sweep
- **State:** closed-by-L2
- **Outcome (hop 2):** the new one is `teams/src/message-content.ts:226`, `describeQuotedReply`'s
  `JSON.parse` catch. Read and classified as **not a defect**: it still emits the `[quoted reply]`
  marker, so the reader is told a quote was there, which is the part whose absence misleads. Added
  to the entry's not-a-defect list with that reasoning, so the next hop does not re-read it. Worth
  noting that the candidate list drifts between hops as unrelated code lands - regenerate it rather
  than working from the entry's numbers, which is what the entry already says to do.
