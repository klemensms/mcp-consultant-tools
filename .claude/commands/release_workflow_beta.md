BETA RELEASE WORKFLOW

This command publishes a new beta to npm with the `beta` tag, updates the master and per-iteration release notes, and emits a Teams-ready announcement.

## 0. PRE-FLIGHT CHECKS

### 🔐 SECRET SCANNING (CRITICAL — DO THIS FIRST)

```bash
# Check for common secret patterns in staged files
git diff --cached --name-only | xargs grep -l -E \
  '(client_secret|CLIENT_SECRET|password|PASSWORD|api[_-]?key|API[_-]?KEY|secret|token)' 2>/dev/null

# Scan for credential-shaped strings
git diff --cached | grep -E \
  '([a-zA-Z0-9+/]{40,}|[a-f0-9]{32,}|AKIA[0-9A-Z]{16}|[a-zA-Z0-9~]{30,})' | head -20

# Check .claude/ directory specifically
git diff --cached -- .claude/ | grep -iE '(secret|password|key|token)' | head -10
```

**Files to manually review:** `.claude/settings.json`, `.env*`, any JSON config files.

**If secrets found:** STOP. Remove them, rotate the exposed credentials, then proceed.

### Standard checks

- Verify npm login: `npm whoami`
- Confirm branch is `release/X.Y`
- Check `git status` for uncommitted changes
- Identify current package versions:
  ```bash
  find packages -name "package.json" -maxdepth 2 | xargs -I {} sh -c \
    'pkg=$(dirname {} | xargs basename); ver=$(grep "\"version\"" {} | head -1 | sed "s/.*\"\([^\"]*\)\".*/\1/"); echo "$pkg: $ver"'
  ```
- Check current beta dist-tag: `npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME`

## 1. UPDATE RELEASE NOTES (master + per-iteration)

**This step is mandatory and must happen before publish.** The master release-notes file at `docs/release-notes/v{MAJOR}.0.0.md` is the user-facing single source of truth for the release branch — every beta updates it.

Run the dedicated slash command:

```
/product-releasenotes beta
```

That command will:
- Detect the current branch + version automatically.
- Aggregate commits since the last master update.
- Update (or create) `docs/release-notes/v{MAJOR}.0.0.md` — the master.
- Update (or create) `docs/release-notes/v{CORE_VERSION}.md` — the per-iteration audit file.
- Detect breaking changes and, if present, ensure the master contains the `⚠️ This release contains breaking changes` warning paragraph and the `⚡ Quick upgrade` agent-prompt block.
- Print a Teams-ready announcement message to the terminal — **save this output**, you'll use it in step 7.

If `/product-releasenotes` reports anything missing or ambiguous, resolve it before continuing.

## 2. DOCUMENTATION VERIFICATION

- Verify README.md tool/prompt counts match implementation.
- Verify CLAUDE.md monorepo section has correct counts.
- Check `docs/documentation/*.md` files are current for new features.
- Confirm `docs/technical/*.md` reflects new tools / env vars.

## 3. PRE-PUBLISH VALIDATION

### 3a. MANDATORY clean build (never an incremental build)

A stale `tsconfig.tsbuildinfo` can make `tsc` skip declaration emit entirely — `powerplatform@33.0.0` shipped to npm with zero `.d.ts` files this way, and stale `build/` output has masked missing project references that only failed in clean CI. **Always build from clean before any pack or publish. Never substitute plain `npm run build`, never skip.**

```bash
npm run build:release   # = npm run clean && npm run build (purges build/ + *.tsbuildinfo first)

# Verify all builds exist
for pkg in core powerplatform-core application-insights azure-b2c azure-data-factory \
  azure-devops azure-devops-admin azure-management azure-sql azure-storage \
  figma github-enterprise log-analytics rest-api powerplatform \
  powerplatform-customization powerplatform-data service-bus sharepoint teams meta; do
  [ -d "packages/$pkg/build" ] && echo "✅ $pkg" || echo "❌ $pkg - MISSING"
done
```

## 4. VERSION BUMP

- **Increment beta:** `X.Y.Z-beta.N → X.Y.Z-beta.(N+1)` for each affected package.
- **Initial beta from main:** `X.Y.Z → (X+1).Y.Z-beta.1` for each affected package.
- For workspace lockstep major releases, bump every package's version (and update inter-package `@mcp-consultant-tools/*` deps in every `package.json`).
- Edit `package.json` files directly with the Edit tool.

## 5. COMMIT VERSION CHANGES (before publish)

npm publishes from the committed `package.json`, so commit before publishing:

```bash
git add packages/*/package.json docs/release-notes/v*.md
git commit -m "chore: bump to X.Y.Z-beta.N for beta testing"
git push origin release/X.Y
```

## 6. PUBLISH TO NPM (beta tag)

### 6a. MANDATORY tarball scan (before any publish)

