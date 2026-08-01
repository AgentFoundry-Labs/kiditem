# Automatic Product Profitability ABC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unshipped cumulative-share ABC implementation with an automatically calibrated product profitability grade fed by Sellpia product-profit history, authoritative advertising spend, and paid-order evidence, while separating full Sellpia synchronization from inventory-only synchronization and presenting the same grade/status semantics on Dashboard, Product Management, and Product Outflow.

**Architecture:** The Chrome extension reads one continuous approximately 400-day `stat_prd_profit` range and Analytics persists exact monthly source coverage. Advertising owns authoritative daily ad-spend facts. Finance combines those sources with paid-order eligibility and explicit zero-valued deferred cost components. Products owns immutable organization formula versions, deterministic rolling-origin calibration, evaluation, status/history, and `MasterProduct.abcGrade`. Inventory owns a persisted `full | inventory` synchronization scope. All web surfaces consume organization-scoped NestJS read models and never calculate or edit ABC locally.

**Tech Stack:** Prisma 7/PostgreSQL, NestJS, TypeScript, Zod and focused `@kiditem/shared/*` exports, Next.js App Router, React Query, Chrome Extension Manifest V3, Vitest, Node test runner.

---

## Implementation Constraints

- Implement the approved design in [`docs/superpowers/specs/2026-08-01-automatic-product-profitability-abc-design.md`](../specs/2026-08-01-automatic-product-profitability-abc-design.md). If implementation pressure exposes a design conflict, amend and re-approve the design before changing the business policy.
- Treat the existing ABC commits on this feature branch as unshipped intermediate work. Remove their cumulative 70/90 share thresholds, fixed 30/90/180/360-day selection, lifecycle, provisional/official distinction, and manual criteria selection rather than preserving those concepts in compatibility DTOs.
- Do not review every Task. Use focused contract tests at each Task boundary and one final integration QA after all Tasks are complete.
- Keep the computation deterministic. No ABC workflow may create an Agent OS run or require an LLM judgment.
- Every read, formula, evaluation, history row, sync state, and mutation is scoped by `organizationId`. Never accept `organizationId` from a request body.
- Frontend code only calls NestJS APIs. It must not query Prisma, Supabase, PostgreSQL, extension storage, or Sellpia directly for ABC.
- `SELLPIA_FULL_SYNC` collects inventory and product-profit history and may trigger ABC. `SELLPIA_INVENTORY_SYNC` collects inventory only and must never collect profit history or trigger ABC.
- Full and inventory-only syncs share the existing generation/claim fence and are mutually exclusive. Retry must retain the failed scope.
- A missing or failed required source is not zero. Confirmed no-ad evidence is zero; unavailable ad evidence publishes a stale status and retains the last normal grade.
- Keep commission, fulfillment logistics, return loss, and other variable costs in the persisted formula/evaluation breakdown with `amount = 0` and `status = NOT_APPLIED`.
- Formula activation is versioned. A sync may create the first active formula when none exists, but it must not silently recalibrate or replace an already active formula.
- Keep the existing UI workflow-notification cleanup behavior (`진행 정리`, individual hide/clear, bulk hide/clear) and its tests. Do not delete durable workflow audit records from the UI.
- Do not add substantial behavior to the 6,000+ line extension worker. Keep extension changes to the collection contract/capability and place calculations on the server.
- `release/office` is protected and out of scope. Do not delete, prune, rebase, or modify that branch or its worktree.
- The command blocks show the underlying command for readability. In this KidItem workspace, execute every shell line with the required `rtk` prefix (for example, run `rtk npm run build --workspace=apps/web`, not bare `npm run build --workspace=apps/web`).

## Locked Business and Mathematical Contract

### Source range and contribution profit

The extension issues one `stat_prd_profit` request through yesterday in KST with the earliest date at least 400 calendar days earlier:

```ts
const request = {
  mode: 'stat_prd_profit',
  buy_point: 'R',
  vat_tp: 1,
  sdate: coverageStartDate,
  edate: coverageEndDate,
  in_sdate: coverageStartDate,
  in_edate: coverageEndDate,
};
```

Analytics stores monthly product/option rows with exact covered bounds. A boundary month is not treated as a full month:

```ts
coveredStartDate = max(requestStartDate, firstDayOfMonth(yearMonth));
coveredEndDate = min(requestEndDate, lastDayOfMonth(yearMonth));
coveredDays = differenceInCalendarDays(coveredEndDate, coveredStartDate) + 1;
```

Finance calculates:

```ts
contributionProfit =
  sellpiaOrderAmount
  - sellpiaInAmount
  - authoritativeAdSpend
  - sellingCommission        // v1 amount: 0, status: NOT_APPLIED
  - fulfillmentLogistics     // v1 amount: 0, status: NOT_APPLIED
  - returnLoss               // v1 amount: 0, status: NOT_APPLIED
  - otherVariableCost;       // v1 amount: 0, status: NOT_APPLIED
```

### Eligibility, decay, normalization, reliability, and grade

An evaluation becomes grade-eligible at the earlier of 30 KST observation days after the first valid paid sale or 20 distinct valid paid orders. Count observation days inclusively as `differenceInCalendarDays(asOfKstDate, firstPaidKstDate) + 1`; they are elapsed calendar days, not days with an order. Before that point it publishes `INSUFFICIENT_EVIDENCE` with no grade.

For monthly source fact `i`, convert KST calendar dates to integer epoch-day ordinals, calculate `coverageMidpointOrdinal = (startOrdinal + endOrdinal) / 2`, and use `ageDays_i = max(0, evaluationCutoffOrdinal - coverageMidpointOrdinal)`. This permits a `.5` midpoint without DST/server-timezone drift:

```ts
weight_i = 2 ** (-ageDays_i / halfLifeDays);

weightedProfitVelocity30 =
  30 * sum(weight_i * contributionProfit_i)
     / sum(weight_i * coveredDays_i);

weightedContributionMargin =
  sum(weight_i * contributionProfit_i)
  / sum(weight_i * revenue_i);

lossRecurrence =
  sum(weight_i * negativeCoveredDays_i)
  / sum(weight_i * coveredDays_i);
```

The number 30 is only a display normalization to a comparable 30-day velocity. It is not a selectable period or a fixed scoring window.

Each metric maps to 0–100 through frozen organization quantile knots. Linear interpolation between adjacent knots and endpoint clamping are mandatory. The initial candidate knot probabilities are:

```ts
const QUANTILE_PROBABILITIES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] as const;
```

If multiple probabilities produce the same raw knot value, collapse them to one knot at the mean of their percentile scores before interpolation. This mid-rank rule avoids division by zero and gives equal inputs equal normalized scores.

Use an inverse score for loss recurrence, then combine nonnegative monotone weights:

```ts
rawScore =
  profitWeight * normalizedProfitVelocity
  + marginWeight * normalizedMargin
  + persistenceWeight * (100 - normalizedLossRecurrence);

orderReliability = paidOrderCount / (paidOrderCount + orderShrinkK);
dayReliability = observationDays / (observationDays + dayShrinkK);
reliability = Math.sqrt(orderReliability * dayReliability);
adjustedScore = 50 + reliability * (rawScore - 50);
```

Constraints:

```ts
profitWeight >= marginWeight;
profitWeight >= persistenceWeight;
profitWeight + marginWeight + persistenceWeight === 1;
all weights >= 0;
30 <= halfLifeDays && halfLifeDays <= 365;
```

An eligible product with weighted contribution profit `<= 0` is always C. Otherwise the frozen ordered cutoffs determine C/B/A. Equal adjusted scores must never be split across grades.

Zero recognized revenue never becomes a zero-percent margin. Persist `weightedContributionMargin: null`; if weighted contribution profit is non-positive, publish hard C without evaluating the margin score. Treat the impossible combination of positive contribution profit with zero revenue as `CALCULATION_ERROR` and retain any last normal grade.

### Deterministic calibration

Calibrate using historical rolling-origin examples where features only use facts available at each origin and the label is the next complete monthly contribution profit. Require at least 30 eligible observations spanning at least three viable origin months; otherwise retain/publish `CALIBRATION_PENDING` and no grade for products that have never had a formula.

Search these deterministic candidate grids:

```ts
halfLifeDays: 30..365 inclusive, step 5
weights: 0..1 inclusive, step 0.05, sum exactly 1, constraints above
orderShrinkK: [5, 10, 20, 40, 80]
dayShrinkK: [7, 14, 30, 60, 120]
```

