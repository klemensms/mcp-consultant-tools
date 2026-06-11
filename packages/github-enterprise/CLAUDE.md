# GitHub Enterprise Package Guide

## Overview

GitHub Enterprise integration for repository access, branch detection, PR management, and cross-service correlation.

- **Tools:** 25-37 tools (depends on feature flags), 5 prompts
- **Authentication:** Personal Access Token (PAT) or GitHub App
- **Caching:** Built-in response caching

## Environment Configuration

```bash
# GitHub Enterprise URL
GHE_URL=https://github.yourcompany.com

# PAT Authentication (recommended)
GHE_PAT=ghp_your_personal_access_token_here
GHE_AUTH_METHOD=pat  # or 'github-app'

# Repository configuration (JSON array)
GHE_REPOS=[{"id":"plugin-core","owner":"yourorg","repo":"PluginCore","defaultBranch":"release/9.0","active":true}]

# Caching
GHE_ENABLE_CACHE=true
GHE_CACHE_TTL=300

# Write permissions (default: false)
GHE_ENABLE_WRITE=false
GHE_ENABLE_CREATE=false
GHE_ENABLE_PR_WRITE=false
```

## Tool Categories

### Base Tools (22 tools)
- `ghe-list-repos` - List configured repos
- `ghe-get-file` - Read file from repo
- `ghe-list-branches` - All branches
- `ghe-get-commits` - Commit history
- `ghe-get-pull-request` - PR details
- `ghe-search-code` - Search across repos

### PR Read Tools (3 tools, always available)
- `ghe-list-pr-reviews` - List reviews on a PR
- `ghe-list-pr-comments` - List general comments
- `ghe-get-pr-diff` - Get PR diff

### PR Write Tools (11 tools, requires GHE_ENABLE_PR_WRITE=true)
- `ghe-submit-pr-review` - Approve/request changes/comment
- `ghe-add-pr-comment` - Add general comment
- `ghe-add-review-comment` - Add inline comment
- `ghe-merge-pull-request` - Merge PR (squash/merge/rebase)
- `ghe-reply-to-review-comment` - Reply to review comment
- `ghe-update-pull-request` - Update title/body/state
- `ghe-request-pr-reviewers` - Request reviewers
- `ghe-remove-pr-reviewers` - Remove reviewers
- `ghe-add-pr-labels` - Add labels
- `ghe-remove-pr-label` - Remove label
- `ghe-close-pull-request` - Close without merge

### PR Create Tool (1 tool, requires GHE_ENABLE_CREATE=true)
- `ghe-create-pull-request` - Create new PR

## Branch Detection

Automatic branch detection for current context:
- Uses git remote URL matching
- Falls back to configured default branch
- Caches branch information

## Cross-Service Correlation

Correlates GitHub commits with:
- Plugin deployments (Dataverse)
- Pipeline runs (Azure DevOps)
- Deployment events

## Reference

See `docs/technical/GITHUB_ENTERPRISE_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-ghe-cli`

```bash
# List repos
mcp-ghe-cli repo list

# Get file
mcp-ghe-cli file get plugin-core src/index.ts
```