For EVERY package being published, scan the actual tarball contents (this is what catches internal identifiers compiled into `build/` output — pre-commit only sees source). The scan also FAILS if the tarball contains zero `.d.ts` files (every published package ships types; zero means a stale incremental build):

```bash
./scripts/scan-tarball.sh packages/PACKAGE_NAME
```

Any hit ABORTS the release — fix the source, rebuild clean (`npm run build:release`), re-scan. Never skip, never bypass, never publish a package whose scan failed.

### 6b. Authenticate without 2FA prompts (1Password automation token)

npm requires a one-time password per publish (`EOTP`). Use the npm **automation token** (bypasses 2FA) stored in 1Password. **Never write the token into the repo** — fetch it at runtime into a temp `.npmrc` under `$HOME`, pass via `--userconfig`, delete afterward.

The exact 1Password item / vault / account and the token-fetch snippet live in the untracked **`.claude/publish-auth.local.md`** (recreate from 1Password if missing). This is a **standing rule** (also in the root `CLAUDE.md` → Publishing → npm Authentication): use this token automatically, do NOT prompt for an OTP and do NOT ask the user. If `op read` fails because 1Password isn't signed in, run `op signin`. If the token 401s, it has been rotated — ask the user to refresh the 1Password item.

### 6c. Publish in dependency order: `core` → service packages → `meta`

For a selective beta, publish only the changed packages (still in dependency order):

```bash
# Per package — note the temp userconfig + --tag beta
(cd packages/PACKAGE_NAME && npm publish --access public --tag beta --userconfig="$TMPNPMRC")

# Or the full lockstep set:
ORDER=(core powerplatform-core application-insights azure-b2c azure-data-factory \
  azure-devops azure-devops-admin azure-management azure-sql azure-storage fabric \
  figma github-enterprise log-analytics 1password rest-api powerplatform \
  powerplatform-customization powerplatform-data service-bus sharepoint teams todoist meta)
for pkg in $ORDER; do
  (cd "packages/$pkg" && npm publish --access public --tag beta --userconfig="$TMPNPMRC") \
    && echo "✅ $pkg" || echo "❌ $pkg"
done

rm -f "$TMPNPMRC"   # never leave the token on disk
```

Verify each publication:

```bash
npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME
# Expect: beta: X.Y.Z-beta.N
```

## 7. ANNOUNCE + HANDOFF

Print the Teams announcement message produced by `/product-releasenotes` in step 1. Format depends on whether breaking changes were detected:

- **Breaking changes:** `⚠️ Breaking changes just shipped...` block with affected-packages list and the master release-notes URL.
- **No breaking changes:** `ℹ️ New beta of @mcp-consultant-tools...` block with one-line summary and URL.

Provide the user with:
- The Teams message (ready to paste into the internal release channel).
- Beta install command: `npx --package=@mcp-consultant-tools/PACKAGE@beta BINARY`.
- Link to the master release notes (the `vX.0.0.md` file, NOT the per-iteration `vX.Y.Z-beta.N.md`).

🛑 **STOP** — await user feedback before proceeding to production release.

---

## QUICK REFERENCE COMMANDS

```bash
# npm login check
npm whoami

# All package versions
find packages -name "package.json" -maxdepth 2 | xargs -I {} sh -c \
  'pkg=$(dirname {} | xargs basename); ver=$(grep "\"version\"" {} | head -1 | sed "s/.*\"\([^\"]*\)\".*/\1/"); echo "$pkg: $ver"'

# dist-tags for a single package
npm dist-tag ls @mcp-consultant-tools/powerplatform

# Single-package beta publish
cd /absolute/path/packages/powerplatform && npm publish --access public --tag beta

# Verify install
npx --package=@mcp-consultant-tools/powerplatform@beta mcp-consultant-tools-powerplatform --version
```

## SELECTIVE BETA PUBLISHING (faster iterations)

When iterating on beta fixes, publish ONLY affected packages:

```bash
cd packages/powerplatform
# Edit package.json: bump version (e.g., beta.1 → beta.2)
npm publish --access public --tag beta

# Re-run /product-releasenotes beta to update master + per-iteration
# Commit and push
git add packages/powerplatform/package.json docs/release-notes/v*.md
git commit -m "fix: description (beta.2)"
git push
```

## NOTES

- The `publish-all.sh` script has interactive prompts for uncommitted changes and non-main branch.
- When using `cd` in bash commands, subsequent commands run from the new directory — use absolute paths.
- Only packages with changes need to be published.
- Commit version changes BEFORE publishing.
- The `beta` tag doesn't affect `latest` — safe to publish without impacting production users.
- Always verify publications with `npm dist-tag ls` after publishing.
- The master release notes file is canonical. Per-iteration files are agent-level audit trail. Both update on every beta — `/product-releasenotes beta` handles both.
