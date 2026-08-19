# CLI assurance remediation plan

Remediation queue for defects found during two live assurance runs (roughly 700 CLI
invocations across six CLIs). Source report is held outside this repo and is not
reproduced here; every defect below is restated in this repo's own sanctioned terms.
All counts are real and measured, and carry nothing that identifies the estate.

## The failure mode that unites these

Roughly 22 of the first 29 defects **fail towards a clean-looking result rather than
towards an error**. A wrong number that looks like good news is not cross-checked on
an engagement, so the report reads as an all-clear. Two defects invert this and
manufacture false alarm instead.

## Acceptance criterion — applies to every task below

For each fix, add a test that asserts the **failure** case, not just the success case:

- A truncated result must not be indistinguishable from a complete one.
- A filtered result must not be indistinguishable from an empty one.
- A partially-authorised collection must not be indistinguishable from a fully-authorised one.

A fix that only proves the happy path does not close its task.

## Done

- [x] **X3 · one truncation contract** across `powerplatform` list commands. Shipped in
      `v35.0.0-beta.17`. Closed D1, D2, D3, D4 and D6. See
      `docs/release-notes/v35.0.0-beta.17.md`.
- [x] **T1 · D5 — `plugin trace-logs --exception-only`**. Filter now excludes the empty
      string as well as null, and the payload carries `exceptionCount` alongside
      `totalCount`. Not yet published; lands on `release/35.0`.
- [x] **T2 · X2 — aggregate failure counts**, scoped as planned to the shared contract
      plus one package. `FanOutRecorder` / `fanOutSuffix` in `@mcp-consultant-tools/core`,
      `outputResult` exits 1 on a payload whose fan-out lost items, and all 15 swallowing
      `catch` blocks in `azure-management` now report. The remaining packages are the
      unscheduled sweep in register item 2.
- [x] **T7 · D12 — `--include-configuration` fails silently**. Closed by T2 in the same
      edit: the 403s are now counted and named, and each site carries
      `configurationUnavailable: true` so a blank cannot read as "no settings".
- [x] **T3 · D8 — `graph role-assignments` resolves no role name**. The lookup now joins
      on the trailing GUID rather than the whole id, because the two sides carry
      different scope prefixes. A wholly unresolved result declares itself via
      `summary.note`, and `roleDefinitionsFound` separates "lookup returned nothing"
      from "returned definitions that did not match". Root cause is inferred from the
      measured evidence, not confirmed live - see register item 11.
- [x] **T4 · D9 — `networking event-grid-topics` reports zero while topics exist**.
      `includeSystemTopics` now decides whether system topics are **listed**, not whether
      they are **looked for**, so `summary.total` is what exists and `summary.listed` is
      what came back. `summary.note` names the shortfall, and both queries run through
      `FanOutRecorder`, so a refused or unregistered provider sets
      `systemTopicsUnavailable` / `customTopicsUnavailable` and exits 1 rather than
      shrinking the counts. Costs one extra ARM list call per invocation, deliberately.
      Unit-verified only - no Azure credentials on this machine. See register item 12.
- [x] **T5 · D21 — `fn stats` triple-counts every function**. `collapseFunctionStats`
      strips the `Functions.` prefix, drops blank-named host rows, and keeps the
      highest-counting variant **whole** so `SuccessRate` stays consistent with the counts
      beside it. Reports the reshaping in a `normalization` block, appended by hand to
      every markdown surface because `formatTableAsMarkdown` keeps only the tables.
      `UniqueFunctions` is dropped from the query: inside a `by FunctionName` summarize it
      was always 1. See register item 13.
- [x] **T6 · D20 — `workspace metadata` returns the schema catalogue, not the workspace's
      tables**. Both halves of the plan's suggested fix, because the command was answering a
      different question from the one it was asked. `la-get-metadata` declares its own scope
      (`scope.kind: 'schema-catalogue'`, the table count, and a note naming where the other
      answer lives), including in the CLI summary line. `la-list-workspace-tables` (CLI:
      `workspace tables`) is new and answers what the workspace actually holds, from
      `Usage | summarize by DataType, QuantityUnit`. A zero is scoped to its window and to
      ingestion-metered data, both stated. 14 tools now. See register items 16 and 17.
