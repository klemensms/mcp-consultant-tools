export const CREDENTIAL_EXPIRY_AUDIT_TEMPLATE = `Audit this Entra ID tenant for app-registration credentials that are expiring or already expired.

1. Call entra-list-app-registrations with filter='expired-credentials' to find apps already broken or about to fail authentication.
2. Call entra-list-app-registrations with filter='expiring-credentials' and expiryDays=90 to find apps needing rotation this quarter.
3. Call entra-list-app-registrations with filter='no-credentials' to find registrations that hold neither a secret nor a certificate — these are usually unused, or rely on federated credentials.

For each app that needs attention, call entra-get-app-registration to see what it is used for: its API permissions, redirect URIs and exposed scopes tell you who depends on it.

Report:
- Apps with expired credentials, worst first. These may already be failing in production.
- Apps expiring within 30 days, then within 90.
- For each, the credential kind (secret vs certificate), its display name and its keyId, since that is what an operator needs to rotate the right one.
- Apps holding Application-type API permissions, called out separately: a lapsed credential on a highly privileged app is a bigger outage than one on a delegated-only app.

State plainly that this audit covers app registrations only. Credentials added directly to a service principal are a separate collection in Microsoft Graph and were not scanned.`;

export const APP_PERMISSION_REVIEW_TEMPLATE = `Review the API permissions held by app registrations in this Entra ID tenant.

1. Call entra-list-app-registrations (no filter) to enumerate the registrations, or use nameContains to scope to one product.
2. For each app of interest, call entra-get-app-registration and read apiPermissions.

Report:
- Every permission with permissionType='Application'. These are app-only grants that do not need a signed-in user, so they are the ones worth challenging.
- Permissions whose name looks broader than the app plausibly needs (anything ending .ReadWrite.All, Directory.*, or a wildcard-shaped scope).
- Any permission returned with unresolved=true: the resource's service principal could not be read, so only the raw GUID is known and the grant could not be named. Say so rather than guessing.
- Redirect URIs that are not HTTPS, or that point at localhost, in an app that also holds Application permissions.

Do not recommend removing a permission without saying what would break. Name the redirect URIs and exposed scopes that suggest who the consumers are.`;
