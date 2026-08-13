# Sourcing Long-Running Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for each behavior change and superpowers:verification-before-completion before every handoff.

**Goal:** Move every long-running sourcing collection or derived-snapshot action onto the existing `OperationRun` control plane, isolate scarce providers by resource class, and make all 14 sourcing routes snapshot-first with bounded reads and truthful progress/outcomes.

**Architecture:** Operations remains the single server execution ledger. Server handlers run in bounded resource-class slots with fenced lease renewal, cancellation signals, and deadlines. KidItem OS claims browser operations, uses `OperationRun.id` as its local collection-session ID, ingests canonical rows through attempt-token-fenced owner APIs, and reports only a safe summary. React renders the latest completed owner snapshot separately from the active run and never owns a provider loop or starts collection on mount.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, Zod 3, React 19/Next.js, TanStack Query, Chrome Manifest V3, Vitest, Node test, Playwright-backed 1688 adapters

---

## Plan status and execution protocol

- Root issue: KID-24
- Design authority:
  `docs/superpowers/specs/2026-08-13-sourcing-long-running-operations-design.md`
- PR base: `develop`
- Integration branch: `codex/kid-24-sourcing-operation-run`
- Plan sharing: `docs/superpowers/plans/` is no longer ignored; this plan is
  versioned with the design and implementation
- Change class: Operations platform reconstruction with declared Sourcing,
  Advertising, Web, Shared, Prisma, and Extension consumers
- Data/backfill: additive Operation columns with database defaults; no sourcing
  or tracking data rewrite
- Release: compatible schema change in the open release train; no `VERSION`
  bump and no data migration

KID-24 is the single implementation issue. The accountable human explicitly
approved one large integration PR on 2026-08-13. Implement every numbered task
on the same branch and keep each task as a reviewer-readable commit/checkpoint;
do not create child implementation issues or stacked PRs. Open one draft PR to
`develop` after Task 2, keep the design and plan in that PR, and squash the PR
when it is finally merged. Record shared-state checkpoints on KID-24 after each
of the five phases, not after every local commit.

The tasks map to the five design phases:

| Phase | Tasks |
|---|---|
| Execution safety and observability | 1-2 |
| Deadline and snapshot-first reads | 3-4 |
| Browser operation pilot | 5-6 |
| Long-flow migration | 7-10 |
| Legacy removal and performance gates | 11 |

Before editing any task, re-run `rtk rg --files -g AGENTS.md` and read the
root-to-target instruction chain. The file lists below are the intended scope;
if implementation requires a new domain or more than the stated boundaries,
update KID-24 and this plan before continuing.

## Root-cause coverage

The program is not limited to loading copy on the 14 routes. The structural
findings that triggered KID-24 map to implementation tasks as follows:

| Root cause | Owning tasks |
|---|---|
| Four incompatible execution paths (`OperationRun`, direct extension, synchronous HTTP, React loop) | 5-10 |
| Wholesale mount effects launching queued 1688 work after navigation | 4 and 9 |
| Extension run IDs that still wait up to 90 seconds for the final response | 5-8 |
| Process-wide single `busy` worker and unfiltered claim | 1-2 |
| Sequential trend sources, Naver chunks, and 1688 seeds | 9-10 |
| Missing GET deadline and incomplete abort propagation | 2-3 and 5 |
| Rising read/compute/write in a user request | 10 |
| Per-product tracking-history N+1 | 4 |
| Success, partial, duplicate, no-change, and failure displayed as one completion state | 3-10 |
| Stale errors and older runs overwriting later UI state | 3 and every migrated consumer |

## Fixed contracts used by every task

### Operation definition and result

```ts
export type OperationResourceClass =
  | 'default'
  | 'naver_api'
  | 'extension_coupang'
  | 'playwright_1688'
  | 'snapshot_compute';

export interface OperationDefinition {
  key: string;
  version: number;
  title: string;
  ownerDomain: string;
  engineType: OperationEngineType;
  allowedTriggers: readonly OperationTriggerSource[];
  scheduleSupported: boolean;
  maxAttempts: number;
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
  inputSchema: z.ZodType<Record<string, unknown>>;
}

export type SourcingOperationOutcome = 'complete' | 'partial' | 'no_change';
```

Do not add `partial` or `no_change` to `OperationStatus`. A partial/no-change
run is `succeeded` with a parsed safe result outcome.

### Operation keys

```text
sourcing.collect_daily_trends
sourcing.collect_naver_trends
sourcing.collect_1688_trends
sourcing.collect_shorts_trends
sourcing.collect_wing_catalog_batch
advertising.refresh_tracked_wing_products
sourcing.collect_keyword_suggestions
advertising.collect_competitor_catalog
sourcing.search_1688_keyword_batch
sourcing.match_wholesale_images
sourcing.detect_rising_products
```

Exact keys are code-owned and registered once. Do not create per-page aliases
for market, recommendation, and validation when the purpose enum can select the
same canonical Wing batch.

### Resource limits

```json
{
  "default": 2,
  "naver_api": 2,
  "extension_coupang": 4,
  "playwright_1688": 1,
  "snapshot_compute": 2
}
```

These are worker dispatch limits. KidItem OS additionally keeps one active
browser claim per `local` or `office` environment.

## Task 1: Persist resource, deadline, stage, and count contracts

**Phase:** Execution safety and observability

**Files:**

