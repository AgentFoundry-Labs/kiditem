# Advertising Phase 3B Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the advertising backend from fat services into focused application services, read-model/query modules, persistence helpers, mappers, and pure domain rules while preserving every `/api/ads/*` route and shared response contract.

**Architecture:** `apps/server/src/advertising` is already the bounded context. This plan keeps that boundary and introduces internal layers only where they remove real complexity: source-specific ingest handlers, tenant-scoped persistence helpers, read models for raw SQL/reporting, mappers for response shape, and pure domain modules for rules/calculators. It is not a generic repository rollout, and it does not change Prisma schema, shared exports, frontend routes, or public API semantics.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, Vitest, `@kiditem/shared/advertising`, RTK-prefixed shell commands.

---

## Required Context

Read these before editing any file:

- `AGENTS.md`
- `/Users/yhc125/.codex/RTK.md`
- `apps/server/AGENTS.md`
- `apps/server/src/advertising/CLAUDE.md`
- `docs/TESTING.md`
- `docs/superpowers/plans/2026-04-28-codebase-reconstruction.md`
- `docs/superpowers/plans/2026-04-29-reconstruction-current-handoff.md`

Rules that control this plan:

- One bounded context only: edit `apps/server/src/advertising/**` plus this plan if a checklist is updated.
- Keep controller routes and `@kiditem/shared/advertising` response contracts stable.
- Keep `companyId` explicit on tenant-owned service methods. Controllers supply it from `@CurrentCompany()`.
- Production raw SQL must use Prisma tagged templates and bind tenant predicates such as `company_id = ${companyId}::uuid`.
- Do not add new `@kiditem/shared` root imports.
- Do not introduce a global repository layer or Prisma 1:1 wrappers.
- Do not add implementation-detail mock tests for file moves.
- Delete or collapse existing tests only when the same operating risk is protected by a stronger public-behavior test, integration test, scanner, or build.

## Current Inventory

Measured on `main` after PR #116:

| File | Lines | Current problem |
|---|---:|---|
| `apps/server/src/advertising/services/ad-sync.service.ts` | 1677 | Extension dispatch, row normalization, business-date parsing, raw snapshot lifecycle, daily fact writes, matching, account KPI writes, scrape-target CRUD, and extension status reads live in one service. |
| `apps/server/src/advertising/services/channel-scrape-persistence.service.ts` | 916 | Run/snapshot persistence and four daily-fact upsert families share one large helper with embedded JSON merge policy. |
| `apps/server/src/advertising/services/ad-strategy.service.ts` | 834 | Endpoint orchestration, context loading, raw SQL latest-state reads, exposure hydration, campaign registration writes, and mapper helpers are mixed. |
| `apps/server/src/advertising/services/ad-action.service.ts` | 489 | Application lifecycle writes and the five pure action rules are mixed. |
| `apps/server/src/advertising/services/ad-execution.service.ts` | 317 | Worker lease/report application flow, tenant-scoped task writes, and secret scrubbing are mixed. |
| `apps/server/src/advertising/services/ad-campaigns.service.ts` | 256 | Raw SQL campaign rollup, trend read model, ratio recomputation, and contract mapping are mixed. |
| `apps/server/src/advertising/services/read-models/*.ts` | 395 total | Useful extraction started in PR #116, but the folder is nested under `services/` and does not cover strategy/campaign/status read models yet. |

The target is measurable structural improvement:

- `ad-sync.service.ts` drops below 700 lines and becomes a dispatcher/orchestrator.
- `channel-scrape-persistence.service.ts` drops below 700 lines or is replaced by smaller persistence helpers with one daily-fact concern each.
- `ad-strategy.service.ts` drops below 500 lines and delegates read models/mappers/domain helpers.
- `ad-action.service.ts` keeps application lifecycle orchestration and delegates pure rule selection.
- Existing integration coverage remains focused on real operating risks.

## Target Layout

Create these directories inside `apps/server/src/advertising/` as the refactor progresses:

```text
apps/server/src/advertising/
  domain/
    ad-action-rules.ts
    ad-execution-error-scrubber.ts
    ad-metrics.ts
    business-date.ts
    listing-match.ts
    scrape-row-normalizers.ts
    strategy-context.ts
  ingest/
    ad-campaign-ingest.handler.ts
    raw-scrape-ingest.handler.ts
    traffic-ingest.handler.ts
    coupang-ads-daily-ingest.handler.ts
    listing-ad-metric-accumulator.ts
  mappers/
    ad-action.mapper.ts
    ad-campaign.mapper.ts
    ad-extension-status.mapper.ts
    ad-listing.mapper.ts
    ad-strategy.mapper.ts
    channel-scrape.mapper.ts
  persistence/
    ad-action.persistence.ts
    ad-execution.persistence.ts
    channel-account-kpi.persistence.ts
    channel-daily-fact.persistence.ts
    channel-scrape-run.persistence.ts
    scrape-target.persistence.ts
  read-models/
    ad-action-read-model.ts
    ad-benchmark-read-model.ts
    ad-campaign-read-model.ts
    ad-extension-status-read-model.ts
    ad-listing-read-model.ts
    ad-strategy-context-read-model.ts
    ad-sync-listing-map.ts
```

