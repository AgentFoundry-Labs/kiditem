# Wave C5 Checkpoint — Legacy Channel Market-Data Consumer Audit

Status: completed 2026-04-27 KST
Branch: `feat/c5-channel-market-data-legacy-audit`
Plan reference: `.omx/plans/channel-market-data-daily-snapshots-plan.md` (the source plan lives outside the repo — `.omx/` is gitignored; this audit ships in `docs/superpowers/plans/` instead).

> **Superseded by PR 67 hard rewrite (2026-04-27)**: this file is retained as
> the C5 historical audit, not as current architecture guidance. The legacy
> quartet (`Ad`, `AdSnapshot`, `TrafficStats`, `ItemWinner`) has been removed
> from Prisma, runtime reads/writes have moved to channel daily facts, and the
> obsolete SQLite/Postgres migration scripts that targeted those tables were
> removed. Current source of truth: Prisma schema + service code. Graphify
> consumer graphs remain navigation artifacts only.

Original plan §7 labels Wave C5 as the **optional** `ProductStrategyDaily`
strategy cache, only to be built after C4 proves repeated expensive joins or a
strategy-history requirement. C4 did not prove either condition, so this PR does
not build that cache. It records the post-C4 legacy-consumer audit that decides
which reads can safely move later.

## TL;DR

After Wave C4 (`feat(advertising): expose channel state evidence for safer ad decisions`, commit `75997d8`), the strategy read path that should consume `ChannelListingDailySnapshot` / `ChannelListingOptionDailySnapshot` already does. **No additional 1:1 read-path migration is safe in this checkpoint; only later status/count semantics changes remain.**

Most remaining reads of the legacy quartet (`AdSnapshot` / `TrafficStats` / `ItemWinner` / `Ad`) read fields that the daily snapshot tables do not carry — ad metrics (spend / revenue / clicks / impressions / conversions), traffic metrics (visitors / views / orders), or wing KPI dashboard JSON. `ItemWinner` is the exception: daily snapshots already carry winner-state fields, but the remaining read is a lifetime observation count, while the daily-snapshot replacement would be a current/latest-state count. That user-visible semantics change is deferred as a C6 candidate. The C2/C3 dual-write therefore stays in place; daily snapshots stay additive evidence, not a replacement.

This document inventories every consumer, classifies its disposition, and lists the candidates that *could* migrate later. After this C5 checkpoint, the product decision changed: daily channel facts should become the long-term source-of-truth, and C6 should hard-switch eligible status/count surfaces to current-state channel market-data semantics. See `docs/superpowers/plans/2026-04-27-channel-market-data-daily-facts-source-of-truth.md` and `docs/superpowers/plans/2026-04-27-channel-market-data-c6-current-state-rewire.md`.

## Method

1. `rg -n "\b(prisma|this\.prisma)\.<model>\." apps/server/src --glob "*.ts"` for each of the four legacy models (excluding tests).
2. Cross-checked frontend (`apps/web/src/**`) — none reference the models directly (data flows through API responses only).
3. Cross-checked one-shot scripts (`scripts/migrate-*.ts`) — these are historical SQLite → Postgres migrations, not runtime consumers.
4. Confirmed each disposition by reading the consuming file's behavior.
5. Source files are the authority — `graphify-out/` is for navigation, not the source of truth (see `prisma/AGENTS.md` "ERD / Graphify 재생성").

## Disposition codes

- **SOURCE-OF-TRUTH** — model owns this field; no other table holds the data.
- **KEEP** — read remains on the legacy model because the replacement table does not carry the same grain or payload yet.
- **KEEP COMPATIBILITY WRITE** — write must continue because legacy reads still depend on it.
- **MIGRATED IN C4** — read already moved off legacy in a prior wave.
- **C6 CANDIDATE** — could be migrated later; needs measurement / a missing daily-snapshot field / a behavior-change decision before touching.
- **CANNOT DECIDE YET** — depends on a downstream wave (cache, multi-channel, etc.) before a defensible call can be made.

## Inventory

### `AdSnapshot` (model: advertising)

