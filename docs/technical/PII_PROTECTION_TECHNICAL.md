<pii-protection-technical>

<purpose>
Technical reference for the PII protection pipeline shipped in v31. Covers architecture, configuration schema, env vars, integration points, and the behaviour of each layer.
</purpose>

<architecture>

<overview>
A 4-layer defence-in-depth pipeline at `packages/core/src/pii/`. Each MCP server that handles potentially-PII-bearing responses constructs the pipeline once at startup via `createPiiPipelineFromEnv()` and passes it to the relevant service's constructor. Services apply the pipeline at the response boundary, returning a redacted payload plus a structured `PipelineReport`.
</overview>

<files>
- `types.ts` — `PiiConfig`, `LayerToggles`, `FieldRules`, `RegexConfig`, `NerConfig`, `LayerReport`, `PipelineReport`, `PipelineResult<T>`
- `config.ts` — `loadPiiConfig()`, `PiiRefuseToStartError`, `LoadedPiiContext`, env-var parsing, defaults, refuse-to-start enforcement, salt generation
- `pipeline.ts` — `PiiProtectionPipeline` class, `createPiiPipelineFromEnv()`, `combineReports()`, `formatSummaryFooter()`, `emptyReport()`
- `field-redaction.ts` — Layer 2 (`applyLayer2`) + the shared `tokenize()` and `inferTokenType()` helpers
- `regex-redaction.ts` — Layer 3 (`applyLayer3`) with built-in email/phone/DOB patterns plus custom-pattern support
- `field-exclusion.ts` — Layer 1 (`applyLayer1`) for `$select` filtering
- `ner-redaction.ts` — Layer 4 (`applyLayer4`) using compromise.js
- `index.ts` — barrel re-exports
</files>

<token-format>
`[REDACTED:{type}:{6-char-hex}]` where:
- `type` ∈ `name`, `email`, `phone`, `dob`, `text`, `excluded_field`, or any custom token type (regex `customPatterns[].tokenType`).
- `6-char-hex` = `truncate(HMAC-SHA256(session_salt, value), 6 chars)`.

`session_salt` is 256 random bits from `crypto.randomBytes(32)`, generated at server startup and held in process memory only. Never logged, never persisted, never on disk. Discarded on process exit.

Cross-call within one server lifetime: same value → same token. Server restart: new salt → new tokens.

Token width chosen for birthday-paradox safety up to thousands of distinct entities per session. 4 chars too tight (collisions at ~200 entities); 8 chars unnecessary noise.
</token-format>

</architecture>

<environment-detection>

`MCP_ENVIRONMENT_TYPE` accepts `production`, `uat`, `dev`. In v32 it is **advisory only** — it no longer gates startup and is not read by `loadPiiConfig()` for any decision. It exists solely to feed the "looks unprotected" stderr warning heuristic (below); an unset or unknown value does not block startup.

PII protection is **opt-in and off by default**. The pipeline is enabled only when `PII_PROTECTION=true` (or a `PII_CONFIG_PATH` file with `"enabled": true`); resolution order is `fileConfig.enabled ?? PII_PROTECTION ?? false`. There is no environment-type gate.

| `PII_PROTECTION` | Result |
|------------------|--------|
| unset / `false` | pipeline OFF — server starts; raw data flows to the LLM |
| `true` | pipeline ENABLED |

Refuse-to-start fires only on an **opted-in misconfiguration**: `PII_SESSION_SALT` set but not exactly 64 hex characters, or `PII_CONFIG_PATH` set but the file fails to load OR fails schema validation. A server with no PII env vars starts normally with protection off.

There is **no enforced gate and no break-glass** in v32: leaving `PII_PROTECTION` unset against a production environment is permitted and silently sends raw data to the LLM. Enabling protection is the operator's explicit responsibility; the URL-heuristic warning (below) is the only safety net. (Earlier v31 betas enforced a production refuse-to-start gate; v32 relaxed it to opt-in.)

<url-heuristic-warning>
When the pipeline ends up disabled (`PII_PROTECTION=false` in `uat` or `dev`), the loader checks the configured environment identifier against a list of non-prod hints. If none match, a stderr warning fires at startup. Server still starts — this is a heuristic safety net, not a gate.