For each candidate, derive quantile knots and two tie-safe ordered score boundaries from the training portion only. Boundaries minimize within-segment squared error for the next-month label and require three non-empty groups. Discard a candidate unless every viable validation fold has `mean(A) > mean(B) > mean(C)`. Rank the survivors by mean Spearman rank correlation between score and next-month profit velocity, then mean validation explained variance (`betweenGradeSumOfSquares / totalSumOfSquares`), then lower grade churn, shorter half-life, and canonical-JSON lexical order. Refit the selected structure on all available calibration examples and store the final knots/cutoffs. Compute `formulaChecksum = SHA256(canonicalJson(formulaWithoutFormulaChecksum))`.

The formula also embeds a calculation manifest and its checksum so a historical result can identify the exact algorithm contract independently of fitted values:

```ts
const calculationManifest = {
  codeVersion: 'ABC_V1',
  sourceGrain: 'SELLPIA_PRODUCT_OPTION_MONTH',
  decay: 'EXPONENTIAL_HALF_LIFE',
  normalization: 'FROZEN_LINEAR_QUANTILE_KNOTS',
  reliability: 'GEOMETRIC_ORDER_DAY_SHRINKAGE',
  boundaries: 'TIE_SAFE_ORDERED_ONE_DIMENSIONAL_SEGMENTATION',
  hardGuard: 'NON_POSITIVE_WEIGHTED_CONTRIBUTION_IS_C',
} as const;
const calculationCodeChecksum = sha256(canonicalJson(calculationManifest));
```

## Target Status Contract

```ts
type ProductAbcCalculationStatus =
  | 'READY'
  | 'INSUFFICIENT_EVIDENCE'
  | 'SOURCE_UNMAPPED'
  | 'CALIBRATION_PENDING'
  | 'RECALCULATING'
  | 'SELLPIA_SOURCE_STALE'
  | 'AD_SOURCE_STALE'
  | 'CALCULATION_ERROR';

type ProductAbcGrade = 'A' | 'B' | 'C';
```

- `READY`: publish the current grade and metrics.
- `INSUFFICIENT_EVIDENCE`, `SOURCE_UNMAPPED`, `CALIBRATION_PENDING`: publish no grade.
- `RECALCULATING`: retain the last grade if present while the new calculation is fenced.
- `SELLPIA_SOURCE_STALE`, `AD_SOURCE_STALE`, `CALCULATION_ERROR`: retain the last normal grade and metrics, attach the current abnormal status/error, and never replace absent evidence with zero.

Source readiness is coverage-based, not a loose age threshold. Sellpia is ready only when persisted ranges form the gap-free range declared by the latest successful approximately 400-day request through the evaluation cutoff (yesterday KST). Advertising is ready only when authoritative listing/option daily facts, including explicit zero rows, completely cover every requested product/listing day used by the Sellpia facts. Any gap, failed owner collection, ambiguous mapping, or cutoff mismatch is stale/unmapped evidence; Finance must not shorten the requested evidence range silently to make the source appear ready.

---

## Task 1: Replace the shared and database contracts

**Files:**

