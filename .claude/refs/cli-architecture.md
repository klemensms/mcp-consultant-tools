# Scope: CLI architecture, MCP↔CLI parity rules, parameter-mapping conventions, core helpers, and verification commands. Load when adding/renaming/removing a CLI command, scaffolding a CLI for a new package, or troubleshooting a CLI that diverges from its MCP counterpart.

## Running a CLI

```bash
# Via npx
npx --package=@mcp-consultant-tools/azure-devops mcp-ado-cli wiki list MyProject

# Global options
mcp-ado-cli --json wiki list MyProject    # Raw JSON output
mcp-ado-cli --no-cache wiki list MyProject # Skip cache
mcp-ado-cli --env-file .env.prod wiki list MyProject # Custom env file
```

## CLI Architecture

Each package follows this pattern:
- `context-factory.ts` - Shared `createServiceContext()` (used by both MCP and CLI)
- `cli.ts` - Entry point with Commander.js program
- `cli/output.ts` - Package-specific output wrapper (sets cache dir)
- `cli/commands/{domain}-commands.ts` - One file per tool domain
- Output: Summary to stdout + JSON cached to `.context/.mcp-{abbrev}-cache/`

## Adding a CLI Command

```typescript
// In cli/commands/{domain}-commands.ts
export function registerDomainCommands(program: any, ctx: ServiceContext): void {
  const domain = program.command('domain').description('Domain operations');
  domain
    .command('action <requiredArg>')
    .option('--optional-flag <value>', 'Description')
    .action(async (requiredArg: any, opts: any) => {
      try {
        const result = await ctx.service.doAction(requiredArg, opts.optionalFlag);
        outputResult({ fileName: `action-${requiredArg}`, data: result, summary: `Done` }, getGlobalFlags(program));
      } catch (error) { handleCliError(error, 'action'); }
    });
}
```

## CLI Maintenance Strategy — every MCP tool has a matching CLI command

CLI is a first-class citizen alongside MCP tools. Maintaining parity is non-negotiable.

| MCP Change | CLI Action |
|------------|-----------|
| New tool / renamed / removed | Add/rename/remove command in `cli/commands/{domain}-commands.ts` (keep old as alias if already published) |
| Tool params changed | Update command arguments/options to match |
| New domain | Create `cli/commands/{domain}-commands.ts` + register in `cli/commands/index.ts` |
| New package | Create full CLI scaffold: `cli.ts`, `context-factory.ts`, `cli/output.ts`, `cli/commands/` |

## Architectural Principles

- **Services are the single source of truth.** MCP tools and CLI commands both call the same service methods. Never duplicate business logic in CLI.
- **`context-factory.ts` mirrors `index.ts`.** Every getter added to `createServiceContext()` in `index.ts` must be added to `context-factory.ts`. Common triggers: new service import, new lazy getter, changed env validation, changed client config.
- **CLI commands are thin wrappers** — ~5–15 lines: parse args, call service, format output. Complexity belongs in services.
- **Always wrap `.action()` in try/catch with `handleCliError(error, 'command-name')`.**
- **Output:** `outputResult()` for everything. Summary → stdout, full JSON → `.context/.mcp-{abbrev}-cache/`. `--json` flag outputs raw JSON only.

## Parameter Mapping Convention

| MCP Tool (Zod) | CLI Command (Commander) |
|----------------|------------------------|
| Required `z.string()` | Positional `<arg>` |
| Required `z.number()` | Positional `<arg>` (parse with `parseInt`/`parseFloat`) |
| Optional `z.string().optional()` | Option flag `--flag <value>` |
| Optional `z.boolean().optional()` | Boolean flag `--flag` |
| Optional `z.number().optional()` | `--count <n>` (parse with `parseInt`) |
| `z.enum(["a","b","c"])` | `.choices(["a","b","c"])` |
| Complex `z.object()` | JSON string argument: `JSON.parse()` |

## Core CLI Helpers (from `@mcp-consultant-tools/core`)

| Helper | Purpose |
|--------|---------|
| `createCliProgram({ name, description, version })` | Commander program with `--json`, `--no-cache`, `--env-file` options |
| `loadEnvForCli(envFilePath?)` | Loads `.env` (CLI only — MCP servers don't need this) |
| `getGlobalFlags(program)` | Extracts `{ json, cache }` from Commander opts |
| `outputResult({ fileName, data, summary, cacheDir }, flags)` | Writes summary + caches JSON |
| `handleCliError(error, commandName)` | Formats error, exits code 1 |

## Verification After CLI Changes

```bash
npm run build --workspace=packages/{package}
node packages/{package}/build/cli.js --help

# Sanity-check every CLI builds + responds to --help
for pkg in azure-devops azure-devops-admin powerplatform powerplatform-customization powerplatform-data figma application-insights log-analytics azure-sql service-bus sharepoint github-enterprise azure-b2c azure-data-factory azure-management azure-storage rest-api teams 1password; do
  node packages/$pkg/build/cli.js --help > /dev/null 2>&1 && echo "OK: $pkg" || echo "FAIL: $pkg"
done
```

## Documentation to update on CLI changes

`packages/{pkg}/CLAUDE.md` (CLI Usage) • `docs/technical/{INTEGRATION}_TECHNICAL.md` (CLI Architecture — primary reference) • binary mapping table in `package-binaries.md` (only if a new package or rename).
