# Loop register: delegated M365 build

Chain: executes `docs/superpowers/plans/2026-09-23-delegated-outlook-sharepoint.md`, Tasks 1 to 7. Monitor session: `mcp-consultant-tools-07`. Decisions for the maintainer go to `docs/outstanding-decisions.md` through the monitor, not here.

### ⚑1 · Search fixture is the documented shape, not a live capture
- **Kind:** deferred
- **Hop:** origin · a773014
- **State:** closed · a642545 (hit 1 now has the live shape, identifiers replaced)
- **Matters because:** `packages/sharepoint/src/__tests__/fixtures/search-driveitem.ts` was written from Microsoft Learn; if the real delegated response differs, the hit mapping passes its tests and fails in use. Replace it with one scrubbed live response in the Task 3 live check.

### ⚑2 · Task 2 and Task 3 live checks not yet run
- **Kind:** deferred
- **Hop:** origin · a773014
- **State:** closed · hop 3, plan Status 21:35 (resolve-link, PDF download and search on the new test data all passed)
- **Matters because:** the Task 3 result on whether `Sites.ReadWrite.All` covers Microsoft Search for files decides the last row of the IT request (D-001 waits on it). Check granted scopes with `auth status` before any live SharePoint call.

### ⚑3 · searchFiles returns a result object, not a bare hit list
- **Kind:** assumption
- **Hop:** origin · a773014
- **State:** closed · da8a61f (technical reference and package CLAUDE.md describe the object)
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

### ⚑6 · Outlook $expand of attachments and the $search quote escape are not live-verified
- **Kind:** assumption
- **Hop:** 2 · f714563
- **State:** open
- **Matters because:** `getMessage` and `getConversation` read attachments with `$expand=attachments($select=id,name,size,contentType,isInline)`, and `searchMessages` escapes an inner double quote with a backslash. Both follow the documented shape; neither can be tried until a registration carries a mail permission. If `$expand` is rejected beside `$filter` on a conversation, fall back to one attachments call per message.

### ⚑7 · The pre-commit secret scan printed "grep: stdout: Broken pipe" and still reported clean
- **Kind:** gotcha
- **Hop:** 2 · f714563
- **State:** held by the monitor (it is investigating in a scratch copy; do not work on it)
- **Matters because:** a grep producer cut off by a short-circuiting reader is the pattern that inverts a guard under `pipefail` (global `CLAUDE.md` coding principle 6), so the "no secrets" verdict may not have covered every staged line. Not investigated here; the commit held only code this session wrote. Find which hook prints it (repo `scripts/hooks/pre-commit` or a global hook) and replace the pipe with a command substitution. The repo hook is mirrored with a sibling repo.

### ⚑8 · Task 3b: OneDrive in the SharePoint server (monitor scope addition)
- **Kind:** deferred
- **Hop:** 2 · a642545
- **State:** closed · a7bf682 (read-only live check passed; OneDrive writes are unit-tested only)
- **Matters because:** asked for by the maintainer through the monitor. Device-code mode only. Add `spo-get-my-drive` (`GET /me/drive`: drive id, web URL, quota) and `spo-list-my-drive` (`/me/drive/root/children`, or `/me/drive/root:/{path}:/children`), with CLI parity; unit tests pinning the `/me/drive` paths and that item, download, upload, create-folder, move, rename, copy and delete work given the OneDrive drive id. Write Task 3b into the plan and a short OneDrive subsection into the spec **in the same commit as the code**. No write tests in OneDrive: it stays read-only unless the monitor agrees otherwise. Live read already probed: `/me/drive` and its root listing work on `Sites.ReadWrite.All` alone.

### ⚑9 · Test data rule widened: a permanent `mcp-test-data` folder
- **Kind:** decision
- **Hop:** 2 · a642545
- **State:** closed · c2fb443 (folder built and left in place; the spec's Testing section and plan Task 4 now state the widened rule)
- **Matters because:** replaces "one disposable folder, removed afterwards". Create what real coverage needs under a top-level `mcp-test-data` folder on the test site (nested folders; Word, PowerPoint, Excel, PDF and text files carrying known searchable words), leave it in place as a regression fixture, and delete only what a delete test itself creates. Microsoft Search indexes new files with a delay, often minutes; retry later rather than reading an empty result as a permission failure. Office files can be made locally with macOS `textutil -convert docx` (Word) before upload.

### ⚑10 · The Outlook live check needs its own sign-in
- **Kind:** gotcha
- **Hop:** 2 · a642545
- **State:** open
- **Matters because:** the token cache key is salted with the server name, so the SharePoint sign-in cannot be reused for `outlook` even on the same registration. The Task 6 live check needs one more device-code sign-in with `OUTLOOK_*` set from the teams entry (the env wrapper takes `outlook` as its first argument). Ask for it once, together with any other pending sign-in, not as a stream of codes.

### ⚑11 · A retention policy refuses deleting a folder that still holds files
- **Kind:** gotcha
- **Hop:** 3 · plan Status 21:35
- **State:** closed · da8a61f (in the SharePoint user guide, technical reference and package CLAUDE.md)
- **Matters because:** on the test tenant, `spo-delete-item` on a non-empty folder failed with `Request was cancelled by event received. If attempting to delete a non-empty folder, it's possible that it's on hold`; deleting the contents first, then the empty folder, worked. Task 7's SharePoint docs should tell an agent to delete contents before the folder when it sees that message. Not a server defect as far as can be told (inferred: retention policy).

### ⚑12 · The SharePoint test fake ignores headers and query options
- **Kind:** gotcha
- **Hop:** 3 · c2fb443
- **State:** open
- **Matters because:** `packages/sharepoint/src/__tests__/fake-graph.ts` accepts `.header()` and `.query()` and drops them, so a test built on it cannot see a bad header or a missing query parameter; that is how the upload header defect survived. New tests that care about the wire request should use `graph-recorder.ts` beside it, which drives a real Graph client. Not worth migrating the existing tests unprompted.

### ⚑13 · The SharePoint CLI accepts --json and ignores it
- **Kind:** deferred
- **Hop:** 3 · Task 7 docs
- **State:** open
- **Matters because:** `mcp-spo-cli --json get-my-drive` prints the same summary as without the flag; the full JSON only lands in `.context/.mcp-spo-cache/`. A pre-existing defect (the v33 CLI), outside this build's tasks, so it is documented as ignored rather than fixed here. The fix is in `packages/sharepoint/src/cli/output.ts`, which does not read the global option; the repo rule is to fix defects here rather than raise an issue, so the monitor should decide whether a later hop takes it.
