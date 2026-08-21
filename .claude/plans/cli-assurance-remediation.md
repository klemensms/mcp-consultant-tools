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

- [x] **T19 · D19, D23 - optional polish. Both halves taken, neither as the plan
      proposed, and the reason is the same in both: the suggested fix would have hidden
      the evidence that is missing.**
      - **D19 (`azure-defender`).** Every `regulatoryCompliance*` failure now carries a
        trailing hint naming `defender-list-plans`, the command that already answers "does
        this subscription have a paid plan". ARM's own code and message stay first; the
        call still throws and the CLI still exits 1. **Not** returned as a
        `notApplicable: true` payload, because nothing in this repo records which ARM error
        code a paid-plan refusal carries, so recognising it would mean matching a guessed
        string - and a wrong match turns a real failure into a clean compliance report,
        while also flipping the exit code for every batch caller. One live run against a
        plan-less subscription makes the payload version possible; see register item 50.
        The wrapper sits on the three ARM call sites, so `getComplianceSummary`'s own
        unknown-standard error keeps its own message and a summary failing through
        `listStandards` carries the hint exactly once. Both tested.
      - **D23 (`log-analytics`).** The 400 branch computed ARM's error code into an
        `errorDetails` local and **never read it**, so the message carried the text and
        dropped the code. That is why the two measured failures could not be classified,
        and why the next one could not have been either. The message now reads
        `Bad request (<code>): <message>`; the dead local is gone. **No retry was added.**
        A 400 is normally deterministic, so retrying one masks a malformed query for every
        caller in order to paper over two failures nobody has identified, and the two
        original responses are not reachable from this repo. A test named `does not retry a
        400` pins the decision. Register items 51 and 52.
      - 9 new tests, repo 1117 to **1126** attributable to this chain. Unit-verified plus
        the credential-free checks: both MCP servers list their tools over stdio, both CLIs
        render `--help`, and both fail loudly and exit 1 with empty stdout against fake
        credentials, with the defender hint visible on stderr.

## Queue

Ordered by the source report's own priority. One task per heading; a hop may take
more than one when its context measurement allows.

### T12 · D17 - why `Critical` severity and `properties.risk` are absent (investigation closed)
- **Package:** `azure-defender`
- **Severity:** Major.
- **Measured:** no assessment carries `Critical` severity (catalogue is High 410, Medium
  606, Low 286), and none of 4,886 unhealthy assessments carries a `properties.risk`
  object. Both arrived with api-version **2025-05-04**.
- **Effect:** a "Critical" row always reads 0, indistinguishable from "checked and none
  found", when the tier may never have been available.
