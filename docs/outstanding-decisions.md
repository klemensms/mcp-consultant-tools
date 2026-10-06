# Outstanding decisions

> Every decision still waiting on the maintainer sits here and nowhere else. An entry is removed the moment it is answered; the answer is recorded in the owning plan's or review's Status section and git history keeps what was asked. Numbers are never reused. Next number: **D-011**. Any session may add an entry; the session that acts on the answer removes it. This repo is public: where a decision involves internal text (a ticket, a message), the entry points to the private record that holds it, and the question put to the maintainer in chat carries the full text.
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

### D-005 · Finding #3: lock exact dependency versions in published packages
Not a send decision. Our published packages accept any compatible newer version of their outside dependencies, so a compromised update to one of them reaches users on their next install without a release from us. Proposal: exact versions plus a lock file shipped inside each package, generated during release. Cost: one more release step; every dependency update becomes a deliberate change.
- **A.** Approve for the four Dataverse packages first.
- **B.** Approve for every package.
- **C.** Hold.
- **Recommended: A.** Proves the release step on four packages before rolling it out to all.

### D-006 · Finding #8: keep the publish token away from build scripts, and publish only pushed code
Not a send decision. Our release commands publish from this machine, and `npm publish` re-runs each package's build while the publish token file is on disk, so a compromised build tool could read it. Proposal: publish with build scripts switched off (the clean build has already run), fetch the token only after build and scan, and refuse to publish unless the branch is `release/*`, the working tree is clean and the code matches what is pushed. The reviewer's "release from main only" does not fit our beta flow, so this is the equivalent.
- **A.** Approve.
- **B.** Hold.
- **Recommended: A.** Small change to the two release commands, no effect on what ships.

### D-007 · Item 10: tighten the local-file guard used for attachments
Not a send decision. An email the agent reads could ask it to attach a key file. The guard already refuses hidden folders, Library/AppData and key-shaped names. A hard link inside the home folder pointing at a key file elsewhere would still pass. Proposal: refuse files with more than one hard link, and add `.ppk` and `.kdbx` to the refused names, in all three copies (Dataverse, Outlook, SharePoint). The remaining timing gap needs something already able to write to the home folder and is left alone.
- **A.** Approve.
- **B.** Hold.
- **Recommended: A.** Small, and hard-linked user documents are rare.

## Email tracking and snooze

### D-008 · Email snooze: which approach, if any
Not a send decision. Microsoft's API has no snooze for email; Outlook's own snooze has no public interface. Options:
- **A.** Follow-up flag with a due date and reminder. Supported and durable; the email stays in the Inbox, so it is "remind me", not "hide until".
- **B.** Move to a folder now and back later. Needs a separate scheduler holding your sign-in; a missed run leaves the email hidden.
- **C.** Imitate Outlook's snooze folder. Unsupported; could break silently.
- **D.** Do not build; snooze stays a click in Outlook.
- **Recommended: A.**

### D-009 · Live test of track-email
Not a send decision. track-email (records an Outlook email in Dynamics) is proven only against a fake client. Three behaviours need a real environment, then one needs production: whether Outlook then shows the email as tracked. Production is read-only by default, so that test needs your explicit go for that one test.
- **A.** Name the 1Password item for the safe test environment; test there first, then ask again about production.
- **B.** Test in the safe environment, and also allow one production test on an email you choose.
- **C.** No live test for now.
- **Recommended: A.** Proves the record shape without touching production.

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
