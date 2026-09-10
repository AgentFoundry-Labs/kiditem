# Operation Automation Legacy Removal Implementation Plan

**Status:** ACTIVE

Latest recovery checkpoint (2026-09-07 21:00 KST): the root execution plan's
QA checkpoints supersede earlier environment/data availability notes below.
The user-authorized rebuilt persistent QA DB remains isolated on 56879. Actual
installed-extension inventory capture completed with 1,822 active SKUs and
atomic owner publication; 188 inactive prior SKUs are preserved. Auth outage
HTTP regression passes 8/8, and the full Auth/filter regression passes 66/66;
Nest boot and Codex explicit-model SSE smoke pass.
Cutover scanner has 0 findings. Full PG diagnostic rerun finished with 782/789
tests passing; the 21:40 root-plan checkpoint records seven failures and an
unaccepted test-only checkpoint-cadence comparison, with no verification weakening.
Matching-screen Wing upload is blocked on ChatGPT extension file-URL permission,
and Claude actual execution is blocked on provider login after repairing its
local package postinstall. Earlier archived imports are fixtures, not substitutes
for these required actual QA paths. No overall completion is claimed.

> **Execution update (2026-09-06):** The user authorizes spec-first autonomous
> implementation. The linked approved spec is the completion authority; prior
> TDD/agent-workflow instructions and checkbox order are execution history, not
> mandatory steps. Choose cohesive working paths and risk-based verification.

**Goal:** Remove the generic Operation/Automation/Workflow/Panel runtime after every surviving business action has a direct owner or capability path.

**Architecture:** A checked-in ownership manifest and read-only Office preflight establish the exact removal set. Surviving domain work uses its existing owner service, source attempt, CapabilityInvocation, or AiDirectJob; unused routes and UI are deleted. Alerts become a polling read model, Rules receives its own request identity, and the final v0.1.31 cutover drops generic execution tables and resets unreliable Alert/ABC state.

**Tech Stack:** NestJS, React/Next.js, Prisma 7/PostgreSQL, Node/Vitest scanners, Chrome extension, Office local deployer

**Approved Excel conversion scope (2026-09-07):** All workbook generation and
conversion is server-owned, not only collected order files. Remaining browser
writers include Finance/settings reports, Advertising exports, Inventory export,
Supply confirmation workbooks, and Wing registration templates. Move these to
their existing domain APIs with equivalent workbook semantics and transient
downloads; add no output persistence or collection lifecycle. Read-only workbook
previews are distinct from generation. The inline integration review must check
these paths before calling the server-only conversion requirement complete.

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## OpenAPI removal delta acceptance

The removal is implemented; the whole hard-cutover gate remains open. Review
the actual incoming interface and consumers without real OpenAPI IO.

Inline checkpoint (2026-09-07): web focused tests passed 6 files/18 tests;
the strengthened scheduled-sync regression also passed independently. Channels
passed 6 files/38 tests, Sourcing 2 files/16 tests, Orders 19 tests, and AgentOS
8 files/42 tests. Disposable PostgreSQL tests preserve registration-only
repository contracts (3 passes) and deletion status/replay/unsupported mutation
contracts (4 passes). No provider request or operating DB write was made.
Shared, final server and final web production builds passed; isolated Nest boot
was confirmed again after removing the unused deletion-password service/UI.
Settings regression tests pass (2 tests), and the live QA settings page showed
vendor-only settings with no API-key or provider-sync controls. This browser
check exposed the obsolete deletion-password prompt, now removed with its
unused service/DI/query key; stored DB configuration was not touched. Further
browser navigation initially had input-delivery mismatches. A later actual
Chrome check of `/orders` (2026-09-07 17:09 KST) confirmed the unsupported
notice, disabled CONFIRM/INVOICE controls and the retained read refresh. This
rendered-state check complements, but does not replace, the timer/no-IO tests.
The first whole server unit run passed 3,044 tests with one 5-second
Wing-workbook timeout; its isolated rerun passed all 11 tests without code
changes. The two-worker whole rerun passed all 510 files: 3,045 passed and four
expected-failure tests, with no unexpected failures (375.75 seconds). The server-wide OpenAPI guard,
AgentOS contraction guard and AGENTS hygiene pass. These results do not close
the separate whole PostgreSQL completion gate.

PostgreSQL checkpoint (2026-09-07 17:10 KST): the full run finished with
100/101 files and 788/789 tests passing. The sole failure was a 5-second
interactive-transaction expiry (7,075 ms elapsed) during catalog chunk upload,
before the option-parent conflict assertion. The unchanged six-test catalog
file then passed on a fresh disposable PostgreSQL instance (17.55 seconds).
The isolated pass does not turn the failed full run into a pass; no timeout or
business contract was relaxed. Docker evidence showed no recovery-mode failure
in this run. A clean full-run confirmation remains required.

The confirmation rerun was interrupted after macOS sleep invalidated its timing
evidence: `pmset` records clamshell sleep from 17:24:37 and repeated sleep
through 18:16, including a
1,585-second interval matching a roughly 26-minute test delay. Do not count the
resulting timeout cascade as either a clean pass or confirmed application bugs.
The owned test process was stopped; no operating database was touched. Run the
remaining build, provider QA and full PostgreSQL confirmation sequentially,
with the host awake, instead of repeating overlapping resource-heavy checks.

Advertising entrypoint delta: main independently passed the new card plus
StatusContent tests (2 files/9 tests). Polling observes owner terminality even
while the extension reply is pending, releases the button, and fences late
replies from the next request. Actual Chrome started profitability attempt
`2c318945-91ff-4e69-9a9c-4e72095749e5`; the owner recorded navigation timeout
as FAILED during the affected QA session. This proves dispatch and failure
recording, not successful report publication or ABC readiness.
The same attempt's deduplicated `source:coupang-ad-profitability` Alert was
verified OPEN/unread. The QA PostgreSQL log separately records postmaster child
exit/recovery cycles after wake; container OOMKilled=false and restartCount=0.
Preserve this environmental evidence rather than diagnosing the navigation
timeout as a collector defect without a healthy-host reproduction. The failed
test-run container (port 56907) was stopped; the QA data container (56879) and
operating replica (5433) were retained.
The source attempt began at 17:23:34 KST and recorded failure at 17:27:02;
its existing 180-second navigation timeout overlapped the recorded sleep.
After the QA database accepted reads again, actual Chrome re-login showed
`최근 수집 실패`, the navigation-timeout message and an enabled retry button;
the unread badge was two (the separate daily-KPI and profitability failures).
The new web build compiled but failed TypeScript on an optional `/current`
response passed into terminal observation. Fix that missing-response guard
and rerun the production build before accepting the UI delta.
That optional-response guard is fixed; the final web production build passed
compilation, TypeScript and route generation. The 9 focused UI tests also pass.
The actual source retry is now being verified separately from the full PG run.

Healthy-host retry finding: attempt `7d3649a4-da3d-437a-9f50-0d694dba2df4`
reached the authenticated official report page with document.readyState=complete.
Coupang appended `?_cap_client=WING` to the frozen report URL, but
`waitForTabCompleteAtUrl` requires full-string equality and keeps waiting.
The earlier sleep overlap therefore does not exclude a real navigation defect.
Preserve the report target, accounts, dates, extractor and timeout; accept only
the observed provider context parameter at this exact official page boundary.
Add regressions rejecting changed origins, paths and unrelated query parameters,
then reload the installed extension and retry through the existing owner.
The retry terminalized FAILED at 18:36:41 KST with the same navigation error.
The failure Alert stayed exactly one row for the dedupe key, now referencing
the new attempt and unread; repeated failures did not create duplicate Alerts.

Navigation delta checkpoint (2026-09-07 18:55 KST): inline review and the
focused collection-window suite passed (63 tests). The installed extension's
load path was verified against this worktree and reloaded. Actual Advertising
screen retry admitted attempt `896b2626-578b-4066-b80b-a24a48828ea7` and passed
the previously blocked navigation boundary. The authenticated report UI showed
daily, product-grain reports; disposable QA PostgreSQL confirmed the first
three planned periods complete with 9,172, 8,040 and 9,061 rows. The overall
attempt remains RUNNING until all 12 receipts are validated; this is progress,
not final publication evidence. No OpenAPI request or operating DB write was
used. Separately, the OpenAPI delta recheck passed 45 focused server tests and
14 scanner tests, with the cutover scanner reporting zero findings.

The same attempt failed at 19:03:45 KST with
`profitability_report_generation_timeout`; it never published COMPLETE. The
actual January form had an empty campaign selection and disabled Create.
Code inspection confirmed a disabled click was treated as a submitted report.
The bounded fix waits for the date-change campaign reset and enabled Create,
and fails explicitly if readiness is absent; target/account/period/output and
generation timeout are unchanged. Main passed all 23 focused report tests,
including delayed reset, delayed enable and no-click bounded failures. Actual
screen showed failure and an enabled retry button; the Alert remained one
OPEN/unread row pointing to this attempt. The fresh read-only provider tab
showed only the first three generated reports, so pagination was not assumed
to be this failure's cause. A possible list-pagination gap is not yet accepted
as repaired or proven irrelevant.

The full extension gate before that readiness delta passed 821/821 tests;
conventions and develop reconstruction also passed. A clean whole PostgreSQL
run was started after source terminality, on a newly created disposable
database with process-scoped idle-sleep prevention. It is not run concurrently
with real provider collection. Native Chrome extension-page control became
unavailable while ordinary browser tabs remained readable; operator reload
was requested before the next actual retry. No successful advertising
publication or ABC baseline is claimed by these intermediate checks.

Readiness delta aggregate verification: main's full extension rerun passed
825/825 tests (29.47 seconds), exit 0. The clean whole PostgreSQL run is still
live; its current Wing publication measurement is 1,000 products / 3,000 options
in 1,709 ms with 55 statements. This measurement is not an ABC baseline or a
whole-suite pass.

QA mapping prerequisite verified by read-only queries: this disposable QA DB
has zero ChannelListings and zero ChannelListingOptions, while the failed
advertising attempt contains 617 distinct provider option IDs. All-unmatched
advertising rows therefore do not by themselves establish a resolver defect.
Use the retained Wing catalog collection and explicit matching contracts before
ABC readiness verification; do not infer identities from product names or
seed invented mappings. The live full PG run has so far recorded one 30-second
timeout in the channel-dashboard organization-isolation test; no leaked result
has been observed. Await the terminal report and diagnose that exact failure
before accepting the whole gate.

Operator confirmation (2026-09-07): Office has already executed
`v0.1.30:006_delete_legacy_channel_derived_master_products`. Keep its original
path, ID and body immutable; do not move or duplicate it into v0.1.31. The
operating replica's earlier ledger was stale for this decision. The file is
unchanged from committed `5b154ca03`; the release guard still needs a truthful
admission decision for this already-applied migration absent from develop.
Do not bypass the guard or classify this as a new v0.1.31 migration.

| Existing entrypoint | Cutover contract |
|---|---|
| Settings `/api/coupang-sync/{health,products,orders}` | Remove UI calls and provider sync; no connection-test API request |
| Orders screen scheduled synchronization | Remove automatic timer and direct sync trigger |
| Orders confirm/invoice and Returns approve | Explicit unsupported response; no provider call or local success mutation |
| `channels.submit_coupang_listing` and Sourcing `preparations/:id/submit` | Remove direct Agent capability and reject unsupported direct submission before beginning work |
| Listing deletion authorization/claim/reconcile | Stop unsupported deletion before browser mutation; retain truthful existing status reads |
| Coupang account settings | Vendor/store identity remains; no OpenAPI-key input, projection, resolution or DI |
| Existing Wing external registration and source-owner collection | Preserve the separate validated browser/owner contract and its regression tests |

## Global Constraints

- QA entrypoint finding (2026-09-07): `collectAdvertisingProfitability` and
  its owner API survive, but no web/Agent caller remains after composite
  removal. This is an incomplete lifecycle transplant, not an unsupported
  provider. Restore a small explicit Advertising-screen control using the
  existing extension bridge/action and `/api/ads/profitability-imports/current`
  read contract. Preserve collector/account/date semantics; the owner alone
  determines terminality and previous complete publication. Cover missing
  capability, reload during RUNNING, lost ACK, failure/last-complete display and
  owner-confirmed success. Do not substitute account KPI/campaign sync for
  product-level advertising cost, trigger ABC, or add a runtime. Review this
  delta and its focused tests before resuming its real-provider QA.

- Post-review QA checkpoint (2026-09-07): the actual Dashboard `광고 받기`
  entrypoint admitted an Advertising attempt in the disposable QA DB on port
  56879. It terminated FAILED with `AD_ACCOUNT_DAILY_KPI_COLLECTION_FAILED`
  and a login-required message; the UI returned to a retryable button and showed
  one unread source-failure Alert. The provider tab is at seller sign-in; a
  successful retry/recovery is awaiting authentication, not claimed complete.
  Product Hub shows Sellpia complete through 2026-09-06, missing ad cost and
  mapping attention, disables grade refresh, and retains zero evaluations and
  publication revision zero. This does not prove successful ABC publication or
  last-good retention after a prior grade. QA also exposed obsolete Dashboard
  observation-day copy; the sale-age wording now matches the approved contract,
  with four focused tests passing and no calculation change. The conventions
  and reconstruction gates pass; the release migration ID gate below remains
  unresolved. A fresh whole PostgreSQL run is live with preserved DB logs;
  one catalog publication test has failed, pending the full diagnostic result.

- Approved OpenAPI removal (2026-09-07): remove Coupang server-direct API
  clients/credentials/DI and their actual sync, mutation, UI and Agent callers
  retained by `cf65e34d3`. Preserve browser-session Wing/ad collection,
  ChannelAccount identity and validated owner paths. Unsupported operations
  stop explicitly before external IO; do not replace them with invented
  collectors. Implementation slices are Channels, Orders, and web/shared
  contracts (Luna/max); integration and correctness/Ponytail delta review stay
  inline. ABC/Inventory changes remain in scope and unchanged by this removal.
  Completion requires no-OpenAPI regression coverage and fresh build/boot
  evidence, without operating DB writes or real OpenAPI requests.
- Verification checkpoint: the second full PostgreSQL run finished with
  204 passed, 614 failed and one skipped across 819 tests. Repeated PostgreSQL
  `57P03` recovery-mode errors invalidate this as a completion gate; the cause
  is not yet established. Do not equate this with 614 application regressions
  or claim the earlier fixture fixes closed the whole suite. Re-run after
  resolving the disposable test environment and finishing the new delta.
- Script verification checkpoint: Vitest passes all 195 tests in 33 files
  after retired replay expectations/default profiles were corrected. The Node
  contract phase passes 224 tests with three skips. The Inventory authority
  scanner explicitly allows the three verified disposable fixtures; production
  write detection remains intact.

