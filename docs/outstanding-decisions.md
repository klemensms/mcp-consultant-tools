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

### D-003 · Finding #9: store sign-in tokens in the OS keychain
Not a send decision. Tokens are saved in an encrypted file, but the key is built from the computer name and user name with a fixed value shipped in the public package, so anyone who gets a copy of the file can read the refresh token. Proposal: keep tokens in the macOS Keychain / Windows Credential Manager, falling back to memory only (sign in at every start) where the keychain cannot be used; delete the old file on start; same for the SharePoint/Outlook sign-in. Cost: the keychain library has native parts, so on an unusual machine the install may fall back to memory-only. Everyone signs in once after the upgrade.
- **A.** Approve the keychain cache now, as its own beta.
- **B.** Approve, but only together with the sign-in library upgrade in the next major release.
- **C.** Hold.
- **Recommended: A.** It is the one finding where a stolen file means a stolen login.

### D-006 · Finding #8: keep the publish token away from build scripts, and publish only pushed code
Not a send decision. Our release commands publish from this machine, and `npm publish` re-runs each package's build while the publish token file is on disk, so a compromised build tool could read it. Proposal: publish with build scripts switched off (the clean build has already run), fetch the token only after build and scan, and refuse to publish unless the branch is `release/*`, the working tree is clean and the code matches what is pushed. The reviewer's "release from main only" does not fit our beta flow, so this is the equivalent.
- **A.** Approve.
- **B.** Hold.
- **Recommended: A.** Small change to the two release commands, no effect on what ships.

## Email tracking and snooze

### D-011 · Publish a beta so track-email and the flag reminder can be tested
Not a send decision. You will test track-email yourself (D-009). It is built and committed but not published, so your MCP config cannot reach it yet. The flag due date and reminder (D-008, `8620a4c`, `6c30019`) and the dependency pinning (D-005, `81bb730`, `45977cc`) are also built and committed. Proposal: publish one beta now of the affected packages (powerplatform-core, powerplatform-data, powerplatform, powerplatform-customization, outlook, sharepoint), move your config pins to it and tell you to reconnect.
- **A.** Publish one beta now.
- **B.** Point your config at the local build instead (no publish; only works on this machine).
- **C.** Wait.
- **Recommended: A.** One beta covers everything you will test, and it exercises the new shrinkwrap release step once before production.

What to check when you test track-email, in your own mailbox and the CRM:
1. Track an email that is not yet in the CRM: an email activity appears, completed, with the right Regarding record and any attachments.
2. Track the same email again with a different Regarding: the same activity is reused and Regarding changes (needs the update switch on).
3. In Outlook, the email shows as tracked; the next server-side sync does not create a duplicate.

And the flag reminder: ask the agent to remind you about an email at a set time; Outlook shows it flagged with that due date and the reminder pops at that time. Marking it complete stops the reminder.

## Messages

### D-010 · Reply to the hosting monitor session
Send decision. Recipient: the hosting monitor (another Claude session), sent from this repo's session. Best sent after D-002 to D-007, so the "waiting on the maintainer" line can say what was decided; the draft is updated then. Current draft, whole message:

```
Reply on the nine Dynamics review findings, checked against mcp-consultant-tools (branch release/35.0). Full table: docs/reviews/2026-10-06-dynamics-review-findings.md.

Fixed in our copy, not yet published: #2 (ae3e692), #4 (3b08f4c), #5 (7405ea8), #6 (6fd5f90, not yet checked against a live environment), #7 (ad0788b).

Waiting on the maintainer: #1 (partly applies; record IDs were already checked on writes), #3, #8 (partly; we have no CI publish, releases run locally, so the version-injection part does not apply), #9 (partly; tokens are in an encrypted file but the key is derivable).

One point on your #4 fix: it shares one sign-in result whatever the resource, so a call for a second resource (the Flow endpoint, for us) that joins a Dataverse sign-in would get the Dataverse token. We share the sign-in, then each waiting call repeats the silent lookup for its own resource.

Earlier item: beta.26 published the sign-in hardening (PKCE, state check, loopback binding) and the flow tools move.
```
