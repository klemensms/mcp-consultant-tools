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
- [x] AV-1 package tests pass - `npm test --workspace=packages/outlook` exits 0
- [x] AV-2 package builds - `npm run build --workspace=packages/outlook` exits 0
- [x] AV-3 nine calendar tools registered - `grep -c "server.tool(" packages/outlook/src/tools/calendar-*.ts` totals 9
- [x] AV-4 CLI parity - `node packages/outlook/build/cli.js calendar --help` lists calendars, events, event, schedule, find-times, create, update, cancel, respond
- [x] AV-5 every switch refuses before any Graph call - `npm test --workspace=packages/outlook -- calendar-switches` exits 0
- [x] AV-6 no permanent delete and no transcription property - `grep -rniE "permanentDelete|transcri" packages/outlook/src/services/calendar-*.ts` prints only comments
- [x] AV-7 no stdout writes outside the CLI printer - `grep -rn "console.log" packages/outlook/src` prints only `cli/output.ts`
- [x] AV-8 no dashes in changed files - `git diff --name-only 8827a71 | xargs grep -lP "\x{2014}|\x{2013}"` prints nothing
- [x] AV-9 local MCP server lists 29 tools and reports `access.calendar` - mcp-test-runner with `MCP_TEST_TOOL=mail-auth-status`. Evidence 2026-09-29 08:39: "Server has 29 tools", TEST PASSED, `access.calendar` lists six groups, none granted yet.
- [x] AV-10 global config points at the local build with the confirmed calendar switches - `node -e` read of `~/.claude.json` `mcpServers.outlook`. Evidence 2026-09-29 08:47: args point at `packages/outlook/build/index.js`; SHARED, WRITE, INVITE true, DELEGATE false, zone Europe/London; `auth status` under that env reports those five groups enabled as set.
- [x] AV-11 send guard covers the invite tools - sample PreToolUse JSON for `mcp__outlook__calendar-create-event` with attendees is denied. Evidence 2026-09-29: create with attendees or optional attendees DENY then ALLOW on the identical retry; create without attendees ALLOW; update (even with no attendees in the input), cancel and respond DENY; list-events ALLOW; mail-send still DENY. A settings matcher for the four calendar write tools was added, since the existing send/reply matcher never fired for them.
- [ ] AV-12 live read and own-calendar write pass once permissions exist - Task 10 steps 1 to 3 results recorded

## User-verifiable (handoff required)
- [ ] After `/mcp` reconnect, asking the agent "what's on my calendar tomorrow" returns the right events in UK time
- [ ] The test invitation arrives with the approved subject and text, moves, and is cancelled
- [ ] A colleague's shared calendar reads with the details you expect
- [ ] Suggested meeting times look sensible for a real scheduling request

## Verification
- AV-1: `npm test --workspace=packages/outlook` -> 14 files, 160 tests passed (2026-09-29, f337995)
- AV-2: `npm run build --workspace=packages/outlook` -> exit 0 (2026-09-29, f337995)
- AV-3: `grep -c "server.tool(" .../calendar-*.ts` -> read 5, write 4
- AV-4: `calendar --help` -> calendars, events, event, schedule, find-times, create, update, cancel, respond
- AV-5: calendar-switches.test.ts passes inside AV-1 (read shared, write, invite, delegate refusals with zero requests)
- AV-6: grep prints only the two comment lines in calendar-write-service.ts setRecording
- AV-7: console.log only in cli/output.ts (pre-existing CLI printer, stdout is correct there)
- AV-8: `git diff --name-only 8827a71 | xargs grep -lP` -> no files
