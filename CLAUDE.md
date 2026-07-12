# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package-Specific Guidance

**Each package has its own CLAUDE.md** with integration-specific details:
- `packages/powerplatform/CLAUDE.md` - PowerPlatform (applies to all 3 PP packages)
- `packages/azure-devops/CLAUDE.md` - Azure DevOps
- `packages/core/CLAUDE.md` - Core utilities
- And similar files for other packages

**Read the relevant package CLAUDE.md when working in that package directory.**

---

## Project Overview

MCP server providing intelligent access to Microsoft PowerPlatform/Dataverse, Azure DevOps, Figma, Application Insights, Log Analytics, Azure SQL, Service Bus, SharePoint, GitHub Enterprise, Azure B2C, Azure Storage, and Microsoft Fabric through an MCP-compatible interface.

## Related Repositories

Sibling repos share this project's conventions but live outside the monorepo (native binaries, OS-specific tooling).

| Repo | Path | Purpose |
|------|------|---------|
| `mcp-computer-use` | `~/Repo/mcp-computer-use/` | macOS agentic computer control (Swift AX + ScreenCaptureKit). Publishes `@mcp-consultant-tools/computer-use`. macOS-only, compile-from-source. |

### Cross-repo contract

Conventions that MUST stay synchronized across this repo and every sibling. When you change one, mirror it in the other (same PR where possible) or document the divergence.

- **npx publish pipeline** — `@mcp-consultant-tools/*` scope, `-beta.N` prereleases (`npm version prerelease --preid=beta` → `npm publish --tag beta`), promote via `npm dist-tag add @package@X.Y.Z latest`.
- **npx config format** — `["-y", "--package=@mcp-consultant-tools/PACKAGE@TAG", "BINARY"]`. Binary mapping table is in this file.
- **Layering** — `services/` business logic, `tools/` thin MCP wrappers, `cli/` thin Commander wrappers. ServiceContext shared via `context-factory.ts`.
- **CLI parity** — every MCP tool has a matching CLI command.
- **Core helpers** — `@mcp-consultant-tools/core`: `createMcpServer`, `createEnvLoader`, `createCliProgram`, `loadEnvForCli`, `outputResult`, `handleCliError`, `descWithExamples`. **API changes to core ripple to sibling repos on version bump.**
- **MCP stdio hygiene** — no `console.log` in `src/`. Stderr only.
- **Env var naming** — `MCP_{PACKAGE}_{SETTING}` prefix.
- **Tool examples** — `descWithExamples()` for complex params.
- **Secret-scan allowlists** — `.secret-scan-allowlist` + `.secret-scan-longstr-allowlist` per-repo.
- **Release notes** — `docs/release-notes/vX.Y.Z-beta.N.md`, update "Changes Implemented" per change.
- **MCP local testing** — `mcp-local-tester` agent + `.claude/templates/mcp-test-runner.mjs`.

### Files copied verbatim between repos

These files are mirrored between this repo and `mcp-computer-use`. Edit both, or record a deliberate divergence below:

- `.claude/agents/mcp-local-tester.md`, `.claude/templates/mcp-test-runner.mjs` — both copies carry a `SOURCE OF TRUTH` header pointing here
- `scripts/install-hooks.sh`, `scripts/hooks/pre-commit`, `scripts/hooks/commit-msg`, `scripts/internal-scan-lib.sh`, `scripts/scan-tarball.sh`
- `.secret-scan-allowlist`, `.secret-scan-longstr-allowlist`, `.internal-scan-placeholders` — file/header aligned; per-repo pattern entries can differ
- `.internal-strings.local` (UNTRACKED in both repos — synced via private claude-config, never committed)

**Deliberate divergences:** `mcp-computer-use` uses `MCP_CU_*` env prefix (not the verbose `MCP_COMPUTER_USE_*`); ships no prebuilt binaries (compile-from-source on postinstall); allowlists carry extra patterns for Apple frameworks, test fixtures with fake-secret strings, and `com.1password.1password8` bundle ID.

## Release Notes — Master-Doc Model

**One master release-notes file per release branch is the user-facing single source of truth.** Per-iteration files capture agent-level audit detail. Use `/product-releasenotes beta` (or `production`) — never edit by hand. Master file is updated on every beta. Breaking-change pattern (warning + copy-paste agent block) is mandatory when relevant.

Full lifecycle, file roles, hard rules, and breaking-change format: [`.claude/refs/release-notes-model.md`](.claude/refs/release-notes-model.md). Cross-doc: [`docs/release-notes/README.md`](docs/release-notes/README.md).

## Build and Development Commands

