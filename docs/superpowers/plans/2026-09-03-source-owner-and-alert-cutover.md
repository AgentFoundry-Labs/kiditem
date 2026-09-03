# Source Owner And Alert Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sellpia profitability and mapping evidence durable under their owners, with one focused Alert seam and no Operation or ABC side effect.

**Architecture:** `SourceImportRun` is reshaped into the Sellpia owner attempt/manifest while generation-tagged monthly facts stay invisible until the attempt is `completed`. A focused `AlertsModule` participates in the owner's terminal transaction through two concrete methods. Mapping changes advance one Products-owned monotonic generation but never recalculate ABC.

**Tech Stack:** NestJS, Prisma 7/PostgreSQL, class-validator, Zod, Vitest, Node test runner, Chrome extension Manifest V3

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Global Constraints

- Public source state is only `RUNNING`, `COMPLETE`, or `FAILED`; expiration is a read-time effective failure and a new begin terminalizes the expired attempt.
- Begin is idempotent by authenticated organization plus `Idempotency-Key`; a changed normalized request returns conflict.
- Source facts are immutable per attempt/generation and canonical readers select only the newest `completed` publication sequence.
- Source completion/failure and Alert resolve/upsert are one PostgreSQL transaction. No event, outbox, Operation, worker, or ABC call is added.
- Sellpia cost provenance must be `ORDER_TIME_SUPPLY_COST` with confirmed VAT provenance. Empty coverage is valid only with provider-backed proof.
- Organization scope is present in every fact join, foreign key, and mutation predicate.
- No compatibility route remains after extension callers move.

---

### Task 1: Extract The Focused Alerts Module

**Files:**

- Create: `apps/server/src/alerts/alerts.module.ts`
- Create: `apps/server/src/alerts/alerts.module.spec.ts`
- Create: `apps/server/src/alerts/alerts.service.ts`
- Create: `apps/server/src/alerts/alerts.service.spec.ts`
- Create: `apps/server/src/alerts/alerts.repository.ts`
- Create: `apps/server/src/alerts/alerts.controller.ts`
- Create: `apps/server/src/alerts/alerts.controller.spec.ts`
- Create: `apps/server/src/alerts/__tests__/source-failure-alerts.pg.integration.spec.ts`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `packages/shared/src/schemas/alerts.ts`
- Modify: `packages/shared/src/schemas/alerts.spec.ts`
- Modify: `packages/shared/src/alerts.ts`
- Modify: `prisma/models/system.prisma`
- Modify: `prisma/models/core.prisma`

**Interfaces:**

- Consumes: authenticated organization IDs and the source owner's `Prisma.TransactionClient`.
- Produces: `SourceFailureAlerts.upsertSourceFailure(tx, input)`, `SourceFailureAlerts.resolveSourceFailure(tx, input)`, `GET /api/alerts`, and `POST /api/alerts/:id/dismiss`.

```ts
export type SourceFailureAlertInput = Readonly<{
  organizationId: string;
  dedupeKey: string;
  sourceType: string;
  attemptId: string;
  severity: "warning" | "error" | "critical";
  title: string;
  message: string;
  href: string;
}>;

export class SourceFailureAlerts {
  upsertSourceFailure(
    tx: Prisma.TransactionClient,
    input: SourceFailureAlertInput,
  ): Promise<void>;
  resolveSourceFailure(
    tx: Prisma.TransactionClient,
    input: Pick<
      SourceFailureAlertInput,
      "organizationId" | "dedupeKey" | "attemptId"
    >,
  ): Promise<void>;
}
```

- [x] **Step 1: Write failing PostgreSQL tests for the transaction seam**

```ts
it("keeps one row, ignores the same attempt replay, and reopens unread for a newer failure", async () => {
  await inTransaction((tx) =>
    alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_1)),
  );
  await dismissCurrentAlert();
  await inTransaction((tx) =>
    alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_1)),
  );
  expect(await readAlert()).toMatchObject({
    status: "OPEN",
    isRead: true,
    attemptId: ATTEMPT_ID_1,
  });
  await inTransaction((tx) =>
    alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_2)),
  );
  expect(await readAlert()).toMatchObject({
    status: "OPEN",
    isRead: false,
    attemptId: ATTEMPT_ID_2,
  });
});

it("rolls source terminal state back when the alert mutation fails", async () => {
  await expect(terminalizeWithInvalidAlert()).rejects.toThrow();
  expect(await readAttemptStatus()).toBe("running");
});
```

