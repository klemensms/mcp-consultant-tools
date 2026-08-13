# Code Review Package Guide

## Overview

Provider-agnostic MCP server for repository code review across **Azure DevOps** and **GitHub
Enterprise**: .NET target-framework end-of-life scanning, NuGet package auditing (public NuGet v3
API), a cyclomatic-complexity **estimate**, a consolidated single-clone review, and a GitHub
Packages inventory.

**Tools:** 10 (all read-only) | **Prompts:** 2 | **Auth:** provider-selected (AzDO PAT or Entra service principal / GHE PAT / GHE App)

There are no write operations and no feature flags. It shallow-clones a repo, analyses it, and
deletes the clone.

## Environment Configuration

```bash
CODE_REVIEW_PROVIDER=azure-devops   # azure-devops | github-enterprise | github-app

# azure-devops
CODE_REVIEW_AZDO_ORGANIZATION=your-azdo-organization
CODE_REVIEW_AZDO_AUTH_METHOD=pat            # pat (default) | entra-id
CODE_REVIEW_AZDO_PROJECT=MyProject          # optional --project fallback

# azure-devops + auth method pat
CODE_REVIEW_AZDO_PAT=your-azure-devops-pat

# azure-devops + auth method entra-id (service principal; no PAT needed)
CODE_REVIEW_AZDO_CLIENT_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
CODE_REVIEW_AZDO_CLIENT_SECRET=your-client-secret
CODE_REVIEW_AZDO_TENANT_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

# github-enterprise (PAT needs read:packages for the Packages tools)
CODE_REVIEW_GHE_BASE_URL=https://your-ghe-host
CODE_REVIEW_GHE_TOKEN=your-ghe-pat

# github-app
CODE_REVIEW_GHE_BASE_URL=https://your-ghe-host
CODE_REVIEW_GHE_APP_ID=...
CODE_REVIEW_GHE_INSTALLATION_ID=...
CODE_REVIEW_GHE_PRIVATE_KEY_PATH=/path/to/key.pem   # or CODE_REVIEW_GHE_PRIVATE_KEY (inline, \n newlines)

CODE_REVIEW_ALLOWED_REPOSITORIES=repo-a,repo-b       # optional clone/list allowlist
```

Set only the variables for the chosen provider. NuGet lookups hit the public nuget.org API and need
no credential.

## Tools

Tool names are prefixed `cr-` so they do not collide with any other package's bare names in the meta
aggregator (`tree`, `review`, `complexity`, `packages` are common words).

- `cr-list-repos` — repositories in a project/org (`truncated`, `filtered` reported)
- `cr-tree` — clone and list the file tree
- `cr-check-dotnet` — target frameworks + EOL flags + CRM SDK / ILMerge detection
- `cr-check-nuget` — NuGet audit (latest stable + vulnerabilities for the referenced version)
- `cr-nuget-info` — one package's versions/vulnerabilities
- `cr-complexity` — cyclomatic-complexity ESTIMATE + hotspots
- `cr-review` — consolidated single-clone review with a health verdict
- `cr-packages` / `cr-package-versions` / `cr-latest-package-version` — GitHub Packages (GHE provider only)

## Things that will bite you

**This package was ported with seven-plus defect fixes — do not regress them.** The ported source
(`si-smartassurance/packages/code-review`) carried the "wrong answer with a 200" class of bug that
every hop in this chain has found. The fixes, each covered by a test:

- **NuGet registration base is discovered from the service index**, not hardcoded. NuGet's docs
  require dynamic discovery. Do not reintroduce a hardcoded `registration5-gz-semver2` URL.
- **Non-inlined registration pages are followed by `@id`.** Any package with 128+ versions (every
  popular package) returns pages with no inline `items`; the source fell back to the page `upper`
  bound with no prerelease check and fetched no vulnerability data. `leavesOf()` follows the page.
- **Vulnerabilities are matched to the referenced version**, read from that version's
  `catalogEntry.vulnerabilities` — not accumulated across every version. The registration schema
  carries only `advisoryUrl` + `severity`; there is no version `range` field (the source read a
  phantom one that was always empty).