- Modify: `packages/shared/src/schemas/product-abc.ts`
- Modify: `packages/shared/src/schemas/product-abc.spec.ts`
- Modify: `packages/shared/src/schemas/product-operations.ts`
- Modify: `packages/shared/src/schemas/product-operations.spec.ts`
- Modify: `packages/shared/src/schemas/dashboard.ts`
- Modify: `packages/shared/src/schemas/dashboard.spec.ts`
- Modify: `packages/shared/src/schemas/sellpia-inventory-freshness.ts`
- Modify: `packages/shared/src/schemas/sellpia-inventory-freshness.spec.ts`
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/channels.prisma`
- Modify: `prisma/models/inventory.prisma`
- Create: `scripts/__tests__/automatic-product-profitability-abc-schema-contract.test.mjs`

### Step 1: Write the failing contract tests

- [ ] Replace the old ABC schema tests with assertions for grade, calculation status, formula version, source freshness, component breakdown, exact evaluation metrics, and grade history. Explicitly reject `metric`, `periodDays`, cumulative share thresholds, lifecycle, provisional grade, and criteria-selection requests.
- [ ] Add sync-scope tests that require `scope: 'full' | 'inventory'` on requests, claims, active status, and last-attempt summaries.
- [ ] Add the Node schema contract test requiring:
  - exact coverage dates on `SellpiaProductMonthlySales`;
  - organization-owned immutable `MasterProductAbcFormulaVersion` rows plus one `MasterProductAbcFormulaState` current-version pointer per organization;
  - one current `MasterProductAbcEvaluation` per product plus append-only grade history;
  - a cost-component JSON payload that preserves all seven formula terms and their source status;
  - persisted requested, active, and last-attempt Sellpia sync scopes;
  - no old policy/lifecycle/provisional fields.
- [ ] Run:

  ```bash
  npm exec --workspace=packages/shared vitest -- run src/schemas/product-abc.spec.ts src/schemas/product-operations.spec.ts src/schemas/dashboard.spec.ts src/schemas/sellpia-inventory-freshness.spec.ts
  node --test scripts/__tests__/automatic-product-profitability-abc-schema-contract.test.mjs
  ```

  Expected: FAIL because the existing branch still exposes the previous fixed-period/lifecycle model and has no formula version or sync scope.

### Step 2: Define the new focused shared schemas

- [ ] Rewrite `product-abc.ts` around these strict types:

  ```ts
  export const ProductAbcGradeSchema = z.enum(['A', 'B', 'C']);
  export const ProductAbcCalculationStatusSchema = z.enum([
    'READY',
    'INSUFFICIENT_EVIDENCE',
    'SOURCE_UNMAPPED',
    'CALIBRATION_PENDING',
    'RECALCULATING',
    'SELLPIA_SOURCE_STALE',
    'AD_SOURCE_STALE',
    'CALCULATION_ERROR',
  ]);
  export const ProductAbcCostStatusSchema = z.enum([
    'OBSERVED',
    'CONFIRMED_ZERO',
    'NOT_APPLIED',
    'STALE',
    'MISSING',
  ]);
  ```

- [ ] Define `ProductAbcEvaluationSchema` with nullable grade, status, adjusted/raw score, reliability, weighted contribution profit, 30-day profit velocity, weighted contribution margin, loss recurrence, paid-order count, observation days, formula key/version, calculation-code checksum, formula checksum, source coverage/freshness, all cost components, calculated timestamp, and nullable status detail.
- [ ] Define a read-only formula summary containing `formulaKey`, `version`, calculation-code checksum, formula checksum, `activatedAt`, `halfLifeDays`, three weights, two shrink constants, two grade cutoffs, knot values, training interval, sample/fold counts, and calibration metrics. Do not add update/selection DTOs to public product APIs.
- [ ] Replace Product Operations and Dashboard lifecycle/risk fields with status counts, grade counts, grade contribution-profit amounts/shares, formula summary, and freshness timestamps. Keep Product Outflow's compact projection limited to grade, status, profit velocity, margin, freshness, and product-detail link identity.
- [ ] Add `SellpiaSyncScopeSchema` and make scope required in the shared request/claim/last-attempt DTOs. Keep automated inventory freshness reasons mapped to the inventory scope by the backend rather than trusting a browser default.

### Step 3: Replace the Prisma models

- [ ] Add nullable `coverageStartDate DateTime? @db.Date` and `coverageEndDate DateTime? @db.Date` to `SellpiaProductMonthlySales` for safe expansion over old rows. New-ingest shared/service tests require both fields and `coverageStartDate <= coverageEndDate`; Finance treats a legacy null bound as stale evidence. Task 10 backfills or removes unreconstructable rows before declaring rollout ready.
- [ ] Replace `MasterProductAbcPolicy` with immutable `MasterProductAbcFormulaVersion` rows containing organization, `formulaKey` (`ABC_V1`), integer version, calculation-code checksum, canonical JSON formula, formula checksum, training bounds, sample/fold counts, calibration metrics JSON, first-activation timestamp, and audit timestamps. Enforce unique `(organizationId, formulaKey, version)` and `(organizationId, formulaChecksum)`.
- [ ] Add `MasterProductAbcFormulaState` with unique `organizationId`, nullable active formula-version relation fenced by `(activeFormulaVersionId, organizationId)`, activation timestamp, and revision. This Prisma-owned pointer enforces at most one active version per organization without a partial SQL index.
- [ ] Rewrite `MasterProductAbcEvaluation` to store nullable grade, status, formula-version relation, raw/adjusted score, reliability, raw and normalized metrics, weighted revenue/cost/ad spend/contribution profit, observation facts, source freshness, cost-components JSON, status detail/error, run token, and calculation timestamp. Preserve unique `(organizationId, masterProductId)` and organization-fenced relations.
- [ ] Rewrite `MasterProductAbcGradeHistory` to append the evaluation's grade/status/formula version, score, contribution profit, margin, reason, and calculation timestamp. Remove old metric/period/lifecycle columns.
- [ ] Add `requestedSyncScope`, `activeSyncScope`, and `lastAttemptSyncScope` to `SellpiaInventoryState`; use nullable active/attempt fields and default requested scope to `inventory` for existing rows.
- [ ] Run:

  ```bash
  npx prisma format
  npm exec --workspace=packages/shared vitest -- run src/schemas/product-abc.spec.ts src/schemas/product-operations.spec.ts src/schemas/dashboard.spec.ts src/schemas/sellpia-inventory-freshness.spec.ts
  node --test scripts/__tests__/automatic-product-profitability-abc-schema-contract.test.mjs
  npx prisma generate
  npm run build --workspace=packages/shared
  ```

  Expected: all selected contracts pass, Prisma Client generates, and focused shared exports build without reintroducing an ABC criteria mutation.

- [ ] Commit:

  ```bash
  git add packages/shared prisma scripts/__tests__/automatic-product-profitability-abc-schema-contract.test.mjs
  git commit -m "refactor: replace product ABC contracts"
  ```

---

## Task 2: Persist exact Sellpia profitability source coverage

**Files:**

- Modify: `extensions/kiditem-os/background/orders/worker.js`
- Modify: `extensions/tests/order-collector-sellpia-product-profit.test.mjs`
- Modify: `extensions/tests/order-collector-action-coverage.test.mjs`
- Modify: `apps/web/src/lib/sellpia-product-sales-collection.ts`
- Modify: `apps/web/src/lib/sellpia-product-sales-collection.spec.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/dto/sellpia-product-sales.dto.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.service.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts`
- Delete: `apps/server/src/analytics/application/port/in/master-product-abc-metric-read.port.ts`
- Create: `apps/server/src/analytics/application/port/in/master-product-profit-fact-read.port.ts`
- Delete: `apps/server/src/analytics/sellpia-product-sales/sellpia-master-product-abc-metric.reader.ts`
- Create: `apps/server/src/analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.module.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.module.wiring.spec.ts`
- Delete: `apps/server/src/analytics/sellpia-product-sales/sellpia-master-product-abc-metric.reader.spec.ts`
- Create: `apps/server/src/analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader.spec.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts`

### Step 1: Lock the one-request extension contract

- [ ] Extend the existing extension tests to prove exactly one product-profit request is issued, the end date is yesterday in KST, the start date covers at least 400 days, and both sale/purchase ranges are identical with `mode=stat_prd_profit`, `buy_point=R`, and `vat_tp=1`.
- [ ] Assert the collection result includes request-range provenance and aggregated months without fabricating a full 13-month payload. Keep `collectSellpiaProductProfitEvidenceV1` as the capability gate.
- [ ] Run:

  ```bash
  node --test extensions/tests/order-collector-sellpia-product-profit.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
  ```

  Expected: the existing tests pass or expose only missing exact-range/provenance assertions. Make the smallest worker change needed; do not move ABC math into the extension.

### Step 2: Write failing Analytics coverage and resolved-fact tests

- [ ] Add service cases for a request beginning mid-month and ending yesterday. Require each persisted month to use the intersection of request range and month range rather than month-end assumptions.
- [ ] Replace old fixed-period reader tests with a `MasterProductProfitFactReadPort` contract returning monthly resolved facts:

  ```ts
  type MasterProductMonthlyProfitFact = {
    masterProductId: string;
    yearMonth: string;
    coverageStartDate: Date;
    coverageEndDate: Date;
    coveredDays: number;
    revenue: number;
    sellpiaInAmount: number;
    sourceProductCodes: string[];
    sourceOptionCodes: string[];
    capturedAt: Date;
  };

  type MasterProductProfitFactEvidence = {
    masterProductId: string;
    mappingStatus: 'MAPPED' | 'UNMAPPED';
    monthlyFacts: MasterProductMonthlyProfitFact[];
  };
  ```

- [ ] Require the port to accept the active `masterProductIds` and return one evidence result per requested product. A product without a confirmed Sellpia identity returns `mappingStatus: 'UNMAPPED'` and no numeric facts. Option/product rows mapped to one `MasterProduct` aggregate once per month and preserve all source identities for audit; orphan source rows return in a separate audit collection rather than being dropped or assigned to a product.
- [ ] Run the two selected server test files. Expected: FAIL because coverage bounds and the new read port do not exist.

### Step 3: Store coverage and expose source facts

- [ ] Keep one trusted payload-level request range in the ingest DTO and do not accept client-supplied per-month coverage bounds. Compute persisted `coverageStartDate`/`coverageEndDate` server-side from that range plus `yearMonth`; reject a row whose month does not intersect the requested range.
- [ ] Keep the existing atomic replacement and idempotency behavior. The outflow 1/2-month projection may keep its own query logic but must not be reused as the ABC evidence window.
- [ ] Replace the old metric reader/port with `master-product-profit-fact-read.port.ts` and `sellpia-master-product-profit-fact.reader.ts`. Resolve SKU/variant/listing identities to `MasterProduct`, aggregate monthly revenue and Sellpia inbound amount, and return exact coverage/freshness.
- [ ] Export only the new source-fact read port from `SellpiaProductSalesModule`; remove the old ABC metric token and fixed period parameters.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.module.wiring.spec.ts src/analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader.spec.ts
  npm run test:integration --workspace=apps/server -- src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts
  node --test extensions/tests/order-collector-sellpia-product-profit.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
  npm exec --workspace=apps/web vitest -- run src/lib/sellpia-product-sales-collection.spec.ts
  ```

  Expected: source-range, partial-month, idempotency, mapping, extension, and bridge tests pass.

- [ ] Commit:

  ```bash
  git add extensions apps/web/src/lib apps/server/src/analytics
  git commit -m "feat: persist Sellpia product profit evidence"
  ```

---

## Task 3: Assemble authoritative profitability evidence in Finance

**Files:**

- Create: `apps/server/src/advertising/application/port/in/master-product-ad-spend-read.port.ts`
- Create: `apps/server/src/advertising/adapter/out/repository/master-product-ad-spend-read.adapter.ts`
- Create: `apps/server/src/advertising/adapter/out/repository/master-product-ad-spend-read.adapter.spec.ts`
- Create: `apps/server/src/advertising/advertising-profitability-read.module.ts`
- Create: `apps/server/src/finance/application/port/in/master-product-profitability-read.port.ts`
- Create: `apps/server/src/finance/application/service/master-product-profitability-read.service.ts`
- Create: `apps/server/src/finance/application/service/master-product-profitability-read.service.spec.ts`
- Modify: `apps/server/src/finance/finance.module.ts`
- Modify: `apps/server/src/finance/AGENTS.md`

### Step 1: Write failing advertising ownership tests

- [ ] Define an Advertising read port that returns daily additive `ChannelListingDailySnapshot.adSpend` per resolved master product with one of `OBSERVED`, `CONFIRMED_ZERO`, `STALE`, or `MISSING` and exact coverage/freshness.
- [ ] Test that a source row explicitly reporting no spend is `CONFIRMED_ZERO`, while no snapshot, a gap inside the requested product/listing day range, cutoff mismatch, stale snapshot, unmapped listing, or repository failure is never converted to zero.
- [ ] Test additive aggregation across listing options without double-counting a listing-level daily fact.
- [ ] Run the new adapter test. Expected: FAIL because the port and isolated module do not exist.

### Step 2: Add a cycle-free Advertising read module

- [ ] Implement the adapter against Prisma and export it from `AdvertisingProfitabilityReadModule`. This module must not import `ProductsModule`; Finance imports this narrow module instead of the full Advertising module to avoid `Products -> Finance -> Advertising -> Products`.
- [ ] Run the adapter test. Expected: PASS for observed, confirmed-zero, missing/stale, mapping, aggregation, and organization isolation.

