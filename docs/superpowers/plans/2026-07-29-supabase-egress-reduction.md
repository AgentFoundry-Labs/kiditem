# Supabase Egress Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce KidItem's total billable Supabase egress to a three-day rolling average below 120 MB/day, using Shared Pooler statement transfer as the primary optimization lever, without weakening panel freshness, inventory correctness, authorization freshness, or durable job execution.

**Architecture:** Remove accidental high-frequency reads at the browser boundary, make Panel SSE reconnection distinguish replay/caught-up/reset states, reuse immutable Sellpia sales facts briefly while recomputing live inventory enrichment, and back idle workers off without changing their claim/lease semantics. Ship each owner-domain change independently and use Supabase statement deltas after each deployment as the release gate.

**Tech Stack:** Next.js 15, React 19, TanStack React Query 5, Zustand, NestJS 11, RxJS, Prisma 7, PostgreSQL/Supavisor, Vitest.

## Global Constraints

- Classify this work as a Supabase egress incident investigation, but do not create one cross-domain implementation PR. Keep each PR owner-scoped as listed under `Delivery sequence`.
- Preserve `organizationId` predicates on every tenant-owned read. Frontend requests never send `organizationId`.
- Preserve Panel's SSE exception, `Last-Event-ID`, user visibility, organization isolation, initial reset snapshot, sidebar badges, generation completion watcher, and panel-open stale-operation reconciliation.
- Preserve Sellpia's product-code exact -> option-code exact -> unique-barcode resolution order, inactive-candidate diagnostics, ambiguous-barcode diagnostics, shared-SKU coverage, 13-month anomaly evidence, and pagination-before-summary contract.
- Cache only sales facts. Never cache final inventory availability, commitments, product destinations, ABC grades, media, or the final `SellpiaProductSalesSummary`.
- Keep authentication authorization-current on every request. This plan narrows selected columns but does not cache memberships or roles.
- Keep Agent OS `FOR UPDATE SKIP LOCKED`, AI direct-job leases, retries, wake behavior, and terminal projection semantics unchanged.
- Do not add Redis, PostgreSQL `LISTEN/NOTIFY`, a materialized view, a schema migration, a new package, or a direct Supabase client.
- This is a no-schema change: no `db:push`, backfill, data migration, or `VERSION` change is required.
- `ProductOutflow.tsx` is over 500 lines. Its edit is explicitly a limited incident fix to query options only; do not restructure its UI in this work.
- Existing dirty changes under `apps/server/src/channels/**` and `packages/shared/src/schemas/source-import*` belong to another task and must remain untouched.
- Production changes deploy only through GitHub Actions and immutable image digests.

---

## Baseline and release budget

Record the following 2026-07-29 baseline in the PR body and deployment notes. Do not reset `pg_stat_statements`; use counter deltas from a timestamped baseline.

| Metric | Baseline | Interpretation |
|---|---:|---|
| Billing-cycle egress | 9.455 / 5 GB | Already-spent usage cannot be recovered |
| Peak-day Shared Pooler share | 99.4-100% | Database result transfer is the dominant source |
| Alert snapshot statements | 72,255 calls / 5,523,947 rows across observed variants | Consistent with 5-second fallback polling |
| Sellpia monthly-sales statement | 179 calls / 3,218,306 rows | About 17,979 rows per call |
| Agent OS claim statement | 2,256,444 calls / 57 rows | Almost entirely empty polling |
| AI direct-job claim statement | 694,882 calls / 2 rows | Almost entirely empty polling |

The free-cycle mathematical budget is roughly `5 GB / 31 days = 161 MB/day`. Use a 25% safety margin:

```text
release target = 3.75 GB / 31 days = about 120 MB/day
```

Success requires all of the following after the final deployment:

- Three consecutive complete days with total billable Supabase egress averaging at most 120 MB/day. Record Shared Pooler and every other billable component separately; the total controls the payment decision.
- Panel healthy connection: one `/api/panel/stream`, zero repeated `/api/panel/snapshot` calls after initial hydration.
- Panel fallback: no background-tab snapshot polling; open panel at most once per 15 seconds; closed panel at most once per 60 seconds.
- Product outflow: no timer-driven sales refetch.
- Product Hub: at most 12 timer-driven list/overview calls per foreground hour, down from about 240.
- Agent OS idle claims at most 8,640/day per active worker and enqueue-to-claim no worse than 10 seconds while idle.
- AI direct-job idle claims at most 1,440/day per process after reaching maximum backoff; local enqueue still wakes immediately.
- No increase in missing panel items, stale inventory after explicit refresh, permission lag, pending-job age, lease loss, or terminal projection failures.

