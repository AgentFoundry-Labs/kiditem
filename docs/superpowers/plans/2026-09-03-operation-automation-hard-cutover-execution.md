# Operation And Automation Hard Cutover Execution Plan

**Status:** ACTIVE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreliable Operation/Automation execution plane with source-owned imports, an explicit absolute-ABC publication command, durable Alerts, and direct domain capabilities on PR 493.

**Architecture:** Four subordinate plans land in dependency order. Each plan protects a public seam with a failing test before production changes, and the final plan deletes the old runtime only after every surviving caller has moved. The database cutover is admitted from `origin/release/office` through the existing explicit schema/data cutover path.

**Tech Stack:** NestJS, React/Next.js, TanStack Query, Prisma 7/PostgreSQL, Chrome extension Manifest V3, Vitest, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Global Constraints

- Work on `fix/product-abc-refresh-timeout`; PR 493 targets `develop` and is not rebased or force-pushed.
- `release/office` is the Office deployment source. Version `0.1.31` owns every new destructive reset and baseline migration.
- Tests use only the seven confirmed public seams: source owners, Alerts, `ProfitabilityEvidence`, pure absolute evaluation, explicit ABC publication, Products read/UI, and legacy scanners.
- `POST /api/products/abc/recalculate` returns `200 PUBLISHED`, `200 SOURCE_NOT_READY`, or `409 INPUT_CHANGED`.
- Source completion never invokes or mutates ABC. The Product Hub ABC data-status surface is the only production caller of explicit recalculation.
- No V2 path, compatibility DTO, Operation fallback, worker, scheduler, child workflow, outbox, dirty bit, requested/recalculated revision, population hash, calibration, reliability adjustment, or Orders eligibility remains.
- Existing ABC state and grade cache are reset. The first full publication is a history-free baseline; later real grade transitions alone create history.
- Operating data is inspected read-only before destructive work. No Office mutation occurs from this macOS checkout.
- Independent implementation slices may use `gpt-5.6-luna` at `max`; the main agent owns integration and verification. One `gpt-5.6-sol` reviewer at `max` performs the final diff review and reports only new P0/P1 issues and deletable complexity.

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

Any implementation agent may modify only files named in `2026-09-03-advertising-source-owner-cutover.md`. The main agent runs and fixes integration tests after focused green evidence is reported.

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

- Consumes: all focused green tests, the legacy scanner, an operating-data preflight report, browser QA, and the final independent review.
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

- [ ] **Step 3: Run the actual browser flow**

Start API/web/extension dependencies, open the Product Hub ABC surface, verify source status and cutoff labels, invoke the explicit refresh, reload, and confirm the committed publication remains visible. Capture the request duration and ensure it stays inside the browser/proxy/API timeout.

- [ ] **Step 4: Request one final independent review**

The reviewer compares `origin/develop...HEAD` and reports only newly introduced P0/P1 findings plus complexity that can be deleted. The main agent fixes confirmed findings and reruns affected tests.

- [ ] **Step 5: Prepare PR 493 for merge**

Read the existing PR template and live PR, verify base/head/commit count/diff
scope/checks/conversations, update the PR body with DB reset and baseline
decisions, push the topic branch, and update KID-33 to the `병합 준비`
checkpoint only after reading both systems back. The checked-in PR template is
not changed by this cutover.