- [x] **Step 2: Run the PG test and verify red**

Run: `npm run test:integration --workspace=apps/server -- src/alerts/__tests__/source-failure-alerts.pg.integration.spec.ts`

Expected: FAIL because `SourceFailureAlerts` and `Alert.dedupeKey/attemptId` do not exist.

- [x] **Step 3: Implement the minimal Alert persistence and HTTP surface**

Retain `id`, `organizationId`, `dedupeKey`, `sourceType`, `attemptId`, `status`, `severity`, `title`, `message`, `href`, `isRead`, `readAt`, `createdAt`, and `updatedAt`. Add a unique constraint on `(organizationId, dedupeKey)`. `dismiss` updates only an organization-scoped open row; `resolveSourceFailure` changes `OPEN` to `RESOLVED`; the same attempt replay does not change read state or timestamps that drive unread behavior.

- [x] **Step 4: Run focused Alert tests**

```bash
npm exec --workspace=apps/server vitest -- run src/alerts/alerts.service.spec.ts src/alerts/alerts.controller.spec.ts
npm run test:integration --workspace=apps/server -- src/alerts/__tests__/source-failure-alerts.pg.integration.spec.ts
npm exec --workspace=packages/shared vitest -- run src/schemas/alerts.spec.ts
```

Expected: PASS; list/dismiss are the only web commands and the PG rollback assertions pass.

- [x] **Step 5: Commit the Alert seam**

```bash
git add apps/server/src/alerts apps/server/src/api-application.module.ts packages/shared/src/alerts.ts packages/shared/src/schemas/alerts.ts packages/shared/src/schemas/alerts.spec.ts prisma/models/system.prisma prisma/models/core.prisma
git commit -m "refactor: isolate durable source alerts"
```

### Task 2: Publish Immutable Sellpia Profitability Generations

**Files:**

- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/channels.prisma`
- Modify: `packages/shared/src/schemas/source-import.ts`
- Modify: `packages/shared/src/schemas/source-import.spec.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/dto/sellpia-product-sales.dto.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.controller.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.service.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader.spec.ts`
- Delete: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.events.ts`

**Interfaces:**

- Consumes: `Idempotency-Key`, authenticated organization, server-selected closed-month range, attempt token, and the existing validated Sellpia profitability payload.
- Produces: `beginAttempt`, `submitAttempt`, `failAttempt`, `readSourceStatus`, and exact-generation fact reads.

```ts
type SellpiaProfitabilityAttemptView = Readonly<{
  attemptId: string;
  attemptToken: string;
  state: "RUNNING" | "COMPLETE" | "FAILED";
  expiresAt: string;
  plan: { from: string; to: string };
}>;

type SellpiaProfitabilitySourceStatus = Readonly<{
  latestAttempt: SellpiaProfitabilityAttemptView | null;
  latestComplete: {
    sourceImportRunId: string;
    generation: string;
    coveredThrough: string;
    capturedAt: string;
  } | null;
  status: "READY" | "STALE" | "MISSING";
}>;
```

- [ ] **Step 1: Replace current overwrite expectations with failing owner-behavior tests**

```ts
it("keeps staged rows invisible and promotes all facts with one completed manifest", async () => {
  const attempt = await beginAttempt("key-1");
  await submitFacts(attempt, completePayload);
  expect(await readExactGeneration(attempt.attemptId)).toHaveLength(
    expectedRows,
  );
  expect(await readCanonical()).toEqual(expectedCurrentRows);
});

it("keeps the previous complete generation current after a failed replacement", async () => {
  const first = await publishComplete("key-1", completePayload);
  await failAttempt(await beginAttempt("key-2"), "PROVIDER_INCOMPLETE");
  expect(await readCanonicalGeneration()).toBe(first.generation);
});

it("does not mutate FormulaState, Evaluation, cache, or history on terminal source writes", async () => {
  const before = await readAbcTables();
  await publishComplete("key-3", completePayload);
  expect(await readAbcTables()).toEqual(before);
});
```

