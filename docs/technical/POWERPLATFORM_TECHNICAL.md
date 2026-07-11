# PowerPlatform - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/POWERPLATFORM.md,
     docs/documentation/POWERPLATFORM_CUSTOMIZATION.md, and
     docs/documentation/POWERPLATFORM_DATA.md -->

<overview>

This document covers all three PowerPlatform MCP packages:

| Package | Binary | CLI Binary | Tools | Prompts | Production-Safe |
|---------|--------|-----------|-------|---------|-----------------|
| `@mcp-consultant-tools/powerplatform` | `mcp-consultant-tools-powerplatform` | `mcp-pp-cli` | 46 | 12 | YES |
| `@mcp-consultant-tools/powerplatform-customization` | `mcp-pp-custom` | `mcp-pp-custom-cli` | 70 | 0 | NO |
| `@mcp-consultant-tools/powerplatform-data` | `mcp-pp-data` | `mcp-pp-data-cli` | 10 | 0 | NO |

All three packages share `@mcp-consultant-tools/powerplatform-core` for authentication, HTTP client, and domain services. The `PowerPlatformService` class in each package wraps the core services and is accessible via `ServiceContext.pp`.

</overview>

<architecture>

<shared-core>

`@mcp-consultant-tools/powerplatform-core` is an internal package (not installed directly). It provides:

- **Authentication**: `PowerPlatformClient`, `ServicePrincipalAuth`, `InteractiveAuth`, `TokenCache`
- **Read-Only Services**: `MetadataService`, `FlowService`, `PluginService`, `AppService`, `BusinessRuleService`, `WorkflowService`, `IntegrationAuditService`, `ValidationService`, `SecurityRoleService`, `DbmlGenerator`, `ConnectionReferenceService`
- **Data Services**: `DataService`
- **Customization Services**: `EntityService`, `AttributeService`, `RelationshipService`, `OptionSetService`, `FormService`, `ViewService`, `WebResourceService`, `SolutionService`, `PublishingService`, `DependencyService`, `PluginDeploymentService`, `AppManagementService`, `WorkflowManagementService`, `ServiceEndpointService`
- **Utilities**: `AuditLogger`, `BestPracticesValidator`, `IconManager`, `RateLimiter`, `publisherConfig`, `flow-url-extractor`, `audit-report-formatter`

</shared-core>

<service-context>

Each package's `types.ts` defines:

```typescript
export interface ServiceContext {
  readonly pp: PowerPlatformService;
}
```

The data package extends it with permission check helpers:

```typescript
export interface ServiceContext {
  readonly pp: PowerPlatformService;
  checkCreateEnabled(): void;
  checkUpdateEnabled(): void;
  checkDeleteEnabled(): void;
  checkActionsEnabled(): void;
}
```

Lazy initialization is in `index.ts` and `context-factory.ts` (both must be kept in sync).

</service-context>

<publisher-prefix>

The customization package requires `PUBLISHER_PREFIX` at startup. This is managed by `powerplatform-core/src/utils/publisherConfig.ts`:

- `initializePublisherPrefix()` - Called at service context creation; throws if `PUBLISHER_PREFIX` env var is not set
- `normalizePrefix(raw)` - Adds trailing underscore if missing: `"sic"` → `"sic_"`
- `getPublisherPrefix()` - Returns the normalized prefix; calls `initializePublisherPrefix()` on first access
- Used internally by: `IconManager`, `BestPracticesValidator`, naming validation

The prefix is used for icon web resource naming and for `{prefix}` placeholder substitution in required column names.

</publisher-prefix>

</architecture>

<authentication>

<modes>

**Service Principal (for automation):**
- Set `POWERPLATFORM_URL`, `POWERPLATFORM_CLIENT_ID`, `POWERPLATFORM_CLIENT_SECRET`, `POWERPLATFORM_TENANT_ID`
- Token acquired via MSAL client credentials grant
- Token cached until near expiration

**Interactive / SSO (for desktop users):**
- Set `POWERPLATFORM_URL`, `POWERPLATFORM_CLIENT_ID`, `POWERPLATFORM_TENANT_ID` — omit `POWERPLATFORM_CLIENT_SECRET`
- Browser opens on first use via `InteractiveAuth`
- Tokens cached ~90 days in user's profile directory

**Management API token (for `get-flow-run-details`):**
- `getFlowManagementToken()` acquires a separate token for `https://management.azure.com/.default`
- Same MSAL client (no additional env vars required)
- Cached with 5-minute early refresh

</modes>

<app-registration-interactive>

App registration requirements for interactive auth (all 4 steps required):

1. **Authentication tab**: Enable "Allow public client flows" = Yes. Add platform: Mobile and desktop applications. Add redirect URI: `http://localhost`
2. **API permissions**: Add Dynamics CRM → `user_impersonation` (delegated). Also add Microsoft Graph → `offline_access` (recommended) and `User.Read` (optional)
3. **Admin consent**: Click "Grant admin consent for [Your Org]" — requires Global Administrator or Privileged Role Administrator. Without this, users see "Approval required" on first login
4. **Application user**: In PowerPlatform Admin Center → Settings → Users + permissions → Application users → New app user → assign Basic User role (read-only) or appropriate CRUD role for data package

</app-registration-interactive>

<management-api-permissions>

For `get-flow-run-details` (Power Automate Management API):
- Azure AD app registration must have: Azure Service Management → `user_impersonation` (delegated), OR
- Service principal must have appropriate role assignment on the Power Platform environment

</management-api-permissions>

</authentication>

---

<package name="powerplatform">

# Package: powerplatform (Read-Only)

<tool-reference name="entity-metadata-tools">

## Entity Metadata Tools (5 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-entity-metadata` | `entityName` (required) | Entity definition, ownership type, primary attribute, metadata ID |
| `get-entity-attributes` | `entityName`, `prefix?`, `attributeType?`, `maxAttributes?` | Filtered attribute list with type, required level, max length |
| `get-entity-attribute` | `entityName`, `attributeName` | Full attribute metadata including option set values |
| `get-entity-relationships` | `entityName` | All 1:N, N:1, N:N relationships |
| `get-global-option-set` | `optionSetName` | Option set definition with all option values and labels |

`attributeType` valid values: `String`, `Integer`, `Boolean`, `DateTime`, `Decimal`, `Double`, `Money`, `Lookup`, `Picklist`, `State`, `Status`, `Uniqueidentifier`, `Memo`, `BigInt`, `Owner`, `Customer`, `PartyList`

</tool-reference>

<tool-reference name="plugin-tools">

