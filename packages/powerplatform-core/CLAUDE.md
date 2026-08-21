# PowerPlatform Core Package Guide

## Overview

The `@mcp-consultant-tools/powerplatform-core` package contains shared services used by all PowerPlatform packages.

**This is an internal package - not for direct installation.**

## Purpose

Provides modular services that are consumed by:
- `@mcp-consultant-tools/powerplatform` (read-only)
- `@mcp-consultant-tools/powerplatform-customization` (write)
- `@mcp-consultant-tools/powerplatform-data` (CRUD)

## Services

Located in `src/services/`:

| Service | Purpose | Lines |
|---------|---------|-------|
| `AppService` | Model-driven app operations | ~300 |
| `AttributeService` | Attribute/column operations | ~400 |
| `BusinessRuleService` | Business rule inspection | ~200 |
| `DataService` | CRUD operations | ~300 |
| `DependencyService` | Component dependencies | ~200 |
| `EntityService` | Entity/table operations | ~400 |
| `FlowService` | Power Automate flow operations | ~500 |
| `FormService` | Form operations | ~300 |
| `MetadataService` | Metadata queries | ~300 |
| `OptionSetService` | Option set operations | ~300 |
| `PluginService` | Plugin inspection | ~400 |
| `PluginDeploymentService` | Plugin deployment | ~500 |
| `PublishingService` | Publish customizations | ~200 |
| `RelationshipService` | Relationship operations | ~300 |
| `SolutionService` | Solution management | ~400 |
| `ValidationService` | Best practices validation | ~600 |
| `ViewService` | View operations | ~300 |
| `WebResourceService` | Web resource operations | ~300 |
| `WorkflowService` | Classic workflow operations | ~400 |

## Architecture

Each service:
- Is focused on a single domain (~200-600 lines)
- Uses shared authentication from core client
- Follows consistent error handling patterns
- Logs operations via audit logger

## Paging and the truncation contract

**Every list method pages via `paginateDataverse` (`src/services/paginate.ts`) and returns a
`truncation` block built by `buildTruncation` from `@mcp-consultant-tools/core`.** Read
`paginate.ts`'s header before writing a new one - it is the clearest statement in the repo of why
`$top` cannot answer "is there more".

Never derive `hasMore` from a returned row count. Dataverse caps every response at 5,000 rows
whatever `$top` asks for and sends no continuation token for a `$top`-capped query, so the
`$top = max + 1` sentinel row can never arrive at the cap: the server returns exactly 5,000,
`5000 > 5000` is false, and a truncated result is reported as complete. `hasMore` comes from an
`@odata.nextLink` or from a fetched-but-unreturned surplus row, and from nothing else.

Metadata endpoints (`EntityDefinitions`, `GlobalOptionSetDefinitions`) ignore `$top`,
`Prefer: odata.maxpagesize` and `@odata.nextLink` alike. `paginateDataverse` still answers
correctly there, on the surplus-row branch. Do not "optimise" a `$top` back in.

Two guards when auditing this class of defect:

```bash
grep -rn "maxRecords + 1\|maxResults + 1\|limit + 1" packages/powerplatform-core/src
grep -rn "\.length > max\|\.length > limit" packages/powerplatform-core/src
```

Run both. `getFlowRuns` spelled its cap `$top=${limit + 1}` inline in the URL, which is how it
survived two separate counts of the defect - a grep for one spelling misses it.

A cap enforced by slicing a list client-side counts as the same defect even with no `hasMore` field
in sight. `ValidationService` still does this; it is recorded in `docs/KNOWN_ISSUES.md`.

## File Size Management

This package was created to address file size limits:
- Original: PowerPlatformService.ts at ~12k lines
- Refactored: 18 services averaging ~350 lines each
- Target: No service exceeds 800 lines
