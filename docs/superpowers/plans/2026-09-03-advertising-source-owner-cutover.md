# Advertising Source Owner Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the profitability Advertising Operation with one source-owned, multi-account import attempt whose facts become canonical only after complete provider proof.

**Architecture:** The server freezes all formula-applicable Coupang accounts and date slices at begin. The extension visits that plan, uploads idempotent account/slice receipts directly, and the Advertising owner validates and promotes the full generation in one short terminal transaction. Monthly master-product allocation facts are frozen with the generation so later recipe changes cannot reinterpret history.

**Tech Stack:** NestJS, Prisma 7/PostgreSQL, Zod, Vitest, Chrome extension Manifest V3, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Global Constraints

- Only the existing `/marketing-reporting/billboard/reports/pa` product report is authoritative for V1 profitability advertising spend.
- One attempt covers every formula-applicable organization account. Missing one account or slice fails the whole generation and leaves the previous complete generation current.
- The server owns the account/date plan; the client cannot add an account, advertiser ID, date, target, mapping generation, or policy hash.
- Every receipt is idempotent by `(attemptId, accountId, sliceId, sequence, checksum)` and conflicting replay is rejected.
- Provider account identity, pagination counts, date universe, listing/option identity, zero proof, recipe weights, and whole-KRW conservation are verified before COMPLETE.
- No Operation run, claim, heartbeat, child, scheduler, Alert lifecycle event, or ABC call remains.
- The existing `/api/ads/profitability-refresh/runs*` route and operation handler are deleted after the direct owner routes pass.
- The designated advertising implementation agent is the only subagent permitted to modify files in this plan; the main agent owns integration and tests.

---

### Task 1: Define The Advertising Owner Interface

**Files:**

- Create: `apps/server/src/advertising/application/port/in/profitability-ad-import.port.ts`
- Create: `apps/server/src/advertising/application/port/out/repository/profitability-ad-import.repository.port.ts`
- Create: `apps/server/src/advertising/application/service/__tests__/profitability-ad-import.service.spec.ts`
- Create: `apps/server/src/advertising/application/service/profitability-ad-import.service.ts`
- Create: `apps/server/src/advertising/adapter/in/http/__tests__/profitability-ad-import.controller.spec.ts`
- Create: `apps/server/src/advertising/adapter/in/http/profitability-ad-import.controller.ts`
- Delete: `apps/server/src/advertising/application/port/in/profitability-ad-refresh.port.ts`
- Delete: `apps/server/src/advertising/application/port/out/repository/profitability-ad-refresh.repository.port.ts`
- Delete: `apps/server/src/advertising/application/service/__tests__/profitability-ad-refresh.service.spec.ts`
- Delete: `apps/server/src/advertising/application/service/profitability-ad-refresh.service.ts`
- Delete: `apps/server/src/advertising/adapter/in/http/__tests__/profitability-ad-refresh.controller.spec.ts`
- Delete: `apps/server/src/advertising/adapter/in/http/profitability-ad-refresh.controller.ts`

**Interfaces:**

- Consumes: authenticated organization, begin idempotency key, server-issued attempt token, and provider report receipts.
- Produces: begin/read/upload/finalize/fail owner commands.

