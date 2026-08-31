# Teams Package Guide

## Overview

Microsoft Teams integration for reading, sending and managing channel messages and chats. Originally built for automated release announcements; extended in v35 so an agent can read and act on Teams on the user's behalf.

- **Tools:** 26 tools
- **Authentication:** Device Code (default, personal credentials) or Client Credentials (app-only)
- **Services:** `TeamsService` (auth, discovery, channel sends), `MessageService` (message reads, replies, chats, channel delta), `PeopleService` (directory lookup, direct messaging) and `SearchService` (keyword search). All three share `TeamsService`'s authenticated Graph client rather than owning auth, so there is one token cache and one sign-in for the package.

## Scope Boundary (HARD RULE)

The device-code flow requests exactly these ten delegated scopes, defined once as `DEVICE_CODE_SCOPES` in `src/services/teams-service.ts`:

```
User.Read, User.ReadBasic.All, Team.ReadBasic.All, Channel.ReadBasic.All,
ChannelMessage.Read.All, ChannelMessage.Send, Chat.ReadWrite, Chat.Create,
Group.Read.All, offline_access
```

Two further scopes are consented on this registration and **deliberately absent from that array**: `ChannelMessage.Edit` and `ChannelMessage.ReadWrite`.

**`ChannelMessage.ReadWrite` is what channel edit and delete actually need, and leaving it out of the array is correct.** Entra returns every admin-consented scope in the `scp` claim regardless of what MSAL requests, so the token already carries it and the three channel tools work with no code change — verified 2026-08-20, including that an existing cached refresh token picks up a newly granted scope on its next silent renewal, so no fresh device-code sign-in is needed after an administrator grants it. Adding it to the array would gain nothing here and would **break every other tenant that has not consented it**, because an unconsented scope fails at *sign-in* rather than on the call that needed it: 26 tools down instead of 3. This is the one place where the "request what you use" instinct is actively wrong.

**`ChannelMessage.Edit` is consented and grants nothing.** Leaving it out of the array above changes nothing either: **Entra returns the whole admin-consented set in the `scp` claim regardless of what MSAL requests**, so every token this package issues already carries it. Graph rejects it anyway. Editing or deleting a channel message is `PATCH` / `softDelete` on `/teams/{t}/channels/{c}/messages/{m}`, whose delegated permission is `ChannelMessage.ReadWrite` or `Group.ReadWrite.All` — neither consented. Verified live on 2026-08-19 with a byte-identical PATCH against a real channel message:

```
403 Missing scope permissions on the request.
    API requires one of 'ChannelMessage.ReadWrite, Group.ReadWrite.All'.
    Scopes on the request '… ChannelMessage.Edit, ChannelMessage.Send, Chat.ReadWrite, …'
```

Do not treat a scope's presence in a token as evidence of a capability — decode `scp` **and then try the call**. `ChannelMessage.Edit` sat in every token this package issued while granting nothing at all.

**Do not add a scope to that array unless it has tenant-wide admin consent.** An unconsented scope cannot be self-consented in a tenant that classifies it as anything other than low impact, so it fails at *sign-in* rather than degrading gracefully on the call that needed it — which takes the whole server down, not one tool. If a new capability needs a ninth scope, stop and raise it rather than implementing it.

Verified against the Graph v1.0 permission tables, these are reachable on the set above:

| Operation | Least-privileged delegated permission |
|-----------|---------------------------------------|
| `GET /teams/{t}/channels/{c}/messages` | `ChannelMessage.Read.All` |
| `GET .../messages/{m}/replies` | `ChannelMessage.Read.All` |
| `POST .../messages/{m}/replies` | `ChannelMessage.Send` |
| `GET /me/chats`, `GET /chats/{c}/members` | `Chat.ReadBasic` (`Chat.ReadWrite` is higher) |
| `GET /chats/{c}/messages` | `Chat.Read` (`Chat.ReadWrite` is higher) |
| `POST /chats/{c}/messages` | `ChatMessage.Send` (`Chat.ReadWrite` is higher) |
| `POST /chats/{c}/markChatReadForUser` | `Chat.ReadWrite` (only permission listed) |
| `POST .../messages/{m}/setReaction` (channel) | `ChannelMessage.Send` |
| `POST /chats/{c}/messages/{m}/setReaction` | `Chat.ReadWrite` |
| `PATCH /chats/{c}/messages/{m}` | `Chat.ReadWrite` |
| `POST /users/{me}/chats/{c}/messages/{m}/softDelete` | `Chat.ReadWrite` |
| `POST /users/{me}/chats/{c}/messages/{m}/undoSoftDelete` | `Chat.ReadWrite` |
| `PATCH /teams/{t}/channels/{c}/messages/{m}` | `ChannelMessage.ReadWrite` (not requested; see above) |
| `POST /teams/{t}/channels/{c}/messages/{m}/softDelete` | `ChannelMessage.ReadWrite` (not requested; see above) |