- Approved ABC eligibility update (2026-09-07): sale age and evidence
  sufficiency are independent. Sale age is 30 elapsed KST calendar days at the
  evaluation cutoff from the earliest valid `saleStartedAt` of validly mapped
  channel listings. Evidence has no minimum-day count: the selected interval
  must instead be complete and valid. Unknown dates are not inferred; old sale
  age cannot validate gaps or zero-fill. Update the current formula version,
  Finance evidence, Products publication/read status, and regression tests as
  one contract. Verify 29/30-day boundaries, cutoff rather than current time,
  invalid/unmapped dates, valid periods under 30 days, missing/stale periods,
  last-good retention, and publication races. This replaces the earlier
  temporary zero-observation gate. The approved through-yesterday period and
  corrected source-cost contracts below also apply.
- Latest source contract: preserve Sellpia stock and independent 401-day profit
  collection; no ABC-specific duplicate collection. ABC targets KST yesterday
  using at most 12 exact calendar-month/partial-month buckets with aligned
  advertising, actual covered-day weighting and no daily proration. Repair
  graph-cost omission using period-specific `total_in_amount` on the fixed
  401-day product set and verify full-window reconciliation. The corrected
  parser/provenance excludes old unverified graph-cost captures from grading.
  Kakao conversion is explicitly unsupported until
  a validated converter exists; retain the original capture.
- The user confirmed `localhost:5433/kiditem` is an operating clone and approved
  read-only inspection. The 2026-09-06 repeatable-read, read-only inspection found
  one queued Operation, eight running Wing order imports, no schedules/workflows,
  and 151 pending/running Operation alerts. No rows were changed. ABC evaluations
  are empty; existing Sellpia monthly rows have no confirmed order-time-cost/VAT
  provenance. This clone inventory is not a deployment preflight: deployed SHA,
  backup, writer shutdown, and destructive cutover remain separate gates.
- Live Sellpia inspection (2026-09-06, provider reads only) confirms a one-day
  product-sales query is possible. Changing only the independent purchase-date
  range changes displayed total purchase cost; the provider help defines that
  range as goods purchased from suppliers. The collector currently reads monthly
  `graph` tuples and the ABC reader maps `inAmount` to `orderTimeSupplyCost`.
  Verify that tuple's cost meaning separately before certifying it as sold-unit
  order-time cost. The purchase total or a selected radio alone is not sufficient
  evidence. No provider payload, product identifier, or financial value is retained
  in this execution record; no daily evaluator change has been made.
  Follow-up on 2026-09-07 reproduced the supplied 256-row/5-cost-mismatch case
  and found 129 cost mismatches in the actual 1,393-row 401-day response, with
  revenue/quantity sums matching. Independent September and August purchase
  windows exposed graph-omitted costs only in zero-order buckets (4 and 3 rows).
  The current spec records the corrected period-total collection contract.
  Follow-up live browser reconciliation held sales at 2025-08-02–2026-09-06
  across all 14 intersecting purchase periods: every response retained all
  1,393 identities and unchanged revenue/order quantities; period cost and
  purchase-quantity sums exactly matched all full-window totals (zero mismatches,
  no rounding tolerance). Root independently reran the repaired collector's
  9 tests, Analytics read/normalization's 11 tests, and Advertising period's
  8 tests successfully. Installed-extension → owner → consumer QA remains a
  separate pending gate; provider reconciliation is not end-to-end acceptance.
  Installed-extension follow-up (2026-09-07 14:58 KST), through the existing
  Product Hub full-refresh button against disposable QA DB `localhost:56879`:
  Inventory independently completed 1,821 SKUs; profitability completed 19,488
  period rows with `sellpia-profitability-v2`, publication sequence 1, covering
  2025-08-02 through 2026-09-06 (KST), including all 14 intersecting months.
  Persisted quality provenance records `ORDER_TIME_SUPPLY_COST`, VAT included,
  and `correctedCostEvidence: true`; 14,056 period rows matched source identities
  and 5,432 remain unmatched warnings. This does not prove valid master/channel
  mappings, and the warnings must not be silently treated as evaluation-ready.
  The prior profitability failure Alert was resolved (one existing row, no new
  failure Alert). Two earlier attempts had failed with a generic login-required
  message; refreshing the existing profit tab allowed the normal collector to
  finish. This establishes collection/owner publication and recovery, not the
  precise original browser error or mapped-product/ABC consumer acceptance.
  The existing ABC data-status panel then displayed Sellpia profit as current,
  through 2026-09-06, collected at 14:58:46 KST. Advertising remained uncollected,
  mapping required refresh, official publication/formula revisions remained 0,
  and explicit grade refresh stayed disabled. The navigation unread Alert badge
  cleared. Source success therefore did not auto-publish or invent an ABC grade.
  Do not infer missing channel mappings, sale dates, or advertising evidence
  from this successful source capture. The whole PostgreSQL gate naturally
  finished after 1,136 seconds: 99/102 files and 816/819 tests pass. Remaining
  Advertising failures are action priority (urgent versus medium), strategy
  action count (3 versus 2), and rank terminal HTTP (201 versus 404). The run
  was not cancelled or classified as a hang, and is not a passing gate.
  Follow-up: action/strategy fixtures now bind their test SKU rows to the
  current completed Inventory publication; their business assertions remain
  unchanged. Rank HTTP acceptance now owns one explicit loopback listener
  for the suite instead of request-scoped lazy listeners. The exact original
  rank 404 was not reproduced in isolation; do not claim its cause proven.
  All three files passed together (45/45) after these fixture changes. Root
  reviewed the limited fixture delta and started another whole PostgreSQL gate;
  that result is pending. QA correction: browser collection does not require
  Coupang API keys. At the user's direction, reuse the existing local environment
  settings while overriding DATABASE_URL to the existing disposable QA DB and
  retaining isolated storage/background-job settings. The QA organization now
  has the single active Coupang account's non-secret identity fields, copied
  from the read-only clone without credentials/config or collected facts.
  This is QA setup, not proof that the live browser account matches or that
  Advertising/Wing collection has passed.
  Post-QA delta: product-profit Chrome execution/access errors no longer imply
  a login failure. A fixed page-access/reload message replaces that inference;
  explicit page login evidence and existing tab/retry/collector behavior remain
  unchanged. Root reviewed this limited change with correctness and Ponytail
  lenses (no new helper/runtime) and reran all 11 product-profit VM tests.
  The full extension command (`extensions/tests/*.test.mjs` and nested
  `extensions/tests/*/*.test.mjs`) then passed all 820 tests after this change.
  The cutover scanner and reconstruction gate pass. The release gate currently
  fails because newly added `v0.1.30/006_delete_legacy_channel_derived_master_products`
  does not match VERSION 0.1.31. Read-only operating-clone history contains
  v0.1.30 migrations 001–005, not 006 or v0.1.31; resolve the registration before
  claiming release readiness, without changing already-applied migration IDs.

- This is the declared platform-boundary reconstruction exception to the one-domain-per-session rule; unrelated domain cleanup remains excluded.
- Implement against the approved spec with `ponytail` (full): trace real callers, reuse existing
  code and native primitives, then write only the smallest working change. Review
  with `ponytail-review` for deletable complexity; keep correctness, performance
  and trust-boundary verification distinct. Do not remove required fences or
  failure handling to reduce line count, or add review rounds for this rule.
  Test-first ordering is optional; owner transactions and real consumer behavior
  still require focused regression evidence before acceptance.
- Use Luna/max for bounded implementation subagents. The root inline session
  owns planning, spec interpretation, code-quality review, integration, and
  verification; do not delegate a separate review agent. Review correctness
  and Ponytail deletable complexity against the final integrated path, without
  repeating unchanged feedback or imposing a test-first workflow.
- After all implementation and basic builds/focused tests, the root performs
  one whole-spec/integrated-diff review before real extension/browser QA.
  Trace entrypoints through capture, conversion, owner publication, Alerts and
  existing consumers; check failure/cancel/resume, performance, duplicate
  ownership and temporary/legacy paths. Apply `ponytail-review` as a separate
  complexity lens. Use `improve-codebase-architecture` only where a confirmed
  structural problem needs further analysis, not for a new general redesign.
  Fix findings and pass relevant regressions before QA. After QA, review only
  new changes and verification results; do not repeat an unchanged full review.
  Task handoffs and partial reviews do not satisfy this whole-integration gate.
- A business action is removed only after its owner/capability acceptance test passes, or the ownership manifest names it `DELETE` and operating preflight confirms no required schedule/workflow.
- ActionBoard application code is removed; `ActionTask` table and rows remain dormant and no production code reads or writes them.
- Database Alerts retain only source/rules human notifications. Existing unreliable Operation alerts are reset rather than migrated into a compatibility shape.
- Rules uses a Rules-owned `requestId`; it does not retain an Operation foreign key or invent a replacement execution ledger.
- The global notification UI polls `/api/alerts` every ten seconds and refetches on focus/dismiss. No SSE, replay, backfill, progress, or aggregate panel remains.
- Destructive schema/data commands run only through the explicit `0.1.31` cutover after backup and read-only preflight on the Windows Office host.
- No completion claim is made without NestJS boot, web build, focused PG tests, scanner green, and real browser execution.

---

### Task 1: Record Read-Only Operating Preflight

**Files:**

- Create: `scripts/operation-automation-cutover-preflight.mjs`
- Create: `scripts/__tests__/operation-automation-cutover-preflight.test.mjs`
- Create: `docs/runbooks/operation-automation-cutover.md`
- Modify: `package.json`

**Interfaces:**

- Consumes: an explicit read-only PostgreSQL URL and the deployed/release Office SHAs.
- Produces: sanitized JSON counts and identities needed to authorize the hard cutover; it performs no mutation.

```ts
type CutoverPreflight = Readonly<{
  generatedAt: string;
  deployedSha: string;
  releaseOfficeSha: string;
  counts: {
    operationRuns: number;
    activeOperationRuns: number;
    enabledSchedules: number;
    workflowTemplates: number;
    workflowRuns: number;
    marketplaceItems: number;
    actionTasks: number;
    operationAlerts: number;
    rulesApplications: number;
  };
  activeOperationKeys: readonly string[];
  enabledScheduleKeys: readonly string[];
  installedWorkflowNames: readonly string[];
}>;
```

- [x] **Step 1: Write failing safety and output tests**

```js
it("uses only SELECT and rejects a writable execution mode", async () => {
  const sql = await buildPreflightSql();
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|drop|truncate)\b/i);
  assert.throws(() => parseArgs(["--apply"]), /read-only/);
});

it("prints counts and bounded names without row payloads or secrets", async () => {
  const report = await runAgainstFixture();
  assert.deepEqual(Object.keys(report.counts), expectedCountKeys);
  assert.equal(JSON.stringify(report).includes("input"), false);
  assert.equal(JSON.stringify(report).includes("result"), false);
});
```

- [x] **Step 2: Run the script test and verify red**

Run: `node --test scripts/__tests__/operation-automation-cutover-preflight.test.mjs`

Expected: FAIL because the preflight command does not exist.

- [x] **Step 3: Implement the read-only preflight and runbook**

The command requires `--database-url`, `--deployed-sha`, and `--release-office-sha`; opens a read-only transaction; queries table existence before counts; reports only counts and bounded catalog keys/names; and refuses URLs that do not parse. The runbook executes it from the Windows Office host before writer shutdown and stores output outside Git.

- [x] **Step 4: Run local fixture tests**

Run: `node --test scripts/__tests__/operation-automation-cutover-preflight.test.mjs`

Expected: PASS and the fixture query log contains SELECT/transaction-control statements only.

- [ ] **Step 5: Run Office preflight when on the Windows host**

```powershell
npm run deploy:office:status
node scripts/operation-automation-cutover-preflight.mjs --database-url "$env:DATABASE_URL" --deployed-sha "$env:KIDITEM_DEPLOYED_SHA" --release-office-sha "$env:KIDITEM_RELEASE_OFFICE_SHA"
```

Expected: the report identifies zero active runs and zero enabled schedules at the agreed writer-stop window. If not, the cutover stops and the named work is completed or cancelled manually before rerunning the same read-only command.

- [x] **Step 6: Commit preflight tooling**

```bash
git add package.json scripts/operation-automation-cutover-preflight.mjs scripts/__tests__/operation-automation-cutover-preflight.test.mjs docs/runbooks/operation-automation-cutover.md
git commit -m "test: add operation cutover preflight"
```

### Task 2: Give Rules Its Own Direct Request Identity

**Files:**

- Modify: `prisma/models/system.prisma`
- Modify: `apps/server/src/rules/services/types.ts`
- Modify: `apps/server/src/rules/services/rules.service.ts`
- Modify: `apps/server/src/rules/controllers/rule-evaluation.controller.ts`
- Modify: `apps/server/src/rules/rules.module.ts`
- Modify: `apps/server/src/rules/AGENTS.md`
- Modify: `apps/server/src/rules/__tests__/rules.controller.spec.ts`
- Modify: `apps/server/src/rules/__tests__/rules-evaluation.pg.integration.spec.ts`
- Delete: `apps/server/src/rules/adapter/in/operation/rules-evaluation.operation-handler.ts`
- Delete: `apps/server/src/rules/adapter/in/operation/__tests__/rules-evaluation.operation-handler.spec.ts`
- Delete: `apps/server/src/rules/domain/operation/rules.operations.ts`
- Delete: `apps/server/src/rules/adapter/out/automation/operation-alert.adapter.ts`
- Delete: `apps/server/src/rules/application/port/out/cross-domain/operation-alert.port.ts`

**Interfaces:**

- Consumes: authenticated organization/user and an HTTP idempotency key.
- Produces: synchronous `RulesService.evaluateAll({ organizationId, requestedByUserId, idempotencyKey })` with a Rules-owned `requestId` and an idempotent `RulesEvaluationApplication` receipt.

- [x] **Step 1: Write failing direct Rules tests**

```ts
it("evaluates and applies without creating an OperationRun", async () => {
  const result = await service.evaluateAll({
    organizationId,
    requestedByUserId,
    idempotencyKey,
  });
  expect(result).toMatchObject({
    requestId: expect.any(String),
    status: "completed",
  });
  expect(await prisma.operationRun.count()).toBe(0);
});

it("replays the same Rules request without duplicating alerts or applications", async () => {
  const first = await evaluate(idempotencyKey);
  const second = await evaluate(idempotencyKey);
  expect(second).toEqual(first);
  expect(await countApplications()).toBe(1);
});
```

