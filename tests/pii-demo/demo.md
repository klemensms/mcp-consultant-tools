# PII Protection — What the Agent Sees

A walkthrough of the v1 redaction pipeline (`@mcp-consultant-tools/powerplatform-data` v31.0.0-beta.4) using real Dataverse responses captured against the seeded fixtures in `acmedev.crm.dynamics.com`.

This document is the audience-facing answer to one question: **when the agent queries or modifies PII-rich data, what actually reaches the LLM?**

> Reproducible: every block below comes from `output/responses/{scenario}__{query}.txt`. To regenerate, follow the protocol in `README.md` and run `node tests/pii-demo/output/_build-manifest.mjs`.

## What's new in beta.4 (v1.5 follow-on findings closed)

The beta.3 demo regen surfaced four follow-up findings (F4–F7). All four are addressed in **beta.4** and reflected in this revision:

- **F4 — `yomifullname` redacts on contact writes.** The phonetic-romanisation full name (typically Japanese / Yomi) was leaking on `update-record` responses through beta.3 because it wasn't in the default L2 contact rules. Added in beta.4 alongside `yomifirstname`, `yomimiddlename`, `yomilastname`, `middlename`. Q5 below shows the field tokenising correctly under every protected scenario *except* `l1-exclusion`, which evidences the override-replacement gotcha (see "Known v1 limits" below).
- **F5 — `[PII protection: …]` audit footer on write responses.** Beta.3 redacted the body but the audit-trail metric line was absent on `update-record` / `create-record` / `execute-action` / `get-record` (and on the azure-devops work-item write tools). Beta.4 wires the footer end-to-end. Q5 now ends with `[PII protection: 6 names + 3 emails + 3 dobs + 2 phones redacted by L2/L3/L4]` under the full-v1 scenario.
- **F6 — Locale date formats.** Decision recorded: **kept as `customPatterns`-only** for the same reason F2 was closed that way — global string-scanning regex for non-ISO date shapes produces too many false positives at scale (build numbers, version strings, timestamps). The `pii-protection.md` doc gains a new "Locale date formats — copy-paste recipes" subsection with a vetted 5-pattern config (English long/short month, German `DD.MM.YYYY`, UK `DD/MM/YYYY`, US `MM/DD/YYYY`).
- **F7 — Audit other Yomi-pattern fields.** The Yomi family is now in defaults for `contact`, `lead`, and `systemuser`. `lead` had **no** default rule set previously and is now mirrored on `contact`. `account` picked up `telephone1/2/3`.

**Still pending (carries to v1.6):** the same audit-footer extension for `azure-sql` and `rest-api` tool layers (services already wrap `piiReport`, only the tool layer discards) — out of scope for this demo because those surfaces aren't exercised here.

## What's new in beta.3 (v1 demo-surfaced findings closed)

beta.1/.2 of v31 ran this demo with 24 calls and surfaced three follow-ups. All three were addressed in **beta.3** and reflected in this revision:

