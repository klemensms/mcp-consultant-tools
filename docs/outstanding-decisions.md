# Outstanding decisions

> Every decision still waiting on the maintainer sits here and nowhere else. An entry is removed the moment it is answered; the answer is recorded in the owning plan's or review's Status section and git history keeps what was asked. Numbers are never reused. Next number: **D-022**. Any session may add an entry; the session that acts on the answer removes it. This repo is public: where a decision involves internal text (a ticket, a message), the entry points to the private record that holds it, and the question put to the maintainer in chat carries the full text.
>
> Each entry: what is being decided, why it matters, lettered options, a recommendation, and whether it is a send decision. Answer by number and letter, e.g. "D-002 A, D-003 B".

## D-012 · Live test of sending a file with a Teams message
Send decision. The maintainer's live-test rule (2026-10-13) allows test messages to one designated colleague, but the send guard still asks for a yes on the exact text. Recipient: that colleague, by direct message (named in the chat question; internal names stay out of this public repo). Attachment: `~/Downloads/teams-mcp-attachment-test.docx` (one line: "Teams MCP attachment test, 2026-10-07. If you can read this, the file opened."). Whole message:

```
Live test from an agent - please open the attached Word file and reply "opened" or "could not open".

This checks that files sent through the Teams MCP open for the recipient without a request-access step. Nothing else needed.
```
- **A.** Send it.
- **B.** Change the text (say how).
- **Recommended: A.** Proves the chat upload and sharing path; the channel path stays unproven under the rule, which covers direct messages only.

## D-019 · Let marked test messages to the test colleague through the send guard
Not a send decision. The send guard (`~/.claude/hooks/global/outbound-send-guard.py`, machine-local) already lets a deploy note to the private dev channel through without a yes. The same exception for live tests: a Teams direct message to the designated test colleague whose first line starts "Live test from an agent", or an email to them whose subject starts "Test only" or "Test -", goes through without a yes. Anything else still needs one.
- **A.** Add the exception.
- **B.** Keep a yes on every test message.
- **Recommended: A.** Matches the rule you set; the marker in the first line is checked by the guard, so an ordinary message to the same person is still gated.

## D-010 · Reply to the hosting monitor session
Send decision. Recipient: the hosting monitor (another Claude session), sent from this repo's session. Can go now. Current draft, whole message:

```
Reply on the nine Dynamics review findings, checked against mcp-consultant-tools (branch release/35.0). Full table: docs/reviews/2026-10-06-dynamics-review-findings.md.

Fixed and published in v35.0.0-beta.27 (powerplatform-core beta.9, powerplatform beta.12, powerplatform-data beta.11, powerplatform-customization beta.8): #2 HTTP client, #3 exact pins plus npm-shrinkwrap, #4 shared sign-in, #5 hasMore, #6 filtered counts (not yet checked against a live environment), #7 callback 404, #8 publish with --ignore-scripts and a release-branch, clean, pushed check (we have no CI publish, so the version-injection part does not apply).

Decided 2026-10-13 and being built: #1 name and ID checks on the data and metadata tools (customization tools left unchecked), #9 tokens move to the OS keychain, memory-only where no keychain is available. The msal-node 7 move is planned for our next major release because it needs Node 20.

One point on your #4 fix: it shares one sign-in result whatever the resource, so a call for a second resource (the Flow endpoint, for us) that joins a Dataverse sign-in would get the Dataverse token. We share the sign-in, then each waiting call repeats the silent lookup for its own resource.

Earlier item: beta.26 published the sign-in hardening (PKCE, state check, loopback binding) and the flow tools move.
```

## D-020 · Ask the directory admins to add a `127.0.0.1` redirect
Send decision. Plan task 7 (switching the PowerPlatform sign-in redirect from `localhost` to `127.0.0.1`) is blocked until the app registration the tools sign in with lists it; switching first would break every Dataverse sign-in. Recipient: the registration lists no owners in Entra (checked read-only 2026-10-13), so only a directory admin can add the redirect; the request goes to them as an IT ticket (team named in the chat question; internal names stay out of this public repo). Whole message:

```
Could you add http://127.0.0.1 as a redirect URI on the app registration our Dataverse MCP tools sign in with (Mobile and desktop platform)?
Please keep the existing http://localhost one for now.
Our sign-in only listens on 127.0.0.1, and localhost can go to IPv6 on some machines I think, so the browser misses it.
Thanks
```
- **A.** Raise it as a ticket with this text.
- **B.** Change the text or recipient (say how).
- **C.** Drop task 7; the sign-in keeps working on `localhost` as it does today.
- **Recommended: C.** Nobody has hit the failure and browsers usually try both addresses, so the gain is mostly theoretical, while A costs a ticket plus a code change. Sign-in keeps working as it does today. Re-raise (option A) only if someone reports a browser sign-in that hangs after the browser says it is done; on C, that condition goes into the plan's task 7 row.

