# Large-file register

`~/.claude/hooks/global/large-file-guard.py` warns on every edit to a file over **1,000 lines** and escalates past **2,000**, which is the Read tool's default window: beyond it no session has read the file whole and every edit is made blind from search hits. Instruction files that load into every context - `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `.claude/commands/`, `.claude/agents/` - use 400 and 800 instead.

**This file is the guard's only escape hatch.** A path listed here is one whose size is already accounted for, and the guard stays quiet for it. Nothing else silences it, so a file that is big for a good reason gets one line here explaining the reason, and a file that is big for no reason keeps warning until somebody deals with it.

**One line per path**, in one of three forms:

```
- `path/to/file.py` - lines=1234 - <item, or `unscheduled`> - <one line on the split>
- `path/to/output.html` - generated - <what builds it, and from what>
- `path/to/record.md` - record - <why one file is right>
```

An entry carrying `lines=N` warns again once the file is **25% past N**. That is deliberate: a recorded size is not a permanent exemption, and a file that keeps growing while its split never happens is the exact failure the guard exists to catch. Update the figure when a piece of the split lands.

**Adding an entry is not a decision for Klemens.** He is a product owner and cannot arbitrate where a module's seams are. The model splits the file if that is contained, or records it here if it is not.

*Seeded 2026-09-07 from the guard's own thresholds. The `unscheduled` entries are this repo's known size debt: recorded so the guard is quiet, not forgiven.*

## Accounted for

- `packages/powerplatform-core/src/services/WorkflowManagementService.ts` - lines=1671 - unscheduled - no split scheduled; recorded so the guard is quiet until it grows another 25%.
- `packages/powerplatform-customization/src/PowerPlatformService.ts` - lines=1528 - unscheduled - no split scheduled; recorded so the guard is quiet until it grows another 25%.
- `docs/technical/AZURE_DEVOPS_ADMIN_TECHNICAL.md` - record - one service's technical reference, read whole.
- `docs/technical/AZURE_DEVOPS_TECHNICAL.md` - record - one service's technical reference, read whole.
- `packages/powerplatform-core/src/services/IntegrationAuditService.ts` - lines=1392 - unscheduled - no split scheduled; recorded so the guard is quiet until it grows another 25%.
- `docs/technical/AZURE_MANAGEMENT_TECHNICAL.md` - record - one service's technical reference, read whole.
- `docs/technical/AZURE_SQL_TECHNICAL.md` - record - one service's technical reference, read whole.
- `packages/powerplatform-core/src/services/FlowService.ts` - lines=1310 - unscheduled - no split scheduled; recorded so the guard is quiet until it grows another 25%.
- `docs/technical/POWERPLATFORM_TECHNICAL.md` - record - one service's technical reference, read whole.
- `docs/technical/TEAMS_TECHNICAL.md` - record - one service's technical reference, read whole.
- `packages/azure-management/src/services/ResourceGraphService.ts` - lines=1066 - unscheduled - no split scheduled; recorded so the guard is quiet until it grows another 25%.
- `docs/technical/LOG_ANALYTICS_TECHNICAL.md` - record - one service's technical reference, read whole.
- `tests/pii-demo/demo.html` - record - a rendered page, read as one unit rather than maintained as source.
- `packages/azure-devops/src/sync/markdown-serializer.ts` - lines=1001 - unscheduled - no split scheduled; recorded so the guard is quiet until it grows another 25%.
- `packages/azure-devops/CLAUDE.md` - lines=669 - unscheduled - loads into every context; trim by moving detail into a references/ file it points at.
- `packages/teams/CLAUDE.md` - lines=598 - unscheduled - loads into every context; trim by moving detail into a references/ file it points at.
- `docs/superpowers/plans/2026-09-29-outlook-calendar.md` - lines=2006 - right as one unit - an implementation plan read task by task with offsets by the handoff chain; it stops growing once the build ends, and splitting it would break the single checklist the chain ticks off.