### Step 3: Write failing Finance evidence tests

- [ ] Define `MasterProductProfitabilityReadPort` to return source-ready monthly facts and eligibility evidence, not grades or normalized scores:

  ```ts
  type MasterProductProfitabilityEvidence = {
    masterProductId: string;
    asOfDate: Date;
    firstValidPaidSaleAt: Date | null;
    validPaidOrderDates: Date[];
    paidOrderCount: number;
    observationDays: number;
    eligibilityReached: boolean;
    sellpiaStatus: 'READY' | 'STALE' | 'UNMAPPED' | 'MISSING';
    adStatus: 'READY' | 'CONFIRMED_ZERO' | 'STALE' | 'MISSING';
    monthlyFacts: MonthlyContributionFact[];
  };
  ```

- [ ] Define the port method as `readMany({ organizationId, masterProductIds, asOfDate, scope })`, where `scope` is `ACTIVE_EVALUATION` or `HISTORICAL_CALIBRATION`. It returns facts/order dates only through `asOfDate`; active evaluation requires explicit active IDs, while historical calibration includes inactive products with valid historical facts to avoid survivorship bias. The caller never supplies an organization through HTTP input.

- [ ] Test valid paid orders as distinct organization-scoped orders linked through `OrderLineItem -> ChannelListingOption -> ChannelListing -> MasterProduct`, using `paidAt`, excluding cancelled and fully refunded orders, and not excluding a merely partial return/refund as if the whole paid order never existed.
- [ ] Test eligibility at exactly 30 KST calendar observation days or exactly 20 distinct paid orders, whichever occurs first; multiple line items in one order count once.
- [ ] Test the exact seven-component formula. Require deferred components to persist `{ amount: 0, status: 'NOT_APPLIED' }` and required source failures to produce source status instead of a numeric zero.
- [ ] Test month/day allocation of additive ad spend to the exact Sellpia coverage intersection.
- [ ] Run the Finance service test. Expected: FAIL because evidence assembly is not implemented.

### Step 4: Implement and export Finance evidence assembly

- [ ] Inject `MasterProductProfitFactReadPort`, `MasterProductAdSpendReadPort`, and Prisma order reads into `MasterProductProfitabilityReadService`. Keep organization fencing in every join and return distinct valid paid-order dates so Products can reconstruct eligibility at each rolling origin without querying Orders directly.
- [ ] Emit monthly contribution facts with revenue, Sellpia inbound amount, ad spend, each deferred component, contribution profit, negative covered days, coverage midpoint, and source provenance.
- [ ] When daily data is not sufficient to know exact negative days, derive `negativeCoveredDays` as `coveredDays` only when the entire monthly fact contribution profit is negative and `0` otherwise; record `lossGranularity: 'MONTH_INFERRED'` in source metadata so v1 limitations are explicit.
- [ ] Export the Finance port from `FinanceModule`, then run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/advertising/adapter/out/repository/master-product-ad-spend-read.adapter.spec.ts src/finance/application/service/master-product-profitability-read.service.spec.ts
  npm run build --workspace=apps/server
  ```

  Expected: all evidence/source semantics pass and Nest compilation has no module cycle.

- [ ] Update `apps/server/src/finance/AGENTS.md` to record that Finance combines profitability evidence but Products remains the only ABC grade/formula owner.
- [ ] Commit:

  ```bash
  git add apps/server/src/advertising apps/server/src/finance
  git commit -m "feat: assemble product profitability evidence"
  ```

---

## Task 4: Implement deterministic calibration and scoring policies

**Files:**

- Create: `apps/server/src/products/domain/master-product-profitability-score.ts`
- Create: `apps/server/src/products/domain/master-product-profitability-score.spec.ts`
- Create: `apps/server/src/products/domain/master-product-abc-calibration.ts`
- Create: `apps/server/src/products/domain/master-product-abc-calibration.spec.ts`
- Replace: `apps/server/src/products/domain/master-product-abc.ts`
- Replace: `apps/server/src/products/domain/master-product-abc.spec.ts`
- Replace: `apps/server/src/products/domain/master-product-abc.qa-regression.spec.ts`

### Step 1: Test pure decay, quantile, and score functions first

- [ ] Add tests for coverage-midpoint age, exponential half-life, partial covered-day denominator, 30-day velocity, weighted contribution margin, zero-revenue hard C with null margin, impossible zero-revenue/positive-profit error, and inferred loss recurrence.
- [ ] Add table tests for quantile endpoint clamping, exact knots, interpolation, duplicate knot values, and inverse loss scoring.
- [ ] Add monotonicity/property cases proving that, all else equal, more contribution profit or margin cannot lower the score and more loss recurrence cannot raise it.
- [ ] Test the reliability formula at the eligibility boundary, at sparse/high evidence, and at the asymptote. Require `0 <= reliability < 1` for finite evidence.
- [ ] Run the score spec. Expected: FAIL because the pure functions do not exist.

### Step 2: Implement pure score functions

- [ ] Implement integer-minor-unit arithmetic for source amounts until division; convert to finite decimals only at metric boundaries. Reject `NaN`, infinities, negative coverage days, and a fact outside the formula training/source horizon.
- [ ] Implement stable summation, quantile interpolation, reliability shrinkage, canonical JSON ordering, and SHA-256 checksum helpers without reading Prisma or current portfolio rows.
- [ ] Run the score spec. Expected: PASS.

### Step 3: Test deterministic rolling-origin calibration

- [ ] Build fixed fixtures covering at least four origin months with known next-month outcomes. Assert no future fact leaks into a feature origin.
- [ ] Test candidate-grid constraints, training-only tie-safe boundaries, three non-empty ordered outcome groups, rejection when any viable validation fold is unordered, Spearman-rank priority, explained-variance secondary ranking, negative-profit hard-C compatibility, and deterministic tie-break order.
- [ ] Test that changing the current portfolio after a formula is frozen does not change an unchanged product's score or grade.
- [ ] Test calibration refusal below 30 examples or three viable origin months.
- [ ] Run the calibration spec. Expected: FAIL because the calibrator does not exist.

### Step 4: Implement calibration

- [ ] Generate candidates using integer weight ticks (`0..20`, divided by 20) so weights sum exactly and floating-point drift cannot add or omit a candidate.
- [ ] For each rolling origin, compute training-only knots and boundaries, score validation examples with those frozen fold parameters, enumerate unique-score boundary pairs, never split a tie, and discard candidates unless every viable validation fold has ordered non-empty outcome groups.
- [ ] Rank candidates by mean validation Spearman correlation, then mean explained variance, lower grade churn, shorter half-life, and canonical JSON lexical order. Refit knots and cutoffs on all available examples and return an immutable formula payload, calculation manifest/checksum, formula checksum, and calibration report.
- [ ] Run the calibration spec. Expected: PASS with the same checksum on repeated/shuffled inputs.

### Step 5: Replace the old evaluator

- [ ] Rewrite `master-product-abc.ts` as a pure evaluator that maps evidence plus one frozen formula to `{ grade, status, metrics, costComponents, sourceFreshness }`.
- [ ] Test all status precedence rules:

  ```text
  SOURCE_UNMAPPED > SELLPIA_SOURCE_STALE > AD_SOURCE_STALE
  > INSUFFICIENT_EVIDENCE > CALIBRATION_PENDING > READY
  ```

  Repository/service-only failures map to `CALCULATION_ERROR`; an active run maps to `RECALCULATING`.
- [ ] Prove exact boundary behavior, tie behavior, `weightedContributionProfit <= 0 => C`, no grade before eligibility, no grade without formula, and stale/error retention inputs.
- [ ] Rewrite the QA regression spec to cover the new policy only; remove assertions for cumulative contribution, A/B/C quotas, fixed periods, lifecycle, confidence labels, and provisional grades.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/products/domain/master-product-profitability-score.spec.ts src/products/domain/master-product-abc-calibration.spec.ts src/products/domain/master-product-abc.spec.ts src/products/domain/master-product-abc.qa-regression.spec.ts
  ```

  Expected: all pure policy and regression tests pass without database or network access.

- [ ] Commit:

  ```bash
  git add apps/server/src/products/domain
  git commit -m "feat: calibrate profitability ABC scores"
  ```

---

## Task 5: Publish versioned formulas and evaluations from Products

**Files:**

