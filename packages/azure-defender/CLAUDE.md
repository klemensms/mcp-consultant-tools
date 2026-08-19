# Azure Defender Package Guide

## Overview

MCP server for Microsoft Defender for Cloud: secure score, security assessments, regulatory compliance, and Defender CSPM attack paths.

**Tools:** 12 (all read-only) | **Prompts:** 3 | **Auth:** Entra ID (Service Principal)

There are no write operations and no feature flags. Nothing in this package mutates Azure.

## Environment Configuration

```bash
# Required - all four. Every tool is subscription-scoped.
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_SUBSCRIPTION_ID=your-subscription-id
```

Same four variables as `azure-management`. One service principal can serve both, given `Reader` + `Security Reader`.

## Required Azure Permissions

| Role | Scope | Purpose |
|------|-------|---------|
| `Security Reader` | Subscription | All 12 tools |

Attack paths additionally need the **Defender CSPM plan** enabled (plus agentless VM scanning, or Defender for Servers vulnerability assessment).

## Tools

**Secure score**
- `defender-get-secure-score` — the score (defaults to the `ascScore` initiative)
- `defender-list-secure-scores` — one row per initiative
- `defender-list-score-controls` — controls with healthy/unhealthy resource counts

**Assessments**
- `defender-list-assessments` — recommendations against resources, filterable by status
- `defender-get-assessment` — one assessment for one ARM resource
- `defender-list-assessment-metadata` — the definition catalogue: severity, categories, remediation

**Compliance**
- `defender-list-compliance-standards` — standards enabled on the subscription
- `defender-list-compliance-controls` — controls within a standard
- `defender-list-compliance-assessments` — assessments behind a control
- `defender-get-compliance-summary` — per-standard roll-up

**Attack paths**
- `defender-list-attack-paths` — CSPM attack paths via Azure Resource Graph
- `defender-get-attack-path` — one path in full, with its graph components

## Things that will bite you

**An attack path arrives in one of TWO shapes, and reading only the documented one hides its entire risk payload.** Microsoft's published field table (`learn.microsoft.com/azure/defender-for-cloud/attack-path-api`, unchanged as of 2026-08-19) lists only the legacy Defender CSPM names: `potentialImpact`, `riskCategories`, `entryPointEntityInternalID`, `targetEntityInternalID`. Live rows on a tenant whose attack paths come from Microsoft Security Exposure Management instead carry `riskLevel`, `riskFactors`, `entryPoint`, `target`, `attackPathSteps`, `mITRETacticsAndTechniques`, `attackStory` and `isPartialAttackPath`. Mapping only the documented set printed a `riskLevel: High` path as impact `Unknown` with no risk categories, on every path of a real estate. **Never key a filter, a count or a display line on one spelling** — use `effectiveRiskLevel` / `effectiveRiskFactors` in `services/attack-path-service.ts`, and note each risk filter emits an `or` across both names. Anything neither shape names lands in `properties.unmappedProperties` rather than being dropped. `riskLevel` and `riskFactors` also exist, separately, on the `risk` object of `Microsoft.Security/assessments@2025-05-04`: same names, different fields. `graphComponent` holds `insights`/`entities`/`connections`, not `nodes`/`edges`.

**A missing risk level is a gap in the payload, not a finding of no risk.** `summary.riskLevelNotReported` counts paths naming no level under either spelling, they bucket under `NotReported` rather than `Unknown`, `summary.note` appears, and the CLI prints "not reported by the API". Never let an absent field render as a value the API returned.

**An empty attack-path list is not a clean bill of health.** Attack paths only exist with Defender CSPM enabled. The Resource Graph query succeeds and returns zero rows when the plan is off, indistinguishable from a genuinely clean subscription.

**An empty compliance-standards list means none are enabled**, not that the subscription is compliant.

**`truncated: true` means the counts are a lower bound.** `summary` always describes exactly the rows returned. Omit `maxResults` for subscription-wide totals.

**`defender-list-assessments` reads TWO sources, and each covers the other's blind spot.** The ARM list at subscription scope only returns assessments on resources *inside* the subscription, so everything scoped to the subscription itself or to an identity object is invisible to it: that is the whole RBAC set (disabled accounts with owner permissions, guest accounts with write permissions, overprovisioned identities), which is the highest-value content a Defender report carries. Those come from Resource Graph's `securityresources` instead. Resource Graph has the reverse blind spot: it returns nothing on a subscription with no paid Defender plan, where ARM still returns data. The two are unioned on the **lower-cased** id, because Resource Graph lower-cases every id it returns and ARM does not. `summary.sources` reports what each contributed; `summary.note` appears whenever the list is known to be incomplete. Never report `summary.total` without reading `note`.