```bash
npm run build      # Build all packages
npm start          # Run server locally
npx mcp-consultant-tools  # Run directly with npx
```

## Development Approach

Before writing code: (1) State verification method, (2) Write test first, (3) Implement, (4) Verify.

**After finishing development, always test locally first.** Build the modified package(s), run the MCP local tester or manual test, and confirm the change works before asking the user to reconnect, publishing, or moving on.

**MCP Server Verification:** Ask user to make server available locally, then use MCP tools to verify.

**Safe test env:** `https://mcptests.crm4.dynamics.com` (PowerPlatform). Never use client environments unless instructed.

## MCP Local Testing (AUTOMATIC)

**CRITICAL:** When modifying any file in `packages/*/src/`, test the change locally before asking the user to reconnect, restart Claude Code, or publish to beta.

**Test runner:**
```bash
npm run build --workspace=packages/{PACKAGE}
MCP_TEST_PACKAGE="./packages/{PACKAGE}/build/index.js" \
MCP_TEST_TOOL="{TOOL_NAME}" \
MCP_TEST_ARGS='{"param":"value"}' \
node .claude/templates/mcp-test-runner.mjs
```

**Method preference:**
- **Preferred (in cmux):** launch a visible Claude Code test session via `/cmux-launch-sessions` in a new pane of the current workspace. you can watch results live.
- **Fallback (no cmux):** invoke the `mcp-local-tester` subagent with `subagent_type: "mcp-local-tester"` and a prompt naming the package + tool + args.

**Result handling:** tests PASS → ask user to reconnect. Tests FAIL → fix first, do NOT ask for reconnect.

**Files:** `.claude/agents/mcp-local-tester.md` (agent), `.claude/templates/mcp-test-runner.mjs` (runner), `.claude/commands/test-mcp-local.md` (`/test-mcp-local`).

## Security: Preventing Secret Leaks

Install the pre-commit hook once: `./scripts/install-hooks.sh`. The hook scans for secret patterns; allowlists at `.secret-scan-allowlist` (keywords) and `.secret-scan-longstr-allowlist` (long strings) reduce false positives.

**Auto-bypass policy** — when the hook blocks on commit, classify each flagged line:
- **All false positives** (env var references like `process.env.CLIENT_SECRET`, CLI command names like `reset-password`, comments, import paths, doc examples) → `git commit --no-verify` automatically AND add the patterns to the relevant allowlist so it doesn't trigger next time.
- **Any real-looking secret** → STOP, alert the maintainer, do NOT bypass.
- **This policy applies ONLY to the secret-pattern scan.** Internal-identifier hits (the 🛑 INTERNAL IDENTIFIER / INTERNAL ENDPOINT blocks) are NEVER bypassable — see "Public Repo Hygiene" below.

**Never commit:** `.env*`, `.claude/settings.json`, `*.pem`, `*.key`, `*.p12`. **If you accidentally do:** rotate credentials immediately, remove from history with `git-filter-repo`, notify affected parties.

## Public Repo Hygiene (Preventing Internal-Info Leaks)

This is a PUBLIC repo developed while testing against internal client projects. Secrets are not the only leak class — **client identifiers are equally forbidden**: client/project codenames, real ADO org/project names, real environment URLs, real Figma file keys, real work-item/test-run/record IDs, internal team/channel/policy names, colleague names.

**Sanctioned example values — use ONLY these in docs, tests, examples, tool descriptions, and release notes:**

| Kind | Sanctioned value |
|------|------------------|
| PowerPlatform env | `https://mcptests.crm4.dynamics.com` (live test env) or `https://yourorg.crm.dynamics.com` (placeholder) |
| ADO org/project | `https://dev.azure.com/{org}/{project}` · project `MyProject` |
| Figma file key | `Abc123SampleFileKey000` |
| Work item / run IDs | `1234`, `123456` |
| GUIDs | `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` |
| Emails / people | `jdoe@example.com`, `Jane Doe` |
| Tenants / hosts | `contoso.sharepoint.com`, `yourtenant.b2clogin.com`, `your-ns.servicebus.windows.net` |
| Company | `Contoso` / "your organisation" — never real consultancy or client names |

