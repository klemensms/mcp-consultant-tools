# Figma Integration Documentation

**📦 Package:** `@mcp-consultant-tools/figma`
**🎨 Design Tool:** Design-to-code workflow integration

Complete guide to using the Figma integration with MCP Consultant Tools.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Just replace the placeholder values with your actual credentials:

#### For VS Code

Add this to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/figma", "mcp-figma"],
      "env": {
        // Required (choose ONE option)
        // Option 1: Personal Access Token (recommended)
        "FIGMA_API_KEY": "your-personal-access-token",
        // Option 2: OAuth token
        // "FIGMA_OAUTH_TOKEN": "your-oauth-token",

        // Optional (defaults shown)
        "FIGMA_USE_OAUTH": "false"
      }
    }
  }
}
```

#### For Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/figma", "mcp-figma"],
      "env": {
        // Required (choose ONE option)
        // Option 1: Personal Access Token (recommended)
        "FIGMA_API_KEY": "your-personal-access-token",
        // Option 2: OAuth token
        // "FIGMA_OAUTH_TOKEN": "your-oauth-token",

        // Optional (defaults shown)
        "FIGMA_USE_OAUTH": "false"
      }
    }
  }
}
```

#### Test Your Setup

After configuring, test the connection by extracting design data:

```javascript
// Ask Claude: "Get design specifications from the Figma file ABC123xyz"
// Or extract specific components:
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 3
});
```

