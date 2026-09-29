Before working in this directory, always read this document first rather than relying on memory.

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
- The ad report ledger (see Ad Report) is the only ad fact source for
  readers. Inside the owner, reads go through `AD_LEDGER_READ_REPOSITORY_PORT`
  (`adapter/out/persistence/ad-ledger-read.persistence.adapter.ts`); other
  owners inject `ADVERTISING_LEDGER_READ_PORT` only.
- A measured day is a calendar day every active Coupang account's succeeded
  `advertising.ad_report` run window covers (`domain/ad-report-coverage`); a
  measured day without rows is 0, an unmeasured day is absent, never 0.
- Spend has two readings (`domain/ad-spend-rule`): profit uses
  `(billedSpend + account adjustment) × 1.1` ("광고비(청구·VAT 포함)");
  performance screens, rules, benchmark and strategy use delivered `spend`
  ("집행 광고비"). Conversions are the report's `orders`.
- Ad action rules read current `ChannelAdCampaign` state (active, budget)
  and the recent measured window (`readCurrentAdTargets`); there is no bid
  rule. A proposal's evidence is `payload.adTarget`.
- Approving an action of a `MANUAL_AD_ACTION_TYPES` type
  (`domain/manual-ad-action-types.ts`) records the operator's confirmation and
  prepares nothing; the operator applies the change in the ad center.
- Raw scrape evidence and daily fact projections remain organization-scoped and
  auditable. Advertising is the canonical writer for its own facts; consumers
  use its read contracts rather than mutating channel tables directly.

## Keyword Grain

Keyword facts are the ad report's keyword table
(`ChannelAdKeywordDailySnapshot`): one row per keyword, ad group, advertised
option and day, only for keywords that drew a click.

- Rows are daily, so a period view sums the chosen period's measured days.
  They are not additive to product totals.
- Non-search exposure is the row with `keyword ''`; readers mark it
  `nonSearch` and never propose pausing it.
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
  drifted keywords, missing rationale, keywords over a window with no
  measured day, and keywords that converted; survivors become `pause_keyword`
  AdActions in `pending_review` that require human approval. The operator
  pauses an approved keyword in the ad center (see Ownership).

## Keyword And Competitor Collection

- Tracked Wing products, Wing sales rank, Coupang SERP rank, competitor seller
  identity and competitor catalogs are operation kinds (`advertising.*`,
  ADR-0025) whose owners live in `adapter/in/operation/`. Ledger rows are
  written only in `finalize` inside the finish transaction and carry
  `operationId`; readers treat `operationId IS NOT NULL` as published and ignore
  legacy attempt rows.
