# Outstanding decisions

> Every decision still waiting on the maintainer sits here and nowhere else. An entry is removed the moment it is answered; the answer is recorded in the owning plan's or review's Status section and git history keeps what was asked. Numbers are never reused. Next number: **D-017**. Any session may add an entry; the session that acts on the answer removes it. This repo is public: where a decision involves internal text (a ticket, a message), the entry points to the private record that holds it, and the question put to the maintainer in chat carries the full text.
>
> Each entry: what is being decided, why it matters, lettered options, a recommendation, and whether it is a send decision. Answer by number and letter, e.g. "D-002 A, D-003 B".

## Repo process

### D-016 · Should sessions merge their own PRs in this repo?
Not a send decision. On 2026-10-08 you said you do not review code PRs here and the session should merge them itself. Recording that in this repo's `CLAUDE.md` makes it apply to every future session, not just this one. Proposed text, under Publishing:

```
**Merging PRs:** the maintainer does not review code PRs in this repo. Once tests pass and the local MCP test is green, the session merges its own PR into the release branch. Publishing still follows the beta and production workflows below.
```
- **A.** Add it as written.
- **B.** Add it, but keep your approval for production releases and for anything touching auth or secrets.
- **C.** Do not add it; ask each time.
- **Recommended: A.** It matches what you asked for today, and the release workflows already hold their own gates.

## Teams file attachments

### D-012 · Live test of sending a file with a Teams message
Send decision. `27f4d16` adds `attachments` to the five Teams send tools; unit tests pass and the live token has the files permission, but no file has been sent yet. Proving it needs three real posts, each carrying a one-line test Word file (`~/Downloads/teams-mcp-attachment-test.docx`), to one colleague: a direct message, a post in the private dev channel shared with them, and a reply under that post. The recipient and the exact text are in the chat question (internal names stay out of this public repo). A recipient opening the file is the only check of the "no request access" requirement.
- **A.** Send all three, then ask the colleague whether each file opened.
- **B.** Send only the direct message (proves the chat path; the channel path stays unproven).
- **C.** Hold; publish to beta with the live send marked unverified.
- **Recommended: A.** Covers both upload routes and the sharing step in one round.

The feature shipped in `teams` 35.0.0-beta.15 (v35.0.0-beta.28, 2026-10-08) with the live send marked unverified, so C has happened by default; A or B still proves it.

## Dynamics review findings

Source: [`reviews/2026-10-06-dynamics-review-findings.md`](reviews/2026-10-06-dynamics-review-findings.md). Items 2, 4, 5, 6 and 7 are already approved and fixed.

### D-002 · Finding #1: check names and IDs before they reach a request address
Not a send decision. Today a table name, column name or record ID typed into a tool goes straight into the request address, so a crafted table name can slip past the personal-data masking, and a negative row limit silently drops rows (-5 loses the last 5). Proposal: table, column and relationship names must be plain names (letters, digits, underscore; custom prefixes like `new_` pass); record IDs must be GUIDs; the query tool's row limit must be a whole number of 1 or more. Filters and FetchXML stay unchecked; a limit of 0 still means "everything" where it does today; action names may keep dots. No tool accepts anything else in these places today, so nothing that works now is refused.
Also covers the second review's points: the same checks on two metadata helpers no tool calls today, and lookup columns such as `_parentcustomerid_value` must pass (they do).
- **A.** Approve for the data and metadata tools; customization tools (developer input) stay unchecked.
- **B.** Approve, including the customization tools (about 160 more places).
- **C.** Hold.
- **Recommended: A.** Closes the masking bypass where untrusted input arrives; no capability limit.

### D-003 · Finding #9: where sign-in tokens are stored (keychain or 1Password)
Not a send decision. Tokens are saved in an encrypted file, but the key is built from the computer name and user name with a fixed value shipped in the public package, so anyone who gets a copy of the file can read the refresh token. Everyone signs in once after any of the changes below. You asked whether 1Password can hold them instead. The sign-in library reads and writes its token store at every server start and every hourly token refresh, in every running server, so where the store lives decides how often you are prompted.
- **A.** OS keychain (macOS Keychain / Windows Credential Manager), falling back to memory only (sign in at every start) where the keychain cannot be used. No prompts. The keychain library has native parts, so an unusual machine may fall back to memory only.
- **B.** 1Password through your own account. Every read or write is a Touch ID prompt, several an hour across servers, and an unanswered prompt fails after 60 seconds, so a server left running while you are away loses its sign-in. Works only for users with the 1Password CLI.
- **C.** 1Password through a service account (a 1Password feature for unattended tools, scoped to one vault). No prompts once set up. Needs the service account created first, which is already on the list as the standing fix for 1Password prompts; until then servers fall back to A.
- **Recommended: A now, C later if wanted.** A closes the hole today with no prompts; C can be added as an option once the service account exists, without undoing A.