- [x] **Step 2: Run Rules tests and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/rules/__tests__/rules.controller.spec.ts`

Then: `npm run test:integration --workspace=apps/server -- src/rules/__tests__/rules-evaluation.pg.integration.spec.ts`

Expected: FAIL because Rules currently starts and reads an OperationRun.

- [x] **Step 3: Replace the Operation foreign key**

Rename `RulesEvaluationApplication.operationRunId` to `requestId`, unique by `(organizationId, requestId)`. Derive one stable request ID from the authenticated actor plus idempotency key or create it once in an owner receipt. Execute the existing deterministic evaluation transaction directly, insert Rules Alerts in that transaction, and return the stored result on replay.

- [x] **Step 4: Remove handler/module dependencies and run Rules tests**

```bash
npm exec --workspace=apps/server vitest -- run src/rules/__tests__/rules.controller.spec.ts
npm run test:integration --workspace=apps/server -- src/rules/__tests__/rules-evaluation.pg.integration.spec.ts
```

Expected: PASS with organization isolation, replay idempotency, and no Operation/Panel/OperationAlert reference.

- [x] **Step 5: Commit the Rules seam**

```bash
git add prisma/models/system.prisma apps/server/src/rules
git commit -m "refactor: make rules evaluation directly owned"
```

### Task 3: Move Surviving Domain Actions Off Operations

**Per-source completion contract (clarified 2026-09-06):**

`real entrypoint → unchanged collector → owner publication → existing screen/decision read → old path removal → focused tests PASS`

An ownership-manifest entry or a deleted wrapper is not completion evidence.
Connect existing HTTP/PostgreSQL and extension tests across these actual
Interfaces; do not introduce a new checker framework or runtime registry. Real
provider/browser QA remains an additional Task7 gate for every retained source.

**Current open-path summary (not historical checkpoint totals):**

Inventory consumer follow-up (approved 2026-09-07; earlier ABC changes remain):

- [x] Trace existing Inventory publication/read/freshness ownership and reuse
  implemented fencing, atomic stock/basis publication and purchase rechecks.
- [x] Remove only duplicated consumer source/status decisions and ordinary-read
  file-validator coupling; audit filename/hash contracts before deleting fields.
- [x] Connect existing successful-publication cache invalidation to all affected
  purpose-specific consumers without merging their queries/business policies.
- [x] Prove last-good values during running/failure with accurate freshness,
  same-publication quantity/basis, unknown versus zero, successful refresh and
  late older terminal rejection through consumer tests and integrated QA.

Gap audit: owner atomic publication/fencing, ordinary-read file-validator
separation and purchase transaction rechecks already exist; preserve them.
Focused additions are consumer-interface lifecycle tests, canonical server
freshness replacing the web's local-attempt status override, unknown summaries,
missing consumer invalidations and the retained explicit source-binding UI.
Barcode printing currently concatenates separately published pages: reuse the
existing whole-snapshot export reader through a narrow static JSON read route,
not a new query/runtime, so quantities and dates come from one publication.
The current Inventory expiry projection also needs to agree with its attempt
read: expired current work is a failure, not browser-derived state. Keep
unclaimed pending refreshes distinct and preserve the previous complete basis.
These follow-up deltas require inline review before resuming provider QA; the
earlier integrated review is not a claim that these new deltas passed.
Web delta verification: 108 focused tests pass; root's web production build
also passes. Local attempt state no longer overrides Inventory freshness;
terminal and observed publication-generation changes reuse cache invalidation,
including channel-product matching. Binding remains explicit attestation,
not provider login verification. Backend consumer/expiry/race gates remain open.
Backend bounded gates now pass: owner/list/detail/export PostgreSQL14 and
focused unit19. Root independently passes all Inventory unit185, server build,
and observed the updated Nest boot on the disposable QA stack. The expanded
six-file consumer PostgreSQL run is NOT green: 59/72 pass, with 13 failures in
Products, Channels and Analytics stock expectations. Trace and repair missing
official-publication fixture provenance rather than weakening owner selection;
Supply confirmation's existing transaction gate passed unchanged.
The corrected consumer fixtures and stable Rocket HTTP listener now pass the
root's full six-file rerun: 72/72. Final web build also passes after enabling
the existing freshness badge and removing the misleading static "latest"
caption; conventions pass. Actual Chrome shows three "미수집" summaries before
first publication, and the refreshed provider page confirms the logged-in
fixed Sellpia account. Root explicitly confirmed that source in disposable QA
and started real extension inventory collection; terminal/result verification
is still pending. No operating database mutation was performed.
Real Inventory retry completed through the installed extension on disposable
QA56879: the same screen changed from three "미수집" summaries to 1,821 total
SKUs, 949 in stock and 872 out of stock, with completion basis
2026-09-07 14:44:51 KST and "최신 / 방금 전" shown together. This supplements
the consumer PostgreSQL failure/expiry/old-terminal/race evidence above;
it does not complete the remaining Sellpia-profit401/ad-source QA or the final
whole hard-cutover PostgreSQL gate.

Fresh QA login succeeded. Actual full-refresh admission returned Inventory409
(source binding not confirmed), while profit independently began with the exact
2025-08-02–2026-09-06 plan and terminated FAILED with a Sellpia login-required
message. This proves failure separation, not successful 401-day collection;
provider session/binding verification remains open. Operating DB was untouched.
The bounded HTTP fixture corrections now pass keyword30 and catalog11 (plus
rank/catalog27 together); the whole PostgreSQL gate still requires a rerun.

Pre-QA integrated review checkpoint (2026-09-07): the inline review and its
identified blocking corrections are complete; final whole-suite consolidation
and actual provider QA remain separate, open gates.
Tracing the actual extension listener and Nest route found an active
`/api/ads/extension/sync` writer dispatch despite the zero-finding legacy gate.
The four legacy ingestion branches are removed; retained collectors use their
owners and the popup GET uses `/api/ads/extension/status`. The existing
contraction gate now covers that retired ingress. Status reads reuse the
itemwinner owner's selected COMPLETE attempt; nonempty → confirmed-empty →
failed publication passes the actual status HTTP/PostgreSQL regression (9/9).
Popup admission preserves request identity and rejects unrelated RUNNING plans.
The terminal-key reuse defect is corrected: COMPLETE/FAILED allow a fresh
explicit request, while a lost begin acknowledgement reuses its pending key.
Root's complete extension rerun passes 818/818 tests. The further status-read
race is corrected: owner publication stores immutable listing observations
alongside its KPI; consumers no longer join the mutable daily projection.
The exact consumer regressions cover intervening same-day publication, missing
winner state, confirmed empty and failed refresh (11 PostgreSQL passes).
Root inspected the final owner/read delta; server build and conventions pass.
The subsequent frozen whole PostgreSQL run finished 100/102 files and 813/817
tests passing. Itemwinner's 11 regressions passed; three keyword HTTP timeouts
and one catalog admission HTTP401 remain under diagnosis. Do not increase
timeouts, weaken authentication or call the whole gate green from isolated
reruns. The owned ephemeral HTTP-listener lifecycle is one hypothesis, not yet
a proven cause.

Fresh QA stack now uses disposable PostgreSQL56879 with the current schema;
root verified actual `npm run dev:server` boot and anonymous Alerts HTTP401.
Previous inventory QA DB56833 remains alive with its evidence; only its owned
API/Web processes were stopped. The worktree extension was reloaded and
confirmed enabled. Browser QA paused because native interaction encountered a
different search/Obsidian popup; user coordination is requested before further
UI actions. User confirmed no concurrent Chrome use and approved continuing;
treat the unexpected navigation as a control issue, not user interference.
Root reconnected native control and resumed the actual login. No source
collection has been accepted on the fresh stack yet.

The Gateway imports root `agent-config` profiles; shipped prompts now use the
current invocation/resource contract instead of removed `operation_status`.
Rules and Agent capability integration were traced independently of Alerts:
Rules commits its request receipt/results/notifications together; AI cancellation
updates generation and direct job in the owner transaction, while provider-media
publication locks current selections before preserving manual choices. The
first disposable Rules/capability rerun was 9 pass / 1 fail because a Rules test
called deleted `prisma.operationRun.count`. The corrected assertion verifies
`to_regclass('public.operation_runs') IS NULL`; root reran both suites against
fresh disposable PostgreSQL, 10/10 pass. Earlier bounded AI PG evidence remains
separate from live AI QA. The unused `operationRefs` receipt hook and wire field
are removed. Registered pre-schema migration 004 removes only that JSON member
from stored receipts; replay and second-run no-op have PostgreSQL coverage.
Root Gateway suite passes 158 tests (10 skipped); shared, Gateway, server and
web builds pass for this checkpoint.

The first whole PostgreSQL sweep finished with 94/102 files and 794/814 tests
passing. Current-contract fixture fixes pass Channels28, Analytics14 and
Advertising22; no legacy readers were restored. The Wing-rank 404 did not
reproduce in isolated or paired suites, so its assertion now retains the HTTP
failure body for diagnosis. Root corrected missing test reset in the cutover
migration suite (1 pass) and supplied COMPLETE provenance to the rising-product
fixture (3 passes). A whole-suite rerun is in progress; focused results do not
replace it. Root's updated whole server-unit run passes 511 files / 3,104 tests
with 4 expected failures and 4 skipped cases, after retired ingress tests were
removed with their production paths.

Ponytail deletion follow-up removes unused `/scrape-targets` runtime CRUD,
exclusive DTO/repository/port and DI wiring. There are no retained UI, extension,
Gateway or capability callers. The schema/table/data remain unchanged. Focused
status/controller/module tests pass 26/26; named source owners remain intact.

Full-refresh consumer review found that a resolved FAILED/RUNNING inventory
result was ignored before displaying overall success. The component now checks
both source results without suppressing profit after stock failure; root's four
component regressions pass. This is source feedback only, never an ABC trigger.

Current ABC policy integration checkpoint (2026-09-07): root independently
reran 41 focused ABC/Finance/sale-date tests and 42 PostgreSQL tests across
Products publication, Finance evidence, Inventory ABC reads and product
operations. All pass, including persisted sale-start provenance and rejection
of a changed mapped sale date without partial writes. Sellpia source-owner
PostgreSQL separately passes 14/14. The source parser-v2 fixture mismatch from
the first integration run is resolved. The Sellpia profit owner entrypoint is
restored. Root reran the complete extension file set (including nested tests):
812/812 pass; the earlier shared-loader omission is fixed. Shared and server
builds pass, and the current isolated dev server restarted successfully with
anonymous `/api/alerts` returning 401. The final web build exposed one missing
`saleStartDate` in a test fixture; it is corrected and the full web production
rebuild passes, including TypeScript and all 46 static pages.
The fixture's consumers pass 24/24. Final inline review removed the redundant
pre-terminal control read and retained capture before best-effort progress
updates; root independently reran the extended owner regressions, 8/8 pass.
Installed-extension → owner → consumer QA remains
open; provider reconciliation alone does not prove that complete path.
Root full server-unit rerun now passes 514 files / 3,168 tests, with 4 expected
failures and 4 skipped cases. The preceding full run had one intermittent
conversation HTTP 404/400 mismatch; that unchanged suite passed 8/8 in isolation
and the second complete run passed without code changes or retry configuration.

Latest integration gates (2026-09-07): shared build, production server TypeScript,
full web build, and the full extension Node test file set pass. Root campaign
PostgreSQL rerun passes 21/21 after correcting the stale test rendezvous. The
SellpiaSalesModule Alerts import was fixed and its real Nest initialization test
passes. Full Nest boot on disposable PostgreSQL passes, including unauthenticated
`GET /api/alerts` returning 401. Conventions checks pass. The pre-QA
whole-integrated review is now in progress; actual provider QA remains open.

Latest post-manual-match boot verification: root ran the actual `npm run
dev:server` against a fresh PostgreSQL 17 Testcontainer. Nest compiled and
listened on isolated port 4107; anonymous `GET /api/alerts` returned 401.
AI background execution was disabled and storage used an isolated unavailable
endpoint. The owned process group, disposable database and temporary gateway
token were cleaned up; the operating clone was untouched.
Native Chrome inspection identifies a concrete QA mismatch: enabled KIDITEM OS
1.0.23 (`ngbbaclphaomfkjlfiidakomifaanobg`) is loaded from
`/Users/yhc125/workspace/kiditem/extensions/kiditem-os`, not this hard-cutover
worktree. Do not count that installed extension as current-patch acceptance.
User approved loading the worktree extension and completed the native folder
selection. Root verified Chrome now shows enabled KIDITEM OS 1.0.23,
ID `kfionjdklijcjedgfmcfbjadlfmobdcg`, loaded from this hard-cutover worktree's
`extensions/kiditem-os`. This proves installation identity, not collection
acceptance. Direct Sellpia tab control previously returned `Debugger unattached`;
native Chrome inspection worked after resetting the control session.

Actual inventory QA (2026-09-07): the worktree extension passed capability/auth
handoff from the inventory screen. The synthetic QA organization initially had
no Sellpia account binding, so begin returned 409 without creating an attempt.
Root configured only the disposable QA organization through the existing owner
binding API. The next real screen click created a RUNNING inventory attempt,
but the web strict response schema rejected the server's `fileHash` field before
collector dispatch. Fix the response contract and resume that same attempt;
this is not collection acceptance. The screen's generic start-failure message
also hides the actionable binding/contract error. No operating-clone writes.
After freshness polling, that RUNNING attempt also disables the only sync
button, preventing the hook's existing same-attempt resume from being reached.
The response-contract fix must cover this real UI recovery path, not just a
mocked successful begin. Root production TypeScript passes after the approved
ABC missing-product-period correction.

Inventory boundary audit also found active legacy freshness claim/heartbeat
HTTP methods and lease renewal code. Remove the unused browser lifecycle while
retaining owner attempts, read/source-binding and manual-import concurrency;
verify retired routes and retained HTTP/PostgreSQL contracts before calling
the Inventory cutover complete.

Actual inventory recovery evidence: root's two affected web suites pass 14/14.
The original attempt expired, was persisted FAILED through explicit retry, and
appeared as one unread Alert in the real UI. A subsequent attempt
`8abb4e6d-a1dc-43f8-b2f4-ecb0a05fd06d` survived a development-server restart;
explicit same-attempt resume through the real screen and installed extension
completed with 1,820 rows. Read-only inspection of disposable PostgreSQL confirms
1,820 canonical inventory SKUs and the same failure Alert row now RESOLVED.
No collector policy or provider input was changed. End-to-end screen acceptance
is still open: `latestImport` rejects the JSON snapshot's filename + null
fileHash, although it has a valid contentChecksum. Remove this obsolete file
pair assumption for JSON snapshots with regression coverage at the consumer
interface; do not fabricate a file hash/artifact to satisfy the old schema.

Inventory screen acceptance now passes (same collected data, no recollection):
after shared read-schema correction/build, root reloaded the real Chrome
inventory screen and observed 1,820 total SKUs, 951 in stock, 869 out of stock,
the populated first 50-row page, and actual completion time
2026-09-07 09:26:21 KST. The unnecessary read-only file-pair refinement was
removed rather than adding an inferred browser/legacy exception; canonical
manual-import validation remains. Implementer reports shared schema 15 tests,
web focused 12 tests, shared build and web production build PASS. Root separately
ran owner-hook/stock-ops focused tests (14 PASS) and verified the actual provider
capture → owner COMPLETE → Alert resolution → existing screen query path.

Inventory follow-up (2026-09-07): obsolete freshness request/claim/heartbeat
routes and failed-attempt persistence were removed while keeping read/binding,
owner attempts and manual imports. Root retained owner/manual PostgreSQL suites
pass 22/22; root's independent Rocket PO regression rerun passes 25/25 on
disposable PostgreSQL at localhost:56842. The earlier Rocket failure did not
reproduce in isolated or full reruns; assertions were not weakened. Final
integrated gates remain open.

The real Inventory Excel button also returned a transient server-generated
HTTP 200 workbook. Read-only inspection of the browser download confirmed 951
unique in-stock rows, numeric stock/prices, matching stock-value calculations,
and one import cutoff. A concurrent-publication risk remains in its paged
snapshot reads and is being corrected before export consistency is accepted.
Rendered column widths are cramped; workbook data validation is not a claim
that layout was improved. No operating-clone data was changed.

Post-handoff `check:conventions` passes every constituent guard. The first
full extension run (91 Node test files) failed because the shared order worker
VM harness omitted `KidItemSellpiaManualMatchSourceOwner`. Production import
order was already correct. The shared test module list now loads that owner
immediately after its collector; no collector assertions were removed. Root
inspected the loading parity and reran the previously failing suites: 21/21
pass. Implementer's full extension rerun reports 91 files, 800 tests passed,
zero failures. Actual extension/provider acceptance is still unverified.

After the manual-match server/shared changes, root rebuilt shared successfully
and reran production server TypeScript successfully. The first TypeScript run
failed against stale shared declaration output; only the post-build rerun is
passing evidence. The cutover scanner again reports zero findings.
Server-side Excel export/conversion verification now passes 27 tests in 10
files across Finance, Advertising, Channels Wing inventory/registration,
Supply Rocket confirmation and Inventory. Workbook assertions cover sheet
names, columns, values and filenames; controller tests cover the API seam.
Root also reran the five web download-boundary suites (Finance, Advertising,
Supply, Inventory and Wing registration): 12/12 pass, checking server routes,
uploaded inputs, returned filenames and download handling.
These focused tests do not substitute for the remaining browser/provider QA.

Root Rocket PO + mall-order source PostgreSQL rerun passes 29/29. Coverage
includes public HTTP fencing, prior COMPLETE retention, confirmed empty,
Alert rollback, original capture retention and server conversion replay.
The disposable Rocket fixture publishes 4,000 lines (2,332,981 JSON bytes) in
3,647ms using 32 recorded Prisma/raw operations; COMPLETE read takes 122ms.
These measurements are not Office performance or live-provider acceptance.
The current cutover scanner passes with zero unowned producers, source-to-ABC
references and legacy runtime references; actual consumer review remains
necessary, as the Sourcing findings below demonstrate.
Read-only preflight/scanner fixtures pass 14/14. The disposable cutover PG
rehearsal passes its active-writer rejection, injected-failure rollback,
idempotent preparation and dormant ActionTask/source-row preservation test.
No operating database migration or schema change was run.

Advertising publication-selection correction is verified: campaign/action
daily readers select only explicit `campaign_sweep`, and exact-range manual
reports retain separate COMPLETE authority. Root campaign source, published
read, campaign-grain and itemwinner PG batch passes 44/44, including failed and
empty publication behavior. The existing campaign page now renders report
rows rather than only a count banner. Frontend fuzzy field/numeric inference
is removed: the panel displays contract-defined normalized fields or original
labelled primitive cell values without inventing units. Root UI tests pass
12/12, including raw `1.2만` preservation. The latest full web build completes
all 46 pages; actual provider/UI acceptance remains open.

Integrated review coverage so far: Advertising manual/sweep selection (corrected
and verified above); Alerts transaction seam and read UI; Products ABC pure evaluator,
explicit controller entrypoint, and publication CAS/baseline/history path.
Finance evidence assembly and the remaining source entrypoint/consumer paths
are not yet fully reviewed. Alert Ponytail cleanup removed unused focused
projection/read methods, duplicate list aliases, and lowercase legacy status
handling without changing source terminal transactions. Agent verification:
server unit10, disposable Alert PG3, shared3, and web6 pass; root inspected the
integrated deletion and retained GET route delegation.

Root AI direct-job and public catalog-media PostgreSQL verification passes
7/7 on a disposable database: concurrent replay/hash drift, checkpoint recovery,
atomic owner/job cancellation, manual media preservation and organization
isolation. Image-edit UI polls the direct task API rather than an Alert. These
tests do not establish live AI-provider execution or every job failure window.

Root review-source PostgreSQL rerun passes 4/4 through owner HTTP and the
actual review read service, including RUNNING/FAILED exclusion from listing
stats, organization isolation, cumulative COMPLETE reads and Alert rollback.
Review UI cancellation finding is corrected: begin-issued control identity is
retained independently of passive read status and used only for the matching
attempt. Root inspected the same-attempt/late-read guard and reran the component
and transport suites: 5/5 pass, including poll-then-fenced-owner-cancel and
visible cancellation failure. This does not establish page-reload or live
provider acceptance.

Analytics Sellpia sales integrated/Ponytail finding is corrected: the summary
requires its published-source reader and no longer contains an unfiltered
snapshot fallback or unused direct ingest writer. Exact confirmed-empty
provenance validation lives in the source owner. Root reviewed the deletion and
retained policy tests, then reran owner-policy/public-HTTP PG13 and summary
unit9 successfully. The first unit invocation used the wrong working directory
and found no tests; the corrected server-directory run is the passing evidence.
After the concurrent Channels files were restored, root reran the actual
Sellpia-sales Nest module initialization test: 1/1 passes. Whole application
boot still remains a later integration gate.

Channels Sellpia manual-match integrated finding: the owner manifest names
Channels, but both web matching flows still collect a browser snapshot and then
call an unfenced page-owned import. Closing the page can therefore discard the
result. Complete the approved lifecycle transplant: freeze the existing active
SKU target list in a Channels-issued SourceImportRun attempt; submit directly
from the extension; commit terminal state, current aliases/snapshot and Alert
in the same owner transaction. Preserve existing URL, target limits, extractor,
alias normalization and matching policy. Keep the existing target/status and
alias consumers; replace the page import and prove replay, fencing, failure
retention and unchanged normalized output at the public interface.
Inline review of the first server slice found that begin fingerprinted freshly
read inventory targets although its caller request is `{}`. Correct replay to
return the original frozen plan after inventory changes; resolve targets only
for a new admission and retain current-target validation at complete. Also
remove unused public replace-current/alias-candidate methods that bypass or
duplicate the attempt-owned transaction. The server corrections are now verified:
root reran the disposable PostgreSQL/public HTTP suite, 7/7 pass. It covers
begin/complete/replay, changed-payload conflict, retired import 404, foreign-org
404, and a blocked terminal transaction that revalidates targets after the
inventory owner's concurrent mutation commits. The unused public mutation
methods are removed; client integration and provider acceptance remain open.
Client inline review found a redundant owner GET after capture but before
retaining the terminal payload. Its failure discarded the captured snapshot and
caused a user retry to recrawl. Remove this extra read (terminal already checks
the owner), retain the terminal request before network work, and verify an owner
read outage followed by same-payload retry without recollection. This requires
no permanent output storage or additional execution runtime.
Client corrections are now implemented: organization/origin-scoped request
identity is retained before begin, known RUNNING attempts resume only on an
explicit action, and extension admission is checked before a new begin. Shared
plan/attempt/source-status schemas replace the duplicate local contracts.
Root matching API/collection/hook tests pass 20/20, including lost begin-response
replay and a later RUNNING attempt not invalidating current publication.
The extension bridge suite separately passes 12/12 (32 web tests total).
The post-handoff full web build passes TypeScript and all 46 pages.
Root extension owner tests pass 5/5, including a post-capture owner-read outage
followed by same-payload retry without another collection. The original
Sellpia collector has no working-tree diff; its characterization and common
browser-window suites pass 68/68. Actual provider acceptance remains open.
Mutable target checks in the page cannot overturn an
owner's committed COMPLETE result or label a newer current snapshot as an older
attempt's exact output; canonical validation remains inside the owner.

Common extension-shell review found a dead Wing session-creation branch still
using the retired `runId` start shape. Both retained production callers already
have owner attempts. Remove that branch and obsolete helper compatibility,
requiring the existing environment-owned session for both callers; preserve
browser traversal and retry behavior. Keyword-suggestion recovered cancellation
takes its terminal-only branch before browser/session work; that inspected path
does not re-enter the session storage queue while cancellation holds it.
The cleanup is implemented and its focused helper/session/owner tests exit
cleanly (30/30). Root full worker suite printed 73 results but did not terminate;
root stopped only that test process with exit130. Its new fixture's open timers
are being corrected. Do not count that worker run as a passing completed gate.
Superseding rerun: fixture-owned keep-alive intervals are cleaned in `finally`;
the root full extension Node file set now exits0. No forced process exit is
used. This closes the test-harness termination finding, not real-browser QA.

Inventory integrated trace confirms web actions use `collectSellpiaInventory`
and the extension posts original JSON bytes to the source-attempt completion
API. Root collector/owner Node tests pass 18/18. Ponytail follow-up: the old
`sellpia-sync/import` browser claim branch has no retained client caller and
still carries pre-owner execution compatibility. Preserve actual manual file
upload semantics and remove only the unreachable browser-import alternative
after focused rejection/manual-import regression coverage. Do not remove the
current owner attempt fencing or conflate content equality with new attempts.
The browser-import alternative is removed and retained inventory-policy PG
coverage is restored through the current manual interface: canonical SKU,
mapping generation, quality gate, hash replay and rollback. Root inspected the
16-case coverage and reran manual inventory, source-owner inventory and shipment
summary PG suites together: 29/29 pass. Only retired browser-file lifecycle
contracts are removed. Earlier production server TypeScript exits0; the final
integration build must include the later manual-only conditional cleanup.

Open Sourcing entrypoint finding: keyword suggestions have a public extension
handler and COMPLETE snapshot API, but no retained web/Agent caller invokes the
handler. The keyword page currently only reads prior snapshots. Restore an
explicit action on that page using the existing collector and source-owner
contract, retaining one request identity across uncertain transport and reading
the acknowledged COMPLETE snapshot; add no generic execution runtime.
The CTA and transport are implemented. The duplicate passive attempt query
that could shadow newer source status is removed; display uses canonical
source status while explicit retry retains imperative request reconciliation.
Root verified `maxResults:30` against the prior actual UI caller, rather than
inferring it from collector defaults. Root focused UI regressions pass 11/11:
explicit dispatch, same-request retry and current-state display. The actual
extension/provider execution remains a separate QA gate.

Root Wing traffic PG tests pass 3/3. The stale itemwinner begin fixture is
corrected to the actual `targetUrl` contract; its eight tests pass in the
44-test root batch above, including missing/forged-URL rejection.
Root Live Commerce, Sourcing Wing and server1688 PG batch also passes 32/32
after replacing obsolete Operation model checks with schema-absence checks.
Root Shadow + product-extension PG tests pass 16/16, covering daily paid-IO
admission, immutable replay, URL identity, failure/expiry and prior COMPLETE
preservation. Actual live-provider acceptance remains separate.

Resolved Naver analysis Alert finding: query publications are independently fenced
by `inputHash`, but all share one failure dedupe key. A successful different
query could therefore resolve an unrelated query's failure. The Alert key now
includes the same query scope for begin, complete and fail. Root inspected the
change and reran the new isolation/reopen/resolve test together with the
keyword-suggestion and Naver/Shorts PG suites: 10/10 pass.

The earlier 5/9 keyword-suggestion / Naver-Shorts PG result is superseded by
the passing rerun above. Obsolete `prisma.operationRun.count()` checks were
replaced with actual PostgreSQL table-absence assertions, and prior Naver
keyword history is preserved after an unrelated empty board result.

Shipment-summary integrated read/UI trace is verified: exact completed capture
and per-date calendar history are separate; old unowned historical dates remain
explicitly unverified rather than claiming collection completeness. Root PG7
passes in the 29-test Inventory batch, including proof rejection, idempotency,
expiry, Alert rollback and prior COMPLETE retention. Root calendar UI4 passes
for URL/calendar recovery, failed-source cutoff, existing RUNNING polling and
confirmed-empty capture without erasing history. Real Wing collection remains
unverified; fixture browser rendering is not provider QA.

Root Advertising rank-admission, tracked-product owner, competitor owner and
exclusion PG batch passes 38/38. Tracked-product daily rows are written only in
the terminal owner transaction (or the existing explicit tracker-registration
transaction), so their history reader does not need a second generation
selector. Wing batch cancellation reads the frozen owner batch and fails its
RUNNING attempts even without a live local dispatch; it is not only a local
session flag. Disposable admission measurements: 37 SERP targets/188ms/20,188
response bytes; 39 Wing targets/190ms/36,108 bytes. These are not live-provider
or Office performance results.
Root rank-batch/transport, competitor tracking and tracked-product UI suites
also pass 24/24. Their actual page paths use owner outcomes, retain request
identity after uncertain transport, display prior COMPLETE with failure status,
and avoid re-dispatch when restoring rank results. This closes the inspected
consumer/test gap for these paths, not real extension/provider execution.

Browser-QA preparation: the existing `qa-agent-os-clean-cutover.mjs` helper
already creates and validates an isolated Testcontainer, supplies scoped API/web
environment overrides and tears down only its owned processes/container. Root
helper/cleanup regression tests pass 22/22, including rejecting Office/default
database targets. Reuse this existing facility where applicable; its checks do
not establish current fixture compatibility or prove that the QA app has
started. No operating data was copied or changed during this preparation.
Root deterministic seed-helper tests also pass 14/14. The general-chat profile
does not seed the retired Operation/Automation models; actual seed application
to the final schema remains a runtime gate, not inferred from these unit tests.

Open Finance evidence finding: `aggregateSellpiaFacts` fills every covered
account month with zero for every currently mapped product. ProductSnapshot has
no product-specific sellable-period boundary, so a newly registered product can
receive historical observation days and pass the 30-day eligibility gate.
Account collection coverage alone does not establish that product's sellable
period. User approved conservative unavailable-evidence handling on 2026-09-07:
publish no new official grade without product-period evidence, retain the last
normal grade, and display actual financial facts separately. The bounded
Finance/ABC correction and regression tests are in progress. Do not substitute local
`createdAt` for provider history or silently treat missing facts as observations.

Corrected Sourcing history finding: TikTok `findTiktokCcHistory` and Live Commerce
multi-day snapshot reads filter the one `isCurrentComplete` run. Publishing a
new day's run hides prior days from existing history consumers; the develop
implementation previously queried the full requested date window. Preserve
date-scoped COMPLETE history and same-date replacement/empty semantics while
excluding failed, staged, and unowned facts. Related trend history readers are
included in this bounded correction. Root shared Sourcing attempt PG suite now
passes 21/21, including actual 1688/TikTok/Live read interfaces for multiple
dates, same-date replacement, scoped empty and failed exclusion. Root inspected
the date/scope selection; the producer's capture-date alignment remains part
of the final provider-path review, not inferred from repository fixtures.
Live empty-product selection additionally uses persisted sibling broadcast
dates, and Naver keyword scope uses both the frozen plan and returned keywords.
Production server TypeScript passes after these repository changes.

Rows sharing the same remaining gate are grouped. “Checkpoint” means bounded
implementation/test evidence only, not whole-path or deployment acceptance.

Root Sourcing URL/product, keyword suggestion and Wing source PostgreSQL rerun
passes 19/19. The URL suite uses the retained HTTP/capability entrypoints and
candidate read interface; keyword suggestions verify the existing snapshot and
stale cutoff; Wing verifies recommendation readers, scoped confirmed-empty
replacement and exclusion of staged/legacy evidence. Provider IO in these tests
is controlled, so actual extension/provider acceptance remains open.

| Source / explicit entrypoint                           | Current checkpoint                                                             | Still required before path completion                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Sellpia profitability                                  | Actual 401-day/14-period reconciliation and installed-extension owner publication completed; QA DB confirms completed import at 2026-09-07 14:58:46 KST; consumer readiness was checked in Product Hub | Final whole PG gate and successful ABC publication using matched complete advertising evidence |
| Advertising profitability                              | Explicit screen → installed extension → owner verified; first three daily product-report periods received 26,273 rows; overall attempt correctly failed without COMPLETE, one deduplicated unread Alert; navigation/readiness fixes covered by full extension825 | Reload and actual successful12-period retry, Alert resolution, account/mapping verification and published consumer QA |
| Advertising standalone keyword                         | Owner HTTP/PG30, both published keyword consumers and owner transport tests pass; old server keyword writer removed | Actual extension/provider acceptance and final integrated build gates |
| Advertising campaign31-day sweep                       | Frozen owner/receipts, atomic publication, cohesive campaign reads/status and collector transport tests pass | Retire unused legacy exits, actual extension/provider acceptance and final integrated build gates |
| Advertising account daily KPI                          | Owner HTTP/PG5 rerun after dual-write removal; Advertising/Analytics/Finance/Readiness consume published rows; Readiness generic controls removed | Retire remaining mixed/manual legacy ingress, real-provider acceptance and final integrated gates |
| Wing traffic                                           | Owner/publication path and root PG3 pass; full extension suite exits0 | Actual pagination/provider acceptance and final integrated gates |
| Wing itemwinner/KPI                                    | Exact-URL contract corrected; root owner PG8 passes within Advertising44 and full extension suite exits0 | Real provider acceptance and final integrated gates |
| Configured mixed targets / current-page manual capture | Orphan generic configured-target producer removed; retained popup modes are being connected to concrete source owners | Preserve original manual report 7-day selection or explicit targetDate 1-day selection (not 31-day sweep), exact-range published consumers, and provider QA |
| Keyword SERP / Wing rank                               | Per-keyword owner, serving reads and explicit batch transport checkpoints pass | Final common Browser I/O cleanup and actual provider/entrypoint QA; no parent runtime                                                  |
| Competitor catalog / seller identity                   | Direct enrichment sequence and bounded owner checkpoints pass                  | Final consumer-path proof and provider QA; unresolved identity absence stays explicit, not confirmed empty                             |
| Tracked Wing products                                  | Direct source-owner path exists                                                | Verify complete entrypoint/capture/public-read path and retire any remaining generic caller                                            |
| Wing product/option catalog                            | Owner, atomic public catalog reads and web/extension checkpoints pass          | Final common Browser I/O cleanup, actual vendor identity/provider QA and data cutover                                                  |
| Rocket PO                                              | Owner/preview/current-read checkpoints pass                                    | Real collector/preview QA and coordinated old-fact/schema cutover                                                                      |
| Coupang shipment summary                               | Owner/capture/calendar-read checkpoints pass                                   | Real collector QA and treatment of old unverified date rows during cutover                                                             |
| Physical Sellpia inventory                             | Actual installed extension published 1,820 SKUs and resolved Alert; screen1,820/951/869 verified. Legacy freshness claim/heartbeat removed; root export/snapshot unit10 + PG5 pass | Final integrated boot/build and verify full-refresh composition keeps inventory and profit independent |
| Mall Orders / Coupang directship                       | Directship extension uploads raw capture before page conversion; owner COMPLETE retains the original, selected transport consumption is separate. Root disposable PG suite: 5/5 PASS | Integrated review and actual owner/UI QA; all Excel conversions server-side with transient downloads, Art09 preservation; Kakao original retention with explicit conversion-unsupported status |
| Sellpia shipment tracking                             | Named Orders owner, extension direct raw upload and web COMPLETE-artifact read implemented; root HTTP/PG5 and extension focused33 pass; Icecream conversion stays server-side | Final integrated review/build and actual provider/page-close QA; verify current-day filters and downstream shipment behavior end to end |
| Sellpia seller/channel sales summary                  | Required COMPLETE-only owner reader; duplicate writer removed; root public-HTTP/policy PG13 + summary unit9 pass | Final module initialization, read/UI/Readiness and actual provider QA |
| Coupang reviews                                       | Root PG4 verifies COMPLETE-only stats/items and org isolation; poll/cancel token correction passes root UI/transport5 | Page-reload/live provider acceptance and final integrated boot/build |
| Sellpia manual match                                   | Owner lifecycle integrated; root HTTP/PG7, web32 and extension owner5 pass; unchanged collector characterization and common Browser I/O68 pass; full web build passes | Actual extension-to-owner-to-matching-screen acceptance and final integrated server boot |
| Sourcing1688 / TikTok / Live Commerce                  | Shared owner/wire primitives and characterization checkpoints pass             | Close actual entrypoint-to-existing-read acceptance and live-site QA for each collector                                                |
| Server-only Excel conversion                          | Server conversion/export paths implemented; root service/controller tests: 10 files / 27 PASS; web download boundaries: 5 files / 12 PASS; browser production writer search has no matches | Actual download QA; verify exact workbook output, authenticated API wiring and no permanent output storage end to end |
| Sourcing Wing catalog                                  | Source-owner work exists                                                       | Close actual extension/public-read acceptance and live-site QA                                                                         |
| Sourcing product/Taobao / keyword suggestions          | Direct/shared owner work exists                                                | Close remaining helper/caller and existing consumer proof without deleting collection capability                                       |
| Sourcing server providers (Naver/Shorts/Google)        | Shared ingestion/direct-owner checkpoints pass                                 | Verify each retained capability through its existing recommendation/evidence read and final integrated gate                            |
| Shadow                                                 | Direct HTTP/Agent owner and COMPLETE history checkpoints pass                  | Actual provider/admission QA and final integrated gate; preserve daily paid-IO limit                                                   |

**Daily KPI integration checkpoint (2026-09-06):** The source controller and
repository are registered in AdvertisingModule, its validated read port is
exported, and the focused shared contract is exported through `advertising`.
The root shared build passed, including declarations. The subsequent server
build reports no Advertising errors. The latest root rerun remains failed on
only three retired browser-collection exports; the Workflow/Marketplace mock
import errors are gone. Analytics' `wing_dashboard` summary is a distinct
source and must not be replaced with account-daily advertising data. Consumer
migration and end-to-end acceptance remain open.

**Integrated guard checkpoint (2026-09-07):** Shared build passes. Script
tests pass (Vitest189; Node219, skipped3). The snapshot boundary guard now
allows only the six explicit Advertising source repositories; negative tests
still reject consumer/lookalike-owner Prisma reads and direct SQL. Owner PG
tests, not this path guard, establish COMPLETE visibility. Full conventions now
passes after removing obsolete Sourcing Operation-handler requirements and
reviewing the organization/account-scoped Rocket advisory lock. Retired runtime
removal and actual provider acceptance remain separate, unfinished gates.

Root's follow-up verification passes the daily owner HTTP/PostgreSQL suite5
against a disposable database and the combined daily/campaign/keyword transport
suite20. The daily transport fixture now parses the actual shared flat control
schema, eliminating the independently mocked nested-response mismatch. Missing
observed provider identity fails atomically; the extension still needs actual
provider evidence, not the plan's expected identity. Advertising's account KPI
read adapter, Analytics daily-ads branches and Readiness now consume the owner
read port. Root verified all20 tests in the five Analytics/Readiness files and
all268 combined extension tests. These are synthetic/interface checks, not
live-provider acceptance. Removal of the redundant current KPI projection and
Readiness's unused generic controls remain open.

**Advertising integration evidence (2026-09-06):** Root reran campaign owner20,
standalone keyword owner30, published consumers7 and campaign grain7 together:
64/64 passed against disposable PostgreSQL. The campaign HTTP harness uses one
ephemeral loopback listener; assertions were not relaxed after intermittent
per-request connection failures. Web owner/modal tests25 and affected server
unit tests71 passed. Published consumers select coverage before rows and period
filters; campaign metrics and roster share a RepeatableRead snapshot, including
a regression that commits a new publication between the two reads. Tenant-scope
scanner passed; IDOR scanner still flags the unchanged Rocket PO repository.
Root extension integration tests262 also passed across campaign/keyword owners,
actual DOM collector fixtures, collection-window and worker boot. Ambiguous
receipt acknowledgements compare the canonical body checksum before advancing;
different-body receipts leave RUNNING/OWNER_UNAVAILABLE. Existing 31-day and
12+12+7 automatic handoff behavior remains covered. The extension no longer
uploads keywords through legacy syncToServer. This is not path completion:
actual provider QA remains open, as do the known retired-export build blockers
outside Advertising. The old keyword handler, DI and DTO allowance are removed;
legacy keyword requests reject before listing reads or writes. Its normalization
and merge coverage now exercises the pure normalizer; HTTP/PG rejection and the
owner/published-reader suites passed after removal.

**Advertising published snapshot Module — required integrated slice:** Deepen
the existing `ad-keyword-complete-read.ts` into the Advertising-local published
keyword snapshot Module; do not add a parallel selector or generic snapshot
framework. Its small Interface hides COMPLETE selection, full-account versus
auxiliary-group precedence, actual capture/cutoff ordering and deterministic
ties, confirmed-empty scope, and contribution aggregation. This concentrates
locality and gives both consumers leverage without exposing selection policy.

Migrate `AdCampaignRepositoryAdapter.findKeywordTargetRollups` and the keyword
branch of `AdActionRepositoryAdapter.findLatestTargetRows` together with the
campaign auxiliary producer. Delete their keyword-specific newest-row queries
(the deletion test), retaining unrelated grains and historical action references.
Use these actual consumer Interfaces in PostgreSQL tests: partial data stays
hidden; failure retains previous COMPLETE; full empty does not fall back;
auxiliary empty clears only its group; same-name sibling groups survive;
delayed older completion cannot regress a newer capture. A helper-only test
does not satisfy this gate.

**Common Browser I/O Module — required final shape:** `collection-window.js`
owns tab ownership, navigation, login wait and message transport only. Concrete
source Adapters own resume/complete/cancel policy and call source owners; the
common Interface neither terminalizes sessions nor interprets source receipts.
Move every retained caller, then remove `keepSessionRunning`, source-specific
completion bypasses and shared succeed/fail/restart behavior. Do not add a
Runner or change collector URLs, targets, pagination, pacing or retries. Test
the real dispatch/Adapter/owner seam, including lost ACK, cancel and restart;
retain Browser I/O tests for actual browser behavior rather than deleted
execution-result orchestration.

**Files:**

- Modify: `apps/server/src/agent-os/agent-os-invocation.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-runtime-http.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-worker.module.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts`
- Delete: `apps/server/src/agent-os/adapter/out/automation/operation-run-operation-alert.bridge.ts`
- Modify: `apps/server/src/ai/ai.module.ts`
- Modify: `apps/server/src/ai/ai-product-generation-runtime.module.ts`
- Delete: `apps/server/src/ai/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Delete: `apps/server/src/channels/adapter/in/operation/coupang-rocket-purchase-order.operation-handler.ts`
- Delete: `apps/server/src/channels/adapter/in/operation/__tests__/coupang-rocket-purchase-order.operation-handler.spec.ts`
- Delete: `apps/server/src/channels/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/inventory/inventory-freshness-runtime.module.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/coupang-shipment-summary.operation-handler.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/sellpia-inventory.operation-handler.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/__tests__/coupang-shipment-summary.operation-handler.spec.ts`
- Delete: `apps/server/src/inventory/adapter/in/operation/__tests__/sellpia-inventory.operation-handler.spec.ts`
- Delete: `apps/server/src/inventory/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/orders/orders.module.ts`
- Delete: `apps/server/src/orders/adapter/in/operation/marketplace-order-collection.operation-handler.ts`
- Delete: `apps/server/src/orders/adapter/in/operation/__tests__/marketplace-order-collection.operation-handler.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Delete: `apps/server/src/products/products-operation-worker.module.ts`
- Delete: `apps/server/src/products/adapter/in/operation/listing-generation.operation-handler.ts`
- Modify: `apps/server/src/products/adapter/in/agent/products-listing-generation-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Delete: `apps/server/src/sourcing/sourcing-operation-worker.module.ts`
- Delete: `apps/server/src/sourcing/sourcing-shadow-operation.module.ts`
- Delete: `apps/server/src/sourcing/adapter/in/operation/`
- Delete: `apps/server/src/sourcing/adapter/out/operations/`
- Modify: `apps/server/src/sourcing/adapter/in/agent/sourcing-final-capability.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/trend-collection.controller.ts`
- Modify: `apps/server/src/advertising/advertising.module.ts`
- Delete: `apps/server/src/advertising/adapter/in/operation/`
- Delete: `apps/server/src/advertising/adapter/out/automation/operation-alert.adapter.ts`
- Modify: `apps/server/src/analytics/traffic/traffic.module.ts`
- Delete: `apps/server/src/analytics/traffic/adapter/out/automation/operation-alert.adapter.ts`

