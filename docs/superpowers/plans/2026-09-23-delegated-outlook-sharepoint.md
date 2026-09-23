# Delegated Outlook and SharePoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is specified by files, interfaces and test cases; expand it into write-test, see-it-fail, implement, see-it-pass, commit, in that order.

**Goal:** Sign-in-as-me (device code) access to Outlook mail through a new `outlook` server, and to SharePoint documents through the existing `sharepoint` server, with every non-read capability behind an off-by-default switch.

**Architecture:** A new internal package `m365-core` holds the encrypted MSAL token cache and the device-code flow. The existing `sharepoint` package picks app-only or device-code auth from whether a client secret is configured, and gains cross-site read tools. A new `outlook` package follows the repo's service / tool / CLI layering on top of `m365-core`.

**Tech Stack:** TypeScript (ES2022, Node16 modules, strict), `@azure/msal-node` ^3, `@microsoft/microsoft-graph-client` ^3, `@modelcontextprotocol/sdk`, `commander`, `zod`, `vitest`; `marked` + `dompurify` + `jsdom` for mail bodies.

**Spec:** `docs/superpowers/specs/2026-09-23-delegated-outlook-sharepoint-design.md`. Read it first; it is the authority on behaviour.

**Outstanding decisions file:** `docs/outstanding-decisions.md`. Any decision for the user is appended there before it is asked.

## Global Constraints

- Public repo. Never write a real tenant id, client id, site URL, host name, person or company name into any tracked file, test, fixture or commit message. Use the sanctioned placeholders in the root `CLAUDE.md` § Public Repo Hygiene (`contoso.sharepoint.com`, `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`, `jdoe@example.com`). Real test targets live only in the untracked `.claude/briefs/delegated-m365-test-targets.local`.
- No `console.log` anywhere in `src/`. Stderr only.
- Stage explicit paths, never `git add -A`. Read `git diff --cached --name-status` before every commit. Never stage `.claude/log.md`.
- Pin `@mcp-consultant-tools/core` in new packages to the workspace version (read it from `packages/core/package.json`), not the stale `33.0.0` other packages carry.
- Scope requested by every device-code flow: `["https://graph.microsoft.com/.default"]`. Never a hand-written scope list.
- Token cache path: `~/.mcp-consultant-tools/{server}-token-cache-{clientId}.enc`, mode 0600, `{server}` is `sharepoint` or `outlook`.
- Switch variables: `SHAREPOINT_ENABLE_WRITE`, `SHAREPOINT_ENABLE_DELETE`, `OUTLOOK_ENABLE_WRITE`, `OUTLOOK_ENABLE_SEND`, `OUTLOOK_ENABLE_DELETE`. Only the exact string `true` enables. A disabled tool stays registered and throws `"<Capability> is disabled. Set <VAR>=true to enable."`
- SharePoint app-only (client secret) behaviour must not change. Teams is not touched.
- Every MCP tool gets a CLI command. CLI and MCP share the token cache file.
- No npm publish. Local build and local test only.

## File map

| Path | Responsibility |
|---|---|
| `packages/m365-core/package.json`, `tsconfig.json`, `vitest.config.ts`, `CLAUDE.md` | New internal package, no binaries. |
| `packages/m365-core/src/token-cache.ts` | Encrypted MSAL `ICachePlugin`, ported from `packages/teams/src/auth/token-cache.ts`, filename prefix as a constructor argument. |
| `packages/m365-core/src/delegated-auth.ts` | `DelegatedGraphAuth`: device-code start and background completion, silent refresh, status, logout, access-token getter, Graph client factory. |
| `packages/m365-core/src/token-scopes.ts` | Decode the `scp` claim from an access token without verifying it (display only). |
| `packages/m365-core/src/switches.ts` | `isEnabled(varName)` and `requireEnabled(varName, capability)`. |
| `packages/m365-core/src/index.ts` | Public exports. |
| `packages/sharepoint/src/services/sharepoint-service.ts` | Auth-mode branch; site resolution accepts a URL. |
| `packages/sharepoint/src/services/discovery-service.ts` | New: search files, resolve link, find sites, recent, shared with me. |
| `packages/sharepoint/src/tools/auth-tools.ts`, `discovery-tools.ts` | New thin MCP wrappers. |
| `packages/sharepoint/src/cli/commands/auth-commands.ts`, `discovery-commands.ts` | New thin CLI wrappers. |
| `packages/outlook/...` | New package, laid out like `packages/teams/`: `services/mail-read-service.ts`, `services/mail-write-service.ts`, `services/mail-send-service.ts`, `mail-content.ts`, `local-file-guard.ts`, `download.ts`, `tools/*.ts`, `cli/commands/*.ts`, `context-factory.ts`, `index.ts`, `cli.ts`. |

---

