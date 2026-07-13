# Code Review Package Guide

## Overview

Provider-agnostic MCP server for repository code review across **Azure DevOps** and **GitHub
Enterprise**: .NET target-framework end-of-life scanning, NuGet package auditing (public NuGet v3
API), a cyclomatic-complexity **estimate**, a consolidated single-clone review, and a GitHub
Packages inventory.

**Tools:** 10 (all read-only) | **Prompts:** 2 | **Auth:** provider-selected (AzDO PAT / GHE PAT / GHE App)

There are no write operations and no feature flags. It shallow-clones a repo, analyses it, and
deletes the clone.

## Environment Configuration

```bash
CODE_REVIEW_PROVIDER=azure-devops   # azure-devops | github-enterprise | github-app

# azure-devops
CODE_REVIEW_AZDO_ORGANIZATION=your-azdo-organization
CODE_REVIEW_AZDO_PAT=your-azure-devops-pat
CODE_REVIEW_AZDO_PROJECT=MyProject          # optional --project fallback

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
verified against the vendors' published docs and unit-tested against stubs — but **not one call in
`CodeReviewClient`, `GheAppAuth`, or the NuGet fetcher has run against a real endpoint**, and the
`git clone` path has not run against a real repository. Recorded in `<known-limitations>` of the
technical doc.

## Architecture Notes

- Auth is provider-selected in `context-factory.ts` (the single `createServiceContext()` used by both
  `index.ts` and `cli.ts`). The GitHub App auth is NOT hoisted to `core` — following the per-package
  precedent (entra-id, azure-defender, message-center each keep their own).
- NuGet is decoupled from the provider: a plain `fetchJson` (axios) against public nuget.org.
- Prompts are STATIC guidance templates (like message-center), not executable — a deliberate
  divergence from the source, which ran analysis inside the prompt.

## Testing

```bash
npm run build --workspace=packages/code-review
npm test --workspace=packages/code-review   # 80 tests, no live API
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
