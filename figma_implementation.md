# Figma Integration Implementation Guide

## Overview
This document outlines the complete implementation plan for integrating Figma Context MCP features into the mcp-consultant-tools MCP server.

## Architecture Decision
**Service-based integration** - Following the existing PowerPlatformService and AzureDevOpsService patterns for consistency and maintainability.

## Implementation Phases

### Phase 1: Initial Implementation (v1)
Core Figma design data extraction without image downloads

### Phase 2: Future Enhancements (v2)
Image download functionality with Sharp-based processing

---

# Phase 1: Initial Implementation

## Step 1: Create Directory Structure

Create the following directories in `mcp-consultant-tools/src/`:

```bash
mkdir -p src/figma/extractors
mkdir -p src/figma/transformers
mkdir -p src/figma/types
mkdir -p src/figma/utils
```

**Purpose:**
- Modular organization of Figma-specific code
- Separation of concerns (extractors, transformers, types, utilities)
- Easy to maintain and extend

---

## Step 2: Port Core Figma Files

### 2.1 Port FigmaService (Adapted)

**Source:** `Figma-Context-MCP/src/services/figma.ts`
**Destination:** `mcp-consultant-tools/src/FigmaService.ts`

**Required Modifications:**
1. Adapt to service pattern matching PowerPlatformService.ts
2. Remove image download methods (defer to v2)
3. Keep core methods:
   - `getFigmaFile(fileKey: string)` - Fetch complete file
   - `getFigmaNodes(fileKey: string, nodeIds: string[])` - Fetch specific nodes
   - Authentication handling (PAT and OAuth)
   - Request wrapper with retry logic

**Interface Structure:**
```typescript
export interface FigmaConfig {
  apiKey?: string;
  oauthToken?: string;
  useOAuth: boolean;
}

export class FigmaService {
  private config: FigmaConfig;

  constructor(config: FigmaConfig) {
    // Validate config
    // Initialize authentication
  }

  async getFigmaData(
    fileKey: string,
    nodeId?: string,
    depth?: number
  ): Promise<SimplifiedDesign> {
    // Main method exposed to MCP tools
  }

  private async getFigmaFile(fileKey: string): Promise<FigmaFile> {
    // Internal method
  }

  private async getFigmaNodes(
    fileKey: string,
    nodeIds: string[]
  ): Promise<FigmaNodesResponse> {
    // Internal method
  }

  private getAuthHeaders(): Record<string, string> {
    // Return appropriate auth headers
  }
}
```

### 2.2 Port Extractors

**Source Directory:** `Figma-Context-MCP/src/extractors/`
**Destination:** `mcp-consultant-tools/src/figma/extractors/`

**Files to Port:**
1. `design-extractor.ts` - Top-level orchestration
2. `node-walker.ts` - Tree traversal engine
3. `built-in.ts` - Built-in extractors:
   - `layoutExtractor` - Position, size, constraints
   - `textExtractor` - Text content & typography
   - `visualsExtractor` - Fills, strokes, effects, opacity, border radius
   - `componentExtractor` - Component instances & properties
   - `collapseSvgContainers` - SVG optimization (afterChildren hook)

**Modifications:** Minimal - these are self-contained modules

### 2.3 Port Transformers

**Source Directory:** `Figma-Context-MCP/src/transformers/`
**Destination:** `mcp-consultant-tools/src/figma/transformers/`

**Files to Port:**
1. `layout.ts` - Layout calculations
2. `text.ts` - Text style parsing
3. `style.ts` - Fills, strokes, gradients
4. `effects.ts` - Shadows, blurs
5. `component.ts` - Component metadata

**Purpose:** These transform complex Figma API responses into simplified, AI-friendly formats

### 2.4 Port Types

**Source Directory:** `Figma-Context-MCP/src/types/`
**Destination:** `mcp-consultant-tools/src/figma/types/`

**Key Types to Include:**
- `SimplifiedNode` - Simplified node representation
- `SimplifiedDesign` - Complete design output
- `SimplifiedComponentDefinition` - Component definitions
- `StyleTypes` - Style definitions
- `TraversalContext` - Extraction context

### 2.5 Port Utilities

**Source Directory:** `Figma-Context-MCP/src/utils/`
**Destination:** `mcp-consultant-tools/src/figma/utils/`