**Interfaces:**

- Consumes: owner services/capabilities that already persist their own result: `CapabilityInvocation`, `AiDirectJob`, source import attempt, purchase-order transmission, listing mutation receipt, and sourcing owner records.
- Produces: the same surviving HTTP/Agent OS business result without OperationRun creation or OperationAlert emission.

**Approved sequencing deviation:** The retained 1688, live-commerce, TikTok,
and Wing Sourcing collectors cannot be moved by renaming their current
Operation routes. Their existing `SourcingEvidenceIngestionRun` lifecycle must
first be hard-reshaped to the three-state source-attempt contract, including
fixed expiry, frozen plan, terminal checksum/current COMPLETE pointer, and
owner-transaction Alert handling. Implement and verify that scoped schema/data
cutover with Astra/high after the Advertising slice and before deleting the
generic backend runtime. Do not add a temporary route, compatibility layer, or
generic source-attempt model.

This is a lifecycle transplant, not a collector rewrite. Preserve each
extension collector's existing URL, target selection and count, region,
pagination, login/block detection, extractor/content script, response mapping,
deduplication, timeout, retry, and failure semantics. A server-frozen plan must
contain the same inputs the collector previously selected at start; it must not
introduce new defaults or limits. Characterization tests prove the old target
plan and normalized output are unchanged for the same inputs before the owner
attempt replaces `OperationRun`, claim, and heartbeat. Keep live-site behavior
marked unverified until browser QA exercises it.

