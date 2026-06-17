# Design — Team Iteration Capacity tools (`azure-devops-admin`)

**Date:** 2026-06-17
**Package:** `@mcp-consultant-tools/azure-devops-admin` (`mcp-ado-admin` / `mcp-ado-admin-cli`)
**Status:** Approved — implementing in the v35 beta line.

## Problem

The team tracks each resource's sprint availability via **Days off** + **Capacity per day** on the
ADO team Capacity page (Boards → Sprints → Capacity). No MCP tool or CLI command exists for capacity —
only iteration/area CRUD (the `classification` domain). Setting days-off programmatically (e.g. an agent
reflecting resource bookings from a CRM into ADO capacity) requires hand-rolled REST calls.

Target workflow: *point an agent at a sprint → it reads each resource's bookings from the source system →
it writes the matching days-off into ADO capacity.*

## Scope (v1)

New `iteration-capacity` domain (distinct from `classification`, which owns iteration/area CRUD).
Five tools + an internal identity resolver.

| Tool | Tier | Gating |
|------|------|--------|
| `get-iteration-capacities` | read | always registered |
| `get-team-days-off` | read | always registered |
| `set-team-member-capacity` | write | gated |
| `set-team-capacities-batch` | write | gated |
| `set-team-days-off` | write | gated |

**Single gating flag** for all three writes: `AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT=true`
(matches the existing `enable…Upsert` convention; default `false`). Capacity has no separate "delete"
tier — clearing is a set-to-empty.

Name/email→GUID resolution is **internal** to the set tools (via the team-members API), not a standalone
tool. `get-iteration-capacities` already surfaces displayName + email + GUID.

## Architecture

Standard three-layer pattern (matching `classification`):

- `services/iteration-capacity-service.ts` → `IterationCapacityService`
- `tools/iteration-capacity-tools.ts` → `registerIterationCapacityTools(server, ctx)` returning `{readonly, upsert, delete}`
- `cli/commands/iteration-capacity-commands.ts` → `capacity` subcommand group (alias `cap`)
- Wired into `ServiceContext` (`types.ts` + `context-factory.ts` + `admin-client.ts` default), `tools/index.ts`, `cli/commands/index.ts`

## REST endpoints (api-version 7.1, via `AdminClient.makeRequest`)

Base (team-scoped): `{project}/{team}/_apis/work/teamsettings/iterations/{iterationId}/...`
Team segment is `encodeURIComponent(team)`; project raw (mirrors `addIterationToTeam`).
PATCH calls pass content-type `application/json` explicitly (the client defaults PATCH to json-patch).

- **Capacities GET** `…/capacities` → `{ teamMembers: [{ teamMember:{id,displayName,uniqueName}, activities:[{capacityPerDay,name}], daysOff:[{start,end}] }], totalCapacityPerDay, totalDaysOff }`. (Tolerates a `value` root too.)
- **Capacity PATCH (one member)** `…/capacities/{teamMemberId}` body `{ activities:[{capacityPerDay,name}], daysOff:[{start,end}] }` — **full replace** of that member's activities + days-off. Returns updated object.
- **Team days-off GET** `…/teamdaysoff` → `{ daysOff:[{start,end}] }`.
- **Team days-off PATCH** `…/teamdaysoff` body `{ daysOff:[{start,end}] }` — **full replace**.
- **Team members** (resolution) `_apis/projects/{project}/teams/{team}/members` → `{ value:[{ identity:{id,displayName,uniqueName} }] }`.

### Key semantics

- `iterationId` = the iteration **identifier GUID** (from `list-iterations` → `identifier`), not the integer `id`.
- **Set = full replace.** Descriptions state this loudly. Days-off are `{start,end}` arrays; single day = `start==end`.
  Dates accept `YYYY-MM-DD` or full ISO and are normalized via `client.formatDateForAdo()`.
- **Batch = N sequential PATCH calls** (one per named member), NOT ADO's `PUT …/capacities` replace-all.
  PUT would silently zero out any member not in the payload; the loop only touches the people you name.
  Ceiling: sequential calls — fine for team-sized rosters; parallelize if throughput ever matters.
- Identity resolution: GUID passed through as-is; otherwise match team members by email (exact, case-insensitive)
  then displayName (case-insensitive). Zero/ambiguous matches → error listing candidates. Members fetched once per call.

## Error handling

Tool catch blocks return the ADO message text (existing convention; `isError`-style text response).
Resolution failures and the gating-disabled case produce actionable messages.

## Auth / permissions

PAT scope `vso.work_write` (Work items read & write) for the write tools; reads need `vso.work`.

## Verification

Package has no unit-test infra (pattern-first repo) — followed.

- **Agent-verifiable:** `npm run build --workspace=packages/azure-devops-admin` clean; tools register
  (server logs the new count); read tools return the expected shape; write tools only appear when the flag is set;
  CLI `capacity --help` lists the subcommands. Verified via `mcp-local-tester` against an ADO env.
- **User-verifiable (Klemens):** a real `set-team-member-capacity` against a live sprint actually writes the
  days-off (he already proved the raw REST by hand). Captured in the done-checklist; not run against a client env
  from the repo (public-repo hygiene).

## Out of scope (deferred)

- Standalone identity-resolver tool (redundant with internal resolution + capacities output).
- Merging the full team roster into `get-iteration-capacities` (it faithfully returns the capacities endpoint;
  members without a capacity row are handled by the set tools' resolver).
