# Release Process & Pre-Release Testing

This document describes the safe release process for mcp-consultant-tools packages, including pre-release testing strategies to prevent breaking production users.

## Overview

The monorepo uses **npm dist tags** to enable safe pre-release testing. This allows you to:
- Test packages via `npx` before releasing to production
- Publish beta versions that don't affect regular users
- Quickly rollback if issues are discovered
- Iterate on fixes without impacting the `latest` tag

## Release Workflow

### 1. Local Development & Testing

Work on `release/*` branches and test locally:

```bash
# Build the package
npm run build

# Test using local node command
node build/index.js

# For specific package in monorepo
cd packages/powerplatform
npm run build
node build/index.js
```

**Configuration**: Use absolute path in MCP client config:
```json
{
  "command": "node",
  "args": ["/absolute/path/to/mcp-consultant-tools/build/index.js"]
}
```

### 2. Package Validation (Pre-Publish Check)

Before publishing, validate the exact package structure that npm will publish:

```bash
# Pack the package (creates .tgz file)
npm pack

# Example output: mcp-consultant-tools-powerplatform-1.0.0-beta.1.tgz

# Test the tarball with npx
npx ./mcp-consultant-tools-powerplatform-1.0.0-beta.1.tgz

# Or for meta-package
cd packages/meta
npm pack
npx ./mcp-consultant-tools-1.0.0-beta.1.tgz
```

**What this tests:**
- Package structure and `files` field in package.json
- Binary paths and entry points
- Dependency resolution
- Exact behavior users will get from npm

### 3. Beta Release (Safe External Testing)

Publish to npm with `beta` tag for external validation:

```bash
# Create pre-release version
npm version prerelease --preid=beta
# Example: 1.0.0 → 1.0.0-beta.1

# Publish with beta tag (doesn't affect 'latest')
npm publish --tag beta

# Push version commit and tag to GitHub
git push && git push --tags
```

**Testing beta release:**
```bash
# Users must explicitly request beta
npx @mcp-consultant-tools/powerplatform@beta mcp-pp

# Or for meta-package
npx mcp-consultant-tools@beta
```

**Benefits:**
- Regular users on `latest` tag are unaffected
- You can test via real npx from npm registry
- Can iterate with multiple beta releases (beta.1, beta.2, etc.)

### 4. Iterating on Beta

If you find issues, fix them and publish a new beta:

```bash
# Make fixes on release/* branch
npm run build

# Test locally first
npm pack
npx ./*.tgz

# Publish next beta iteration
npm version prerelease --preid=beta
# Example: 1.0.0-beta.1 → 1.0.0-beta.2

npm publish --tag beta
git push && git push --tags
```

### 5. Production Release

When beta is validated, promote to production:

**Option A: Promote existing beta version**
```bash
# Merge to main
git checkout main
git merge release/X.Y

# Promote beta to latest tag
npm dist-tag add @mcp-consultant-tools/powerplatform@1.0.0-beta.2 latest

# Push to GitHub
git push && git push --tags
```

**Option B: Publish as final version**
```bash
# Merge to main
git checkout main
git merge release/X.Y

# Create final version (removes -beta suffix)
npm version patch
# Example: 1.0.0-beta.2 → 1.0.0

# Publish to 'latest' (default tag)
npm publish

# Push to GitHub
git push && git push --tags
```

## Version Numbering

### Pre-Release Versions

Follow semantic versioning with pre-release identifiers:

```
1.0.0-beta.1    # First beta
1.0.0-beta.2    # Second beta
1.0.0-rc.1      # Release candidate
1.0.0           # Final release
```

### Version Bump Commands

```bash
# Pre-release versions
npm version prerelease --preid=beta   # 1.0.0 → 1.0.0-beta.1
npm version prerelease --preid=beta   # 1.0.0-beta.1 → 1.0.0-beta.2
npm version prerelease --preid=rc     # 1.0.0-rc.1

# Production versions
npm version patch    # Bug fixes (1.0.0 → 1.0.1)
npm version minor    # New features (1.0.0 → 1.1.0)
npm version major    # Breaking changes (1.0.0 → 2.0.0)
```

## Viewing Published Versions

