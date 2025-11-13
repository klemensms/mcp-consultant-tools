# Release Notes

This directory contains user-facing release notes for all published versions of mcp-consultant-tools.

## Format

Release notes are written in TLDR style aimed at end users. Each release note file follows this structure:

```markdown
# Release vX.Y.Z

Released: YYYY-MM-DD

## Breaking Changes
- Changes requiring user action

## New Features
- New capabilities and integrations

## Changes to Existing Features
- Improvements and modifications
```

## Guidelines

**Target Audience:** Developers using the packages (not package maintainers)

**Style:**
- Concise and scannable
- Actionable information
- Clear language without jargon

**Include:**
- Breaking changes requiring configuration updates
- New integrations, tools, and prompts
- Significant improvements to existing features
- Important bug fixes

**Exclude:**
- Internal refactoring
- Build process changes
- Minor dependency updates
- Implementation details

## Template

Use [`TEMPLATE.md`](./TEMPLATE.md) as a starting point for new release notes.

## Naming Convention

Release note files are named: `vX.Y.Z.md`

Examples:
- `v20.0.0.md`
- `v19.1.2.md`
- `v18.0.0-beta.1.md` (for beta releases)

## When to Create

Release notes should be created **after beta validation** and **before promoting to production** (latest tag).

See [RELEASE_PROCESS.md](../documentation/RELEASE_PROCESS.md) for the full release workflow.
