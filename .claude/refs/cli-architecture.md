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

**Never document an invocation as a string in a shell variable.** `ARM="npx -y --package=... mcp-azure-mgmt"` then `$ARM list-resources` fails under zsh, which is the macOS default shell: zsh does not word-split an unquoted variable, so the whole string is passed as one command name. Measured cost in an assurance run: once failing loudly, and once far worse, a collection that ran to completion, **exited 0 and wrote zero files**. The same defect bit a verification script inside this repo written as `for cmd in "logic-apps list-workflows" ...; do node "$CLI" $cmd; done`.

Document either the direct inline form, as the examples above do, or a shell function:

```bash
arm() { npx -y --package=@mcp-consultant-tools/azure-management@beta mcp-azure-mgmt "$@"; }
arm list-resources
```

Any script this repo writes should pass arguments literally rather than through a variable.

## CLI Architecture

Each package follows this pattern:
- `context-factory.ts` - Shared `createServiceContext()` (used by both MCP and CLI)
- `cli.ts` - Entry point with Commander.js program
- `cli/output.ts` - Package-specific output wrapper (sets cache dir)
- `cli/commands/{domain}-commands.ts` - One file per tool domain
- Output: Summary to stdout + JSON cached to `.context/.mcp-{abbrev}-cache/`, resolved against the **working directory** (see "Where the cache lands" below)

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
- **Where the cache lands.** `.context/` is resolved against `process.cwd()`, not the package or the repo root, so it follows wherever the command was run from. That is deliberate - the cache belongs to the project being worked on, and a run inside a client repo should leave its JSON there. It also means a run started in a temporary or home directory leaves the payload there, and payloads reach several MB. `outputResult` therefore always names the file it wrote on stderr (`--json` included - stderr does not pollute the JSON on stdout), and warns when the working directory is not inside a git repository, which is the case where the file is scattered rather than collected. `--no-cache` skips the write entirely.
- **Never hardcode a version.** Both `createMcpServer` and `createCliProgram` take a `version`, and it must come from the package's own `package.json`:

  ```typescript
  import { createRequire } from 'node:module';
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json');   // build/ is flat, so ../ is the package root
  ```

  A string literal there goes stale silently and nothing fails when it does. Before v35 beta.13, 19 CLIs reported versions as old as `27.0.0`, and **every** server reported `1.0.0` (meta said `15.0.0`) in the MCP initialize handshake — the version an MCP client displays. It survived eight major releases because a wrong version breaks nothing; it only misinforms.

  **`resolvePackageVersion()` in core does not save you.** It walks up from `process.argv[1]`, which finds the right `package.json` when a build is executed directly but **not under `npx`**, where the bin shim sits in a different tree. Under npx the hardcoded fallback is exactly what the user sees — and npx is how these packages are actually consumed. `createRequire(import.meta.url)` resolves against the module itself and works in both.

  A guard test in `packages/meta/src/__tests__/entrypoint-versions.test.ts` scans every `src/index.ts` and `src/cli.ts` in the monorepo and fails on any literal, naming the offending file.
- **Write commands must pass `persist: false`.** Reads cache by default — an agent greps that JSON instead of re-running the call, which is the whole point of the cache. A write's cached payload is only an echo of the arguments, so it has nothing worth grepping, while creating `.context/` in whatever directory the command happened to be run from is a surprise. This was found in the field: a reaction command created a `.context/` inside a cloud-synced folder, which then synced.

  **Classification rule — read the description, don't guess from the name.** If a command's own `.description()` tells the user to set an `ENABLE_*_WRITE=true` / `ENABLE_*_DELETE=true` flag, it is a write by the repo's own documentation. That rule needs no judgement and it is enforced by a guard test (below). Verb-prefix matching is what the first sweep used and it missed 21 commands — `batch-create`, `push`, `str-replace`, `vote`, `copy`, `insert`, `upsert`, `receive`, `unassign`, `queue`, `drop`, `archive`, `disassociate`. It also gets `azure-storage queue receive` backwards: it reads like a read, but receiving hides the message and changes its visibility.

  For the residue that mutates without naming a flag in its text (`azure-sql crud insert`, `azure-devops-admin pipeline queue`), judge by what the command *does*. Note that write-sounding names are not enough in the other direction either: `runs`, `run-details`, `run-saved-query`, `run-results`, `deployments` and `publishers` all read, and all keep their cache. So does `rest-api batch` — its cached payload is the actual response bodies, which is the thing worth grepping.

  A guard test in `packages/meta/src/__tests__/cli-write-cache.test.ts` enforces the description rule across the monorepo, naming any offender as `file:line (command)`.

  Packages **not** following this convention, because they do not use the shared wrapper at all: `github-enterprise` and `powerplatform-customization` print with `console.log` and never cache anything (the guard skips them automatically — it derives the exclusion from whether the package's `output.ts` supports `persist`, not from a hardcoded list). `sharepoint` has its own `outputResult` implementation which honours `persist` but ignores the global `--no-cache` flag entirely — a separate defect, recorded in the v35 known issues.
- **A read's cache lands in the current working directory, and it can contain client data.** `outputResult` resolves `.context/{cacheDir}/` against `process.cwd()`, so where the file goes is decided by wherever the command happened to be started. Running a CLI from `/tmp` puts the JSON in `/private/tmp/.context/` — measured in the field, a 2 MB review of a real client repository. On a client engagement that is client data landing somewhere nobody is tracking, and nobody cleans up.

  This is the cache working as designed, not a bug — but it means **the working directory is part of the invocation.** Start assurance runs from the engagement folder, and treat `.context/` as client-confidential wherever it appears. `--no-cache` suppresses the file (except in `sharepoint`, per above).

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
| `createCliProgram({ name, description, version })` | Commander program with `--json`, `--no-cache`, `--env-file` options. **`version` must be `pkg.version`, never a literal — see below.** |
| `loadEnvForCli(envFilePath?)` | Loads `.env` (CLI only — MCP servers don't need this) |
| `getGlobalFlags(program)` | Extracts `{ json, cache }` from Commander opts |
| `outputResult({ fileName, data, summary, cacheDir, persist? }, flags)` | Writes summary + caches JSON. `persist: false` on write commands skips the cache entirely — no file, no `.context/` directory. |
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
