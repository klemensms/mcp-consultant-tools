# Figma Package Guide

## Overview

Figma integration for design extraction and data transformation.

- **Tools:** 4 tools, 0 prompts
- **Authentication:** Personal Access Token (PAT) or OAuth

## Environment Configuration

```bash
# Option 1: PAT Authentication (recommended)
FIGMA_API_KEY=your_figma_personal_access_token_here

# Option 2: OAuth Authentication
FIGMA_OAUTH_TOKEN=your_oauth_token
FIGMA_USE_OAUTH=true
```

## Key Tools

- `get-figma-data` - Extract complete file/node data with simplification options
- `get-figma-semantic-extract` - **NEW** Extract semantic FigJam data (diff-friendly)
- `extract-ado-stories` - **NEW** Extract ADO User Story Components from FigJam boards
- `download-figma-images` - Download rendered node images to local disk (PNG/SVG/JPG/PDF)

## get-figma-semantic-extract

Purpose-built tool for FigJam boards that produces deterministic, diff-friendly output:

- **Categorizes sticky notes** by color (blocker, tbd, investigation, done, info, note)
- **Extracts user story IDs** with strict pattern (US787, Story #787, Task787, Bug #787)
- **Preserves connectors** with resolved node names
- **Discards positional data** - moving stickies doesn't create diffs
- **Sorts all arrays** for deterministic output

### Example Usage

```typescript
// Basic extraction
await tool("get-figma-semantic-extract", {
  fileKey: "Abc123SampleFileKey000",
  nodeId: "1234-5678" // optional section
});

// Custom sticky categorization
await tool("get-figma-semantic-extract", {
  fileKey: "...",
  stickyColorOverrides: {
    "#FF00FF": "blocker"
  }
});
```

### Output Structure

```typescript
interface SemanticExtract {
  fileKey: string;
  nodeId: string | null;
  title: string;
  fetchedAt: string;
  sections: SectionSummary[];
  stickies: StickyNote[];      // With category from color
  components: ComponentSummary[];
  textNodes: TextNodeSummary[];
  shapes: ShapeSummary[];      // SHAPE_WITH_TEXT nodes
  connectors: ConnectorSummary[];
  userStories: UserStoryRef[]; // Extracted IDs
  stats: { totalNodes: number; nodesDropped: number; };
}
```

### Screenshot Support

Add `includeScreenshot: true` with a `nodeId` to get a 2x PNG screenshot as an image content block prepended to the response.

## extract-ado-stories

Purpose-built tool for extracting ADO User Story Components from FigJam boards. Reduces ~200K raw node data to ~5K structured result with a single tool call.

- **Finds** INSTANCE nodes named "ADO User Story Component"
- **Extracts** ADO Name, Description, State from componentProperties
- **Resolves** parent component context (Dataverse Table, API Endpoint, etc.)
- **Constructs** ADO work item links and Figma board links
- **Filters** placeholder IDs (ADO xxxxx) by default

### Example Usage

```typescript
await tool("extract-ado-stories", {
  fileKey: "Abc123SampleFileKey000",
  nodeId: "1234-5678",
  adoOrganization: "myorg",
  adoProject: "MyProject",
});
```

### Output Structure

```typescript
interface AdoStoryExtractResult {
  items: AdoStoryItem[];     // Extracted ADO components
  totalCount: number;
  placeholderCount: number;  // Items with "ADO xxxxx" IDs
  byState: Record<string, number>;      // e.g. { "New": 3, "Active": 2 }
  byParentType: Record<string, number>; // e.g. { "Dataverse Table": 4 }
}
```

## Reference

See `docs/technical/FIGMA_TECHNICAL.md` for detailed implementation.

## Context-Safe Responses

Large Figma responses can be saved to disk instead of returned inline, reducing context window usage.

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_CONTEXT_SAFE_RESPONSE` | `false` | Set `true` to enable (recommended). When disabled, all behavior is unchanged. |
| `MCP_RESPONSE_SIZE_THRESHOLD` | `5000` | Byte threshold. Responses larger than this are saved to `.context/.mcp-figma-cache/`. Recommended: `1000` for Figma. |

When enabled, tools return a summary with a file path. The agent can `Read` or `Grep` the cached file for details. Each tool also accepts `returnFullResponse: true` to force inline responses regardless of the setting.

## CLI Usage

Binary: `mcp-figma-cli`

```bash
# Get Figma data
mcp-figma-cli figma-data get Abc123SampleFileKey000

# Semantic extract
mcp-figma-cli get-semantic Abc123SampleFileKey000

# Semantic extract with screenshot
mcp-figma-cli get-semantic Abc123SampleFileKey000 -n 1234:5678 --screenshot

# Download node images
mcp-figma-cli download-images Abc123SampleFileKey000 "1234:5678" ./output --format png --scale 2
```
