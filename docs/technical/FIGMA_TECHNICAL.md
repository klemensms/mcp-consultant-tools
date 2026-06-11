# Figma - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/FIGMA.md -->

<overview>

The Figma package extracts design data from Figma files and FigJam boards and transforms it into simplified, AI-friendly JSON. It uses a multi-stage extraction and transformation pipeline operating on the raw Figma REST API response.

**Package:** `@mcp-consultant-tools/figma`
**Binary (MCP):** `mcp-figma`
**Binary (CLI):** `mcp-figma-cli`
**Tools:** 4 (`get-figma-data`, `get-figma-semantic`, `extract-ado-stories`, `download-figma-images`)

</overview>

<authentication>

## Authentication

Two methods are supported. Only one is required.

**Personal Access Token (PAT) — recommended:**
- Set `FIGMA_API_KEY` to the token value
- Sends header: `X-Figma-Token: <token>`
- Generate at: Figma Settings → Account → Personal access tokens

**OAuth:**
- Set `FIGMA_OAUTH_TOKEN` and `FIGMA_USE_OAUTH=true`
- Sends header: `Authorization: Bearer <token>`
- Token must be obtained externally via Figma OAuth flow

**Validation:** Service throws on init if neither `FIGMA_API_KEY` nor `FIGMA_OAUTH_TOKEN` is set. If `FIGMA_USE_OAUTH=true` but no token is provided, also throws.

**File:** `packages/figma/src/services/figma-service.ts`

</authentication>

<architecture>

## Architecture

<data-pipeline>

### Data Transformation Pipeline

Raw Figma API responses are large and complex. The pipeline reduces them to compact, AI-readable structures:

```
Figma REST API Response
    ↓
Node Walker (depth-first tree traversal, depth limiting)
    ↓
Extractors (layout, text, visuals, component, connector)
    ↓
Transformers (simplify layout, text styles, fills, effects)
    ↓
Style Deduplication (hash styles → globalVars.styles references)
    ↓
Post-Processing (connector simplification, component simplification, style stripping)
    ↓
SimplifiedDesign (AI-friendly JSON)
```

**Post-processing order matters:**
1. Connector simplification (runs first to preserve endpoint data)
2. Component instance simplification
3. Style stripping (runs last, strips from all nodes including already-simplified ones)

</data-pipeline>

<extractors>

### Extractors

**File:** `packages/figma/src/figma/extractors/built-in.ts`

| Extractor | Extracts |
|-----------|----------|
| `layoutExtractor` | Position, size, constraints, auto-layout, padding, spacing |
| `textExtractor` | Text content, font family, size, weight, alignment, line height |
| `visualsExtractor` | Fills, strokes, effects, opacity, border radius, blend modes |
| `componentExtractor` | Component instances, properties, variants, overrides |
| `connectorExtractor` | Connector start/end node IDs and visual properties |
| `collapseSvgContainers` | Post-child hook that flattens nested SVG structure |

All extractors run by default. Custom extractor subset selectable via the `extractors` parameter on `get-figma-data`.

**Node Walker** (`node-walker.ts`): Depth-first traversal with `beforeChildren` / `afterChildren` hooks. Depth limiting via `maxDepth` stops traversal after N levels.

**Design Extractor** (`design-extractor.ts`): Top-level orchestrator. Coordinates node walking, calls extractors, manages global style deduplication.

</extractors>

<transformers>

### Transformers

**Location:** `packages/figma/src/figma/transformers/`

| File | Responsibility |
|------|---------------|
| `layout.ts` | Position, size, constraints, auto-layout, flex properties |
| `text.ts` | Font, size, weight, alignment, line height, letter spacing, text overflow |
| `style.ts` | Fill/stroke parsing (solid colors, gradients, images), RGBA/hex color formats |
| `effects.ts` | Drop shadows, inner shadows, background blur, layer blur |
| `component.ts` | Component metadata, properties, variants, instance overrides |
| `table-to-markdown.ts` | Converts TABLE nodes to markdown. Reconstructs grid from TABLE_CELL positions. Significant token reduction for tabular data. |
| `style-stripper.ts` | Removes all styling properties (fills, strokes, effects, textStyle, opacity, borderRadius, globalVars.styles). Preserves: id, name, type, text, componentId, componentProperties, connector endpoints. |
| `component-simplifier.ts` | Simplifies INSTANCE nodes: keeps componentId and componentProperties, removes visual styling. Ideal for ADO User Story components. |

