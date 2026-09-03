# Explicit Absolute ABC Publication Implementation Plan

**Status:** ACTIVE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cohort-relative product ABC with a deterministic per-product formula published only by an explicit Product Hub request.

**Architecture:** Finance loads one compatible, COMPLETE Sellpia/Advertising snapshot and labels live source readiness. Products independently evaluates each currently selling and mapped product with immutable V1 anchors, then performs one source/formula/publication/target-set CAS transaction that writes FormulaState, Evaluation, grade cache, and real history together. Product reads combine last official publication with live evidence; the UI owns the only production recalculation call.

**Tech Stack:** NestJS, Prisma 7/PostgreSQL, Zod, React/Next.js, TanStack Query, Vitest

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Global Constraints

- Each seam is implemented RED-to-GREEN with focused tests, then reviewed for
  deletable Ponytail complexity before its commit.
- `operatingProfit = recognizedRevenue - orderTimeSupplyCost - advertisingSpend`; no other cost is invented as zero.
- Evaluation excludes the current KST month, uses at most 12 completed months, a 90-day half-life, and exact valid covered days.
- Fixed V1 weights are 50/30/20; thresholds are A `80` with margin/consistency guards `60`, B `50`, otherwise C; Hard C is exactly nonpositive weighted profit, nonpositive margin, or loss persistence at least `0.5`.
- Another product's facts, count, rank, percentile, or population hash never enter a score or grade.
- `MISSING`/`STALE` does not become zero or C and writes no ABC publication. The last official grade remains visible with its official cutoff.
- `NEW`/`INSUFFICIENT_EVIDENCE` is derived for fewer than 30 valid days and stores no official grade. It is not another durable lifecycle.
- Formula state owns publication provenance once per organization. One command performs one CAS attempt and never loops.
- The first successful full publication after reset is the baseline and writes no history. Later history contains only actual A/B/C transitions.
- Contribution and rank are unweighted display metrics and do not read or influence grade/evaluation.

---

### Task 1: Freeze The Shared Formula And Pure Evaluator

**Files:**

- Modify: `packages/shared/src/schemas/product-abc.ts`
- Modify: `packages/shared/src/schemas/product-abc.spec.ts`
- Modify: `packages/shared/src/product-abc.ts`
- Modify: `apps/server/src/products/domain/master-product-abc.ts`
- Modify: `apps/server/src/products/domain/master-product-abc.spec.ts`
- Modify: `apps/server/src/products/domain/master-product-abc.qa-regression.spec.ts`
- Delete: `apps/server/src/products/domain/master-product-abc-calibration.ts`
- Delete: `apps/server/src/products/domain/master-product-abc-calibration.spec.ts`
- Delete: `apps/server/src/products/domain/master-product-profitability-score.ts`
- Delete: `apps/server/src/products/domain/master-product-profitability-score.spec.ts`
- Delete: `apps/server/src/products/domain/master-product-profitability-score.regression-1.spec.ts`
- Modify: `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

**Interfaces:**

- Consumes: one product's formula-ready completed-month facts plus `PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD`.
- Produces: `evaluateMasterProductAbc({ facts, formula }): MasterProductAbcCandidate` and immutable shared formula/result schemas.

```ts
export type MasterProductAbcFormulaReadyFacts = Readonly<{
  masterProductId: string;
  cutoffDate: string;
  monthlyFacts: readonly {
    yearMonth: string;
    coverageStartDate: string;
    coverageEndDate: string;
    coveredDays: number;
    recognizedRevenue: number;
    orderTimeSupplyCost: number;
    advertisingSpend: number;
    provenance: {
      costBasis: "ORDER_TIME_SUPPLY_COST";
      vatIncluded: true;
      advertisingEvidence: "OBSERVED" | "CONFIRMED_ZERO" | "NOT_APPLIED";
    };
  }[];
}>;
```

- [x] **Step 1: Write failing worked-example tests**

```ts
it("grades one product without a cohort", () => {
  expect(
    evaluateMasterProductAbc({
      facts: profitableFacts,
      formula: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
    }),
  ).toMatchObject({ abcGrade: "A", validObservationDays: 30 });
});