## Delivery sequence

| PR | Branch | Tasks | Deploy gate |
|---|---|---|---|
| 1 | `fix/panel-egress-fallback` | 1-2 | Observe Panel network calls and statement deltas for one complete traffic window |
| 2 | `fix/sellpia-egress-cadence` | 3-5 | Observe `sellpia_product_monthly_sales` calls/rows and both affected screens |
| 3 | `fix/agent-worker-idle-backoff` | 6 | Observe Agent OS pending age and claim delta |
| 4 | `fix/ai-worker-idle-backoff` | 7 | Observe AI job pending age, wake latency, and claim delta |
| 5 | `fix/auth-query-projection` | 8 | Confirm `/api/auth/me`, protected API requests, role and organization selection |

Every regular PR branches from and targets `develop`, uses the repository PR template, records `Release decision: no schema change; no backfill`, and is squash-merged only after its focused gates pass.

---

### Task 1: Stop Panel transport retries from starting database polling

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/components/panel/lib/panel-sse-client.ts`
- Modify: `apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`
- Modify: `apps/web/src/components/panel/hooks/usePanelStream.ts`
- Modify: `apps/web/src/components/panel/hooks/__tests__/usePanelStream.spec.tsx`

**Interfaces:**
- Produces `queryKeys.panel.snapshot()` as `['panel', 'snapshot']`.
- `PanelSseClientOptions` separates retryable transport failures from invalid frames:

```ts
export interface PanelSseClientOptions {
  onMessage: (event: PanelEvent) => void;
  onRetry?: (error: unknown, consecutiveFailures: number) => void;
  onProtocolError?: (error: unknown) => void;
  onOpen?: () => void;
  onGiveUp?: (error: unknown) => void;
}
```

- Polling is enabled only for `connectionStatus === 'polling_fallback'`.
- Fallback cadence is 15 seconds while the panel is open and 60 seconds while it is closed; React Query pauses it in hidden tabs.
- While in fallback, retry SSE with a fresh auth session every 60 seconds. A successful `onOpen` disables fallback polling immediately.

- [ ] **Step 1: Add the Panel query-key family.**

```ts
panel: {
  all: ['panel'] as const,
  snapshot: () => [...queryKeys.panel.all, 'snapshot'] as const,
},
```

- [ ] **Step 2: Rewrite the hook test's SSE mock to capture callbacks and wrap the hook in a fresh `QueryClientProvider`.** Add behavioral tests that assert:
  - one through four `onRetry` callbacks make zero snapshot requests;
  - `onGiveUp` triggers exactly one immediate snapshot;
  - a closed panel waits 60 seconds for the next fallback request;
  - an open panel waits 15 seconds;
  - hidden-tab timer advancement produces no request;
  - `onOpen` after fallback stops further requests.

The central failing assertion is:

```ts
act(() => capturedOptions.onRetry?.(new Error('temporary'), 1));
await vi.advanceTimersByTimeAsync(5 * 60_000);
expect(apiClient.get).not.toHaveBeenCalled();