| `GET /users?$search=...` | `User.ReadBasic.All` |
| `POST /chats` (create one-on-one) | `Chat.Create` (`Chat.ReadWrite` is higher) |
| `GET .../messages/delta` | `ChannelMessage.Read.All` |
| `POST /search/query` (`chatMessage`) | see the search note below |

Deliberately **not** implemented, and why:

- **Team/channel administration** stays out of scope. The message edit and delete tools exist for both surfaces.
- **Team/channel administration** — out of scope entirely: no creating channels, no managing members, no changing team settings.

**Search permission note.** The Graph reference lists `Chat.Read` for `entityTypes: ["chatMessage"]`, which is *not* consented. Graph does not enforce that list literally — live testing on 2026-08-12 returned 200 with real hits on `Chat.ReadWrite` alone. `search-messages` is built on that observed behaviour rather than the documented table, so if Graph ever tightens enforcement this is the first tool to break, and the fix is a scope request, not a code change.

**Channel `delta` behaviour**, confirmed the same day: `/beta/` also works and adds `hasReplies`. Pages via `@odata.nextLink`. `$deltatoken=latest` is **not** honoured, so a cold start must page to the end of history before Graph issues a `deltaLink` — which is why `get-channel-messages-delta` bounds the walk with `maxPages` and returns **no** deltaLink when it stops early. The v1.0 response is undocumented but real, so it is read defensively.

## Authentication Modes

### Device Code (Default) - Personal Credentials

Use your personal Microsoft account with a custom Azure AD app registration.

```bash
# Required - Custom app registration
TEAMS_TENANT_ID=your-azure-tenant-id
TEAMS_CLIENT_ID=your-app-client-id

# Optional - Default targets for posting
TEAMS_DEFAULT_TEAM_ID=team-guid
TEAMS_DEFAULT_CHANNEL_ID=channel-guid
```

**App Registration Setup:**
1. Go to https://entra.microsoft.com → **App registrations** → **New registration**
2. Name: `MCP Teams Integration` (or similar)
3. Supported account types: **Single tenant**
4. In **Authentication** → Enable **"Allow public client flows"**
5. In **API permissions** → Add **Microsoft Graph** → **Delegated permissions** (all ten — see Scope Boundary above):
   - `User.Read`
   - `User.ReadBasic.All`
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Read.All`
   - `ChannelMessage.Send`
   - `Chat.ReadWrite`
   - `Chat.Create`
   - `Group.Read.All`
   - `offline_access`
6. Click **Grant admin consent**

No client secret and no certificate: device-code mode holds no standing credential and runs only in the signed-in user's context.

**How it works:**
1. Call the `authenticate` tool
2. You'll receive a URL and code
3. Open the URL in your browser, enter the code, sign in
4. Authentication completes automatically
5. The MSAL token cache (with refresh token) is persisted encrypted for future sessions
6. Actions are performed as your user account (delegated permissions)

### Client Credentials - App Registration

Use an Azure AD app registration for automation (no user interaction).

```bash
# Required for client-credentials mode
TEAMS_AUTH_MODE=client-credentials
TEAMS_TENANT_ID=your-azure-tenant-id
TEAMS_CLIENT_ID=your-app-client-id
TEAMS_CLIENT_SECRET=your-client-secret

# Optional - Default targets for posting
TEAMS_DEFAULT_TEAM_ID=team-guid
TEAMS_DEFAULT_CHANNEL_ID=channel-guid
```

**Required App Permissions (Application, NOT Delegated):**

| Permission | Purpose |
|------------|---------|
| `ChannelMessage.Send` | Send messages to channels |
| `Group.Read.All` | List teams and channels |
| `Team.ReadBasic.All` | Read team information |

**Admin consent required:** Yes

## Tools

### Authentication Tools

#### authenticate

Start the authentication flow. For device-code mode, returns URL and code for browser sign-in.

```typescript
// No parameters - just call it
{}
```

**Response (device-code mode):**
```
🔐 Teams Authentication Required

1. Open this URL: https://microsoft.com/devicelogin
2. Enter this code: ABC123XYZ
3. Sign in with your Microsoft account

⏱️ This code expires in 15 minutes.
```

#### auth-status

Check current authentication status.

```typescript
// No parameters
{}
```

#### logout

Clear cached authentication tokens.

```typescript
// No parameters
{}
```

### Messaging Tools

#### send-channel-message

Send text or markdown messages to a Teams channel. Supports `@[Name or email]` mentions — see the @-mentions section.

```typescript
{
  teamId?: string,      // Optional if default set
  channelId?: string,   // Optional if default set
  message: string,      // Required - the message content
  format?: "text" | "markdown",  // Default: "markdown"
  importance?: "normal" | "high" | "urgent"  // Default: "normal"
}
```

#### send-adaptive-card

Send Adaptive Cards with pre-built templates or raw JSON.

**Templates available:**
- `release-announcement` - Standard release card
- `beta-release` - Beta release with warning styling
- `hotfix` - Urgent hotfix notification

```typescript
// Using a template
{
  template: "release-announcement",
  templateData: {
    packageName: "@mcp-consultant-tools/azure-devops",
    version: "27.0.0",
    summary: "New work item sync tools",
    date: "2025-01-16",
    releaseType: "Minor Release",
    changes: "- Added sync-work-item-to-file\n- Added sync-work-item-from-file",
    releaseNotesUrl: "https://github.com/..."
  }
}