- [ ] **Step 2: Run Sellpia tests and verify red**

```bash
npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts src/analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader.spec.ts
npm run test:integration --workspace=apps/server -- src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts
```

Expected: FAIL because current ingest deletes the canonical month range, publishes no generation manifest, and emits a downstream event.

- [ ] **Step 3: Implement owner attempt and generation persistence**

Add `sourceType='sellpia_product_profitability'`, `idempotencyKey`, `requestFingerprint`, fixed `expiresAt`, server plan JSON, checksums, mapping generation, coverage, and publication sequence to the reshaped `SourceImportRun`. Add `sourceImportRunId`, frozen `sellpiaInventorySkuId`, and frozen `masterProductId` to `SellpiaProductMonthlySales`. The submit transaction validates the token/provenance/coverage and inserts facts in existing 5,000-row JSONB batches before one short metadata transaction marks the run `completed`, advances publication sequence, and resolves its Alert.

- [ ] **Step 4: Make every canonical Sellpia reader generation-aware**

`getSummary` and `SellpiaMasterProductProfitFactReader` first select the latest organization-scoped completed `sellpia_product_profitability` run, then filter facts by that exact ID. They never read all generations and never remap an old fact through the current SKU relation.

- [ ] **Step 5: Run focused and module tests**

```bash
npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts src/analytics/sellpia-product-sales/sellpia-master-product-profit-fact.reader.spec.ts src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.module.wiring.spec.ts
npm run test:integration --workspace=apps/server -- src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts
```

Expected: PASS for replay, failure fallback, frozen mapping, provider-backed zero, organization isolation, and no ABC mutation.

- [ ] **Step 6: Commit the Sellpia owner**

```bash
git add prisma/models/core.prisma prisma/models/channels.prisma packages/shared/src/schemas/source-import.ts packages/shared/src/schemas/source-import.spec.ts apps/server/src/analytics/sellpia-product-sales
git commit -m "refactor: make Sellpia profitability source-owned"
```

### Task 3: Advance Mapping Evidence Without Recalculation

**Files:**

- Modify: `apps/server/src/products/application/port/out/repository/product-operations.repository.port.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts`
- Modify: `apps/server/src/products/application/service/product-operations.service.ts`
- Modify: `apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts`
- Modify: `apps/server/src/channels/__tests__/channel-product-matching.pg.integration.spec.ts`
- Modify: `prisma/models/core.prisma`

**Interfaces:**

- Consumes: successful organization-scoped replacement of option recipes or canonical MasterProduct/Sellpia mapping.
- Produces: a monotonic `mappingGeneration` read through Products state; no ABC call or dirty state.

- [ ] **Step 1: Write failing PostgreSQL generation tests**

```ts
it("increments mapping generation once with a committed recipe replacement", async () => {
  const before = await readMappingGeneration();
  await replaceChannelOptionInventory(validReplacement);
  expect(await readMappingGeneration()).toBe(before + 1n);
});

it("does not increment generation when the mapping transaction rolls back", async () => {
  const before = await readMappingGeneration();
  await expect(
    replaceChannelOptionInventory(invalidReplacement),
  ).rejects.toThrow();
  expect(await readMappingGeneration()).toBe(before);
});
```

- [ ] **Step 2: Run the focused PG tests and verify red**

Run: `npm run test:integration --workspace=apps/server -- src/products/__tests__/product-operations.repository.pg.integration.spec.ts src/channels/__tests__/channel-product-matching.pg.integration.spec.ts`

Expected: FAIL because no single mapping-generation fence advances with both mutation paths.

- [ ] **Step 3: Add one transaction-local mapping-generation mutation**

Use `MasterProductAbcFormulaState.mappingGeneration` as the existing Products-owned generation column, initializing the fixed formula state when absent without publishing grades. Each successful canonical mapping transaction increments it exactly once. Do not add `markDirty`, requested/recalculated revisions, events, listeners, or an additional state model.

