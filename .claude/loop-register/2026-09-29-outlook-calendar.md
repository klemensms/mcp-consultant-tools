# Loop register: Outlook calendar tools

Chain: `docs/superpowers/plans/2026-09-29-outlook-calendar.md`. Origin session built Tasks 1 to 8 (a537b1d..28de93c). Append items; change `State`; never rewrite or delete.

### ⚑1 · The maintainer's own calendar switch values are not confirmed
- **Kind:** decision
- **Hop:** origin · 28de93c
- **State:** closed, hop 1: the maintainer chose the recommended set on 2026-09-29; applied to the global config and verified with `auth status`
- **Matters because:** Task 9 writes them into the maintainer's global MCP config. Recommended: SHARED on, WRITE on, INVITE on (every invite, update, cancel and respond guarded per message by the send guard, extended in the same task), DELEGATE off, `OUTLOOK_TIME_ZONE=Europe/London`. Ask once before editing; the plan's Task 9 Step 2 says so.

### ⚑2 · Graph may not honour an IANA zone in `Prefer: outlook.timezone`
- **Kind:** assumption
- **Hop:** origin · 28de93c
- **State:** closed, live test 2026-09-29: reads came back in Europe/London; no mapping needed
- **Matters because:** reads would come back in UTC instead of UK time. Inputs are unaffected (always sent as UTC). Each event returns the zone it is in, so the agent is not misled either way; the fix, if needed, is mapping IANA to a Windows zone name in `preferZone`. Settled by the first live read in Task 10.

### ⚑3 · The create response may not carry the Teams join URL yet
- **Kind:** assumption
- **Hop:** origin · 28de93c
- **State:** open, narrowed: a read seconds after create carried the join URL, but the POST response itself and the recording path were not exercised; settles on the first real `recordAutomatically` use
- **Matters because:** `setRecording` in `calendar-write-service.ts` reads `onlineMeeting.joinUrl` from the `POST /me/events` response and reports "not a Teams meeting" when it is missing. If Graph fills it in only moments later, recording would silently not be set on new meetings. Fix if seen live: one `GET` of the event before giving up. Only matters when `recordAutomatically` is asked for.

### ⚑4 · Live test waits for four delegated permissions on the Outlook app registration
- **Kind:** deferred
- **Hop:** origin · 28de93c
- **State:** closed, 2026-09-29: all four granted; `access.calendar` shows every group granted; Task 10 run
- **Matters because:** nothing calendar-related has run against Graph. `mail-auth-status` at 07:48 on 2026-09-29 showed only Mail.ReadWrite, Mail.Send and User.ReadWrite. Calendars.ReadWrite, Calendars.ReadWrite.Shared, OnlineMeetings.ReadWrite and Files.Read.All were requested from IT the same morning. Task 10 cannot start until `access.calendar` shows them granted.

### ⚑5 · Changing only the recording option on a meeting needs the invite switch
- **Kind:** gotcha
- **Hop:** origin · 28de93c
- **State:** already-recorded-in:docs/technical/OUTLOOK_TECHNICAL.md (Calendar, switches) and packages/outlook/CLAUDE.md (Rules) (closing hop)
- **Matters because:** `updateEvent` gates on whether the event has attendees, so `recordAutomatically` alone on a meeting with attendees needs `OUTLOOK_ENABLE_CALENDAR_INVITE` even though Graph notifies nobody. Conservative by design; document it rather than loosen it.

### ⚑6 · Release notes deferred until the maintainer has tested locally
- **Kind:** deferred
- **Hop:** origin · 28de93c
- **State:** open (deferred): run `/product-releasenotes beta` when the next beta is cut (closing hop)
- **Matters because:** the next beta's master release notes must list the calendar tools, the five new variables and the three permissions. The maintainer asked for no beta yet; run `/product-releasenotes beta` when one is cut.

### ⚑7 · The send guard gates every calendar update, not only ones naming attendees
- **Kind:** gotcha
- **Hop:** 1
- **State:** already-recorded-in:~/.claude/hooks/global/outbound-send-guard.py (comment above CALENDAR_ALWAYS, written in hop 1) (closing hop)
- **Matters because:** the plan said to gate `calendar-update-event` only when the input carries attendees, but moving an existing meeting notifies everyone already on it and the hook cannot see the event. So every update needs the maintainer's yes, including a move of his own appointment. If that proves noisy, the fix belongs in the server (report who would be notified) rather than loosening the hook.

### ⚑8 · The calendar CLI run through Bash is not gated by the send guard
- **Kind:** gotcha
- **Hop:** 1
- **State:** already-recorded-in:~/.claude/hooks/global/outbound-send-guard.py (module docstring, NOT gated paragraph) (closing hop)
- **Matters because:** `node packages/outlook/build/cli.js calendar create|update|cancel|respond` sends invites with no per-message approval, the same as the mail CLI's send today. Only the MCP tools are gated. The server switches still apply. Add a Bash pattern to the hook if agents start using the CLI for scheduling.
