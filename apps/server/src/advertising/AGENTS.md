# advertising — Ad Operations

Advertising owns Coupang ad operations, scrape ingest, daily fact projection,
strategy/action generation, and ad-action execution. It is organization-scoped
and based on the products 3-layer model (`MasterProduct`, `ProductOption`,
`ChannelListing`).

Advertising is hexagonal-complete: port/adapter, application, and domain lanes
own ingest, daily facts, strategy/action generation, and ad-action execution.
New behavior goes under the layout below. The legacy `services/` facade exists
only for compatibility and must not receive new business logic.

## Layout

```text
advertising/
  adapter/in/http/             /api/ads/* controllers
  adapter/in/http/dto/         HTTP DTO classes (moved from root dto/)
  adapter/out/repository/      13 *.repository.adapter.ts + daily-fact-helpers.ts
  adapter/out/automation/      cross-domain consumer adapter (operation-alert.adapter.ts)
  application/port/out/        14 outgoing ports + daily-fact-meta.ts + repository-transaction.ts
  application/service/         orchestration (Prisma-free) + 4 @Injectable() ingest handler classes
  domain/                      pure rules/normalizers/metrics/policies + ad-trend.ts
  domain/util/                 pure helpers (moved from root util/)
  mapper/                      row/DTO/domain mapping
  services/                    grandfathered facade only (channel-scrape-persistence.service.ts)
```

New Nest application services go in `application/service/`. Ingest handlers
(`raw-scrape-ingest.handler.ts`, `ad-campaign-ingest.handler.ts`,
`coupang-ads-daily-ingest.handler.ts`, `traffic-ingest.handler.ts`) are
`@Injectable()` classes orchestrated by `AdSyncService`. The only `services/`
survivor is `channel-scrape-persistence.service.ts`, a compatibility facade
delegating to repository adapters and consumed by existing integration tests.

## Architecture Guards

Invariants enforced by `__tests__/advertising.architecture.spec.ts`:

- `PrismaService` is imported only under `adapter/out/repository/**`.
- No `*persistence.ts` files survive (migration-waypoint naming).
- `application/**` is Prisma-free (no `@prisma/client` or `Prisma.*` types).
- `application/service/**` does not import `adapter/out/**`; concrete adapters
  reach services only via Nest token bindings to `application/port/out/*`.
- `application/service/**` does not import other owner-domain services
  directly; cross-owner reach goes through `adapter/out/{owner}/` port +
  adapter pairs.
- `domain/**` is free of NestJS, Prisma, `PrismaService`, HTTP DTO classes, and
  incoming-adapter modules.
- No top-level `dto/`, `util/`, or `adapter/out/prisma/` folders remain.
  Final shape uses `adapter/in/http/dto/`, `domain/util/`, and
  `adapter/out/repository/`.
- `services/` accepts only the grandfathered
  `channel-scrape-persistence.service.ts` facade.

`application/port/in/**` is intentionally omitted because no other owner domain
consumes advertising use cases today; controllers inject application services
directly while that remains true.

### Cross-Domain Boundary

Advertising consumes `automation.OperationAlertService` through
`application/port/out/operation-alert.port.ts` bound to
`adapter/out/automation/operation-alert.adapter.ts`. The adapter currently
wraps the concrete automation service directly. This is **transitional**: when
automation publishes its own owner-side incoming port from
`automation/application/port/in/`, the advertising adapter swaps to depend on
that port instead of the concrete service. Until then, this is the only
sanctioned cross-owner reach from `application/service/**`.

## Source-Of-Truth Facts

| Concern | Model |
|---|---|
| listing/day metrics and state | `ChannelListingDailySnapshot` |
| option/day metrics and state | `ChannelListingOptionDailySnapshot` |
| campaign/keyword/product target/day metrics | `ChannelAdTargetDailySnapshot` |
| account/store KPI | `ChannelAccountDailyKpiSnapshot` |
| raw audit/replay row | `ChannelScrapeRun` + `ChannelScrapeSnapshot` |
| executable ad action | `AdAction` with `adTargetDailyId` |

Rules:

- Period views derive from daily facts by summing additive metrics.
- Ratios are recomputed from sums via `util/ratio-recompute.ts`; provider ratios
  are audit data only.
- Provider daily totals overwrite on replay; `sampleCount` increments per
  observation.
- Raw snapshot append happens before daily-fact upsert. Raw rows are audit/
  replay evidence, not primary read models for UI.
- `metaJson` is source-namespaced (`{ source, data }`). Source-key collision is
  forbidden.
- Dev data replay uses the same ingest path:
  `POST /api/ads/extension/sync`.

## Channel Coupling Exception

Advertising writes and reads channel daily fact models even though they live in
the channels Prisma namespace. This exception exists because the scrape ingest
entrypoint is `/api/ads/extension/sync` and raw/fact projection must stay
traceable in one path. Do not inject `ChannelSyncService`.

## Ingest Flow

```text
Extension/Wing payload
  -> POST /api/ads/extension/sync
  -> AdSyncService.sync
  -> build listing map by organization/channel
  -> append ChannelScrapeRun/Snapshot
  -> upsert listing/option daily facts
  -> upsert ad-target daily facts
  -> upsert account KPI facts
  -> strategy/action services read fact projections
```

Listing match priority:

1. `vendorItemId` -> `ChannelListingOption.externalOptionId`
2. `externalId` -> `ChannelListing.externalId` with `platform='coupang'`
3. unmatched -> raw snapshot preserved; daily fact skipped

`buildAdTargetKey()` is the only target-key builder. It must throw if no stable
identifier exists; no `unknown:unknown` rows.

## Business Date And Ratios

- KST business date conversion goes through `toBusinessDate()` only.
- Do not slice dates directly in handlers.
- ROAS = `SUM(adRevenue) / SUM(adSpend) * 100`
- CTR = `SUM(adClicks) / SUM(adImpressions)`
- CVR = `SUM(adConversions) / SUM(adClicks)`

## AdAction Rules

`AdAction` rules are target-daily based. Thresholds are currently hardcoded.

| Rule | Condition | Action |
|---|---|---|
| 1 | stock=0 and campaign dailyBudget>0 | set daily budget to 3000 |
| 2 | keyword zero conversion with spend>=5000, or ROAS in `(0,100)` | pause keyword |
| 3 | keyword ROAS in `[100,200)` | bid * 0.85 |
| 4 | campaign grade A and ROAS>=480 | budget * 1.2 |
| 5 | campaign grade C or ROAS<100, budget>3000 | budget down to max(3000, 50%) |

Rule 1 requires a target row with option identity. Stock signal uses latest
`ChannelListingOptionDailySnapshot.stockQty`, then live
`ProductOption.availableStock`.

## Hard Rules

- Every service method receives `organizationId` and scopes reads/writes by it.
- Single-resource GET/PATCH/DELETE uses `findFirst({ id, organizationId })`.
- No default organization lookup.
- No direct channel service injection.
- No synthetic market-data seed writer that bypasses real ingest.
- No raw snapshot as primary UI/API read model.
- No provider ratio trust for decision metrics.
- `targetType` values come from `AD_ACTION_TARGET_TYPES`.

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/advertising
npm run build --workspace=apps/server
npm run dev:server
```

Use integration tests for ingest idempotency, raw-first behavior, tenant scope,
and action execution lifecycle changes.
