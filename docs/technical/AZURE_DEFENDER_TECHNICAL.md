# Microsoft Defender for Cloud - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/AZURE_DEFENDER.md -->

<overview>

The Azure Defender integration reads Microsoft Defender for Cloud posture data through the Azure Resource Manager (ARM) REST API, plus Azure Resource Graph for attack paths. Every tool is read-only; the package has no write operations and no feature flags.

**Package:** `@mcp-consultant-tools/azure-defender`
**Binaries:** `mcp-defender` (MCP server), `mcp-defender-cli` (CLI)
**Total tools:** 12 (all read-only)
**Prompts:** 3
**Auth:** Entra ID service principal (`ClientSecretCredential`) against `https://management.azure.com`

</overview>

<architecture>

## Architecture

**Client layer:**
- `AzureAuthProvider` — wraps `ClientSecretCredential`, caches the ARM token until 5 minutes before expiry
- `DefenderClient` — authenticated axios instance against `management.azure.com`; retries `429/500/502/503/504` with exponential backoff (honouring `Retry-After`), normalises ARM error bodies into `Error(code: message)`, and paginates `nextLink` chains

**Service classes** (each takes an injected `DefenderClient`, so retries, error normalisation and pagination apply once):
- `SecureScoreService` — secure score and score controls
- `AssessmentService` — security assessments and the assessment-definition catalogue
- `ComplianceService` — regulatory compliance standards, controls, assessments, and roll-up
- `AttackPathService` — Defender CSPM attack paths via Azure Resource Graph

`ServiceContext` exposes four lazy getters. There is exactly **one** `createServiceContext()` (in `context-factory.ts`), imported by both `index.ts` and `cli.ts` — unlike `azure-sql`, which carries a duplicate private copy.

**Source layout:**
```
packages/azure-defender/src/
  index.ts                        # MCP server entry + registerAzureDefenderTools()
  cli.ts                          # CLI entry point
  context-factory.ts              # Single shared createServiceContext() for MCP + CLI
  types.ts                        # ServiceContext interface
  defender-client.ts              # AzureAuthProvider + DefenderClient + PaginatedResult
  models/
    defender-types.ts             # ARM response shapes
  utils/
    defender-api-versions.ts      # Pinned api-versions, with the reason for each pin
    kql.ts                        # KQL string-literal escaping for Resource Graph
    __tests__/kql.test.ts
  services/
    secure-score-service.ts       # toPercent, summariseScoreControls
    assessment-service.ts         # normalizeArmResourceId, summariseAssessments
    compliance-service.ts         # compliancePercentage
    attack-path-service.ts        # buildAttackPathListQuery, mapAttackPathRow
    alert-service.ts              # filterAlerts, summariseAlerts (client-side filtering)
    pricing-service.ts            # summarisePricings, cspmVerdict
    __tests__/*.test.ts
  tools/
    tool-helpers.ts               # runTool() response shape, READ_ONLY annotations
    secure-score-tools.ts         # 3 tools
    assessment-tools.ts           # 3 tools
    compliance-tools.ts           # 4 tools
    attack-path-tools.ts          # 2 tools
    alert-tools.ts                # 1 tool
    pricing-tools.ts              # 1 tool
  prompts/
    templates.ts                  # 3 prompt templates
  cli/
    output.ts                     # .mcp-defender-cache wrapper
    commands/                     # score, assessment, compliance, attack-path, alert, plan groups
  __tests__/defender-client.test.ts
```

</architecture>

<api-versions>

## Pinned API versions

Verified against Microsoft Learn and `Azure/azure-rest-api-specs` on 2026-07-10. All call sites pass an api-version explicitly; there is **no** resolve-from-path fallback, because a path such as `/subscriptions/x/.../providers/Microsoft.Compute/virtualMachines/vm/providers/Microsoft.Security/assessments/y` contains two providers and any regex picks the wrong one.