- `advertising.wing_rank` and `advertising.keyword_serp` hold one
  `resource:keyword:<kw>` slot per keyword (`keywordLockKey`), so the same
  keyword never runs both at once. Wing kinds also hold `account:<id>`;
  seller identity and catalogs share `resource:competitor:serp-enrichment`
  because both rewrite SERP rows (not `org`, which other owners' kinds use).
- SERP → seller identity → catalog is a `result.next` chain; each can also be
  started alone. The chain passes keywords, not derived targets: target
  selection (`getProductDetailTargets`) reads SERP rows through
  `PrismaService`, not the finish transaction, so it runs in the next kind's
  plan. Seller identity chains to catalogs only when it identified a seller.
- All five are read-only against Coupang; none writes to the ad center.
- A moved kind's failure stays on its operation row; the alerts reader absorbs
  it (KID-355 policy B). These owners and the Wing daily owners have no
  `onFailed` and write no alert rows.

## Ad Action Execution

- An `AdAction` is a decision (type, values, approval). Its execution is an
  `advertising.ad_action` operation (KID-386,
  `adapter/in/operation/ad-action-operation-owner.ts`); only
  `create_campaign` runs. Execution words come from the action's latest
  operation (`read/ad-action-execution.ts`); `AdAction.operationId` links it
  and `payload.execution` keeps only an audit copy. The retired attempt
  table is neither read nor written (it is dropped in KID-365).
- Approval or `POST /api/ads/campaigns/register` commits the action first,
  then a second transaction locks it and calls `operations.prepare`, because
  the owner's `plan` reads the committed action. A failed preparation leaves
  it approved and `not_prepared`; approving again prepares it. A live or
  applied run is never prepared again.
- The extension claims the run from its popup (`POST /api/operations/claim`,
  10-minute lease), fills the ad center registration form, and reports an
  `ad_action_evidence` chunk and a finish: campaign id read → `created`, form
  submitted without an id → succeeded `uncertain`, form not reached → failed.
- The run locks `resource:ad-action:<actionId>` only. A prepared run can wait
  days for the popup, so it must not hold `resource:ad-center:<id>` and block
  the ad report; the popup runs one action at a time.
- Rejection cancels a prepared run and is refused while the extension holds
  the run or after it applied.

## Ad Report

- `advertising.ad_report` (KID-371, `adapter/in/operation/ad-report-operation-owner.ts`)
  writes the five ad ledgers — `ChannelAdProductDailySnapshot`,
  `ChannelAdKeywordDailySnapshot`, `ChannelAdCampaign`, `ChannelAdCampaignAd`,
  `ChannelAdDailyBilling` — in its finish transaction. Campaign totals are
  sums of product rows (there is no campaign-grain row); budget, status and
  ROAS target come from `ChannelAdCampaign`. They are the only advertising
  facts; the old campaign-sweep, keyword and profitability collections and
  their ledgers are gone (KID-373).
- It holds `resource:ad-center:<id>`, never `account:<id>`. The closed-day hold
  (`domain/ad-report-confirmation`) narrows the run window, and product
  `billedSpend` sums to the settlement bill per campaign-day to the won
  (`domain/ad-report-billing`).

## Cross-Domain Boundaries

- A source attempt ends at Advertising's `COMPLETE`/`FAILED` owner record and
  complete manifest. It does not invoke ABC or another downstream calculation;
  readers use only the latest complete advertising snapshot.
- Sellable-stock reads go through Channels' exported read-only
  `CHANNEL_SKU_AVAILABILITY_PORT`; use that projection as the sole stock balance
  instead of marketplace SKU metadata.
- Advertising intentionally reads/writes channel daily fact models because the
  scrape ingest path owns raw/fact projection traceability. The Wing daily
  facts are operation kinds (ADR-0025, KID-362;
  `adapter/in/operation/wing-daily-operation-owners.ts`):
  `advertising.wing_itemwinner` writes the listing/option winner columns and
  `advertising.wing_traffic` the listing-day traffic columns (sum of options,
  zero for a catalog listing Wing left out) in their finish transactions; a new
  row carries `operationId`, and traffic provenance
  is `wing.traffic.sourceAttemptId`. Every writer of Wing listing-day facts holds
  `account:<id>` and `resource:wing-daily:<id>`, so one runs per account. The
  traffic run's result (confirmed dates, account daily and period summaries,
  unmatched Wing options per date) is what `AD_TRAFFIC_READ_PORT` and the
  Channels traffic window read.
- Product ABC reads go through Products' exported stored-grade port. An
  unclassified product stays `null`; consume the stored grade without deriving
  a product grade or coercing a missing/stale source to C.
- Listing-day advertising comes only from the ad report ledgers through
  `ADVERTISING_LEDGER_READ_PORT`; `ChannelListingDailySnapshot` has no
  advertising columns. `npm run check:ledger-readers` fails any undeclared
  production read. Account totals are sums of product rows.
- Revenue, operating-profit contribution, rank, and cumulative share are
  reporting metrics only; none changes the absolute ABC grade.
- Reach Channels through its exported port rather than concrete services.

## Boundary Rules

- KST business date conversion goes through `toBusinessDate()`.
- The ad report requests through the closed day but confirms it only once it
  saw spend that day or no spend the day before
  (`domain/ad-report-confirmation`); a held day stays out of the confirmed
  window until a same-day re-collection sees its spend or a collection on a
  later day confirms it. Readers that require the latest ads day use
  `readAdEvidenceCutoff` (`adReportEvidenceCutoff` over the runs' requested and
  confirmed ends), never the closed day.
- Period views derive from daily facts; ratios recompute from summed raw
  values instead of provider ratios.
- Listing facts match `vendorItemId` to `ChannelListingOption`, then
  `externalId` to a Coupang `ChannelListing`; preserve unmatched raw evidence.
- A margin is measurable only from recipe × Sellpia purchase price and the
  Channels `channelAccountSalesCosts` rule; option cost columns are not inputs,
  and an unknown cost leaves the margin `null`.