The final names may be narrower if extraction reveals a smaller responsibility. Do not create empty scaffolding files. Every new file must own moved production behavior.

## Parallel PR Lanes

Run these as separate PRs after creating branches from current `main`. They are all Phase 3B advertising work and should not cross into other business domains.

### Lane A: Sync/Ingest And Daily-Fact Persistence

**Branch:** `refactor/advertising-sync-ingest-layer`

**Primary production files:**

- Modify: `apps/server/src/advertising/services/ad-sync.service.ts`
- Modify: `apps/server/src/advertising/services/channel-scrape-persistence.service.ts`
- Create: `apps/server/src/advertising/domain/business-date.ts`
- Create: `apps/server/src/advertising/domain/listing-match.ts`
- Create: `apps/server/src/advertising/domain/scrape-row-normalizers.ts`
- Create: `apps/server/src/advertising/ingest/listing-ad-metric-accumulator.ts`
- Create: `apps/server/src/advertising/ingest/ad-campaign-ingest.handler.ts`
- Create: `apps/server/src/advertising/ingest/raw-scrape-ingest.handler.ts`
- Create: `apps/server/src/advertising/ingest/traffic-ingest.handler.ts`
- Create: `apps/server/src/advertising/ingest/coupang-ads-daily-ingest.handler.ts`
- Create: `apps/server/src/advertising/persistence/channel-scrape-run.persistence.ts`
- Create: `apps/server/src/advertising/persistence/channel-daily-fact.persistence.ts`
- Create: `apps/server/src/advertising/persistence/channel-account-kpi.persistence.ts`
- Create: `apps/server/src/advertising/persistence/scrape-target.persistence.ts`
- Move: `apps/server/src/advertising/services/read-models/ad-sync-listing-map.ts` to `apps/server/src/advertising/read-models/ad-sync-listing-map.ts`

**Behavior to preserve:**

- `AdSyncService.sync()` still dispatches `ad_campaign`, `raw_scrape`, `traffic`, and `coupang_ads_daily`.
- Matching priority remains `vendorItemId`/`externalOptionId` first, then `externalId`, then unmatched.
- Raw snapshot append happens before daily-fact upserts.
- Daily fact metric replays overwrite additive metric totals and increment only observation counters.
- `metaJson` source namespacing remains atomic and source-specific.
- `toBusinessDate()` keeps KST semantics for ISO strings and `YYYY-MM-DD` strings.
- Scrape run failure finalization still writes `status='error'` without hiding the original error.
- Scrape target create/mark/delete remains tenant-scoped.

**Steps:**

- [ ] Create the branch:

```bash
rtk git switch -c refactor/advertising-sync-ingest-layer
```

- [ ] Move the existing sync listing map read model out of `services/` and update imports:

```text
from: apps/server/src/advertising/services/read-models/ad-sync-listing-map.ts
to:   apps/server/src/advertising/read-models/ad-sync-listing-map.ts
```

Expected changed import:

```typescript
import { buildAdSyncListingMap } from '../read-models/ad-sync-listing-map';
```

- [ ] Extract business-date helpers from `AdSyncService` into `domain/business-date.ts`:

```typescript
export function toBusinessDate(raw: string | undefined | null): Date | null
export function currentBusinessDate(now?: Date): Date
export function resolveBusinessDate(...candidates: Array<string | undefined | null>): Date
```

The implementation must be copied from the current service and keep the KST offset behavior unchanged.

- [ ] Extract matching and primitive conversion helpers into `domain/listing-match.ts`:

```typescript
export interface ListingMap {
  externalOptionIdMap: Map<
    string,
    {
      listingId: string;
      listingOptionId: string;
      optionId: string | null;
      externalId: string;
    }
  >;
  externalIdMap: Map<string, { listingId: string }>;
}
export interface ListingMatch {
  listingId: string | null;
  listingOptionId: string | null;
  optionId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
}
export function matchListingFromRow(row: Record<string, unknown>, map: ListingMap): ListingMatch
export function matchStatusOf(match: ListingMatch): ScrapeMatchStatus
export function pickStringField(row: Record<string, unknown>, keys: string[]): string | null
```