| Surface | Pinned | Why |
|---------|--------|-----|
| `Microsoft.Security/secureScores` | `2020-01-01` | Only GA version ever shipped |
| `Microsoft.Security/secureScoreControls` | `2020-01-01` | Only GA version ever shipped |
| `Microsoft.Security/assessments` | `2025-05-04` | Current GA. `2020-01-01` cannot express `Critical` severity and lacks the `risk` object |
| `Microsoft.Security/assessmentMetadata` | `2025-05-04` | Current GA, same API area |
| `Microsoft.Security/regulatoryCompliance*` | `2019-01-01-preview` | **Not stale.** This is the only version that has ever existed for this surface — no GA has shipped in seven years. Do not "upgrade" it |
| `Microsoft.Security/alerts` | `2022-01-01` | **Not stale.** Newest stable this surface has: `alerts.json` stops there in `Azure/azure-rest-api-specs`, and the TypeSpec-migrated `AlertsAPI/` folder still emits the same version (checked 2026-08-19) |
| `Microsoft.Security/pricings` | `2024-01-01` | Newest stable. `2025-10-01-preview` exists; preview versions are not pinned here |
| `Microsoft.ResourceGraph/resources` | `2024-04-01` | Current GA; `2021-03-01` differs only by one additive option field |

A stale api-version does not fail loudly — it either 400s or returns an older schema that silently omits fields. Re-check before a release.

</api-versions>

<tool-reference>

## Tools

All 12 tools carry `readOnlyHint: true, openWorldHint: true`. All are subscription-scoped.

### Secure score

<tool name="defender-get-secure-score">
Overall secure score: current points, max points, percentage.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `scoreName` | string | No | Defaults to `ascScore`, the well-known name of the ASC Default initiative |

Returns `{ score, summary: { displayName, currentScore, maxScore, percentage } }`. ARM reports `percentage` as a fraction in `[0,1]`; the service scales it to a percent with one decimal.
</tool>

<tool name="defender-list-secure-scores">
Every secure score entity (one per initiative). No parameters. Most subscriptions have only `ascScore`.
</tool>

<tool name="defender-list-score-controls">
Score controls with healthy/unhealthy resource counts.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `maxResults` | integer > 0 | No | Omit for all controls (typically under 100) |

Returns `{ controls, truncated, summary: { total, totalHealthy, totalUnhealthy, averageScorePercentage } }`.

⚠️ `averageScorePercentage` is an **unweighted** mean across controls. Controls carry a `weight`, so this is not the subscription's secure score.
</tool>

### Assessments

<tool name="defender-list-assessments">
Security assessments (recommendations) against resources. **Reads two sources and unions them.**

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `statusFilter` | `Healthy` \| `Unhealthy` \| `NotApplicable` | No | Applied client-side, to the union |
| `maxResults` | integer > 0 | No | Omit for subscription-wide totals |

Returns `{ assessments, truncated, summary: { total, byStatus, sources, unmappedPropertyKeys?, note? }, fanOut }`.

⚠️ **Neither source is complete on its own, which is why both are read.**

| Source | Covers | Blind spot |
|--------|--------|------------|
| ARM `Microsoft.Security/assessments` at subscription scope | Assessments on resources **inside** the subscription | Assessments scoped to the subscription itself, or to an identity object. Those are the RBAC recommendations: disabled accounts with owner permissions, guest accounts with write permissions, permissions of inactive identities, overprovisioned identities |
| Resource Graph `securityresources` | Everything Defender holds for the subscription, identity- and subscription-scoped included | Returns **nothing** for a subscription with no paid Defender plan, where ARM still returns data |

`summary.sources.arm` and `summary.sources.resourceGraph` each report `returned` (rows that source gave), `unique` (rows only that source had) and `available`. One source's `unique` is the other's blind spot, measured on this call.

The union keys on the assessment id, **lower-cased**: Resource Graph lower-cases every id it returns and ARM does not, so a case-sensitive key would count everything both sources hold twice. Where both have a row, ARM's is kept, because it is the typed, documented shape.

