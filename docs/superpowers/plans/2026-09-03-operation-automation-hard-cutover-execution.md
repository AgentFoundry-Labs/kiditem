# Operation And Automation Hard Cutover Execution Plan

**Status:** ACTIVE

## Current completion checkpoint — 2026-09-10 portable QA handoff

The user's latest instruction changes this session's terminal checkpoint, not
the agreed implementation scope. Finish all agreed code, resolve integration
and design issues, and obtain risk-proportionate focused tests, builds and
core real-integration QA evidence. The next computer must be able to restore
the environment and start the remaining QA without repairing unfinished code
or choosing unresolved designs. Broad regression and long-running real-use QA
may continue there and must be explicitly distinguished from core gates.

Do not claim the entire hard-cutover acceptance campaign completed at handoff.
This ACTIVE plan continues to track deferred acceptance. Merge and deployment
are excluded. Existing prohibitions on operating data writes and destructive
QA resets remain in force.

- [ ] Finish and integrate dashboard partial aggregation and selected option-2
  UI, valid historical ABC eligibility/publication, and independently confirmed
  source units, including their shared contracts and migrations.
- [ ] Main-review the new changes against approved invariants; fix and rerun
  focused regressions. Reuse prior evidence only for unchanged paths.
- [ ] Pass affected package builds, Nest boot, contract/legacy guards and
  risk-based PostgreSQL regressions; verify core real extension → owner →
  consumer/UI behavior. Record blocked/unrun checks honestly.
- [ ] Preserve code, required local/untracked assets, QA data and restore
  instructions in a portable handoff with checksums and a restore verification.
  Keep secrets/private captures outside tracked documentation and public output.
- [ ] Provide a self-contained latest-decisions/evidence/remaining-QA/start-here
  record, including exact artifacts, environment versions and blockers. Verify
  that no implementation or design work is disguised as deferred QA.

Current blocking dependency for rendered/extension QA: Chrome browser control
listed tabs but page attachment failed; supported reconnection did not restore
control and the user was asked to reinstall/reconnect the Browser plugin.
Code integration and non-browser verification continue independently. This
dependency must be rechecked before determining whether core QA is sufficient
for handoff; it is not a passed or waived browser test.

### Verified integration/preservation checkpoint — September 10, 12:35 KST

September 10 ~13:20 recovery update: an implementation agent's temporary copy
retained the main worktree's Git pointer and unexpectedly created a local
commit. The commit was bundled and verified, then the original HEAD and empty
index were restored without resetting working files. A complete hash comparison
against the restored intermediate checkpoint confirmed only the six intended
code integrations and two ACTIVE document updates changed. All agent Git
mutations and manual container cleanup are now prohibited; the responsible
agent is limited to a read-only handoff. This is not a code-completion claim.

The six integrated files comprise the shared query-failure metadata contract,
Wing daily read port/adapter metrics, and Sellpia service/regressions. Main-run
focused tests passed (29 Sellpia/Wing tests; 20 shared schema tests), and the
shared ESM/CJS/declaration build passed. Core dashboard, UI, inventory, ABC and
source-unit changes still require integration and fresh verification.

September 10 ~13:30 runtime/review update: the private portable minimal QA
environment successfully ran `npm run dev:server`, compiled with zero errors,
and started Nest on port 4000. That environment intentionally omits the local
Gateway installation token, so Gateway polling returned an explicit unavailable
error; destination reauthentication remains required. The existing local QA
launcher was restored afterward to preserve this host's integration settings.
Main review rejected partial-profit/full-revenue ratios, duplicated source
queries, hardcoded benchmark evidence and source-mixed unavailable cards in
unintegrated dashboard patches. Those are implementation fixes, not deferred QA.
Wing's replacement implementation lane works in a fresh file snapshot with no
Git pointer; the prior source lane remains stopped. Main reviewed the candidate
repository/schema/backfill and requested account-row locking, confirmed-date
readiness/cutoff, exact-period identity/generation selection and backfill proof
corrections before integration. The source-specific decisions are recorded in
the ACTIVE spec's confirmed-units section.

September 10 ~13:55 integration update: core dashboard daily-profit/trend and
KST selection changes are now integrated. Main added missing-cost, explicit-zero,
ad-only and nonoverlapping-date regressions and updated the obsolete ad-reader
boundary fixture: five focused files / 37 tests passed. The selected option-2
UI and per-metric evidence displays are also integrated; 15 dashboard route
files / 67 tests passed. Final review corrections remain for empty/unverified
warning values, selected-range modal fallback, empty-profit basis labels and
unsupported cross-source goal/comparison calculations. These test passes do
not certify those pending corrections or rendered Chrome behavior.

Actual authenticated Sellpia API checks returned HTTP 200 and passed the shared
response schema for July 1–31 (31/31 sales dates, profit unavailable without ad
intersection) and September 1–9 (9/9 sales dates, profit available). The temporary
QA login was logged out after verification. No source collection or operating
data write was performed. Core PostgreSQL trend regression and the current web
build are running; Ads confirmed-day implementation now has its approved narrow
canonical-table contract and is isolated without a Git pointer.

- Shared dashboard period/snapshot/comparison/profit-input schemas are
  integrated. Focused schema suite: 19/19 passed; shared ESM/CJS/declaration
  build passed. Included/missing dates partition the requested range, comparison
  offsets identify actual matched dates, and empty profit intersections remain
  unavailable rather than zero.
- The baseline before these amendments passed all 101 isolated PostgreSQL
  files / 835 tests with no skips. This is prior-scope evidence, not a pass for
  the new ABC/source-unit/dashboard implementation.
- The preserved screen-QA database was backed up and restored into a separate
  PostgreSQL 17 container with no network or published ports. All 137 public
  table row counts matched. The operating database on port 5433 was not changed.
- The private transfer directory contains a verified base-history Git bundle,
  the pre-integration QA dump, selected private QA configuration, and the
  original matching workbook / selected dashboard reference. The dirty-code
  archive and final migrated QA snapshot are still pending. Machine-bound
  Gateway/provider sessions are not portable credentials and require destination
  reauthentication; broad environment/provider secret files are not copied.
- An intermediate code checkpoint was restored from the bundle in a fresh
  directory: 4,324 paths, including 212 untracked files and 281 deletions,
  matched by file hashes, executable modes and full-index binary Git diff.
  This validates the transfer mechanism, not final implementation readiness.
- The first backup-verification container was mistakenly removed by an
  implementation agent's manual test cleanup. The preserved QA / operating
  databases and backup dump were unchanged. Main restored the dump again in
  a new network-isolated container and reverified all 137 public-table counts.
  Implementation agents may not manually stop/remove Docker resources;
  testcontainers may manage only its own generated test lifecycle.
- Backend, source-unit, historical ABC and UI patches are undergoing main
  review before integration. UI review found mismatched ratio/comparison
  evidence, a custom tooltip that dropped metric values, and an empty-data gate
  that hid Agent OS; these require implementation fixes and regressions, not
  deferral as next-computer QA. The handoff remains IN PROGRESS.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreliable Operation/Automation execution plane with source-owned imports, an explicit absolute-ABC publication command, durable Alerts, and direct domain capabilities on PR 493.

**Architecture:** Four subordinate plans land in dependency order. Each plan protects a public seam with a failing test before production changes, and the final plan deletes the old runtime only after every surviving caller has moved. The database cutover is admitted from `origin/release/office` through the existing explicit schema/data cutover path.

**Tech Stack:** NestJS, React/Next.js, TanStack Query, Prisma 7/PostgreSQL, Chrome extension Manifest V3, Vitest, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Global Constraints

- September 9 user-approved amendment: implement complete 500-products-per-page Wing
  listing basics followed by rate-limited full detail JSON traversal with
  successful complete-product enrichment, same-attempt resume and preservation of existing
  detail/media/confirmed recipes/operator fields. The active collection spec
  records the stage-publication contract and all three product-screen gates.
  This supersedes the former catalog basic/detail all-or-nothing coupling and
  whole-detail atomic publication. Attempt COMPLETE still requires full coverage.
  Implementation order: owner/wire/preservation contract; capture/byte-bounded
  detail representation; existing consumer/screen integration; main review,
  focused/full gates and actual staged QA. Do not repeat the old failed full
  HTML collection while this approved replacement is being implemented.

- The latest 2026-09-08 goal retains **the entire hard cutover** as the terminal
  objective. The collection-deepening spec is a subordinate acceptance scope,
  not permission to stop after that implementation. Required final evidence
  includes the integrated spec review, complexity/correctness/performance
  review, full isolated PostgreSQL suite, Nest boot, web build, legacy scans,
  designated-file automatic matching, explicit ABC/Alerts and real extension
  owner/publication/consumer QA. Report pass/fail/blocked/not-run separately;
  mandatory unverified work prevents overall completion. Preserve the existing
  QA setup and data; record remaining work here without reinstating a separate
  strict collection execution plan.
- Approved 2026-09-08 collection scope update: improve the architecture of
  **all extension data collection**, not only the Wing keyword-search pilot.
  Inventory every collection entrypoint and compare the prior architecture
  review with current browser execution, source request/parsing, pagination,
  normalization, and owner submission responsibilities before applying the
  agreed direction collector by collector. Investigation alone is not done.
  The detailed current inventory and acceptance criteria are in
  `docs/superpowers/specs/2026-09-08-extension-collection-deepening-design.md`.
  The latest user instruction removes a separate strict execution-plan
  requirement for this collection work; the spec alone defines acceptance.
- Preserve valid `CollectionSession`, `collect` seams, and server source-owner
  authority. Deepen cohesive source modules behind small interfaces; move
  misplaced source policy out of `CollectionWindow`. Do not introduce a
  universal collector runner or split files without concentrating complexity.
- Integrate remaining observed campaign/product internal-API conversions,
  account-daily v2 and Wing full-catalog acceptance, Rocket PO completeness,
  and popup owner-derived status. Retain verified keyword/profitability APIs,
  Wing detail embedded JSON, and Rocket list JSON plus detail HTML requests.
  Keep account/product grain and date windows distinct; empty auto-selection
  data is unavailable, not zero. Rocket SKU counts, status quantity sums,
  required fields and duplicates gate completion, with bounded retry or
  explicit failure rather than partial publication.
- Preserve verified Wing September 1–6 traffic (534 rows, GMV 363200, 58
  orders, 173 units, partial-period and missing-date display) and itemwinner
  (747 records and screen classification). Revalidate these completed paths
  only when changed directly or affected by shared changes; otherwise reuse
  their evidence without recollecting.
- Complete each collector with implementation, meaningful interface regression
  tests, and actual extension → owner → screen acceptance. Scope includes only
  extension collection and directly connected owner contracts/screens. Main
  Codex is the sole browser operator. Preserve existing data and failure
  isolation; distinguish accepted, implementation-only, and held results.
  No commit, push, merge, or deployment without separate user approval.

- Work on `fix/product-abc-refresh-timeout`; PR 493 targets `develop` and is not rebased or force-pushed.
- `release/office` is the Office deployment source. Version `0.1.31` owns every new destructive reset and baseline migration.
- Tests use only the seven confirmed public seams: source owners, Alerts, `ProfitabilityEvidence`, pure absolute evaluation, explicit ABC publication, Products read/UI, and legacy scanners.
- `POST /api/products/abc/recalculate` returns `200 PUBLISHED`, `200 SOURCE_NOT_READY`, or `409 INPUT_CHANGED`.
- Source completion never invokes or mutates ABC. The Product Hub ABC data-status surface is the only production caller of explicit recalculation.
- No V2 path, compatibility DTO, Operation fallback, worker, scheduler, child workflow, outbox, dirty bit, requested/recalculated revision, population hash, calibration, reliability adjustment, or Orders eligibility remains.
- Existing ABC state and grade cache are reset. The first full publication is a history-free baseline; later real grade transitions alone create history.
- Operating data is inspected read-only before destructive work. No Office mutation occurs from this macOS checkout.
- Approved 2026-09-07 execution update: implementation subagents use
  `gpt-5.6-luna` at `max`. The main inline session owns planning, code quality,
  integration review and verification, including boundary invariants.
- After implementation and basic builds/focused tests, the main session
  compares the ACTIVE spec and the entire integrated change, including
  uncommitted files, before actual extension/browser QA. Apply
  `ponytail-review` as a complexity pass alongside correctness and performance
  review. Use `improve-codebase-architecture` only for a demonstrated structural
  issue requiring further analysis, not a broad redesign. No separate reviewer
  subagent is dispatched. Fix findings and rerun affected regressions before QA.
- After QA, review only newly changed code and final evidence. Do not repeat an
  unchanged whole-change review or treat partial task review as integration review.
- Preserve the screen-QA database; reset-based PG tests use separate ephemeral
  databases. Reuse verified results only when their code scope remains current.
  Confirmed in-scope QA defects are fixed without another approval. Operating
  data writes, deployment and real commerce mutations remain approval-gated.

---

## Subordinate Plans And Order

1. `docs/superpowers/plans/2026-09-03-source-owner-and-alert-cutover.md`
   - Establish the source-attempt and Alert contracts.
   - Move Sellpia profitability and mapping evidence to immutable generations.
   - Contract the extension collection session to noncanonical progress.
2. `docs/superpowers/plans/2026-09-03-advertising-source-owner-cutover.md`
   - Replace the Advertising Operation run with one organization-level, multi-account import attempt.
   - Preserve slice idempotency, provider identity proof, and exact COMPLETE publication.
3. `docs/superpowers/plans/2026-09-03-explicit-absolute-abc-publication.md`
   - Install the immutable V1 formula, compatible evidence selection, explicit publication CAS, contribution projection, and Product Hub UI.
4. `docs/superpowers/plans/2026-09-03-operation-automation-legacy-removal.md`
   - Move or delete every remaining Operation consumer.
   - Remove Workflow/Marketplace/Panel/ActionBoard active paths and then remove the database runtime.
   - Execute clone and browser acceptance gates and prepare PR 493 for `develop`.

No later plan may start its destructive deletion task until all preceding focused tests pass. Plans may overlap only for read-only discovery; shared composition files and Prisma models are integrated by the main agent.

### Task 1: Lock The Executable Inventory

**Files:**

- Create: `scripts/check-operation-automation-cutover.mjs`
- Create: `scripts/__tests__/operation-automation-cutover.test.mjs`
- Create: `extensions/kiditem-os/background/source-owner-manifest.js`
- Modify: `package.json`
- Modify: `scripts/README.md`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**

- Consumes: the checked-in source tree and `SOURCE_OWNER_BY_PRODUCER` from the extension manifest.
- Produces: `npm run check:operation-automation-cutover`, which fails on a missing producer disposition, a source-to-ABC call, an active ActionTask access, or any deleted runtime symbol/route.

- [x] **Step 1: Write the failing scanner tests**

```js
it("reports a production producer missing from the ownership table", async () => {
  const result = await scanOperationAutomationCutover(
    fixtureRoot("unowned-producer"),
  );
  assert.deepEqual(result.unownedProducers, ["orders.unknown"]);
});

it("reports a source owner that calls product ABC", async () => {
  const result = await scanOperationAutomationCutover(
    fixtureRoot("source-calls-abc"),
  );
  assert.deepEqual(result.sourceToAbcReferences, [
    "apps/server/src/inventory/import.service.ts:1",
  ]);
});

it("accepts a direct owner fixture with no legacy runtime", async () => {
  const result = await scanOperationAutomationCutover(
    fixtureRoot("direct-owner"),
  );
  assert.deepEqual(result, {
    unownedProducers: [],
    sourceToAbcReferences: [],
    legacyReferences: [],
  });
});
```

- [x] **Step 2: Run the scanner test and capture the expected failure inventory**

Run: `node --test scripts/__tests__/operation-automation-cutover.test.mjs`

Expected: FAIL because the scanner module does not exist.

- [x] **Step 3: Add the explicit producer ownership table and scanner command**

```js
export const SOURCE_OWNER_BY_PRODUCER = Object.freeze({
  "advertising.ad_keyword": "advertising",
  "advertising.ad_sync": "advertising",
  "advertising.competitor_catalog": "advertising",
  "advertising.scrape_targets": "advertising",
  "advertising.wing_rank": "advertising",
  "advertising.wing_tracked_products": "advertising",
  "channels.coupang_catalog": "channels",
  "dashboard.coupang_ads": "analytics",
  "dashboard.coupang_products": "analytics",
  "dashboard.wing_kpi": "analytics",
  "dashboard.wing_sales": "analytics",
  "inventory.sellpia": "inventory",
  "orders.coupang_rocket_po": "channels",
  "orders.coupang_shipment_summary": "inventory",
  "orders.mall": "orders",
  "orders.sellpia_manual_match": "channels",
  "sourcing.1688_trend": "sourcing",
  "sourcing.live_commerce": "sourcing",
  "sourcing.tiktok_cc_trend": "sourcing",
  "sourcing.wing_catalog": "sourcing",
});
```

The scanner compares this record with the literal producer declarations in
`extensions/kiditem-os/background/coupang/collection-runs.js` and the three
domain `worker.js` files, rejects values outside a fixed owner/`DELETE`
allowlist, and scans production files while excluding tests and historical
`docs/superpowers/` files.

- [x] **Step 4: Register and run the scanner**

Run: `node --test scripts/__tests__/operation-automation-cutover.test.mjs`

Expected: PASS for owned, unowned, source-to-ABC, and legacy fixture cases.

Then: `npm run check:operation-automation-cutover`

Expected: FAIL only on the still-live legacy paths that the subordinate plans remove; the producer inventory itself is complete.

- [x] **Step 5: Commit the executable inventory**

```bash
git add package.json scripts/check-operation-automation-cutover.mjs scripts/__tests__/operation-automation-cutover.test.mjs extensions/kiditem-os/background/source-owner-manifest.js docs/ARCHITECTURE.md
git commit -m "test: lock operation cutover inventory"
```

### Task 2: Run The Plans With TDD Checkpoints

**Files:**

- Modify: the four subordinate plan files listed above, checking steps only after their evidence exists.

**Interfaces:**

- Consumes: each subordinate plan's focused commands and commits.
- Produces: a linear commit series in which every behavioral change has recorded red and green evidence.

- [ ] **Step 1: Execute source owner and Alert tasks**

Run every focused command in `2026-09-03-source-owner-and-alert-cutover.md`; do not begin Advertising until its PG terminal-publication tests pass.

- [ ] **Step 2: Execute the Advertising tasks after the source-owner dependencies are green**

The assigned Luna/max implementation agent may modify only files named in
`2026-09-03-advertising-source-owner-cutover.md`, plus an explicit
main-agent-approved named-interface exception when the extension-to-server
contract requires one. The main agent runs and fixes integration tests after
focused green evidence is reported.

- [ ] **Step 3: Execute explicit ABC publication tasks inline**

Run each formula, Finance, PostgreSQL publication, HTTP, web, and contribution red→green cycle from `2026-09-03-explicit-absolute-abc-publication.md`.

- [ ] **Step 4: Execute legacy removal only after replacement seams are green**

Run each scanner between deletion groups. A deleted route must be asserted absent; a surviving business action must have a direct owner/capability acceptance test before its Operation handler is removed.

- [ ] **Step 5: Commit each independently reviewable slice**

Use the commit messages specified in the subordinate plans. Do not combine schema cutover, source implementation, and UI cleanup into one commit.

### Task 3: Final Integration And Handoff

**Files:**

- Modify: PR 493 body through GitHub after local evidence is complete.
- Modify: Linear issue KID-33 through Linear after the PR checkpoint changes.

**Interfaces:**

- Consumes: focused green tests, the legacy scanner, an operating-data preflight report, pre-QA integrated review, browser QA, and post-QA delta verification.
- Produces: a reviewable PR 493 targeting `develop`, with exact cutover and rollback constraints recorded.

- [ ] **Step 1: Run repository gates**

```bash
npm run check:pr-reconstruction -- --base origin/develop
npm run check:pr-release-contract -- --base origin/develop
npm run check:conventions
npm run test:scripts
npm run build --workspace=packages/shared
npm run build --workspace=apps/web
```

- [ ] **Step 2: Run schema and NestJS gates on a disposable local database**

```bash
npm run db:push -- --accept-data-loss
npx prisma generate
npm run build --workspace=packages/shared
npm run dev:server
```

Expected: Prisma applies the hard cutover on the disposable database and NestJS reaches a successful boot without Operations or Automation modules.

- [ ] **Step 3: Review the whole integrated change before actual QA**

The main inline session traces every retained entrypoint through collection,
conversion, owner staging/publication, Alert and existing consumer/UI reads.
Compare the ACTIVE spec and latest approved changes with the entire working
tree, not HEAD alone. Review missing functionality, failure/cancel/resume,
identity/freshness, duplicate ownership, temporary exceptions and legacy paths.
Apply the Ponytail complexity pass without replacing correctness/performance
review. Fix confirmed issues and pass affected regressions before Step 4.

- [ ] **Step 4: Run the actual browser flow and post-QA delta verification**

Reuse the existing stack and prepare only missing QA data. Verify collection
and publication, product identities, inventory matching and explicit component
quantities before dependent ABC/advertising/order/inventory consumers. Then
verify failure/cancel/retry/recovery, organization isolation, performance and
end-to-end reads. Preserve last-good data and do not infer missing facts as
zero. Capture explicit ABC request duration against browser/proxy/API budgets,
Alerts, extension DB-write costs and empty/live execution-state rendering.
Separate archived-fixture tests from actual provider/extension evidence.
After QA changes, review the delta and rerun impacted tests plus final full PG
integration tests on their own ephemeral DB. Incomplete gates remain open.

- [ ] **Step 5: Prepare PR 493 for merge**

Read the existing PR template and live PR, verify base/head/commit count/diff
scope/checks/conversations, update the PR body with DB reset and baseline
decisions, push the topic branch, and update KID-33 to the `병합 준비`
checkpoint only after reading both systems back. The checked-in PR template is
not changed by this cutover.

## QA Checkpoint — 2026-09-07 20:22 KST

- Target: `/Users/yhc125/workspace/kiditem-pr493-hard-cutover`, branch
  `fix/product-abc-refresh-timeout`, HEAD `70be28de6` plus existing uncommitted
  changes. Initial inventory: 584 modified, 275 deleted, 158 untracked paths;
  `/tmp/kiditem-qa-worktree-status-0907-2005.txt`. Source changes are preserved.
- API remains on port 4000 (Nest watch rebuilt to PID 61604). The hung web
  PID 98136 was terminated after SIGTERM failed; Next was restarted with
  `NEXT_PUBLIC_API_URL=http://localhost:4000` and persistent file logging.
  Authenticated inventory UI now renders on the same port 3000 and QA tab.
- Previous screen-QA container `c7c835f5de33` disappeared after the 20:05 check;
  API reports DB-unreachable beginning 20:07:05. Cause is unconfirmed. Do not
  describe this as ordinary session expiry or a password failure.
- User explicitly authorized reconstruction and unnecessary-container cleanup.
  New screen-QA container `62f314cdf828`, name
  `kiditem-qa-0907-rebuild-postgres`, uses loopback port 56879 and named volume
  `kiditem-qa-0907-rebuild-pgdata`, without Testcontainers cleanup labels.
  Current schema push passed after PostgreSQL initialization completed.
- Recreated `cutover-qa@example.test` and isolated organization through the
  local bootstrap command. Login API passes; synthetic Wing/Rocket accounts
  have no actual seller credentials. Archived-file import preparation is in
  progress. Logs: `/tmp/kiditem-qa-rebuild-0907.FfFw2I/` (login secret excluded
  from reports and Git). This data is fixture evidence, not current stock.
- Removed only exited-zero `kiditem-minio-init` (`ca3ad3d29004`, no mounts).
  Operating PostgreSQL 5433, MinIO, unrelated project containers and all original
  reference files remain untouched. No volume pruning or broad cleanup ran.
- Full PG result remains FAILED: 98/101 files, 782/789 tests, seven 30-second
  beforeEach timeouts; `/tmp/kiditem-all-pg-awake-final-0907.log`.
  Focused rerun PASSED 3/3 files and 48/48 tests in 155.49 seconds on its own
  ephemeral port 56909. Slow-query log contains 52 TRUNCATE statements above
  500 ms, maximum 6906 ms, no recorded lock waits. Original full-run timeout
  cause remains unresolved; focused passing does not close that gate.
- Inventory source parser: archived XLS has 1,964 unique valid codes, distinct
  from the lost browser snapshot's 1,821. Wing parser: 2,241 options / 1,225
  products; three missing-option-ID rows excluded (56, 2213, 2248).
- Gateway 503 reproduced at 20:04:30, before DB loss. Actual Gateway/provider
  QA, matching/component quantities, dependent commerce flows, final integrated
  review evidence and final full PG are not yet passed.

### Recovered UI / actual inventory — 20:38 KST

- Reconciled the completed whole inline review with the legacy-removal plan's
  Step 2 checkpoint. Do not repeat that unchanged review; new auth changes and
  QA evidence remain subject to inline delta review. The full PG gate is open.
- Auth outage fix returns generic 503 without clearing a valid session cookie
  or falling through as 401. Main independent focused run passes 7/7 tests;
  source review confirms existing invalid-session handling remains intact.
  Ponytail delta: Lean already. Ship. A real Nest HTTP probe with the production
  exception filter independently passes 8/8 focused tests, including HTTP 503,
  generic envelope, no cookie deletion and no handler invocation. Log:
  `/tmp/kiditem-auth-outage-http-0907.log`.
- Reloaded the existing `kfionjdklijcjedgfmcfbjadlfmobdcg` extension from this
  worktree, then clicked inventory's `셀피아 재고 동기화` in the existing QA tab.
  Attempt `3cf2dc97-fd6a-46d6-8215-223ea16d98b9` completed 20:37:28 KST:
  1,822 current active SKUs, request-to-terminal 11.620 seconds. This is actual
  extension evidence; earlier archived imports are fixtures, not actual QA.
- Owner state points to this completed import, active lease is cleared, and
  the UI shows `최신 / 방금 전` with the same completion time. Total 2,010
  includes 188 preserved inactive prior SKUs; active 1,822 and in-stock 951
  reconcile with the DB. Quality report records missing barcode 351,
  duplicate barcode 217 and snapshot churn 234; no mappings were fabricated.
- Next: matching-screen upload of the specified Wing workbook, existing
  automatic matching and quantities, profitability/advertising source data,
  explicit ABC and alerts, remaining independent entrypoints, then final gates.

### Independent gates / Gateway recovery — 21:00 KST

- Inventory row, owner state and completed import all have PostgreSQL `xmin`
  1998, corroborating one atomic publication transaction for the actual capture.
- API restarted through `npm run dev:server` with the existing protected
  installation-token path instead of a deleted ephemeral token file. PID 64377
  booted successfully at 20:49:09; authenticated `/auth/me`, conversations and
  preferences return 200. QA DB, sessions, provider login directory and inputs
  remain preserved. S3 stays intentionally isolated/unavailable in this QA env.
- Existing Gateway is running with the QA config and separate protected state
  root. Codex readiness verifies login and the pinned runtime. Explicit
  `gpt-5.6-luna / max` smoke conversation
  `83a4212a-eb05-47eb-9478-8001c2dffa33`, turn
  `e2188094-fd0e-448c-80ef-34394a7320dc`, returned the exact requested marker and
  `RUN_FINISHED` over authenticated SSE, without any tool call. Log:
  `/tmp/kiditem-qa-rebuild-0907.FfFw2I/gateway-smoke.log`. This proves API/provider
  transport, not browser interaction or business capability execution.
- Claude initially failed `ENOEXEC` because its installed package still had
  the postinstall placeholder. Ran that pinned package's official postinstall
  against its already-installed macOS binary only; no version/lockfile change.
  Auth status now exits normally with `loggedIn: false`; actual Claude QA needs
  user login, not a fabricated readiness success.
- Matching UI upload is BLOCKED by ChatGPT Chrome extension file-URL access:
  documented chooser `setFiles` returned `Not allowed`. Requested that the user
  enable `Allow access to file URLs` for the ChatGPT extension. The specified
  Wing workbook has not been attached/submitted in the matching UI. Native file
  picker cancellation is also not confirmed; other browser QA is paused while
  its modal/control connection remains stuck. No API import substitutes for it.
- Cutover scanner independently passes with 0 unowned producers, 0 implicit
  Source-to-ABC references and 0 legacy runtime references. `git diff --check`
  passes. Full PostgreSQL diagnostic rerun is RUNNING on separate test container
  `6a0262e81c46` / port 56911, never on QA 56879 or operating 5433. Logs:
  `/tmp/kiditem-all-pg-diagnostic-0907-2048.log` and
  `/tmp/kiditem-all-pg-diagnostic-postgres-0907-2048.log`. Earlier failed full
  result remains open until this run is terminal and its findings resolved.

### Auth regression / PostgreSQL reset diagnosis — 21:08 KST

- Main independently reran all Auth and global exception-filter tests: 10 files,
  66 tests PASS, including the real Nest HTTP outage-envelope probe. Evidence:
  `/tmp/kiditem-auth-full-regression-0907.log`. The new two-file auth delta was
  reviewed inline and with the lean-design review; no new lifecycle or wrapper
  was introduced. The successful Nest boot above includes this production fix.
- The ongoing full PG run has recorded whole-schema TRUNCATE durations of
  44,329 ms and 31,195 ms against unchanged 30-second hooks. One checkpoint
  synchronized 300,091 files and took 468 seconds; subsequent reset/seed lock
  waits show a timed-out hook continuing while the next hook starts. These
  observations identify test-infrastructure IO pressure, but do not by themselves
  prove that every failure has the same cause or that it is fixed.
- After this baseline finishes, test a shorter checkpoint cadence on a separate
  disposable test container. Keep fsync, full_page_writes and synchronous_commit
  enabled, all-table resets, all tests and existing timeouts intact. Do not alter
  the running baseline, screen-QA database or operating database for this probe.
  Retain a setup change only if measured results support it; otherwise discard
  the candidate and investigate further. No checkpoint configuration change has
  been implemented at that checkpoint.

### Full PG baseline terminal / checkpoint comparison — 21:40 KST

- Baseline is terminal with exit 1: 96/101 files and 782/789 tests PASS,
  7 tests FAIL, duration 2,981.07 seconds. Four failures are 30-second
  `beforeEach` timeouts (Wing itemwinner, AdStrategy, catalog owner, AiDirectJob).
  Two subsequent failures are duplicate fixture inserts in `beforeEach`
  (AdStrategy inventory import and catalog account), consistent with the
  observed overlapping hooks. The Shorts first-collection assertion returned
  FAILED instead of COMPLETE; its underlying returned error was omitted by the
  assertion diff, so its cause remains unproven.
- Baseline logs contain 792 resets slower than 500 ms, totaling 2,517,613 ms;
  four exceed 30 seconds and the maximum is 44,330 ms. This is a slow-query
  sample, not an all-query percentile measurement. A read-only sample counted
  981 public relations and 77,600 data-directory entries. PostgreSQL 17's
  [relation-file removal implementation](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/storage/smgr/md.c)
  defers main-file unlink until a checkpoint. Shorter cadence is a hypothesis to
  reduce repeated-TRUNCATE file accumulation, not a proven fix yet.
- Only after the baseline and its test container terminated, main applied the
  Luna/max two-line spike patch adding `checkpoint_timeout=30s` to the disposable
  test container startup. Reset scope, transaction settings, fsync,
  full_page_writes, synchronous_commit, tests and all timeouts are unchanged.
  Main inline and ponytail reviews found no additional responsibility or
  abstraction. Setup/DB-safety unit tests pass 18/18. A diagnostic-only assertion
  message now prints the Shorts first result without changing its expected value.
  The full comparison must pass before accepting the configuration change.
- During the baseline, QA product-list reads also logged 5-second transaction
  expiry under shared-host load. After it stopped, authenticated read-only probes
  with limits 1/50 returned 200 in 1,125/1,445 ms. Preserve this distinction:
  `/tmp/kiditem-qa-product-read-idle-0907.log` is idle API evidence, not browser
  QA or a load-resilience pass. QA still has 2,010 inventory rows and three
  completed imports; API PID 64377 and the protected QA database remain intact.
- Sourcing unit regression passes 110 files/629 tests. Full PG comparison is
  RUNNING on `ebd70fb41624` / 56913, separate from persistent QA and operating
  DBs. Live `SHOW` confirms checkpoint timeout 30s, completion target 0.9,
  fsync/full_page_writes/synchronous_commit all ON. Evidence:
  `/tmp/kiditem-all-pg-checkpoint-30s-0907-2141.log` and
  `/tmp/kiditem-all-pg-checkpoint-30s-postgres-0907-2141.log`.
- Browser recheck found the earlier native picker gone. The ChatGPT extension
  details page (`hehggadaopoacecdllhhajmbjkdcmajg`) explicitly shows file-URL
  access OFF; no permission was changed. A fresh native chooser displayed the
  exact authorized workbook, but AX click, screenshot-based double click and
  its exposed Open action did not select it. Cancel worked and the matching
  dialog again shows no file selected, with import disabled. No workbook was
  uploaded, no matching capture was started and no QA data was changed. The
  picker no longer blocks unrelated browser navigation; upload remains blocked.

### Host-memory isolation approved — 22:03 KST

- The checkpoint comparison is still running. It has reported two failures
  (market shadow expiry/publication and Wing rank admission/replay); final
  stacks are pending. Do not infer their causes or accept the candidate yet.
- Host sampling found heavy memory compression and active swapping while the
  disposable PG suite shared the 16-GB host with QA Next.js and Nest watch
  processes. Database isolation does not isolate host CPU, memory or disk IO.
- The user explicitly approved temporarily stopping only the QA API/web after
  this comparison terminates, running the full verification with that memory
  freed, and restoring both with their existing configuration. Preserve the
  QA database, Gateway, browsers, original files and operating containers.
  The existing scratch API launcher and web API-origin setting are retained
  for restoration; verify process identities before signaling them.
- This approval does not change the separate browser file-URL permission or
  Claude-login blockers. No API/web process has been stopped at this checkpoint.

### Checkpoint comparison terminal / memory-isolated rerun — 22:10 KST

- Comparison finished: 99/101 files and 787/789 tests PASS, two assertion
  failures, duration 1,566.34 seconds. Wing rank expected 409 for a wrong
  attempt token but received 401 at line 420. Market Shadow expected an OPEN
  expiry Alert but received an empty list at line 196. Neither failure was
  `expect.poll` or a hook timeout; causes remain under investigation.
- Its slow-query sample contains 774 resets, total 1,219,075 ms, maximum
  17,902 ms, none over 30 seconds and no logged lock waits. This improves the
  measured reset tail but does not make the whole suite pass or establish
  either assertion failure's cause.
- After terminal completion, stopped the verified QA web process group and
  API launcher/watch tree under the explicit approval. The orphaned API child
  required SIGKILL after SIGTERM did not exit; ports 3000/4000 are unbound.
  Persistent QA still contains 2,010 inventory rows and three completed
  imports. No QA database or original file was deleted or reset.
- Full same-code rerun is RUNNING on disposable `77e149bf5b0a` / 56915,
  with QA API/web off. Live checks confirm checkpoint timeout 30s and all
  three durability settings ON. Logs are
  `/tmp/kiditem-all-pg-memory-isolated-0907-2210.log` and
  `/tmp/kiditem-all-pg-memory-isolated-postgres-0907-2210.log`.
  Restore API using the retained scratch `start-api.cjs` and web using
  `NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev --workspace=apps/web`
  after verification, then verify boot, auth and preserved inventory reads.

### Browser upload prerequisite cleared — 22:14 KST

- The user enabled ChatGPT extension file-URL access. A fresh native Chrome
  read confirms extension `hehggadaopoacecdllhhajmbjkdcmajg`, file-URL toggle
  ON. The earlier permission blocker is cleared; upload itself is not yet
  verified. Chrome reconnected under browser handle 3 with the same existing
  matching tab 42038576; reuse it after QA API/web restoration.
- Memory-isolated full PG remains live with active SQL and no failure reported
  at this checkpoint. Do not restore development processes or run browser
  imports concurrently with this measurement. Do not mark pending matching,
  component quantities or dependent ABC checks as passed.

### Expiry fixture diagnosis during the unchanged rerun

- Market Shadow's failed test sets `leaseExpiresAt` to host `Date.now() - 1`,
  while the begin transaction uses PostgreSQL `clock_timestamp()` and the
  read projection uses host time. A connected-client read-only probe measured
  the DB about 3 ms behind the host. With the same host-minus-1-ms value,
  19/20 SELECT-only probes returned DB RUNNING despite host expiry. This
  demonstrates an unstable fixture precondition, not proof of the historical
  failed transaction's exact clock offset.
- Prepare a minimal test-only patch: explicitly expired fixed-past fixture,
  preserving existing Alert/late-provider expectations and adding a persisted
  FAILED/error-code assertion after the daily denial. No policy, production
  timeout, poll timeout or expected HTTP status changes. Luna/max prepares
  only a scratch patch; main reviews correctness and ponytail scope inline.
  Do not apply it or run another PG suite while the current run is live.

### Full PG pass / final fixture regression — 22:26 KST

- Memory-isolated full suite is terminal exit 0: 101/101 files and 789/789
  tests PASS, 1,034.69 seconds, start 22:08:44. Both prior assertion failures
  passed unchanged. Their earlier historical causes are not established by
  this passing run; the demonstrated Shadow clock-boundary fixture remains
  worth correcting. The two-line disposable checkpoint setting is retained
  with the measured full-suite evidence; production DB configuration is unchanged.
- Slow-query sample: 757 resets, total 757,754 ms, maximum 6,453 ms, none
  over 30 seconds, no logged lock waits. This is not an all-reset percentile.
- Only after the full run/container terminated, applied the reviewed Shadow
  fixed-past fixture and persisted FAILED/error-code assertion. Focused Shadow
  and Wing-rank PG regression is RUNNING; log
  `/tmp/kiditem-shadow-wing-final-focused-0907-2227.log`. Full 789/789 evidence
  precedes this test-only strengthening; no production source changed after it.
  `git diff --check` passes. Restore QA API/web after the focused run and
  resume matching in the original browser tab; do not redo actual inventory.

### Restored QA / designated workbook UI flow — 22:32 KST

- Focused final Shadow + Wing-rank PG passes 2/2 files, 19/19 tests in
  39.10 seconds. Restored API with the retained launcher and web with the
  same API-origin setting, appending to original logs. Nest PID 77237 booted
  22:28:15; web PID 77162 listens on 3000. Existing browser session remains
  authenticated as the original QA user, with 525 active Wing products shown.
  Persistent inventory remains 2,010 rows. Gateway and original files unchanged.
- Original matching tab 42038576/browser 3 successfully attached
  `Coupang_detailinfo_260711.xlsx` with the documented chooser and submitted
  `상품·재고 가져오기` once. Result explicitly reports an already-imported
  identical file, zero product/option creates or updates, and 688 automatic
  inventory connections. This proves UI idempotent import plus automatic
  connection, not a second initial-file import or a new Wing browser capture.
- That existing UI flow triggered actual extension Sellpia manual-match
  collection: attempt `ff83b0f2-5bdb-430b-85f0-f5176783b5b9` completed,
  13:30:47.539→13:31:19.216 UTC, rowCount 38,706. Published snapshot:
  1,822 targets, 534 matched targets, 834 aliases, captured 13:31:16.820 UTC.
  Snapshot xmin 2006; all 834 aliases share one xmin. Alerts count is zero.
- DB shows 688 components across 688 options, positive quantities 1–60,
  none zero/negative. Active-only UI shows 231/525 product summaries and
  276/892 configured options, quantity-review count zero. Global automatic
  count includes inactive catalog options; do not equate it with active-only
  UI counts. Per-option quantity/evidence correspondence, downstream ABC,
  remaining independent source entrypoints and post-QA gates remain pending.

### Matching quantity evidence and consumer check — 22:36 KST

- Read-only audit of all 688 stored option components finds 660 exact matches
  to captured alias title + SKU + itemCount; the remaining 28 match one unique
  provider code/barcode SKU and the existing explicit quantity parser. No
  unresolved component remains in this check. Evidence script/log:
  `/tmp/kiditem-matching-evidence-0907.cjs` and `.log`. This checks stored
  captured evidence and policy correspondence, not physical warehouse counts.
- UI detail for external product 14530989555 / option 87898881684 shows SKU
  9206-1, deduction 60 and sellable 421. Read-only DB join confirms current
  stock 25,276, quantity 60, integer quotient 421. No matching edit/save was
  performed during this readback.
- Manual-match attempt, snapshot and all aliases have xmin 2006, supporting
  atomic terminal publication. Current recovered QA organization is
  `c5e8f082-4b38-4177-b22a-95fd9fbfc89f`; the older pre-recovery organization
  identifier is not current and must not be reused for scoped probes.
- Navigating the original QA tab to Products for source readiness/explicit
  ABC next. Inventory, manual-match source and workbook import are not rerun.

### Whole-refresh QA exposed recovery/response defects — 22:39 KST

- ABC status shows no publication and missing sales/advertising/profit inputs;
  refresh is disabled. Do not treat source collection as ABC publication.
- `상품 전체 데이터 갱신` executes immediately, not a source-selection modal.
  The single click started inventory and profitability. Inventory attempt
  `ede4c52c-f675-4a0b-81c1-314b2d443746` completed with 1,822 rows in 4.215s,
  but the aggregate toast reported inventory still running. The prior plan's
  intent not to repeat inventory was not achieved by this convenience action;
  do not click it again to diagnose profitability.
- Profitability attempt `79bdf7b8-0bf1-44df-8cf5-e03e3c5fc0d7` was admitted at
  13:38:22.744 UTC and remains RUNNING with zero rows. UI reports a response
  format error. An authenticated read-only status probe returns 200 RUNNING;
  both source and built shared schemas validate its 14-month plan.
- API logs show a subsequent status 404 for old attempt
  `3d612055-df3e-4d88-9203-33a37c0883b3`. Profitability extension `execute`
  enumerates prior local sessions and reads each status before current
  collection; that loop currently propagates an old-status 404. Investigate
  stale local-session recovery and transport response shape without resetting
  the extension/QA data, broad session cleanup or another source admission.

### Confirmed QA repair scope — 22:49 KST

- Confirmed the profitability pre-collection loop propagates previous-session
  status 404 into the generic transport error shape. Luna/max implements
  narrowly scoped orphaned-local-session recovery with regression coverage;
  current-attempt, auth/network errors and live previous attempts remain fenced.
- Confirmed inventory `start()` returns the initial RUNNING object after the
  browser request finishes, in both new and resumed paths. A separate Luna/max
  implementation updates authoritative readback and consumer invalidation in
  the existing hook; no extra collection or timeout change is authorized.
- Main session retains integration/complexity review, builds and browser QA.
  These are the named whole-refresh recovery incident; unrelated owners and
  existing QA data remain unchanged. Do not repeat whole-refresh collection
  merely to test the profitability repair.
- Additional read-only UI check: option 3016311929 (스파이더맨놀이 20개) shows
  SKU 1025-1, deduction 20 and sellable 591. Stored captured alias itemCount
  and component quantity both equal 20; Products shows physical stock 11,820.

### QA repair regression and integration review — 22:59 KST

- Profitability stale-session regression reproduced red, then passed 16/16;
  Orders-focused tests passed 155/155. Main full extension suite exited 0
  (`/tmp/kiditem-extension-qa-fix-0907-2257.log`). Adapter synchronization,
  worker syntax, manifest parse and cutover scanner passed (zero findings).
- Main review retained exact environment/producer and HTTP-404 fencing; no
  canonical server status is inferred from local cleanup. Complexity pass
  found no unnecessary framework or dependency in the extension delta.
- Inventory review caught early busy-lock release during resumed terminal
  readback and widened 404 recovery risk. Added deferred-read and post-dispatch
  404 regressions; root combined hook/component/profitability tests passed
  28/28. A one-use cache wrapper was removed following the complexity pass.
- First web build failed TypeScript on the nullable persisted attempt ID in
  the resumed cache key. Use the validated current owner ID; rebuild remains
  required before actual retry. No successful build claim is made yet.
- Reloaded only installed KIDITEM OS `kfionjdklijcjedgfmcfbjadlfmobdcg` after
  checking its unpacked path points to this worktree. No storage reset or
  other extension reload occurred; the QA database remains preserved.

- Follow-up web build exited 0 after the validated-owner-ID correction
  (`/tmp/kiditem-web-qa-fix-0907-2300.log`); focused tests again passed 22/22.
  Main reviewed the deferred-read/404 regressions and final delta. Actual
  whole-refresh regression now intentionally uses one UI click to exercise
  both fixes: inventory is recollected once by this existing convenience
  action, while profitability reuses the existing unexpired attempt. This
  is the named regression exception to the earlier no-repeat intent, not a
  diagnostic loop or a second independent source admission.

### Actual source recovery and next QA findings — 23:13 KST

- Whole-refresh UI retried once. Inventory attempt
  `8efac943-2443-4f90-9dbf-4c7d5a8aae85` completed 1,822 rows in 4.206s.
  Existing profitability attempt `79bdf7b8-0bf1-44df-8cf5-e03e3c5fc0d7`
  resumed without new admission and completed at 23:01:54 with 19,488 facts,
  14 months, coverage 2025-08-02 through 2026-09-06. All facts share one xmin;
  cost basis/VAT provenance checks have zero invalid rows. UI marks Sellpia
  profit READY with the same cutoff/capture time. No ABC publication occurred.
- Actual data exposed a separate Products readiness defect: seven invalid
  product mappings mark the global mapping source MISSING, and the ABC loop
  rejects stable invalid products globally. The spec's partial-mapping rule
  requires per-product ineligibility. Luna/max repairs existing status and
  calculation services with mixed-product and unchanged CAS regressions;
  main keeps review/verification. No matching identity or formula policy changes.
- API logged read-only profitability snapshot transaction expiry (5s limit,
  5.442–9.320s observed) around ad-page navigation. A fresh read-only probe of
  the same snapshot queries completes in 804/281/409ms for 2,010 products.
  Script `/tmp/kiditem-profitability-read-timing-0907.cjs` enforces read-only
  connections. Cause is not yet proven; no timeout increase was made.
- Independent advertising attempt `995a328f-ca3a-4716-84a7-6ab259a0ed04`
  began through the ad page at 23:07:08. Collector tab 42038610 is at the
  Coupang seller login page; requested user login without asking for secrets.
  Existing separate Ads tab displays company code A00057379; the frozen QA
  account plan still expects QA-ISOLATED-0907. Resolve account configuration
  through the approved QA UI after checking the authenticated provider identity;
  do not alter a frozen attempt or bypass identity checking.
- Page-unload persistence check is NOT yet complete: SPA navigation click
  did not leave ad-ops, so do not claim initiating-page independence from this
  attempt yet. Preserve the login and QA tabs; no further source click was made.

### ABC delta review and API recovery — 23:23 KST

- Main reviewed the partial-mapping delta: stable invalid mapping is excluded
  per product; absent/non-selling target evidence still rejects changed input,
  and source/generation/cutoff fencing remains unchanged. Focused status and
  ABC services passed 15/15 in the main session after the edit. Complexity
  review found no additional abstraction or dependency to remove.
- The watch compiler had completed but its old Nest child 77237 no longer
  listened on port 4000 and did not exit on TERM. After exact PID/parent
  verification, killed only that child; the existing watcher started Nest
  86233 successfully at 23:17:14. No DB, auth or extension reset occurred.
  Existing QA login and matching data returned after page navigation.
- Product Hub shows Sellpia profit READY through 2026-09-06, advertising
  MISSING, no official ABC publication, and seven mapping-required products.
  Mapping generation readiness is still STALE without a compatible source
  pair; partial-mapping positive publication remains unverified in real QA.
- Navigated the initiating QA tab away from ad-ops to matching and Products.
  This proves navigation occurred, not successful background collection.
  The older Ads tab also redirects to seller login on a fresh request, so
  the previously rendered company identity is not proof of a live session.
  Coupang reauthentication remains required; no credentials were requested
  in chat and no provider identity fence was bypassed.
- Started latest full PG run in a new test-owned ephemeral container with
  the retained checkpoint configuration; log
  `/tmp/kiditem-all-pg-latest-0907-2323.log`. This run includes the latest ABC
  delta and fixture strengthening. Its result is pending, not a pass.

### Remaining acceptance ledger — 23:26 KST

The following separates observed acceptance from still-open work; historical
green checks do not substitute for missing real-provider journeys.

| Gate | Current evidence/status | Next required evidence |
|---|---|---|
| Latest code regression | ABC 15/15, full-refresh 28/28, extension suite, web build and Nest boot passed; cutover scanner rerun passes 0 findings | Latest full PG run terminal result on isolated port 56921 |
| Actual source and matching | Current QA DB confirms completed inventory, Wing file import, manual matching and profitability; 688 component quantities audited | Preserve/reuse these results, not recollect them |
| Advertising source | Current QA source row remains running; both official Ads tabs require login | Reauthenticate, verify provider account against QA configuration, complete owner publication and inspect source/Alert/consumer |
| Explicit ABC | No baseline publication; UI correctly disables refresh without compatible advertising | Real complete source pair, explicit UI refresh, atomic baseline without history, three read surfaces |
| Initiating-page independence | Navigation away was observed; no completed collection after departure is established | Complete a source via extension with initiating page closed/reloaded, inspect durable result from fresh page |
| Advertising failure/retry | Older pre-rebuild failure evidence exists, not a current COMPLETE fallback/retry cycle | Current failed multi-account attempt retains previous COMPLETE, one Alert reopens, successful new attempt resolves it |
| Other source entrypoints | Current QA SourceImportRun rows contain only the five source types listed above | Record per-owner actual journey evidence or explicit provider/config blockers; static coverage is not actual QA |
| Read performance | Repeated read-only snapshot samples pass in 1.594/0.906/1.124s; earlier 5s expiry cause remains unproven | Correlate any healthy-host recurrence with query/host timing; do not raise timeout to obtain a pass |
| Production cutover/deployment | Not authorized or performed from this QA task | Separate explicit approval for production writes/deployment and exact-SHA smoke evidence |

The attempted read-only navigation to order collection timed out in browser
control; subsequent URL read still showed Product Hub. No order source command
was dispatched. Avoid repeating browser actions while the heavy PG run is active.

### Latest full-run diagnostic evidence — 23:29 KST

- The latest PG run is still live; Rocket PO source file reports four failures
  (three around 30s and one at 5.814s). Final failure stacks are pending. Do
  not classify these as assertion or setup failures from duration alone.
- Read-only activity snapshots observed concurrent resets, a relation-lock
  waiter, then one unblocked TRUNCATE at 30.12s. Test configuration still has
  fileParallelism=false and unchanged 30s test/hook limits. A later snapshot
  had only one reset at 1.43s. Timeout/cancellation overlap is a hypothesis,
  not a proven cause for every failure.
- Test-container checkpointer recorded 139,880 fsyncs and 118.4s cumulative
  sync time. Simultaneous QA API logs include an 18.298s read transaction
  expiry, and browser control timed out. These correlate with host contention
  but do not establish that the production query has no performance defect.
- Navigated only the task's initiating QA tab to about:blank to stop its
  polling during this heavy run. Persistent QA data, API, web, extension and
  both provider login tabs remain intact. Restore Product Hub after the run;
  do not repeat source admissions. No timeout, assertion, durability setting
  or production code was changed to obtain a pass.

### Provider login restored; current verification still open — 23:44 KST

- User confirmed Coupang login. Fresh browser inspection of the existing Ads
  tab shows the authenticated official report page with company
  주식회사거영아이앤디 and vendor A00057379. Login is no longer the current
  blocker. The old collector tab still renders its earlier login page.
- Read-only QA check confirms attempt 995a328f-ca3a-4716-84a7-6ab259a0ed04
  has expiresAt 23:37:08 KST, already past at the 23:42 read. Stored running
  status is not proof of an unexpired attempt. Use owner-derived status and
  normal new-attempt admission after verifying QA account configuration; do
  not edit the frozen plan or reuse the expired attempt.
- The settings navigation began a Next development compilation and browser
  control timed out. The earlier order-collection request took 2.2 minutes
  compiling. These UI preparation requests overlapped the full PG run,
  contrary to the intended separation of heavy work. Stop further page loads
  until the run finishes; do not attribute all timeouts to production code or
  declare the run invalid without its terminal evidence.
- Latest PG run remains live and now reports seven failures across Rocket PO,
  keyword SERP, Sourcing URL scrape and Sourcing workspace read model. Preserve
  the final result and inspect the actual stacks before choosing a fix or
  a resource-isolated confirmation. No new source collection was dispatched.

### Full PG terminal result and QA identity correction request — 23:58 KST

- Latest full PG run exited 1: 97/101 files and 782/789 tests passed in
  1790.53s. Five failures are beforeEach 30s timeouts (Rocket PO x3, Sourcing
  URL x1, Sourcing workspace x1). Rocket's fourth failure is duplicate account
  ID during beforeEach after overlapping delayed resets. The remaining SERP
  test expected HTTP 200 and received 502 at interrupted-proof submission;
  its response body was not captured, so this cause remains unproven.
- Luna/max added bounded response diagnostics to that exact SERP loop. Main
  rejected speculative error.response extraction and reviewed the replacement
  that receives the actual Supertest response before the retained expect(200).
  FAILED-state and prior-COMPLETE assertions remain unchanged. No production
  code, timeout or retry policy changed. The four affected files are now
  running sequentially in a fresh test DB; log
  `/tmp/kiditem-seven-failure-focused-0907-2358.log` (result pending).
- After the full run ended, the QA settings UI successfully saved verified
  vendor A00057379. Contrary to the main session's initial explanation, this
  creates a new identity/account and changes the primary selection; it does
  not change the old account's vendor. Read-only checks confirm new account
  61b81af4-7a41-4ed8-98ef-8d31e5a21343 has zero listings/source runs, while
  existing 9f40c71b-7a3a-4d26-8f48-4b1df19bf781 retains all 1,225 listings
  under placeholder QA-ISOLATED-0907. No advertising retry was clicked.
- Requested explicit permission for a QA-only identity correction preserving
  captured data and mappings, plus cleanup of the newly created empty account.
  Do not silently bypass the production immutable-account identity contract,
  rewrite frozen source provenance, delete the populated account, or modify
  operating data. Mapping generation changed through the normal settings
  owner; compatible-source readiness must be reverified after any authorized
  correction, not faked by lowering its generation.
- Initiating QA tab is again about:blank during focused PG verification.
  Authenticated provider tabs, persistent QA DB, API and web remain preserved.

### Focused confirmation and quiet full run — 23:59 KST

- The four failed files passed all 52 tests in 78.42s on disposable port 56923.
  This includes the unchanged source contracts and the new SERP response
  diagnostic. No HTTP 502 recurred; its original origin remains unproven.
  Rocket 4,000-row one-shot measured 3.431s and COMPLETE read 150ms.
- The failed full run is still a failed full run. Started a new whole-suite
  confirmation with no overlapping browser navigation, source collection or
  build; `/tmp/kiditem-all-pg-quiet-0907-2359.log`. Settings compilation had
  finished before admission and the QA initiating tab remains about:blank.
  Keep this run isolated until its terminal result rather than adding more
  QA actions during it. The proposed QA identity repair remains approval-pending.

### KST day boundary — 2026-09-08 00:00 KST

- The quiet full run is live on test-only port 56925, separate from preserved
  QA 56879 and operating 5433. No provider/UI work overlaps this run.
- KST yesterday is now 2026-09-07. Existing COMPLETE profitability coverage
  through 2026-09-06 remains valid historical evidence, not current-cutoff
  readiness. Future admissions and explicit ABC QA must use the new cutoff;
  do not pin the application clock or rewrite old manifest dates to obtain
  READY. Reuse only data compatible with the actual selected cutoff and
  mapping generation.

### QA-only identity repair approved — 2026-09-08

- User explicitly approved the proposed QA-only correction. Prepare a bounded,
  one-use fixture repair outside git; this is not a production identity-policy
  change or a deployable migration containing QA-specific IDs. Main reviews
  and executes it only after the quiet full test run finishes.
- Exact scope: preserve populated Wing account
  9f40c71b-7a3a-4d26-8f48-4b1df19bf781 and its child IDs; correct only its
  placeholder vendor/external identity to authenticated A00057379 and restore
  its primary selection. Remove only new account
  61b81af4-7a41-4ed8-98ef-8d31e5a21343 after checking all FK/source-plan
  references are absent. Rocket identity is excluded from this approval.
- Guard the exact QA connection and organization, capture a recoverable
  pre-change backup, use the existing product-mapping lock, and atomically
  increment the current generation once. Verify preserved source, inventory,
  listing, option, component and profitability data. No frozen receipt or
  source generation is rewritten; idempotent replay must not increment again.

### QA repair artifact review while quiet PG run continues — 2026-09-08

- Prepared `/tmp/kiditem-qa-wing-identity-repair-0908.cjs` outside git, with
  dry-run default and explicit `--apply`. Main reviewed its complete body;
  the artifact guards exact IDs and generation, locks target rows, rejects
  child/source-plan references, backs up pre-state without overwrite, and
  checks preserved counts/checksums before committing.
- Review caught an invalid `ORDER BY t.id` for the organization-keyed
  inventory-state table. The artifact now orders by canonical row JSON for
  conservation checks. Console summaries omit the connection password.
  `node --check` passed. No QA connection or mutation has run yet.
- Quiet full run 28361 is still live with no failure logged. Read-only
  test-DB activity confirms continuing reset/query progress, not a stuck
  runner. Wing five-page terminal measured 111ms and exact read 10ms.
  Keep actual collection and UI navigation deferred until the terminal result.

### Quiet full terminal and approved QA repair applied — 2026-09-08 00:38 KST

- Quiet full run exited 1 after 2145.73s: 99/101 files and 782/789 tests
  passed. Readiness rank has one beforeEach 30s timeout. Supply purchase-order
  submission has six `SELLPIA_SYNC_REQUIRED` exceptions at assertFreshness;
  these are not six hook timeouts. The original seven failures did not recur.
- Investigating possible fake-Date leakage: integration config reuses one
  process (`isolate: false`), and rank beforeEach sets fake Date after awaited
  reset/seed. A timed-out hook can potentially resume after cleanup. This is
  a hypothesis pending a focused regression, not a proven production failure.
  Host and QA PostgreSQL current clocks agreed at 15:35:17 UTC. Luna/max is
  doing a bounded test-only reproduction/correction; no production freshness
  guard, timeout, retry, skip or reset coverage may be weakened.
- QA repair dry-run caught and rolled back two artifact defects: PostgreSQL
  catalog `name[]` decoding and an incorrect Rocket channel guard. Corrected
  to a `text[]` aggregate with array assertion and exact `rocket` channel.
  Final dry-run passed all 28 FK-column checks with zero references to the
  empty account and zero source-plan references.
- Main applied the approved QA-only repair successfully. Backup is
  `/tmp/kiditem-qa-wing-identity-repair-0908-backup.json` (mode 600). Removed
  only empty account 61b81af4-7a41-4ed8-98ef-8d31e5a21343, corrected populated
  Wing identity to A00057379, and advanced mapping generation 6 to 7 atomically.
  Replay returned `already-applied-no-op`, preserving generation 7.
- Conservation checks passed: 1,225 listings, 2,241 options, 688 components,
  2,010 inventory SKUs, 19,488 monthly sales rows, 6,108 advertising product
  facts and all 8 source receipts have identical before/after checksums.
  Rocket and non-target accounts were unchanged. Source generations/plans,
  historical dates and ABC publication state were not rewritten. Resume actual
  source admissions against the real 2026-09-07 cutoff and generation 7.

### Actual current-cutoff sources and ABC initialization — 2026-09-08 00:54 KST

- Actual Ads UI admission produced `bf9ccace-0f65-487a-9238-4982db4108b5`:
  COMPLETE at 00:45:43 KST, 12 report slices covering 2025-10-01 through
  2026-09-07, mapping generation 7, 6,108 product facts. Frozen account is
  the preserved populated Wing ID with advertiser A00057379. Browser capture
  showed the existing Oct–Dec reports reused and later monthly reports being
  generated. QA UI showed latest completion and cleared the prior failure
  alert indication. No direct insertion or Excel substitution was used.
- The current normal UI exposes Sellpia profitability only through the full
  product refresh action. Executed that action once for the changed cutoff
  and generation: inventory `2b55f0b9-9395-4817-9dae-fe5a979c4db2` completed
  with 1,822 captured rows; profitability
  `a7824ddc-334d-499e-8ae1-681a3eaa8cb1` completed at 00:47:44 KST with
  19,474 rows, 401-day coverage 2025-08-03 through 2026-09-07 and generation 7.
  Earlier COMPLETE records remain preserved. No further collection is needed
  for these exact inputs. UI reported full refresh complete, then both sources
  and mapping READY, with 7 invalid-mapping products among 215 targets.
- First explicit ABC command failed because this reconstructed QA DB had
  schema but no initialized formula. This is a missed QA post-schema setup
  step: the existing approved migration already handles mapping-only state.
  Backed up current QA to `/tmp/kiditem-qa-before-abc-init-0908.dump`; verified
  release 0.1.31/post-schema selects ONLY initializer 002, then ran the normal
  data:migrate CLI against exact port 56879. It succeeded with two affected
  rows and an audit record. Formula V2/revision 1 is active; mapping generation
  remains 7 and publication revision remains 0. No pre-schema reset ran.
- ProductHub read timeout remains an actual open QA issue, not just a test
  artifact: GET masters limit 1/50 produced expired 5s interactive transaction
  commits (7.512s and 6.688s). Two separate direct QA API reads passed at
  4.385s/3.127s; read-only snapshot probe measured 5.623s/5.576s/2.094s. Do not
  classify the intermittent failure as resolved by a successful retry.
- Bounded optimization assigned to Luna/max: common sale-age evidence fetch
  currently transfers 8,606,477 bytes of active listing raw JSON while using
  only `source` and `saleStartedAt`. Reduce that payload with equivalent
  organization-scoped reads, preserving complete-recipe semantics and the
  existing RepeatableRead transaction. No schema, cache, new runtime, timeout
  increase or source-policy change. Main reviews parity/performance before
  repeating ABC UI QA. A later button attempt hit a detached node during
  background read timeout; no successful publication has yet been observed.
- Main reviewed the readiness test-only timer correction: fake Date setup is
  now synchronous before reset/seed awaits, with afterEach restoration. A
  small same-process reproduction confirmed the old late-hook leak and the
  corrected next-file real Date. Original full-run Supply failures are
  consistent with this mechanism, but PG confirmation remains required.
- After both current sources became READY, read-only DB inspection also
  showed repeated full Advertising generation target reads, including a
  temporary-file write wait. QA contains 57,201 advertising target-day rows
  (51 MB relation including indexes). `generationFromRun` currently fetches
  all target/fact columns though its typed return uses only a subset. A
  separate bounded Luna/max change narrows those existing Prisma projections,
  preserving ordering, row limits, overflow detection, transaction isolation,
  allocation and source identity checks. This shares the named ABC evidence
  read-performance scope; no publication or collection policy changes.
- QA initiating tab is now about:blank to stop repeated heavy reads while
  these projections are corrected. All latest COMPLETE sources, formula V2,
  accounts and mappings remain intact. No additional collection is dispatched.
- Readiness + purchase-order-submission PostgreSQL confirmation passed:
  2 files, 12/12 tests, 149.50 seconds, isolated ephemeral port 56927.
  Evidence: `/tmp/kiditem-readiness-supply-timer-confirm-0908.log`.
  This confirms the focused corrected paths; the required full PostgreSQL
  suite still needs a passing rerun after the pending evidence-read fixes.

### Evidence-read delta and first ABC command — 2026-09-08 01:10 KST

- Main reviewed the two narrow projection changes. JSON `->` preserves the
  normalizer's type checks; current callers retain their transaction and
  mapping fences. Advertising keeps every returned/allocation field, ordering,
  exact source/org predicates, row cap plus overflow sentinel and isolation.
  Focused agent results: helper + Finance 32/32, Common 124/124, advertising
  adapter 9/9; main IDOR/tenant scanners and diff whitespace check pass.
  Ponytail review: no speculative abstraction/dependency to cut (Lean already).
- Watch compilation passed but old Nest child 86233 did not listen or exit
  after TERM. Main verified its exact parent/path and killed only that child.
  The retained `dev:server` watcher booted Nest 9327 at 01:05:07, port 4000.
  QA DB, provider auth and extension state were not reset.
- Same QA snapshot read now measures 1.773/0.217/0.401 seconds, 2,010 products
  and unchanged 288 valid mappings. Real GET masters limit 50 returns 200
  three times at 4.249/4.817/4.513 seconds (135,415 response bytes each).
  Product UI loaded and the data modal no longer detached during this run.
  These samples support improvement, not an unlimited-load performance claim.
- Explicit UI ABC refresh succeeded at 01:07:07: publication revision 1,
  formula revision 1, cutoff 2026-09-07, exact current Sellpia/Ads sources,
  mapping 7. Read-only DB confirms zero grade histories and resolved Ads
  source-failure Alert. However evaluations are also zero, so actual positive
  ABC calculation acceptance is NOT complete.
- Diagnosis: all 1,225 active listings contain the designated workbook's
  Korean metadata, with no `source`/`saleStartedAt`; normalized sale dates are
  zero even though 288 mappings are valid. Product evidence shows observation
  pending. Need the existing registered-products Wing browser collection to
  obtain real sale-date evidence; do not manufacture dates or relax ABC gates.
  Navigated to that existing entrypoint; route compilation is still pending,
  and no catalog command has been dispatched yet.
- Before that collection, read-only preservation baseline (full Prisma rows,
  ordered by id, JSON bigint converted to string, SHA-256): components 688,
  `d5cf058088c6adeb425fdf2ee799589a1a1a0fb3561d53415adb41a5f89b2ffb`;
  inventory 2,010,
  `52e80d72be7d8b806b5b89ed136327513a2022211cf510f451a231a91ebecbfa`.
  Latest sources remain preserved; the full PG rerun has not started while
  actual QA is active.
- Registered-products route compiled in 115 seconds. During that interval,
  outstanding ProductHub requests failed on Advertising's 30-second snapshot
  transaction (32.993s / 35s), so the read-performance issue stays open.
  A later isolated readGeneration probe took 9.902s: 57,201 targets (query
  6.903s) and 6,108 allocations (1.791s). The explicit projections are present
  in compiled code; Prisma additionally selects primary IDs internally.
- Static call tracing finds Finance as the only production readGeneration
  consumer; it uses summary/allocations, never the returned daily `facts`.
  Asked the user asynchronously whether to narrow the existing internal
  contract (recommended) or preserve it with an allocation-only read. This
  additional contract change is pending; no new code or cache was added.
  Do not restart the active QA server/extension mid-catalog capture merely
  to apply this optimization.
- Actual Wing UI command admitted source attempt
  `6aa155d8-93ff-44de-9a8d-737a5532b431` at 01:13:18; private staging
  `7bd150b0-1983-499e-88a6-c71e938ecbfd`. Frozen account is preserved Wing
  `9f40c71b-7a3a-4d26-8f48-4b1df19bf781`, vendor A00057379, source
  publication revision 1. Main navigated the initiating tab to about:blank;
  private discovery continued 700 → 800 → 900 → 1,100 → 1,254, with manifest
  confirmation at 01:20:41. Managed tab 42038630 then navigated product detail
  pages and showed the authenticated expected company/user title. This is
  operator-visible account evidence, not extractor-verified vendor proof.
- All checked staging checkpoints retain the exact component/inventory hashes
  above, mapping 7 and ABC publication 1. Read-only monitor:
  `/tmp/kiditem-wing-owner-0908.cjs`. Still RUNNING at 01:21:59; no final
  publication or positive ABC grade acceptance yet.
- Cutover scanner rerun passes, 0 findings. Live PR 493 is still OPEN with
  develop base and the old four-commit hotfix body; local reconstruction has
  not been pushed. No PR update/merge occurred. Reconcile the full body and
  release 0.1.31 contract at final handoff, not by claiming the old PR checks
  cover this local change.
- First private detail chunk committed at 01:24:38 with 20 products, while
  canonical component/inventory hashes and mapping/ABC revisions remained
  unchanged. Read-only inspection finds 20/20 actual `wing_app_data`
  saleStartedAt values accepted by the unchanged normalizer (examples:
  2026-05-15T14:03:40 → 2026-05-15; 2024-04-03T14:13:53 → 2024-04-03).
  These are captured provider facts, not inserted stand-ins, and remain
  unavailable to consumers until full publication. Early throughput is only
  about 20 details per four minutes; do not claim a completion ETA from one
  chunk or change the collector/rate policy merely to accelerate this QA.
- 2026-09-08 02:00 KST: the same Wing attempt ended FAILED at 01:59:44,
  `browser_collection_failed` / `Wing 탭 로딩 타임아웃`. Discovery retains
  1,254 items in 26 chunks, manifest confirmation 1, and detail staging 200
  items in 10 chunks (last detail commit 01:46:09). No publication occurred;
  component/inventory hashes above and mapping 7 / ABC revision 1 are unchanged.
  Registered-products displays the matching failure and counts, and the Alert
  panel links the exact source attempt with the same error. Failure propagation
  and preservation pass; complete Wing collection and positive ABC acceptance
  remain failed/unverified, not complete.
- The first terminal failure POST encountered a 5-second Prisma interactive
  transaction expiry (5.555s at `readOwned`); a subsequent retry persisted the
  terminal result. Repeated visits within the uncommitted 200–219 ordinal group
  were observed before failure. The collector retains that entire group in
  memory until its single upload, but no retained transport/worker lifecycle
  evidence identifies why it replayed. Do not attribute this to authentication,
  worker suspension, provider rate limits, or upload failure without evidence.
- Post-terminal service-worker console inspection found a separate confirmed
  UI synchronization defect: `environment-context.js:217`, `executeScript`
  args index 1 is unserializable. Existing `notifyDashboard` calls `publish`
  without detail, producing `undefined`; synchronous argument validation also
  escapes the current `Promise.allSettled(tabs.map(...))` protection. Bounded
  repair delegated to Luna/max: canonical shared adapter normalizes absent
  detail to null and isolates per-tab synchronous failures; regression tests
  must cover both. Main owns integration review and actual browser verification.
  This defect is not established as the Wing loading-timeout cause. No new
  collection, provider mutation, timeout increase, or source reset was issued.
- Read-only follow-up reused idle QA tab 42038569 for the last observed Wing
  detail ID 16065657186. Navigation returned in 3.524s and the authenticated
  expected seller's editable detail page rendered. No save or collection
  command was clicked. This does not reproduce the worker's earlier timeout
  and does not prove the same timing or target at failure. Closed the worker
  DevTools after console inspection so it cannot keep later workers alive.
- Lifecycle investigation remains open: the catalog alarm/`runSoon` path does
  not use the existing finite `KidItemWorkerKeepAlive.during` helper, while a
  detail navigation can wait 45 seconds and a group stays in memory. Chrome's
  documented 30-second idle shutdown and five-minute event limit make this a
  concrete risk to investigate, not proof of the observed replay cause
  ([Chrome lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)).
  No keepalive or checkpoint protocol change has been applied on this hypothesis.
  Repo search also finds no current web listener for `kiditem-sync`; repair of
  its serializer must not be represented as proof that UI latency is fixed.
- Shared publish repair is implemented and main-reviewed: one absent-detail
  normalization and async per-tab callback, no additional abstraction or
  provider change. Pre-fix repro threw at the first tab; post-fix reaches all
  tabs. Focused adapter tests 16/16, full extension tests 835/835, Coupang
  tests 480/480, adapter sync, syntax/manifest checks and diff hygiene pass.
  Main ponytail review reduced the explicit promise wrapper to an async
  callback; no further complexity finding remains.
- 02:09–02:10 KST actual Chrome verification: all 12 QA source runs were
  terminal before reloading the same unpacked extension. A one-shot diagnostic
  listener on existing QA tab 42038576 received the real
  `notifyDashboard('local')` event with `{received:true, detail:null}` and no
  serialization error. The temporary listener/marker was removed and DevTools
  closed. This proves repaired event transport, not a full collection rerun.
  Post-reload read-only source/chunk counts and canonical hashes remain exact.
- 02:13 KST: started the latest full PostgreSQL gate in a separate ephemeral
  Postgres container `15d7cf6849d3`, port 56929 (not QA 56879 or operating 5433).
  Log: `/tmp/kiditem-all-pg-after-sync-fix-0908-0213.log`; slow SQL / lock log:
  `/tmp/kiditem-all-pg-after-sync-fix-postgres-0908-0213.log`. The prior seven
  failures were six Supply freshness errors from a leaked fake Date plus one
  Readiness preparation-hook timeout, not seven hook timeouts. Readiness now
  initializes its fake Date before asynchronous setup and restores real timers
  after each test; the affected two-file 12/12 confirmation precedes this run.
  Do not claim the new full run passes until its terminal result is observed.
- Bounded catalog lifecycle fix delegated to Luna/max: reuse the existing
  finite keepalive helper for each unique `runSoon` step, preserve deduplication
  across start/status/alarm, and release on success or failure before the next
  alarm. Test the missing lifetime integration first. No new runtime, retry
  policy, chunk protocol, capture checkpoint, or timeout increase is authorized
  by this fix. Earlier replay causation and real-provider acceptance still
  require actual evidence; do not conflate prevention with a proven diagnosis.
- Catalog finite keepalive implementation is complete and main-reviewed:
  `runSoon` wraps its unique step promise with the required injected
  `KidItemWorkerKeepAlive.during` function. No hold is retained between steps.
  The original code failed the hold regressions; final focused tests 43/43 and
  full extension suite 841/841 pass. Deferred navigation, alarm/status
  deduplication and release on success/error are covered. Main removed a silent
  no-keepalive fallback and bounded wiring assertions to the catalog factory;
  correctness and ponytail passes have no remaining finding in this delta.
  Syntax and diff hygiene pass. Browser reload and actual catalog rerun remain
  pending until the concurrent full PostgreSQL gate terminates.
- Latest full PostgreSQL gate terminated successfully: **101/101 files,
  789/789 tests**, 1128.65s, started 02:13:21 KST. Runner and log follower
  exited 0; ephemeral port-56929 container was removed by normal teardown.
  QA 56879, operating 5433 and MinIO containers remain. Slow SQL log contains
  780 table resets, total 858.727s, maximum 5.812s, zero reported lock waits.
  No hook/test timeout was increased and no test was skipped. Current cutover
  scanner also passes with zero findings. The only code changes during this
  gate were extension-local keepalive wiring/tests; backend tested scope stayed
  unchanged. Proceed to the actual catalog rerun without another concurrent
  full PG/build workload.
- 02:35:15 KST: after loading the reviewed finite-keepalive code into the same
  unpacked extension and reconnecting existing registered-products tab
  42038576, clicked its existing **Wing에서 가져오기** once. New owner attempt
  `0c6cd202-ddd0-425b-a64b-dba6d5b83b1c`, private staging
  `f2c2a717-b89b-4072-af31-3ae32dab57f2`, frozen account/vendor/revision remain
  `9f40c71b-7a3a-4d26-8f48-4b1df19bf781` / `A00057379` / `1`. No failed
  generation was reset or revived. Initial 200 discovery items persisted;
  canonical hashes and mapping/ABC revisions remain identical.
- Navigated the initiating QA tab to about:blank to verify independent worker
  progress without status-page polling. Managed collection tab 42038641 reached
  Wing inventory page 13 and shows the expected authenticated seller title.
  No DevTools is attached to the source worker. Read-only progress script now
  accepts an exact attempt UUID argument, retaining the previous failed-attempt
  default: `/tmp/kiditem-wing-owner-0908.cjs 0c6cd202-ddd0-425b-a64b-dba6d5b83b1c`.
  This new actual collection is still RUNNING, not yet accepted as complete.

### Current acceptance checkpoint — 2026-09-08 02:53 KST

- The same live Wing attempt advanced through 40/60/80/100/120 private
  product-detail records; latest detail chunk committed at 02:52:19 KST.
  Its managed Chrome tab continues visiting different authenticated detail
  pages while the initiating page remains blank. No worker DevTools, reload,
  duplicate start, timeout increase or provider-policy change was introduced.
- Read-only inspection confirms its fixed expiry is 2026-09-09 02:35:15 KST,
  exactly 24 hours after admission. Collection has not expired. Components
  remain 688 and stock 2,010 with the exact previously recorded hashes;
  mapping generation 7 and ABC publication revision 1 remain unchanged.
- Current QA owner inventory is 13 attempts: ten COMPLETE, two FAILED and
  this one RUNNING. COMPLETE source types are Sellpia inventory, manual
  matching, profitability, Advertising profitability and the designated-file
  Wing catalog import. The file import is not evidence of browser Wing
  completion, and historical/test fixtures are not substituted for actual
  journeys of the other source owners.
- Latest backend full PG gate remains 101/101 files and 789/789 tests PASS;
  latest extension suite remains 841/841 PASS. No implementation changed
  after those gates. Browser Wing atomic publication, positive real-data ABC
  calculation and its three read surfaces remain unverified. Advertising
  read-contract optimization remains approval-pending. Deployment remains
  outside current authorization; neither these passes nor this checkpoint
  establishes whole-cutover completion.
- At 03:03:15 KST the same attempt committed its 11th detail chunk (220
  products), beyond the prior failed attempt's 200-product checkpoint. Current
  owner status remains RUNNING and all preservation hashes/revisions remain
  identical. This proves forward persistence past that checkpoint, not the
  earlier timeout's cause or final collection acceptance.
- At 03:05:24 KST that attempt terminated FAILED with
  `browser_collection_failed` / `Wing 탭 로딩 타임아웃`. It retains 220
  private details (11 chunks), full discovery and manifest confirmation; no
  publication occurred. Component/inventory hashes, mapping 7 and ABC
  publication 1 remain unchanged. Managed tab 42038641 closed on failure.
  Current API log shows no new failed terminal POST. The finite-keepalive
  regression remains valid, but this real navigation failure is unresolved;
  do not claim keepalive fixed it or start another blind full collection.
- Read-only diagnostic navigation revisited the frozen next group, ordinals
  220–239, in the existing idle diagnostic tab. All 20 authenticated Wing
  detail pages exposed embedded `appData` and were observed at document
  COMPLETE (no source command or product mutation). The final 18 checks
  measured 3.060–4.758 seconds each. The first page was untimed; the second
  was INTERACTIVE at 2.273 seconds and COMPLETE at the later 20.741-second
  observation, so its actual load-completion latency was not measured. The last 15
  also produced observed Page load events without event-buffer truncation.
  This did not reproduce the timeout or identify the exact failing target.
  The diagnostic tab was returned to about:blank; no source-worker DevTools
  was attached during actual collection.
- Fresh registered-products UI shows `수집 실패`, detail 220/1,254 and the
  preserved 1,225 catalog products. Its Alert link targets the exact new
  failed attempt. Read-only DB confirms one existing Wing Alert
  `f2e0d4c5-37ab-46d7-821a-8388cb837703`, created 01:59:44 KST and updated
  03:05:24 KST, now OPEN/unread with the new attempt ID. Failure reopens the
  deduped source Alert instead of creating another one.
- Bounded diagnostics delegated to the existing Luna/max implementation
  agent: enrich the existing timeout error using only safe expected Wing
  page identity, last observed tab status/page identity and navigation
  observation. Keep deadline, retry, collection and readiness policies
  unchanged; do not add persistence, telemetry or asynchronous timeout-time
  IO. Main will review correctness/redaction/complexity and regression
  evidence before any further actual attempt.
- Timeout diagnostics implemented in the existing effective worker helper and
  main-reviewed. Main complexity/privacy review removed unrelated page
  taxonomies, extra status/numeric helpers and redundant observation state.
  Only bounded Wing inventory IDs/page numbers are emitted; other page types
  retain a safe label without query data. Initial regression/full extension
  gates pass (2/2 and 843/843); one explicit login-query redaction regression
  is being added before final test signoff. No timeout, retry or readiness
  behavior changed, and no backend implementation changed.
- 03:27–03:28 KST actual installed-helper check: confirmed all 13 QA attempts
  terminal, reloaded the same extension and inspected its service worker only
  while no collection was active. Called the existing wait helper on a known
  completed diagnostic Wing list tab with an intentionally mismatched expected
  page and a test-only 100ms deadline. Error correctly reports expected page
  999, last observed COMPLETE/page 1 and navigationObserved=false, omitting
  the dummy query token. Matching page 1 resolves normally. No attempt was
  admitted or provider form submitted; production collection still uses 45s.
  Closed DevTools and returned the diagnostic tab to about:blank. Post-check
  owner/chunk counts and canonical hashes remain unchanged.
- Final timeout-diagnostic regressions pass 3/3 and full extension suite
  844/844. The isolated pre-diagnostic variant fails the new regression with
  the original generic message. Syntax, adapter sync and diff checks pass;
  the latest cutover scanner reports zero findings. Final implementation
  remains unchanged from the installed-helper verification.
- 03:30:49 KST: admitted one new Wing attempt from the existing registered
  products UI, `9b9570fa-31d0-49e4-80cd-17731dae6143`. Managed tab 42038650
  is progressing through the frozen 1,254-product list. Initiating tab
  42038576 is again about:blank. Observe only this live attempt and its page
  document state to capture any actual 45-second stall; no further restart,
  DevTools attachment to the source worker, or concurrent PG/build workload.
- 03:44:21 KST: that exact attempt FAILED without publication after all 1,254
  discovery records and 40 staged detail records. The new diagnostic reports
  expected and observed Wing modify product `16218812798`, last status
  `loading`, navigationObserved=true. This rules out a missing navigation in
  this observation; it does not establish why the page failed to finish.
- During this attempt, Chrome Task Manager identified the active Wing renderer
  at approximately 4.1GB and 135% CPU. One page Performance sample contained
  1,260 documents, 335 frames and approximately 1.63GB used JS heap. Host CPU
  idle was 1.61% in a two-second sample with heavy swapping. After the failed
  attempt closed its managed tab, another sample showed 65.8% idle. These are
  resource-pressure observations, not proof of a memory leak or timeout cause.
  No unrelated apps, Docker services or user tabs were terminated.
- 03:49 KST: after recovering the existing Chrome connection, opened the exact
  failed product in one fresh diagnostic tab in the same profile. Navigation
  returned in 5.48 seconds; the page was COMPLETE with its embedded product
  model and normal edit form. No form was saved and no source attempt started.
  This is a diagnostic observation, not successful extension collection or
  canonical ingestion. Do not blindly repeat the full collection or increase
  its deadline. Latest canonical component/inventory hashes remain unchanged,
  with mapping generation 7 and ABC publication revision 1.
- Fresh single-page Performance sample: 28 documents, 27 frames, 11,032 nodes
  and approximately 176MB used JS heap. This differs materially from the
  long-running collector sample, but does not by itself identify retained
  objects or establish a safe collection-policy change. Closed the temporary
  diagnostic tab after observation; preserved all original user tabs.

### Independent source QA — 2026-09-08 03:56 KST

- Reopened QA Dashboard in the same Chrome profile. Initial navigation was
  delayed by Next dev compilation (root 54s, Dashboard 30.5s); the server was
  responsive and was not restarted. Closed only the diagnostic Chrome Task
  Manager window. Latest Wing Alert is OPEN/unread and links to exact failed
  attempt `9b9570fa-31d0-49e4-80cd-17731dae6143`, with the bounded timeout
  diagnostic present in both the dashboard and notification panel.
- Clicked the existing readiness panel's `매출 받기` once. Its actual owner is
  `sellpia_sales_daily`, not Wing traffic: attempt
  `a3b7e4e0-45aa-43dd-975a-f59e669d91a7` completed from 03:54:35.178 to
  03:54:39.552 KST, 183 rows, publication sequence 1, no error. No direct
  source insertion or substitute file was used. Read-only QA DB inspection
  confirms all rows reference this owner and span August 25–September 8.
  The readiness UI explicitly shows August 25–September 7 as 14/14 filled,
  `방금 업데이트`, and advances from 1/4 to 2/4 ready. The capture's additional
  current-day rows are not counted as the yesterday-cutoff readiness proof.
- Next clicked existing `광고 받기` once for the separate daily advertising
  performance source. Inspect this exact new attempt before any other source
  command; this does not rerun the completed advertising profitability source.
- Advertising daily attempt `128e4f9c-8d23-43e2-b3a6-7f94f4ab685d` ran from
  03:56:23.051 until FAILED at 03:58:50.658 KST with
  `SOURCE_ATTEMPT_UNAVAILABLE` / `광고 campaign source owner 수집 허가가 필요합니다.`
  Starting QA page was explicitly navigated to about:blank while the managed
  tab 42038668 continued through dates. Read-only raw snapshot inspection
  shows 130 staged rows covering August 26–September 7; the FIRST frozen date,
  August 25, is missing. The initial inference that the last date failed was
  disproven by these dates. No publication sequence was assigned.
- On a fresh Dashboard navigation the failure Alert is OPEN, and advertising
  readiness remains 0/14 with no completed update, despite 13 private daily
  receipts. Partial staging is not exposed as complete; Sellpia daily still
  remains ready. Delegated the bounded first-page daily-control dispatch defect
  to the existing Luna/max extension implementation agent. Main retains actual
  QA/integration review; no timeout, retry, campaign scope or source policy
  expansion is authorized by this diagnosis.
- Orders page is reachable and shows 20 predefined mall cards, 0 configured,
  plus historical July artifacts/activity. Those historical records are not
  counted as current installed-extension acceptance. A scoped Domeggook
  collection request failed before admission: browser Network response for
  POST `/api/orders/collection/attempts` is 404 with
  `ORDER_COLLECTION_MALL_NOT_FOUND`. The source repository requires an existing
  organization-scoped `order_collection` ChannelAccount; the list endpoint
  renders predefined enabled cards even when no account row is saved. No new
  source attempt, provider collection, order conversion or transmission took
  place. Do not invent account credentials or silently create QA account
  configuration. Saved account setup is an explicit remaining prerequisite;
  UI readiness wording may warrant a scoped follow-up after its intended
  configuration contract is decided. No transmission/upload/delete button was
  clicked, and no historical artifacts were changed.
- `순위 받기` used the existing Wing keyword-rank batch, not the distinct
  itemwinner-KPI owner. Batch key `3aa698b4-2aa0-4cd1-b698-bb469b90a77a`
  admitted 1,495 selected keyword attempts at 04:10:33–04:10:47 KST.
  The backend already staggers each expiry by ordinal; an initial concern
  about all children expiring after the same 25 minutes was disproven by
  source inspection. Do not change expiry or selection policy on that basis.
- Actual capture completed 18 keyword owners / 1,651 provider rows. The
  consumer page shows their precise captured rank bounds (e.g. 98위 밖),
  dates and unknown metrics distinctly. This is positive per-keyword
  extension→owner→consumer evidence, NOT completion of the 1,495-keyword batch.
  A fresh `/rank-tracking?rankBatch=...` page eventually recovered the same
  live batch after several 5s transaction-expiry read failures during host
  load / first Next dev compilation; no replacement batch was started.
- Exercised the existing `수집 중단` button once around 04:23 KST to verify
  cancellation with completed-result preservation. After dispatch was visible,
  navigated the initiating QA page to about:blank to remove large-page polling.
  Cancellation preserved all 18 COMPLETE owners, but stopped after 120
  `COLLECTION_CANCELLED` outcomes. At 04:24:41 the next per-child control GET
  returned 429; 1,357 children remained RUNNING at 04:25:34. The existing
  cancellation loop performs per-child GET+POST and throws on that limit.
  Server throttle is 120/60s. This is a cancellation defect, not success or
  an observation timeout; do not raise throttles or fabricate terminal rows.
  Existing Luna/max catalog agent is assigned its bounded correction, with
  cross-layer changes requiring main design alignment before implementation.
- Advertising agent's first delta deletes ads-report's ownerless legacy
  targetDate timer, preserving owned manualSync and approved action mode;
  extension suite passes 845/845. Main found that its generic no-permit
  reproduction differs from the actual campaign-permit error. The exact
  latter branch proves daily control present but targetDate missing. Agent is
  now adding a focused regression and passing the frozen per-target date in
  daily manualSync instead of relying on mutable page hash, retaining actual
  date-picker/date-display and advertiser checks. No post-fix reload or daily
  retry has occurred yet, and this work is not claimed fixed in live QA.

### 2026-09-08 04:38 KST — daily-date patch review and cancel recovery pending

- Main reviewed the advertising delta: the background derives the daily target
  from the frozen owner resume URL and passes it explicitly in `manualSync`.
  Content validates calendar format and membership in the owner's business-date
  plan before date-picker work; missing dates cannot fall back to seven days.
  Login handoff remains before that validation but captures nothing; resumed
  owned requests must still validate. Actual displayed-day, pagination,
  advertiser identity and owner fences remain unchanged.
- Deleted the ownerless target-date auto-start instead of introducing another
  queue or timer. Main correctness and ponytail delta review found no further
  required change. Agent reports focused 152/152 and full extension 849/849;
  main independently passed adapter-sync, modified-script/service-worker syntax
  and extension whitespace checks. This is code verification, not live success.
- Read-only QA snapshot at 04:32:16 KST still shows 18 COMPLETE / 1,651 rows,
  120 cancelled failures and 1,357 RUNNING keyword owners. No active collector
  tab remains. Batch cancellation recovery is being designed; no direct DB
  terminalization, replacement batch or throttle increase was performed.
- Chrome native UI currently returns only a window title and reports screenshot
  unavailable; reconnecting the UI session did not restore it. The installed
  extension has NOT been reloaded with the date patch. A native address entry
  was truncated to an unintended `http://ons/?id=...` navigation in the QA-only
  tab; no application data or credentials were entered. Stop unreliable native
  input until the UI is observable. Browser inventory still sees the original
  Chrome profile and provider tabs. Post-fix real daily QA remains unexecuted.
- Main rerun `/tmp/kiditem-extension-after-daily-target-date-0908.log` exited 0:
  849/849 passed, no skipped/cancelled tests (27.8s). Cutover guard also exited
  0 with zero unowned producers, source-to-ABC references or legacy runtime
  references. No backend change has been made during this patch review; the
  earlier full PostgreSQL gate remains valid for that backend revision.
- Main approved the bounded cancellation correction after the agent's design
  review: a named rank-owner batch-cancel endpoint, fixed small chunks per
  request and idempotent continuation from current owner state. Preserve all
  terminal outcomes and existing failure Alerts. Expired RUNNING members must
  take the existing expiry terminal path, not be silently skipped forever.
  Reuse organization/source locking and the frozen admission membership;
  reject cross-organization/batch work and fence late capture. Existing Wing
  and shared SERP cancellation callers are in this incident scope; no generic
  runtime, schema, throttle or timeout change is authorized. The existing
  Luna/max implementation agent is proceeding; main owns delta review and
  subsequent backend gates and live recovery. No cancellation patch is yet
  counted implemented or verified.

### 2026-09-08 07:39 KST — rank-cancel delta review before runtime acceptance

- Agent delivered Wing/SERP batch-cancel endpoints and an extension loop;
  reported focused batch 12/12 and worker-boot 79/79. Main found missing active
  collector-session/tab cleanup after replacing per-owner `fail()` calls,
  newly raised 30s transaction budgets, and no backend cancellation regression
  coverage. These are unresolved review findings, not live success. Agent is
  correcting them and adding actual PostgreSQL cases before main runs the gate.
  The arbitrary 64-request/3,200-member ceiling must not become a new source
  policy; use decreasing pending owner state to bound progress instead.
- Native Chrome accessibility and screenshots now work again. Main restored
  QA tab 42038660 from the truncated address entry to about:blank. No extension
  reload, new collection or cancellation replay occurred during that repair.
- Existing API watcher 77145 and child 9327 remain alive, but port 4000 has no
  listener and a health request is connection-refused. The last watch log
  reports zero compile errors at 04:39. No replacement runtime was launched
  while cancellation code was still changing. Main will use the same isolated
  QA launcher after focused verification; persistent QA DB 56879, operating DB
  5433 and MinIO containers remain unchanged.
- IDOR and tenant-scope guards exited 0. Exact admitted rank batch read at
  07:38:51 preserves 18 complete, 120 failed, 1,357 running. A new read-only
  `/tmp/kiditem-rank-preservation-0908.cjs` records canonical preservation
  before replay: 18 completed owners, 18 raw captures, 1,958 consumer rows.
  SHA-256 values respectively:
  `98af27cb8bf98d209c6b639065c80f1de89750b7bacc549862c471c891dc18ee`,
  `dd06c7670ff5dc9e4cfea444528edb0512cd94bb433a09d8b5f8d3dbbea88549`,
  `c315e79379d8a65d2183c28207bae814d75ca827a8388deb37e2eee9ee2bc577`.
  The query uses the exact frozen 1,495-member admission, organization scope,
  a read-only connection and repeatable-read transaction. No data was mutated.
- ACTIVE spec lines 292–294 and 1291–1292 require non-actionable cancellation.
  Main found Wing/SERP `failIn` still creates error Alerts for
  `COLLECTION_CANCELLED`, unlike sibling Advertising source owners. Refined
  the earlier "identical Alerts" guidance: cancellation records FAILED without
  creating/reopening an actionable Alert; expiry and genuine failure still
  commit their Alerts atomically. Preserve earlier Alert occurrences; do not
  rewrite historical QA cancellation Alerts. Added this regression to the same
  cancellation incident scope.
- Local session cleanup must follow each server-confirmed terminal chunk,
  never clear a still-RUNNING member just because its ID belongs to the batch.
  This preserves the source-owner boundary during partial cancellation and
  prevents a closed-tab capture failure from racing ahead of owner cancellation.

### 2026-09-08 07:52 KST — revised rank cancellation regression gate

- Revised production code removes the new transaction timeout override and
  arbitrary cancellation request cap. Each response must reduce remaining
  RUNNING members; only confirmed terminal members have their matching local
  sessions/tabs cleared. Wing/SERP cancellation no longer creates actionable
  Alerts, while expiry retains transactional failure alerts. Main reviewed
  these changes against the source-owner cancellation contract.
- Added database coverage lives in
  `apps/server/src/advertising/__tests__/rank-batch-admission.pg.integration.spec.ts`.
  Its new Wing/SERP cases admit 121 owners, preserve prior COMPLETE/FAILED
  members, process 50 per request, test expiry Alert and cancellation without
  a new Alert, replay, cross-organization rejection, other-batch isolation and
  late completion rejection. Agent reports this file's 18/18 passing; main is
  running the whole PostgreSQL suite against the final frozen backend.
- Main full extension rerun exited 0: 851/851 passed, no skips or cancellations,
  `/tmp/kiditem-extension-rank-cancel-final-0908.log` (31.4s). Adapter sync,
  service-worker syntax and scoped diff checks also passed.
- Full PostgreSQL invocation is live as session 76646, log
  `/tmp/kiditem-all-pg-rank-cancel-0908.log`. Its separate container is
  `d8958af979f8` on port 56934; schema push completed there in 4.26s.
  Persistent QA 56879 and operating 5433 remain untouched. Await this exact
  process to terminal; do not restart it for an observation timeout. No API
  restart, web build, extension reload or provider capture runs concurrently.
- Main verified the focused 18/18 terminal output: the run used ephemeral
  PostgreSQL port 56932 and completed in 42.18s, before the full run began.
  Both new 121-member cancellation cases passed (SERP 1.66s, Wing 1.77s).
  No additional agent tests or edits followed the freeze request.
- The same full-run worker 66625 remains live. Intermediate performance
  evidence: Rocket 4,000-row terminal write 4,422ms / complete read 204ms;
  Wing 1,000 products / 3,000 options / 1,000 media finalization 1,769ms
  (55 statements), refresh 4,305ms (46 statements). These are isolated DB
  measurements, not real-provider browser acceptance or a final suite verdict.
- Full PostgreSQL session 76646 exited 0: 101/101 files and 791/791 tests
  passed in 1,157.36s (start 07:50:26 KST). The testcontainer and its log follower
  exited normally; only the original persistent QA/operating/MinIO containers
  remain. Main will not repeat this gate unless backend changes invalidate it.
- Before API recovery, main revalidated that port 4000 was absent and the old
  QA process group 77070 contained only its `dev:server` / Nest watcher / child
  chain. Sent SIGTERM to that exact group; no database or user browser process
  was stopped. Recovery reuses the existing isolated QA launcher/settings.

### 2026-09-08 08:19 KST — actual rank cancellation persistence passes; response UI remains failed

- Reused the original QA API launcher and database. Nest booted successfully
  at 08:11:33 with both batch-cancel routes; reloaded the same unpacked
  extension before the actual check. No source recollection or DB reset.
- Clicked the normal rank page's `수집 중단` once for original receipt
  `3aa698b4-2aa0-4cd1-b698-bb469b90a77a`. All remaining 1,357 RUNNING members
  terminated; persisted result is 18 COMPLETE / 1,477 FAILED / 0 RUNNING.
  An independent authenticated GET returned all 1,495 members in 345ms.
- Read-only repeatable-read verification preserved all three baseline hashes:
  18 completed owners, 18 captures, and 1,958 consumer rows are unchanged.
  Historical cancellation Alerts remain 120; this cancellation added none.
- Actual UI acceptance is **failed**, not collection success: the extension
  command exceeded its existing 15s response window. Reload shows the terminal
  receipt, but 1,477 inline failure paragraphs make the page impractical.
  Native accessibility omitted the oversized result container; a screenshot
  confirmed it was rendered, so this is not evidence of missing owner data.
- Luna/max is investigating a bounded response/terminal-state correction and
  failure-detail containment. No arbitrary timeout increase or new generic
  execution lifecycle is authorized. Main retains integration and QA review.

### 2026-09-08 08:23 KST — daily Ads rerun stops safely at expired marketplace login

- Triggered `광고 받기` once through the existing dashboard collection panel,
  after the explicit target-date patch was loaded. New owner
  `f6d8cd9f-4ff3-421f-9de0-468e82c5dfd5` requested the original 14 missing days
  (2026-08-25 through 2026-09-07).
- Owner failed at 08:20:55 with `AD_ACCOUNT_DAILY_KPI_COLLECTION_FAILED` /
  `쿠팡 광고센터 로그인이 필요합니다.` It has zero captures, zero published rows,
  no publication sequence, and one failure Alert. The earlier 13-day partial
  attempt and valid independent source datasets were not reset or replaced.
- The existing Ads tab initially displayed cached account details. Reloading
  that exact tab redirected to the seller sign-in form, confirming actual
  session expiry rather than a demonstrated scraper detection defect.
  Asked the user to sign in directly; no credentials were read or requested
  in chat. Date propagation actual acceptance remains blocked on login.
- Rank cancellation response/UI work remains independent and continues;
  this external authentication requirement does not invalidate the passing
  791-test PostgreSQL backend gate.

### 2026-09-08 08:35 KST — rank cancellation ACK correction and bounded UI verified

- Main reviewed the bounded extension/frontend delta for owner terminal truth,
  local cleanup ordering, retry after transport errors, and in-flight duplicate
  cancellation commands. The first successful server cancel response now
  acknowledges acceptance; remaining monotonic chunks use the existing finite
  worker keep-alive. Owner polling, not this acknowledgement, proves completion.
  No backend, timeout, permission, schema, or collection policy changed.
- Main's ponytail pass removed speculative/duplicate keep-alive error handling;
  the final code uses the existing required promise helper and one cleanup path.
  UI retains all failure records inside native details with a bounded scroll
  viewport and separates cancellation errors from unrelated dispatch errors.
- Final full extension suite exited 0: 855/855 passed, no skips or cancellations
  (`/tmp/kiditem-extension-rank-ack-final-0908.log`, 29.29s). Main web focused
  rerun exited 0: 8/8 passed
  (`/tmp/kiditem-web-rank-ack-focused-0908.log`). Added tests include concurrent
  cancellation dedupe and terminal owner recovery without erasing start errors.
- `npm run build --workspace=apps/web` exited 0
  (`/tmp/kiditem-web-rank-ack-0908.log`); adapter sync and worker syntax passed.
  Cutover guard passed with zero unowned producers, source-to-ABC references,
  or legacy runtime references. Backend remained unchanged, retaining the
  791/791 PostgreSQL and successful Nest boot evidence.
- Reloaded the same unpacked extension, then opened the original rank receipt
  in the same QA tab. Actual screenshot/AX show `처리 1495 / 전체 1495`,
  1,477 failures in a height-limited scroll region, and the existing consumer
  table visible below. Native collapse works and preserves the summary/data.
  No new rank batch was admitted. Multi-chunk ACK timing is regression-tested;
  a new real pending batch has not been created just to repeat cancellation.
- Returned to the existing Ads tab. It again showed Ads Center/account identity,
  but the subsequent native observation became a menu-only state with screenshot
  unavailable. No new Ads owner was admitted; wait for a stable authenticated
  page/operator completion before retrying the failed daily attempt.

### 2026-09-08 08:47 KST — actual daily Ads publication passes; dashboard period mismatch found

- Revalidated the existing Ads account after its page and report-list refresh
  both remained authenticated as A00057379. No other QA source was running.
  Used dashboard `광고 받기` once, admitting only new daily owner
  `07b2bee4-62a9-45c3-b028-0ef61897bea8` at 08:39:35.
- The formerly omitted 2026-08-25 receipt arrived first. All 14 days through
  2026-09-07 completed at 08:42:08: 140 provider rows / 14 daily snapshots,
  no missing dates. During seven-receipt partial progress, source API reported
  RUNNING / refreshing and published API returned zero rows. After terminality,
  source API returned READY / COMPLETE and published API returned all 14 days.
  This owner does not assign a publicationSequence; its completed status and
  published read contract, not that nullable field, establish visibility.
- Existing source-failure Alert `30cc6274-f388-420e-ab92-297c21bf3182` transitioned
  to RESOLVED in the same completion transaction; its creation time remains
  03:58:50, so the final Alert reference is not a newly generated failure.
- Actual 14-day published totals are ad spend 888,504 KRW, attributed revenue
  7,788,780 KRW, 2,482,500 impressions, 6,154 clicks, and 731 orders.
  Dashboard custom-range API returned the same spend/revenue and daily costs.
  Display QA remains pending because native screenshot became unavailable
  after the managed collection window closed; no new source run is needed.
- A scoped consumer defect was exposed: `buildAdKpi` uses current-month clicks
  (3,083) but selected-range conversions (879 for 14 days), yielding 28.51%.
  The rest of this detailed KPI is current-month data. The monthly source
  conversions are 474; the same-period ratio is 15.37% using the existing
  metric definition. Do not change conversion units, thresholds, source
  selection, missing-data policy, or unrelated dashboard formulas here.
- Bounded correction plan for the Advertising owner → Analytics dashboard
  read contract: make the detailed monthly conversion count and its ratio use
  the same monthly aggregate as clicks, remove the now-unneeded selected-range
  parameter, and add custom-range/month-boundary regressions. Main will review
  correctness and ponytail complexity, verify the real existing owner through
  the API, and rerun required backend gates. No new collection or DB reset.

### 2026-09-08 08:55 KST — dashboard period fix verified; latest full PostgreSQL gate running

- Luna/max changed only `dashboard-ad.service.ts` and added its focused unit
  test file. Detailed monthly KPI now reads `curMonthAd.conversions`; the
  unrelated selected-range parameter was removed. Main correctness and
  ponytail review found no remaining issue in this bounded delta.
- Main dashboard unit scope passed 14 files / 48 tests, including custom
  month-crossing and day/month conversion consistency, with no production
  edits after that gate (`/tmp/kiditem-dashboard-period-focused-0908.log`).
- The Nest watcher compiled with zero errors, but prior QA child 69359 had
  closed port 4000 and remained in shutdown. After exact PID/command/port
  verification, killed only that child. The same watcher booted child 77825
  successfully at 08:52:48; port 4000 is listening. No parent, other app,
  database, or volume was stopped or replaced.
- Main read-only API contract probe
  `/tmp/kiditem-ad-dashboard-period-0908.cjs` passed against the original
  completed daily owner. Custom 14-day, day, and month queries all returned
  monthly conversions 474 / monthly clicks 3,083 / CVR 15.37%. Custom-range
  spend and attributed revenue still match all 14 published daily rows.
- Latest full PostgreSQL gate is session 20854, log
  `/tmp/kiditem-all-pg-dashboard-period-0908.log`. Its ephemeral container is
  `3c6b62f505e5` on port 56936; schema sync completed in 4.53s. Persistent QA
  56879 and operating 5433 remain untouched. Await this exact process to
  terminal; no concurrent provider capture, API restart, or web build.
- Browser screenshot/AX access to the existing QA window is currently
  unavailable after the managed collection window closed. Asked the user to
  display that existing window; authentication/recollection is no longer the
  current daily Ads prerequisite. Actual dashboard display remains unverified.

### 2026-09-08 09:04 KST — daily Ads dashboard display verified

- Existing Chrome QA tab 42038660 became accessible through native AX and
  screenshots. Closed only its collection modal; no collection was repeated.
- Month view rendered advertising spend 447,373 KRW and attributed revenue
  3,877,760 KRW. Set the existing date controls to 2026-08-25–2026-09-07 and
  used 조회. After queries settled, AX and screenshot both showed spend
  888,504 KRW and attributed revenue 7,788,780 KRW, matching the published
  14-day owner/API probe. The initial in-flight frame retained older values;
  acceptance uses the settled frame, not that transient frame.
- The daily Ads extension→owner→publication→dashboard amount path now has
  actual screen evidence. This does not prove campaign/keyword collection,
  positive ABC evaluation, or the remaining independent entrypoints.
- Full PostgreSQL session 20854 remains live. Its log now includes 4,000-row
  Rocket publication (4,154 ms), complete read (395 ms), and Wing finalization
  (1,000 products / 3,000 options / 1,000 media, 4,503 ms, 55 statements).
  These measurements are intermediate evidence, not a full-suite pass.

### Next independent Ads acceptance — campaign and keyword owners

- Read-only QA API inspection returned HTTP 200 / `MISSING`, with both
  `latestAttempt` and `latestComplete` null, for `/api/ads/ad-campaigns/source`
  and `/api/ads/ad-keywords/source`. These are genuinely unexecuted owners,
  not aliases of the completed daily KPI or profitability owner.
- The existing Dashboard readiness `광고 동기화` action invokes `useAdSync`:
  it reads the campaign owner, reuses a RUNNING attempt, otherwise admits one
  with an idempotency key, and sends `collectAdvertisingCampaigns` carrying
  that owner attempt ID to the installed extension. Its stated scope is the
  recent 31 days of campaigns and advertised products. It does not establish
  keyword-owner acceptance.
- After full PostgreSQL session 20854 terminates, exercise that existing
  campaign action once, preserving the completed daily/profitability data.
  Observe its exact owner and publication/Alert/consumer before starting the
  separate keyword journey. Do not dispatch while the heavy suite is active.

### Verification cadence clarification after user question

- Use focused regression and the relevant build/boot checks for each bounded
  QA fix. Do not restart the entire PostgreSQL suite after every small fix.
  Accumulate integrated changes and run the required full suite at the final
  acceptance boundary. This changes scheduling, not assertions, coverage,
  timeouts, or the requirement for a final full-suite pass.
- Keep already-live session 20854 running to terminal. Its intermediate report
  contains one failing Wing automatic-candidate/category test; its final stack
  is pending. Preserved the disposable PostgreSQL diagnostic log at
  `/tmp/kiditem-all-pg-dashboard-period-0908-postgres.log`. Observed reset and
  checkpoint delays are correlations, not yet a proven cause of that failure.

### 2026-09-08 — full gate terminal result and focused diagnosis

- Session 20854 terminated with exit 1: 100/101 files and 790/791 tests passed
  in 1,758.27 seconds. The sole failure is the Wing automatic-candidate test
  at `wing-rank-source.pg.integration.spec.ts:567`: a later owner admission
  expected HTTP 201 and received HTTP 502. This is an HTTP assertion failure,
  not a reported Vitest timeout. The response body was not included in the
  original assertion output, so its underlying cause remains unproven.
- Read the controller, owner begin transaction, and target-resolution path.
  No explicit 502/BadGateway branch exists in the advertising implementation
  or test helpers searched. That negative search is not proof of the cause.
- Started only the unchanged failing test on a fresh disposable integration
  DB, logging to `/tmp/kiditem-wing-rank-admission-focused-0908.log`.
  No timeout/assertion change, full-suite restart, persistent QA reset, or
  provider recollection was performed.
- Focused session 56110 terminated exit 0: the selected original test passed
  (4.27s test time, 25.75s including disposable setup, port 56938). The other
  eight tests were not selected by `-t`; no test was edited or disabled.
  This proves non-reproduction in this focused run, not resolution of the
  full-suite HTTP 502 or a full-suite pass. Preserve that failure for the final
  gate and add response diagnostics if it recurs. Continue independent real
  campaign QA instead of immediately rerunning the complete suite.

### 2026-09-08 09:27–09:29 KST — actual campaign source admission

- Clicked Dashboard readiness `광고 동기화` once. The owner admitted
  `f81f6a94-5f0b-45ae-b695-05fced0f29eb` at 09:26:51 KST for the configured
  advertiser, with the existing 31-day plan 2026-08-08–2026-09-07. Initial
  source read is `MISSING` with a RUNNING latest attempt and no COMPLETE
  pointer, correctly not presenting unfinished capture as current data.
- Existing installed extension opened managed Ads tab 42038767; browser
  inventory observed it inside campaign/group/product detail. The initiating
  Dashboard showed `동기화 중…`.
- After verifying the foreground tab was the initiating Dashboard, navigated
  only that tab (42038660) to `about:blank`. Preserved the managed collection
  tab and every completed daily/profitability source. Observe this same owner
  to terminal before judging initiating-page independence or starting a retry.
- At 09:30:15 and 09:31:11 the same owner remained RUNNING with 10 campaigns,
  24 rows and two raw-only campaigns. No COMPLETE pointer was published.
- API logs reveal receipt 6/7 writes returning 500 `COMMON_DB_ERROR` from
  Prisma P2028: the existing 5s transaction expired at account lookup and bulk
  raw/target inserts (observed elapsed 5.256–13.692s). Dashboard inventory
  reads also failed at that time. This occurred after the full PG run ended;
  test concurrency alone cannot explain it. No timeout was changed.
- A 09:32 host sample showed 15GB used, 78MB unused, 6.6GB compressed memory,
  load average 27.59 and 56.42% system CPU. Swapping also increased between
  samples. QA DB activity snapshots had no other client query at sampling
  time, which does not exclude an earlier wait. Host pressure is a correlated
  contributor to investigate, not a proven sole cause. Asked the user to close
  unused unrelated apps themselves; did not terminate user apps or QA services.
- At 09:34, the exact owner control retained receipts 0–6: dashboard discovery,
  two raw-only campaign receipts, one identified campaign, and its September
  7/6/5 daily receipts. The count of ten is discovered campaigns, not ten
  completed campaign sweeps. Managed tab 42038767 was absent from fresh browser
  inventory. Adapter inspection confirms transport-unavailable outcomes keep
  the owner RUNNING and close the capture tab for explicit same-attempt resume.
- Returned the existing QA tab to Dashboard and used `진행 확인·이어서 수집`
  once at about 09:35. The extension opened managed tab 42038778; API confirms
  the same attempt ID and retained 24 rows. No new owner attempt was admitted.
  Resume progress and eventual publication remain to be verified.
- At 09:36:54, the same attempt advanced to 120 rows and 19 receipts
  (last sequence 18, first identified campaign through 2026-08-24). This
  establishes same-attempt recovery beyond the failed receipt 7; it does not
  establish a root-cause fix or complete campaign publication. Navigated the
  verified initiating Dashboard tab back to `about:blank` after this progress
  sample, preserving the managed collection tab for departure-to-completion QA.
- At 09:38:38, after the second departure, the same owner reached 248 rows /
  35 receipts; its first identified campaign now has daily receipts through
  August 8 (the complete frozen 31-day range). Other campaign sweeps still
  remain. Read-only `/api/ads/campaigns?period=30d` returned zero rows while
  owner status remained MISSING with no COMPLETE pointer: staged partial
  campaign data is not leaking into the existing campaign consumer.
- At 09:39:48 the same campaign attempt was FAILED with 728 rows / 38
  receipts. The second identified campaign (`쿠팡윙 집중광고`) saved September
  7, then failed `date_picker_failed` on its next date selection. No new
  receipt-write P2028 appeared after the earlier 09:29 failures in the API log.
  Failure verification: source MISSING / latestAttempt FAILED / no COMPLETE,
  existing campaign consumer zero rows, and one matching OPEN campaign failure
  Alert linking to `/ad-ops`. Partial data stayed private.
- Began bounded date-picker diagnosis using magic-scraper. Local CDP 9222 is
  unavailable and existing Ads tab 42038564 reports `Debugger unattached`;
  no debug settings or new browser was created. Existing native Chrome UI is
  the available observation fallback. `setDateRange` can return false for
  calendar interaction, displayed-date confirmation, or page-one reset; the
  generic failure alone does not distinguish these. No speculative fix or
  new campaign attempt has been made.

### 2026-09-08 — provider API investigation and remaining PG diagnostic

- User authorized analyzing Coupang read APIs and replacing existing collection
  retrieval where the required data is available. Proposed an extension-local
  campaign transport replacement preserving owner attempts, frozen periods,
  complete publication and failure alerts; implementation design confirmation
  is pending. This does not restore server-side Coupang OpenAPI integration.
- Observed the existing Ads tab through native Chrome DevTools Network after
  read-only navigation to campaign 104640375. Its
  `tetris-api/campaign/104640375/integrated-edit-target` request returned 302
  to `/user/login`, whose response was 200. A rendered dashboard therefore
  does not establish this API session is usable. Requested the user's normal
  login check and closed DevTools. This observation does not establish the
  cause of the earlier `date_picker_failed`; no new collection was started.
- Added response diagnostics to the previously failing automatic-candidate
  admission loop in `wing-rank-source.pg.integration.spec.ts`: keyword,
  candidate index, status, parsed body and bounded response text accompany the
  unchanged required HTTP 201 assertion. No retries or timeouts were added.
  Main correctness and ponytail review removed unnecessary body-shape branching.
- At 10:42 KST, session 15619 ran the entire Wing rank PostgreSQL test file on
  its own disposable database at port 56940: 9/9 passed, exit 0, 30.70s total.
  Five-page terminal storage measured 73ms, exact read 14ms. Diff check passed.
  This remains non-reproduction of the prior full-suite 502, not a root-cause
  fix or a replacement for the required full-suite pass. No production code,
  persistent QA database, runtime configuration or provider data was changed.
- Started the next required full PostgreSQL gate after the diagnostic change,
  session 62855, log `/tmp/kiditem-all-pg-admission-diagnostic-0908.log`.
  Its live disposable container is `ce8813c0fce0` at port 56942, separate from
  persistent QA 56879 and operating 5433. No other integration-test container
  was present before admission. Preserve this run until it is terminal; do
  not restart it on an observation timeout or treat setup as a passing gate.
- User confirmed Ads login remains active. Fresh browser inventory and a
  screenshot show campaign 104640375 / group 205034227 product detail with
  vendor A00057379 and actual September 1–7 metrics. The earlier redirect was
  a request-specific observation, not evidence of a global login outage;
  login is no longer a blocker and no further login was requested.
- Network observation on that page confirms successful `cmg-api/vendoritems/rawPiv`
  requests, but their role is not yet proven to be daily performance capture.
  The first-party JavaScript loaded by the observed GroupsTable bundle exposes
  a `tableMetric` request accepting campaign/group/ad/vendor-item IDs, start/end
  and tableType. Static code establishes request construction only; it does not
  prove campaign/product tableType values, response coverage or daily totals.
  Do not replace the collector on this evidence alone. Native Chrome control
  intermittently returns only a menu tree and direct tab observation reports
  `Debugger unattached`; asked for a menu dismissal, not reauthentication.
- Recovered native Network observation and exported only the two filtered
  `tableMetric` requests through Chrome's sanitized HAR export to
  `/tmp/kiditem-campaign-product-metrics-0908.har`. Readback confirms exactly
  two entries, zero Cookie/Authorization request headers and zero request
  cookies. Keep this account-specific development evidence out of git.
- Both observed POSTs returned 201 JSON with `tableType: product_sales`,
  campaign 104640375, group 205034227, ten ad IDs in `targetList`, and inclusive
  KST-midnight date inputs September 1 and September 7. Each response contains
  exactly those ten IDs; no requested ID is missing. First-page spend,
  revenue, clicks and impressions match the visible ten product rows
  (sums 12,289 / 42,770 / 39 / 11,030). These are not the campaign-wide totals.
  The endpoint therefore provides usable product metrics for the observed
  seven-day page, but daily queries, full roster enumeration/ID mapping and
  complete campaign aggregation remain unverified. No collector code or
  canonical data was changed and no replacement completion is claimed.

### 2026-09-08 Aside internal-query API verification checkpoint

- User approved replacing verified browser UI/DOM capture paths with the site's
  observed internal read APIs, preserving the existing extension/login session.
  Priority: advertising performance, Wing catalog list/detail, sales/traffic,
  item winner, Rocket PO detail. Existing API paths must not be replaced twice.
- Main owns contract review/integration/QA; implementations use Luna/max agents.
  Verification must cover fields/IDs, date boundaries, complete pagination,
  missing/duplicate rows and true zero/empty versus authentication failures.
  Preserve source attempts/resume, partial isolation, atomic publication,
  Alerts, consumers and existing QA data. No commerce/configuration writes.
- Aside's new read-only observation probe reported zero accessible advertising
  and Wing tabs, including its `chrome.tabs.query()` check. It cannot observe
  the separate Chrome session in its current configuration. No live request or
  response was analyzed by Aside. Chrome was not simultaneously manipulated.
  No cookies were copied, new login initiated or permissions changed.
- No collector replacement was made at this checkpoint. Advertising has only
  the earlier ten-row Chrome evidence above; the remaining four collector
  families have no new Aside verification. Further Aside observation requires
  user direction on session access or approval to use existing Chrome evidence
  instead. This is not completion of any collector or the whole hard cutover.

### 2026-09-08 Aside CLI observation (supersedes the access blocker above)

- User confirmed the installed CLI and directed `aside repl`, with no further
  installation/configuration. `listBrowserTabs()` and `attachBrowserTab()`
  connected to the existing Aside Ads/Wing tabs; their logged-in pages were
  checked independently of Chrome. Only this CLI controlled the browser.
- Ads: observed report-list GraphQL POST and its actual body, then the existing
  chart-report GET with browser credentials. Report 14982363 advertises
  September 1–7 but returns 563 NDJSON rows for September 1–6 only. Six daily
  impressions/clicks/spend/14-day revenue sums match the chart UI. Composite
  keys have no duplicates; 346 zero-spend rows are real. September 7 coverage
  remains unproven, not zero. The profitability collector already calls this
  API, so no duplicate replacement is warranted.
- Wing: observed POST `/tenants/seller-web/v2/vendor-inventory/search`, including
  the site's exact JSON search body. Response is `{success:true,data:
  {productList,pagination},message:null}`. Browser-cookie replay of all 26 pages
  returns 1,254 unique product IDs (25 × 50 + 4), all vendor A00057379. Page 3
  IDs match the screen in order. Page 4 names, representative images and
  ON_SALE/SUSPENDED/REJECTED labels match; page 1 confirms PARTIAL_ON_SALE.
- An unmatched search gives HTTP 200, `success:true`, no rows and pagination
  `{page:1,countPerPage:50,totalCount:0,totalPages:0}`, matching the UI's zero
  result. The same read without credentials, with redirects not followed,
  returns `opaqueredirect`/status 0/`ok:false`, not a valid empty page. Existing
  login remained usable afterward. No cookie/token values were read or copied.
- CLI CDP response events, `Network.getResponseBody` and request-post-data
  retrieval worked for Wing. Direct request-event subscription yielded no
  events in this probe. A temporary page-load fetch observer established the
  exact POST method/body; its new-document registration was removed afterward.
- Approved bounded implementation: replace Wing discovery-page navigation/DOM
  parsing with that fixed internal search API inside the existing extension
  session. Preserve permit, manifest/fingerprint, chunk, resume, source owner,
  detail hydration and terminal contracts. Keep image host and Korean sale
  status normalization compatible with the observed old discovery output.
  Reject malformed/auth/partial pages; do not silently publish an empty full
  catalog or invent zero data. Luna/max implements; main integrates/tests.
  Detail, sales/traffic, winner and PO analysis remain in progress. No runtime
  replacement or end-to-end completion is yet claimed.

### 2026-09-08 Aside request-parameter and coverage evidence

The user additionally authorized varying read-only API request values, with
direct-browser observation reserved for items that Aside CLI cannot analyze.
These are provider observations, not owner publication receipts. All requests
ran in the existing browser session; no backend direct provider calls, commerce
writes, subscription changes, cookie exports, or QA-data mutations were made.
Temporary observers were removed before leaving their pages. Sales requests
used the site's XSRF cookie inside the page for its existing header; the token
value was neither returned nor persisted.

| Source | Observed read interface | Parameter / completeness evidence |
| --- | --- | --- |
| Wing discovery | POST `/tenants/seller-web/v2/vendor-inventory/search` | `countPerPage=100` works; 1000 is clamped to 500. Three pages at the returned size contain 1,254 unique product IDs, matching the earlier 26-page sweep. Keep the approved production size 50 and manifest contract unchanged. |
| Sales analysis | POST `/tenants/rfm-ss/api/business-insight/vi-detail-search` | Zero-based `pageNumber`; sizes 20 and 100 work, 101 and 1000 return 400. September 1–6 yields 266 unique vendor items over 100 + 100 + 66 rows. |
| Item winner | POST `/tenants/seller-price-management/getProductList` | Zero-based request `page`, but every observed response reports `page:0`. Size 100 works; size 1000 returns all 747 unique currently-on-sale items in one response. The 38-page, size-20 sweep has 747 rows but only 723 unique IDs. |
| Rocket PO list | GET `/po-web/app/purchase-order/list` | One-based `page`; adding `pageSize=100` is ignored and returns size 50. September 8–October 8 expected-inbound scope yields 311 unique POs in seven pages, representing 886 SKU lines according to list metadata. |
| Rocket PO detail | GET `/scm/purchase/order/get/:observedPoId` | The actual detail link returns rendered HTML containing SKU rows. No separate SKU JSON request was observed after navigation. The existing collector already uses this read, so there is no verified JSON replacement. |

#### Wing scope and field distinctions

- The unfiltered, non-deleted catalog contains 507 `ON_SALE`, 706 `SUSPENDED`,
  29 `PARTIAL_ON_SALE`, and 12 `REJECTED` rows. `displayDeletedProduct=true`
  changes the total to 1,586 and must not leak into the frozen collection scope.
- A request filter is not a direct equality filter on returned `productStatus`:
  `ON_SALE` returns 540 rows, including 29 partial-sale rows; `SUSPENDED` returns
  742 rows, also including those 29 partial-sale rows. Do not add these filter
  counts or substitute dashboard card counts for the unfiltered manifest.
- An unmatched keyword returns a valid empty first page. Page 27 of the
  26-page unfiltered size-50 list returns no rows but retains total 1,254 and
  totalPages 26; it is an out-of-range request, not an empty account.
- Product detail still has the site's embedded `appData.oSellerProduct` JSON,
  which the existing detail extractor already parses. A sample's identity,
  option price and media fields match the edit screen without submitting it.

#### Sales / traffic distinctions

- September 1–6 item sums match the same-period vendor-summary API exactly:
  1,065 visitors, 1,391 page views, 170 adds to cart, 58 orders, 173 units,
  and KRW 363,200 GMV. The earlier September 2–8 sweep has 248 unique items,
  with all six KPI totals matching its screen and summary API.
- Freshness metadata reports both `TRAFFIC_DAILY` and `SALES_DAILY` complete
  only through September 6, while hourly sales include September 8. September
  7–8 traffic zeros must not be published as final zero traffic. Do not shorten
  an owner-issued period silently to make the request appear complete.
- September 7 alone returns seven items, including two negative sales rows;
  its totals are 2 orders, -9 units and KRW -50,540 GMV. Preserve signed metrics.
- `includeSoldVICount=false` returns `soldVICount:null`, not zero. RFM-only
  September 1–6 returns a valid zero-item result for this account.
- Reversed dates also return HTTP 200 and an empty result. Date validity must
  be checked before accepting empty evidence. An out-of-range page retains its
  nonzero total and totalPages, unlike the price and PO endpoints below.
- The separate traffic-analysis page is subscription-gated for this account.
  No trial, purchase, or gated-API bypass was attempted. The existing Wing
  traffic collector actually consumes sales-analysis metrics, not that paid
  traffic-analysis page. Its old hashed DOM container is absent in the current
  sales UI; an API replacement needs the freshness and field contracts above.

#### Item-winner distinctions

- The initial UI filter is `LOSE_NOT_SUPPRESSED` (27 items). Selecting the
  actual UI's All option sets `itemWinnerStatus:ALL` but still retains
  `vendorItemStatus:ON_SALE`; this is not the full registered-product catalog.
- The all-item response matches cards only with suppression handled explicitly:
  718 rows have `winnerStatus:true`, of which 18 are suppressed. Thus 700 are
  visible winners, 20 are suppressed, and 27 are nonsuppressed losers.
- Names, current prices and 30-day sales quantities of all 20 visible rows
  match the one-response 747-item result. The earlier loser sample separately
  confirms current price, winner price and recommendation are distinct values.
- Page 38 at size 20 and an unmatched product name both return totalSize 0,
  totalPages 0, page 0 and pageSize 10. Empty response metadata alone cannot
  prove an empty account or successful traversal.
- The current DOM parser uses substring `아이템위너` to decide winner status
  (also matching `아이템위너 아님`) and positional currency matches for prices.
  Those rules do not faithfully represent the observed API/UI contract.
  Replacement remains pending explicit handling of unique coverage and status
  meaning; the successful large-page probe is not a universal size guarantee.

#### PO distinctions

- Actual status metadata includes RP, MP, PA, RI and CI. In the observed
  expected-inbound scope, RP=265, PA=34 and RI=12; CI and MP are valid zero
  results. These counts agree with the unfiltered 311-PO sweep.
- September 8 alone gives 2 POs by `PURCHASE_ORDER_DATE`, versus 44 by
  `WAREHOUSING_PLAN_DATE`. Provider timestamps require the established KST
  business-date conversion.
- `purchaseOrderIdArray` can override the supplied date range: an observed PO
  expected September 9 is still returned with a September 10-only range when
  its ID is supplied. Verify returned dates against the frozen owner scope.
- Page 8 beyond the seven-page list returns zero total/pages. Preserve the
  initial manifest and do not replace it with that empty-page metadata.
- Detail samples for PA (13 SKUs), RP (1 SKU), and RI (8 SKUs) match each
  list row's SKU count, ordered quantity and ordered amount. Ordered quantity
  and vendor-confirmed quantity differ and must not be conflated. No full
  886-line detail sweep or extension-to-owner E2E is claimed here.

#### Verification boundary

The previously running full PG diagnostic has ended with exit 1: 96/101 files
and 785/791 tests passed; five files and six tests failed, including database
reset/lock and hook-timeout failures. No database reset or rerun was initiated
as part of this browser analysis. Wing discovery implementation still requires
main review, its regression gates and real extension-to-owner verification.
The overall hard cutover remains incomplete.

#### Advertising follow-up after parameter testing

- Reloading the existing report tab temporarily led to the provider login
  screen. Following the actual Wing menu's `/relay/wing/home?from=WING_LNB`
  link restored the existing advertiser session without credential entry or
  cookie copying. Vendor identity was checked again. Aside CLI remained the
  sole browser controller; no direct-browser fallback was required.
- The actual sales dashboard uses POST `/marketing/tetris-api/campaigns`,
  POST `/marketing/cmg-api/tableMetric`, and POST
  `/marketing/cmg-api/report/SALES`. The latter two are observed read requests
  returning HTTP 201; they are not report-creation or campaign-mutation calls.
- The current non-deleted sales-campaign UI scope has 10 unique campaigns.
  Pagination size 5 returns two disjoint five-campaign pages with the correct
  `hasNextPage` boundary; size 100 returns the same ten. Page 2 at size 5 is
  empty but retains totalCount 10. `isActive:true/false` partitions 3/7;
  unmatched names return totalCount 0. `operatorTypes:[]` also returns zero
  and must not be confused with an unfiltered roster.
- `tableMetric` uses `tableType:campaign_sales`, explicit `campaignIds` and
  `targetList`, with KST-midnight epoch milliseconds for `start` and `end`.
  Equal September 7 start/end includes that full business day: KRW 65,250
  delivered cost and KRW 563,630 attributed sales. A single explicit campaign
  returns only its ID. Empty ID arrays unexpectedly return three performance
  campaigns and the account's full cost/sales totals, not an empty result.
- For September 1–7, the ten-campaign metric sums, seven-day summary response,
  and UI all agree: 1,106,210 impressions, 3,083 clicks, KRW 447,373 delivered
  cost, KRW 3,877,760 attributed sales, 368 attributed orders and 474 units.
  This does not prove historical/all-report campaign coverage: the report
  selector's same-period GraphQL `getCampaignList` returns 48 IDs. Do not
  substitute the current UI roster for a historical report manifest.
- The existing report-list GraphQL query accepts pageSize 100 and returns
  all 66 unique completed reports within duration 90. Duration 30 returns 25;
  `onlyScheduledReport:true` returns zero. Its out-of-range second page retains
  total 66. No report was generated, scheduled, modified, or downloaded for
  confirmation.
- Re-reading the existing chart-report still returns 563 NDJSON rows for
  September 1–6 only, with three campaign IDs and both Retail/3P rows. Live
  dashboard values are not interchangeable with this saved report: September
  6 is cost 64,647 / attributed sales 403,320 in the live summary versus cost
  64,655 / 14-day direct-plus-halo sales 349,720 in the chart report. The cause
  of the difference is not established; do not silently reconcile or replace
  one source with the other. Missing September 7 remains missing report data.
- Existing code already uses the campaign-roster API for the keyword sweep,
  `tableMetric` for keyword metrics, and chart-report for profitability.
  These observations are not authorization to duplicate those integrations or
  substitute campaign-level metrics for product/keyword evidence.

Main review restored readiness checks for recreated/loading or navigated-away
discovery tabs without reintroducing navigation on each healthy API page. The
request timeout remains active through response-body consumption; an HTML 503
is a provider error rather than a login prompt. Registered names retain the
legacy internal-whitespace normalization, and the duplicate status allowlist
was removed in favor of the existing exhaustive status conversion.

After these final review fixes, the complete extension test command passes
**869 tests, zero failures**. Adapter sync, modified-script/service-worker syntax,
manifest JSON parsing and diff checks pass as well. Real unpacked-extension
owner persistence and completion/failure/UI E2E remain unverified for this new
discovery API delta; the separate full-PG failures above remain unresolved.

### 2026-09-08 — approved read-API replacement follow-up

The user approved further verification and implementing the recommended
replacements. This is a bounded provider-read transport change within the
existing Coupang extension/source-owner interface, not a new state authority.
Main owns contract review, integration and QA; Luna/max implements. KID-33
remains In Progress and PR #493 remains OPEN against develop. Existing unrelated
changes, QA data, owner fences, partial isolation and publication stay intact.

- Traffic: repeated September 1–6 at size 100 returns 100 + 100 + 66 rows,
  266 unique vendor items, and exact six-field detail/summary/UI agreement.
  Nine returned options have genuine zero values for all six totals. The
  source must retain them instead of the old positive-metric DOM filter.
  `pvToOrder` is a fraction (0.5 appears as 50.00%); variance fields are
  signed percentages. `inventoryId`, not the API's SDP `productId`, remains
  the legacy product matching key. The option display name is `itemName`.
- Freshness changed during this later observation: SALES_DAILY now covers
  September 7 while TRAFFIC_DAILY still covers September 6. Both must cover
  the frozen period; subscription status alone does not gate sales analysis.
  Credentials omitted from the detail request produce status 0 /
  `opaqueredirect`, not valid empty data. The optional advertising summary
  is not in the two verified traffic JSON responses; retain its existing
  separate DOM read instead of substituting different advertising metrics.
- Itemwinner: two independent page-zero requests at size 1000 each return
  747 unique IDs with identical sets. An eight-page size-100 traversal has
  747 rows but 741 unique IDs, missing six products. The approved collector
  must require complete unique coverage; it must not silently deduplicate
  this into success. Until a safe larger traversal is observed, a result
  exceeding the verified single-page capacity fails explicitly.
- All 20 visible All-filter rows match API names, current prices and
  `myViSales` (30-day quantities). `myRecentSales` is a different period.
  `myViSales:""` occurs on 326 products; three such products on the actual
  suppressed screen display `0개`. Only that observed empty-string encoding
  may become zero, not missing fields. Current, winner and recommended prices
  remain distinct: a loser sample has 56,000 / 44,000 / 43,850 respectively.
- All 20 suppressed-screen IDs match API `suppressed:true`; 18 also have
  `winnerStatus:true`. Visible winners are 700, suppressed products 20 and
  nonsuppressed losers 27. Preserve suppression separately and do not label
  suppressed rows as visible winners. Omitted credentials redirect; an
  unmatched product name yields a valid first-page zero result whose returned
  page size is 10 even when the request asked for 1000.
- The old worker itemwinner URL `/tenants/seller-web/seller-price-management`
  actually displays a not-found page without changing its URL. The observed
  current menu path `/tenants/seller-price-management`, with or without
  `?rf=menu`, opens the populated page. Correct new admissions only; do not
  relabel an old attempt's frozen URL or weaken exact URL validation.
- Advertising: all ten current roster campaigns have one group. Eight manual
  groups return 8/29/36/1/13/11/4/40 ads, exactly matching each roster count,
  with unique ad IDs and vendor item IDs. Two AUTO_SELECTION campaigns have
  roster counts 1109/349 but `adGroup.ads:[]`; those are not proven empty.
  Preserve the existing metadata-only handling rather than fabricating facts.
- The actual product screen requests `tableType:"product_sales"`, explicit
  `campaignIds`, `adGroupId`, `targetList`, `creativeId:null`,
  `isMatchTypeEnabled:false`, and inclusive KST-midnight start/end values.
  September 7 requests for all eight manual groups return every requested key,
  including explicit zero metrics. Empty/missing keys must not be imputed.
- For campaign 104640375 / group 205034227, all 29 UI product rows match
  six API metrics on September 7, September 6 and August 8. The latter dates
  were actually selected in the UI, including the 31-day range's first day.
  August 8 totals are cost 14,020, sales 0, impressions 9,158, clicks 36,
  units 0 and orders 0. All 31 daily API requests for August 8–September 7
  return exactly the same requested 29 ad IDs without failed/missing days.
- September 1–7 daily product metrics sum exactly to the same-period product
  API: cost 106,226, sales 97,950, impressions 51,020, clicks 344, units 29,
  orders 8. The campaign summary screen shows cost 106,212; do not substitute
  that different-grain amount for product facts or silently adjust the gap.
  API group metadata lacks some displayed serving-status details, so the
  remaining row-contract review precedes any advertising production swap.

These are read-only provider observations, not owner publication receipts.
Wing transport implementation and review are underway; no new extension test
pass or real extension-to-owner E2E is claimed at this checkpoint. Temporary
browser observers were restored; the Wing analysis tab was replaced by a clean
same-session tab to remove a surviving preload from an interrupted CLI session.
No provider commerce writes, report creation, subscription change, cookie
export, QA-data reset, commit, push, merge or deployment was performed.

### 2026-09-08 — installed extension and service-entrypoint checkpoint

- Wing traffic and itemwinner read-API transports are implemented. Before the
  terminal-route correction below, the full extension suite passed 882 tests;
  adapter sync, worker syntax, manifest parsing and diff checks also passed.
  Those checks are not end-to-end publication evidence.
- Actual installed-extension itemwinner sync admitted an owner attempt at
  06:20:31 UTC. Its completion POST omitted `/attempts` and returned HTTP 404.
  At 06:26 UTC the attempt remained running with zero published rows and no
  itemwinner snapshot. A focused terminal-path correction and controller-path
  regression are now implemented: the wire base includes `/attempts`, and
  exact complete/fail path, fenced body and retry regressions pass. The full
  extension suite passes 883 tests; main reran the owner suite (6/6). Actual
  installed-extension reload and terminal readback remain pending; no success
  or failure terminal is claimed.
- User explicitly requires checks initiated from the KidItem service UI.
  The actual local dashboard shows Wing traffic as uncollected. The readiness
  modal's itemwinner-rank action starts keyword rank, not price itemwinner;
  it cannot stand in for the itemwinner transport test.
- Static service-path inspection identifies a traffic initiation gap:
  `dashboard-sales.service.ts` returns `needsScrape:false` on the Wing branch
  and omits it otherwise, while dashboard `page.tsx` requires truthy
  `trafficKpi.needsScrape` before starting collection. Thus this automatic
  entrypoint is inactive for the current response contract. It remains
  unresolved and is not covered by extension unit-test success. No synthetic
  browser helper invocation or DB mutation is used to claim service-UI E2E.
- Outstanding: corrected installed-extension terminal/publication and consumer
  readback; traffic service initiation decision and E2E; remaining advertising
  API contract verification. Plan stays ACTIVE and KID-33 stays In Progress.

### 2026-09-08 — direct reload and itemwinner publication verified

- User authorized direct extension reload after configuring Chrome DevTools
  MCP 1.8.0. The same installed package's CLI connected with `autoConnect`,
  extension tools enabled, statistics/CrUX disabled and header redaction on.
  Only KIDITEM OS `kfionjdklijcjedgfmcfbjadlfmobdcg` was reloaded. A read-only
  check of the loaded worker resource confirmed the corrected terminal path.
- Normal extension UI retry resumed the original itemwinner attempt. Its
  provider read timed out and the owner recorded `FAILED/WING_REQUEST_TIMEOUT`
  with no snapshot. Thus failure terminal delivery now works; no successful
  capture is inferred from that retry.
- A new normal UI retry admitted `db41c4ce-ba0c-4d72-8ac0-4c392597382b` at
  06:49:48 UTC and completed at 06:50:16 with 747 rows and one snapshot. The
  popup showed owner completion. The actual KidItem `/ad-ops` page displayed
  the same current-state counts: winner 700, suppressed 20, nonwinner 27;
  observation 15:50:13 KST, collection 15:50:16 KST, raw snapshot count 1.
  Its 506 observed listings out of 1,225 are matched listing-grain coverage,
  not the provider option-row count. This verifies extension-initiated
  publication and service consumption, not a service-initiated price action.
- The popup summary still shows itemwinner as never synced: it reads the
  legacy local `kiditem_last_sync_*` keys rather than owner publication.
  Correcting that consumer and the service initiation gap requires the
  separate bounded UI design; no new UI behavior has been implemented here.
- Traffic normal UI run `41b43d01-e174-44ad-aa40-a37c29ed7661` requests the
  previously verified September 1–6 range. Actual Wing UI shows 266 options,
  visitors/views/cart/orders/units/GMV 1065/1391/170/58/173/363200. Its
  metadata, three detail pages and summary all returned 200 on three
  transport retries, but the owner stayed running with zero staged snapshots
  and the popup reported `SOURCE_OWNER_UNAVAILABLE`. The traffic wire has
  the same missing `/attempts` base for receipt and terminal requests;
  correction and exact controller-path regressions are in progress.
- No QA reset, provider business mutation, commit, push, merge or deployment.
  Existing advertising/whole-system verification remains incomplete.

### 2026-09-08 — traffic transport complete; consumer arithmetic fails QA

- Traffic wire base now includes `/attempts`; exact receipt PUT and complete/
  fail POST path, token, body and retry regressions pass. Full extension suite
  is 884 passed, zero failed; main reran the owner suite (7/7). Adapter sync,
  worker syntax, manifest parse and diff checks pass. Main directly reloaded
  the same installed extension again and retried through its normal popup.
- The original traffic attempt `41b43d01-e174-44ad-aa40-a37c29ed7661` resumed
  without reset and completed at 07:02:22 UTC. Its 266 rows contain 266 unique
  option IDs, including nine all-zero rows. Stored sums exactly match the
  September 1–6 Wing UI: visitors 1065, views 1391, cart 170, orders 58,
  units 173, GMV 363200. The popup confirms source-owner completion; the
  stale local summary cards remain a separately identified consumer defect.
- Actual KidItem dashboard September 1–6 inputs and its matching sales API
  request were verified. It displays visitors 997, views 1297, orders 49,
  units 154, not the complete source totals. This is a failed consumer QA
  gate, not an API capture failure. No transport-only end-to-end success is
  claimed for traffic.
- Read-only reconciliation explains the loss: 252 of 266 option rows match
  listings (matched sums 1044/1364/161/53/165/346110). Their 237 listing
  projections sum to 997/1297/149/49/154/317520, exactly the dashboard values.
  `AdTrafficSourceRepository.publishFacts` updates the same listing/date for
  each option rather than combining options. `readPublished` excludes
  unmatched options; the dashboard adapter prefers these listing rows to the
  complete account summary whenever any listing data exists.
- Range handling also fails: the real September 1–3 dashboard API request
  returned 200 and its UI still showed the same six-day traffic values.
  The source projection stores the aggregate under `plan.startDate` and the
  reader filters that anchor rather than validating the requested interval
  against the aggregate's coverage. Do not reinterpret a period aggregate as
  daily facts or silently impute missing dates. The UI was restored to the
  verified September 1–6 interval after this read-only check.
- Itemwinner's earlier timeout Alert is visibly marked resolved after its
  successful retry. Its complete 747-row capture and 700/20/27 service counts
  remain unchanged during traffic work.
- Additional implementation is paused for design approval: correct option to
  listing aggregation, account-level summary selection and interval coverage
  semantics; then address service initiation and popup status surfaces. These
  are beyond the approved transport-only correction. No DB repair/backfill,
  schema change or new UI behavior is authorized by this checkpoint.
  ACTIVE / In Progress remains; no commit, push, merge or deployment.

### 2026-09-08 — approved daily performance contract; implementation resumed

- User's side conversation approved nine daily/period/metric/control decisions
  and explicitly handed implementation to the main task. This supersedes the
  preceding design-approval pause, not the outstanding verification failures.
- Active supplemental spec:
  `../specs/2026-09-08-coupang-daily-performance-contract.md`.
- Affected interface owners: Advertising (facts/receipts/publication), extension
  (capture/transport), Analytics (read arithmetic/coverage), Web (explicit
  initiation and source status). Preserve existing ownership; no unrelated
  domain cleanup. Reuse existing source-owner persistence before considering
  a schema change; raw old period evidence is not backfilled into daily facts.
- Linear decision/start comment `e8edf58c-1562-4bee-a3e9-d269b946183a` was written
  and read back. KID-33 stays In Progress; PR #493 is OPEN targeting develop.
- [x] Freeze daily receipt/read contracts and evidence-version handling.
- [ ] Implement owner daily/account/option isolation and latest complete daily
  replacements, with coverage and per-metric reconciliation.
- [ ] Implement daily browser capture and same-owner explicit service/popup
  controls; retain existing resume/fence/terminal behavior.
- [ ] Update Analytics ratios, daily UV/average and incomplete-period display.
- [ ] Apply only necessary ad-range/provenance/coverage corrections; rolling
  observations remain non-additive and no scheduler is added.
- [ ] Run focused/full applicable gates and actual provider/extension/service
  QA; keep unverified or mismatching metrics restricted.
- Main Codex integrates/reviews/tests; Luna/max agents implement scoped files.
  The writing-plans skill is unavailable in this session; this existing ACTIVE
  execution plan records the implementation steps for the approved design.
  No commit/push/merge/deployment or QA data reset is performed.

### 2026-09-08 — main verified single-day account originals vs period

- Main exclusively used the existing authorized Wing investigation tab,
  ordinary sales-analysis navigation and read-only captured network responses.
  Side investigation was asked not to manipulate the browser concurrently.
  No direct provider business write or server OpenAPI call was made.
- Each date used the actual page's `vendor-summary` request with equal
  `startDate`/`endDate`, `registrationTypes: [NORMAL, RFM]`, `searchIds: []`.
  Screen values and response `summaryMetrics` matched on all six dates.

| Date | Daily visitors | Views | Cart | Orders | Units | GMV | Provider CVR % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-01 | 155 | 211 | 20 | 6 | 19 | 21790 | 2.85 |
| 2026-09-02 | 148 | 194 | 29 | 15 | 22 | 50910 | 7.74 |
| 2026-09-03 | 192 | 273 | 27 | 10 | 51 | 134070 | 3.67 |
| 2026-09-04 | 160 | 215 | 22 | 7 | 35 | 49480 | 3.26 |
| 2026-09-05 | 248 | 293 | 46 | 17 | 42 | 92980 | 5.81 |
| 2026-09-06 | 162 | 205 | 26 | 3 | 4 | 13970 | 1.47 |

- Fresh September 1–6 period request/UI returned views 1391, cart 170,
  orders 58, units 173, GMV 363200. Each equals the six daily account sums.
  September 4–6 period 713/94/27/81/156430 also matches those three days and
  complements the side-observed September 1–3 period.
- Daily visitors average 177.5 over six fully observed days. The fact that
  this sample's visitor sum also equals the provider period value 1065 does
  not establish a period-unique deduplication rule; no such feature is added.
- Provider ratio provenance matters: September 1 summary/UI `pvToOrder`
  is 0.0285 (2.85%), while its `conversionSummaryByDate` NORMAL row says
  0.0284 and 6/211*100 = 2.8436019... . September 2 similarly differs between
  summary 0.0774 and date array 0.0773. Preserve raw summary ratios and compute
  own ratios from verified integer numerator/denominator; do not average or
  overwrite provider ratios. Six-day own CVR is 4.169662...%, provider 4.17%.
- Period response contains three date/registration-type arrays. They are
  retained as raw evidence, not summed across registration types to invent
  account UV/orders. Direct single-day account summary remains the capture
  source. The investigation tab was restored to September 1–6.
- This verifies the sample's account daily/period arithmetic and date path,
  not new extension v2 publication, option pagination for every day, absent
  date behavior, all historical filters, or ad attribution semantics. Those
  gates remain pending implementation and runtime QA.

### 2026-09-08 — integration review checkpoint

- V2 shared wire distinguishes `daily_page` from `period_summary`, preserves
  `capturedAt` and checksums in ACKs, and keeps legacy v1 parsing separate.
  Account daily rows are flat six-metric records; option daily evidence retains
  nullable matches. The initial shared contract suite passed 3/3. Additional
  owner validation and replay regressions remain pending.
- Explicit dashboard control suite passed 35 tests across 13 files; focused
  owner/control tests passed 7. Review requested post-admission range-race
  checks, nullable metric UI and coverage/provenance display before acceptance.
- `check:idor` and `check:tenant-scope` passed. They will be rerun after the
  remaining owner/consumer changes.
- Read-only QA inspection at 08:20 UTC preserved existing itemwinner source
  checksum `f14dba1ea50a712fefb9025ff8b620c3d6ca4c735a292fac5b7519f2f3977836`
  and legacy traffic snapshot checksum
  `b836a32f84ace504bda4d2728336cb6622145a121304b0f628879223adf5abe3`.
  Existing 747-item winner result and 266 traffic originals were not changed.
- Main stopped its own QA API watcher during cross-layer edits to avoid
  repeated compilation against intermediate shared types. QA PostgreSQL and
  source evidence remain intact. Restart plus zero-error Nest boot is required
  before the next end-to-end capture.
- Linear checkpoint `4f016ca0-8446-47f0-98e1-cb6889ec34a3` was written and read
  back. No end-to-end v2 completion, commit, push, merge or deployment is claimed.

### 2026-09-08 — daily contract regression integration

- Main reran the complete extension suite: 898/898 passed. Generated adapter
  synchronization, worker syntax and manifest JSON checks also passed.
- Four affected Traffic/Products/Ad strategy consumer suites passed 18/18.
  IDOR and organization-scope scanners passed. Shared package build passed;
  another final build is required after the remaining shared changes settle.
- Expanded account-ad PostgreSQL coverage caught a real v1 finalize regression:
  v2 normalized validation rejected a preserved v1 row without metric evidence.
  Validation now follows the frozen parser version; no legacy proof or hashes
  are rewritten. Main reran the disposable PostgreSQL suite: 10/10 passed,
  including v1 resume/replay, strict v2 evidence and invalid-row filtering.
- Listing traffic projection metadata now identifies its current writer with
  `traffic.currentSource`. CSV and Wing raw evidence/namespaces are retained;
  conflicting pre-marker namespaces are not guessed. CSV remains a listing
  source, not an account-total fallback. The settings upload explains that
  account-wide Wing metrics require separate explicit collection.
- Review requires all account advertising surfaces, including monthly and
  selected-range totals, to preserve missing-date coverage instead of falling
  back to positive linked-listing/order totals without account coverage proof.
  Preset cutoffs use the closed KST day, never the last observed row; custom
  ranges remain exact. Missing comparison periods and chart months remain
  unavailable rather than zero.
- Main reloaded the verified existing KIDITEM OS unpacked extension. The Wing
  investigation tab still shows the authorized September 1–6 sales-analysis
  page. No v2 attempt has yet been admitted in the preserved QA database.
- Main paused its own local QA web/API development processes to reduce build
  contention. PostgreSQL, provider login and existing source originals remain
  intact. Fresh boot, web build and actual v2 extension-to-service verification
  are still required; this checkpoint is not a runtime acceptance or release.

### 2026-09-08 — integrated daily runtime admission

- Shared daily traffic/account-ad contract suites passed 11/11. The final
  shared build passed after nullable dashboard chart contracts were included.
- Main's disposable PostgreSQL Wing suite passed 12/12, including daily
  replacement, preserved CSV-current values, failed replacement isolation,
  scope fencing, terminal replay and committed expiry/identity failures.
  Fixture corrections preserved the distinction between account summaries
  and option/listing projections; runtime behavior was not changed to make
  those distinct grains equal.
- Dashboard Sales/Ad/Trend PostgreSQL suites passed 18/18 after aligning Wing
  presets to completed KST business dates. Orders/Sellpia date ownership is
  unchanged. Complete current-month fixtures end at the last closed date,
  rather than fabricating future zero rows. Missing profit remains unavailable.
- Web production build passed, including TypeScript and all 46 page outputs.
  Detail-modal regressions preserve unavailable amounts/ratios as `—` and
  explicit zero as zero. The local QA web server was restored on port 3000.
- `npm run dev:server` reached zero compile errors and a successful Nest boot
  on the preserved QA database. The raw-ratio validator now narrows finite
  numeric values before arithmetic. IDOR and tenant-scope gates both passed;
  disappeared-row reset also carries organization scope in the mutation itself.
- Browser page entry and custom date changes did not admit a new source run.
  Before explicit collection, September 1–6 showed 0/6 daily coverage and
  unavailable Wing KPIs, not the legacy period snapshot as a daily fact.
- At 12:20:41 UTC, the explicit dashboard action admitted v2 attempt
  `de22e09d-5002-4b7f-bfb9-fdeed8c249d4` for September 1–6. At admission the
  immutable itemwinner and legacy traffic checksums still matched the prior
  baselines. Completion, provider reconciliation and subrange verification
  remain pending; no release, merge or deployment is claimed.

- Runtime outcome: that attempt failed before accepting any source rows with
  `WING_TRAFFIC_COLLECTION_FAILED`. The extension-owned collection tab reached
  Coupang's seller login page (`xauth.coupang.com`, Wing client), independently
  confirming expired provider authentication. The UI currently uses a generic
  advertising-login message for this shared login path; the required account
  is the Wing seller account. No credentials were entered or exported.
- The service displayed the failed source state and offered an explicit retry.
  No v2 daily publication was created; previous complete legacy evidence and
  both immutable baseline checksums remained unchanged at 12:21:52 UTC.
- User authentication is now required to continue the real collection gate.
  Preserve the login tab and QA dashboard at the requested September 1–6
  range, with local API/web servers running. After login, explicitly retry and
  verify complete publication, the five additive metric comparisons, average
  daily visitors, arbitrary covered subranges, missing-date restrictions and
  no date-change collection. This does not mark the active plan or spec complete.

### 2026-09-08 — Wing v2 end-to-end acceptance after login

- The user completed Wing login and requested continuation. Main restored the
  isolated API/web servers after their previous task processes had exited;
  zero-error Nest boot was reconfirmed against the same preserved QA database.
  The old dashboard debugger connection was unavailable, so main opened a
  fresh QA tab. No provider credentials or another task's Wing tab were taken
  over. KID-33 returned from Human Input to In Progress.
- The explicit retry button admitted attempt
  `823d5e97-7868-4fed-8e85-ccf251f93441` at 12:37:45 UTC. It completed at
  12:38:06 UTC with 534 immutable option-day rows (534 unique date/option
  pairs, including 28 unmatched rows) and six account daily facts.
- The September 1–6 service response reports 6/6 days, no missing dates,
  daily-average visitors 177.5, views 1391, cart additions 170, orders 58,
  units 173 and GMV 363200. Each of the five additive metrics is MATCHED
  against the newly captured exact-period provider original. Own CVR is
  4.169662113587347%; provider CVR remains separately preserved as 4.17%.
  Wing net profit remains null. The displayed account counts and average
  match that response; the main revenue card retains its separate Sellpia
  ownership, rather than substituting Wing GMV into Sellpia revenue.
- Without another collection, September 1–3 returns GMV 206770, visitors
  average 165, views 678, cart 76, orders 31 and units 92 (3/3 days).
  September 4–6 returns GMV 156430, average 190, views 713, cart 94,
  orders 27 and units 81 (3/3 days). Both covered subranges remain available
  and correctly report UNVERIFIED exact-period reconciliation; the UI shows
  the daily-sum/unreconciled-period provenance instead of calling them missing.
- September 1–7 retains 6/7-day coverage and explicitly identifies September
  7 as missing. Public period metrics are null and the UI displays `—`, while
  the underlying six-day evidence remains available for inspection.
- The daily trend endpoint returns September 1–6 revenue values
  21790/50910/134070/49480/92980/13970 with unavailable profit/ad cost, not
  the old entire-period value on September 1. Date changes created no new
  source attempt. The prior login-failure alert became resolved on completion.
- Final read-only verification preserved both immutable baseline hashes and
  all three existing traffic attempts (legacy complete, login failure, v2
  complete). The QA screen is restored to September 1–6. Advertising coverage
  remains separately unavailable because no new account-ad capture was run in
  this Wing-only runtime acceptance. This does not claim overall hard-cutover
  completion, new ad-provider verification, merge or deployment.

### 2026-09-08 — whole-extension implementation in progress

- The full collection inventory and accepted responsibility layout are in the
  subordinate collection-deepening spec. Implementation is split among Wing
  search, Rocket completeness, popup owner observation, manual Ads JSON/proof,
  Coupang resource/source policy and Sellpia capture modules. Code agents use
  Luna/max; main owns decisions, integration and final QA.
- Main's early integration review found a missing-to-zero numeric conversion
  in the Wing search extraction and overly permissive number/date validation
  plus unproven empty-detail acceptance in Rocket. Corrections and regression
  tests are required before those changes are accepted. Initial Rocket scoped
  tests passed 26/26, but that result is implementation-only, not final QA.
- New manual advertising requests need a truthful JSON identity/metric proof,
  not synthetic DOM pagination. The existing owner receipt contract will
  accept that explicit proof while retaining immutable DOM receipts. Manual
  selection is an observed provider enum; AUTO coverage remains unavailable.
- At 14:10 UTC, read-only verification of the preserved QA database confirmed
  the same three Wing traffic attempts, 534 unique daily option rows, six
  account days, GMV 363200, 58 orders and 173 units. Both immutable legacy
  traffic/itemwinner checksums still match. API/web continue on 4000/3000;
  the QA database remains on 56879. No collection or database reset occurred.
- Pending: finish code/integration, focused regressions and basic builds,
  main's whole-change/spec correctness/performance and ponytail review, then
  real affected-source extension/owner/publication/Alert/consumer QA. Follow
  with full isolated PostgreSQL and final runtime/build/legacy gates, reusing
  still-valid matching/ABC evidence and rerunning any impacted paths. Results
  remain not-run or implementation-only until their required evidence exists.

### 2026-09-09 — integrated collector QA and publication performance correction

- The integrated extension suite passes 948/948. Main reviewed the changed
  source/resource responsibilities and removed test-only helper exports found
  by the over-engineering review. Shared build, latest local-proxy web production
  build, and actual Nest boot pass. This remains implementation evidence, not
  acceptance of every provider path.
- The first full isolated PostgreSQL run passed 96/101 files; five files failed.
  Focused reruns distinguished harness/transient failures from obsolete traffic
  fixtures. SERP now uses a suite-owned loopback listener, TrafficService tests
  use real account-daily owner publication, and Product Operations fixtures
  explicitly identify valid daily provenance and observed values. Latest focused
  SERP/TrafficService tests and all 17 Product Operations PG tests pass. A new
  full PostgreSQL run remains required after the performance correction below.
- Actual dashboard QA found Sellpia profit treating unavailable advertising as
  zero. The corrected API/schema/UI keep advertising cost, net profit and profit
  rate null while preserving sales/cost/quantity. Main verified the rebuilt
  screen shows unavailable profit and no profit-rate goal success for September
  1–6, with the existing Wing 58 orders/173 units/177.5 daily-average visitors
  still displayed. The focused service/schema/dashboard regressions pass.
- Chrome direct debugger attachment remains unavailable, but native screen
  control works again after the user's connection check. Aside CLI was checked
  with permission and exposes a separate browser, not the Chrome QA session.
  No extension reinstall, new permissions, or QA-data reset was performed.
- Main started the affected Wing daily-v2 path from the rebuilt dashboard for
  September 1–6: attempt `0b8f0a56-5222-4569-b6f6-1a2908b12b2b` began at
  2026-09-08 15:59:53 UTC and staged 534 unique option-day rows, including 28
  unmatched rows. Reloading the initiating page preserved the durable attempt.
  Finalize returned P2028 after exceeding the existing 5-second transaction
  budget: `publishDailyFacts` performs per-row reset/find/update/metadata merge.
  This is a failed acceptance gate, not COMPLETE collection.
- The previous complete account daily publication and immutable legacy
  traffic/itemwinner hashes remain unchanged. Main approved a bounded internal
  batch-publication correction preserving the same owner transaction, fences,
  absence policy, CSV/advertising fields and namespace merge. No timeout increase,
  second worker, new lifecycle or direct QA-row repair is authorized. Resume
  through the existing owner path after focused tests and review, then verify
  publication latency, preserved evidence and consumer refresh.

### 2026-09-09 — requested Chrome Extensions skill check

- Main read the requested `chrome-extensions` skill and its service-worker,
  messaging and storage references. Applied the relevant checks to the existing
  extension: Manifest V3, explicit side-panel trigger without `default_popup`,
  declared tabs/host permissions, synchronous message registration, and real
  16/48/128-pixel PNG icons all verified. No new permissions or store publishing
  work was introduced.
- Worker instances and in-flight promise locks are not canonical state. Durable
  local sessions identify attempts; recovery reads the server owner, and running
  traffic remains an explicit continuation rather than a synthetic local success.
  Preserve this project contract instead of persisting owner tokens/raw rows or
  adding a second extension-owned scheduler from generic skill examples.
- Focused worker-boot, collection-session, daily-v2 traffic and popup checks pass
  105/105; adapter synchronization and worker syntax checks pass. Evidence:
  `/tmp/kiditem-chrome-extensions-skill-gates-20260909.log`.
- Native Chrome QA confirms the popup separately displays the RUNNING traffic
  attempt and the previous complete 534-row snapshot. Main started the independent
  dashboard `순위 받기` path. Code readback found a mislabeled UI: this is Wing
  sales-rank collection (`beginWingRankBatch`/`runWingSalesRankCheck`), not
  itemwinner. The server readiness label is already correct. A bounded UI-copy
  correction and rendered regression are in progress; do not count this run as
  itemwinner acceptance. Its own rank-owner/publication readback is pending.
- The copy correction is now implemented as `Wing 판매순위` / `자사 상품 판매순위`;
  12 rendered modal tests preserve the existing `wing_kpi` handler. The latest
  local-proxy production web build passes and the same QA web was restarted.
- Rank batch `e7532670-1f81-43cb-83a7-69bee811bc7c` admitted 1,495 keyword
  attempts. Two completed with 160 captured rows; the rank screen shows their
  new 01:08/01:09 KST observations and truthful out-of-range/missing metrics.
  Main explicitly stopped this QA batch through its UI: 1,493 remaining attempts
  are `COLLECTION_CANCELLED`, two completed attempts and their facts remain.
  This is partial capture/publication and cancellation evidence, not full-batch
  success and not itemwinner acceptance.
- Main reviewed daily-v2 batch SQL against table defaults, conflict grain,
  owner transaction and metadata/CSV safeguards. Added a regression forcing a
  post-publication Alert failure to test rollback and same-attempt retry. Focused
  disposable PostgreSQL is running; raw-SQL IDOR and tenant-scope guards pass.
- Follow-up: the focused daily-v2 PostgreSQL run passes 14/14, including
  post-publication Alert failure rollback and same-attempt retry. Evidence:
  `/tmp/kiditem-main-traffic-batch-pg-20260909.log`. The latest full PostgreSQL
  run remains live on its own disposable database (port 56973); do not start
  another run or treat its buffered reporter as completion.
- The waiting traffic attempt is reported `ATTEMPT_EXPIRED` by owner reads
  and both Dashboard/popup, while its raw row remains `running`; previous
  complete 534-row evidence remains available. New traffic acceptance is
  pending, not successful. Native date-field interaction remains unreliable.
- Actual itemwinner retry `6545b925-28f8-4944-bf8f-6266c6632e31` completed
  at 2026-09-08T16:36:40Z with 745 products. Wing screen, captured KPI snapshot
  and owner-derived popup agree on 698 winner + 20 restricted + 27 non-winner.
  The previous 747-product snapshot remains unchanged alongside the new one;
  the source failure Alert is `RESOLVED`. Ad-ops consumer-screen readback is
  pending. Read-only evidence helper:
  `/tmp/kiditem-qa-rebuild-0907.FfFw2I/wing-api-e2e-state.cjs`.
- Existing Gateway configuration and installation-token path were reused;
  package build passed and the Gateway process was started. This addresses
  the missing local runtime found behind conversation-list 503 errors;
  successful authenticated consumer readback is still required.
- Ad-ops native consumer readback now passes: 698/20/27, observed
  2026-09-09 01:36:33 KST and collected 01:36:40, matching the exact new
  itemwinner owner snapshot and popup. Common-browser itemwinner revalidation
  is accepted; traffic remains pending. The focused batch-publication delta
  retains bounded parameterized SQL and owner transactions; inline
  ponytail-review found no justified deletion in that delta (net: 0 lines).
- Agent OS authenticated native UI now loads its conversation list, including
  the existing QA smoke conversation, after starting the existing Gateway.
  No new AI conversation or model turn was submitted.
- Native date-entry fallback succeeded by screenshot-coordinate focus on the
  end-date day segment and three Down keys, then Tab/조회. Dashboard restored
  September 1–6, 6/6 coverage, 58 orders and 173 units. Explicit UI retry started
  traffic attempt `e281c4d6-3e59-4472-a0f9-c342b42a1306` at
  2026-09-08T16:41:24Z for that same six-day range. The previous expired attempt
  is now durably FAILED/ATTEMPT_EXPIRED; its partial raw evidence and the prior
  completed snapshot remain preserved. New attempt is still in progress.
- Traffic retry completed at 2026-09-08T16:41:55Z (about 31 seconds end-to-end):
  534 option-day rows, 506 matched, 28 unmatched, no missing required metrics.
  New rows sum to visitors 1065, views 1391, carts 170, orders 58, units 173,
  GMV 363200, matching the preserved previous complete attempt. Six daily
  account KPI rows plus the exact September 1–6 period row identify the new
  attempt; their values are replaced, not cumulatively added. September 1
  matched-listing projection remains 237 listings / revenue 21790. The Alert
  resolves at 16:41:55Z. Dashboard automatically shows the new 01:41:43 KST
  source timestamp, 6/6 coverage and the same counts while missing account
  advertising/profit remain unavailable. This passes the affected common
  browser traffic revalidation and real replacement publication gate.
- Latest full isolated PostgreSQL gate passes 101/101 files and 806/806 tests
  in 1284.39 seconds, including the batch-publication change. Evidence:
  `/tmp/kiditem-main-full-pg-after-batch-20260909.log`. This supersedes the
  earlier five-file failure result; it does not substitute for remaining
  advertising, Rocket and other affected-source actual acceptance gates.
- Account-ad daily v2 actual attempt `b7738552-067f-4509-bf92-2b63a9439965`
  completed 2026-09-08T16:51:52Z after 329 seconds. It covers August 10–
  September 8: 30 immutable daily snapshots / 300 metric rows, with all six
  additive observed-metric flags present for all 30 days. Previous v1 COMPLETE
  checksum `57c35178...` remains unchanged. September 1–6 totals are spend
  382123, attributed revenue 3314130, impressions 985216, clicks 2645,
  attributed units 406 and attributed orders 321. Read-only evidence helper:
  `/tmp/kiditem-ad-daily-qa-20260909.cjs`.
- Fresh QA tab 42039180 restored browser control without changing/reinstalling
  the extension. Native/browser Dashboard readback for September 1–6 shows
  both coverage sets 6/6, ad spend 382123 and Sellpia net profit 12297596
  (=38200729-25521010-382123), alongside preserved Wing counts. Missing-day
  September 9 remains unavailable; no collection was triggered by date changes.
- Popup day count defect: accountDaily displayed metric rowCount as days.
  The bounded fix uses completed receiptCount (one owner receipt per day),
  preserving explicit zero and unknown counts; legacy 14/140 and v2 30/300
  regressions pass. Full extension gate now passes 953/953; adapter, popup
  syntax and diff checks pass. Evidence:
  `/tmp/kiditem-main-extension-count-fix-20260909.log`. Actual new-popup readback
  remains pending: browser security policy blocked direct internal-extension
  URL navigation, so main stopped that action and asked the user to inspect
  the existing popup. No alternate-surface workaround was attempted.
- Latest cutover scanner passes with zero unowned producers, source-to-ABC
  references and legacy runtime references.
- Full browser Wing catalog attempt `41be6e8c-2520-4a66-ade8-681ec0e34649`
  began from registered-products UI at 2026-09-08T16:56:58Z. Discovery captured
  all 1,254 products and froze its manifest; at 17:00:35Z, 80 product details
  were staged. Initiating-page reload caused a browser observation timeout,
  but server chunk timestamps prove the same attempt continued afterward.
  No replacement attempt, worker restart or timeout extension was introduced.
  Canonical baseline remains 1,225 listings / 2,241 options, 688 components
  (hash `dd375d22...`), 2,010 stock rows (hash `d353a344...`), mapping generation
  7 and ABC publication revision 1. Read-only progress/preservation helper:
  `/tmp/kiditem-catalog-qa-20260909.cjs`. Full publication/consumer acceptance
  remains pending; no source completion or ABC recalculation is inferred.
- Catalog attempt `41be6e8c-2520-4a66-ade8-681ec0e34649` terminated FAILED at
  2026-09-08T17:06:59.734Z on provider HTTP 429 after 440/1,254 details
  (22 detail chunks). No automatic or manual retry was started. At 17:09Z,
  read-only checks confirm the baseline listing/option counts, component and
  stock hashes, mapping generation and ABC revision are unchanged. Existing
  tab 42039180 subsequently shows the same failed state, 1,254 discovered /
  440 detailed and the 429 message with 1,225 existing registered products.
  Failure containment passes; complete catalog publication remains blocked
  by provider throttling and is not accepted as complete.
- Authenticated consumer QA found `dashboard/ad.dailyAd` fabricating a
  September 9 zero from listing defaults when no complete account-ad day
  exists. The bounded correction uses only owner-published account-ad days,
  retains observed zero and removes unused legacy listing-ad reads. Code
  edits were held while catalog collection was active and released only
  after its terminal failure. Regression and post-fix readback are pending.
- The catalog failure Alert is OPEN for that exact attempt, updated
  2026-09-08T17:06:59.765Z with the same HTTP 429 message.
- Owner-only daily-ad correction now passes inline delta review, 15 focused
  service/wiring tests, four isolated PostgreSQL tests, ESLint, IDOR and
  tenant-scope scanners. Removed the five obsolete listing-ad reads and
  their now-unreferenced adapters/ports; before/after review evidence is in
  `/tmp/dashboard-ad-owner-only`. Explicit daily zero and empty-owner cases
  are exercised through `getSummary`, not a private-method test.
- Existing QA API was restarted after production edits and Nest boot passed
  at 2026-09-08T17:18:19Z (PID 91214). Authenticated real-data readback passes:
  account source READY / same 30 receipts and 300 rows, September 1–6 spend
  382123 unchanged, dailyAd has exactly August 10–September 8 owner dates,
  September 8 retains observed zero and missing September 9 is absent.
  Traffic totals/coverage and Agent OS conversation reads remain healthy.
  Full PostgreSQL rerun is in progress; evidence log:
  `/tmp/kiditem-main-full-pg-owner-only-20260909.log`. Remaining collector
  acceptance gates are still open; no overall completion is claimed.
- Full PostgreSQL owner-only rerun ended with 99/101 files and 804/807 tests
  passing (952.64 seconds). Failures: Wing rank interrupted-proof admission
  returned HTTP 502; shipment-summary baseline request had a socket hang-up;
  shipment-summary unauthenticated request returned 403 instead of 401.
  These are not waived. Both suites still delegated ephemeral listen/close
  ownership to each SuperTest request; they now use a suite-owned loopback
  listener and retain all original business/authentication expectations.
  Bounded unexpected-response diagnostics were added. Focused revalidation
  is running in `/tmp/kiditem-main-pg-loopback-20260909.log`.
- September 9 Rocket actual attempt `d733739c-4423-4373-91e3-b04d3a335ac3`
  failed with `coupang_po_session_required` at 00:24Z; no snapshot was
  published. Exact-attempt OPEN Alert and failed UI status agree. Existing
  Supplier Hub subsequently loads authenticated company context and the
  actual PO list. A marketing prompt was dismissed without selecting or
  saving consent. Explicit retry `d1f22290-06b5-4179-82e8-2b2ac0a56eac`
  began at 00:26:46Z and is in progress. Only collection/preview is in scope;
  no supplier confirmation, shipment, cookie deletion or stock mutation was
  performed. Read-only owner evidence: `/tmp/kiditem-rocket-qa-20260909.cjs`.
- Both repaired HTTP suites pass focused PostgreSQL verification: 16/16 tests
  in 49.11 seconds. The actual Wing interrupted-proof admission site now also
  includes bounded response diagnostics without changing its 201 expectation.
  Full revalidation restarted with the final harness delta in
  `/tmp/kiditem-main-full-pg-loopback-20260909.log`.
- Rocket retry terminated FAILED at 00:27:21Z with
  `rocket_po_collection_incomplete`: PO 141765197 was rejected as a short SKU
  row. No snapshot exists; exact-attempt OPEN Alert and UI failure agree.
  Main inspected the actual detail DOM: 13 SKU rows each have a leading
  `rowspan=2`, followed by five-cell inbound rows; the total footer similarly
  has a four-cell numeric continuation. Flattening physical rows loses this
  structure and incorrectly treats inbound quantities as SKU identities.
  Actual SKU totals are 13 / quantity 398 / amount 2458187, matching the list.
  Bounded fix preserves leading-cell row-span ownership while retaining
  malformed genuine-SKU rejection and SKU/quantity/amount reconciliation.
- The rowspan fix is implemented and main-reviewed. Focused Rocket/action
  coverage passes 30 tests; the full extension suite passes 955/955 with no
  skips (29.38 seconds). Adapter synchronization, worker syntax and extension
  diff checks pass. Regression fixtures cover zero/nonzero inbound rows,
  footer continuations and genuinely malformed numeric SKU anchors.
  No new generic parser or dependency was introduced. Full-suite evidence:
  `/tmp/kiditem-main-extension-rowspan-20260909.log`.
- Actual Rocket retest awaits loading the updated unpacked extension. The
  current browser tool cannot claim the Chrome internal extension-management
  tab; the operator was asked to reload only KIDITEM. No alternate internal
  URL or extension-control bypass was attempted. Prior failed attempts and
  QA data remain intact. Full PostgreSQL verification remains live in
  `/tmp/kiditem-main-full-pg-loopback-20260909.log`; no duplicate run started.
- Rocket collection tooltip now states that the month's expected-delivery
  POs are collected across all states, matching the existing `status: ''`
  frozen plan. Handler/filter behavior is unchanged. Main reviewed both
  changed files; 29 component tests pass. The local-proxy production web
  build passes (`/tmp/kiditem-main-web-rocket-label-20260909.log`) and the
  same QA web restarted on port 3000. Actual rendered tooltip is verified.
  The cutover scanner again passes with zero findings. The scoped
  over-engineering review found no unnecessary structure.
- Independent Sellpia sales acceptance began through Sales Analysis's
  `지금 수집` at 00:43:49Z, attempt
  `b0486868-649a-45a5-a2df-ff50616d726b`. While RUNNING, it has no published
  facts and preserves the previous 183-row / 36-seller completed source and
  displayed amounts. Read-only evidence helper:
  `/tmp/kiditem-sellpia-sales-qa-20260909.cjs`. Terminal/consumer verification
  is pending. No order, shipment or physical-stock mutation was requested.
- Sales capture's local busy state ended without a new COMPLETE owner result;
  at 00:48Z the attempt remained RUNNING with zero facts, while the previous
  183 facts and amounts remained intact. No provider-attention Sellpia tab or
  relevant page-console error was observed. The cause is not yet established;
  no duplicate start or direct terminal write was made. This is not successful
  acceptance. The approved owner policy retains a 30-minute fixed expiry and
  side-effect-free effective-expiry reads; do not introduce an orphan sweep.
- The full PostgreSQL loopback run has reported four failures in the Wing
  rank suite, with two test durations around 30 seconds. It is
  still advancing through later suites; final error details are pending.
  Read-only `pg_stat_activity` checks on its isolated port 56981 show active
  queries and no blocking PIDs. Keep the same execution; do not waive failures
  or change timeouts based on this intermediate output.
- Final full PostgreSQL result: 100/101 files and 803/807 tests pass in
  1738.15 seconds. All four failures are Wing rank fixture preparation:
  two `beforeEach` hook timeouts at line 89 and two subsequent duplicate
  organization/vendor-item fixture keys at line 117. No HTTP expectation
  failure is reported in this run. The earlier loopback change does not by
  itself satisfy the full gate. The timeout/late-fixture interaction needs
  investigation without increasing timeouts or weakening uniqueness checks.
- The operator confirmed KIDITEM extension reload. Rocket retest is unblocked
  at that prerequisite. Initial browser control reads timed out transiently;
  the same QA tab is accessible again. No replacement browser or extension
  reinstall was used.
- The reloaded Rocket collector passed the former rowspan failure but attempt
  `707a738b-e721-49a1-9d8a-96ef37835e7b` failed with
  `ROCKET_PO_VENDOR_MISMATCH`. The original QA Rocket account still carries
  the initial `QA-ISOLATED-0907` fixture identity. The authenticated Supplier
  Hub detail's supplier link identifies `A00057379`, matching the active Wing
  account. No mismatch guard was weakened and no snapshot was published.
- Used the existing QA-only `POST /api/channels/accounts/rocket/bootstrap`
  owner endpoint to obtain Rocket account
  `4ddf0ab0-9e5b-46fc-b023-9c8885a90ce9` for that observed vendor. Kept the old
  account and its failed attempts/Alert intact; no direct database writes or
  production account changes. Selected the returned account on the normal
  Rocket page and started actual extension capture at 01:11:15Z, attempt
  `f2f41ab0-b384-47ff-a38e-403cd29372fc`. Terminal and consumer QA are pending.
- Reviewed the Wing fixture timing diagnostics: they retain the same setup
  statements and strict assertions, recording only test name/stage/durations.
  Started the focused PostgreSQL suite without a concurrent application build;
  output `/tmp/kiditem-main-wing-fixture-timing-20260909.log`. The diagnostics
  are investigation evidence, not a claimed fix for the full-suite failure.
- Rocket attempt `f2f41ab0-b384-47ff-a38e-403cd29372fc` completed at
  01:12:46.765Z: 7/7 list pages, 331 detail POs, 1,187 unique lines. The
  previously failing PO `141765197` has 13 lines and quantity 398, matching
  the observed provider detail. The actual Rocket screen shows COMPLETE,
  331 POs / 25,983 units / KRW 156,246,477; September 9 shows that PO's
  398 units / KRW 2,458,187. The normal action also displayed its existing
  inventory preview (241 eligible POs / 721 lines). New-account recipes are
  absent, so Excel export correctly remains blocked for missing connections;
  no provider confirmation, stock mutation or export bypass was performed.
- Preservation readback at 01:14Z: existing 688 recipe components and 2,010
  physical-stock rows retain the exact pre-capture hashes. ABC publication
  remains revision 1 / mapping generation 7 / cutoff September 7. Catalog
  identity totals alone increased from 1,225/2,241 to 1,412/2,428
  listings/options. The old QA account's mismatch Alert remains OPEN,
  consistent with its distinct account scope.
- Focused Wing PostgreSQL timing run passed 9/9 in 36.54 seconds. Fixture
  durations were 849–2,186ms; the 100-item terminal measured 30ms and exact
  read 6ms. Started the full suite with the same diagnostics and no application
  build overlap, log `/tmp/kiditem-main-full-pg-fixture-timing-20260909.log`.
  The full gate remains pending; a focused pass does not resolve its failure.
- Independent SalesAnalysis retry at 01:15:13Z started
  `e582422d-eb2b-4285-8f6d-2079be1acf6b`; normal admission atomically expired
  prior `b0486868-649a-45a5-a2df-ff50616d726b` with `ATTEMPT_EXPIRED` and its
  OPEN Alert. Existing 183 daily facts remain unchanged. The managed provider
  tab was observed at `https://kiditem.sellpia.com/auth_fail.html`. The operator
  subsequently confirmed Sellpia login. No additional attempt was started.
- Actual SalesAnalysis screenshot exposed a separate response-contract defect:
  `unrecognized_keys: continuationRequired`. The extension's normal outcome
  always contains that boolean but the web's strict `ExtensionOutcomeSchema`
  omits it. The owner remains RUNNING, so terminal reconciliation does not
  mask this parse error. Delegated a bounded web helper/spec fix: explicitly
  validate the field and retain exact-owner terminal authority; surface a
  bounded valid extension error when the owner is still nonterminal. Preserve
  lost-response COMPLETE reconciliation, with no loose schema, automatic new
  attempt, timeout increase or new lifecycle. Underlying nonterminal failure
  and post-login acceptance remain unverified until the next actual QA.
- The bounded web fix now passes 13 focused tests plus scoped lint/diff checks.
  Main reviewed explicit boolean validation, strict unknown-field rejection,
  wrong-attempt fencing, bounded 300-character error text, RUNNING rejection
  and authoritative terminal-owner precedence. Scoped ponytail review found
  no additional deletion. No backend or extension code changed. Web build and
  actual post-fix QA are pending until the ongoing full PostgreSQL execution
  finishes; the currently served web build still predates this correction.
- Main inspected the live API output: at 01:17:04Z, the exact Sales attempt's
  `POST /fail` returned HTTP 400. The source adapter's default
  `sellpia_sales_collection_failed` (and lowercase login aliases) violates
  `SellpiaSalesSourceFailureDto`'s required uppercase-code pattern. This
  establishes a concrete failure-reporting path that leaves the owner RUNNING.
  Delegated a bounded Sales extension adapter fix to normalize outgoing codes
  to the existing DTO contract and test the actual terminal wire. Keep server
  validation, attempt identity, owner authority and replay rules unchanged.
  Do not force-expire or directly fail the current QA row.
- At 01:27Z, the existing browser inventory shows authenticated Sellpia
  `main.html`, corroborating the operator's login, and the QA tab at
  `/product-hub/matching`. Tab interaction still times out; no matching
  mutation has been performed. Full PostgreSQL remains live and has emitted
  all nine Wing fixture completion timings (1,705–5,209ms), but no final
  test summary yet. Keep the same execution and avoid heavy build overlap.
- Main reviewed the bounded Sales failure-code correction against the live
  failure DTO: valid codes are trimmed/uppercased, invalid or absent codes use
  `SELLPIA_SALES_COLLECTION_FAILED`; login attention and exact terminal reads
  remain unchanged. Actual terminal-wire regression includes lost failure
  acknowledgements without recollection. Focused tests passed; full extension
  gate now passes 957/957 with no skips, plus adapter sync, worker/owner syntax,
  manifest parse and extension diff checks. Scoped ponytail review found no
  additional deletion. No server validation or lifecycle was widened.
- Browser tab automation returns `Debugger unattached`, but native Chrome UI
  access works for the existing QA page. Selected only the collected Rocket
  account `4ddf0ab0-9e5b-46fc-b023-9c8885a90ce9` (187 listings/options,
  0 matched/configured). One existing automatic-match action stopped with
  `최신 주문수집 확장프로그램을 찾지 못했습니다.`; it is not a matching
  success. Requested the operator to reload the existing KidItem extension
  after the verified fix; no reinstall, credential changes or internal-page
  policy workaround. Matching, updated Sales actual QA and pending web build
  remain incomplete. Full PG execution 98154 is still live, without a final
  result; preserve it and the separate screen QA database.
- Operator reloaded the existing extension. Main refreshed the same QA page
  and invoked automatic matching once more. It admitted
  `ac2f915a-444a-410c-8ae6-49ecc065c326` at 01:41:24Z, then atomically recorded
  FAILED at 01:44:32Z with `sellpia_manual_match_timeout`, zero published rows.
  The UI displays the same collection timeout. Do not infer a match or retry
  blindly; the collector's unchanged tab-ready/request bounds are 45s/15s,
  and current evidence does not distinguish those stages.
- Full PostgreSQL execution 98154 exited 1: 93/101 files and 790/807 tests
  passed in 1904.48s. The two earliest failures are 30s `beforeEach` timeouts
  in catalog-media-publication and thumbnail-wing-owner-receipt. The remaining
  15 fail in resetDb with PostgreSQL `57P03: recovery mode`, across six files.
  All nine Wing fixture timings completed below 6s. A live process sample
  showed Node awaiting I/O; separate read-only test DB observations confirmed
  changing active/transaction queries before terminality. No timeout/skip or
  production behavior change is justified by this evidence. Testcontainers
  teardown removed its own disposable container normally; screen QA DB remains.
  Preserve full output `/tmp/kiditem-main-full-pg-fixture-timing-20260909.log`.
- After PostgreSQL terminality and actual matching failure, stopped only the
  session-owned QA web process and began the pending local-proxy production
  web build. API, Gateway, original workbook and QA database are unchanged.
- Pending Sellpia response web build passed with the existing local proxy
  settings; QA web restarted on port 3000 and reported ready. Build output:
  `/tmp/kiditem-main-web-sellpia-response-20260909.log`. This proves the build,
  not the still-pending actual Sales success path.
- After loading the rebuilt dashboard, its Alert feed shows the actual
  Sellpia manual-match timeout as unread/action-required, linked to the
  matching page. This verifies the failed collection -> owner FAILED -> Alert
  -> consumer UI path for `ac2f915a-444a-410c-8ae6-49ecc065c326`; successful
  alias publication and product matching remain unverified.
- Normal Sales Analysis entrypoint selected September and admitted new
  `34216e8a-ccf0-4e4f-9164-de3632497b9d` at 01:52:54Z after the previous
  attempt expired (confirmed expiresAt 01:45:12Z). Admission atomically
  settled the previous attempt/Alert. The page's busy state ended, but the new
  owner was still RUNNING with no facts at 01:53:39Z: this is not successful
  post-fix verification. Do not submit a duplicate or force its state.
- Additional live API evidence at 01:49–01:52Z shows several dashboard/source
  reads failing with P2028 (transaction admission timeout or 5s transaction
  exceeded). Later read-only QA pg_stat_activity showed one idle connection,
  not a persistent lock backlog. The host also showed significant compressed
  memory, but neither that observation nor the test DB recovery errors prove
  the root cause. Preserve thresholds and investigate before another full run.
- Follow-up QA DB server logs show ordinary checkpoints/client disconnects,
  not the recovery-mode errors seen in the disposable full-test DB. No test
  explicitly terminates PostgreSQL backends or stops its container mid-suite
  in the inspected integration sources. Started only the eight failed files
  against a new disposable container (the previous one was already removed
  by teardown), retaining its PostgreSQL log concurrently. No code, timeout,
  skip or fixture change: `/tmp/kiditem-main-pg-recovery-focused-20260909.log`
  and `/tmp/kiditem-focused-postgres-server-20260909.log`.
- The eight-file focused rerun passed 19/19 tests, unchanged, in 46.68s.
  Retained PostgreSQL logs show expected duplicate-key assertions and normal
  teardown, without recovery-mode errors. This narrows the failure to the
  earlier full-run conditions but does not prove the cause or replace the
  full gate. Started the complete 807-test suite again with retained server
  logging; no concurrent build, test execution, or new browser collection.
- Full rerun passed: 101/101 files, 807/807 tests, exit 0 in 829.00s
  (`/tmp/kiditem-main-full-pg-server-log-20260909.log`). Retained PostgreSQL
  log (`/tmp/kiditem-full-postgres-server-20260909.log`) has normal startup/
  teardown shutdowns and no recovery-mode/PANIC/out-of-memory report. This
  satisfies the latest full PG gate, without changing tests or thresholds;
  the previous run's crash cause remains unproven. Measurement examples:
  Rocket 4,000-row publication 3,574ms/read 210ms; Wing 1,000-product /
  3,000-option publication 1,525ms; Wing 100-item terminal 31ms/read 8ms.
  Resume actual QA with no full test or build running; successful matching,
  Sales collection and downstream acceptance remain incomplete.
- Actual matching rerun (after all heavy tests ended) admitted
  `dd3dc9f3-209e-41b1-aad5-68795336ede0` at 02:14:45Z and completed at
  02:15:26Z with 38,740 captured rows. The owner snapshot has 1,822 targets,
  535 matched targets and 835 retained aliases. The existing UI automatically
  connected 57 Rocket listings/options; 130 remain unlinked. No manual recipe
  guesses, direct writes, stock changes or downstream ABC execution occurred.
- Quantity acceptance FAILED despite the success message. Read-only recipe
  inspection found quantity 1,350 for `9개 x 150g`, 960 for
  `24개입 40*35mm`, 600 for `8개 75g`, and 450 for `6개 75g`.
  `QUANTITY_UNIT_MULTIPLIER` currently permits both a missing multiplication
  operator and a missing trailing quantity unit, consuming weight/dimension
  numbers. Presented a bounded unit-aware parser correction with real-title
  regressions for approval; no code or QA recipe has been changed yet.
- A separate identity conflict exists for Rocket SKU 59167949 (clear slime)
  linked to Sellpia 10054-1 (water gun). Both persisted source identities have
  the same barcode `8806384804294`; sellerSku is the Rocket SKU, not a Sellpia
  code. Thus this is not yet evidence of a parser column shift or permission
  to invent a name-similarity matching policy. Preserve the evidence and
  investigate/verify the physical identity before downstream acceptance.
- User approved the bounded quantity parser correction (`수정 진행`). The
  existing Luna/max implementation agent is adding unit-aware parsing and
  focused regressions; main review, boot and actual UI recalculation remain
  pending. SKU selection and multi-component rules are outside this change.
- Read-only original evidence at 02:23Z confirms Sellpia raw fields themselves
  contain code `10054-1`, water-gun name and barcode `8806384804294`; ten
  persisted Rocket PO lines carry that barcode with slime SKU `59167949`.
  This proves a conflict in captured source identities, not the physical item
  or a source-side correction. The existing Supplier Hub detail navigation
  for one relevant PO redirected to its dashboard, so live corroboration is
  still unverified. No recipe or source rows were directly modified.
- Quantity delta reviewed: only the parser and its tests changed, main rerun
  passed 2 files / 50 tests plus scoped ESLint and diff check. Ponytail found
  no speculative abstraction or dependency. The QA watch restart stalled in
  old-child shutdown; stopped only the task-owned process and restarted the
  existing launcher with unchanged QA DB. Latest Nest boot passed at 02:27:20Z
  (PID 53161, port 4000). UI recalculation was not dispatched because the user
  switched to Sellpia product inspection. A new full PG gate is running in
  the disposable DB on port 56991; no concurrent browser collection.
- User suggested Sellpia `10429-1` as the slime candidate. Read-only inventory
  corroborates `2000퓨어클리어슬라임(쿠팡용)`, active, barcode `8806384804966`.
  That barcode differs from the Rocket source. Do not silently override SKU
  identity on name similarity; explicit physical SKU / nine-unit recipe
  confirmation is pending before a normal QA recipe edit.
- 02:32Z continuation audit: the same latest full PG process and its disposable
  PostgreSQL container are live; no terminal result yet. Current measured
  Rocket publication/read is 4,556/130ms and Wing 1,000-product full
  publication is 1,551ms. These samples do not replace full-suite completion.
  The cutover scanner was rerun and passed with zero unowned producers,
  source-to-ABC references, or legacy runtime references. Rechecked the ACTIVE
  spec verification contract: real latest matching quantity readback, Sellpia
  sales completion, remaining actual consumer/ABC/Alert acceptance and the
  latest full-suite result still prevent overall completion. Production
  deployment remains separately unauthorized; no commit/push/merge/deployment
  was performed.
- User rejected manual item-by-item matching as a QA workaround. The earlier
  request to manually replace the slime recipe is withdrawn, not pending.
  Investigated automatic selection instead: its repository path does not
  evaluate names, while the separate suggestion classifier has a name guard
  and preserves existing components before proposing anything.
- User explicitly approved excluding barcode-derived matches/candidates below
  the existing name score threshold 0.35 from both automatic matching and
  suggestion calculation. Existing code/manual-alias rules and confirmed
  recipes are preserved; there is no batch remap or physical-stock mutation.
  The existing Luna/max agent is implementing this bounded change and unit
  regressions. The in-flight full PG run predates this new policy and cannot
  alone certify its final delta.
- Read-only production name-matcher probe finds `10429-1` as a candidate
  (score 0.5833), alongside `10061-1`, `9636-1`, and `9048-1`; do not force
  exactly two candidates or hardcode the user's suggested SKU. The water-gun
  candidate scores zero. The current matching dialog uses manual inventory
  search rather than the suggestion service, so backend candidate filtering
  must not be reported as verified automatic-candidate display in that UI.
- Current 57 configured Rocket options include four same-barcode pairs below
  0.35: slime/water gun and glow-necklace/toothbrush score zero; the longer
  parachute title and shark-bubble title score 0.3333 and 0.2581 against
  plausible matching inventory names. These are false-exclusion risks of the
  approved threshold, not proof that all four physical links are wrong.
  Preserve these cases for review; no silent threshold/scorer expansion.
- Approved barcode filter implementation is now present in seven focused
  Channels files. Main review removed redundant service filtering: the
  suggestion classifier owns candidate rejection, and automatic repository
  paths use the same threshold helper. Missing comparable names return null,
  not a fabricated zero mismatch. Main reran three unit files: 71/71 passed
  in 901ms, with diff check clean; scoped lint reported no errors (two existing
  import-order warnings). No UI recipe mutation was made.
- Real-PG delta coverage is still required. The preexisting duplicate-barcode
  fixture uses unrelated names; retain its ambiguity assertion with compatible
  names and add a separate rejection case rather than weakening the assertion.
  The same in-flight full PG handle is still live at 02:52Z; no restart or
  second PG suite was started. Its successful result, if any, will not alone
  certify the later barcode change. Latest API watch compilation is clean but
  its prior child is again in shutdown with port 4000 unavailable; restart
  only the task-owned QA API after the full test ends, then verify latest boot
  and actual UI behavior against the unchanged QA database.
- Full run ended at 02:54Z: 100/101 files and 806/807 tests passed in
  1,555.15s. The sole failure is Finance `profitability-evidence`'s mapping
  cutoff test: Prisma could not start a transaction within its acquisition
  limit at `MasterProductProfitabilityReadService.load`, before the assertions.
  No value mismatch was established. Retained server logs show no recovery/
  PANIC/OOM event; the cause of acquisition delay is unproven. Do not increase
  timeouts or mark the full gate passed. Rerun the unchanged Finance file
  alongside the new matching regressions, then complete the latest full gate.
- After verifying full-run termination, removed only the task-owned stalled
  QA launcher/child (53009/53161); the QA database, web and gateway remain.
  Leave API watch stopped while PG fixtures are edited/tested to avoid another
  concurrent recompilation, and restart the same launcher for the boot/UI gate.
  Matching PG regression implementation is now authorized in its two existing
  test files; no second PG process is running yet.
- The first focused run passed 21/22 tests, including both unchanged Finance
  tests. The new multi-component fixture failed before behavior assertions
  because it reused one master product for three inventory SKUs, violating the
  real unique constraint. Corrected only that fixture to use distinct master
  products and an unlinked multi-master listing; exact components, quantities,
  stock preservation and the unlinked listing remain asserted.
- Main reran all three focused files without test-name filtering: 22/22 passed
  in 33.96s at 03:04Z. The latest barcode/name rejection, compatible barcode
  nine-unit quantity, candidate exclusion, existing BOM preservation and
  unchanged Finance regressions now have actual PostgreSQL evidence. This is
  not a passing latest full-suite result. No schema, timeout or Finance
  production/test change was made to obtain this pass.
- Restarted the existing QA API launcher against the preserved port-56879
  database for the latest boot gate. Browser inspection found a foreground
  DevTools window belonging to other activity; no browser navigation, recipe
  selection or provider collection was performed during this checkpoint.
- Latest NestJS compilation reported zero errors and PID 62205 successfully
  started on port 4000 at 03:05:42Z. The intentionally unavailable isolated-QA
  image storage warning remains unchanged. Requested permission to switch away
  from the other foreground DevTools activity before continuing native UI QA;
  preserving all current browser and QA data. The full gate remains deferred
  until remaining actual QA and any resulting scoped fixes stabilize.
- Follow-up verification at 03:07Z: the cutover scanner passes with zero
  unowned producers, source-to-ABC references and legacy runtime references.
  Scoped ponytail review of the latest PostgreSQL fixture correction found
  no additional complexity requiring deletion. Read-only QA evidence still
  shows the last Sales attempt with zero staged facts; its stored RUNNING
  status does not establish live execution or completion after fixed expiry.
- While awaiting the foreground-browser handoff, started the latest complete
  PostgreSQL gate on a separate disposable database, instead of leaving all
  independent verification idle. This changes the preceding deferral order,
  not acceptance scope: no concurrent heavy build/new provider capture; any
  later production fix requires impact review and fresh applicable evidence.
  Log: `/tmp/kiditem-main-full-pg-barcode-20260909.log`. The run is pending,
  and actual matching/Sales/downstream UI acceptance remains incomplete.
- Read-only organization-scoped QA inventory confirms an important acceptance
  distinction: the one completed Wing catalog row is the designated workbook
  import from September 7, not successful browser full-catalog publication.
  The last real browser catalog attempt is still the recorded September 8
  HTTP 429 failure after 440/1,254 details. Do not substitute the import or
  successful Rocket catalog for this missing Wing journey. Campaign source
  has a failed attempt but no completed attempt in this QA organization;
  keyword/other absent source types also require their individual existing
  provider/configuration evidence, not a blanket collector-complete claim.
- The same full PostgreSQL run remains live; its current measurements include
  Rocket 4,000-row write 2,913ms/read 139ms and Wing 1,000-product/3,000-option
  finalization 1,537ms/full refresh 4,254ms. These are automated-test timings,
  not real-browser performance acceptance. No test result has been waived.
- Latest full gate terminated: 100/101 files and 810/811 tests passed in
  969.87 seconds. The sole failure is the Seller identity concurrent catalog/
  SERP test with `read ECONNRESET`, not an observed business-value mismatch.
  Retained PostgreSQL logs show no recovery-mode/PANIC/OOM/deadlock event.
  Main inspected installed SuperTest: an unlistening server is started by one
  request and closed when that request ends. This fixture has only app.init()
  and concurrent requests, including a nested two-request SERP publication.
- Authorized the existing Luna/max implementation agent to give only this
  fixture a suite-owned loopback listener and URL, retaining app.close() and
  all concurrency, HTTP and business assertions. This removes request-owned
  server shutdown from the experiment, not the concurrency under test. Run
  all nine focused tests; no production code, timeout, retry or skip changes.
  Full gate remains failed until a latest complete rerun passes.
- Seller identity focused PostgreSQL verification passed all nine tests in
  20.00 seconds on separate port 57001. Main inspected the terminal output
  and the complete 12-addition/9-replacement diff: only listener ownership and
  request URL changed; all parallel calls and assertions remain. Scoped lint
  has zero errors/two existing import-order warnings; main diff check passes.
- Started the complete latest 811-test gate after that focused run terminated,
  with no other test/build/provider capture in flight. Output is retained at
  `/tmp/kiditem-main-full-pg-identity-loopback-20260909.log`. Browser handoff
  is still unanswered, so existing user windows remain untouched. This run
  must finish before full-gate success can be claimed.
- Latest full PostgreSQL gate passed: 101/101 files, 811/811 tests, exit 0,
  1,061.29 seconds, ending at 03:44:39Z. The retained PostgreSQL log has normal
  shutdown and no recovery-mode/PANIC/OOM/deadlock report. This includes the
  current barcode policy/quantity regressions and the Seller identity
  suite-owned-listener correction; no timeout increase, retry or skip was used.
- At the post-test handoff, a fresh read-only native Chrome observation still
  shows the other foreground DevTools window. The earlier request to switch
  back to the existing QA tab remains unanswered. No window was closed or
  navigated, no source retried and no recipe was manually replaced. Latest
  full-test acceptance is now green, but real matching quantity/candidate
  behavior, Sales completion, Wing full-catalog publication and remaining
  downstream/collector acceptance still prevent overall completion. Keep this
  plan ACTIVE and preserve the existing environment for the browser handoff.
- Safe background access to the known QA tab was rechecked once and still
  returns `Debugger unattached`; native control would require switching away
  from the other active DevTools window. API port 4000 and web port 3000 are
  listening. Independent current-code gates are complete at this checkpoint;
  the repeatedly unanswered browser handoff now blocks further actual QA.
  Resume from the preserved environment when the user permits the switch;
  do not rerun these completed gates without a relevant subsequent change.
- User approved the browser handoff. Switched to the existing KidItem window,
  preserving DevTools and all other tabs. Pre-QA readback retained 745 recipe
  components and the exact 2,010-row physical-stock hash; mapping generation
  was 8 and ABC publication revision 1 at the September 7 cutoff.
- Selected only the real collected Rocket account and used normal automatic
  matching. The first click failed extension discovery before admitting any
  source attempt. One normal QA-page reload restored detection; no extension
  reinstall/reload or timeout change. New attempt
  `44050924-6ef5-48b3-80ce-9e749a1f37f7` completed 38,742 rows at 04:00:44Z
  after admission at 03:59:23Z. The UI reports zero newly linked products and
  eight automatically configured components. Physical stock hash is unchanged;
  component count remains 745, mapping generation advances to 9, and ABC
  publication revision/cutoff remain unchanged. The prior matching Alert stays
  RESOLVED; no new failure Alert was created for successful collection.
- Actual slime row `59167949` now displays deduction quantity 9 instead of
  1,350. It still links to `10054-1` water gun because approved existing-recipe
  preservation prevents replacement. Quantity QA passes, but existing wrong
  identity remediation and automatic-candidate UI behavior remain unresolved;
  do not claim the barcode filter removed past links or manually substitute
  `10429-1`. No recipe save or physical-stock mutation was performed.
- Continued independent Sales QA through the existing September selector and
  normal collect button. Track the newly admitted owner attempt to terminality;
  do not duplicate it or force the previous expired row's state directly.
- Sales attempt `1c0e5f3e-c3cd-4190-84ab-fd74286d928c` completed at
  04:04:05Z (admitted 04:03:55Z): 1,238 facts, 44 sellers, observed dates
  June 9–September 9. Normal admission settled previous expired `34216e8a`
  as FAILED; successful publication resolved the same Sales Alert with the
  new attempt ID. The normal September screen now shows the new capture time,
  Rocket KRW 42,476,602 / 43,339 units and other malls KRW 27,349,233 /
  36,769 units. This is actual extension -> owner -> Alert -> consumer UI
  evidence for Sales, not an Excel/DB-insertion substitute.
- Read-only September 1–9 reconciliation excludes the explicit coverage
  sentinel: 28 other malls and one Rocket seller, with exact UI revenue,
  quantity and cost totals. Dashboard reads the same KRW 69,825,835 revenue,
  80,108 units and KRW 45,479,204 cost. Missing current-period advertising
  remains unavailable profit, not zero advertising spend.
- Used the normal dashboard Wing daily collect button for September 1–8.
  Attempt `f36ba319-30f2-4dfc-9da3-d7db2aa98c29` completed 710 rows at
  04:09:15Z after admission at 04:08:43Z, with all eight dates in its fixed
  plan and parser `wing-traffic-daily-v2`. The existing Alert remains RESOLVED.
  Consumer reconciliation is still pending; do not duplicate this capture.
- Before post-publication screen readback, the QA tab unexpectedly returned
  to the earlier matching URL. Paused native clicks and asked whether the
  user is using the tab; continue scoped read-only server checks meanwhile.
- Actual authenticated dashboard consumer GET for September 1–8 returns
  HTTP 200, 8/8 completed dates and no missing dates. Its exact-period basis
  identifies `f36ba319` and five additive metrics all reconcile MATCHED:
  1,861 views, 214 cart adds, 72 orders, 457 units, KRW 575,920 revenue.
  Provider negative September 7 sales remain negative rather than clamped.
  The temporary read-only API session was logged out (204). Post-publication
  rendered-screen confirmation remains separate from this successful API gate.
- User approved continued native QA. Dashboard now renders latest collection
  COMPLETE, September 1–8 coverage 8/8, 72 orders, 457 units, 1,861 views,
  214 cart adds and 183.5 daily-average visitors at the new capture time.
  This closes Wing daily extension -> owner -> consumer -> screen acceptance.
- Campaign screen correctly distinguishes existing account-daily KPIs from
  absent campaign rows. Opened the existing readiness panel and retried normal
  advertising synchronization once after the prior date-picker failure.
  Follow this admitted attempt to terminality before any other provider capture;
  no advertising configuration/budget or live order mutation is authorized.
- Campaign retry `148bbdb1-d476-4995-8c99-a3193c111210` FAILED at
  05:10:56Z after 840 rows with `MANUAL_PRODUCT_GROUP_ROSTER_UNAVAILABLE`
  on the concentrated Wing campaign. Read-only actual source GET reports
  MISSING/latestAttempt FAILED/no latest COMPLETE; 30-day campaign GET still
  returns zero published rows. The same Alert is OPEN with this attempt ID.
  This failure is not a successful campaign publication or a proven repeat
  of the previous date-picker problem.
- Main found the manual metadata capture compared one settled grid page with
  the full API ad roster. Luna implementation reproduced the two-page fixture
  failure and reused the existing strict paginated collector; full metadata
  count and identity checks remain. Focused tests pass; main delta review and
  final integrated extension QA remain required before closing this defect.
- September 9 side-session investigation and explicit implementation approval
  are incorporated in both ACTIVE specs. Delegated only implementation to the
  existing Luna/max agents: Channels stage/wire; extension catalog capture;
  AI scoped provider-media publication; registered-product read/status UI.
  Main retains design, coordination, reviews and all browser/DB runtime gates.
- Pre-change actual consumer baseline at 05:22:49Z: 246 selling masters,
  first 50 all lack display images; 1,225 Wing listings, first 100 all lack
  thumbnail/workspace/price. Product data status keeps publication revision 1,
  mapping generation 9 and no actual ABC cutoff. Traffic basis advances to
  September 8 but the requested 30-day product range remains STALE; independent
  profitability/advertising bases remain September 7. These are preserved
  missing/stale facts, not authorization to fill them with zero or list totals.
  Read-only API session logout returned 204.
- Current catalog integration review found and routed three contract defects:
  detail document deduplication compared IDs as well as values; extension
  detail SKU used a field the server would strip; byte-only chunk partitioning
  omitted the server's 20-product count limit. Required fixes retain the
  existing wire and do not relax its size or completeness bounds.
- Detail documents now retain each observed field's complete JSON value,
  including null, empty arrays, array order and duplicates; only unobserved
  fields are omitted. Main reran both focused collector files: 15/15 tests
  passed with no skips. The current 73-option repeated-document test is a
  small synthetic case, not the observed 1.38 MB response or proof of all
  74 unique image associations. A representative large synthetic regression
  and actual full-stage collection remain required.
- Existing QA Chrome tabs remain listed, but the main matching tab returns
  `Debugger unattached` and native Chrome inspection returns an empty window
  tree. No tabs, profiles or QA data were reset. Continue implementation and
  integrated tests independently; rendered-screen acceptance remains pending.
- Main reran the campaign-source regression after adding a two-page report
  whose Next button is disabled on page one: 10/10 pass, no skips. The strict
  pagination helper rejects navigation and metadata remains fail-closed;
  this is fixture evidence, not a successful retry of real attempt `148bbdb1`.
- Media review found that asset provenance alone cannot distinguish automatic
  provider-thumbnail selection from an operator selecting that same provider
  asset. Preserve the approved operator-selection contract; compare a scoped
  existing-metadata marker with conservative pointer preservation/read fallback
  before changing the implementation. No schema or materialization worker
  expansion has been approved as part of this review.
- The user's later minimum-principles update supersedes whole-detail atomic
  publication: persist each successful complete product and its chunk receipt
  in one owner transaction; final attempt COMPLETE still requires all products.
  Preserve failed/missing fields and meaning-unverified null/empty values, and
  add no generic queue, field-freshness system, conflict/history/reason feature
  or automatic replacement of confirmed matching. Both ACTIVE specs and the
  execution constraints now record this newer contract.
- Main reran catalog collector/publication regression files: 79/79 tests pass,
  no skips. The large synthetic case now covers 73 options, 74 unique URLs,
  1,022 notices and 1,168 tags; source JSON exceeds 1 MB and normalized payload
  stays below 512 KiB with exact document/option/media associations. The worker
  sends a successful detail product before requesting the next product, and
  the owner-pause fixture protects local-state-loss/restart. Positive Retry-After
  and bounded JSON transport cases are being added; actual provider QA remains
  unexecuted for this new staged path.
- Review caught the AI marker implementation in the wrong checkout. Main
  verified the two affected files were clean before that agent's edits, reviewed
  the exact inverse hunks, rechecked that they had not changed and restored only
  those hunks with a patch. Both files are clean again in the original checkout;
  unrelated user changes and all databases were untouched. Reimplementation
  now targets only the designated hard-cutover checkout and AI-owned tests.
- Incremental-detail review also requires compact status/receipt reads: do not
  load and reparse every previous detail payload on each single-product PUT or
  two-second poll. Reuse the existing chunk ledger/metadata projection, not a
  new counter authority or larger timeout. Reconcile only observed media scopes;
  a nonempty option-media list does not prove missing detail-media is absent.
- September 9 follow-up integration review: main reran the current catalog
  collection-status and listing-query suites, 14/14 passing. Workspace source
  detail now reads the actual writer shape (`detailDocuments` and option
  `detailDocumentIds`), and provider images come from AI-owned assets rather
  than guessed raw aliases. Paginated list reads remain lean. The implementer
  separately reports the affected detail-page suite passing 2/2; these are
  focused tests, not rendered-screen acceptance or a full build.
- Remaining preservation defects are assigned before QA: merge documents by
  option and kind, retain unverified missing/null values, preserve stable option
  identity and confirmed recipes, and reconcile only observed option-image
  associations. Role-only media reconciliation is insufficient when one option
  has images and another option is unobserved. No new generic field-state
  system is authorized.
- Rate-limit pause implementation and compact-status regression coverage remain
  in progress. Full payload reads are now deferred to ready/final validation;
  tests must prove compact/full status parity and avoid full reads while running.
  Latest integrated PostgreSQL tests, backend boot, web build and actual staged
  extension-to-owner-to-screen acceptance remain pending. No database reset,
  deployment or commerce action occurred in this follow-up.
- Main additionally ran the whole registered-products focused directory: 9
  files, 49 tests passed. Current `check:operation-automation-cutover` reports
  zero findings, `check:idor` passes its 70 raw-query files, and
  `check:tenant-scope` passes. These scanners cover their advertised patterns,
  not full runtime correctness. Integration review also found an optional
  publication dependency that silently skips incremental detail writes when
  absent; require that dependency and align test construction before accepting
  the new atomic publication contract.
- The consumer-source scan found legacy-only predicates still present in
  matching, its row-lock admission, Sellpia manual-match targets and readiness.
  Their correction is separately assigned from pause/publication work. A
  completed basics snapshot must remain usable for matching during a later
  running/failed detail attempt without declaring that detail stage complete.
  Nullable inventory fallback identities must not masquerade as real Wing
  vendor item IDs in coverage calculations.
- Main reran the collector/publication pair after the pause-message correction;
  both files pass. The new tests bound diagnostics to the server's 1,000-char
  schema and prove an owner-accepted future not-before survives loss of the
  local pause marker without provider IO. Media review additionally requires
  preserving unobserved associations for both detail and option image roles,
  and not reactivating already source-inactive assets merely because their
  options were unobserved. These corrections are not yet PostgreSQL-verified.
- Verified identity promotion must preserve the existing option database row
  and its recipe/foreign-key links. A unique same-listing inventory relation
  may update its provider external ID; exact-ID conflicts or ambiguous relation
  matches fail before writes. The existing AI publication port must atomically
  remap that option's provider-image associations in the same basics transaction,
  including inactive preserved assets without reactivating them. This is a
  narrow identity-preservation parameter, not a new alias ledger or runtime.
- A backend implementer ran the repository PostgreSQL suite before main's
  coordination gate. Main stopped further delegated DB/build runs. Reported
  evidence is 10 tests on `localhost:57011/kiditem_test`; main verified that the
  integration configuration forces a fresh Testcontainers URI for schema push
  and test setup, then automatically stops it. Current Docker inventory has
  only the existing QA PostgreSQL on 56879, operating PostgreSQL on 5433 and
  MinIO; no test container remains. This focused delegated result does not
  replace the required latest full main-controlled PostgreSQL verification.
- Main's latest gates pass: catalog controller/service/listing-query tests
  23/23; shared catalog/browser/source-import schema tests 29/29; full web
  production build exit 0, including TypeScript and all 46 static pages.
  Backend identity/media changes remain in progress, so current server boot
  and full PostgreSQL acceptance have not yet been claimed.
- The first full extension run exposed a real cold-boot defect: the collector
  declared revision 3 while the service-worker import cache key and Coupang
  worker guard still expected revision 2. The correction keeps the guard and
  ties all three values together in regression coverage. Main's complete
  extension rerun now passes 984/984 with zero skips/cancellations; log:
  `/tmp/kiditem-main-extension-staged-catalog-20260909-0650.log`. Canonical
  adapter synchronization, both worker syntax checks, manifest JSON parsing and
  extension diff checks pass. Actual unpacked load remains pending.
- Read-only QA preflight (`transaction_read_only=on`) confirms the preserved
  56879 database already has `channel_scrape_chunks.published_at` and
  `publication_json`; no schema reset/push is needed for those columns. Existing
  browser tabs remain present, but the matching tab still reports debugger
  unattached and native Chrome provides no actionable tree. No navigation,
  reload, new profile or provider collection was attempted during preflight.
- User brought the existing Chrome QA window forward and approved tidying
  unnecessary windows. Native accessibility is now actionable; direct tab
  attachment still reports `Debugger unattached`. Inspected KIDITEM OS's
  retained errors: rank-batch transport `Failed to fetch` and a back/forward
  cache port closure. These are observations, not proof of a current source
  failure. No error records were cleared. Closed one duplicate extensions
  management tab; provider and QA tabs/session data remain intact.
- Main reran the latest identity-upsert, listing-row-lock, product-matching
  repository and readiness focused tests: 4 files, 32 tests passed. Consumer
  review identified missing real-PG coverage for complete basics followed by
  running/partial/failed details retaining matching eligibility. A Luna/max
  implementation follow-up is adding that fixture without starting a DB;
  main retains control of the pending full integration invocation.
- Latest backend `npm run build --workspace=apps/server` exits 0. IDOR and
  tenant-scope scanners pass; cutover scanner reports zero unowned producers,
  source-to-ABC references and legacy runtime references. Whole-worktree
  `git diff --check` is clean. These checks do not replace the pending Nest
  runtime boot or complete PostgreSQL gate.
- Existing native matching tab is readable and retains the prior Rocket
  187-row / 57 matched summary. API port 4000 currently has no listener, while
  the existing web listener remains on 3000. Treat this as retained browser
  state, not a fresh API/consumer acceptance result. Keep the API watcher
  stopped during fixture edits and restore the existing QA launcher after
  the main-controlled integration gate; no repeated matching/import was run.
- Main re-read the active parent and collection amendment and reviewed latest
  identity/media seams. Found an incoming-media remap defect: the existing
  asset metadata sweep could normalize an old option ID, then reconciliation
  could restore that old ID from the same request. AI now normalizes incoming
  associations before deduplication and scope reconciliation; the existing
  real-PG cross-scope fixture exercises this exact primary-image case.
  PostgreSQL execution of that fixture remains pending, not passed.
- Scoped ponytail finding removed duplicate incoming-ID normalization from
  the Channels detail publisher. Channels supplies the verified identity map;
  AI owns applying it to incoming and persisted media associations. No new
  alias store, runtime or publication authority was added. Both changed
  surfaces pass focused lint and whitespace checks; full integration and
  runtime boot must include this latest production delta.
- The two-product owner HTTP regression fixture is frozen. It reuses the
  exact completed basics manifest, publishes P1 detail while P2 remains
  unobserved, then checks actual matching availability, row-lock admission
  and manual-match alias publication for both RUNNING and post-publication
  FAILED detail attempts. P2 retains its basics provenance. Static checks pass.
- Main started the complete PostgreSQL suite with all current changes:
  `/tmp/kiditem-main-full-pg-staged-catalog-20260909-0710.log`. The runner created
  disposable PostgreSQL `ec454a09320b` on port 57013 and applied the schema
  there successfully. Preserved QA 56879 and operating 5433 were not reset or
  changed. The test process is still running; no passing result is claimed.
  Latest backend build after the media fix and focused identity tests (9/9)
  pass. No concurrent provider capture or heavy build runs.
- Process inspection corrects the earlier API-stopped assumption: port 4000
  has no listener, but the original QA launcher PID 61973, Nest watcher 62089
  and child 62205 still exist, currently idle. No code edits occur during this
  integration run. After the run, stop only this verified task-owned process
  tree and reuse `/tmp/kiditem-qa-rebuild-0907.FfFw2I/start-api.cjs` for a fresh
  boot. Its inspected configuration still explicitly targets QA port 56879.
  Do not infer process termination from an absent HTTP listener.
- Full main PostgreSQL run terminated with exit 1: 101 files, 822 passed / 4
  failed of 826 tests, duration 916.54 s. Disposable PostgreSQL 57013 was
  automatically removed; preserved QA and operating databases remain.
  Detailed errors are retained in the log above. This is a failed full gate.
- Three media failures assert `isDeleted` on the public asset-library projection,
  which does not return that field; association/active metadata matches. Keep
  those public-read assertions and verify non-deletion separately on the exact
  organization-scoped persisted asset IDs. Do not expand the public projection
  or remove the preservation assertion merely to pass.
- The fourth failure is a production regression: the new pause-aware same-key
  begin path applies the writable-running check to expired replay, returning
  409 instead of the existing effective FAILED receipt. Restore read-only
  expired replay without clearing attention, extending expiry or reopening
  provider IO; retain all unexpired explicit-resume fences. Bounded Luna/max
  fixes are assigned; main will run focused PG and then a new full gate.
- After terminal verification, sent SIGTERM only to the verified task-owned
  QA launcher PID 61973. Its old child 62205 became orphaned; recheck graceful
  termination before any further process action. No QA data reset, browser
  recollection or fresh API boot occurred during the failed full run.
- Main verified the media fixture correction: public gallery URLs, active
  metadata and option associations remain asserted; each retained asset's
  `isDeleted: false` is now checked using its exact composite ID/organization
  in PostgreSQL. No media production contract changed for these three failures.
- The old QA launcher/watcher exited after SIGTERM; orphaned child 62205 did
  not exit after a further direct SIGTERM and still had no port-4000 listener.
  Killed only that verified child, then confirmed the entire named process
  tree absent. Existing web, Gateway and QA/operating DB containers remain.
  No API restart is claimed yet; keep it stopped during pending PG reruns.
- Main rejected a newly added fake-Prisma call-count regression in favor of
  the active owner-interface test contract. The same-key expiry fix now has
  real PostgreSQL paused-expiry preservation coverage in the existing
  collection repository suite; the newly introduced fake test file is removed.
- Main focused PostgreSQL rerun passes all 36 tests in the three affected
  files (media publication, catalog owner HTTP, collection repository), with
  zero skips: `/tmp/kiditem-main-focused-pg-catalog-replay-20260909-0725.log`,
  duration 33.99 s. It used disposable port 57015, not either preserved DB.
  This establishes the failure corrections but is not a full-suite pass.
- Started a fresh complete PostgreSQL gate on the frozen corrected code:
  `/tmp/kiditem-main-full-pg-catalog-replay-20260909-0727.log`. Keep API watcher,
  heavy builds and new provider capture stopped until its terminal result.
- The corrected full PostgreSQL gate completed with exit 0: all 101 files and
  827 tests passed, zero skips, duration 959.10 s. Its disposable PostgreSQL
  container on port 57017 was removed; preserved QA 56879 and operating 5433
  remain. This supersedes the failed 822/826 full result for the corrected code.
- Native Chrome confirms the existing enabled KIDITEM OS installation loads
  `kiditem-pr493-hard-cutover/extensions/kiditem-os`; provider tabs, existing
  matching data and extension error records remain untouched. Extension reload
  and actual staged catalog acceptance are still pending.
- After confirming port 4000 had no listener, started the inspected existing
  QA launcher against preserved QA 56879. Current boot log:
  `/tmp/kiditem-main-api-catalog-replay-20260909-0743.log`. Confirm compilation
  and Nest boot before beginning actual extension capture; no schema reset.
- Latest QA API boot passed: compiler reports 0 errors and Nest successfully
  started at 16:44:01 KST (PID 40826). Product/data-status/listing and campaign
  consumer GETs return 200 through the existing QA-login observer. Baseline:
  246 selling masters, 1,225 Wing listings; all 100 sampled Wing listings lack
  thumbnail/workspace/price, and all 50 sampled masters lack display images.
  Existing source stale/missing states remain explicit; no ABC recalculation.
- Reloaded the existing unpacked KIDITEM OS installation and refreshed the
  initiating QA page. Fresh matching UI retains 187 Rocket rows, 57 matched
  products/recipes and zero quantity-review rows. Proceeding to catalog UI;
  no new provider attempt has started yet.
- Actual registered-products UI exposed an environment mismatch before any
  new capture: the long-running Next process PID 48205 predates the latest
  15:39 build and still served the old all-or-nothing catalog panel. Source
  and built assets contain the new staged panel. Stopped only that task-owned
  web process, confirmed port 3000 free, and restarted the existing same
  worktree/build with its original proxy/API environment. Web reports Ready
  in 263 ms; log `/tmp/kiditem-main-web-catalog-stages-20260909-0747.log`.
  No rebuild, DB reset, browser replacement or provider mutation was needed.
- Further QA exposed a build-time environment mismatch: after reload the new
  web login returned 404, while direct API login remained valid. The built
  routes manifest has only CopilotKit rewrites, not the previously used QA
  `/api/:path*` proxy. `NEXT_PUBLIC_API_URL` and `KIDITEM_PROXY_ALL_API` are
  build-time configuration; setting them only on `next start` cannot repair
  that artifact. The initial no-rebuild conclusion above is superseded by
  this observed failure. Stopped only replacement web PID 41655 and rebuilt
  with the original QA values (`http://localhost:4000`, proxy enabled).
  Build log: `/tmp/kiditem-main-web-qa-proxy-build-20260909-0750.log`.
  No application-code, schema or source-data changes; actual collection is
  still not started. Preserve the passed 827-test backend gate.
- QA-configured web build completed with exit 0; inspected generated rewrites
  now include `/api/:path*` to `http://localhost:4000/api/:path*`. Restarted
  that build with the same settings; log
  `/tmp/kiditem-main-web-qa-proxy-start-20260909-0751.log`.
- Before new capture, the read-only preserved-QA observer records 745 recipe
  components (SHA-256 `7e5179cab5a23b22319d95f69afa92758c058b7bde29bbebbb3c6f338a323fa1`)
  and 2,010 stock rows (`d353a3441b17c657fa412c3e9049f7a6a069ff8c220287016779da4a8c07d962`).
  ABC publication remains revision 1, mapping generation 9. Extended only
  this private read-only observer to include both new catalog source kinds;
  it still cannot write to PostgreSQL.
- Latest native QA login and staged panel now work. Started basics through the
  actual registered-products button at 07:51:25 UTC: attempt
  `8d0fd86d-0e98-406b-a4af-f57b574bb1a4`. The extension captured and stored one
  500-product discovery page, then failed the first basics chunk at 07:52:14
  with `SOURCE_OWNER_REQUEST_FAILED`: `Chunk checksum does not match its canonical payload`.
  Owner GET confirms terminal FAILED and one OPEN source Alert. Listings,
  options, all recipe/stock hashes and ABC publication remain unchanged.
- Main isolated the wire mismatch: `buildCatalogBasicProduct` emits a top-level
  `saleStatus` absent from `CoupangCatalogBasicProductV1Schema`; parsing strips
  it before the server hashes the payload. Discovery and `raw.saleStatus`
  already preserve the same sale-state evidence. Assigned a bounded Luna/max
  extension correction plus actual collector-to-shared-schema checksum
  roundtrips for basics and normalized details. Preserve the checksum guard
  and schema; do not accept arbitrary extra fields or restart this FAILED
  attempt. No new capture until the corrected wire regression passes.
- A temporary worker DevTools window showed only installation/BFcache messages,
  then lost its selected worker context; closed only that newly opened
  diagnostic window. Native Chrome remains usable. No browser data/error
  cleanup or provider mutation was performed.
- Main reviewed the bounded checksum fix: remove only redundant top-level
  `saleStatus`, retain discovery and raw sale-state evidence, and exercise
  both production collector outputs through the shared chunk schema without
  checksum changes. No schema widening, passthrough or checksum bypass.
  Normal and ponytail review found no further issue in this correction.
  Main rerun: focused collector/publication 93/93; complete extension suite
  986/986 (427 root tests + 559 nested tests), no failures/skips; adapter
  synchronization, collector syntax and extension diff checks pass.
  Logs: `/tmp/kiditem-extension-suite-20260909-0802.log` and
  `/tmp/kiditem-extension-nested-20260909-0800.log`.
- Reloaded only installed KIDITEM OS and refreshed the existing QA page.
  A new explicit basics attempt `b2f985c9-4d55-4e59-8332-8e9ece04a82f`
  started via the actual button at 08:00:18 UTC. At 08:01:14 the owner has
  accepted 3 discovery pages (1,254 products), 63 basics chunks (1,254
  products), and final manifest confirmation; still RUNNING before atomic
  publication. Existing listing counts and recipe/stock/ABC preservation
  hashes remain unchanged. No retries of terminal failed attempts.
- Basics terminal evidence at 08:01:21 UTC: COMPLETE, 1,254 products, 2,271
  options, 1,254 representative images. Native UI updated without a reload;
  ordinary owner/listing GETs are 200, first 100 Wing listings now have image,
  workspace and representative price. Combined Wing/Rocket totals become
  1,441 listings and 2,458 options. The basics failure Alert is RESOLVED.
  The same 745 recipe components and 2,010 physical-stock rows retain their
  exact hashes. Mapping generation advances 9 to 10; ABC publication stays
  revision 1 and September 7 cutoff, correctly becoming stale rather than
  being implicitly recalculated. Active masters now total 255; first-page
  image fallbacks improve from 0/50 to 37/50 (remaining missing images are
  not treated as a full-media failure without their source evidence).
- Started full details through its separate native button at 08:02:03 UTC:
  `4b2bcd49-a40b-44fe-9492-3dd3fdc57bd3`. At 08:04:39, 45/1,254 detail
  products have accepted receipts and all 45 have `publishedAt`, proving
  per-product publication while the overall owner remains RUNNING. Preserve
  this live attempt; no extension reload or API restart during collection.
- Actual QA exposed three display-contract defects, not publication failures:
  basics progress/ETA and hydration badge still say detail collection;
  `publicStatus` emits `nextAllowedAt` absent from strict browser-status schema,
  hiding active status and showing a spurious resume button; server progress
  reports all published counts as zero until COMPLETE despite published
  detail receipts. Main assigned UI wording to the existing extension agent
  and receipt-derived server progress to the existing owner-test agent
  (both Luna/max, separate paths). Browser-status correction is queued;
  preserve strict parsing and owner-authoritative pause time. No speculative
  state authority or collection-policy change. Main will review and verify
  these corrections after the current actual collector reaches a safe stop.
- UI wording correction passes main's 19 focused tests. Browser-status
  correction removes only the extra public `nextAllowedAt`, preserving
  internal throttling and owner pause evidence; producer-to-shared-schema
  regressions cover RUNNING, paused and COMPLETE. Main focused publication
  tests pass 80/80 and latest complete extension suite passes 990/990 with
  no skips (`/tmp/kiditem-extension-final-wire-20260909-0811.log`). These
  web/extension changes are not reloaded during the live capture.
- Environment incident: the backend source edit triggered existing Nest
  `--watch` recompilation at 08:08:36 (zero errors at 08:08:44). Old child
  PID 40826 stopped listening but hung during shutdown; capture stayed at
  143 accepted/published products. After verifying the exact stuck child and
  missing listener, main terminated only that child; the existing watcher
  started PID 47345 and confirmed Nest boot at 08:10:41. Same attempt resumed
  automatically without a new start/reload, reaching 187/1,254 published
  products at 08:12:23. Recipe/stock hashes remain exact. Future source edits
  are held until a safe stop; excluded test files may be completed separately.
- Actual owner GET after recovery reports RUNNING with 150 published products,
  159 options and 578 media, rather than a false zero, at 08:10:56. Latest
  backend progress regression helpers remain under completion; latest full PG
  gate and compact-projection duplication review are still outstanding.
- Native screen evidence: registered cards show new representative images;
  Product Hub shows 255 active inventory products and 728 active channel
  listings (541 Wing + 187 Rocket), with missing/stale metrics left explicit.
  Matching shows images, retained links and no quantity-review items. Expanded
  matched Catchball option 100498 retains Sellpia SKU 925-1, deduction 1 and
  available quantity 368. Selected source-detail view and final full-detail
  acceptance are not yet verified. No matching/upload action was performed.
- 2026-09-09 08:25 UTC follow-up: the same detail attempt
  `4b2bcd49-a40b-44fe-9492-3dd3fdc57bd3` remains RUNNING, with 474/1,254
  detail receipts accepted and all 474 published. Recipe and stock hashes,
  mapping generation 10 and ABC publication revision 1 remain unchanged.
  Normal authenticated listing search and workspace GET for product 732302706
  returned HTTP 200: one listing, one option, seven provider documents and
  three media (two detail media plus one basic image). This verifies a sampled
  consumer path, not full-detail completeness or the selected-detail UI.
- Actual ad-campaign retry `629b2040-a455-4037-b0a8-099a6d8dabc5` advanced
  beyond the prior manual-product roster failure, then FAILED at 1,536 rows
  with `AD_CAMPAIGN_COLLECTION_FAILED` (repeated navigation position).
  Read-only owner control shows 61 receipts: one dashboard page, four campaign
  descriptors, 55 campaign days and one auxiliary-keyword receipt. The daily
  split is 31 completed days for campaign 105265277 and 24 for 104640375.
  No complete campaign snapshot was published. Do not retry this terminal
  attempt or weaken the stalled-navigation guard.
- Main's code trace identified an unverified resume risk: frozen dashboard
  rows retain initially missing identities while accepted campaign identities
  are used to rebuild completed-day/seen sets separately. Local completed
  navigation keys currently bridge these representations. The actual failure
  is not yet causally attributed to this gap; no speculative patch was made.
  Existing ad report/source focused tests passed 99/99, zero skips, on this
  follow-up. Their single linked-campaign DOM fixture does not establish the
  real multi-campaign, linkless-row, full-document resume behavior.
- Browser QA limitation: Chrome accessibility exposed only a three-item
  sales-goal menu, screenshots were unavailable, and the managed debugger
  connection had failed. Native clicks remain paused pending whether the user
  is using Chrome. Read-only tab inventory subsequently no longer listed the
  failed ad tab; the Wing and QA dashboard tabs remain. Existing browser,
  extension, API, web and isolated QA DB are preserved. Overall status remains
  incomplete; actual advertising recovery, full detail acceptance and final
  integrated gates are still required.
- 2026-09-09 08:34 UTC independent verification continuation: cutover scanner,
  Agent OS contraction enforce and frontend DB-boundary gates pass with zero
  findings. Reconstruction guard against `origin/develop` passes. Release guard
  fails because inherited commit `5b154ca03` adds
  `v0.1.30:006_delete_legacy_channel_derived_master_products` while root VERSION
  is 0.1.31. That migration file is unmodified in the working tree. A strictly
  read-only lookup in the local operating replica returned no matching ledger
  record; this does not prove it was never applied in Office. Requested the
  operator's execution history before renaming or editing migration identity.
  No migration was run or changed, and the gate remains failed.
- Latest full PostgreSQL suite started through the existing Testcontainers
  lifecycle on its own port 57019 (terminal session 53728); schema preparation
  succeeded and tests are running. QA port 56879 and operating replica 5433
  are not test targets. Terminal result is pending, so this is not a pass.
- The existing Luna/max implementation agent is adding test-only coverage for
  multiple linkless campaigns and content-document recreation to the existing
  campaign DOM harness. Production changes, browser reload and policy changes
  remain outside that assignment; main owns diagnosis and review.
- Read-only live detail receipt timing at 652 published products: mean 352.0ms,
  p95 860.9ms, max 4,146.0ms from `created_at` to `published_at`. These are
  persisted server interval observations, not provider-fetch, browser round-trip
  or commit-visibility latency. Main reviewed the latest progress helper's
  compact/full-payload equivalence coverage and publication-only filtering;
  no concrete over-engineering removal was identified in this bounded delta.
- Linkless regression implementation and main review are complete. The existing
  campaign source test now recreates VM/DOM contexts on dashboard/detail
  navigation, retains owner receipts/session storage, drops local seen/progress
  once, and verifies two campaigns' exact 12+12+7 day slices, 62 unique daily
  receipts and exact product identities without duplicate/fabricated rows.
  Main rerun passes 11/11 source tests, zero skips. This does not reproduce
  the live stalled-navigation failure, and the harness does not exercise the
  background worker's actual navigation/error-transition loop. The proposed
  frozen-row identity gap is therefore not a confirmed cause; no production
  patch was made on that hypothesis. Actual failure diagnostics remain open.
- 2026-09-09 08:40:36 UTC actual Wing detail attempt
  `4b2bcd49-a40b-44fe-9492-3dd3fdc57bd3` terminalized FAILED on product
  11146359213: media exceeds the current limit. All 815 accepted detail
  products remain published. Normal authenticated owner GET at 08:45 returns
  FAILED/hydration with 815 published products, 1,177 options and 2,895 media;
  the details failure Alert is OPEN for that exact attempt. Basics remains
  COMPLETE. Recipe/stock hashes and ABC revision remain unchanged. Do not
  resume the terminal attempt or call partial enrichment full completion.
- Read-only basics data identifies the failed product as the 73-option
  Halloween assortment. The current detail normalizer and shared schema both
  cap the product-wide role+URL media union at 100, although that union retains
  multiple option owners. The existing 73-option test contains only one shared
  detail URL plus 73 option URLs and cannot cover this boundary. A new explicitly
  synthetic reproducer has 74 distinct detail URLs and 73 option URLs (147
  normalized entries), with only three media per option. It confirms the
  current cap error and exact input-known associations. Main collector rerun
  passes 18/18, including this failure-characterization test; this is not a fix
  or proof of the failed product's exact provider media counts.
- Bounded repair proposal sent for approval: enforce the existing 100-entry
  limit per option owner (and separately for unassociated product media),
  retaining product 512KiB/chunk 1MiB limits, role+URL deduplication and exact
  owner associations. No production/schema/limit change has been made pending
  that decision. Actual failed-product inspection and installed-extension QA
  are still required. Browser-use and migration-execution questions remain
  pending, while full PG session 53728 continues independently.
- The user approved the proposed per-owner media bound at 08:51 UTC. The
  ACTIVE collection-deepening spec now states the exact option/unassociated
  owner counting rule and unchanged byte limits. Preparation occurred outside
  the repository while the existing PG run finished; no running test was
  deliberately switched to the proposed shared schema midway.
- Full PG session 53728 finished with exit 0: **101 files / 827 tests passed**,
  duration 1,908.01 seconds. This is the complete pre-media-fix baseline, not
  the final post-fix gate. The repository freeze was then lifted for the
  already-approved bounded extension/shared-schema repair and its focused
  regressions. Actual advertising failure, release migration decision and
  browser connection remain separate outstanding issues.
- 2026-09-09 09:16 UTC approved media-bound repair is implemented in the
  detail normalizer and shared ingress schema. The normalizer counts each
  role+URL entry against its referenced option owners; the schema additionally
  validates unassociated and unknown owners at the untrusted boundary. Main
  correctness review retained the 512KiB product/1MiB chunk and document limits.
  The bounded Ponytail pass removed unreachable producer-side duplicate
  validation; no new generic layer or storage authority was introduced.
- Post-fix shared build and independent shared schema tests pass (10/10).
  Extension collector tests pass 19/19 after rebuilding the previously stale
  shared distribution. Full extension gates pass 433 top-level plus 560 nested
  tests (993 total), with zero failures/skips; generated adapter equality,
  worker syntax, manifest JSON and diff whitespace checks also pass. Cutover
  scanner reports zero unowned producers, Source-to-ABC and legacy runtime
  references. The 147-media/73-option regression is synthetic evidence, not
  a measurement of the actual failed Wing product's media count.
- Latest web production build passes. Shared output replacement left the old
  Nest watcher without a listener despite its final zero-error compilation;
  main restarted only that task-owned API chain using the existing QA launcher
  and unchanged port-56879 DB. Nest reports successful boot at 09:12:57 UTC.
  The existing web service was restarted with the rebuilt output. Ports 4000
  and 3000 respond (unauthenticated readiness 401, dashboard redirect 307).
  These are runtime checks, not authenticated UI acceptance. The deliberately
  disabled isolated-QA object-store warning remains expected.
- Read-only QA preservation check at 09:15 UTC confirms all 815 accepted
  detail chunks still published, basics COMPLETE, and the detail failure Alert
  still OPEN. The 745 recipe rows and 2,010 stock rows have unchanged hashes;
  ABC mapping generation 10/publication revision 1 are unchanged. No operating
  replica mutation, migration, provider mutation or replacement collection ran.
- A new owner HTTP + disposable-PG regression submits modern multi-owner media
  payloads (two options, 60 media each), checks 120 canonical ContentAssets,
  exact associations/publication progress and exact receipt replay. First run
  passed 13 existing tests; the new test reached 120 persisted assets but failed
  on unsupported Chai matcher `toHaveSize`. Only that matcher was corrected
  to a Set.size assertion; the full focused file rerun is pending. The first
  run's disposable port 57021 was separate from QA and operating databases.
- Browser inventory itself now times out (30 seconds), in addition to the
  earlier tab-attachment failures. No repeated attach loop, user-tab navigation,
  new browser/profile, or extension reload was attempted. Installed-extension
  media/status fixes, actual Wing retry and advertising stalled-navigation
  diagnosis remain blocked on usable browser access. The final post-fix full
  PG gate and actual extension-to-owner-to-screen acceptance remain outstanding;
  neither this repair nor the whole hard cutover is marked complete.
- Focused owner HTTP + PG rerun finished at 09:17 UTC with exit 0:
  **14/14 tests passed**, including all 120 media assets, exact per-option
  associations, publication progress and unchanged canonical rows/receipts on
  replay. Duration 43.14 seconds; isolated port 57023 used the normal automatic
  teardown lifecycle. This is a focused post-fix pass, not a replacement for
  the final full PostgreSQL and installed-extension QA gates.
- 2026-09-09 09:18 UTC continuation: started the complete post-media-fix
  PostgreSQL gate through the existing Testcontainers lifecycle (session 82879,
  isolated port 57025). Schema preparation passed; terminal result is pending.
  No QA/operating DB reset occurred. Production/shared/server files remain
  unchanged while this gate runs.
- Main narrowed an advertising liveness hypothesis in the actual worker:
  `reportCollectionTargetProgress` persists attempt/environment/tab-correlated
  progress before content full-document navigation, but `sendManualSync`'s
  closed-channel recovery returns a resume response without that progress.
  `collectTarget` then judges advancement only from the response, not the
  correlated session. This may falsely trip the unchanged-transition guard;
  it is not yet attributed to the actual failed attempt. The existing Luna/max
  agent is adding a test-only characterization through the real
  `reportProgress` and `collectCampaigns` entrypoints, including an unchanged
  progress case. That extension test file is not a dependency of the running
  PG suite. No production fix, retry-limit increase or browser action is
  authorized by the hypothesis alone.
- Main rejected the first advertising characterization as insufficient: its
  last reports repeated 62/62, which could represent a genuine stall. The
  corrected synthetic sequence advances 12→24→31→43→55→62 across two campaigns
  and same-dashboard channel closures. Current production stops at 55 before
  consuming the sixth response's terminal receipt, while session progress is
  55/62 and result progress is null. Independent focused rerun passes 15/15
  characterization/guard tests. Actual failed-attempt attribution remains
  provisional, despite its matching 31+24 accepted-day count.
- The user explicitly approved the bounded advertising repair: reuse the
  existing correlated session progress during campaign closed-channel recovery,
  preserve unchanged-progress rejection, owner fences and retry limits, and
  retain the terminal receipt requirement. Luna/max is implementing only the
  collector and its existing Node test; main reviews and verifies the change.
- The user confirmed Chrome was not in use and authorized continued QA screen
  control. Native Chrome access recovered. Main verified the installed
  KIDITEM ID and exact hard-cutover worktree load path, inspected existing
  errors without clearing them, and confirmed a successful reload of the
  media/status fixes. Existing errors included a rank transport failure and
  an uncorrelated BFCache channel-closure entry; neither proves the advertising
  attempt's cause.
- Existing local QA login was restored without changing credentials or saving
  a password. Input retries initially returned 401; a scoped read-only check
  confirmed the saved QA credential matches its hash, and corrected native paste
  succeeded. Registered-products UI proves basics COMPLETE at 1,254 products
  and 2,271 options, and details FAILED with 815/1,254 enriched products,
  1,177 options and 2,895 images, retaining old details for unfinished products.
- At 09:33:11 UTC main clicked only the details start control. New owner attempt
  `7f456438-d327-4258-8773-38662f3d1d88` is RUNNING but has zero receipts: the
  UI reports missing extension connection and offers Resume. Basics was not
  recollected and the previous terminal attempt was not resumed. Page refresh
  is being checked; reuse this exact new attempt after connection recovery,
  rather than creating another one. No provider collection success is claimed.
- Main verified the approved advertising recovery delta: only campaign closed-
  channel recovery returns normalized progress from the existing correlated
  session after navigation readiness. No retry limits, terminal receipt rules,
  source ownership or new progress storage were introduced. Independent focused
  tests pass 16/16, including advancing 12→24→31→43→55→62, owner loss after
  readiness, and unchanged-progress termination after five sends. Full extension
  Node tests (`extensions/tests/*.test.mjs` and one-level suites, dot reporter)
  completed with exit 0; `git diff --check` also passed. Ponytail delta review:
  Lean already. Ship. This is not a declaration of overall QA completion.
- Read-only Chrome ping confirmed the installed extension responds successfully
  with environment profiles, catalog snapshot and source-attempt capabilities.
  Main closed only the QA DevTools panel, verified the same extension ID and
  hard-cutover load path, and reloaded the approved advertising fix before
  resuming the existing catalog attempt. Full PostgreSQL session 82879 remains
  running; the latest output was an identity-size measurement, not a final result.
- After reload/page refresh, main resumed the exact `7f456438` details attempt
  through its UI control. The start ACK exceeded the web's response timer, but
  subsequent status returned active discovery and collection proceeded. At
  09:44 UTC the UI showed 1,254/1,254 discovered; at 09:47:32 UTC the isolated
  QA DB had three discovery receipts, one manifest confirmation and 19 accepted/
  published detail chunks. First sample has one option, seven documents and two
  media entries. The stale timeout message remained on the running card and is
  an open UI observation, not proof of a failed owner or justification to raise
  the timeout. Mapping/stock hashes and ABC generation/revision are unchanged.
- Main used the dashboard's existing advertising sync control after the new
  extension reload. AX interaction initially gave no visible change; the same
  visible button was clicked by screenshot coordinates while no new server
  attempt existed. The UI then disabled the button as syncing, and exactly one
  new attempt `615ef136-bf51-4fe2-834d-0439c3127f0d` was observed RUNNING,
  created at 09:46:36 UTC. Do not start another campaign attempt. Actual
  multi-navigation completion and publication are still pending.
- At 09:51:15 UTC the same catalog attempt had 32 accepted and published
  detail chunks; the same advertising attempt had 96 source rows, both still
  RUNNING. Browser interaction is paused while the advertising collector uses
  its provider controls. Neither terminal success nor Alert resolution is claimed.
- The ongoing full PostgreSQL gate reported one failure in advertising
  `ad-benchmark-flow.pg.integration.spec.ts`, test `#7 listings[]` (30,534 ms).
  The suite's final failure stack is pending. Duration alone does not establish
  whether this is test, hook, database contention or contract failure. Main
  inspected its fixture/assertions and left the gate running unchanged; no
  timeout increase, skip, server patch or concurrent reset was introduced.
- User approved the bounded stale-start-timeout UI correction: once the same
  owner attempt's browser status is active, suppress only the previous exact
  extension ACK timeout message. Server errors and all other start/read errors
  remain visible; inactive timeout remains visible. Existing Luna/max agent is
  implementing only the route-local error helper and focused regressions.
  Web/API restart and extension reload are deferred while real capture continues.
- Main reviewed the approved timeout-only helper change and requested a distinct
  regression test plus the active-browser + timeout + server-error precedence
  case. Final focused helper tests pass 9/9; main's full product-pipeline gate
  passes 88 files / 420 tests (88.98 s). Delta Ponytail review found no useful
  simplification. Web build and installed-screen verification remain outstanding;
  no running service or browser was restarted.
- Read-only actual publication timing at 52 detail chunks: mean accepted-to-
  published timestamp gap 1,117.4 ms, p95 2,466.6 ms. This measures asynchronous
  publication lag, not request latency or SQL execution time. At 10:02:14 UTC
  catalog remained at 52, while advertising had 840 source rows and a complete
  first campaign's 31 distinct daily receipts (2026-08-09 through 2026-09-08).
  Campaign sweep terminal receipt and overall success are not yet present.
- Full PostgreSQL progress now also reports one inventory-SKU history test and
  four supplier-stats tests failed near 30 s (six failures so far). Main's
  read-only observation found an active test-database TRUNCATE at 9.8 s with no
  wait event; this is evidence of costly setup, not yet attribution of all six
  failures. Both database containers briefly showed about one CPU core in use.
  QA has no pg_stat_statements relation; main did not install it or change DB
  settings. Final stacks are still needed, and no assertion/timeout was weakened.
- At 10:05:25 UTC the catalog advanced to 53 published detail chunks; advertising
  remained RUNNING with the first full 31-day campaign and 37 total receipts.
  The long catalog inter-chunk gap is not yet attributed to a runtime defect.
- Full PostgreSQL progress subsequently reported three failures in
  `channel-listing-deletion.pg.integration.spec.ts` (nine failures so far).
  This gate is not passing. Keep its execution and evidence intact until final
  diagnostics are available, then separate contract failures from setup/runtime
  delays before choosing the next focused verification. Production code remains
  frozen apart from the independently tested web-only message correction.
- Full PostgreSQL session 82879 finished with exit 1: 101 files (81 passed,
  20 failed), 828 tests (797 passed, 30 failed, one skipped after a failing
  setup hook), duration 3,477.99 s. Available final stacks show resetDb hook
  timeouts and PostgreSQL 57P03 recovery-mode errors; retained output does not
  establish the cause of every failure. No tests were intentionally skipped or
  timeouts raised. The disposable test container was removed by normal teardown.
- The isolated QA PostgreSQL container independently logged an internal server
  process exit at 10:15:52 UTC and automatic recovery, becoming ready at
  10:16:33. Docker reports no container restart or OOM kill; root cause is not
  established. Main did not reset or rebuild the QA database. The API child then
  exited on an unhandled pg connection-termination error during Prisma
  transaction cleanup; its watch parent survived, but port 4000 had no listener.
- Main verified and terminated only the obsolete QA bootstrap process 59174,
  then reran the unchanged private bootstrap with the same QA configuration.
  New session 33203 compiled with zero errors and Nest successfully started at
  10:22:45 UTC (PID 74217). HTTP responds again; `/api/health` returns 404 and
  is not treated as a passing health endpoint. Authenticated screen readback
  remains the next check. Browser, extension, web and database were not restarted.
- Read-only QA evidence at 10:22:47 UTC retains the same details attempt
  `7f456438` with 67 accepted/published chunks and advertising attempt
  `615ef136` with 1,188 rows / 49 receipts (43 campaign-day receipts). Both
  remain RUNNING, not complete. Mapping 745 / stock 2,010 counts and their
  previous hashes remain unchanged; ABC generation 10 / publication revision 1
  is unchanged. Resume existing owners through their normal UI after checking
  browser status; do not create replacement attempts merely for the outage.
- Authenticated dashboard readback recovered after refresh. Initial concurrent
  reads logged P2028 transaction start/commit timeouts, then subsequent
  dashboard sales/ad/inventory/trend reads succeeded. This proves API recovery,
  not resolution of intermittent database latency. No timeout was changed.
- Main used the existing advertising `진행 확인·이어서 수집` control. AX click
  produced no visible change; screenshot-coordinate click then activated the
  collector's own provider controls. At 10:26:29 UTC the same `615ef136`
  advanced to 1,739 source rows and 62 campaign-day receipts; at 10:27:18 UTC
  it had 3,555 rows / 70 receipts. No replacement source attempt was created.
  The catalog remains at 67 published chunks pending explicit resume.
- Current legacy cutover scanner passes with zero findings, zero unowned
  producers and zero source-to-ABC or legacy-runtime references. Reconstruction
  guard against `origin/develop` passes. Release guard still fails the previously
  recorded inherited v0.1.30 migration / root VERSION 0.1.31 mismatch; actual
  Office execution history remains a user-input dependency, not permission to
  rename or rerun that data migration.
- QA Docker filesystem has 17 GiB free and shared memory is 2% used at the
  read-only observation; these are current capacity observations, not a cause
  for the earlier crash. No database setting was changed. A focused rerun of
  the entire failed ad-benchmark integration file is being run with the normal
  isolated Testcontainers lifecycle and unchanged timeouts/assertions, with
  complete command output retained separately from this ledger.
- The ad-benchmark focused diagnostic finished successfully: one file / 11
  tests passed, 96.67 s total (38.98 s tests), with no code or test-setting
  change. Its disposable PostgreSQL used port 57027, not the screen QA DB.
  This does not replace the failed full gate or attribute every prior failure.
  At 10:29:24 UTC the same advertising owner had 4,671 rows / 101 receipts,
  including 93 campaign-day receipts. Full terminal publication remains pending.
- Native Chrome observation later returned a stale menu/empty window after
  the advertising managed tab closed. Existing QA tabs were not reclaimed
  from another browser session. Main opened one recovery QA tab in the same
  Chrome/profile, leaving existing tabs and extension untouched; browser DOM
  controls work there. No browser restart, profile copy or access bypass occurred.
- The catalog runner subsequently continued without another resume command:
  70, 84, 116 and 160 complete product enrichments were observed. At
  10:38:51 UTC the exact `7f456438` attempt became FAILED on provider detail
  JSON HTTP 503. All 160 chunks remain published, basics remains COMPLETE,
  and the source Alert is OPEN with the same failure/attempt. UI shows the
  failure, 160/1,254, 169 options and 623 images, preserving unobserved detail.
  This ordinary failure is terminal under the approved contract; it was not
  reopened or reclassified as the special HTTP 429 recoverable pause.
- After the first advertising resume, source storage stalled at 4,671 rows;
  API output includes the ad-campaign receipt-create stack, but its exact error
  heading was lost in bounded output. The managed tab was authoritatively gone,
  while the owner remained RUNNING. Main used the same owner's normal resume
  control once from the recovery QA tab and retained subsequent full error
  output. This resumed day receipts and did not create a replacement attempt.
- Advertising `615ef136` completed at 10:42:12 UTC with 6,811 rows, 266
  receipts, ten campaign descriptors and 248 campaign-day receipts over
  2026-08-09 through 2026-09-08. Manifest checksum is
  `2907632acf61579fa8fdbdf3049c5dfed26376e9fca57dbb51526a468ccecbb2`.
  The owner records two raw-only campaigns / two warnings, not fabricated
  zero product history for unsupported modes. Its existing failure Alert is
  RESOLVED and points to this completed attempt at 10:42:12.117 UTC.
  Consumer readback of this final publication is the next acceptance check.
- Actual product screen sample `732749886` (published detail receipt 6):
  registered list shows the exact sponge-jumping-toy name, ON_SALE, one option,
  KRW 5,240 and matching completed status. Its loaded 1,000×1,000 provider
  image URL matches the captured option-media URL. The opened content workspace
  shows the same price, provider category/brand/manufacturer, primary/option/
  detail URL roles and escaped original JSON containing seven documents and
  option `4716586189` document associations. Existing selected thumbnail was
  preserved; no image or content was edited. Matching UI search for that external
  ID returns exactly one listing and preserves the Sellpia `7599-1` recipe,
  deduction quantity 12 and displayed sellable quantity 313. No matching save,
  automatic rematch or file re-import was performed.
- Product-field QA exposed the existing registered-list header search as
  presentation-only (no search state/query wiring in its page). Main used the
  existing sorting/paging controls to find the published sample instead of
  implementing an unrelated search feature. This observation is separate from
  source publication acceptance.
- At 10:37:09 UTC another dashboard trend read exceeded its existing 5 s
  transaction budget (6,157 ms); the next read succeeded at 230 ms. Performance
  is not signed off. Host inspection later showed 16 GiB RAM with about
  22 GiB swap in use and substantial VM/Docker/API CPU activity. This is a
  resource-pressure observation, not proof of the earlier database-crash cause;
  no unrelated process was stopped and no timeout was increased.
- Product management search for the same sample returns one operational
  inventory product, the matching visible provider image, one connected Wing
  listing/option and stock 3,762. Matching's sellable quantity 313 is consistent
  with the preserved 12-unit recipe. Registered list, matching, product
  management and the selected content workspace have now been visually checked
  for this published sample; this does not prove full 1,254-product traversal.
- Dashboard readback now says `전체 수집 완료 · 2개 원본만 보존`, and its
  displayed historical campaign failure is marked resolved. The advertising
  campaign screen reads eight performance campaigns for the selected 14-day
  period; normal network observation confirms HTTP 200 for
  `/api/ads/campaigns?period=14d`. The account-day aggregate remains separately
  labeled rather than being replaced with campaign sums. No new collection was
  triggered by these consumer reads.
- New bounded UI finding: the real campaign response has observed spend/click/
  conversion zeros with `ctr`, `roas` and `cvr` null, but CampaignTable uses
  `?? 0` and renders those undefined ratios as 0%, including a ROAS status
  color. Main proposed preserving observed numeric zeros while showing null
  ratios as an unavailable dash without a ROAS performance color. The short
  brainstorming approval question is pending; no implementation has started.
  The previously approved catalog timeout-message web build is still pending
  and should be combined with this fix if approved, without rebuilding the QA DB.
- Final full PostgreSQL retry started after both actual collection runners
  reached terminal states. The unmodified `npm run test:integration` runner
  created its own disposable database at localhost:57029 and completed schema
  setup. Full stdout/stderr is retained in
  `/tmp/kiditem-full-pg-20260909-1105.log`; the result is still pending.
  Existing QA PostgreSQL at 56879, read-only production reference at 5433,
  API and web remain intact. No timeout, assertion or skip was changed.
- Current-tree static rerun: reconstruction contract PASS, complete
  `check:conventions` PASS and `git diff --check` PASS. Release contract still
  FAILS because `v0.1.30/006_delete_legacy_channel_derived_master_products.ts`
  does not match root VERSION 0.1.31; its Office execution-history decision
  remains pending, so the migration was not moved or rewritten.
- The ongoing full PG run reached all nine Wing fixture stages with setup
  totals 661–1,228 ms. Its representative five-page/100-item terminal measured
  64 ms and exact read 10 ms. These are isolated automated measurements, not
  approval of actual extension performance or the still-pending full gate.
- Post-campaign ABC consumer check used the existing recovery QA tab through
  native Chrome controls after browser-tab attachment timed out/not-found;
  no browser, extension or tab was restarted. Product Management's actual
  `ABC 등급 현황` panel shows official cutoff 2026-09-07, formula revision 1,
  publication revision 1, mapping generation 10 and no common display cutoff.
  ABC advertising-spend and Sellpia-profit evidence still end at 2026-09-07,
  separately from the completed campaign collector. The panel labels source
  refresh as required and disables `등급 새로고침`; a screenshot confirms this.
  This passes the current source-blocking UI observation and preservation of
  the publication envelope, not normal product-grade preservation (the current
  filtered set has zero graded / 255 ungraded products), nor a new publication.
  No source collection or ABC mutation was invoked. Fresh September 8
  profitability evidence remains required before the explicit baseline/current
  publication acceptance; campaign data must not substitute for that owner.
- Follow-up source-path review confirms Product Management full refresh calls
  the independent Inventory and 401-day Sellpia profitability owners; the
  Advertising analysis tab separately exposes `상품별 광고비 보고서 수집`.
  Its actual UI shows COMPLETE-but-needs-refresh with the September 7 cutoff
  and an enabled start button. This was observed without starting either
  collection while the full PG run remained active.
- The same confirmed null-ROAS display defect also appears in the analysis
  tab's campaign summary cards: actual `비눗방울/슬라임` and `MBTI젤리(식품)`
  cards show 0%, and `StatusContent.tsx`'s exported `CampaignSummary` explicitly
  uses `c.metrics.roas ?? 0` for both text and performance color. Record this
  alongside the approval-pending CampaignTable fix; it requires the same
  unknown-versus-observed-zero distinction, not a data or sorting policy change.
- The same still-running full PG gate recorded the representative Wing
  1,000-product / 3,000-option / 1,000-media finalization at 2,701 ms with
  57 statements (19 content statements), and refresh at 5,039 ms with
  46 statements (9 content statements). Retain these as isolated fixture
  measurements only; they do not close the actual browser/API request-budget
  or overall performance acceptance.
- Script regressions were run with the same Vitest/Node test file sets as
  `test:scripts`, limiting each runner to one concurrent test file. No test,
  assertion or timeout was changed. Log:
  `/tmp/kiditem-scripts-serial-20260909.log`. Vitest passes 33 files / 195 tests;
  Node reports 223 passed, one failed and three existing Windows/PowerShell
  checks skipped. This gate FAILS; it is not a successful script-suite signoff.
- The failure is the stock-authority scanner finding three direct fixture
  creates in two channel PG tests: two in
  `marketplace-registration.pg.integration.spec.ts`, one in
  `channel-catalog-owner.pg.integration.spec.ts`. Existing approved
  `test-helpers/inventory-seeds.ts` already supplies the needed active-SKU
  fixture. Proposed bounded repair replaces those calls while preserving IDs,
  quantities and assertions, without extending scanner exemptions. Main asked
  for approval together with the already-proposed campaign null-ratio display
  repair. Neither change is implemented; server/test files remain frozen for
  the ongoing full PG run.
- The user approved both bounded repairs. The existing Luna/max UI agent is
  implementing CampaignTable and CampaignSummary display/tests only. A second
  existing Luna/max implementation agent is preparing the three-call fixture
  replacement but must wait for the current full PG runner to terminate before
  editing those test files. Main owns integration/Ponytail review, broader
  gates and actual QA; no scanner or runtime policy change is authorized.
- Full PostgreSQL retry TERMINATED PASS: 101 files / 828 tests, exit 0,
  1,485.93 seconds. This unmodified full gate completed before the approved
  fixture-only patch; no tests were skipped in this run. Its disposable
  localhost:57029 container was automatically removed; readback shows only
  the preserved QA database at 56879 and operational reference at 5433.
  The fixture agent may now edit the two approved test files. Re-run those
  changed PG tests and the failed script scanner after review; preserve the
  full-gate evidence for unchanged backend/runtime paths. Existing Nest API
  PID 74217 and web PID 59857 remain running.
- Main delta review accepted the null-ratio UI conditionals and preserved
  numeric-zero display, sorting and threshold policy. The actual-response
  regression asserts five numeric-zero cells beside three unavailable ratios;
  zero/positive ROAS retain their performance colors. Main found and had the
  fixture agent correct a `Promise.all` destructuring error introduced by the
  void-returning helper before PG validation. All original fixture values and
  business assertions are retained; no stock-scanner exemption was added.
  Delta Ponytail: Lean already. Ship.
- Post-fix validation: changed two channel PG files PASS 17/17 on ephemeral
  localhost:57031; the entire advertising web group PASS 21 files / 92 tests;
  all Node script tests PASS 224, FAIL 0, with the same three existing Windows
  skips. The unchanged Vitest script portion retains its 195-pass result.
  Logs: `/tmp/kiditem-fixture-pg-20260909.log`,
  `/tmp/kiditem-ad-web-20260909.log`, and
  `/tmp/kiditem-script-node-after-fixture-20260909.log`. `git diff --check` PASS.
- Web build started with the same existing proxy environment after verifying
  PID 59857's cwd was this worktree's `apps/web` and stopping only that owned
  Next server. API PID 74217, QA DB, reference DB and extension remain intact.
  Build log: `/tmp/kiditem-web-build-20260909-2031.log`. Restore the same
  localhost:3000 web command after successful build, then verify both campaign
  consumer displays and the approved catalog timeout-message delta. No new
  collection was started during the verification/build window.
- Web build TERMINATED PASS (46 pages); restored the same proxy-enabled
  localhost:3000 command, now PID 92467. Existing API PID 74217, QA database,
  browser and extension were preserved. New-build actual UI readback and
  screenshots verify both CampaignTable and CampaignSummary: unavailable
  ROAS/CTR/CVR display neutral `-`, observed numeric-zero amounts/counts remain
  0, and positive metrics remain unchanged. Numeric-zero ratio color is covered
  by the regression fixture, not claimed as observed live source data.
- After the build/test window, normal Advertising analysis UI
  `상품별 광고비 보고서 수집` started new owner attempt
  `da8ca4f5-9c8c-44cf-befa-413f1a639c2d` at 2026-09-09T11:34:47Z.
  Read-only QA DB inspection confirms `coupang_ad_profitability`, running,
  12 rows at the first observation. This refresh targets the current KST
  yesterday cutoff; completion/publication and ABC remain unverified.
- That exact Advertising profitability attempt COMPLETED at 11:38:52.812Z
  (245.616 seconds end-to-end). All 12 planned slices have complete receipts;
  expected/collected/target rows each equal 57,286, across October 2025 through
  September 8, 2026. Publication sequence is 2; 6,096 monthly allocation facts
  retain mapping generation 10. Provider spend 25,310,816 KRW reconciles to
  allocated 2,724,303 + unmatched 17,603,769 + unallocatable 4,982,744 KRW;
  unmatched/unallocatable data was not converted to zero or invented mappings.
  Prior failure Alert remains RESOLVED without a new success Alert. FormulaState
  remains revision 1 / cutoff September 7 / original publication timestamp,
  proving this source completion did not publish ABC. Actual refreshed analysis
  UI says `최신 수집 완료`, cutoff September 8, captured 20:38:52 KST.
  End-to-end elapsed time is not a measurement of individual DB request latency.
- Normal Product Management `상품 전체 데이터 갱신` completed two independent
  owners: Inventory `814abccb-e80a-400b-9c9d-cb6db322cd38`, 1,825 rows,
  11:41:27.647–11:41:37.732Z; Sellpia profitability
  `dd137012-5340-4db8-873f-70d3f5fe7bca`, 19,474 rows,
  11:41:46.182–11:42:11.331Z, August 4, 2025–September 8, 2026.
  Corrected cost evidence is true; 13,944 mapped and 5,530 unmapped rows remain
  explicitly distinguished. UI reports full refresh complete and shows
  updated stock; no direct DB writes or Excel substitutes were used.
- Inventory changed current product eligibility/mapping generation from 10 to
  11. ABC modal correctly retains publication r1 / September 7, shows Sellpia
  latest but Advertising/mapping stale, and disables explicit refresh. Finance
  evidence requires both source generations to match current FormulaState;
  the just-completed Advertising generation 10 is now ineligible. Do not force
  ABC or edit source provenance. The next normal Advertising refresh must use
  generation 11; this is required revalidation after changed mapping, not a
  duplicate of still-valid acceptance evidence. Matching component count/hash
  remains 745 / `7e5179cab5a23b22319d95f69afa92758c058b7bde29bbebbb3c6f338a323fa1`.
- Advertising generation-11 retry `b8a3fe2b-18dc-465f-a9b4-0d916f55d84a`
  COMPLETED at 11:47:36.611Z, publication sequence 3. The ABC modal then shows
  Advertising, Sellpia and mapping ready at September 8 / generation 11 and
  enables `등급 새로고침`. No source completion changed publication r1.
- Actual explicit ABC click at 11:48:54.099Z sent one POST to
  `http://localhost:4000/api/products/abc/recalculate`: HTTP 201 in 4,020 ms,
  PUBLISHED / formula r1 / publication r2 / September 8. Response counts are
  classified 0, unclassified 251, changed 0. Automatic post-success list and
  summary GETs returned HTTP 200 in 9,595/9,583 ms; data-status GET in 5,949 ms.
  UI/screenshot confirm the new publication and success message. These reads
  remain below the unchanged 15,000-ms browser GET deadline. The ABC POST has
  its existing explicit `timeoutMs: null`; the actual QA API traffic went
  directly to port 4000, so this does NOT prove the Office proxy budget.
  A zero-classified publication also does not prove nonempty bulk evaluation
  or grade-transition performance. Those acceptance items remain open.
- Actual list response explains the 251 unclassified as 236
  `INSUFFICIENT_EVIDENCE` and 15 `SOURCE_UNMAPPED`; do not call this positive
  grade-calculation acceptance. Read-only execution of the existing compiled
  `readProductSaleAgeEvidence` on QA finds 952 active masters, 310 valid mapped
  masters, and ZERO mapped masters with a recognized sale start date.
- Confirmed staged-catalog regression: current active listing raw sources are
  815 `coupang_catalog_details`, 439 `coupang_catalog_basics`, and 187 Rocket;
  none has `saleStartedAt`. `buildCatalogDetailProduct` omits this field while
  the existing legacy `buildCatalogProduct` preserves it. A single read-only
  GET of the already-verified Wing seller-product endpoint for 16130504981
  returns HTTP 200 with `saleStartedAt: 2026-04-01T14:41:57` (not the product's
  different `createdOn`). This verifies provider evidence is lost in the new
  projection, not merely absent upstream. Current `saleStartDateFromRaw` also
  permits naive KST timestamps only for the old `wing_app_data` source tag.
- Proposed bounded correction, pending explicit brainstorming approval:
  preserve provider-supplied saleStartedAt in the staged detail contract and
  recognize its verified Wing KST provenance at the existing sale-age boundary;
  preserve absent/invalid/future-date rejection and do not substitute createdOn,
  first sale, or arbitrary defaults. Add collector and owner-to-ABC regressions,
  review inline plus Ponytail, then refresh through normal detail owner capture
  and repeat affected gates/actual grading. Do not patch QA rows directly or
  rerun unchanged financial collections until mapping/freshness requires it.
- 11:57:06Z post-publication readback confirms FormulaState r2, cutoff
  September 8, published/current mapping generation 11, and the exact complete
  Sellpia `dd137012` / Advertising `b8a3fe2b` source IDs. Evaluations and grade
  history remain zero, matching the zero-classified response; no ABC Alert
  exists and none of the three financial/inventory source types is running.
  The sale-date correction remains approval-pending and has not been applied.
- At 12:03Z the user explicitly approved the bounded sale-date correction.
  The existing Luna/max implementation agent is applying collector preservation,
  verified Wing KST interpretation, and focused regressions. Main inline review
  additionally checks detail publication followed by basics refresh: basics
  preserves the date but replaces the raw source tag. No QA rows are patched;
  actual detail recapture and ABC acceptance remain pending.
- Date correction reviewed inline against ACTIVE eligibility/fencing contracts;
  Ponytail: Lean already. No new dependency or state owner. Main reruns pass:
  collector 21/21, sale-age 12/12, PostgreSQL owner + ABC 33/33 (54.41s,
  disposable port 57033), full extension suite exit 0, cutover scanner zero
  findings and diff check. Full PostgreSQL final gate remains pending for this
  delta; prior 101-file/828-test pass is retained only as the prior baseline.
- QA API watch had stopped listening during the edit. Terminated its exact
  task-owned launcher and stuck child, then reused the unchanged QA launcher
  and port-56879 database. Nest boot passed at 12:12:52Z, PID 143; web PID
  92467 and stored source/publication data remain preserved. Reloaded only the
  existing verified KIDITEM OS extension (1.0.23, hard-cutover worktree path).
- Normal registered-products `Wing에서 가져오기` started NEW full-detail
  attempt `d5e82ec7-08f2-4777-97e5-834512e463a6` at 12:14:47.259Z.
  UI and read-only DB confirm RUNNING, not a reopened failed attempt. The
  prior 160 accepted/published details, completed basics, recipe count/hash
  745 / `7e5179ca…`, mapping generation 11 and ABC publication r2 are retained.
  Browser automation debugger attachment failed after page reload; native UI
  remains usable. No request-latency claim is made from that failed observer.
- Live readback at 12:16:21Z confirms 18 accepted/published detail chunks and
  recognized sale dates for 9 mapped masters (previously zero), with unchanged
  recipe hash, mapping generation 11 and publication r2. At 12:24Z, native UI
  and screenshot show 250/1,254 detail products reflected without a new error.
  This exceeds the prior failed attempt's 160-product progress, but is not full
  completion or proof that the provider cannot fail later.
- A read-only invocation of the existing Finance evidence reader at 12:24:12Z
  takes 6,059ms and sees both financial sources READY at September 8 / mapping
  11. Among its 952 active-master evidence rows, 36 have dates and 34 have both
  dates and formula-ready period facts. These are not the narrower 251-product
  publication target count and do not prove the 30-day gate or a published grade.
  Normal Products GET returns HTTP 200 and currently shows 6 NEW products,
  230 insufficient-evidence displays and 15 unmapped; r2 remains unchanged.
  Wait for stable capture inputs before explicit ABC and the final full PG gate.
- Re-raised the unresolved Office v0.1.30/006 applied-history question while
  collection continues. No release/migration relocation, operating-data write,
  commit, push or deployment has been performed.
- User confirms Office already applied v0.1.30/006. After fetching named
  `origin/main` and `origin/develop`, their VERSION values are 0.1.29 and
  0.1.31; worktree VERSION is 0.1.31. The applied 006 is unchanged in the
  worktree and originated in commit `5b154ca03` when VERSION was 0.1.30,
  but is absent from current `origin/develop`. The ordinary PR diff therefore
  treats it as a newly added old-train migration and the release guard still
  fails. This is an applied-history/base alignment blocker, not authorization
  to rename/edit the applied migration or bypass the intended-base guard.
- Full-detail d5 TERMINATED FAILED at 12:24:39.199Z with
  `MARKETPLACE_LOGIN_REQUIRED`; 257 accepted chunks are all published and
  preserved. Its OPEN Alert carries the login-required message. The existing
  Wing tab redirected to the real seller login after a normal refresh. The
  user then completed login, and the existing tab again shows Coupang Wing.
  Do not reopen the failed attempt; the next capture must be a new owner run.
- With collection terminal, started the latest full PostgreSQL gate in its
  own disposable database, container `1dc7651f32b4`, port 57035. Schema sync
  completed in 7.45s. Full output is retained at
  `/tmp/kiditem-full-pg-sale-date-final-20260909.log`; terminal result remains
  pending. Hold new provider capture until this test run finishes.
- User approved the bounded applied-history guard correction. The existing
  Luna/max implementation agent owns only the release checker, its focused
  regression file and release-train runbook. The approved baseline artifact
  is commit `5b154ca035bc2c729b6f61a14d297391ce6adbd9`; verification must bind
  an explicit PR declaration to immutable Git identity, ancestry, release,
  exact file bytes and registration, without editing applied 006 or relaxing
  new-migration rules. Main review and final guard result remain pending.
- Live PR 493 still has its old 0.1.30, four-commit incident body and no applied
  baseline declaration; its base/head remain `develop` /
  `fix/product-abc-refresh-timeout`. Read-only inspection is not a PR update.
  Final handoff must reconcile the complete current scope and verification.
- Preserved actual 257-chunk timestamps show creation-to-publication intervals
  of 93ms minimum, 195ms median, 407ms p95 and 2,415ms maximum. This is a
  persisted timestamp interval, not per-SQL duration or total HTTP latency.
- Main guard review requires exact candidate-index registration as well as
  baseline registration; a suffixed module must not satisfy that check. The
  implementation agent is adding the regression. The new sale-age PG fixture
  also violated the existing inventory-write scanner through direct SKU
  creation; it is being converted to the already-imported inventory fixture
  helper without weakening the scanner or changing production behavior.
- Latest full PG gate FAILED: 55 files passed / 46 failed; 657 tests passed /
  171 failed / 1 skipped out of 829, duration 1,484.39s. First SalesAnalysis
  setup hooks timed out at 30s; subsequent connection loss and `57P03`
  failures coincide with test PostgreSQL backend PID 22231 exiting with code
  2 at 12:52:28Z and the server entering recovery. Container state did not
  report OOMKilled. The underlying backend-exit cause is not established;
  neither timeouts nor downstream recovery errors count as a passing gate.
- Native navigation to the preserved QA tab's Products page (no ABC command)
  exposed `25001: SET TRANSACTION ISOLATION LEVEL must be called before any
  query`. API logs also show transaction acquisition and 5s expiry failures
  during concurrent dashboard/Products reads around 12:50–12:52Z. These are
  unresolved live-read errors, not proof of an ABC calculation failure.
  New capture and ABC remain on hold. Asked whether another local task is
  using the same API/Chrome before another full run; preserved QA DB, browser,
  API and source data, with no reset or timeout increase.
- Main readback confirms the fixture helper preserves the master link through
  its input spread and keeps the inventory scanner unchanged. Focused release
  and inventory Node suites both pass on the final delta (main combined run
  exits 0); full-tree `git diff --check` passes. Declared historical candidate
  registration is exact, including a suffix-spoof regression, and the one-use
  path wrapper is removed after Ponytail review.
- Intended-base analysis of 1,933 current changed/untracked paths passes with
  a **candidate-only** release body declaring
  `5b154ca035bc2c729b6f61a14d297391ce6adbd9` and
  `scripts/data-migrations/v0.1.30/006_delete_legacy_channel_derived_master_products.ts`.
  This is not a live PR-body/check pass. An earlier local invocation used an
  incorrect 006 filename and correctly failed before the exact target was used.
- Full PG printed its terminal failure summary and its disposable container
  exited, but Vitest PID 3545 remained idle during teardown. Sent SIGTERM only
  to that exact failed-run process; QA API/web and all browser tabs remain up.
  A fresh successful full PG gate, focused PG verification of the fixture
  adjustment, full scripts gate and live ABC/detail acceptance remain pending.
- User gave exclusive QA Chrome use and requested group removal. Closed five
  redundant/temporary tabs (old dashboard, local login, inspector, blank
  connection tab and extension management UI), then ungrouped all three open
  QA groups while preserving Products, Dashboard, authenticated Wing and the
  unrelated Google tab. No extension restart, QA database reset or application
  process restart was used. Browser groups are not treated as memory isolation.
- After browser cleanup, serial focused PostgreSQL verification passes:
  3 files / 41 tests, 92.61s, disposable port 57037. It includes the updated
  sale-age fixture, ABC publication suite and SalesAnalysis suite that first
  failed in the prior full run. This proves those focused paths now pass, not
  the root cause of the earlier backend exit or a full-suite pass. The full
  scripts gate is running next, without concurrent PG tests or collection.
- Full scripts gate now passes: Vitest 33 files / 195 tests; Node 233 passed,
  0 failed and 3 existing skips. Script inventory and full-tree diff checks
  pass. Cutover scanner again reports zero unowned producers, source-to-ABC
  references and legacy runtime references.
- Actual ABC acceptance now has nonempty official grades. One normal UI
  `등급 새로고침` command published r3 at 13:15:55.869Z using mapping generation
  11 and cutoff September 8. Read-only DB confirms 26 evaluations (A 1, B 16,
  C 9), all r3, no cache mismatches and no missing sale dates; history remains
  zero for these first official grades. Products shows 26 classified / 225
  unclassified among its 251 selling targets. Dashboard independently shows
  the same A/B/C counts and 26 calculated among its 952 active masters.
- Product Outflow normal navigation displays matching A/B/C evidence and
  September 8 official/data cutoffs, including the same A-grade product shown
  by Products. No extra recalculation was invoked. The existing component
  count/hash (745 / `7e5179ca…`) and already-refreshed inventory count/hash
  (2,014 / `93cc1f31…`, from the 11:41Z inventory publication) remain unchanged.
  Browser PerformanceResourceTiming had no retained ABC entry, so this run
  adds no HTTP-latency claim. The temporary DevTools pane was closed.
- Started the complete PostgreSQL gate serially after these checks. Log:
  `/tmp/kiditem-final-full-pg-after-browser-cleanup-20260909.log`. No provider
  capture, second PG suite or build is running alongside it. Full-detail
  capture remains FAILED at preserved 257/1,254 pending a new owner attempt;
  neither r3 nor focused success is a substitute for that acceptance.
- Final conventions gate passes on the current worktree, including instruction,
  schema-artifact, ownership, tenant-scope and frontend DB-boundary checks.
  The full PG run remains in progress; read-only activity on its disposable
  port 57039 confirms active test queries/resets without a completed summary.
- At 13:26Z, the preserved QA organization's source-ledger audit found no
  `SourcingEvidenceIngestionRun` rows. This describes only the current QA
  database, not the history of provider QA. At 13:38Z the user confirmed that
  Sourcing collection QA was already performed. The earlier inference of
  not-run status and request for new target URLs are withdrawn. Recover the
  existing evidence and compare affected paths before requiring any repeat;
  do not infer an authentication blocker from an empty current ledger.
  `SourceImportRun` contains historical and current attempts for campaign,
  advertising profitability/daily, Rocket PO, Wing catalog/basic/detail,
  itemwinner/rank/traffic, Sellpia inventory/manual match/profitability/sales.
  Other source families require their own recorded journey or a verified
  configuration/provider blocker; counts in this table do not cover Sourcing's
  separate owner ledger. Reuse the already recorded successful source evidence
  and do not treat a historical completed full-catalog row as acceptance of the
  new staged details path.
- At 13:31Z, read-only prerequisite inventory found one active Coupang account,
  two active Rocket accounts, and no Sourcing interest targets or explicit
  source-control rows. These are configuration observations, not evidence that
  every missing source is disabled or unauthenticated. Wing's preserved tab
  still renders its authenticated home after a normal refresh; no collection
  was dispatched while PG tests were active.
- `npm run check:pr-reconstruction -- --base origin/develop` passes against
  the existing live PR body and committed diff (1,078 paths). Its CLI does not
  include uncommitted/untracked changes; the separate current-tree integration
  review and 1,933-path candidate release analysis remain the wider evidence.
  This command did not edit the PR, push, merge or deploy.
- The latest complete PostgreSQL gate passes: 101 files / 829 tests,
  1,243.30s, exit 0, with no skips. Its disposable database is separate from
  screen QA. Measurements include Rocket 4,000-row publication/read
  4,575/291ms and Wing 1,000-product/3,000-option publication/refresh
  3,436/4,908ms; these are test measurements, not live provider latency.
- After the suite exited, one normal registered-products detail button created
  new attempt `b2705bd3-f133-4944-81c1-764ef5ec5421` at 13:41:33.769Z.
  At 13:43:56Z it remains RUNNING with zero captured chunks and unchanged
  recipes, stock and ABC r3. The UI reports missing extension connection;
  a new source attempt is not evidence that browser capture began. Recovery
  starts with a normal QA-page refresh and the existing same-attempt resume,
  without reinstalling the extension or creating another owner attempt.
- Page refresh and same-attempt resume initially returned extension-response
  timeout. The installed 1.0.23 extension points at this worktree; its popup
  reads the local server and current source completions. Native worker-console
  diagnostics exposed no credentials: internal/external listeners and catalog
  module are present, local catalog state has the new attempt, and its local
  CollectionSession was persisted with a null progress label. The other local
  dashboard tab (`42039434`) was `frozen: true`; current QA was not frozen.
  Code awaits every web-tab script-injection notification inside the serialized
  local-session mutation. After activating the frozen dashboard and resuming
  the same attempt, complete discovery and real detail publications began
  (58/1,254 observed). This is a UI-notification blocking defect candidate;
  assigned a test-only public-seam reproduction before any production edit.
- Closed the temporary worker-inspector window, extension-management tab and
  redundant same-environment dashboard tab after confirming each target.
  Current registered-products QA, authenticated Wing and unrelated Google
  remain; closed tabs are recoverable through Chrome history. No extension
  reload, source restart or data reset occurred. Production extension files
  remain frozen while the accepted detail attempt is collecting.
- At 14:33:20Z, the same detail attempt has 1,088 accepted and 1,088
  published product chunks out of the 1,254-product manifest. It remains
  RUNNING; no full-detail completion is claimed. Recipe/component count 745
  and inventory count 2,014 retain their prior hashes, and ABC remains r3
  with the September 8 cutoff. Publication timestamps measure receipt-to-
  publication lag, not HTTP or SQL duration.
- Product `11146359213` was captured in this attempt at 14:21:41Z and
  published at 14:21:43Z. A read-only source-to-canonical comparison found all
  73 options, seven source documents and 5,475 media-to-option associations
  preserved, with no missing meaningful document or media associations.
  Empty document observations retain the approved no-clear behavior. This
  is database acceptance; all three consumer-screen checks remain pending.
- Native registered-products QA exposed an unconnected search input: entering
  that product number leaves all listings visible. The existing list API
  already supports search; a bounded isolated frontend wiring fix is pending.
- The approved September 9 web-app lifetime policy is recorded in the active
  extension-collection spec: any web-app route/tab keeps its environment's
  collection alive even when hidden or unresponsive; closing its final tab
  cancels extension-owned collection without a new checkpoint/resume model.
  Reopening does not restart stopped attempts. Common and domain patches are
  being prepared in isolated copies, not the currently loaded extension.
- The frozen-tab public-seam reproduction and revised nonblocking UI-hint
  adapter pass 24 focused tests in the isolated candidate. Coverage includes
  hung injection, bounded auth resync, exact-origin recheck, pending-hint
  release, and query failure. Main reran these tests successfully. The patch
  is reviewed but remains unapplied until live detail capture terminates;
  this test result is not browser acceptance of the new lifetime policy.
- Live staged details reached server `completed` at 14:41:14.935Z on the
  same attempt: 1,254/1,254 accepted and published product chunks, 2,271
  options, and 5,105 captured images. Native registered-products UI shows
  whole-detail completion, separately from the already-complete basics.
  Read-only final verification at 14:41:37Z confirms no source error, checksum
  `4f098f454b0db9fc21d4e82d84c9a99e805d1835e288ea2c635be3ba02e87e4c`,
  and the detail failure Alert resolved at 14:41:14.983Z. The older legacy
  full-stage Alert is a separate historical scope and remains open; it was
  not dismissed by this verification. Recipe/component, inventory and ABC
  preservation checks remain unchanged. Extension-file freeze for this live
  capture can now end, but the lifetime candidate is not yet integrated.
- Added user request at 14:41Z, without interrupting existing QA: unify product
  refresh and dashboard/registered-product entrypoints first; then simplify
  dashboard collection panels, purpose-grouped required/optional advertising
  collection and readiness-modal counting/entry behavior; finally move prose
  explanations behind clickable help and internal transport/publication
  details behind diagnostics. Preserve account choice, operator actions,
  concise failure/missing/stale warnings, cancellation and prior valid data.
  This is additional pending work, not completed by the existing staged QA.
- The isolated registered-products search patch was reviewed, applied after
  collection completion, and verified: focused search tests 2/2; pipeline
  regression 89 files / 422 tests; production web build passed. Restarted only
  the QA web process with the same local API/proxy settings. Actual search for
  `11146359213` returns one listing with 73 options, while the global market
  summary remains 1,254 Coupang plus 187 Rocket listings. Its detail/raw tabs
  display 73 provider options, 143 product images, 144 provider asset links
  including the basics primary image, and escaped source document JSON.
- Product Hub consumer-screen acceptance is still blocked by a reproducible
  read-path defect: `/api/products/masters` returns 500 and the screen stays
  in its loading skeleton. Both list `limit=50` and overview `limit=1` requests
  perform similar whole-catalog reads; API logs show 5s and 30s transaction
  expiration/start failures, including occurrences before the latest detail
  collection. QA PostgreSQL activity shows concurrent scans without blockers.
  After leaving the screen it becomes idle; scoped listing JSON totals are
  4,524,149 stored bytes / 12,921,127 text bytes across 1,441 rows (largest
  42,824 bytes), not an oversized single document. A fresh idle navigation
  still stalls. A bounded isolated fix for duplicate requests and unused
  projection fields is pending; source data, calculation policy and timeout
  values are not being changed. Returned to registered-products to stop the
  repeating reads. Mapping consumer acceptance remains pending as well.
- After the live capture completed, main verified baseline hashes and applied
  the reviewed nonblocking environment-hint patch to canonical/generated
  adapters and their tests. Focused environment plus public frozen-tab
  regression: 24/24 passed; generated adapter sync check passed. Full extension
  regression passed: 1,005/1,005 tests, no failures or skips. Chrome has not
  yet reloaded this candidate, so this
  is implementation/test evidence, not actual browser lifetime acceptance.
- Common lifetime and domain cancellation candidates remain isolated pending
  review revisions: immediate non-session fencing, late admission races,
  authenticated reopen reconciliation and executable restart/ACK-loss tests.
  A proposed review-owner token persistence change was rejected against the
  extension no-persisted-token contract; no such change was applied.
- Actual matching-screen navigation at 15:05Z independently reproduced a
  read timeout: zero-valued loading summaries were followed by the explicit
  request-timeout message, not accepted empty data. No matching mutation was
  executed. This route calls Channels product-mappings, separately from the
  Product Hub masters read. Returned to registered-products after observation;
  the matching read path is under bounded read-only diagnosis.
- Main rejected the first Orders lifetime candidate before integration:
  its pre-start active-session check would reject fresh attempts when composed
  with the real common adapter. Requested actual-adapter admission regressions
  and review of non-session resource cleanup across worker restart. The first
  Product Hub UI candidate also needs a filter-to-default transition guard so
  placeholder filtered rows cannot replace the unfiltered summary counts.
- User clarified and approved the collection UI direction: remove the added
  collection UI and separate basics/details execution buttons. Reuse the
  existing `상품 받기` flow; its existing collection module must execute
  basics then full details internally. Start once and observe whole-run
  progress/results in that entrypoint. Basics completion alone is not whole
  completion. Absorb only essential account/login/error/cancel controls from
  duplicate surfaces, then remove those surfaces. Do not implement an
  additional stage screen or a browser-UI effect that must stay responsive to
  launch the next phase. Last-app-close cancellation, saved-data preservation
  and explicit new execution after reopening remain authoritative.
- Integrated the reviewed common lifetime and Sourcing cancellation changes.
  The common adapter persists a stop fence, rejects late tab attachment and
  invokes app-presence admission outside its storage queue. Verified auth
  handoff and startup retry only already-fenced non-session cleanup, and an
  unsettled retry blocks recovery. Common plus Sourcing focused regression:
  122/122 passed before the final startup-only delta; the frozen-web-tab
  regression also passes. Full worker integration is not yet accepted:
  seller-identity expiry and Wing-rank cases fail or leave pending promises
  after the new common wiring. These are under investigation, not classified
  as unrelated baseline failures. Chrome has not reloaded this candidate.
- Applied narrow Product Hub and matching read projections while retaining
  matching identity, option model/price fields, recipes and legacy listing
  status evidence. A stale matching artifact was rejected before application;
  only the regenerated current-worktree delta was applied. Focused backend
  tests passed 20/20. The isolated QA backend booted successfully after an
  explicit restart; the QA database and production services were not reset.
- Actual matching UI now loads successfully. Searching external product
  `11146359213` yields one product with 73 options; expanding its review view
  exposes all 73 option rows and no timeout. No matching action or recipe
  mutation was performed. Product Hub frontend rebuild/consumer checks remain
  pending, as do the catalog internal basics-to-details connection, removal
  of duplicate UI and final all-domain browser lifetime acceptance.
- Product Hub fixture now uses the required absolute-ABC read model; no
  production optional fallback was added. Actual route regression passed
  23 files / 115 tests, and production web build passed. Restarted only the
  verified QA web listener with the same local API/proxy configuration.
  Fresh actual Product Hub navigation still stays in the skeleton: the API
  reports a transaction-start failure in profitability evidence loading from
  the product data-status read. Earlier logs also show expired advertising
  source-generation reads. This consumer remains unaccepted; its next narrow
  read-path diagnosis preserves canonical data and ABC policy.
- Full worker regression is resolved by separating best-effort UI hint
  injections from provider-page response queues in the test fixtures and
  deferring cancellation only at the actual provider extraction functions.
  No provider/runtime relaxation or skipped case was needed. Main reran the
  current full extension suite: 1,036/1,036 passed, no failures or skips;
  frozen-tab regression passed separately. Pending Coupang/Orders/review
  revisions and the internal catalog chain are not included in that count.
- Reviewed but withheld the next domain candidates: normal mutation retries
  need a stop check on every retry, not only before their first request;
  non-session tab ledgers must survive failed close acknowledgements; old
  cancellation responses must not overwrite a newly admitted review run.
  Corrections remain isolated until main review. The active deepening spec
  records the approved existing-entrypoint UI consolidation and internal
  basics-to-details handoff; implementation and actual acceptance remain open.
- Reproduced Product Hub failure on a fresh navigation after catalog capture
  had completed and the browser was idle: the main content did not render
  and the UI reported a request timeout. Active capture load alone therefore
  does not explain the failure. The read-path correction remains isolated;
  no timeout increase, database reset, or source recollection was performed.
- Main reviewed the complete next Orders delta but did not apply it: its
  artifact includes stale common test overlays, and additional-tab cleanup
  can report success after an unreadable ledger or failed close. Requested
  an Orders-only current-baseline artifact with explicit pending cleanup
  results and restart/new-run race coverage before integration.
- Integrated the reviewed UI cleanup: its focused gate passed 63 tests and
  the production web build passed. Full web regression reported 21 failures;
  a bounded rerun reproduced 9 contract-fixture failures (8 Rocket purchase
  preview, 1 wholesale sourcing response). Readiness fixture unhandled errors
  also require correction. This is not a full-web pass.
- Integrated the narrow Product Hub evidence read correction: transaction
  reads are sequential, cheap data-status reads settle before profitability
  evidence, and Sellpia input filtering retains complete validation and
  product mapping semantics. Original focused gate passed 27 tests; added
  deferred-order and mapping-parity regressions passed 28 tests across three
  files. IDOR and tenant-scope guards pass. Latest full PostgreSQL regression
  and quiet actual browser latency acceptance remain pending. Restarted the
  existing isolated QA API wrapper with unchanged configuration; boot is not
  yet confirmed. No QA database reset or source recollection was performed.
- Integrated the reviewed product-extraction lifecycle correction, including
  persisted cancellation intent, exact-attempt response validation, delayed
  begin acknowledgement recovery, and stale-response correlation protection.
  Actual lifecycle tests passed 15/15 and source-wire tests passed 5/5.
  Unpacked extension reload and actual affected-domain acceptance remain
  pending alongside the other domain lifecycle artifacts.
- Confirmed the restarted isolated QA API booted successfully with zero
  TypeScript errors. Integrated the reviewed Orders lifecycle artifact;
  actual Orders/Rocket/Sellpia extension regression passed 215/215.
- Corrected the two Rocket web fixture files to the current source-reference
  and compact publication contracts: actual bounded gate passed 9/9. Added
  the required sourceStatuses fixture to wholesale 1688: actual gate passed
  2/2. No production behavior or assertions were weakened for these fixes.
- Diagnosed the fresh browser auth 404 as a QA build configuration mismatch:
  the built Next routes manifest omitted the all-API rewrite although the
  start command enabled it. Rebuilt with KIDITEM_PROXY_ALL_API=true and
  NEXT_PUBLIC_API_URL=http://localhost:4000; build passed, rewrite verified,
  and restarted only the QA web process. Existing authenticated Product Hub
  renders products, inventory and profitability again. This is not yet a
  timed latency acceptance; no credentials or database state were changed.
- Withheld the revised review cancellation artifact after finding a false
  owner-cancel acknowledgement on late-tab close failure and early clearing
  of tab ownership before close acknowledgement. Requested focused fixes
  and regressions, plus preservation of the existing expected-URL wait.
- Added the user's structural review candidates to the active audit:
  marketplace capture still returns RUNNING/continuationRequired before
  web-side conversion; Icecream automatic detection filters new rows in web;
  and runOwnedOrderCollection retains a runId-only server-control bypass.
  These are verified code paths, not yet all classified as defects. Preserve
  manual/all-row versus automatic/new-row semantics, hybrid extraction,
  explicit downloads and actual order transmission while reviewing the seam.
  Product UI consolidation is already in progress; avoid a second solution.
- User approved the marketplace continuation seam on 2026-09-10: mandatory
  capture-to-server-conversion-to-terminal work stays in the existing Orders
  module; automatic seen-row selection is frozen at admission and manual
  all-row behavior is preserved. Recorded the contract in the active extension
  deepening spec. Implement in the existing Orders owner, with no permanent
  converted-file storage, no provider-strategy replacement, and no movement
  of actual order transmission. runId-only owner bypass is being repaired
  separately against the same existing owner admission contract.
- Integrated the reviewed runId-only bypass removal. Exact owner-control and
  compatibility regression passed 26 tests; the broader Orders run reported
  216/219 passing, with three collection-session fixtures failing. Those
  failures remain under investigation; do not treat the earlier 215-test pass
  as evidence for this newer candidate.
- The latest full PostgreSQL run is still in progress and has reported two
  catalog snapshot-consumer failures. Concurrent actual Product Hub search
  also reported transaction acquisition failure and a request timeout. Moved
  the QA browser to Settings, which rendered successfully, to stop repeated
  product reads; quiet reproduction and final test diagnostics remain pending.
- Reviewed the final review-cancellation delta, including late-close owner ACK
  preservation and terminal-tab cleanup fencing. Main independently ran the
  isolated final artifact's collector suite: 17/17 passed. The artifact remains
  unapplied pending the overlapping Coupang worker integration; no unpacked
  extension or real-browser acceptance is implied by this isolated test.
- Full PostgreSQL run finished: 99/101 files and 824/829 tests passed.
  Two catalog-owner failures originated in a 30-second reset hook and the
  subsequent duplicate seed, not a snapshot assertion. Three sourcing-history
  assertions used fixed September 3/4 dates that aged outside the seven-day
  KST window. Replaced only those fixture dates with recent KST business dates;
  production retention policy, timeouts and assertions are unchanged.
- Quiet actual Product Hub navigation and Enter-submitted search return data
  without a timeout. Native Network observations still show multi-second
  latency: search 200 at 6.20 seconds, overview 200 at 8.20 seconds, later
  cached responses around 2–5 seconds. Search here targets master product
  name/code/brand, so an external option ID returning zero is not yet evidence
  of a matching defect. Performance acceptance remains open. Returned the
  browser to Settings before disposable PostgreSQL verification.
- Catalog UI revision remains withheld: it still starts full mode rather than
  the approved internal basics-to-details chain and marks basics completion
  as overall completion. Cancellation error handling and replacement UI
  regression coverage also need correction. Existing implementation agents
  continue on the approved isolated artifacts; no new review agent was added.
- Main reran sourcing-browser-source-attempt and catalog-staging together in
  the existing disposable-test harness: 2 files / 30 tests passed. This proves
  the date-fixture correction, not the separately failed catalog-owner file;
  the latter is now running as its own complete-file regression. The prior
  disposable container was removed by normal teardown; QA and production
  containers were preserved. Fixture complexity review found no additional
  abstraction or dependency to remove.
- Quiet catalog-owner complete-file regression passed 15/15 without timeout
  or seed changes. All five failures from the prior full PostgreSQL run now
  have passing focused evidence; a final full run after pending integrations
  is still required. Full UI deletion review additionally identified recovery
  behaviors to preserve at the single entrypoint: validated exact-account
  attempt links, explicit attention-tab opening, cooldown-aware resume and
  partial-detail counts. Requested these from the existing UI implementer.
- Main independently measured the integrated profitability read against the
  preserved QA database with default_transaction_read_only enabled. Two
  canonical-serialization samples returned 2,014 products, cutoff 2026-09-08,
  mapping generation 11, in 1,654/1,644 ms. Both hashes exactly match the
  recorded pre-change baseline
  `7aca41270511ac2b2c4470224ab6815a063282d812e8ab650c7a30416771d15b`.
  Earlier warm-up samples took 3,030/2,094 ms. This verifies current output
  parity and bounded service latency, not a speedup or whole-page acceptance;
  no source, calculation or database mutation was performed.
- Read-only correlation resolves the Product Hub zero-result observation:
  catalog listing `11146359213` is present as “NEW할로윈모음 파티소품
  할로윈의상 호박바구니” with 73 options, no listing-level master and no
  option inventory components. It is therefore not a master-product search
  target. Existing matching-screen evidence remains valid; no forced match,
  duplicate workbook upload or synthetic product creation was used to make
  this listing appear in Product Hub.
- Withheld the delivered shared late-tab patch after actual apply-check failed
  all three paths: it targets retired runId/status/TERMINAL_STATUSES adapter
  code, while the current shared adapter uses attemptId/producer/progress and
  a persisted cancellation fence. Its added terminal pending-tab list also
  lacks a worker-restart caller and silently truncates pending ownership at
  32 entries. Requested an actual-baseline fix through existing ownership
  and cleanup paths, without restoring the retired runtime.
- Main fully read the new catalog-chain follow-up. It now persists uncertain
  child admission/cancellation, but COMPLETE-child terminal reconciliation and
  malformed admission receipt recovery need verification before integration.
  Complexity review identified a duplicate stage/root validation immediately
  after the validating admission helper. Original lifecycle v2 has one known
  worker overlap with the already integrated review dependency wiring; do
  not overwrite that user/worktree state while combining artifacts.
- On explicit goal continuation, resumed the three existing implementers.
  Actual matching navigation then showed API connection failure. Read-only
  diagnostics found no 4000 listener although the original watch wrapper and
  child remained alive; the child retained an established connection only.
  After TERM ended the wrapper, the orphaned exact QA child still did not
  terminate with TERM, so stopped that verified PID and restarted the same
  preserved start-api wrapper/configuration. No database, browser extension,
  web service or operating service was reset. Fresh boot remains pending.
- The restarted QA API compiled with zero errors and logged successful Nest
  boot at 07:03:21 KST. Confirmed its new PID owns the 4000 listener. The
  intentionally unavailable isolated-QA storage endpoint still warns as before;
  no upload or infrastructure configuration was changed.
- Actual registered-products consumer now renders the preserved snapshot:
  1,254 Coupang listings and 187 Rocket listings (1,441 total). Searching
  `11146359213` returns exactly one listing with 73 options, linked content,
  PARTIAL_ON_SALE and “재고 매칭 필요”, consistent with its stored unconfigured
  recipes. Both catalog stages display 1,254/1,254 completion; detail status
  displays 2,271 options and 5,105 images. This verifies the current consumer
  before the pending single-entrypoint UI change, not that future UI revision.
  No recollection, content edit, marketplace mutation or matching action occurred.
- Received and reviewed the isolated Orders three-fixture delta (SHA-256
  `85302cd2ec75e877583855f717b9a2214c849a08111eaccf5ac0f96c07d8faa7`).
  Apply-check rejects its stale context; the actual worktree already contains
  equivalent mall identity setup in all three affected fixtures. Preserved
  that existing implementation without duplicate edits. Independently ran
  `node --test extensions/tests/order-collector-collection-session.test.mjs`:
  18/18 passed with no skips. The implementer's reported 26-test scope needs
  its exact command before it can be counted as current-worktree evidence.
  Broader Orders capture/conversion work remains pending and is not certified
  complete by this fixture-only result.
- Received the consolidated catalog UI patch (SHA-256
  `f6e6e5ce7063952b5059ae6669361f15c1592681f193ea832bb6f82b36e02c61`);
  actual-worktree apply-check passes, but main review withholds integration:
  cancel reconciliation still checks the basics `state` instead of whole-flow
  status; resume treats a COMPLETE basics root with a RUNNING details child
  as terminal and creates a fresh basics key; local extension terminal state
  can trigger settlement before canonical confirmation, including a success
  toast for failed whole-flow state; deleting the old panel also deletes its
  validated exact-account attempt deep-link recovery without replacement.
  Requested focused corrections and regression tests from the existing UI
  implementer. Its 59-test report is isolated evidence; the blocked isolated
  web build is not accepted as the required actual-worktree build.
- Main fully reviewed the backend linked-state delta (SHA-256
  `0b6a1bdbb1b9abd5a2af7c37f11946a6e399b7037b8abfc259807e111c1149ee`).
  It adds an organization/account/root-fenced details lookup and projects
  child COMPLETE/FAILED state through the root; isolated service 21/21 and
  PostgreSQL 18/18 were reported, not yet independently integrated. A root
  with completed basics but no admitted child still derives RUNNING forever,
  including after expiry. Requested explicit no-child cancellation/expiry
  behavior and negative lookup-fence regressions through existing contracts.
  The previously rejected shared late-tab artifact was returned unchanged;
  it remains rejected and an actual-baseline correction is still required.
- The Orders continuation implementer reported additional isolated raw-response
  allowlisting and retained-source lost-ACK regeneration tests. Main has not
  accepted those reports as integrated evidence. Read-only inspection found
  its new worker date fallback uses `message.date` when the owner plan date is
  null, while admission still sends `collectionDate: null`; that value is not
  admission-frozen despite the comment. Requested actual selected-date binding
  through the existing begin contract and same-attempt retry coverage before
  integrating this change. No provider or canonical data was changed.
- Further main review of the isolated Orders continuation found three more
  acceptance gaps: numeric conversion headers use `Number(null)` and turn
  absent evidence into zero; malformed Icecream captures default missing
  arrays to empty and can report NO_NEW_ORDERS; an ambiguous conversion
  transport failure followed by an initially RUNNING owner still issues
  `fail`, racing the original in-flight conversion's completion. Requested
  absent-versus-zero, malformed-versus-confirmed-empty, and delayed COMPLETE
  after lost ACK regressions. The latter must prove no recollection and no
  contradictory failure write, not only reconciliation after COMPLETE is
  already visible. Automatic selection must also remain admission-frozen.
- The new shared delta (SHA-256
  `f78936a320b4a44b29d22e41fd0008b97d76a15447393ab4a4fa86bc954a6a33`)
  now passes actual-baseline apply-check, but is not accepted: a 16-ID cap
  silently drops live cleanup ownership and its test asserts that loss;
  `cancel()` still deletes the session without checking pending late tabs;
  `remove()` checks pending IDs before, rather than inside, its final queued
  deletion. Requested no-loss and interleaving regressions before integration.
  The backend expiry/fence replacement (SHA-256
  `ec2c3acb51ffffd0373813184afdbb3b19ef873201cd5dbf929f1b3ca0344fd3`)
  was fully reviewed: it now derives FAILED for an expired completed-basics
  root without a details child and adds wrong-root/account tests. Exact
  isolated test commands and replacement ordering are pending confirmation.
- Main independently verified the backend expiry/fence candidate in its clean
  isolated checkout at `abfbfc5`: service tests passed 22/22 (861 ms) and the
  complete catalog-owner PostgreSQL file passed 21/21 (35.10 s total,
  19.35 s tests). Commands were `npx vitest run
  src/channels/application/service/__tests__/channel-catalog-collection.service.spec.ts`
  from `apps/server`, and `npm run test:integration --workspace=apps/server --
  src/channels/__tests__/channel-catalog-owner.pg.integration.spec.ts` from the
  isolated root. Read the actual setup and reset guards before running; this
  invocation used a disposable `kiditem_test` database at port 57052, not QA
  56879 or the operating clone 5433. These results verify the candidate only;
  integration and affected runtime/UI QA remain pending.
- The user reconfirmed the existing UI acceptance scope: remove the added
  collection panels, consolidate into `상품 받기`, connect basics to details
  internally, and share the same execution state across screens. Wording or
  help cleanup alone is not completion. Actual registered-products still
  mounts the old panel; no UI-removal acceptance is claimed yet.
- Main fully reviewed UI incremental candidate SHA-256
  `fa45eddead476ad309cff58b3dd1d3e83b34f676dd431cf9a9596d59b8305a21`.
  It improves canonical settlement and resumes the details child, but fresh
  retry still validates a new basics permit against the previous child ID and
  fails to store the new root. Unresolved child reads can also fall back to
  basics COMPLETE in rendering, despite the hook withholding settlement.
  Existing Alert URLs land on registered-products, while the new link parser
  lives only in readiness on dashboard, leaving that route unreachable after
  panel deletion. Requested fresh-retry, unresolved-status rendering and
  actual Alert-route regressions from the same implementer; no duplicate
  implementation task or scope/collection-strategy change was introduced.
- Actual-worktree reconciliation shows the review-collector cleanup delta is
  already integrated: reverse apply-check of
  `kiditem-review-cancel-only.delta.final.patch` passes, while forward apply
  correctly fails. Main ran the current review-collector regression file:
  17/17 passed, no skips. Excluded this delta from future application ordering
  and informed the existing implementer to preserve it during chain/worker
  integration. This does not certify the still-pending shared/catalog fixes.
- Read-only QA diagnosis after registered-products transaction timeouts:
  existing API remained listening; no restart or timeout increase was made.
  At 2026-09-09 23:50 UTC, QA port 56879 had no active blocking transaction.
  The organization-scoped active-listing count used an index-only scan and
  executed in 2.985 ms for 1,441 rows. Stored raw payload sizes were unchanged.
  Host load was high, but neither that observation nor this single fast query
  proves the cause or recovery of the whole batched API transaction. Actual
  consumer latency verification remains pending; operating data was untouched.
- Main fully reviewed extension chain follow-up SHA-256
  `c0b30af570991740662fcbcab11f956a4f8a3bfd076015fc29df93a0720e196c`
  and independently passed its isolated publication suite: 90/90, no skips.
  Actual-PR apply-check fails pending parent-patch reconciliation. A remaining
  replacement cleanup issue prevents acceptance: `start()` stores the new
  root before closing the previous managed window; a close failure throws,
  and a retry sees only the new root, bypassing the old cleanup. Requested a
  close-fails-then-succeeds replacement regression and a precise consolidated
  application order from the existing implementer. Candidate test success is
  not integration or live-QA completion.
- Orders continuation candidate actual-PR apply-check passed, and main ran
  its three extension regression files: 35/35 passed, no skips. The candidate
  subsequently received persisted-plan validation hardening (latest reported
  patch SHA-256 `035f4bbf3f68f8366245eabcd2e2e93c9eb4559e6b224c1c5b44f562dec81a3c`).
  Main independently reproduced an uncovered defect using the existing owner
  harness without modifying source: local `UNSUPPORTED_CONVERSION` with no
  HTTP status becomes RUNNING / SOURCE_OWNER_UNAVAILABLE / reconciliation
  required, with zero failure requests. The new transport classification also
  captures local invalid-capture and no-new-order errors; these must be
  distinguished from requests whose outcome is genuinely uncertain. In
  addition, exact retry captures currently live in an in-memory Map and are
  lost on worker restart. Requested correction through the existing Orders
  implementation channel; no candidate source has been applied to the PR.
- Main finished the Orders continuation patch review (3,080 lines). The
  server-owned browser branch bypasses existing Icecream delivery-index and
  seen-key updates, with no owner-backed replacement: automatic detection can
  therefore select the same rows again. Its missing-count fallback also
  invents zero. The automatic-detection catch still sends failure for an
  uncertain receipt, unlike the separately guarded multi-marketplace caller.
  Finally, the patch manifest omits the production service-worker converter
  import that exists only in the isolated checkout. Requested all four
  corrections plus production-boot and automatic-continuation regressions
  from the same implementer; these are consumer-preservation and integration
  requirements, not new collection policy.
- Main fully reviewed catalog UI v2 (SHA-256
  `242faba301c0e1a4c47493729fad5cb51503cbe7bd6c5bb2b26398dab5cb472e`).
  The fresh-root ID and unresolved-child rendering fixes address the prior
  findings. Remaining edges: same-path Next navigation to an Alert changes
  search parameters without the mount/popstate events being watched, and
  the readiness hook caches its initial link indefinitely; malformed object
  cancellation ACKs are also still accepted. Requested reactive link updates
  on the same mounted page and a positive cancellation-receipt regression
  before applying the parent plus delta.
- The scoped ponytail review identified only a small safe contraction in the
  Orders activation hook: its new `options` parameter is unused after owner
  admission. Remove that parameter and forwarding arguments, retaining the
  owner-plan reads and tests (net two lines plus a shorter call). Correctness
  findings above remain separate from this complexity-only review.
- Main independently ran the Orders candidate's focused web and server
  commands: web three files / 21 tests passed (3.32 s); server three files /
  15 tests passed (981 ms). These do not cover the newly identified integration
  gaps and are not whole-suite or build evidence.
- At 2026-09-10 00:00 UTC, existing Chrome QA tab 42039471 was reused. Browser
  tab attachment timed out once; native Chrome UI remained responsive, so no
  process or environment restart was performed. A normal page reload displayed
  1,441 registered products (Coupang 1,254; rocket 187), then restoring the
  original search `11146359213` displayed its one product with 73 options.
  No collection was started. The consumer read succeeded in this observation;
  earlier transaction timeouts are not thereby explained or proven eliminated.
  The old separate catalog panel is still visibly present, confirming UI
  consolidation remains unapplied. API process/session 35448 remained live;
  only the already-known stale ad-KPI attempt 404 appeared in the new logs.
- Followed the Orders retained-input path end to end in the candidate:
  `convertIcecreamMallRows` passes the complete request body to
  `orderCollectionJsonSubmission`, which serializes it with canonical JSON;
  `completeAttempt` stores those exact source bytes. Consequently the existing
  retained artifact can supply original rows and selected row keys to the
  affected consumers without another table or execution system. Delivery
  lookup requires original order/delivery/sequence columns, including rows
  excluded from the newly converted subset; seen-key updates must follow a
  successful conversion. Forwarded this verified reuse path to the existing
  implementer. The three assigned implementation handles remained RUNNING;
  a bounded wait returned no new artifact. Integration remains pending.
- Main reviewed and integrated the corrected shared pending-tab retention
  patch (SHA-256 `c5229b4e83e573cf4da08988f417ccc4c24bc00c765c37fc983b96079acd1b15`)
  into the actual PR worktree, editing the canonical adapter and regenerating
  the loadable copy. Actual adapter, frozen-tab and app-lifetime regression
  files passed 34/34 with no skips; adapter sync, syntax, reverse apply-check
  and scoped diff checks passed. All pending IDs now survive close failure;
  cancel/remove recheck pending cleanup before deleting the session. This is
  source integration only: the installed Chrome worker has not been reloaded.
- The new actual-baseline consolidated chain patch (SHA-256
  `bc3d768949894909bc5c4d8fd6fc00283457fc4aef075dd7bd8747eb9dedbf57`)
  passes apply-check but is not yet applied. Its separate start-replacement
  fix now closes the previous managed window before replacing the stored
  root. Full consolidated review is pending. Also requested explicit coverage
  for closing after basics COMPLETE but before child admission, then reopening
  and explicitly starting before expiry: expiry-only overall-state handling
  does not resolve that earlier no-op retry gap. The saved partial publication
  must remain intact.

### 2026-09-10 — Consolidated chain review and reactive UI follow-up

- Main read all 4,278 lines of consolidated chain patch `bc3d7689` without
  applying it. A definitive details-admission HTTP 409 is incorrectly marked
  as transport uncertainty and rescheduled. A non-writing diagnostic using
  the isolated candidate's actual harness reproduced `status: running`,
  `chainPhase: admitting_details`, `overallState: RUNNING` after a pinned-basis
  conflict. Requested a regression and correction alongside the pending
  closed-before-child explicit retry fix. The first diagnostic invocation
  failed to resolve a package import; the corrected invocation resolved the
  existing package and reproduced the state without modifying source or data.
- Main fully read UI v3 patch SHA-256
  `d874557dca0907f0d9a33754cf6f55a8fced2d176e04007abd012ecb17a7e551`.
  It makes the registered-products handoff reactive to route query changes
  and requires both positive cancellation response fields. Reported 60/60
  focused and 109/109 broader tests remain agent evidence pending independent
  verification. The patch requires the final parent and incremental v2;
  none of those UI patches has been applied to the QA worktree yet.
- Existing API, web, Chrome tabs and QA data remain unchanged. Overall
  completion is still pending corrected integration and affected full gates
  and end-to-end QA; prior valid evidence is retained.

### 2026-09-10 — Orders continuation persistence review

- Main independently ran the three changed extension suites in candidate
  `/tmp/kiditem-continuation-target.u6Ei0r/repo`: 38/38 passed, no skips.
  Candidate patch SHA-256 is
  `1167b0f1308e9c4d1a3346a150c74caa3a919e51d85ba2c581089ed3fca883e4`.
  The local conversion error classification, converter boot import, missing
  row-count handling and owner-backed Icecream continuation were corrected.
- Integration remains held for a reproduced storage-failure regression:
  after a lost conversion ACK and worker restart, a pending-storage read
  exception is caught as a missing record and the provider is captured again.
  A non-writing diagnostic using the existing candidate harness observed
  `providerCaptures: 2`, `state: RUNNING`, `ownerReconciliation: required`.
  Required behavior is one capture and an explicit reconciliation hold.
- Also requested persistence-before-dispatch on same-worker retries: setting
  the memory map before a failed storage write currently lets the next call
  dispatch from memory without retrying the durable write. Both storage-read
  and storage-write failure cases need focused regression coverage. These
  are bounded corrections to the existing owner continuation contract, not
  new policy or an additional execution framework.

- Main independently verified UI v3 in
  `/tmp/kiditem-catalog-v3-check.9r1PSk/repo`: the broader registered-products
  and readiness command passed 14 files / 109 tests in 8.90 seconds. This
  verifies reactive link and strict cancellation ACK changes, not the
  still-missing pre-expiry fresh retry regression.
- Inline design decision for that retry correction: keep the completed basics
  owner immutable. A positive browser cancellation ACK plus a fresh owner
  read proving COMPLETE basics with no admitted child may authorize an
  explicit new basics key; do not replay a COMPLETE permit expecting it to
  run. Unknown cancellation or an existing child stays on the reconciliation
  path. The browser must not invent a FAILED canonical owner, and no new
  chain table or generic lifecycle is introduced. Existing account and
  latest-basis admission fences remain in force. The implementation agents
  were given this bounded decision; expiry-only handling is not accepted as
  coverage of this earlier retry case.

### 2026-09-10 — Follow-up review boundaries

- Main reread the active lifetime/UI amendment (lines 155–232): last-close
  reconciliation must allow an explicit fresh attempt without restarting the
  old collection; basics remains a saved partial publication, not whole-flow
  completion. The current correction preserves those contracts and terminal
  owner immutability.
- Coupang closed-flow follow-up `81a81c2a` was fully read. Its extension 409
  fix is relevant, but its web hunks target the obsolete pre-consolidation
  hook and removed panel and will not be applied. Requested an extension-only
  immutable delta and a status-0 transport regression; status 0 must not be
  treated as a definitive HTTP rejection. UI work remains with the current
  v3-based implementation, avoiding overlapping versions.
- Orders v10 `664c8a55` fixes unreadable-storage recovery, but its new test
  explicitly expects recapture after failed persistence and worker restart.
  That is not evidence that same-worker retries preserve an already-captured
  input. Requested retention in the existing memory map plus successful
  persistence before every replay dispatch, and a same-worker test asserting
  one provider capture. A capture never successfully persisted cannot be
  claimed to survive a worker restart.
- Ponytail finding:
  `order-collection-source.controller.ts:L37: delete: optional converter dependency and unavailable branch. Require the already-registered OrderCollectionService; stub it in tests.`
  `net: -5 lines possible.` This is separate from correctness findings.

### 2026-09-10 — Actual collection-window contract mismatch

- Main inspected the installed-source composition rather than relying on the
  importer's mocked window: `coupang/worker.js` supplies the existing
  `KidItemCollectionWindow` adapter. Its `close()` returns false when no record
  exists. The candidate importer now requires a true close receipt before
  replacing the old root, including an already-cleaned terminal root.
- A non-writing diagnostic using the actual PR adapter and existing test
  harness reproduced `{ empty: false, first: true, repeated: false }`. Thus
  normal subsequent explicit starts can be blocked by an already-closed
  previous window; the importer tests' default-true mock missed the mismatch.
- Inline correction: a proven absent record is successful idempotent cleanup;
  a different existing owner, failed resource close or uncertain storage read
  is not. Requested real-adapter regression coverage and an importer/adapter
  composition check in the existing Coupang implementation task. The scoped
  shared resource-contract change is required by catalog integration and must
  preserve unrelated user tabs. No real browser tabs were opened or closed
  for this diagnostic.

### 2026-09-10 — Orders v11 pre-integration contract audit

- Main read the v10→v11 delta completely and reread every actual root-to-target
  Orders/web/extension instruction chain. v11 apply-check passes against the
  actual PR worktree. The same-worker retry now retains its first capture and
  persists again before dispatch; the optional converter dependency was
  removed. Reported new 18/93/17 tests remain agent evidence pending the final
  integrated run.
- The pre-integration instruction audit identified one remaining boundary
  issue: the new pending record serializes `attemptToken` in session/local
  storage. Required correction is non-secret persisted attempt/environment
  identity plus original capture/plan only. Replay must verify that identity
  against its key and reconstruct its fence from the authoritative control
  already read by `execute()`. Requested token-absence and fresh-control-token
  replay tests. Do not expand this correction into unrelated legacy cleanup.
- v11 was not applied; existing runtime and QA data are unchanged.

### 2026-09-10 — Extension follow-up artifact verification

- Main fully read delivered `c88abac3` extension-only follow-up. It is an RTK
  human-readable diff summary, not a raw unified patch; actual apply-check
  fails with `patch fragment without header at line 10`. It was not applied.
- Its isolated adapter suite passed 61 tests, but the catalog suite could not
  load `@kiditem/shared`. Inspection also found stale surrounding code in that
  isolate: its source wire lacks the actual PR's `shouldContinue` support and
  its window adapter/test are the older larger versions. Those 61 tests do
  not prove compatibility with the actual current adapter.
- Requested a raw patch with the close change and tests based on the actual
  current window adapter, plus importer delta after reviewed consolidated
  parent `bc3d7689`. Preserve the current shared source wire and smaller
  adapter; do not replace them with the isolated stale copies. This is an
  artifact/baseline correction, not a new design or a reason to restart QA.

### 2026-09-10 — Orders continuation integrated into actual worktree

- Main accepted token-free v12 (`da885bde`) after reading the v11→v12 delta,
  then applied its 37 files with apply_patch. Reverse apply-check proves the
  actual worktree contains the delivered delta. Scoped diff checks and the
  production service-worker syntax check pass.
- Actual-worktree focused evidence: extension owner/converter/session tests
  41/41 passed (242 ms); three web suites 22/22 passed (4.24 s); three server
  suites 28/28 passed (4.27 s). These counts are from main's explicit commands,
  not the isolated candidate's differently scoped totals. Full PostgreSQL,
  backend boot, web build and installed-worker QA remain pending cohesive
  integration. Existing running QA services/worker have not been restarted.
- Main fully read UI pre-expiry patch `5e236def`. It only covers web cancel()
  followed by start(); last-app-close occurs in the extension and never sets
  the new web marker, so real reopen→explicit-start remains unhandled.
  Inline replacement: perform strict browser-cancel ACK and fresh no-child
  owner proof within the explicit start preflight for COMPLETE basics with
  overall RUNNING. Then use a fresh key; uncertain ACK or admitted child holds.
  Remove the new marker storage/ref/helpers instead of adding another status
  record. Mount/status reads remain non-mutating. Requested an unmarked
  remount regression; the UI patch remains unapplied.

### 2026-09-10 — Post-integration Orders cancellation review

- Main read the actual integrated owner, converter and worker composition.
  Both first submission and retained-capture replay check local activity
  before awaiting durable storage, then submit without a fresh check. A
  last-app-close during that write can therefore dispatch conversion after
  local cancellation. The worker submit wrapper has no compensating guard.
- Requested a bounded correction from the existing implementer: check local
  activity after successful persistence immediately before each submit, with
  delayed-storage cancellation regressions for first submission and replay.
  Keep the owner nonterminal, do not recollect or alter conversion policy.
- Whole-worktree diff check passed. The prior 41 extension, 22 web and 28
  server tests remain valid evidence for their covered paths, but do not
  cover this newly identified interleaving. Installed runtime and QA data
  remain unchanged; overall completion is not claimed.

### 2026-09-10 — Full extension gate and bounded follow-ups

- Main ran the full extension command against integrated Orders v12: 1,098
  tests, 1,094 passed, four failed, zero skipped (28.28 s). One failure is the
  automatic-order message scanner requiring inline correlation fields where
  callers now use the shared fenced-field helper. Three are Sourcing auth
  fixtures returning search/empty evidence for a detail URL and subsequently
  observing extra failure requests. Requested contract-preserving fixture/
  scanner corrections; do not relax runtime validation or bypass assertions.
- After that run ended, main integrated the two-file post-persistence cancel
  fence delta `2c8314f5`. Actual owner/converter focused tests passed 25/25,
  including both delayed-storage cancellation cases. Reverse apply-check and
  whole-worktree diff check passed. Full gate requires rerun after fixes.
- Main fully reviewed UI preflight v2 `3e6308c6`: removes new stopped-marker
  storage, preserves passive mount, requires positive cancellation and a fresh
  no-child read before fresh admission. It remains pending parent integration.
- Main fully reviewed raw Coupang replacement `a70de8be`; actual apply-check
  passes, but newly persisted pending-child cancellation contains a token in
  its permit. Requested non-secret linkage plus exact idempotent permit
  reacquisition on retry, preserving child identity and lost-ACK recovery.
  Also requested precise composition with the prior consolidated patch and
  evidence for its reported 15 catalog baseline failures. It is not applied.
- No installed worker reload, service restart, QA database change, provider
  collection, commit, push or deployment occurred during these checks.

### 2026-09-10 — Authentication fixture and window-close corrections integrated

- Main independently verified UI preflight v2 in its isolated artifact repo
  using the existing actual-worktree node_modules through a symlink: hook
  suite 20/20 passed (2.72 s). The earlier startup failure was missing local
  dependencies, not a test failure. UI production integration remains pending.
- Main applied only the two independent collection-window chunks from
  `a70de8be`. An absent record now acknowledges repeated close without
  treating another run's existing record as owned. Actual window tests 8/8
  passed; the importer portion of that patch remains unapplied.
- Main reviewed and integrated auth harness patch `fe67d75d`. It uses the
  existing validated detail fixture, sends extraction completion, and returns
  correlated owner receipts. Existing token/resync counts are unchanged;
  added assertions require the intended complete endpoint and prohibit fail
  requests. Actual auth suite 14/14 passed. No production validation changed.
- The automatic-order scanner correction and token-free catalog child
  cancellation linkage remain in progress. Full extension gate is not yet
  claimed green. Installed extension and QA services/data remain untouched.

### 2026-09-10 — Independent lifetime integration and canonical stop result

- Main re-reviewed and integrated 24 independent extension lifetime files from
  consolidated `bc3d7689`, excluding catalog importer/publication test and all
  backend/schema files. They use the existing session stop fence around
  collection, receipt retries and recovery. No new execution framework or
  capture policy was introduced.
- Main integrated Orders action scanner `6de86fac` after reading it. It uses
  the existing TypeScript parser to verify actual object fields or the exact
  imported shared helper; a same-named local helper/comment-only fixture is
  rejected. Seven changed-focused suites passed 56/56 in the actual worktree.
- The subsequent full extension run completed: 1,110 tests, 1,104 passed,
  six failed including parent cases (four leaf assertions), zero skipped,
  27.50 s. Prior auth and Orders scanner failures are resolved. New failures
  are seller-identity cancellation, Wing page/HTTP cancellation and SERP
  cancellation collecting results returning RUNNING after the cancellation
  command already confirmed server FAILED.
- Main traced all four assertions to the keyword-rank owner's unconditional
  stopped outcome. Requested a bounded exact-owner read on that return path:
  return a confirmed terminal result, otherwise retain cancellation-pending
  RUNNING. No new mutation, provider request, indefinite wait or weakened
  assertion is authorized. Existing one-failure-write/no-next-page checks
  remain required. Full-gate correction is pending, not accepted as baseline.
- Catalog importer/backend/UI remain pending cohesive integration. Source
  changes have not been loaded into the installed extension or QA services.

### 2026-09-10 — Catalog owner projection integrated

- Main re-read and integrated the remaining seven backend/shared files from
  `bc3d7689`: exact basics admission fence, preallocated child key and linked
  child status projection, plus contract tests. Actual shared package build
  passed including declarations (20.83 s); actual catalog service suite
  passed 22/22. PostgreSQL and running-service acceptance remain pending.
- Main compared the complete new importer `0013ee70` with reviewed `a70`.
  New pending cancellation linkage is token-free and reacquires the exact
  child permit through the original idempotency key. However, its replay-4xx
  branch settles the root and deletes the session without proving that the
  already-known child is terminal. Requested retaining that child linkage and
  session unless exact child terminality is independently confirmed. The
  importer remains unapplied; the new regression must cover replay 409.
- The reported 15 isolated catalog failures remain unaccepted. Main requested
  exact failures and a rerun with the freshly rebuilt shared contract, rather
  than treating unchanged isolated before/after counts as integration proof.

### 2026-09-10 — Catalog UI and cancellation chain integrated

- Main applied the reviewed UI sequence `f6e6e5ce` → `242faba3` →
  `d874557d` → `3e6308c6`, with forward and reverse checks at each step.
  Retired duplicate import panel and its dedicated spec were removed; git
  retains their recovery history. Every web file in the isolated v3 snapshot
  is byte-identical to the actual integrated result. The actual 13-file web
  regression scope passed 102/102 (7.09 s); the isolated report of 113 is
  not used as actual evidence and its count discrepancy is being checked.
- Main reviewed the replay-409 correction `3953056d` and integrated the
  complete two-file importer/publication patch `cb05720e`. A rejected replay
  retains tokenless pending-child linkage and the session instead of claiming
  terminality. Actual publication tests passed 96/96, zero skipped (0.79 s),
  including all 15 previously reported isolated failures. No assertion or
  production contract was weakened; that isolated failure report does not
  reproduce in the current integrated worktree.
- Catalog syntax and whole-worktree whitespace checks passed. Web build is
  running. Keyword-rank stopped-result correction remains pending before the
  next full extension gate. Installed extension/API/web runtime and QA data
  have not yet been refreshed or changed by this integration.

### 2026-09-10 — Full extension gate after catalog integration

- The 113 versus 102 web-test discrepancy is exactly the removed obsolete
  import panel spec's 11 cases; no live UI test was lost. The isolated catalog
  failures came from stale collection-session/collector dependencies, as
  confirmed by read-only comparison. Actual 96/96 remains authoritative.
- Main reviewed and applied `2b60dd54` keyword-rank stop reconciliation.
  Its exact-owner parser validates identity/state; a confirmed terminal read
  is returned, while unavailable reads retain cancellation-pending RUNNING.
  Actual focused tests passed 2/2. Full extension gate then completed with
  1,128 tests: 1,124 passed, four failed (three leaf assertions), zero skipped,
  28.45 s. Prior seller/SERP/Wing terminal-status failures are resolved.
- Remaining failures: the catalog managed-window static guard expects the
  old direct attemptId instead of the verified root helper; two Wing cancel
  cases close tab 42 twice instead of once. Requested a root-helper-aware
  guard preserving user-tab protection, and a bounded duplicate-close fix
  preserving unchanged boot assertions. Neither is waived as baseline.
- Production web build failed with 368 Turbopack module-resolution errors,
  including `@vercel/turbopack/postcss`. Node can resolve installed React,
  React DOM, React Query and Next from this worktree; cause remains under
  investigation. This is a failed gate, not build acceptance. No dependency
  installation, QA database reset or runtime restart was performed.

### 2026-09-10 — Build environment repair and full PostgreSQL verification

- Repeating the web build with the required QA proxy variables reproduced
  the failure. Its full log identifies an invalid nested dependency symlink:
  `node_modules/node_modules` pointed outside the project to the temporary
  Coupang worktree. Main verified its exact target and moved only that
  untracked symlink to a recoverable temporary backup. Installed packages,
  lockfiles and QA data were not replaced. Rebuild is running with
  `KIDITEM_PROXY_ALL_API=true` and the local API origin.
- Docker inspection found no surviving disposable integration database.
  Main read the current setup and database identity/reset guards, then
  started the full PostgreSQL suite. It created `kiditem_test` on port 57054
  and successfully pushed the schema; the run remains active. It does not
  target screen QA port 56879 or the operating clone at 5433.
- Main applied the narrow catalog static-guard correction to verify the
  root-session helper and its managed-window create/navigation calls. All
  direct user-tab mutation prohibitions remain. Actual session-flow tests
  passed 15/15. Wing duplicate-close correction is still pending; full
  extension acceptance is not yet claimed.

- The first link repair reduced build failures from 368 to 67; all remaining
  missing imports were `@kiditem/shared/*`. Inspection found that the shared
  workspace symlink also pointed at the temporary Coupang checkout. Main
  backed up that exact link and restored `../../packages/shared`, leaving
  package contents and lockfiles unchanged. The next web build is active.
  This is evidence of a second environment defect, not a successful build.
- Full PostgreSQL process remains live; read-only inspection of its exact
  test container shows current source-import queries executing, not a stuck
  setup. Continue observing the same run rather than restarting it.

### 2026-09-10 — Latest web build and full extension acceptance

- With both workspace-link defects repaired, the required production web
  build passed: compilation 70 s, TypeScript 114 s, all 46 static pages
  generated. It used the local all-API proxy build variables. The installed
  QA web process has not yet been restarted to serve this build.
- Main reviewed and integrated Wing close-ownership patch `92d66531`:
  after a successful session attachment, the session alone owns tab teardown;
  refused attachment and pre-attachment cancellation still close locally.
  Unchanged Wing boot cancellation cases passed 3/3. The subsequent full
  extension suite passed 1,128/1,128, zero skipped, in 36.42 s.
- Cutover scanner passed with zero findings, unowned producers, source-to-ABC
  references and legacy runtime references. Canonical adapter sync check,
  service-worker syntax and Wing collector syntax passed.
- Full PostgreSQL run is still active. Its first completed file reports one
  failing `ad-keyword-source` cancellation/Alert case (prior failure=false)
  among 30 tests. Detailed terminal diagnostics and all remaining files are
  pending. No timeout/assertion change or test restart has been made; full
  PostgreSQL and actual runtime/UI acceptance remain unproven.

### 2026-09-10 — QA API listener recovery

- Before live QA, main re-read the approved lifetime/UI amendment and checked
  the existing API process. Watch compilation reported zero errors, but no
  process listened on port 4000 and a bounded auth request returned no HTTP
  response. This is not accepted as NestJS boot evidence.
- Main inspected the preserved QA launcher and process tree, terminated only
  its wrapper and then its non-listening orphan API child. That child did not
  exit after SIGTERM and was force-stopped by its verified PID. Restart uses
  the same launcher, QA database port 56879, environment and disabled direct
  job worker. New watch compilation is running; successful boot is pending.
  No schema/data reset, deployment or marketplace mutation occurred.
- The full PostgreSQL suite remains live on its separate port 57054. Its
  current first-file failure report is retained; no test was restarted or
  altered while awaiting the remaining diagnostics.

### 2026-09-10 — Latest runtime boot and first UI acceptance

- QA API compiled with zero errors and Nest successfully started at 10:18:55;
  port 4000 is listening. Main replaced only the old QA web process with the
  passing build, verified port 3000 and the all-API rewrite (unauthenticated
  auth probe returns expected 401). Existing Chrome authentication remains.
- Product Design audit captured existing and refreshed registered-product
  screens: the duplicate stage panel is gone, the card layout is preserved,
  and the screen still reports 1,254 Coupang plus 187 Rocket entries. No new
  collection was started. Captures and bounded notes are in the temporary
  `kiditem-catalog-ui-audit-gPxnad` folder, outside git.
- The next dashboard screen exposes a real consistency defect: product
  readiness says no completed collection/initial collection needed, while
  its status block says whole product publication complete with basic-stage
  progress. Main traced readiness count filtering to only legacy/full and
  basics source types; detail enrichment can change the listing's last-import
  source. Requested a bounded canonical-projection fix and regressions for
  basics, partial details and completed details, without treating basic
  publication alone as whole-flow completion. Actual UI acceptance fails
  until this contradiction is resolved.
- Full PostgreSQL is still running. Rocket one-shot 4,000-row measurement
  reports 6,188 ms and complete read 167 ms; these are automated-test metrics,
  not actual extension performance acceptance. The earlier failed test remains
  unresolved pending complete diagnostics.

### 2026-09-10 — Readiness root cause and installed extension refresh

- A bounded read-only QA query confirms all 1,254 active Coupang listings
  currently link to a completed `coupang_wing_catalog_details` import. The
  readiness filter excludes that source type, explaining the false absence
  after successful enrichment. This confirms a consumer-query defect rather
  than missing collected data; no rows were inserted or changed.
- A second read-only check found no unexpired running source attempts in the
  QA organization. Main opened the existing installed KIDITEM OS details,
  verified its exact hard-cutover checkout path and extension ID, and used
  its Reload control once. The service-worker link became inactive afterward
  with no new displayed extension error. Main returned to the preserved QA
  web tab; Wing and web tabs, authentication and data were retained.
- This loads the passing extension source but does not prove the full live
  chain or lifetime policy. Readiness correction and actual affected-flow
  acceptance remain pending; no fresh provider collection was started here.

### 2026-09-10 — Matching preservation and readiness correction

- Read-only QA inspection at 01:35:05 UTC matched the accepted baseline:
  745 mapping components (hash `7e5179cab5a23b22319d95f69afa92758c058b7bde29bbebbb3c6f338a323fa1`),
  2,014 stock rows (hash `93cc1f31eea0f617fb4f091e2f264d662731f85077ce27cab7df236eb09317a6`),
  and the same 11 ABC mappings/revision 3/September 8 cutoff. Catalog remains
  1,441 listings and 2,458 options. The completed details receipt and resolved
  Alert are unchanged. The designated workbook was already accepted earlier;
  do not upload it again merely to reproduce preserved evidence.
- Actual matching screen shows 728 filtered products and 435 configured
  options. Expanding one product reveals four color options, each mapped to
  Sellpia SKU 443-1 with deduction quantity 1. Four options are not four units.
  Screenshot `04-matching-preserved.png` is retained outside git alongside
  the earlier UI captures; no matching/save/stock-mutation action was used.
- Main reviewed and integrated readiness patch `adec21f6`: include published
  details receipts in coverage, retain coverage during partial detail work,
  require full/details completion for whole readiness, and label progress by
  its actual owner stage. No new persistence or collection policy was added.
  Actual-worktree tests pass: backend readiness 9/9, web readiness/catalog
  hooks 58/58. Rendered-row follow-up regressions and the required rebuild/
  boot/readiness screen recheck remain pending.
- Full PostgreSQL run is still active. It now reports a second failing case:
  Sourcing current COMPLETE 1688 generation/explicit zero snapshot. Preserve
  this run and await terminal diagnostics; neither failure is waived. Runtime
  logs also show one dashboard inventory transaction timeout at 10:32:37,
  followed by a successful read. Recheck under stable load before deciding
  whether a code correction is required; do not raise timeouts speculatively.

### 2026-09-10 — User-forwarded architecture feedback, current-code review

- Received all three candidates from the user's side discussion. They are
  review inputs within this ACTIVE scope, not approval for a generic runner
  or unrelated redesign. `improve-codebase-architecture` is unavailable in the
  current catalog/local skill paths; main used the available `codebase-design`
  and its replace-don't-layer testing guidance. No review agent is added.
- Candidate 1 remains strong: current ad-center and Wing-report `getResource`
  implementations duplicate acquire/bind/attach/ACK/cleanup ordering. The
  existing CollectionWindow already owns recovery, resource cleanup and
  optional session/binding dependencies. Before accepting extraction, an
  isolated test-only task will connect actual resource/session implementations
  and exercise cancellation at each await, refusal, late creation, close
  failure and user-tab preservation. Provider URL/login/attention reuse and
  canonical source terminality stay outside that module. Catalog sharing is
  conditional on the same contract, not assumed from visual similarity.
- Candidate 2 is directly relevant to the readiness defect. After UI panel
  consolidation the route-local catalog hook has only one production caller,
  shared readiness, but exposes raw owner, chain owner and whole-state
  representations. Main also found a real legacy basics receipt with server
  `overallState=COMPLETE` bypasses the first hook correction; suppressing it
  alone risks an indefinite disabled retry. The bounded correction must
  distinguish saved standalone basics from pending linked details, preserve
  explicit fresh start, and concentrate interpretation in the existing hook.
  Merely moving the file is not accepted as a depth improvement.
- Candidate 3 is adopted as a verification improvement: isolated Orders work
  will use the real registered entrypoint and owner/lifecycle/converter/session
  composition, replacing only external Chrome/provider/transport adapters.
  Cover save cancellation, conversion ACK loss, restart/token reread and
  no duplicate provider capture. Replace internal fake/extracted-function
  assertions only when stronger equivalent interface coverage is proven;
  retain parser, external failure injection and load-order tests. No new
  production assembly or runner is authorized by this test-only step.
- The first readiness-delta web build passed (68 s compile, 53 s TypeScript,
  46 pages), and IDOR/tenant-scope scanners passed. It does not include the
  pending legacy-basics correction and is not yet served as final QA evidence.

### 2026-09-10 — Skill path correction, cleanup instruction and latest runtime

- User supplied the installed `improve-codebase-architecture` skill path in
  the development plugin data checkout. Main read it and HTML-REPORT.md in
  full, then applied its report format with `codebase-design` vocabulary.
  The earlier availability statement is superseded. Root CONTEXT.md and
  docs/adr were not found; ACTIVE specs remain the domain decision authority.
  The user's main-only review instruction overrides the skill's default
  exploratory reviewer delegation. Latest three-candidate before/after report:
  `/var/folders/cx/2zjyh9bd1wnfygwc2h24lzch0000gn/T/architecture-review-1789005322931.html`.
- User explicitly authorized cleanup of completed test DB containers. Inspect
  exact ownership and completion before removal; retain active tests and the
  preserved screen-QA/operating services. Current full inventory has no
  completed container from this task: one live PostgreSQL test container and
  its live Ryuk share session c0dee4f39f70. QA port 56879 carries preserve and
  screen-qa labels. Unrelated stopped industry-wiki containers are excluded.
  Verify runner teardown after the full suite and remove only proven leftovers.
- Main integrated legacy-basics delta `9569aca4` after checking the actual
  server receipt: saved standalone basics no longer settle as whole COMPLETE,
  the row explicitly names the partial result, and fresh `상품 받기` remains
  available. Linked details still control whole completion. Latest actual
  web regressions pass 76/76 across 5 files, including rendered modal cases.
  Web production build passed (59 s compile, 47 s TypeScript, 46 pages).
- The API watch process had closed its listener during recompilation but its
  old child remained alive. Main force-stopped only verified PID 25258 after
  prolonged shutdown; the same watcher spawned PID 37622. Nest successfully
  started at 10:53:24 and listens on 4000. No launcher/env/data reset occurred.
  Main replaced only old web PID 25438; current web start session 71705 serves
  the latest build and was ready in 315 ms. Auth probes return expected 401
  without a browser cookie. Actual readiness screen acceptance is next.
- Full PostgreSQL remains active and now reports a third failure in Sourcing
  product-extension search-artifact/detail completion. Await final diagnostics
  for all three failures; no failure, timeout or assertion is waived.

### 2026-09-10 — Full PostgreSQL outcome and ready-catalog UI follow-up

- Full PostgreSQL invocation finished with 98/101 files and 832/835 tests
  passing, duration 3577.62 s. Failures: Ad keyword beforeEach reset hook
  exceeded 30 s; the Sourcing current-generation fixture aged beyond its
  seven-day lookup window; product-extension detail completion returned 502.
  No assertion/timeout/skip was relaxed. The date-sensitive fixture alone was
  corrected with the suite's existing relative-date helper.
- Focused repeat of all three files on a new runner-managed test database
  passed 57/57 tests in 166 s. This verifies the date correction; the hook and
  502 failures did not reproduce and are not declared root-caused. A latest
  all-files pass remains required. Logs: `/tmp/kiditem-full-pg-20260910.log`
  and `/tmp/kiditem-pg-three-failures-rerun-20260910.log`.
- Both completed invocations cleaned their PostgreSQL/Ryuk containers. Docker
  readback confirms only preserved QA port 56879, operating port 5433 and
  MinIO remain active; unrelated stopped containers were not touched.
- Actual matching view, with the active-only filter off, shows the bundle
  `(1+1)3000정수기놀이` (externalId 12480923026) mapped to Sellpia SKU
  8710-1. All seven color-combination options show quantity 2 in AX; the first
  visible row shows 2 in screenshot `05-matching-bundle-quantity.png`.
  No re-upload, automatic rematch or manual matching mutation occurred.
- Latest actual readiness now correctly places the existing product list
  under prepared items. A follow-up UI defect remains: the compact ready row
  hides the sole explicit catalog refresh/progress interface. The same modal
  must keep its existing catalog action card for ready and non-ready checks,
  without duplicating the panel or changing readiness counts. Isolated fix
  and rendered ready/pending regressions are in progress before fresh QA.

- Ready-row correction `c13ec9f5` is integrated: one existing ActionCheckCard
  now renders the ready catalog check; other prepared checks stay compact and
  counts remain unchanged. Actual modal 20 tests plus hook/readiness 46 tests
  pass. Latest production web build passed (34 s compile, TypeScript and 46
  pages); session 66999/PID 50587 now serves it. QA API remains PID 37622.
- Orders real-interface patch `075560a5` replaces five internal-fake tests
  with registered-worker/session/owner/converter coverage. Commit-before-ACK
  loss, transient ACK loss, durable replay, cancellation, refreshed tokens and
  no recapture are covered. The original Office runId compatibility test is
  retained. Focused actual run passed 122 tests.
- Browser-resource patch `5b2d88db` adds connected resource/session/Ad/Wing
  tests with unmodified production session modules; race controls substitute
  only Chrome/binding adapters. It does not replace existing policy tests or
  change production structure. Focused related suite passes 63; final full
  extension suite passes 1139 with no skips. Adapter-sync, worker syntax and
  diff whitespace gates pass.
- Cutover scanner passes with zero findings; reconstruction guard passes
  against origin/develop. Live-PR-body release guard still lacks the already
  identified historical-migration baseline declaration. Candidate analysis
  including all 1958 changed/untracked paths and the previously validated
  5b154ca035bc2c729b6f61a14d297391ce6adbd9 baseline passes with zero errors.
  No live PR body was changed; this is candidate evidence, not a live PR pass.
- Final all-files PostgreSQL repeat started in session 3253 on runner-owned
  port 57058 after the web build. Do not run another reset suite concurrently
  or remove this active container; preserve and reuse its final evidence.

- Browser control changed during acceptance: native Chrome control became
  unavailable. The installed Browser client can list the same three user
  tabs, but its claimed QA tab returns `Debugger unattached` from both AX and
  DOM. Supported diagnostics confirm Chrome running, ChatGPT extension
  enabled and native-host registration correct. User explicitly requested
  reconnection; the supported Default-profile connection-window command was
  issued without closing existing tabs. Claiming the same QA tab afterward
  timed out waiting for Page.enable. No native-host repair, permissions
  expansion, browser kill or QA reset was attempted. Latest ready-card
  screen verification and fresh lifetime/chain acceptance remain unverified
  pending browser-control restoration; full PostgreSQL continues independently.

### 2026-09-10 — approved all-dashboard partial-aggregation amendment

The selected 2nd dashboard visual and the user's all-metrics clarification
extend the existing analytics read-model contract. This is a cross-layer
contract change under the linked active spec amendment. The subsequent
source/ABC amendment below extends the owner execution/publication scope.
Existing approved main-review/Luna-max
implementation allocation continues. Browser visual acceptance is blocked
by the recorded connection problem; implementation and isolated tests can
proceed without claiming visual completion.

- [ ] Add explicit period/snapshot basis contracts in focused dashboard
  schemas. Period bases carry actual date sets (including holes), count,
  missing dates, source identity and partial/no-data state.
- [ ] Replace whole-range suppression in dashboard sales/advertising/traffic
  and Sellpia read models. Align every multi-source calculation by date,
  preserve independent single-source totals and legitimate zeroes, and
  propagate query errors. Review all trend, daily, comparison, benchmark,
  inventory and stored ABC surfaces under the same contract.
- [ ] Implement the selected left-metrics/right-data-status composition in
  existing dashboard routes/components. Bind values to their own server
  bases, preserve range selection, existing collection actions and Agent OS.
  Missing, query error and genuine zero states must be visibly distinct.
- [ ] Run behavior regressions through actual service/repository interfaces,
  shared build, scoped web tests, full web build, Nest boot and scoped PG.
  Keep the active all-files PG invocation isolated until it finishes; do not
  mutate or remove its runner database while active.
- [ ] Reconnect Chrome, compare the selected visual to the real rendered
  dashboard, exercise controls and all affected data states, and complete
  outstanding source/lifetime QA. Preserve QA and operating databases.

### 2026-09-10 — approved valid-history and confirmed-source-unit amendment

The user explicitly replaced the blanket source/ABC exclusion. Main owns
contract design and review; Luna/max implementation lanes remain isolated
until reviewed. Primary responsibility is validity-aware reporting and ABC
evidence admission; named affected owners are Products, Finance, Advertising,
Analytics, shared contracts and their existing UI/extension consumers. No
unrelated domain cleanup or implicit downstream calculation is included.

- [ ] Inspect and change ABC eligibility and publication together: select the
  newest compatible valid complete actual cutoff, remove unconditional
  yesterday/latest-attempt barriers, preserve complete evaluation-period
  integrity, and prohibit official cutoff regression or failure-driven erase.
- [ ] Keep valid stored-grade display separate from source freshness while
  retaining real account/mapping/correction invalidation. Surface cutoff and
  latest-data-not-applied status through existing product/dashboard readers.
- [ ] Inventory source contracts before changing them. For Wing, establish
  an owner-confirmed-day publication seam with all-date/period evidence kept
  separate. Never expose incomplete-day staging as published data. Determine
  persistence/migration needs explicitly before applying database changes.
- [ ] Test source unit replacement/idempotency/fencing, missing page/day,
  explicit zero, latest failed attempt preservation, account/mapping change,
  internal ABC holes, common-cutoff selection and non-regressing publication
  through real owner interfaces and PostgreSQL transactions.
- [ ] Update only conflicting durable ownership guidance and architecture
  contracts after the final source-unit design is settled; run instruction
  hygiene, tenancy, cutover, release and reconstruction gates.

- The pre-amendment final PostgreSQL repeat finished with exit 0: all 101
  files / 835 tests pass, no skips, duration 1427.36 s. Log:
  `/tmp/kiditem-full-pg-final-rerun-20260910.log`. Docker readback confirms
  runner PostgreSQL 0470f2d819b8 (port 57058) and Ryuk d37429fa1259 are gone.
  QA 56879, operating 5433 and MinIO remain untouched; unrelated stopped
  containers were not removed. This is the completed pre-amendment baseline,
  not validation of the new dashboard/ABC/source-unit changes.