act(() => capturedOptions.onGiveUp?.(new Error('exhausted')));
await waitFor(() =>
  expect(apiClient.get).toHaveBeenCalledWith('/api/panel/snapshot'),
);
```

- [ ] **Step 3: Run the focused hook test and confirm it fails because transient errors currently set `disconnected` and start a five-second interval.**

```bash
npm exec --workspace=apps/web vitest -- run src/components/panel/hooks/__tests__/usePanelStream.spec.tsx
```

Expected: the transient-retry case observes one or more `/api/panel/snapshot` calls.

- [ ] **Step 4: Harden `PanelSseClient`.** Implement these exact state rules:
  - custom `onopen(response)` rejects non-2xx responses and a content type that does not include `text/event-stream`;
  - opening a TCP response does not reset consecutive failures;
  - a valid Panel frame or heartbeat resets consecutive failures;
  - malformed JSON/schema data calls `onProtocolError` and does not change transport state;
  - retry failures call `onRetry(error, count)`;
  - the fifth consecutive failure calls `onGiveUp` exactly once and stops the current retry loop;
  - expected aborts remain silent;
  - normal server EOF enters the retry path instead of silently ending the stream;
  - the outer promise rejection does not call `onRetry` after `onGiveUp`.

- [ ] **Step 5: Replace the hook's manual `setInterval` snapshot loop with React Query.** Use these query options and apply successful data to the store in an effect:

```ts
const snapshotQuery = useQuery({
  queryKey: queryKeys.panel.snapshot(),
  queryFn: () => apiClient.get<PanelItem[]>('/api/panel/snapshot'),
  enabled: connectionStatus === 'polling_fallback',
  refetchInterval: isOpen ? 15_000 : 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  retry: false,
});
```

`onRetry` may set a non-terminal “connecting” indicator but must not set `disconnected` or `polling_fallback`. `onGiveUp` alone enters fallback. Store the client in a ref and probe `connect()` every 60 seconds only while fallback is active.

- [ ] **Step 6: Extend the SSE-client tests** for 401/non-SSE rejection, five consecutive failures, clean EOF retry, protocol error separation, heartbeat reset, exact one-time give-up, and reconnect with the latest opaque `Last-Event-ID` plus a newly read Authorization token.

- [ ] **Step 7: Run the complete Panel frontend suite and web build.**

```bash
npm exec --workspace=apps/web vitest -- run src/components/panel
npm run build --workspace=apps/web
```

Expected: all tests pass; build exits 0.

- [ ] **Step 8: Commit the frontend transport change.**

```bash
git add apps/web/src/lib/query-keys.ts apps/web/src/components/panel
git commit -m "fix: gate panel snapshot fallback on SSE exhaustion"
```

---

### Task 2: Make Panel replay epoch-aware and keep idle streams alive

**Files:**
- Modify: `apps/server/src/automation/adapter/out/panel-event/panel-sse.service.ts`
- Modify: `apps/server/src/automation/adapter/out/panel-event/__tests__/panel-sse.service.spec.ts`
- Modify: `apps/server/src/automation/adapter/in/http/panel.controller.ts`
- Modify: `apps/server/src/automation/adapter/out/panel-event/__tests__/integration.spec.ts`

**Interfaces:**
- SSE transport IDs become opaque `v1:<bootId>:<seq>` strings. `PanelEvent.seq` remains an integer and its shared schema does not change.
- `PanelSseService` produces:

```ts
export type PanelReplayResult =
  | { kind: 'replay'; events: PanelEvent[] }
  | { kind: 'caught_up'; events: [] }
  | { kind: 'miss'; events: [] };

resolveReplay(
  organizationId: string,
  lastEventId: string,
  subscriberUserId?: string | null,
): PanelReplayResult;

get currentEventId(): string;
```

- An ID from another boot, a malformed/legacy numeric ID, an ID older than retained ring-buffer coverage, or a valid current-boot ID whose sequence is greater than `currentSeq` returns `miss`.
- A valid current-boot ID with no visible newer events returns `caught_up` and does not query a snapshot.
- Heartbeats use `{ type: 'ping', data: '', id: currentEventId }` every 25 seconds and never advance the replay cursor.

- [ ] **Step 1: Add failing replay-state tests** for current-boot replay, current-boot caught-up, only-other-user events producing caught-up, old boot producing miss, legacy numeric ID producing miss, a current-boot future sequence producing miss, and a ring-buffer overflow producing miss.

The key regression assertion is:

```ts
const latestId = service.currentEventId;
expect(service.resolveReplay('co-1', latestId, 'user-a')).toEqual({
  kind: 'caught_up',
  events: [],
});
```

- [ ] **Step 2: Run the focused service test and confirm `resolveReplay` and `currentEventId` do not exist.**

```bash
npm exec --workspace=apps/server vitest -- run src/automation/adapter/out/panel-event/__tests__/panel-sse.service.spec.ts
```

- [ ] **Step 3: Implement epoch-aware transport IDs and replay classification.** Generate one `randomUUID()` boot ID per `PanelSseService` instance. Keep the existing per-organization ring buffer and visibility filter. Reject `requestedSeq > currentSeq` as `miss`; otherwise a full buffer is a miss only when the requested sequence is less than `oldestRetainedSeq - 1`. Filter visible retained events only after these cursor-validity checks, then return replay or caught-up.

- [ ] **Step 4: Merge a 25-second heartbeat observable into each live stream.** Supply the current ID explicitly so Nest does not invent a new replay cursor. The client already ignores empty data.

- [ ] **Step 5: Add failing controller integration tests** that spy on `PanelService.snapshot` and prove:
  - no header sends reset snapshot;
  - latest current-boot ID calls snapshot zero times and then receives the next live event;
  - same-boot retained events replay without snapshot;
  - stale boot and ring-buffer miss send reset snapshot;
  - user and organization visibility remain intact.

- [ ] **Step 6: Change `PanelController.stream()` to switch on `resolveReplay`.** Use an empty initial observable for caught-up, replay only returned events for replay, and build a reset snapshot only for miss/absent ID. Use `currentEventId` on snapshots rather than `String(seq)`.

- [ ] **Step 7: Make REST snapshot/backfill stamp run items with the current numeric `seq` and one ISO `updatedAt`.** Reuse the same private controller helper used by the SSE snapshot; Alert items retain their existing schema. This fixes fallback data so it satisfies `PanelItemSchema` without changing panel-open reconciliation behavior.

- [ ] **Step 8: Run Panel backend tests, tenant scanners, build, and boot.**

```bash
npm exec --workspace=apps/server vitest -- run src/automation/adapter/out/panel-event
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```

Expected: tests/scanners/build pass and Nest reports a successful boot. Stop the local watcher after confirming boot.

- [ ] **Step 9: Commit the backend replay change.**

```bash
git add apps/server/src/automation/adapter/in/http/panel.controller.ts apps/server/src/automation/adapter/out/panel-event
git commit -m "fix: resume panel streams without redundant snapshots"
```

**PR 1 rollback:** Revert to the previous immutable API/web digest. There is no database rollback. If only heartbeat causes an intermediary incompatibility, revert the heartbeat merge while retaining replay classification and fallback gating.

---

### Task 3: Reduce fixed polling on both Sellpia depletion consumers

**Files:**
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx`

