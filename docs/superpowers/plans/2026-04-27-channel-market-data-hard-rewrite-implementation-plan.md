# Implementation Plan — Hard Rewrite Channel Market-Data Pipeline to Daily Facts

Status: ready for coding handoff
Created: 2026-04-27 KST
Recommended branch: `refactor/channel-market-data-hard-rewrite`
Supersedes: status-only C6 rewire scope
Related direction docs:
- `docs/superpowers/plans/2026-04-27-channel-market-data-daily-facts-source-of-truth.md`
- `docs/superpowers/plans/2026-04-27-channel-market-data-c6-current-state-rewire.md`
- `docs/superpowers/plans/2026-04-27-channel-market-data-legacy-audit.md`

## 1. Goal

Replace the legacy market-data pipeline built around `Ad`, `AdSnapshot`, `TrafficStats`, and `ItemWinner` with a channel-generic daily-fact pipeline.

The current DB can be treated as disposable for this campaign. Prefer direct schema/code replacement over slow compatibility migration. Preserve raw scrape replay in `ChannelScrapeRun` / `ChannelScrapeSnapshot`; make normalized daily facts the source-of-truth for product/listing/day analytics.

## 2. Non-negotiable decisions

1. **Daily facts are source-of-truth** for listing/option/day market data.
2. **Period views are derived** via filtering + aggregation over daily facts.
3. **Ratios are recomputed**, not summed/averaged:
   - ROAS = `SUM(adRevenue) / SUM(adSpend) * 100`
   - CTR = `SUM(adClicks) / SUM(adImpressions)`
   - CVR = `SUM(adConversions) / SUM(adClicks)`
4. **Raw source rows stay in `ChannelScrapeSnapshot`** for audit/replay.
5. **No period-specific source tables** (`7d`, `14d`, `month`) are allowed.
6. **Legacy market-data models are deletion candidates**, not permanent dependencies.
7. **No native PG enums**; use `String` + app validation.
8. **No frontend DB access**; all frontend reads go through NestJS API.
9. **No new ADR files**; scoped docs/plans carry this campaign decision.

## 3. Current legacy runtime consumer inventory

Verified with:

```bash
rg -n '\b(prisma|this\.prisma)\.(adSnapshot|trafficStats|itemWinner|ad)\.' \
  apps/server/src --glob '*.ts' --glob '!**/__tests__/**' --glob '!**/*.spec.ts'
```

Primary runtime consumers to rewrite:

| Area | Current dependency | Replacement direction |
|---|---|---|
| `AdSyncService.getExtensionStatus` | `AdSnapshot`, `ItemWinner` | `ChannelScrapeRun`/`ChannelScrapeSnapshot`, latest `ChannelListingDailySnapshot`, account KPI fact |
| `AdSyncService` ingestion | writes `AdSnapshot`, `Ad`, `TrafficStats`, `ItemWinner` | write raw scrape + daily facts only |
| `AdCollectService.getStatus` | `AdSnapshot` latest/count | `ChannelScrapeRun` latest/count |
| `AdActionService.getActions` summary | `AdSnapshot` latest | `ChannelScrapeRun` / target daily fact latest |
| `AdActionService.generateActions` | `AdSnapshot.findMany` | channel ad target daily facts + listing/option daily state |
| `AdCampaignsService` | `AdSnapshot`, `Ad` | ad target/listing daily facts aggregated by period |
| `AdStrategyService` | `Ad`, `TrafficStats` | listing daily fact aggregation |
| `AdvertisingService` hub | `Ad` | listing daily fact aggregation |
| `AdBenchmarkService` | `Ad` | listing daily fact aggregation |
| `common/per-listing-profit.ts` | `Ad` | listing daily fact aggregation |
| dashboard ad/profit helpers | `AdSnapshot`, `Ad` | account KPI fact + listing daily facts |
| finance sales analysis | `Ad` | listing daily fact aggregation |
| `traffic.service.ts` | `TrafficStats` | listing daily traffic fields |
| test helpers | `Ad` seed | seed daily facts instead |

## 4. Cleanup plan before deleting code

Because this is cleanup/refactor plus schema replacement, follow this order:

1. Add replacement schema first.
2. Add/adjust tests around replacement semantics before deleting legacy code.
3. Rewrite ingestion and read paths to use replacement facts.
4. Run consumer search for legacy models.
5. Delete only after runtime consumers are gone.
6. Regenerate Prisma, ERD, Graphify, and update RLS/read-only policy.
7. Remove obsolete tests/fixtures only after replacement tests pass.

## 5. Target schema

### 5.1 Extend `ChannelListingDailySnapshot`

Use this as the primary listing-day fact row.

Add additive metric fields with explicit prefixes to avoid ambiguity between ad metrics and traffic metrics:

```text
adSpend
adRevenue
adImpressions
adClicks
adConversions
adOrders
adDirectOrders1d
adIndirectOrders1d
adDirectQty1d
adIndirectQty1d
adDirectRevenue1d
adIndirectRevenue1d
adTotalOrders14d
adDirectOrders14d
adIndirectOrders14d
adTotalQty14d
adDirectQty14d
adIndirectQty14d
adTotalRevenue14d
adDirectRevenue14d
adIndirectRevenue14d

trafficVisitors
trafficViews
trafficCartAdds
trafficOrders
trafficSalesQty
trafficRevenue
```

