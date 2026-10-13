# Loop register: delegated decisions (plan docs/plans/2026-10-13-delegated-decisions.md)

Origin: session mcp-consultant-tools-b8, 2026-10-13. Append-only; change State, never delete.

### ⚑1 · Task 7 (sign-in redirect to 127.0.0.1) is blocked on the app registration owner
- **Kind:** deferred
- **Hop:** origin · 9c3ea9b
- **State:** promoted-to-D-020 (docs/outstanding-decisions.md, send decision)
- **Matters because:** switching before the registration lists `http://127.0.0.1` breaks every Dataverse sign-in; the request to the owner must go to the maintainer as a send decision in docs/outstanding-decisions.md first.

### ⚑2 · mcp-local-tester changes (task 6) diverge from the mirrored copy in mcp-computer-use
- **Kind:** deferred
- **Hop:** origin · 9c3ea9b
- **State:** already-recorded-in:CLAUDE.md "Unmirrored divergence, 2026-10-13 - the local tester" (PR #9)
- **Matters because:** the agent file and runner are copied verbatim between repos; until mirrored, the sibling repo keeps the dialog and has no fake-service mode. The copy itself still waits for mcp-computer-use to be checked out. Record it in the root CLAUDE.md "Unmirrored divergence" list when task 6 lands.

### ⚑3 · CI dependency audit fails on the release branch (high advisory on @modelcontextprotocol/sdk up to 1.30.1)
- **Kind:** gotcha
- **Hop:** L1 · 8cbeaa9
- **State:** already-recorded-in:docs/KNOWN_ISSUES.md "High and critical npm audit findings fail CI on every PR" (closing hop)
- **Matters because:** every PR into release/35.0 shows a failing "Dependency Vulnerability Audit" check, so a real new failure would be hidden among them, and the advisory itself ships to users until the SDK is bumped. It predates this chain (fails on 105a68f too). Needs a deliberate SDK bump across the packages, not a fix inside an unrelated task.

### ⚑4 · Task 5 reaches users only with a core version bump and a 9-package repin
- **Kind:** deferred
- **Hop:** L1 · 8cbeaa9
- **State:** already-recorded-in:docs/release-notes/v35.0.0-beta.29.md (release step: core beta.3 and 9 repins)
- **Matters because:** core 35.0.0-beta.2 is already on npm; unless the beta that ships this chain publishes core at a new version and repins the 9 packages that call the version helpers (audit-cli and powerplatform-core also pin core exactly but do not call them): azure-defender, azure-devops, azure-management, code-review, meta, outlook and the three powerplatform packages to it, users still get the old version walk. Recorded as a release step in docs/release-notes/v35.0.0-beta.29.md; whoever cuts the beta must do it.

### ⚑5 · Task 1 not exercised live with valid names
- **Kind:** assumption
- **Hop:** L1 · 6393110
- **State:** already-recorded-in:docs/KNOWN_ISSUES.md "Unverified: name and ID checks against a live environment with real names" (closing hop; resolves on a live run, not a maintainer call)
- **Matters because:** no Dataverse credentials on this machine, so valid-name requests were proven by unit tests and the fake only. If a real table, column or option set name in some environment fails the plain-name pattern, that tool refuses it. The fake-service mode (task 6) now covers the request shape; a live check against the safe test environment would close it.

### ⚑6 · The teams server still keeps its sign-in in the old encrypted file
- **Kind:** deferred
- **Hop:** L2 · task 2
- **State:** already-recorded-in:docs/KNOWN_ISSUES.md "The teams server still keeps its sign-in in a file with a machine-derived key" (closing hop)
- **Matters because:** `packages/teams/src/auth/token-cache.ts` has the same machine-derived key as the cache task 2 replaced, so a copied file can be decrypted. It runs msal-node 2.x, which `@azure/msal-node-extensions` 1.5.x does not support; moving it needs a teams msal-node upgrade first, or a switch to the `m365-core` helper.

### ⚑7 · core's 1Password secret cache uses the same derivable key
- **Kind:** finding
- **Hop:** L2 · task 2
- **State:** promoted-to-D-021 (docs/outstanding-decisions.md). Correction: the key is not derived; it is a random key in `secrets.key` beside the cache, so copying the folder is enough
- **Matters because:** `packages/core/src/helpers/secret-resolver.ts` caches resolved secrets in `secrets.enc` with a per-machine key, the design item 9 replaced for tokens. Not in the delegated scope; needs its own decision before anyone treats that cache as protected.

### ⚑8 · Task 2 reaches users only with new powerplatform-core and m365-core versions and five repins
- **Kind:** deferred
- **Hop:** L2 · task 2
- **State:** already-recorded-in:docs/release-notes/v35.0.0-beta.29.md (release step: powerplatform-core and m365-core plus 5 repins)
- **Matters because:** `powerplatform`, `powerplatform-customization`, `powerplatform-data` pin `powerplatform-core` 35.0.0-beta.9 and `outlook`, `sharepoint` pin `m365-core` 35.0.0-beta.2 exactly; without new versions and repins the old file cache keeps shipping. Recorded as a release step in docs/release-notes/v35.0.0-beta.29.md.

### ⚑9 · Silent sign-in remembers the last account only within a server session
- **Kind:** deferred
- **Hop:** L2 · 8cc197f
- **State:** already-recorded-in:docs/KNOWN_ISSUES.md "A restarted PowerPlatform server forgets which account was used last" (closing hop)
- **Matters because:** with two accounts in the PowerPlatform token cache, a restarted server starts from the first cached account, not the one used last. Fixing it means storing the last account's homeAccountId beside the keychain cache; not in task 3's scope.

### ⚑10 · get-lookup-target's binding-lookup warning has no automated test
- **Kind:** gotcha
- **Hop:** L2 · 8cc197f
- **State:** closed-by-L3 - fake Dataverse answers 403 for contact lookup `new_restrictedaccountid`, so fake-mode get-lookup-target runs the warning branch (0cea2e3); the assertion is by reading the output, the runner has no expected-text check
- **Matters because:** the fake always answers ManyToOneRelationships and powerplatform-data has no unit tests, so the new warning branch (binding lookup failed, metadata read) never runs in a test. Add a fake 503 for one named entity, or a stubbed-service unit test.


### ⚑11 · An unfiltered live count that times out on a very large table has no fallback
- **Kind:** decision
- **Hop:** L3 · 0cea2e3
- **State:** already-recorded-in:docs/release-notes/v35.0.0-beta.29.md "Not verified" (closing hop; deliberate design, for the record only)
- **Matters because:** before PR #13 an unfiltered count came from the stored snapshot at once; now a table large enough for Dataverse to time out (SQL timeout or the 2-minute client timeout) before its 50,000 refusal returns an error. Chosen deliberately, so a generic error never silently becomes a stale number; listed under "Not verified" in beta.29. Revisit if it is seen live.
