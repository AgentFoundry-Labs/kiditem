# Wave C5 — Legacy Channel Market-Data Consumer Audit

Status: completed 2026-04-27 KST
Branch: `feat/c5-channel-market-data-legacy-audit`
Plan reference: `.omx/plans/channel-market-data-daily-snapshots-plan.md` (the source plan lives outside the repo — `.omx/` is gitignored; this audit ships in `docs/superpowers/plans/` instead).

## TL;DR

After Wave C4 (`feat(advertising): expose channel state evidence for safer ad decisions`, commit `75997d8`), the strategy read path that should consume `ChannelListingDailySnapshot` / `ChannelListingOptionDailySnapshot` already does. **No additional read-path migration is required in C5.**

Every remaining read of the legacy quartet (`AdSnapshot` / `TrafficStats` / `ItemWinner` / `Ad`) reads a field that the daily snapshot tables do not carry — ad metrics (spend / revenue / clicks / impressions / conversions), traffic metrics (visitors / views / orders), or wing KPI dashboard JSON. The C2/C3 dual-write therefore stays in place; daily snapshots stay additive evidence, not a replacement.

This document inventories every consumer, classifies its disposition, and lists the only candidate that *could* migrate later (deferred to C6 with measurement, not changed here).

## Method

1. `grep -rn 'prisma.<model>.' apps/server/src --include="*.ts"` for each of the four legacy models (excluding `__tests__`).
2. Cross-checked frontend (`apps/web/src/**`) — none reference the models directly (data flows through API responses only).
3. Cross-checked one-shot scripts (`scripts/migrate-*.ts`) — both are historical SQLite → Postgres migrations, not runtime consumers.
4. Confirmed each disposition by reading the consuming file's behavior.
5. Source files are the authority — `graphify-out/` is for navigation, not the source of truth (see `prisma/AGENTS.md` "ERD / Graphify 재생성").

## Disposition codes

- **SOURCE-OF-TRUTH** — model owns this field; no other table holds the data.
- **KEEP COMPATIBILITY WRITE** — write must continue because legacy reads still depend on it.
- **MIGRATED IN C4** — read already moved off legacy in a prior wave.
- **C6 CANDIDATE** — could be migrated later; needs measurement / a missing daily-snapshot field / a behavior-change decision before touching.
- **CANNOT DECIDE YET** — depends on a downstream wave (cache, multi-channel, etc.) before a defensible call can be made.

## Inventory

### `AdSnapshot` (model: advertising)

| Site | File | Operation | Disposition | Notes |
|---|---|---|---|---|
| ingest | `apps/server/src/advertising/services/ad-sync.service.ts` (lines 500, 511, 516, 558, 585, 590, 617, 646, 879, 961, 1218, 1353, 1364, 1379) | create / update / findFirst | **SOURCE-OF-TRUTH** + **KEEP COMPATIBILITY WRITE** | All four handlers (`handleAdCampaign`, `handleRawScrape`, `handleTraffic`, `handleCoupangAdsDaily`) write `AdSnapshot` rows. C2 dual-write into `ChannelScrapeRun` / `ChannelScrapeSnapshot` runs alongside, but the legacy rows are still the only place consumers find ad-level metrics + per-period rollups. |
| status | `apps/server/src/advertising/services/ad-sync.service.ts:89-91` (`getExtensionStatus`) | count / findFirst | **KEEP** | Uses `count` for "snapshotCount" sidebar + `findFirst` for the wing KPI rawJson. Daily snapshots have no `wing.kpis` payload field. |
| AdAction generation | `apps/server/src/advertising/services/ad-action.service.ts:79, 114` | findFirst / findMany | **SOURCE-OF-TRUTH** | The 5 snapshot-level rules (campaign / keyword) operate on raw `AdSnapshot` rows with `pageType ∈ {campaign, keyword, product}`. Daily snapshot has no `roas` / `clicks` / `impressions` per row — different grain. |
| collect status | `apps/server/src/advertising/services/ad-collect.service.ts:18, 23, 28, 29` | findFirst / count | **C6 CANDIDATE** | Returns `lastCollectedAt` + counts per `level`. Equivalent could come from `ChannelScrapeRun.startedAt` aggregated by `pageType` once we decide whether `level` semantics map cleanly to `(source, pageType)`. Cosmetic change — defer. |
| campaigns rollup | `apps/server/src/advertising/services/ad-campaigns.service.ts:60-76` | findMany | **KEEP** | Returns per-campaign metrics by period (`level='campaign', period`). Daily snapshot has no per-campaign aggregation. |
| dashboard wing summary | `apps/server/src/dashboard/helpers/wing-ad-summary.ts:33-58` | $queryRaw + findFirst | **KEEP** | Reads `raw_json.adSummary.adGmv` from wing dashboard snapshots. Daily snapshot has no `adSummary` field. |
| dashboard profit calc | `apps/server/src/dashboard/helpers/profit-calculator.ts:103, 109` | aggregate / findMany | **KEEP** | Latest-period ad spend rollup with month-over-month proration. Daily snapshot has no `spend`. |

