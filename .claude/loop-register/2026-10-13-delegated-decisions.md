# Loop register: delegated decisions (plan docs/plans/2026-10-13-delegated-decisions.md)

Origin: session mcp-consultant-tools-b8, 2026-10-13. Append-only; change State, never delete.

### ⚑1 · Task 7 (sign-in redirect to 127.0.0.1) is blocked on the app registration owner
- **Kind:** deferred
- **Hop:** origin · 9c3ea9b
- **State:** open
- **Matters because:** switching before the registration lists `http://127.0.0.1` breaks every Dataverse sign-in; the request to the owner must go to the maintainer as a send decision in docs/outstanding-decisions.md first.

### ⚑2 · mcp-local-tester changes (task 6) diverge from the mirrored copy in mcp-computer-use
- **Kind:** deferred
- **Hop:** origin · 9c3ea9b
- **State:** already-recorded-in:CLAUDE.md "Unmirrored divergence, 2026-10-13 - the local tester" (PR #9); the copy itself still waits for mcp-computer-use to be checked out
- **Matters because:** the agent file and runner are copied verbatim between repos; until mirrored, the sibling repo keeps the dialog and has no fake-service mode. Record it in the root CLAUDE.md "Unmirrored divergence" list when task 6 lands.

### ⚑3 · CI dependency audit fails on the release branch (high advisory on @modelcontextprotocol/sdk up to 1.30.1)
- **Kind:** gotcha
- **Hop:** L1 · 8cbeaa9
- **State:** open
- **Matters because:** every PR into release/35.0 shows a failing "Dependency Vulnerability Audit" check, so a real new failure would be hidden among them, and the advisory itself ships to users until the SDK is bumped. It predates this chain (fails on 105a68f too). Needs a deliberate SDK bump across the packages, not a fix inside an unrelated task.

### ⚑4 · Task 5 reaches users only with a core version bump and a 9-package repin
- **Kind:** deferred
- **Hop:** L1 · 8cbeaa9
- **State:** open
- **Matters because:** core 35.0.0-beta.2 is already on npm; unless the beta that ships this chain publishes core at a new version and repins azure-defender, azure-devops, azure-management, code-review, meta, outlook and the three powerplatform packages to it, users still get the old version walk. Recorded as a release step in docs/release-notes/v35.0.0-beta.29.md; whoever cuts the beta must do it.

### ⚑5 · Task 1 not exercised live with valid names
- **Kind:** assumption
- **Hop:** L1 · 6393110
- **State:** open
- **Matters because:** no Dataverse credentials on this machine, so valid-name requests were proven by unit tests and the fake only. If a real table, column or option set name in some environment fails the plain-name pattern, that tool refuses it. The fake-service mode (task 6) now covers the request shape; a live check against the safe test environment would close it.