- **Finding 1 — OData FormattedValue annotations** are now in scope. The `Prefer: odata.include-annotations="*"` header is set on the four `DataService` read paths, so lookup-display annotations like `_primarycontactid_value@…FormattedValue: "Maria Schmidt"` and `birthdate@…FormattedValue: "3/12/1985"` reach the pipeline and get redacted by L4 NER / L2 / L3 as appropriate. Q4 demonstrates this end-to-end.
- **Finding 2 — Custom regex extension** is documented. `customPatterns` in the PII config lets ops add locale-specific date formats, UK domestic phones, national-ID shapes, etc. without forking. Built-in regex is deliberately conservative; the doc shows the worked example (and beta.4's F6 expanded this with copy-paste recipes for common locales).
- **Finding 3 — Write-path redaction.** `update-record`, `create-record`, `get-record`, and `execute-action` run the same pipeline as reads. Q5 evidences this: an `update-record` returns the full updated entity (Dataverse `Prefer: return=representation`), and the response body is redacted identically to a read.

## TL;DR

| Layer | What it does | Where it operates |
| --- | --- | --- |
| **L1** — query-time exclusion | Strips configured fields from the OData `$select` before the request leaves. The data is never collected from Dataverse. | Wire (request side) |
| **L2** — configured-field redaction | Replaces values in known PII fields with synthetic tokens. | Response shape |
| **L3** — regex on free text | Catches structured PII (email, phone, DOB-shape) in any string regardless of field name. | Free text |
| **L4** — NER on free text | Catches person names that don't match any pattern, in free-text fields. | Free text |
| **Observe mode** | Pipeline runs but values pass through unchanged. Footer reports what would have been redacted. | Audit / pre-flight |

Each layer catches what the previous one missed. The four work as a defense-in-depth stack on **both** read and write paths — including the write-path audit footer added in beta.4.

## The seeded fixtures

Five records were created in the test environment with deliberate PII shapes:

- **Maria Schmidt** (contact, GUID `91484a2f-…`) — German PII. Configured-field PII (firstname, lastname, email, birthdate, mobile, **plus the new yomi family from beta.4**) and her `description` packs an embedded English email, a German colleague's name (Klaus Müller), and a future date that looks like a DOB.
- **John Smith** (contact) — English baseline.
- **Klaus Müller** (contact) — Unicode-name handling.
- **Contoso Deutschland GmbH** (account) — `_primarycontactid_value` lookup pointing at Maria.
- **Annotation note on Maria** — free-text `notetext` containing a date, two person names, an email, and a phone number all in one field.

The annotation entity is the most demanding test: it has **no per-entity field rules** in the default config (because note-text is generic across all entity types), so L2 alone cannot redact it — L3 + L4 must do all the work.

---

## Query 1 — Get Maria Schmidt by lastname (configured fields)

Query: `query-records contacts $filter=lastname eq 'Schmidt' $select=firstname,lastname,emailaddress1,birthdate,mobilephone,description`

### No protection (baseline — what the LLM sees without the pipeline)

```json
{
  "firstname": "Maria",
  "lastname": "Schmidt",
  "emailaddress1": "maria.schmidt@contoso.de",
  "birthdate@OData.Community.Display.V1.FormattedValue": "3/12/1985",
  "birthdate": "1985-03-12",
  "mobilephone": "+49 30 12345678",
  "description": "Spoke with Maria Schmidt about the Q1 issue. She mentioned john.smith@example.com is the right contact at the partner. Her German colleague Klaus Müller is on holiday until 2026-05-15."
}
```

No footer. The agent has full identifying information for Maria, plus the names and email of two other people mentioned in her description. The `birthdate@…FormattedValue` annotation is in scope of the response (closed in beta.3) — also a leak.

### L2 only — configured fields tokenised, free text untouched

```json
{
  "firstname": "[REDACTED:name:1eaad8]",
  "lastname": "[REDACTED:name:135050]",
  "emailaddress1": "[REDACTED:email:06aab6]",
  "birthdate@OData.Community.Display.V1.FormattedValue": "[REDACTED:dob:4ca780]",
  "birthdate": "[REDACTED:dob:459d0a]",
  "mobilephone": "[REDACTED:phone:8a591e]",
  "description": "Spoke with Maria Schmidt about the Q1 issue. She mentioned john.smith@example.com is the right contact at the partner. Her German colleague Klaus Müller is on holiday until 2026-05-15."
}
```

Footer: `[PII protection: 2 names + 1 email + 2 dobs + 1 phone redacted by L2]`

L2 catches the configured fields cleanly — including the `birthdate@…FormattedValue` annotation, since the pipeline treats the annotation suffix as part of the same "birthdate" rule. **But the description field still leaks "Maria Schmidt", "john.smith@example.com", "Klaus Müller", and a DOB-shape date.** Field-rule-only protection is insufficient for free-text content.

### L2 + L3 — adds regex on free text

```json
{
  "firstname": "[REDACTED:name:4c2783]",
  "lastname": "[REDACTED:name:500829]",
  "emailaddress1": "[REDACTED:email:0e6738]",
  "birthdate@OData.Community.Display.V1.FormattedValue": "[REDACTED:dob:f497f1]",
  "birthdate": "[REDACTED:dob:c5fffa]",
  "mobilephone": "[REDACTED:phone:2793d3]",
  "description": "Spoke with Maria Schmidt about the Q1 issue. She mentioned [REDACTED:email:5db5c8] is the right contact at the partner. Her German colleague Klaus Müller is on holiday until [REDACTED:dob:acb959]."
}
```

Footer: `[PII protection: 2 names + 2 emails + 3 dobs + 1 phone redacted by L2/L3]`

Regex picks up the embedded email and the date in `description`. **But the names "Maria Schmidt" and "Klaus Müller" are still visible** — regex can't reliably detect person names without a named-entity recogniser.

### Full v1 (L1 + L2 + L3 + L4)

```json
{
  "firstname": "[REDACTED:name:e517e8]",
  "lastname": "[REDACTED:name:678a13]",
  "emailaddress1": "[REDACTED:email:45b53f]",
  "birthdate@OData.Community.Display.V1.FormattedValue": "[REDACTED:dob:266e26]",
  "birthdate": "[REDACTED:dob:14ac52]",
  "mobilephone": "[REDACTED:phone:117e63]",
  "description": "Spoke with [REDACTED:name:4dc861] about the Q1 issue. She mentioned [REDACTED:email:a04cd1] is the right contact at the partner. Her German colleague [REDACTED:name:749c66] is on holiday until [REDACTED:dob:c99ff6]."
}
```

Footer: `[PII protection: 4 names + 2 emails + 3 dobs + 1 phone redacted by L1/L2/L3/L4]`

**This is the v1 default.** Layer 4 NER catches "Maria Schmidt" and "Klaus Müller" in the description. The agent sees a structured record where every PII slot has been replaced with an opaque token, but the *shape* of the conversation is preserved — the agent can still reason about which person/colleague/partner is referenced and trace the relationships, just without seeing the raw values.

### L1 — query-time exclusion (data never collected)

Custom config strips `firstname`, `lastname`, `birthdate`, `mobilephone` from the OData `$select` before the request is sent.

```json
{
  "emailaddress1": "[REDACTED:email:f93ab0]",
  "description": "Spoke with [REDACTED:name:77b45f] about the Q1 issue. She mentioned [REDACTED:email:728f6c] is the right contact at the partner. Her German colleague [REDACTED:name:9a7164] is on holiday until [REDACTED:dob:c51933]."
}
```

Footer: `[PII protection: 4 excluded_fields + 2 emails + 1 dob + 2 names redacted by L1/L2/L3/L4]`

Notice the four configured fields are **completely absent** — not redacted, missing. Dataverse never returned them because Dataverse was never asked. The strongest GDPR posture: data not collected at all.

The fields that *can't* be excluded (`emailaddress1`, `description` — needed for context) are redacted by the downstream layers.

### Observe mode — pipeline runs, data unchanged

```json
{
  "firstname": "Maria",
  "lastname": "Schmidt",
  "emailaddress1": "maria.schmidt@contoso.de",
  "birthdate@OData.Community.Display.V1.FormattedValue": "3/12/1985",
  "birthdate": "1985-03-12",
  "mobilephone": "+49 30 12345678",
  "description": "Spoke with Maria Schmidt about the Q1 issue. She mentioned john.smith@example.com is the right contact at the partner. Her German colleague Klaus Müller is on holiday until 2026-05-15."
}
```

Footer: `[PII protection: 4 names + 3 emails + 4 dobs + 2 phones redacted by L1/L2/L3/L4 (observe-mode — values not changed)]`

Used as a **pre-flight check** before flipping protection on for a new tenant. The agent still sees the raw data, but the footer reports what *would* have been redacted. Lets the operator validate the rules cover everything they expect before going live.

> The footer counts can be higher than full mode (4 dobs vs 3, 3 emails vs 2). When redaction is on, L2 replaces a value first and L3/L4 see the synthetic token, so they don't double-count. When observe runs without redaction, every layer detects every match independently. The diff is informational — observe-mode counts upper-bound the real redaction work.

---

## Query 2 — Cross-call correlation (same Maria, different filter)

Query: `query-records contacts $filter=firstname eq 'Maria' $select=firstname,lastname,emailaddress1`

The same Maria, queried by a different filter. **Within the same MCP server process** the tokens for "Maria" and "Schmidt" must match across calls — otherwise the agent loses track of "is this the same person we just looked at?"

| Scenario | firstname token | lastname token | Matches Q1? |
| --- | --- | --- | --- |
| no-protection | `Maria` | `Schmidt` | identity check (raw == raw) ✓ |
| l1-exclusion | (field absent) | (field absent) | — |
| l2-only | `[REDACTED:name:1eaad8]` | `[REDACTED:name:135050]` | ✓ matches Q1 |
| l2-l3 | `[REDACTED:name:4c2783]` | `[REDACTED:name:500829]` | ✓ matches Q1 |
| full-l1-l4 | `[REDACTED:name:e517e8]` | `[REDACTED:name:678a13]` | ✓ matches Q1 |
| observe-mode | `Maria` | `Schmidt` | identity check (raw == raw) ✓ |

Tokens are different across scenarios because each MCP server process has its own random salt. **They are deterministic within a single process lifetime** — that's what makes the agent's reasoning still work across multiple tool calls. Restart the server and the salt rotates, breaking long-term correlation by design (privacy boundary).

The same correlation property holds across read AND write paths (closed in beta.3). The token for "Maria" in Q1 (read) matches the token in Q5 (write response) within the same process.

---

## Query 3 — Annotation note (the hardest test)

Query: `query-records annotations $filter=_objectid_value eq <Maria's GUID> $select=subject,notetext`

Annotations carry free-text notes. The `notetext` is shared across all entity types, so there's no per-entity field rule that can address it — L3 + L4 must do all the work.

### No protection

```
Customer reported issue 2026-04-15. Spoke with Maria Schmidt at maria.schmidt@contoso.de, mobile +49 30 12345678. DOB confirmed 12 March 1985. Original escalation came from John Smith (john.smith@example.com).
```

Embedded: 1 date, 2 person names, 1 email (twice in different forms), 1 phone, 1 DOB-shape date.

### L2 only — **nothing redacted**

```
Customer reported issue 2026-04-15. Spoke with Maria Schmidt at maria.schmidt@contoso.de, mobile +49 30 12345678. DOB confirmed 12 March 1985. Original escalation came from John Smith (john.smith@example.com).
```

Footer: `[PII protection: nothing redacted]`

Strong demonstration of the limits of field-rule-only protection. The annotation entity has no field rules in v1, so L2 has nothing to do. Every piece of PII passes through.

### L2 + L3 — regex catches the structured patterns

```
Customer reported issue [REDACTED:dob:c425cf]. Spoke with Maria Schmidt at [REDACTED:email:0e6738], mobile [REDACTED:phone:2793d3]. DOB confirmed 12 March 1985. Original escalation came from John Smith ([REDACTED:email:5db5c8]).
```

Footer: `[PII protection: 2 emails + 1 phone + 1 dob redacted by L2/L3]`

Regex catches both emails, the phone, and the YYYY-MM-DD date. **"Maria Schmidt" and "John Smith" remain visible.** "12 March 1985" remains visible — it's a date but not in the YYYY-MM-DD pattern the v1 regex matches (a known limit; `customPatterns` is the documented escape hatch — see beta.4 docs for copy-paste recipes covering this exact format).

### Full v1 (L4 NER closes the gap)

```
Customer reported issue [REDACTED:dob:d34222]. Spoke with [REDACTED:name:4dc861] at [REDACTED:email:45b53f], mobile [REDACTED:phone:117e63]. DOB confirmed 12 March 1985. Original escalation came from [REDACTED:name:372cec] ([REDACTED:email:a04cd1]).
```

Footer: `[PII protection: 2 emails + 1 phone + 1 dob + 2 names redacted by L1/L2/L3/L4]`

NER catches "Maria Schmidt" and "John Smith". **"DOB confirmed 12 March 1985" still passes through unchanged** — neither L3 (date format mismatch) nor L4 (NER doesn't classify dates). This is a known v1 limitation; the documented `customPatterns` extension covers locale dates without code changes (now with copy-paste recipes in `docs/documentation/pii-protection.md` as of beta.4).

---

## Query 4 — Account with primary-contact lookup (FormattedValue annotation NER)

Query: `query-records accounts $filter=name eq 'Contoso Deutschland GmbH' $select=name,emailaddress1,_primarycontactid_value`

Tests whether OData FormattedValue annotations on lookup fields surface the related contact's display name (the "relationship name problem" called out in the v1 plan, **closed in beta.3 by Finding 1**).

### No protection — annotation in scope

```json
{
  "name": "Contoso Deutschland GmbH",
  "emailaddress1": "info@contoso.de",
  "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "Maria Schmidt",
  "_primarycontactid_value": "91484a2f-7f44-f111-bec5-6045bdf2343f"
}
```

Dataverse returns the GUID and the FormattedValue display name. **In beta.1/.2 the FormattedValue was suppressed** because the read path didn't ask for annotations; beta.3's `Prefer: odata.include-annotations="*"` change makes it visible — and therefore reachable by the pipeline.

### L2 only — annotation passes (no L4 NER)

```json
{
  "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "Maria Schmidt",
  "emailaddress1": "[REDACTED:email:eb06d2]",
  "name": "Contoso Deutschland GmbH"
}
```

Footer: `[PII protection: 1 email redacted by L2]`

L2 catches the configured `emailaddress1`. **The `_primarycontactid_value@…FormattedValue: "Maria Schmidt"` annotation is still visible** — there's no L2 field rule for the relationship-name-suffix pattern, and L3/L4 aren't enabled in this scenario.

### L2 + L3 — same gap

```json
{
  "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "Maria Schmidt",
  "emailaddress1": "[REDACTED:email:7d02a1]",
  "name": "Contoso Deutschland GmbH"
}
```

Footer: `[PII protection: 1 email redacted by L2/L3]`

Regex doesn't match person names. The annotation still leaks "Maria Schmidt".

### Full v1 (L4 NER closes the relationship-name gap)

```json
{
  "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "[REDACTED:name:4dc861]",
  "_primarycontactid_value": "91484a2f-7f44-f111-bec5-6045bdf2343f",
  "emailaddress1": "[REDACTED:email:744ba2]",
  "name": "Contoso Deutschland GmbH"
}
```

Footer: `[PII protection: 1 email + 1 name redacted by L1/L2/L3/L4]`

NER picks up "Maria Schmidt" in the FormattedValue annotation and tokenises it. **Cross-query token consistency holds**: the token `[REDACTED:name:4dc861]` here is the same token used for "Maria Schmidt" in Q1's description, Q3's annotation note, AND Q5's update-record yomifullname/fullname/description fields within the same process — the agent can chain reasoning ("the account's primary contact is the same person we just looked up and updated") without seeing the name.

The company name "Contoso Deutschland GmbH" is **not** redacted in any scenario. NER classifies it as ORG and the v1 default is to redact persons only — orgs and product names pass through. This is the right default; redacting company names breaks investigation context.

---

## Query 5 — Update Maria (write-path redaction + audit footer, beta.4)

Query: `update-record contacts <Maria's GUID> {jobtitle: "Senior Consultant"}`

Sets a single field. Because `DataService.updateRecord` includes `Prefer: return=representation`, Dataverse echoes the **full updated entity** back in the response — ~140 fields including every classic PII attribute on Maria. This is the demoable case for beta.3's Finding 3 (write-path redaction) and beta.4's F4 + F5 (yomi family + audit footer).

### No protection (baseline)

The response body shows Maria's plaintext data (truncated to PII-relevant fields):

```json
{
  "firstname": "Maria",
  "lastname": "Schmidt",
  "emailaddress1": "maria.schmidt@contoso.de",
  "yomifullname": "Maria Schmidt",
  "fullname": "Maria Schmidt",
  "birthdate@OData.Community.Display.V1.FormattedValue": "3/12/1985",
  "birthdate": "1985-03-12",
  "mobilephone": "+49 30 12345678",
  "description": "Spoke with Maria Schmidt about the Q1 issue. She mentioned john.smith@example.com is the right contact at the partner. Her German colleague Klaus Müller is on holiday until 2026-05-15.",
  "jobtitle": "Senior Consultant"
}
```

In beta.1/.2 this is what every scenario returned, regardless of pipeline config — the write path was not wrapped. **Finding 3 closed in beta.3.** Through beta.3, `yomifullname` still leaked raw and the audit footer was missing on writes — both closed in beta.4.

### L2 + L3 + L4 (full v1) — beta.4 closures visible

```json
{
  "firstname": "[REDACTED:name:e517e8]",
  "lastname": "[REDACTED:name:678a13]",
  "emailaddress1": "[REDACTED:email:45b53f]",
  "yomifullname": "[REDACTED:name:4dc861]",
  "fullname": "[REDACTED:name:4dc861]",
  "birthdate@OData.Community.Display.V1.FormattedValue": "[REDACTED:dob:266e26]",
  "birthdate": "[REDACTED:dob:14ac52]",
  "mobilephone": "[REDACTED:phone:117e63]",
  "description": "Spoke with [REDACTED:name:4dc861] about the Q1 issue. She mentioned [REDACTED:email:a04cd1] is the right contact at the partner. Her German colleague [REDACTED:name:749c66] is on holiday until [REDACTED:dob:c99ff6].",
  "jobtitle": "Senior Consultant"
}
```

Footer: `[PII protection: 6 names + 3 emails + 3 dobs + 2 phones redacted by L2/L3/L4]`

Two beta.4 closures visible at once:

- **F4 closed.** `yomifullname` now tokenises as `[REDACTED:name:4dc861]` — the *same* token as `fullname` and the description's "Maria Schmidt" mention, because all three values are the literal string "Maria Schmidt" hashed under the same per-process salt.
- **F5 closed.** The response now ends with the `[PII protection: …]` footer carrying the per-call redaction count. An operator validating "did the pipeline actually fire on this write?" can see at a glance whether redaction ran — instead of having to compare body text to a known PII shape.

The body is redacted **identically to a read** of the same record. Tokens match Q1/Q3/Q4 within the process — write-path tokens correlate with read-path tokens, which is the property that lets an agent reason about "the record I just updated" across the read→write boundary.

### Both findings closed in beta.4

The pre-beta.4 demo flagged two findings on this query:

1. **`yomifullname` not redacted** — closed in beta.4 by adding the Yomi family (`yomifirstname`, `yomimiddlename`, `yomilastname`, `yomifullname`, plus `middlename`) to the default L2 contact rules in `packages/core/src/pii/config.ts`. Same yomi family also added to default `lead` and `systemuser` rules per F7.
2. **No `[PII protection: …]` footer on write responses** — closed in beta.4 by refactoring `DataService.{getRecord,createRecord,updateRecord,executeAction}` to embed `piiReport` as a sibling key on the result object, then having the `powerplatform-data` tool layer extract it and append `formatSummaryFooter(piiReport)` to the response text. Same pattern applied to `azure-devops` work-item-tools (`get-work-item`, `query-work-items`, `add-work-item-comment`, `update-work-item-comment`, `update-work-item`, `create-work-item`).

The same write-path pattern applies to `azure-sql` (`sql-execute-sproc`, `sql-execute-unrestricted`) and `executeAction` on Dataverse and `rest-api` (`rest-request`) — all of which are wired through `redactResponse` since beta.3 but the **footer extension** for SQL + REST tool layers carries to v1.6 (out of scope here because those surfaces aren't exercised by this demo).

---

## Cross-cutting findings

1. **L1 is the strongest GDPR posture but has scope.** Field-exclusion only works for fields that are well-typed PII *and* not needed for the agent's investigation. For `description` / `notetext` style free text, L1 isn't an option — the field is needed for context, you just want the values inside it tokenised.

2. **L2 + L3 + L4 combine multiplicatively.** L2 catches 100 % of configured fields cheaply. L3 picks up ~80 % of free-text PII (anything email-shaped, phone-shaped, ISO-date-shaped). L4 catches the remaining ~20 % (person names that don't fit any pattern). Each layer's job gets smaller as you add the next.

3. **Cross-call correlation works as designed, on read AND write.** Same person → same token within one process, across query→update boundaries. Different processes → different tokens. The agent can reason about identity across multiple tool calls without the platform retaining any mapping.

4. **The annotation entity proves defense in depth.** With L2 only, the annotation note leaks every PII shape it contains. With L2 + L3 + L4, every PII shape except locale-specific date formats is caught. **No single layer is sufficient.**

5. **Observe-mode footer counts upper-bound the real work.** Useful for "what would happen if we turned protection on" planning. Don't compare them directly to redaction-on counts.

6. **Closed in beta.3:** annotations are in scope (Finding 1 → Q4); custom regex extension is documented (Finding 2); write paths are redacted (Finding 3 → Q5).

7. **Closed in beta.4:** Yomi family (`yomifullname` etc.) redacts by default on `contact` / `lead` / `systemuser` (F4 + F7); write-path responses now emit the `[PII protection: …]` audit footer (F5) on `powerplatform-data` and `azure-devops` write tools; locale date formats kept as `customPatterns`-only with copy-paste recipes added to the user doc (F6).

## Known v1 limits surfaced by the demo

- **Locale-specific date formats** ("12 March 1985", "12.03.1985") not caught by built-in L3 → use `customPatterns` in PII config to extend without forking. Documented in `docs/documentation/pii-protection.md` (beta.4 added a "Locale date formats — copy-paste recipes" subsection covering English long/short month, German `DD.MM.YYYY`, UK `DD/MM/YYYY`, US `MM/DD/YYYY`).
- **`PII_CONFIG_PATH` overrides are not additive** — observable in scenario 2 (`l1-exclusion`) of Q5: `yomifullname` returns raw "Maria Schmidt" because the custom config carries the pre-beta.4 contact field list (no Yomi family). The other protected scenarios (l2-only, l2-l3, full-l1-l4) use built-in defaults and redact correctly. Workaround: either remove the `contact` entry from your `PII_CONFIG_PATH` to inherit defaults, or carry the new Yomi-family lines forward in your override. Documented in `pii-protection.md`.
- **Audit footer not yet emitted on `azure-sql` or `rest-api` tool layers.** Services already wrap `piiReport`, only the tool layer discards. Same mechanical fix as the beta.4 `powerplatform-data` / `azure-devops` extension — tracked for v1.6 once those surfaces are exercised by the demo.

## Out of scope

- **Layer 5** (local-LLM final sweep) — deferred to v2 once L1–L4 has at least one engagement of usage.
- **Phase 6** (audit & compliance logging) — separate session. The footer text in every response is the redaction *correlation* signal; Phase 6 will persist these as tamper-evident audit records (metadata + counts only, never values).
- **Other surfaces with write-path redaction wired in beta.3 but footer not yet emitted in tools (carries to v1.6)**: `azure-sql` (`sql-execute-sproc`, `sql-execute-unrestricted`, CRUD tools), `rest-api` (`rest-request`). Same pipeline, same defaults — will be added to this demo when test fixtures are seeded.

## Reproducing this document

The data lives in `tests/pii-demo/output/`. To regenerate:

1. Re-seed fixtures into a Dataverse test tenant if not already present (see `README.md` "Fixtures" table for the IDs and exact field values).
2. Configure 6 MCP servers in `.mcp.json` (see `README.md` "Method A"). For Q5 (write-path), the demo MCPs need `POWERPLATFORM_ENABLE_UPDATE=true`.
3. Restart Claude Code.
4. Fire the 30-call matrix from a single prompt against the `mcp__pii-demo-N-*__query-records` and `…__update-record` tools (5 queries × 6 scenarios).
5. Persist the responses to `tests/pii-demo/output/responses/` using the naming convention `{scenario}__{query}.txt`.
6. Run `node tests/pii-demo/output/_build-manifest.mjs` to regenerate `manifest.json`.

This document is hand-curated. The HTML visual explainer at `tests/pii-demo/demo.html` is the styled equivalent for stakeholder reads (built from the same data via the visual-explainer skill).