- [x] **T8 · D22 — `query error-summary --table FunctionAppLogs` builds an invalid query**.
      Root cause: the dedupe branch grouped by `InvocationId`, an Application Insights
      column. `FunctionAppLogs` names it `FunctionInvocationId` and has no `OperationId` at
      all. The query API resolves column names before it reads a row, which is why the
      failure was identical on every workspace regardless of what the table held. Both
      halves of the plan's fix: the column is corrected, **and** an unsupported `--table`
      now throws naming the supported set instead of falling through to the
      `FunctionAppLogs` shape, so a typo can no longer answer about a different table. The
      four query shapes moved out of the two call sites into
      `utils/error-summary-query.ts`, because they were written out twice and a test had no
      single string to assert against. The failure-case test checks every column each shape
      reads against the documented schema of its table, so it fails on the shape that
      shipped and closes the class rather than the instance. The output now names whichever
      dedupe key was used rather than claiming `OperationId` everywhere. The technical doc's
      own `FunctionAppLogs` schema block was wrong the same way and seeded the defect - it
      is corrected. Unit-verified only. See register items 18 to 21.
- [x] **T15 · D7 — `plugin get` returns a different assembly shape from `plugin list`**.
      Both calls now go through `formatPluginAssembly` in `powerplatform-core`'s
      `PluginService.ts`, with `formatPluginAssemblyDetail` adding the columns only
      `plugin get` selects (`description`, `culture`, `publicKeyToken`, `sourceType`,
      `createdOn`, `isHidden`). Nothing the two shapes share is named differently, and the
      raw lowercase keys and `@odata.etag` are dropped rather than carried beside the
      decoded ones. Two consumers **inside this repo** were reading the raw shape and are
      updated - the `gen-plugin-deployment-report` prompt and
      `powerplatform-customization`'s deployment-status tool - and both had a second
      defect the shared decoder fixes: `isolationmode === 2 ? 'Sandbox' : 'None'` printed
      an External assembly as None. An unrecognised isolation mode now reports
      `Unknown (<value>)` instead of falling through to `External`. Unit-verified only.
      See register items 22 to 24.
- [x] **T10 · D14 — assessment list omits identity- and subscription-scoped assessments**.
      The cause is not a filter in this repo's code: the ARM list at subscription scope
      enumerates assessments on resources **inside** the subscription, and neither an
      identity object nor the subscription itself is one, so those rows were never in the
      response. `listAssessments` now reads Resource Graph's `securityresources` as a second
      source and unions the two on the **lower-cased** assessment id (Resource Graph
      lower-cases every id it returns; ARM does not). A union rather than a replacement,
      because Resource Graph returns nothing on a subscription with no paid Defender plan
      where ARM still returns data - the plan's reverse blind spot. `summary.sources`
      measures each source's blind spot on every call, and the Resource Graph read goes
      through `FanOutRecorder`, so a refusal names itself in `summary.note` and
      `fanOut.failures` and exits 1 instead of quietly returning the ARM-only set.
      `maxResults` is no longer handed to the ARM list: the cut would fall on ARM's rows and
      take out exactly what the second source recovers. The Resource Graph POST moved to
      `utils/resource-graph.ts`, shared with attack paths, and follows `$skipToken` up to 20
      pages. Unit-verified only. See register items 27 to 30.
- [x] **T11 · D15 — `attack-path` drops the entire risk payload**. Cause: `mapAttackPathRow`
      mapped a fixed allowlist of `properties` keys taken from Microsoft's published
      attack-path field table, and discarded every key off it. Live rows on a tenant whose
      attack paths come from Microsoft Security Exposure Management carry a different,
      **undocumented** set - `riskLevel`, `riskFactors`, `entryPoint`, `target`,
      `attackPathSteps`, `mITRETacticsAndTechniques`, `attackStory`, `isPartialAttackPath` -
      so the mapper was faithful to the documentation and wrong about the API. Microsoft's
      field table still describes only the legacy shape, checked 2026-08-19. Both name sets
      are now mapped, because a row carries one shape or the other and nothing in it says
      which, and `unmappedProperties` carries whatever neither set names so the next rename
      arrives visibly rather than vanishing. Three consequences of the same cause went with
      it: the `riskCategory` filter emitted a clause on `riskCategories` alone, which matches
      nothing on a live row, so a filtered list came back **empty and read as "no paths in
      that category"** - each risk filter now emits an `or` across both spellings and
      `riskLevel` is filterable in its own right; the summary counted every live path as
      `byPotentialImpact: { Unknown: N }` and is now `byRiskLevel` / `byRiskFactor` keyed on
      the effective value of either shape; and a path reporting no risk level under either
      name is counted in `summary.riskLevelNotReported`, bucketed `NotReported` rather than
      `Unknown`, noted in `summary.note`, and printed by the CLI as "not reported by the
      API". **Renaming the two summary keys is a breaking payload change** - on a live-shape
      tenant they only ever held `{ Unknown: N }` and `{}`. The package `CLAUDE.md`, the
      technical doc, both tool descriptions and the attack-path **prompt template** all
      asserted an attack path has no `riskLevel`; that claim entered at the package's first
      commit, seeded the defect, and is corrected in all four. Unit-verified only. See
      register items 31 to 34.

