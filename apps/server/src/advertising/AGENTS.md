# advertising — Ad Operations

`src/advertising/` owns Coupang ad operations, keyword/SERP tracking,
competitor aggregation, scrape ingest, daily fact projection, strategy/action
generation, and ad-action execution. It works over Sellpia `MasterProduct`
cost evidence and the marketplace
`ChannelListing`/`ChannelListingOption` model, and is organization-scoped
throughout.

## Ownership

- Advertising owns Coupang ad facts, keyword/SERP evidence, competitor
  observations, strategy proposals, and approved ad-action execution.
- Raw scrape evidence and daily fact projections remain organization-scoped and
  auditable. Advertising is the canonical writer for its own facts; consumers
  use its read contracts rather than mutating channel tables directly.

## Main Data Models

- `ChannelScrapeRun` and `ChannelScrapeSnapshot` are raw audit/replay evidence.
- `ChannelListingDailySnapshot` and `ChannelListingOptionDailySnapshot` are
  listing/option daily facts.
- `ChannelAdTargetDailySnapshot` is the campaign/keyword/product target daily
  fact. `targetType='keyword'` rows are the exception to "daily": they are
  trailing-window observations (see Keyword Grain below).
- `ChannelAccountDailyKpiSnapshot` is the account/store KPI fact.
- `AdAction` is the executable action record and is target-daily based.

## Keyword Grain

`ad_keyword` reads the per-ad keyword table behind the ad centre "키워드 보기"
modal (`cmg-api/tableMetric` with `tableType='keyword'`), not the report grid.

- Collection is its own producer (`advertising.ad_keyword`), triggered from the
  dashboard collection modal. It enumerates every campaign from
  `tetris-api/campaigns` (each campaign carries its `groupList`) and never
  navigates, so it does not depend on the 31-day campaign sweep finishing.
- A one-day window returns an empty keyword table. Collection uses a trailing
  multi-day window (7 days), `businessDate` is the window END, and
  `metaJson.data.windowDays` records its width.
- These rows are therefore NOT additive. `findKeywordTargetRollups` takes the
  latest observation per keyword; summing two collections double-counts their
  overlap.
- The report grid's `키워드` column holds a modal-open button, not a keyword.
  `normalizeAdKeyword()` rejects those control labels at the domain boundary.
- `replaceCampaignDay` is grain-scoped through `replaceScope`. The campaign
  sweep owns `['campaign','product']` and keyword ingest owns `['keyword']`;
  neither producer may mark the other's rows stale.
- Relevance is judged **per advertised product**: the question is only
  answerable against a specific product, and one product can hold hundreds of
  keywords (953 observed; 7,613 across 42 products). One judgement call per
  product, capped per product and per run, with the remainder reported.
- The judgement is a language call through AI's `TEXT_JUDGEMENT_PORT`, wrapped
  by advertising's `KEYWORD_RELEVANCE_JUDGE_PORT` seam. It uses the explicit
  shared `AI_TEXT_MODEL`; there is no fallback model.
- Keyword relevance judgement is a scoped exception to the root rule that LLM
  judgement starts from Agent OS. This path is a bounded direct-AI capability:
  fixed prompt/schema/model, no autonomous tool use or planning, and output
  only becomes human-reviewed `AdAction` proposals.
- The model only proposes. `toKeywordPauseCandidates` rejects unknown refs,
  drifted keywords, missing rationale, and keywords that converted; survivors
  become `pause_keyword` AdActions in `pending_review` and still require human
  approval before the extension executes them.

## Cross-Domain Boundaries

- A source attempt ends at Advertising's `COMPLETE`/`FAILED` owner record and
  complete manifest. It does not invoke ABC or another downstream calculation;
  readers use only the latest complete advertising snapshot.
- Sellable-stock reads go through Channels' exported read-only
  `CHANNEL_SKU_AVAILABILITY_PORT`; Advertising never computes a second stock
  balance or reads stock fields from marketplace SKU metadata.
- Advertising intentionally reads/writes channel daily fact models because the
  scrape ingest path owns raw/fact projection traceability.
- Product ABC reads go through Products' exported stored-grade port. An
  unclassified product stays `null`; Advertising must not calculate a product
  grade or coerce a missing/stale source to C.
- Advertising evidence used by ABC preserves `OBSERVED`, `CONFIRMED_ZERO`, and
  `NOT_APPLIED`. `MISSING`/`STALE` is not an advertising cost of zero.
- Revenue, operating-profit contribution, rank, and cumulative share are
  reporting metrics only; none changes the absolute ABC grade.
- Advertising must not inject concrete Channels services.

## Boundary Rules

- KST business date conversion goes through `toBusinessDate()`.
- Period views derive from daily facts; ratios recompute from summed raw
  values and do not trust provider ratios.
- Listing facts match `vendorItemId` to `ChannelListingOption`, then
  `externalId` to a Coupang `ChannelListing`; preserve unmatched raw evidence.
- `buildAdTargetKey()` is the only target-key builder and must fail if no
  stable identifier exists.