</transformers>

<context-safe-responses>

### Context-Safe Responses

Figma responses are typically 20-200KB. The context-safe mechanism prevents large payloads from consuming the agent's context window.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_CONTEXT_SAFE_RESPONSE` | `false` | Set `true` to enable. When disabled, behavior is unchanged. |
| `MCP_RESPONSE_SIZE_THRESHOLD` | `5000` | Byte threshold. Responses over this size are written to disk. Recommended: `1000` for Figma. |

**How it works:**
1. Tool serializes response to JSON
2. If size > threshold AND feature is enabled: write to `.context/.mcp-figma-cache/{tool}_{timestamp}.json`
3. Return a text summary with the file path
4. If file write fails: silently fall back to inline response (tool never breaks)

**Per-call override:** Each tool accepts `returnFullResponse: true` to force inline response regardless of env settings.

**Applied to tools:** `get-figma-data`, `get-figma-semantic`, `extract-ado-stories`

**Core helpers used:**
- `getContextSafeConfig(cacheDir)` — reads env vars once at tool registration
- `withContextSafeParam(schema)` — appends `returnFullResponse` to tool Zod schema
- `createContextSafeResponse(opts)` — serializes, checks threshold, writes or returns inline

</context-safe-responses>

</architecture>

<tool-reference>

## Tool Reference

<tool name="get-figma-data">

### get-figma-data

Fetches comprehensive Figma design data and returns simplified, AI-friendly JSON. Can fetch an entire file or specific nodes. Automatically deduplicates styles.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `fileKey` | string | Yes | — | Alphanumeric key from Figma URL (e.g. `Abc123SampleFileKey000`) |
| `nodeId` | string | No | — | Specific node ID(s). Format: `1234:5678` or multiple `1:10;2:20` (semicolon-separated) |
| `depth` | number | No | — | Tree traversal depth limit. Prevents token overflow on large files. |
| `excludeStyles` | boolean | No | `true` | Strip all styling info (fills, strokes, effects, textStyle, opacity, borderRadius, globalVars.styles). Set `false` for visual data. |
| `tablesToMarkdown` | boolean | No | `true` | Convert TABLE nodes to markdown table format. Significant token reduction. Set `false` for full node tree. |
| `simplifyConnectors` | boolean | No | `true` | Reduce CONNECTOR nodes to just `{startNodeId, endNodeId, text}`. Set `false` for full connector data. |
| `simplifyComponentInstances` | boolean | No | `true` | Keep componentId/componentProperties on INSTANCE nodes, remove visual styling. Set `false` for full instance data. |
| `extractors` | array | No | all | Override extractor subset: `["layout", "text", "visuals", "component"]` |
| `returnFullResponse` | boolean | No | — | Force inline response even if context-safe mode is enabled |

**Output structure:**
```typescript
{
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  nodes: SimplifiedNode[];
  components: { [id: string]: ComponentDefinition };
  componentSets: { [id: string]: ComponentSetDefinition };
  globalVars: {
    styles: { [id: string]: StyleObject }
  };
}
```

**Figma API endpoints called:**
- Entire file: `GET https://api.figma.com/v1/files/{fileKey}?depth={depth}`
- Specific nodes: `GET https://api.figma.com/v1/files/{fileKey}/nodes?ids={id1},{id2}&depth={depth}`

**File key extraction:** From URL `https://figma.com/file/ABC123/MyFile` → use `ABC123`.

</tool>

<tool name="get-figma-semantic">

### get-figma-semantic

