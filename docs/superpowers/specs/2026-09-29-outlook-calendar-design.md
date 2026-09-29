# Outlook calendar: reading calendars and scheduling meetings

Date: 2026-09-29. Status: approved design. Builds on `docs/superpowers/specs/2026-09-23-delegated-outlook-sharepoint-design.md` and `docs/superpowers/specs/2026-09-28-sharepoint-content-and-outlook-drafts-design.md`.

## Goal

Let an agent read the signed-in user's calendar, colleagues' shared calendars and anyone's free/busy, and help schedule: create, change and cancel appointments and meetings, and answer invitations. Anything that notifies another person, and anything that acts on someone else's calendar, is off until the user switches it on.

## Where it lives

In the existing `@mcp-consultant-tools/outlook` package, beside the mail tools. It is the same Outlook app, the same sign-in and the same app registration, and invitations arrive and are answered through the mailbox. A separate server would need a fourth registration and a second sign-in for no gain. The calendar code sits in its own service and tool files so mail and calendar change independently.

## Permissions

Delegated only, requested through `.default` like the mail permissions. Each missing permission breaks only the tools that need it, with a 403 hint that names it.

| Delegated permission | Covers |
|---|---|
| `Calendars.ReadWrite` | The user's own calendar (read, create, update, cancel, delete, respond) and `getSchedule` free/busy. `.Shared` does not cover the user's own calendar, so both are needed. |
| `Calendars.ReadWrite.Shared` | Colleagues' calendars shared with the user, calendars the user is a delegate on, and `findMeetingTimes`. |
| `OnlineMeetings.ReadWrite` | Only the per-meeting record-automatically option. |

## Switches

Every switch is off unless set to exactly `true`, like the mail switches. A switched-off tool stays registered, refuses before any Graph call and names the variable that enables it.

| Switch | Turns on |
|---|---|
| none | Own calendar, free/busy for anyone in the organisation, suggested meeting times |
| `OUTLOOK_ENABLE_CALENDAR_SHARED` | Reading colleagues' calendars that are shared with the user, with full details |
| `OUTLOOK_ENABLE_CALENDAR_WRITE` | Creating, changing and deleting appointments on the user's own calendar that notify nobody |
| `OUTLOOK_ENABLE_CALENDAR_INVITE` | Anything that notifies another person: invitations, updates to a meeting with attendees, cancellations, and accepting, tentatively accepting or declining an invitation |
| `OUTLOOK_ENABLE_CALENDAR_DELEGATE` | Any change to a calendar the user is a delegate on. A delegate change that notifies people needs `OUTLOOK_ENABLE_CALENDAR_INVITE` as well. |

Which switch a call needs is decided from what the call does, not from which tool it is: `calendar-create-event` with no attendees needs only the write switch; the same tool with attendees needs the invite switch. Deleting a meeting that has attendees sends them a cancellation, so it needs the invite switch too. Graph sends invitations the moment a meeting with attendees is created or changed, and there is no draft meeting, so the invite switch is the only thing standing between the agent and another person's inbox.

`mail-auth-status` reports each calendar group, the permission it needs, whether the token carries it and whether its switch is on.

## Tools

Every tool has a matching `mcp-outlook-cli calendar ...` command.

| Tool | Does | Graph |
|---|---|---|
| `calendar-list-calendars` | The user's calendars, plus shared calendars they have added | `GET /me/calendars` |
| `calendar-list-events` | Events in a date range, for the user or a named colleague (email), with each occurrence of a repeating meeting listed | `GET /me/calendarView`, `GET /users/{email}/calendarView` |
| `calendar-get-event` | One event in full | `GET /me/events/{id}` or the colleague's equivalent |
| `calendar-get-schedule` | Free/busy for several people at once, including people who share nothing; subject and location only where their settings allow | `POST /me/calendar/getSchedule` |
| `calendar-find-meeting-times` | Suggested slots for a set of attendees, a duration and a time window | `POST /me/findMeetingTimes` |
| `calendar-create-event` | An appointment, or a meeting with attendees | `POST /me/events` (delegate: `/users/{email}/events`) |
| `calendar-update-event` | Change the time, title, location, body or attendees | `PATCH .../events/{id}` |
| `calendar-cancel-event` | Cancel a meeting the user organises, with a message to attendees; or delete the user's own appointment | `POST .../events/{id}/cancel`; `DELETE .../events/{id}` |
| `calendar-respond-to-event` | Accept, tentatively accept or decline an invitation, with an optional comment | `POST .../events/{id}/accept`, `/tentativelyAccept`, `/decline` |