it.each([
  ["nonpositive profit", zeroProfitFacts],
  ["nonpositive margin", zeroMarginFacts],
  ["fifty percent loss persistence", persistentLossFacts],
])("applies Hard C for %s", (_name, facts) => {
  expect(
    evaluateMasterProductAbc({
      facts,
      formula: PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
    }).abcGrade,
  ).toBe("C");
});

it("does not change a product when unrelated products are added", () => {
  const alone = evaluateMasterProductAbc({ facts: productFacts, formula });
  const together = [unrelatedFacts, productFacts]
    .map((facts) => evaluateMasterProductAbc({ facts, formula }))
    .find(
      (candidate) => candidate.masterProductId === productFacts.masterProductId,
    );
  expect(together).toEqual(alone);
});
```

- [x] **Step 2: Run formula tests and verify red**

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/product-abc.spec.ts
npm exec --workspace=apps/server vitest -- run src/products/domain/master-product-abc.spec.ts src/products/domain/master-product-abc.qa-regression.spec.ts
```

Expected: FAIL because current payload contains calibration/reliability/relative cutoffs and current evaluator applies quantiles.

- [x] **Step 3: Implement only the fixed V1 formula**

Define the exact anchor tables from the spec, linear interpolation with endpoint clamp, 90-day half-life weighting, 30-day velocity, weighted margin, monthly inferred loss persistence, binary64 arithmetic, six-decimal half-up persistence values, and threshold comparisons against unrounded metrics. Reject invalid provenance, negative source amounts, non-month-end cutoff, overlap, more than 12 months, and fewer than 30 valid days.

- [x] **Step 4: Delete relative scoring and make the spec's NEW wording consistent**

Remove quantile, calibration, shrinkage, reliability, Orders, training range, sample/fold metrics, and cohort helpers. Amend the one contradictory spec sentence so `NEW/INSUFFICIENT_EVIDENCE` is a read-time derived evaluation reason rather than a stored normal Evaluation row.

- [x] **Step 5: Run formula tests**

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/product-abc.spec.ts
npm exec --workspace=apps/server vitest -- run src/products/domain/master-product-abc.spec.ts src/products/domain/master-product-abc.qa-regression.spec.ts
npm run build --workspace=packages/shared
```

Expected: PASS for all anchors, interpolation points, A guards, B threshold, Hard C boundaries, 29/30 days, month clipping, zero-proof provenance, and cohort independence.

- [x] **Step 6: Commit the pure formula**

```bash
git add packages/shared/src/schemas/product-abc.ts packages/shared/src/schemas/product-abc.spec.ts packages/shared/src/product-abc.ts apps/server/src/products/domain docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md
git commit -m "feat: replace product ABC with absolute formula"
```

### Task 2: Reset And Install The Minimal ABC Persistence

**Files:**

- Modify: `prisma/models/core.prisma`
- Create: `scripts/data-migrations/v0.1.31/001_reset_absolute_product_abc.ts`
- Create: `scripts/data-migrations/v0.1.31/002_initialize_absolute_product_abc_formula.ts`
- Create: `scripts/__tests__/absolute-product-abc-baseline-migration.spec.ts`
- Create: `scripts/__tests__/absolute-product-abc-hard-rewrite-contract.test.mjs`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Delete: `scripts/__tests__/automatic-product-profitability-abc-schema-contract.test.mjs`

**Interfaces:**

- Consumes: release `0.1.31`, the immutable formula JSON/hash, and existing organization IDs.
- Produces: minimal `MasterProductAbcFormulaVersion`, `MasterProductAbcFormulaState`, `MasterProductAbcEvaluation`, `MasterProductAbcGradeHistory`, and a null grade cache baseline.

```ts
type FormulaState = {
  organizationId: string;
  activeFormulaVersionId: string;
  formulaRevision: number;
  publicationRevision: number;
  officialCutoffDate: Date | null;
  publishedSellpiaSourceImportRunId: string | null;
  publishedAdvertisingSourceImportRunId: string | null;
  publishedMappingGeneration: bigint | null;
  mappingGeneration: bigint;
  publishedAt: Date | null;
};
```

- [x] **Step 1: Write failing migration and schema-contract tests**

```ts
it("clears every legacy ABC row and grade cache before installing V1", async () => {
  await seedLegacyAbcState();
  await resetAbsoluteProductAbc(prisma);
  expect(await countAbcRows()).toEqual({
    formulas: 0,
    states: 0,
    evaluations: 0,
    history: 0,
    cachedGrades: 0,
  });
});