**Sourcing checkpoint (2026-09-05):** Applied the approved Ponytail shrink:
1688, TikTok, and Live share one extension transport/correlation helper,
one Sourcing-local HTTP token/public-response helper, and owner primitives.
Collector plans, extraction, normalization, and terminal interpretation remain
source-specific; no new worker or generic lifecycle was introduced. Removed
the obsolete browser Live Operation controller/service/catalog registration
after its registration regression tests failed, then passed. Taobao remains
in scope and has not been removed.

Focused verification: 45 server tests and 59 extension tests pass, including
wire retries, collector characterization, route wiring, and worker boot. The
cutover scanner still reports 865 legacy references, zero unowned producers,
and zero source-to-ABC references. This is not full acceptance: shared Sourcing
read/write convergence, Wing/server-producer migration, schema/data cutover,
NestJS boot, web build, and actual browser QA remain open. The full server build
fails with 71 type errors, including retained Sourcing callers of removed
interfaces and ABC/Advertising type mismatches. Resolve these as integration
work before boot/merge acceptance. No operating DB was accessed for this
checkpoint; live-site behavior remains unverified.

**Integration checkpoint (2026-09-06):** Source-owner work remains incomplete;
the earlier checkpoint is historical evidence, not the current error count.
Sourcing's URL ingestion and shared Trend callers now use direct owners;
the Sourcing unit gate passes 113 files / 654 tests. Inventory shipment summary
now uses a frozen attempt, immutable date observations, one atomic terminal
and Alert transaction, and separate capture/calendar reads. Existing untagged
dates remain unverified. Its HTTP/PostgreSQL gate passes 7 tests; integrated
extension, web, and Inventory module/service gates pass 82, 23, and 13 tests.
The actual provider site is still unverified.

