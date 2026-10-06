# Loop register: email tracking, snooze, Dynamics review findings

Chain started 2026-10-06 by the origin session (hop 0). Tasks: T1 track-email in powerplatform-data, T2 email snooze in outlook, T3 check nine review findings and put proposals to the maintainer.

### ⚑1 · An API-created email may not show as tracked in Outlook
- **Kind:** assumption
- **Hop:** origin · d04db39
- **State:** open
- **Matters because:** track-email copies the internet message id into the email activity's messageid, on the belief that the Dynamics App for Outlook and server-side sync both key on it. If they do not, Outlook will not show the email as tracked and server-side sync may create a duplicate. The record in CRM is correct either way; only a live test in the real CRM settles it.

### ⚑2 · A live test of track-email writes to the production CRM
- **Kind:** decision
- **Hop:** origin · d04db39
- **State:** open
- **Matters because:** the maintainer's standing rule makes live systems read-only by default and a proof of concept never writes to one. Unit tests and the safe test environment can prove the record shape, but not ⚑1. A production test needs the maintainer's explicit go-ahead for that one test, and agreement with the Dynamics owner before the tool is used for real.

### ⚑3 · Nine review findings need the maintainer's walk-through before any change
- **Kind:** decision
- **Hop:** origin · d04db39
- **State:** open
- **Matters because:** the hosting monitor's request, approved by the maintainer, is explicit: check each finding against our code, put proposals to him, and change nothing until he has gone through them. A hop that implements first breaks that agreement.

### ⚑4 · The hosting monitor is owed two replies
- **Kind:** deferred
- **Hop:** origin · d04db39
- **State:** open
- **Matters because:** the beta.26 publish confirmation (sign-in hardening plus flow tools move) never reached the hosting monitor, because the session that asked had closed. The current hosting monitor also asked for a reply listing which of the nine findings applied, with commits. Without them, the other copy's owner works from stale information.

### ⚑5 · track-email has not run against any real Dataverse yet
- **Kind:** deferred
- **Hop:** 1 · f6670da
- **State:** open
- **Matters because:** the request shapes are proven only against a fake client. Three behaviours need a real environment: setting Regarding with PATCH on an email that is already Completed (the reuse path), adding attachments before closing, and PATCHing statuscode 3 Sent without Dynamics trying to send. The safe environment's credentials are not on disk (the test configs hold `<from 1Password>` placeholders and the item name is not recorded), so this needs either the maintainer to name the 1Password item or a run in the safe environment from a machine that has it. Do this before ⚑2's production test.

### ⚑6 · Email snooze has no faithful API, so nothing was built
- **Kind:** decision
- **Hop:** 1 · 6ff07d8
- **State:** open
- **Matters because:** Microsoft Graph v1.0 documents no snooze for messages; `snoozeReminder` exists only for calendar events. Outlook's snooze (Outlook on the web and new Outlook only) moves the message to a server-side "Scheduled" folder and Exchange returns it to the Inbox as unread at the chosen time, with no public API. The options, for the maintainer:
  1. **Follow-up flag with a due date (recommended).** Graph's `flag` on a message takes `flagStatus`, `startDateTime` and `dueDateTime`; a reminder can be added through the standard MAPI reminder properties as extended properties. Supported and durable, but the email stays in the Inbox, so it is "remind me", not "hide until".
  2. **Move to a folder now, move back later.** Faithful to "hide until", but this server only runs while a client is connected, so it needs a separate scheduler (a local launchd job or a cloud job) holding the user's sign-in. A missed run leaves the email hidden.
  3. **Imitate Outlook's own snooze** by moving into the "Scheduled" folder and setting the properties Exchange uses. Reverse-engineered and unsupported; could break silently on any Exchange change.
  4. **Do not build.** Snooze stays a one-click action in Outlook itself.
- Sources: https://learn.microsoft.com/graph/api/resources/mail-api-overview , https://learn.microsoft.com/en-us/graph/api/event-snoozereminder?view=graph-rest-1.0
