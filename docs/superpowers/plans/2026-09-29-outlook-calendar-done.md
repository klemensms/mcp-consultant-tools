---
plan: docs/superpowers/plans/2026-09-29-outlook-calendar.md
created: 2026-09-29
status: open
---

# Done - Outlook calendar tools

## Out of Scope
- No npm publish, version bump or beta release notes; local build only until the maintainer has tested it.
- No transcription setting of any kind; no room or resource booking; no contacts.
- No live test of delegate calendars or of responding to an invitation.

## Agent-verifiable
- [ ] AV-1 package tests pass - `npm test --workspace=packages/outlook` exits 0
- [ ] AV-2 package builds - `npm run build --workspace=packages/outlook` exits 0
- [ ] AV-3 nine calendar tools registered - `grep -c "server.tool(" packages/outlook/src/tools/calendar-*.ts` totals 9
- [ ] AV-4 CLI parity - `node packages/outlook/build/cli.js calendar --help` lists calendars, events, event, schedule, find-times, create, update, cancel, respond
- [ ] AV-5 every switch refuses before any Graph call - `npm test --workspace=packages/outlook -- calendar-switches` exits 0
- [ ] AV-6 no permanent delete and no transcription property - `grep -rniE "permanentDelete|transcri" packages/outlook/src/services/calendar-*.ts` prints only comments
- [ ] AV-7 no stdout writes - `grep -rn "console.log" packages/outlook/src` prints nothing
- [ ] AV-8 no dashes in changed files - `git diff --name-only 8827a71 | xargs grep -lP "\x{2014}|\x{2013}"` prints nothing
- [ ] AV-9 local MCP server lists 29 tools and reports `access.calendar` - mcp-test-runner with `MCP_TEST_TOOL=mail-auth-status`
- [ ] AV-10 global config points at the local build with the confirmed calendar switches - `node -e` read of `~/.claude.json` `mcpServers.outlook`
- [ ] AV-11 send guard covers the invite tools - sample PreToolUse JSON for `mcp__outlook__calendar-create-event` with attendees is denied
- [ ] AV-12 live read and own-calendar write pass once permissions exist - Task 10 steps 1 to 3 results recorded

## User-verifiable (handoff required)
- [ ] After `/mcp` reconnect, asking the agent "what's on my calendar tomorrow" returns the right events in UK time
- [ ] The test invitation arrives with the approved subject and text, moves, and is cancelled
- [ ] A colleague's shared calendar reads with the details you expect
- [ ] Suggested meeting times look sensible for a real scheduling request

## Verification
- (filled in during implementation)
