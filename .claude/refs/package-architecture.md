# Scope: Canonical Service-Tool-Prompt layering for `packages/*` — file structure, naming conventions, ServiceContext pattern, tool organization, file-size limits, and the MCP stdio rule. Load when scaffolding a new package, refactoring an existing one, or auditing an unfamiliar package against the standard.

## Service-Tool-Prompt Pattern (v28+)

Every package follows a layered architecture with standardized directory structure:

**Layers:**
1. **Client** (`{name}-client.ts`) - HTTP/SDK authentication and generic request methods
2. **Services** (`services/`) - Business logic, one class per domain, no MCP/CLI concerns
3. **Tools** (`tools/`) - Thin MCP tool wrappers calling service methods
3c. **CLI** (`cli/`) - Commander.js commands wrapping service methods
4. **Prompts** (`prompts/`) - MCP prompt templates and registration (if applicable)

## Canonical Package Structure

```
packages/{name}/src/
  index.ts                    # MCP server entry (~100-150 lines)
  {name}-client.ts            # Authenticated HTTP client
  types.ts                    # ServiceContext interface
  tool-examples.ts            # descWithExamples() helper + examples
  cli.ts                      # CLI entry point (Commander.js)
  context-factory.ts          # Shared createServiceContext() for MCP + CLI
  models/
    index.ts                  # Barrel export
    api-types.ts              # Shared response/request types
  services/
    index.ts                  # Barrel export
    {domain}-service.ts       # One service per domain (target <500 lines)
  tools/
    index.ts                  # registerAllTools() aggregator + barrel
    {domain}-tools.ts         # Tool registrations per domain
  prompts/                    # If package has prompts
    index.ts                  # registerAllPrompts() aggregator
    templates.ts              # Prompt template strings/formatters
  cli/
    output.ts                 # Package-specific output wrapper
    commands/
      index.ts                # registerAllCommands() aggregator
      {domain}-commands.ts    # CLI commands per domain
```

**Reference package:** `packages/azure-devops/` (most complete multi-service example). This reference file is itself the canonical package-architecture spec.

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `wiki-service.ts`, `wiki-tools.ts` |
| Service classes | `{Domain}Service` | `WikiService`, `BuildService` |
| Tool registration | `register{Domain}Tools(server, ctx)` | `registerWikiTools(server, ctx)` |
| Prompt registration | `register{Domain}Prompts(server, ctx)` | `registerAnalysisPrompts(server, ctx)` |
| MCP tool IDs | kebab-case verb-noun | `get-entity-metadata`, `export-solution` |
| Barrel files | `index.ts` in every subdirectory | Re-exports + `registerAllTools()` aggregator |

## ServiceContext + Entry Point Pattern

`types.ts` defines a readonly `ServiceContext` interface with one getter per domain service. `index.ts` builds it with lazy initialization (services constructed on first access via `??=`). `context-factory.ts` mirrors this for CLI use — keep them in sync.

`index.ts` structure: imports → `createServiceContext()` → `register{Package}Tools(server)` (backward-compat export for meta) → self-executing block (`if (import.meta.url === pathToFileURL(...).href)`) using `createMcpServer()` + `createEnvLoader()` from core.

See `packages/azure-devops/` for the canonical implementation.

## Tool Organization

Split by whatever grouping fits the API: domain (`wiki-tools.ts`, `work-item-tools.ts`), service (`blob-tools.ts`, `queue-tools.ts`), or entity (`metadata-tools.ts`, `flow-tools.ts`).

## Key Design Patterns

Lazy service init • ServiceContext DI shared across MCP+CLI • barrel exports with `registerAllTools()` aggregators • backward-compatible `register{Package}Tools(server)` export for meta • token caching until near expiration • stdout suppression (dotenv silenced for MCP protocol) • optional integrations.

## ⚠️ File Size Management

**Limits:** Files >500 lines need refactoring. Hard limit: 1,000 lines.

**STOP and propose refactoring if:**
- File >500 lines OR service has 10+ methods
- Code duplication across files

## ⚠️ MCP Protocol Requirements

**NEVER use `console.log()` or write to stdout!**

MCP uses stdio transport - any non-JSON stdout corrupts the protocol.

```typescript
console.log('...');    // ❌ FORBIDDEN - writes to stdout
console.error('...');  // ✅ OK - writes to stderr
console.warn('...');   // ✅ OK - writes to stderr
```