### `TrafficStats` (model: advertising)

| Site | File | Operation | Disposition | Notes |
|---|---|---|---|---|
| ingest | `apps/server/src/advertising/services/ad-sync.service.ts:1186` (`handleTraffic`) | upsert | **SOURCE-OF-TRUTH** | Per-listing per-period traffic facts. Plan §7 explicitly keeps traffic metrics in `TrafficStats` for now. |
| traffic domain ingest | `apps/server/src/traffic/traffic.service.ts:197` | upsert | **SOURCE-OF-TRUTH** | Traffic domain has its own ingest path (separate from extension scrape). |
| traffic dashboard | `apps/server/src/traffic/traffic.service.ts:270, 274, 367` | aggregate / groupBy | **SOURCE-OF-TRUTH consumer** | `/api/traffic/summary` aggregations. |
| strategy exposure | `apps/server/src/advertising/services/ad-strategy.service.ts:206` (`getExposureAnalysis`) | findMany | **KEEP** | Pulls revenue / orders / date for the most recent two periods. Daily snapshot has no traffic metrics. |

### `ItemWinner` (model: advertising)

| Site | File | Operation | Disposition | Notes |
|---|---|---|---|---|
| ingest | `apps/server/src/advertising/services/ad-sync.service.ts:862` (`handleRawScrape` wing branch) | create | **KEEP COMPATIBILITY WRITE** | Append-only history of per-vendorItem winner observations. The C3 daily upsert covers the *latest* state per (listingOptionId, businessDate); `ItemWinner` retains the per-observation history. Until we decide whether daily snapshots should keep N-day history per option, the legacy write provides the only audit trail. |
| extension status | `apps/server/src/advertising/services/ad-sync.service.ts:95-99` (`getExtensionStatus`) | groupBy | **C6 CANDIDATE** | Counts `isWinner=true / false` lifetime rows. The intent (per the wing KPI sidebar) is "how many of my listings are winner right now" — that maps cleaner to `ChannelListingDailySnapshot.isOfferWinner` aggregated to one-row-per-listing latest businessDate. Migration semantics shift slightly (lifetime vs. current); defer to C6 with a small spec/test update. |

### `Ad` (model: advertising)

| Site | File | Operation | Disposition | Notes |
|---|---|---|---|---|
| ingest | `apps/server/src/advertising/services/ad-sync.service.ts:677` (`handleAdCampaign`) | create | **SOURCE-OF-TRUTH** | Per-day per-listing ad facts. Drives ROAS / spend trends and the AdAction rule engine. |
| strategy aggregates | `apps/server/src/advertising/services/ad-strategy.service.ts:167, 401, 406` | groupBy | **KEEP** | Lifetime + 14-day spend / revenue / clicks / impressions / conversions for ABC rules. C4 already added daily-snapshot state evidence alongside; ad metrics stay here. |
| campaign trends | `apps/server/src/advertising/services/ad-campaigns.service.ts:120` | findMany | **KEEP** | Day-by-day spend / revenue series for the campaigns trend chart. |
| benchmark | `apps/server/src/advertising/services/ad-benchmark.service.ts:66, 76` | aggregate / groupBy | **KEEP** | Industry diagnosis aggregates over `Ad`. |
| advertising hub | `apps/server/src/advertising/services/advertising.service.ts:87, 108` | findFirst / groupBy | **KEEP** | Hub list + `changeTier` lookup. |
| per-listing profit | `apps/server/src/common/per-listing-profit.ts:98` | groupBy | **KEEP** | Reused by strategy + finance to compute per-listing profit rate. |
| dashboard fallback | `apps/server/src/dashboard/helpers/profit-calculator.ts:151` | aggregate | **KEEP** | Fallback ad spend when AdSnapshot is empty. |
| sales analysis | `apps/server/src/finance/services/sales-analysis.service.ts:106` | groupBy | **KEEP** | Cross-domain consumer — finance pulls ad spend for sales analysis. |
| test seed | `apps/server/src/test-helpers/finance-seeds.ts:252` | create | **N/A** | Test helper. |

### `/api/ads/extension/sync` endpoint

