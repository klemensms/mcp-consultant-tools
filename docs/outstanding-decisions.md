# Outstanding decisions

> Every decision still waiting on the maintainer sits here and nowhere else. An entry is removed the moment it is answered; the answer is recorded in the owning plan's Status section and git history keeps what was asked. Numbers are never reused. Next number: **D-002**. Edited only by the monitor session running the current plan. This repo is public: where a decision involves internal text (a ticket, a message), the entry points to the private record that holds it, and the question put to the maintainer in chat carries the full text.

## D-001 · When should the request for the two new app registrations (Outlook and SharePoint) be raised? (plan `docs/superpowers/plans/2026-09-23-delegated-outlook-sharepoint.md`, § What to request from your IT administrator)

**What this is, in plain words.** The build can be tested locally for SharePoint on an existing registration, but it needs two new registrations of its own, one for Outlook and one for SharePoint, and Outlook cannot be tested live at all until its registration exists. The request text is drafted in the maintainer's private task record, not here, because it names internal systems.

**Why it needs an answer.** Sending a request to IT is the maintainer's call, and an internal discussion about agent access to mail and files is scheduled for 24 September, which the timing should respect.

**Options.**
- **A.** Raise one request for both registrations after the 24 September discussion, once the SharePoint permission test has finalised the permission list.
- **B.** Raise it now, before the discussion.
- **C.** Raise SharePoint now and Outlook after the discussion, as two requests.

**Recommendation: A**, because one request after the discussion cannot be mistaken for a move inside it, and by then the SharePoint test will have settled whether a second file permission is needed. Reverses if the discussion is postponed and the Outlook testing becomes urgent.

*Raised 2026-09-23 20:45 by the monitor session `mcp-consultant-tools-07` from the delegated Outlook and SharePoint plan. Owning file: the plan named in the heading, plus the maintainer's private task for the request text.*
