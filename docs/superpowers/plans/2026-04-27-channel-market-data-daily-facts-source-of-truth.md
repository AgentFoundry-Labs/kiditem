# Channel Market-Data Source-of-Truth Direction — Daily Facts First

Status: hard-rewrite direction locked for post-C5 implementation
Created: 2026-04-27 KST
Applies to: channel / advertising / traffic / dashboard strategy data
Depends on: C0-C5 channel market-data waves
Implementation plan: `docs/superpowers/plans/2026-04-27-channel-market-data-hard-rewrite-implementation-plan.md`

## Decision

KidItem channel market-data should converge on **daily channel facts as source-of-truth**.

If the external source is collected by product/listing/day, then the database source-of-truth must also be product/listing/day. Weekly, 14-day, monthly, and arbitrary period views are derived by filtering and aggregating daily facts; they are not separate source-of-truth rows.

This direction is stronger than the C5 checkpoint. C5 preserved legacy metric sources because the first channel snapshot schema only normalized product/option state. From this point forward, the target architecture is:

```text
ChannelScrapeRun / ChannelScrapeSnapshot   // raw audit + replay
  ↓ normalize
ChannelListingDailySnapshot                // listing-day state + additive product metrics
ChannelListingOptionDailySnapshot          // option-day state + additive option metrics where available
ChannelAccountDailyKpiSnapshot             // account/store-day KPI summary when not product-grained
  ↓ query aggregation
7d / 14d / month / custom period views
```

Legacy advertising/traffic models are no longer the target architecture. Because the current DB can be treated as disposable for this campaign, prefer a hard rewrite: define daily facts, rewrite ingestion/read paths against them, then delete legacy market-data models/code in the same campaign once tests prove replacement behavior.

## Core rule

> Period data is derived. Daily fact data is source-of-truth.

Examples:

| Metric | Store in daily fact? | Period calculation |
|---|---:|---|
| ad spend | yes | `SUM(adSpend)` |
| ad revenue | yes | `SUM(adRevenue)` |
| impressions | yes | `SUM(impressions)` |
| clicks | yes | `SUM(clicks)` |
| conversions | yes | `SUM(conversions)` |
| visitors | yes | `SUM(visitors)` |
| views | yes | `SUM(views)` |
| cart adds | yes | `SUM(cartAdds)` |
| orders | yes | `SUM(orders)` |
| sales quantity | yes | `SUM(salesQty)` |
| ROAS | no, or stored only as provider-observed reference | `SUM(adRevenue) / SUM(adSpend) * 100` |
| CTR | no | `SUM(clicks) / SUM(impressions)` |
| CVR | no | `SUM(conversions) / SUM(clicks)` |

Ratio fields from a provider may be kept in raw/metadata for audit, but product decisions should recompute ratios from additive daily numerators and denominators.

## Grain policy

### Listing daily fact

Canonical grain:

```text
companyId + channel + listingId + businessDate
```

This is the primary candle-like product market-data row. It should hold product/listing-level daily state and additive metrics:

- product state: price, sale/exposure status, rank, review count/rating;
- winner state: isOfferWinner, myPrice, winnerPrice, winnerGapPrice;
- ad additive metrics: adSpend, adRevenue, impressions, clicks, conversions, direct/indirect orders/qty/revenue when available;
- traffic additive metrics: visitors, views, cartAdds, orders, salesQty, trafficRevenue when available;
- observation metadata: sampleCount, firstObservedAt, lastObservedAt, rawSnapshotId, source coverage metadata.

Current table: `ChannelListingDailySnapshot` already owns this listing-day identity. Prefer extending it over creating a parallel listing-day source-of-truth table, unless implementation proves the row would become too sparse or write-contention-heavy.

### Option daily fact

Canonical grain:

```text
companyId + channel + listingOptionId + businessDate
```

`ChannelListingOptionDailySnapshot` remains the canonical option/vendor-item daily row. It should hold option-level state and option-level additive metrics only when the source truly provides option-grained metrics.

Internal `ProductOption.optionId` may stay nullable. `listingOptionId` is the channel identity.