Resource Graph is queried through `FanOutRecorder`, so a refusal there does **not** fail the call: `sources.resourceGraph.available` goes false, `summary.note` says the identity- and subscription-scoped assessments are missing, `fanOut.failures` names the error, and the CLI exits 1. Reading `summary.total` without reading `note` is how a partial list gets reported as a complete one.

Neither source filters on status server-side, so setting `statusFilter` forces a full scan before trimming, which is slower rather than faster. `maxResults` is never handed to the ARM list: the cut would fall on ARM's rows and take out exactly the assessments only Resource Graph can see.

⚠️ **The Resource Graph mapper names seven `properties` keys** (`displayName`, `status`, `resourceDetails`, `risk`, `additionalData`, `metadata`, `links`) and that list came from Microsoft's documentation, not from a row anyone has captured. Anything it does not name is carried verbatim in `properties.unmappedProperties` on the row, and the distinct key names are aggregated into `summary.unmappedPropertyKeys` with a sentence in `summary.note`. The aggregate is collected across **every** row Resource Graph returned, before the union drops duplicates and before `maxResults` trims, so a field carried by one row of thousands cannot disappear behind a tie or a cut. **Read it before reporting that no assessment carries risk data:** on the sibling attack-path surface the same documentation-derived allowlist discarded the entire risk payload of every row, and a measured "none of 4,886 unhealthy assessments carries a `properties.risk` object" cannot be told apart from that failure without it.
</tool>

<tool name="defender-get-assessment">
One assessment for one resource.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `resourceId` | string | Yes | Full ARM ID; must start with `/subscriptions/` |
| `assessmentName` | string | Yes | Assessment GUID; URL-encoded before use |

`resourceId` is validated and trailing slashes stripped before the provider segment is appended. A bare name or a full URL is rejected without a network call.
</tool>

<tool name="defender-list-assessment-metadata">
The catalogue of assessment definitions: severity, categories, remediation text, threats, MITRE tactics/techniques.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `severityFilter` | `Critical` \| `High` \| `Medium` \| `Low` | No | Matched case-insensitively |

Returns `{ metadata, summary: { total, bySeverity, byCategory } }`. `byCategory` counts every category an assessment belongs to, so it sums to more than `total`.
</tool>

### Compliance

<tool name="defender-list-compliance-standards">
Standards enabled on the subscription with pass/fail control counts. No parameters.

⚠️ An empty list means **no standards are enabled**, not that the subscription is compliant.
</tool>

<tool name="defender-list-compliance-controls">
Controls within one standard.

| Parameter | Type | Required |
|-----------|------|----------|
| `standardName` | string | Yes |
| `stateFilter` | `Passed` \| `Failed` \| `Skipped` \| `Unsupported` | No |
</tool>

<tool name="defender-list-compliance-assessments">
Assessments behind one control of one standard, with per-assessment failed-resource counts.

| Parameter | Type | Required |
|-----------|------|----------|
| `standardName` | string | Yes |
| `controlName` | string | Yes |
| `stateFilter` | `Passed` \| `Failed` \| `Skipped` \| `Unsupported` | No |
</tool>

<tool name="defender-get-compliance-summary">
Compliance rolled up per standard.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `standardName` | string | No | Omit for all standards |

An **unknown** `standardName` throws, listing the available names. It does not return an empty summary — `averageCompliance: 0` would read as "totally non-compliant" rather than "no such standard".

`compliancePercentage = passed / (passed + failed)`. Skipped and unsupported controls are excluded from the denominator (matching the Azure portal), so it will not equal `passedControls / totalControls`.
</tool>

### Attack paths