it("installs one immutable V1 formula state per organization without a publication", async () => {
  await initializeAbsoluteProductAbcFormula(prisma);
  expect(await readStates()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        formulaRevision: 1,
        publicationRevision: 0,
        officialCutoffDate: null,
        publishedAt: null,
      }),
    ]),
  );
});
```

- [x] **Step 2: Run script tests and verify red**

Run: `npm run test:scripts -- --runInBand`

Expected: FAIL because the v0.1.31 reset/initialization migrations and minimal schema contract do not exist.

- [x] **Step 3: Replace legacy ABC columns and add migrations**

FormulaVersion keeps only identity/version/formula JSON/checksum/timestamps. FormulaState keeps the fields shown above and no calibration, pending, dirty, requested, or recalculated state. Evaluation keeps grade, fixed score/metric values, formula/publication revisions, exact source IDs/generations, mapping generation, cutoff, and calculated timestamp. History keeps old/new grade, score/profit/margin, source transition provenance, publication revision, cutoff, reason, and timestamp.

- [x] **Step 4: Run Prisma and migration tests on a disposable database**

```bash
npx prisma validate
npx prisma generate
npm run test:scripts
npm run db:push -- --accept-data-loss
npm run data:migrate -- status
```

Expected: schema validates, generated client builds, migrations are ordered under release `0.1.31`, and no migration publishes an ABC baseline or history.

- [x] **Step 5: Commit ABC persistence**

```bash
git add prisma/models/core.prisma scripts/data-migrations/v0.1.31 scripts/data-migrations/index.ts scripts/__tests__/absolute-product-abc-baseline-migration.spec.ts scripts/__tests__/absolute-product-abc-hard-rewrite-contract.test.mjs scripts/__tests__/run-data-migrations.spec.ts scripts/__tests__/automatic-product-profitability-abc-schema-contract.test.mjs
git commit -m "refactor: reset absolute ABC persistence"
```

### Task 3: Build The Coherent ProfitabilityEvidence Module

**Files:**

- Modify: `apps/server/src/finance/application/port/in/master-product-profitability-read.port.ts`
- Modify: `apps/server/src/finance/application/service/master-product-profitability-read.service.ts`
- Modify: `apps/server/src/finance/application/service/master-product-profitability-read.service.spec.ts`
- Create: `apps/server/src/finance/__tests__/profitability-evidence.pg.integration.spec.ts`
- Create: `apps/server/src/finance/profitability-evidence.module.ts`
- Create: `apps/server/src/finance/profitability-evidence.module.spec.ts`
- Modify: `apps/server/src/finance/finance.module.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.module.ts`
- Modify: `apps/server/src/advertising/advertising-profitability-read.module.ts`
- Modify: `apps/server/src/common/kst.ts`
- Modify: `apps/server/src/common/__tests__/kst.spec.ts`

**Interfaces:**

- Consumes: exact-generation reads from Sellpia and Advertising, plus target closed-month cutoff.
- Produces: `ProfitabilityEvidence.load({ organizationId, targetCutoff })`.

```ts
export type SourceGenerationView = Readonly<{
  sourceImportRunId: string | null;
  publicationSequence: string | null;
  mappingGeneration: string | null;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  capturedAt: string | null;
}>;