Keep the public `AdSyncService.matchListingFromRow()` method as a thin wrapper so current tests and callers do not break.

- [ ] Extract row pairing and Wing normalizers into `domain/scrape-row-normalizers.ts`:

```typescript
export type ScrapeRowPair = {
  rawRow: Record<string, any>;
  normalizedRow: Record<string, any>;
  hasNormalizedRow: boolean;
};
export function asScrapeRow(row: unknown): Record<string, any>
export function pairScrapeRows(rawRowsInput?: unknown[], normalizedRowsInput?: unknown[]): ScrapeRowPair[]
export function normalizeWingListingState(row: Record<string, unknown>): ListingDailyState | null
export function normalizeWingOptionState(row: Record<string, unknown>): ListingOptionDailyState | null
```

- [ ] Extract the listing ad metric accumulator into `ingest/listing-ad-metric-accumulator.ts`:

```typescript
export type SummedListingAdMetrics = {
  adSpend: number;
  adRevenue: number;
  adImpressions: number;
  adClicks: number;
  adConversions: number;
  adOrders: number;
};
export type ListingAdMetricAccumulator = {
  companyId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  rawSnapshotId: string | null;
  productName: string | null;
  metaSource: string;
  metaRows: Array<Record<string, unknown>>;
  metrics: SummedListingAdMetrics;
};
export type AddListingAdMetricsInput = {
  companyId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  rawSnapshotId: string | null;
  productName: string | null;
  metaSource: string;
  metaRow: Record<string, unknown>;
  metrics: SummedListingAdMetrics;
};
export function addListingAdMetrics(accumulators: Map<string, ListingAdMetricAccumulator>, input: AddListingAdMetricsInput): void
export function buildListingAdMetaData(accumulator: ListingAdMetricAccumulator): Record<string, unknown>
export async function flushListingAdMetrics(scrapePersistence: ChannelDailyFactPersistence, accumulators: Map<string, ListingAdMetricAccumulator>): Promise<number>
```

If a class is cleaner, name it `ListingAdMetricAccumulatorBuffer` and keep it dependency-free except for the final flush callback.

- [ ] Split `ChannelScrapePersistenceService` into focused persistence modules:

```text
channel-scrape-run.persistence.ts       -> createRun, appendSnapshot, finalizeRun
channel-daily-fact.persistence.ts       -> upsertListingDaily, upsertOptionDaily, upsertAdTargetDaily, metaJson merge
channel-account-kpi.persistence.ts      -> upsertAccountKpi
scrape-target.persistence.ts            -> get/create/mark/delete scrape targets
```

Keep `ChannelScrapePersistenceService` as a temporary facade only if it reduces PR risk. The facade must contain no large logic after extraction.

- [ ] Extract `handleAdCampaign()` into `ingest/ad-campaign-ingest.handler.ts`.
- [ ] Extract `handleRawScrape()` into `ingest/raw-scrape-ingest.handler.ts`.
- [ ] Extract `handleTraffic()` into `ingest/traffic-ingest.handler.ts`.
- [ ] Extract `handleCoupangAdsDaily()` into `ingest/coupang-ads-daily-ingest.handler.ts`.

Each handler should accept explicit dependencies:

```typescript
type IngestHandlerDeps = {
  prisma: PrismaService;
  eventEmitter: EventEmitter2;
  scrapeRuns: ChannelScrapeRunPersistence;
  dailyFacts: ChannelDailyFactPersistence;
  accountKpis: ChannelAccountKpiPersistence;
};
```

Use constructor injection only if the handler becomes an `@Injectable()` provider; otherwise use plain functions/classes and avoid `advertising.module.ts` churn.

- [ ] Keep `AdSyncService` as the application service with these responsibilities only:

```typescript
async sync(payload: ExtensionSyncDto, companyId: string)
async getExtensionStatus(companyId: string)
async buildListingMap(companyId: string)
matchListingFromRow(row: Record<string, unknown>, map: ListingMap)
async getScrapeTargets(companyId: string)
async createScrapeTarget(url: string, label: string | undefined, category: string | undefined, companyId: string)
async markScraped(id: string, companyId: string)
async deleteScrapeTarget(id: string, companyId: string)
```

- [ ] Delete or collapse only these low-value mock assertions after the extracted integration coverage passes:

```text
apps/server/src/advertising/services/__tests__/ad-sync.spec.ts
  collapse daily-fact write interaction tests that duplicate channel-scrape-dual-write.pg.integration.spec.ts
  keep matching priority tests, KST date tests, scrape-target IDOR tests, and extension-status contract tests

apps/server/src/advertising/services/__tests__/channel-scrape-persistence.spec.ts
  keep or move the atomic metaJson merge test to channel-daily-fact.persistence.spec.ts
```

- [ ] Run focused unit tests:

```bash
rtk proxy sh -lc 'cd apps/server && npx vitest run --config vitest.config.ts src/advertising/services/__tests__/ad-sync.spec.ts src/advertising/services/__tests__/channel-scrape-persistence.spec.ts src/advertising/util/__tests__/ad-target-key.spec.ts'
```

- [ ] Run focused real-Postgres integration tests because raw SQL and daily-fact persistence moved:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk proxy sh -lc 'cd apps/server && DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npx vitest run --config vitest.config.integration.ts src/advertising/__tests__/channel-scrape-dual-write.pg.integration.spec.ts src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts'
rtk npm run db:test:down
```

- [ ] Run Phase 3B gates:

```bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

- [ ] Commit:

```bash
rtk git add apps/server/src/advertising
rtk git commit -m "refactor: split advertising sync ingest layer"
```

### Lane B: Action Rules And Execution Persistence

**Branch:** `refactor/advertising-action-execution-layer`

**Primary production files:**

- Modify: `apps/server/src/advertising/services/ad-action.service.ts`
- Modify: `apps/server/src/advertising/services/ad-execution.service.ts`
- Move: `apps/server/src/advertising/services/read-models/ad-action-read-model.ts` to `apps/server/src/advertising/read-models/ad-action-read-model.ts`
- Create: `apps/server/src/advertising/domain/ad-action-rules.ts`
- Create: `apps/server/src/advertising/domain/ad-execution-error-scrubber.ts`
- Create: `apps/server/src/advertising/persistence/ad-action.persistence.ts`
- Create: `apps/server/src/advertising/persistence/ad-execution.persistence.ts`
- Create: `apps/server/src/advertising/mappers/ad-action.mapper.ts`

**Behavior to preserve:**

- The five `AdAction` rules remain exactly as specified in `apps/server/src/advertising/CLAUDE.md`.
- Rule 1 still skips when `listingOptionId` is null and fires when live stock or latest observed channel stock is exactly zero.
- ROAS for rule decisions is recomputed from `revenue` and `spend`.
- `AdAction.adTargetDailyId` still points to the source `ChannelAdTargetDailySnapshot`.
- Approve/reject/reset creates or cancels `ExecutionTask` rows idempotently and tenant-scoped.
- Lease/report/heartbeat still scope worker/task/action writes by `companyId`.
- Execution error scrubbing still redacts known secret patterns.

**Steps:**

- [ ] Create the branch:

```bash
rtk git switch -c refactor/advertising-action-execution-layer
```

- [ ] Move `ad-action-read-model.ts` out of `services/`:

```text
from: apps/server/src/advertising/services/read-models/ad-action-read-model.ts
to:   apps/server/src/advertising/read-models/ad-action-read-model.ts
```

Expected changed import:

```typescript
import {
  findAdActionsForReview,
  findLatestAdActionTargetRows,
  findLatestListingOptionStockById,
} from '../read-models/ad-action-read-model';
```

- [ ] Extract pure rule creation from `ad-action.service.ts` into `domain/ad-action-rules.ts`:

```typescript
export type ActionCandidate = {
  adTargetDailyId: string;
  listingId: string | null;
  actionType: string;
  targetType: AdActionTargetType;
  externalId: string | null;
  targetLabel: string;
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  currentValue: number | null;
  proposedValue: number | null;
  payload: Record<string, unknown>;
};
export function createActionCandidate(
  row: LatestTargetRow,
  optionDailyStockMap: Map<string, number | null>,
): ActionCandidate | null
export function calcProfitRate(option: {
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: number | null;
}): number | null
```

Move `basePayload`, `roundBudget`, `roundBid`, `formatNumber`, and `isPaused` with it unless a mapper owns a cleaner boundary. The module must not import `PrismaService`.

- [ ] Extract `ad-action.persistence.ts` for lifecycle write invariants:

```typescript
export async function createAdActionsFromCandidates(prisma: PrismaService, companyId: string, candidates: ActionCandidate[]): Promise<AdAction[]>
export async function approveAdActions(prisma: Prisma.TransactionClient, ids: string[], companyId: string): Promise<void>
export async function rejectAdActions(prisma: Prisma.TransactionClient, ids: string[], companyId: string): Promise<void>
export async function resetFailedAdActions(prisma: Prisma.TransactionClient, companyId: string): Promise<void>
export async function updateActionOrThrow(prisma: PrismaService | Prisma.TransactionClient, id: string, companyId: string, data: Prisma.AdActionUpdateManyMutationInput): Promise<void>
```