<tool name="defender-list-attack-paths">
Attack paths identified by Defender CSPM.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `riskCategory` | string | No | Case-insensitive substring match against **both** `riskFactors` and `riskCategories` |
| `riskLevel` | string | No | Case-insensitive substring match against **both** `riskLevel` and `potentialImpact`, e.g. `High` |
| `displayNameContains` | string | No | Case-insensitive substring match against `displayName` |
| `maxResults` | integer 1–500 | No | Default 100 |

Returns `{ attackPaths, truncated, summary: { total, byRiskLevel, byRiskFactor, riskLevelNotReported, note? } }`. `byRiskFactor` counts each factor on each path, so it sums to more than `total`.

Each risk filter emits an `or` across both spellings of its field, because a clause on one name alone matches nothing on a tenant returning the other shape — and an empty filtered list is indistinguishable from a subscription with no such paths.

`riskLevelNotReported` counts paths whose payload named no risk level under either spelling; they are bucketed under `NotReported` and `summary.note` appears. That is a gap in the payload, never evidence of low risk.

Microsoft enumerates the allowed values of none of these fields, so neither filter is an enum. Run once with no filter to discover the values a subscription actually uses.
</tool>

<tool name="defender-get-attack-path">
One attack path in full.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `attackPathName` | string | Yes | The row's `name` (not `displayName`); matched case-insensitively |

Returns the path, or `{ attackPath: null, message }` when no path matches.
</tool>

### Security alerts

<tool name="defender-list-alerts">
Defender for Cloud security alerts across the whole subscription - the active threat detections, as opposed to the configuration findings `defender-list-assessments` returns.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| `status` | enum | No | `Active` \| `InProgress` \| `Resolved` \| `Dismissed`. Applied **client-side** |
| `severity` | enum | No | `Informational` \| `Low` \| `Medium` \| `High`. Applied **client-side**. **No `Critical`** - alert severity tops out at High, unlike assessment severity |
| `maxResults` | integer | No | Default 200. Bounds the **fetch**, so it runs before the filter |

Returns `{ alerts, truncated, summary: { total, matchedOf, byStatus, bySeverity, topEntities, note? } }`.

⚠️ **`Alerts_List` accepts no `$filter` at any api-version**, so both filters run in this package after the rows arrive. `summary.matchedOf` is what ARM returned and `summary.total` is what matched; when they differ `summary.note` says how many were removed. Without that pair a filter that matched nothing and a subscription with no alerts are the same output.

⚠️ **`maxResults` bounds the fetch, not the filtered result.** On a filtered call with `truncated: true`, matching alerts may exist beyond the limit - `summary.note` says so explicitly. Raise `maxResults` for a filtered subscription-wide total.

`summary.topEntities` names every resource carrying more than one alert, busiest first. Clustering is usually the finding: 25 Active alerts on one domain controller and 25 spread over 25 machines are the same count and a different incident.

Uses the subscription-wide `Alerts_List`, not the region-scoped `Microsoft.Security/locations/{location}/alerts`. Both exist; the region-scoped operation needs a location per call and would silently omit any region the caller did not think to name, which is the partial-scope-as-clean-result defect this package removes everywhere else.

`properties` is passed through whole. There is no field allowlist, deliberately: `extendedProperties` is detection-specific and undocumented by design, and it is where the evidence lives.
</tool>

### Defender plans

<tool name="defender-list-plans">
Which Defender for Cloud plans are enabled on the subscription (`Microsoft.Security/pricings`). `Standard` is the paid tier; `Free` means the plan is off.

No parameters.

Returns `{ pricings, summary: { total, standard, free, standardPlans, subPlans, cspmEnabled, note } }`.

⚠️ **Read this before concluding anything from an empty Defender result.** Attack paths and assessment `risk` objects are Defender CSPM artefacts, so with the `CloudPosture` plan off, an empty result from either is explained by the configuration and is not evidence of a clean estate. `summary.note` states the reading in words a report can quote.

`summary.cspmEnabled` is deliberately **three-state**: `true`, `false`, or `null` when the `CloudPosture` plan was absent from the response entirely - which means UNKNOWN, not off. Collapsing that to a boolean is how "we never saw the plan" becomes "the plan is disabled".