- **.NET EOL is computed from dates at runtime**, never a baked `isEol` boolean. The source's table
  reported .NET Framework 4.5.2/4.6/4.6.1 (EOL 2022-04-26) as supported and had .NET 9's date wrong.
  `isEolFramework(moniker, now)` compares the published date to today. Frameworks with no fixed EOL
  (4.7.x/4.8/4.8.1, OS-tied) are never flagged.
- **GitHub Apps cannot use the Packages API.** The provider guard refuses `cr-packages*` under the
  `github-app` (and `azure-devops`) provider with a clear message, instead of letting the request
  403 and be masked by an npm-registry fallback (the fallback was removed).
- **GHE listings follow the `Link` header** and report `truncated` honestly, instead of silently
  stopping at `per_page=100`.
- **Cyclomatic complexity is a labelled ESTIMATE.** The regex counter no longer double-counts
  `else if` (an `else if (` already contains the `if (` the base pattern counts). Reports carry a
  `methodology` note; the C# nullable-`?` and nested-lambda false positives remain as documented
  heuristic ceilings.

**A PAT goes in the clone URL's PASSWORD position, never its username.** `buildAzdoCloneUrl` shipped
as `https://<pat>@dev.azure.com/...` from the package's first release, which leaves git with a
username and *no password* — it prompts, then dies with `could not read Password` before ever
reaching Azure DevOps, valid PAT or not. It is now `https://:<pat>@...`, matching the empty-username
basic auth the REST path already builds. `buildGheCloneUrl` still carries the original shape
(`https://<token>@host`); that is the widely-used GitHub idiom and has not been disproven, but it
has also never been run against a real GHE host — check it before trusting it.

**The clone URL embeds a credential — never let it leak.** `clone-manager.ts` builds
`https://<token>@host/...`. A failed `git clone` throws an Error echoing the whole command line;
`redactCloneSecret` strips the credential from that message. The temp dir is removed in a `finally`.
There is a test that plants a secret in a clone URL and asserts it appears in no error output —
keep it green.

**Services take injected clients/fetchers.** `NugetPackageService(fetchJson)`,
`PackageService(client)`, `RepositoryService(client)`. Tests use plain stubs — **zero `vi.mock`**.

## Not verified against live systems

No Azure DevOps org, GitHub Enterprise instance, or authenticated NuGet feed was available. Every
REST path, API version, NuGet registration shape, GitHub App JWT flow, and clone-URL construction is
verified against the vendors' published docs and unit-tested against stubs — but **almost no call in
`CodeReviewClient`, `GheAppAuth`, or the NuGet fetcher has run against a real endpoint**, and the
`git clone` path has not run against a real repository. Recorded in `<known-limitations>` of the
technical doc.

Exceptions, from probes and one live tenant run (2026-08-13):
- `login.microsoftonline.com` token endpoint — reached live; a placeholder tenant returns AADSTS90002
  through `describeTokenError()`. The client-credentials request shape is confirmed.
- `dev.azure.com` REST — reached live with a rejected credential; confirmed it answers **302 to
  sign-in**, which is what `maxRedirects: 0` exists to catch.
- **Live tenant run of beta.2** confirmed the `entra-id` path end to end up to the identity check:
  the token is issued, sent and *accepted*, and Azure DevOps rejects the identity with `TF401444`.
  Auth-method selection, loud REST failure (exit 1, no empty result set), and bearer-token redaction
  in the clone command line were all confirmed. It also found the object-id parsing bug and the
  missing clone-path mapping, both fixed in beta.3.
- The corrected `https://:<pat>@` clone URL reaches Azure DevOps and gets a genuine
  `Authentication failed` (credential sent and rejected) rather than a local password prompt.

Still unverified: an *accepted* Azure DevOps identity — no service principal is a member of an
organisation yet — so no clone has ever succeeded, `cr-review` has never run end to end, and the
"unreadable repository fails loudly rather than returning an empty result" criterion is untestable
until there is a readable repository to contrast against.

## Azure DevOps service-principal auth (`entra-id`)

`CODE_REVIEW_AZDO_AUTH_METHOD=entra-id` swaps the person-owned PAT for a client-credentials token
against the Azure DevOps first-party resource (`499b84ac-.../.default`). Absent, the variable
defaults to `pat`, so every pre-existing configuration keeps working untouched.