export type SourceReadiness = Readonly<{
  status: "READY" | "STALE" | "MISSING";
  actualCutoff: string | null;
  latestAttemptState: "RUNNING" | "COMPLETE" | "FAILED" | null;
  errorCode: string | null;
}>;

export type ProductProfitabilityEvidence = Readonly<{
  masterProductId: string;
  selling: boolean;
  mappingValid: boolean;
  validObservationDays: number;
  formulaReadyFacts: MasterProductAbcFormulaReadyFacts | null;
}>;

export interface ProfitabilityEvidenceSnapshot {
  targetCutoff: string;
  actualCutoff: string | null;
  mappingGeneration: string | null;
  sourceVector: {
    sellpia: SourceGenerationView;
    advertising: SourceGenerationView;
  };
  sources: {
    sellpia: SourceReadiness;
    advertising: SourceReadiness;
  };
  products: readonly ProductProfitabilityEvidence[];
}

export interface ProfitabilityEvidence {
  load(input: {
    organizationId: string;
    targetCutoff: string;
  }): Promise<ProfitabilityEvidenceSnapshot>;
}
```

- [x] **Step 1: Write failing unit tests for source selection and dates**

```ts
it("uses the previous KST month end and at most twelve closed months", async () => {
  const result = await evidence.load({
    organizationId,
    targetCutoff: "2026-08-31",
  });
  expect(result.products[0].monthlyFacts.map((row) => row.yearMonth)).toEqual([
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
  ]);
});

it("returns stale with prior complete actual facts after the latest attempt fails", async () => {
  const result = await evidence.load(input);
  expect(result.sources.advertising).toMatchObject({
    status: "STALE",
    latestAttemptState: "FAILED",
  });
  expect(result.actualCutoff).toBe("2026-07-31");
});

it("never converts missing advertising evidence to zero", async () => {
  const result = await evidence.load(inputWithMissingAdDay);
  expect(result.products[0].monthlyFacts[0].advertisingSpend).toBeNull();
});
```

- [x] **Step 2: Run Finance tests and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/common/__tests__/kst.spec.ts src/finance/application/service/master-product-profitability-read.service.spec.ts src/finance/profitability-evidence.module.spec.ts`

Expected: FAIL because the current reader accepts Orders, catches arbitrary errors, assumes eligibility, and treats missing/stale ad spend as zero.

- [x] **Step 3: Implement compatible manifest selection**

Select the newest pair of completed Sellpia/Advertising generations with the same mapping generation and valid fixed ad policy hash. Derive `READY` only when the latest attempts are COMPLETE, both current generations cover the target, and the pair is compatible. Return an older compatible complete pair for labeled display when available, but mark the blocking source `STALE`; return `MISSING` and null numeric evidence when no compatible pair exists. Propagate database, overflow, and malformed manifest errors.

- [x] **Step 4: Assemble product/month facts set-wise**

Exclude facts newer than the common cutoff. Count valid days only where Sellpia coverage, cost/VAT provenance, Advertising `OBSERVED|CONFIRMED_ZERO|NOT_APPLIED`, and frozen mapping all overlap. Preserve confirmed no-sales months as zero and missing months as missing. Do not read Orders, Evaluation, grade cache, or current mutable recipes.

- [x] **Step 5: Run unit and PostgreSQL tests**

```bash
npm exec --workspace=apps/server vitest -- run src/common/__tests__/kst.spec.ts src/finance/application/service/master-product-profitability-read.service.spec.ts src/finance/profitability-evidence.module.spec.ts
npm run test:integration --workspace=apps/server -- src/finance/__tests__/profitability-evidence.pg.integration.spec.ts
```

Expected: PASS for KST rollover, partial boundaries, 29/30 days, confirmed zero, missing/stale, prior complete fallback, mismatched mapping, malformed provenance, and organization isolation.

- [x] **Step 6: Commit ProfitabilityEvidence**

```bash
git add apps/server/src/finance apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.module.ts apps/server/src/advertising/advertising-profitability-read.module.ts apps/server/src/common/kst.ts apps/server/src/common/__tests__/kst.spec.ts
git commit -m "feat: load coherent profitability evidence"
```

