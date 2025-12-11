# Figma Integration - Technical Documentation

**Cross-References:**
- User Guide: [docs/documentation/FIGMA.md](../documentation/FIGMA.md)
- Service Implementation: [packages/figma/src/FigmaService.ts](../../packages/figma/src/FigmaService.ts)
- Main Architecture: [CLAUDE.md](../../CLAUDE.md)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Figma Service Implementation](#figma-service-implementation)
3. [Data Transformation Pipeline](#data-transformation-pipeline)
4. [Figma Extractors](#figma-extractors)
5. [Figma Transformers](#figma-transformers)
6. [Available Tools](#available-tools)
7. [Figma API Integration](#figma-api-integration)
8. [Use Cases](#use-cases)
9. [Error Handling](#error-handling)

---

## Architecture Overview

The Figma integration extracts design data from Figma files and transforms it into a simplified, AI-friendly format. It uses a multi-stage pipeline to process complex Figma API responses.

**Key Capabilities:**
- Design data extraction from Figma files
- Simplified, AI-friendly JSON output format
- Multi-stage transformation pipeline
- Style deduplication and optimization
- Depth limiting for large files
- Node filtering for specific design elements

---

## Figma Service Implementation

**File:** [packages/figma/src/FigmaService.ts](../../packages/figma/src/FigmaService.ts)

### Authentication

The service supports two authentication methods:

1. **Personal Access Token (PAT)** - Uses `X-Figma-Token` header
2. **OAuth Authentication** - Uses `Authorization: Bearer` header

Token type is configured via `FIGMA_USE_OAUTH` environment variable.

### Core Methods

```typescript
class FigmaService {
  // Main method for extracting design data
  getFigmaData(fileKey: string, nodeId?: string, depth?: number): Promise<SimplifiedDesign>

  // Fetch complete Figma file via REST API
  getFigmaFile(fileKey: string): Promise<FigmaFile>

  // Fetch specific nodes by ID
  getFigmaNodes(fileKey: string, nodeIds: string[]): Promise<FigmaNodes>

  // Returns appropriate authentication headers
  getAuthHeaders(): { [key: string]: string }
}
```

### Features

- **Depth Limiting**: Prevents token overflow for large files
- **Node Filtering**: Fetch specific nodes instead of entire file
- **Automatic Retry Logic**: Corporate proxy fallback support
- **JSON Output Format**: AI-friendly structured data

---

## Data Transformation Pipeline

The Figma integration uses a sophisticated extraction and transformation pipeline:

```
Figma API Response (Complex)
    ↓
Node Walker (Tree Traversal)
  - Depth-first traversal
  - Depth limiting
  - Context propagation
    ↓
Extractors (Data Extraction)
  - layoutExtractor: position, size, constraints
  - textExtractor: text content, typography
  - visualsExtractor: fills, strokes, effects, opacity
  - componentExtractor: component instances, properties
    ↓
Transformers (Simplification)
  - Layout properties
  - Text styles
  - Fill/stroke definitions
  - Effects (shadows, blurs)
    ↓
Style Deduplication
  - Hash style objects
  - Store in globalVars.styles
  - Return reference IDs
    ↓
Simplified Design (AI-Friendly JSON)
```

### Pipeline Stages

1. **Figma API Response**: Raw, complex design data from Figma API
2. **Node Walker**: Depth-first tree traversal with depth limiting
3. **Extractors**: Extract specific data types (layout, text, visuals, components)
4. **Transformers**: Simplify and normalize data structures
5. **Style Deduplication**: Deduplicate repeated styles for optimization
6. **Output**: Clean, AI-friendly JSON format

---

## Figma Extractors

**Location:** [packages/figma/src/figma/extractors/](../../packages/figma/src/figma/extractors/)

### Design Extractor

**File:** [design-extractor.ts](../../packages/figma/src/figma/extractors/design-extractor.ts)

- Top-level orchestration of extraction process
- Coordinates node walking and data extraction
- Manages global style deduplication

### Node Walker

**File:** [node-walker.ts](../../packages/figma/src/figma/extractors/node-walker.ts)

- Depth-first tree traversal
- Supports depth limiting
- Provides `beforeChildren` and `afterChildren` hooks for extractors

### Built-in Extractors

**File:** [built-in.ts](../../packages/figma/src/figma/extractors/built-in.ts)

**layoutExtractor**:
- Extracts position, size, constraints
- Layout properties (auto-layout, padding, spacing)

**textExtractor**:
- Extracts text content and typography
- Font family, size, weight, alignment

**visualsExtractor**:
- Extracts fills, strokes, effects
- Opacity, border radius, blend modes

**componentExtractor**:
- Extracts component instances and properties
- Component variants and overrides

**collapseSvgContainers**:
- Optimizes SVG nodes (afterChildren hook)
- Reduces nested SVG structure complexity

---

## Figma Transformers

**Location:** [packages/figma/src/figma/transformers/](../../packages/figma/src/figma/transformers/)

Transform complex Figma API data into simplified structures:

### layout.ts
- Layout calculations (position, size, constraints, auto-layout)
- Absolute and relative positioning
- Flex layout properties

### text.ts
- Text style parsing (font, size, weight, alignment)
- Line height, letter spacing, text decoration
- Text overflow and truncation

### style.ts
- Fill and stroke parsing (solid colors, gradients, images)
- Color formats (RGBA, hex)
- Gradient stops and transformations

### effects.ts
- Shadow and blur effect parsing
- Drop shadows, inner shadows
- Blur effects (background blur, layer blur)

### component.ts
- Component metadata extraction
- Component properties and variants
- Instance overrides and swapping

### table-to-markdown.ts
- Converts TABLE nodes to markdown format
- Reconstructs grid from TABLE_CELL positions
- Significantly reduces token usage for tabular data

### style-stripper.ts
- Removes all styling properties from nodes
- Clears globalVars.styles for maximum reduction
- Preserves critical data: id, name, type, text, componentId, componentProperties, connector endpoints

### component-simplifier.ts
- Simplifies INSTANCE nodes while preserving componentProperties
- Ideal for ADO User Story components
- Keeps component relationship data, removes visual styling

---

## Optimization Extractors

**Location:** [packages/figma/src/figma/extractors/connector-extractor.ts](../../packages/figma/src/figma/extractors/connector-extractor.ts)

### connectorExtractor
- Extracts connector start/end node IDs
- Full connector data with visual properties

### simplifiedConnectorExtractor
- Extracts only connection endpoints (startNodeId, endNodeId)
- Removes visual properties (fills, strokes, etc.)
- Preserves text labels on connectors

---

## Available Tools

### get-figma-data

**Location:** [packages/figma/src/index.ts](../../packages/figma/src/index.ts)

Fetches comprehensive Figma design data and returns simplified, AI-friendly JSON format.

**Parameters:**
- `fileKey` (required): Figma file key from URL (alphanumeric)
- `nodeId` (optional): Specific node ID(s) to fetch (format: `1:10` or `1:10;2:20`)
- `depth` (optional): Tree traversal depth limit
- `excludeStyles` (optional): Remove all styling info. Default: true. Set to false for full styling data.
- `tablesToMarkdown` (optional): Convert TABLE nodes to markdown. Default: true. Set to false for full node tree.
- `simplifyConnectors` (optional): Simplify CONNECTOR nodes to just endpoints. Default: true. Set to false for full connector data.
- `simplifyComponentInstances` (optional): Keep componentId/Properties, remove styling from INSTANCE nodes. Default: true. Set to false for full instance data.
- `extractors` (optional): Override extractors array: `["layout", "text", "visuals", "component"]`

**Features:**
- Supports entire file or specific node fetching
- Supports depth limiting for large files
- Automatic style deduplication
- Context window optimization options

**Output Structure:**
```typescript
{
  metadata: {
    name: string;
    lastModified: string;
    thumbnailUrl: string;
    version: string;
    // ... more metadata
  },
  nodes: SimplifiedNode[],
  components: { [id: string]: ComponentDefinition },
  componentSets: { [id: string]: ComponentSetDefinition },
  globalVars: {
    styles: { [id: string]: StyleObject }
  }
}
```

### download-figma-images

**Location:** [packages/figma/src/index.ts](../../packages/figma/src/index.ts)

- Placeholder for future image download functionality
- Planned for v2 release
- Will support PNG/SVG downloads with Sharp-based processing

---

## Figma API Integration

### Endpoints Used

**1. Get File**
```
GET https://api.figma.com/v1/files/{fileKey}?depth={depth}
```
Returns complete file structure with all nodes.

**2. Get Specific Nodes**
```
GET https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId1},{nodeId2}
```
Returns only specified nodes.

### Rate Limits

- Figma API has rate limits (varies by plan)
- Implements retry logic with exponential backoff
- Uses fetch-with-retry for corporate proxy support

### Authentication Headers

**PAT Authentication:**
```http
X-Figma-Token: your-personal-access-token
```

**OAuth Authentication:**
```http
Authorization: Bearer your-oauth-token
```

---

## Use Cases

### Design System Documentation

- Extract component definitions and properties
- Document typography scales and color palettes
- Map design tokens to code variables
- Generate design system documentation

### Design QA

- Verify consistency across design files
- Check for style drift
- Identify unused components
- Validate design standards compliance

### Design-to-Code

- Extract layout properties for code generation
- Map Figma components to code components
- Generate CSS from Figma styles
- Automate UI component scaffolding

### AI-Assisted Design Review

- Provide design context to AI assistants
- Enable natural language queries about designs
- Facilitate design discussions with structured data
- Automated design critique and suggestions

---

## Error Handling

### Common Errors and Solutions

#### Missing Authentication
```
Error: Missing required Figma configuration: FIGMA_API_KEY or FIGMA_OAUTH_TOKEN
```
**Solution:** Set credentials in environment variables:
```bash
FIGMA_API_KEY=your-personal-access-token
# OR
FIGMA_OAUTH_TOKEN=your-oauth-token
FIGMA_USE_OAUTH=true
```

#### Invalid File Key
```
Error: 404 - File not found
```
**Solution:**
- Verify file key from URL (e.g., `https://figma.com/file/ABC123/MyFile` → use `ABC123`)
- Check access permissions (file must be shared with your account)
- Verify file hasn't been deleted or moved

#### Expired OAuth Token
```
Error: 401 - Unauthorized
```
**Solution:**
- Refresh OAuth token
- Re-authenticate with Figma OAuth flow
- Check token expiration date

#### Rate Limit Exceeded
```
Error: 429 - Too Many Requests
```
**Solution:**
- Reduce request frequency
- Implement backoff strategy
- Use depth limiting to reduce API calls
- Consider upgrading Figma plan for higher limits

### Error Handling Strategy

**Retry Logic:**
- Implements exponential backoff for transient errors
- Retries up to 3 times for network errors
- Corporate proxy fallback for connectivity issues

**Error Sanitization:**
- Removes sensitive tokens from error messages
- Provides actionable error messages
- Includes debugging context without exposing credentials

---

## Performance Optimization

### Depth Limiting

For large Figma files, use depth limiting to reduce response size:
```typescript
// Fetch only top 3 levels of design hierarchy
const data = await getFigmaData(fileKey, undefined, 3);
```

### Node Filtering

Fetch specific nodes instead of entire file:
```typescript
// Fetch only specific components
const data = await getFigmaData(fileKey, '1:10;2:20');
```

### Style Deduplication

The service automatically deduplicates repeated styles:
- Reduces response size by 50-70% for typical design files
- Stores styles in `globalVars.styles` with reference IDs
- Reuses style definitions across multiple nodes

### Caching Strategy

Consider implementing client-side caching for:
- File metadata (rarely changes)
- Component definitions (stable across sessions)
- Style definitions (reusable across requests)

---

## Design Patterns

### Lazy Initialization

Service is initialized on first tool invocation to reduce startup time.

### Simplified Data Model

Complex Figma API responses are transformed into a simplified model:
- Removes unnecessary metadata
- Flattens nested structures where appropriate
- Provides human-readable property names
- Optimizes for AI consumption

### Hook-Based Extraction

Extractors use `beforeChildren` and `afterChildren` hooks for flexible data extraction:
```typescript
{
  beforeChildren: (node, context) => {
    // Extract data before processing children
  },
  afterChildren: (node, context, childResults) => {
    // Post-process after children are extracted
  }
}
```

---

**End of Technical Documentation**