Each write must use `companyId` in the actual write predicate or use a tenant-scoped read followed by a write inside the same transaction.

- [ ] Keep `AdActionService` focused on orchestration:

```typescript
async getActions(query: AdActionQuery, companyId: string)
async generateActions(companyId: string)
async approveActions(ids: string[], companyId: string)
async rejectActions(ids: string[], companyId: string)
async markRunning(id: string, beforeJson: Record<string, unknown> | undefined, companyId: string)
async markDone(id: string, afterJson: Record<string, unknown> | undefined, companyId: string)
async markFailed(id: string, errorMessage: string | undefined, afterJson: Record<string, unknown> | undefined, companyId: string)
async resetFailed(companyId: string)
```

- [ ] Extract secret scrubbing from `ad-execution.service.ts` into `domain/ad-execution-error-scrubber.ts`:

```typescript
export const REDACTED_PLACEHOLDER = '[REDACTED]';
export function scrubExecutionError(input: string): string
```

Keep the existing patterns and output unchanged.

- [ ] Extract `ad-execution.persistence.ts` for worker/task write invariants:

```typescript
export type LeaseOptions = { label?: string; pageType?: string; limit?: number };
export type LeasedExecutionTask = {
  actionId: string;
  taskId: string;
  actionType: string;
  targetType: string;
  targetLabel: string;
  targetRef: string;
  priority: string;
  executionMode: 'browser';
  payload: Record<string, unknown>;
};
export type ExecutionReportInput = {
  taskId: string;
  workerKey: string;
  status: 'running' | 'done' | 'failed';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  errorMessage?: string;
  screenshotPath?: string;
  logs?: Array<{ level?: string; step: string; message: string; payload?: Record<string, unknown> }>;
};
export async function upsertExecutionWorkerForLease(
  prisma: PrismaService,
  workerKey: string,
  options: LeaseOptions | undefined,
  companyId: string,
): Promise<{ id: string; workerKey: string }>;
export async function leaseQueuedTasks(
  prisma: PrismaService,
  worker: { id: string; workerKey: string },
  requestedPageType: string,
  limit: number,
  companyId: string,
): Promise<LeasedExecutionTask[]>;
export async function heartbeatWorkerOrThrow(
  prisma: PrismaService,
  workerKey: string,
  meta: { currentUrl?: string; currentPageType?: string } | undefined,
  companyId: string,
): Promise<void>;
export async function findScopedExecutionTask(
  prisma: PrismaService,
  taskId: string,
  companyId: string,
): Promise<ScopedExecutionTask | null>;
export async function reportExecutionTask(
  prisma: PrismaService,
  body: ExecutionReportInput,
  task: ScopedExecutionTask,
  companyId: string,
): Promise<void>;
```

Only create methods that enforce a real invariant. Do not wrap simple Prisma CRUD calls unless they are part of a tenant-scoped task/action transaction.

- [ ] Delete or collapse only these low-value mock assertions after focused tests pass:

```text
apps/server/src/advertising/services/__tests__/ad-action.spec.ts
  move five-rule examples to domain/ad-action-rules.spec.ts with real objects
  keep lifecycle IDOR tests only when they are not already covered by ad-action-flow.pg.integration.spec.ts

apps/server/src/advertising/services/__tests__/ad-execution.spec.ts
  keep tenant-scoped lease/report conflict tests and secret scrubbing tests
  remove call-shape-only assertions that build/scanner already protect
```

- [ ] Run focused unit tests:

```bash
rtk proxy sh -lc 'cd apps/server && npx vitest run --config vitest.config.ts src/advertising/services/__tests__/ad-action.spec.ts src/advertising/services/__tests__/ad-execution.spec.ts'
```

- [ ] Run focused real-Postgres integration tests because task/action transactions moved:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk proxy sh -lc 'cd apps/server && DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npx vitest run --config vitest.config.integration.ts src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts'
rtk npm run db:test:down
```

- [ ] Run Phase 3B gates:

```bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

- [ ] Commit:

```bash
rtk git add apps/server/src/advertising
rtk git commit -m "refactor: split advertising action execution layer"
```

### Lane C: Strategy, Campaign, Benchmark, And Hub Read Models

**Branch:** `refactor/advertising-strategy-read-models`

**Primary production files:**

