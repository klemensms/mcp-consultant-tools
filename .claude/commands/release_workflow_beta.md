BETA RELEASE WORKFLOW

## 0. PRE-FLIGHT CHECKS
   - Verify npm login: `npm whoami`
   - Check current branch: should be on release/X.Y
   - Check git status for uncommitted changes
   - Identify current package versions:
     ```bash
     find packages -name "package.json" -maxdepth 2 | xargs -I {} sh -c \
       'pkg=$(dirname {} | xargs basename); ver=$(grep "\"version\"" {} | head -1 | sed "s/.*\"\([^\"]*\)\".*/\1/"); echo "$pkg: $ver"'
     ```
   - Check current npm beta tags:
     ```bash
     npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME
     ```

## 1. UPDATE RELEASE NOTES
   - Review/create docs/release_notes/vX.Y.Z-beta.N.md
   - Ensure all implemented features are documented
   - Include "Beta Testing Configuration" section with:
     - JSON config examples for each affected integration
     - All required environment variables
   - Include "Beta Testing Checklist" with specific items to verify
   - List any breaking changes clearly with migration steps

## 2. DOCUMENTATION VERIFICATION
   - Verify README.md tool/prompt counts match implementation
   - Verify CLAUDE.md monorepo section has correct counts
   - Check docs/documentation/*.md files are current for new features

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

## 4. VERSION BUMP
   - Option A: Increment existing beta (e.g., 21.0.0-beta.1 → 21.0.0-beta.2)
   - Option B: Create initial beta (e.g., 20.0.0 → 21.0.0-beta.1)
   - Only bump packages that have changes for this release
   - Edit package.json files directly

## 5. COMMIT VERSION CHANGES (before publish)
   - Stage version bumps and release notes:
     ```bash
     git add packages/*/package.json docs/release_notes/vX.Y.Z-beta.N.md
     ```
   - Commit with message:
     ```bash
     git commit -m "chore: bump to X.Y.Z-beta.N for beta testing"
     ```
   - Push release branch: `git push origin release/X.Y`

## 6. PUBLISH TO NPM (beta tag)
   - Option A: Use publish script (interactive, requires confirmations):
     ```bash
     ./scripts/publish-all.sh --skip-build --tag beta
     ```
   - Option B: Publish individual packages directly (recommended):
     ```bash
     cd /absolute/path/packages/PACKAGE_NAME && npm publish --access public --tag beta
     ```
   - Publish in dependency order: core → service packages → meta
   - Only publish packages that have new versions
   - Verify each publication:
     ```bash
     npm dist-tag ls @mcp-consultant-tools/PACKAGE_NAME
     ```
     Should show: `beta: X.Y.Z-beta.N`

## 7. HANDOFF FOR TESTING
   - Provide user with:
     - Link to release notes (serves as test checklist)
     - Beta install command: `npx @mcp-consultant-tools/PACKAGE@beta`
     - List of specific features/changes to validate

   🛑 **STOP** - Await user feedback before proceeding to production release

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

# Publish single package to beta
cd /absolute/path/packages/powerplatform && npm publish --access public --tag beta

# Verify beta installation
npx @mcp-consultant-tools/powerplatform@beta --version
```

## SELECTIVE BETA PUBLISHING (Faster Iterations)

When iterating on beta fixes, publish ONLY affected packages:

```bash
# Fix found in powerplatform only - publish just that package
cd packages/powerplatform
# Edit package.json: bump version (e.g., beta.1 → beta.2)
npm publish --access public --tag beta

# Update release notes with fixes
# Commit changes
git add packages/powerplatform/package.json docs/release_notes/*.md
git commit -m "fix: description of fix (beta.2)"
git push
```

**Why selective publishing during beta:**
- Much faster (1 package vs 13 packages)
- Rapid iteration for quick bug fixes
- Users can test immediately with `@mcp-consultant-tools/package@beta`
- Version alignment handled when promoting to production

## NOTES

- The publish-all.sh script has interactive prompts for uncommitted changes and non-main branch
- When using cd in bash commands, subsequent commands run from new directory - use absolute paths
- Only packages with changes need to be published
- Commit version changes BEFORE publishing
- Beta tag doesn't affect `latest` - safe to publish without impacting production users
- Always verify publications with `npm dist-tag ls` after publishing
