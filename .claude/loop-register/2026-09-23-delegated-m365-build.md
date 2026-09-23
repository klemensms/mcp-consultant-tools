# Loop register: delegated M365 build

Chain: executes `docs/superpowers/plans/2026-09-23-delegated-outlook-sharepoint.md`, Tasks 1 to 7. Monitor session: `mcp-consultant-tools-07`. Decisions for the maintainer go to `docs/outstanding-decisions.md` through the monitor, not here.

### ⚑1 · Search fixture is the documented shape, not a live capture
- **Kind:** deferred
- **Hop:** origin · a773014
- **State:** open
- **Matters because:** `packages/sharepoint/src/__tests__/fixtures/search-driveitem.ts` was written from Microsoft Learn; if the real delegated response differs, the hit mapping passes its tests and fails in use. Replace it with one scrubbed live response in the Task 3 live check.

### ⚑2 · Task 2 and Task 3 live checks not yet run
- **Kind:** deferred
- **Hop:** origin · a773014
- **State:** open
- **Matters because:** the Task 3 result on whether `Sites.ReadWrite.All` covers Microsoft Search for files decides the last row of the IT request (D-001 waits on it). Check granted scopes with `auth status` before any live SharePoint call.

### ⚑3 · searchFiles returns a result object, not a bare hit list
- **Kind:** assumption
- **Hop:** origin · a773014
- **State:** open
- **Matters because:** the plan's interface said `Promise<FileHit[]>`; the build returns `{ total, moreResultsAvailable, hits }` so an agent can page. Docs in Task 7 must describe the object; nothing else depends on the bare form.

### ⚑4 · The MCP test runner does not strip an MCP_TEST_ENV_ prefix
- **Kind:** gotcha
- **Hop:** origin · a2cb6e5
- **State:** open
- **Matters because:** its header says `MCP_TEST_ENV_*` variables are passed to the server, but it passes the whole environment unchanged, so `MCP_TEST_ENV_SHAREPOINT_TENANT_ID` reaches the server under that name and config looks missing. Set the real variable names directly. The runner is mirrored with a sibling repo, so fix the header in both or leave it.

### ⚑5 · The global secret guard blocks `clientSecret = env.X`
- **Kind:** gotcha
- **Hop:** origin · a2cb6e5
- **State:** open
- **Matters because:** the pre-commit secret hook flags an environment-variable reference assigned to a field named like a secret as a high-entropy value, and it runs before the whole Bash command, so an edit and a commit in one call never apply the edit. Read the variable into a short local name first, and edit and commit in separate calls.