### Defaults

1. **A new meeting with attendees gets a Teams link** (`isOnlineMeeting: true`, `onlineMeetingProvider: teamsForBusiness`) unless the call says not to. An appointment with no attendees gets none.
2. **Record automatically is off.** `calendar-create-event` and `calendar-update-event` take `recordAutomatically`, default false. When true, after the event exists the server finds its online meeting (`GET /me/onlineMeetings?$filter=JoinWebUrl eq '...'`) and sets `recordAutomatically: true` on it. It only takes effect before the meeting starts. The server never sets any transcription option: Graph has no setting that starts transcription alone, and recording would keep video the user does not want.
3. **A change to a repeating meeting applies to the occurrence named.** It changes the whole series only when the call names the series id. `calendar-list-events` returns both ids.

## Behaviour

1. **Every change says who was notified.** Each write result ends with either the list of people Graph notified or the statement that no one was notified.
2. **Event bodies are untrusted.** Any tool that returns a body passes it through `wrapUntrusted`, as the mail tools do.
3. **Only meetings the user organises can be changed or cancelled**, or on a delegate calendar, meetings the calendar owner organises. For a meeting someone else organises, update and cancel refuse and point to `calendar-respond-to-event`; a change there would alter only the user's own copy and mislead them.
4. **Delete moves to Deleted Items.** Never `permanentDelete`. The absence is pinned by a test.
5. **Times are in the user's time zone:** `OUTLOOK_TIME_ZONE` (an IANA name such as `Europe/London`), defaulting to the machine's zone. Reads send `Prefer: outlook.timezone` with it; a time given without a zone is read in it and sent to Graph as UTC. The mailbox's own zone setting would need `MailboxSettings.Read`, which the registration does not carry.
6. **Private appointments on a colleague's calendar show as busy with no details.** The server returns what Graph returns and does not try to get around it.
7. **Recording on a delegate calendar is skipped with a message.** The organiser there is the calendar owner, and Microsoft does not document a delegate updating the owner's online meeting.
8. **Free text in queries is encoded by the service**, as the mail read service already does.
9. **A failed recording step does not hide a sent invitation.** The event is created first, so when setting `recordAutomatically` fails (for example without `OnlineMeetings.ReadWrite`), the result still says the meeting exists and who was notified, then says recording was not set and why.

## Testing

1. **Tests first**, using `src/__tests__/graph-recorder.ts`, asserting the request on the wire including absences: no attendees on a write-only appointment, no `onlineMeetings` call unless `recordAutomatically` is true, no transcription property ever, no `permanentDelete`, and every switch refusing before any Graph call.
2. **MCP local tester** against the built server.
3. **Live test once the permissions are granted**, on the tester's own calendar: create, move and delete an appointment that notifies nobody; free/busy; suggested times; read one shared calendar. The invite, update and cancel path is tested with one colleague the maintainer has approved, using the exact subject, body and cancellation text the maintainer approved, cancelled within a minute.
4. **Not tested live:** delegate calendars (the tester has none) and responding to an invitation (it needs someone to send a test invitation). Both are covered by unit tests only, and the technical doc says so.

## Outside this repo

The maintainer's local send-approval hook is extended to the invite, update, cancel and respond tools, so each waits for approval the way mail sends do.

## Documentation

`docs/technical/OUTLOOK_TECHNICAL.md` (full reference), `docs/documentation/OUTLOOK.md` (config and switches), `packages/outlook/CLAUDE.md` (rules), README tool count. Release notes at the next beta through `/product-releasenotes`.

## Out of scope

Room and resource booking; transcription settings; creating Teams meetings outside the calendar; contacts; editing another person's calendar without delegate access.
