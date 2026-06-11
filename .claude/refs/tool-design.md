# Scope: Tool-description and parameter-description best practices using `descWithExamples()`. Load when adding a new MCP tool or improving an existing tool whose LLM-call accuracy needs lifting (especially tools with complex query syntax, JSON/object params, or multiple modes).

## Why examples matter

Examples in tool descriptions materially improve LLM accuracy. The MCP SDK has no native `examples` field, so embed them in Zod `.describe()` via `descWithExamples()` from core.

## Pattern

Every package has `src/tool-examples.ts` re-exporting `descWithExamples` and defining domain-specific arrays:

```typescript
export { descWithExamples } from '@mcp-consultant-tools/core';

export const MY_EXAMPLES = [
  { label: "Common use case", value: "example value here" },
  { label: "Another pattern", value: "another example" },
];
```

```typescript
param: z.string().describe(descWithExamples("What it does", MY_EXAMPLES))
```

## Description guidelines

**Tool descriptions** (2nd arg to `server.tool()`) — 1–2 sentences, what it does (not how), include prerequisites like `requires FEATURE_FLAG=true`.

**Parameter descriptions** — explain purpose, list valid values/defaults, add examples for complex params (queries, JSON, enums, IDs).

## What makes a good example

- Real-world use cases
- 2–4 diverse scenarios
- Realistic values matching the param type
- Cover simple case, filtering/querying, and relationships
- Prioritize tools with complex query syntax (WIQL, OData), JSON/object params, or multiple modes

## New-tool checklist

- Clear description
- Parameter descriptions with valid values/defaults
- Examples for complex params via `descWithExamples()`
- All catch blocks return `isError: true`
- Matching CLI command in `cli/commands/{domain}-commands.ts`