| Site | File | Operation | Disposition | Notes |
|---|---|---|---|---|
| ingest | `apps/server/src/advertising/services/ad-sync.service.ts` (lines 500, 511, 516, 558, 585, 590, 617, 646, 879, 961, 1218, 1353, 1364, 1379) | create / update / findFirst | **SOURCE-OF-TRUTH** + **KEEP COMPATIBILITY WRITE** | All four handlers (`handleAdCampaign`, `handleRawScrape`, `handleTraffic`, `handleCoupangAdsDaily`) write `AdSnapshot` rows. C2 dual-write into `ChannelScrapeRun` / `ChannelScrapeSnapshot` runs alongside, but the legacy rows are still the only place consumers find ad-level metrics + per-period rollups. |
| extension status | `apps/server/src/advertising/services/ad-sync.service.ts:89-91` (`getExtensionStatus`) | count / findFirst | **KEEP** + **C6 CANDIDATE** | `findFirst` reads wing KPI rawJson, which no daily snapshot carries. `snapshotCount` could later move to `ChannelScrapeSnapshot`/`ChannelScrapeRun`, but that changes the counted grain, so defer. |
| AdAction queue summary | `apps/server/src/advertising/services/ad-action.service.ts:79` | findFirst | **C6 CANDIDATE** | Only feeds `latestSnapshotAt` / `latestSnapshotPageType` on the action queue summary. Could later use `ChannelScrapeRun`/`ChannelScrapeSnapshot` latest scrape metadata after choosing the exact source/pageType mapping. |
| AdAction generation | `apps/server/src/advertising/services/ad-action.service.ts:114` | findMany | **SOURCE-OF-TRUTH** | The 5 snapshot-level rules (campaign / keyword) operate on raw `AdSnapshot` rows with `pageType ∈ {campaign, keyword, product}`. Daily snapshot has no `roas` / `clicks` / `impressions` per row — different grain. |
| collect status | `apps/server/src/advertising/services/ad-collect.service.ts:18, 23, 28, 29` | findFirst / count | **C6 CANDIDATE** | Returns `lastCollectedAt` + counts per `level`. Equivalent could come from `ChannelScrapeRun.startedAt` aggregated by `pageType` once we decide whether `level` semantics map cleanly to `(source, pageType)`. Cosmetic change — defer. |
| campaigns rollup | `apps/server/src/advertising/services/ad-campaigns.service.ts:60-76` | findMany | **KEEP** | Returns per-campaign metrics by period (`level='campaign', period`). Daily snapshot has no per-campaign aggregation. |
| dashboard wing summary | `apps/server/src/dashboard/helpers/wing-ad-summary.ts:33-58` | $queryRaw + findFirst | **KEEP** | Reads `raw_json.adSummary.adGmv` from wing dashboard snapshots. Daily snapshot has no `adSummary` field. |
| dashboard profit calc | `apps/server/src/dashboard/helpers/profit-calculator.ts:103, 109` | aggregate / findMany | **KEEP** | Latest-period ad spend rollup with month-over-month proration. Daily snapshot has no `spend`. |

### `TrafficStats` (model: advertising)

| Site | File | Operation | Disposition | Notes |
|---|---|---|---|---|
| ingest | `apps/server/src/advertising/services/ad-sync.service.ts:1186` (`handleTraffic`) | upsert | **SOURCE-OF-TRUTH** | Per-listing per-period traffic facts. Plan §7 explicitly keeps traffic metrics in `TrafficStats` for now. |
| traffic domain ingest | `apps/server/src/traffic/traffic.service.ts:197` | upsert | **SOURCE-OF-TRUTH** | Traffic domain has its own ingest path (separate from extension scrape). |
| traffic dashboard | `apps/server/src/traffic/traffic.service.ts:270, 274, 367` | aggregate / groupBy | **SOURCE-OF-TRUTH** | `/api/traffic/summary` aggregations. |
| strategy exposure | `apps/server/src/advertising/services/ad-strategy.service.ts:206` (`getExposureAnalysis`) | findMany | **KEEP** | Pulls revenue / orders / date for the most recent two periods. Daily snapshot has no traffic metrics. |

### `ItemWinner` (model: advertising)