| Aspect | Disposition | Notes |
|---|---|---|
| Request shape | **KEEP** | Browser extension contract; changing it requires extension updates. |
| Handler dispatch (`AdSyncService.sync`) | **KEEP** | All four payload types (`ad_campaign` / `raw_scrape` / `traffic` / `coupang_ads_daily`) still write both legacy + C2/C3 streams. Cannot drop any handler without removing legacy reads first. |

### Channel daily-snapshot consumers (added by C3 / C4)

| Site | File | Notes |
|---|---|---|
| upsert | `apps/server/src/advertising/services/channel-scrape-persistence.service.ts:262, 328` | C3 wing-only writer. |
| read | `apps/server/src/advertising/services/ad-strategy.service.ts:loadChannelStateByListing` | C4 `$queryRaw DISTINCT ON` per primary listingOption. |

No other consumer reads daily snapshots yet. The dashboard / finance / channels-domain dashboard services do **not** join against them — there's no current need.

### Frontend (`apps/web/src/**`)

`grep -rn "AdSnapshot\|TrafficStats\|ItemWinner" apps/web/src` returns zero hits. The frontend is API-only; it never references Prisma model names.

### Scripts (`scripts/**`)

| File | Refs | Disposition |
|---|---|---|
| `scripts/migrate-ad-data.ts` | `ItemWinner` | One-shot SQLite → Postgres migration (legacy import). Not a runtime consumer. **KEEP** as-is. |
| `scripts/migrate-dashboard-data.ts` | `TrafficStats`, `ItemWinner` | Same — historical migration script. **KEEP**. |
| `scripts/split-prisma-schema.py` | mentions `AdSnapshot` in tooling output | Schema-splitter helper. **KEEP**. |

## C2 / C3 dual-write necessity

| Layer | Required? | Reason |
|---|---|---|
| `ChannelScrapeRun` / `ChannelScrapeSnapshot` (C2) | YES | Replayable raw row capture. No replacement consumer exists. Required for parser/matching iteration without re-scraping. |
| `ChannelListingDailySnapshot` / `ChannelListingOptionDailySnapshot` (C3) | YES | Sole feed for C4 strategy state evidence + future C6 read consolidation. |
| Legacy `AdSnapshot` / `TrafficStats` / `ItemWinner` / `Ad` writes (`ad-sync.service.ts`) | YES | Every read path in the inventory above still depends on them. Cannot drop any single write until every consumer of that table moves off. |

**Conclusion**: dual-write is the steady-state contract until at least one full read-path migration round (C6 or later) clears a model.

## C6 deletion candidates (tentative)

None of the legacy quartet is safely deletable today. Two soft candidates for *partial* migration in C6, both requiring a behavior-change spec + test update:

1. **`ItemWinner.groupBy({ by: ['isWinner'] })` in `getExtensionStatus`** — semantically should be "how many listings are currently winner", which is `DISTINCT ON (listing_id) ChannelListingDailySnapshot.isOfferWinner` aggregated. Existing implementation counts every observation row, which is misleading per the wing sidebar copy. Migration changes a user-visible number — needs a UX confirm.
2. **`AdSnapshot.findFirst+count` in `ad-collect.service.ts:getStatus`** — `lastCollectedAt` could come from `ChannelScrapeRun.startedAt MAX()` filtered by `(source='advertising', pageType IN ('campaign','keyword','product'))`. Same data, less coupling. Defer until C6 because the `level` ↔ `(source, pageType)` mapping needs a one-time review.

Neither is touched in C5 — no code changes ship from this audit.

## Cannot-decide-yet items

- Whether `ChannelListingDailySnapshot` should grow ad-metric fields (`adSpend` / `adRevenue`) so `Ad` becomes redundant. **Defer to Plan C5-cache or C6** — depends on whether the optional `ProductStrategyDaily` cache lands first. Today the daily snapshot is intentionally product-state only.
- Whether wing KPI dashboard JSON (currently `AdSnapshot(source='wing', pageType='itemwinner_kpi'/'dashboard_kpi')`) should move into `ChannelScrapeRun.metaJson` or a new `ChannelKpiSnapshot` table. **Defer** — needs a multi-channel view of what "KPI dashboard" means before designing.

## Verification

No code changes; this PR is documentation-only. Verification commands run anyway to confirm nothing on the branch drifted:

- `cd apps/server && npx vitest run src/advertising src/channels` — pass
- `cd apps/server && npm run build` — pass
- `cd packages/shared && npm run build` — pass
- `npm run build --workspace=apps/web` — pass
- `git diff --check` — pass (whitespace clean)

No schema change → no `db:push` / `prisma generate` / `db:3layer-setup` / `db:erd` / `graphify:schema` re-run needed.
