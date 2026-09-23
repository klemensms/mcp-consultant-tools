# Brief: build delegated SharePoint mode and the new Outlook server

**Monitor:** session `mcp-consultant-tools-07` (tab `🔭 monitor · m365-mcp (07)`). Report to it by name with `SendMessage` after every task. It is not watching your tab.

**Your tab label:** `m365-build · <what you are doing>` while working; `⏳ KS - m365 sign-in` only while you are waiting on the user.

## What to build

Execute `docs/superpowers/plans/2026-09-23-delegated-outlook-sharepoint.md`, Tasks 1 to 7 in order. The spec it implements is `docs/superpowers/specs/2026-09-23-delegated-outlook-sharepoint-design.md`. Read both before starting, then print the session banner below.

Real test targets (the SharePoint test site, and which app registration to use for local testing) are in the untracked file `.claude/briefs/delegated-m365-test-targets.local`. Read it; never copy its values into anything tracked. This repo is public and its pre-commit hook scans for internal identifiers.

## Rules

1. **Run as a handoff loop** (`/handoff-04-loop` mechanics, `session-handoff` skill). Hand off at about **35% context** at the next clean seam: a committed task or sub-slice with the suite green. Before spawning the successor, tell the monitor the successor's tab title, put the monitor's name in the handoff artifact, and spawn the successor as a new tab in the **same cmux workspace**. Your idle notice then means "moved tabs", not "finished"; say so to the monitor.
2. **Test first**, per task: failing test, then code, then green. The package `CLAUDE.md` files and `packages/teams/CLAUDE.md` § Testing explain why absences (query options an endpoint rejects) are pinned too.
3. **Commit per task**, staging explicit paths only; read `git diff --cached --name-status` first. Never `git add -A`, never stage `.claude/log.md` or anything `*.local`. Push to `origin release/35.0` after each task once hooks pass (`git pull --rebase` first if the push is rejected; other sessions share this branch). Internal-identifier hook hits are never bypassed.
4. **No npm publish, no version bumps, no release notes.** Local build and local test only.
5. **Do not touch `packages/teams/`.** Read it as the reference implementation only.
6. **Sign-in needs the user.** Device code cannot be automated. When a live check needs a sign-in, run the CLI `auth login` in the background (detached, so it survives your tab), then relabel your tab `⏳ KS - m365 sign-in`, print the URL and the code as the last thing on screen in a fenced block, and `SendMessage` the monitor the same URL and code so it can relay them. The code expires after 15 minutes; if it lapses, start a fresh one rather than waiting. The moment sign-in completes, relabel back to a working label. The CLI and the MCP server share one encrypted cache, so one sign-in covers every later live check for that server.
7. **A check a query or a render can answer is yours, not the user's.** Run it, record what you saw in the plan's Status section, and leave the user only judgements a tool cannot make.
8. **Record live results in the plan's Status section, newest first, with the commit hash**, and with every identifier removed (no site URL, no tenant or client id, no names). The Task 3 result on whether `Sites.ReadWrite.All` covers search, recent and shared-with-me decides the last row of the IT request; state it plainly.
9. **Decisions for the user go to the monitor**, not to the user directly. The monitor numbers them in `docs/outstanding-decisions.md` and asks. Carry on with any work the decision does not block.
10. **Documents are opened by the monitor.** Do not open files in the cmux docs pane yourself.
11. **Log before you stop** (`/log`, which writes the repo and vault logs), then print the closing block from the `monitoring-sessions` skill as the last thing on screen, closeable line last.

## Session banner (print once, after reading this brief and the plan)

```
=== SESSION: m365-build ===
Purpose:   build sign-in-as-me for SharePoint (existing server) and a new Outlook server, locally, following the committed plan.
Goal:      both servers built, unit-tested, SharePoint live-tested on the test site, and registered locally for the user to try; no publish.
For you:   only the device-code sign-in (a URL and a code, when shown) and any decision the monitor relays.
Not here:  the IT request for the two new app registrations, and whether to publish; both sit with the monitor.
Monitor:   mcp-consultant-tools-07; brief .claude/briefs/2026-09-23-delegated-m365-build.md
```

Every later question to the user opens with two lines: `This session: building delegated SharePoint and Outlook servers.` and `You are deciding: <the question, and what the answer changes>.`