Identifier source per package:
- `powerplatform-data` — `POWERPLATFORM_URL` (full URL substring-matched)
- `azure-devops` — `AZUREDEVOPS_ORGANIZATION` (org name only; the host `dev.azure.com` is intentionally excluded so it doesn't always match `dev`)
- `azure-sql` — `AZURE_SQL_SERVER`, or first server's `server` field from `AZURE_SQL_SERVERS`
- `rest-api` — `REST_BASE_URL` (full URL substring-matched)
- `azure-b2c` — `AZURE_B2C_TENANT_ID` (tenant identifier — typically `<name>.onmicrosoft.com`, substring-matched)

Default hint list: `dev`, `uat`, `training`, `support`, `migration`, `sandbox`, `test`. Override via `PII_NONPROD_HINTS` (comma-separated, case-insensitive substrings). Failure mode this catches: consultant copies a dev `.mcp.json`, swaps the URL to a production environment, leaves `MCP_ENVIRONMENT_TYPE=dev` and `PII_PROTECTION=false` because that's what was already there. The env-type label is consultant-asserted, but the URL is configuration-asserted — closer to ground truth.
</url-heuristic-warning>

</environment-detection>

<config-schema>

```typescript
interface PiiConfig {
  enabled: boolean;
  observeMode: boolean;
  environmentType: 'production' | 'uat' | 'dev';
  layers: { l1: boolean; l2: boolean; l3: boolean; l4: boolean };
  fieldRules: Record<string, {
    excludeFromSelect?: string[];   // Layer 1
    redactInResponse?: string[];    // Layer 2
  }>;
  regex: {
    email: boolean;
    phone: boolean;
    dateOfBirth: boolean;
    customPatterns: Array<{ name: string; pattern: string; tokenType: string }>;
  };
  ner: {
    scanFields: string[];           // free-text field names Layer 4 will scan
    scanOdataAnnotations: boolean;  // also scan `@OData.*` annotation values
  };
}
```

<defaults>
- **Field rules:** `contact` (firstname, lastname, fullname, emailaddress*, mobilephone, telephone*, birthdate), `account` (emailaddress*), `systemuser` (fullname, firstname, lastname, internalemailaddress).
- **Regex:** email + phone + DOB all on; no custom patterns.
- **NER scan fields:** `description`, `notetext`, `comments`, `body`, `displayName`, `name`, `System.Description`, `System.Title`, `System.History`, `Microsoft.VSTS.TCM.ReproSteps`, `Microsoft.VSTS.TCM.SystemInfo`, `Microsoft.VSTS.Common.AcceptanceCriteria`, `text`. OData annotations also scanned. (`name` added in v31 for generic REST API coverage; NER itself filters non-person values, so `account.name` and product/company names pass through unredacted.)
- **Layer toggles:** all four on.
</defaults>

<config-loading>
Resolution order for `enabled` (file > env, no defaulting):
1. `PII_CONFIG_PATH` JSON file's `enabled` field, if present
2. `PII_PROTECTION` env (boolean)
3. *No fallback* — if neither is set, `PiiRefuseToStartError` fires.

Other fields merge file > env > built-in defaults as usual.

`PII_PROTECTION` accepts `true|1` (true) and `false|0` (false); unset/empty resolves to `undefined`, which falls through to `false` (pipeline off — no refuse-to-start).

The loader returns a `LoadedPiiContext { config: PiiConfig; getSalt(): Buffer }`. The salt is exposed only via the getter; the buffer is captured in closure and not enumerable on the object.
</config-loading>

<env-vars>

| Variable | Required | Values | Effect |
|----------|----------|--------|--------|
| `MCP_ENVIRONMENT_TYPE` | no (advisory only) | `production` \| `uat` \| `dev` | v32: not a gate. Feeds the "looks unprotected" stderr warning heuristic only. Not read for any startup decision. |
| `PII_PROTECTION` | no (default `false`) | `true` \| `false` | Master switch. Off unless `true`. No environment-type gate — `false`/unset is permitted in any environment. |
| `PII_OBSERVE_MODE` | no (default `false`) | `true` \| `false` | Run pipeline but return original data; report what would have been redacted. |
| `PII_CONFIG_PATH` | no | filesystem path | JSON config with per-layer toggles, per-entity field rules, regex patterns, NER scan-fields. See config-schema above. |
| `PII_NONPROD_HINTS` | no (defaults: `dev,uat,training,support,migration,sandbox,test`) | comma-separated substrings | Override URL-heuristic non-prod hint list. |
| `PII_SESSION_SALT` | no (default: random per-process) | 64-char hex string (32 bytes) | Cross-MCP-server token correlation — see below. **v31.0.0-beta.2+.** |

<session-salt>
By default the loader generates a per-process random 32-byte salt at startup via `randomBytes(32)`. Tokens derived from this salt are unique to the process and cannot be correlated against tokens from a different MCP server.

When `PII_SESSION_SALT` is set, the loader hex-decodes it and uses it as the session salt. This enables cross-server token correlation: setting the same value across all MCP servers in a `.mcp.json` causes all of them to derive identical tokens for the same input value, so the agent can reconcile "same person across systems."

Validation rules (any failure → `PiiRefuseToStartError`):
- Must contain only hex characters (`0-9`, `a-f`, `A-F`).
- Must decode to exactly 32 bytes (i.e. exactly 64 hex characters).
- Empty/whitespace value falls back to the default per-process random salt (no error).

Generation: `openssl rand -hex 32` produces a suitable value. The hex string is the only sensitive material — it must not be persisted outside the consultant's `.mcp.json` (which itself should be gitignored).

Tradeoff: a long-lived shared salt strengthens cross-server correlation but weakens cross-time forgetability. **Rotation recommendation: minimum once per engagement; per-day for sensitive work.** No automated rotation in v1 — operator discipline only.

Loader hook: `loadSessionSalt()` in `packages/core/src/pii/config.ts`. Called inline from `loadPiiConfig()`. Returns a `Buffer` of length 32; the buffer is captured in closure inside `LoadedPiiContext.getSalt()`.
</session-salt>

</env-vars>

</config-schema>

<layers>

<layer id="1" name="$select injection">

<purpose>
Strip configured PII fields from caller-supplied `$select` lists before the OData query is sent to Dataverse. PII never leaves the source system.
</purpose>

<api>
`pipeline.applyQueryTimeExclusions(entityName, userSelect): { filteredSelect, report }`

Called by `DataService.queryRecords` before constructing the URL.
</api>

<scope>
Only filters caller-supplied selects. If the caller did not supply a select (i.e. asking for all fields), Layer 1 is a no-op in v1 — computing "all fields except PII" requires per-entity metadata. Layers 2-4 handle that case at the response boundary instead.
</scope>

<q5.1-decision>
When the caller supplies a `$select` containing a configured PII field, Layer 1 drops it silently. The response footer reports the exclusion via the `excluded_field` count. Refusing the query would block legitimate investigations; warning-and-allowing would leak PII.
</q5.1-decision>

</layer>

<layer id="2" name="Config-based field redaction">

<purpose>
Replace values of configured per-entity fields with synthetic tokens at the response boundary.
</purpose>

<walker>
Recursive walker that handles:
- Single records (`Record<string, unknown>`)
- Arrays of records
- OData wrapper `{ value: [...] }` (preserves `@odata.context` etc.)
- Nested objects (recurses)
- Field-level `<field>@OData.Community.Display.V1.FormattedValue` annotations of redacted fields (also tokenized; same value → same token as the base field)

Skips `null` and `undefined` field values.
</walker>

<token-types>
Inferred from the field name (case-insensitive substring):
- contains `email` → `email`
- contains `phone`, `mobile`, `telephone` → `phone`
- exact `birthdate`, contains `dob`, contains `dateofbirth` → `dob`
- contains `firstname`, `lastname`, `fullname`, `middlename`, `yomi*` → `name`
- otherwise → `text`
</token-types>

</layer>

<layer id="3" name="Regex pattern matching">

<purpose>
Catch structured PII patterns (email, phone, ISO-format date) embedded in free-text fields regardless of field name.
</purpose>

<built-in-patterns>
- `email`: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b`
- `phone`: `\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){1,4}[\s.-]?\d{2,9}` (international format only — must start with `+` to avoid false positives on numeric strings in text)
- `dob`: `\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b` (strict ISO YYYY-MM-DD)

Each can be individually toggled via `regex.email`, `regex.phone`, `regex.dateOfBirth`.
</built-in-patterns>

<custom-patterns>
`regex.customPatterns: { name, pattern, tokenType }[]` — `pattern` is a JS regex source string compiled with the `g` flag. Invalid patterns are skipped silently.
</custom-patterns>

<token-skip>
Any substring that is itself already a token (matches `\[REDACTED:[a-z]+:[0-9a-f]{6}\]`) is left unchanged. Allows safe re-running of the pipeline.
</token-skip>

<scope>
Walks every string value in the response, regardless of field name. Catches PII in unexpected places — e.g. `description` containing `john.smith@example.com`, lookup-display-annotation values containing dates, etc.
</scope>

</layer>

<layer id="4" name="NER (compromise.js)">

<purpose>
Detect PERSON entities in free-text fields that regex can't catch — names like "Maria Schmidt", "Klaus Müller", "John Smith".
</purpose>

<engine>
`compromise@^14` (pure JS, no native deps, ~700KB gzip). Uses `nlp(text).people().out('array')` to extract person mentions. Each mention is replaced by its tokenized form via case-sensitive whole-word match in the original text.

The compromise English model handles common European Unicode names (validated against "Klaus Müller", "Maria Schmidt"). For domain-specific multilingual edge cases, custom regex patterns (Layer 3) or a v1.5 NER swap remain options.
</engine>

<scope>
Only scans strings whose **field name** is in `ner.scanFields` OR (when `ner.scanOdataAnnotations=true`) whose key matches `*@OData.*`.

Default scan-fields cover both Dataverse free-text (description, notetext, comments, body) and ADO field refnames (System.Description, Microsoft.VSTS.TCM.ReproSteps, etc.) plus the `displayName` key used by ADO identity objects.
</scope>

<edge-handling>
- Trims leading/trailing punctuation and whitespace from each detected mention before tokenizing
- Deduplicates mentions within a single string (same name detected twice → tokenized once with the same token)
- Skips empty strings after trimming
</edge-handling>

</layer>

</layers>

<orchestration>

<run-order>
Within a single `redactResponse()` call: L2 → L3 → L4 (each layer toggleable). L1 runs separately at query-build time via `applyQueryTimeExclusions()` before the network request.

Each layer's output feeds the next, so L3 sees L2's tokens (and skips them) and L4 sees L3's tokens (and operates on the surrounding text).
</run-order>

<observe-mode>
When `observeMode: true`:
- All layers compute what they WOULD redact (counts + field paths)
- The pipeline returns the ORIGINAL data unchanged
- The report still contains all layer reports with `observeMode: true` flagged
- The footer renders with `(observe-mode — values not changed)` annotation

Use case: validate recall against real production responses before committing to actual redaction.
</observe-mode>

<reporting>
Each layer emits a `LayerReport`:
```typescript
interface LayerReport {
  layerId: 'l1' | 'l2' | 'l3' | 'l4';
  redactionCounts: Record<string, number>;  // category -> count
  fieldsAffected: string[];                  // field paths, no values
  observeMode: boolean;
}
```

`combineReports([...])` aggregates into a `PipelineReport { layers, totalRedactions }`.

`formatSummaryFooter(report)` renders the compact line shown to the agent:
- `[PII protection: 2 emails + 4 names + 2 dobs + 1 phone redacted by L1/L2/L3/L4]`
- `[PII protection: nothing redacted]` (when `totalRedactions === 0`)
- `[PII protection: ... (observe-mode — values not changed)]` (in observe mode)

The structured report itself is mandatory output — the orchestrator emits it from day one — but the only consumer in v1 is the footer. The deferred `pii-explain-last-call` MCP tool and `--redaction-diff` CLI flag (v1.5) will consume the same report.
</reporting>

</orchestration>

<integration-points>

<package id="powerplatform-core">
**`DataService` (`src/services/DataService.ts`)** — The single leverage point for the PowerPlatform packages.

Constructor: `new DataService(client, piiPipeline?)`.

`queryRecords()`:
1. Apply Layer 1 to caller-supplied select via `pipeline.applyQueryTimeExclusions(entityLogicalName, select)`
2. Build URL with the filtered select, run query
3. Trim to `maxRecords`
4. Run trimmed array through `pipeline.redactResponse(entityLogicalName, ...)`
5. Combine L1 report + L2/L3/L4 reports via `combineReports()`
6. Return `{ value, hasMore, returnedCount, requestedMax, piiReport? }`

Entity logical name derived from the plural via naive `replace(/s$/, '')`. For unknown entities, the pipeline silently no-ops (no rules → no work).
</package>

<package id="powerplatform-data">
**`PowerPlatformService`** — facade. Constructor takes `(config, authProvider?, piiPipeline?)`, forwards pipeline to `DataService`.

**`createServiceContext()`** in both `index.ts` and `context-factory.ts` — eagerly call `createPiiPipelineFromEnv()` at startup; any opted-in misconfiguration (invalid `PII_SESSION_SALT` / unloadable `PII_CONFIG_PATH`) refuses to start before any tool registration. With no PII env vars set, the pipeline is built disabled and the server starts normally.

**`read-tools.ts` `query-records`** — strips `piiReport` from the JSON shown to the agent (it's metadata, not record data) and appends `formatSummaryFooter(piiReport)` to the response text.
</package>

<package id="azure-devops">
**`WorkItemService`** — Constructor takes `(client, piiPipeline?)`. `getWorkItem()` and `queryWorkItems()` redact the shaped result via `pipeline.redactResponse('workitem', shaped)` and inline the `piiReport` on the returned object.

ADO identity objects (`System.AssignedTo`, `System.CreatedBy`, etc.) flow through Layer 3 (catches `uniqueName` email format) and Layer 4 (catches `displayName` person names — `displayName` is in default scan-fields).

**`createServiceContext()`** in `context-factory.ts` constructs the pipeline and passes it to every `WorkItemService` instance.
</package>

<package id="azure-sql">
**`QueryService`** — Constructor takes `(connectionService, piiPipeline?)`. `executeQuery()` runs `limitedRows` through `pipeline.redactResponse('row', rows)`. SQL has no per-entity rules — Layer 2 is effectively a no-op for SQL — but Layers 3 and 4 do the heavy lifting (regex catches emails/phones in any column, NER catches names in any column).

`SqlApiCollectionResponse<T>` adds optional `piiReport?: PipelineReport`.

Both `index.ts` and `context-factory.ts` eagerly construct the pipeline at server startup.
</package>

<package id="rest-api">
**`RestApiService`** — Constructor takes `(config, piiPipeline?)`. `request()` redacts the response body via a private `redact()` helper before constructing the returned `RequestResult`.

The `redact()` helper branches on body shape:
- **JSON-parsed object/array bodies** → `pipeline.redactResponse('rest-api', body)` walks the full tree (Layer 2 is a no-op since `rest-api` has no entity rules; Layers 3 and 4 scan every string leaf).
- **String bodies** (plain text, XML, HTML — anything that fails `JSON.parse` in the request flow) → wrapped under `{ body: <string> }` before `pipeline.redactResponse('rest-api', ...)`, then unwrapped on return. The wrap is necessary so Layer 4 NER fires (`displayName`, `body`, etc. are in the default `scanFields` list; bare strings without a field-name context are skipped by L4).
- **`null`, `undefined`, primitives** → returned unchanged.

Layer 1 does not apply (no schema-level `$select` against arbitrary REST endpoints).

`RequestResult` adds optional `piiReport?: PipelineReport`.

Both `index.ts` and `context-factory.ts` eagerly construct the pipeline at server startup with `environmentIdentifier: process.env.REST_BASE_URL`. The URL-heuristic warning fires at startup when `PII_PROTECTION=false` and the base URL doesn't match any non-prod hint.
</package>

<package id="azure-b2c">
**`UserService`** — Constructor takes `(client, piiPipeline?)`. A private `redact<T>(data: T): T` helper calls `pipeline.redactResponse('b2c-user', data).data` when the pipeline is enabled, otherwise returns the data unchanged.

Redaction is applied at every return path of the read methods:
- `listUsers` — both branches (cache hit and Graph fetch); cache stores **unredacted** data so per-session salts apply correctly across cache hits.
- `getUser` — both branches (`includeAllFields=true` returns raw response, redacted; `includeAllFields=false` returns mapped `B2CUser`, also redacted).
- `searchUsers` — both branches.
- `createUser` — the mapped `B2CUser` returned after a successful create is redacted before return.
- `updateUser` — inherits redaction via its trailing `await this.getUser(userId)` call.

`deleteUser` returns `void`, no redaction needed. Group methods are not currently wired (group `displayName`/`description` aren't person PII; can be added later if a client carries names in group fields).

Default field rules for the `b2c-user` entity (in `packages/core/src/pii/config.ts` `defaultFieldRules()`):
- `redactInResponse`: `givenName`, `surname`, `displayName`, `mail`, `otherMails`, `mobilePhone`
- `excludeFromSelect`: empty (Graph API doesn't support arbitrary `$select` from this MCP path; L1 inactive)

Borderline fields **NOT in defaults** (`streetAddress`, `city`, `postalCode`, `country`, `jobTitle`) — opt-in via `PII_CONFIG_PATH` if a particular client treats those as PII.

Both `index.ts` and `context-factory.ts` eagerly construct the pipeline at server startup with `environmentIdentifier: process.env.AZURE_B2C_TENANT_ID`. The URL-heuristic warning fires at startup when `PII_PROTECTION=false` and the configured tenant identifier doesn't match any non-prod hint.

Note: `userPrincipalName` and `mail` typically share the same email value, and Layer 3's email regex catches both — so even without an explicit field rule for `userPrincipalName`, it ends up redacted. The salted-HMAC produces the same token for the same email, so the agent can still correlate "userPrincipalName and mail are the same person."
</package>

</integration-points>

<known-limitations>

- **Free-text dates ("12 March 1985")** are not caught by Layer 3's ISO-only regex. Compromise's `dates()` extraction is a v1.5 enhancement candidate.
- **ADO identity objects** are not redacted by Layer 2 (which only handles primitive field values, not nested objects). Layer 3 catches the email-formatted `uniqueName` and Layer 4 catches the `displayName` text. Explicit Layer 2 nested-path support is a v1.5 enhancement.
- **Q1 cross-call correlation is per-process by default.** Two MCP server processes generate independent salts and produce different tokens for the same value. As of v31.0.0-beta.2, set `PII_SESSION_SALT` to the same 64-hex value across all servers in a `.mcp.json` to share a salt and enable cross-server correlation. Without this, parallel agent sessions can't cross-correlate identifiers (e.g. linking a CRM contact to a B2C user by email).
- **Layer 5 (local LLM safety net) is deferred to v2.** The "Conditional" verdict for the L1-5 column in the organisational AI usage policy is a v2 upgrade.

</known-limitations>

<security-considerations>

- **Salt confinement:** the session salt is held only on the `LoadedPiiContext` and the `PiiProtectionPipeline` instance via a `#context` private field. It is never logged, never serialized in any `PipelineReport`, never persisted to disk. Operational logging that names the missing-config piece on refuse-to-start does NOT include the salt.

- **No enforced gate (v32):** there is no environment-type gate enforcing redaction. Operator forgetfulness (leaving `PII_PROTECTION` unset) is **not** caught at startup — the server runs with protection off, and the URL-heuristic stderr warning is the only signal. Enabling protection against production is the operator's explicit responsibility. (v31 betas enforced a production refuse-to-start gate; v32 relaxed it to opt-in.) Malicious operators who rebuild the binary are out of scope for v1; the audit log catches misuse post-hoc.

- **Token reversibility:** within one server lifetime, anyone with access to the server's process memory could brute-force the salt against a small set of candidate values to reverse a token. The threat model assumes the host machine is trusted; the threat is the LLM round-trip to US infrastructure.

- **Audit trail:** v1 ships the redaction pipeline only. The audit log (Phase 6) is what makes the "we anonymise before sending" claim falsifiable in compliance audits. Until Phase 6 ships, the organisational AI usage policy must NOT authorise enterprise-tier external LLMs against production data via the redaction pipeline alone.

</security-considerations>

</pii-protection-technical>
