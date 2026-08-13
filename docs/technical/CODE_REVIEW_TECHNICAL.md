# Code Review - Technical Documentation

<!-- Agent-facing reference. XML tags structure the content for reliable parsing. -->

<overview>

## Overview

`@mcp-consultant-tools/code-review` is a provider-agnostic MCP server for repository-level code review. It works against **Azure DevOps** or **GitHub Enterprise**, selected at runtime by `CODE_REVIEW_PROVIDER`. It shallow-clones a repository into a temporary directory, runs read-only analyzers over the working tree, and deletes the clone.

Capabilities: .NET target-framework end-of-life scanning, NuGet package auditing against the public NuGet v3 API, a cyclomatic-complexity estimate for C#/TypeScript/JavaScript, a consolidated single-clone review, and a GitHub Packages inventory (GitHub Enterprise only).

**10 tools, all read-only. 2 prompts.** No write operations and no feature flags.

</overview>

<architecture>

## Architecture

- **Client** (`code-review-client.ts`): an axios client configured per provider. Handles repository listing, default-branch lookup, clone-URL construction, and the GitHub Packages REST API. Follows the GitHub `Link` header for pagination and translates HTTP status codes into clear messages.
- **Clone manager** (`utils/clone-manager.ts`): shallow `git clone --depth=1` into `mkdtemp`, with the credential embedded in the clone URL. Guarantees temp-dir cleanup and redacts the credential from any error message.
- **GitHub App auth** (`utils/ghe-app-auth.ts`): RS256 JWT (10-minute expiry, `iat` back-dated 60s) exchanged for a cached installation token.
- **Services** (`services/`): `RepositoryService`, `DotnetVersionService`, `NugetPackageService`, `ComplexityService`, `PackageService`. Business logic only.
- **NuGet** is independent of the provider — it uses the public nuget.org API via an injected JSON fetcher and needs no credential.
- **ServiceContext** in `context-factory.ts` is shared by the MCP server (`index.ts`) and the CLI (`cli.ts`).

</architecture>

<providers>

## Provider matrix

| Capability | azure-devops | github-enterprise | github-app |
|------------|:---:|:---:|:---:|
| list repos / tree / clone-based analysis | ✅ | ✅ | ✅ |
| .NET EOL / NuGet / complexity / review | ✅ | ✅ | ✅ |
| GitHub Packages (`cr-packages`, `cr-package-versions`, `cr-latest-package-version`) | ❌ | ✅ (PAT + `read:packages`) | ❌ |

GitHub Apps cannot authenticate to the GitHub Packages API (a GitHub-confirmed 403). Azure DevOps has no GitHub Packages equivalent. Both refuse those three tools with a clear message.

</providers>

<configuration>

## Configuration

| Variable | Provider | Required | Purpose |
|----------|----------|:---:|---------|
| `CODE_REVIEW_PROVIDER` | all | ✅ | `azure-devops` \| `github-enterprise` \| `github-app` |
| `CODE_REVIEW_AZDO_ORGANIZATION` | azure-devops | ✅ | Organization name |
| `CODE_REVIEW_AZDO_AUTH_METHOD` | azure-devops | optional | `pat` (default) \| `entra-id` |
| `CODE_REVIEW_AZDO_PAT` | azure-devops + `pat` | ✅ | Personal access token, **Code (read)** |
| `CODE_REVIEW_AZDO_CLIENT_ID` | azure-devops + `entra-id` | ✅ | Application (client) ID |
| `CODE_REVIEW_AZDO_CLIENT_SECRET` | azure-devops + `entra-id` | ✅ | Client secret |
| `CODE_REVIEW_AZDO_TENANT_ID` | azure-devops + `entra-id` | ✅ | Directory (tenant) ID |
| `CODE_REVIEW_AZDO_PROJECT` | azure-devops | optional | Default project (fallback for `--project`) |
| `CODE_REVIEW_GHE_BASE_URL` | ghe / ghe-app | ✅ | GHE host, e.g. `https://your-ghe-host` |
| `CODE_REVIEW_GHE_TOKEN` | github-enterprise | ✅ | Classic PAT (`read:packages` for Packages tools) |
| `CODE_REVIEW_GHE_APP_ID` | github-app | ✅ | GitHub App ID |
| `CODE_REVIEW_GHE_INSTALLATION_ID` | github-app | ✅ | Installation ID |
| `CODE_REVIEW_GHE_PRIVATE_KEY_PATH` | github-app | one of | Path to the App private key PEM |
| `CODE_REVIEW_GHE_PRIVATE_KEY` | github-app | one of | Inline PEM (`\n` newlines) |
| `CODE_REVIEW_ALLOWED_REPOSITORIES` | all | optional | Comma-separated repo allowlist |