- Modify: `apps/server/src/products/application/port/out/repository/master-product-abc.repository.port.ts`
- Modify: `apps/server/src/products/adapter/out/repository/master-product-abc.repository.adapter.ts`
- Modify: `apps/server/src/products/adapter/out/repository/master-product-abc.repository.adapter.spec.ts`
- Modify: `apps/server/src/products/__tests__/master-product-abc.repository.pg.integration.spec.ts`
- Create: `apps/server/src/products/application/service/master-product-abc-calibration.service.ts`
- Create: `apps/server/src/products/application/service/master-product-abc-calibration.service.spec.ts`
- Modify: `apps/server/src/products/application/service/master-product-abc.service.ts`
- Modify: `apps/server/src/products/application/service/master-product-abc.service.spec.ts`
- Modify: `apps/server/src/products/application/service/master-product-abc-sales-ingested.bridge.ts`
- Modify: `apps/server/src/products/application/service/master-product-abc-sales-ingested.bridge.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Create: `apps/server/src/products/__tests__/products-profitability-abc.module.wiring.spec.ts`
- Modify: `apps/server/src/products/AGENTS.md`

### Step 1: Lock repository atomicity and history behavior

- [ ] Replace repository tests with these transactions:
  - activate formula version N by atomically moving the organization's `MasterProductAbcFormulaState` pointer under the organization advisory lock;
  - reject an already used `(formulaKey, version)` or formula checksum and a second active formula;
  - fence an evaluation by run token/revision;
  - write current evaluation, `MasterProduct.abcGrade`, and history atomically;
  - append grade history only when the published grade changes, including the formula, score, cutoffs, source cutoff, and reason that produced that change;
  - preserve the previous grade/metrics for stale/error status while recording the abnormal status;
  - clear grade for insufficient/unmapped/calibration-pending status;
  - never overwrite a newer evaluation with an older run.
- [ ] Run repository unit/integration tests. Expected: FAIL against the old policy/evaluation persistence.

### Step 2: Implement versioned repository operations

- [ ] Replace old policy methods with `getActiveFormula`, `createAndActivateFormula`, `beginEvaluationRun`, `publishEvaluation`, and `recordEvaluationFailure`.
- [ ] Store formula JSON, calculation-code checksum, and formula checksum exactly as produced by the pure calibrator. Do not recalculate normalization knots during product evaluation.
- [ ] Use the Prisma-owned formula-state relation for the one-active-version invariant and Prisma tagged SQL only for the advisory lock query. Keep dynamic identifiers out of SQL.
- [ ] Run repository unit/integration tests. Expected: PASS for atomicity, history, stale retention, grade clearing, and organization isolation.

### Step 3: Test formula lifecycle and evaluation orchestration

- [ ] Add calibration-service tests proving:
  - no active formula + enough history creates version 1 and activates it;
  - no active formula + insufficient history returns `CALIBRATION_PENDING` without a placeholder formula;
  - an existing active formula is reused and is never silently replaced on sync;
  - the service exposes only `ensureInitialActiveFormula`; it has no generic HTTP/operator criteria mutation or recalibrate-and-replace method. A later formula revision must arrive through a separately reviewed versioned release path.
- [ ] Rewrite ABC service tests so a complete full-profit-ingested event loads Finance evidence for every active MasterProduct in the organization, obtains/creates the first formula, evaluates mapped and unmapped products, and publishes results once. Test per-product failure isolation and stale/error grade retention.
- [ ] Test that the bridge listens to successful profit-evidence ingestion only; inventory publication alone must not trigger it. Require Analytics to await the deterministic listener result before the profit-ingest response succeeds, so the web full-sync claim cannot finish while ABC is still running.
- [ ] Run service/bridge specs. Expected: FAIL until orchestration is replaced.

### Step 4: Implement Products ownership

- [ ] Add the module-wiring regression, then import `FinanceModule` instead of the old Analytics metric port. Wire the calibration service, evaluator, repository, and successful Sellpia profit-ingested bridge. Publish the Analytics domain event with the existing asynchronous event-emitter API and await all listeners before returning ingest success.
- [ ] Evaluate all active product IDs in deterministic order with bounded batches and one organization-scoped run token. This is required to publish `SOURCE_UNMAPPED` when a previously mapped identity disappears. Do not publish `RECALCULATING` after the completed result.
- [ ] On source/repository failure, call `recordEvaluationFailure` with status detail safe for operators; log full technical context server-side without credentials or Sellpia payload dumps.
- [ ] Update `apps/server/src/products/AGENTS.md` with formula/evaluation ownership and the rule that other domains only provide facts.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/products/adapter/out/repository/master-product-abc.repository.adapter.spec.ts src/products/application/service/master-product-abc-calibration.service.spec.ts src/products/application/service/master-product-abc.service.spec.ts src/products/application/service/master-product-abc-sales-ingested.bridge.spec.ts src/products/__tests__/products-profitability-abc.module.wiring.spec.ts
  npm run test:integration --workspace=apps/server -- src/products/__tests__/master-product-abc.repository.pg.integration.spec.ts
  npm run build --workspace=apps/server
  ```

  Expected: formula versioning, evaluation publication, bridge triggering, Nest compilation, and integration persistence pass.

- [ ] Commit:

  ```bash
  git add apps/server/src/products
  git commit -m "feat: publish automatic profitability ABC"
  ```

---

## Task 6: Split full and inventory-only Sellpia synchronization in the backend

**Files:**

- Modify: `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.ts`
- Modify: `apps/server/src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/sellpia-inventory-freshness.repository.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-inventory-freshness.repository.adapter.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/sellpia-inventory-freshness.repository.adapter.spec.ts`
- Modify: `apps/server/src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/sellpia-inventory-freshness.dto.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-freshness.controller.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-freshness.controller.spec.ts`

### Step 1: Write scope-policy tests

- [ ] Test manual `full` and `inventory` requests, same-generation duplicate requests, mutually exclusive claims, lost/expired claims, success/failure publication, and retry scope inheritance.
- [ ] Test automatic freshness/preflight reasons always request `inventory`, regardless of any client body field.
- [ ] Test last-attempt DTOs report their own scope independently of current requested/active scope.
- [ ] Run the selected policy/service/repository/controller tests. Expected: FAIL because current freshness state has no scope.

### Step 2: Implement persisted scope fencing

- [ ] Extend repository request/claim/complete/fail operations to carry the persisted scope under the existing generation fence. A claim is exactly:

  ```ts
  { generation: number; token: string; scope: 'full' | 'inventory'; expiresAt: Date }
  ```