// Using raw card
{
  card: {
    type: "AdaptiveCard",
    version: "1.4",
    body: [...]
  }
}
```

#### list-teams

List Teams the app/user has access to.

#### list-channels

List channels in a team to find channel IDs.

### Message Read Tools

All reads default to the 20 most recent messages and cap at Graph's maximum of 50. Bodies are returned as plain text with HTML stripped, links kept as markdown and attachments named; each message shows author, timestamp and ID.

#### get-channel-messages

```typescript
{
  teamId?: string,     // Optional if default set
  channelId?: string,  // Optional if default set
  top?: number,        // 1-50, default 20
  since?: string,      // ISO-8601, e.g. "2026-08-01T00:00:00Z"
  until?: string       // ISO-8601
}
```

Excludes thread replies by design. `since`/`until` are applied client-side over the fetched page — widen `top` if a range looks short.

#### get-message-replies

```typescript
{ messageId: string, teamId?: string, channelId?: string, top?: number }
```

#### reply-to-message

```typescript
{
  messageId: string,
  message: string,
  teamId?: string,
  channelId?: string,
  format?: "text" | "markdown"  // Default: "markdown"
}
```

### Chat Tools

#### list-chats

```typescript
{ top?: number, includeMembers?: boolean }
```

Most recently active first. `includeMembers` expands member display names — useful for naming one-on-one chats, which have no topic. Graph caps expanded members at 25 per chat regardless of `top`.

**`lastMessagePreview` is always expanded, and the "Last activity" column shows it.** Graph orders this list by `lastMessagePreview/createdDateTime` but does **not** return that property unless it is expanded — so the ordering worked while the timestamp driving it was absent from the response, and the renderer fell back to `lastUpdatedDateTime`, which tracks changes to the chat (topic, membership) rather than messages in it. The two disagree badly: a chat whose last message arrived this morning could display a date six weeks old. Both are mapped now (`lastMessageDateTime` and `lastUpdatedDateTime`); show the former.

#### get-chat-messages

```typescript
{ chatId: string, top?: number, since?: string, until?: string }
```

Range filters are applied server-side against `lastModifiedDateTime`.

#### send-chat-message

```typescript
{ chatId: string, message: string, format?: "text" | "markdown" }
```

Cannot create a chat — use `list-chats` to find an existing one.

#### mark-chat-read

```typescript
{ chatId: string }
```

Posts the signed-in user's own AAD identity (resolved via `User.Read`), which the Graph action requires.

### Message Edit and Delete Tools (chats only)

All three run on the already-consented `Chat.ReadWrite`. **They exist for chats and not channels** — see the Scope Boundary note.

#### update-chat-message

```typescript
{ chatId: string, messageId: string, message: string, format?: "text" | "markdown" }
```

`PATCH /chats/{c}/messages/{m}`. **Replaces the whole body** — Graph has no partial update, so an @-mention in the original must be restated in the replacement or it is dropped. Content goes through the same `buildOutboundMessage` the send path uses, so an edit cannot render differently from the message it replaces. Only the sender may edit; that is left to Graph rather than pre-checked, since a pre-check costs a read on every call to prevent an error Graph already returns.

#### delete-chat-message / undo-delete-chat-message

```typescript
{ chatId: string, messageId: string }
```

**The path must go through `/users/{me}`.** `POST /chats/{c}/messages/{m}/softDelete` answers **405 Method Not Allowed**; the users-scoped form is the only one Graph exposes, which is why these two call `getMe()` and the edit does not. The id in that segment is the signed-in user, not the chat. Soft delete is reversible, which is why the undo ships alongside rather than later.

**Three 403s here do not mean a permissions problem, and `wrapGraphError` checks all three before the generic re-authenticate advice.** Getting this wrong costs an hour, because the generic advice is plausible and wrong:

| Inner error (in the client's `body`, **not** `message`) | What it actually means |
|---|---|
| `MessageIdNotInAllowedRange` | The message is too old for Graph to act on. Outer code reads `InsufficientPrivileges`, which is a lie. |
| `AclCheckFailed` | Graph accepted scope and request; **Teams** refused. Normally a tenant messaging policy forbidding users to delete their own sent messages. |
| `Missing scope permissions … ChannelMessage.ReadWrite` | The channel path. Needs an administrator, not a re-auth. |

### update-channel-message / delete-channel-message / undo-delete-channel-message

```typescript
{ messageId: string, message: string, replyId?: string, teamId?: string, channelId?: string, format?: "text" | "markdown" }
{ messageId: string, replyId?: string, teamId?: string, channelId?: string }
```

Same semantics as the chat three. Two differences that matter:

- **They need `ChannelMessage.ReadWrite`, which the code never requests.** See the Scope Boundary note — that is deliberate, not an omission.
- **No `/users/{me}` segment.** The team and channel already scope a channel message, so unlike the chat delete these need no `getMe()`. All three share `channelMessagePath()` so a `replyId` cannot be honoured by one and dropped by another.

⚠️ **DELETE IS BLOCKED ON THIS TENANT AND EDIT IS NOT. Do not spend an hour on it.** Confirmed live 2026-08-20 across both surfaces: chat and channel `softDelete` both return 403 `AclCheckFailed` — *"Initiator is not allowed to delete message"* — on a message the signed-in user posted seconds earlier. The scope, path and request shape are all correct: a nonexistent id returns 404 on the very same endpoint, so the call reaches Teams and Teams refuses it. **Editing works on both surfaces, live, including on a 35-hour-old message.** Teams governs edit and delete with separate messaging-policy switches and this tenant permits one and not the other. Nothing in this package can change that; it needs a Teams administrator. The delete and undo code paths are therefore **shipped but never successfully exercised end to end** — the failure mode is proven, the success path is not.

### People Tools

#### find-user

```typescript
{ query: string, top?: number }   // top: 1-25, default 10
```

Searches display name, `mail` and `userPrincipalName`. Returns each match's name, email, job title, guest status and **AAD user ID** — the id an @-mention payload needs.

**A tenant directory is not a staff list.** `$search` on `/users` returns guests beside colleagues — suppliers, client contacts, personal addresses invited to a channel — and live testing on 2026-08-13 had a single first name return four outsiders among six hits. The output marks them, because an email domain is easy to skim past. Detection reads the `#EXT#` marker in the UPN, not `userType`: `userType` states it outright but needs `User.Read.All`, which is not consented, and comes back `null` for every user on the current scope set. *Ceiling: someone genuinely external holding a full member account reads as a colleague.*

