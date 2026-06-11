<!-- Agents: this is the production-use playbook for `@mcp-consultant-tools/powerplatform-data`.
     Point users here when they ask "I want to use this against production, what do I do?"
     Pre-flight, schema investigation, PII-config generation, sign-off, and the multi-env .mcp.json pattern. -->

# Using `powerplatform-data` Safely in Production

This package performs CRUD against Dataverse. Against a client production environment that holds real personal data, every tool call is a potential GDPR exposure unless the redaction pipeline is configured for that client's specific schema. The default field rules cover stock Dataverse entities (`contact`, `account`, `lead`, `systemuser`); they do NOT cover custom entities, custom fields on stock entities, or custom lookups whose target carries PII.

**Do not connect to production until the workflow below has been executed.** This is the order; skipping a step is what produces silent leaks.

If you are an agent reading this on the operator's behalf — say so, and refuse the production connection until you have walked the operator through every step.

## Pre-flight — never connect to prod first

The most common failure mode is "consultant copies a working `.mcp.json` from another engagement, swaps the `POWERPLATFORM_URL` to the new client's prod, ships." That config carries the previous client's redaction rules and may miss custom fields that hold PII in the new client's data model.

Before any production connection:

1. Confirm you have credentials for **dev or UAT** in the same tenant (or a representative subset of the schema). Production-only access is a blocker — escalate.
2. Confirm `PII_PROTECTION=true` is set in the production config. Protection is opt-in and **off by default** — a missing flag does NOT stop the server; it silently sends raw data to the LLM. Setting it for production is the operator's responsibility. See [pii-protection.md](pii-protection.md#quick-start).
3. Confirm the audit subsystem is configured: `MCP_AUDIT_LEVEL=full`, `MCP_AUDIT_CLIENT=<client-id>`, `MCP_AUDIT_PATH` writable. See [audit-logging.md](audit-logging.md#quick-start).
4. Pin the package to a specific version, not `@beta`. Beta is not production-safe by default — see [`docs/programmes/pii-and-audit/01-principles.md`](../programmes/pii-and-audit/01-principles.md) §1.

## Step 1 — Connect to dev/UAT

Configure `.mcp.json` to point at the client's dev or UAT environment. PII protection can stay on with default rules — the goal here is schema reconnaissance, not data extraction.

> **Note on `MCP_ENVIRONMENT_TYPE`:** it is advisory/documentary only and has **no runtime effect today** — the server fixes the PII environment type to `production` internally and never reads the variable. The configs below set it (`dev`/`production`) to record operator intent and stay forward-compatible, but it changes no behaviour. Do not rely on it as a safety control.

```json
{
  "mcpServers": {
    "pp-data-dev": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data@32.0.0", "mcp-pp-data"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "dev",
        "PII_PROTECTION": "true",
        "MCP_AUDIT_LEVEL": "lean",
        "MCP_AUDIT_CLIENT": "ACME-dev",
        "POWERPLATFORM_URL": "https://acme-dev.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "...",
        "POWERPLATFORM_TENANT_ID": "...",
        "POWERPLATFORM_CLIENT_SECRET": "..."
      }
    }
  }
}
```

Use this server (and only this server) for the schema-investigation phase. All write flags stay off.

## Step 2 — Investigate the schema

The objective: list every field across every entity in scope that may carry PII, including custom fields and custom lookups. Build the list from metadata first, then verify against a single sample row per entity.

### Tables to inspect first

These are the usual suspects in Dynamics deployments. Walk each one even when "we don't use that table" — custom records often link back via lookups.

- `contact` — names, emails, phones, addresses, DOB
- `account` — phones, emails, addresses; rarely names but check `primarycontactid` linkage
- `lead` — same as contact, plus inquiry text
- `systemuser` — operator identity (own staff but still PII)
- Address tables — stock `customeraddress`, plus any custom address entity (`new_address`, `new_address`, etc.)
- Phone / email entities — custom phone-book or marketing-list tables
- Any entity whose name contains `person`, `customer`, `member`, `patient`, `applicant`, `subscriber`, `recipient`
- Custom entities the client has built around their core domain (membership records, KYC records, applications, etc.)

### How to inspect

For each entity:

1. **Pull metadata** via `get-entity-metadata` (entity logical name, e.g. `contact`). Capture `LogicalName` (singular, e.g. `contact`), `EntitySetName` / `LogicalCollectionName` (plural, e.g. `contacts`), `Attributes` (field list with display names + types — including `AttributeType`), and `ManyToOneRelationships` (lookups out of this entity). **Both names matter** — see "Single config across MCPs" below.
2. **Pull one sample row** via `query-records` with `$top=1`. Use `$select=*` (no projection) to see every field returned in practice. The response will be redacted by the dev pipeline using stock defaults — that's fine; you're scanning field NAMES, not values.
3. **Walk the field list and flag PII candidates:**
   - Direct PII: anything under `firstname`, `lastname`, `*name`, `email*`, `*phone*`, `mobile*`, `*address*`, `*postal*`, `birthdate`, `dob*`, `nationalid*`, `passport*`, `nin*`.
   - **Multi-line text fields (`AttributeType: 'Memo'`) — list every one explicitly in `redactInResponse`.** Memo fields exist precisely so users can dump unstructured text (case notes, application narratives, call logs, KYC text, etc.) and almost always carry PII. The technical investigation work agents do here virtually never needs the actual value — having them all redacted is the right default. Add the field NAME to `redactInResponse` (so the field-name redactor handles it via L2). Optionally also list it in `ner.scanFields` if you want NER to extract entity-level findings on top.
   - Lookups whose target carries PII — e.g. `_new_primaryaddressid_value` pointing at a custom address entity. The lookup `@OData.Community.Display.V1.FormattedValue` annotation will leak the formatted display text (typically a person name or address line) unless redacted. **The pipeline redacts FormattedValue annotations via two mechanisms (combined):** (a) explicit — base lookup name is in `redactInResponse`; (b) default-on keyword auto-detect — base name contains any of `address`, `email`, `phone`, `customer`, `contact`, `person`, `name`, `mobile` (case-insensitive substring). Custom lookups whose names don't match the keyword list (e.g. `_new_primaryrecipientid_value` pointing at a contact) must still be added to `redactInResponse` explicitly.
4. **Spot-check the sample row in the response.** Look at the actual JSON keys returned. Anything that wasn't in your candidate list but looks PII-shaped (e.g. a custom field `new_external_reference` that turns out to hold national-insurance numbers) — add it.

### Single config across MCPs — write entity names twice

A single client environment is typically queried via several MCP servers — `powerplatform-data` (Dataverse logical names like `contact`), `azure-sql` (table names = the Dataverse set name `contacts`), `rest-api` (whichever the underlying endpoint exposes). To make ONE config file work across all of them with no per-server forking:

- **For every entity you flag, write TWO top-level keys in `fieldRules`** — the singular `LogicalName` AND the plural `EntitySetName` — both pointing at the same field list:

  ```jsonc
  "fieldRules": {
    "contact":  { "redactInResponse": ["firstname", "lastname", ...] },
    "contacts": { "redactInResponse": ["firstname", "lastname", ...] }
  }
  ```

- The redactor's lookup is a `Set`-membership check on entity name — duplicate keys are free, no schema change required. Each MCP server finds its own vocabulary in the same file.
- All MCPs configured with the same `PII_CONFIG_PATH` AND same `PII_SESSION_SALT` produce identical redaction tokens for identical input values, so cross-server validation works without any side seeing raw PII.
- Full design rationale: [`docs/programmes/pii-and-audit/pending/cross-mcp-config.md`](../programmes/pii-and-audit/pending/cross-mcp-config.md).

### Common gotchas

- **Custom entity prefixes vary by client.** `new_*` is the default Dataverse publisher prefix; clients often use their own (`acme_*`, `contoso_*`). Don't assume the prefix is `new_*`.
- **Yomi-family fields are real on multi-region Dataverse tenants.** `yomifirstname`, `yomimiddlename`, `yomilastname`, `yomifullname` are phonetic-romanisation fields (typically Japanese) and they leak names. Defaults catch them on `contact`/`lead`/`systemuser` (v31.0.0-beta.4+); if your client has yomi fields on custom entities, add them.
- **Marketing-list entities and `listmember` carry contact references.** Worth scanning if marketing data is in scope.
- **Activities (`email`, `phonecall`, `appointment`, `task`, `letter`) carry both content and party-list references.** Free-text `description`, `subject`, `directioncode`, plus `*from`, `*to`, `*cc` party lists — all PII candidates.

## Step 3 — Generate the `PII_CONFIG_PATH` JSON

**Entity keys: singular only.** When generating per-tenant configs, use the
singular logical name as the entity key (`contact`, not `contacts`). The
loader expands singular keys to also resolve plural lookups, so writing both
is redundant. Existing both-keys configs keep working unchanged.

Write a JSON file scoped to this client. Start from the defaults and override `fieldRules` for entities you've identified PII on. Keep the file checked into the client's engagement repo (NOT this monorepo) and reference it by absolute path in the production `.mcp.json`.

The full schema is in [pii-protection.md](pii-protection.md#per-entity-field-rules-via-pii_config_path); the working shape:

```json
{
  "enabled": true,
  "layers": { "l1": true, "l2": true, "l3": true, "l4": true },
  "fieldRules": {
    "contact": {
      "excludeFromSelect": [],
      "redactInResponse": [
        "firstname", "lastname", "middlename", "fullname",
        "yomifirstname", "yomimiddlename", "yomilastname", "yomifullname",
        "emailaddress1", "emailaddress2", "emailaddress3",
        "mobilephone", "telephone1", "telephone2", "telephone3",
        "birthdate",
        "address1_line1", "address1_line2", "address1_line3",
        "address1_city", "address1_postalcode", "address1_country", "address1_stateorprovince", "address1_composite",
        "_new_primaryaddressid_value",
        "new_nationalinsurance",
        "new_dateofbirth_text"
      ]
    },
    "new_application": {
      "excludeFromSelect": [],
      "redactInResponse": [
        "new_applicantname",
        "new_applicantemail",
        "new_applicantphone",
        "_new_applicantcontactid_value"
      ]
    }
  },
  "regex": {
    "email": true,
    "phone": true,
    "dateOfBirth": true,
    "customPatterns": [
      { "name": "uk-domestic-phone", "tokenType": "phone", "pattern": "\\b0[1-9]\\d{8,9}\\b" },
      { "name": "uk-nino", "tokenType": "id", "pattern": "\\b[A-CEGHJ-PR-TW-Z]{2}\\d{6}[A-D]\\b" }
    ]
  },
  "ner": {
    "scanFields": [
      "description", "notetext", "comments", "body", "displayName", "name", "text",
      "new_casenotes", "new_applicationtext"
    ],
    "scanOdataAnnotations": true
  }
}
```

Notes:

- `redactInResponse` is field-name-keyed exact match. Custom lookup base names (e.g. `_new_primaryaddressid_value`) listed here will also have their `@OData.Community.Display.V1.FormattedValue` siblings redacted automatically — that's the mechanism that catches the lookup-display-text leak.
- The built-in regex (Layer 3) covers international `+CC` phones, ISO `YYYY-MM-DD` dates, and standard email shapes. Locale-specific phones and date formats are intentionally NOT built-in (false-positive cost on production data) — add via `regex.customPatterns` only when you have a representative sample to test against. Recipes in [pii-protection.md](pii-protection.md#locale-date-formats--copy-paste-recipes).
- NER (Layer 4) is the most expensive layer. Add custom Memo fields to `ner.scanFields` only when you've confirmed they hold narrative PII; over-broad NER scanning slows every query.
- L1 (`excludeFromSelect`) only filters caller-supplied `$select` projections. It is a defence-in-depth, not a primary control. Leave it empty unless there's a specific field that should NEVER round-trip through the LLM.

## Step 4 — Validate redaction with observe mode

Before flipping to live redaction, run the dev/UAT server with `PII_OBSERVE_MODE=true` and the new config. The pipeline computes what it would redact but returns the original data unchanged.

```bash
PII_PROTECTION=true
PII_OBSERVE_MODE=true
PII_CONFIG_PATH=/abs/path/to/acme-pii.json
```

Re-run the same `query-records` calls you used during reconnaissance. The response footer reports `(observe-mode — values not changed)` along with the redaction counts and fields affected. Check that:

- Every PII field you identified is in the `fieldsAffected` list of the redaction report.
- The redaction-count categories (`name`, `email`, `phone`, `dob`, `text`) line up with what the data actually contains.
- No surprising field is being redacted that shouldn't be (e.g. a status-code label being caught by NER).

If something is missing or over-broad, edit the config and repeat. Iterate here, not in production.

## Step 5 — Operator sign-off

Show the operator three things before flipping to prod:

1. **The full PII config JSON** they're about to ship. They sign off on the field list per entity.
2. **A redacted sample record** for the most sensitive entity (typically `contact`). Pick a row in dev/UAT, run `get-record` against it with the config and `PII_OBSERVE_MODE=false` (i.e. real redaction), and show them both the raw and the redacted forms side by side. They confirm that no raw PII is visible in the redacted form.
3. **The redaction footer** from a representative response. They confirm the counts match what they'd expect.

Capture the sign-off in the engagement's audit trail (ADO ticket comment, engagement note, whatever the client requires). It is the evidence that the consultant validated the pipeline against the client's specific data before connecting to live.

## Step 6 — Flip to production

Add a second `.mcp.json` server entry pointing at production. Keep the dev server entry — multi-environment is the standard pattern.

```json
{
  "mcpServers": {
    "pp-data-dev": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data@32.0.0", "mcp-pp-data"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "dev",
        "PII_PROTECTION": "true",
        "MCP_AUDIT_LEVEL": "lean",
        "MCP_AUDIT_CLIENT": "ACME-dev",
        "PII_SESSION_SALT": "<paste 64-hex-char salt>",
        "POWERPLATFORM_URL": "https://acme-dev.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "...",
        "POWERPLATFORM_TENANT_ID": "...",
        "POWERPLATFORM_CLIENT_SECRET": "...",
        "POWERPLATFORM_ENABLE_CREATE": "true",
        "POWERPLATFORM_ENABLE_UPDATE": "true",
        "POWERPLATFORM_ENABLE_DELETE": "true"
      }
    },
    "pp-data-prod": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform-data@32.0.0", "mcp-pp-data"],
      "env": {
        "MCP_ENVIRONMENT_TYPE": "production",
        "PII_PROTECTION": "true",
        "PII_OBSERVE_MODE": "false",
        "PII_CONFIG_PATH": "/abs/path/to/acme-pii.json",
        "PII_SESSION_SALT": "<paste SAME 64-hex-char salt as dev>",
        "MCP_AUDIT_LEVEL": "full",
        "MCP_AUDIT_CLIENT": "ACME-prod",
        "MCP_AUDIT_OPERATOR": "jdoe@example.com",
        "MCP_AUDIT_PATH": "~/.mcp-audit",
        "MCP_AUDIT_ROTATION": "monthly",
        "POWERPLATFORM_URL": "https://acme.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "...",
        "POWERPLATFORM_TENANT_ID": "...",
        "POWERPLATFORM_CLIENT_SECRET": "...",
        "POWERPLATFORM_ENABLE_CREATE": "false",
        "POWERPLATFORM_ENABLE_UPDATE": "false",
        "POWERPLATFORM_ENABLE_DELETE": "false"
      }
    }
  }
}
```

The standard pattern across environments:

| Environment | Write flags | Audit level | PII protection | Config |
|---|---|---|---|---|
| `dev` | All on | `lean` | `true` (default rules OK) | No `PII_CONFIG_PATH` needed |
| `uat` | All on (sometimes) | `lean` | `true` (full client config) | `PII_CONFIG_PATH` = client config |
| `production` | **All off by default**, enable per-engagement only with explicit operator approval | `full` | `true` (full client config, mandatory) | `PII_CONFIG_PATH` = client config |

Running production with `PII_PROTECTION=false` is a **policy expectation the operator enforces — not a gate the server applies.** There is no refuse-to-start condition: a missing or `false` `PII_PROTECTION` flag does NOT stop the server, and `MCP_ENVIRONMENT_TYPE` has no runtime effect (the server fixes the PII environment type to `production` internally and never reads the variable). A "looks unprotected" stderr warning exists in the codebase but is not currently wired into startup, so nothing fires today. Keeping protection on in production is therefore the consultant's responsibility, verified by the sign-off step above — the server will not catch it for you.

## Cross-MCP token correlation — what `PII_SESSION_SALT` actually does

By default, every MCP server process generates its own random 32-byte salt at startup. The redaction token format is:

```
[REDACTED:{type}:{6-char-hex}]   where 6-char-hex = HMAC-SHA256(salt, raw_value).hex.slice(0, 6)
```

Because the salt differs across processes, the same email tokenises differently in `powerplatform-data` versus `azure-devops` versus `azure-sql` versus `rest-api` versus `azure-b2c`. The agent cannot cross-reference "is this CRM contact also a B2C user?" because the tokens for the same email do not match.

`PII_SESSION_SALT` (introduced in v31.0.0-beta.2, validated in `packages/core/src/pii/config.ts::loadSessionSalt`) lets the operator paste a 64-hex-character (32-byte) value into every MCP server's `env:` block. When set to the same value across servers, every server derives the same HMAC, every server produces identical tokens for the same input, and the agent can correlate identifiers without ever seeing raw values. Validation: if set to a non-empty value, the salt must be exactly 64 hex characters — non-hex characters or wrong length cause the server to refuse to start. Unset, empty (`""`), or whitespace-only falls back to a per-process random salt (no error).

**Implication for production use:** generate one salt per engagement (`openssl rand -hex 32`), paste it into every server in the same `.mcp.json`, and rotate it at the close of the engagement. Persistent shared salts trade weaker forgetability across time for stronger correlation across tools — that's the right tradeoff during an active investigation, the wrong tradeoff for a permanent setup. Don't commit the salt anywhere outside the consultant's `.mcp.json` (which itself should be `.gitignore`d).

## Audit logging — what's recorded, what's redacted

Every Dataverse tool call writes a tamper-evident JSONL record. Levels:

- `lean` — metadata: timestamp, operator, engagement (the ADO work item the consultant set via `set-audit-engagement`), tool name, success/error, duration, redaction counts. No payloads.
- `full` — same as lean plus the **post-redaction** tool input + response body. Recommended for production.

The audit log is post-redaction by design — see [`docs/programmes/pii-and-audit/01-principles.md`](../programmes/pii-and-audit/01-principles.md) §5 ("the audit log is not the breach"). Raw PII never reaches disk through the audit subsystem when redaction is on and configured correctly.

Setup details, the full failure-mode matrix, and `mcp-audit-cli` usage are in [audit-logging.md](audit-logging.md).

### Operator responsibility — filter parameters

The audit redaction stack handles response payloads and tool inputs that flow through the PII pipeline. It does **not** scrub PII the operator deliberately inlines into an OData filter:

```js
query-records({ entityNamePlural: 'contacts', filter: "firstname eq 'Maria Schmidt'" })
```

The literal `Maria Schmidt` lands in `tool.params.filter` of the audit record. This is a documented operator-responsibility gap (Gap 1, resolved as Option C — see [`docs/programmes/pii-and-audit/pending/known-gaps.md`](../programmes/pii-and-audit/pending/known-gaps.md#gap-1--filter-param-leak)).

**Rule:** when constructing filters, look up the GUID first and filter on the ID. Do not paste a name, email, phone number, or any other raw identifier into a `filter` string.

```js
// Wrong — raw name reaches the audit log
query-records({ entityNamePlural: 'contacts', filter: "fullname eq 'Maria Schmidt'" })

// Right — pre-resolve the GUID, filter on the ID
query-records({ entityNamePlural: 'contacts', filter: "contactid eq <guid>" })
```

Agents reading this: enforce the rule. If the user asks you to "find Maria Schmidt's account," your first step is a metadata-shaped resolution (e.g. via a guarded internal lookup that doesn't leave a filter trail) — not pasting the name into Dataverse.

### Lookup `@OData.Community.Display.V1.FormattedValue` annotations

The L2 redactor (`packages/core/src/pii/field-redaction.ts`) redacts `<base>@OData.Community.Display.V1.FormattedValue` siblings via two combined mechanisms:

- **Explicit (Option A):** when the base lookup name is in `redactInResponse`, the FormattedValue sibling is redacted alongside the base field.
- **Default-on keyword auto-detect (Option C):** any FormattedValue whose base lookup name contains a known-PII keyword (case-insensitive substring) is redacted regardless of `redactInResponse`. The keyword list is exported as `LOOKUP_FORMATTED_VALUE_PII_KEYWORDS`: `address`, `email`, `phone`, `customer`, `contact`, `person`, `name`, `mobile`.

A FormattedValue is redacted if **either** mechanism matches. Custom lookups with non-obvious names (e.g. `_new_primaryrecipientid_value` pointing at a contact) won't match the keyword list — add them to `redactInResponse` explicitly.

This is the resolution of Gap 3 (Option A + Option C combined). See [`docs/programmes/pii-and-audit/pending/known-gaps.md`](../programmes/pii-and-audit/pending/known-gaps.md#gap-3--lookup-odatacommunitydisplayv1formattedvalue-annotation-leak) for the design call.

### Plain-field default-on keyword redaction

In addition to the FormattedValue keyword path above, plain (non-annotation) field names are also redacted when their name contains a default keyword. The exported list is `DEFAULT_FIELD_NAME_PII_KEYWORDS` in `packages/core/src/pii/field-redaction.ts` (currently `salutation`).

Vendor-prefix-neutral by design: `salutation`, `acme_salutation`, `new_member_salutation`, `contoso_customer_salutation`, etc. are all redacted automatically — defaults must work across clients regardless of publisher prefix. Per-client custom fields whose name does not contain a default keyword still need explicit listing in `fieldRules.<entity>.redactInResponse`.

## Programme references

- [`docs/programmes/pii-and-audit/00-master-plan.md`](../programmes/pii-and-audit/00-master-plan.md) — phase map and dependency graph for the PII + audit programme
- [`docs/programmes/pii-and-audit/01-principles.md`](../programmes/pii-and-audit/01-principles.md) — programme principles (beta is not production-safe; refuse-to-start over warnings; audit log is not the breach)
- [`docs/programmes/pii-and-audit/pending/known-gaps.md`](../programmes/pii-and-audit/pending/known-gaps.md) — Gap 1 (filter-param, resolved as operator responsibility) and Gap 3 (FormattedValue redaction, resolved as Option A + Option C combined)
- [`docs/programmes/pii-and-audit/pending/cross-mcp-config.md`](../programmes/pii-and-audit/pending/cross-mcp-config.md) — design brief for sharing one PII config file across multiple MCP servers (Dataverse + SQL + REST API) in a single client environment, plus the multi-line auto-redact convention applied above
- [pii-protection.md](pii-protection.md) — full PII pipeline reference, layer-by-layer behaviour, custom regex recipes
- [audit-logging.md](audit-logging.md) — audit subsystem setup, levels, failure modes, `mcp-audit-cli`
- [POWERPLATFORM_DATA.md](POWERPLATFORM_DATA.md) — the minimal user-doc for this package (config + flags + notable behaviour)
- [`docs/technical/PII_PROTECTION_TECHNICAL.md`](../technical/PII_PROTECTION_TECHNICAL.md) — full layer reference with config schema
- [`docs/technical/AUDIT_LOGGING_TECHNICAL.md`](../technical/AUDIT_LOGGING_TECHNICAL.md) — full audit subsystem reference