### Task 1: `m365-core` package (token cache, device-code auth, switches)

**Files:**
- Create: everything under `packages/m365-core/` in the file map.
- Modify: root `package.json` workspaces only if packages are listed explicitly (check first; a `packages/*` glob needs no change).
- Test: `packages/m365-core/src/__tests__/token-cache.test.ts`, `delegated-auth.test.ts`, `token-scopes.test.ts`, `switches.test.ts`.

**Interfaces (Produces):**
```ts
export interface DelegatedAuthConfig {
  serverName: string;          // "sharepoint" | "outlook"; used in the cache filename and messages
  tenantId: string;
  clientId: string;
  scopes?: string[];           // default ["https://graph.microsoft.com/.default"]
  tokenDir?: string;           // default ~/.mcp-consultant-tools; tests pass a temp dir
}
export type AuthState = "authenticated" | "pending" | "expired" | "not_authenticated";
export interface AuthStatus { state: AuthState; account?: string; expiresAt?: string; grantedScopes?: string[]; message: string; }
export interface DeviceCodeStart { state: "pending" | "authenticated"; userCode?: string; verificationUri?: string; expiresInSeconds?: number; message: string; }
export class DelegatedGraphAuth {
  constructor(config: DelegatedAuthConfig);
  startDeviceCode(): Promise<DeviceCodeStart>;        // returns at once; completion runs in the background
  waitForCompletion(timeoutMs: number): Promise<AuthStatus>; // used by the CLI "auth login"
  getAccessToken(): Promise<string>;                  // memory -> silent refresh -> pending -> throws "not authenticated"
  getStatus(): Promise<AuthStatus>;
  logout(): Promise<void>;
  getGraphClient(): Client;                           // @microsoft/microsoft-graph-client with authProvider = getAccessToken
}
export function decodeTokenScopes(accessToken: string): string[];
export function isEnabled(varName: string): boolean;
export function requireEnabled(varName: string, capability: string): void;
export class TokenCache { constructor(filePrefix: string, clientId: string, tokenDir?: string); createPlugin(): ICachePlugin; exists(): boolean; clear(): void; }
```

- [ ] **Tests to write first**
  - `token-cache`: round-trip (write via plugin, read back identical); file mode is 0600; a file encrypted under a different key fails to decrypt and is treated as empty, not thrown; `clear()` removes the file; filename is `${prefix}-token-cache-${clientId}.enc`.
  - `token-scopes`: a hand-built unsigned JWT with `scp: "Mail.Read Mail.Send"` decodes to `["Mail.Read","Mail.Send"]`; malformed input returns `[]`, never throws.
  - `switches`: only `"true"` enables (`"TRUE"`, `"1"`, unset all disabled); `requireEnabled` error text names the variable.
  - `delegated-auth` with a stubbed `PublicClientApplication`: requested scopes equal `[".default" URL]`; `getAccessToken` uses the memory token, then `acquireTokenSilent`, and throws a message containing "authenticate" when neither works; `InteractionRequiredAuthError` from silent refresh yields state `expired` when the cache file exists; `startDeviceCode` returns the code and URL before the background promise resolves; a second `startDeviceCode` while pending returns the same code; `logout` removes accounts and the file.
- [ ] **Implement**, porting logic from `packages/teams/src/auth/token-cache.ts` and `packages/teams/src/services/teams-service.ts` lines 150-420. Do not import from the Teams package.
- [ ] **Verify:** `npm run build --workspace=packages/m365-core && npm test --workspace=packages/m365-core` all green.
- [ ] **Commit:** `feat(m365-core): shared device-code auth and encrypted token cache for delegated Graph servers`

### Task 2: SharePoint auth modes and URL-addressed sites

**Files:**
- Modify: `packages/sharepoint/package.json` (add `@mcp-consultant-tools/m365-core`, `vitest`, a `test` script), `src/services/sharepoint-service.ts`, `src/context-factory.ts`, `src/index.ts`, `src/tools/index.ts`, `src/cli/commands/index.ts`, `src/types/sharepoint-types.ts`.
- Create: `src/tools/auth-tools.ts`, `src/cli/commands/auth-commands.ts`, `vitest.config.ts`.
- Test: `src/__tests__/auth-mode.test.ts`, `src/__tests__/site-resolution.test.ts`.

**Interfaces:**
- Consumes: `DelegatedGraphAuth`, `requireEnabled` from Task 1.
- Produces: `resolveAuthMode(env): "client-credentials" | "device-code"`; `SharePointService` accepts a `siteId` that is either a configured id or a full `https://*.sharepoint.com/sites/...` URL; tools `spo-authenticate`, `spo-auth-status`, `spo-logout`; CLI `auth login` (blocks, prints code, waits up to 15 minutes), `auth status`, `auth logout`.