**Interfaces:**
- Product outflow has `staleTime: 5 * 60_000`, no fixed polling, and refetches on window focus.
- Product Hub list and independent overview each have `staleTime: 5 * 60_000`, a foreground-only ten-minute safety poll, and refetch on focus.
- Existing invalidation after product-sales ingest and inventory refresh remains authoritative.

- [ ] **Step 1: Add a failing ProductOutflow cadence test.** With automatic collection disabled by the existing daily storage fixture, render once, wait for the initial fetch, advance ten minutes, and assert exactly one fetch.

```ts
await waitFor(() => expect(productSalesApi.fetch).toHaveBeenCalledTimes(1));
await vi.advanceTimersByTimeAsync(10 * 60_000);
expect(productSalesApi.fetch).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the ProductOutflow spec and confirm the current 60-second interval makes the assertion fail.**

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx'
```

- [ ] **Step 3: Replace the ProductOutflow query cadence.**

```ts
staleTime: 5 * 60_000,
refetchOnWindowFocus: true,
```

Remove `refetchInterval: 60_000`. Do not alter collection, ingest, stock refresh, or invalidation code.

- [ ] **Step 4: Extend the Product Hub hook test** to inspect both `useQuery` option objects and require:

```ts
expect(options).toMatchObject({
  staleTime: 5 * 60_000,
  refetchInterval: 10 * 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
});
```

- [ ] **Step 5: Change both Product Hub query options** to those exact values. Keep the independent unfiltered overview query because its command-center summary contract differs from the filtered list.

- [ ] **Step 6: Run both focused suites and the full web build.**

```bash
npm exec --workspace=apps/web vitest -- run \
  'src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx' \
  'src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx'
npm run build --workspace=apps/web
```

Expected: all tests pass and build exits 0.

- [ ] **Step 7: Commit the browser cadence change.**

```bash
git add 'apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.tsx' \
  'apps/web/src/app/(inventory)/stock-ops/components/ProductOutflow.spec.tsx' \
  'apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.ts' \
  'apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx'
git commit -m "fix: reduce Sellpia depletion polling"
```

---

### Task 4: Read only relevant Inventory SKU candidates

**Files:**
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.spec.ts`
- Verify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-resolver.spec.ts`

**Interfaces:**
- `SellpiaProductInventoryReader.project()` derives non-empty, trimmed, deduplicated candidate codes and barcodes from the requested product evidence.
- It still returns inactive candidates and every row sharing a candidate barcode.
- If both candidate sets are empty, it skips the Prisma candidate query but still asks `InventoryAvailabilityPort` for snapshot state with an empty ID list.

- [ ] **Step 1: Add failing query-scope tests** that require organization scope, deduplicated exact codes, deduplicated barcodes, no `isActive: true` filter, and no Prisma read for entirely empty evidence.

```ts
expect(prisma.sellpiaInventorySku.findMany).toHaveBeenCalledWith({
  where: {
    organizationId: ORGANIZATION_ID,
    OR: [
      { code: { in: ['P-1', 'O-1'] } },
      { barcode: { in: ['880000000001'] } },
    ],
  },
  select: { id: true, code: true, barcode: true, isActive: true },
});
```