Ponytail checks removed unmounted Advertising UI, the orphan page-owned
Sellpia snapshot bridge, unused Orders Operation wrappers, and the uncalled
application-wide cancellation endpoint. Direct AI cancellation stays intact;
its six focused suites pass, and integrated application-root tests pass 8.
These deletions do not count as completion of the remaining live collectors.
Local commits include `7ecc172`, `3fb713a77`, and `9c597fb54`; nothing was deployed.

The current scanner reports 741 legacy references, zero unowned producers, and
zero source-to-ABC references. Server build still fails on 3 retired Automation
session exports; the latest web build fails on 9 retained browser-session
imports. Do not restore compatibility exports to hide these gaps. Conventions
still stops at schema/ERD drift while the schema cutover remains in flight.

Resolve the documented live-collector conflicts before changing their policy:
catalog chunks currently mutate canonical data before finalization; Advertising
keyword completion can report partial coverage; physical Sellpia stock's old
`full` action includes a different profit window; Shadow admission retains a
daily paid-IO limit. Preserve collector inputs and output meaning until the
necessary decision is explicit. Orders artifact-only and canonical ingestion
branches also remain separate responsibilities, not a new generic runtime.
Operating preflight/clone approval, remaining owner migrations, final schema
cutover, successful boot/build, pre-QA inline integrated review and browser QA are
still open. No operating database or clone was accessed for this checkpoint.

**Rocket PO checkpoint (2026-09-06):** Channels now owns the frozen one-shot
Rocket attempt and atomic terminal/snapshot/Alert transaction. The extension
keeps its existing URL, full pagination, normalized rows, detail concurrency,
login retry and timeout; only the execution envelope changes. Confirmation,
Orders and Dashboard read owner state independently of row count and preview
an exact COMPLETE source. A later failed attempt retains the previous COMPLETE;
empty COMPLETE replaces current rows. Preview failure cannot fail the source.
Removed only the uncalled `listRocketPos` action, not the live full PO collector.

Stable Ponytail review removed snapshot-reuse and multi-snapshot branches that
cannot occur after one-shot fencing, the identity passthrough, and unused
preview injection. Owner PostgreSQL25 and existing workbook PostgreSQL10 pass;
server units64, shared26, web62 and integrated extension74 pass. Main reran the
affected web31 after shrinking its API and aligning the test mock boundary.
The 4,000-product fixture is 2,332,981 bytes: measured terminal2,219ms and exact
reload118ms after replacing a pathological nested join with two bounded identity
reads. These timings are disposable-PG observations, not an operating SLA.

The compact scanner remains red at740 legacy references, with zero unowned
producers and source-to-ABC calls. Fresh server/web builds retain the same3/9
generic-session errors. The full extension suite has5 failures in unchanged
Orders lifecycle/Sellpia legacy-contract tests; focused Rocket tests do not
substitute for that open gate. Old Rocket facts/workbook references still need
the coordinated Task6 preflight and cutover; no compatibility read, synthetic
COMPLETE backfill, operating access, provider QA or independent deployment was
performed. Task3 and the overall plan remain incomplete.

**Rank owner checkpoint (2026-09-06):** Immutable SERP/Wing capture and
per-keyword COMPLETE publication are implemented, including the three serving
read models' source provenance. Readiness now applies the same-org COMPLETE
Wing source/parser fence to its existing date/coverage/count queries while
retaining the selected active-account scope and freshness policy. Source
admission/read HTTP+PostgreSQL38, Readiness HTTP+PostgreSQL4 and existing
Readiness16 tests passed against disposable databases.

Frozen batch admission adds no parent runtime/table: the first actual keyword
attempt stores immutable ordered member IDs (and Wing selection metadata).
Same-key replay preserves members after failures/configuration drift; individual
keyword publication remains independent. Original enabled SERP selection and
Wing pending-today-or-all policy remain unchanged. All members are admitted in
one source-locked transaction with queue-aware fixed expiries (SERP10min plus
index×(10min+8s), Wing25min plus index×(25min+2.5s)); no heartbeat, renewal or
invented target cap. Empty selection is a nonpersisted no-op, not COMPLETE.

The extension's Wing direct transport and batch dispatch reuse its original
collector, pacing and normalized output. Actual full-worker tests passed44
cases, with shared progress-schema/cancellation regression8 passing after the
producer was restored to the existing `advertising.wing_rank` contract.
Dispatch ACK is not completion; the current unconfirmed terminal is never
contradicted by a failure submission, and unstarted interrupted members are
failed through their owners. The rank screen and Readiness entrypoint now
admit/dispatch the frozen batch and read owner results; the rank URL retains
only its receipt key for reload, cancellation and attention-tab recovery.
Dispatch/cancel ACKs do not become terminal state. Web focused gates passed
50 rank/API tests and12 selected Wing Readiness tests. One duplicated source-
text assertion was removed after Ponytail review; the actual hook8 passed
again. The complete legacy Readiness suite still has10 failures, and the fresh
web build still fails on8 retired generic-session exports in other consumers.
No whole-web success is claimed. Commits55d00de,71f0df9,2d00219 and6e6321cf5
record these bounded server, extension and web slices.
SERP seller enrichment, old rank runtime deletion,
actual unpacked/provider browser QA, aggregate boot/build and Task6 cutover
remain open. These focused results do not complete Task3 or the plan.

**Remaining source boundaries (approval is source-specific):**

- **Catalog:** On 2026-09-06 the user approved
  private staging followed by one measured full-publication transaction, not
  generation-aware catalog/media reads. Remove chunk publication and prove
  rollback/visibility through owner HTTP and public catalog reads on disposable
  PostgreSQL. Complete the same owner's token/expiry/replay and terminal/Alert
  fencing without changing collector inputs or outputs. Measure statement count
  and elapsed time; operating-clone access remains separately approval-gated.
- **Advertising keyword (approved 2026-09-06):** retain the existing 300-ad/
  10-minute invocation budget. Budget exhaustion leaves the same unexpired
  attempt RUNNING for explicit manual continuation, not automatic continuation
  or a partial COMPLETE. Freeze the first collection's account/date/target list
  and use receipt-backed coverage of that full list before publication. Failed
  or truncated enumeration cannot certify COMPLETE. Preserve provider filters,
  limits, normalization and collector retries; no new worker/child workflow.
  Fixed expiry is24h with no renewal. Freeze the campaign/group roster first and
  each group's ad roster on first visit, preserving lazy IO order. Use typed
  generation facts with adGroupId contributions before public targetKey merging.
  The existing campaign auxiliary keyword capture remains a required follow-up:
  move it into its campaign attempt, preserve best-effort failure, and converge
  both serving readers before deleting the old keyword ingest exit. The current
  standalone owner/extension/web slice is only an integration checkpoint.
  Root verification: owner/campaign-grain/sync HTTP+PostgreSQL59, extension185,
  actual worker-script3, web9, normalizer/domain34 and shared4 tests PASS.
  Per-ad checkpoints no longer reload owner control or send the full queue;
  incomplete group enumeration fails rather than certifying empty. User cancel
  records FAILED without creating or reactivating a source Alert. Full boot/web
  build and provider QA are not passed; the consumer convergence above remains
  required before this path is usable and accepted.
- **Physical Sellpia:** reconnect the actual stock collector, not the already
  migrated profitability action. Its legacy `full` scope includes a different
  profit window; settle that scope and immutable stock-artifact storage before
  replacing the live lease/import paths. Do not reinstate Operation dispatch.
- **Shadow (approved 2026-09-06):** preserve one organization/KST-day admission,
  including failed or expired attempts. A new key on the same day returns a
  daily-limit conflict; it never invokes paid IO. The original key always
  returns its original receipt across date/configuration drift. Use the existing
  Sourcing attempt and one successful observation payload, with a 15-minute
  fixed expiry. COMPLETE-only history replaces mutable WorkspaceSnapshot claims;
  provider inputs, concurrent baseline reads, and evaluation arithmetic stay
  unchanged. HTTP and Agent call the same owner directly; no new UI or Worker.
- **Orders:** ordinary malls generate files kept in IndexedDB; only Coupang
  directship also ingests canonical Orders. Keep converted downloads transient;
  do not persist output bytes for replay or turn other mall exports into Order writes.
  Move Art09's existing browser conversion to the server with equivalent output;
  all Excel conversion is server-owned and the extension only captures originals.
  Kakao calls a converter absent from both this
  checkout and its local `origin/release/office` controller/service; a new field
  mapping cannot be invented as a transplant. Live-host behavior is unverified.
- **Rank:** preserve successful per-keyword publication and Wing's existing
  pending-today selection. The three daily rank tables are mutable serving data;
  distinguish immutable capture from that projection, or make typed rows
  generation-scoped before changing reads. Include the direct Readiness reader
  and seller-identity enrichment: accepted seller catalog publication and the
  still-unfenced identity path both mutate SERP JSON after rank collection.
  Do not freeze enrichment targets before the new SERPs that currently select
  them, delete enrichment, or add aggregate batch/child workflow state.

These findings name remaining implementation and product decisions; they are
not a new collection policy, extra worker, permission to access operating data,
or proof that a retained source is complete. Existing collector inputs and
outputs remain the characterization authority until a conflict is resolved.

**Seller-identity implementation decision (2026-09-06):** Use one Advertising
snapshot attempt for the existing post-SERP days30/limit200 target selection,
not a durable attempt per product. The collector still visits/deduplicates the
same targets, retries extraction as before, and returns the same successful
identity rows. Its existing null result cannot prove normal absence: a missing
seller anchor and a failed/blocked page are indistinguishable. Do not add a new
extractor or fabricate empty evidence. The owner publishes only when all
eligible frozen target identities are present; otherwise it records FAILED /
`IDENTITY_EVIDENCE_INCOMPLETE`, retaining previous COMPLETE data. This is the
approved new source-publication policy, not a collector-policy rewrite.
Server-selected zero targets may complete as an explicitly empty source;
invalid target URLs are excluded with counts rather than visited.

The fixed expiry is5 minutes plus1 minute per unique eligible product, covering
the existing45-second navigation, up to two1.2-second render waits and at most
1.5-second inter-product delay with headroom. No heartbeat or collector timeout
change is introduced. Reuse SourceImportRun and ChannelScrapeSnapshot for
immutable capture and the existing enrichment/keyword transaction locks for
serving updates plus terminal/Alert atomicity. Existing optional enrichment
remains independent of already-published per-keyword SERP results. Conservative
failure for a legitimately absent seller identity remains an explicit limitation
until actual provider evidence can establish a reliable absence predicate.

The retained optional post-SERP sequence stays initial seller catalogs → seller
identities → newly identified seller catalogs. Each phase is a direct source
owner call, not a persisted parent/child workflow. Catalog `target: rank_enrichment` may
reference `excludeCompletedAttemptId`: the owner excludes only the exact same-
organization COMPLETE rank-enrichment catalog receipt's frozen seller IDs from the original
days30/top20 selection, then freezes the remainder. Failed or uncertain earlier
publication stops later enrichment without rolling back completed keyword SERPs.
Keys identify these direct calls and do not become a second status authority.
Preserve the two existing bounds: standalone all/seller_id catalogs retain100
products, while the original SERP enrichment retains500. The shared envelope may
accept500, but the owner validates the concrete frozen input's original bound.
No new collector limit, selector, partial-success proof or retry policy is added.

**SERP transport integration checkpoint (2026-09-06):** The direct SERP batch
now uses the same small rank-local transport as Wing, without a new batch table,
worker or parent workflow. Existing keyword capture and4–8s pacing precede the
three direct enrichment owner calls above. A failed/unconfirmed enrichment or
explicit cancellation stops subsequent phases; cancellation arriving during
admission settles the exact newly admitted owner before provider IO. Original
collector functions remain unchanged (9 retained functions have matching hashes
against the preceding catalog-integration commit).

Removed the old single/batch SERP execution shell, its alarm, local terminal
status and unfenced rank/identity/catalog posting helpers. The server rejects
their old extension-sync types while keeping other live sync types and the
owner-only normalizers. Catalog capture preserves standalone100 versus rank500,
including their original nullable-field mapping. Terminal retries keep the exact
payload; missing ACK or a newer attempt in the response triggers an exact-owner
read, never a fabricated COMPLETE or contradictory automatic failure. A focused
regression also corrected the inherited same-URL navigation-completion wait and
the catalog owner's tab-ID registration, without changing navigation targets,
timeouts or extraction.

Evidence: integrated extension8 suites/121 tests, server ingress/owner focused62,
catalog HTTP/PostgreSQL5, shared14 and shared build passed. Extension syntax,
adapter-copy and diff checks passed. The broader server build still fails on
3 retired Automation session exports; scanner remains709 legacy references,
zero unowned producers and zero source-to-ABC references. No full web/boot,
provider/browser QA, operating DB access or whole-integrated review is claimed.
The remaining source-boundary decisions above still block generic runtime and
schema cutover completion; these results do not complete Task3 or the plan.