- [ ] **Tests to write first**
  - `resolveAuthMode`: secret set and no override gives `client-credentials`; no secret gives `device-code`; `SHAREPOINT_AUTH_MODE=device-code` with a secret gives `device-code`; an unknown override value throws naming the allowed values.
  - Config: device-code mode starts with no `SHAREPOINT_SITES` and no `SHAREPOINT_SITE_URL`; client-credentials mode still requires them exactly as today.
  - Site resolution: a URL input resolves through `GET /sites/{host}:/sites/{path}` and is cached; a configured id still works; an id that is neither configured nor a URL gives an error listing both accepted forms.
  - App-only regression: with a secret, the service builds a `ConfidentialClientApplication` and never constructs `DelegatedGraphAuth`.
  - Auth tools in app-only mode report "no sign-in needed" rather than failing.
- [ ] **Implement.** Keep the existing confidential-client code path byte-for-byte where possible; add the branch beside it.
- [ ] **Verify:** `npm run build --workspace=packages/sharepoint && npm test --workspace=packages/sharepoint` green.
- [ ] **Live check (needs the user once):** run `node packages/sharepoint/build/cli.js auth login` in the background with the env from the local targets file, surface the code and URL to the user, wait for completion; then `spo-get-site-info` with the test site URL through `.claude/templates/mcp-test-runner.mjs`. Record the result (not the URL) in this plan's status section.
- [ ] **Commit:** `feat(sharepoint): device-code sign-in when no client secret is configured`

### Task 3: SharePoint cross-site discovery and readable downloads

**Files:**
- Create: `packages/sharepoint/src/services/discovery-service.ts`, `src/tools/discovery-tools.ts`, `src/cli/commands/discovery-commands.ts`.
- Modify: `src/services/file-operations-service.ts` (download options), `src/tools/read-tools.ts` (download parameters), `src/cli/commands/read-commands.ts`.
- Test: `src/__tests__/discovery-service.test.ts`, `src/__tests__/download.test.ts`.

**Interfaces:**
- Produces: `searchFiles(query: string, opts: { top?: number; from?: number }): Promise<FileHit[]>`; `resolveLink(url: string): Promise<DriveItemInfo>`; `findSites(queryOrUrl: string): Promise<SiteSummary[]>`; `listMyRecent(top?: number)`; `listSharedWithMe(top?: number)`; `downloadFile(..., { saveToDisk?: boolean; convertToPdf?: boolean }) => { path?: string; content?: string; encoding?: "utf-8" | "base64"; mimeType: string; size: number }`. Tools `spo-search-files`, `spo-resolve-link`, `spo-find-sites`, `spo-list-my-recent`, `spo-list-shared-with-me`.

- [ ] **Before coding:** check the Microsoft Learn Graph v1.0 reference for `driveItem: recent` and `driveItem: sharedWithMe`. If either is deprecated or has a retirement date, do not build its tool; write one line in `packages/sharepoint/CLAUDE.md` saying why.
- [ ] **Tests to write first**
  - `searchFiles` posts `{ requests: [{ entityTypes: ["driveItem"], query: { queryString }, from, size }] }` to `/search/query`, and maps hits using a fixture captured live in the Task 3 live check (until captured, mark the fixture `// shape from Learn, replace with live capture` and do not ship without replacing it).
  - `resolveLink` encodes a URL as `u!` + base64url with `=` stripped, `/` to `_`, `+` to `-`, and calls `/shares/{encoded}/driveItem`; a plain library URL (not a sharing link) also resolves.
  - `findSites` with a URL calls `/sites/{host}:/{path}`; with a keyword calls `/sites?search=`.
  - Download: `saveToDisk` writes under `SHAREPOINT_DOWNLOAD_DIR` and returns an absolute path; a file name containing `../` or `/` is sanitised and cannot escape the folder; `convertToPdf` requests `/content?format=pdf` and is rejected for non-Office extensions with a message listing the supported ones.
- [ ] **Implement.**
- [ ] **Verify:** build and tests green.
- [ ] **Live check:** `spo-search-files` for a word known to be on the test site returns hits; `spo-resolve-link` on a document URL from the test site returns the item; `spo-download-file` with `convertToPdf` on a Word document writes a PDF that opens. Capture one real search response, scrub every identifier to sanctioned placeholders, and use it as the fixture. Record in the status section whether search, recent and shared-with-me worked on a registration that has `Sites.ReadWrite.All` but no `Files.*`; this decides the last row of the IT request.
- [ ] **Commit:** `feat(sharepoint): cross-site file search, link resolution and readable downloads`

### Task 3b: OneDrive in the SharePoint server (device-code mode only)