`$search` on `/users` is an *advanced* query: Graph rejects it without **both** the `ConsistencyLevel: eventual` header and `$count=true`, and the resulting error mentions neither. Both are sent unconditionally. The term is interpolated into quoted `"field:term"` clauses, so quotes and backslashes are stripped before it goes on the wire — a stray quote splits one clause into several and Graph answers with a parse error rather than a result.

#### send-direct-message

```typescript
{ to: string, message: string, format?: "text" | "markdown" }
```

**The point of the package for day-to-day use: DM anyone by name, without knowing a chat ID.** Three steps behind one tool — resolve the person, find the existing one-on-one chat, post — deliberately not exposed separately, because splitting them puts the burden of not creating duplicate threads on the caller.

**Ambiguity is never resolved by guessing.** One match wins; several matches are reported back with the candidates so the caller can re-run with an exact email. An exact match on email, UPN or full display name beats partial hits, so `jdoe@example.com` resolves even when several people share a first name. Messaging the wrong colleague is not recoverable, which is why this is an error and not a heuristic.

**A guest is only ever resolved from their exact address, and the ambiguity rule does not cover this.** A first name matching exactly one supplier and no colleague *is* unambiguous — so through `beta.8` it resolved cleanly and sent a message to a stranger at another company with nothing said about it. Same unrecoverable mistake, no guard, and the case a caller is least likely to expect. `guardExternal()` refuses a guest named by anything other than their `mail` or `#EXT#` UPN, and names the address to re-run with; **a full display name does not count** — it is enough to pick one person out of several, but it is not the deliberate act reaching outside the organisation should take. An error rather than a warning because the caller is usually an agent, and a warning printed after the message has gone is not a guard.

**The guard covers @-mentions too**, since they share `resolveDirectoryUser()` — `@[Sam]` in a channel post notifies a guest and hands them the thread, which is the same exposure as a DM. `src/__tests__/mentions.test.ts` pins it on that path rather than trusting the shared resolver alone.

**Addressing yourself is refused, and this was the worst bug the tool has had.** The chat lookup matches on "some member holds this id", which is correct for anybody else and silently wrong for the signed-in user: they are a member of *every* one-on-one chat they have, so their own id matched whichever page one returned first and the message went to that colleague, with nothing said about it. Confirmed live 2026-08-14 against a real account with 14 one-on-one chats. A one-on-one chat needs two people, so there is no self chat to fall back to; `sendDirectMessage` refuses, and `findOneOnOneChat` answers null for the signed-in user so the same mistake cannot return through another caller. **Never smoke-test this tool by messaging yourself** — it is the one target that used to reach someone else.

**Two guards against duplicate chats, not one.** The lookup (`/me/chats?$filter=chatType eq 'oneOnOne'&$expand=members`, matched on member `userId`) runs first so the result can honestly report `chatExisted` — whether the message landed in your existing thread or opened a new one. The backstop is Graph itself: it documents that only one one-on-one chat can exist between two people and that `POST /chats` **returns the existing chat rather than creating a second one**. So a missed lookup costs an inaccurate `chatExisted` label, never a duplicate thread. The lookup is bounded at 5 pages for that reason — `CHAT_LOOKUP_MAX_PAGES` (5) × `CHAT_PAGE_SIZE` (50) = **250 chats**, past which `chatExisted` starts reading `false` for threads that exist.