Purpose-built for FigJam boards. Extracts semantically meaningful data (stickies, sections, components, connectors, user story references) while discarding positional and visual information. Output is deterministic (all arrays sorted by ID) and diff-friendly.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `fileKey` | string | Yes | — | Figma file key from URL |
| `nodeId` | string | No | — | Specific section/node ID. If omitted, extracts from entire file. |
| `stickyColorOverrides` | object | No | — | Map hex colors to categories: `{"#FF00FF": "blocker"}`. Overrides HSL-based detection for exact hex matches. |
| `storyIdPattern` | string | No | — | Custom regex string for story ID extraction. Compiled with `gi` flags. Invalid patterns return an error response. |
| `includeScreenshot` | boolean | No | `false` | When `true` and `nodeId` is set, fetches a 2x PNG via Figma Images API and prepends it as an image content block. Non-fatal: screenshot errors are logged but do not fail the tool. |
| `returnFullResponse` | boolean | No | — | Force inline response |

**Sticky color categorization (HSL-based):**

The extractor calls `getFigmaData` with `excludeStyles: false` to preserve fill colors, then categorizes each sticky by its background color:

| Hue Range | Category | Meaning |
|-----------|----------|---------|
| 0-30° and 330-360° (Red/Pink) | `blocker` | Needs client input |
| 45-65° (Yellow) | `info` | Informational |
| 90-150° (Green) | `done` | Completed |
| 200-259° (Blue) | `investigation` | Internal investigation needed |
| 260-330° (Purple) | `tbd` | Questions, non-blocking |
| Saturation < 15% (Gray) | `note` | General notes |
| Other | `unknown` | Unrecognized |

`stickyColorOverrides` is checked first (exact hex match, case-insensitive). Then HSL-based detection runs as fallback.

`si-investigation` (the pre-v33 name) is accepted as a deprecated input alias in `stickyColorOverrides` values and is normalized to `investigation`; output always uses `investigation`.

**User story ID extraction (default pattern):**

Pattern: `/\b(US|Story|Task|Bug)[#:\s]*(\d+)\b/gi`

Matches: `US787`, `Story #787`, `Task787`, `Bug #787`. IDs < 1 or > 999,999 are skipped.

**Output structure:**
```typescript
interface SemanticExtract {
  fileKey: string;
  nodeId: string | null;
  title: string;
  fetchedAt: string;  // ISO 8601

  sections: SectionSummary[];         // SECTION and FRAME nodes
  stickies: StickyNote[];             // STICKY / STICKY_NOTE nodes with category
  components: ComponentSummary[];     // INSTANCE / COMPONENT nodes
  textNodes: TextNodeSummary[];       // Standalone TEXT nodes
  shapes: ShapeSummary[];             // SHAPE_WITH_TEXT nodes
  connectors: ConnectorSummary[];     // CONNECTOR nodes with resolved names
  userStories: UserStoryRef[];        // Extracted IDs, sorted ascending

  stats: {
    totalNodes: number;
    nodesDropped: number;    // Decorative nodes with no semantic content
  };
}

interface ConnectorSummary {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromNodeName?: string;   // Resolved from nodeNameMap
  toNodeName?: string;     // Resolved from nodeNameMap
  label?: string;
}

interface UserStoryRef {
  id: number;
  type: "US" | "Story" | "Task" | "Bug";
  foundIn: string[];    // Node IDs containing this reference
  contexts: string[];   // Text snippets around each match
}
```

**Implementation file:** `packages/figma/src/figma/extractors/semantic-extractor.ts`

</tool>

<tool name="extract-ado-stories">

### extract-ado-stories

Extracts ADO User Story Component instances from FigJam boards. Reduces ~200KB raw node data to ~5KB structured result by targeting only INSTANCE nodes named "ADO User Story Component". Resolves parent component context (Dataverse Table, API Endpoint, etc.) and constructs ADO work item links.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `fileKey` | string | Yes | — | Figma file key |
| `nodeId` | string | No | — | Section node ID to scope extraction. If omitted, extracts from entire file. |
| `adoOrganization` | string | No | — | ADO organization name for constructing work item URLs |
| `adoProject` | string | No | — | ADO project name for constructing work item URLs |
| `includePlaceholders` | boolean | No | `false` | Include components whose ADO Name contains "ADO xxxxx" (unfilled placeholders) |
| `returnFullResponse` | boolean | No | — | Force inline response |