## Plugin Inspection Tools (4 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-plugin-assemblies` | `includeManaged?` (default: false), `maxRecords?` (default: 100) | Assembly list with isolation mode, version, modified-by |
| `get-plugin-asm-full` | `assemblyName`, `includeDisabled?` (default: false) | Assembly + all types, steps, images + automatic validation |
| `get-entity-plugins` | `entityName`, `messageFilter?`, `includeDisabled?` (default: false) | All plugin steps on entity, organized by message and execution order |
| `get-plugin-trace-logs` | `entityName?`, `messageName?`, `correlationId?`, `exceptionOnly?`, `hoursBack?` (default: 24), `maxRecords?` (default: 50), `pluginStepId?` | Trace logs with parsed exception details (type, message, stack trace) |

**Automatic validation in `get-plugin-asm-full`:**
- Identifies Update/Delete steps without `filteringattributes` (performance concern)
- Detects Update/Delete steps without pre/post images (potential runtime errors)
- Flags disabled steps
- Counts sync vs async steps
- Generates `potentialIssues[]` array with human-readable warnings

**Query optimization:** Steps queries use `$select` to request only essential fields. Navigation properties use nested `$select`. Response size reduced 70-80% vs unfiltered queries.

</tool-reference>

<tool-reference name="flow-tools">

## Workflow and Flow Tools (11 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-flows` | `activeOnly?`, `maxRecords?` (default: 25), `excludeCustomerInsights?` (default: true), `excludeSystem?` (default: true), `excludeCopilotSales?` (default: true), `nameContains?` | Flow list + exclusion statistics |
| `search-workflows` | `name?`, `primaryEntity?`, `description?`, `category?`, `statecode?`, `includeDescription?` (default: true), `maxResults?` (default: 50, max: 1000) | Both classic workflows and Power Automate flows |
| `get-flow-definition` | `flowId`, `summary?` (default: false) | Full JSON definition or parsed summary (trigger, actions, connectors) |
| `get-flow-runs` | `flowId`, `status?`, `startedAfter?`, `startedBefore?`, `maxRecords?` (default: 50, max: 250) | Run history: status, timestamps, trigger info, error details |
| `get-flow-run-details` | `flowId`, `runId` | Action-level execution: per-action status, timing, errors, inputs/outputs links |
| `scan-flow-health` | `daysBack?` (default: 7), `maxRunsPerFlow?` (default: 100), `maxFlows?` (default: 500), `activeOnly?` (default: true), `concurrency?` (default: 5) | Environment-wide run-health scan: per-flow + overall success rate, failure counts, top failing flows |
| `get-flow-inventory` | `maxRecords?` (default: 500) | Complete paginated inventory of cloud flows (deployment metadata, no run history) |
| `get-workflows` | `activeOnly?`, `maxRecords?` (default: 25) | Classic workflows with mode, triggers |
| `get-workflow-definition` | `workflowId`, `summary?` (default: false) | Full XAML or parsed summary (activities, conditions, email sends) |
| `get-business-rules` | `activeOnly?`, `maxRecords?` (default: 100) | All business rules |
| `get-business-rule` | `workflowId` | Complete business rule definition |

<filtering-behavior name="get-flows">

**Default filtering:** By default, `get-flows` excludes non-custom flows to reduce noise:

| Category | Detection | Filter Type |
|----------|-----------|-------------|
| Customer Insights | Name prefix `CXP_` | Server-side OData |
| SYSTEM-modified | `modifiedBy === 'SYSTEM'` | Client-side post-filter |
| Copilot for Sales | Exact name match (list in `COPILOT_SALES_FLOW_NAMES`) | Client-side post-filter |
| Name search | `nameContains` → OData `contains(name,'term')` | Server-side OData |

Over-fetch strategy: When client-side filtering is active, service requests 1.5x the `maxRecords` count. Response includes exclusion statistics. Set `excludeCustomerInsights: false`, `excludeSystem: false`, or `excludeCopilotSales: false` to disable respective filters.

</filtering-behavior>

<flow-health-scan-architecture>

**`scan-flow-health` is app-only friendly and honest about sampling.** It builds the flow list from the Dataverse `workflow` table (`category eq 5`, paginated via `@odata.nextLink`) and reads run history from the `flowrun` elastic table via the same Dataverse Web API — **no dependency on the Power Automate Management API**, so it works with service-principal (client-credentials) auth.

Run classification is **case-insensitive** because `flowrun.status` is an unvalidated free-text column (Microsoft prose even uses "Success"); `Succeeded`/`Success` map to succeeded, `Failed`/`Faulted`/`TimedOut`/`Aborted` to failed, `Cancelled`/`Canceled` to cancelled, `Running`/`Waiting` to running.

Honesty guarantees (each addresses a defect in the original source):
- **Sampling is surfaced, not hidden.** Runs are sampled newest-first up to `maxRunsPerFlow`. When more runs existed in the window, the flow's `sampleTruncated` is `true` and the summary's `flowsSampleTruncated` counts them — a flow's `successRate` is never presented as a full-population figure when it is over a sample. `successRate` is `null` (not `0`) for a flow with no runs.
- **Errored ≠ idle.** A flow whose run fetch fails (e.g. 403) is reported with `scanError` and counted in `flowsErrored`, kept distinct from genuinely idle flows in `flowsNoRuns`.
- **Flow-list completeness.** `flowListTruncated` is `true` when there were more cloud flows than `maxFlows`.

**Permission note:** `flowrun` records are user-owned, so the Dataverse Application User's security role must grant **Organization-scope Read on FlowRun** — without it, the scan sees no runs (or reports `scanError`) even though flows exist.

</flow-health-scan-architecture>

<flow-inventory-behavior>

**`get-flow-inventory` guarantees completeness where `get-flows` does not.** `get-flows` issues a single page and can silently truncate a large environment; `get-flow-inventory` follows `@odata.nextLink` to enumerate every cloud flow (`category eq 5`) up to `maxRecords`, setting `hasMore` when the cap was reached. Use it for deployment audits; use `get-flows` for filtered interactive investigation.

</flow-inventory-behavior>

<flow-run-details-architecture>

**`get-flow-run-details` uses the Power Automate Management API**, not Dataverse:

- Token scope: `https://management.azure.com/.default` (acquired separately via `getFlowManagementToken()`)
- Environment ID: auto-extracted from Dataverse `organizations` table via `getEnvironmentId()` (cached per service instance)
- API: `GET https://management.azure.com/providers/Microsoft.ProcessSimple/environments/{envId}/flows/{flowId}/runs/{runId}?api-version=2016-11-01`

Response structure:
```typescript
{
  flowId: string; runId: string; name: string; status: string;
  startTime: string; endTime: string;
  trigger: { name, status, startTime, endTime, inputsLink, outputsLink };
  actions: {
    [actionName: string]: {
      status: string;        // Succeeded | Failed | Skipped
      startTime: string; endTime: string; duration: string;
      inputsLink: string; outputsLink: string;
      error: object | null; code: string | null;
    }
  };
  actionsSummary: { total, succeeded, failed, skipped, other }
}
```