### Search and Delta Tools

#### search-messages

```typescript
{ query: string, top?: number, from?: number }   // top: 1-50, default 20
```

Spans channel messages **and** chat messages in one call — usually the cheapest way to answer "where was X discussed" without knowing which team, channel or chat to look in. Each hit carries the ids a follow-up read needs: `teamId`+`channelId` for a channel hit, `chatId` for a chat hit.

The parameter is `top` for consistency with the other five reads in the package; **the wire field stays `size`**, which is what `/search/query` accepts. It was `size` on both surfaces through `beta.8` — the lone outlier of the six, and one a caller reliably guessed wrong.

Five shape traps, all pinned by tests:
- `chatMessage` is not in the v1.0 `entityType` enum, so the request **must** send `Prefer: include-unknown-enum-members` or Graph rejects it outright.
- Hits deliver the sender as `from.emailAddress.name`/`.address`, **not** the `from.user.displayName` shape the message endpoints use. Passing a hit through `toMessageInfo()` renders every result as an unattributed "Unknown", which reads like a permission failure rather than a mapping bug. `SearchService` has its own mapping path.
- **A hit's deep link is `webLink`, not the `webUrl` every other message endpoint returns.** Reading the wrong property is silent — it is simply absent — so through `beta.8` every hit came back linkless, and `formatSearchResults` did not print the field anyway. Both halves are fixed; `webUrl` stays as a fallback. Note the technical doc had recorded `webLink` correctly from the 2026-08-12 research and the code read the other one, so a fixture copied from the Graph reference is not evidence.
- **`channelIdentity.teamId` is not always the group id the read endpoints accept.** A private-channel hit carries that channel's own backing group; `GET /teams/{that}` answers `Group ID '...' is not found`, which reads like a permission or deletion problem rather than a wrong argument. `confirmChannelTeams()` checks each channel hit against `/me/joinedTeams` — one call, and it settles the ordinary case — and only walks channels for a hit that fails it, stopping as soon as every unplaced channel is found. A hit that cannot be placed **loses the field**: the whole point of returning ids is that a follow-up read can use them. *Ceiling: `MAX_TEAM_SCAN` (20) teams.*

- **Every hit carries both `chatId` and `channelIdentity`, whichever kind it is.** A chat hit repeats its chat id in `channelIdentity.channelId`; a channel hit repeats its channel id in `chatId`. Only `channelIdentity.teamId` is exclusive to a channel hit, so it is the discriminator — `hit.channelId` is not, and using it sent every chat hit into `confirmChannelTeams()`, where it could never be found: a `listChannels` call per joined team on any search returning a chat hit, and the hit then rendered as a channel whose team was unidentifiable while its `chatId` was valid and readable all along. Confirmed live 2026-08-14: half an eight-hit sample were chats, all four mislabelled. *Ceiling: a channel hit arriving with no `teamId` at all would read as a chat. Not observed — a private channel's `teamId` is present but wrong, which is what `confirmChannelTeams()` repairs.*

Graph's `total` is an estimate over the whole matching set, so output says "20 of about 340" rather than implying the page is the answer. `<c0>` hit-highlight markers are stripped from summaries, and each hit prints its deep link.

#### get-channel-messages-delta

```typescript
{ teamId?: string, channelId?: string, deltaLink?: string, maxPages?: number }
```

"What changed since last time." Pass the `deltaLink` from a previous call to get only what is new.

**A cold start is expensive and this is a Graph constraint, not a choice.** `$deltatoken=latest` is not honoured on this endpoint, so the only route to a usable `deltaLink` is to page to the end of the channel's history once. `maxPages` (default 10) bounds that walk, and a truncated walk returns **no deltaLink at all** — one taken from a partial walk would silently skip every message beyond the cut, which is worse than having none. Truncation is stated in the output rather than hidden. For a one-off skim, `get-channel-messages` is cheaper.

### Reaction Tools

Both post as the signed-in user and return `204 No Content`. `reactionType` is required by Graph even when removing, since a user may hold one reaction of each type on a message.

**Names are mapped to Unicode emoji at the wire.** `setReaction`/`unsetReaction` want the emoji character in the body, not the friendly name — posting the name returns HTTP 400 *"Unicode 'like' in the payload is not supported"*, on `v1.0` and `beta` alike. The tool schema and CLI `--type` keep the friendly names; `REACTION_EMOJI` in `services/message-service.ts` converts immediately before the `.post()`. `like` → 👍, `angry` → 😠, `sad` → 😢 (Graph stores it as "Crying"), `laugh` → 😆, `heart` → ❤️, `surprised` → 😮. Confirmed live against a tenant, not read off the Graph reference, which documents the names. `❤️` is two code points (U+2764 U+FE0F) — keep the variation selector.

#### react-to-channel-message