- [ ] **Step 2: Run the focused reader and resolver tests and confirm the current query reads every organization SKU.**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.spec.ts \
  src/analytics/sellpia-product-sales/sellpia-product-inventory-resolver.spec.ts
```

- [ ] **Step 3: Implement candidate extraction and a non-empty Prisma `OR`.** Do not normalize beyond `trim()` because identity precedence and stored codes remain owner contracts.

```ts
const codes = [...new Set(products.flatMap(({ evidence }) => [
  evidence.productCode.trim(),
  evidence.optionCode.trim(),
]).filter(Boolean))];
const barcodes = [...new Set(products.flatMap(({ evidence }) => {
  const barcode = evidence.barcode?.trim();
  return barcode ? [barcode] : [];
}))];
```

- [ ] **Step 4: Keep and rerun the inactive-candidate, duplicate-barcode, product-code precedence, and option-code fallback tests.** Expected: all existing resolution outcomes remain byte-for-byte equal.

- [ ] **Step 5: Commit the candidate-scope change.**

```bash
git add apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.ts \
  apps/server/src/analytics/sellpia-product-sales/sellpia-product-inventory-reader.spec.ts
git commit -m "fix: scope Sellpia inventory candidates to sales evidence"
```

---

### Task 5: Single-flight cache immutable Sellpia sales facts

**Files:**
- Modify: `apps/server/src/analytics/sellpia-product-sales/sellpia-product-sales.service.ts`
- Modify: `apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts`

**Interfaces:**
- Cache key is `${organizationId}:${monthsWindow}:${currentKstYearMonth}`.
- TTL is exactly five minutes and capacity is 32 keys, evicting the oldest insertion when adding key 33.
- Cache value is the in-flight/resolved Promise for the selected `sellpiaProductMonthlySales` fact rows only.
- The cache is invalidated for the organization immediately after a successful ingest transaction commits and before `SELLPIA_PRODUCT_SALES_EVENTS.INGESTED` is emitted.
- A rejected load removes its own entry. Inventory projection executes on every `getSummary()` call.

- [ ] **Step 1: Add failing service tests** for sequential reuse, concurrent single-flight, inventory refresh on each summary, organization/window/month isolation, five-minute expiry, ingest-success invalidation, ingest-failure preservation, and rejected-load retry.

The two most important assertions are:

```ts
await service.getSummary(ORGANIZATION_ID, 13);
await service.getSummary(ORGANIZATION_ID, 13);
expect(findMany).toHaveBeenCalledTimes(1);
expect(inventoryFindMany).toHaveBeenCalledTimes(2);
```

```ts
await Promise.all([
  service.getSummary(ORGANIZATION_ID, 13),
  service.getSummary(ORGANIZATION_ID, 13),
]);
expect(findMany).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the focused service spec and confirm repeated summaries currently execute repeated sales-fact reads.**

```bash
npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales.service.spec.ts
```

- [ ] **Step 3: Define one typed Prisma select constant** and use it for both the cache loader and `SalesFactRow` type.

```ts
const SALES_FACT_SELECT = {
  productCode: true,
  optionCode: true,
  yearMonth: true,
  orderQty: true,
  productName: true,
  optionName: true,
  providerName: true,
  salePrice: true,
  buyPrice: true,
  barcode: true,
  capturedAt: true,
} satisfies Prisma.SellpiaProductMonthlySalesSelect;

type SalesFactRow = Prisma.SellpiaProductMonthlySalesGetPayload<{
  select: typeof SALES_FACT_SELECT;
}>;
```

- [ ] **Step 4: Implement the bounded cache inside `SellpiaProductSalesService`.** Store `Promise<SalesFactRow[]>`, delete the entry only if a failing Promise is still the active entry for that key, and have `getSummary()` call the loader rather than Prisma directly.

- [ ] **Step 5: Invalidate after transaction commit.** A transaction failure must not clear the last good cache. An event-listener failure occurs after invalidation because the database has already changed.

- [ ] **Step 6: Run the complete Analytics and Products depletion suites plus tenant scanners.**

```bash
npm exec --workspace=apps/server vitest -- run src/analytics/sellpia-product-sales
npm exec --workspace=apps/server vitest -- run src/products/application/service/product-operations.service.spec.ts
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```

Expected: all tests/scanners/build pass and Nest boots.

- [ ] **Step 7: Commit the fact-cache change.**

```bash
git add apps/server/src/analytics/sellpia-product-sales
git commit -m "fix: reuse Sellpia sales facts across summary reads"
```

**PR 2 rollback:** Revert to the previous immutable web/API digest. No stored data changes. If cross-process freshness is unexpectedly visible, disable only the fact cache by reverting Task 5 while retaining Tasks 3-4.