```ts
export type AdvertisingProfitabilityPlan = Readonly<{
  attemptId: string;
  attemptToken: string;
  expiresAt: string;
  mappingGeneration: string;
  adSourcePolicyHash: string;
  accounts: readonly {
    channelAccountId: string;
    externalAccountId: string;
    expectedAdvertiserId: string;
    slices: readonly {
      sliceId: string;
      from: string;
      to: string;
      businessDates: readonly string[];
    }[];
  }[];
}>;

export type AdvertisingProfitabilitySliceUpload = Readonly<{
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  sliceId: string;
  sequence: number;
  checksum: string;
  providerAdvertiserId: string;
  rows: readonly AdvertisingProfitabilityProviderRow[];
}>;

export type AdvertisingProfitabilityProviderRow = Readonly<{
  businessDate: string;
  externalOptionId: string;
  adSpend: number;
  impressions: number;
  clicks: number;
  orders: number;
  conversions: number;
  adRevenue: number;
}>;

export type AdvertisingProfitabilitySourceView = Readonly<{
  latestAttempt: {
    attemptId: string;
    state: "RUNNING" | "COMPLETE" | "FAILED";
    expiresAt: string;
    errorCode: string | null;
  } | null;
  latestComplete: {
    sourceImportRunId: string;
    publicationSequence: string;
    mappingGeneration: string;
    coveredThrough: string;
    capturedAt: string;
  } | null;
  status: "READY" | "STALE" | "MISSING";
}>;

export type AttemptFence = Readonly<{
  organizationId: string;
  attemptId: string;
  attemptToken: string;
}>;

export interface ProfitabilityAdImportPort {
  beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
  }): Promise<AdvertisingProfitabilityPlan>;
  read(input: {
    organizationId: string;
    attemptId?: string;
  }): Promise<AdvertisingProfitabilitySourceView>;
  uploadSlice(
    input: AdvertisingProfitabilitySliceUpload,
  ): Promise<{ replayed: boolean }>;
  finalizeAttempt(
    input: AttemptFence,
  ): Promise<AdvertisingProfitabilitySourceView>;
  failAttempt(
    input: AttemptFence & {
      code: string;
      message: string;
      actionable: boolean;
    },
  ): Promise<AdvertisingProfitabilitySourceView>;
}
```

- [ ] **Step 1: Write failing service and HTTP tests**

```ts
it("returns the same immutable server plan for a retried idempotency key", async () => {
  const first = await service.beginAttempt(begin("same-key"));
  await expect(service.beginAttempt(begin("same-key"))).resolves.toEqual(first);
});

it("derives organization scope and never accepts an account plan from the request body", async () => {
  await controller.begin(organizationId, "same-key");
  expect(service.beginAttempt).toHaveBeenCalledWith({
    organizationId,
    idempotencyKey: "same-key",
  });
});
```

- [ ] **Step 2: Run the focused tests and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/advertising/application/service/__tests__/profitability-ad-import.service.spec.ts src/advertising/adapter/in/http/__tests__/profitability-ad-import.controller.spec.ts`

Expected: FAIL because the direct import types and controller do not exist.

- [ ] **Step 3: Implement the owner service and routes**

Expose:

```text
POST /api/ads/profitability-imports
GET  /api/ads/profitability-imports/current
GET  /api/ads/profitability-imports/:attemptId
PUT  /api/ads/profitability-imports/:attemptId/slices/:sliceId
POST /api/ads/profitability-imports/:attemptId/complete
POST /api/ads/profitability-imports/:attemptId/fail
```

Begin reads active Coupang accounts, expected advertiser identities, the last 12 closed KST months plus required correction slices, current mapping generation, and the fixed ad policy hash. Upload and terminal calls require the normal organization guard plus `x-source-attempt-token`.

- [ ] **Step 4: Run service/controller tests**

Run: `npm exec --workspace=apps/server vitest -- run src/advertising/application/service/__tests__/profitability-ad-import.service.spec.ts src/advertising/adapter/in/http/__tests__/profitability-ad-import.controller.spec.ts`

Expected: PASS for idempotency, plan authority, token expiry, organization scope, and bounded error responses.

- [ ] **Step 5: Commit the incoming owner seam**

```bash
git add apps/server/src/advertising/application/port/in/profitability-ad-import.port.ts apps/server/src/advertising/application/port/out/repository/profitability-ad-import.repository.port.ts apps/server/src/advertising/application/service/profitability-ad-import.service.ts apps/server/src/advertising/application/service/__tests__/profitability-ad-import.service.spec.ts apps/server/src/advertising/adapter/in/http/profitability-ad-import.controller.ts apps/server/src/advertising/adapter/in/http/__tests__/profitability-ad-import.controller.spec.ts apps/server/src/advertising/application/port/in/profitability-ad-refresh.port.ts apps/server/src/advertising/application/port/out/repository/profitability-ad-refresh.repository.port.ts apps/server/src/advertising/application/service/__tests__/profitability-ad-refresh.service.spec.ts apps/server/src/advertising/application/service/profitability-ad-refresh.service.ts apps/server/src/advertising/adapter/in/http/__tests__/profitability-ad-refresh.controller.spec.ts apps/server/src/advertising/adapter/in/http/profitability-ad-refresh.controller.ts
git commit -m "refactor: define advertising import owner"
```

### Task 2: Persist And Promote The Full Advertising Generation

**Files:**

- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/channels.prisma`
- Create: `apps/server/src/advertising/adapter/out/repository/profitability-ad-import.repository.adapter.ts`
- Create: `apps/server/src/advertising/adapter/out/repository/__tests__/profitability-ad-import.repository.adapter.spec.ts`
- Create: `apps/server/src/advertising/__tests__/profitability-ad-import.repository.pg.integration.spec.ts`
- Delete: `apps/server/src/advertising/adapter/out/repository/profitability-ad-refresh.repository.adapter.ts`
- Delete: `apps/server/src/advertising/adapter/out/repository/__tests__/profitability-ad-refresh.repository.adapter.spec.ts`