Check what's published and under which tags:

```bash
# View all versions and tags for a package
npm view @mcp-consultant-tools/powerplatform

# View specific tag version
npm view @mcp-consultant-tools/powerplatform@beta version

# List all dist-tags
npm dist-tag ls @mcp-consultant-tools/powerplatform

# Example output:
# latest: 1.0.0
# beta: 1.0.1-beta.1
```

## Emergency Rollback

If a broken version is accidentally published to `latest`:

### Deprecate the Broken Version
```bash
# Warn users about the broken version
npm deprecate @mcp-consultant-tools/powerplatform@1.0.5 "Broken - use 1.0.4 instead"
```

### Rollback 'latest' Tag
```bash
# Point 'latest' back to the last good version
npm dist-tag add @mcp-consultant-tools/powerplatform@1.0.4 latest

# Verify
npm dist-tag ls @mcp-consultant-tools/powerplatform
```

**Note:** npm allows `unpublish` within 72 hours if the package has low downloads, but deprecation + tag rollback is safer and more transparent.

## Monorepo Publishing

### Individual Package Release

For single package updates (e.g., only PowerPlatform changed):

```bash
cd packages/powerplatform

# Build and validate
npm run build
npm pack
npx ./*.tgz

# Publish beta
npm version prerelease --preid=beta
npm publish --tag beta

# Test via npx
npx @mcp-consultant-tools/powerplatform@beta mcp-pp

# Promote to latest
npm dist-tag add @mcp-consultant-tools/powerplatform@$(npm view . version) latest
```

### Meta-Package Release

When multiple packages change or for full releases:

```bash
# Publish individual packages first (to latest)
cd packages/core && npm publish
cd ../powerplatform && npm publish
cd ../azure-devops && npm publish
# ... etc

# Then publish meta-package
cd packages/meta
npm version minor  # Bump meta-package version
npm publish

git push && git push --tags
```

**Use `scripts/publish-all.sh` for coordinated releases** (publishes in dependency order: core → services → meta).

## Helpful Package.json Scripts

Add these scripts to package.json for common tasks:

```json
{
  "scripts": {
    "build": "tsc",
    "pack-test": "npm pack && echo 'Test with: npx ./*.tgz'",
    "publish-beta": "npm version prerelease --preid=beta && npm publish --tag beta",
    "publish-rc": "npm version prerelease --preid=rc && npm publish --tag rc",
    "promote-latest": "npm dist-tag add @mcp-consultant-tools/powerplatform@$(npm view . version) latest"
  }
}
```

## Testing Checklist

Before promoting to production, verify:

- [ ] Local testing with `node build/index.js` passes
- [ ] Package validation with `npm pack` + `npx ./*.tgz` passes
- [ ] Beta release published and tested via `npx @scope/package@beta`
- [ ] All tools and prompts work correctly
- [ ] Environment variables load correctly
- [ ] Error handling works as expected
- [ ] Cross-service integrations work (if applicable)
- [ ] Documentation updated (README.md, CLAUDE.md, docs/documentation/*.md)

## Quick Reference

### Common Commands

```bash
# Local testing
npm run build && node build/index.js

# Package validation
npm pack && npx ./*.tgz

# Publish beta
npm version prerelease --preid=beta && npm publish --tag beta

# Test beta
npx @mcp-consultant-tools/powerplatform@beta mcp-pp

# Promote to latest
npm dist-tag add @mcp-consultant-tools/powerplatform@1.0.0-beta.1 latest

# Check published tags
npm dist-tag ls @mcp-consultant-tools/powerplatform

# Rollback latest
npm dist-tag add @mcp-consultant-tools/powerplatform@1.0.4 latest
```

## Summary

**Key Principles:**
1. Never publish directly to `latest` without testing
2. Use `npm pack` to validate package structure
3. Use `beta` tag for external testing via npx
4. Iterate on beta releases until validated
5. Promote to `latest` only when confident
6. Keep `main` branch in sync with `latest` tag

This workflow ensures:
- ✅ Safe testing via real npx
- ✅ No risk to production users
- ✅ Easy rollback if issues found
- ✅ Professional release workflow
- ✅ Matches standard npm best practices
