RELEASE WORKFLOW (Post-Beta Validation)

Promotes a beta version on `release/X.Y` to the `latest` npm tag, finalizes the master release notes for the production release, merges to `main`, tags, and emits a Teams-ready announcement.

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

**If secrets found:** STOP. Remove, rotate the exposed credentials, then proceed.

### Standard checks

- Verify npm login: `npm whoami`
- Confirm branch is `release/X.Y`
- Check `git status` for uncommitted changes
- Identify which packages have beta versions to promote:
  ```bash
  find packages -name "package.json" -maxdepth 2 | xargs -I {} sh -c \
    'pkg=$(dirname {} | xargs basename); ver=$(grep "\"version\"" {} | head -1 | sed "s/.*\"\([^\"]*\)\".*/\1/"); echo "$pkg: $ver"'
  ```
- Check current dist-tags: `npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME`

## 1. FINALIZE RELEASE NOTES

The master release-notes file at `docs/release-notes/v{MAJOR}.0.0.md` already contains the full content for this release — every beta has been updating it. Production release does NOT regenerate the master, it just stamps a release date and updates URLs.

Run:

```
/product-releasenotes production
```

That command will:
- Detect the current branch + version.
- Update the master file's status banner: `In beta...` → `Released — v{X.Y.Z} on the `latest` npm tag (date: YYYY-MM-DD)`.
- Set the production release date.
- Update GitHub URLs in the agent-block from `release/{X.Y}` → `main` (since after merge, the file lives on main).
- Leave per-iteration `vX.Y.Z-beta.N.md` files untouched (they're historical record).
- Print a Teams-ready production announcement message — **save this output**, you'll use it in step 7.

If breaking changes were introduced during this release cycle, the master already contains the `⚠️` warning paragraph and `⚡ Quick upgrade` block from the beta phase. Production-mode finalization just adjusts URLs.

## 2. DOCUMENTATION VERIFICATION

- Verify README.md tool/prompt counts match implementation.
- Verify CLAUDE.md monorepo section has correct counts.
- Check `docs/documentation/*.md` files are current.
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

## 4. VERSION BUMP (beta → release)

- Edit `package.json` for ONLY packages with beta versions.
- Change version from `X.Y.Z-beta.N` → `X.Y.Z`.
- Packages that stayed at the previous version (e.g., still at `30.0.0`) do NOT need bumping.
- Update inter-package `@mcp-consultant-tools/*` deps in every `package.json` if doing a workspace lockstep promotion.

## 5. COMMIT VERSION CHANGES (before publish)

```bash
git add packages/*/package.json docs/release-notes/v*.md
git commit -m "chore: bump versions to X.Y.Z for production release"
git push origin release/X.Y
```

## 6. PUBLISH TO NPM (latest tag)

### 6a. MANDATORY tarball scan (before any publish)

For EVERY package being published, scan the actual tarball contents (this is what catches internal identifiers compiled into `build/` output — pre-commit only sees source). The scan also FAILS if the tarball contains zero `.d.ts` files (every published package ships types; zero means a stale incremental build):

```bash
./scripts/scan-tarball.sh packages/PACKAGE_NAME
```

Any hit ABORTS the release — fix the source, rebuild clean (`npm run build:release`), re-scan. Never skip, never bypass, never publish a package whose scan failed.

### 6b. Authenticate without 2FA prompts (1Password automation token)

npm requires a one-time password per publish (`npm publish` fails with `EOTP`). To publish non-interactively, use the npm **automation token** (it bypasses 2FA), stored in 1Password. **Never write the token into the repo** — fetch it at runtime, stage it in a temp `.npmrc` under `$HOME` (outside any git tree), pass it via `--userconfig`, and delete it afterward.

The exact 1Password item / vault / account and the token-fetch snippet live in the untracked **`.claude/publish-auth.local.md`** (recreate from 1Password if missing). This is a **standing rule** (also in the root `CLAUDE.md` → Publishing → npm Authentication): use the token automatically, do NOT prompt for an OTP and do NOT ask the user. If `op read` errors with a sign-in prompt, run `op signin`. If the token 401s, it has been rotated — ask the user to refresh the 1Password item.

### 6c. Publish in dependency order: `core` → `powerplatform-core` → service packages → `meta`

```bash
ORDER=(core powerplatform-core application-insights azure-b2c azure-data-factory \
  azure-devops azure-devops-admin azure-management azure-sql azure-storage fabric \
  figma github-enterprise log-analytics 1password rest-api powerplatform \
  powerplatform-customization powerplatform-data service-bus sharepoint teams todoist meta)

for pkg in $ORDER; do
  (cd "packages/$pkg" && npm publish --access public --userconfig="$TMPNPMRC") \
    && echo "✅ $pkg" || echo "❌ $pkg"
done

rm -f "$TMPNPMRC"   # never leave the token on disk
```

> `@mcp-consultant-tools/audit-cli` is on its own `0.1.x` track — only publish it when its own code changes (npm rejects re-publishing an unchanged `0.1.0`). `meta` publishes under the unscoped name `mcp-consultant-tools`.

Verify each publication:

```bash
npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME   # meta: npm dist-tag ls mcp-consultant-tools
```

## 7. ANNOUNCE + MERGE TO MAIN

### 7a. Teams announcement

Print the Teams announcement message produced by `/product-releasenotes` in step 1. Format depends on whether the release contains breaking changes (carried forward from beta):

- **Breaking changes:** `🚀 v{MAJOR}.0.0 is now live on the latest channel...` block with affected-packages list and the master release-notes URL pointing at `main`.
- **No breaking changes:** `🚀 v{MAJOR}.0.0 is now live on latest...` block with one-line summary and URL.

Post to Teams (the internal release channel).

### 7b. Beta dist-tags (DO NOT REMOVE)

- Do NOT deprecate or remove `beta` dist-tags.
- MCP server configs reference `@beta` — removing/deprecating would break them or cause warnings.
- The `beta` tag stays pointing at the last beta version (same code as production).
- When the next release cycle starts and a new beta is published (`--tag beta`), the tag will automatically move to the new beta version.

### 7c. Archive superseded release notes

`docs/release-notes/` shows only the current production master and the in-flight beta. On production promotion, move the now-superseded files to `docs/release-notes/archive/`:

```bash
# Move all per-iteration beta files for the just-released version to archive
mv docs/release-notes/v{X.Y.Z}-beta.*.md docs/release-notes/archive/

# Move the previous production master to archive (if it exists at top level)
# e.g. when shipping v31, archive v30.0.0.md
[ -f docs/release-notes/v{X-1}.0.0.md ] && mv docs/release-notes/v{X-1}.0.0.md docs/release-notes/archive/
```

The just-promoted master (`v{MAJOR}.0.0.md`) stays at the top level. It now shows as Released and is the new "current production master."

### 7d. Merge to main and tag

```bash
git checkout main && git pull origin main
git merge release/X.Y --no-edit
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## 8. CREATE NEXT RELEASE BRANCH

```bash
git checkout -b release/(X+1).0
```

The next release's master file (`docs/release-notes/v(X+1).0.0.md`) is created lazily on the first `/product-releasenotes beta` call from this branch — no manual scaffolding needed.

```bash
git push -u origin release/(X+1).0
```

---

## 9. LOG THE RELEASE (mandatory)

Run **`/log`** before you write the summary reply, not after. A release is the single most log-worthy event this repo produces, and it is the one an agent is most likely to skip, because publishing feels like the finish line.

**This is not a judgement call. If you published anything, you log it.** Do not ask whether it is worth logging.

The entry must carry, at minimum:

- Which packages were published and at which versions, and which dist-tag they landed on.
- The commit hash.
- What was verified, and explicitly what was **not** - a release note that overstates verification is worse than one that admits a gap.
- Anything that broke, surprised you or had to be worked around, in a `learned` field.

`/log` writes both logs: the shareable entry to the repo log and the full one to the vault. **Sanitise the repo entry** - it is committed to a public repo, so no tenant URLs, real filenames, client identifiers or colleague names, only the sanctioned placeholders from the Public Repo Hygiene section of `CLAUDE.md`.

Commit the log change and push it, so the repo log on the remote matches what was published.

For a production release the entry additionally records the promotion itself: which versions moved to the `latest` tag, the merge to `main`, the tag created, and the next release branch opened.

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

# Single-package promotion to latest
cd /absolute/path/packages/powerplatform && npm publish --access public

# Tag and push
git tag vX.Y.Z && git push origin vX.Y.Z
```

## NOTES

- The `publish-all.sh` script has interactive prompts for uncommitted changes and non-main branch.
- When using `cd` in bash commands, subsequent commands run from the new directory — use absolute paths.
- Only packages with changed versions need to be published.
- Commit version changes BEFORE publishing (npm reads from committed `package.json`).
- Always verify publications with `npm dist-tag ls` after publishing.
- The master release notes file is canonical from the first beta. Production promotion does NOT copy beta-iteration files to a new master — the master already exists. `/product-releasenotes production` only stamps the release date and updates URLs.
