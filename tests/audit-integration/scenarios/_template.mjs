/**
 * Template scenario file. Copy + rename when adding a new scenario.
 *
 * Convention:
 *   export default async function (ctx) { ... }
 *
 * ctx provides:
 *   - ctx.name: scenario name
 *   - ctx.auditPath: dir for audit JSONL output (per-scenario, isolated)
 *   - ctx.outputDir: per-scenario output dir (auditPath is inside this)
 *   - ctx.fixtureIds: push {entitySetName, id, label?} for cleanup
 *   - ctx.startClient(envOverrides): spawn pp-data, register subprocess for teardown
 *   - ctx.log(level, ...args)
 *
 * Throw to mark the scenario as failed. Don't catch errors unless you know
 * what to do with them — the runner records the stack trace.
 */
export default async function templateScenario(ctx) {
  ctx.log('info', 'template scenario — replace this with real assertions');
}