### D-013 · Second review: six small sign-in and count fixes
Not a send decision. A second review of the separate copy found these, all confirmed in our code (details in [`reviews/2026-10-06-dynamics-review-findings.md`](reviews/2026-10-06-dynamics-review-findings.md), "Second review"):
1. Sign-in: print the full sign-in address (today cut to 80 characters), keep waiting if the browser fails to open, take a free port in one step, and never redeem a sign-in code twice.
2. Silent sign-in uses the account that last signed in, not whichever account is first in the cache.
3. Counts across a many-to-many relationship join on the right key column (wrong today for a table related to itself).
4. A lookup that fails for any reason (sign-in, permission, network) is reported as that failure, not as "table not found", and is not cached until restart.
5. Counts are formatted the UK way whatever the machine's locale, and every Dataverse request times out after 2 minutes instead of hanging.
6. If the token cache folder cannot be created, the server keeps tokens in memory instead of failing; unfiltered counts say they cover the whole table, not just records you can see.
- **A.** Approve all six, build and test locally, publish in the next beta.
- **B.** Approve some; name the numbers to leave out.
- **C.** Hold.
- **Recommended: A.** Bug fixes with no capability change. Only risk: a Dataverse request that genuinely runs over 2 minutes would now fail.

### D-014 · Sign-in redirect address: localhost or 127.0.0.1
Not a send decision yet. The sign-in sends the browser back to `http://localhost:<port>`, but the server listens on `127.0.0.1` only, so a browser that tries IPv6 first for "localhost" misses the callback and sign-in hangs. The fix is one line, but the Dataverse app registration lists only `http://localhost` as a redirect, and switching before an Entra admin adds `http://127.0.0.1` there breaks every sign-in. You are not the registration's owner.
- **A.** I draft the request to the registration's owner (shown to you before it goes), and switch once it is added.
- **B.** Leave as is until someone reports a sign-in that hangs.
- **Recommended: A.** The failure is intermittent and hard to diagnose when it happens; the fix is cheap once the redirect exists.

### D-015 · Servers report their own version
Not a send decision. A helper in `core` works out the version by walking up from the running script and can report the wrong package's version. Every package already knows its own; the fix uses that. It changes `core`, so it reaches the 18 packages that pin an older `core` only when their pins are bumped.
- **A.** Fix in `core` now and publish with the next beta of `core`; the pinned packages follow when their pins are bumped.
- **B.** Wait for the planned major release that bumps every `core` pin.
- **Recommended: A.** Cosmetic but misleading when debugging, and the fix is small.

### D-010 · Reply to the hosting monitor session
Send decision. Recipient: the hosting monitor (another Claude session), sent from this repo's session. Can go now; it names D-002 and D-003 as still open. Current draft, whole message:

```
Reply on the nine Dynamics review findings, checked against mcp-consultant-tools (branch release/35.0). Full table: docs/reviews/2026-10-06-dynamics-review-findings.md.

Fixed and published in v35.0.0-beta.27 (powerplatform-core beta.9, powerplatform beta.12, powerplatform-data beta.11, powerplatform-customization beta.8): #2 HTTP client, #3 exact pins plus npm-shrinkwrap, #4 shared sign-in, #5 hasMore, #6 filtered counts (not yet checked against a live environment), #7 callback 404, #8 publish with --ignore-scripts and a release-branch, clean, pushed check (we have no CI publish, so the version-injection part does not apply).

Still open with the maintainer: #1 (partly applies; record IDs were already checked on writes), #9 token storage (tokens are in an encrypted file but the key is derivable). The msal-node 7 move is planned for our next major release because it needs Node 20.

One point on your #4 fix: it shares one sign-in result whatever the resource, so a call for a second resource (the Flow endpoint, for us) that joins a Dataverse sign-in would get the Dataverse token. We share the sign-in, then each waiting call repeats the silent lookup for its own resource.

Earlier item: beta.26 published the sign-in hardening (PKCE, state check, loopback binding) and the flow tools move.
```