```typescript
{
  messageId: string,
  replyId?: string,     // react to a reply within the thread instead of the parent
  teamId?: string,
  channelId?: string,
  reactionType?: "like" | "angry" | "sad" | "laugh" | "heart" | "surprised",  // default "like"
  action?: "add" | "remove"  // default "add"
}
```

#### react-to-chat-message

```typescript
{ chatId: string, messageId: string, reactionType?: ..., action?: ... }
```

## Typical Usage Flow

### Device Code (Personal Credentials)

1. **First time:** Call `authenticate` → get URL/code → sign in browser
2. **Discover:** `list-teams` → `list-channels`, or `list-chats`; `find-user` to identify a person
3. **Read:** `get-channel-messages` / `get-chat-messages`, then `get-message-replies` on any thread worth expanding
4. **Find:** `search-messages` when you don't know where something was said; `get-channel-messages-delta` to catch up on a channel you already have a deltaLink for
5. **Act:** `send-direct-message` to DM by name, `reply-to-message`, `send-channel-message`, `send-chat-message`, `mark-chat-read`
6. **Token expired:** nothing to do — it renews silently from the cached refresh token
7. **Refresh token expired or revoked:** `auth-status` reports `expired`; call `authenticate` again

### Client Credentials (App Registration)

1. **Configure env:** Set `TEAMS_AUTH_MODE=client-credentials` + credentials
2. **Use tools directly:** No manual authentication needed

## Key Implementation Details

### Token Caching and Silent Refresh

`src/auth/token-cache.ts` implements an MSAL `ICachePlugin` that persists `tokenCache.serialize()` encrypted with AES-256-GCM under a key derived from hostname + username, at mode 0600:

```
~/.mcp-consultant-tools/teams-token-cache-{clientId}.enc
```

`getAccessToken()` tries the in-memory token, then `getAllAccounts()` → `acquireTokenSilent()`, and only then reports "not authenticated". `InteractionRequiredAuthError` (refresh token expired or revoked) falls back to device code; any other error propagates. This is what makes `offline_access` worth requesting — before v35 the bare access token expired after ~1h and forced a fresh device-code flow.

Pattern follows `packages/powerplatform-core/src/auth/token-cache.ts`. It is **not** shared code: `powerplatform-core` is a PowerPlatform-specific internal library (wrong dependency direction), and `@mcp-consultant-tools/core` has no `@azure/msal-node` dependency — adding one there would pull MSAL into every package in the monorepo.

**Legacy migration.** The pre-v35 plaintext `~/.mcp-consultant-tools/teams-auth.json` is deleted on construction, not migrated. It holds a five-scope token with no refresh token; reusing it silently produces a 403 on every read tool with no visible cause. `logout` removes the MSAL account from the in-memory cache *and* both files, so logout-then-status in one process reports `not_authenticated` rather than resurrecting the account.

**403 handling.** `MessageService` wraps 403s with an explicit "run logout then authenticate" hint, because a stale narrow scope set is invisible from the raw Graph error text.

### @-mentions

Callers write `@[Name or email]` inline in the message. `src/mentions.ts` resolves each marker and returns the paired body + `mentions[]`.

**Both halves or neither.** Graph needs an `<at id="N">` element in the body AND a `mentions[]` entry with the same `id` carrying the resolved AAD user id. An `<at>` with no matching entry renders as a literal tag in the Teams client; an entry with no `<at>` notifies nobody. `buildOutboundMessage()` is the only thing that builds either, so they cannot drift.

**All four outbound paths go through it** — `send-channel-message`, `reply-to-message`, `send-chat-message`, `send-direct-message`. This is why `TeamsService.sendChannelMessage()` now takes raw content plus `format` instead of pre-converted HTML: the MCP tool and the CLI were each calling `markdownToHtml` themselves, so wiring mentions in one and not the other was the likely bug. `src/services/__tests__/outbound-mentions.test.ts` enumerates the four paths in a `describe.each` table for exactly that reason — **if a fifth send path is added, add it there**, because a per-service test cannot catch "works everywhere except reply-to-message".

**Resolution is the same code as `send-direct-message`** — `resolveDirectoryUser()`, module-level in `people-service.ts` rather than a method, because `PeopleService` depends on `TeamsService` and `TeamsService` owns one of the four send paths; a method would be a cycle. So an ambiguous mention behaves like an ambiguous DM recipient: reported with candidates, **message not sent**. An unresolvable marker names itself in the error (`Could not resolve the mention @[Ghost Person]`).

**Ordering: markers become placeholders, not `<at>` elements, before conversion.** The body goes marker → plain alphanumeric placeholder → markdown/escape → sanitise → `<at>`. Injecting `<at>` earlier would mean either widening the DOMPurify tag allowlist or watching the sanitizer strip the markup that was just added. The consequence is that the `<at>` fragment is the one thing NOT sanitised, so the display name is HTML-escaped explicitly — a directory display name can contain anything.