- [ ] **Step 4: Run the focused PG tests**

Run: `npm run test:integration --workspace=apps/server -- src/products/__tests__/product-operations.repository.pg.integration.spec.ts src/channels/__tests__/channel-product-matching.pg.integration.spec.ts`

Expected: PASS, including rollback and organization isolation.

- [ ] **Step 5: Commit mapping evidence**

```bash
git add prisma/models/core.prisma apps/server/src/products/application/port/out/repository/product-operations.repository.port.ts apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts apps/server/src/products/application/service/product-operations.service.ts apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts apps/server/src/channels/__tests__/channel-product-matching.pg.integration.spec.ts
git commit -m "refactor: version canonical product mappings"
```

### Task 4: Contract Collection Sessions And Direct Sellpia Upload

**Files:**

- Modify: `packages/shared/src/schemas/browser-collection-session.ts`
- Modify: `packages/shared/src/schemas/browser-collection-session.spec.ts`
- Modify: `packages/shared/src/browser-collection-session.ts`
- Modify: `extensions/shared/collection-session.js`
- Modify: `extensions/kiditem-os/background/collection-session.js`
- Modify: `extensions/kiditem-os/background/orders/worker.js`
- Modify: `extensions/kiditem-os/background/domain-registry.js`
- Modify: `extensions/tests/collection-session-adapters.test.mjs`
- Modify: `extensions/tests/order-collector-collection-session.test.mjs`
- Modify: `extensions/tests/order-collector-action-coverage.test.mjs`

**Interfaces:**

- Consumes: an owner-issued `attemptId`, attempt token, producer, managed-tab metadata, progress, and human-attention detail.
- Produces: get/list/cancel/open-attention session commands and direct upload to the Sellpia owner endpoint.

- [ ] **Step 1: Write failing session-boundary tests**

```js
test("session correlates owner attempt without mirroring terminal state", async () => {
  const session = await start({ attemptId, producer: "inventory.sellpia" });
  assert.equal(session.attemptId, attemptId);
  assert.equal("status" in session, false);
  assert.equal("restartStrategy" in session, false);
  assert.equal("attempt" in session, false);
});

test("page closure does not prevent direct owner submission", async () => {
  await closeInitiatingPage();
  await runManagedTabCollector();
  assert.equal(ownerRequests.at(-1).attemptId, attemptId);
});
```

- [ ] **Step 2: Run extension/shared tests and verify red**

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/browser-collection-session.spec.ts
node --test extensions/tests/collection-session-adapters.test.mjs extensions/tests/order-collector-collection-session.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
```

Expected: FAIL because the current session exposes terminal/restart/finalize protocol and the Sellpia worker posts to the legacy ingest path without an owner attempt.

- [ ] **Step 3: Remove the second lifecycle and route uploads to the owner**

Keep only `attemptId`, `producer`, bounded progress/attention, and managed-tab resume metadata. Delete restart/finalize session commands and retry counters. Cancel first submits an owner `FAILED` result and clears local control state only after the owner accepts it. The worker begins one attempt, stores its returned plan/token locally, and submits the result directly to `/api/sellpia-product-sales/attempts/:attemptId`.

- [ ] **Step 4: Run extension/shared tests**

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/browser-collection-session.spec.ts src/schemas/browser-collection-session-adapter.integration.spec.ts
node --test extensions/tests/collection-session-adapters.test.mjs extensions/tests/order-collector-collection-session.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
```

Expected: PASS and no extension request contains an Operation run ID.

- [ ] **Step 5: Commit the contracted session**

```bash
git add packages/shared/src/schemas/browser-collection-session.ts packages/shared/src/schemas/browser-collection-session.spec.ts packages/shared/src/browser-collection-session.ts extensions/shared/collection-session.js extensions/kiditem-os/background/collection-session.js extensions/kiditem-os/background/orders/worker.js extensions/kiditem-os/background/domain-registry.js extensions/tests/collection-session-adapters.test.mjs extensions/tests/order-collector-collection-session.test.mjs extensions/tests/order-collector-action-coverage.test.mjs
git commit -m "refactor: route Sellpia collection to its owner"
```