- [x] **⚑34 (register, not a report defect) · the assessment Resource Graph mapper carried
      T11's defect class**. `mapAssessmentGraphRow` named a fixed allowlist of seven
      `properties` keys taken from Microsoft's documentation, exactly as `mapAttackPathRow`
      did, and discarded everything else - so **T12's "none of 4,886 unhealthy assessments
      carries a `properties.risk` object" could not be told apart from this repo throwing
      the field away.** Whatever the allowlist does not name now rides along in
      `properties.unmappedProperties`, and the distinct key names are aggregated into
      `summary.unmappedPropertyKeys` with a sentence in `summary.note`, which the CLI
      already prints. The aggregate is collected across every row Resource Graph returned,
      **before** the union drops duplicates and **before** `maxResults` trims: an ARM row
      wins a shared id and a cut falls somewhere, so a field carried by one row of thousands
      would otherwise vanish from the only surface an assurance run reads. The ARM half of
      the union is untouched and needs no passthrough - it is returned verbatim, with no
      mapper to drop anything. The assessment tool description, the technical doc and the
      package `CLAUDE.md` all now say to read `unmappedPropertyKeys` before reporting that
      no assessment carries risk data; the tool description previously promised a `risk`
      object from api-version 2025-05-04 with no hint that a real estate returned none.
      6 new tests, `azure-defender` 91 to 97, repo 1049 to 1055. Unit-verified only. See
      register items 36 to 38 and the ⚑34 update.
- [x] **T14 · D10, D11 — App Service and Front Door payload gaps**. Both halves were
      "the code never asked ARM", not a mapping gap and not a swallowed 403, so all three
      causes the task arrived with were wrong. **D10:** `AppServicePlans_List` at
      subscription scope returns a *subset* of each plan's properties unless
      `detailed=true` is on the query string - `numberOfSites`, `numberOfWorkers`,
      `reserved` and `zoneRedundant` are among the ones it drops - and the
      resource-group-scoped operation takes no such parameter, which is why only a
      subscription-wide run showed the defect. The call now passes it. Separately,
      `workerCount` was reading ARM's writable `targetWorkerCount` (a scaling target)
      rather than the read-only `numberOfWorkers` (instances assigned), so a plan set to
      scale to ten and running three reported ten; `workerCount` now reads
      `numberOfWorkers` and the target is reported as `targetWorkerCount`. **D11:**
      `listFrontDoors` hard-coded `includeDetails: false` with no caller override, so
      `endpoints`, `originGroups` and `routes` were never requested. The flag is now on
      the service, the tool and the CLI (`--include-details`), the default stays `false`
      for its three-calls-per-profile cost, and a result that did not collect them carries
      a `summary.note` - silence read as "no routes" is what hides an unattached WAF
      policy. `state` was **not** a payload defect: the mapper renames ARM's
      `resourceState`, nothing promised the old name, and nothing documented the rename
      either, so the technical doc now states it. That doc also listed the CLI command as
      `networking front-door get <name>` when it is `networking get-front-door <name>`.
      5 new tests, `azure-management` 51 to 56, repo 1055 to 1060. Unit-verified only. See
      register items 40 and 41, and the ⚑8 / ⚑39 updates.
- [x] **T16 · D26 — the `code-review` cache path follows the working directory**. The
      location is deliberate and stays: `.context/` resolves against the working directory
      because the cache belongs to the project being worked on. What was wrong was the
      silence. `outputResult` in `core` now always names the file it wrote on stderr,
      `--json` included (stderr does not pollute the JSON on stdout, and a caller never
      told the path can neither find nor delete the file), and warns when the working
      directory is not inside a git repository - the case where the payload is scattered
      rather than collected. Fixed in `core`, so every CLI on the current workspace `core`
      gets it. 3 new tests, repo 1060 to 1063, and verified end-to-end from a fresh
      `mktemp -d` against the built CLI. **The plan's claim that `docs/KNOWN_ISSUES.md`
      already recorded the repo-wide version was wrong** - there is no such entry - so the
      durable record is `.claude/refs/cli-architecture.md`. See register item 42.