Other behaviour worth knowing: the same person mentioned twice resolves once and reuses one id (two entries render as a duplicate mention); a `format: "text"` message carrying a mention is promoted to HTML with its text escaped, since a mention cannot render from plain text, while still not interpreting markdown; and a message with no markers makes **no directory call at all**, so the common path still works on a token without `User.ReadBasic.All`.

Square brackets are required. A bare `@Jane` is sent as plain text — there is no way to know where the name ends, and guessing would either mention the wrong person or swallow the next word.

### Message Content Conversion

`src/message-content.ts` is the single place message content is converted, in both directions:

- `markdownToHtml()` — outbound. Every send/reply path routes through it, so model-generated markup never reaches Graph unsanitized. Uses `marked` + `dompurify` (bold, italic, code, lists, headings, tables, blockquotes; `<script>`, event handlers and `<img>` stripped).
- `sanitizeHtml()` — outbound, for caller-supplied HTML, same allowlist.
- `htmlToText()` - inbound. Flattens Teams' nested-div bodies to readable text, renders `<at>` mentions as `@Name`, renders `<emoji>` as the character in its `alt`, renders `<a>` as a markdown link so the URL survives, names each `<attachment>` from the message's `attachments[]` array, and replaces images and system events with placeholders (an image's content is a Graph `hostedContents` URL, useless to a reader).

  **`textContent` silently discards an anchor's `href`.** The label survives and reads as ordinary prose, so a message that lost a URL looks intact - there is nothing to notice. Anchors render as `[label](href)`, except where the label is already the URL (Teams auto-links a pasted link, labelling it with itself), which would otherwise produce `[https://x](https://x)`; the comparison sets aside a `mailto:`/`tel:` scheme and a trailing slash.

  **An attachment's identity is not in the body.** The body carries only `<attachment id="...">`; the file name, the URL a preview card points at and the message a reply quotes all live in the sibling `attachments[]` array, so `htmlToText` takes it as a fourth argument and joins on `id`. Without it every attachment of every kind renders as an identical `[attachment]`, and a link card cannot be told from a quoted reply. A `messageReference` attachment carries the quoted message in its `content` as a JSON string (`messagePreview`, `messageSender.user.displayName`) - that text exists **nowhere else in the response**, so not reading it forces the reader to infer which message a reply answered. Same plumbing rule as `mentions[]`: `toMessageInfo` has to pass `message.attachments` through, and an attachment Graph sends with no placeholder in the body is appended rather than dropped.

  **Graph emits one `<at>` element per word of a mention**, each with its own `mentions[]` entry, all resolving to the same entity — so "Jane Doe" arrives as two elements and rendered naively becomes `@Jane @Doe`. `htmlToText` takes the message's `mentions[]` as a third argument and coalesces runs of `<at>` elements **keyed on the resolved entity id** (`mentioned.user.id`, else `conversation`/`application`/`tag`). Key on the entity, never on adjacency: two different people mentioned back to back are also adjacent, and merging those would invent a name nobody wrote. With no `mentions[]` there is nothing to key on, so each element renders separately rather than being guessed at — which means **the argument has to actually be plumbed through `toMessageInfo`**, and a test asserts that end to end rather than only testing the renderer in isolation.

  `<emoji>` elements carry the character in `alt` and have no text content, so without an explicit branch every emoji silently vanishes from a message body.
- `truncateText()` — caps each rendered body so one wide read cannot exhaust a context window.

This function was previously duplicated as a private `markdownToHtml` in both `tools/send-message.ts` and `cli/commands/message-commands.ts`. Neither calls it now: both pass raw content and a `format` to the service, and `buildOutboundMessage()` in `src/mentions.ts` is the single entry point that converts, sanitises and resolves mentions. Call that rather than `markdownToHtml` directly on any new send path — it is what keeps the body and the `mentions[]` array in step.

### Read Tool Design

Output volume is the main risk. Reads default to 20 messages (Graph max 50 via `top`), and `get-channel-messages` deliberately does **not** expand each thread's replies — `get-message-replies` is separate so a wide skim stays cheap. Every rendered message carries its `id`, because that is the input `reply-to-message` needs.

Date ranges behave differently per surface, and this is a Graph constraint rather than a choice: chat messages support `$filter` server-side but **only when `$orderby` names the same property**, so ranges are expressed against `lastModifiedDateTime` (the one property accepting both `gt` and `lt`). Channel messages support neither `$filter` nor `$orderby`, so the range is applied client-side over the fetched page.

### Testing

`npm run test --workspace=packages/teams` (vitest). `src/services/__tests__/message-service.test.ts` stubs the fluent Graph chain and asserts the exact path/query that would go on the wire, using **real response payloads copied from the Graph v1.0 reference** for each endpoint. This exists because the two failure classes here — wrong endpoint path/query and mishandled response shape — are catchable without credentials, while permission failures are not.

**Assert what a query must NOT contain, not only what it does.** `listTeams` sent `$top` on `/me/joinedTeams` for several releases; Graph rejects that with `Query option 'Top' is not allowed`, so every device-code call 400'd. A stub-based test asserting "the built query matches expectations" would have passed on the broken code, because the expectation *was* the broken query. `teams-service.test.ts` asserts `.top()` is never called on that endpoint. When adding an endpoint, ask which query options it rejects and pin those as absences.

**The same failure has now happened twice — the second time on a request body.** The reaction tools shipped in `35.0.0-beta.3` posting the friendly name as `reactionType`; Graph wants the emoji, so every reaction 400'd while four unit tests asserting `{ reactionType: 'heart' }` stayed green. A stub can only ever prove the code agrees with itself; it cannot prove the server accepts the payload. So: `message-service.test.ts` now also asserts no posted `reactionType` matches `/^[a-z]+$/`, and **where a change touches the shape or value of a Graph request body, get one live confirmation before release or state plainly in the release notes that the payload is unverified.**

**Three times now, and the third was a response shape.** `search-service.test.ts` asserted against a `channelHit()` fixture carrying `webUrl`, copied from the Graph reference; a live hit carries `webLink`, so the mapper read a property that does not exist and every hit came back without its deep link, silently, under green tests. Two lessons beyond the one above. **A fixture copied from documentation is not evidence** — it proves the code matches the docs, and the docs were wrong here while this repo's own `TEAMS_TECHNICAL.md` had recorded `webLink` correctly from live research. And **an optional field that is always absent looks exactly like an optional field that is absent this time**: where a response property is worth mapping at all, assert it is populated from a fixture captured live, not merely that the mapping compiles.

**Four times, and the fourth was a fixture that was too clean.** `channelHit()` carried no `chatId` and `chatHit()` carried no `channelIdentity`, so the two kinds were trivially separable in tests and the `hit.channelId` discriminator looked sound. Live, Graph sends both fields on both kinds, and the discriminator matched everything. A fixture that *omits* what the server always sends is as wrong as one that names a field incorrectly, and it is more dangerous, because it makes the tests agree with a rule that only holds in the fixture. **When a fixture is the basis for telling two cases apart, capture both kinds live and diff them** — the discriminator is only as good as the narrowest real example you have seen.

## Reference

See `docs/plans/teams-mcp-server.md` for full design documentation.

## CLI Usage

Binary: `mcp-teams-cli`. Every MCP tool has a matching command (parity is non-negotiable in this repo).

```bash
# Auth
mcp-teams-cli auth login
mcp-teams-cli auth status
mcp-teams-cli auth logout

# Discovery
mcp-teams-cli list-teams
mcp-teams-cli list-channels <teamId>

# Channel reads
mcp-teams-cli get-channel-messages --top 20
mcp-teams-cli get-channel-messages -t <teamId> -c <channelId> --since 2026-08-01T00:00:00Z
mcp-teams-cli get-message-replies <messageId>

# Channel writes
mcp-teams-cli send-message "Hello from CLI!"
mcp-teams-cli send-message "@[jdoe@example.com] can you review this?"
mcp-teams-cli reply-to-message <messageId> "Thanks @[Jane Doe], looking now"

# Chats
mcp-teams-cli list-chats --members
mcp-teams-cli get-chat-messages <chatId> --top 10
mcp-teams-cli send-chat-message <chatId> "On my way"
mcp-teams-cli mark-chat-read <chatId>

# People
mcp-teams-cli find-user "Jane Doe"
mcp-teams-cli find-user jdoe@example.com --top 5
mcp-teams-cli send-direct-message jdoe@example.com "Running five minutes late"

# Search and delta
mcp-teams-cli search-messages "release notes" --top 10
mcp-teams-cli search-messages '"budget review"' --from 20
mcp-teams-cli get-channel-messages-delta --max-pages 20
mcp-teams-cli get-channel-messages-delta --delta-link "<deltaLink from the previous run>"

# Reactions
mcp-teams-cli react-to-channel-message <messageId> --type heart
mcp-teams-cli react-to-channel-message <messageId> -r <replyId>
mcp-teams-cli react-to-chat-message <chatId> <messageId> --remove
mcp-teams-cli react-to-chat-message <chatId> <messageId> --action remove   # same thing, MCP spelling
```

Add `--json` for raw JSON. **Read** responses are also written to `.context/.mcp-teams-cache/` under the current working directory, because an agent greps that instead of re-running the call.

**Write commands persist nothing** (`persist: false` on the `outputResult` wrapper in `cli/output.ts`). Their payload is only an echo of the arguments, so the file has no grep value, and creating `.context/` in whatever directory the command was run from is a surprise — on a real machine that meant a new directory inside a cloud-synced folder, which then synced. A test asserts the *absence* of both the file and the directory.

This convention is now repo-wide — see [`.claude/refs/cli-architecture.md`](../../.claude/refs/cli-architecture.md) for the full list of packages and the classification rule.

`--type` is validated in the CLI too. An unknown reaction name has no emoji mapping, so it reached Graph as an empty `reactionType` and came back as *"ReactionType cannot be null or whitespace"* — an error pointing at the wrong thing, since the user typed a word rather than leaving it blank. The MCP tools were never affected: their zod enum rejects it first.