- Modify: `packages/shared/src/schemas/operations.ts`
- Modify: `packages/shared/src/schemas/operations.spec.ts`
- Modify: `apps/server/src/common/operation-definition.ts`
- Modify: `prisma/models/system.prisma`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/operations/application/service/operation-run.service.ts`
- Modify: `apps/server/src/operations/application/service/browser-operation-runtime.service.ts`
- Modify: `apps/server/src/operations/adapter/in/http/operations.controller.ts`
- Modify: `apps/server/src/advertising/domain/operation/advertising.operations.ts`
- Modify: `apps/server/src/channels/domain/operation/channels.operations.ts`
- Modify: `apps/server/src/inventory/domain/operation/inventory.operations.ts`
- Modify: `apps/server/src/orders/domain/operation/orders.operations.ts`
- Modify: `apps/server/src/products/domain/operation/product-profitability.operations.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts`
- Regenerate: `docs/ERD.md`, `docs/erd/**`

- [ ] **Step 1: Write failing shared-schema tests**

Add tests that parse a complete run and reject inconsistent count/stage data:

```ts
it('requires stage-safe progress counts without changing status vocabulary', () => {
  expect(OperationStatusSchema.options).not.toContain('partial');
  expect(OperationRunSchema.parse({
    ...validRun,
    resourceClass: 'playwright_1688',
    stage: 'collecting_keyword',
    stageUpdatedAt: '2026-08-13T01:02:03.000Z',
    progressCurrent: 11,
    progressTotal: 12,
    deadlineAt: '2026-08-13T01:17:03.000Z',
  }).progressCurrent).toBe(11);

  expect(() => OperationRunSchema.parse({
    ...validRun,
    resourceClass: 'unknown',
  })).toThrow();
  expect(() => OperationRunSchema.parse({
    ...validRun,
    progressCurrent: 13,
    progressTotal: 12,
  })).toThrow();
});
```

- [ ] **Step 2: Confirm the contract test fails**

Run:

```bash
rtk npm exec vitest -- run packages/shared/src/schemas/operations.spec.ts
```

Expected: FAIL because the new fields and resource enum do not exist.

- [ ] **Step 3: Add the shared schemas and types**

Add `OperationResourceClassSchema`, `OperationStageSchema`, and a shared
refinement requiring progress counters as a pair. Extend catalog, run, browser
claim, heartbeat, and report schemas. The claim includes `deadlineAt`;
heartbeat/report accept stage and counts. Safe-result validation remains
unchanged.

```ts
export const OperationResourceClassSchema = z.enum([
  'default',
  'naver_api',
  'extension_coupang',
  'playwright_1688',
  'snapshot_compute',
]);

export const OperationStageSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,79}$/);
```

- [ ] **Step 4: Add additive Prisma columns and indexes**

Use string fields, not a native enum:

```prisma
resourceClass      String    @default("default") @map("resource_class")
executionTimeoutMs Int       @default(900000) @map("execution_timeout_ms")
stage              String?
stageUpdatedAt     DateTime? @map("stage_updated_at") @db.Timestamptz
progressCurrent    Int?      @map("progress_current")
progressTotal      Int?      @map("progress_total")
deadlineAt         DateTime? @map("deadline_at") @db.Timestamptz

@@index([resourceClass, status, scheduledFor])
@@index([resourceClass, status, leaseExpiresAt])
```

Do not add CHECK constraints or a data migration. Existing rows receive the
database defaults; nullable progress metadata needs no backfill.

- [ ] **Step 5: Copy resolved definition policy into every new run**

Make both definition fields required. Update every registered definition and
all test fixtures. `OperationRunService.start()` passes them to `createRun`,
and `toWire()` returns the persisted values. Catalog mapping returns definition
values, not defaults reconstructed in the controller.

- [ ] **Step 6: Map stage updates safely in the repository**

Extend `OperationRunTransition` with stage/count/deadline fields. When the stage
value changes, set `stageUpdatedAt`; when only a heartbeat repeats the same
stage, preserve the earlier stage timestamp. Derive normalized progress when
both counters are present.

- [ ] **Step 7: Run schema and focused Operations verification**

```bash
rtk npm exec vitest -- run packages/shared/src/schemas/operations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-run.service.spec.ts src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts src/operations/adapter/in/http/__tests__/operations.controller.spec.ts
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
```

Expected: PASS; Prisma reports only additive columns/indexes.

- [ ] **Step 8: Commit**

```bash
rtk git add packages/shared/src/schemas/operations.ts packages/shared/src/schemas/operations.spec.ts apps/server/src/common/operation-definition.ts apps/server/src/operations apps/server/src/advertising/domain/operation/advertising.operations.ts apps/server/src/channels/domain/operation/channels.operations.ts apps/server/src/inventory/domain/operation/inventory.operations.ts apps/server/src/orders/domain/operation/orders.operations.ts apps/server/src/products/domain/operation/product-profitability.operations.ts apps/server/src/sourcing/domain/operation/sourcing.operations.ts prisma/models/system.prisma docs/ERD.md docs/erd
rtk git commit -m "feat(operations): persist execution resource metadata"
```

## Task 2: Replace the global worker lock with fenced resource-class execution

**Phase:** Execution safety and observability

**Depends on:** Task 1 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/operations/application/service/operation-runtime.config.ts`
- Create: `apps/server/src/operations/application/service/operation-attempt-executor.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/operation-run-worker.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-run-worker.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/operation-dispatcher.service.ts`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/common/operation-definition.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run.service.spec.ts`

- [ ] **Step 1: Write worker isolation and fence-loss tests**

Use deferred promises to prove the worker dispatches another class while 1688
is still running and never exceeds the configured class capacity:

```ts
it('does not let a blocked playwright run stop naver work', async () => {
  repository.claimNextRun
    .mockResolvedValueOnce(playwrightRun)
    .mockResolvedValueOnce(naverRun)
    .mockResolvedValue(null);
  dispatcher.dispatch.mockImplementation(async (run) => {
    if (run.id === playwrightRun.id) await playwrightGate.promise;
  });

  await worker.tick();
  expect(dispatcher.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ id: naverRun.id }),
    expect.any(Object),
  );
});
```

Add executor tests that a failed `heartbeatRun` aborts the signal and prevents a
success transition, and that the definition deadline produces
`operation_deadline_exceeded`.

- [ ] **Step 2: Confirm the tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-run-worker.service.spec.ts src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts
```

Expected: FAIL because the worker has one `busy` flag and no attempt executor.

- [ ] **Step 3: Parse class limits strictly**

`resolveOperationResourceClassLimits()` returns a complete record. Parse
`OPERATION_RESOURCE_CLASS_LIMITS` with the shared enum, require safe positive
integers, and throw at startup on malformed JSON or unknown keys. Do not fall
back silently when the variable is present but invalid.

- [ ] **Step 4: Add filtered claim and fenced heartbeat methods**

Change the repository port to:

```ts
claimNextRun(input: {
  resourceClass: OperationResourceClass;
  workerId: string;
  now: Date;
  leaseExpiresAt: Date;
}): Promise<OperationRunRecord | null>;

heartbeatRun(input: {
  organizationId: string;
  runId: string;
  attemptToken: string;
  now: Date;
  leaseExpiresAt: Date;
  stage?: string | null;
  progressCurrent?: number | null;
  progressTotal?: number | null;
}): Promise<OperationRunRecord | null>;

expirePastDeadlineRuns(input: {
  now: Date;
  limit: number;
}): Promise<number>;
```

Filter the raw claim query with a bound `${input.resourceClass}` value. Select
`execution_timeout_ms`; on first claim set `deadline_at`, and preserve it on
retry. All updates remain composite organization-scoped and attempt-token
fenced. The deadline sweep transitions only active, past-deadline rows to
`failed/operation_deadline_exceeded`; a running attempt loses its token so its
next heartbeat aborts.

- [ ] **Step 5: Add the attempt execution context**

Extend `OperationHandlerContext`:

```ts
signal: AbortSignal;
checkpoint(update?: {
  stage?: string;
  progressCurrent?: number;
  progressTotal?: number;
}): Promise<void>;
```

The executor owns the controller, lease-renew timer, and deadline timer. A
checkpoint and background heartbeat call the same repository fence. The
dispatcher receives this context instead of creating an unfenced long call.
If the signal is aborted, the dispatcher must not commit `completed`.

- [ ] **Step 6: Implement independent active slots**

Replace `busy` with `Map<OperationResourceClass, Set<Promise<void>>>`. A tick
loops resource classes, claims until each free-slot count is filled, starts the
attempt promise, and removes it in `finally`. Do not await the long dispatch
inside the claim loop. Keep composite reconciliation under a separate boolean
so it cannot block class claims. Run the bounded deadline sweep before new
claims so queued, waiting-runtime, and running work cannot remain active past
its copied deadline.

- [ ] **Step 7: Propagate cancellation into provider calls**

Update the existing trend handler as the first signal consumer and pass
`context.signal` through the trend input port. Add `signal.throwIfAborted()` at
batch boundaries. Other handlers may ignore the signal only if their work is
already short; every new long handler in later tasks must consume it.

- [ ] **Step 8: Verify worker safety and server boot**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-run-worker.service.spec.ts src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: tests and build pass; terminate the dev server only after the Nest
application reports a successful boot.

- [ ] **Step 9: Commit**

```bash
rtk git add apps/server/src/common/operation-definition.ts apps/server/src/operations apps/server/src/sourcing
rtk git commit -m "feat(operations): isolate and fence runtime lanes"
```

## Task 3: Add bounded API reads and a reusable sourcing run panel

**Phase:** Deadline and snapshot-first reads

**Depends on:** Task 1 committed and verified on the integration branch

**Files:**

- Create: `apps/web/src/lib/request-deadline.ts`
- Create: `apps/web/src/lib/__tests__/request-deadline.spec.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/lib/__tests__/api-client.spec.ts`
- Modify: `apps/web/src/lib/operations-api.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/hooks/useOperationRun.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks/use-sourcing-operation-action.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks/use-sourcing-operation-action.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.spec.tsx`

- [ ] **Step 1: Write failing abort/deadline cleanup tests**

Use fake timers and a fetch promise that never settles:

```ts
it('turns a GET deadline into request_timeout and clears the timer', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(
      new DOMException('Aborted', 'AbortError'),
    ));
  })));

  const pending = apiClient.get('/api/slow', { timeoutMs: 10 });
  await vi.advanceTimersByTimeAsync(10);
  await expect(pending).rejects.toMatchObject({ code: 'request_timeout' });
  expect(vi.getTimerCount()).toBe(0);
});
```

Add a separate test that caller abort remains an `AbortError` and is not wrapped
as `request_timeout`.

- [ ] **Step 2: Confirm the deadline tests fail**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/api-client.spec.ts src/lib/__tests__/request-deadline.spec.ts
```

Expected: FAIL because GET accepts no options and no deadline exists.

- [ ] **Step 3: Implement a composed request signal**

Create a helper that returns `{ signal, didTimeout, cleanup }`. It forwards a
caller abort, owns one timer when `timeoutMs` is finite, and removes listeners in
`cleanup()`. Call cleanup in `fetchApi` `finally`, including HTTP errors.

Expose one shared option type:

```ts
export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number | null;
  suppressNetworkErrorLog?: boolean;
}
```

GET, `getNullable`, and `getParsed` default to 15 seconds. Preserve empty-body
semantics. POST/PUT/PATCH/DELETE change only when a caller passes options.
`operationsApi.start()` passes 10 seconds.

- [ ] **Step 4: Add the route-local sourcing operation hook**

The hook accepts `operationKey`, input, snapshot invalidation key, and optional
idempotency key. It owns only the latest run ID, uses existing shared Operations
hooks, invalidates the snapshot after a successful terminal run, and ignores
terminal notifications from an older run ID.

- [ ] **Step 5: Add the reusable run panel**

Render localized stage labels, elapsed time, `current/total`, cancel, attention
retry, and the three succeeded outcomes. Parse the result before rendering;
invalid result shape shows a bounded generic completion message and logs a
schema error. Keep stale snapshot content outside this panel.

- [ ] **Step 6: Verify and build**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/api-client.spec.ts src/lib/__tests__/request-deadline.spec.ts src/app/\(sourcing-ai\)/sourcing-ai/hooks/use-sourcing-operation-action.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SourcingOperationRunPanel.spec.tsx
rtk npm run build --workspace=apps/web
```

- [ ] **Step 7: Commit**

```bash
rtk git add apps/web/src/lib apps/web/src/hooks/useOperationRun.ts 'apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.tsx' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingOperationRunPanel.spec.tsx'
rtk git commit -m "feat(web): bound sourcing reads and run feedback"
```

## Task 4: Remove route-entry fan-out and collection side effects

**Phase:** Deadline and snapshot-first reads

**Depends on:** Task 3 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/advertising/adapter/in/http/wing-tracked-product.controller.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/dto/wing-tracked-product.dto.ts`
- Modify: `apps/server/src/advertising/application/service/wing-tracked-product.service.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/wing-tracked-product.repository.port.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/wing-tracked-product.repository.adapter.ts`
- Create: `apps/server/src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/wing-tracking-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleKeywordSearch.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCoupangMatches.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx`

- [ ] **Step 1: Write failing bulk-history service and UI tests**

The service test requires one repository call for all tracked IDs and filters by
the authenticated organization. The page test renders 24 products and asserts
one request to `/history?days=30`, with no `/:id/history` calls.

Add wholesale tests that rendering the page does not call keyword/image search,
and that 24 failed image matches produce a failure summary rather than
`수집 완료 24개`.

- [ ] **Step 2: Confirm the tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx
```

- [ ] **Step 3: Add the organization-scoped bulk history endpoint**

Declare this static route before parameterized routes:

```ts
@Get('history')
historyBulk(
  @Query() query: WingTrackedHistoryQueryDto,
  @CurrentOrganization() organizationId: string,
) {
  return this.service.getBulkHistory(query.days ?? 30, organizationId);
}
```

The repository performs one bounded query ordered by tracked product and
business date. The service returns `{ items: WingTrackedHistory[] }`; it never
accepts organization or product IDs from the client body.

- [ ] **Step 4: Replace `useQueries` with one query**

Add `fetchWingTrackedHistories(days)`, one query key containing `days`, and a
map by `trackedProductId`. Preserve individual history API support for other
drill-down consumers.

- [ ] **Step 5: Remove mount-triggered collection**

Delete the keyword auto-search effect and image scheduling effect. Keep status
capability checks as reads. Operators use explicit `상위 6개 검색` and
`전체 수집` buttons. Count success and failure separately; all-failed renders a
failure state, mixed results render partial, and zero changed renders no-change.
This task does not yet replace the button's synchronous API; Task 9 does.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx
rtk npm run build --workspace=apps/web
rtk npm run build --workspace=apps/server
rtk git add apps/server/src/advertising 'apps/web/src/app/(sourcing-ai)/sourcing-ai'
rtk git commit -m "perf(sourcing): remove route-entry collection fan-out"
```

## Task 5: Add immediate KidItem OS runtime wake and fenced browser abort

**Phase:** Browser operation pilot

**Depends on:** Tasks 1-3 committed and verified on the integration branch

**Files:**

- Modify: `extensions/kiditem-os/background/operation-runtime-client.js`
- Modify: `extensions/kiditem-os/background/external-dispatch.js`
- Modify: `extensions/kiditem-os/background/service-worker.js`
- Modify: `extensions/kiditem-os/background/coupang/collection-runs.js`
- Modify: `extensions/tests/operation-runtime-client.test.mjs`
- Create: `extensions/tests/operation-runtime-wake.test.mjs`
- Modify: `extensions/tests/kiditem-os-service-worker-boot.test.mjs`
- Modify: `apps/web/src/lib/extension-bridge.ts`
- Modify: `apps/web/src/lib/__tests__/extension-bridge.spec.ts`

- [ ] **Step 1: Write failing immediate-ack and heartbeat-fence tests**

The extension test sends `wakeOperationRuntime`, asserts synchronous response
`{ success: true, accepted: true }`, then observes a claim call on the next
microtask. A second test makes heartbeat return 409, asserts the handler's
signal is aborted, its managed session is cancelled, and no success report is
sent.

- [ ] **Step 2: Confirm the extension tests fail**

```bash
rtk node --test extensions/tests/operation-runtime-client.test.mjs extensions/tests/operation-runtime-wake.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/extension-bridge.spec.ts
```

- [ ] **Step 3: Retain and expose the runtime instance**

Wire the service worker as:

```js
const browserOperationRuntime = KidItemOperationRuntimeClient.create({
  chrome,
  environmentContext: browserOperationRuntimeEnvironmentContext,
  domains: KidItemDomains,
});
KidItemExternalDispatch.create({
  chrome,
  environmentContext: sharedEnvironmentContext,
  sessions: collectionSessions,
  domains: KidItemDomains,
  operationRuntime: browserOperationRuntime,
}).install();
browserOperationRuntime.install();
```

Return `wake: resumeOrTick` from the runtime. External dispatch validates the
sender environment, responds immediately, and calls `void wake(environmentId)`.
It never accepts an operation key or payload from the web message.

- [ ] **Step 4: Abort on a lost browser fence**

Give each claim an `AbortController` and pass `signal`, `stage`, and count-aware
heartbeat to the exact handler. Start a local deadline timer from the claimed
`deadlineAt`. A heartbeat 409/fence loss or local deadline aborts the signal,
cancels the local collection session, closes its background-managed tab, and
does not send a stale terminal report. Network unavailability preserves the
existing checkpoint only while the server lease remains plausibly valid.

- [ ] **Step 5: Add the web nudge helper**

`wakeBrowserOperationRuntime()` detects the unified extension, sends only
`{ action: 'wakeOperationRuntime' }`, and uses a three-second timeout. Operation
start callers invoke it best-effort after receiving the server run. Failure to
nudge does not fail the durable run; the 30-second alarm is recovery.

- [ ] **Step 6: Verify and commit**

```bash
rtk node --test extensions/tests/operation-runtime-client.test.mjs extensions/tests/operation-runtime-wake.test.mjs
rtk node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
rtk node --check extensions/kiditem-os/background/operation-runtime-client.js
rtk node --check extensions/kiditem-os/background/external-dispatch.js
rtk node --check extensions/kiditem-os/background/service-worker.js
rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/extension-bridge.spec.ts
rtk git add extensions apps/web/src/lib/extension-bridge.ts apps/web/src/lib/__tests__/extension-bridge.spec.ts
rtk git commit -m "feat(extension): wake and fence browser operations"
```

## Task 6: Migrate Wing catalog as the browser-operation pilot

**Phase:** Browser operation pilot

**Depends on:** Task 5 committed and verified on the integration branch

**Files:**

- Create: `packages/shared/src/sourcing/browser-operations.ts`
- Create: `packages/shared/src/sourcing/browser-operations.spec.ts`
- Modify: `packages/shared/src/sourcing/index.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/sourcing-browser.operation-handler.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-browser.operation-handler.spec.ts`
- Create: `apps/server/src/operations/application/port/in/operation-attempt-verifier.port.ts`
- Create: `apps/server/src/operations/application/service/operation-attempt-verifier.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-attempt-verifier.service.spec.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-wing-catalog-ingest.service.ts`
- Modify: `apps/server/src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `extensions/kiditem-os/background/coupang/worker.js`
- Modify: `extensions/tests/coupang-ads-scraper/wing-catalog-search-request.test.mjs`
- Create: `extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/components/WingCatalogPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/components/WingCatalogPage.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-api.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-api.spec.ts`

- [ ] **Step 1: Write failing input/result and attempt-verifier tests**

The batch input is strict and bounded:

```ts
const SourcingWingCatalogBatchInputSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
  maxPages: z.number().int().min(1).max(5),
  purpose: z.enum([
    'catalog_search',
    'market_analysis',
    'recommendation_validation',
    'tracked_metrics',
  ]),
}).strict();
```

The verifier test rejects wrong organization, operation key, status, and
attempt token. It returns a small active-attempt context only for the exact
running browser run.

- [ ] **Step 2: Confirm the focused tests fail**

```bash
rtk npm exec vitest -- run packages/shared/src/sourcing/browser-operations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-attempt-verifier.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-browser.operation-handler.spec.ts
```

- [ ] **Step 3: Register the pilot operation**

Use engine `browser`, resource `extension_coupang`, maximum three attempts, and
a 15-minute deadline. The server handler does no browser work; it returns
`waiting_runtime`. Export the Operations attempt verifier port so Sourcing can
validate extension ingest without importing the repository or Prisma.

- [ ] **Step 4: Add fenced ingest and snapshot reads**

Add exact two-segment routes under the existing controller:

```text
POST /api/sourcing/workspace/browser-operations/:runId/coupang-observations
POST /api/sourcing/workspace/browser-operations/:runId/finalize
GET  /api/sourcing/workspace/wing-catalog?keyword=...
```

The two POST routes require `X-Operation-Attempt-Token`, validate the exact
operation and purpose, and derive organization from `@CurrentOrganization()`.
Each keyword batch uses an idempotency key derived from `runId + normalized
keyword`. Ingest does not refresh recommendations per chunk; finalize refreshes
once when the purpose requires it. The GET returns parsed owner data, not the
Operation result or raw arbitrary JSON.

- [ ] **Step 5: Register the exact extension handler**

Add only this operation key to the Coupang domain registry. The handler starts
one local session using `runId`, reuses one managed Wing tab across keywords,
calls the existing catalog search primitive, posts each keyword batch with the
attempt token, reports count progress, calls finalize, then returns the safe
summary. Login/CAPTCHA returns `attention_required`; all failed units return a
failed outcome. Do not add a generic URL or generic action handler.

- [ ] **Step 6: Replace the Wing page's direct extension promise**

The CTA starts the operation, best-effort nudges KidItem OS, renders
`SourcingOperationRunPanel`, and reads persisted catalog rows. Remove component
use of `searchWingCatalogProducts`. Keep the legacy helper because later tasks
still have callers; do not delete it yet.

- [ ] **Step 7: Verify end to end**

```bash
rtk npm exec vitest -- run packages/shared/src/sourcing/browser-operations.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-attempt-verifier.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-browser.operation-handler.spec.ts src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts
rtk node --test extensions/tests/coupang-ads-scraper/wing-catalog-search-request.test.mjs extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/wing-catalog/components/WingCatalogPage.operation.spec.tsx
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
```

In Chrome, start a one-keyword search, navigate away, return, reload the page,
cancel a run, and exercise login attention. Record the run IDs and terminal
states in the KID-24 phase checkpoint without copying marketplace rows.

- [ ] **Step 8: Commit**

```bash
rtk git add packages/shared apps/server/src/operations apps/server/src/sourcing extensions 'apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog'
rtk git commit -m "feat(sourcing): pilot Wing catalog operations"
```

## Task 7: Move market, recommendations, validation, and tracking onto Wing batches

**Phase:** Long-flow migration

**Depends on:** Task 6 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/advertising/domain/operation/advertising.operations.ts`
- Create: `apps/server/src/advertising/adapter/in/operation/advertising-browser.operation-handler.ts`
- Create: `apps/server/src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts`
- Modify: `apps/server/src/advertising/advertising.module.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-wing-catalog-ingest.service.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/wing-tracked-product.controller.ts`
- Modify: `apps/server/src/advertising/application/service/wing-tracked-product.service.ts`
- Modify: `apps/server/src/advertising/application/port/out/repository/wing-tracked-product.repository.port.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/wing-tracked-product.repository.adapter.ts`
- Modify: `extensions/kiditem-os/background/coupang/worker.js`
- Modify: `extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochMarketAnalysisPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/recommendations/components/TodayRecommendationsPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochMarketAnalysisPage.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/recommendations/components/TodayRecommendationsPage.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.operation.spec.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx`

- [ ] **Step 1: Write tests that forbid client Wing loops**

For each page, mock `operationsApi.start`, render a 12-keyword input, click the
CTA, and assert exactly one operation start with the correct purpose and bounded
keywords. Assert no call to the legacy extension helper. Add a tracking test
that terminal completion invalidates both product and bulk-history keys.

- [ ] **Step 2: Write fenced Ads ingest tests**

Add:

```text
POST /api/ads/wing-tracked-products/browser-operations/:runId/snapshots
```

Test exact organization/run/token verification, idempotent product snapshot
upsert, and rejection of products outside the organization's enabled trackers.

- [ ] **Step 3: Confirm the tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/components/SellochMarketAnalysisPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/recommendations/components/TodayRecommendationsPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochValidationPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx
```

- [ ] **Step 4: Extend the purpose-specific finalization**

For market/recommendation/validation, persist every successful keyword through
Sourcing and refresh the appropriate deterministic read model once at finalize.
For tracked metrics, post only matched tracked products to the fenced Ads sink.
The extension reports per-keyword failures and never returns rows in the run
result.

- [ ] **Step 5: Replace all four React loops**

Delete `cancelRef`, `sleep(700)`, component progress counters, and sequential
`searchWingCatalogProducts` loops. Use the shared operation hook and run panel.
Snapshot data remains visible while a run is active or failed. Validation and
recommendation policy code remains unchanged.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts src/advertising/application/service/__tests__/wing-tracked-product.service.spec.ts src/sourcing/application/service/__tests__/sourcing-wing-catalog-ingest.service.spec.ts
rtk node --test extensions/tests/coupang-ads-scraper/wing-catalog-operation.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/components/SellochMarketAnalysisPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/recommendations/components/TodayRecommendationsPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/components/SellochValidationPage.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/product-tracking/components/ProductTrackingPage.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/sourcing apps/server/src/advertising extensions 'apps/web/src/app/(sourcing-ai)/sourcing-ai'
rtk git commit -m "feat(sourcing): migrate Wing batch consumers"
```

## Task 8: Migrate keyword suggestions and competitor collection

**Phase:** Long-flow migration

**Depends on:** Task 6 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/advertising/domain/operation/advertising.operations.ts`
- Modify: `apps/server/src/advertising/adapter/in/operation/advertising-browser.operation-handler.ts`
- Modify: `apps/server/src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-workspace.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-keyword-suggestion.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-keyword-suggestion.service.spec.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-keyword-suggestion.repository.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-keyword-suggestion.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-keyword-suggestion.repository.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/advertising-ingest.controller.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/dto/extension-sync.dto.ts`
- Modify: `apps/server/src/advertising/application/service/ad-sync.service.ts`
- Modify: `apps/server/src/advertising/application/service/keyword-rank-ingest.handler.ts`
- Modify: `apps/server/src/advertising/__tests__/keyword-rank-ingest.handler.spec.ts`
- Modify: `apps/server/src/advertising/adapter/in/http/__tests__/advertising.controller.spec.ts`
- Modify: `extensions/kiditem-os/background/coupang/worker.js`
- Create: `extensions/tests/coupang-ads-scraper/coupang-keyword-operation.test.mjs`
- Create: `extensions/tests/coupang-ads-scraper/competitor-collection-operation.test.mjs`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/components/KeywordAnalysisWorkbench.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/lib/coupang-keyword-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/hooks/useCompetitorProductTracking.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/components/KeywordAnalysisWorkbench.operation.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.operation.spec.tsx`

- [ ] **Step 1: Lock the two operation inputs with failing tests**

Keyword suggestions accept one normalized keyword and maximum 30 results.
Competitor collection accepts either the configured organization watchlist or
one validated seller ID, never a URL. Test trigger allowlists, exact resource
class `extension_coupang`, and 15-minute deadlines.

- [ ] **Step 2: Add owner sinks before changing the UI**

Persist keyword suggestions as controlled Sourcing evidence with source key
`coupang.keyword_suggestion`, exact schema version, and attempt-token fencing.
Read them through a typed snapshot endpoint. Competitor rows continue through
the existing Ads ingest; add operation attempt verification without copying
competitor ownership into Sourcing.

- [ ] **Step 3: Register exact extension handlers**

Wrap the existing keyword and competitor primitives. Reuse local sessions and
progress checkpoints. Do not keep the web response channel open, and do not
register generic marketplace actions.

- [ ] **Step 4: Replace the route-local start/status loops**

The keyword and competitor pages start Operations and read persisted owner
snapshots. Remove extension status polling from React. Capability detection may
remain for installation guidance, but canonical run status comes only from
Operations.

- [ ] **Step 5: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/application/service/__tests__/sourcing-keyword-suggestion.service.spec.ts src/sourcing/adapter/out/repository/__tests__/sourcing-keyword-suggestion.repository.adapter.spec.ts src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts src/advertising/adapter/in/operation/__tests__/advertising-browser.operation-handler.spec.ts src/advertising/__tests__/keyword-rank-ingest.handler.spec.ts src/advertising/adapter/in/http/__tests__/advertising.controller.spec.ts
rtk node --test extensions/tests/coupang-ads-scraper/coupang-keyword-operation.test.mjs extensions/tests/coupang-ads-scraper/competitor-collection-operation.test.mjs
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/keywords/components/KeywordAnalysisWorkbench.operation.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.operation.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/sourcing apps/server/src/advertising extensions 'apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis'
rtk git commit -m "feat(sourcing): migrate keyword and competitor collection"
```

## Task 9: Move 1688 keyword and image work out of HTTP requests

**Phase:** Long-flow migration

**Depends on:** Tasks 2-4 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/sourcing-1688.operation-handler.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-1688.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/application/port/out/provider/1688-keyword-search.port.ts`
- Modify: `apps/server/src/sourcing/application/port/out/provider/1688-image-search.port.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-image-search.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/out/1688/direct-1688-image-search.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-1688-keyword-search.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-1688-image-search.service.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-keyword-search.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-image-search.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-1688-search-result.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/index.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-search-result.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-1688-search-result.controller.spec.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-1688-search-result.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-1688-search-result.service.spec.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-1688-search-result.repository.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-1688-search-result.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-1688-search-result.repository.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-keyword-search-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-image-search-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleKeywordSearch.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCoupangMatches.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx`

- [ ] **Step 1: Write failing async-start and cancellation tests**

Controller tests assert POST no longer invokes Playwright services and instead
returns the created `OperationRun`. Handler tests assert
`resourceClass=playwright_1688`, pass `context.signal` to provider ports, update
count progress per target, and stop before the next target after cancellation.

- [ ] **Step 2: Add typed result reads**

Add a bounded read endpoint over the existing authorized typed observations,
keyed by normalized search keyword and optional target identity. It returns the
latest completed records and capture time; it does not read arbitrary raw
snapshot JSON. Image matching passes the existing `match.searchQuery`, so the
same normalized keyword can recover its result after navigation.

- [ ] **Step 3: Register the two server operations**

`sourcing.search_1688_keyword_batch` accepts at most six keywords and
`sourcing.match_wholesale_images` accepts at most 24 canonical target IDs plus
their owner-resolved image/search data. The handler resolves target data on the
server, uses the existing source allowlist/coordinator, and writes each target
before reporting progress. Never accept an arbitrary provider URL from an
operation body.

- [ ] **Step 4: Convert legacy POST routes into operation-start facades**

During one release, preserve the route paths but return `202 + OperationRun` so
deployed web code fails visibly rather than holding a synchronous request. The
new web uses `operationsApi` directly. Keep status GETs until the new UI has
shipped, then remove them in Task 11.

- [ ] **Step 5: Replace wholesale button calls**

The explicit buttons added in Task 4 start one bounded batch operation and read
typed persisted results. Cards no longer own one promise per target. Show
complete, partial, no-change, and all-failed semantics from the run result.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/adapter/in/operation/__tests__/sourcing-1688.operation-handler.spec.ts src/sourcing/application/service/__tests__/sourcing-1688-keyword-search.service.spec.ts src/sourcing/application/service/__tests__/sourcing-1688-image-search.service.spec.ts src/sourcing/application/service/__tests__/sourcing-1688-search-result.service.spec.ts src/sourcing/adapter/in/http/__tests__/sourcing-1688-search-result.controller.spec.ts src/sourcing/adapter/out/repository/__tests__/sourcing-1688-search-result.repository.adapter.spec.ts src/sourcing/adapter/out/1688/direct-1688-keyword-search.adapter.spec.ts src/sourcing/adapter/out/1688/direct-1688-image-search.adapter.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/components/SellochWholesaleCollection.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/sourcing 'apps/web/src/app/(sourcing-ai)/sourcing-ai'
rtk git commit -m "feat(sourcing): queue 1688 search batches"
```

## Task 10: Split trend sources by lane and queue rising-product computation

**Phase:** Long-flow migration

**Depends on:** Tasks 1-3 and Task 9 committed and verified on the integration branch

**Files:**

- Modify: `apps/server/src/common/operation-definition.ts`
- Modify: `apps/server/src/operations/application/port/in/composite-operation-coordinator.port.ts`
- Modify: `apps/server/src/operations/application/service/composite-operation-coordinator.service.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/operation-dispatcher.service.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/sourcing-trend.operation-handler.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/application/port/in/trend-collection.port.ts`
- Modify: `apps/server/src/sourcing/application/service/trend-collect.service.ts`
- Modify: `apps/server/src/sourcing/application/service/__tests__/trend-collect.service.spec.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/sourcing-rising-product.operation-handler.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-rising-product.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-rising-product.controller.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/lib/rising-products-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/components/RisingProductsPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/MarketIntelligencePage.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/components/RisingProductsPage.spec.tsx`

- [ ] **Step 1: Write failing multi-child composite tests**

Add a distinct result kind:

```ts
| { kind: 'waiting_dependencies'; children: StartChildOperation[] }
```

Require two to 20 unique child keys/idempotency keys. Tests prove the
coordinator creates all children, waits until all are terminal, requeues the
parent once for all-settled aggregation, propagates attention, and cancels every
active child. Preserve existing one-child behavior unchanged.

- [ ] **Step 2: Confirm the composite tests fail**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts
```

- [ ] **Step 3: Register source-specific child operations**

Use these resource classes:

```text
sourcing.collect_naver_trends -> naver_api
sourcing.collect_1688_trends  -> playwright_1688
sourcing.collect_shorts_trends -> default
```

The existing `sourcing.collect_daily_trends` parent returns children on its
first execution. On resume it reads child runs, applies the fixed terminal
rules, and returns one safe source summary. Extract `collectSource()` from
`TrendCollectService`; source code and persistence behavior remain owner-local.

- [ ] **Step 4: Bound Naver internal concurrency**

Replace serial Naver chunk loops with a small `mapWithConcurrency` limit of two,
while preserving output ordering and request caps. 1688 seeds remain serial
inside their one lane. Use `context.signal` and checkpoint at every chunk/seed.

- [ ] **Step 5: Register rising detection as `snapshot_compute`**

`sourcing.detect_rising_products` wraps the existing deterministic service.
The direct `/detect` route becomes a start facade or is removed after the web
cutover; GET latest remains a pure read and `latestOrDetect` is retired because
a read must not silently compute. The page shows the latest snapshot plus the
active run panel.

- [ ] **Step 6: Verify and commit**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts src/sourcing/application/service/__tests__/trend-collect.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-rising-product.operation-handler.spec.ts src/sourcing/application/service/__tests__/sourcing-rising-product.service.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/\(sourcing-ai\)/sourcing-ai/market/components/MarketIntelligencePage.spec.tsx src/app/\(sourcing-ai\)/sourcing-ai/rising-products/lib/rising-products-api.spec.ts src/app/\(sourcing-ai\)/sourcing-ai/rising-products/components/RisingProductsPage.spec.tsx
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git add apps/server/src/common/operation-definition.ts apps/server/src/operations apps/server/src/sourcing 'apps/web/src/app/(sourcing-ai)/sourcing-ai/market' 'apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products'
rtk git commit -m "feat(sourcing): isolate trend and rising workloads"
```

## Task 11: Remove legacy paths, add the static gate, update architecture, and run full QA

**Phase:** Legacy removal and performance gates

**Depends on:** Tasks 1-10 committed and verified on the integration branch

**Files:**

- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-presenter.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-presenter.spec.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-extension.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/wing-catalog/lib/wing-catalog-extension.spec.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/lib/coupang-keyword-extension.ts`
- Delete after caller search is zero: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/lib/coupang-keyword-extension.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-keyword-search-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-image-search-api.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-keyword-search.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-image-search.controller.ts`
- Create: `scripts/check-sourcing-long-running-actions.mjs`
- Create: `scripts/__tests__/check-sourcing-long-running-actions.test.mjs`
- Modify: `package.json`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/runbooks/sourcing-collection-operations.md`
- Modify: `docs/runbooks/README.md`
- Modify: `apps/server/src/operations/AGENTS.md`
- Modify: `apps/server/src/sourcing/AGENTS.md`
- Modify: `apps/server/src/advertising/AGENTS.md`
- Modify: `apps/web/src/app/(sourcing-ai)/AGENTS.md`
- Modify: `extensions/kiditem-os/AGENTS.md`

- [ ] **Step 1: Prove all legacy callers are gone**

Run and save the output in the KID-24 final verification checkpoint:

```bash
rtk rg -n 'searchWingCatalogProducts|searchCoupangKeywordSuggestions|runCompetitorCollection|runCompetitorSellerCollection|search1688ByKeyword|search1688ByImage|useQueries\(' 'apps/web/src/app/(sourcing-ai)'
rtk rg -n 'latestOrDetect|@Post\(.detect.\)' apps/server/src/sourcing
```

Expected: no component-owned collection loop, no mount collection call, no
sourcing per-product `useQueries`, and only explicitly approved compatibility
definitions. Stop deletion if any live caller remains.

- [ ] **Step 2: Write the static gate tests**

The script scans sourcing React files and fails on:

- an import/call of retired direct extension helpers;
- `useEffect` bodies containing a collection-start function from the explicit
  forbidden list;
- `useQueries` in product tracking;
- direct 1688 service execution from HTTP controllers;
- `latestOrDetect` read-or-compute behavior.

Use a fixture directory in the script test to prove one allowed read effect and
one rejected collection effect. Avoid a broad regex that rejects unrelated
React effects.

- [ ] **Step 3: Add the repository command and remove dead code**

Add `check:sourcing-long-running-actions` to root scripts and include it in
`check:conventions`. Delete helpers/endpoints only when both `rg` and the static
gate prove there are no consumers. Keep shared extension primitives that serve
non-sourcing domains.

- [ ] **Step 4: Update durable architecture and operations runbook**

`docs/ARCHITECTURE.md` records:

```text
sourcing screen -> Operations start/read -> owner operation handler
browser handler -> KidItem OS claim -> fenced owner ingest
owner snapshot -> sourcing screen
Operations never owns sourcing or Ads canonical rows
```

The runbook documents resource limits, environment variable validation,
queue/stage/heartbeat inspection, cancellation, attention retry, provider
outage handling, safe result fields, and the exact Chrome regression matrix.

- [ ] **Step 5: Run full automated verification**

```bash
rtk npm run check:sourcing-long-running-actions
rtk npm run test:scripts
rtk npm run check:conventions
rtk npm run check:web-db-boundary
rtk npm run check:raw-snapshot-read-models
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
rtk node extensions/scripts/sync-collection-session-adapters.mjs --check
rtk node --check extensions/kiditem-os/background/service-worker.js
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))"
```

- [ ] **Step 6: Run and record full Chrome QA**

Exercise all 14 routes from the design and every action in the 2026-08-13
baseline. For each route record:

- initial snapshot request count and elapsed time;
- absence of an external collection request on mount;
- start response elapsed time and run ID;
- queue/runtime/running/attention/terminal UI;
- progress counts and elapsed time;
- navigation away/back and reload recovery;
- cancel fencing and retry;
- complete, partial, no-change, and all-failed copy where applicable;
- console errors and duplicate-key warnings.

Acceptance values are design section 8.2. External provider total duration is
evidence, not a pass/fail SLO.

- [ ] **Step 7: Run PR guards against the intended base**

After opening the PR and completing its template fields:

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Read the live PR body back and confirm base, head, commit count, and diff scope.

- [ ] **Step 8: Commit**

```bash
rtk git add package.json scripts docs apps extensions packages
rtk git commit -m "refactor(sourcing): enforce operation-backed collection"
```

## Program closeout

After Task 11 merges:

1. Read the single KID-24 PR; confirm the target is `develop`, the commit and
   diff scope match this plan, required checks passed, and no follow-up was
   deferred without a Linear issue.
2. Add a KID-24 completion comment containing the PR, squash merge SHA,
   automated gates, Chrome QA evidence, and final ownership decisions.
3. Read KID-24 back. Move it to `Done` only when every completion criterion in
   the design is evidenced.
4. Fetch/prune and fast-forward clean managed checkouts. Preserve dirty or
   active worktrees and never delete or classify `release/office` as stale.

## Plan self-review checklist

- [x] Every design acceptance criterion maps to at least one task and test.
- [x] Every long-running route action maps to an exact operation or is explicitly
  classified as a bounded direct read/mutation.
- [x] Canonical sourcing/Ads rows are never stored in Operation result JSON.
- [x] Organization scope comes only from authenticated server context.
- [x] Extension writes require exact run and attempt-token fencing.
- [x] `partial` remains a result outcome rather than an Operation status.
- [x] Provider cancellation reaches a signal/checkpoint and late writes cannot
  publish a successful snapshot.
- [x] One stalled provider cannot occupy another resource class.
- [x] No collection starts from a React mount effect.
- [x] Schema, server boot, web build, extension, reconstruction, release, static,
  and Chrome gates are all present.