- [x] **T17 · D24, D25 — retested, not re-fixed**. Both defects are confirmed fixed in the
      current build, so nothing was rewritten. D25 is verified **end-to-end**: the built
      CLI run against a nonexistent Azure DevOps organisation returns a real 404 whose hint
      names the project, the organisation and `cr-list-repos`, with no SAML or "Developer
      settings" text - and a nonexistent org needs no credentials, so this half never
      needed the tenant. The 403 branch and the non-interactive clone environment were
      checked against the **built** JS rather than the source, both correct. D24's runtime
      half remains unproven: whether a clone now fails in seconds instead of hanging needs
      a machine with a controlling terminal and a real organisation, exactly as
      `v35.0.0-beta.14.md` states. See the ⚑6 update.
- [x] **T18 half 1 · D18 — the `azure-defender` coverage gap**. Two new read-only
      commands. **`defender-list-alerts`** returns security alerts across the subscription
      with status and severity breakdowns, and names every entity carrying more than one,
      because clustering is the finding rather than the count. `Alerts_List` takes no
      server-side filter at any api-version, so `status` and `severity` run client-side and
      the payload reports `matchedOf` beside `total` with a note naming the shortfall -
      otherwise a filter that matched nothing is byte-for-byte an empty subscription.
      `maxResults` bounds the **fetch**, so it runs before the filter, and a truncated
      filtered call says so rather than presenting a lower bound as a total. Uses the
      subscription-wide operation, not the region-scoped `locations/{location}/alerts`,
      which silently omits any region the caller did not name. **`defender-list-plans`**
      reports which plans are Standard vs Free, with `cspmEnabled` **three-state** - true,
      false, or null when `CloudPosture` was absent from the response, which means unknown
      and not off. That command is what settles T12 and ⚑33: an empty attack-path or
      assessment-risk result is now either explained by the configuration or a finding
      about the estate, and the note says which in a sentence a report can quote. Both
      api-versions read from the swagger (`alerts` `2022-01-01` is the newest stable that
      surface has; `pricings` `2024-01-01`). No field allowlist on the alert mapper,
      deliberately. 18 new tests, `azure-defender` 97 to 115, repo 1063 to 1081.
      Unit-verified only. See register items 43 and 44.
- [x] **T18 half 2 · D13 - the `azure-management` coverage gap**. All four resource types
      done in one hop: four new read-only commands across three surfaces. Every ARM swagger
      was read before its mapper was written, per the lesson T14 paid for, and each one
      changed the design.
      - **`list-virtual-machines`** / `compute list-vms`. Power state is not in the ARM list
        response, so it is opt-in via `includeStatus` and collected per VM through
        `VirtualMachines_InstanceView` and `FanOutRecorder`. Neither of the list
        operation's own parameters works for a plain listing: `$expand=instanceView` is
        accepted only alongside a `$filter`, and `statusOnly=true` exists at subscription
        scope only. **Without the flag no row carries `powerState` and every VM sits in a
        `not collected` bucket** - defaulting an uncollected state to anything is how a
        deallocated VM comes to look like a running one. A refused `instanceView` lands in
        `unavailable` with its 403 in `fanOut.failures`, a VM that answered without a
        `PowerState/` entry lands in `unknown`, and a test asserts the buckets sum to the
        total.
      - **`list-scheduled-query-rules`** / `monitoring log-alerts`, on `MonitoringService`.
        `summary.alerting` is the coverage number and `summary.total` is not: a disabled
        rule fires nothing, a `kind: LogToMetric` rule emits a metric instead of alerting,
        and a rule with no action group notifies nobody. Each is counted apart. `note`
        names all **three** disjoint alerting surfaces on every result including an empty
        one, which is the specific fix for the measured failure - "0 log alert rules" is
        not "no alerting". Legacy Log Search v1 rules are flagged, not blended in.
      - **`list-logic-app-workflows`** and **`list-api-connections`** / `logic-apps
        list-workflows` and `list-connections`, one service because they are one thing
        operationally. Workflows withhold `definition` and `parameters` by default and name
        them in each row's `propertiesWithheld`, with `triggerNames`, `actionCount` and
        `parameterNames` derived *before* withholding - so an absent definition is never
        read as a workflow that has none, and the counts survive without the payload.
        **`Connections_List` is resource-group scoped only**: ARM ships no subscription-wide
        list, so a subscription-wide answer is a resource-group sweep, each group is one
        `fanOut` attempt, and `summary.complete` is false whenever one refuses.
        `parameterValues` is redacted to its keys by field rather than by key name, because
        ARM's own naming says which of the two maps can hold secrets.
      - No field allowlist on any of the four mappers. 36 new tests, `azure-management` 92
        to 128, repo 1081 to **1117**. Unit-verified plus the credential-free end-to-end
        checks: all four tools appear in `tools/list` over stdio with their parameters, all
        four CLI commands render `--help`, and each fails loudly and exits 1 with empty
        stdout against fake credentials. See register items 45 to 49.