**Files:**
- Modify: `packages/sharepoint/src/services/discovery-service.ts`, `src/services/sharepoint-service.ts` (site URL pattern), `src/tools/discovery-tools.ts`, `src/cli/commands/discovery-commands.ts`, and the spec's SharePoint section (OneDrive subsection, same commit as the code).
- Test: `src/__tests__/onedrive.test.ts`, `src/__tests__/site-resolution.test.ts`.

**Interfaces:**
- Produces: `getMyDrive(): Promise<MyDriveInfo>` (`driveId`, `driveType`, `webUrl`, `siteUrl`, `owner`, `quota`); `listMyDrive(folderPath?: string): Promise<MyDriveItem[]>`. Tools `spo-get-my-drive`, `spo-list-my-drive`; CLI `get-my-drive`, `list-my-drive [--path]`.

- [ ] **Tests to write first**
  - `getMyDrive` reads `/me/drive` and returns the mapped drive, with `siteUrl` cut from the web URL at `/personal/{name}`.
  - `listMyDrive`: no path, `/` and `""` list `/me/drive/root/children`; a path lists `/me/drive/root:/{path}:/children` with each segment encoded and outer slashes trimmed.
  - Both refuse in app-only mode and make no Graph call.
  - A OneDrive `/personal/` URL is accepted as a site in device-code mode and resolves through `/sites/{host}:/personal/{name}`.
  - Given the OneDrive drive id, get-item, download, upload, create-folder, rename, move, copy and delete all address `/drives/{id}/...` and never `/sites/`.
- [ ] **Implement.**
- [ ] **Verify:** build and tests green.
- [ ] **Live check, read-only:** `get-my-drive`, `list-my-drive` at the root and on a folder whose name has a space, `get-item` and `list-items` with the returned `siteUrl` and `driveId`, and `spo-get-my-drive` through the MCP test runner. No writes to OneDrive.
- [ ] **Commit:** `feat(sharepoint): read your own OneDrive in sign-in mode`

### Task 4: SharePoint write and delete under a delegated token

**Files:**
- Modify only if the live check exposes a defect: `packages/sharepoint/src/services/file-operations-service.ts`, `src/tools/write-tools.ts`.
- Test: extend `src/__tests__/` for any defect found.

- [ ] **Live check with switches on** (`SHAREPOINT_ENABLE_WRITE=true`, `SHAREPOINT_ENABLE_DELETE=true`), all inside one run folder `mcp-test-data/run-<yyyymmdd-hhmm>` on the test site: create folder, upload a small text file, rename it, copy it, move the copy into a subfolder, download it, delete the copy with `confirm: true`, then delete what remains of the run folder, contents first, because a retention policy can refuse deleting a folder that still holds files. Confirm the run folder is gone and the permanent `mcp-test-data` fixtures are untouched.
- [ ] **Switch-off check:** with both switches unset, every write tool and the delete tool refuse with the message naming the variable, and nothing is created.
- [ ] **Record** in the status section: which operations passed, and any permission error text verbatim with identifiers removed.
- [ ] **Commit** only if code changed: `fix(sharepoint): <what the live write check exposed>`

### Task 5: Outlook package, auth and read tools

**Files:**
- Create: `packages/outlook/package.json` (bins `mcp-outlook` -> `build/index.js`, `mcp-outlook-cli` -> `build/cli.js`), `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/cli.ts`, `src/context-factory.ts`, `src/types.ts`, `src/mail-content.ts`, `src/download.ts`, `src/services/mail-read-service.ts`, `src/tools/auth-tools.ts`, `src/tools/read-tools.ts`, `src/cli/commands/auth-commands.ts`, `src/cli/commands/read-commands.ts`.
- Test: `src/__tests__/mail-content.test.ts`, `src/services/__tests__/mail-read-service.test.ts`, `src/__tests__/download.test.ts`.

**Interfaces:**
- Consumes: `DelegatedGraphAuth`, `decodeTokenScopes`, `requireEnabled` from Task 1.
- Produces:
```ts
export interface MailSummary { id: string; conversationId: string; subject: string; from: string; receivedDateTime: string; isRead: boolean; hasAttachments: boolean; preview: string; webLink: string; }
export interface MailDetail extends MailSummary { to: string[]; cc: string[]; bodyText: string; attachments: { id: string; name: string; size: number; contentType: string; isInline: boolean }[]; }
listFolders(): Promise<{ id: string; displayName: string; unreadItemCount: number; totalItemCount: number }[]>;
listMessages(opts: { folder?: string; top?: number; unreadOnly?: boolean; from?: string; since?: string; until?: string; hasAttachments?: boolean }): Promise<MailSummary[]>;
searchMessages(query: string, top?: number): Promise<MailSummary[]>;
getMessage(id: string): Promise<MailDetail>;
getConversation(conversationId: string): Promise<MailDetail[]>;
downloadAttachment(messageId: string, attachmentId: string): Promise<{ path: string; size: number; contentType: string }>;
export function htmlToText(html: string): string;
export function markdownToHtml(md: string): string;
export function wrapUntrusted(text: string, source: string): string;
```
- Tools: `mail-authenticate`, `mail-auth-status` (includes granted scopes and, per switch group, whether the token carries what it needs: read needs `Mail.Read` or `Mail.ReadWrite`; write needs `Mail.ReadWrite`; send needs `Mail.Send`; delete needs `Mail.ReadWrite`), `mail-logout`, `mail-list-folders`, `mail-list-messages`, `mail-search-messages`, `mail-get-message`, `mail-get-conversation`, `mail-download-attachment`. CLI parity: `auth login|status|logout`, `folders`, `list`, `search`, `get`, `thread`, `attachment`.