| Site | File | Operation | Disposition | Notes |
|---|---|---|---|---|
| ingest | `apps/server/src/advertising/services/ad-sync.service.ts:862` (`handleRawScrape` wing branch) | create | **KEEP COMPATIBILITY WRITE** | Append-only legacy row for per-vendorItem winner observations. C2 `ChannelScrapeSnapshot` already preserves the raw audit trail before legacy filters; `ItemWinner` remains for exact compatibility with existing status reads. |
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
| Handler dispatch (`AdSyncService.sync`) | **KEEP** | All four payload types (`ad_campaign` / `raw_scrape` / `traffic` / `coupang_ads_daily`) still write legacy rows + C2 raw scrape rows. Only payloads with product/option state feed C3 daily listing/option snapshots; ad metric rows intentionally stay out of daily state facts. Cannot drop any handler without removing legacy reads first. |

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
| `scripts/migrate-ad-data.ts` | `ItemWinner` / `AdSnapshot` | **REMOVED in PR 67** — target tables no longer exist. |
| `scripts/migrate-dashboard-data.ts` | `TrafficStats`, `ItemWinner`, `AdSnapshot`, `Ad` | **REMOVED in PR 67** — target tables no longer exist. |
| `scripts/split-prisma-schema.py` | mentions `AdSnapshot` in tooling output | Schema-splitter helper. **KEEP**. |

## C2 / C3 dual-write necessity

| Layer | Required? | Reason |
|---|---|---|
| `ChannelScrapeRun` / `ChannelScrapeSnapshot` (C2) | YES | Replayable raw row capture. No replacement consumer exists. Required for parser/matching iteration without re-scraping. |
| `ChannelListingDailySnapshot` / `ChannelListingOptionDailySnapshot` (C3) | YES | Sole feed for C4 strategy state evidence + future C6 read consolidation. |
| Legacy `AdSnapshot` / `TrafficStats` / `ItemWinner` / `Ad` writes (`ad-sync.service.ts`) | NO | Superseded by PR 67 hard rewrite; all runtime consumers now use channel daily facts / account KPI facts. |

**Current conclusion after PR 67**: dual-write is no longer the steady-state
contract. Raw rows go to `ChannelScrapeSnapshot`; listing/option/target/account
daily facts are the source-of-truth for market-data reads.

## C6 current-state rewire candidates

None of the legacy quartet is safely deletable today. However, the user-visible status/count reads below should move in C6 from legacy lifetime/snapshot semantics to current channel market-data semantics. The implementation contract is in `docs/superpowers/plans/2026-04-27-channel-market-data-c6-current-state-rewire.md`.

1. **`ItemWinner.groupBy({ by: ['isWinner'] })` in `getExtensionStatus`** — hard-switch to latest/current `ChannelListingDailySnapshot.isOfferWinner` per listing. Existing lifetime observation count is no longer desired for status UX.
2. **`AdSnapshot.count` in `getExtensionStatus`** — replace status-count semantics with C2 `ChannelScrapeRun` / `ChannelScrapeSnapshot` based counts. Number differences from legacy `AdSnapshot` are intentional and must be reflected in copy/tests.
3. **`AdSnapshot.findFirst` in `ad-action.service.ts:listActions`** — replace latest queue-summary metadata with latest C2 run/snapshot metadata. Action generation rules may still use `AdSnapshot` because they require ad metric rows.
4. **`AdSnapshot.findFirst+count` in `ad-collect.service.ts:getStatus`** — use `ChannelScrapeRun.finishedAt ?? startedAt` and run/snapshot counts instead of legacy `level` counts where possible.

None were touched in C5 — no code changes shipped from this audit. C6 is expected to implement the hard switch for these status/read surfaces, not preserve both meanings indefinitely.

## Cannot-decide-yet items

- Whether `ChannelListingDailySnapshot` should grow ad-metric fields (`adSpend` / `adRevenue`) so `Ad` becomes redundant. **Resolved directionally** — daily listing facts should carry listing-day additive metrics when the source is product/listing/day grained. Implementation belongs to C7/C8, not C6.
- Whether wing KPI dashboard JSON (currently `AdSnapshot(source='wing', pageType='itemwinner_kpi'/'dashboard_kpi')`) should move into `ChannelScrapeRun.metaJson` or a new `ChannelKpiSnapshot` table. **Defer** — needs a multi-channel view of what "KPI dashboard" means before designing.

## Verification

No code changes; this PR is documentation-only. Verification commands run anyway to confirm nothing on the branch drifted:

- `cd apps/server && npx vitest run src/advertising src/channels` — pass
- `cd apps/server && npm run build` — pass
- `cd packages/shared && npm run build` — pass
- `npm run build --workspace=apps/web` — pass
- `git diff --check` — pass (whitespace clean)

No schema change → no `db:push` / `prisma generate` / `db:3layer-setup` / `db:erd` / `graphify:schema` re-run needed.