**Files to Port:**
1. `fetch-with-retry.ts` - HTTP fetch with curl fallback for corporate proxies
2. `common.ts` - General utilities
3. `identity.ts` - Type guards

**Skip for v1:**
- `image-processing.ts` (requires Sharp, deferred to v2)
- `logger.ts` (use console.error/log for now)

### 2.6 Remove Original Creator References

**IMPORTANT:** When porting all files from Figma-Context-MCP, remove original creator references and branding to ensure clean integration.

**Items to Remove/Update:**

1. **File Header Comments**
   - Remove author attributions (e.g., `@author`, `Created by`, etc.)
   - Remove original copyright notices
   - Remove original license headers specific to Figma-Context-MCP
   - Remove links to original repository

2. **Package/Project Names**
   - Remove references to "Figma-Context-MCP"
   - Remove references to "Framelink MCP"
   - Remove references to "figma-developer-mcp" (npm package name)
   - Update any branding text to be generic

3. **Documentation Comments**
   - Remove original project descriptions
   - Remove original setup/installation instructions in comments
   - Remove references to original npm package
   - Keep technical documentation about functionality

4. **Version History**
   - Remove original changelog comments
   - Remove version history in file headers
   - Remove release notes embedded in code

5. **URLs and Links**
   - Remove links to original GitHub repository
   - Remove links to original documentation sites
   - Keep links to external resources (Figma API docs, etc.)

6. **Code Comments to Clean**
   - Remove TODO comments referencing original project
   - Remove issue tracker references from original repo
   - Remove contributor acknowledgments
   - Keep technical explanations and algorithm descriptions

**Example Transformation:**

**Before (Original):**
```typescript
/**
 * Figma Context MCP - Design Extractor
 * @author Original Creator
 * @copyright 2024 Figma Context MCP
 * @license MIT
 *
 * Part of the Framelink MCP for Figma project
 * https://github.com/original/figma-context-mcp
 *
 * This file extracts and simplifies Figma design data
 */
export function extractDesign() {
  // Implementation
}
```

**After (Cleaned):**
```typescript
/**
 * Design Extractor
 *
 * Extracts and simplifies Figma design data for AI consumption
 */
export function extractDesign() {
  // Implementation
}
```

**Files Requiring Extra Attention:**
- `FigmaService.ts` - May have service-level documentation
- `design-extractor.ts` - Likely has architectural comments
- README references in comments
- Any exported constants with project names
- Error messages mentioning original package name

**Automated Search Patterns:**
After porting, search for and remove:
```bash
# Search for common attribution patterns
grep -r "@author" src/figma/
grep -r "Framelink" src/figma/
grep -r "figma-context-mcp" src/figma/
grep -r "figma-developer-mcp" src/figma/
grep -r "copyright" src/figma/ -i
grep -r "Created by" src/figma/
```

**License Handling:**
- Check the original project's license (likely MIT or similar)
- Ensure compliance with license terms (MIT typically requires attribution in LICENSE file, not necessarily in every source file)
- Add original project attribution to mcp-consultant-tools LICENSE or NOTICE file if required by license
- Remove per-file license headers to match mcp-consultant-tools style

**Verification Checklist:**
- [ ] No "@author" tags in ported files
- [ ] No "Figma-Context-MCP" or "Framelink" references
- [ ] No original GitHub repository URLs
- [ ] No original copyright headers in source files
- [ ] No original package name references
- [ ] Error messages don't reference original project
- [ ] Comments are technical, not project-specific
- [ ] License compliance documented if required

---

## Step 2.7: License Compliance Check

**Before proceeding with implementation, verify license compliance:**

### Check Original Project License

1. **Read Figma-Context-MCP License:**
   ```bash
   cat /Users/klemensstelk/Repo/github-klemensms/Figma-Context-MCP/LICENSE
   ```
   or check `package.json` for license field

2. **Common Licenses and Requirements:**

   **MIT License (Most Likely):**
   - ✅ Allows commercial use, modification, distribution
   - ✅ Can integrate into proprietary projects
   - ⚠️ Requires: Include copyright notice and license text in distribution
   - 📝 Action: Add attribution to mcp-consultant-tools LICENSE or NOTICE file

   **Apache 2.0:**
   - ✅ Allows commercial use, modification, distribution
   - ✅ Explicit patent grant
   - ⚠️ Requires: Include copyright notice, license text, and state changes
   - 📝 Action: Add NOTICE file with attribution

   **ISC License:**
   - ✅ Similar to MIT, very permissive
   - ⚠️ Requires: Include copyright notice
   - 📝 Action: Add attribution to LICENSE file

