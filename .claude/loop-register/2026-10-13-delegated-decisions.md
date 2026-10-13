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
- **State:** open
- **Matters because:** the agent file and runner are copied verbatim between repos; until mirrored, the sibling repo keeps the dialog and has no fake-service mode. Record it in the root CLAUDE.md "Unmirrored divergence" list when task 6 lands.
