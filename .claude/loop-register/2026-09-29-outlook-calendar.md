# Loop register: Outlook calendar tools

Chain: `docs/superpowers/plans/2026-09-29-outlook-calendar.md`. Origin session built Tasks 1 to 8 (a537b1d..28de93c). Append items; change `State`; never rewrite or delete.

### ⚑1 · The maintainer's own calendar switch values are not confirmed
- **Kind:** decision
- **Hop:** origin · 28de93c
- **State:** open
- **Matters because:** Task 9 writes them into the maintainer's global MCP config. Recommended: SHARED on, WRITE on, INVITE on (every invite, update, cancel and respond guarded per message by the send guard, extended in the same task), DELEGATE off, `OUTLOOK_TIME_ZONE=Europe/London`. Ask once before editing; the plan's Task 9 Step 2 says so.

### ⚑2 · Graph may not honour an IANA zone in `Prefer: outlook.timezone`
- **Kind:** assumption
- **Hop:** origin · 28de93c
- **State:** open
- **Matters because:** reads would come back in UTC instead of UK time. Inputs are unaffected (always sent as UTC). Each event returns the zone it is in, so the agent is not misled either way; the fix, if needed, is mapping IANA to a Windows zone name in `preferZone`. Settled by the first live read in Task 10.

### ⚑3 · The create response may not carry the Teams join URL yet
- **Kind:** assumption
- **Hop:** origin · 28de93c
- **State:** open
- **Matters because:** `setRecording` in `calendar-write-service.ts` reads `onlineMeeting.joinUrl` from the `POST /me/events` response and reports "not a Teams meeting" when it is missing. If Graph fills it in only moments later, recording would silently not be set on new meetings. Fix if seen live: one `GET` of the event before giving up. Only matters when `recordAutomatically` is asked for.

### ⚑4 · Live test waits for four delegated permissions on the Outlook app registration
- **Kind:** deferred
- **Hop:** origin · 28de93c
- **State:** open
- **Matters because:** nothing calendar-related has run against Graph. `mail-auth-status` at 07:48 on 2026-09-29 showed only Mail.ReadWrite, Mail.Send and User.ReadWrite. Calendars.ReadWrite, Calendars.ReadWrite.Shared, OnlineMeetings.ReadWrite and Files.Read.All were requested from IT the same morning. Task 10 cannot start until `access.calendar` shows them granted.

### ⚑5 · Changing only the recording option on a meeting needs the invite switch
- **Kind:** gotcha
- **Hop:** origin · 28de93c
- **State:** open
- **Matters because:** `updateEvent` gates on whether the event has attendees, so `recordAutomatically` alone on a meeting with attendees needs `OUTLOOK_ENABLE_CALENDAR_INVITE` even though Graph notifies nobody. Conservative by design; document it rather than loosen it.

### ⚑6 · Release notes deferred until the maintainer has tested locally
- **Kind:** deferred
- **Hop:** origin · 28de93c
- **State:** open
- **Matters because:** the next beta's master release notes must list the calendar tools, the five new variables and the three permissions. The maintainer asked for no beta yet; run `/product-releasenotes beta` when one is cut.