3. **Where to Add Attribution:**

   **Option A: Update mcp-consultant-tools LICENSE file**
   Add section at the end:
   ```
   ================================================================================
   This project includes code derived from Figma-Context-MCP
   (https://github.com/[original-repo-url])

   Original Copyright Notice:
   [Paste original copyright and license text here]
   ================================================================================
   ```

   **Option B: Create NOTICE file**
   Create `mcp-consultant-tools/NOTICE` file with attribution

4. **Document in README (Optional but Recommended):**
   Add "Acknowledgments" section:
   ```markdown
   ## Acknowledgments

   The Figma integration features are derived from the Figma-Context-MCP project.
   See LICENSE file for details.
   ```

### Compliance Checklist
- [ ] Original project license identified
- [ ] License allows derivative works
- [ ] Required attribution added to LICENSE or NOTICE file
- [ ] Source file headers cleaned (per-file attribution not needed for most licenses)
- [ ] Changes documented if required by license (Apache 2.0)
- [ ] README acknowledgment added (optional but recommended)

**IMPORTANT:** Do NOT proceed with integration until license compliance is verified.

---

## Step 3: Register Figma Tools in index.ts

### 3.1 Add Figma Configuration

**Location:** `mcp-consultant-tools/src/index.ts` (near top of file)

```typescript
// Figma Configuration
const FIGMA_CONFIG: FigmaConfig = {
  apiKey: process.env.FIGMA_API_KEY || "",
  oauthToken: process.env.FIGMA_OAUTH_TOKEN || "",
  useOAuth: process.env.FIGMA_USE_OAUTH === "true",
};
```

### 3.2 Add Lazy Initialization Function

```typescript
// Figma Service Initialization
let figmaService: FigmaService | null = null;

function getFigmaService(): FigmaService {
  if (!figmaService) {
    const missingConfig: string[] = [];

    if (!FIGMA_CONFIG.apiKey && !FIGMA_CONFIG.oauthToken) {
      missingConfig.push("FIGMA_API_KEY or FIGMA_OAUTH_TOKEN");
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing required Figma configuration: ${missingConfig.join(", ")}. ` +
        `Please set these in your .env file or environment variables.`
      );
    }

    figmaService = new FigmaService(FIGMA_CONFIG);
  }
  return figmaService;
}
```

### 3.3 Register Tool: get-figma-data

**Location:** After existing tool registrations in `index.ts`

```typescript
// ============================================================================
// Figma Tools
// ============================================================================

/**
 * Tool: get-figma-data
 * Fetches and simplifies Figma file or node data for AI consumption
 */
server.tool(
  "get-figma-data",
  "Get comprehensive Figma design data including layout, text, styles, and components. " +
  "Fetches from Figma API and transforms into simplified, AI-friendly format. " +
  "Can fetch entire files or specific nodes. Automatically deduplicates styles.",
  {
    fileKey: z.string().describe(
      "Figma file key (alphanumeric string from URL). " +
      "Example: From 'https://figma.com/file/ABC123/MyFile', use 'ABC123'"
    ),
    nodeId: z.string().optional().describe(
      "Optional specific node ID(s) to fetch. Format: '1234:5678' or multiple '1:10;2:20'. " +
      "If omitted, fetches entire file."
    ),
    depth: z.number().optional().describe(
      "Optional tree traversal depth limit. Useful for large files. " +
      "Example: depth=3 stops after 3 levels of children."
    ),
  },
  async ({ fileKey, nodeId, depth }) => {
    try {
      const service = getFigmaService();
      const result = await service.getFigmaData(fileKey, nodeId, depth);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }],
        isError: false,
      };
    } catch (error: any) {
      console.error("Error fetching Figma data:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to fetch Figma data: ${error.message}\n\n` +
                `Troubleshooting:\n` +
                `1. Verify FIGMA_API_KEY or FIGMA_OAUTH_TOKEN is set\n` +
                `2. Check file key is correct (from Figma URL)\n` +
                `3. Ensure you have access to the file in Figma\n` +
                `4. For OAuth, check token hasn't expired`
        }],
        isError: true,
      };
    }
  }
);
```

### 3.4 Register Tool Stub: download-figma-images (v2 placeholder)

```typescript
/**
 * Tool: download-figma-images (v2 Feature)
 * Placeholder for future image download functionality
 */