- [ ] Require explicit scope for manual API requests. Server-map TTL, readiness preflight, and automated refresh reasons to `inventory`; retry copies `lastAttemptSyncScope` and rejects retry when no failed attempt exists.
- [ ] Keep one active claim across both scopes so users cannot run a full sync and inventory-only sync concurrently.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts src/inventory/adapter/out/repository/sellpia-inventory-freshness.repository.adapter.spec.ts src/inventory/adapter/in/http/sellpia-inventory-freshness.controller.spec.ts
  npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts
  npm run build --workspace=apps/server
  ```

  Expected: all scope/fence/retry contracts pass and Nest builds.

- [ ] Commit:

  ```bash
  git add apps/server/src/inventory
  git commit -m "feat: separate Sellpia synchronization scopes"
  ```

---

## Task 7: Split the two synchronization actions in the web coordinator

**Files:**

- Modify: `apps/web/src/lib/sellpia-inventory-freshness-api.ts`
- Modify: `apps/web/src/lib/__tests__/sellpia-inventory-freshness-api.spec.ts`
- Modify: `apps/web/src/hooks/useSellpiaInventoryFreshness.ts`
- Modify: `apps/web/src/hooks/useSellpiaInventoryFreshness.spec.tsx`
- Modify: `apps/web/src/components/providers/SellpiaInventorySyncProvider.tsx`
- Modify: `apps/web/src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/_shared/SellpiaSyncAction.tsx`
- Create: `apps/web/src/app/(inventory)/_shared/SellpiaSyncAction.spec.tsx`
- Modify: `apps/web/src/components/readiness/ReadinessRows.tsx`
- Create: `apps/web/src/components/readiness/ReadinessRows.spec.tsx`
- Verify: `apps/web/src/components/panel/PanelSheet.tsx`
- Verify: `apps/web/src/components/panel/__tests__/PanelSheet.spec.tsx`
- Verify: `apps/web/src/components/panel/PanelItemRow.tsx`
- Verify: `apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx`
- Verify: `apps/web/src/components/panel/lib/panel-store.ts`
- Verify: `apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`

### Step 1: Write failing coordinator tests

- [ ] Test two explicit requests: `requestSync('full')` and `requestSync('inventory')`. Both buttons are disabled while either scope has an active claim.
- [ ] Test full scope sequence:

  ```text
  acquire full claim
  -> collect and ingest product-profit history
  -> server awaits automatic ABC publication before ingest succeeds
  -> collect/import inventory
  -> complete full claim
  -> invalidate inventory + products + dashboard + outflow queries
  ```

- [ ] Test inventory scope sequence:

  ```text
  acquire inventory claim
  -> collect/import inventory
  -> complete inventory claim
  -> never call product-profit collection/ingest
  -> never trigger ABC
  -> invalidate inventory queries only
  ```

- [ ] Test retry uses the server-returned failed scope rather than the initiating component's default.
- [ ] Run API/hook/provider/action/readiness tests. Expected: FAIL because the provider currently infers product-profit collection from trigger names.

### Step 2: Implement the scope-driven coordinator

- [ ] Replace `trigger === manual_request || retry` logic with `claim.scope === 'full'`. The claim is the execution authority; local UI labels are not.
- [ ] Preserve generation fencing, extension capability checks, cancel/timeout behavior, and server failure reporting. A product-profit failure fails a full claim and must not silently fall through to inventory-only success.
- [ ] Render `전체 동기화` as the primary action and `재고만 동기화` as the separate inventory action in both stock sync and readiness rows. Show active/last-attempt scope in progress and failure copy.
- [ ] Use one shared disabled/busy state for both actions and accessible labels that include the scope.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run src/lib/__tests__/sellpia-inventory-freshness-api.spec.ts src/hooks/useSellpiaInventoryFreshness.spec.tsx src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx 'src/app/(inventory)/_shared/SellpiaSyncAction.spec.tsx' src/components/readiness/ReadinessRows.spec.tsx
  ```

  Expected: full/inventory call graphs, retry, mutual exclusion, error, and invalidation tests pass.

### Step 3: Preserve UI-only workflow cleanup

- [ ] Run the existing Panel regressions that already prove individual workflow hiding, bulk `진행 정리`, local persistence across snapshots, and no server delete call. Do not rewrite this completed behavior as part of ABC/sync work.
- [ ] Do not introduce a server delete endpoint for workflow audits.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run src/components/panel/__tests__/PanelSheet.spec.tsx src/components/panel/__tests__/PanelItemRow.spec.tsx src/components/panel/lib/__tests__/panel-store.spec.ts
  npm run build --workspace=apps/web
  ```

  Expected: `진행 정리`, individual cleanup, bulk cleanup, and the two sync buttons remain functional in a production build.

- [ ] Commit:

  ```bash
  git add apps/web/src/lib apps/web/src/hooks apps/web/src/components/providers 'apps/web/src/app/(inventory)/_shared' apps/web/src/components/readiness apps/web/src/components/panel
  git commit -m "feat: split full and inventory Sellpia sync"
  ```

---

## Task 8: Replace Product Management ABC read models and UI

**Files:**

- Modify: `apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts`
- Modify: `apps/server/src/products/application/service/product-operations.service.ts`
- Modify: `apps/server/src/products/application/service/product-operations.service.spec.ts`
- Modify: `apps/server/src/products/adapter/in/http/dto/product-operations.dto.ts`
- Modify: `apps/server/src/products/adapter/in/http/product-operations.controller.spec.ts`
- Modify: `apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts`
- Modify: `apps/web/src/components/product-abc/ProductAbcBadge.tsx`
- Modify: `apps/web/src/components/product-abc/ProductAbcBadge.spec.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/components/ProductAbcDetailDialog.tsx`
- Delete: `apps/web/src/app/(catalog)/product-hub/components/ProductAbcDetailDialog.spec.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductAbcDetailSheet.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductAbcDetailSheet.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductOperationsCommandCenter.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductOperationsCommandCenter.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsColumnHeader.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/page.spec.tsx`

### Step 1: Write failing server projection tests

- [ ] Require list rows to expose nullable grade, calculation status, adjusted score, contribution profit velocity, margin, source freshness, formula version, and deferred-cost disclosure. Require summary counts by grade/status and contribution profit by grade.
- [ ] Require calculation-status filtering and remove lifecycle/risk/period/metric filters. Test stale grades remain filterable by grade and separately by stale status.
- [ ] Require detail projection to expose read-only formula, components, coverage, eligibility progress, and history. There is no criteria-selection or grade-edit command.
- [ ] Run the service, controller, and PostgreSQL integration specs. Expected: FAIL against the current lifecycle projection.

### Step 2: Implement Product Operations projections

- [ ] Map the current evaluation and active formula under organization scope. Do not run formulas in SQL or compute grades in the repository.
- [ ] Aggregate grade/status counts with nullable grades handled independently. Sum contribution profit using persisted evaluation values.
- [ ] Run the service, controller, and PostgreSQL integration specs. Expected: PASS.

### Step 3: Write failing component/page tests

- [ ] Rewrite badge tests for `A/B/C`, no-grade statuses, stale/error secondary state, accessible label, and no provisional/confidence/lifecycle copy.
- [ ] Add detail-sheet tests for score components, source freshness, 30-day-normalized velocity wording, eligibility progress, formula version/checksum, grade history, and all four `NOT_APPLIED` cost rows.
- [ ] Update Product Hub tests for status filter, profit/margin columns, deep-linked selected product, stale status, and absence of criteria selection/edit controls.
- [ ] Run selected web tests. Expected: FAIL until old components are replaced.

### Step 4: Implement the read-only Product Management UI

- [ ] Rewrite `ProductAbcBadge` as grade plus calculation-state presentation. Keep grade color and stale/error indicator semantically distinct.
- [ ] Replace the old dialog with `ProductAbcDetailSheet`; delete old imports/file after all consumers move. This sheet explains the automatic result but cannot change it.
- [ ] Replace lifecycle/risk controls with calculation-status filtering and add contribution profit velocity/margin columns. Show the formula version and the disclosure that four deferred cost categories are currently excluded with amount zero.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/products/application/service/product-operations.service.spec.ts src/products/adapter/in/http/product-operations.controller.spec.ts
  npm run test:integration --workspace=apps/server -- src/products/__tests__/product-operations.repository.pg.integration.spec.ts
  npm exec --workspace=apps/web vitest -- run src/components/product-abc/ProductAbcBadge.spec.tsx 'src/app/(catalog)/product-hub/components/ProductAbcDetailSheet.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductOperationsCommandCenter.spec.tsx'
  npm run build --workspace=apps/web
  ```

  Expected: server projection, badge, read-only detail, filters, columns, disclosure, and frontend build pass.

- [ ] Commit:

  ```bash
  git add apps/server/src/products apps/web/src/components/product-abc 'apps/web/src/app/(catalog)/product-hub'
  git commit -m "feat: show profitability ABC in product management"
  ```

---

## Task 9: Replace Dashboard and Product Outflow ABC projections

**Files:**

- Modify: `apps/server/src/analytics/dashboard/application/port/out/repository/dashboard-inventory.repository.port.ts`
- Modify: `apps/server/src/analytics/dashboard/application/port/out/repository/dashboard-sales.repository.port.ts`
- Modify: `apps/server/src/analytics/dashboard/application/service/dashboard-inventory.service.ts`
- Modify: `apps/server/src/analytics/dashboard/application/service/dashboard-inventory.service.spec.ts`
- Modify: `apps/server/src/analytics/dashboard/application/service/dashboard-sales.service.ts`
- Modify: `apps/server/src/analytics/dashboard/application/service/dashboard-sales.service.spec.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-inventory.repository.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-sales.repository.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-inventory.repository.adapter.spec.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-sales.repository.adapter.spec.ts`
- Modify: `apps/server/src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts`
- Modify: `apps/web/src/app/(analytics)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardGradeCards.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardTopProducts.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/components/DashboardTopProducts.spec.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/page.grade-cards.spec.tsx`
- Modify: `apps/web/src/app/__tests__/page.spec.tsx`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.spec.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.spec.ts`
- Modify: `packages/shared/src/schemas/__tests__/sellpia-product-sales-inventory.spec.ts`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.spec.tsx`