- **⚠️ Status: every candidate that could be settled without credentials has been, and none
  of them leaves work in this package. What is left is a question about the estate, not a
  defect.** The original fix - "raise the api-version" - was a no-op:
  `DEFENDER_API_VERSIONS.assessments` and `.assessmentMetadata` have been `2025-05-04`
  since the package's first commit, the only commit that file has ever had, so every
  published build already asks for it. The candidates, and where each of them ended:
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
  - **The `$expand` candidate is closed, read against the published TypeSpec at
    `2025-05-04`.** `ExpandEnum` has exactly two members, `links` and `metadata`; the `list`
    operation accepts no `$expand` parameter at all, only `get` does; and `risk?` is optional
    on `SecurityAssessmentPropertiesBase`, which the list response inherits. So no
    request-side change exists that could deliver a risk object, and the mapper already
    passes unnamed keys through. Nothing here is left to build.
  - **The investigation is therefore closed, and one explanation is left standing: the
    estate.** That is a statement about the API, not about the subscriptions that were
    measured, so **T12 is not "fixed"** - there is no defect left in this package to fix.
    What remains is a question about the estate, and `defender-list-plans` answers it in one
    run per subscription: with the `CloudPosture` plan on Free, an absent `risk` object and a
    zero `Critical` count are explained by the configuration rather than being findings about
    the estate. `summary.cspmEnabled` is three-state, so `null` means unknown and not off.
  - Weakened at L5, and it is the reason the estate explanation needs the plan check rather
    than being assumed: the same report measured live attack paths carrying `riskLevel: High`,
    which means Defender CSPM was producing risk data somewhere on that estate, so "CSPM is
    off everywhere" does not explain it on its own. Inferred across two measurements that may
    not be the same subscription - see register item 33.

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
  - **Not refuted, and never tried: scope.** Microsoft documents two operations, one at
    tenant/default scope and one at subscription scope, and both return the same
    `SecurityAssessmentMetadataList` definition - but that is a fact about the **schema** and
    says nothing about whether the service **populates** an optional field the same way at
    both scopes. `listAssessmentMetadata` has only ever called the subscription-scoped path;
    the tenant-scope `AssessmentsMetadata_List` at
    `/providers/Microsoft.Security/assessmentMetadata` has never been called by anything in
    this package. If tenant scope populates the fields, the fix is one call at a different
    path with no version juggling and no capability trade-off. See register ⚑2.
  - **Refuted: the api-version is not unrecognised.** `stable/2025-05-04` exists in
    `Azure/azure-rest-api-specs` for this surface, with its own subscription-scope
    `ListAssessmentsMetadata` example, so the pinned version is real and the call is a
    documented one.
  - **What the spec says, and it is weaker than a lead:** at `2025-05-04` both fields are
    **optional** (`required` is only `displayName`, `severity`, `assessmentType`) and the
    2025-05-04 examples **omit them both**, while the 2020-01-01 examples for the same
    operation include them. But `2020-01-01` marks the same two fields optional as well, so
    the **only** evidence of a version difference is which autogenerated examples happen to
    include them, and this repo has already been bitten once by treating an example as
    evidence. Do not build on the version hypothesis as if it were established. See
    register ⚑1.
  - **The test that settles it is now one built command.**
    `defender-diagnose-metadata-fields` / `assessment diagnose-metadata-fields` reads the
    catalogue at **four** combinations - subscription and tenant scope, each at `2025-05-04`
    and `2020-01-01` - and reports per combination how many definitions carry each field,
    how many carry it empty, how many omit it entirely, and one example value. Both axes are
    probed because neither was ruled out. It counts absent separately from present-but-empty,
    which also answers register ⚑34. Still needs credentials this machine does not have, but
    it is now one run rather than four hand-made calls and a comparison.
  - **If the older version populates them and the newer does not, the fix is a trade-off,
    not a patch:** `2025-05-04` is exactly what this package needs for `Critical` severity,
    which is T12's subject, so the choices are to read both versions and merge, or to lose
    one capability. That is Klemens's call, not the loop's - see register item 36.
  - Also unresolved, and unresolvable from here: the report says the fields were `null`,
    but an optional field ARM does not populate is **absent**, not null. Either the
    consumer rendered absent as null or ARM sent explicit nulls, and those have different
    causes. See register item 34.

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

## Release-notes checklist for the next beta

Nine hops landed on `release/35.0` with no beta cut, so **none of this is in
`docs/release-notes/v35.0.0.md` yet** (checked at the closing hop: the master doc mentions no
fan-out contract, no `byRiskLevel`, no `workerCount`, no `unmappedPropertyKeys`). Every line below
is a behaviour or payload change that must be written up when `/product-releasenotes beta` next
runs, and the first four need Klemens's decision on whether they get the breaking-change block
(warning plus copy-paste agent block) rather than a plain behaviour-change line.

**Candidates for the breaking-change block:**

- **`outputResult` now exits 1 whenever a payload's fan-out lost an item** (`core`, all packages).
  A script treating any non-zero exit as fatal now stops on a partial collection where it
  previously continued with a quietly incomplete cache file. Stopping is the point of the fix.
  Register item 10.
- **`defender-list-attack-paths` renamed two summary keys.** `summary.byPotentialImpact` and
  `summary.byRiskCategory` are gone; `summary.byRiskLevel`, `summary.byRiskFactor`,
  `summary.riskLevelNotReported` and an optional `summary.note` replace them. On a legacy-shape
  tenant the old keys held real values, so a consumer there loses a working field. Register
  item 32.