</flow-run-details-architecture>

<comparison name="flow-run-tools">

| Feature | `get-flow-runs` (Dataverse) | `get-flow-run-details` (Mgmt API) |
|---------|----------------------------|-----------------------------------|
| Auth token | Dataverse token | Management API token |
| Run status | Yes | Yes |
| Error messages | High-level | Action-level |
| Duration | Total run time | Per-action timing |
| Action details | No | Yes (status, errors) |
| Condition evaluation | No | Yes (skipped actions) |
| Action inputs/outputs | No | Yes (URI links) |
| Use case | Monitoring, statistics | Debugging, verification |

</comparison>

</tool-reference>

<tool-reference name="app-tools">

## Model-Driven App Tools (4 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-apps` | `activeOnly?`, `includeUnpublished?` (default: true), `maxRecords?`, `solutionUniqueName?` | App list |
| `get-app` | `appId` | Detailed app configuration |
| `get-app-components` | `appId` | All components: entities, forms, views, sitemaps |
| `get-app-sitemap` | `appId` | Navigation configuration |

</tool-reference>

<tool-reference name="form-view-web-resource-tools">

## Form, View, and Web Resource Tools (7 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-forms` | `entityLogicalName` | All forms for entity |
| `get-views` | `entityLogicalName` | All views for entity |
| `get-view-fetchxml` | `viewId` | FetchXML query definition |
| `get-webres-deps` | `webResourceId` | All component dependencies |
| `preview-unpublished` | — | All components with unpublished customizations |
| `get-web-resource` | `webResourceId` | Web resource by ID |
| `get-web-resources` | `nameFilter?` | Web resources by name pattern (contains) |

</tool-reference>

<tool-reference name="solution-validation-tools">

## Solution and Validation Tools (8 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-publishers` | — | All solution publishers (excludes system publishers) |
| `get-solutions` | — | All visible solutions |
| `get-solution-components` | `solutionUniqueName` | All components grouped by type with IDs and behavior settings |
| `check-dependencies` | `componentId`, `componentType` | Dependencies blocking deletion |
| `validate-schema-name` | `schemaName`, `prefix` | Name validation result against PowerPlatform naming rules |
| `check-delete-eligibility` | `componentId`, `componentType` | Whether a component can be safely deleted |
| `validate-dataverse` | `publisherPrefix`, `solutionUniqueName?`, `entityLogicalNames?`, `recentDays?`, `includeRefDataTables?`, `rules?`, `maxEntities?`, `requiredColumns?` | Best practices validation report |
| `generate-dbml-schema` | `solutions?`, `entities?`, `includeSystemColumns?`, `includeStateStatus?`, `prefix?`, `depth?`, `includePolymorphicLookups?` | DBML text + clickable dbdiagram.io URL |

`componentType` values: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource

</tool-reference>

<tool-reference name="validate-dataverse">

### validate-dataverse — Detailed Behavior

Validates Dataverse entities against 6 configurable rules:

| Rule ID | Severity | Description |
|---------|----------|-------------|
| `prefix` | MUST | All custom items start with publisher prefix |
| `lowercase` | MUST | LogicalName uses all lowercase; SchemaName uses PascalCase |
| `lookup` | MUST | Lookup columns named `{prefix}_{entity}id` |
| `optionset` | MUST | All option sets must be global (not local) |
| `required-column` | MUST | Non-RefData tables must have specified required columns |
| `entity-icon` | SHOULD | Custom entities should have icons |

**Validation modes:**
1. Solution-based: pass `solutionUniqueName`
2. Entity-based: pass `entityLogicalNames[]`
(Mutually exclusive — pass only one)

**`requiredColumns` parameter:** Array of schema names to check on all non-RefData tables. Supports `{prefix}` placeholder (substituted with `publisherPrefix` at runtime). Default: `["{prefix}updatedbyprocess"]`. Example for SQL sync: `["{prefix}sqlcreatedon", "{prefix}sqlmodifiedon"]`

**RefData handling:** Tables whose schema name starts with `{prefix}ref_` are skipped for the `required-column` rule.

**Date filtering:** `recentDays: 30` (default) — only validate columns created in last 30 days. `recentDays: 0` — validate all columns regardless of creation date.

**Response structure:**
```typescript
{
  metadata: { generatedAt, solutionName?, solutionUniqueName?, publisherPrefix, recentDays, executionTimeMs },
  summary: { entitiesChecked, attributesChecked, totalViolations, criticalViolations, warnings, compliantEntities },
  violationsSummary: [{
    rule, severity, totalCount,
    affectedEntities: string[],   // Complete list — use this for reporting
    affectedColumns: string[],    // "entity.column" pairs
    action, recommendation?
  }],
  entities: [{ logicalName, schemaName, displayName, isRefData, attributesChecked, violations, isCompliant }],
  statistics: { systemColumnsExcluded, oldColumnsExcluded, refDataTablesSkipped }
}
```

**Performance:** ~2 min for 20 entities, ~5 min for 50 entities. Use `maxEntities` and `recentDays` to scope large solutions.

</tool-reference>

<tool-reference name="integration-tools">

## Integration Audit Tools (5 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-service-endpoints` | `maxRecords?` (default: 100), `requiredUrlStrings?`, `outputFormat?` (summary/full), `excludeOotb?` (default: true) | Endpoints: name, URL, contract type, auth type, step count; flagged diverging endpoints |
| `get-webhook-registrations` | `maxRecords?` (default: 100), `excludeOotb?` (default: true) | Webhook steps: name, URL, trigger entity, message, filtering attributes, enabled status |
| `analyze-flow-complexity` | `flowId?`, `maxFlows?` (default: 0=unlimited), `outputFormat?` (summary/full), `excludeOotb?` (default: true) | Complexity score, risk level, URL extraction, hardcoded secret detection per flow |
| `gen-integration-audit` | `maxFlows?`, `maxRecords?` (default: 100), `requiredUrlStrings?`, `outputFormat?` (summary/full), `excludeOotb?` (default: true) | Pre-formatted Markdown report + JSON summary |
| `get-env-variables` | `maxRecords?` (default: 500), `requiredUrlStrings?`, `outputFormat?` (summary/full), `excludeOotb?` (default: true) | Env var definitions: schema name, type, current/default values; sensitive values auto-masked |

<complexity-scoring>

**Flow complexity scoring factors:**

| Factor | Weight |
|--------|--------|
| Action count | 1x per action |
| Unique connectors | +2 per connector |
| HTTP/REST connectors | +5 per connector |
| Premium connectors | +3 per connector |
| Conditions/switches | +2 each |
| Loops | +3 each |
| Parallel branches | +3 each |
| Error handling scopes | +1 each |

Risk levels: Low (0-20), Medium (21-50), High (51-100), Critical (>100)