server.tool(
  "download-figma-images",
  "Download and process images from Figma designs (Coming in v2)",
  {
    fileKey: z.string().describe("Figma file key"),
    localPath: z.string().describe("Local path to save images"),
  },
  async ({ fileKey, localPath }) => {
    return {
      content: [{
        type: "text",
        text: "Image download functionality is planned for v2. " +
              "This will include:\n" +
              "- Download PNG/SVG exports\n" +
              "- Crop images with Figma transforms\n" +
              "- Generate CSS dimension variables\n" +
              "- Support for image fills and rendered nodes\n\n" +
              "For now, use get-figma-data to retrieve design metadata."
      }],
      isError: false,
    };
  }
);
```

### 3.5 Add Import Statement

**Location:** Top of `index.ts` with other imports

```typescript
import { FigmaService, type FigmaConfig } from "./FigmaService.js";
```

---

## Step 4: Update package.json

### 4.1 Add Dependencies

**Location:** `mcp-consultant-tools/package.json`

Add to `dependencies` section:

```json
{
  "dependencies": {
    "@figma/rest-api-spec": "^0.33.0",
    // ... existing dependencies
  }
}
```

**Rationale:**
- `@figma/rest-api-spec`: Provides TypeScript types for Figma API responses
- Existing `zod` and `axios` are sufficient for v1
- `sharp`, `js-yaml`, `remeda` deferred to v2

### 4.2 Install Dependencies

```bash
cd /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools
npm install
```

---

## Step 5: Update Configuration Files

### 5.1 Update .env.example

**Location:** `mcp-consultant-tools/.env.example`

Add Figma configuration section:

```bash
# =============================================================================
# Figma Configuration
# =============================================================================

# Figma Personal Access Token (PAT)
# Generate at: https://www.figma.com/developers/api#authentication
# Required if not using OAuth
FIGMA_API_KEY=your_figma_personal_access_token_here

# Figma OAuth Token (Alternative to API Key)
# Use this if authenticating via OAuth instead of PAT
FIGMA_OAUTH_TOKEN=

# Use OAuth Authentication (true/false)
# Set to "true" if using FIGMA_OAUTH_TOKEN instead of FIGMA_API_KEY
FIGMA_USE_OAUTH=false
```

### 5.2 Update .env (User's Local File)

**User Action Required:** Users must add their credentials to `.env`:

```bash
FIGMA_API_KEY=figd_your_actual_token_here
```

**How to Get Figma API Key:**
1. Go to https://www.figma.com/developers/api#authentication
2. Scroll to "Personal Access Tokens"
3. Click "Get personal access token"
4. Log in to Figma
5. Generate new token
6. Copy token to .env file

---

## Step 6: Update Documentation

### 6.1 Update README.md

**Location:** `mcp-consultant-tools/README.md`

Add Figma section to tools list:

```markdown
## Available Tools

### Figma Tools

#### get-figma-data
Fetches comprehensive Figma design data and transforms it into a simplified, AI-friendly format.

**Parameters:**
- `fileKey` (required): Figma file key from URL (e.g., 'ABC123' from figma.com/file/ABC123/MyFile)
- `nodeId` (optional): Specific node ID(s) to fetch (format: '1234:5678' or multiple '1:10;2:20')
- `depth` (optional): Tree traversal depth limit for large files

**Output:**
- Simplified node tree with layout, text, and visual properties
- Component definitions and instances
- Deduplicated global styles
- JSON format

**Example:**
```json
{
  "fileKey": "ABC123XYZ",
  "nodeId": "1:10",
  "depth": 5
}
```

#### download-figma-images *(Coming in v2)*
Placeholder for future image download functionality with Sharp-based processing.

### PowerPlatform Tools
... (existing content)
```

### 6.2 Update Setup Instructions

Add to README.md setup section:

```markdown
### Figma Setup

1. Generate a Figma Personal Access Token:
   - Visit: https://www.figma.com/developers/api#authentication
   - Click "Get personal access token"
   - Log in and generate token