**Extraction logic:**
1. Calls `getFigmaData` with `excludeStyles: true`, `simplifyComponentInstances: true`, `simplifyConnectors: true`
2. Recursively walks the node tree
3. For each INSTANCE node named `"ADO User Story Component"`:
   - Reads component properties: `ADO Name`, `ADO Description`, `ADO State`
   - Extracts numeric ADO ID via pattern `/ADO\s+(\d+)/i`
   - Identifies nearest INSTANCE ancestor as parent context
4. Filters placeholder IDs (containing "xxxxx") unless `includePlaceholders: true`

**Parent type resolution:**

The nearest INSTANCE ancestor's name is matched against a fixed map:

| Component Name | Display Type |
|---------------|-------------|
| `API Endpoint` | `API Endpoint` |
| `Power Automate Flow Component` | `Power Automate Flow` |
| `Dataverse Table Component` | `Dataverse Table` |
| `Plugin Component` | `Dataverse Plugin` |
| `Customer Insights Component` | `Customer Insights` |
| `Azure Function Component` | `Azure Function` |
| `Service Bus Queue Component` | `Service Bus Queue` |
| `SPO Component` | `SharePoint Online` |

**ADO link format:** `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`

**Figma link format:** `https://www.figma.com/board/{fileKey}/?node-id={nodeId}` (colon in node ID replaced with dash)

**Output structure:**
```typescript
interface AdoStoryExtractResult {
  items: AdoStoryItem[];
  totalCount: number;
  placeholderCount: number;        // Items filtered out (ADO xxxxx)
  byState: Record<string, number>; // e.g. { "New": 3, "Active": 2 }
  byParentType: Record<string, number>; // e.g. { "Dataverse Table": 4 }
}

interface AdoStoryItem {
  nodeId: string;
  adoName: string;
  adoDescription: string | null;
  adoState: string | null;
  adoId: number | null;         // null for placeholders
  adoLink: string | null;       // null if no ID or missing org/project
  figmaLink: string | null;     // Points to parent node or own node
  parentType: string | null;    // From PARENT_TYPE_MAP
  parentContext: string | null; // "{Header}: {Description}" from parent props
  parentNodeId: string | null;
}
```

**Implementation file:** `packages/figma/src/figma/extractors/ado-story-extractor.ts`

</tool>

<tool name="download-figma-images">

### download-figma-images

Downloads rendered images of Figma nodes to local disk using the Figma Images API. Returns temporary CDN URLs (valid ~14 days) from the API, then fetches and saves each to disk.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `fileKey` | string | Yes | — | Figma file key |
| `nodeIds` | string | Yes | — | Semicolon-separated node IDs: `1:10;2:20` |
| `localPath` | string | Yes | — | Local directory path (created if it does not exist) |
| `format` | enum | No | `png` | Image format: `png`, `svg`, `jpg`, `pdf` |
| `scale` | number | No | `2` | Scale factor 0.01-4. Default 2 (retina) |

**Output:** `{ downloaded: number, total: number, results: [{nodeId, filePath?, error?}] }`

**Saved filename pattern:** `{nodeId_with_colons_replaced_by_underscores}.{format}`

**Figma Images API endpoint:** `GET /images/{fileKey}?ids={id1,id2}&format={format}&scale={scale}`

Nodes that cannot be rendered return no URL in the API response; these are reported as errors in the results array without failing the whole operation.

Does not support `returnFullResponse` (response is always small).

</tool>

</tool-reference>

<api-integration>

## Figma API Integration

**Base URL:** `https://api.figma.com/v1`

**Rate limits:** Vary by plan. The service uses `fetchWithRetry` with exponential backoff, retrying up to 3 times for transient errors. Designed for corporate proxy environments.

**Error sanitization:** Token values are not included in error messages thrown to callers.

<error-cases>

### Error Cases

| Error | Cause | Message pattern |
|-------|-------|----------------|
| Missing credentials | Neither env var set | `Missing required Figma configuration: FIGMA_API_KEY or FIGMA_OAUTH_TOKEN` |
| OAuth config mismatch | `FIGMA_USE_OAUTH=true` but no token | `useOAuth is true but oauthToken is not provided` |
| File not found | Invalid file key or no access | `404 - File not found` |
| Unauthorized | Expired/invalid token | `401 - Unauthorized` |
| Rate limit | Too many requests | `429 - Too Many Requests` |
| Invalid regex | Bad `storyIdPattern` value | `Invalid storyIdPattern regex: {pattern}` (returned as MCP error response, not throw) |