---

### Task 6: Add bounded idle backoff to the Agent OS worker

**Files:**
- Modify: `apps/server/src/agent-os/application/service/agent-run-worker.service.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-run-worker.service.spec.ts`

**Interfaces:**
- Enabled state and minimum interval remain controlled by `AGENT_RUNTIME_WORKER_ENABLED` and `AGENT_RUNTIME_WORKER_INTERVAL_MS`.
- Empty queue delays are `2s -> 4s -> 8s -> 10s -> 10s` for the default two-second minimum.
- Database/runtime scheduler errors back off independently to 30 seconds.
- A claimed request schedules the next drain immediately and resets idle backoff.
- Direct public `tick()` remains non-throwing for existing tests/operators.
- No cross-process wake port is introduced; the documented worst-case idle enqueue delay is 10 seconds.

- [ ] **Step 1: Replace fixed-interval lifecycle expectations with failing fake-timer tests** for empty backoff, claimed-job immediate drain, reset after success, independent error backoff, no overlapping claims, and timeout cleanup on destroy.

```ts
for (const [delay, calls] of [
  [0, 1],
  [2_000, 2],
  [4_000, 3],
  [8_000, 4],
  [10_000, 5],
  [10_000, 6],
] as const) {
  await vi.advanceTimersByTimeAsync(delay);
  expect(executor.executeNextUnscoped).toHaveBeenCalledTimes(calls);
}
```

- [ ] **Step 2: Run the focused worker test and confirm fixed two-second polling violates the schedule.**

```bash
npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/__tests__/agent-run-worker.service.spec.ts
```

- [ ] **Step 3: Replace `setInterval` with one unref'd recursive `setTimeout`.** Use a private throwing/busy-guarded drain for scheduler outcome classification and keep public `tick()` as a logging non-throwing wrapper. Use:

```ts
const MAX_IDLE_INTERVAL_MS = 10_000;
const MAX_ERROR_INTERVAL_MS = 30_000;
```

Clamp each maximum to at least the configured minimum interval. On `result.executed === true`, schedule `0`; on `no_pending_request`, double the idle delay to its cap; on an exception, double the independent error delay to its cap.

- [ ] **Step 4: Run focused unit and real-Postgres finalization tests, then build and boot.**

```bash
npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/__tests__/agent-run-worker.service.spec.ts
npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-run-worker-finalize.pg.integration.spec.ts
npm run build --workspace=apps/server
npm run dev:server
```

Expected: queue semantics pass, Nest boots, and no timer keeps the process alive after destroy.

- [ ] **Step 5: Commit the Agent OS worker change.**

```bash
git add apps/server/src/agent-os/application/service/agent-run-worker.service.ts \
  apps/server/src/agent-os/application/service/__tests__/agent-run-worker.service.spec.ts
git commit -m "fix: back off idle Agent OS claims"
```

**PR 3 rollback:** Redeploy the previous worker digest. Pending rows remain durable; no queue data migration is involved.

---

### Task 7: Raise the existing AI direct-job idle ceiling

**Files:**
- Modify: `apps/server/src/ai/application/service/ai-direct-job.config.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/ai-direct-job.config.spec.ts`
- Modify: `apps/server/src/ai/application/service/__tests__/ai-direct-job-worker.service.spec.ts`
- Modify: `docs/runbooks/environment-variables.md`

**Interfaces:**
- Default `workerIntervalMs` remains 1,000 ms.
- Default `workerMaxIntervalMs` changes from 10,000 to 60,000 ms.
- Default error maximum remains 30,000 ms.
- Existing local `AI_DIRECT_JOB_WAKE_PORT` behavior remains unchanged.
- The environment-variable runbook documents the new 60,000 ms default and that an explicit runtime override still wins.

- [ ] **Step 1: Change the config-default test expectation to 60,000 ms** and change the idle schedule test to assert `1s -> 2s -> 4s -> 8s -> 16s -> 32s -> 60s`.

- [ ] **Step 2: Run both focused tests and confirm the old ten-second ceiling fails them.**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/ai/application/service/__tests__/ai-direct-job.config.spec.ts \
  src/ai/application/service/__tests__/ai-direct-job-worker.service.spec.ts