</complexity-scoring>

<service-bus-fields>

**Service Bus endpoint fields** (contracts: Queue/Topic/EventHub):

| Dataverse field | Meaning |
|-----------------|---------|
| `url` | Not runtime-authoritative for Service Bus |
| `namespaceaddress` | Runtime-authoritative namespace address |
| `path` | Queue or topic name |
| `saskey` | SAS key value (sensitive, not returned) |
| `saskeyname` | SAS policy name |
| `issaskeyset` | Whether SAS key is configured |
| `solutionnamespace` | Namespace identifier |

`urlMismatch` flag: set when `url` and `namespaceaddress` differ. `sasKeyWarning` flag: set when no SAS key is configured.

</service-bus-fields>

**`gen-integration-audit` is the top-level report tool.** It covers: OUTBOUND (service endpoints, flows with HTTP calls, plugins with external access), INBOUND (webhook registrations, flows with external triggers), COMPLEXITY (flow complexity scores, risk, URL extraction, secret detection), ENVIRONMENT (env variable inventory + URL validation), PLUGINS (plugin assembly inventory). Use `outputFormat: "summary"` to show only flagged items.

</tool-reference>

<tool-reference name="security-tools">

## Security Tools (4 tools)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `get-connection-references` | — | All connection references |
| `get-security-roles` | — | All security roles |
| `get-security-role-privileges` | `roleId` | All privileges for a role |
| `get-security-roles-by-solution` | `solutionUniqueName` | Roles in a specific solution |

</tool-reference>

<prompts-reference>

## Prompts (12 total)

| Prompt | Category | Description |
|--------|----------|-------------|
| `entity-overview` | Entity | Comprehensive entity overview: key fields, relationships, usage patterns |
| `attribute-details` | Entity | Detailed attribute info: data types, constraints, best practices |
| `query-template` | Entity | OData query templates with filter examples and optimization tips |
| `relationship-map` | Entity | Visual relationship map showing parent/child and N:N |
| `plugin-deployment-report` | Plugin | Deployment validation report for PR reviews: assembly info, steps, validation warnings |
| `entity-plugin-pipeline-report` | Plugin | Plugin execution pipeline: execution order by stage, grouped by message type |
| `flows-report` | Flow | Power Automate flows inventory grouped by state |
| `workflows-report` | Flow | Classic workflows inventory with trigger configuration |
| `business-rules-report` | Flow | Business rules inventory by entity and state |
| `app-overview` | App | Model-driven app overview: components, configuration |
| `dataverse-best-practices-report` | Validation | Formatted markdown report from `validate-dataverse` output; includes violationsSummary, per-entity breakdown |
| `integration-audit-report` | Integration | Comprehensive integration audit with drill-down; use with `gen-integration-audit` output |

Files: `src/prompts/entity-prompts.ts` (entity-overview, attribute-details, query-template, relationship-map, plugin-deployment-report, entity-plugin-pipeline-report), `src/prompts/analysis-prompts.ts` (flows-report, workflows-report, business-rules-report, app-overview, dataverse-best-practices-report, integration-audit-report)

</prompts-reference>

</package>

---

<package name="powerplatform-customization">

# Package: powerplatform-customization

<startup-requirements>

**Required environment variables at startup:**
- `POWERPLATFORM_URL`, `POWERPLATFORM_CLIENT_ID`, `POWERPLATFORM_CLIENT_SECRET`, `POWERPLATFORM_TENANT_ID` — authentication
- `PUBLISHER_PREFIX` — required; throws `Missing required configuration: PUBLISHER_PREFIX` if absent

**Optional:**
- `POWERPLATFORM_DEFAULT_SOLUTION` — used as fallback `solutionUniqueName` on any tool that accepts a solution parameter