**Wing catalog publication checkpoint (2026-09-06):** Detail uploads now stay
private; the final transaction validates the exact staged receipt set and
publishes listings/options/media, absence, mapping generation and the receipt
atomically. Same-attempt replay is unchanged; new A → B → A captures publish
again. Lost final ACK is reconciled against the exact owner receipt. The screen
shows hydration progress and invalidates canonical reads once after completion.

The existing AI media adapter now batches writes in500-row groups in that same
transaction, preserving provider asset identity and manual thumbnail selections.
Disposable PostgreSQL integration24 passed, including visibility, rollback,
receipt races and manual-selection concurrency. The1000-product/3000-option/
1000-media fixture measured50 statements/1255ms for new publication and41/
3792ms for refresh, versus13032 statements before bulk persistence; only query
count is asserted. Server unit/controller11, web focused15 and extension408
passed. Nest build still has3 retired Automation export errors and web build7
retired generic-session export errors. No full boot or real-provider QA is
claimed. Owner token/fixed-expiry/terminal-Alert convergence remains the next
catalog slice; this storage checkpoint does not complete Task3 or the plan.

**Wing catalog owner checkpoint (2026-09-06):** The same `SourceImportRun`
now owns begin, the fixed 24-hour permit and terminal receipt. Its linked
collection row is only private chunk storage. The final transaction fences
the active account and frozen publication revision (including file imports),
then commits the canonical catalog and source Alert together. Same-key replay
recovers the permit; active conflicts identify the current attempt. Expired
reads are side-effect-free, and the next admission retires the expired owner.
Cancellation is FAILED / USER_CANCELLED without a new actionable Alert.

The Catalog web consumer now polls the owner and local browser progress only;
it neither creates Alert state nor relies on generic execution controls. Lost
begin/dispatch ACK reuses the saved key, and cancellation settles the owner
before best-effort local cleanup. Canonical cache invalidation occurs once
after COMPLETE. The logged-in Wing vendor remains unverified by the existing
extractor; frozen server identity is not evidence of browser account identity.

The extension now transports the permit directly, persists an immutable pending
terminal body and uses the existing small wire helper. Removed the old Catalog
execution shell. Local leftovers without valid permits cannot block admission;
a different previous attempt is replaced only after its exact owner is terminal.
Fixed expiry stops automatic retry, preserving uncertain receipts for explicit
owner reconciliation. Original URLs, 20-product chunks, five extraction tries,
500ms delays and normalized output are covered by characterization tests.

Final root combined disposable PostgreSQL 35 passed. The same large fixture
measured 55 SQL / 1238ms for new publication and 46 SQL / 3810ms for refresh.
Root web 37, shared 10, server unit/controller 11, extension 433 plus actual
worker 2, shared build, scoped lint/syntax and adapter-copy checks passed.
Fresh whole builds still fail on server 3 / web 7 retired generic-session
exports. The cutover scanner retains 707 legacy references, zero unowned
producers and zero source-to-ABC references. This bounded Catalog integration
does not certify real-provider QA, operating data, Task3 or the overall cutover.

- [ ] **Step 1: Add failing no-Operation assertions to existing owner acceptance tests**

```ts
expect(await prisma.operationRun.count()).toBe(0);
expect(await prisma.alert.count({ where: { kind: "operation" } })).toBe(0);
```

Add those observations to the existing PostgreSQL tests for Agent capability invocation, channel registration/deletion, Sellpia inventory, shipment summary, order collection, sourcing Wing/live-commerce/1688 publication, and AI direct generation. Tests must call the public owner HTTP/capability seam, not an Operation handler.

- [ ] **Step 2: Run the affected acceptance tests and verify red**

```bash
npm run test:integration --workspace=apps/server -- src/agent-os/__tests__/capability-invocation-races.pg.integration.spec.ts src/channels/__tests__/product-sync.pg.integration.spec.ts src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts src/sourcing/__tests__/sourcing-wing-browser-publication.pg.integration.spec.ts src/sourcing/__tests__/sourcing-live-commerce-domain-publication.pg.integration.spec.ts src/sourcing/__tests__/sourcing-1688-keyword-domain-fence.pg.integration.spec.ts
```

Expected: FAIL at current Operation starts, handlers, or missing direct owner entrypoints. The listed paths are the existing owner-level PostgreSQL suites on this branch.

- [ ] **Step 3: Route each surviving action directly and delete its wrapper**

Agent OS invokes only deterministic registered capabilities. AI uses `AiDirectJob`. Channels and Supply use their existing owner receipts/transmissions. Inventory, Orders, Advertising, and Sourcing browser collectors begin/read/complete their domain owner attempts. Delete unused operation-only actions by changing their producer disposition to `DELETE` and removing their UI entrypoint in the same slice.

- [ ] **Step 4: Run module and acceptance tests after each domain slice**

```bash
npm exec --workspace=apps/server vitest -- run src/__tests__/application-roots.architecture.spec.ts src/agent-worker-application.module.spec.ts src/advertising/__tests__/advertising.module.wiring.spec.ts src/channels/__tests__/channels.module.wiring.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts src/orders/__tests__/orders.module.wiring.spec.ts src/products/__tests__/products.architecture.spec.ts
npm run check:operation-automation-cutover
```

Expected: the scanner's surviving references shrink after every commit; no public owner behavior regresses.

- [ ] **Step 5: Commit bounded domain groups**

```bash
git add apps/server/src/agent-os apps/server/src/ai apps/server/src/channels apps/server/src/inventory apps/server/src/orders apps/server/src/products apps/server/src/sourcing apps/server/src/advertising apps/server/src/analytics/traffic extensions/kiditem-os/background/source-owner-manifest.js
git commit -m "refactor: move domain work off operations"
```

**Shadow owner checkpoint (2026-09-06):** HTTP and Agent now invoke the same
Sourcing owner directly. One fixed-expiry attempt admits the paired capture;
failure/expiry consumes its KST day. Same-key replay does not repeat provider
IO. COMPLETE payloads live in immutable evidence observations; the source-local
repository only reads them, with latest attempt and COMPLETE selected in one
RepeatableRead snapshot. Deleted the mutable WorkspaceSnapshot claim/finalize
path, its obsolete mock tests, the Shadow Operation graph, and the unreferenced
Sourcing Worker/catalog. Providers/evaluation behavior remains unchanged.

Root scoped correctness/Ponytail acceptance found no remaining new P0/P1.
Root PostgreSQL3 suites/30 PASS (Shadow, common owner, source-status), focused
server7 suites/49 PASS, scanner21 PASS, scoped lint and diff checks PASS.
Whole server build still reports3 retired Automation exports. Script gates
retain one existing Rocket-PO synthetic stock-write finding, and the Sourcing
scanner retains4 stale Operation-rule findings. No successful boot, actual
provider/extension QA, operating DB/clone access, or whole-plan completion is
claimed. The root whole-integrated review remains before actual browser QA;
post-QA checking is limited to changed code and verification evidence.

### Task 4: Replace Panel With Alert Polling And Remove Automation UI

**Files:**