### Step 1: Lock Dashboard read semantics

- [ ] Test dashboard grade cards contain product count, contribution profit, contribution-profit share, calculation-status counts, freshness, active formula version, and deferred-cost disclosure.
- [ ] Test null-grade products appear in status counts but not grade counts/shares; stale/error retained grades appear in both their grade and abnormal status buckets.
- [ ] Remove old lifecycle/risk and metric/period context assertions.
- [ ] Run dashboard server/web tests. Expected: FAIL against the existing cumulative/lifecycle cards.

### Step 2: Implement Dashboard projection and cards

- [ ] Read persisted Products evaluation/formula data under organization scope; never recalculate in Analytics.
- [ ] Render A/B/C cards, source/status freshness, formula version, and excluded-cost disclosure. Keep top-product sorting explicit (`weightedContributionProfit` descending) and label it as contribution profit, not gross profit.
- [ ] Run dashboard server/web tests. Expected: PASS.

### Step 3: Lock and implement compact Product Outflow presentation

- [ ] Replace old embedded evaluation tests with grade, status, contribution profit velocity, margin, freshness, and `masterProductId`. Keep depletion/stock computations unchanged and independent of ABC availability.
- [ ] Render a compact grade/status badge and profit/margin values. Link the row to Product Management's detail sheet using the master product ID; do not duplicate formula/history details on the outflow page.
- [ ] Test no-grade/stale states and prove the page still renders when no evaluation exists.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/analytics/dashboard/application/service/dashboard-inventory.service.spec.ts src/analytics/dashboard/application/service/dashboard-sales.service.spec.ts src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-inventory.repository.adapter.spec.ts src/analytics/dashboard/adapter/out/repository/__tests__/dashboard-sales.repository.adapter.spec.ts src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.spec.ts src/analytics/sellpia-product-sales/sellpia-product-inventory-projection.spec.ts
  npm run test:integration --workspace=apps/server -- src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts
  npm exec --workspace=packages/shared vitest -- run src/schemas/__tests__/sellpia-product-sales-inventory.spec.ts
  npm exec --workspace=apps/web vitest -- run 'src/app/(analytics)/dashboard/page.grade-cards.spec.tsx' 'src/app/(analytics)/dashboard/components/DashboardTopProducts.spec.tsx' src/app/__tests__/page.spec.tsx 'src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx' 'src/app/(inventory)/stock-ops/components/ProductOutflowDestinations.spec.tsx'
  npm run build --workspace=apps/web
  ```

  Expected: Dashboard and Product Outflow use the same grade/status semantics, outflow retains independent depletion behavior, and the web build passes.

- [ ] Commit:

  ```bash
  git add apps/server/src/analytics packages/shared/src/schemas/dashboard.ts packages/shared/src/schemas/dashboard.spec.ts packages/shared/src/schemas/__tests__/sellpia-product-sales-inventory.spec.ts 'apps/web/src/app/(analytics)/dashboard' 'apps/web/src/app/(inventory)/stock-ops/components'
  git commit -m "feat: align ABC dashboard and product outflow"
  ```

---

## Task 10: Add the phased semantic-reset migrations and remove old ABC surfaces

**Files:**

- Modify: `scripts/data-migrations/v0.1.30/001_upgrade_master_product_abc_profit_policy.ts`
- Modify: `scripts/__tests__/master-product-abc-profit-migration.spec.ts`
- Create: `scripts/data-migrations/v0.1.30/002_reset_master_product_profitability_abc.ts`
- Create: `scripts/__tests__/master-product-profitability-abc-reset-migration.spec.ts`
- Create: `scripts/data-migrations/v0.1.30/003_backfill_master_product_profitability_sources.ts`
- Create: `scripts/__tests__/master-product-profitability-source-backfill.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ERD.md`
- Regenerate: `graphify-out/schema/`
- Modify: `prisma/AGENTS.md`
- Modify: `apps/server/src/analytics/AGENTS.md`
- Modify: `apps/server/src/analytics/dashboard/AGENTS.md`
- Modify: `apps/server/src/advertising/AGENTS.md`
- Verify: `apps/server/src/finance/AGENTS.md`
- Verify: `apps/server/src/products/AGENTS.md`
- Modify: `apps/server/src/inventory/AGENTS.md`
- Modify: `apps/web/src/components/providers/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `apps/web/src/app/(analytics)/dashboard/AGENTS.md`
- Modify: `apps/web/src/app/(inventory)/stock-ops/AGENTS.md`
- Modify: `extensions/kiditem-os/background/orders/AGENTS.md`

### Step 1: Make the existing unshipped migration compatible with the new schema

- [ ] Confirm before editing that `001_upgrade_master_product_abc_profit_policy.ts` is still part of this unpromoted feature branch and not an applied `main` migration. The current expected evidence is that it exists only in `origin/develop..HEAD`; if that ancestry has changed, obey the release-train rule and open the next train instead of editing an applied migration.
- [ ] Rewrite `001` to be self-contained and compatible with a Prisma Client that no longer exposes `MasterProductAbcPolicy`: inline its historical gross-profit defaults, use tagged raw queries guarded by `to_regclass` for the legacy table, keep its existing ID/result meaning, set `phase: 'pre-schema'`, and return a no-op when a fresh/new-schema database has no legacy table.
- [ ] Update `master-product-abc-profit-migration.spec.ts` to cover the legacy-table path, absent-table path, and unchanged migration ID. Run it. Expected: PASS without importing removed shared constants or removed Prisma model delegates.

### Step 2: Write the failing pre-schema semantic-reset test

- [ ] Test migration `002` has `phase: 'pre-schema'`, is organization-scoped, idempotent, and is safe whether the old policy/evaluation/history tables exist or not.
- [ ] Require `002` to:
  - clear unshipped old `MasterProduct.abcGrade` values;
  - count and report old policy/evaluation/history rows plus affected organization IDs in the durable migration-ledger result before the schema contraction removes those unshipped fields/tables;
  - delete the counted incompatible old policy/evaluation/history rows after the result inputs are captured, so schema contraction cannot reinterpret an old row as a new formula/evaluation/history row;
  - avoid copying any lifecycle/provisional/cumulative value into the new contract;
  - leave no fake version-1 formula or migrated provisional grade.
- [ ] Run the focused reset test. Expected: FAIL because migration `002` is absent.

### Step 3: Write the failing post-schema source-backfill test

- [ ] Test migration `003` has `phase: 'post-schema'`, runs after `002`, and backfills exact monthly coverage only when the stored ingest provenance proves the request range.
- [ ] Require a row without provable bounds to retain null bounds, appear in `rowsRequiringRecollection`, and make Finance report Sellpia stale. Do not infer a full month or an arbitrary 13-month range.
- [ ] Require requested sync scope to become `inventory`, active scope to be null when no valid active claim exists, and last-attempt scope to preserve a provable old manual full attempt only when provenance supports it; otherwise use `inventory`.
- [ ] Require `003` to read `002`'s succeeded ledger details and upsert new-model evaluations as grade-null `RECALCULATING` with `statusDetail: 'LEGACY_SEMANTICS_RESET'` for active products in affected organizations. It must not copy an old grade, score, threshold, lifecycle, or formula.
- [ ] Run the focused backfill test. Expected: FAIL because migration `003` is absent.

### Step 4: Implement and register migrations 002 and 003

- [ ] Implement `002` using Prisma tagged templates/raw legacy-table guards, explicit organization batches, and result counts following existing v0.1.30 migration conventions. Do not create a long-lived SQL overlay, partial index, or check constraint; the Prisma `MasterProductAbcFormulaState` relation owns the one-active invariant and service validation owns coverage ordering.
- [ ] Implement `003` with new-schema Prisma delegates, exact provenance parsing, organization batches, and a recollection report. It must not invent source coverage, eligibility, formula data, or grades.
- [ ] Register `002` and `003` after `001` in phase/order sequence in `scripts/data-migrations/index.ts`; update runner fixtures and pre-/post-schema order assertions.
- [ ] Run:

  ```bash
  npm exec vitest -- run scripts/__tests__/master-product-abc-profit-migration.spec.ts scripts/__tests__/master-product-profitability-abc-reset-migration.spec.ts scripts/__tests__/master-product-profitability-source-backfill.spec.ts scripts/__tests__/run-data-migrations.spec.ts
  npm run test:scripts
  ```

  Expected: `001` is backward-compatible, `002` safely resets old semantics before schema contraction, `003` safely backfills only provable new-source state after schema expansion, and all are ordered/idempotent.

