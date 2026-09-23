# m365-core (internal library)

Shared delegated (sign in as the user) Microsoft Graph plumbing for the `sharepoint` (device-code mode) and `outlook` servers. No binaries, no MCP tools of its own.

## What lives here

| File | Purpose |
|---|---|
| `src/delegated-auth.ts` | `DelegatedGraphAuth`: device-code start with background completion, silent refresh, status, logout, access-token getter, Graph client factory. |
| `src/token-cache.ts` | `TokenCache`: AES-256-GCM encrypted MSAL cache plugin, mode 0600, at `~/.mcp-consultant-tools/{server}-token-cache-{clientId}.enc`. |
| `src/token-scopes.ts` | `decodeTokenScopes`: reads the `scp` claim for display. Never verifies the token, never used for an access decision. |
| `src/switches.ts` | `isEnabled` / `requireEnabled`: off-by-default switches; only the exact string `true` enables. |
| `src/downloads.ts` | `saveToDownloadDir`, `resolveDownloadDir`: one download folder per server (mode 0700), sanitised file names that cannot escape it, and `name (1).ext` instead of overwriting. |

## Rules

- **Scope is always `https://graph.microsoft.com/.default`.** Entra issues whatever the registration has admin consent for, so an ungranted permission breaks only the tools that need it. A hand-written scope list fails sign-in for the whole server when one scope is not consented (see `packages/teams/CLAUDE.md` § Scope Boundary).
- **One cache file per server.** The file prefix is the server name and is also in the key salt, so two servers on the same app registration never read or overwrite each other's cache.
- **The CLI and the MCP server share the cache file**, so `auth login` on the CLI signs in the MCP server too.
- **Why a separate package:** `core` has no MSAL dependency and must not gain one, the same reasoning as `powerplatform-core`.
- **Teams is not on this package.** `packages/teams` keeps its own copy of this logic; migrating it is out of scope until decided.
- Stderr only. No `console.log`.

## Testing

`npm test --workspace=packages/m365-core`. `delegated-auth.test.ts` replaces `PublicClientApplication` with a fake through `vi.mock` and keeps the real `InteractionRequiredAuthError`, so the expired-refresh path is exercised with the real error class.
