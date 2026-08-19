# Scope: Mandatory checklists for adding tools, domains, and integrations to a package. Load when implementing a new MCP tool, adding a service domain to an existing package, or scaffolding a brand-new integration package. Mirrors the canonical Service-Tool-Prompt layering — see `package-architecture.md` for the architectural backdrop.

## Adding a tool to an existing domain

1. Add service method in `services/{domain}-service.ts`
2. Add tool registration in `tools/{domain}-tools.ts` (catch blocks must return `isError: true`)
3. Add examples to `tool-examples.ts` for complex params (queries, JSON, enums, IDs)
4. Add matching CLI command in `cli/commands/{domain}-commands.ts`
5. Update `.mcp.json.example` if new env vars (the consolidated config reference at the repo root)
6. Update `docs/technical/{INTEGRATION}_TECHNICAL.md` (XML-tagged tool reference)
7. Update `docs/documentation/{integration}.md` ONLY if user-facing (env vars, flags, prompts)
8. Update `README.md` and package `CLAUDE.md` if needed

## Writing a response mapper (hard rule)

**Never build a mapper's field list from a vendor doc. Pass the whole payload block through and
name what you did not recognise.**

A mapper that names a fixed allowlist taken from published documentation drops every field the
vendor added since, and it drops them *silently*: the caller sees a well-formed object with a field
missing, which reads as "the resource does not have this" rather than "we never asked for it".
Three confirmed instances in this repo, all on Azure surfaces, all from documentation that was
current when checked:

- `mapAttackPathRow` printed a `riskLevel: High` attack path as impact `Unknown` with no risk
  categories, on every path of a real estate.
- `mapAssessmentGraphRow` carried the same allowlist, which made "no assessment carries a risk
  object" unfalsifiable: a mapper artefact and a fact about the tenant looked identical.
- The Defender alert schema is four years old, so a live tenant can carry keys it does not define.

**What to do instead**, as done by all four `azure-management` mappers added for VMs, log-search
alert rules, Logic App workflows and API connections:

1. Read the named fields you need for the summary, filters and CLI output.
2. Put every key you did not name into `properties.unmappedProperties` on the row.
3. Aggregate the distinct unmapped key names into `summary.unmappedPropertyKeys` and say so in
   `summary.note`. Aggregate **before** any dedupe or `maxResults` trim, or a field that only one
   row of thousands carried is lost from the surface a caller actually reads.

**The request side has the same failure and a passthrough will not save you.** Some ARM list
operations return a subset unless the request asks for more: `AppServicePlans_List` needs
`detailed=true`, and `VirtualMachines_InstanceView` is a separate call per VM. A perfect mapper
returns nothing if the field was never in the response. Read the operation's own parameter list in
`Azure/azure-rest-api-specs`, not just its response model.

**Also pin the api-version deliberately.** A resource `properties` block is version-dependent, so a
field a later version added is simply absent, and with a passthrough absent looks like a resource
that does not have it. Record why the version was chosen next to the pin.

## Adding a new domain within a package (e.g. "builds" to azure-devops)

- Create `services/{domain}-service.ts`, `tools/{domain}-tools.ts`, `cli/commands/{domain}-commands.ts`
- Add getter to `ServiceContext` in `types.ts`, wire lazy init in `index.ts` AND `context-factory.ts`
- Update barrels: `services/index.ts`, `tools/index.ts`, `cli/commands/index.ts`

## Adding a new integration package

- Follow the canonical structure (see `package-architecture.md`). Reference: `packages/azure-devops/`.
- Update `package.json` (MCP bin, CLI bin, `commander` dep), `.mcp.json.example` (add a server block), `README.md`, `scripts/publish-all.sh` PACKAGES array.
- Create package `CLAUDE.md`, `docs/documentation/{integration}.md`, `docs/technical/{INTEGRATION}_TECHNICAL.md`.
- Wire into the meta package imports.
- Add row to the binary mapping table in `package-binaries.md`.