Note: Unlike the read-only package, service principal auth is required (no interactive auth path in this package's index.ts).

</startup-requirements>

<tool-reference name="entity-tools">

## Entity Tools (4 tools)

| Tool | Description | Notes |
|------|-------------|-------|
| `create-entity` | Create new custom entity (table) | Requires `publish-customizations` after |
| `update-entity` | Update display name, description, feature flags | Requires `publish-customizations` after |
| `update-entity-icon` | Set entity icon from Fluent UI System Icons | Auto-publishes; no separate publish step needed |
| `delete-entity` | Permanently delete entity | Use `check-delete-eligibility` (read-only package) first |

**`create-entity` parameters:** `schemaName`, `displayName`, `pluralDisplayName`, `description`, `ownershipType` (UserOwned/TeamOwned/OrganizationOwned), `hasActivities?`, `hasNotes?`, `isAuditEnabled?`, `changeTrackingEnabled?`, `isDuplicateDetectionEnabled?`, `isActivityParty?`, `primaryAttributeSchemaName?`, `primaryAttributeDisplayName?`, `primaryAttributeMaxLength?`, `solutionUniqueName?`

</tool-reference>

<tool-reference name="attribute-tools">

## Attribute Tools (4 tools)

| Tool | Description |
|------|-------------|
| `create-attribute` | Create new column/field (String, Integer, Boolean, DateTime, Money, Lookup, Picklist, etc.) |
| `update-attribute` | Update display name, description, required level, max length |
| `delete-attribute` | Permanently delete column |
| `create-global-os-attr` | Create attribute backed by a global option set |

All schema changes require `publish-customizations` after.

</tool-reference>

<tool-reference name="relationship-tools">

## Relationship Tools (4 tools)

| Tool | Description |
|------|-------------|
| `create-o2m-rel` | Create one-to-many relationship |
| `create-m2m-rel` | Create many-to-many relationship |
| `update-relationship` | Update relationship properties |
| `delete-relationship` | Permanently delete relationship |

</tool-reference>

<tool-reference name="option-set-tools">

## Option Set Tools (6 tools)

| Tool | Description |
|------|-------------|
| `update-global-optionset` | Update global option set display name/description |
| `add-optionset-value` | Add new option to a global option set |
| `update-optionset-value` | Update option label or value |
| `delete-optionset-value` | Remove an option from a global option set |
| `reorder-optionset-values` | Reorder options by providing new value sequence |
| `publish-customizations` | Publish all pending customizations (also in Solution Tools) |

</tool-reference>

<tool-reference name="form-view-tools">

## Form and View Tools (9 tools)

| Tool | Description |
|------|-------------|
| `create-form` | Create a new form for an entity |
| `update-form` | Update form definition |
| `delete-form` | Delete a form |
| `activate-form` | Activate a form |
| `deactivate-form` | Deactivate a form |
| `create-view` | Create a new view for an entity |
| `update-view` | Update view definition and FetchXML |
| `delete-view` | Delete a view |
| `set-default-view` | Set a view as the default for an entity |

### Quick Find views (querytype=4) limitation

Quick Find savedqueries are **read-mostly via the Dataverse Web API**. This is a platform-side constraint, not an MCP implementation bug — verified by direct `PATCH /api/data/v9.2/savedqueries(id)` across multiple bypass strategies (property-level PUT, batch, bound/unbound actions, all `MSCRM.Bypass*` headers). Per-field behaviour:

| PATCH field on querytype=4 | Behaviour |
|---|---|
| `fetchxml` | **Hard-fails** with HTTP 400 / Dataverse code `0x80040216` ("An unexpected error occurred") |
| `name` | Returns 204, **silently discarded** — the record is not modified |
| `layoutxml` | Returns 204, **silently discarded** |
| `layoutjson` | Returns 204, **silently discarded** |
| `description` | Works |
| `isdefault` | Works (but Quick Find views aren't typically default) |

`update-view` pre-flights the savedquery's `querytype` when the payload includes any of the unsupported fields. If querytype=4, it fails fast with an actionable error naming the rejected fields and pointing at the maker portal. This prevents the silent-no-op failure mode where callers previously saw `"Successfully updated view..."` while the record was unchanged.

**Workaround for Quick Find changes:** Maker portal → Solutions → *solution* → *table* → Views → "Quick Find Active ..." → edit columns/filters → Save & Publish. `create-view` with `queryType=4` still works for net-new Quick Find views; only in-place updates of existing records are blocked.

</tool-reference>

<tool-reference name="form-file-workflow-tools">

## Form File Workflow Tools (3 tools)

Source-control-friendly tooling for form XML. Mirrors the `deploy-web-resource-file` pattern — form XML lives in a local file, diffs are reviewable, deploys are deterministic across environments. See also: release notes `v30.0.0-beta.6-form-file-workflow.md`.

| Tool | Description | Notes |
|------|-------------|-------|
| `download-form-to-file` | Download form XML to a local file (+ sidecar `.meta.json` + `<filePath>.history/` snapshot) | Resolves by `formId`, or `entityLogicalName` + `formName` (+ optional `formType`), or `entityLogicalName` + `formType` when unique. Overwrites target file. |
| `deploy-form-file` | PATCH local form XML file to Dataverse (bytes verbatim) | Reads `formId` from sidecar by default. Supports `expectedVersionNumber` for optimistic concurrency. Writes upload snapshot to history. Requires `publish-customizations` afterwards. |
| `diff-form-file` | Read-only byte comparison of local file vs remote form | Returns `identical`, `localSize`, `remoteSize`, `localVersion`, `remoteVersion`. |

**Guarantees:**
- XML bytes never round-tripped through a parser (whitespace and attribute order preserved — otherwise every diff would explode).
- `<filePath>.history/` is append-only: every download/upload creates a timestamped snapshot.
- Sidecar `.meta.json` is overwritten on download (Dataverse is source of truth) and updated on upload with `lastUploaded` block.

</tool-reference>

<tool-reference name="web-resource-tools">

## Web Resource Tools (3 tools)

| Tool | Description |
|------|-------------|
| `create-web-resource` | Upload a new web resource (JS, CSS, HTML, images, SVG) |
| `update-web-resource` | Update web resource content |
| `delete-web-resource` | Delete a web resource |

</tool-reference>

<tool-reference name="solution-tools">

## Solution Tools (8 tools)

| Tool | Description |
|------|-------------|
| `create-publisher` | Create a new solution publisher |
| `create-solution` | Create a new solution |
| `get-solution-components` | List all components in a solution |
| `add-solution-component` | Add a component to a solution |
| `remove-solution-component` | Remove a component from a solution |
| `export-solution` | Export solution as ZIP |
| `import-solution` | Import solution from ZIP |
| `publish-entity` | Publish a single entity's customizations |

</tool-reference>

<tool-reference name="plugin-tools-customization">

## Plugin Tools (8 tools)

| Tool | Description | Notes |
|------|-------------|-------|
| `create-plugin-assembly` | Upload compiled .NET DLL from local file system | Validates MZ header; polls for plugin types (15×2s) |
| `update-plugin-assembly` | Update existing assembly with new DLL | Steps auto-use new code (no re-registration) |
| `register-plugin-step` | Register SDK message processing step | Resolves message/filter IDs; maps stage/mode enums |
| `register-plugin-image` | Register pre/post image for a step | Maps imageType: PreImage=0, PostImage=1, Both=2 |
| `deploy-plugin-complete` | End-to-end orchestration: upload + steps + images + publish | Recommended for full deployments |
| `get-plugin-deploy-status` | Check deployment status of plugin assembly | — |
| `get-plugin-packages` | List plugin packages | — |
| `deploy-plugin-pkg` | Deploy a plugin package | — |

<plugin-deployment-detail>

**`deploy-plugin-complete` orchestration flow:**
1. Upload or update assembly based on `updateExisting` flag
2. For each entry in `stepConfigurations[]`: register step
3. For each step, register entries in nested `images[]`
4. Publish customizations if `publishAfterDeployment=true` (default: true)
5. Returns comprehensive summary: assembly ID, plugin types, step IDs, image IDs, publish status

**Stage/mode enum mappings:**
- PreValidation = 10, PreOperation = 20, PostOperation = 40
- Synchronous = 0, Asynchronous = 1

**Size limit:** 16MB assembly maximum. Use ILMerge selectively for large assemblies.

**Version extraction:** `extractAssemblyVersion()` parses PE header to extract .NET assembly version. Falls back to "1.0.0.0" on failure.

**Step-by-step alternative:**
1. `create-plugin-assembly` — upload DLL
2. `register-plugin-step` — for each SDK message (Create/Update/Delete)
3. `register-plugin-image` — for each step requiring pre/post images
4. `publish-customizations`

</plugin-deployment-detail>

</tool-reference>

<tool-reference name="workflow-tools">

## Workflow and Flow Management Tools (6 + 11 = 17 tools)

**Workflow tools (6):**

| Tool | Description |
|------|-------------|
| `update-workflow-desc` | Update a classic workflow's description field |
| `update-flow-description` | Update a Power Automate flow's description field |
| `document-automation` | Orchestration: analyze flow/workflow, generate YAML metadata, update description |
| `deactivate-workflow` | Deactivate a classic workflow |
| `activate-workflow` | Activate a classic workflow |
| `document-workflow-safe` | Document workflow without overwriting existing manual notes |

**Flow tools (11):**

| Tool | Description |
|------|-------------|
| `create-flow` | Clone an existing flow (requires template flow) |
| `delete-flow` | Delete a Power Automate flow |
| `clone-flow` | Clone flow to different environment |
| `activate-flow` | Activate a Power Automate flow |
| `deactivate-flow` | Deactivate a Power Automate flow |
| `create-flow-from-def` | Create flow directly from clientdata JSON definition |
| `get-flow-def-template` | Get pre-built clientdata JSON template for common flow patterns |
| `update-flow-definition` | Update an existing flow's definition |
| `get-flow-runs` | Get flow run history (same as read-only package) |
| `cancel-flow-run` | Cancel a running flow instance |
| `resubmit-flow-run` | Resubmit a failed or cancelled flow run |

<flow-creation>

**`create-flow-from-def` — creating flows without a template source:**

Use when no existing flow to clone. Provide `clientdata` JSON (complete flow definition with triggers and actions).

Validation checks: JSON parsability, `properties` object, `properties.definition`, `triggers`, `actions`. Warns if `connectionReferences` is missing (optional but required for Dataverse connector flows).

**`get-flow-def-template` — available templates:**

| Template | Trigger |
|----------|---------|
| `dataverse-on-create` | Dataverse Create |
| `dataverse-on-update` | Dataverse Update |
| `dataverse-on-delete` | Dataverse Delete |
| `dataverse-on-create-with-condition-and-update` | Dataverse Create + condition + Update |
| `scheduled-recurrence` | Recurrence |
| `manual-trigger` | Manual |
| `http-request` | HTTP Request |

Templates use `{{PLACEHOLDER}}` syntax: `{{TABLE_LOGICAL_NAME}}`, `{{TABLE_PLURAL_NAME}}`, `{{SELECT_COLUMNS}}`, `{{SCOPE}}`, `{{FILTER_EXPRESSION}}`, `{{ENVIRONMENT_URL}}`, `{{INTERVAL}}`, `{{FREQUENCY}}`, `{{HTTP_METHOD}}`, `{{RELATIVE_PATH}}`

</flow-creation>

</tool-reference>

<tool-reference name="app-endpoint-tools">

## App and Endpoint Tools (7 tools)

| Tool | Description |
|------|-------------|
| `add-entities-to-app` | Add entities to a model-driven app's navigation |
| `validate-app` | Validate app before publishing (checks for missing components) |
| `publish-app` | Publish a model-driven app |
| `create-service-endpoint` | Create a service endpoint (webhook, Service Bus, REST) |
| `update-service-endpoint` | Update endpoint configuration (accepts `namespaceAddress`, `sasKey`, `saskeyname` for Service Bus) |
| `delete-service-endpoint` | Delete a service endpoint |
| `register-webhook` | Orchestration: create service endpoint + register SDK message step in one call |

</tool-reference>

<automation-documentation>

## Automation Documentation Pattern

Automations can be auto-documented with structured YAML metadata in their description field:

```yaml
[AUTO-DOCS:v1]
tables_modified: contact, account, task
trigger: account.update
trigger_fields: revenue, ownerid
actions: update_record, create_record, send_email
analyzed: 2026-01-05
---
[Manual notes below this line are preserved on re-analysis]
```

The `document-automation` tool orchestrates: analyze flow/workflow definition → generate YAML → update description, while preserving content after `---` (manual notes).

**Search documented automations** using the read-only package's `search-workflows` with `description: "AUTO-DOCS:v1"` to find all documented automations by a specific table.

**Description merging logic:**
- Empty description: YAML block + "---" + placeholder
- Has `[AUTO-DOCS:` tag: replace YAML block, preserve manual notes after `---`
- Has content but no tag: prepend YAML block + "---", append existing content as manual notes

</automation-documentation>

<icon-management>

## Icon Management (via `update-entity-icon`)

The `update-entity-icon` tool uses Microsoft's Fluent UI System Icons (2,100+ icons, MIT License):
- Source: `https://github.com/microsoft/fluentui-system-icons`
- File name format: `{iconName}_{size}_{style}.svg` (e.g., `people_community_24_filled.svg`)
- Sizes: 16, 20, 24, 28, 32, 48px; Styles: regular, filled

**Implementation flow:**
1. Fetch entity metadata to get schema name and MetadataId
2. Download SVG from Fluent UI GitHub repository
3. Validate SVG: ≤100KB, contains `<svg>` tag, no `<script>` tags
4. Encode to base64 and upload as web resource (type 11 = SVG)
5. Web resource name: `{entitySchemaName}_icon_{iconFileName_without_ext}`
6. Icon vector name: `$webresource:{webResourceName}` (uses Dynamics 365 `$webresource:` directive)
7. Update entity metadata `IconVectorName` property
8. Publish web resource (component type 61) and entity (component type 1)

**This tool auto-publishes** — no separate `publish-customizations` call needed.

</icon-management>

</package>

---

<package name="powerplatform-data">

# Package: powerplatform-data

<feature-flags>

## Feature Flags

All write operations are controlled by individual environment variables (all default to `"false"`):

| Flag | Enables | Without the flag |
|------|---------|-----------------|
| `POWERPLATFORM_ENABLE_CREATE` | `create-record`, `associate-records` | `Error: Create operations are disabled. Set POWERPLATFORM_ENABLE_CREATE=true to enable.` |
| `POWERPLATFORM_ENABLE_UPDATE` | `update-record` | `Error: Update operations are disabled. Set POWERPLATFORM_ENABLE_UPDATE=true to enable.` |
| `POWERPLATFORM_ENABLE_DELETE` | `delete-record`, `disassociate-records` | `Error: Delete operations are disabled. Set POWERPLATFORM_ENABLE_DELETE=true to enable.` |
| `POWERPLATFORM_ENABLE_ACTIONS` | `execute-action` | `Error: Action execution is disabled. Set POWERPLATFORM_ENABLE_ACTIONS=true to enable.` |

Checks are implemented via `ServiceContext.checkCreateEnabled()` etc. in `types.ts`.

**Recommended flag configuration by environment:**

| Environment | CREATE | UPDATE | DELETE | ACTIONS |
|-------------|--------|--------|--------|---------|
| Development | true | true | true | true |
| QA/UAT | false | false | false | false |
| Production (automated) | false | false | false | false |
| Production (operational) | gated | gated | false | — |

</feature-flags>

<tool-reference name="read-tools">

## Read-Only Tools (6 — always available regardless of flags)

| Tool | Key Parameters | Returns |
|------|---------------|---------|
| `query-records` | `entityNamePlural` (required), `filter` (required), `maxRecords?` (default: 50, max: 5000) | Matching records with all fields |
| `get-record` | `entityNamePlural`, `recordId` | Complete record; 404 error if not found |
| `get-entity-metadata` | `entityName` | EntitySetName (plural name for API), PrimaryIdAttribute, PrimaryNameAttribute |
| `get-lookup-target` | `entityName`, `fieldName` | Target entity's EntitySetName + `@odata.bind` syntax example |
| `get-flow-runs` | `flowId`, `status?`, `startedAfter?`, `startedBefore?`, `maxRecords?` (default: 50, max: 250) | Run history: status, timestamps, trigger, error details |
| `get-flow-run-details` | `flowId`, `runId` | Action-level execution details |

**`get-entity-metadata` is essential** before CRUD on unfamiliar entities — Dataverse API requires the plural entity name (`entityNamePlural`), not the logical name.

**`get-lookup-target` is essential** for setting lookup field values — returns the correct `@odata.bind` syntax.

**Common OData filter expressions:**

| Filter | Description |
|--------|-------------|
| `name eq 'Acme Corp'` | Exact match |
| `contains(name, 'Acme')` | Contains substring |
| `startswith(name, 'A')` | Starts with |
| `statecode eq 0` | Active records |
| `createdon gt 2024-01-01` | Created after date |
| `revenue gt 1000000` | Numeric comparison |
| `_parentaccountid_value eq 'guid'` | Lookup field match |

</tool-reference>

<tool-reference name="write-tools">

## Write Tools (4 — require feature flags)

<tool name="create-record">

**`create-record`** — Requires `POWERPLATFORM_ENABLE_CREATE=true`

Parameters: `entityNamePlural` (required), `data` (required: JSON object with field names and values)

Validation: data must not be empty; required fields validated by Dataverse API; field types validated by API.

Audit log: `{ operation: 'create-record', operationType: 'CREATE', resourceId: entityNamePlural, componentType: 'Record', success, parameters: { entityNamePlural, dataFields: Object.keys(data) }, executionTimeMs }`

</tool>

<tool name="update-record">

**`update-record`** — Requires `POWERPLATFORM_ENABLE_UPDATE=true`

Parameters: `entityNamePlural` (required), `recordId` (required: GUID), `data` (required: partial or full JSON — only specified fields updated)

Validation: `recordId` must be valid GUID format (`12345678-1234-1234-1234-123456789012`); data must not be empty; record existence checked by API.

Audit log: `{ operation: 'update-record', operationType: 'UPDATE', resourceId: '${entityNamePlural}/${recordId}', ... }`

</tool>

<tool name="delete-record">

**`delete-record`** — Requires BOTH `POWERPLATFORM_ENABLE_DELETE=true` AND `confirm: true` parameter

Parameters: `entityNamePlural` (required), `recordId` (required: GUID), `confirm` (required: must be `true`)

**Operation is permanent and cannot be undone.** Without `confirm: true`: `Error: Delete operations require explicit confirmation (confirm: true)`

No bulk delete tool exists — must iterate with individual confirmations.

Audit log: `{ operation: 'delete-record', operationType: 'DELETE', resourceId: '${entityNamePlural}/${recordId}', parameters: { entityNamePlural, recordId, confirmed: true }, ... }`

</tool>

<tool name="execute-action">

**`execute-action`** — Requires `POWERPLATFORM_ENABLE_ACTIONS=true`

Parameters: `actionName` (required: e.g., `"WhoAmI"`, `"new_CalculateTotals"`), `parameters?` (JSON object), `boundTo?` (object: `{ entityNamePlural, recordId }` for bound actions)

Supports both unbound (global) and bound (entity-specific) actions.

Common built-in actions: `WhoAmI` (unbound), `WinOpportunity` (bound: opportunity), `LoseOpportunity` (bound: opportunity), `SetState` (bound), `CalculatePrice` (bound: opportunity/quote/order/invoice), `Merge` (bound), `ConvertSalesOrderToInvoice` (bound: salesorder)

</tool>

</tool-reference>

<tool-reference name="relationship-tools-data">

## Relationship Tools (2 — split across flags)

| Tool | Requires | Description |
|------|---------|-------------|
| `associate-records` | `POWERPLATFORM_ENABLE_CREATE=true` | Associate two records via navigation property (N:N or 1:N) |
| `disassociate-records` | `POWERPLATFORM_ENABLE_DELETE=true` | Remove association; does NOT delete either record |

**`associate-records` is required for N:N relationships** — intersect entities do not support the Create message directly. Attempting `create-record` on an intersect entity returns error `0x80040800`.

API call: `POST /api/data/v9.2/{entityNamePlural}({recordId})/{navigationProperty}/$ref`
Body: `{ "@odata.id": "{orgUrl}/api/data/v9.2/{targetEntityNamePlural}({targetRecordId})" }`

Use `get-entity-relationships` (read-only package) to find the correct `navigationProperty` name.

If the relationship already exists: `Error: A record with matching key values already exists` — no action needed, records are already associated.

</tool-reference>

<data-format-reference>

## Data Format Reference

```typescript
// Text fields (logical names, not display names)
{ name: "Acme Corporation", description: "Long text..." }

// Numbers
{ numberofemployees: 500, revenue: 1000000.00, exchangerate: 1.23456 }

// Booleans
{ donotemail: true, followemail: false }

// Lookup fields — @odata.bind syntax required
{
  "parentaccountid@odata.bind": "/accounts(12345678-1234-1234-1234-123456789012)",
  "primarycontactid@odata.bind": "/contacts(87654321-4321-4321-4321-210987654321)",
  "ownerid@odata.bind": "/systemusers(aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)"
}
// Format: "<fieldname>@odata.bind": "/<pluralname>(<guid>)"
// Use get-lookup-target to discover pluralname for a given lookup field

// Option sets — integer values
{
  industrycode: 1,    // Use get-entity-attribute (read-only pkg) to find valid values
  statecode: 0,       // 0 = Active, 1 = Inactive
  statuscode: 1       // Status reason (entity-specific)
}

// Dates — ISO 8601 format
{
  birthdate: "1990-01-15",                     // Date only
  createdon: "2025-01-15T10:30:00Z",           // UTC (recommended)
  scheduledstart: "2025-01-20T09:00:00-05:00"  // With timezone
}
```

</data-format-reference>

<error-reference>

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `Create operations are disabled` | `POWERPLATFORM_ENABLE_CREATE` not set to `true` | Add flag to env |
| `Update operations are disabled` | `POWERPLATFORM_ENABLE_UPDATE` not set to `true` | Add flag to env |
| `Delete operations are disabled` | `POWERPLATFORM_ENABLE_DELETE` not set to `true` | Add flag to env |
| `Action execution is disabled` | `POWERPLATFORM_ENABLE_ACTIONS` not set to `true` | Add flag to env |
| `Invalid GUID format for recordId` | Record ID is not a valid GUID | Use format: `12345678-1234-1234-1234-123456789012` |
| `Delete operations require explicit confirmation (confirm: true)` | `confirm` missing or false | Add `confirm: true` to delete-record params |
| `Data object cannot be empty` | Empty `data` passed to create/update | Include at least one field |
| `Action name cannot be empty` | Empty `actionName` | Provide action name (e.g., `"WhoAmI"`) |
| `Bound action requires entityNamePlural` | `boundTo` provided without `entityNamePlural` | Include both fields in `boundTo` object |
| `0x80040800 - Cannot create intersect entity` | Using `create-record` on N:N intersect | Use `associate-records` instead |
| `Object reference not set...` on associate/disassociate | Invalid navigation property name | Use `get-entity-relationships` (read-only pkg) to find correct name |
| `A record with matching key values already exists` on associate | Relationship link already exists | No action needed; records are already associated |
| `Principal user is missing prvCreate{Entity} privilege` | App user lacks Create privilege | Assign security role with Create on that entity |
| `Principal user is missing prvWrite{Entity} privilege` | App user lacks Write privilege | Assign security role with Write on that entity |
| `Principal user is missing prvDelete{Entity} privilege` | App user lacks Delete privilege | Assign security role with Delete on that entity |
| `Required field '{name}' is missing` | Required field absent from `data` | Include all required fields |
| `Invalid option set value '{n}' for field '{name}'` | Invalid option value | Use `get-entity-attribute` to find valid values |
| `Record with id 'guid' does not exist` | Record not found | Verify with `get-record` first |

</error-reference>

</package>

---

<authentication-troubleshooting>

## Authentication Troubleshooting (All Packages)

| Error | Cause | Fix |
|-------|-------|-----|
| `Missing required PowerPlatform configuration: POWERPLATFORM_URL, ...` | Required env vars not set | Set all required env vars |
| `AADSTS700016: Application not found` | CLIENT_ID doesn't match Azure AD app | Verify CLIENT_ID and TENANT_ID |
| `AADSTS7000215: Invalid client secret` | Secret expired or incorrect | Generate new secret in Azure AD |
| `Principal user is missing required privileges` | Application user lacks required role | Assign appropriate security role in PP Admin Center |
| Browser doesn't open (interactive auth) | Browser unavailable or cache corrupted | Run with `--logout` flag to clear token cache |
| `Authentication timed out` | Sign-in not completed in time | Re-run and complete sign-in within 5 minutes |
| `Missing required configuration: PUBLISHER_PREFIX` | Customization package started without PUBLISHER_PREFIX | Add PUBLISHER_PREFIX to env config |

**For interactive auth issues:** `mcp-pp-cli --logout` clears cached tokens.

</authentication-troubleshooting>

<cli-architecture>

## CLI Architecture (All 3 Packages)

All three packages follow the same CLI pattern:

```
cli.ts → createCliProgram() → loadEnvForCli() → registerAllCommands(program, ctx)
                                                     ↓
                                             context-factory.ts → ServiceContext
```

Global flags (all packages): `--json` (raw JSON output), `--no-cache` (skip cache files), `--env-file <path>` (custom .env file)

Output: summary to stdout + full JSON cached to package-specific cache directory.

<cli-commands name="powerplatform">

### `mcp-pp-cli` (read-only)

Cache dir: `.mcp-pp-cache`

| Group | Command File | Description |
|-------|-------------|-------------|
| `metadata` | metadata-commands.ts | Entity/attribute metadata inspection |
| `plugin` | plugin-commands.ts | Plugin assembly and step listing |
| `flow` | flow-commands.ts | Cloud flow and classic workflow queries |
| `solution` | solution-commands.ts | Solution listing and component inspection |
| `form` | form-commands.ts | Form layout and field inspection |
| `view` | view-commands.ts | View definitions and FetchXML retrieval |
| `webresource` | webresource-commands.ts | Web resource listing and content |
| `integration` | integration-commands.ts | Integration audit and endpoint review |
| `security` | security-commands.ts | Security role and privilege listing |
| `app` | app-commands.ts | Model-driven app and sitemap inspection |
| `validation` | validation-commands.ts | Schema name validation |
| `dbml` | dbml-commands.ts | DBML schema generation from Dataverse |

</cli-commands>

<cli-commands name="powerplatform-customization">

### `mcp-pp-custom-cli`

Cache dir: `.mcp-pp-custom-cache`

| Group | Command File | Description |
|-------|-------------|-------------|
| `entity` | entity-commands.ts | Create, update, and delete entities |
| `attribute` | attribute-commands.ts | Add, modify, and remove attributes |
| `relationship` | relationship-commands.ts | Create and manage relationships |
| `plugin` | plugin-commands.ts | Register and deploy plugin assemblies |
| `form` | form-commands.ts | Create and modify forms |
| `view` | view-commands.ts | Create and modify views |
| `webresource` | webresource-commands.ts | Upload and manage web resources |
| `solution` | solution-commands.ts | Export, import, and manage solutions |
| `option-set` | option-set-commands.ts | Create and modify option sets |
| `workflow` | workflow-commands.ts | Manage workflows and business rules |
| `endpoint` | endpoint-commands.ts | Service endpoint management |

</cli-commands>

<cli-commands name="powerplatform-data">

### `mcp-pp-data-cli`

Cache dir: `.mcp-pp-data-cache`

| Group | Command File | Description |
|-------|-------------|-------------|
| `data` | data-commands.ts | Create, read, update, and delete Dataverse records |

Examples:
```bash
mcp-pp-data-cli data query accounts --filter "contains(name, 'Acme')"
mcp-pp-data-cli data get accounts 00000000-0000-0000-0000-000000000001
mcp-pp-data-cli --json data query contacts --filter "statecode eq 0"
```

</cli-commands>

<cli-parameter-mapping>

### MCP-to-CLI Parameter Convention

| MCP (Zod) | CLI (Commander) |
|-----------|----------------|
| Required `z.string()` | Positional `<arg>` |
| Required `z.number()` | Positional `<arg>` (parsed with `parseInt`/`parseFloat`) |
| Optional `z.string().optional()` | Option `--flag <value>` |
| Optional `z.boolean().optional()` | Boolean option `--flag` |
| Optional `z.number().optional()` | Option `--count <n>` (parsed with `parseInt`) |
| `z.enum(["a","b","c"])` | Option with `.choices(["a","b","c"])` |
| Complex `z.object()` | JSON string arg parsed with `JSON.parse()` |

</cli-parameter-mapping>

</cli-architecture>

<security-best-practices>

## Security Best Practices

- **Production environments:** Install only `@mcp-consultant-tools/powerplatform` (read-only). Do not install the customization or data packages.
- **Interactive auth for desktop:** No secrets on user machines; user's Dynamics security roles apply.
- **Service principal for automation:** Use minimal security role — Basic User is sufficient for read-only.
- **Data package in production:** If required, enable only specific flags needed and implement human approval workflows. Never enable `POWERPLATFORM_ENABLE_DELETE=true` in production automation contexts.
- **Customization package:** Use only in development/configuration environments with System Customizer role.
- **Audit logs:** All write operations (data package) are automatically logged. Review logs regularly for anomalies.
- **No bulk delete:** The data package intentionally has no bulk delete tool — each deletion requires explicit `confirm: true`.

</security-best-practices>
