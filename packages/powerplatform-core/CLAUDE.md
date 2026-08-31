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
in sight. `ValidationService.validateBestPractices` does slice, and reports it: the enumeration
finishes before the slice, so its `truncation` block carries a real `totalAvailable` rather than the
null a paged read would give. If you add another client-side cap, follow that pattern and put the
warning on the summary line too - `validationFanOutSuffix` is where a reader actually sees it.

### Three shapes of incomplete, and the one that has no helper

`buildTruncation` and `FanOutRecorder` cover two of the three ways a result can be short. Before
reaching for either, decide which shape you actually have, because forcing the wrong one writes a
false claim into the payload:

| Shape | Example | What to use |
|---|---|---|
| A **dropped item** in an iteration, the rest continuing | one flow definition unreadable out of forty | `FanOutRecorder` |
| A **capped list**, more rows existing at the source | `$top` without a continuation token | `buildTruncation` |
| A **whole section that failed**, returning its empty accumulator | the complexity walk throwing on a malformed definition | neither - propagate |

The third has no helper and must not borrow one. `buildTruncation` would have to say `hasMore: true`
and `truncationReason: 'requestedMax'`, neither of which happened, in the one contract whose purpose
is to stop a payload claiming what it cannot support. Instead let the error out of the utility and
name the section where the caller assembles its result: `analyseOneFlow` collects
`analysisFailures: { section, reason }[]` onto the flow, `generateAuditReport` collects
`completeness.failures` onto the report, and the summary carries a count so a reader who never opens
the payload still sees it.

The four utilities behind `analyseOneFlow` - `extractComplexityFactors`, `extractComplexityFlags`,
`extractUrlsFromFlowDefinition` and `detectHardcodedSecrets` - now throw rather than returning a
partial. Do not restore a `catch` to any of them: an empty result from these reads as a simple flow
with no outbound URLs and no hardcoded secrets, which is the answer that costs most when wrong.

## File Size Management

This package was created to address file size limits:
- Original: PowerPlatformService.ts at ~12k lines
- Refactored: 18 services averaging ~350 lines each
- Target: No service exceeds 800 lines