**Interfaces:**

- Consumes: `ProfitabilityAdImportRepositoryPort` commands and `SourceFailureAlerts` from the preceding plan.
- Produces: immutable slice receipts, staged provider facts, frozen monthly product allocation facts, a completed manifest, and latest-complete exact-generation reads.

- [ ] **Step 1: Write failing PostgreSQL publication tests**

```ts
it("does not expose a generation until every planned account and slice is complete", async () => {
  const attempt = await beginTwoAccountAttempt();
  await uploadAllButLastSlice(attempt);
  await expect(finalize(attempt)).rejects.toThrow(
    "ADVERTISING_IMPORT_INCOMPLETE",
  );
  expect(await readCurrentGeneration()).toBe(previousGenerationId);
});

it("promotes once, conserves listing-day KRW, and replays the same receipt as a no-op", async () => {
  const attempt = await beginTwoAccountAttempt();
  const first = await uploadAllSlices(attempt);
  const replay = await uploadSlice(first.receipt);
  expect(replay).toEqual({ replayed: true });
  await finalize(attempt);
  expect(await sumAllocatedSpend(attempt.attemptId)).toBe(
    await sumProviderSpend(attempt.attemptId),
  );
});

it("rolls COMPLETE back when resolving the source Alert fails", async () => {
  await expect(finalizeWithAlertFailure()).rejects.toThrow();
  expect(await readAttemptState()).toBe("RUNNING");
  expect(await readCurrentGeneration()).toBe(previousGenerationId);
});
```

- [ ] **Step 2: Run the PG test and verify red**

Run: `npm run test:integration --workspace=apps/server -- src/advertising/__tests__/profitability-ad-import.repository.pg.integration.spec.ts`

Expected: FAIL because current slices publish independently through an Operation fence.

- [ ] **Step 3: Implement generation-tagged Advertising storage**

Use `SourceImportRun` with `sourceType='coupang_ad_profitability'` for the owner attempt/manifest. Add an organization-fenced `sourceImportRunId` to `ChannelAdTargetDailySnapshot`. Add `ChannelAdListingProductMonthlyFact` keyed by organization, source import, account, listing, master product, and month. Store frozen recipe weights and mapping generation in the manifest/allocated facts. Finalize verifies receipt count/checksums and performs only metadata/current-pointer/Alert writes; it does not rewrite staged facts.

- [ ] **Step 4: Implement exact allocation and zero proof**

For each account/listing/business-date, allocate integer KRW by positive recipe quantity. Apply floor first, then distribute remaining KRW by descending fractional remainder and ascending lowercase master-product UUID. `CONFIRMED_ZERO` requires the manifest's complete listing/date universe; absent rows without that proof are missing. `NOT_APPLIED` requires the fixed V1 applicability policy.

- [ ] **Step 5: Run repository tests**