**Rules:**
- Never paste real values from client sessions into this repo — not in code, docs, tests, fixtures, release notes, OR commit messages. When documenting a real bug fix, say "a client project", not the project name.
- Client-flavoured debug artifacts (exported flows, query results, scratch notes) go to gitignored locations (`.context/`, `*.local`) — never `tests/` or `docs/`.
- Internal workflow skills/playbooks belong in the private claude-config repo, never in this repo's `.claude/`.
- The pre-commit and commit-msg hooks scan against `.internal-strings.local` (untracked private denylist — restore from claude-config if missing; new sensitive strings get ADDED there, never allowlisted away) plus committable endpoint heuristics with placeholders in `.internal-scan-placeholders`. **Internal-identifier hits are NEVER bypassable with `--no-verify`** — replace the value with a sanctioned placeholder instead.
- Before every `npm publish`, `./scripts/scan-tarball.sh packages/{PACKAGE}` is mandatory (wired into both release workflows) — it scans the compiled tarball contents, the one place pre-commit can't see.

## Monorepo Architecture (v28+)

Workspace root with `packages/`:
- **Foundations:** `core` (shared utilities), `powerplatform-core` (internal PP library), `meta` (all integrations bundled).
- **PowerPlatform (3-package split):** `powerplatform` read-only ✅ PRODUCTION-SAFE • `powerplatform-customization` schema changes ⚠️ DEV ONLY • `powerplatform-data` data CRUD ⚠️ OPERATIONAL.
- **Azure DevOps:** `azure-devops` (work items, wiki, PRs) • `azure-devops-admin` (pipelines, admin).
- **Azure platform:** `azure-management` (ARM) • `azure-defender` (Defender for Cloud, read-only) • `entra-id` (app registration audit, read-only) • `azure-data-factory` • `fabric` (Microsoft Fabric) • `application-insights` • `log-analytics` • `azure-sql` • `service-bus` • `azure-storage` • `azure-b2c`.
- **Other integrations:** `figma` • `sharepoint` • `github-enterprise` • `teams` • `1password` • `rest-api`.