2. Add to `.env` file:
   ```bash
   FIGMA_API_KEY=figd_your_token_here
   ```

3. Ensure you have access to the Figma files you want to query

**Note:** Figma OAuth is also supported via `FIGMA_OAUTH_TOKEN` and `FIGMA_USE_OAUTH=true`
```

---

## Step 7: Build and Test

### 7.1 Build the Project

```bash
cd /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools
npm run build
```

**Expected Output:**
- TypeScript compiles successfully
- New files appear in `build/` directory
- No type errors

### 7.2 Test Locally

**Option A: Direct Node Execution**
```bash
node build/index.js
```

**Option B: NPM Start**
```bash
npm start
```

### 7.3 Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

**Test Cases:**
1. List tools - verify `get-figma-data` appears
2. Call `get-figma-data` with a test file key
3. Verify JSON output structure
4. Test error handling with invalid file key
5. Test with `nodeId` parameter
6. Test with `depth` parameter

### 7.4 Integration Test with Claude Desktop

**Update Claude Desktop Config:**

```json
{
  "mcpServers": {
    "mcp-consultant-tools": {
      "command": "node",
      "args": ["/Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools/build/index.js"],
      "env": {
        "FIGMA_API_KEY": "your_token_here"
      }
    }
  }
}
```

**Test Prompt:**
```
Use the get-figma-data tool to fetch design information from Figma file ABC123
```

---

## Step 8: Verify Integration Checklist

### Code Porting
- [ ] Directory structure created (`src/figma/` with subdirectories)
- [ ] FigmaService.ts created and follows service pattern
- [ ] Extractors ported to `src/figma/extractors/`
- [ ] Transformers ported to `src/figma/transformers/`
- [ ] Types ported to `src/figma/types/`
- [ ] Utils ported to `src/figma/utils/`

### Original Reference Removal (Critical)
- [ ] No "@author" tags in ported files
- [ ] No "Figma-Context-MCP" or "Framelink" references
- [ ] No "figma-developer-mcp" package name references
- [ ] No original GitHub repository URLs
- [ ] No original copyright headers in source files
- [ ] Error messages don't reference original project
- [ ] Comments are technical, not project-specific
- [ ] License compliance documented (check LICENSE file)
- [ ] Ran grep commands to verify no references remain

### Tool Registration
- [ ] Tools registered in `index.ts` (get-figma-data + stub)
- [ ] Lazy initialization function added
- [ ] Configuration added to index.ts
- [ ] Import statements added

### Dependencies & Configuration
- [ ] Dependencies added to package.json
- [ ] .env.example updated with Figma config
- [ ] npm install completed successfully

### Documentation
- [ ] README.md updated with Figma tools
- [ ] Setup instructions added
- [ ] Examples provided

### Testing
- [ ] Project builds successfully (`npm run build`)
- [ ] No TypeScript errors
- [ ] MCP Inspector shows new tools
- [ ] Tool executes successfully with real Figma file
- [ ] Error handling works (invalid file key)
- [ ] No regression in existing PowerPlatform/AzureDevOps tools

---

# Phase 2: Future Enhancements (v2)

## Image Download Implementation

### When to Implement
- After Phase 1 is stable and tested
- When image download functionality is needed
- When ready to add Sharp dependency

### Implementation Steps

#### 1. Add Sharp Dependency

```bash
npm install sharp@^0.34.3
npm install --save-dev @types/node
```

**Note:** Sharp is a native Node.js module (~10MB) that requires compilation.

#### 2. Port Image Processing Utilities

**Source:** `Figma-Context-MCP/src/utils/image-processing.ts`
**Destination:** `mcp-consultant-tools/src/figma/utils/image-processing.ts`

**Functions:**
- `cropImage()` - Apply Figma transform matrix to crop images
- `getImageDimensions()` - Extract width/height from images
- `generateCssVariables()` - Create CSS dimension variables for TILE mode

**IMPORTANT:** Remember to remove original creator references when porting (see Step 2.6 from Phase 1)

#### 3. Extend FigmaService

Add image download methods to `FigmaService.ts`:

```typescript
async getImageUrls(
  fileKey: string,
  nodeIds: string[],
  format: 'png' | 'svg',
  scale?: number
): Promise<ImageUrlResponse> {
  // Call Figma images API
}

