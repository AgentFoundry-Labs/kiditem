# Extension Collection Deepening Implementation Plan

**Status:** SUPERSEDED

**Superseded by:** `docs/superpowers/specs/2026-09-08-extension-collection-deepening-design.md` — user instruction: the spec defines acceptance; this separate execution plan is not a procedural requirement.

> Execute collector-sized tasks with subagent-driven implementation and main-session integration review. No separate reviewer agent, commit or push: the user's explicit execution constraints override generic skill defaults.

**Goal:** Concentrate extension source collection complexity behind meaningful interfaces and finish the remaining provider-read, completeness and owner-status work without replacing valid owners.

**Architecture:** Preserve CollectionSession, named owner modules and their collect seams. Browser resources remain source-neutral; capture modules own provider policy. Existing cohesive source modules remain intact.

**Tech Stack:** Manifest V3 JavaScript, Node test runner, NestJS, React/Next.js, existing source-owner HTTP contracts.

**Spec:** `docs/superpowers/specs/2026-09-08-extension-collection-deepening-design.md`

## Global Constraints

- Work only in `/Users/yhc125/workspace/kiditem-pr493-hard-cutover`, branch `fix/product-abc-refresh-timeout`, PR 493 targeting `develop`. Every shell invocation sets this workdir or uses absolute paths.
- Preserve all pre-existing dirty work. No commit, push, merge, deployment, workspace cleanup, QA reset or real commerce mutation.
- Main is the sole browser operator and integration reviewer. Implementation uses Luna/max. Use one implementation writer at a time; main owns load-order/composition changes.
- Existing CollectionSession and server owner authority remain; no new generic runner, local terminal ledger or automatic ABC trigger.
- Original source URLs, frozen plans, authentication/attention behavior, bounds, cancellation, evidence and idempotency stay intact except the explicit source fixes below.
- Full baseline: 898 extension tests pass. A collector is accepted only with appropriate regression and actual extension → owner → screen evidence. Track implementation-only and held separately.
- Common-window changes invalidate affected Wing traffic/itemwinner browser acceptance, not unrelated source evidence. Preserve previous complete snapshots and isolated failures.
- Existing verified APIs and embedded JSON stay. Unverified AUTO ads and TikTok provider behavior must not be promoted to complete evidence.

## Task 1: Wing Search Capture Interface

**Files:** Create `extensions/kiditem-os/background/coupang/wing-search-collector.js`; modify Coupang worker composition and affected search callers; main wires `background/service-worker.js`. Tests: `extensions/tests/coupang-ads-scraper/wing-search-collector.test.mjs`, existing Wing search/owner/cancellation and boot suites.

**Interface:** `KidItemWingSearchCollector.create(dependencies).collect(input)` consumes the current `searchWingCatalogProducts` input (`keyword`, `maxPages`, `attemptId`, `environmentId`, optional `collectionTabId`, `signal`) and returns the existing capture envelope unchanged. Dependencies are concrete browser/session/attention adapters used in production and fake adapters in tests; parser/retry/cursor policy stays private.

- [ ] Characterize through the new interface: request payload, XSRF absence, actual result-array proof, cursor order, 429/5xx retry, last28d normalization, dedupe, first-page versus later-page failure, abort, wrong environment/producer, owned-tab cleanup.

```js
const result = await collector.collect({ keyword: '블록', maxPages: 5,
  attemptId, environmentId: 'local' });
assert.equal(result.dateWindow, 'last28d');
assert.deepEqual(result.pages.map(page => page.searchPage), [0, 2]);
assert.equal(result.stopReason, 'empty_page');
assert.equal(result.rows.length, 1);
```

- [ ] Move request, bounded page retry, pagination, normalization and proof into the collector. Inject current effective tab readiness explicitly, avoiding the shadowed duplicate function. Keep each owner's terminal decision and caller-level whole-search retry outside capture.
- [ ] Wire all three callers. Preserve tracked filtering but reject failed/incomplete transport proof before publishing a keyword as searched; retain the existing intentional max-page bound.
- [ ] Replace superseded source-string extraction tests with interface tests, keep owner integration gates, run focused suites and full extension suite after composition integration.
- [ ] Main reviews new diff and performs actual Sourcing search / Wing rank / tracked-product acceptance; record affected caller evidence separately.

## Task 2: Source-Specific Browser Collection

**Files:** `background/coupang/collection-window.js`, new `background/coupang/ad-center-collection.js` and `background/coupang/wing-page-collection.js`, Coupang worker composition/service-worker; `collection-window*.test.mjs`, source owner and `collection-session-flow` suites.

**Interfaces:** Keep named owners' `collect({ environmentId, attemptId, control })` and profitability `collectSlice` contract. The source modules consume existing owned browser resources, sessions and content-message transport. CollectionWindow retains owned resource create/reattach/navigation/close/recovery, not producer branching or source plan interpretation.

- [ ] Move behavioral tests before removing old paths: ad same-attempt 12+12+7 continuation, stalled cursor cap, login handoff, keyword missing-tab behavior, explicit account date propagation, Wing traffic/itemwinner control, cancellation ACK and prior owner isolation.

