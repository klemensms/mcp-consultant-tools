# Known Issues

Confirmed defects that are deliberately not fixed yet. Each entry records what was verified in
source, what was not, and where to start.

---

## PII protection: the options argument is discarded

**Status:** confirmed in source. **Affects:** every caller of `createPiiPipelineFromEnv`.

`packages/core/src/pii/pipeline.ts:104` declares the parameter as `_options` — the underscore
convention for "deliberately unused" — and the body ignores it entirely:

```ts
export function createPiiPipelineFromEnv(
  _options?: CreatePiiPipelineOptions
): PiiProtectionPipeline {
  const ctx = loadPiiConfig();
  return new PiiProtectionPipeline(ctx);
}
```

Callers pass a populated options object that goes nowhere:

- `packages/azure-devops/src/context-factory.ts:28`
- `packages/azure-sql/src/context-factory.ts:36`
- `packages/azure-sql/src/index.ts:46`
- `packages/powerplatform-data/src/context-factory.ts:18`

Each supplies `{ environmentIdentifier: pickEnvironmentIdentifier() }`. The pipeline never sees it,
so nothing downstream can vary by environment.

**Fix:** either honour `options.environmentIdentifier` in `loadPiiConfig`, or delete
`CreatePiiPipelineOptions` and the four call sites' arguments so the signature stops advertising a
capability that does not exist.

---

## PII protection: the "unprotected environment" warning is dead code

**Status:** confirmed in source.

`checkEnvironmentLooksUnprotected` is defined at `packages/core/src/pii/config.ts:440` and has
**zero call sites** across the monorepo — it appears only in its own definition, the generated
`build/*.d.ts`, and vendored `node_modules` copies of `core`.

Related: `MCP_ENVIRONMENT_TYPE` is **read by no production code path**. Its only non-test occurrence
is inside that dead function's message string (`config.ts:457`), which tells the operator to
"Set `PII_PROTECTION=true` and `MCP_ENVIRONMENT_TYPE=production` to enable protection" — advice for
a control that does not exist. `packages/core/src/pii/__tests__/config.test.ts:274` enshrines the
gap: *"does not throw when `MCP_ENVIRONMENT_TYPE` is unset (no env-aware gating)"*.

`example.mcp.json` in the toolkit repo deliberately omits `MCP_ENVIRONMENT_TYPE` rather than teach a
control that is not wired up.

**Fix:** call the check at pipeline construction, or delete the function, the env var and the
message together. Do not leave it half-live.

---

## Unverified: does `PII_PROTECTION` reach the CLI path?

**Status:** NOT confirmed — recorded so it is not lost, and so the wrong mechanism is not chased.

An earlier investigation reported that `PII_PROTECTION` set in `.mcp.json` never reaches the CLI on
`azure-sql`, `azure-devops`, `rest-api` and `azure-b2c`, because `createPiiPipelineFromEnv()` runs
eagerly at module load, before the `preAction` hook injects the config env.

**The stated mechanism does not match the code.** `createServiceContext()` in
`packages/azure-sql/src/context-factory.ts:35` is an exported function, not module-level
initialisation, so the pipeline is built when it is called — not at import. The `preAction` hooks
are at `packages/azure-sql/src/cli.ts:25` and `packages/azure-devops/src/cli.ts:21`.

The symptom may still be real; the explanation is wrong. Anyone picking this up should establish the
actual call ordering between the `preAction` hook and the first `createServiceContext()` call before
changing anything.

**Note:** the two confirmed defects above are sufficient on their own to make `PII_PROTECTION`
behave unpredictably. Fix those first, then re-test whether a symptom remains.