- **`plugin get` no longer returns the raw Dataverse keys or `@odata.etag`.** It now returns the
  same decoded shape as `plugin list`. A consumer written against the raw shape reads `undefined`.
  Register item 22.
- **`query error-summary` throws on an unsupported `--table` and exits 1** where it used to fall
  through to the `FunctionAppLogs` shape and return confident rows about a different table.
  Register item 20.

**Behaviour and payload changes that need a line either way:**

- **`networking event-grid-topics`: `summary.total` is now what exists and `listed` is what came
  back**, so `topics.length === summary.total` no longer holds, and the command makes one extra
  ARM list call on every invocation. Register item 12.
- **`fn stats` drops `UniqueFunctions`** (it was `dcount` inside a `by` on the same column, so it
  was always 1). `normalization.rows` replaces it. Register item 14.
- **`la-get-metadata` keeps its ~680-table catalogue and gains a `scope` block**; the new
  `la-list-workspace-tables` answers what the workspace actually holds. Tool count 13 to 14. A
  consumer that never reads `scope` is still wrong about what the count means. Register item 17.
- **`defender-list-assessments` now scans both sources in full on every call** and makes at least
  one Resource Graph POST it did not make before, because `maxResults` can no longer be pushed
  down to ARM without cutting exactly the rows the second source recovers. Register item 28.
- **`app-service plans`: `workerCount` changed meaning**, from ARM's writable `targetWorkerCount`
  to the read-only `numberOfWorkers`. Same key, same type, different quantity on any plan
  configured to scale. Register item 41, and whether it needs the breaking-change block depends on
  the live run in the verification list below.
- **New commands:** two `azure-defender` surfaces (security alerts, Defender plan configuration)
  and four `azure-management` ones (virtual machines, log-search alert rules, Logic App workflows,
  API connections). Tool counts in `README.md` need updating.
- **Message-only, nothing to declare:** the compliance commands' `defender-list-plans` hint and
  the Log Analytics `Bad request (<code>)` message. No exit code and no payload shape moves.
  Register item 10's L9 update.

## Live-run verification list

**Every code fix in this chain is unit-verified only.** There are no Azure, PowerPlatform or Log
Analytics credentials on the machine the chain ran on, which is why roughly twenty register items
are the same assumption wearing different hats. Klemens has the credentials. Each line below is
one command and the one thing to read in its output, ordered by what a wrong answer would cost.

**Read this one before sharing any output:**

- `logic-apps list-connections` against a subscription holding a SQL or Office 365 connection.
  Read `nonSecretParameterValues` **before the JSON goes anywhere**. The command trusts ARM's own
  split between secret and non-secret parameter maps, and the CLI writes the payload to disk.
  Register item 49, also in `docs/KNOWN_ISSUES.md`.

**Settles a product decision:**

- `assessment diagnose-metadata-fields` against any subscription. Read `summary.populatedBy`
  and `summary.verdict`, then `fanOut.failures` - a probe that could not be read is unknown,
  not empty, and a tenant-scope 403 is expected on a subscription-scoped service principal.
  If only the `2020-01-01` probes populate the fields there is no patch that keeps everything,
  because `2025-05-04` is what the package needs for `Critical` severity; the verdict says so
  when that is what the probes show. If a tenant-scope probe at `2025-05-04` populates them,
  the fix is one path change and there is no trade-off at all. Register items 36, 34 and ⚑1,
  ⚑2 of the follow-on chain; task T13.
- `defender-list-plans` per subscription, reading `summary.cspmEnabled` (three-state: `null` means
  the plan was absent from the response, **not** that CSPM is off). **This is now the only thing
  left on T12.** Every candidate that could be settled from source has been, and no request-side
  change exists, so a zero `Critical` count and an absent `risk` object are either explained by
  the plan configuration or they are a finding about the estate. Register item 33.