**The assessment Resource Graph mapper names seven `properties` keys, and that list came from documentation rather than a captured row.** `displayName`, `status`, `resourceDetails`, `risk`, `additionalData`, `metadata`, `links` — anything else arrives in `properties.unmappedProperties`, and the distinct names are aggregated into `summary.unmappedPropertyKeys` plus a sentence in `summary.note`. The aggregate is collected before the union drops duplicates and before `maxResults` trims, so one row out of thousands cannot hide the field. This is the same defect class as the attack-path mapper above, found by looking rather than by breaking: **check `unmappedPropertyKeys` before reporting that no assessment carries risk data.** A real estate measured zero `properties.risk` objects across 4,886 unhealthy assessments and zero `Critical` severities, and until a live call reports this field there is no way to tell an API that returns neither from a mapper that discards both.

**`statusFilter` on `defender-list-assessments` makes it slower, not faster,** and `maxResults` no longer makes it cheaper. Neither source filters on status server-side, so both are scanned in full and trimmed afterwards. Handing `maxResults` to the ARM list would decide the answer before the second source was read: the cut falls on ARM's rows, so the identity- and subscription-scoped assessments would be exactly what is lost.

**A Resource Graph refusal does not fail `defender-list-assessments`.** It is recorded through `FanOutRecorder`, so `sources.resourceGraph.available` goes false, `note` says what is missing, `fanOut.failures` carries the error and the CLI exits 1. Attack paths, which have no second source, still fail loudly.

**`averageScorePercentage` from `defender-list-score-controls` is an unweighted mean.** It is not the secure score.

**`compliancePercentage` excludes skipped and unsupported controls** from the denominator (matching the portal), so it will not equal `passedControls / totalControls`.

**API versions are pinned deliberately, with reasons, in `src/utils/defender-api-versions.ts`.** Two are counter-intuitive:
- `assessments` / `assessmentMetadata` are on `2025-05-04`, not `2020-01-01`. The old version's severity enum stops at `High` — it cannot express `Critical` at all.
- `regulatoryCompliance*` is on `2019-01-01-preview` and **must stay there**. That is the only version this surface has ever had; no GA exists. It is not a stale pin.

A stale api-version does not fail loudly. It 400s, or silently returns an older schema.

**Resource Graph has no query-parameter binding.** Filter values are escaped into the KQL literal by `src/utils/kql.ts`, which escapes the backslash *before* the quote. Escaping only the quote lets a trailing `\` close the literal and inject clauses. Never interpolate a value into a query without `kqlString()`.

## Architecture Notes

- `AzureAuthProvider` is duplicated here rather than shared. Every Azure package in this repo (`azure-management`, `azure-b2c`, `azure-storage`, `fabric`, `service-bus`, ...) carries its own credential wiring, and `core` exports no Azure auth. Hoisting it to `core` would ripple into the sibling `mcp-computer-use` repo on the next core version bump.
- Services compose over `DefenderClient`, so retries, error normalisation and pagination apply once.
- There is exactly **one** `createServiceContext()`, in `context-factory.ts`, imported by both `index.ts` and `cli.ts`. Do not replicate `azure-sql`'s duplicate private copy.
- The subscription ID is never logged.

## Testing

```bash
npm run build --workspace=packages/azure-defender
npm test --workspace=packages/azure-defender   # 97 tests, no live API
```

`axios` and `@azure/identity` are mocked at the module boundary, so the suite runs offline.

**Not verified against a live Defender subscription.** The ARM contract is checked against Microsoft's published schemas and mocked responses only.

## Reference

See `docs/technical/AZURE_DEFENDER_TECHNICAL.md` for the full reference.

## CLI Usage

Binary: `mcp-defender-cli`. Command name = tool name minus the `defender-` prefix, grouped by domain.

```bash
mcp-defender-cli score get-secure-score --score-name ascScore
mcp-defender-cli score list-score-controls --max-results 10

mcp-defender-cli assessment list-assessments --status Unhealthy --max-results 50
mcp-defender-cli assessment list-assessment-metadata --severity Critical

mcp-defender-cli compliance list-compliance-standards
mcp-defender-cli compliance list-compliance-controls Azure-CIS-1.1.0 --state Failed
mcp-defender-cli compliance get-compliance-summary

mcp-defender-cli attack-path list-attack-paths --risk-category DataExposure --name-contains "storage account"
mcp-defender-cli attack-path get-attack-path <attackPathName>
```