Tool counts live in `README.md` (don't duplicate). **Build order:** core → service packages → meta. **Setup:** `git clone` → `npm install` → `npm run build`. Per-package env config lives in each package's `CLAUDE.md`.

## Integration Technical Documentation

Detailed implementation guides in `docs/technical/{INTEGRATION}_TECHNICAL.md`:
- PowerPlatform, Azure DevOps, Figma, Application Insights
- Log Analytics, Azure SQL, Service Bus, SharePoint
- GitHub Enterprise, Azure B2C, Azure Data Factory, REST API, Teams
- Microsoft Fabric, Azure Defender for Cloud, Microsoft Entra ID

Each technical doc includes: Architecture, Available Tools, Service Implementation, Error Handling, Security Considerations, and **CLI Architecture** sections.

## Documentation Structure

### Documentation Files
1. **README.md** - Project overview, quick start, CLI examples
2. **CLAUDE.md** (this file) - Development guidance, CLI maintenance strategy
3. **packages/*/CLAUDE.md** - Package-specific guidance (includes CLI Usage)
4. **docs/documentation/{integration}.md** - **Short** user-facing guides (config + notable behavior only, ~50-100 lines)
5. **docs/technical/{INTEGRATION}_TECHNICAL.md** - Comprehensive reference with XML tags for agent consumption (all tools, parameters, examples, troubleshooting, architecture)
6. **.claude/refs/package-architecture.md** - Canonical package architecture & naming specification

### Documentation Strategy

**User docs (`docs/documentation/`) are deliberately minimal.** They contain ONLY:
- Agent pointer comment (directs agents to the technical doc)
- One MCP config example with all env vars annotated
- Prompts table (name + one sentence)
- Notable behavior: only tools/features with business logic that directly impacts users

**Technical docs (`docs/technical/`) are comprehensive and XML-tagged.** They contain everything an agent needs: full tool reference, parameters, error handling, architecture, examples, CLI commands, security, and performance details. XML tags provide structure for reliable agent parsing.

**Rule of thumb:** If the user directly controls it (config, feature flags, prefix settings) → user doc. If an agent handles it (error recovery, validation, query syntax) → technical doc only.

## ⚠️ MCP Protocol Requirement (HARD RULE)

**NEVER use `console.log()` or write to stdout!** MCP uses stdio transport — any non-JSON stdout corrupts the protocol.

```typescript
console.log('...');    // ❌ FORBIDDEN - writes to stdout
console.error('...');  // ✅ OK - writes to stderr
console.warn('...');   // ✅ OK - writes to stderr
```

## Architecture, Adding Features & Tool Design

The Service-Tool-Prompt pattern, canonical package structure, naming conventions, ServiceContext rules, file-size limits, and the mandatory checklists for adding a tool / domain / package are documented in scoped reference files — load when actually doing the work:

- **Package architecture & naming:** [`.claude/refs/package-architecture.md`](.claude/refs/package-architecture.md). Reference package: `packages/azure-devops/`.
- **Adding tools, domains, integration packages:** [`.claude/refs/adding-features-checklist.md`](.claude/refs/adding-features-checklist.md).
- **Tool descriptions & `descWithExamples()` patterns:** [`.claude/refs/tool-design.md`](.claude/refs/tool-design.md).

## CLI

Every package ships a Commander.js CLI alongside its MCP server, sharing the same services and ServiceContext. CLI parity with MCP tools is non-negotiable — every MCP tool has a matching CLI command.

Quickstart: `npx --package=@mcp-consultant-tools/azure-devops mcp-ado-cli wiki list MyProject`. Global flags: `--json`, `--no-cache`, `--env-file`. Output goes to stdout (summary) + `.context/.mcp-{abbrev}-cache/` (full JSON).

Full architecture, MCP↔CLI parity rules, parameter-mapping conventions, core helpers, and the cross-package verification script: [`.claude/refs/cli-architecture.md`](.claude/refs/cli-architecture.md).

## Publishing

### Safe Release Workflow

Use the slash commands — they encapsulate the full workflow including release-notes updates and Teams announcement.

1. **Local Testing:** `npm run build` → exercise the modified package(s) locally (mcp-local-tester or manual run).
2. **Beta Release:** `/release_workflow_beta` — secret scan → `/product-releasenotes beta` (updates master + per-iteration, emits Teams message) → version bump → commit → `npm publish --tag beta` → handoff for testing.
3. **USER TESTING REQUIRED** — beta is exercised against real client environments before promotion.
4. **Production Release:** `/release_workflow` — secret scan → `/product-releasenotes production` (flips master status banner, updates URLs to `main`) → version bump → commit → `npm publish` (latest) → merge to `main` → tag → next-release branch.

Per-iteration release-notes files (`docs/release-notes/v{X.Y.Z}-beta.N.md`) are agent audit trail. The master file `docs/release-notes/v{MAJOR}.0.0.md` is the user-facing single source of truth — see the "Release Notes — Master-Doc Model" section above.

### npm Authentication (2FA bypass — standing rule)

**When publishing (`npm publish`), retrieve the npm automation token from 1Password and use it — do NOT prompt for a 2FA one-time password, and do NOT ask the user.** The token bypasses 2FA; using it on publish is pre-authorized.

The publish-auth specifics (1Password item / vault / account + the temp-`.npmrc` token-fetch snippet) live in the untracked **`.claude/publish-auth.local.md`** — recreate it from 1Password if missing. Never write the token to a committed file or echo it; always use a temp `$HOME/.npmrc-*`, `chmod 600`, and `rm -f` after. If `op read` reports a sign-in prompt, ask the user to run `op signin`. If the token 401s, it has been rotated — ask the user to refresh the 1Password item.

### Version Bumping
- `npm version prerelease --preid=beta`: Beta (1.0.0 → 1.0.0-beta.1)
- `npm version patch`: Bug fixes (1.0.0 → 1.0.1)
- `npm version minor`: New features (1.0.0 → 1.1.0)
- `npm version major`: Breaking changes (1.0.0 → 2.0.0)

### Emergency Rollback
```bash
npm deprecate @package@version "Broken - use X.X.X"
npm dist-tag add @package@old-version latest
```

## Teams Announcements

For release announcements, a Teams webhook is configured for your internal team channel.

**Webhook URL stored in:** `.env.local` (not committed to git)

**To post an announcement:**
```bash
# Read webhook URL from local env file
source .env.local

# Post message (plain text - Teams doesn't support markdown in webhooks)
curl -X POST "$TEAMS_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text": "Your announcement message here"}'
```

**Format requirements:**
- Teams webhooks via Power Automate accept simple JSON with a `text` field
- No markdown support - use plain text formatting
- Keep messages concise and readable

## MCP Configuration

Use the explicit `--package` form whenever the package name differs from the binary name:

```json
"args": ["-y", "--package=@mcp-consultant-tools/PACKAGE", "BINARY"]
```

Always include ALL environment variables (with defaults) in MCP config examples — even optional ones — so users see every available option.

Full package → MCP-binary → CLI-binary mapping table + a worked example: [`.claude/refs/package-binaries.md`](.claude/refs/package-binaries.md).

## TypeScript Configuration

- Target: ES2022, Module: Node16, strict mode, output: `./build`

## Context Management

See the `<context-management>` section in global `~/.claude/CLAUDE.md` — same rules apply here. Pipe verbose builds/tests to `.context/terminal/`, save MCP responses >50 lines to `.context/mcp/`, grep when needed.