<!-- Agents: see docs/technical/PII_PROTECTION_TECHNICAL.md for full reference. -->

# PII Protection

Four-layer redaction pipeline that prevents personal data from reaching the US-hosted LLM during MCP tool calls. Layers 1-4 are in v1; Layer 5 (local LLM safety net) ships in v2.

## Where redaction is wired

Every server that returns customer record data runs the pipeline. Today that's five packages:

| Package | Redaction point | What flows through |
|---------|-----------------|--------------------|
| `@mcp-consultant-tools/powerplatform-data` | `DataService.queryRecords` | Every `query-records` response from Dataverse |
| `@mcp-consultant-tools/azure-devops` | `WorkItemService.getWorkItem` + `queryWorkItems` | Work item fields, including identity objects (`System.AssignedTo`, `CreatedBy`, `ChangedBy`) and free-text fields (`System.Description`, `History`, `ReproSteps`, `AcceptanceCriteria`) |
| `@mcp-consultant-tools/azure-sql` | `QueryService.executeQuery` | Every `sql-execute-query` result row |
| `@mcp-consultant-tools/rest-api` | `RestApiService.request()` | Every HTTP response body — JSON-parsed bodies walked as object trees, plain-text/XML/HTML scanned as strings. L1/L2 N/A (no schema, no entity types); L3 + L4 do the work. |
| `@mcp-consultant-tools/azure-b2c` | `UserService.{listUsers,getUser,searchUsers,createUser}` | Graph API user objects — `givenName`, `surname`, `displayName`, `mail`, `otherMails`, `mobilePhone` redacted by default rules; `userPrincipalName`/`mail` also caught by L3 email regex. `updateUser` inherits redaction via its trailing `getUser` call. |

Other packages don't redact because they don't return record data: `powerplatform` (read-only metadata), `powerplatform-customization` (schema operations), `azure-devops-admin` (pipelines, service connections), and the rest. If a future package starts returning customer data, it must adopt the same pipeline and flag contract.

## Quick Start

PII protection is **opt-in and off by default**. Enable it by setting one env var on the server:

```bash
PII_PROTECTION=true                 # master switch — off by default
PII_SESSION_SALT=                   # optional: 64-char hex; share across servers to correlate tokens
PII_OBSERVE_MODE=false              # true = report what would be redacted, return originals
PII_CONFIG_PATH=                    # optional: path to JSON config with field rules
```

| `PII_PROTECTION` | Behaviour |
|---|---|
| unset / `false` | pipeline off — raw data flows to the LLM (server starts normally) |
| `true` | redaction active on every response |