async downloadImage(
  url: string,
  outputPath: string
): Promise<Buffer> {
  // Download image from Figma CDN
}

async processImage(
  imagePath: string,
  options: ImageProcessingOptions
): Promise<ProcessedImageResult> {
  // Apply crops, extract dimensions, generate CSS
}
```

#### 4. Implement download-figma-images Tool

Replace stub with full implementation:

```typescript
server.tool(
  "download-figma-images",
  "Download and process images from Figma designs with optional cropping and CSS generation",
  {
    fileKey: z.string().describe("Figma file key"),
    nodes: z.array(z.object({
      nodeId: z.string(),
      imageRef: z.string().optional(),
      fileName: z.string(),
      needsCropping: z.boolean().optional(),
      cropTransform: z.array(z.number()).optional(),
      requiresImageDimensions: z.boolean().optional(),
      filenameSuffix: z.string().optional(),
    })).describe("Array of nodes to download"),
    pngScale: z.number().optional().describe("PNG export scale (1-4, default 2)"),
    localPath: z.string().describe("Absolute path to save images"),
  },
  async ({ fileKey, nodes, pngScale, localPath }) => {
    // Full implementation here
  }
);
```

#### 5. Add Configuration Options

```typescript
const FIGMA_CONFIG = {
  // ... existing config
  skipImageDownloads: process.env.SKIP_IMAGE_DOWNLOADS === "true",
  pngScale: parseInt(process.env.FIGMA_PNG_SCALE || "2"),
};
```

#### 6. Update Documentation

- Add image download examples to README
- Document crop transform matrices
- Explain CSS variable generation
- Add troubleshooting for Sharp installation

### v2 Features

**Image Download Capabilities:**
- Download both SVG and PNG formats
- Handle image fills vs rendered nodes
- Post-process with Sharp:
  - Crop images based on Figma transform matrices
  - Generate CSS dimension variables for TILE mode
  - Return processing metadata
- Deduplicate identical downloads
- Validate file paths for security

**Configuration:**
- `SKIP_IMAGE_DOWNLOADS` - Disable image downloads
- `FIGMA_PNG_SCALE` - Default PNG scale (1-4)

---

# Technical Details

## Figma API Overview

### Authentication

**Personal Access Token (PAT):**
```typescript
headers: {
  'X-Figma-Token': 'figd_...'
}
```

**OAuth:**
```typescript
headers: {
  'Authorization': 'Bearer oauth_token'
}
```

### Endpoints Used

**1. Get File**
```
GET https://api.figma.com/v1/files/{fileKey}?depth={depth}
```

**2. Get Specific Nodes**
```
GET https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId1},{nodeId2}
```

**3. Get Image URLs (v2)**
```
GET https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format={png|svg}&scale={1-4}
```

**4. Get Image Fills (v2)**
```
GET https://api.figma.com/v1/files/{fileKey}/images
```

### Rate Limits
- Figma API has rate limits (varies by plan)
- Implement retry logic with exponential backoff
- Use fetch-with-retry.ts for corporate proxy support

## Data Transformation Pipeline

```
┌─────────────────────────────────────────┐
│       Figma API Response (Complex)      │
│   - Nested node trees                   │
│   - Verbose style objects               │
│   - Multiple format variants            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Node Walker (Traversal)         │
│   - Depth-first tree traversal          │
│   - Depth limiting                      │
│   - Context propagation                 │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Extractors (Data Extraction)       │
│   - layoutExtractor → position, size    │
│   - textExtractor → text content        │
│   - visualsExtractor → fills, strokes   │
│   - componentExtractor → instances      │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│    Transformers (Simplification)        │
│   - Parse layout properties             │
│   - Simplify text styles                │
│   - Extract fill/stroke definitions     │
│   - Process effects (shadows, blurs)    │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Style Deduplication                │
│   - Hash style objects                  │
│   - Store in globalVars.styles          │
│   - Return reference IDs                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│   Simplified Design (AI-Friendly)       │
│   - Flat node properties                │
│   - Style references not duplicates     │
│   - JSON output                         │
└─────────────────────────────────────────┘
```

## File Structure After Implementation

```
mcp-consultant-tools/
├── src/
│   ├── index.ts                      # Main entry (MODIFIED - add Figma tools)
│   ├── PowerPlatformService.ts       # Existing
│   ├── AzureDevOpsService.ts         # Existing
│   ├── FigmaService.ts               # NEW - Figma API service
│   └── figma/                        # NEW - Figma modules
│       ├── extractors/
│       │   ├── design-extractor.ts
│       │   ├── node-walker.ts
│       │   └── built-in.ts
│       ├── transformers/
│       │   ├── layout.ts
│       │   ├── text.ts
│       │   ├── style.ts
│       │   ├── effects.ts
│       │   └── component.ts
│       ├── types/
│       │   ├── simplified-node.ts
│       │   ├── simplified-design.ts
│       │   └── index.ts
│       └── utils/
│           ├── fetch-with-retry.ts
│           ├── common.ts
│           └── identity.ts
├── build/                            # Compiled output
├── package.json                      # MODIFIED - add @figma/rest-api-spec
├── .env.example                      # MODIFIED - add Figma config
├── README.md                         # MODIFIED - document Figma tools
└── figma_implementation.md           # THIS FILE
```

## Error Handling

### Common Errors

**1. Missing Authentication**
```
Error: Missing required Figma configuration: FIGMA_API_KEY or FIGMA_OAUTH_TOKEN
```
**Solution:** Add credentials to .env file

**2. Invalid File Key**
```
Error: 404 - File not found
```
**Solution:** Verify file key from Figma URL, check access permissions

**3. Expired OAuth Token**
```
Error: 401 - Unauthorized
```
**Solution:** Refresh OAuth token

**4. Rate Limit Exceeded**
```
Error: 429 - Too Many Requests
```
**Solution:** Implement exponential backoff, reduce request frequency

**5. Network/Proxy Issues**
```
Error: ECONNREFUSED or SSL handshake failed
```
**Solution:** fetch-with-retry.ts automatically falls back to curl command

### Error Response Format

All tools return consistent error format:

```typescript
{
  content: [{
    type: "text",
    text: "Failed to fetch Figma data: [error message]\n\nTroubleshooting:\n..."
  }],
  isError: true
}
```

## Testing Strategy

### Unit Tests (Future)
- Test FigmaService methods in isolation
- Mock Figma API responses
- Test extractors with sample nodes
- Test transformers with sample data

### Integration Tests
1. Test with real Figma file (use public Figma Community file)
2. Test authentication (both PAT and OAuth)
3. Test node filtering
4. Test depth limiting
5. Test error handling

### Test File Suggestions
Use Figma Community files for testing:
- https://www.figma.com/community (search for "design system")
- Files are public and don't require team access
- Variety of component types and structures

---

# Troubleshooting Guide

## Build Issues

**TypeScript Errors:**
```bash
# Check TypeScript version
npx tsc --version