```bash
npm exec --workspace=apps/server vitest -- run src/advertising/adapter/out/repository/__tests__/profitability-ad-import.repository.adapter.spec.ts
npm run test:integration --workspace=apps/server -- src/advertising/__tests__/profitability-ad-import.repository.pg.integration.spec.ts
```

Expected: PASS for two accounts, partial failure fallback, frozen mapping, replay conflict, zero proof, exact KRW conservation, organization isolation, and Alert rollback.

- [ ] **Step 6: Commit the Advertising generation**

```bash
git add prisma/models/core.prisma prisma/models/channels.prisma apps/server/src/advertising/adapter/out/repository/profitability-ad-import.repository.adapter.ts apps/server/src/advertising/adapter/out/repository/__tests__/profitability-ad-import.repository.adapter.spec.ts apps/server/src/advertising/__tests__/profitability-ad-import.repository.pg.integration.spec.ts apps/server/src/advertising/adapter/out/repository/profitability-ad-refresh.repository.adapter.ts apps/server/src/advertising/adapter/out/repository/__tests__/profitability-ad-refresh.repository.adapter.spec.ts
git commit -m "feat: publish complete advertising generations"
```

### Task 3: Move The Extension To Direct Multi-Account Upload

**Files:**

- Create: `extensions/kiditem-os/background/coupang/profitability-source-owner.js`
- Create: `extensions/tests/coupang-ads-scraper/profitability-source-owner.test.mjs`
- Modify: `extensions/kiditem-os/background/coupang/collection-window.js`
- Modify: `extensions/kiditem-os/background/coupang/worker.js`
- Modify: `extensions/kiditem-os/content/coupang/profitability-report.js`
- Modify: `extensions/kiditem-os/background/domain-registry.js`
- Modify: `extensions/tests/coupang-ads-scraper/collection-window.test.mjs`
- Modify: `extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs`
- Modify: `extensions/tests/coupang-ads-scraper/wing-account-identity.test.mjs`
- Delete: `extensions/kiditem-os/background/coupang/profitability-operation-checkpoint.js`
- Delete: `extensions/tests/coupang-ads-scraper/profitability-operation-checkpoint.test.mjs`

**Interfaces:**

- Consumes: `AdvertisingProfitabilityPlan` and the minimal collection-session contract.
- Produces: deterministic account switching, provider identity verification, direct receipt upload, complete/fail owner calls, and local progress only.

- [ ] **Step 1: Write failing extension tests**

```js
test("visits every server-planned account and slice before completing", async () => {
  await executeProfitabilityPlan(twoAccountPlan);
  assert.deepEqual(visitedAccounts, ["account-a", "account-b"]);
  assert.equal(uploadedReceipts.length, expectedSliceCount);
  assert.equal(completeCalls.length, 1);
});

test("fails the owner attempt after an advertiser mismatch and does not complete", async () => {
  await executeProfitabilityPlan(plan, { visibleAdvertiserId: "wrong" });
  assert.equal(failCalls[0].code, "ADVERTISER_IDENTITY_MISMATCH");
  assert.equal(completeCalls.length, 0);
});
```

- [ ] **Step 2: Run extension tests and verify red**

```bash
node --test extensions/tests/coupang-ads-scraper/profitability-source-owner.test.mjs extensions/tests/coupang-ads-scraper/collection-window.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs extensions/tests/coupang-ads-scraper/wing-account-identity.test.mjs
```

Expected: FAIL because current execution polls an Operation checkpoint and carries one run/attempt token rather than an owner plan.

- [ ] **Step 3: Implement direct plan execution**

Persist `attemptId`, token, current account index, and slice index in extension-local session metadata. Before each slice, switch to the planned account and read the visible advertiser identity. Upload the provider report directly with the owner token. Extension restart resumes the same nonterminal owner attempt; a terminal user retry always begins a new one.

- [ ] **Step 4: Run extension tests**

```bash
node --test extensions/tests/coupang-ads-scraper/profitability-source-owner.test.mjs extensions/tests/coupang-ads-scraper/profitability-report.test.mjs extensions/tests/coupang-ads-scraper/collection-window.test.mjs extensions/tests/coupang-ads-scraper/collection-window-tab-close.regression-1.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs extensions/tests/coupang-ads-scraper/wing-account-identity.test.mjs
```