A missing variable produces a structured error naming every missing variable for the chosen provider
and auth method — never an empty result.

### Azure DevOps service-principal auth

`CODE_REVIEW_AZDO_AUTH_METHOD=entra-id` replaces the person-owned PAT with a client-credentials
token, so an unattended run authenticates as a service identity that does not expire on a personal
schedule. Absent, the variable defaults to `pat` and every pre-existing configuration is unaffected.

- **Token.** `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`,
  `grant_type=client_credentials`, scope `499b84ac-1321-427f-aa17-267ca6975798/.default` (the Azure
  DevOps first-party application ID). Cached in-process and refreshed five minutes before expiry.
- **REST.** Sent as `Authorization: Bearer <token>` in place of PAT basic auth.
- **Clone.** Eight of the ten tools clone the repository. Under `entra-id` the clone URL carries no
  credential; the token is passed as `git -c http.extraHeader=Authorization: Bearer <token>`. That
  header is part of git's argv and git echoes argv back on failure, so the bearer token is redacted
  from clone errors alongside the URL userinfo.
- **Membership prerequisite.** A token issued for a principal that is not a member of the
  organisation is answered `401 TF401444`. This is an identity-provisioning problem, not a bad
  credential, so it is mapped to a named error carrying the principal's object id rather than a
  generic 401. Resolve it under **Organization settings > Users**.
- **Redirects.** Azure DevOps answers a rejected credential with a `302` to a sign-in page rather
  than a `401`. The Azure DevOps HTTP client sets `maxRedirects: 0` and maps `302`/`203` to an
  authentication error; following the redirect would yield HTML with no `value` array and surface an
  auth failure as an `undefined.map` crash.
- **Secret hygiene.** The token-error message is built from the response body only. An axios error
  carries the outbound form body — including the client secret — on `error.config.data`.

</configuration>

<tool-reference>

## Tools

<tool name="cr-list-repos">
List repositories in an Azure DevOps project or GitHub org. Params: `project?`. Returns `{ repositories, count, truncated, filtered }`. `filtered` reflects the repository allowlist; `truncated` means a paging cap was hit.
</tool>

<tool name="cr-tree">
Clone a repository and return its file-tree listing. Params: `project`, `repository`, `branch?`. Returns `{ repository, files, totalFiles }`.
</tool>

<tool name="cr-check-dotnet">
Scan global.json, Directory.Build.props, and .csproj files for target frameworks; flag end-of-life frameworks (computed from published EOL dates); detect CRM/Dataverse SDK usage and ILMerge/ILRepack. Params: `project`, `repository`, `branch?`.
</tool>

<tool name="cr-check-nuget">
Extract PackageReference entries (including Central Package Management and packages.config) and check each against the NuGet API for the latest stable version and for vulnerabilities affecting the referenced version. Params: `project`, `repository`, `branch?`, `checkVulnerabilities?` (default true).
</tool>

<tool name="cr-nuget-info">
Version and vulnerability info for one NuGet package. Params: `packageId`, `currentVersion?`. Vulnerabilities are those affecting `currentVersion`.
</tool>

<tool name="cr-complexity">
Estimate cyclomatic complexity, LOC, and method length for C#/TS/JS. Params: `project`, `repository`, `branch?`, `pathFilter?`, `fileExtensions?` (default `.cs,.ts,.js`), `maxFiles?` (default 5000, 0 = unlimited). Summary reports `truncated` when the cap trims the set. Complexity is an estimate — see known limitations.
</tool>

<tool name="cr-review">
Single-clone consolidated review (.NET EOL + NuGet + complexity) with an overall health verdict and prioritised issues. Params: `project`, `repository`, `branch?`, `includeComplexity?` (default true), `maxFiles?`.
</tool>