A `Standard` CloudPosture plan whose `resourcesCoverageStatus` is not `FullyCovered` still reports `cspmEnabled: true`, and `summary.note` names the coverage status, because resources outside the coverage are another way for a CSPM result to be quietly partial.

`summary.standardPlans` names the paid plans and `summary.subPlans` the sub-plan each carries: two `Standard` plans are not necessarily the same plan.

`Pricings_List` returns a plain `{ value: [] }` envelope with **no `nextLink`** - the plan list is bounded by how many plans Microsoft offers, so this is a single `get` rather than a paginated fetch.
</tool>

</tool-reference>

<attack-path-schema>

## Attack path schema (read this before writing a filter)

There is **no `Microsoft.Security/attackPaths` ARM endpoint.** Attack paths are read from Azure Resource Graph:

```kusto
securityresources
| where type == 'microsoft.security/attackpaths'
```

The scope comes from the request body's `subscriptions` array, not a `where subscriptionId ==` clause — one less place to interpolate a value into KQL.

⚠️ **Two row shapes exist and a tenant returns one of them.** Microsoft's published field table describes only the legacy Defender CSPM shape. Live rows on a tenant whose attack paths come from Microsoft Security Exposure Management carry a different, undocumented set. Read **both** names for anything you filter, count or display: keying on one alone printed a `riskLevel: High` path as impact `Unknown` with no risk categories, on every path of a real estate.

Shared by both shapes:

| Field | Notes |
|-------|-------|
| `properties.displayName` | |
| `properties.description` | |
| `properties.attackPathType` | |
| `properties.manualRemediationSteps` | |
| `properties.refreshInterval` | |
| `properties.assessments` | Map of entity internal ID → assessments on that entity |
| `properties.graphComponent.insights` | |
| `properties.graphComponent.entities` | |
| `properties.graphComponent.connections` | |
| `properties.AttackPathID` | |

Legacy Defender CSPM shape, verbatim from Microsoft's documented response schema (`learn.microsoft.com/azure/defender-for-cloud/attack-path-api`, unchanged as of 2026-08-19):

| Field | Notes |
|-------|-------|
| `properties.potentialImpact` | Impact of the path being breached |
| `properties.riskCategories` | Array of risk categories |
| `properties.entryPointEntityInternalID` | Internal graph-node ID, not a resource ID |
| `properties.targetEntityInternalID` | Internal graph-node ID, not a resource ID |

Exposure Management shape, **absent from Microsoft's field table** and measured on live rows:

| Field | Notes |
|-------|-------|
| `properties.riskLevel` | e.g. `High`. The Exposure Management name for `potentialImpact` |
| `properties.riskFactors` | e.g. `Internet exposure`, `Weak authorization` |
| `properties.entryPoint` | The entity itself, not an internal ID |
| `properties.target` | The entity itself, not an internal ID |
| `properties.attackPathSteps` | Ordered steps from entry point to target |
| `properties.mITRETacticsAndTechniques` | Casing is Microsoft's |
| `properties.attackStory` | Narrative description |
| `properties.isPartialAttackPath` | True when the path is incomplete, so its steps are a lower bound |

`properties.unmappedProperties` carries every `properties` key neither shape above names, verbatim. A named allowlist that dropped the remainder is what hid the whole Exposure Management payload, so an unrecognised field now arrives visibly. Read it before concluding a field is absent.

`riskLevel` and `riskFactors` also exist, separately, on the `risk` object of `Microsoft.Security/assessments@2025-05-04`. They are different fields that share a name; do not read one for the other. `graphComponent` holds `insights`/`entities`/`connections`, never `nodes`/`edges`.

**Defender CSPM required.** Attack paths only exist when the Defender CSPM plan is enabled (plus agentless VM scanning, or Defender for Servers vulnerability assessment). With the plan off, the Resource Graph query succeeds and returns zero rows. The tool cannot tell that apart from a genuinely clean subscription.

