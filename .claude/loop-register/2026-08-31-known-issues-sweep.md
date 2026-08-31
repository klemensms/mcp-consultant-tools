# Carry-forward register - known-issues sweep

Chain started 2026-08-31 from `docs/KNOWN_ISSUES.md`. Origin session closed the teams
truncation entry and published `35.0.0-beta.22`.

Append-only. Close an item by changing its `State`; never rewrite or delete one.

---

### ⚑1 · PII warning is being wired up rather than deleted
- **Kind:** assumption
- **Hop:** origin · d3a49c9
- **State:** open
- **Matters because:** `KNOWN_ISSUES` offered two directions and said not to leave the check half-live. The origin session chose to call `checkEnvironmentLooksUnprotected` at pipeline construction rather than delete it, on the grounds that removing a safety net is the more consequential direction and a stderr warning breaks nothing. Klemens was told the decision in one line and can redirect. If he prefers deletion, the reversal is small and local, and no later hop builds on it.

### ⚑2 · `MCP_ENVIRONMENT_TYPE` stays a dead env var for now
- **Kind:** decision
- **Hop:** origin · d3a49c9
- **State:** open
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