- Modify: `apps/server/src/advertising/services/ad-strategy.service.ts`
- Modify: `apps/server/src/advertising/services/ad-campaigns.service.ts`
- Modify: `apps/server/src/advertising/services/ad-benchmark.service.ts`
- Modify: `apps/server/src/advertising/services/advertising.service.ts`
- Move: `apps/server/src/advertising/services/read-models/ad-listing-read-model.ts` to `apps/server/src/advertising/read-models/ad-listing-read-model.ts`
- Move: `apps/server/src/advertising/services/util/ad-strategy-helpers.ts` to `apps/server/src/advertising/read-models/ad-strategy-context-read-model.ts` or split it across read models and mappers
- Create: `apps/server/src/advertising/read-models/ad-campaign-read-model.ts`
- Create: `apps/server/src/advertising/read-models/ad-benchmark-read-model.ts`
- Create: `apps/server/src/advertising/read-models/ad-extension-status-read-model.ts` if Lane A has not already extracted it
- Create: `apps/server/src/advertising/domain/ad-metrics.ts`
- Create: `apps/server/src/advertising/domain/strategy-context.ts`
- Create: `apps/server/src/advertising/mappers/ad-listing.mapper.ts`
- Create: `apps/server/src/advertising/mappers/ad-campaign.mapper.ts`
- Create: `apps/server/src/advertising/mappers/ad-strategy.mapper.ts`

**Behavior to preserve:**

- `GET /api/ads` list/hub summaries still derive from `ChannelListingDailySnapshot`.
- `GET /api/ads/campaigns` still uses campaign target rows from `ChannelAdTargetDailySnapshot`.
- `GET /api/ads/campaigns/trends` still recomputes ratios from sums and computes ABC grade budget from hydrated listings.
- `GET /api/ads/strategy/rules`, `/plan`, `/recommend`, and `/exposure` return the same shapes and thresholds.
- `registerCampaign()` keeps listing IDOR checks, duplicate guard, action creation, and task creation semantics.
- `AdBenchmarkService.getDiagnosis()` keeps defaults from `AdConfigService` and listing-primary output.

**Steps:**

- [ ] Create the branch:

```bash
rtk git switch -c refactor/advertising-strategy-read-models
```

- [ ] Move `ad-listing-read-model.ts` out of `services/` and update imports in `advertising.service.ts`, `ad-campaigns.service.ts`, `ad-benchmark.service.ts`, and any action read model that uses it.

- [ ] Extract shared metric functions to `domain/ad-metrics.ts`:

```typescript
export function buildAdMetrics(sums: {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}): AdMetrics
export function periodToDays(period: '7d' | '14d' | 'month', fallback?: number): number
export function periodCutoff(period: '7d' | '14d' | 'month'): Date
export function aggregateAdMetrics(entries: { metrics: AdMetrics }[]): AdMetrics
```

Use existing `recomputeRoas`, `recomputeCtr`, and `recomputeCvr`.

- [ ] Extract campaign read queries to `read-models/ad-campaign-read-model.ts`:

```typescript
export async function findCampaignRollups(prisma: PrismaService, companyId: string, period: CampaignsPeriod, campaignName?: string): Promise<CampaignRollup[]>
export async function findAdTrendDailyRows(prisma: PrismaService, companyId: string, days: number): Promise<AdTrendDailyRow[]>
export async function findGradeBudgetInputs(prisma: PrismaService, companyId: string, listingIds: string[]): Promise<Map<string, 'A' | 'B' | 'C' | null>>
```

Keep raw SQL tenant predicates and tagged templates inside this file.

- [ ] Extract campaign response mapping to `mappers/ad-campaign.mapper.ts`:

```typescript
export function toAdCampaignSnapshot(
  rollup: CampaignRollup & { listingId: string },
  listing: ScopedAdListingReadModel,
  period: CampaignsPeriod,
): AdCampaignSnapshot | null
export function toAdTrendsData(input: {
  dailyRows: AdTrendDailyRow[];
  gradeBudget: Record<'A' | 'B' | 'C', number>;
  dayCount: number;
}): AdTrendsData
```

The mapper must not call Prisma.

- [ ] Extract strategy context loading to `read-models/ad-strategy-context-read-model.ts`:

```typescript
export async function loadStrategyContext(
  prisma: PrismaService,
  adConfigService: AdConfigService,
  companyId: string,
  year: number,
  month: number,
): Promise<StrategyContext>
export async function loadChannelStateByListing(
  prisma: PrismaService,
  companyId: string,
  listings: HydratedListing[],
): Promise<Map<string, ChannelStateSignal>>
export async function loadLeadTimeByListing(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<Map<string, number | null>>
export async function hydrateListings(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<HydratedListing[]>
export async function getInventorySnapshot(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<Map<string, InventoryRow>>
```