**The token has to reach `git clone`, not just REST.** Eight of the ten tools clone. Under
`entra-id` the clone URL carries no credential at all — the token goes in
`git -c http.extraHeader=Authorization: Bearer …` (the form Microsoft documents for Azure DevOps).
That header is part of git's argv, and git echoes argv back in a failed-clone message, so
`CloneManager` redacts the bearer token as well as the URL userinfo. There is a test that plants a
token and asserts it survives into no error output — keep it green.

**Membership is a prerequisite, and it is not a code problem.** A valid token for a principal that
is not a member of the organisation gets `401 TF401444`. `describeUnprovisionedPrincipal()` maps
that to a named error carrying the principal's object id, because a bare 401 reads as "wrong
secret" and sends the reader to the wrong fix. An org administrator must add the principal under
Organization settings > Users.

**The TF401444 identity is `tenant\tenant\principal` — take the LAST segment.** All three segments
are GUIDs on a real response. Reading the first one hands an administrator the *tenant* id labelled
as the object id, and a Users search for it finds nothing: confident, well-formed and wrong. This
shipped in beta.2 and was caught only by a live run, because the unit fixture used the literal word
`tenant` for the first two segments — so "first GUID in the message" accidentally matched. The
fixture now mirrors the measured shape. **When a fixture stands in for a vendor response, copy the
real shape, not a readable approximation of it.**

**A clone failure gets no TF401444 body — only `fatal: Authentication failed`.** Git cannot report
why, so `describeCloneAuthFailure()` attaches the membership explanation under `entra-id` (and a
scope/expiry hint under `pat`). Without it, anyone whose first command happens to clone gets a raw
git error with no route to the fix. It returns null for non-auth clone failures, so a genuine
"repository not found" is never buried under an authentication guess.

**Never build the message from the whole axios error on the token path.** The outbound form body on
`error.config.data` contains the client secret; `describeTokenError()` reads the response body only.

## Architecture Notes

- Auth is provider-selected in `context-factory.ts` (the single `createServiceContext()` used by both
  `index.ts` and `cli.ts`). The GitHub App auth and the Azure DevOps Entra auth are NOT hoisted to
  `core` — following the per-package precedent (entra-id, azure-defender, message-center each keep
  their own).
- **Azure DevOps redirects rather than 401s.** An unauthenticated REST call gets a 302 to a sign-in
  page; followed, it yields HTML with no `value` array and the caller dies on `undefined.map` — an
  auth failure disguised as a parse crash. The Azure DevOps axios instance sets `maxRedirects: 0`
  and `raiseGitError` maps 302/203 to an authentication error. Do not re-enable redirects.
- NuGet is decoupled from the provider: a plain `fetchJson` (axios) against public nuget.org.
- Prompts are STATIC guidance templates (like message-center), not executable — a deliberate
  divergence from the source, which ran analysis inside the prompt.

## Testing

```bash
npm run build --workspace=packages/code-review
npm test --workspace=packages/code-review   # 104 tests, no live API
```

## Reference

See `docs/technical/CODE_REVIEW_TECHNICAL.md` for the full reference.

## CLI Usage

Binary: `mcp-code-review-cli`. Command name = tool name minus the `cr-` prefix (flat top-level commands). Global flags on every command: `--json`, `--no-cache`, `--env-file <path>`. `--project` falls back to `CODE_REVIEW_AZDO_PROJECT`.

All 10 commands with their full flag sets:

```bash
mcp-code-review-cli list-repos --project MyProject
mcp-code-review-cli tree MyRepo --project MyProject --branch main
mcp-code-review-cli check-dotnet MyRepo --project MyProject --branch main
mcp-code-review-cli check-nuget MyRepo --project MyProject --branch main --skip-vulnerabilities
mcp-code-review-cli nuget-info Newtonsoft.Json --version 13.0.1
mcp-code-review-cli complexity MyRepo --project MyProject --branch main --path src/ --ext .cs,.ts --max-files 2000
mcp-code-review-cli complexity MyRepo --project MyProject --no-limit   # overrides --max-files
mcp-code-review-cli review MyRepo --project MyProject --branch main --skip-complexity --max-files 2000
mcp-code-review-cli packages --org your-org --type nuget                 # github-enterprise provider only
mcp-code-review-cli package-versions my-lib --org your-org --type npm    # github-enterprise provider only
mcp-code-review-cli latest-package-version my-lib --org your-org         # github-enterprise provider only
```