**Need credentials?** See the [Detailed Setup](#detailed-setup) section below for Personal Access Token generation instructions.

---

## 🎯 Key Features for Consultants

### Design Extraction Capabilities

This package provides **2 specialized tools** for extracting design specifications from Figma files in AI-friendly format. These tools are designed for design-to-code workflows, design system documentation, and design QA.

#### Design Data Extraction Tools

1. **`get-figma-data`** 🔥 **CORE FEATURE** - Extract comprehensive design specifications with 0 prompts (direct tool access)
   - **Comprehensive Data Extraction**: Layout properties, text/typography, visual styles (fills, strokes, effects), component instances, component definitions
   - **AI-Friendly Output**: Simplified JSON format (not raw Figma API), automatic style deduplication, tree traversal with depth limiting
   - **Flexible Access**: Entire files or specific nodes, depth limiting for large files, PAT and OAuth support
   - **Design System Support**: Component metadata, property definitions, typography scales, color palettes, design tokens
   - Example: `"Extract all button components from the design system file"`
   - Example: `"Get layout and style information for node 1:10"`
   - **Use Cases**: Design-to-code workflows, design system documentation, component library extraction, design QA

2. **`download-figma-images`** - Download and process images from Figma (🚧 Coming in v2)
   - **Status**: Placeholder for future functionality
   - **Planned Features**: PNG/SVG downloads, batch processing, image optimization, local storage, base64 encoding

**Why design extraction is valuable for consultants:**
- **Zero prompts needed** - Direct tool access for maximum flexibility
- **Design-to-Code workflows** - Extract exact specifications for code generation (React, CSS, design tokens)
- **Design system documentation** - Auto-generate component library docs from Figma files
- **Design QA** - Verify consistency, identify design drift, validate against standards
- **Cross-team collaboration** - Bridge design and development with structured data

---

## Table of Contents

1. [Overview](#overview)
   - [What is Figma?](#what-is-figma)
   - [Why Use This Integration?](#why-use-this-integration)
   - [Key Features](#key-features)
2. [Detailed Setup](#detailed-setup)
   - [Prerequisites](#prerequisites)
   - [Authentication Methods](#authentication-methods)
   - [Personal Access Token (PAT)](#personal-access-token-pat)
   - [OAuth Authentication](#oauth-authentication)
   - [Environment Variables](#environment-variables)
   - [Configuration Examples](#configuration-examples)
3. [Tools](#tools)
   - [get-figma-data](#get-figma-data)
   - [download-figma-images](#download-figma-images)
4. [Usage Examples](#usage-examples)
   - [Extract Complete Design File](#extract-complete-design-file)
   - [Extract Specific Design Nodes](#extract-specific-design-nodes)
   - [Design System Documentation](#design-system-documentation)
   - [Design-to-Code Workflow](#design-to-code-workflow)
5. [Best Practices](#best-practices)
   - [Security](#security)
   - [Performance](#performance)
   - [File Organization](#file-organization)
   - [Integration Patterns](#integration-patterns)
6. [Troubleshooting](#troubleshooting)
   - [Common Errors](#common-errors)
   - [Authentication Issues](#authentication-issues)
   - [Rate Limiting](#rate-limiting)

---

## Overview

### What is Figma?

Figma is a collaborative web-based design and prototyping tool used by design teams to:
- Create UI/UX designs for web and mobile applications
- Build and maintain design systems with reusable components
- Prototype interactive user experiences
- Share design files with developers and stakeholders
- Maintain design consistency across products

### Why Use This Integration?

The Figma integration enables AI assistants to:
1. **Extract Design Data**: Get comprehensive design specifications from Figma files
2. **Document Design Systems**: Auto-generate documentation for component libraries
3. **Design-to-Code**: Extract layout, typography, and style information for code generation
4. **Design QA**: Verify consistency and identify design drift across files
5. **Cross-Team Collaboration**: Bridge design and development with structured data

**Primary Use Case**: Extract design data from Figma files in a simplified, AI-friendly format for design system documentation, design-to-code workflows, and design QA.

### Key Features

**Comprehensive Data Extraction:**
- Layout properties (position, size, constraints, auto-layout)
- Text content and typography (font family, size, weight, alignment)
- Visual styles (fills, strokes, effects, opacity, border radius)
- Component instances and properties
- Component definitions and component sets

**AI-Friendly Output:**
- Simplified JSON format (not raw Figma API format)
- Automatic style deduplication (global style dictionary)
- Tree traversal with depth limiting (prevents token overflow)
- Node filtering (fetch specific nodes instead of entire file)

**Flexible Access:**
- Fetch entire design files or specific nodes by ID
- Depth limiting for large files
- Support for PAT and OAuth authentication

**Design System Support:**
- Component metadata extraction
- Property definitions
- Typography scales
- Color palettes
- Design tokens

---

## Detailed Setup

### Prerequisites

Before using the Figma integration, ensure you have:
1. A Figma account (free or paid)
2. Access to the Figma files you want to query
3. Either a Personal Access Token (PAT) or OAuth credentials

### Authentication Methods

The Figma integration supports two authentication methods:

**Personal Access Token (PAT)** - Recommended for individual use
- ✅ Simple configuration
- ✅ No expiration (unless revoked)
- ✅ Full access to all files you can view
- ❌ Higher security risk if compromised

**OAuth Authentication** - Advanced for team deployments
- ✅ Better security (scoped access)
- ✅ Token refresh support
- ✅ Granular permissions
- ❌ More complex setup
- ❌ Requires OAuth application registration

### Personal Access Token (PAT)

**Recommended for most users.**

#### Step 1: Generate Personal Access Token

1. Go to https://www.figma.com/developers/api#authentication
2. Scroll to "Personal Access Tokens" section
3. Click "Get personal access token"
4. Log in to Figma if prompted
5. Click "Generate new token"
6. Enter a descriptive name (e.g., "MCP Consultant Tools")
7. Click "Generate token"
8. **Copy the token immediately** (you won't be able to see it again)
9. Store it securely (this is your `FIGMA_API_KEY`)

**Token Permissions:**
- Personal Access Tokens have full access to all files you can view in Figma
- They do not expire unless you manually revoke them
- Keep them secure and never commit them to version control

#### Step 2: Set Environment Variable

Set the `FIGMA_API_KEY` environment variable:

```bash
export FIGMA_API_KEY="figd_your_token_here"
```

**Security Note:** Figma tokens have full access to your files. Keep them secure. Don't commit them to version control. Rotate them regularly if used in team environments.

### OAuth Authentication

**Advanced option for team deployments.**

#### Step 1: Register OAuth Application

1. Go to https://www.figma.com/developers/apps
2. Click "Create new app"
3. Fill in app details:
   - App name: "MCP Consultant Tools"
   - App description: "AI assistant for design data extraction"
   - Redirect URI: Your callback URL
4. Note your Client ID and Client Secret

#### Step 2: Implement OAuth Flow

1. Direct users to Figma's OAuth authorization URL
2. Handle the callback with authorization code
3. Exchange code for access token
4. Store the access token

#### Step 3: Configure Environment Variables

```bash
export FIGMA_OAUTH_TOKEN="your_oauth_access_token"
export FIGMA_USE_OAUTH="true"
```

**OAuth Token Expiration:**
- OAuth access tokens expire after a set period
- Implement token refresh logic using refresh tokens
- See Figma's OAuth documentation for details

### Environment Variables

Configure these environment variables for Figma integration:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `FIGMA_API_KEY` | Yes (PAT) | Figma Personal Access Token | - |
| `FIGMA_OAUTH_TOKEN` | Yes (OAuth) | OAuth Bearer token | - |
| `FIGMA_USE_OAUTH` | No | Set to "true" if using OAuth | "false" |

**Authentication Method Selection:**
- When `FIGMA_USE_OAUTH` is `"false"` (default): Uses `FIGMA_API_KEY` for authentication
- When `FIGMA_USE_OAUTH` is `"true"`: Uses `FIGMA_OAUTH_TOKEN` for authentication

**Validation:**
The integration validates configuration on first use and throws an error if required variables are missing.

### Configuration Examples

#### Claude Desktop (macOS/Linux) - Published Package

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/figma", "mcp-figma"],
      "env": {
        "FIGMA_API_KEY": "figd_your_personal_access_token_here",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false"
      }
    }
  }
}
```

#### Claude Desktop - Local Development/Testing

For local testing with your development build:

```json
{
  "mcpServers": {
    "figma-local": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-consultant-tools/packages/figma/build/index.js"],
      "env": {
        "FIGMA_API_KEY": "figd_your_personal_access_token_here",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false"
      }
    }
  }
}
```

**Note:** Replace `/absolute/path/to/mcp-consultant-tools` with your actual repository path.

#### VS Code Extension

Edit `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/figma", "mcp-figma"],
      "env": {
        "FIGMA_API_KEY": "figd_your_personal_access_token_here",
        "FIGMA_OAUTH_TOKEN": "",
        "FIGMA_USE_OAUTH": "false"
      }
    }
  }
}
```

#### Local Development (.env file)

Create a `.env` file in the project root:

```bash
FIGMA_API_KEY="figd_your_personal_access_token_here"
FIGMA_OAUTH_TOKEN=""
FIGMA_USE_OAUTH="false"
```

**Security:** Never commit `.env` files to version control. Add `.env` to your `.gitignore`.

---

## Tools

The Figma integration provides 2 tools for design data extraction.

### get-figma-data

Get comprehensive Figma design data including layout, text, styles, and components.

**Purpose:**
Extract design specifications from Figma files in a simplified, AI-friendly JSON format. Automatically deduplicates styles and provides component metadata.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileKey` | string | Yes | Figma file key from URL (alphanumeric string) |
| `nodeId` | string | No | Specific node ID(s) to fetch (format: "1:10" or "1:10;2:20" for multiple) |
| `depth` | number | No | Tree traversal depth limit (prevents token overflow on large files) |
| `excludeStyles` | boolean | No | Remove all styling info (fills, strokes, effects, textStyle, opacity, borderRadius). Useful for architecture analysis. Default: true. Set to false for full styling. |
| `tablesToMarkdown` | boolean | No | Convert TABLE nodes to markdown format. Significantly reduces token usage. Default: true. Set to false for full node tree. |
| `simplifyConnectors` | boolean | No | Simplify CONNECTOR nodes to just endpoints (startNodeId, endNodeId, text). Default: true. Set to false for full connector data. |
| `simplifyComponentInstances` | boolean | No | Keep componentId and componentProperties but remove visual styling from INSTANCE nodes. Ideal for ADO User Story components. Default: true. Set to false for full instance data. |
| `extractors` | string[] | No | Override which extractors to use: "layout", "text", "visuals", "component". Default: all |

**Context Window Optimization:**
The new optimization parameters help reduce context window usage when working with large Figma files:

| Optimization | Estimated Reduction | Use Case |
|--------------|---------------------|----------|
| `excludeStyles: true` | 40-60% | Architecture analysis, understanding structure without visual details |
| `tablesToMarkdown: true` | 70-90% for TABLE nodes | Working with Figma tables, extracting tabular data |
| `simplifyConnectors: true` | 50-70% per CONNECTOR | Understanding relationships without visual properties |
| `simplifyComponentInstances: true` | 30-50% per INSTANCE | ADO User Story components, extracting component properties |
| Combined optimizations | Up to 80% | Architecture-focused analysis |

**File Key Extraction:**
From a Figma URL like `https://www.figma.com/file/ABC123xyz/MyDesignFile`, the file key is `ABC123xyz`.

**Node ID Format:**
- Single node: `"1:10"`
- Multiple nodes: `"1:10;2:20"` (semicolon-separated)
- Get node IDs from Figma by right-clicking a layer and selecting "Copy/Paste as" → "Copy link"

**Depth Limiting:**
- Use `depth` parameter to limit tree traversal for large files
- Example: `depth: 3` stops after 3 levels of nested frames
- Prevents token overflow on complex design files
- Recommended for files with many nested components

**Returns:**

```typescript
{
  metadata: {
    name: string;                    // File name
    lastModified: string;            // ISO 8601 timestamp
    version: string;                 // File version
    thumbnailUrl?: string;           // Preview image URL
  },
  nodes: SimplifiedNode[],           // Simplified node tree
  components: {                      // Component definitions
    [id: string]: {
      name: string;
      description: string;
      properties: ComponentProperty[];
    }
  },
  componentSets: {                   // Component sets (variants)
    [id: string]: {
      name: string;
      properties: ComponentSetProperty[];
    }
  },
  globalVars: {
    styles: {                        // Deduplicated style dictionary
      [id: string]: {
        fill?: string;               // Color value
        stroke?: string;             // Border color
        opacity?: number;            // Opacity (0-1)
        fontFamily?: string;         // Font family
        fontSize?: number;           // Font size
        fontWeight?: number;         // Font weight
        // ... more style properties
      }
    }
  }
}
```

**SimplifiedNode Structure:**

```typescript
{
  id: string;                        // Node ID (e.g., "1:10")
  name: string;                      // Layer name
  type: string;                      // Node type (FRAME, TEXT, COMPONENT, etc.)
  layout?: {                         // Layout properties
    x: number;                       // X position
    y: number;                       // Y position
    width: number;                   // Width
    height: number;                  // Height
    constraints?: {                  // Layout constraints
      horizontal: string;            // "LEFT", "RIGHT", "CENTER", "SCALE", etc.
      vertical: string;              // "TOP", "BOTTOM", "CENTER", "SCALE", etc.
    },
    layoutMode?: string;             // Auto-layout mode ("HORIZONTAL", "VERTICAL")
    padding?: {                      // Auto-layout padding
      top: number;
      right: number;
      bottom: number;
      left: number;
    },
    itemSpacing?: number;            // Auto-layout spacing
  },
  text?: {                           // Text properties (TEXT nodes only)
    content: string;                 // Text content
    fontSize?: number;               // Font size
    fontFamily?: string;             // Font family
    fontWeight?: number;             // Font weight (400, 700, etc.)
    textAlign?: string;              // Text alignment ("LEFT", "CENTER", "RIGHT")
    lineHeight?: number;             // Line height
    letterSpacing?: number;          // Letter spacing
  },
  visuals?: {                        // Visual properties
    fills?: Array<{                  // Fill styles
      type: string;                  // "SOLID", "GRADIENT", "IMAGE"
      color?: string;                // Color value (hex)
      opacity?: number;              // Opacity (0-1)
    }>,
    strokes?: Array<{                // Stroke styles
      type: string;
      color?: string;
      weight?: number;
    }>,
    effects?: Array<{                // Effects (shadows, blurs)
      type: string;                  // "DROP_SHADOW", "INNER_SHADOW", "BLUR"
      color?: string;
      offset?: { x: number; y: number };
      radius?: number;
    }>,
    opacity?: number;                // Layer opacity
    borderRadius?: number;           // Corner radius
  },
  component?: {                      // Component instance properties
    id: string;                      // Component ID
    name: string;                    // Component name
    properties?: {                   // Component property overrides
      [key: string]: any;
    }
  },
  children?: SimplifiedNode[];       // Child nodes (if any)
}
```

**Use Cases:**

1. **Design System Documentation**: Extract component definitions and properties
2. **Design-to-Code**: Get layout and style information for code generation
3. **Design QA**: Verify consistency and identify design drift
4. **Typography Extraction**: Document font scales and text styles
5. **Color Palette**: Extract color definitions and usage
6. **Spacing System**: Document padding, margin, and spacing patterns

**Example:**

```javascript
// Get entire design file with depth limiting
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 3
});

// Get specific nodes
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10;2:20"
});

// Get specific component definition
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10",
  depth: 1  // Only get the component itself, no children
});

// Default behavior: optimized output (all optimizations enabled)
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "30-544"
  // excludeStyles: true (default) - Removes fills, strokes, effects
  // tablesToMarkdown: true (default) - Converts tables to markdown
  // simplifyConnectors: true (default) - Keeps only connection endpoints
  // simplifyComponentInstances: true (default) - Keeps componentProperties only
});

// Get full styling data (disable optimizations)
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "30-544",
  excludeStyles: false,  // Include all fills, strokes, effects
  simplifyConnectors: false,  // Include full connector visual data
  simplifyComponentInstances: false  // Include full INSTANCE styling
});

// Content-focused extraction (text and components only)
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  extractors: ["text", "component"]  // Only extract text and component data
});
```

**Output Format:**
The tool returns AI-friendly simplified JSON, **not** the raw Figma API format. Style objects are automatically deduplicated and stored in `globalVars.styles` with reference IDs.

**Performance Considerations:**
- Large files (100+ components) may take several seconds to process
- Use `depth` parameter to limit tree traversal for faster responses
- Fetch specific nodes instead of entire file when possible
- Figma API has rate limits (varies by plan)

---

### download-figma-images

Download and process images from Figma designs.

**Status:** 🚧 Coming in v2

**Purpose:**
This is a placeholder tool for future image download functionality. It will support downloading node images as PNG/SVG with optional image processing.

**Planned Features:**
- Download node images as PNG or SVG format
- Batch image downloads (multiple nodes at once)
- Image processing with Sharp library:
  - Resize and crop images
  - Convert formats
  - Optimize file sizes
  - Generate thumbnails
- Local file system storage
- Base64 encoding for inline embedding

**Planned Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileKey` | string | Yes | Figma file key from URL |
| `nodeIds` | string[] | Yes | Array of node IDs to download |
| `format` | string | No | Image format ("png" or "svg") |
| `scale` | number | No | Image scale factor (1x, 2x, 3x) |
| `localPath` | string | No | Local path to save images |

**Planned Returns:**

```typescript
{
  images: Array<{
    nodeId: string;
    url: string;              // Download URL
    format: string;           // "png" or "svg"
    width: number;
    height: number;
    localPath?: string;       // Local file path (if saved)
    base64?: string;          // Base64-encoded data (if requested)
  }>;
  errors?: Array<{
    nodeId: string;
    error: string;
  }>;
}
```

**Why Not Available Yet:**
- Image processing adds significant dependencies (Sharp library)
- Requires file system access and path management
- Needs thorough testing for security and performance
- Will be added in v2 based on user demand

**Workaround:**
Until this tool is available, you can:
1. Use Figma's REST API directly to get image URLs
2. Use Figma's export functionality in the UI
3. Use third-party Figma plugins for bulk image export

---

## Usage Examples

### Extract Complete Design File

**Scenario:** Extract all design data from a Figma file for documentation.

**Natural Language Request:**
```
User: "Get all design specifications from the Mobile App Design System file"
```

**AI Assistant Actions:**
```javascript
// Fetch entire Figma design file
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 3  // Limit depth for large files
});
```

**Output:**
```json
{
  "metadata": {
    "name": "Mobile App Design System",
    "lastModified": "2024-01-15T10:30:00Z",
    "version": "1.2.5"
  },
  "nodes": [
    {
      "id": "1:10",
      "name": "Button/Primary",
      "type": "COMPONENT",
      "layout": {
        "width": 120,
        "height": 40,
        "x": 100,
        "y": 200
      },
      "text": {
        "content": "Click me",
        "fontSize": 16,
        "fontFamily": "Inter",
        "fontWeight": 600,
        "textAlign": "CENTER"
      },
      "visuals": {
        "fills": [{
          "type": "SOLID",
          "color": "#0066FF",
          "opacity": 1
        }],
        "borderRadius": 8
      }
    },
    {
      "id": "2:20",
      "name": "Card/Default",
      "type": "COMPONENT",
      "layout": {
        "width": 320,
        "height": 240,
        "layoutMode": "VERTICAL",
        "padding": {
          "top": 16,
          "right": 16,
          "bottom": 16,
          "left": 16
        },
        "itemSpacing": 12
      },
      "visuals": {
        "fills": [{
          "type": "SOLID",
          "color": "#FFFFFF",
          "opacity": 1
        }],
        "effects": [{
          "type": "DROP_SHADOW",
          "color": "rgba(0, 0, 0, 0.1)",
          "offset": { "x": 0, "y": 2 },
          "radius": 8
        }],
        "borderRadius": 12
      },
      "children": [
        {
          "id": "2:21",
          "name": "Title",
          "type": "TEXT",
          "text": {
            "content": "Card Title",
            "fontSize": 18,
            "fontFamily": "Inter",
            "fontWeight": 700
          }
        },
        {
          "id": "2:22",
          "name": "Description",
          "type": "TEXT",
          "text": {
            "content": "Card description text goes here",
            "fontSize": 14,
            "fontFamily": "Inter",
            "fontWeight": 400,
            "lineHeight": 1.5
          }
        }
      ]
    }
  ],
  "components": {
    "1:10": {
      "name": "Button/Primary",
      "description": "Primary action button",
      "properties": [
        {
          "name": "State",
          "type": "VARIANT",
          "values": ["Default", "Hover", "Pressed", "Disabled"]
        },
        {
          "name": "Size",
          "type": "VARIANT",
          "values": ["Small", "Medium", "Large"]
        }
      ]
    }
  },
  "globalVars": {
    "styles": {
      "style_1": {
        "fill": "#0066FF",
        "opacity": 1
      },
      "style_2": {
        "fill": "#FFFFFF",
        "opacity": 1
      },
      "style_3": {
        "fontFamily": "Inter",
        "fontSize": 16,
        "fontWeight": 600
      }
    }
  }
}
```

**AI Analysis:**
"The design system contains 2 components: a Primary Button and a Default Card. The Button uses Inter font (16px, weight 600) with blue fill (#0066FF) and rounded corners (8px radius). The Card uses vertical auto-layout with 16px padding, 12px spacing between children, and a subtle drop shadow. Both components follow a consistent design language with Inter typography and defined spacing system."

---

### Extract Specific Design Nodes

**Scenario:** Extract only specific components from a large design file.

**Natural Language Request:**
```
User: "Get the specifications for the Button and Card components"
```

**AI Assistant Actions:**
```javascript
// Fetch specific nodes by ID
await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10;2:20"  // Multiple nodes separated by semicolon
});
```

**Result:**
Returns only the requested nodes (`1:10` and `2:20`) with their complete structure, skipping all other nodes in the file.

**Benefits:**
- Faster response times (no need to traverse entire file)
- Lower API usage
- Reduced token consumption
- Focused data extraction

---

### Design System Documentation

**Scenario:** Auto-generate documentation for a design system.

**Workflow:**

1. **Extract Design Data:**
```javascript
const designData = await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  depth: 2  // Get components and their immediate children
});
```

2. **AI Generates Documentation:**

```markdown
# Design System Documentation

## Components

### Button/Primary
**Purpose:** Primary action button for main user actions

**Specifications:**
- Size: 120px × 40px
- Typography: Inter, 16px, Weight 600
- Background: #0066FF
- Border Radius: 8px
- States: Default, Hover, Pressed, Disabled

**Usage:**
Use for primary calls-to-action like "Save", "Submit", "Continue"

### Card/Default
**Purpose:** Container for grouped content

**Specifications:**
- Dimensions: 320px × 240px
- Layout: Vertical auto-layout
- Padding: 16px all sides
- Item Spacing: 12px
- Background: #FFFFFF
- Shadow: 0px 2px 8px rgba(0,0,0,0.1)
- Border Radius: 12px

**Content Structure:**
- Title: Inter, 18px, Weight 700
- Description: Inter, 14px, Weight 400, Line Height 1.5

## Typography Scale

| Style | Font | Size | Weight | Use Case |
|-------|------|------|--------|----------|
| Heading 1 | Inter | 18px | 700 | Card titles, section headers |
| Body | Inter | 14px | 400 | Descriptions, body text |
| Button | Inter | 16px | 600 | Button labels |

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Blue | #0066FF | Primary buttons, links |
| White | #FFFFFF | Backgrounds, light surfaces |
```

3. **Keep Documentation in Sync:**
Re-run extraction periodically to detect design changes and update documentation automatically.

---

### Design-to-Code Workflow

**Scenario:** Generate code from Figma designs.

**Workflow:**

1. **Extract Component Specs:**
```javascript
const buttonData = await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10",  // Button component
  depth: 1
});
```

2. **AI Generates React Component:**

```typescript
import React from 'react';
import styled from 'styled-components';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

const StyledButton = styled.button`
  /* Layout */
  width: 120px;
  height: 40px;

  /* Typography */
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  font-weight: 600;
  text-align: center;

  /* Visual */
  background-color: #0066FF;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s;

  /* States */
  &:hover {
    opacity: 0.9;
  }

  &:active {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Button: React.FC<ButtonProps> = ({ children, onClick, disabled }) => {
  return (
    <StyledButton onClick={onClick} disabled={disabled}>
      {children}
    </StyledButton>
  );
};
```

3. **AI Generates CSS:**

```css
/* Button - Primary */
.button-primary {
  /* Layout */
  width: 120px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  /* Typography */
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  font-weight: 600;

  /* Visual */
  background-color: #0066FF;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.button-primary:hover {
  opacity: 0.9;
}

.button-primary:active {
  opacity: 0.8;
}

.button-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Benefits:**
- Accurate design implementation
- Consistent spacing and typography
- Reduced design-to-code handoff time
- Automatic design token extraction

---

## Best Practices

### Security

**Token Management:**
- ✅ Store tokens in environment variables, never in code
- ✅ Use `.env` files for local development (add to `.gitignore`)
- ✅ Rotate tokens regularly (every 90 days recommended)
- ✅ Use separate tokens for development and production
- ✅ Revoke tokens immediately if compromised
- ❌ Never commit tokens to version control
- ❌ Never share tokens in chat/email
- ❌ Never log tokens in application logs

**OAuth Security (for team deployments):**
- Use OAuth instead of PAT for better security
- Implement token refresh logic
- Store refresh tokens securely (encrypted)
- Use short-lived access tokens (1-hour expiry)
- Implement proper PKCE flow for web apps

**File Access Control:**
- Only grant access to files that are needed
- Use Figma's team/project permissions to restrict access
- Regularly audit file access and remove unused tokens
- Use read-only access when write access is not needed

### Performance

**Optimize Data Extraction:**
- ✅ Use `depth` parameter to limit tree traversal on large files
- ✅ Fetch specific nodes instead of entire file when possible
- ✅ Cache extracted design data to reduce API calls
- ✅ Use shallow depth for initial overview, deep dive later
- ❌ Avoid fetching entire file repeatedly
- ❌ Don't traverse deeply nested component trees unnecessarily

**Rate Limiting:**
- Figma API has rate limits (varies by plan)
- Free tier: ~100 requests per minute
- Professional/Enterprise: Higher limits
- Implement exponential backoff for retries
- Cache responses to reduce API calls

**Token Optimization:**
- Large design files can generate 10,000+ tokens in output
- Use `depth` parameter to control output size
- Fetch specific nodes to reduce response size
- Consider pagination for very large component libraries

### File Organization

**Design File Structure:**
Organize Figma files for easier data extraction:

```
Design System File
├── 📂 Components
│   ├── 🔵 Buttons
│   ├── 🔵 Cards
│   ├── 🔵 Forms
│   └── 🔵 Navigation
├── 📂 Foundations
│   ├── 🎨 Colors
│   ├── 📝 Typography
│   └── 📐 Spacing
└── 📂 Pages
    ├── 🖼️ Home
    ├── 🖼️ Dashboard
    └── 🖼️ Settings
```

**Component Naming:**
Use consistent naming conventions:
- `Button/Primary` instead of `btn-primary-1`
- `Card/Default` instead of `card_v2_final`
- Group variants: `Button/Primary`, `Button/Secondary`, `Button/Tertiary`

**File Keys:**
- Create documentation mapping file keys to file names
- Use environment variables for frequently used files
- Maintain a registry of design system file keys

### Integration Patterns

**Cross-Service Integration:**

Combine Figma with other integrations for complete workflows:

**Design + Development:**
```javascript
// 1. Extract design specs from Figma
const buttonSpec = await mcpClient.invoke("get-figma-data", {
  fileKey: "ABC123xyz",
  nodeId: "1:10"
});

// 2. Generate code based on specs
// ... AI generates React component code ...

// 3. Create work item in Azure DevOps
await mcpClient.invoke("create-work-item", {
  project: "MyProject",
  workItemType: "User Story",
  fields: {
    "System.Title": "Implement Button component from design",
    "System.Description": `Specs: ${JSON.stringify(buttonSpec)}`
  }
});

// 4. Commit generated code to GitHub
// ... (using external git commands or GitHub API) ...
```

**Design System Maintenance:**
```javascript
// 1. Extract current design system
const currentDesign = await mcpClient.invoke("get-figma-data", {
  fileKey: "DESIGN_SYSTEM_KEY"
});

// 2. Store in database for version tracking
// ... (using Azure SQL or other database) ...

// 3. Compare with previous version
// ... AI analyzes changes and generates changelog ...

// 4. Update documentation in Azure DevOps Wiki
await mcpClient.invoke("update-wiki-page", {
  project: "Design",
  wikiId: "Design.wiki",
  pagePath: "/Design-System/Changelog",
  content: changelogMarkdown
});
```

---

## Troubleshooting

### Common Errors

#### Error: "Missing required Figma configuration"

**Cause:** Missing or invalid environment variables.

**Solution:**
1. Check that `FIGMA_API_KEY` is set (if using PAT)
2. Check that `FIGMA_OAUTH_TOKEN` is set (if using OAuth)
3. Verify `FIGMA_USE_OAUTH` is set correctly ("true" or "false")
4. Ensure no typos in variable names (case-sensitive)

**Verification:**
```bash
# Check environment variables (don't run this in production!)
echo $FIGMA_API_KEY
echo $FIGMA_USE_OAUTH
```

---

#### Error: "404 - File not found"

**Cause:** Invalid file key or insufficient permissions.

**Solution:**
1. **Verify file key:** Copy from URL: `https://www.figma.com/file/ABC123xyz/...` → `ABC123xyz`
2. **Check file access:** Ensure you can view the file in Figma web app
3. **Verify token permissions:** PAT should have access to the file
4. **Check file status:** File may have been deleted or moved

**File Key Format:**
- ✅ Correct: `ABC123xyz` (alphanumeric only)
- ❌ Wrong: `https://www.figma.com/file/ABC123xyz` (full URL)
- ❌ Wrong: `ABC123xyz/MyFile` (includes file name)

---

#### Error: "Invalid node ID"

**Cause:** Incorrect node ID format or non-existent node.

**Solution:**
1. **Get node ID from Figma:**
   - Right-click layer in Figma
   - Select "Copy/Paste as" → "Copy link"
   - Extract node ID from URL: `?node-id=1%3A10` → `1:10`
2. **Format multiple nodes:** Use semicolon separator: `"1:10;2:20"`
3. **Verify node exists:** Check that the node hasn't been deleted

**Node ID Format:**
- ✅ Correct: `"1:10"` (single node)
- ✅ Correct: `"1:10;2:20"` (multiple nodes)
- ❌ Wrong: `"1-10"` (dash instead of colon)
- ❌ Wrong: `"1:10,2:20"` (comma instead of semicolon)

---

#### Error: "Response too large"

**Cause:** Design file is too large, exceeding token limits.

**Solution:**
1. **Use depth limiting:** Add `depth` parameter to limit tree traversal
   ```javascript
   await mcpClient.invoke("get-figma-data", {
     fileKey: "ABC123xyz",
     depth: 2  // Limit to 2 levels deep
   });
   ```
2. **Fetch specific nodes:** Instead of entire file, fetch only needed nodes
   ```javascript
   await mcpClient.invoke("get-figma-data", {
     fileKey: "ABC123xyz",
     nodeId: "1:10;2:20"  // Only these nodes
   });
   ```
3. **Split into multiple requests:** Fetch different sections separately
4. **Simplify design file:** Remove unused components or split into multiple files

**Depth Guidelines:**
- `depth: 1` - Component level only (no children)
- `depth: 2` - Component + immediate children
- `depth: 3` - Suitable for most design systems
- `depth: 5+` - May cause token overflow on large files

---

### Authentication Issues

#### Personal Access Token Not Working

**Symptoms:**
- "401 Unauthorized" errors
- "Invalid token" errors
- Authentication failures

**Troubleshooting Steps:**

1. **Verify token format:**
   - Figma PATs typically start with `figd_`
   - Should be a long alphanumeric string
   - No spaces or newlines

2. **Check token status:**
   - Go to Figma account settings
   - Navigate to "Personal access tokens"
   - Verify token is not revoked
   - Check token creation date (may have been rotated)

3. **Regenerate token if needed:**
   - Delete old token in Figma
   - Generate new token
   - Update `FIGMA_API_KEY` environment variable
   - Restart MCP server

4. **Verify token permissions:**
   - PATs have full access to files you can view
   - If you can't view the file in Figma, token won't work
   - Ask file owner to share the file with you

**Common Mistakes:**
- ❌ Copying token with extra spaces
- ❌ Using expired or revoked token
- ❌ Setting wrong environment variable name
- ❌ Using OAuth token in `FIGMA_API_KEY` (should be in `FIGMA_OAUTH_TOKEN`)

---

#### OAuth Token Expired

**Symptoms:**
- "401 Unauthorized" after token was working
- "Token expired" errors
- Authentication failures after several hours

**Solution:**

1. **Implement token refresh:**
   - OAuth access tokens expire (typically 1 hour)
   - Use refresh token to get new access token
   - Update `FIGMA_OAUTH_TOKEN` with new token
   - Restart MCP server

2. **Check token expiration:**
   - Decode JWT token to check `exp` claim
   - Implement automatic refresh before expiration
   - See Figma OAuth documentation for refresh flow

3. **Use PAT instead (simpler):**
   - If OAuth is too complex, switch to Personal Access Token
   - Set `FIGMA_USE_OAUTH="false"`
   - Set `FIGMA_API_KEY` instead of `FIGMA_OAUTH_TOKEN`

---

### Rate Limiting

#### Error: "429 Too Many Requests"

**Cause:** Exceeded Figma API rate limits.

**Solution:**

1. **Check rate limits:**
   - Free tier: ~100 requests per minute
   - Professional: Higher limits
   - Enterprise: Custom limits

2. **Implement rate limiting:**
   ```javascript
   // Add delay between requests
   await sleep(1000);  // Wait 1 second between calls
   ```

3. **Cache responses:**
   - Store extracted design data
   - Reuse cached data instead of re-fetching
   - Invalidate cache when design updates

4. **Use batch operations:**
   - Fetch multiple nodes in single request: `nodeId: "1:10;2:20;3:30"`
   - Reduces total API calls

5. **Retry with exponential backoff:**
   - Wait and retry after rate limit error
   - Increase wait time with each retry
   - Check `Retry-After` header in response

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets

---

#### Slow Response Times

**Cause:** Large files or complex designs.

**Solution:**

1. **Use depth limiting:**
   ```javascript
   await mcpClient.invoke("get-figma-data", {
     fileKey: "ABC123xyz",
     depth: 2  // Faster than unlimited depth
   });
   ```

2. **Fetch specific nodes:**
   - Don't fetch entire file if only need specific components
   - Use `nodeId` parameter for targeted extraction

3. **Check file size:**
   - Files with 100+ components may be slow
   - Consider splitting large files
   - Remove unused components

4. **Network latency:**
   - Check network connection
   - Figma API may be slow during peak hours
   - Consider caching for frequently accessed files

5. **Use async patterns:**
   - Don't block on Figma API calls
   - Fetch data asynchronously
   - Show loading indicators to users

---

**For additional help:**
- Figma API Documentation: https://www.figma.com/developers/api
- Figma Community Forum: https://forum.figma.com/
- GitHub Issues: https://github.com/anthropics/mcp-consultant-tools/issues

---