- [ ] **Tests to write first**
  - `listMessages`: folder defaults to `inbox` (`/me/mailFolders/inbox/messages`); `$select` limited to the summary fields; `$top` defaults to 20 and caps at 50; filters combine into one `$filter` with `$orderby=receivedDateTime desc`; `unreadOnly` adds `isRead eq false`.
  - `searchMessages`: sends `$search="<query>"` with the double quotes, and **never** sends `$orderby` or `$filter` alongside it (Graph rejects the combination). Pin that absence.
  - `getConversation`: filters on `conversationId eq '<id>'`, escapes a single quote in the id, orders oldest first.
  - `getMessage` output wraps the body with `wrapUntrusted`, whose text says the content came from an email and is data, not instructions.
  - `htmlToText`: keeps link URLs as `[label](href)` except where label equals the URL; drops `<style>`, `<script>`, `<head>` and `display:none` elements; paragraphs and `<br>` become line breaks; tables become one line per row; images become `[image]`.
  - `downloadAttachment`: writes under `OUTLOOK_DOWNLOAD_DIR`, sanitises the name, never overwrites an existing file (appends ` (1)`), refuses `itemAttachment` and `referenceAttachment` types with a message naming the type.
  - A 403 from Graph becomes an error naming the likely missing permission for that tool and saying it is granted on the app registration by an administrator, not fixed by signing in again.
- [ ] **Implement.**
- [ ] **Verify:** `npm run build --workspace=packages/outlook && npm test --workspace=packages/outlook` green; `node packages/outlook/build/index.js` starts on stdio without writing to stdout (pipe stdout to a file, send nothing, confirm the file is empty after two seconds).
- [ ] **Commit:** `feat(outlook): new delegated Outlook server with sign-in and read tools`

### Task 6: Outlook drafts, send, delete and the attachment guard

**Files:**
- Create: `packages/outlook/src/services/mail-write-service.ts`, `src/services/mail-send-service.ts`, `src/local-file-guard.ts`, `src/tools/write-tools.ts`, `src/tools/send-tools.ts`, `src/tools/delete-tools.ts`, `src/cli/commands/write-commands.ts`, `src/cli/commands/send-commands.ts`.
- Test: `src/__tests__/local-file-guard.test.ts`, `src/services/__tests__/mail-write-service.test.ts`, `src/services/__tests__/mail-send-service.test.ts`, `src/tools/__tests__/switches.test.ts`.

**Interfaces:**
- Produces:
```ts
createDraft(input: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string; format?: "markdown" | "text" | "html"; importance?: "low" | "normal" | "high" }): Promise<{ id: string; webLink: string }>;
createReplyDraft(input: { messageId: string; replyAll?: boolean; body: string; format?: "markdown" | "text" | "html" }): Promise<{ id: string; webLink: string }>;
createForwardDraft(input: { messageId: string; to: string[]; body?: string; format?: "markdown" | "text" | "html" }): Promise<{ id: string; webLink: string }>;
updateDraft(input: { draftId: string; to?: string[]; cc?: string[]; bcc?: string[]; subject?: string; body?: string; format?: "markdown" | "text" | "html" }): Promise<{ id: string }>;
addDraftAttachment(input: { draftId: string; filePath: string }): Promise<{ attachmentId?: string; name: string; size: number }>;
markRead(messageId: string, isRead: boolean): Promise<void>;
moveMessage(messageId: string, destinationFolder: string): Promise<{ newId: string }>;
flagMessage(messageId: string, flag: "flagged" | "complete" | "notFlagged"): Promise<void>;
sendDraft(draftId: string): Promise<void>;
sendMail(input: same as createDraft): Promise<void>;
deleteMessage(messageId: string, confirm: boolean): Promise<void>;
export function assertSafeLocalFile(filePath: string, homeDir?: string): string; // returns the resolved real path or throws
```