</attack-path-schema>

<query-safety>

## Resource Graph query safety

The Resource Graph REST API has **no query-parameter binding**, so filter values must be escaped into the KQL string literal by hand (`src/utils/kql.ts`).

`escapeKqlStringLiteral()` escapes the backslash **before** the quote. Escaping only the quote — as a naive implementation does — leaves a trailing `\` in the input free to escape the literal's closing quote, letting a caller break out and append clauses:

```
input:  x\' | project 1 //
naive:  'x\' | project 1 //'      ← literal closed early, clauses injected
here:   'x\\\' | project 1 //'    ← whole payload stays inside the literal
```

Control characters are rejected outright rather than emitted into a literal.

Paging: a single Resource Graph page caps at 1000 rows. `maxResults` is capped at 500 and the service requests `maxResults + 1` rows, so truncation is detected without a second request and no `$skipToken` loop is needed.

</query-safety>

<pagination>

## Pagination and truncation

`DefenderClient.paginate()` returns `{ items, truncated }`:

- It follows `nextLink` until the list is exhausted, or until **one row past** `maxResults` proves more exist.
- `truncated: true` means the caller's limit stopped the fetch, so any count derived from `items` is a **lower bound**.
- A `200` with no `value` array is treated as an empty collection rather than a crash.

Every list tool surfaces `truncated`, and every `summary` describes exactly the rows returned. Omit `maxResults` for subscription-wide totals.

</pagination>

<error-handling>

## Error handling

- Missing configuration throws `Missing Azure Defender configuration: AZURE_TENANT_ID, ...` naming every absent variable. All four are demanded up front because every tool is subscription-scoped.
- ARM error bodies become `Error("<code>: <message>")`, with nested `details` appended one per line.
- Other axios failures become `Error("Defender API error: <message> (status: <status>)")`.
- `429/500/502/503/504` retry up to 3 times with exponential backoff, honouring a `Retry-After` header when present.
- Every MCP tool wraps its service call in `runTool()`, which returns `{ content: [...], isError: true }` rather than throwing across the protocol boundary.
- CLI commands route failures through `handleCliError` and validate enums/integers before the service is reached, so a bad `--status` names the allowed values instead of silently matching nothing.

</error-handling>

<security>

## Security

- Read-only by design: no write tools, no feature flags, nothing to gate.
- Service principal needs only `Security Reader` on the subscription. `Security Reader` also carries the Resource Graph read access the attack-path tools and the second assessment source need; a principal that somehow lacks it still gets attack paths as an error and assessments as an ARM-only list with `summary.note` saying so.
- The subscription ID is **never** logged — it would land in stderr, transcripts, and CI logs.
- ARM tokens are cached in memory and refreshed 5 minutes before expiry; they are never written to disk.
- KQL filter values are escaped (see `<query-safety>`); ARM path segments are URL-encoded; `resourceId` is validated to start with `/subscriptions/`.

</security>

<cli-architecture>

## CLI

Binary: `mcp-defender-cli`. Every MCP tool has a matching CLI command; the command name is the tool name minus the `defender-` prefix, grouped by domain.

```bash
# Secure score
mcp-defender-cli score get-secure-score --score-name ascScore
mcp-defender-cli score list-secure-scores
mcp-defender-cli score list-score-controls --max-results 10

# Assessments
mcp-defender-cli assessment list-assessments --status Unhealthy --max-results 50
mcp-defender-cli assessment get-assessment \
  --resource-id /subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/my-rg/providers/Microsoft.Compute/virtualMachines/my-vm \
  --assessment-name aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
mcp-defender-cli assessment list-assessment-metadata --severity Critical

# Compliance
mcp-defender-cli compliance list-compliance-standards
mcp-defender-cli compliance list-compliance-controls Azure-CIS-1.1.0 --state Failed
mcp-defender-cli compliance list-compliance-assessments Azure-CIS-1.1.0 1.1 --state Failed
mcp-defender-cli compliance get-compliance-summary Azure-CIS-1.1.0   # omit the name for all standards