# Clean build
rm -rf build/
npm run build
```

**Import Errors:**
- Ensure all imports end with `.js` extension (ES modules)
- Check `tsconfig.json` has `"module": "Node16"`

## Runtime Issues

**Service Initialization Fails:**
- Check .env file exists and has correct variables
- Verify environment variables are loaded (add debug log)
- Check config validation logic

**Figma API Errors:**
- Test API key with curl: `curl -H "X-Figma-Token: YOUR_KEY" https://api.figma.com/v1/me`
- Check file permissions in Figma
- Verify file key format (alphanumeric only)

**Proxy/Corporate Network:**
- fetch-with-retry.ts should handle this automatically
- If issues persist, check curl is installed and accessible

## Performance Issues

**Large File Timeouts:**
- Use `depth` parameter to limit traversal
- Fetch specific nodes with `nodeId` instead of entire file
- Consider pagination (split large requests)

**Memory Issues:**
- Increase Node.js heap: `NODE_OPTIONS="--max-old-space-size=4096" node build/index.js`
- Process files in chunks

---

# Migration Path for Existing Users

## For Users Already Using Figma-Context-MCP

**Side-by-Side Usage:**
- Both servers can run simultaneously
- Different server names in MCP config
- Gradual migration as needed

**Key Differences:**
- No prompts in mcp-consultant-tools (v1)
- JSON-only output (no YAML)
- No image downloads (v1)
- Integrated with other consultant tools

**Migration Steps:**
1. Keep existing Figma-Context-MCP config
2. Add mcp-consultant-tools to MCP config
3. Test both servers work
4. Gradually switch to unified server
5. Remove Figma-Context-MCP when confident