- `defender-list-assessments` against a subscription with a paid Defender plan, reading
  `summary.unmappedPropertyKeys` and then `properties.unmappedProperties` on a row that has one.
  Non-empty and naming a risk field means the mapper was T12's cause; empty means it never was.
  Register items 37 and 34.
- Any `compliance list-*` command against a subscription with **no** paid Defender plan, capturing
  the ARM error code and status verbatim. With that code in hand, returning `notApplicable: true`
  instead of failing becomes a real option rather than a guessed string match. Register item 50.

**Confirms a fix actually works:**

- The five `powerplatform` paging commands shipped in `v35.0.0-beta.17`, which have never run
  against a live Dataverse environment. Register item 1.
- `plugin trace-logs --exception-only`, which now sends an empty-string comparison on a memo
  attribute. Register item 7.
- `graph role-assignments`: read `roleDefinitionsFound`. Zero means the join was never the problem
  and the role-definition query needs its own investigation. Register item 11.
- `app-service plans` at subscription scope: `numberOfWorkers` and `workerCount` must be populated
  on a plan known to host apps. If ARM ignores `detailed=true`, the fix looks landed but the
  "unused App Service plan" false positive is still live. Register item 40.
- `networking front-doors --include-details`: read `fanOut.failures` before using the output for a
  WAF review. Those three calls have never run on a live estate, and an unattached WAF policy and
  a refused route list look the same to a reader who skips it. Register item 8's L7 update.
- `networking event-grid-topics`: confirm a system-topic list failure surfaces as a recorded
  `FanOutRecorder` failure rather than as something the recorder does not catch. Register item 15.
- A Reader-credential refusal anywhere in `azure-management`: confirm it arrives carrying
  `response.status = 403`, or `statusCode` records null and the summary loses its "mostly HTTP
  403" hint. Counts and exit code are unaffected either way. Register item 9.
- `fn stats`: compare `normalization.rows` against the function count the portal shows, and the
  collapsed `TotalExecutions` against a hand-written KQL `count()` per function. The collapse
  keeps the highest-counting name variant, which under-counts silently if the variants are
  partly disjoint rather than duplicate views. Register item 13.
- `query error-summary --table FunctionAppLogs` with and without `--no-deduplicate`. If
  `UniqueErrors` is 1 per function while `Count` is large, `FunctionInvocationId` is blank on the
  rows that matter and the dedupe branch needs a guard. Register item 18.
- `la-list-workspace-tables` against a workspace whose contents are known, compared with
  `search * | distinct $table` over the same window. `Usage` records ingestion-metered data types,
  so the command is a lower bound. Register item 16.
- `plugin list`: any assembly reporting `Unknown (<value>)` means `isolationmode` is not always
  populated and the audit's external-plugin count has genuinely changed. Register item 24.
- `defender-list-assessments`: compare `summary.sources.arm.returned` against
  `summary.sources.resourceGraph.returned` and read `resourceGraph.unique`. This says which of the
  two candidate causes the missing identity- and subscription-scoped assessments actually had.
  Register item 27.
- `defender-list-assessments`: check a Resource-Graph-recovered row carries a
  `resourceDetails.id`, and that `summary.total` is not inflated by ids that differ between the
  two sources by more than case. Register item 29.
- `defender-get-attack-path`: read `entryPoint`, `target` and the first element of `riskFactors`
  and check the display label picked the readable field rather than serialising the object.
  Register item 31.
- `defender-list-alerts`: check rows carry `compromisedEntity` (`topEntities` is empty and useless
  without it), and that `defender-list-plans` names `CloudPosture` rather than another spelling.
  Register item 43.
- `compute list-vms --include-status`: `properties.instanceView` must carry a `PowerState/` entry,
  or `byPowerState` reads `unknown` for every VM. Register item 45.
- `monitoring log-alerts`: `kind` must be present on the resource rather than inside `properties`,
  or every rule defaults to `LogAlert` and `summary.alerting` counts `LogToMetric` rules as
  coverage. Register item 45.
- `logic-apps list-workflows`: `definition.triggers` and `definition.actions` must be objects
  rather than arrays, or `actionCount` is the string-key count of an array and still looks right.
  Register item 45.
