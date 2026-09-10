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

## Keyword Grain

`ad_keyword` reads the per-ad keyword table behind the ad centre "키워드 보기"
modal (`cmg-api/tableMetric` with `tableType='keyword'`), not the report grid.

- Collection is its own producer (`advertising.ad_keyword`), triggered from the
  dashboard collection modal. It enumerates every campaign from
  `tetris-api/campaigns` (each campaign carries its `groupList`) without page
  navigation or a dependency on the 31-day campaign sweep.
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
  shared `AI_TEXT_MODEL` and returns an error when model selection is missing.
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
  `CHANNEL_SKU_AVAILABILITY_PORT`; use that projection as the sole stock balance
  instead of marketplace SKU metadata.
- Advertising intentionally reads/writes channel daily fact models because the
  scrape ingest path owns raw/fact projection traceability.
- Product ABC reads go through Products' exported stored-grade port. An
  unclassified product stays `null`; consume the stored grade without deriving
  a product grade or coercing a missing/stale source to C.
- Advertising evidence used by ABC preserves `OBSERVED`, `CONFIRMED_ZERO`, and
  `NOT_APPLIED`. `MISSING`/`STALE` is not an advertising cost of zero.
- Account-level `CONFIRMED_ZERO` describes the rows returned, not the range
  asked for. Treat it as proof of no spend only when the published rows cover
  every business date in the window; otherwise the uncovered dates are missing
  evidence.
- Revenue, operating-profit contribution, rank, and cumulative share are
  reporting metrics only; none changes the absolute ABC grade.
- Reach Channels through its exported port rather than concrete services.

## Boundary Rules

- KST business date conversion goes through `toBusinessDate()`.
- Period views derive from daily facts; ratios recompute from summed raw
  values instead of provider ratios.
- Listing facts match `vendorItemId` to `ChannelListingOption`, then
  `externalId` to a Coupang `ChannelListing`; preserve unmatched raw evidence.
- Build target keys only with `buildAdTargetKey()` and return an error when no
  stable identifier exists.