Raw SQL latest-row queries stay tagged and tenant-bound.

- [ ] Extract pure strategy helper functions to `domain/strategy-context.ts`:

```typescript
export function uniqueIds(ids: Array<string | null | undefined>): string[]
export function buildGradeMap(listings: HydratedListing[]): Map<string, 'A' | 'B' | 'C' | null>
export function toGradeMapStrict(map: Map<string, 'A' | 'B' | 'C' | null>): Map<string, 'A' | 'B' | 'C'>
export function toAdAggregateRows(rows: ChannelListingDailyAggregateRow[]): AdAggregateRow[]
export function adAggregatesToMetricSnapshots(adGroups: AdAggregateRow[]): Array<{ listingId: string; spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>
export function firstOptionByListing(inventory: Map<string, InventoryRow>): Map<string, string>
export function sumListingStock(inventory: Map<string, InventoryRow>, listingId: string): number
export function computeListingProfitRate(inv: InventoryRow | null): number
export function emptyMetrics(listingId: string): ListingMetricsRow
```

- [ ] Keep `AdStrategyService` as endpoint orchestration only:

```typescript
async getRules(period: '7d' | '14d' | 'month', companyId: string)
async getWeeklyPlan(period: '7d' | '14d' | 'month', companyId: string)
async getAiEnhancedPlan(period: '7d' | '14d' | 'month', companyId: string)
async getRecommendations(companyId: string)
async getExposureAnalysis(companyId: string)
async registerCampaign(dto: RegisterCampaignDto, companyId: string)
```

- [ ] Keep `registerCampaign()` in `AdStrategyService` unless it grows during this PR. It is a write use case with IDOR and duplicate-guard semantics, and moving it is not required for this lane.

- [ ] Extract `advertising.service.ts` hub/list read queries to read-model functions only if it reduces duplicated `ChannelListingDailySnapshot` group/hydration logic. Keep `changeTier()` in the service because it is a small write use case.

- [ ] Delete or collapse only these low-value mock assertions after focused tests pass:

```text
apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts
  remove orchestration-delegation tests that only assert sub-service calls
  keep or replace with pure domain tests for profit-rate scale and public behavior covered by ad-strategy-flow.pg.integration.spec.ts

apps/server/src/advertising/controllers/__tests__/advertising.controller.spec.ts
  collapse endpoint-by-endpoint delegation tests if build and service tests already prove route signatures
  keep companyId propagation and POST /actions BadRequest dispatch tests

apps/server/src/advertising/services/__tests__/ad-campaigns.spec.ts
apps/server/src/advertising/services/__tests__/ad-benchmark.spec.ts
apps/server/src/advertising/services/__tests__/advertising.spec.ts
  keep money/ad-budget/public-shape assertions
  remove Prisma call-shape-only assertions when read-model tests or integration tests protect the same risk
```

- [ ] Preserve these tests unless a stronger same-PR replacement is added:

```text
apps/server/src/advertising/services/__tests__/ad-grade-rules.spec.ts
apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts
apps/server/src/advertising/services/__tests__/ad-exposure.spec.ts
apps/server/src/advertising/util/__tests__/ratio-recompute.spec.ts
apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts
apps/server/src/advertising/__tests__/ad-benchmark-flow.pg.integration.spec.ts
```

- [ ] Run focused unit tests:

```bash
rtk proxy sh -lc 'cd apps/server && npx vitest run --config vitest.config.ts src/advertising/services/__tests__/ad-strategy.spec.ts src/advertising/services/__tests__/ad-campaigns.spec.ts src/advertising/services/__tests__/ad-benchmark.spec.ts src/advertising/services/__tests__/advertising.spec.ts src/advertising/services/__tests__/ad-grade-rules.spec.ts src/advertising/services/__tests__/ad-budget-allocator.spec.ts src/advertising/services/__tests__/ad-exposure.spec.ts src/advertising/util/__tests__/ratio-recompute.spec.ts'
```

- [ ] Run focused real-Postgres integration tests because raw SQL strategy/campaign read models moved:

```bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk proxy sh -lc 'cd apps/server && DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npx vitest run --config vitest.config.integration.ts src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts src/advertising/__tests__/ad-benchmark-flow.pg.integration.spec.ts'
rtk npm run db:test:down
```

- [ ] Run Phase 3B gates:

```bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

- [ ] Commit:

```bash
rtk git add apps/server/src/advertising
rtk git commit -m "refactor: split advertising strategy read models"
```

## Merge Order

Preferred order:

1. Lane A, because it moves `ad-sync-listing-map.ts` and may establish `read-models/`.
2. Lane B, because it moves `ad-action-read-model.ts` and may depend on the root `read-models/` folder.
3. Lane C, because it touches the broadest reporting/strategy surface and benefits from the final folder layout.

Parallel execution is still possible if each worker owns only its lane files and rebases after Lane A lands. When conflicts happen, preserve the newest imports that point at root-level `read-models/`, `domain/`, `persistence/`, `ingest/`, and `mappers/`.

## Test Cleanup Inventory

Protected tests:

- `apps/server/src/advertising/__tests__/channel-scrape-dual-write.pg.integration.spec.ts`
- `apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts`
- `apps/server/src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts`
- `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts`
- `apps/server/src/advertising/__tests__/ad-benchmark-flow.pg.integration.spec.ts`
- `apps/server/src/advertising/util/__tests__/ad-target-key.spec.ts`
- `apps/server/src/advertising/util/__tests__/ratio-recompute.spec.ts`
- Pure calculator/rule tests for grade rules, budget allocation, and exposure scoring.

Cleanup candidates with required rationale:

| File | Cleanup rule |
|---|---|
| `apps/server/src/advertising/controllers/__tests__/advertising.controller.spec.ts` | Keep company propagation and command dispatch validation. Remove exhaustive endpoint delegation tests if no DTO/route behavior is asserted. |
| `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts` | Remove call-count/delegation tests after public behavior remains covered by integration and pure domain tests. |
| `apps/server/src/advertising/services/__tests__/ad-sync.spec.ts` | Keep matching priority, KST, scrape-target IDOR, and status-contract cases. Remove mocked daily-fact write scripts duplicated by integration. |
| `apps/server/src/advertising/services/__tests__/ad-action.spec.ts` | Move five-rule cases to pure domain tests. Keep or remove lifecycle mock tests based on `ad-action-flow.pg.integration.spec.ts` coverage. |
| `apps/server/src/advertising/services/__tests__/ad-campaigns.spec.ts` | Keep ratio/money/public-shape cases. Remove raw Prisma call-shape assertions after `ad-campaign-read-model` and integration tests pass. |
| `apps/server/src/advertising/services/__tests__/ad-benchmark.spec.ts` | Keep industry average/default and empty-state behavior. Remove dependency call-shape assertions if integration covers the read contract. |
| `apps/server/src/advertising/services/__tests__/advertising.spec.ts` | Keep `changeTier()` validation/IDOR and ROAS recompute. Remove duplicated hub read mock plumbing after mapper/read-model tests exist. |
| `apps/server/src/advertising/services/__tests__/ad-execution.spec.ts` | Keep worker conflict, tenant scope, and secret redaction. Remove simple `toHaveBeenCalledWith` plumbing that scanner/build covers. |

Every PR that deletes or collapses tests must include this evidence in the PR body:

```text
Test cleanup:
- Removed/collapsed:
- Risk still protected by:
- Focused test command:
- Scanner/build gate:
```

## PR Checklist

Each Lane PR body must include:

```text
Phase 3B advertising architecture refactor

Production structure change:
- Fat service(s) touched:
- New internal layer files:
- Public API/shared contract changes: none
- Schema changes: none
- Shared root imports added: none

Test cleanup:
- Removed/collapsed:
- Risk still protected by:
- Focused test command:

Verification:
- npm run check:idor
- npm run check:tenant-scope
- focused advertising unit/integration command(s)
- npm run build --workspace=apps/server
- npm run dev:server
```

## Final Completion Gate

After all three lanes are merged into `main`, run the full advertising Phase 3B closeout:

```bash
rtk git switch main
rtk git pull --ff-only
rtk npm run check:shared-root-imports
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk proxy sh -lc 'cd apps/server && npx vitest run --config vitest.config.ts src/advertising'
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk proxy sh -lc 'cd apps/server && DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npx vitest run --config vitest.config.integration.ts src/advertising'
rtk npm run db:test:down
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Closeout acceptance:

- `ad-sync.service.ts` below 700 lines.
- `channel-scrape-persistence.service.ts` below 700 lines or replaced by smaller focused persistence helpers.
- `ad-strategy.service.ts` below 500 lines.
- No new `@kiditem/shared` root imports.
- No route/shared contract/schema changes unless a separate approved contract PR exists.
- Test count is lower or more focused where mock-only tests were redundant.
- PR evidence shows production-code structure improvement, not only docs/tests.