### Task 4: Publish ABC With One Atomic CAS

**Files:**

- Create: `apps/server/src/products/application/port/in/master-product-abc-recalculation.port.ts`
- Modify: `apps/server/src/products/application/port/out/repository/master-product-abc.repository.port.ts`
- Modify: `apps/server/src/products/application/service/master-product-abc.service.ts`
- Modify: `apps/server/src/products/application/service/master-product-abc.service.spec.ts`
- Modify: `apps/server/src/products/adapter/out/repository/master-product-abc.repository.adapter.ts`
- Modify: `apps/server/src/products/adapter/out/repository/master-product-abc.repository.adapter.spec.ts`
- Modify: `apps/server/src/products/__tests__/master-product-abc.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Modify: `apps/server/src/operations/operation-owner-worker.module.ts`
- Modify: `apps/server/src/agent-worker-application.module.spec.ts`
- Delete: `apps/server/src/products/adapter/in/operation/product-profitability.operation-handler.ts`
- Delete: `apps/server/src/products/adapter/in/operation/__tests__/product-profitability.operation-handler.spec.ts`
- Delete: `apps/server/src/products/domain/operation/product-profitability.operations.ts`
- Delete: `apps/server/src/products/adapter/in/event/master-product-inventory-activity.listener.ts`
- Delete: `apps/server/src/products/adapter/in/event/master-product-inventory-activity.listener.spec.ts`
- Delete: `apps/server/src/products/products-operation-worker.module.ts`

**Interfaces:**

- Consumes: FormulaState, current selling/mapped target set, and one `ProfitabilityEvidenceSnapshot`.
- Produces: the confirmed `abcGradeService.recalculate({ organizationId })` union.

```ts
export type ProductAbcRecalculationResult =
  | Readonly<{
      outcome: "PUBLISHED";
      publicationRevision: number;
      formulaRevision: number;
      officialCutoff: string;
      classifiedProductCount: number;
      unclassifiedProductCount: number;
      changedProductCount: number;
    }>
  | Readonly<{
      outcome: "SOURCE_NOT_READY";
      publicationRevision: number;
      officialCutoff: string | null;
      actualCutoff: string | null;
      sources: ProfitabilityEvidenceSnapshot["sources"];
    }>;
```

- [x] **Step 1: Write failing service tests at the public command seam**

```ts
it("returns SOURCE_NOT_READY and performs no publication write", async () => {
  evidence.load.mockResolvedValue(staleSnapshot);
  await expect(service.recalculate({ organizationId })).resolves.toMatchObject({
    outcome: "SOURCE_NOT_READY",
  });
  expect(repository.publish).not.toHaveBeenCalled();
});

it("evaluates each eligible product independently and attempts one publication", async () => {
  evidence.load.mockResolvedValue(readySnapshot([productA, productB]));
  await expect(service.recalculate({ organizationId })).resolves.toMatchObject({
    outcome: "PUBLISHED",
  });
  expect(repository.publish).toHaveBeenCalledTimes(1);
});