- [ ] **Tests to write first**
  - Switches: with every switch unset, each write, send and delete tool throws the disabled message naming its variable and makes no Graph call. Send is refused when only write is on; write is refused when only send is on.
  - `createReplyDraft`: calls `createReply` or `createReplyAll` with an empty body, reads the draft back, then `PATCH`es the body to the new HTML **followed by** the existing body, so the quoted thread survives. Assert the order.
  - `createDraft`: markdown is converted and sanitised (a `<script>` in the input does not reach the posted body); recipients map to `{ emailAddress: { address } }`; a recipient without `@` is rejected before any call.
  - `addDraftAttachment`: 3 MB or under uses `POST .../attachments` with `@odata.type: "#microsoft.graph.fileAttachment"` and base64 `contentBytes`; above 3 MB uses `createUploadSession` then chunked `PUT`s of 320 KiB multiples with correct `Content-Range` headers; above `OUTLOOK_MAX_ATTACHMENT_MB` is refused before reading the file.
  - `assertSafeLocalFile`: refuses a path outside home, `~/.ssh/id_ed25519`, `~/project/.env`, `~/x.pem`, `~/x.key`, `~/x.p12`, `~/x.pfx`, and a symlink inside home that points outside it; accepts `~/Documents/deck.pptx`.
  - `sendDraft` posts to `/me/messages/{id}/send`; `sendMail` posts `/me/sendMail` with `saveToSentItems: true`.
  - `deleteMessage` refuses without `confirm: true`, and sends `DELETE /me/messages/{id}` (never `permanentDelete`). Pin that absence.
  - `moveMessage` accepts a well-known folder name (`archive`, `deleteditems`, `inbox`, `drafts`) or a folder id.
- [ ] **Implement.**
- [ ] **Verify:** build and tests green.
- [ ] **Live check:** blocked until the Outlook registration has mail permissions. With the SharePoint test registration (no mail permission), sign in and confirm `mail-auth-status` reports every mail group as missing its permission and `mail-list-messages` returns the permission hint. Record in the status section.
- [ ] **Commit:** `feat(outlook): drafts, send and delete behind off-by-default switches, with a local-file guard for attachments`

### Task 7: Documentation, local registration and hand-back

**Files:**
- Create: `packages/outlook/CLAUDE.md`, `packages/outlook/README.md`, `docs/documentation/OUTLOOK.md`, `docs/technical/OUTLOOK_TECHNICAL.md`, `packages/m365-core/CLAUDE.md` (if not written in Task 1).
- Modify: `packages/sharepoint/CLAUDE.md`, `docs/documentation/SHAREPOINT.md`, `docs/technical/SHAREPOINT_TECHNICAL.md`, root `README.md` (tool counts, package list), root `CLAUDE.md` (package list under Monorepo Architecture), `.claude/refs/package-binaries.md` (outlook row).

- [ ] Write the docs following root `CLAUDE.md` § Documentation Strategy: short user docs, full XML-tagged technical docs. Include every environment variable with its default in each MCP config example.
- [ ] Run the full check: `npm run build` at the root, then the three packages' tests.
- [ ] Register both servers for the user's local testing at user scope, pointing at the local builds, with the real values from the local targets file (these live in `~/.claude.json`, never in the repo): `sharepoint` (device-code mode, no secret, switches off) and `outlook` (switches off). Use `claude mcp add --scope user`. Do not remove or change the existing `teams` entry.
- [ ] Commit docs: `docs: delegated SharePoint mode and the new Outlook server`
- [ ] Report to the monitor with the commit hashes and the status-section entries.

---

## Status (newest first)

