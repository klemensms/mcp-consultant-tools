# MCP Apps Quick Start — Agent Guide

## TL;DR (for humans)

This document tells a Claude agent how to add **interactive UI views** (charts, tables, cards) to an MCP server so they render inline in Claude Desktop instead of plain JSON. Give this file to an agent and point it at your MCP server codebase.

MCP Apps is an extension to the MCP protocol. The server returns an HTML app alongside tool results. Claude Desktop renders it in an iframe. The agent (Claude) still sees the JSON text — the UI is for the human.

**Prerequisites:** Your MCP server must use `@modelcontextprotocol/sdk`. The UI only renders in Claude Desktop (not Claude Code CLI).

---

## 1. Install Dependencies

```bash
npm install @modelcontextprotocol/ext-apps vite vite-plugin-singlefile
```

## 2. Create the UI App

You're building a small client-side web app that receives tool results via `postMessage` and renders them.

### Directory structure

```
src/ui/
  my-app.html          # Entry point
  src/
    main.ts            # App logic — receives data, picks views
    views/
      list-view.ts     # Renders arrays/tables
      card-view.ts     # Renders single items
```

### Entry HTML (`src/ui/my-app.html`)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family-sans, system-ui, sans-serif);
      background: var(--color-background-primary, #fff);
      color: var(--color-text-primary, #1a1a1a);
      padding: 16px;
    }
  </style>
</head>
<body>
  <div id="app"><p>Loading...</p></div>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
```

### Main app (`src/ui/src/main.ts`)

```typescript
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";

const appEl = document.getElementById("app")!;
const app = new App({ name: "My App", version: "1.0.0" });

app.ontoolresult = (result: any) => {
  const data = result.structuredContent;
  if (!data) {
    // Fallback for tools without structuredContent
    const text = result.content?.find((c: any) => c.type === "text")?.text;
    appEl.innerHTML = `<pre>${text ?? "No data"}</pre>`;
    return;
  }

  // Switch on your data type tag
  if (data.type === "my-list") {
    renderMyList(appEl, data.items);
  } else if (data.type === "my-detail") {
    renderMyDetail(appEl, data.item);
  }
};

// Theme support — host sends CSS variables
app.onhostcontextchanged = (ctx: any) => {
  // Claude Desktop sends color/font vars; they're applied automatically via CSS vars
};

app.onteardown = async () => ({});
await app.connect(new PostMessageTransport());
```

### Key concept

Your views are just functions that take an `HTMLElement` container and data, then set `container.innerHTML`. Use template literals. Nothing fancy needed.

## 3. Build Config

### Vite config (`ui-vite.config.ts` at package root)

```typescript
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "src/ui",
  plugins: [viteSingleFile()],
  build: {
    outDir: "../../build/ui",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/ui/my-app.html",
    },
  },
});
```

`vite-plugin-singlefile` inlines all JS/CSS into a single HTML file. This is required — MCP Apps serves the HTML as a single resource.

### TypeScript config (`tsconfig.ui.json` at package root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/ui/**/*"]
}
```

### Build script (in `package.json`)

```json
{
  "scripts": {
    "build": "tsc && vite build --config ui-vite.config.ts"
  }
}
```

The `tsc` step compiles your server code. The `vite build` step bundles the UI.

## 4. Server-Side Wiring

### Register the UI resource (`index.ts`)

```typescript
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";

function registerUiResources(server: any): void {
  const uri = "ui://my-app/main";
  const htmlPath = path.join(import.meta.dirname, "ui", "my-app.html");

  registerAppResource(server, uri, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await fs.readFile(htmlPath, "utf-8") }],
  }));
}
```

Call `registerUiResources(server)` during server setup. The server must declare `resources: {}` in its capabilities.

### Register tools with `registerAppTool`

Replace `server.tool()` with `registerAppTool()` for tools that should render in the UI:

```typescript
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

registerAppTool(server, "my-tool", {
  title: "My Tool",
  description: "Does something useful",
  inputSchema: {
    id: z.string().describe("The item ID"),
  },
  _meta: { ui: { resourceUri: "ui://my-app/main" } },  // Links tool → UI
}, async ({ id }) => {
  const result = await doSomething(id);
  return {
    // Text content — what the LLM sees (always include this)
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    // Structured content — what the UI app receives via ontoolresult
    structuredContent: { type: "my-detail", item: result },
  };
});
```

### Critical: always return both `content` and `structuredContent`

- `content` is the fallback for clients that don't support MCP Apps (including Claude Code CLI)
- `structuredContent` is what your UI app receives — design your own schema, the UI switches on it

## 5. Gotchas We Hit

1. **Data format mismatch.** If your service returns data in different shapes (e.g., a "summary" mode with flat fields vs. a "full" mode with nested fields), your UI must handle both. Don't assume one format.

2. **The UI is static.** You can't generate HTML at runtime on the server. The HTML app is a pre-built bundle served as a resource. All rendering logic lives in the client-side TypeScript.

3. **SVG clipping.** If you render SVG charts, make sure the viewBox has enough padding for stroke widths. A circle with `radius=80` and `strokeWidth=30` extends to `95px` — your viewBox must accommodate that.

4. **Color maps.** If you categorize data by status/state/type, have a fallback for unknown values. Hash the string to generate a deterministic hue so unknowns don't all render as the same grey.

5. **The LLM can't see the UI.** Claude receives the `content` text, not the rendered HTML. It may describe the result as "plain JSON" even though the human sees a chart. This is expected.

## 6. Reference Implementation

See `packages/azure-devops/` in this repo:

| File | What it does |
|------|-------------|
| `src/index.ts` | Registers UI resource + tools |
| `src/tools/work-item-tools.ts` | `registerAppTool()` usage with `structuredContent` |
| `src/ui/work-items-app.html` | Entry HTML |
| `src/ui/src/main.ts` | App logic — routes data to views |
| `src/ui/src/views/list-view.ts` | Table + donut chart |
| `src/ui/src/views/card-view.ts` | Detail card |
| `src/ui/src/chart.ts` | SVG donut chart renderer |
| `src/ui/src/theme.ts` | Host theme application |
| `ui-vite.config.ts` | Vite build config |
| `tsconfig.ui.json` | UI TypeScript config |

## 7. Docs

- MCP Apps spec: `modelcontextprotocol.io/docs/extensions/apps`
- ext-apps SDK: `modelcontextprotocol.github.io/ext-apps`
- Claude MCP Apps docs: `claude.com/docs/connectors/building/mcp-apps`