it("surfaces one CAS miss as INPUT_CHANGED without retrying", async () => {
  repository.publish.mockResolvedValue({ outcome: "INPUT_CHANGED" });
  await expect(service.recalculate({ organizationId })).rejects.toMatchObject({
    response: { code: "INPUT_CHANGED" },
  });
  expect(repository.publish).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Run service tests and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/products/application/service/master-product-abc.service.spec.ts`

Expected: FAIL because the current service calibrates, quantiles, retries twice, and accepts Operation controls.

- [x] **Step 3: Implement the minimal command service**

Compute the target cutoff as the last completed KST month, read FormulaState and the complete current selling/mapped target set, call `ProfitabilityEvidence.load`, return `SOURCE_NOT_READY` without a write when blocked, derive `NEW` count for fewer than 30 valid days, evaluate formula-ready products independently, and call `repository.publish` once. Remove cancellation checkpoints, Operation transaction types, automatic reason strings, and retry loops.

- [x] **Step 4: Write failing PG tests for the publication boundary**

```ts
it("publishes FormulaState, evaluations, cache, and baseline atomically without history", async () => {
  await repository.publish(readyBaseline);
  expect(await readFormulaState()).toMatchObject({
    publicationRevision: 1,
    officialCutoffDate: cutoff,
  });
  expect(await readGrades()).toEqual(expectedGrades);
  expect(await countHistory()).toBe(0);
});

it("writes history only for a later real grade transition", async () => {
  await repository.publish(readyBaseline);
  await repository.publish(nextPublicationWithOneTransition);
  expect(await readHistory()).toEqual([
    expect.objectContaining({
      oldGrade: "B",
      newGrade: "A",
      publicationRevision: 2,
    }),
  ]);
});

it.each([
  "formula",
  "publication",
  "source",
  "cutoff",
  "target-set",
  "selling",
  "mapping",
])("rejects changed %s input without partial writes", async (changedFence) => {
  await mutateFence(changedFence);
  await expect(repository.publish(candidate)).resolves.toEqual({
    outcome: "INPUT_CHANGED",
  });
  expect(await readAbcTables()).toEqual(before);
});
```

- [x] **Step 5: Implement one short CAS publication transaction**

Acquire the shared profitability advisory locks, lock FormulaState, compare formula/publication revisions, exact latest-attempt/current-complete source vector, source readiness, cutoff monotonicity, mapping generation, and the complete target IDs. Re-read current selling/mapping state for every write. Use bounded set-based upsert/delete/cache/history statements. Increment `publicationRevision` in the same transaction. Baseline is `publicationRevision === 0`; it creates no history. Delete the inventory-event cache mutation so this transaction remains the only ABC publication path.

- [x] **Step 6: Run service/repository/PG tests**

```bash
npm exec --workspace=apps/server vitest -- run src/products/application/service/master-product-abc.service.spec.ts src/products/adapter/out/repository/master-product-abc.repository.adapter.spec.ts
npm run test:integration --workspace=apps/server -- src/products/__tests__/master-product-abc.repository.pg.integration.spec.ts
npm exec --workspace=apps/server vitest -- run src/agent-worker-application.module.spec.ts src/products/__tests__/products.architecture.spec.ts
```

Expected: PASS for baseline, transitions, stale/no-write, every CAS fence, organization isolation, concurrent commands, and target changes.

- [x] **Step 7: Commit explicit publication**

```bash
git add apps/server/src/agent-worker-application.module.spec.ts apps/server/src/operations/operation-owner-worker.module.ts apps/server/src/products docs/superpowers/plans/2026-09-03-explicit-absolute-abc-publication.md
git commit -m "feat: publish absolute ABC explicitly"
```

### Task 5: Separate Actual Contribution From Grade

**Files:**

- Create: `apps/server/src/finance/application/port/in/master-product-contribution-read.port.ts`
- Create: `apps/server/src/finance/application/port/out/repository/master-product-contribution.repository.port.ts`
- Create: `apps/server/src/finance/application/service/master-product-contribution-read.service.ts`
- Create: `apps/server/src/finance/adapter/out/repository/master-product-contribution.repository.adapter.ts`
- Create: `apps/server/src/finance/adapter/out/repository/master-product-contribution.repository.adapter.spec.ts`
- Create: `apps/server/src/finance/__tests__/master-product-contribution.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/finance/finance.module.ts`
- Modify: `apps/server/src/finance/__tests__/finance.module.wiring.spec.ts`
- Modify: `packages/shared/src/schemas/product-abc.ts`
- Modify: `packages/shared/src/schemas/product-abc.spec.ts`
- Modify: `packages/shared/src/schemas/product-operations.ts`

**Interfaces:**

- Consumes: exact completed source IDs and an actual unweighted date basis.
- Produces: revenue contribution, positive-profit contribution, loss impact, ranks, cumulative shares, and signed net operating profit.

- [x] **Step 1: Write failing PostgreSQL contribution tests**

```ts
it("keeps grade out of contribution and includes stopped/new products with complete metrics", async () => {
  const result = await repository.readContribution(input);
  expect(result.products.map((row) => row.masterProductId)).toEqual(
    expect.arrayContaining([stoppedId, newId]),
  );
});

it("uses independent positive-profit and loss denominators", async () => {
  const result = await repository.readContribution(mixedProfitAndLoss);
  expect(
    sum(result.products, "positiveOperatingProfitContribution"),
  ).toBeCloseTo(1);
  expect(sum(result.products, "lossImpact")).toBeCloseTo(1);
  expect(result.totals.netOperatingProfit).toBe(signedNet);
});

it("returns null shares when a metric denominator is zero", async () => {
  expect(
    (await repository.readContribution(zeroDenominators)).metrics.sales.status,
  ).toBe("NO_DENOMINATOR");
});
```

- [x] **Step 2: Run the PG test and verify red**

Run: `npm run test:integration --workspace=apps/server -- src/finance/__tests__/master-product-contribution.repository.pg.integration.spec.ts`

Expected: FAIL because current Dashboard contribution reads weighted retained Evaluations and groups by ABC grade.

- [x] **Step 3: Implement one set-based SQL/window projection**

Validate source manifests in the first CTE, aggregate actual Sellpia and frozen Advertising facts, calculate signed product operating profit, then derive revenue, positive-profit, and loss-magnitude metric populations independently. Use `dense_rank()` and tie-preserving `RANGE` cumulative windows. Apply any requested product filter only in the final SELECT after organization-wide denominators and ranks are complete.

- [x] **Step 4: Run contribution tests**

```bash
npm exec --workspace=apps/server vitest -- run src/finance/adapter/out/repository/master-product-contribution.repository.adapter.spec.ts
npm run test:integration --workspace=apps/server -- src/finance/__tests__/master-product-contribution.repository.pg.integration.spec.ts
```

Expected: PASS for positive-only, loss-only, mixed, zero denominators, ties, stopped/new products, per-metric exclusion, final filtering, and organization isolation.

- [x] **Step 5: Commit contribution projection**

```bash
git add apps/server/src/finance/application/port/in/master-product-contribution-read.port.ts apps/server/src/finance/application/port/out/repository/master-product-contribution.repository.port.ts apps/server/src/finance/application/service/master-product-contribution-read.service.ts apps/server/src/finance/adapter/out/repository/master-product-contribution.repository.adapter.ts apps/server/src/finance/adapter/out/repository/master-product-contribution.repository.adapter.spec.ts apps/server/src/finance/__tests__/master-product-contribution.repository.pg.integration.spec.ts packages/shared/src/schemas/product-abc.ts packages/shared/src/schemas/product-operations.ts
git commit -m "feat: separate profitability contribution metrics"
```

### Task 6: Expose The Explicit HTTP And Product Hub UI

**Files:**

- Create: `apps/server/src/products/adapter/in/http/product-abc.controller.ts`
- Create: `apps/server/src/products/adapter/in/http/product-abc.controller.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Modify: `apps/server/src/products/__tests__/products.architecture.spec.ts`
- Modify: `apps/server/src/products/application/service/product-operations-data-status.service.ts`
- Modify: `apps/server/src/products/application/service/product-operations-data-status.service.spec.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-operations-data-status.repository.adapter.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-operations-data-status.repository.adapter.spec.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts`
- Modify: `apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts`
- Create: `apps/web/src/lib/product-abc-api.ts`
- Create: `apps/web/src/lib/__tests__/product-abc-api.spec.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductOperationsDataStatusAction.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductOperationsDataStatusAction.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductOperationsDataStatusDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductOperationsDataStatusDialog.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx`

**Interfaces:**

- Consumes: `MasterProductAbcRecalculationPort`, Products read projection, and the confirmed HTTP response union.
- Produces: `POST /api/products/abc/recalculate` and the sole explicit Product Hub refresh button.

- [ ] **Step 1: Write failing controller tests**

```ts
it("passes only authenticated organization scope and returns SOURCE_NOT_READY as 200 data", async () => {
  service.recalculate.mockResolvedValue(sourceNotReady);
  await expect(controller.recalculate(organizationId)).resolves.toEqual(
    sourceNotReady,
  );
  expect(service.recalculate).toHaveBeenCalledWith({ organizationId });
});

it("maps only INPUT_CHANGED to HTTP 409", async () => {
  service.recalculate.mockRejectedValue(inputChanged);
  await expect(controller.recalculate(organizationId)).rejects.toMatchObject({
    status: 409,
  });
});
```

- [ ] **Step 2: Run controller/read tests and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/products/adapter/in/http/product-abc.controller.spec.ts src/products/application/service/product-operations-data-status.service.spec.ts`

Expected: FAIL because the route and current/live cutoff projection do not exist.

- [ ] **Step 3: Implement HTTP and side-effect-free reads**

Register `ProductAbcController` without exporting the recalculation port to other modules. Product list/detail/data-status return the last official grade, formula/publication revision and cutoff, live source status/capture/actual cutoff, and actual contribution metrics. They derive `NEW` and source-abnormal labels without changing persistence.

- [ ] **Step 4: Write failing Product Hub behavior tests**

```tsx
it("is the only UI that posts explicit ABC recalculation and refetches its own queries", async () => {
  await user.click(screen.getByRole("button", { name: "등급 새로고침" }));
  expect(recalculateProductAbc).toHaveBeenCalledTimes(1);
  expect(refetchProductQueries).toHaveBeenCalledTimes(1);
});

it("keeps the last grade while labeling stale source and both cutoffs", () => {
  renderDialog(staleWithOfficialGrade);
  expect(screen.getByText("B")).toBeVisible();
  expect(screen.getByText(/공식 등급 기준일/)).toBeVisible();
  expect(screen.getByText(/표시 데이터 기준일/)).toBeVisible();
});
```

- [ ] **Step 5: Run web tests and verify red**

Run: `npm exec --workspace=apps/web vitest -- run src/lib/__tests__/product-abc-api.spec.ts 'src/app/(catalog)/product-hub/components/ProductOperationsDataStatusAction.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductOperationsDataStatusDialog.spec.tsx' 'src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx'`

Expected: FAIL because the action currently starts the combined Operation refresh.

- [ ] **Step 6: Implement the Product Hub action and refetch contract**

Call only `POST /api/products/abc/recalculate`. Disable the button unless required sources are READY. On `PUBLISHED`, invalidate/refetch Product Hub list, overview, data-status, and selected detail queries. On `SOURCE_NOT_READY`, keep existing grade data and render source/cutoff explanation. On `INPUT_CHANGED`, refetch and show a retryable inline message; do not auto-retry.

- [ ] **Step 7: Run backend/web tests and builds**

```bash
npm exec --workspace=apps/server vitest -- run src/products/adapter/in/http/product-abc.controller.spec.ts src/products/application/service/product-operations-data-status.service.spec.ts src/products/__tests__/products.architecture.spec.ts
npm run test:integration --workspace=apps/server -- src/products/__tests__/product-operations.repository.pg.integration.spec.ts
npm exec --workspace=apps/web vitest -- run src/lib/__tests__/product-abc-api.spec.ts 'src/app/(catalog)/product-hub/components/ProductOperationsDataStatusAction.spec.tsx' 'src/app/(catalog)/product-hub/components/ProductOperationsDataStatusDialog.spec.tsx' 'src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx'
npm run build --workspace=apps/web
```

Expected: PASS; repository reads are side-effect-free and no other UI or source path posts the ABC route.

- [ ] **Step 8: Commit the explicit screen**

```bash
git add apps/server/src/products apps/web/src/lib/product-abc-api.ts apps/web/src/lib/__tests__/product-abc-api.spec.ts apps/web/src/lib/query-keys.ts 'apps/web/src/app/(catalog)/product-hub'
git commit -m "feat: refresh absolute ABC from Product Hub"
```
