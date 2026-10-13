# Plan: build the technical decisions delegated on 2026-10-13

The maintainer delegated the technical decisions from the Dynamics review and the tester-agent comparison. Each task below is one pull request: build, unit tests, the local MCP test against the safe test environment, an independent critical review by a separate agent, fix what it finds, then merge into `release/35.0`. Publish in the next beta once a group of tasks is merged.

Source of each decision: [`../reviews/2026-10-06-dynamics-review-findings.md`](../reviews/2026-10-06-dynamics-review-findings.md) (Status line and "Second review").

| # | Task | Packages | Status |
|---|------|----------|--------|
| 0 | Teams reactions review fixes: cap and pace the `/users` name lookups (about 5 at a time, about 50 per read, skipped ones logged to stderr), seed names only from authors with a real name, locale-proof the formatter test, tests for delta, app reactors and a null author name, drop or enforce the "oldest first" claim | `teams` | done (PR #6, 105a68f) |
| 1 | Names and IDs checked before they reach a request address (item 1, option A): data and metadata tools only; plain names, GUID record IDs, row limit a whole number of 1 or more, 0 keeps meaning "everything" where it does today | `powerplatform-core`, `powerplatform`, `powerplatform-data` | done (PR #7, 6393110) |
| 2 | Token cache in the OS keychain, memory-only fallback (item 9, option A); everyone signs in once after upgrading, say so in the release notes | `powerplatform-core` (and any other package using the same cache helper) | to do |
| 3 | Second review items 1 to 5: full sign-in address printed, wait on when the browser fails to open, one-step free port, sign-in code redeemed once; silent sign-in uses the last account; many-to-many count join key; lookup failures reported as themselves and not cached; UK number formatting and a 2-minute request timeout | `powerplatform-core` | to do |
| 4 | Unfiltered counts live by default; at the 50,000 live limit fall back to the snapshot labelled "whole table, not limited to your access, up to 24 hours old" (replaces second review item 6's label); in-memory token fallback from item 6 still applies | `powerplatform-core`, `powerplatform`, `powerplatform-data` | to do |
| 5 | Version helper in `core` uses the package's own version | `core` | done (PR #8) |
| 6 | `mcp-local-tester` agent: PASS or FAIL as text, no dialog; fake-service mode as the default, live test environment chosen per run; Dataverse servers first. Mirror to `mcp-computer-use` when it is checked out | `.claude/agents`, `.claude/templates` | to do |
| 7 | Sign-in redirect to `127.0.0.1`: blocked until the app registration lists it; the request to its owner goes to the maintainer as a send decision before anything is sent | `powerplatform-core` | blocked |