```

- [ ] **Step 3: Change only the fallback default in `resolveAiDirectJobRuntimeConfig`.**

```ts
const workerMaxIntervalMs = positiveInt(
  env.AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS,
  60_000,
);
```

- [ ] **Step 4: Update the environment-variable runbook.** Change only the documented `AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS` default from `10000` to `60000`, and retain the constraint that the value must be at least the initial interval.

- [ ] **Step 5: Preserve and rerun the wake test.** It must prove that a worker sitting at the 60-second ceiling schedules an immediate claim and then resets its next idle delay to one second.

- [ ] **Step 6: Run the repository integration, build, and boot gates.**

```bash
npm run test:integration --workspace=apps/server -- \
  src/ai/adapter/out/repository/__tests__/ai-direct-job.repository.adapter.pg.integration.spec.ts
npm run build --workspace=apps/server
npm run dev:server
```

Expected: tests/build pass and Nest boots.

- [ ] **Step 7: Commit the AI worker and runbook change.**

```bash
git add apps/server/src/ai/application/service/ai-direct-job.config.ts \
  apps/server/src/ai/application/service/__tests__/ai-direct-job.config.spec.ts \
  apps/server/src/ai/application/service/__tests__/ai-direct-job-worker.service.spec.ts \
  docs/runbooks/environment-variables.md
git commit -m "fix: extend AI worker idle backoff"
```

**PR 4 rollback:** Set the existing `AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS` deployment value back to `10000` if that variable is already rendered, or redeploy the previous immutable digest. Do not disable both API and worker AI loops because wake is process-local.

---

### Task 8: Narrow authentication database projections without caching authority

**Files:**
- Modify: `apps/server/src/auth/middleware/supabase-auth.middleware.ts`
- Modify: `apps/server/src/auth/__tests__/supabase-auth.middleware.spec.ts`

**Interfaces:**
- JWT/JWKS validation, token priority, active-membership ordering, `AuthUser`, missing mirror behavior, and missing membership behavior remain unchanged.
- Prisma selects only `User.id`, `email`, `role`, `type` and membership `id`, `organizationId`, `role`.

- [ ] **Step 1: Add a failing projection assertion** to the existing valid-user middleware test.

```ts
expect(findUnique).toHaveBeenCalledWith({
  where: { id: TEST_USER.id },
  select: {
    id: true,
    email: true,
    role: true,
    type: true,
    memberships: {
      where: { status: 'active' },
      orderBy: [{ lastSelectedAt: 'desc' }, { joinedAt: 'asc' }],
      take: 1,
      select: { id: true, organizationId: true, role: true },
    },
  },
});
```

- [ ] **Step 2: Run the auth middleware test and confirm the current `include` shape fails.**

```bash
npm exec --workspace=apps/server vitest -- run src/auth/__tests__/supabase-auth.middleware.spec.ts
```

- [ ] **Step 3: Replace `include` with the exact `select` projection.** Do not introduce a TTL cache, module-global map, role fallback change, or organization-selection change.

- [ ] **Step 4: Run auth, IDOR, tenant, build, and boot gates.**

```bash
npm exec --workspace=apps/server vitest -- run src/auth
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
npm run dev:server
```

Expected: all auth behavior remains green and Nest boots.

- [ ] **Step 5: Commit the auth projection change.**

```bash
git add apps/server/src/auth/middleware/supabase-auth.middleware.ts \
  apps/server/src/auth/__tests__/supabase-auth.middleware.spec.ts
git commit -m "fix: narrow authenticated user lookup"
```

**PR 5 rollback:** Redeploy the previous API digest. Authorization data is never cached, so there is no cache flush or data recovery step.

---

### Task 9: Deploy sequentially and make the payment decision from measured deltas

**Files:**
- Reference: `docs/runbooks/deployment-architecture.md`
- Reference: `.github/PULL_REQUEST_TEMPLATE.md`

**Interfaces:**
- GitHub Actions remains the sole deploy entrypoint.
- Every deployment records the exact git SHA, image digest, deployment time, Supabase statement counters, and Shared Pooler daily egress.

- [ ] **Step 1: Before each PR, verify branch/base and local PR guards.**

```bash
git status --short --branch
npm run check:pr-reconstruction -- --base origin/develop --head HEAD
npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

- [ ] **Step 2: Record pre-deploy operational state** without printing secrets:
  - exactly one active API slot and one active worker slot;
  - inactive blue/green slot stopped;
  - Agent OS enabled only in the worker container;
  - oldest due `agent_run_requests.scheduled_for` and `ai_direct_jobs.scheduled_for`;
  - cumulative calls/rows for the four baseline statement families;
  - effective `AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS` in both API and worker containers; it must be unset or `60000` before crediting PR 4 with the reduction;
  - current day's total billable egress and its Shared Pooler/non-pooler breakdown.