---

# Success Criteria

## Phase 1 Complete When:
- [ ] All files ported and building successfully
- [ ] `get-figma-data` tool works with real Figma files
- [ ] Error handling provides clear troubleshooting steps
- [ ] Documentation complete and accurate
- [ ] Integration tested in Claude Desktop
- [ ] No regression in existing PowerPlatform/AzureDevOps tools

## Phase 2 Complete When:
- [ ] Sharp dependency installed and working
- [ ] Image downloads work for PNG and SVG
- [ ] Crop transforms applied correctly
- [ ] CSS variables generated properly
- [ ] Performance acceptable for large image batches
- [ ] Documentation updated with image examples

---

# Resources

## Documentation Links
- **Figma API Docs:** https://www.figma.com/developers/api
- **Figma REST API Spec:** https://github.com/figma/rest-api-spec
- **MCP SDK Docs:** https://github.com/modelcontextprotocol/sdk
- **Sharp Docs:** https://sharp.pixelplumbing.com/

## Support
- **Figma API Support:** https://forum.figma.com/
- **MCP Discord:** https://discord.gg/modelcontext
- **Issues:** File in mcp-consultant-tools repo

---

# Appendix

## Example Figma File Keys

**Format:** Alphanumeric string from URL
```
URL: https://www.figma.com/file/ABC123xyz/My-Design-File
File Key: ABC123xyz
```

## Example Node IDs

**Format:** `[number]:[number]`
```
Single node: "1:10"
Multiple nodes: "1:10;2:20;3:30"
```

## Example Simplified Output

```json
{
  "metadata": {
    "name": "My Design System"
  },
  "nodes": [
    {
      "id": "1:10",
      "name": "Button",
      "type": "FRAME",
      "text": "Click Me",
      "textStyle": "text_abc123",
      "fills": "fill_def456",
      "layout": "layout_ghi789",
      "children": []
    }
  ],
  "components": {
    "comp_1": {
      "name": "Button/Primary",
      "description": "Primary action button"
    }
  },
  "componentSets": {},
  "globalVars": {
    "styles": {
      "text_abc123": {
        "fontFamily": "Inter",
        "fontSize": 16,
        "fontWeight": 600
      },
      "fill_def456": {
        "type": "SOLID",
        "color": "#0066FF"
      },
      "layout_ghi789": {
        "x": 0,
        "y": 0,
        "width": 120,
        "height": 40
      }
    }
  }
}
```

---

# Quick Reference

## Sanitization Commands (Run After Porting)

**Search for original creator references:**
```bash
cd /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools

# Search for author tags
grep -r "@author" src/figma/

# Search for original project names
grep -r "Framelink" src/figma/
grep -r "figma-context-mcp" src/figma/
grep -r "figma-developer-mcp" src/figma/

# Search for copyright notices
grep -r "copyright" src/figma/ -i

# Search for attribution
grep -r "Created by" src/figma/

# Search for original repo URLs
grep -r "github.com" src/figma/

# Search for npm package references
grep -r "npx" src/figma/
```

**If any matches found, clean them manually following Step 2.6 guidelines.**

## License Compliance Commands

**Check Figma-Context-MCP license:**
```bash
cat /Users/klemensstelk/Repo/github-klemensms/Figma-Context-MCP/LICENSE
cat /Users/klemensstelk/Repo/github-klemensms/Figma-Context-MCP/package.json | grep '"license"'
```

**Check mcp-consultant-tools license:**
```bash
cat /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools/LICENSE
```

## Build & Test Commands

**Full build and test sequence:**
```bash
cd /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools

# Install dependencies
npm install

# Clean build
rm -rf build/
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node build/index.js

# Test API authentication
curl -H "X-Figma-Token: YOUR_KEY" https://api.figma.com/v1/me
```

---

# Version History

- **v1.0** - Initial implementation plan (Phase 1)
- **v1.1** - Added original creator reference removal steps
- **v1.2** - Added license compliance verification
- **v2.0** - Image download features (Phase 2 - future)

---

**Document Status:** Ready for Implementation
**Last Updated:** 2025-11-04
**Updated By:** Claude Code
**Review Status:** Updated per user request - includes sanitization and license compliance steps
**Next Action:** Verify license compliance, then proceed with implementation