```js
await source.collect({ environmentId: 'local', attemptId, control });
assert.equal(messages[0].collectionRunId, attemptId);
assert.equal(messages[0].targetDate, '2026-09-06');
assert.equal(ownerWrites.length, 0); // capture does not decide publication
assert.equal(userTabsRemoved.length, 0);
```

- [ ] Put ad URL/identity/resume/progress/date rules in Ad Center collection and Wing commands in Wing page collection. Do not implement a policy callback for every old branch or a generic source registry.
- [ ] Preserve resource ownership, no-focus behavior, bounded missing-tab recovery and cleanup. Keep the catalog resource adapter working without advertising dependencies.
- [ ] Main wires owner collect callbacks, removes obsolete worker receipt/target policy only after the new interface covers it, and runs all affected tests plus full extension/boot/load-order gates.
- [ ] Reload unpacked extension and validate ad keyword/profitability/account daily, Wing traffic/itemwinner, and full catalog consumers affected by the shared delta. Do not mark this task accepted from tests alone.

## Task 3: Verified Advertising Campaign/Product Read Conversion

**Files:** `content/coupang/ads-report.js`, focused `content/coupang/ad-product-metrics.js` if needed to own the complete request/coverage/normalization policy, manifest load order; `ads-report-campaign-source.test.mjs`, `ads-report-keywords.test.mjs`, new product metric interface tests. Direct owner/schema changes only if required by preserved metadata/evidence.

**Interface:** A product capture consumes frozen campaign/group IDs, explicit mapped ad IDs and business dates, and returns normalized product-grain rows plus exact coverage/provenance. Keep existing keyword and profitability interfaces unchanged.

- [ ] Test observed read payload and six required metrics, exact response-key coverage, multiple groups, real zero versus missing, malformed JSON/HTML/auth/error, duplicate IDs, AUTO empty roster and summary/product grain separation.

```js
assert.equal(request.body.tableType, 'product_sales');
assert.equal(request.body.creativeId, null);
assert.equal(request.body.start, request.body.end);
assert.deepEqual(request.body.targetList, ['ad-1', 'ad-2']);
assert.equal(captured.rows[1].adSpend, 0); // only from an explicit zero
await assert.rejects(capture(missingMetricFixture), /incomplete|missing/i);
```

- [ ] Reuse the verified roster/group JSON code rather than duplicate it. Replace daily metric DOM/date-picker work for verified manual product paths; preserve required metadata not supplied by JSON through bounded metadata capture.
- [ ] Preserve full frozen date/group traversal and owner receipt authority. Do not substitute current ten-campaign roster for historical report manifest; do not use campaign/account totals for product facts.
- [ ] Keep AUTO metadata/unavailable handling until comparable provider/UI coverage is proven. Do not convert an empty configured-ads array to zero performance.
- [ ] Run focused collector and owner contract tests; main validates actual extension receipt, same-grain/date owner values and screen. Complete account-daily v2 E2E separately.

## Task 4: Rocket Per-PO Completeness

**Files:** `background/orders/rocket-po-collection.js`, Rocket extension tests; directly connected shared Rocket evidence schema and Channels owner validation/tests if evidence needs extension. Read the Rocket inventory runbook before editing.

**Interface:** Preserve `KidItemRocketPoCollection.create(...).collect(plan, collection)`. Provider HTML parsing stages rows per PO; no partial PO rows become accepted output. Owner still checks page/detail/vendor/fence evidence.

- [ ] Add interface fixtures for 13/1/46 SKU shapes, malformed short rows, required missing numeric fields, duplicate lines/POs, SKU-count discrepancy and each observed status quantity total; assert failure leaves no usable partial rows.

```js
const result = await collector.collect(plan, collection);
assert.equal(result.success, false);
assert.equal((result.rows || []).length, 0);
assert.match(result.error || result.errorCode, /completeness|SKU|detail/i);
```

- [ ] Keep list JSON + HTML direct requests and concurrency five. Validate against provider-observed headings/summary fields, not guessed JSON property names. Retry one mismatching detail once; persistent mismatch is explicit failure.
- [ ] Preserve full-page and vendor guards, authenticated empty-list proof, previous COMPLETE on failure and uncertain terminal ACK reconciliation. Extend owner proof validation only with a tested explicit contract.
- [ ] Run focused Rocket/parser/source-owner tests and disposable owner PG gates if changed; main repeats PA/RP actual extension → owner → screen count and quantity comparisons. Never confirm POs or modify physical stock.

## Task 5: Public Search/Seller Capture Locality

**Files:** Coupang worker public-search/suggestion/seller helper groups, source-specific modules under `background/coupang/`, service-worker wiring; SERP, keyword suggestion, seller, competitor source-owner and boot tests.

**Interfaces:** Preserve each existing caller's capture envelope and source owner. Separate keyword suggestions, SERP, seller identity and seller-store capture where source knowledge otherwise leaks across callers; do not create one all-purpose public-Coupang executor.