### Step 5: Remove obsolete code and update durable ownership docs

- [ ] Use `rg` to remove all application references to:

  ```text
  MasterProductAbcMetric
  periodDays (ABC context only)
  cumulativeContribution
  provisionalGrade
  lifecycle (ABC context only)
  classifiedMin
  provisionalMin
  thresholdA
  thresholdB
  ```

- [ ] Confirm the old Analytics metric reader/port and Product ABC detail dialog/spec explicitly deleted in Tasks 2 and 8 no longer have imports or exports. Remove obsolete lifecycle/provisional selectors inside the listed Product Hub/Dashboard/Outflow files after replacement tests pass. Keep `product-variant-abc-grade-read.port.ts` and its adapter because Advertising still consumes the Products-owned published grade; do not remove unrelated inventory lifecycle concepts.
- [ ] Update `docs/ARCHITECTURE.md` owner flow to `Extension -> Analytics facts -> Finance evidence -> Products formula/evaluation -> Nest read models -> Web` and record the cycle-free Advertising read submodule.
- [ ] Update `docs/ERD.md` and regenerate `graphify-out/schema/` with the repository's documented Graphify command. Do not hand-edit generated schema artifacts.
- [ ] Update every scoped `AGENTS.md` listed above by consolidating, not appending stale historical rules: Analytics source facts, Advertising daily spend, Finance evidence, Products formula/grade ownership, Inventory sync scopes, extension one-request collection, and the three read-only web surfaces. Run `npm run check:agents-hygiene`.
- [ ] Run:

  ```bash
  rg -n "MasterProductAbcMetric|cumulativeContribution|provisionalGrade|classifiedMin|provisionalMin|thresholdA|thresholdB" apps packages prisma --glob '!**/node_modules/**'
  npm run check:directory-architecture
  npm run check:tenant-scope
  npm run check:agents-hygiene
  ```

  Expected: `rg` returns no obsolete application contract hits; architecture, tenant-scope, and instruction hygiene guards pass.

- [ ] Commit:

  ```bash
  git add scripts prisma apps packages docs graphify-out
  git commit -m "refactor: cut over profitability ABC semantics"
  ```

---

## Task 11: Run one integrated QA and release-contract verification

This is the only cross-Task review/QA boundary. Do not add per-Task agent reviews.

### Step 1: Run focused behavior suites together

- [ ] Run the complete new ABC/sync surface:

  ```bash
  npm exec --workspace=packages/shared vitest -- run src/schemas/product-abc.spec.ts src/schemas/product-operations.spec.ts src/schemas/dashboard.spec.ts src/schemas/sellpia-inventory-freshness.spec.ts
  npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales src/advertising/adapter/out/repository/master-product-ad-spend-read.adapter.spec.ts src/finance/application/service/master-product-profitability-read.service.spec.ts src/products/domain src/products/application/service src/products/adapter/out/repository/master-product-abc.repository.adapter.spec.ts src/inventory/domain/policy/sellpia-inventory-freshness.policy.spec.ts src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts
  npm exec --workspace=apps/web vitest -- run src/components/product-abc src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx src/components/panel/__tests__/PanelSheet.spec.tsx 'src/app/(catalog)/product-hub' 'src/app/(analytics)/dashboard/page.grade-cards.spec.tsx' 'src/app/(inventory)/stock-ops/components/ProductOutflow'
  node --test extensions/tests/order-collector-sellpia-product-profit.test.mjs extensions/tests/order-collector-action-coverage.test.mjs scripts/__tests__/automatic-product-profitability-abc-schema-contract.test.mjs
  ```

  Expected: all focused unit/component/contract suites pass.

### Step 2: Run database and Nest gates

- [ ] Against the disposable local development database only, run:

  ```bash
  npm run data:migrate -- up --phase pre-schema --target local --confirm APPLY_DATA_MIGRATIONS
  npm run db:push -- --accept-data-loss
  npx prisma generate
  npm run data:migrate -- up --phase post-schema --target local --confirm APPLY_DATA_MIGRATIONS
  npm run data:migrate -- up --phase pre-schema --target local --confirm APPLY_DATA_MIGRATIONS
  npm run data:migrate -- up --phase post-schema --target local --confirm APPLY_DATA_MIGRATIONS
  npm run build --workspace=packages/shared
  npm run test:integration --workspace=apps/server -- src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts src/products/__tests__/master-product-abc.repository.pg.integration.spec.ts
  ```

  Expected: `002` succeeds before schema contraction, Prisma applies the now-empty legacy contraction/new expansion, `003` succeeds after schema generation, both second migration calls skip safely, and the selected PostgreSQL integrations pass.

- [ ] Start the backend gate:

  ```bash
  npm run dev:server
  ```

  Expected: Nest completes bootstrap without unresolved dependencies or module cycles. Stop the watch process after confirming boot.

### Step 3: Run frontend and repository release gates

- [ ] Run:

  ```bash
  npm run build --workspace=apps/web
  npm run test:scripts
  npm run check:directory-architecture
  npm run check:tenant-scope
  npm run check:pr-reconstruction -- --base origin/develop --head HEAD
  npm run check:pr-release-contract -- --base origin/develop --head HEAD
  git diff --check origin/develop...HEAD
  git status --short
  ```

  Expected: production web build and all guards pass; only intentionally uncommitted QA artifacts, if any, appear in status and must be removed or committed before completion.

### Step 4: Manual operator QA in Chrome

- [ ] Reload the local extension and run `재고만 동기화`. Verify the extension never opens/requests `stat_prd_profit`, inventory updates, ABC timestamps/grade/history do not change, and both sync buttons remain mutually disabled during the claim.
- [ ] Run `전체 동기화`. In Chrome network evidence verify one `stat_prd_profit` request with the required mode/buy/vat fields and approximately 400-day continuous range through yesterday. Verify the server stores boundary coverage dates and automatically starts ABC after successful profit ingestion.
- [ ] Verify `INSUFFICIENT_EVIDENCE` for a product below both thresholds, eligibility at the 30-day or 20-order boundary, `CALIBRATION_PENDING` when history is insufficient, and no criteria/grade edit modal anywhere.
- [ ] Verify the same grade/status/freshness appears on Dashboard, Product Management, and Product Outflow; open Product Management details from Outflow.
- [ ] Verify formula version/checksum, profit velocity, margin, source coverage, and four zero/`NOT_APPLIED` deferred costs appear in Product Management; verify the cost disclaimer on Dashboard.
- [ ] Simulate or fixture stale ad/Sellpia evidence and a calculation error. Confirm the last normal grade remains visible with the abnormal status and no missing cost is treated as zero.
- [ ] In the workflow notification panel, clear one disappeared workflow and then use bulk `진행 정리`. Confirm UI items disappear while durable workflow history remains queryable.

### Step 5: Final evidence commit

- [ ] Update durable tests/docs for any integrated QA correction, rerun the affected command plus Steps 1–3, then commit once:

  ```bash
  git add -A
  git commit -m "test: verify automatic profitability ABC"
  ```

  If integrated QA required no tracked change, do not create an empty commit.

---

## Completion Evidence

Completion requires all of the following, not only a green UI build:

- One continuous Sellpia product-profit request is proven by extension tests and Chrome network evidence.
- Exact source coverage dates survive DTO, database, Finance evidence, and Product detail presentation.
- Missing/stale advertising evidence never becomes zero; explicit no-ad evidence does.
- The four deferred variable costs remain visible formula components with zero and `NOT_APPLIED`.
- Eligibility, time decay, frozen quantiles, reliability shrinkage, hard-C, tie-safe boundaries, and stable frozen-formula behavior have pure regression tests.
- A sync cannot silently replace an active formula.
- Inventory-only sync never collects profit data or triggers ABC; full sync does both.
- Dashboard, Product Management, and Product Outflow agree on grade/status while serving different detail depths.
- UI-only workflow cleanup works without deleting durable audit records.
- Pre-schema migration `v0.1.30/002` and post-schema migration `v0.1.30/003` are ordered, idempotent, and do not invent grades, formulas, or source evidence.
- Backend boot, frontend build, schema, integration, tenant, architecture, PR reconstruction, and release-contract gates all pass.