Notes:

- Store additive numerator/denominator fields only.
- Provider ratios can stay in `metaJson` if needed for audit, but reads recompute ratios.
- Keep unique key `@@unique([companyId, listingId, businessDate])`.
- Repeated same-day scrape updates the one daily row and increments sample/coverage metadata.

### 5.2 Extend `ChannelListingOptionDailySnapshot`

Only add option-day metrics if the source truly supplies option-grained metrics. Do not duplicate listing-day metrics at option level just for convenience.

Potential fields:

```text
adSpend
adRevenue
adImpressions
adClicks
adConversions
trafficVisitors
trafficViews
trafficOrders
trafficRevenue
```

If source payloads are listing-only, skip these fields.

### 5.3 Add `ChannelAdTargetDailySnapshot`

Needed if campaign/keyword/action reads require a grain narrower than listing-day facts.

Recommended model grain:

```text
companyId + channel + businessDate + targetType + targetKey
```

`targetKey` must be a deterministic non-null canonical key to avoid nullable unique ambiguity. Build it from stable available fields, for example:

```text
campaign:<campaignId || campaignName>
keyword:<campaignId || campaignName>:<adGroup>:<keyword>
product:<externalId || listingId>:<campaignId || campaignName>
```

Recommended fields:

```text
id
companyId
channel
businessDate
listingId?
listingOptionId?
optionId?
externalId?
externalOptionId?

targetType          // campaign | keyword | product | ad_product
targetKey
campaignId?
campaignName?
adGroup?
keyword?
placement?
status?
onOff?
currentBid?
dailyBudget?

spend
revenue
impressions
clicks
conversions
orders
adSpend
adRevenue
rawSnapshotId?
metaJson?
sampleCount
firstObservedAt
lastObservedAt
createdAt
updatedAt
```

Indexes:

```text
@@unique([companyId, channel, businessDate, targetType, targetKey])
@@index([companyId, channel, businessDate])
@@index([listingId, businessDate])
@@index([listingOptionId, businessDate])
@@index([companyId, targetType, businessDate])
@@index([rawSnapshotId])
```

### 5.4 Add `ChannelAccountDailyKpiSnapshot`

Use this for account/store-level Wing dashboard KPI rows that cannot be attributed to one listing.

Recommended grain:

```text
companyId + channel + source + businessDate + kpiType
```

Recommended fields:

```text
id
companyId
channel
source
kpiType
businessDate
periodStart?
periodEnd?
normalizedJson
rawJson?
rawSnapshotId?
sampleCount
firstObservedAt
lastObservedAt
createdAt
updatedAt
```

Indexes:

```text
@@unique([companyId, channel, source, businessDate, kpiType])
@@index([companyId, channel, businessDate])
@@index([rawSnapshotId])
```

### 5.5 Update relations / remove legacy relations

When deleting legacy models:

- Remove `Ad`, `AdSnapshot`, `TrafficStats`, `ItemWinner` from `prisma/models/advertising.prisma` only after consumers are rewritten.
- Replace `AdAction.snapshotId -> AdSnapshot` with a daily fact reference:
  - preferred: `adTargetDailyId -> ChannelAdTargetDailySnapshot`
  - optional: `rawSnapshotId -> ChannelScrapeSnapshot` for audit link
- Add reverse relations where Prisma validation requires them.
- Update `prisma/3layer-setup.sql` for new/removed company-scoped tables.
- Update `prisma/AGENTS.md` model/RLS table lists if counts are hard-coded.

## 6. Implementation sequence

### Phase H1 — Schema replacement

Files likely touched:

- `prisma/models/channels.prisma`
- `prisma/models/advertising.prisma`
- `prisma/models/core.prisma` reverse relations if required
- `prisma/3layer-setup.sql`
- `prisma/AGENTS.md`
- generated `docs/ERD.md`, `graphify-out/**`

Tasks:

1. Add metric fields to listing/option daily snapshots.
2. Add `ChannelAdTargetDailySnapshot` if campaign/keyword grain is required.
3. Add `ChannelAccountDailyKpiSnapshot`.
4. Add RLS/read-only policy for new company-scoped tables.
5. Keep legacy models temporarily if service code still references them during the branch.

Gate:

```bash
npm run db:push
npx prisma generate
npm run db:3layer-setup
```

### Phase H2 — Rewrite ingestion

Files likely touched:

- `apps/server/src/advertising/services/ad-sync.service.ts`
- `apps/server/src/advertising/services/channel-scrape-persistence.service.ts`
- `apps/server/src/advertising/dto/extension-sync.dto.ts` if shape needs type updates
- advertising ingestion integration tests

Tasks:

1. Preserve raw rows via `ChannelScrapeRun` / `ChannelScrapeSnapshot` first.
2. Normalize Wing item-winner rows into listing/option daily state.
3. Normalize ad campaign / coupang ads daily rows into listing daily metrics and target daily facts.
4. Normalize traffic rows into listing daily traffic fields.
5. Normalize Wing/account KPI rows into `ChannelAccountDailyKpiSnapshot`.
6. Remove writes to `Ad`, `AdSnapshot`, `TrafficStats`, `ItemWinner` once replacement writes/tests pass.

Tests:

- Raw row preserved for every payload.
- Listing daily metrics upsert idempotently.
- Target daily fact upserts idempotently by `targetKey`.
- Account KPI upserts idempotently.
- Ratio fields are not trusted as source; ratios recompute in reads.
- Unmatched rows remain raw-only unless listing/target identity is sufficient.

### Phase H3 — Rewrite reads

Files likely touched:

- `apps/server/src/advertising/services/ad-sync.service.ts`
- `apps/server/src/advertising/services/ad-collect.service.ts`
- `apps/server/src/advertising/services/ad-action.service.ts`
- `apps/server/src/advertising/services/ad-strategy.service.ts`
- `apps/server/src/advertising/services/ad-campaigns.service.ts`
- `apps/server/src/advertising/services/advertising.service.ts`
- `apps/server/src/advertising/services/ad-benchmark.service.ts`
- `apps/server/src/common/per-listing-profit.ts`
- `apps/server/src/dashboard/helpers/**`
- `apps/server/src/finance/services/sales-analysis.service.ts`
- `apps/server/src/traffic/traffic.service.ts`
- shared schemas + web ad-ops if response shape/copy changes

Tasks:

1. `getExtensionStatus`: latest listing daily + account KPI + scrape run metadata.
2. `getCollectStatus`: scrape run metadata.
3. `AdAction.getActions`: latest channel scrape/target daily metadata.
4. `AdAction.generateActions`: target daily fact rows + listing/option daily state.
5. Strategy aggregates: aggregate `ChannelListingDailySnapshot` over requested period.
6. Campaign trends: aggregate `ChannelAdTargetDailySnapshot` / listing daily facts.
7. Traffic dashboard: aggregate traffic fields from listing daily facts.
8. Dashboard/finance/profit helpers: aggregate ad spend/revenue from listing daily facts.
9. Frontend copy: label current-state and derived-period metrics correctly.

Tests:

- Period aggregation correctness for 7d/14d/month/custom.
- ROAS/CTR/CVR recompute from sums.
- Current winner counts use latest daily state only.
- Existing action thresholds remain unchanged unless tests document a necessary grain adjustment.
- Empty-state behavior does not fall back to legacy rows.

### Phase H4 — Delete legacy market-data models/code

Tasks:

1. Run consumer search for legacy models.
2. Delete runtime references.
3. Remove Prisma models:
   - `Ad`
   - `AdSnapshot`
   - `TrafficStats`
   - `ItemWinner`
4. Remove or rewrite tests/fixtures that seed those models.
5. Update relation fields such as `AdAction.snapshotId`.
6. Regenerate Prisma client, ERD, Graphify.

Required proof before deletion claim:

```bash
rg -n '\b(prisma|this\.prisma)\.(adSnapshot|trafficStats|itemWinner|ad)\.' \
  apps/server/src --glob '*.ts'
```

Expected runtime result: no production references. Test-only references must be replacement tests or removed fixtures.

## 7. API / shared contract policy

- Prefer preserving endpoint URLs.
- Response fields may change semantics to daily-fact/current-state if names remain compatible.
- If a field name becomes misleading, rename it and update web/shared together.
- `@kiditem/shared` schemas should describe daily-fact semantics, not legacy model names.

## 8. Verification commands

Run after schema/read rewrite:

```bash
npm run db:push
npx prisma generate
npm run db:3layer-setup
cd packages/shared && npm run build
cd apps/server && npx vitest run src/advertising src/channels src/traffic src/dashboard src/finance
cd apps/server && npm run build
npm run build --workspace=apps/web
npm run db:erd
npm run graphify:schema
git diff --check
```

Also run targeted integration tests for extension ingestion and daily fact aggregation using real Postgres when feasible.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Campaign/keyword grain does not fit listing daily facts | Add `ChannelAdTargetDailySnapshot`, do not preserve `AdSnapshot` as architecture |
| Dashboard KPI is account-level, not product-level | Add `ChannelAccountDailyKpiSnapshot`, do not force into listing facts |
| Ratio math regression | Store additive fields and test recomputed ROAS/CTR/CVR |
| Cross-domain breakage | Rewrite direct consumers in same campaign; run advertising/channels/traffic/dashboard/finance tests |
| Prisma relation churn after model deletion | Delete legacy models only after replacing `AdAction.snapshotId` and reverse relations |
| Graphify/ERD drift | Run `npm run db:erd && npm run graphify:schema` before PR |

## 10. Handoff prompt summary

Use this plan as the implementation source. Do not revive the status-only C6 plan. The coding task is a hard rewrite: daily facts first, reads rewritten, then legacy market-data models removed once consumers are gone.
