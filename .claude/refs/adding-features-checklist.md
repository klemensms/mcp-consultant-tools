# Scope: Mandatory checklists for adding tools, domains, and integrations to a package. Load when implementing a new MCP tool, adding a service domain to an existing package, or scaffolding a brand-new integration package. Mirrors the canonical Service-Tool-Prompt layering — see `package-architecture.md` for the architectural backdrop.

## Adding a tool to an existing domain

1. Add service method in `services/{domain}-service.ts`
2. Add tool registration in `tools/{domain}-tools.ts` (catch blocks must return `isError: true`)
3. Add examples to `tool-examples.ts` for complex params (queries, JSON, enums, IDs)
4. Add matching CLI command in `cli/commands/{domain}-commands.ts`
5. Update `.env.example` if new env vars
6. Update `docs/technical/{INTEGRATION}_TECHNICAL.md` (XML-tagged tool reference)
7. Update `docs/documentation/{integration}.md` ONLY if user-facing (env vars, flags, prompts)
8. Update `README.md` and package `CLAUDE.md` if needed

## Adding a new domain within a package (e.g. "builds" to azure-devops)

- Create `services/{domain}-service.ts`, `tools/{domain}-tools.ts`, `cli/commands/{domain}-commands.ts`
- Add getter to `ServiceContext` in `types.ts`, wire lazy init in `index.ts` AND `context-factory.ts`
- Update barrels: `services/index.ts`, `tools/index.ts`, `cli/commands/index.ts`

## Adding a new integration package

- Follow the canonical structure (see `package-architecture.md`). Reference: `packages/azure-devops/`.
- Update `package.json` (MCP bin, CLI bin, `commander` dep), `.env.example`, `README.md`, `scripts/publish-all.sh` PACKAGES array.
- Create package `CLAUDE.md`, `docs/documentation/{integration}.md`, `docs/technical/{INTEGRATION}_TECHNICAL.md`.
- Wire into the meta package imports.
- Add row to the binary mapping table in `package-binaries.md`.