- 2026-09-23 21:49: the global `--json` flag now works in the SharePoint and Outlook CLIs; both had copied an output helper that never read it. With `--json`, stdout carries the full JSON alone and the cache path goes to stderr; without it, the summary prints as before. Pinned by three unit tests in each package (sharepoint 65, outlook 92, both green); checked through the built SharePoint CLI on the existing sign-in, where `--json get-my-drive` printed JSON that parses and the plain run printed the summary. The Outlook CLI is unit-tested only, as it has no sign-in yet. `--no-cache` is still ignored by both and is documented as such.
- 2026-09-23 21:47: build chain closed; tip `af26400` was on origin at close. Every loop register item is closed or recorded where it belongs: the test runner's unstripped `MCP_TEST_ENV_` prefix and the machine-wide secret guard's false positive are now in `docs/KNOWN_ISSUES.md`; the Outlook `$expand` and `$search` escape assumptions, the Outlook sign-in being separate from SharePoint's, and the SharePoint test fake dropping headers and query options were already in the package `CLAUDE.md` files and technical references; the pre-commit broken-pipe item was resolved by the monitor in `6d3b853`, `ad0bffd` and `b25140d`. `docs/KNOWN_ISSUES.md` also now counts 13 of 31 packages without a test script, since `sharepoint` has one. Handed to the monitor: the Task 6 live check, as an open action pending the maintainer's next Outlook sign-in. The SharePoint CLI ignoring `--json` is fixed in this hop at the monitor's instruction.
- 2026-09-23 21:45, `eed659b`, `da8a61f`, `e9f55f6`: Task 7 done. Outlook user guide, technical reference, package `CLAUDE.md` and README; SharePoint user guide, technical reference and package `CLAUDE.md` updated for sign-in mode, OneDrive and readable downloads, with `searchFiles` documented as returning `{ total, moreResultsAvailable, hits }`; root README, root `CLAUDE.md` and the package-binaries table list `outlook` and `m365-core`. The SharePoint package `CLAUDE.md` also had a tool count, a write permission, a file layout and CLI examples that no longer matched the code; each is corrected. Root build green; m365-core 56, sharepoint 62, outlook 89 tests green. Both servers are registered at user scope for local testing against the local builds, sharepoint in device-code mode with no secret and outlook, every switch off; the existing `teams` entry is unchanged, and `claude mcp list` shows all three connected. Found while documenting and left as a register item: the SharePoint CLI accepts `--json` and ignores it. Open: the Task 6 live check, at the maintainer's next Outlook sign-in. `outlook` is not added to the meta package; the plan did not ask for it.
- 2026-09-23 21:35, `c2fb443`, `a7bf682`: test data in place, Task 3 live check complete, Task 3b done, Task 4 passed. **Test data:** a permanent `mcp-test-data` folder on the test site holds a text README, a text file, a Word file, a PDF three folders deep, a PowerPoint and an Excel file, each carrying one shared marker word and one unique word. Making it exposed a defect present since the v33 baseline: every simple upload sent the conflict behaviour as an HTTP header, which is not a legal header name, so no simple upload had ever worked. Fixed in `c2fb443`; a second upload without overwrite is now refused as already existing. **Task 3:** `spo-resolve-link` on the Word file's URL returned that item; `spo-download-file` with `convertToPdf` and `saveToDisk` wrote a one-page PDF starting `%PDF-`; search found all six files by the marker word about six minutes after upload, and each unique word found only its own file, so full-text search covers Word, PowerPoint, Excel, PDF and text. **Task 3b** (`a7bf682`): `spo-get-my-drive` and `spo-list-my-drive`; read-only live check passed on the root, on a folder whose name has a space, and for `get-item` and `list-items` through the OneDrive site URL. **Task 4**, in a run folder under `mcp-test-data`: create folder, create subfolder, upload, rename, copy, move the copy into the subfolder, download it, delete refused without confirm, delete with confirm, all passed. Deleting the run folder while it still held a file was refused with `Request was cancelled by event received. If attempting to delete a non-empty folder, it's possible that it's on hold`; once its contents were deleted, the empty folder deleted normally. This reads as a tenant retention policy rather than a server defect (inferred, not confirmed). Switch-off: with both switches unset, upload, create-folder, rename, copy, move and delete each refused naming its variable and nothing was created; `spo-delete-item` refused the same way through the MCP test runner. **Task 6 live check still pending:** it needs an Outlook sign-in, and none is being started while the maintainer is away. The check, when possible: `mail-auth-status` shows every mail group missing and `mail-list-messages` returns the permission hint.
- 2026-09-23 21:25, `5042ae0`, `8d8bfe3`, `a642545`: Task 6 code done, Task 2 live check passed, Task 3 live check partly run. **IT request answer: `Sites.ReadWrite.All` alone is enough, `Files.ReadWrite.All` is not needed for what was tested.** With a token carrying `Sites.ReadWrite.All` and no `Files.*`: Microsoft Search for files returned 16,898 hits for one common word, and the first page held OneDrive files as well as site files; `GET /me/drive` returned the user's OneDrive (type business, with quota) and its root listed. Task 2: `spo-get-site-info` with the test site URL passed through the MCP test runner (491 ms). Task 3: the search fixture now has the shape of a live capture, identifiers replaced. The live check exposed a defect present since the v33 baseline: the drive root was addressed as `root:/`, which Graph rejects, so `get-folder-structure` with no folder id failed; fixed in `8d8bfe3`. `spo-resolve-link` and `spo-download-file` with `convertToPdf` are not yet run, because the test library held no documents. Task 6: drafts, send and delete behind their switches, with the local-file guard, 89 outlook unit tests green, stdout empty on start. Its live check (mail groups reported missing on the test registration) is not yet run; it needs an Outlook sign-in, which is a separate cache from SharePoint. Queued by the monitor: Task 3b (OneDrive tools in the SharePoint server), and the test data rule is widened to a permanent `mcp-test-data` folder on the test site.
- 2026-09-23 21:08, `f714563`: Task 5 done. New `outlook` package with sign-in and read tools (9 MCP tools, CLI parity), 42 unit tests green. The tests drive a real Graph client over a recording transport, which showed the client puts `$filter` and `$search` values into the URL unencoded: a plus-address arrived as a space and an `&` cut the search text. Values are now encoded, and SharePoint was checked and already encodes its own. Also pinned: no `$orderby` or `$filter` beside `$search`; a leading `receivedDateTime` clause whenever a list is filtered, because Graph accepts `$filter` with `$orderby` on messages only when the sort property leads the filter; a client-side oldest-first sort for conversations for the same reason. Server starts on stdio with an empty stdout; `mail-auth-status` passes through the MCP test runner (not signed in, as expected). Not live-tested: `$expand=attachments($select=...)` on message reads and the backslash escape of a double quote inside `$search` follow the documented shape, and wait for a registration with mail permissions. SharePoint live checks still waiting on sign-in: the 20:50 code lapsed unused, a fresh one was issued at 21:05.
- 2026-09-23 20:57: build session handing off to a fresh tab at 31% context. Open for the successor: the Task 2 and Task 3 live checks (a device-code sign-in was issued at 20:50 and completes into the shared encrypted cache if the maintainer signs in; confirm with `auth status`, and check granted scopes before any SharePoint call), replacing the search fixture with a scrubbed live capture, then Tasks 4 to 7. Loop register: `.claude/loop-register/2026-09-23-delegated-m365-build.md`.
- 2026-09-23 20:55, `a773014`: Task 3 code done, live check not yet run. `spo-search-files`, `spo-resolve-link`, `spo-find-sites` and download `saveToDisk` / `convertToPdf` built; 48 SharePoint and 56 `m365-core` unit tests green. **`spo-list-my-recent` and `spo-list-shared-with-me` are not built**: Microsoft Learn marks both `drive: recent` and `drive: sharedWithMe` deprecated, degraded until November 2026, then returning no data. The IT-request question for Task 3 therefore narrows to one thing: does `Sites.ReadWrite.All` alone cover Microsoft Search for files. The search fixture is still the documented shape and must be replaced by a live capture.
- 2026-09-23 20:50, `a2cb6e5`: Task 2 code done, live check not yet run. Device-code mode, URL-addressed sites, `spo-authenticate` / `spo-auth-status` / `spo-logout` with CLI parity; 31 unit tests green. App-only regression checked through the MCP test runner with a placeholder secret: the server starts on the client-secret path and `spo-auth-status` reports no sign-in needed.
- 2026-09-23 20:50: D-001 answered A by the maintainer. One request for both new app registrations, raised after the 24 September discussion, once the Task 3 live check has settled whether a file permission is needed beyond `Sites.ReadWrite.All`. The request text is held privately.
- 2026-09-23 20:45, `00c9da7`: Task 1 done. `m365-core` built, 40 unit tests green (token cache, scope decoder, switches, device-code auth with a faked MSAL client). No live check in this task.
- 2026-09-23: plan written by the monitor session. Build not started.

