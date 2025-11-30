RELEASE WORKFLOW (Post-Beta Validation)

## 0. PRE-FLIGHT CHECKS
   - Verify npm login: `npm whoami`
   - Check current branch: should be on release/X.Y
   - Check git status for uncommitted changes
   - Identify which packages have beta versions to release:
     ```bash
     find packages -name "package.json" -maxdepth 2 | xargs -I {} sh -c \
       'pkg=$(dirname {} | xargs basename); ver=$(grep "\"version\"" {} | head -1 | sed "s/.*\"\([^\"]*\)\".*/\1/"); echo "$pkg: $ver"'
     ```
   - Check current npm dist-tags for packages being released:
     ```bash
     npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME
     ```

## 1. FINALIZE RELEASE NOTES
   - Review docs/release_notes/vX.Y.Z-beta.N.md for current release
   - Create final release notes file: docs/release_notes/vX.Y.Z.md
     - Copy content from beta notes
     - Remove "Beta Testing Configuration" section
     - Remove "Beta Testing Checklist" section
     - Change status from "Beta Testing" to released
     - Add release date (today's date: YYYY-MM-DD)
   - Verify all implemented features are documented

## 2. DOCUMENTATION VERIFICATION
   - Verify README.md tool/prompt counts match implementation
   - Verify CLAUDE.md monorepo section has correct counts
   - Check docs/documentation/*.md files are current

## 3. PRE-PUBLISH VALIDATION
   - Run full build: `npm run build`
   - Verify all builds exist:
     ```bash
     for pkg in core application-insights azure-devops azure-sql figma github-enterprise \
       log-analytics powerplatform powerplatform-customization powerplatform-data \
       service-bus sharepoint meta; do
       [ -d "packages/$pkg/build" ] && echo "✅ $pkg" || echo "❌ $pkg - MISSING"
     done
     ```

## 4. VERSION BUMP (beta → release)
   - Edit package.json for ONLY packages with beta versions
   - Change version from X.Y.Z-beta.N → X.Y.Z
   - Packages that stayed at previous version (e.g., 20.0.0) do NOT need bumping

## 5. COMMIT VERSION CHANGES (before publish)
   - Stage version bumps and release notes:
     ```bash
     git add packages/*/package.json docs/release_notes/vX.Y.Z.md
     ```
   - Commit with message:
     ```bash
     git commit -m "chore: bump versions to X.Y.Z for production release"
     ```
   - Push release branch: `git push origin release/X.Y`

## 6. PUBLISH TO NPM (latest tag)
   - Option A: Use publish script (interactive, requires confirmations):
     ```bash
     ./scripts/publish-all.sh --skip-build
     ```
   - Option B: Publish individual packages directly (recommended for automation):
     ```bash
     cd packages/PACKAGE_NAME && npm publish --access public
     ```
   - Publish in dependency order: core → service packages → meta
   - Only publish packages that have new versions
   - Verify each publication:
     ```bash
     npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME
     ```

## 7. DEPRECATE OLD BETAS
   - Deprecate beta versions for each package released:
     ```bash
     npm deprecate @mcp-consultant-tools/PACKAGE@X.Y.Z-beta.N "Use X.Y.Z instead"
     npm deprecate mcp-consultant-tools@X.Y.Z-beta.N "Use X.Y.Z instead"
     ```
   - Note: Check actual beta versions on npm first (may differ from local)

## 8. MERGE TO MAIN AND TAG
   - Switch to main: `git checkout main && git pull origin main`
   - Merge release branch: `git merge release/X.Y --no-edit`
   - Create git tag: `git tag vX.Y.Z`
   - Push everything:
     ```bash
     git push origin main
     git push origin vX.Y.Z
     ```

## 9. CREATE NEXT RELEASE BRANCH
   - Create new branch from main: `git checkout -b release/(X+1).0`
   - Create initial release notes: docs/release_notes/v(X+1).0.0-beta.1.md
   - Use template structure (Overview, Breaking Changes, New Features, etc.)
   - Commit: `git commit -m "docs: initialize v(X+1).0.0-beta.1 release notes"`
   - Push: `git push -u origin release/(X+1).0`

---

## QUICK REFERENCE COMMANDS

```bash
# Check npm login
npm whoami

# Check all package versions
find packages -name "package.json" -maxdepth 2 | xargs -I {} sh -c \
  'pkg=$(dirname {} | xargs basename); ver=$(grep "\"version\"" {} | head -1 | sed "s/.*\"\([^\"]*\)\".*/\1/"); echo "$pkg: $ver"'

# Check npm dist-tags for a package
npm dist-tag ls @mcp-consultant-tools/powerplatform

# Publish single package
cd packages/powerplatform && npm publish --access public

# Deprecate a beta
npm deprecate @mcp-consultant-tools/powerplatform@21.0.0-beta.1 "Use 21.0.0 instead"

# Create and push tag
git tag vX.Y.Z && git push origin vX.Y.Z
```

## NOTES

- The publish-all.sh script has interactive prompts for uncommitted changes and non-main branch
- When using cd in bash commands, subsequent commands run from new directory - use absolute paths
- Only packages with changed versions need to be published
- Commit version changes BEFORE publishing (npm reads from committed package.json)
- Always verify publications with `npm dist-tag ls` after publishing
