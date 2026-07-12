export const SERVICE_HEALTH_REVIEW_TEMPLATE = `Review the current health of this Microsoft 365 tenant's services and report what is impacting users right now.

1. Call m365-list-service-health to see the status of every subscribed service. Note any service whose status is not "serviceOperational".
2. Call m365-list-health-issues with isResolved=false to list every currently-unresolved issue across all services.
3. For each unresolved incident (classification "incident"), call m365-get-health-issue to read its impact description and latest update post.
4. For any issue whose status is postIncidentReviewPublished, call m365-get-incident-report to summarise the root cause.

Report:
- Services not fully operational, worst first (interruption before degradation before advisory-only).
- For each active issue: the issue ID, the affected service and feature, the classification (incident vs advisory), the impact on users, and the time of the latest update.
- Whether each issue is Microsoft-side (origin) or something the tenant must act on.
- A short "all clear" only if every service is operational AND there are no unresolved issues — do not infer all-clear from an empty list without confirming both.`;

export const MESSAGE_CENTER_DIGEST_TEMPLATE = `Summarise the Microsoft 365 Message Center posts that this tenant needs to act on.

1. Call m365-list-messages with category="preventOrFixIssue" to find anything requiring action to prevent or fix a problem.
2. Call m365-list-messages with category="planForChange" to find upcoming changes to plan for.
3. Optionally call m365-list-messages with isMajorChange=true to focus on the highest-impact changes.
4. For any message that looks important, call m365-get-message to read the full body and any action-required date.

Report:
- Messages with an actionRequiredByDateTime, ordered by that date (soonest first) — these are deadlines.
- Major changes (isMajorChange=true), grouped by affected service.
- For each, the message ID, title, affected services, category, and what an administrator needs to do.
- Flag anything already past its action-required date.

If truncated is true on any list, say so — the digest then covers only the most recent messages, not the full backlog.`;