## What to request from your IT administrator

Two new app registrations, one per server, each set up exactly like the existing Teams one. Keeping them separate means each can be approved, audited and revoked on its own.

**Common settings for both:**
- Single tenant.
- Authentication: "Allow public client flows" set to **Yes**. This is what enables device-code sign-in.
- No client secret and no certificate.
- Microsoft Graph **delegated** permissions only, with **admin consent granted** for the tenant.
- If Conditional Access restricts the device-code flow, apply the same exclusion or policy that lets the Teams registration sign in.
- Send back: the application (client) id of each registration. The tenant id is the same as Teams.

**Outlook registration** (suggested name: `Outlook MCP - delegated`):

| Delegated permission | Why |
|---|---|
| `User.Read` | Sign in and read the user's own profile. |
| `offline_access` | Silent renewal, so the user signs in about once every 90 days rather than every hour. |
| `Mail.ReadWrite` | Read mail, create and edit drafts, mark read, move, flag, delete to Deleted Items. |
| `Mail.Send` | Send mail as the user. Used only when `OUTLOOK_ENABLE_SEND=true`. |

**SharePoint registration** (suggested name: `SharePoint MCP - delegated`):

| Delegated permission | Why |
|---|---|
| `User.Read` | Sign in and read the user's own profile. |
| `offline_access` | Silent renewal. |
| `Sites.ReadWrite.All` | Read and, when switched on, write documents on SharePoint sites the user can already open. |
| `Files.ReadWrite.All` | OneDrive, "shared with me" and cross-site file search. **Include only if the Task 3 live check shows `Sites.ReadWrite.All` alone does not cover these.** |

Delegated permissions cap access at what the signed-in user can already open. Neither server can see another user's mailbox or a site the user has no access to.
