# advertising — Ad Operations

Advertising owns Coupang ad operations, scrape ingest, daily fact projection,
strategy/action generation, and ad-action execution. It is organization-scoped
and based on the products 3-layer model (`MasterProduct`, `ProductOption`,
`ChannelListing`).

## Architecture Mode

Mode: Mixed Reconstruction.

Advertising uses adapter/application/domain lanes for ingest, daily facts, and
ad actions. New behavior goes under the layout below. The legacy `services/`
facade exists only for compatibility and must not receive new business logic.

## Layout

```text
advertising/
  adapter/in/http/        /api/ads/* controller + DTOs
  adapter/out/prisma/     persistence/query adapters
  application/service/    orchestration, ingest handlers, action execution
  domain/                 pure rules/normalizers/metrics/policies
  mapper/                 row/DTO/domain mapping
  services/               transitional facade only; no new services here
  util/                   existing pure helpers; do not copy this pattern
```

New Nest application services go in `application/service/`. The only
`services/` survivor is `channel-scrape-persistence.service.ts`, a compatibility
facade over Prisma adapter functions used by existing integration tests.

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