- Create: `apps/web/src/components/alerts/AlertsPopover.tsx`
- Create: `apps/web/src/components/alerts/AlertsPopover.spec.tsx`
- Create: `apps/web/src/lib/alerts-api.ts`
- Create: `apps/web/src/lib/__tests__/alerts-api.spec.ts`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/components/layout/RightAuxiliaryPanel.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/layout/sidebar-menu.ts`
- Modify: `apps/web/src/components/layout/__tests__/AppLayout.auth.spec.tsx`
- Modify: `apps/web/src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx`
- Modify: `apps/web/src/components/layout/__tests__/Sidebar.right-surface.spec.tsx`
- Delete: `apps/web/src/components/panel/`
- Delete: `apps/web/src/app/(automation)/action-board/`
- Delete: `apps/web/src/app/(automation)/workflows/`
- Delete: `apps/web/src/app/(automation)/marketplace/`
- Delete: `apps/web/src/app/(automation)/_shared/marketplace/`
- Delete: `apps/web/src/lib/operation-alert-actions.ts`
- Delete: `apps/web/src/lib/operation-alert-lifecycle.ts`
- Delete: `apps/web/src/lib/operation-alerts.ts`
- Delete: `apps/web/src/lib/operations-api.ts`
- Delete: `apps/web/src/lib/operation-cancellation.ts`
- Delete: `apps/web/src/lib/manual-operation-actions.ts`
- Delete: `apps/web/src/hooks/useOperationRun.ts`

**Interfaces:**

- Consumes: `GET /api/alerts` and `POST /api/alerts/:id/dismiss`.
- Produces: one alert popover that polls every 10 seconds, refetches on focus, and invalidates after dismiss.

**Residual checkpoint (2026-09-06):** Existing Alert polling and retired
ActionBoard/Workflow/Marketplace route removal remain intact. Commit `7d7a32f64`
removes unused Workflow/cache declarations, nine uncalled Operation hooks and
their exclusive API methods. It also removes only thumbnail-batch Operation
Alert writes, preserving 15-row chunks, two-second delay, local progress,
partial/all failure, callbacks and request cancellation. Main's combined gate
passes81 tests; the product-pipeline sweep passes393/fails2 at the unchanged
catalog generic-ID dependency. No real-browser route or whole-web build success
is claimed. The subsequent Agent-card retirement removes its Operation lookup,
card, hook and query keys while preserving receipt summary/resources/approvals;
historical JSON is ignored, not rewritten. Main's integrated Alert/Agent/route
gate passes215 tests. The scanner is still red at711 references (web27), with
zero unowned producers and source-to-ABC calls. Live Sellpia/browser-source
migration remains required before deleting the remaining helper modules.

- [ ] **Step 1: Write failing Alert polling tests**

```tsx
it("polls durable alerts, refetches on focus, and dismisses through the Alert API", async () => {
  render(<AlertsPopover />);
  await advanceTimersByTimeAsync(10_000);
  expect(fetchAlerts).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("focus"));
  expect(fetchAlerts).toHaveBeenCalledTimes(3);
  await user.click(screen.getByRole("button", { name: "알림 닫기" }));
  expect(dismissAlert).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused web tests and verify red**

Run: `npm exec --workspace=apps/web vitest -- run src/components/alerts/AlertsPopover.spec.tsx src/lib/__tests__/alerts-api.spec.ts src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx src/components/layout/__tests__/Sidebar.right-surface.spec.tsx`

Expected: FAIL because current UI reads Panel SSE/Operation projections and exposes Automation routes.

- [ ] **Step 3: Implement polling and delete the active Automation surfaces**

Use one TanStack Query with `refetchInterval: 10_000`, `refetchOnWindowFocus: true`, and no background interval. Dismiss invalidates the Alerts key. Remove ActionBoard/Workflow/Marketplace navigation and routes, Panel stores/SSE/recovery, run overlays, promote-to-task commands, and operation hooks.

- [ ] **Step 4: Run web tests and build**

```bash
npm exec --workspace=apps/web vitest -- run src/components/alerts/AlertsPopover.spec.tsx src/lib/__tests__/alerts-api.spec.ts src/components/layout/__tests__/AppLayout.auth.spec.tsx src/components/layout/__tests__/RightAuxiliaryPanel.spec.tsx src/components/layout/__tests__/Sidebar.right-surface.spec.tsx
npm run build --workspace=apps/web
```

Expected: PASS and deleted routes return Next.js 404 in the browser.

- [ ] **Step 5: Commit the web cutover**

```bash
git add apps/web/src/components/alerts apps/web/src/lib/alerts-api.ts apps/web/src/lib/__tests__/alerts-api.spec.ts apps/web/src/components/layout apps/web/src/components/panel 'apps/web/src/app/(automation)' apps/web/src/lib/operation-alert-actions.ts apps/web/src/lib/operation-alert-lifecycle.ts apps/web/src/lib/operation-alerts.ts apps/web/src/lib/operations-api.ts apps/web/src/lib/operation-cancellation.ts apps/web/src/lib/manual-operation-actions.ts apps/web/src/hooks/useOperationRun.ts
git commit -m "refactor: replace panel with durable alerts"
```

### Task 5: Delete Backend Operations And Automation

**Current closure checkpoint (2026-09-06):** ActionBoard and generic
Workflow/Marketplace application runtime and their unused shared contracts have
been removed. Database tables/rows remain untouched. Agent verification reports
Automation wiring/architecture21 and retired web route41 passing; root reviewed
the module closure and confirmed no production web Panel consumer remains.
Panel/SSE controller, replay/event bus, mappers and obsolete Alert emissions are
the next deletion closure. Generic browser Operation issuance remains only
until its surviving source entrypoints have been transplanted; it is not an
accepted compatibility layer or completed final state.

**Files:**

- Delete: `apps/server/src/operations/`
- Delete: `apps/server/src/operation-cancellation/`
- Delete: `apps/server/src/automation/`
- Create: `apps/server/src/alerts/AGENTS.md`
- Create: `apps/server/src/alerts/CLAUDE.md`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Delete: `apps/server/src/common/operation-definition.ts`
- Delete: `packages/shared/src/schemas/operations.ts`
- Delete: `packages/shared/src/schemas/operations.spec.ts`
- Delete: `packages/shared/src/operations.ts`
- Delete: `packages/shared/src/operation-lifecycle.ts`
- Delete: `packages/shared/src/schemas/operation-cancellation.ts`
- Delete: `packages/shared/src/schemas/operation-cancellation.spec.ts`
- Delete: `packages/shared/src/operation-cancellation.ts`
- Delete: `packages/shared/src/schemas/workflow.ts`
- Delete: `packages/shared/src/workflow.ts`
- Delete: `packages/shared/src/schemas/marketplace.ts`
- Delete: `packages/shared/src/marketplace.ts`
- Delete: `packages/shared/src/panel/`
- Modify: `packages/shared/package.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: all preceding direct owner/capability and Alerts implementations.
- Produces: application roots and shared exports with zero generic runtime reference.

- [ ] **Step 1: Tighten the cutover scanner to the final zero-reference set**

```js
const forbidden = [
  "OperationRun",
  "OperationSchedule",
  "OPERATION_RUNNER_PORT",
  "/api/operations",
  "/api/panel",
  "/api/workflows",
  "/api/marketplace",
  "OperationAlert",
  "restartCollectionSession",
  "finalizeCollectionSession",
];
```

The scanner searches production server/web/extension/shared sources and root composition files while excluding tests, generated Prisma output, and superseded design history.

- [ ] **Step 2: Run the scanner and verify red**

Run: `npm run check:operation-automation-cutover`

Expected: FAIL with only the generic runtime directories and their root exports/composition.

- [ ] **Step 3: Delete runtime directories and wire Alerts directly**

Remove `AutomationModule`, `OperationsHttpModule`, and `OperationCancellationModule` from `ApiApplicationModule`; import `AlertsModule`. Remove Operations from API/worker roots and environment scripts, including `OPERATION_RUNTIME_WORKER_ENABLED` in `dev:core`. Remove unused shared exports and dependencies.

- [ ] **Step 4: Run scanners, unit suites, and NestJS boot**

```bash
npm run check:operation-automation-cutover
npm run check:conventions
npm run build --workspace=packages/shared
npm exec --workspace=apps/server vitest -- run src/__tests__/application-roots.architecture.spec.ts src/agent-worker-application.module.spec.ts
npm run dev:server
```

Expected: scanner and builds pass; NestJS reaches successful boot with no missing provider/module dependency.

- [ ] **Step 5: Commit backend deletion**

```bash
git add apps/server/src packages/shared/src packages/shared/package.json package.json
git commit -m "refactor: delete operation automation runtime"
```

### Task 6: Apply The v0.1.31 Data And Schema Cutover Contract

**Files:**

- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/system.prisma`
- Modify: `prisma/models/agents.prisma`
- Create: `scripts/data-migrations/v0.1.31/003_prepare_operation_automation_cutover.ts`
- Create: `scripts/__tests__/operation-automation-cutover-migration.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/operation-automation-cutover.md`
- Modify: `AGENTS.md`
- Modify: `apps/server/AGENTS.md`
- Modify: `apps/server/src/agent-os/AGENTS.md`
- Modify: `apps/server/src/ai/AGENTS.md`
- Modify: `apps/server/src/advertising/AGENTS.md`
- Modify: `apps/server/src/analytics/AGENTS.md`
- Modify: `apps/server/src/channels/AGENTS.md`
- Modify: `apps/server/src/finance/AGENTS.md`
- Modify: `apps/server/src/inventory/AGENTS.md`
- Modify: `apps/server/src/orders/AGENTS.md`
- Modify: `apps/server/src/products/AGENTS.md`
- Modify: `apps/server/src/rules/AGENTS.md`
- Modify: `apps/server/src/sourcing/AGENTS.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `apps/web/src/app/(advertising)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `apps/web/src/app/(analytics)/AGENTS.md`
- Modify: `apps/web/src/app/(analytics)/dashboard/AGENTS.md`
- Modify: `apps/web/src/app/(automation)/AGENTS.md`
- Modify: `apps/web/src/app/(automation)/agents/AGENTS.md`
- Modify: `extensions/AGENTS.md`
- Modify: `extensions/kiditem-os/AGENTS.md`
- Modify: `extensions/kiditem-os/background/coupang/AGENTS.md`
- Modify: `prisma/AGENTS.md`
- Modify: `scripts/AGENTS.md`

**Interfaces:**

- Consumes: a backed-up, writer-stopped Office database whose preflight has zero active runs and enabled schedules.
- Produces: schema without Operation/Workflow/Marketplace and with dormant ActionTask, focused Alerts, direct Rules identity, source generations, and reset ABC state.

- [ ] **Step 1: Write failing migration/schema tests**

```ts
it("resets unreliable operation alerts and detaches dormant ActionTask rows", async () => {
  await prepareOperationAutomationCutover(prisma);
  expect(await prisma.alert.count()).toBe(0);
  expect(await prisma.actionTask.count()).toBe(seedActionTaskCount);
});

it("contains no generic runtime model or foreign key after schema cutover", () => {
  for (const token of [
    "model OperationRun",
    "model OperationSchedule",
    "model WorkflowRun",
    "model WorkflowTemplate",
    "model Marketplace",
    "operationRunId",
  ]) {
    expect(fullPrismaSchema).not.toContain(token);
  }
});
```

- [ ] **Step 2: Run migration/schema tests and verify red**

Run: `npm run test:scripts`

Expected: FAIL because generic models and the pre-schema preparation migration still exist.

- [ ] **Step 3: Implement pre-schema cleanup and remove models**

The pre-schema migration records counts, deletes existing Alerts and Rules applications, and removes only foreign-key-dependent generic rows. It leaves `ActionTask` rows intact. Prisma then drops OperationRun/Checkpoint/Schedule, WorkflowRun/Template, and Automation Marketplace plus Organization/User relations. Rules has `requestId`; Alert has the focused fields from the source plan.

- [ ] **Step 4: Validate on a disposable clone**

```bash
npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
npm run db:push -- --accept-data-loss
npx prisma generate
npm run build --workspace=packages/shared
npm run test:scripts
npm run db:erd
```

Expected: pre-schema migration, destructive Prisma apply, and post-schema formula initialization all succeed; legacy ABC/Alert/runtime rows are absent and ActionTask count is unchanged.

- [ ] **Step 5: Update ownership documentation and run conventions**

Run: `npm run check:agents-hygiene && npm run check:conventions && npm run check:operation-automation-cutover`

Expected: PASS with no stale instruction that assigns ownership to Operations or Automation.

- [ ] **Step 6: Commit the schema cutover**

```bash
git add prisma/models scripts/data-migrations/v0.1.31/003_prepare_operation_automation_cutover.ts scripts/data-migrations/index.ts scripts/__tests__/operation-automation-cutover-migration.spec.ts scripts/__tests__/run-data-migrations.spec.ts docs/ARCHITECTURE.md docs/runbooks/operation-automation-cutover.md AGENTS.md apps/server/AGENTS.md apps/server/src/agent-os/AGENTS.md apps/server/src/ai/AGENTS.md apps/server/src/advertising/AGENTS.md apps/server/src/analytics/AGENTS.md apps/server/src/channels/AGENTS.md apps/server/src/finance/AGENTS.md apps/server/src/inventory/AGENTS.md apps/server/src/orders/AGENTS.md apps/server/src/products/AGENTS.md apps/server/src/rules/AGENTS.md apps/server/src/sourcing/AGENTS.md apps/web/AGENTS.md 'apps/web/src/app/(advertising)/AGENTS.md' 'apps/web/src/app/(catalog)/AGENTS.md' 'apps/web/src/app/(catalog)/product-hub/AGENTS.md' 'apps/web/src/app/(analytics)/AGENTS.md' 'apps/web/src/app/(analytics)/dashboard/AGENTS.md' 'apps/web/src/app/(automation)/AGENTS.md' 'apps/web/src/app/(automation)/agents/AGENTS.md' extensions/AGENTS.md extensions/kiditem-os/AGENTS.md extensions/kiditem-os/background/coupang/AGENTS.md prisma/AGENTS.md scripts/AGENTS.md
git commit -m "refactor: cut over operation automation schema"
```

### Task 7: Prove Runtime And Browser Behavior

**Files:**

- Modify: `docs/runbooks/product-profitability-refresh.md`
- Modify: PR 493 body through GitHub.
- Modify: Linear KID-33 checkpoint through Linear.

**Interfaces:**

- Consumes: exact topic-branch SHA, disposable operating-data clone, local API/web, and installed extension.
- Produces: measured request, DB, browser, and merge-readiness evidence.

- [ ] **Step 1: Run the complete local gate**

```bash
npm run check:pr-reconstruction -- --base origin/develop
npm run check:pr-release-contract -- --base origin/develop
npm run check:operation-automation-cutover
npm run check:conventions
npm run test:scripts
npm run build --workspace=packages/shared
npm run build --workspace=apps/web
npm run dev:server
```

- [x] **Step 2: Review the complete implementation against the ACTIVE spec before QA**

The main inline session reviews the entire integrated change, including
uncommitted work, against the approved requirements. Task-level reviews are
not substitutes. Trace every retained entrypoint through collection,
conversion, owner storage/publication, Alert and existing screen reads.
Check missing behavior, data/state consistency, failure/cancel/resume,
performance, duplicate responsibilities, temporary exceptions and legacy paths.
Apply `ponytail-review` without replacing correctness/spec/performance review.
Use architecture analysis only for confirmed structural problems. No separate
review agent. Fix findings and pass affected regressions before the next step.

Final inline review checkpoint (2026-09-07): reviewed the retained entrypoints,
shared browser-I/O boundary, owner terminal/publication/Alert paths, consumer
selection, explicit ABC and Finance period evidence, Rules, AI jobs and Gateway
receipt contracts across the integrated worktree. Corrections and evidence are
recorded in the current open-path summary above. Ponytail removed the generic
Advertising dispatcher, unused scrape-target runtime CRUD and unused capability
operation references without adding compatibility runtimes. No identified
blocking review finding remains. The final unchanged-code whole PostgreSQL run
is in progress; this review checkpoint does not claim that gate, live provider
execution, deployment or merge readiness. After provider QA, review only new
changes and evidence rather than repeating the unchanged whole review.

Integration guard checkpoint (2026-09-07): root's script suite passed with
189 Vitest tests and 220 Node tests (3 skipped). The cutover scanner now ignores
regex literals only in the sourcing regression guard, while its new test still
rejects an executable retired call in that same file and a neighboring script.
The actual 17 remaining runtime references are still failures, not waived.
Common Browser I/O result ownership (`keepSessionRunning` and shared terminal
commands), web generic callers, Directship and server-only tracking workbook
generation remain implementation work before whole integrated review and QA.

Schema gate follow-up: the scanner now includes Prisma files, with only the
approved dormant ActionTask schema excluded from retired-token detection.
Automation Marketplace is checked by its exact model name; commerce models
remain valid. Eleven focused scanner tests pass, including rejection of a
runtime ActionTask reference. This exposed 42 previously unscanned schema
references, alongside five remaining web/extension references at that check.
Task6 is not implemented merely because runtime code is removed: the pre-schema
cleanup migration and generic model/relationship deletion are still required.
Fresh remote inspection confirms main VERSION0.1.29 and develop/root0.1.31;
the planned0.1.31 migration therefore targets the open train.

Backend boot checkpoint (2026-09-07): main ran the actual `npm run dev:server`
against an ephemeral PostgreSQL 17 database created by the integration setup.
Schema push succeeded, watch compilation reported zero errors, and Nest logged
`Nest application successfully started` and its listening address. The probe
to `/api/health` returned 404 (no such route); this proves boot, not a health
endpoint or authenticated owner journey. AI background work was disabled and
storage pointed at an isolated unavailable endpoint. The owned server process
and disposable database were stopped afterward; the operating clone was not
modified. Web build, complete integrated review and real source QA remain open.

Web integration checkpoint: the next root `npm run build --workspace=apps/web`
compiled the bundle successfully (23.3 seconds), then failed type checking at
GenerationStartModal's retired `state.operationKey` reference. The web owner
is removing it using the surviving generation cancellation identities. The
standalone web tsconfig includes test files and produced additional test-type
noise; it is not a substitute for a successful Next production build. Shared
session consumers still need to converge on attemptId/progress/attention with
no terminal/restart protocol before the next aggregate gate.

Integration checkpoint (2026-09-07, follow-up): the keyword-SERP HTTP/PG suite
passes 13/13 against disposable PostgreSQL after removing its assertion against
the deleted OperationRun model. The owner publication, capture, history and
Alert assertions remain. The latest Next build compiled the bundle, but failed
on optional-property narrowing in the new competitor extension reply parser;
the production web gate remains open. All Excel conversion is server-only;
client workbook reads used for preview are not conversion implementations.

Subsequent aggregate checkpoint: `tsc --noEmit -p apps/server/tsconfig.build.json`
passes; `npm run build --workspace=apps/web` passes bundle, TypeScript and all
46 page generations after the reply-parser fixes. The broader server tsconfig
includes test diagnostics and is not green. These are intermediate build results:
Sellpia sales/tracking, review collection, Directship UI and mixed/manual capture
integration are still being completed, so final build/review/QA gates remain open.

ABC integration follow-up: root reran the repository PostgreSQL suite (17/17)
and formula/service/controller focused suites (32/32), all passing. The paired
Finance evidence PostgreSQL suite failed both tests because their target cutoff
was taken from Sellpia's new yesterday-inclusive collection plan instead of a
closed evaluation month. Keep the runtime's monthly cutoff validation; repair
the test setup to distinguish collection coverage from the selected ABC window
and rerun before accepting the consumer migration. The latest shared build and
full conventions chain pass; ERDs contain 137 models/371 relations at this point.

Root extension aggregate checkpoint: `node --test extensions/tests/*.test.mjs
extensions/tests/coupang-ads-scraper/*.test.mjs` ran 710 tests: 702 passed,
8 failed. One failure is the Readiness focus-policy gate; seven are Orders
action-coverage/session/lifecycle tests spanning the new named tracking owner
and removed local terminal protocol. Repair the real entrypoint assertions and
owner-observable behavior without restoring page-owned persistence or session
terminal state, then rerun. This is not real-provider browser acceptance.

Follow-up: the root rerun of the same full extension file set with the dot
reporter exits 0 after those fixes. Root also verified the tracking HTTP/PG
suite (5/5), Orders extension focused batch (33/33), Readiness Wing UI (8/8),
and Alert transaction suite (3/3). Alert fixtures now commit the prior source
failure before admitting another RUNNING attempt; the database uniqueness
constraint is unchanged. Implementation of other owner paths remains active,
so this intermediate aggregate pass does not close the final QA gate.

- [ ] **Step 3: Exercise source failure and recovery in a real browser**

Begin an Advertising or Sellpia attempt, close the initiating page, let the extension finish direct upload, then verify the owner screen reads the COMPLETE generation. Cause one controlled provider failure, verify the prior COMPLETE data remains visible with a stale/failure label and one unread Alert, retry with a new attempt, and verify the Alert becomes RESOLVED.

- [ ] **Step 4: Exercise explicit ABC publication in a real browser**

Open Product Hub with sources READY, record the current publication revision, click `등급 새로고침`, observe one POST, verify `PUBLISHED`, reload, and verify the revision/grades/cutoff remain. Repeat with a stale source and verify `SOURCE_NOT_READY`, no Evaluation/cache/history change, and the last grade remains. Trigger a concurrent input change and verify `409 INPUT_CHANGED` plus refetch without automatic retry.

- [ ] **Step 5: Measure the full baseline in an authorized validation environment**

Run `EXPLAIN (ANALYZE, BUFFERS)` for evidence/contribution/publication selection and invoke the full synchronous baseline through the real proxy/browser path. Record product/fact counts, query shape, buffer use, total request duration, and timeout ceiling without storing business rows in Git or Linear.

The operating clone at localhost:5433 remains read-only. Baseline publication,
cutover or any other mutation there requires separate approval; read-only
authorization does not cover a writing API or mutating EXPLAIN ANALYZE.

- [ ] **Step 6: Verify only QA changes and final evidence**

Review code changed since Step2 and the QA/performance results. Fix new
findings, rerun affected tests and QA, and distinguish implementation from
verified completion. Do not repeat the unchanged whole-code review.

- [ ] **Step 7: Update PR and Linear after reading them live**

Record exact commit SHA, commands, browser evidence, DB reset/baseline decision, Office cutover command, and rollback limitation. Read PR 493 and KID-33 back. Mark `병합 준비` only when base is `develop`, checks are green, no blocking conversation remains, and the pre-QA integrated review plus post-QA delta verification are complete.