Expected: PASS, including page closure, service-worker restart, two accounts, identity mismatch, and transport retry.

- [ ] **Step 5: Commit the extension direct path**

```bash
git add extensions/kiditem-os/background/coupang/profitability-source-owner.js extensions/tests/coupang-ads-scraper/profitability-source-owner.test.mjs extensions/kiditem-os/background/coupang/collection-window.js extensions/kiditem-os/background/coupang/worker.js extensions/kiditem-os/content/coupang/profitability-report.js extensions/kiditem-os/background/domain-registry.js extensions/tests/coupang-ads-scraper/collection-window.test.mjs extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs extensions/tests/coupang-ads-scraper/wing-account-identity.test.mjs extensions/kiditem-os/background/coupang/profitability-operation-checkpoint.js extensions/tests/coupang-ads-scraper/profitability-operation-checkpoint.test.mjs
git commit -m "refactor: upload advertising facts to the owner"
```

### Task 4: Remove The Advertising Operation Path

**Files:**

- Modify: `apps/server/src/advertising/advertising.module.ts`
- Modify: `apps/server/src/advertising/__tests__/advertising.module.wiring.spec.ts`
- Modify: `apps/server/src/advertising/advertising-profitability-read.module.ts`
- Modify: `apps/server/src/advertising/advertising-profitability-read.module.spec.ts`
- Delete: `apps/server/src/advertising/adapter/in/operation/advertising-profitability.operation-handler.ts`
- Modify: `apps/server/src/advertising/domain/operation/advertising.operations.ts`
- Modify: `apps/server/src/advertising/domain/operation/__tests__/advertising.operations.spec.ts`

**Interfaces:**

- Consumes: the completed direct owner implementation.
- Produces: Advertising module wiring with no Products or Operations import and an exact-generation read capability for Finance.

- [ ] **Step 1: Write the failing module-boundary assertion**

```ts
it("wires profitability import without Products or Operations", () => {
  expect(moduleImports(AdvertisingModule)).not.toContain("OperationsModule");
  expect(moduleImports(AdvertisingModule)).not.toContain("ProductsModule");
  expect(moduleProviders(AdvertisingModule)).not.toContain(
    "AdvertisingProfitabilityOperationHandler",
  );
});
```

- [ ] **Step 2: Run the module test and verify red**

Run: `npm exec --workspace=apps/server vitest -- run src/advertising/__tests__/advertising.module.wiring.spec.ts src/advertising/advertising-profitability-read.module.spec.ts`

Expected: FAIL on the current module imports and handler.

- [ ] **Step 3: Replace module wiring and delete the handler**

Register the new controller/service/repository and `SourceFailureAlerts`. Export only the exact-generation profitability read port required by Finance. Remove the profitability operation definition while leaving unrelated operation definitions for the final global deletion plan.

- [ ] **Step 4: Run Advertising focused tests and the cutover scanner**

```bash
npm exec --workspace=apps/server vitest -- run src/advertising/__tests__/advertising.module.wiring.spec.ts src/advertising/advertising-profitability-read.module.spec.ts
npm run check:operation-automation-cutover
```

Expected: Advertising profitability references are gone from the scanner; remaining failures belong only to later legacy groups.

- [ ] **Step 5: Commit Advertising composition**

```bash
git add apps/server/src/advertising/advertising.module.ts apps/server/src/advertising/__tests__/advertising.module.wiring.spec.ts apps/server/src/advertising/advertising-profitability-read.module.ts apps/server/src/advertising/advertising-profitability-read.module.spec.ts apps/server/src/advertising/adapter/in/operation/advertising-profitability.operation-handler.ts apps/server/src/advertising/domain/operation/advertising.operations.ts apps/server/src/advertising/domain/operation/__tests__/advertising.operations.spec.ts
git commit -m "refactor: remove advertising profitability operation"
```