<tool name="cr-packages">
List packages in a GitHub Enterprise org. Params: `org`, `packageType?` (default `npm`). Returns `{ packages, count, truncated }`. GitHub Enterprise provider only.
</tool>

<tool name="cr-package-versions">
List all versions of a GitHub Enterprise package. Params: `org`, `packageName`, `packageType?`. Returns `{ versions, count, truncated }`. GitHub Enterprise provider only.
</tool>

<tool name="cr-latest-package-version">
Latest STABLE release version of a GitHub Enterprise package (pre-release/feature builds excluded, SemVer ordering). Params: `org`, `packageName`. GitHub Enterprise provider only.
</tool>

</tool-reference>

<nuget-contract>

## NuGet API contract

- The registration base URL is **discovered** from `https://api.nuget.org/v3/index.json` (preferring `RegistrationsBaseUrl/3.6.0`, gzip + SemVer2), never hardcoded — the docs require dynamic discovery.
- Latest/latest-stable come from the last registration page. When that page is non-inlined (128+ total versions — every popular package), its `@id` is fetched so the data is never silently blank.
- Vulnerabilities are read from each version's `catalogEntry.vulnerabilities` (`advisoryUrl` + `severity` only) for the referenced version.
- "Latest stable" excludes any version with a SemVer prerelease label.

</nuget-contract>

<known-limitations>

## Known limitations

- **Not verified against a live Azure DevOps organization, GitHub Enterprise instance, or authenticated NuGet feed.** No AzDO org, GHE org, or private NuGet feed was available during development. Every REST path, API version, NuGet registration shape, GitHub App JWT flow, and clone-URL construction is verified against the vendors' published documentation and exercised with unit tests against injected stubs — but almost no call in `CodeReviewClient`, `GheAppAuth`, or the NuGet fetcher has run against a real endpoint. The clone path (`git clone`) has not been run against a real repository. Two exceptions, both unauthenticated probes taken while adding `entra-id`: the Entra token endpoint (confirming the client-credentials request shape, via an `AADSTS90002` for a placeholder tenant) and `dev.azure.com` REST (confirming the `302`-to-sign-in behaviour that `maxRedirects: 0` exists to catch).
- **The `entra-id` path has never authenticated successfully.** No service principal is yet a member of an Azure DevOps organization, so an *accepted* token, the `TF401444` response body (mapped from the message quoted in the originating feature request, not from a captured response), and every clone under `entra-id` remain unverified end-to-end.
- **Cyclomatic complexity is a regex-based estimate, not an AST measurement.** Known heuristic ceilings: a `case` or operator inside a string literal can be over-counted; a C# nullable-type declaration (`int?`) can register as a ternary; and decision points inside a nested lambda are counted for both the nested and enclosing method. Reports carry a `methodology` note; treat values as approximate. Upgrade path: a real C#/TS parser if exactness is required.
- **.NET EOL dates are a maintained table** (dates only; `isEol` is computed at runtime). The dates were verified against Microsoft's lifecycle pages and `dotnet/core` in 2026-07; a newly announced date change would need a table edit. Frameworks with no fixed EOL (.NET Framework 4.7.x/4.8/4.8.1, OS-tied) are never flagged.
- **NuGet lookups target nuget.org only.** Packages on a private feed return empty version data (reported as `unknown`), not an error.
- **Listings are capped at 20 pages (~2000 items).** Beyond that, `truncated: true` is returned rather than fetching unbounded pages.

</known-limitations>

<pagination>

## Pagination

GitHub repository, package, and version listings follow the `Link: rel="next"` header up to a 20-page cap, then set `truncated: true`. Azure DevOps repository listing returns all repositories in one response (`truncated: false`). NuGet registration pages are followed by `@id` as needed.

</pagination>

<error-handling>

## Error handling

`CodeReviewClient` translates axios errors for every GHE/AzDO call: 302/203 → Azure DevOps redirected to sign-in, i.e. the credential was rejected; 401 → auth failure, or the named `TF401444` service-principal-not-in-organization error when the body carries it; 403 → missing scope / SSO / rate limit; 404 → not found (with the SAML-SSO hint for org endpoints). The GitHub Packages provider guard throws before any request when the provider cannot use the Packages API. Every MCP tool returns `isError: true` with a message on failure.

</error-handling>

<security>

## Security