# Attack paths
mcp-defender-cli attack-path list-attack-paths --risk-category DataExposure --name-contains "storage account" --max-results 25
mcp-defender-cli attack-path get-attack-path <attackPathName>
```

Global flags (`--json`, `--no-cache`, `--env-file`) come from `createCliProgram` in `@mcp-consultant-tools/core`. Full JSON is written to `.context/.mcp-defender-cache/`; a summary goes to stdout.

### Command groups

| Group | Commands |
|-------|----------|
| `score` | `get-secure-score`, `list-secure-scores`, `list-score-controls` |
| `assessment` | `list-assessments`, `get-assessment`, `list-assessment-metadata` |
| `compliance` | `list-compliance-standards`, `list-compliance-controls`, `list-compliance-assessments`, `get-compliance-summary` |
| `attack-path` | `list-attack-paths`, `get-attack-path` |
| `alert` | `list-alerts` |
| `plan` | `list-plans` |

</cli-architecture>

<environment-variables>

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `AZURE_TENANT_ID` | Yes | Entra ID tenant |
| `AZURE_CLIENT_ID` | Yes | Service principal app ID |
| `AZURE_CLIENT_SECRET` | Yes | Service principal secret |
| `AZURE_SUBSCRIPTION_ID` | Yes | Target subscription; every tool is subscription-scoped |

These are the same four variables `azure-management` uses. One service principal can serve both servers, provided it holds both `Reader` (for azure-management) and `Security Reader` (for azure-defender).

</environment-variables>

<prompts-reference>

## Prompts

| Prompt | Purpose |
|--------|---------|
| `defender-security-posture-review` | Secure score → controls → unhealthy assessments → prioritised remediation |
| `defender-compliance-audit` | Standards → failing controls → affected resources → remediation priority |
| `defender-attack-path-analysis` | Attack paths → entry point/target → the fix that breaks the most paths |

Each template names the traps an agent would otherwise fall into (empty result ≠ no risk; unweighted mean ≠ secure score; truncated counts are a lower bound).

</prompts-reference>

<testing>

## Testing

`packages/azure-defender` has its own vitest harness (`vitest.config.ts`, `test: "vitest run"`, tsconfig excludes `src/**/__tests__/**`). 69 unit tests, no live API required — `axios` and `@azure/identity` are mocked at the module boundary.

Coverage is targeted at the behaviours that are easy to get wrong:
- KQL escaping, including a backslash-based break-out attempt
- `paginate` truncation semantics, including "exactly `maxResults` with no next page is *not* truncated"
- `listAssessments` scanning fully before trimming when a status filter is set
- `getComplianceSummary` throwing on an unknown standard rather than reporting 0%
- `normalizeArmResourceId` rejecting a bare name and a full URL
- the attack-path mapper keeping the whole Exposure Management risk payload of a live-shape row, and each risk filter emitting a clause for **both** spellings of its field

</testing>

<known-limitations>

## Known limitations

- **Not exercised against a live Defender subscription.** The T-SQL-equivalent here is the ARM contract: api-versions, paths, and response shapes are verified against Microsoft's published schemas and unit-tested against mocked responses, but no call in this package has been run against a real Defender for Cloud tenant.
- `defender-list-attack-paths` cannot distinguish "Defender CSPM disabled" from "no attack paths". Both return `[]`. **`defender-list-plans` is how you tell them apart** - read `summary.cspmEnabled` before reporting an empty attack-path or assessment-risk result.
- Attack-path results are capped at one Resource Graph page (`maxResults` ≤ 500). A subscription with more paths needs `$skipToken` paging.
- `regulatoryCompliance*` depends on a `-preview` api-version indefinitely; Microsoft has never shipped a GA for that surface.

</known-limitations>