- `compute list-vms` compared against `az vm list` on the same subscription. A field present in
  `az` output and absent from ours is an api-version gap, not a mapper gap:
  `Microsoft.Compute/virtualMachines` has 54 stable versions and `2024-07-01` was picked for
  maturity, not measured. Register item 48.
- The next `Bad request` from a real Log Analytics workspace, read with its now-included error
  code. `BadArgumentError` or `PathNotFoundError` means the query or workspace id was the problem;
  anything throttling-shaped means the 400 is a mislabelled transient and a bounded retry becomes
  defensible. Register item 52.
- The `azure-defender` CLI summary strings (risk level, entry point and target labels, the partial
  attack-path warning, the unmapped-key list). Nothing asserts any of them: that package has no
  CLI tests. Register item 35, also noted in `packages/azure-defender/CLAUDE.md`.

## Deferred scope, unscheduled

Nothing in this chain will do these, and none is scheduled.

- **The fan-out sweep is two thirds done and its work-list is exhausted.** `core`,
  `azure-management` (43 sites) and `azure-defender` (3 sites) use the contract. L1's stated
  work-list, `grep -rn "console.error(\`Failed to" packages/*/src`, now returns two hits and
  **neither is a collection fan-out**: `azure-devops/src/sync/template-loader.ts:72` is a fallback
  chain and `azure-sql/src/services/connection-service.ts:231` is a connection failure. So the
  grep is spent and the sweep's remaining scope across the other packages is **unmeasured** rather
  than small. Register item 2.
- **`gen-integration-audit` presents a capped assembly list as complete**, and **`plugin list`
  always reports a null assembly description.** Both confirmed in source and written up in
  `docs/KNOWN_ISSUES.md`. Register items 3 and 23.
- **`investigate-app` and `investigate-sync` still duplicate their KQL** across the CLI and the
  MCP tool. In `docs/KNOWN_ISSUES.md`. Register item 21.
- **`log-analytics` has no retry policy at all** while its sibling ARM clients retry the standard
  transient set. In `docs/KNOWN_ISSUES.md`. Register item 51.
- **`deduplicateRetries` guarantees something weaker on `FunctionAppLogs`** than on the
  Application Insights tables: it collapses the log lines of one invocation, not retries, because
  a retry is a new invocation with a new id. Documented in the output, the tool description, the
  CLI help and both docs. Whether that warrants a separate flag name is an open design question.
  Register item 19.
- **VM power state costs one ARM call per VM, sequentially**, with no cap and no progress output
  (244 calls on the estate that produced the defect). `VirtualMachines_ListAll` accepts
  `statusOnly=true` and would be one call, but whether it returns the full model alongside the
  status is established nowhere, and taking it blind risked gaining the runtime and losing the
  configuration. One live `ListAll` comparison settles it. Register item 46.
- **`list-api-connections` walks every resource group in the subscription** because
  `Microsoft.Web/connections` has no subscription-wide list operation, and the walk is uncapped.
  The alternative is Resource Graph, refused here because a projected row shape is exactly what
  went wrong twice in this repo. Register item 47.
- **`defender-list-alerts` cannot give a filtered subscription-wide total**: `Alerts_List` accepts
  no `$filter`, so the filter only sees the rows `maxResults` already fetched. The default of 200
  is a guess. Register item 44.
- **Resource Graph paging stops at 20 pages** (20,000 rows) and declares it. Worth revisiting only
  if a live run ever reports `truncated: true` with no `maxResults` set. Register item 30.
- **`summary.note` names every unmapped key**, and it is the same field that carries the "this
  list is incomplete" warning. If a live tenant makes the note unreadable, cap the names in the
  note rather than dropping the sentence. Register item 38.

## Release discipline for this chain

- Do not publish per task. Land fixes on `release/35.0` and let Klemens decide when to cut
  the next beta via `/release_workflow_beta`.
- `v35.0.0-beta.17` is **published but not yet verified against a live Dataverse
  environment**. Do not build anything on the assumption that its paging is confirmed.