- The clone URL embeds the PAT/installation token. On a failed clone the credential is redacted from the thrown message (`redactCloneSecret`), and it is never logged. The temp directory is removed in a `finally` block even when analysis throws.
- Under `entra-id` the clone URL carries no credential at all: the token travels in `git -c http.extraHeader`. Because git echoes its full argv back in a failed-clone message, the bearer token is redacted from that message too (`redactSecret`).
- The Entra token-request error message is built from the response body only. The outbound form body, which contains the client secret, is reachable on `error.config.data` and must never be stringified into a message.
- Tokens, organization names, and base URLs are never logged.
- `CODE_REVIEW_ALLOWED_REPOSITORIES` scopes clones and listings to a named set.

</security>

<testing>

## Testing

```bash
npm run build --workspace=packages/code-review
npm test --workspace=packages/code-review   # 80 tests, no live API
```

Services take injected clients/fetchers, so tests use plain stub objects — **zero `vi.mock`**. The boundaries where the ported source had bugs are tested directly: clone-URL redaction, date-driven EOL classification, non-inlined NuGet registration pages, per-version vulnerability matching, SemVer latest-version selection, the complexity `else if` count, and the provider config/guards.

</testing>

<cli-architecture>

## CLI

Binary: `mcp-code-review-cli`. Command names map 1:1 to the tools (tool name minus the `cr-` prefix). Provider and credentials come from the `CODE_REVIEW_*` environment variables (see Configuration); `--project` falls back to `CODE_REVIEW_AZDO_PROJECT` when omitted.

Global flags (any command): `--json` (raw JSON to stdout instead of the summary), `--no-cache` (skip the disk cache), `--env-file <path>` (load a specific `.env`).

Each command below is shown with every flag it accepts:

```bash
# list-repos — flags: -p/--project
mcp-code-review-cli list-repos --project MyProject
mcp-code-review-cli list-repos --project MyProject --json

# tree <repository> — flags: -p/--project, -b/--branch
mcp-code-review-cli tree MyRepo --project MyProject --branch main

# check-dotnet <repository> — flags: -p/--project, -b/--branch
mcp-code-review-cli check-dotnet MyRepo --project MyProject --branch main

# check-nuget <repository> — flags: -p/--project, -b/--branch, --skip-vulnerabilities
mcp-code-review-cli check-nuget MyRepo --project MyProject --branch main
mcp-code-review-cli check-nuget MyRepo --project MyProject --skip-vulnerabilities   # reference-only inventory, no NuGet API calls

# nuget-info <packageId> — flags: -v/--version
mcp-code-review-cli nuget-info Newtonsoft.Json --version 13.0.1

# complexity <repository> — flags: -p/--project, -b/--branch, --path, --ext, --max-files, --no-limit
mcp-code-review-cli complexity MyRepo --project MyProject --branch main --path src/ --ext .cs,.ts --max-files 2000
mcp-code-review-cli complexity MyRepo --project MyProject --no-limit   # analyse all matching files (overrides --max-files)

# review <repository> — flags: -p/--project, -b/--branch, --skip-complexity, --max-files
mcp-code-review-cli review MyRepo --project MyProject --branch main --max-files 2000
mcp-code-review-cli review MyRepo --project MyProject --skip-complexity

# packages — flags: --org (required), --type          [github-enterprise provider only]
mcp-code-review-cli packages --org your-org --type nuget

# package-versions <packageName> — flags: --org (required), --type   [github-enterprise provider only]
mcp-code-review-cli package-versions my-lib --org your-org --type npm

# latest-package-version <packageName> — flags: --org (required)     [github-enterprise provider only]
mcp-code-review-cli latest-package-version my-lib --org your-org
```

</cli-architecture>

<troubleshooting>

## Troubleshooting

- **"Missing code-review configuration for provider ..."** — set the named variables for your `CODE_REVIEW_PROVIDER`.
- **"GitHub Packages API cannot be used with the github-app provider"** — use `CODE_REVIEW_PROVIDER=github-enterprise` with a classic PAT that has `read:packages`.
- **403 while listing an org** — the token may need SAML SSO authorization for that organization.
- **A package shows `unknown` status** — it is not on nuget.org (private feed) or its version could not be resolved; not treated as safe.

</troubleshooting>