- [ ] **Step 3: Deploy PR 1 and browser-smoke Panel.** In a visible tab confirm one stream and no repeated snapshot. Hide the tab for two minutes and confirm no snapshot requests. Simulate a temporary offline/online transition and confirm SSE returns without a five-second snapshot loop. Open the panel and confirm stale-operation recovery still runs once.

- [ ] **Step 4: Deploy PR 2 and smoke both sales consumers.** Keep ProductOutflow open for ten minutes and confirm one sales request. Keep Product Hub open for ten minutes and confirm each list/overview query runs no more than twice. Run one explicit Sellpia sales collection and one inventory refresh; confirm invalidation displays the committed result.

- [ ] **Step 5: Deploy PRs 3-5 and smoke queues/auth.** Before PR 4, stop if either running container explicitly reports `AI_DIRECT_JOB_WORKER_MAX_INTERVAL_MS=10000`: locate and remove or update that unsupported runtime drift before claiming the new code default is active. Enqueue one safe Agent OS request in an environment with a registered handler and record enqueue-to-claim latency. Enqueue one non-destructive AI test job through its normal producer and confirm immediate wake. Exercise `/api/auth/me` and a protected organization route with an active membership and with the existing missing-membership test account behavior.

- [ ] **Step 6: At 24 and 72 hours after the final deploy, compute statement and egress deltas** from the timestamped baseline. Use total billable daily egress for the budget and keep Shared Pooler/non-pooler components as attribution. Do not compare lifetime counters without subtracting the saved baseline.

- [ ] **Step 7: Apply this payment gate.**

| Three-day total billable egress average | Decision |
|---:|---|
| `<= 120 MB/day` | Remain on Free for the next full cycle; keep an 80% and 95% usage alert |
| `> 120` and `<= 161 MB/day` | Free is mathematically possible but has no growth margin; upgrade if uptime/growth matters, otherwise observe one more week |
| `> 161 MB/day` | Upgrade before relying on the next cycle; the 5 GB cap cannot hold at this rate |

The current cycle is already above 5 GB, and these changes cannot reduce already-counted usage. If the Supabase dashboard shows an imminent restriction before the 2026-08-13 reset and production continuity matters, upgrade for the current cycle independently of the next-cycle optimization result.

Apply this gate to the dashboard's total daily billable egress. If only component data is exported, sum Shared Pooler and every other billable egress component first; never apply the 161 MB/day cap test to Shared Pooler alone.

- [ ] **Step 8: Use the query-family decision table if the 72-hour target fails.**

| Remaining leader | Next scoped design |
|---|---|
| Alert snapshot bytes despite near-zero calls | Active-operation-only metadata projection; terminal alerts return `{}` metadata; preserve child cancellation IDs |
| Sellpia fact rows | Separate targeted depletion reader or precomputed read model with a schema plan and golden comparison against current projections |
| Auth user/membership reads | Separate security-reviewed 15-30 second bounded auth-context cache with explicit invalidation |
| Supavisor auth/connection calls | Attribute clients/application names, remove unintended prod-connected processes, then tune pool size using the supported PrismaPg API |

Do not switch the application to a direct PostgreSQL connection merely to relabel egress; that does not eliminate returned bytes and can reduce connection safety.

---

## Final verification matrix

| Surface | Required evidence |
|---|---|
| Panel frontend | `src/components/panel` tests, web build, visible/hidden/offline browser smoke |
| Panel backend | panel-event tests, IDOR/tenant scanners, server build and boot |
| Sellpia web | ProductOutflow + Product Hub hook specs, web build |
| Sellpia backend | complete sellpia-product-sales suite, ProductOperations spec, tenant scanners, server build and boot |
| Agent OS | worker unit spec + real PostgreSQL finalize integration + pending-age smoke |
| AI direct jobs | config/worker unit specs + repository integration + wake-latency smoke |
| Auth | auth suite + protected-route smoke + IDOR/tenant scanners |
| Cost outcome | 24h/72h statement deltas plus three complete total-billable daily totals with Shared Pooler/non-pooler breakdown |

## Explicitly out of scope

- Supabase plan purchase or billing-account mutation.
- Retrospective reduction of the current billing-cycle counter.
- Database indexes as the primary egress fix; indexes improve lookup work but do not reduce identical returned rows.
- Sellpia schema/materialized-view changes before the post-deploy measurement gate.
- Authentication/role caching.
- Cross-process queue notifications.
- Redis or another shared cache service.
- Direct database connections from the frontend or bypassing NestJS.
- Unrelated channel matching and source-import changes already present in the working tree.