All tool handlers wrap logic in try/catch and return `createErrorResponse(error, toolName)` on failure, ensuring `isError: true` in the response.

</error-cases>

</api-integration>

<cli-architecture>

## CLI Architecture

The CLI reuses the same `ServiceContext` and service methods as the MCP tools. Business logic is in the service layer; CLI commands are thin wrappers.

**Entry point:** `packages/figma/src/cli.ts`
**Context factory:** `packages/figma/src/context-factory.ts`
**Cache directory:** `.context/.mcp-figma-cache/`
**Global flags:** `--json` (raw JSON output), `--no-cache` (skip cache write), `--env-file <path>` (custom .env)

### File Structure

```
packages/figma/src/
  cli.ts                      # Commander.js entry point
  context-factory.ts          # Shared createServiceContext() for CLI
  cli/
    output.ts                 # outputResult() wrapper with figma cache dir
    commands/
      index.ts                # registerAllCommands() barrel
      figma-data-commands.ts  # get-data command
      semantic-commands.ts    # get-semantic command
      ado-story-commands.ts   # extract-ado-stories command
      image-commands.ts       # download-images command
```

### Command Reference

| Command | Maps to Tool | Required Args | Key Options |
|---------|-------------|---------------|------------|
| `get-data <fileKey>` | `get-figma-data` | fileKey | `-n/--node-id`, `-d/--depth`, `--no-exclude-styles`, `--no-tables-to-markdown`, `--no-simplify-connectors`, `--no-simplify-components`, `--extractors` |
| `get-semantic <fileKey>` | `get-figma-semantic` | fileKey | `-n/--node-id`, `--sticky-overrides <json>`, `--story-pattern <regex>`, `--screenshot` |
| `extract-ado-stories <fileKey>` | `extract-ado-stories` | fileKey | `-n/--node-id`, `--ado-org`, `--ado-project`, `--include-placeholders` |
| `download-images <fileKey> <nodeIds> <localPath>` | `download-figma-images` | fileKey, nodeIds, localPath | `--format`, `--scale` |

### CLI Examples

```bash
# Get entire file data
mcp-figma-cli get-data Abc123SampleFileKey000

# Get specific node with full styling
mcp-figma-cli get-data Abc123SampleFileKey000 -n 1234:5678 --no-exclude-styles

# Semantic extract from a section
mcp-figma-cli get-semantic Abc123SampleFileKey000 -n 1234:5678

# Semantic extract with screenshot saved to cache
mcp-figma-cli get-semantic Abc123SampleFileKey000 -n 1234:5678 --screenshot

# Extract ADO stories with ADO links
mcp-figma-cli extract-ado-stories Abc123SampleFileKey000 --ado-org myorg --ado-project MyProject

# Download node images as SVG
mcp-figma-cli download-images Abc123SampleFileKey000 "1:10;2:20" ./output --format svg --scale 1

# Raw JSON output
mcp-figma-cli --json get-semantic Abc123SampleFileKey000
```

**Screenshot behavior in CLI:** When `--screenshot` is set without `--node-id`, a warning is logged and no screenshot is taken. Screenshot errors (network, API) are logged but do not fail the command.

</cli-architecture>

<performance>

## Performance Optimization

**Depth limiting:** Use `depth` parameter on large files to stop tree traversal early. `depth=3` returns only 3 levels of the node hierarchy.

**Node filtering:** Provide `nodeId` to fetch a specific subtree instead of the entire file. Significantly reduces API response size and processing time.

**Style deduplication:** The pipeline automatically deduplicates repeated style objects. Styles are hashed, stored in `globalVars.styles` with reference IDs, and replaced with `$styleId` references in nodes. Typical reduction: 50-70% for design-heavy files.

**Optimization defaults:** All four optimization flags (`excludeStyles`, `tablesToMarkdown`, `simplifyConnectors`, `simplifyComponentInstances`) default to `true`. Disabling any of them increases response size.

</performance>