The pipeline is **off unless you turn it on** — there is no environment-type gate. **When protection is off against a production environment, raw data is sent to the LLM — set `PII_PROTECTION=true` to prevent that.** (Earlier v31 betas made these flags mandatory with a refuse-to-start gate; v32 relaxed that to pure opt-in.) The startup safety-net warning that flags a config that "looks unprotected" against a production environment is designed but not yet wired — see [Coming later (not yet active)](#coming-later-not-yet-active).

## What gets redacted

Each redacted value is replaced by `[REDACTED:{type}:{6-char-hex}]` where the hex is `truncate(HMAC-SHA256(session_salt, value), 6)`. The salt is generated at server startup, held in process memory, and discarded on exit.

- **Same value within one server lifetime → same token** (cross-call correlation: agent can track "same person" across queries)
- **Server restart → fresh salt → fresh tokens** (cross-session privacy)
- **Different MCP servers → different salts → tokens do NOT correlate** unless `PII_SESSION_SALT` is set to the same value across servers — see [Cross-MCP correlation](#cross-mcp-correlation) below.

Every redacted MCP response ends with a footer like:
```
[PII protection: 2 emails + 4 names + 2 dobs + 1 phone redacted by L1/L2/L3/L4]
```

## Notable behaviour

- **Refuse-to-start (opt-in misconfig only):** the server exits with code 1 and a stderr message only when you have opted into a setting and supplied an invalid value — specifically (a) `PII_SESSION_SALT` is set but is not exactly 64 hex characters, or (b) `PII_CONFIG_PATH` is set but the file fails to load. A server with no PII env vars starts normally with protection off.

- **Observe-mode (`PII_OBSERVE_MODE=true`):** pipeline runs but returns original data unchanged. The footer reports what would have been redacted with `(observe-mode — values not changed)`. Use this to validate recall against real production responses before committing to actual redaction.

- **Per-layer toggles via `PII_CONFIG_PATH`:** flip individual layers on/off to isolate behaviour during iteration:
  ```json
  { "enabled": true, "layers": { "l1": true, "l2": true, "l3": false, "l4": true } }
  ```

- **Per-entity field rules via `PII_CONFIG_PATH`:** override defaults for a specific client's schema:
  ```json
  {
    "fieldRules": {
      "contact": {
        "excludeFromSelect": ["birthdate"],
        "redactInResponse": ["firstname", "lastname", "emailaddress1"]
      }
    }
  }
  ```

- **Cross-MCP correlation (`PII_SESSION_SALT`, v31.0.0-beta.2+):** by default each MCP server process generates its own random 32-byte salt at startup, so the same email tokenizes differently across `pp-data` / `azure-devops` / `azure-sql` / `rest-api` / `azure-b2c`. The agent cannot reconcile "same person across systems" — which blocks cross-MCP analysis tasks (e.g. "is this CRM contact also a B2C user?", "is this contact's email mentioned in any work-item history?").

  Set `PII_SESSION_SALT` to a 64-character hex string (32 bytes) in **every** MCP server's `env:` block in `.mcp.json` to share a salt across servers. When set to the same value across servers, all of them derive identical tokens and the agent can correlate.

  ```bash
  # Generate a fresh salt
  openssl rand -hex 32
  # → e.g. a3f4...64-hex-chars-total
  ```

  Paste the **same** value into each server's `env` block in your `.mcp.json` (illustrative):

  ```json
  {
    "mcpServers": {
      "powerplatform-data": { "env": { "PII_SESSION_SALT": "a3f4...", ... } },
      "azure-devops":       { "env": { "PII_SESSION_SALT": "a3f4...", ... } },
      "azure-sql":          { "env": { "PII_SESSION_SALT": "a3f4...", ... } },
      "azure-b2c":          { "env": { "PII_SESSION_SALT": "a3f4...", ... } }
    }
  }
  ```

  **Validation:** if set to a non-empty value, it must be exactly 64 hex characters (32 bytes when decoded); any other length or non-hex characters causes the server to refuse to start. Unset, empty (`""`), or whitespace-only falls back to per-process random bytes (default — no behaviour change).

  **Rotation recommendation:** persistent shared salts are a tradeoff — stronger correlation across servers, weaker forgetability across time. **Rotate the salt at the close of every engagement at minimum**, and per-day for sensitive work. Don't persist it anywhere outside the consultant's `.mcp.json` (which itself should be `.gitignore`d).

- **Coverage notes (known limits):**
  - **Phone regex (Layer 3) matches international format only** — values starting with `+` and a country code (e.g. `+44 7700 900123`, `+1-770-736-8031`) are caught. Locale-specific bare-domestic formats (e.g. US `1-770-736-8031`, UK `07700 900123`) pass through. If your data carries domestic phone numbers, redact them via Layer 2 by adding the relevant field to `redactInResponse` for that entity, or add a custom regex via `PII_CONFIG_PATH` (see "Adding custom patterns" below).
  - **Date regex (Layer 3) matches ISO `YYYY-MM-DD` only — locale-specific date formats are intentionally not built in.** Patterns like `12 March 1985`, `12.03.1985` (DE/AT), `12/03/1985` (UK), or `03/12/1985` (US) pass through Layer 3 by default. Built-in locale defaults were considered for v1.5 and rejected: at scale, global string-scanning regex for these formats produces too many false positives (build numbers, version strings, timestamps, GUID fragments). Instead, opt in per-engagement via `PII_CONFIG_PATH` → `regex.customPatterns` (see [Locale date formats — copy-paste recipes](#locale-date-formats--copy-paste-recipes) below) or — preferably — redact the specific fields holding the dates via Layer 2 `redactInResponse` where the field name is known. Layer 2 is always the safer first stop because it's anchored to schema rather than text shape.
  - **Layer 4 NER scans only configured field keys.** Defaults include `description`, `notetext`, `comments`, `body`, `displayName`, `name`, `text`, plus the ADO refnames (`System.Description`, `System.Title`, `System.History`, `Microsoft.VSTS.TCM.ReproSteps`, `Microsoft.VSTS.TCM.SystemInfo`, `Microsoft.VSTS.Common.AcceptanceCriteria`). If your responses carry person names under different keys (e.g. `customerName`, `contactPerson`), add them via `PII_CONFIG_PATH` → `ner.scanFields`.
  - **Yomi-family fields on Dataverse contacts/leads/users redacted by default (v31.0.0-beta.4+).** `yomifirstname`, `yomimiddlename`, `yomilastname`, `yomifullname` (the phonetic-romanisation fields, typically Japanese) are in the default Layer 2 rules for `contact`, `lead`, and `systemuser`. Pre-beta.4 these were omitted, leaving a leak path on contact write responses that included the computed `yomifullname`. If you ship a custom `PII_CONFIG_PATH` that overrides `fieldRules.contact.redactInResponse`, make sure your override carries the yomi-family entries.

- **Adding custom patterns (Layer 3 extension):** the `regex.customPatterns` array in your `PII_CONFIG_PATH` JSON file extends the default regex set with client-specific or locale-specific patterns. Each entry has `name` (identifier used in the redaction report), `pattern` (regex source string, compiled with the global `g` flag), and `tokenType` (the `{type}` portion of the redaction token). Example covering UK domestic phones, locale dates, and a national-ID format:

  ```json
  {
    "regex": {
      "customPatterns": [
        { "name": "uk-phone", "tokenType": "phone", "pattern": "\\b0[1-9]\\d{8,9}\\b" },
        { "name": "dob-locale", "tokenType": "dob", "pattern": "\\b\\d{1,2}\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}\\b" },
        { "name": "national-id", "tokenType": "id", "pattern": "\\b[A-Z]{2}\\d{6}[A-Z]\\b" }
      ]
    }
  }
  ```

  Each match is replaced with `[REDACTED:{tokenType}:{6-char-hex}]`. Test patterns against your data carefully — over-broad patterns (e.g. matching any 10-digit string) will redact non-PII like version numbers, IDs, and timestamps. Prefer narrow, anchored patterns (`\b...\b`) and start with Layer 2 field rules where the field name is known. Patterns are compiled as `new RegExp(pattern, 'g')` — case-sensitive by default; if you need case-insensitive matching, write the pattern as a character class (e.g. `[Mm]arch` or `[A-Za-z]+`) since JavaScript does not support the inline `(?i)` flag.

### Locale date formats — copy-paste recipes

Layer 3's built-in date regex matches ISO `YYYY-MM-DD` only. To catch other locale formats you have two safer options before reaching for global text regex:

1. **Layer 2 first (recommended).** Identify the fields holding the date — typical candidates are `birthdate` (Dataverse contact, already redacted by default), `Custom.DateOfBirth`, `dob`, identity / KYC fields, free-text fields containing structured form output. Add the field name to `fieldRules.{entity}.redactInResponse`. This is anchored to schema and has zero false-positive risk.

2. **Layer 3 `customPatterns` if the date appears in free text.** Use this when the date arrives inside narrative text (notes, comments, descriptions) and Layer 2 can't reach it. The patterns below are anchored with `\b...\b` to reduce false positives but you should still validate against a sample of your real data — e.g. `12.03.1985` in German format will incorrectly catch any `dd.mm.yyyy` shape including build numbers like `1.2.3025`.

Drop these into `PII_CONFIG_PATH`'s JSON file under `regex.customPatterns` — pick only the locales you need:

```json
{
  "regex": {
    "customPatterns": [
      {
        "name": "dob-en-long",
        "tokenType": "dob",
        "pattern": "\\b\\d{1,2}\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}\\b"
      },
      {
        "name": "dob-en-short",
        "tokenType": "dob",
        "pattern": "\\b\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{4}\\b"
      },
      {
        "name": "dob-de-numeric",
        "tokenType": "dob",
        "pattern": "\\b(?:0?[1-9]|[12][0-9]|3[01])\\.(?:0?[1-9]|1[0-2])\\.(?:19|20)\\d{2}\\b"
      },
      {
        "name": "dob-uk-slash",
        "tokenType": "dob",
        "pattern": "\\b(?:0?[1-9]|[12][0-9]|3[01])/(?:0?[1-9]|1[0-2])/(?:19|20)\\d{2}\\b"
      },
      {
        "name": "dob-us-slash",
        "tokenType": "dob",
        "pattern": "\\b(?:0?[1-9]|1[0-2])/(?:0?[1-9]|[12][0-9]|3[01])/(?:19|20)\\d{2}\\b"
      }
    ]
  }
}
```

Each fires globally (case-sensitive). Notes:

- `dob-en-long` and `dob-en-short` cover written-out month names — case-sensitive, so you'll want lowercase variants if your data has them: duplicate the entry with `january|february|...` etc.
- `dob-de-numeric` and `dob-uk-slash` are visually similar `dd.mm.yyyy` / `dd/mm/yyyy` — pick whichever your engagement actually uses; running both on the same string is harmless but doubles redaction effort.
- **Don't enable both `dob-uk-slash` and `dob-us-slash` simultaneously** — they overlap and the pattern that fires first wins. If your dataset is mixed, prefer Layer 2 field-level redaction instead (e.g. `redactInResponse: ["birthdate", "Custom.DateOfBirth"]`).
- The `(?:19|20)\\d{2}` year guard prevents the pattern from matching arbitrary `dd/mm/0000` strings or build numbers like `1/2/3025`.

If you find yourself adding the same patterns across multiple engagements, that's a signal to lift them into a shared `PII_CONFIG_PATH` template per client. They are **not** going into the built-in defaults — false-positive risk in untrusted text is too high.

- **`@odata.bind` lookup-bind fix (v31):** `create-record` and `update-record` calls with lookup binds (e.g. `primarycontactid@odata.bind`, `objectid_contact@odata.bind`) previously failed silently with "undeclared property" errors because the SchemaName was being used in place of the actual navigation-property name. Now resolves the correct nav property from `ManyToOneRelationships` metadata. The `get-lookup-target` tool returns the correct nav property name and corrected guidance.

## Coming later (not yet active)

These items are designed and documented but **not yet wired into the running server** — setting the env vars below currently has no effect. They are preserved here so the intended configuration surface isn't lost.

- **Environment-safety "looks unprotected" startup warning.** The intent: when PII protection is off (`PII_PROTECTION` unset or `false`), the server would check the configured environment identifier (PowerPlatform URL, ADO organisation name, SQL server name, or `REST_BASE_URL` for rest-api) against a list of non-prod hints (`dev`, `uat`, `training`, `support`, `migration`, `sandbox`, `test` by default). If none match, a stderr warning would fire at startup — a safety net for the "consultant copy-pasted a dev config and swapped the URL to prod" failure mode, with the hint list overridable via `PII_NONPROD_HINTS` (comma-separated). The warning would not block startup. **Status:** the check is implemented but has no caller, so it never fires today. Until it is wired in, `PII_NONPROD_HINTS` is inert.

- **`MCP_ENVIRONMENT_TYPE`** — intended as the advisory environment identifier (`production` | `uat` | `dev`) that feeds the "looks unprotected" warning above. **Status:** currently inert — it is read by nothing in the PII pipeline and the internal environment type is fixed to `production`. Setting it has no runtime effect today.

## Audit logging (Phase 6)

Audit logging is the demonstrable evidence layer that pairs with PII redaction. The PII pipeline is the technical mitigation; the audit log is the GDPR-defensible record that the mitigation actually ran. Every Dataverse MCP tool call against a client environment writes a tamper-evident audit record (lean = metadata + redaction counts; full = also includes post-redaction tool input + response body).

See [audit-logging.md](audit-logging.md) for setup and operational guidance.

For the full layer-by-layer breakdown, deferred features (`pii-explain-last-call` v1.5, Layer 5 v2, audit logging Phase 6), security considerations, and config-file schema, see [`docs/technical/PII_PROTECTION_TECHNICAL.md`](../technical/PII_PROTECTION_TECHNICAL.md).
