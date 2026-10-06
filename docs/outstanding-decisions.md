# Outstanding decisions

> Every decision still waiting on the maintainer sits here and nowhere else. An entry is removed the moment it is answered; the answer is recorded in the owning plan's or review's Status section and git history keeps what was asked. Numbers are never reused. Next number: **D-012**. Any session may add an entry; the session that acts on the answer removes it. This repo is public: where a decision involves internal text (a ticket, a message), the entry points to the private record that holds it, and the question put to the maintainer in chat carries the full text.
>
> Each entry: what is being decided, why it matters, lettered options, a recommendation, and whether it is a send decision. Answer by number and letter, e.g. "D-002 A, D-003 B".

## Dynamics review findings

Source: [`reviews/2026-10-06-dynamics-review-findings.md`](reviews/2026-10-06-dynamics-review-findings.md). Items 2, 4, 5, 6 and 7 are already approved and fixed.

### D-002 · Finding #1: check names and IDs before they reach a request address
Not a send decision. Today a table name, column name or record ID typed into a tool goes straight into the request address, so a crafted table name can slip past the personal-data masking, and a negative row limit silently drops rows (-5 loses the last 5). Proposal: table, column and relationship names must be plain names (letters, digits, underscore; custom prefixes like `new_` pass); record IDs must be GUIDs; the query tool's row limit must be a whole number of 1 or more. Filters and FetchXML stay unchecked; a limit of 0 still means "everything" where it does today; action names may keep dots. No tool accepts anything else in these places today, so nothing that works now is refused.
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

### D-010 · Reply to the hosting monitor session
Send decision. Recipient: the hosting monitor (another Claude session), sent from this repo's session. Best sent after D-002 to D-007, so the "waiting on the maintainer" line can say what was decided; the draft is updated then. Current draft, whole message:

```
Reply on the nine Dynamics review findings, checked against mcp-consultant-tools (branch release/35.0). Full table: docs/reviews/2026-10-06-dynamics-review-findings.md.

Fixed in our copy, not yet published: #2 (ae3e692), #4 (3b08f4c), #5 (7405ea8), #6 (6fd5f90, not yet checked against a live environment), #7 (ad0788b).

Waiting on the maintainer: #1 (partly applies; record IDs were already checked on writes), #3, #8 (partly; we have no CI publish, releases run locally, so the version-injection part does not apply), #9 (partly; tokens are in an encrypted file but the key is derivable).

One point on your #4 fix: it shares one sign-in result whatever the resource, so a call for a second resource (the Flow endpoint, for us) that joins a Dataverse sign-in would get the Dataverse token. We share the sign-in, then each waiting call repeats the silent lookup for its own resource.

Earlier item: beta.26 published the sign-in hardening (PKCE, state check, loopback binding) and the flow tools move.
```