## Queue

Ordered by the source report's own priority. One task per heading; a hop may take
more than one when its context measurement allows.

### T12 · D17 — find out why `Critical` severity and `properties.risk` are absent
- **Package:** `azure-defender`
- **Severity:** Major.
- **Measured:** no assessment carries `Critical` severity (catalogue is High 410, Medium
  606, Low 286), and none of 4,886 unhealthy assessments carries a `properties.risk`
  object. Both arrived with api-version **2025-05-04**.
- **Effect:** a "Critical" row always reads 0, indistinguishable from "checked and none
  found", when the tier may never have been available.
- **⚠️ Re-scoped at hop L5. The original fix - "raise the api-version" - is a no-op.**
  `DEFENDER_API_VERSIONS.assessments` and `.assessmentMetadata` have been `2025-05-04`
  since the package's first commit, the only commit that file has ever had, so every
  published build already asks for it. The task is now to find out **why** the fields are
  absent, and the candidates have changed since the register first listed them:
  - **The mapper-artefact candidate is closed at source, at hop L6, and is now measured on
    every call.** It was the leading candidate: `mapAssessmentGraphRow` named a
    documentation-derived allowlist exactly as `mapAttackPathRow` did, so a live row
    carrying risk data under any other key was discarded and "no assessment carries a
    `properties.risk` object" could have been a mapper artefact. The passthrough is now in
    (see the ⚑34 entry above), so **the first live run answers this without another
    investigation hop**: read `summary.unmappedPropertyKeys`. Non-empty and naming a risk
    field means the mapper was the cause; empty means it never was.
  - **The api-version cannot be the cause of either symptom, confirmed at L6 against the
    ARM spec.** At `2025-05-04`, `Common.Severity` is `Low | Medium | High | Critical`, and
    `properties.risk` is on `SecurityAssessmentPropertiesBase`, which
    `SecurityAssessmentPropertiesResponse` extends - so both a `Critical` severity and a
    `risk` object are in the documented **response** model of the version this package
    already asks for. The pin's stated reason in `src/utils/defender-api-versions.ts` is
    correct.
  - The payload may need an `$expand` the code does not send.
  - The estate may genuinely hold neither. Weakened at L5: the same report measured live
    attack paths carrying `riskLevel: High`, which means Defender CSPM was producing risk
    data somewhere on that estate, so "CSPM is off everywhere" no longer explains it on its
    own. Inferred across two measurements that may not be the same subscription - see
    register item 33.
  - Cannot be settled from this machine either way: no Azure credentials.

### T13 · D16 — `assessment list-assessment-metadata` returns null for the ranking fields
- **Package:** `azure-defender`
- **Severity:** Major.
- **Measured:** `implementationEffort` and `userImpact` are `null` on **all 1,302**
  assessment definitions, so any effort/impact ranking is uncomputable and a "top
  remediation opportunities" section renders empty.
- **Narrowed at hop L5, without credentials: this is not a mapper drop.**
  `listAssessmentMetadata` performs **no mapping at all** - it returns
  `client.paginate<AssessmentMetadata>` items straight through, and a TypeScript cast
  discards nothing at runtime. So unlike T11, no allowlist in this repo can be removing
  the two fields; whatever ARM returned is what the caller saw. That rules out the cheap
  fix and leaves the cause in the request or in the API.