- [ ] Record existing outputs and stop proofs through capture interfaces, including access-denied DOM that also contains product rows, max-page policy, newest-first seller sorting and server-selected URL restrictions.

```js
const result = await capture(frozenInput);
assert.equal(result.success, false);
assert.notEqual(result.proof?.explicitEmpty, true); // access wall is not empty
assert.deepEqual(requestedUrls, allowedDiscoveredUrls);
```

- [ ] Concentrate request/extraction/pagination/normalization dependencies behind source-specific interfaces. Keep identical bounds/delays and optional enrichment semantics. Preserve named owner wire and no arbitrary URL execution.
- [ ] Remove only helpers that now have no caller; retain domain-level batch admission and server owner behavior. Run focused source tests and full extension boot gate.
- [ ] Main validates changed live source paths, recording access-control/availability holds individually without bypassing them or blocking other collectors.

## Task 6: Orders/Sellpia And Sourcing Disposition

**Files:** Orders worker Sellpia tracking/sales/product-profit blocks; focused source collectors beside existing Sellpia inventory/manual-match modules; Orders capture tests. Sourcing product/1688/live/TikTok modules remain unless a concrete contract defect is confirmed.

**Interfaces:** Preserve existing owner `collect` callbacks and normalized outputs. Each Sellpia source collector accepts its frozen plan/range and collection context. Existing inventory/manual-match modules remain the reference for cohesive provider capture, not a new shared runner.

- [ ] Characterize seller/date keys, order-time supply cost, VAT/month coverage, missing versus zero and authentication outcomes before moving Sellpia request/parser logic.

```js
const result = await collector.collect({ plan, ...collection });
assert.deepEqual(result, baselineNormalizedOutput);
assert.equal(providerMutationCalls.length, 0);
```

- [ ] Deepen the three Sellpia capture sources without merging owner domains or changing ranges. For mall collectors, retain already-cohesive named functions; change only demonstrated shared-policy leakage, not every function to reduce worker size.
- [ ] Add/retain a collector reachability guard proving read collectors cannot invoke order upload, post-transfer, invoice, tracking upload or PO confirmation. Do not refactor those mutations as a separate business change.
- [ ] Keep existing Sourcing deep modules and source wire. Check dual description enrichment for actual duplicate policy before changing it. Keep TikTok unverified-provider limitation explicit. Regression tests and live evidence are recorded per changed source; unmodified available evidence may be reused.

## Task 7: Owner-Derived Popup And Final Acceptance Ledger

**Files:** `popup/popup.js`, optional sourcing popup response observability only if needed; Coupang worker monthly dispatch; `popup-environment.test.mjs`, Wing source tests and monthly owner contract test. Use existing source status endpoints before adding any backend read.

**Interfaces:** Popup consumes safe owner source reads, never local last_sync as completion. Monthly action begins one closed-day range using the existing Wing v2 path and follows that exact owner attempt. Inventory export remains a file result.

- [ ] Test latest FAILED plus previous COMPLETE, independent source failure, missing/zero counts, environment-switch race, invalid/future month and current-month cutoff.

```js
assert.match(card.textContent, /실패/);
assert.match(card.textContent, /마지막|이전/);
assert.equal(readStorageKeys.some(key => key.startsWith('kiditem_last_sync_')), false);
assert.equal(beginCalls.length, 1);
assert.equal(beginCalls[0].endDate, lastClosedBusinessDate);
```

- [ ] Replace local status cards/polling with owner-derived state. Remove the monthly v1 loop only after its owner-range behavior is covered. Keep prior data untouched and cancellation environment-bound.
- [ ] Main runs complete extension gates, changed backend boot/owner tests and changed web production build. Review only integrated new deltas against this spec and the retained parent contracts.
- [ ] Complete the per-collector acceptance table with exact attempt/state/count/grain/period/screen/preservation evidence. Mark accepted, implementation-only and held distinctly. Report KID-33 status and unchanged PR/branch; no commit/push/merge/deploy/cleanup.

## Execution Ledger

- Inventory and responsibility design recorded from the current task worktree.
- Pre-change full extension gate: 898 passed, 0 failed, 0 skipped.
- Preflight: Tasks 1/2/5 share Coupang worker and service-worker composition;
  serialize implementers and let main integrate load order. Task 3 touches
  content/manifest, and Task 2 supplies its browser capture; preserve the same
  owner collect interface across them. Tasks 4/6 share Orders wiring only;
  serialize that wiring. Task 7 consumes existing owners and the Task 2 Wing
  capture; do not introduce a second range/terminal authority. Every task's
  tests describe its advertised interface and preservation constraints.
- Ruling: preserve inventory workbook export separately from catalog import —
  export is a different user outcome, not duplicate canonical authority; merging
  them would unexpectedly publish data on a download action.
- Ruling: manual product_sales is a verified migration candidate although not
  yet implemented; AUTO ads-with-metrics remains separately unverified.
- No implementation task is complete yet.