### Account/dashboard daily KPI

Some Wing dashboard KPI rows are not product/listing grained. They should not be forced into listing daily facts.

Use a separate account/store daily KPI model when needed, for example:

```text
ChannelAccountDailyKpiSnapshot
```

Canonical grain:

```text
companyId + channel + source + businessDate
```

Purpose:

- account/store-level Wing dashboard KPI;
- provider KPI cards not attributable to one listing;
- normalized KPI JSON plus raw/replay link.

## Legacy model replacement direction

The campaign should replace, not indefinitely migrate around, the legacy market-data quartet.

| Legacy model | Replacement direction |
|---|---|
| `ItemWinner` | Delete after current winner reads and Wing status are backed by latest `ChannelListingDailySnapshot.isOfferWinner`. |
| `TrafficStats` | Delete after traffic daily metrics live in listing daily facts and traffic/dashboard reads aggregate from them. |
| `Ad` | Delete after ad daily additive metrics and any required campaign/keyword target facts replace all strategy/campaign/finance reads. |
| `AdSnapshot` | Delete as a metric/status dependency after `ChannelScrapeSnapshot` covers raw replay and daily facts cover normalized metrics/KPI reads. |

`ChannelScrapeSnapshot` remains the durable raw audit/replay layer. Deleting legacy models does not mean deleting raw history; it means raw history lives in the channel scrape layer, while normalized facts live in daily fact tables.

## Hard rewrite implementation shape

Do not treat this as a slow compatibility migration unless production data preservation becomes a requirement. The faster path is a bounded hard rewrite of the market-data pipeline:

### H1 — Define the replacement source-of-truth schema

Add/extend daily fact tables before rewriting reads:

1. Extend `ChannelListingDailySnapshot` with listing-day additive ad/traffic metric fields when the source is product/listing/day grained.
2. Extend `ChannelListingOptionDailySnapshot` only for true option-day metrics.
3. Add `ChannelAccountDailyKpiSnapshot` for account/store-level dashboard KPI rows that cannot be attributed to a listing.
4. Add a target-level ad daily fact only if campaign/keyword/action reads require campaign/keyword grain that listing-day facts cannot represent.

Do not add period-specific tables.

### H2 — Rewrite ingestion against daily facts

For every extension/API payload:

- write `ChannelScrapeRun` / `ChannelScrapeSnapshot` first for raw audit/replay;
- normalize additive metrics into daily facts;
- upsert by daily grain;
- recompute ratios from additive numerators/denominators;
- do not dual-write to legacy models unless an endpoint is not yet rewritten in the same branch.

### H3 — Rewrite reads and UI contracts

Move period views to daily-fact aggregation:

- extension status and collect status;
- ad strategy aggregates and action generation inputs;
- campaign trends/read models;
- traffic dashboard;
- dashboard profit/ad summary;
- finance ad-spend consumers.

### H4 — Delete legacy market-data code/models in the same campaign

After H1-H3 compile and tests prove replacement behavior:

- delete legacy writes;
- delete runtime reads;
- delete obsolete tests and fixtures;
- remove Prisma models `Ad`, `AdSnapshot`, `TrafficStats`, `ItemWinner` only if every runtime consumer has moved;
- update RLS, ERD, Graphify, generated Prisma client, and docs.

If one model cannot be deleted because a runtime consumer still needs a grain not represented in daily facts, stop and add the missing daily fact grain rather than preserving the legacy model as architecture.

## Non-goals

- Do not keep weekly/monthly source tables just because screens show weekly/monthly views.
- Do not average ROAS/CTR/CVR across days; recompute from summed numerators/denominators.
- Do not force account-level KPI into product facts.
- Do not delete raw scrape history.
- Do not remove extension compatibility before the extension contract is updated.

## Verification expectations

Every schema/read migration wave must prove:

- same company isolation;
- daily idempotency;
- period aggregation correctness;
- ratio recomputation correctness;
- no direct frontend DB access;
- Graphify/ERD regenerated after schema or schema-consumer changes.