- **⚠️ Re-scoped at hop L6 against Microsoft's published schema and the ARM spec. The L5
  lead is refuted, and one specific live comparison now settles the cause.**
  - **Refuted: scope is not the discriminator.** Microsoft documents two operations, one at
    tenant/default scope and one at subscription scope, and **both** return the same
    `SecurityAssessmentMetadataList` definition. The subscription-scoped operation's own
    published sample response carries `userImpact` and `implementationEffort` on every
    item. Reading the catalogue at a different scope would not add the fields.
  - **Refuted: the api-version is not unrecognised.** `stable/2025-05-04` exists in
    `Azure/azure-rest-api-specs` for this surface, with its own subscription-scope
    `ListAssessmentsMetadata` example, so the pinned version is real and the call is a
    documented one.
  - **What the spec does say, and it is the whole lead:** at `2025-05-04` both fields are
    **optional** (`required` is only `displayName`, `severity`, `assessmentType`) and the
    2025-05-04 examples **omit them both**, while the 2020-01-01 examples for the same
    operation include them. The response model still defines them
    (`SecurityAssessmentMetadataPropertiesResponse` extends
    `SecurityAssessmentMetadataProperties`, which carries both), so the service is
    permitted to return them and permitted not to.
  - **The one test that settles it:** call `assessmentMetadata` twice against the same
    subscription, once at `2020-01-01` and once at `2025-05-04`, and compare the two
    fields. Needs credentials this machine does not have.
  - **If the older version populates them and the newer does not, the fix is a trade-off,
    not a patch:** `2025-05-04` is exactly what this package needs for `Critical` severity,
    which is T12's subject, so the choices are to read both versions and merge, or to lose
    one capability. That is Klemens's call, not the loop's - see register item 36.
  - Also unresolved, and unresolvable from here: the report says the fields were `null`,
    but an optional field ARM does not populate is **absent**, not null. Either the
    consumer rendered absent as null or ARM sent explicit nulls, and those have different
    causes. See register item 34.

### T19 · D19, D23 — optional polish
- **D19 (`azure-defender`):** regulatory-compliance commands hard-fail on subscriptions
  with no paid plan, on 8 of 16. The CLI behaves correctly and the message is clear;
  consider returning an empty result with `notApplicable: true` so a batch consumer does
  not special-case an error string.
- **D23 (`log-analytics`):** two transient `Bad request` failures in ~180 `query execute`
  invocations, both succeeding unchanged on immediate retry. Exit code is correct.
  Consider a bounded internal retry, since the flat cache leaves no trace of a gap.

## Not actionable in this repo

### T9 · X1 — the documented invocation idiom fails on macOS, in all six CLIs
- **Severity:** Major by blast radius. **Status: cannot be fixed here.**
- **The defect is real:** the docs show `ARM="npx -y --package=... mcp-azure-mgmt ..."` then
  `$ARM ...`. zsh does not word-split an unquoted variable and is the macOS default shell, so
  every command documented that way fails with `no such file or directory: npx -y
  --package=...`. Measured cost: once failing loudly, and once far worse - a collection ran
  to completion, **exited 0 and wrote zero files**. The working form is a shell function:
  `arm() { npx -y --package=@mcp-consultant-tools/azure-management@beta mcp-azure-mgmt "$@"; }`.
- **But the files are not in this repository.** The `SKILL.md` and `cli-reference.md` files
  carrying the idiom live in the consuming assurance skills, which are private and outside
  this repo. Verified at hop L3 by three independent checks: no file named `cli-reference.md`
  anywhere in the tree; **zero** matches for a shell variable assigned an `npx`/`node`
  command string across every tracked `.md`; and zero matches for a bare `$VAR` used as a
  command. This repo's own docs use the direct inline form
  (`npx --package=... mcp-ado-cli wiki list MyProject`), which is correct under zsh.
- **Already recorded** in `docs/release-notes/v35.0.0-beta.11.md` and
  `v35.0.0-beta.14.md`, both of which say the sweep has to happen in the consuming skills.
- **What is left is Klemens's, not the loop's:** sweep the six skill files in the private
  skills repo. Register item 25.

## Carried over from the beta.17 work, not in the source report

- **`IntegrationAuditService.generateAuditReport` still caps plugin assemblies at 100** and
  discards the `truncation` block, so `gen-integration-audit` presents a truncated assembly
  list as complete — the same defect class beta.17 closed elsewhere.
- **Two `powerplatform-core` services still use the `$top = maxRecords + 1` check:**
  `MetadataService.getGlobalOptionSets` and `WorkflowService.getWorkflows`.
- **14 packages remain pinned to `core@33.0.0`**, so npm installs a stale registry copy
  under their own `node_modules` instead of linking the workspace. They compile against
  published code and cannot see local changes. `npm ls <pkg>` reports these as `invalid`.

## Release discipline for this chain

- Do not publish per task. Land fixes on `release/35.0` and let Klemens decide when to cut
  the next beta via `/release_workflow_beta`.
- `v35.0.0-beta.17` is **published but not yet verified against a live Dataverse
  environment**. Do not build anything on the assumption that its paging is confirmed.
