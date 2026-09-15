# Product Profitability Refresh

This runbook covers the current source-owner collection flow and the explicit
Products ABC publication command. It is a synchronous, operator-started flow.
It is not an automatic ABC job, a composite Operation, or a parent/child
workflow.

## Current contract

- Profitability source plans and ABC evaluation target the latest closed KST
  calendar date: **yesterday**. The current day and future dates are never
  included. Inventory's current-stock snapshot is the intentional exception;
  it follows its own owner freshness basis rather than an ABC cutoff.
- Sellpia owns two independent collections. The Product Hub convenience action
  starts the inventory source and the 401-inclusive-day Sellpia product-profit
  source independently. That 401-day source ends yesterday and preserves exact
  source period totals; it does not create an ABC result.
- Advertising profitability is a separate organization-level source-owner
  attempt. Its server plan freezes the applicable accounts, advertiser
  identities, and exact date slices. It must prove the complete plan before the
  Advertising snapshot becomes `COMPLETE`; an account or slice failure does not
  compose a partial organization snapshot.
- Finance's `ProfitabilityEvidence` read seam selects compatible owner-published
  `COMPLETE` Sellpia and Advertising generations for one exact common cutoff.
  It does not calculate a grade.
- Products owns the immutable absolute ABC formula, eligibility, evaluation,
  publication, current grade, and grade history. Source completion never calls
  ABC. Only the authenticated Product Hub **등급 새로고침** and Dashboard
  수익성 ABC **재계산** actions call `POST /api/products/abc/recalculate`.
- A source `RUNNING` or `FAILED` attempt never replaces its owner's current
  complete pointer. Readers show the latest attempt and the previous complete
  cutoff together. A failed or stale source leaves the last normal official
  grade, evaluation, cache, publication provenance, and history unchanged.

## Ownership and current interfaces

| Responsibility | Current owner/interface | Operator-visible boundary |
| --- | --- | --- |
| Sellpia product-profit source | Analytics `SellpiaProfitabilitySourceService` and `SELLPIA_PROFITABILITY_SOURCE_READ_PORT` | `/api/sellpia-product-sales/attempts`, `/status`, and attempt status/control endpoints; the extension action is `collectSellpiaProductProfit` |
| Sellpia inventory source | Inventory source-owner hook and API | Product Hub **상품 전체 데이터 갱신** starts `manual_request` inventory collection independently from product-profit collection |
| Advertising profitability source | Advertising `PROFITABILITY_AD_IMPORT_PORT` and `ADVERTISING_PROFITABILITY_READ_PORT` | `/api/ads/profitability-imports`; the installed extension owner action is `collectAdvertisingProfitability` with capability `profitabilityAdvertisingSourceOwnerV1` |
| Combined evidence | Finance `ProfitabilityEvidence.load({ organizationId, targetCutoff })` | Reads owner-published facts; it does not write source or ABC state |
| ABC calculation/publication | Products `MasterProductAbcService` through `MASTER_PRODUCT_ABC_RECALCULATION_PORT` | Product Hub **ABC 등급 현황 → 등급 새로고침** and Dashboard 수익성 ABC **재계산**; response is `PUBLISHED` or `SOURCE_NOT_READY` |

The Product Hub **상품 전체 데이터 갱신** button is a convenience action for
the inventory and Sellpia profitability source owners. It does not collect
Advertising profitability and does not publish ABC. Use the named Advertising
profitability owner entrypoint when that source needs a refresh; the campaign,
keyword, traffic, or dashboard ad sync is not a substitute for the
`coupang_ad_profitability` source.

광고 전략 → **분석** now exposes **상품별 광고비 보고서 수집**. That explicit
button sends `collectAdvertisingProfitability` through the installed extension
owner and reads `/api/ads/profitability-imports/current` for `RUNNING`,
`FAILED`, or `COMPLETE` plus the previous complete cutoff. It never starts ABC;
ABC remains the separate Product Hub or Dashboard action.

The **ABC 등급 현황** dialog reads source status, latest capture time, actual
cutoff, official cutoff, formula revision, publication revision, and summary
counts, again on every open. Source readiness does not gate its
**등급 새로고침** button: the button waits only for that in-flight status read,
and stays disabled after the read fails until a later read succeeds. The
dialog does not invent a pending ABC lifecycle.

## Source collection

### Sellpia product-profitability source

1. Sign in to the intended organization and Sellpia browser session. Keep the
   supported extension installed and enabled; the browser transports the
   original provider data and never writes canonical facts directly.
2. Start the owner attempt from Product Hub **상품 전체 데이터 갱신** or the
   existing Sellpia source-owner entrypoint. A lost page response is recovered
   by reading the server attempt; do not start a second attempt to guess what
   happened.
3. The server-owned plan covers the fixed 401 inclusive days ending KST
   yesterday. The current source parser is `sellpia-profitability-v2` and its
   provenance must be `sellpia_stat_prd_profit`,
   `ORDER_TIME_SUPPLY_COST`, VAT included.
4. Every submitted period must retain its actual start/end dates and exact
   `total_in_amount`/`total_in_qty` evidence. Reconcile provider totals before
   terminal publication. Never distribute a monthly total across days, replace
   missing rows with zero, or substitute current purchase price times quantity.
5. The owner validates identity, mapping generation, covered months, totals,
   checksums, and the attempt token before atomically publishing the complete
   generation. Unmapped valid rows remain auditable warnings; provider
   pagination/total/checksum/range failures fail the generation.

Inventory stock and Sellpia product-profit facts remain separate owner outputs.
An inventory failure must not suppress a profitability attempt, and a
profitability failure must not blank the last complete inventory or profit
read.

### Advertising profitability source

1. The authenticated extension starts `collectAdvertisingProfitability`; the
   server admits one organization-level attempt with an idempotency key and
   freezes its account, advertiser, mapping-generation, and date-slice plan.
2. The plan is derived through KST yesterday and uses the latest at most 12
   calendar-month buckets, including the exact partial cutoff month. Each
   slice carries its exact inclusive business dates. It is not a completed-
   month-only, rolling-365-day, or daily-prorated plan.
3. The extension visits planned accounts in sequence, verifies the visible
   advertiser identity, and uploads receipt-backed report rows through
   `/api/ads/profitability-imports/:attemptId/slices/:sliceId`. Every account
   and slice must be proven before `/complete` can publish the generation.
4. A failed or cancelled attempt posts a bounded failure to the same owner.
   It never moves the current complete pointer. Retry after a terminal result
   creates a new attempt; it does not reuse a failed generation or create an
   account-level snapshot that ABC could combine with another account.
5. Advertising evidence preserves `OBSERVED`, `CONFIRMED_ZERO`, and
   `NOT_APPLIED`. Missing pagination, an advertiser mismatch, a truncated
   report, or an unproven empty result is failure or stale evidence, never an
   inferred zero.

## ABC eligibility and evaluation

Products may publish an official grade only when all of the following are
true:

- the master product is currently selling;
- the channel mapping is valid and bound to the captured mapping generation;
- Sellpia evidence covers the selected interval completely;
- cost provenance is `ORDER_TIME_SUPPLY_COST` and VAT provenance is known;
- Advertising evidence is `OBSERVED`, `CONFIRMED_ZERO`, or `NOT_APPLIED`;
- the earliest valid mapped channel `saleStartedAt`, normalized to a KST
  calendar day, is at least 30 elapsed calendar days before the evaluation
  cutoff; and
- every selected period has complete, valid source evidence.

The sale-age gate and evidence-completeness gate are separate. There is no
minimum valid observation-day count. A complete valid interval shorter than 30
days can qualify when sale age has reached 30 days; an old sale date cannot
make a missing or stale period complete. Invalid, future, foreign, ambiguous,
or unconfirmed mappings do not contribute a sale start, and a missing sale
date is insufficient evidence rather than an inferred date.

The current formula payload is `PRODUCT_ABC_ABSOLUTE` version 2. It uses
binary64 arithmetic, six-decimal half-up persistence rounding, fixed anchors,
weights of 0.50 profit / 0.30 margin / 0.20 consistency, a 90-day half-life,
and a 30-day profit-velocity normalization. The operating-profit input is:

```text
operatingProfit = revenue - orderTimeSupplyCost - advertisingSpend
```

Commission, fulfilment, return, and other costs are not fabricated as zero;
they enter only when authoritative evidence exists. There is no population
rank, percentile/quota, calibration, reliability multiplier, score shrinkage,
or observation-count gate. Hard C applies to non-positive weighted operating
profit, non-positive operating margin, or loss persistence of at least 50%.

### Evaluation period

- End at KST yesterday.
- Select at most the newest 12 calendar-month buckets, including the cutoff
  month. A cutoff-month bucket ends on the actual cutoff date, not month-end.
- Validate each bucket against its exact covered start, covered end, and
  inclusive `coveredDays`. Do not allocate a larger monthly total to daily
  rows or shorten the interval around a missing bucket.
- A no-sales period is a valid zero only when the source manifest proves that
  period was covered. An unexplained empty period is `MISSING`/`STALE`.
- Apply the 90-day half-life using the actual bucket boundaries and normalize
  weighted operating profit to the 30-day velocity. Covered days are a
  weighting/normalization denominator, not an eligibility threshold.

The selected source vector records the Sellpia attempt/generation/cutoff,
Advertising attempt/generation/cutoff, mapping generation, formula revision,
and common evaluation cutoff. Finance uses one coherent vector; it never
mixes newer revenue with older advertising spend.

## Publication, last-good, and CAS behavior

The explicit ABC command performs one evidence read, one deterministic
calculation, and one publication CAS attempt:

1. `ProfitabilityEvidence.load` reads the target KST cutoff and compatible
   complete owner snapshots.
2. If no complete Sellpia and Advertising pair on the current mapping
   generation ends on the same day (or the earlier one on a month's last day),
   the command returns `SOURCE_NOT_READY` with each source's readiness and
   `actualCutoff: null`, and writes nothing. It adds `pairing` when a source
   reads ready and both sources' newest generations on that mapping end on
   different days. A stale source that still pairs publishes at the pair's
   cutoff. If the mapping moved after the formula-state read and the sources
   already pair on the new generation, the command returns
   `409 INPUT_CHANGED`; without that pair it is `SOURCE_NOT_READY` as above.
   A move after the evidence load is refused by the publication fence in step 4.
3. Otherwise Products captures the formula/publication revisions, source
   vector, complete target set, selling predicates, and mapping evidence.
4. The publication transaction verifies the evaluated source pair against its
   own identities and provenance, and rechecks the mutable formula/publication
   revisions, target set, sale-age inputs, and mapping generation. A newer
   `COMPLETE` source is freshness and does not invalidate that evaluated pair;
   an inconsistent pair or changed mutable input returns `409 INPUT_CHANGED`.
   The command does not retry internally or partially publish.
5. A successful publication atomically advances FormulaState provenance and
   evaluations/cache, and writes history only for actual grade transitions.

If the request response is lost after commit, refetch the Product Hub status and
product reads; do not issue an automatic second calculation. If a source
attempt fails after a prior complete generation, the screen shows the failure
and previous cutoff while retaining the last normal official grade.

## Operator flow

1. In an isolated QA environment, sign in to the intended organization and
   open the supported Sellpia and Coupang browser sessions. Do not copy session
   credentials to the server.
2. Start **상품 전체 데이터 갱신** when both inventory and Sellpia
   profitability need collection. Verify each owner result independently.
3. In 광고 전략 → **분석**, click **상품별 광고비 보고서 수집** when its source
   status is stale or missing. Keep its planned provider tabs available until
   the owner reports terminal `COMPLETE` or `FAILED`.
4. Open **ABC 등급 현황** in Product Hub. Record the Sellpia and Advertising
   statuses, actual cutoffs, mapping generation, official cutoff, formula
   revision, and publication revision.
5. Click **등급 새로고침** once the dialog has finished reading the latest
   status; source readiness does not gate it. A publication uses the newest
   Sellpia and Advertising pair that ends together and names any source that
   collected past the publication's official cutoff. On `SOURCE_NOT_READY`,
   fix the named owner source and retry explicitly; do not publish a manual
   zero or downgrade a retained grade.
6. Confirm Dashboard, Product Management, and Product Outflow read the same
   stored grade/status and source cutoff. These screens are readers, not
   independent ABC calculators.

## Recovery rules

| Symptom | Safe action |
| --- | --- |
| Owner attempt is `RUNNING` after the page closed | Read the server attempt/status; allow the owner extension session to resume or report its terminal result. Do not create a duplicate attempt. |
| Sellpia totals, period dates, or parser provenance mismatch | Fail the Sellpia attempt, preserve the previous complete generation, and correct the provider capture before a new attempt. |
| Advertising pagination, account identity, or slice receipt is incomplete | Fail or leave the owner source stale; never certify a partial account set or inferred zero. |
| Latest source attempt failed | Display the bounded error and previous complete cutoff; retry with a new explicit owner attempt after correcting the cause. |
| Product Hub reports `SOURCE_NOT_READY` | Inspect the source rows and actual cutoffs, then collect the missing/stale owner source. No ABC state is written. |
| ABC returns `409 INPUT_CHANGED` | Refetch Product Hub data and make one new explicit refresh attempt. Do not add a worker, retry loop, or Operation wrapper. |
| ABC response is lost | Refetch the normal Product Hub reads. The publication CAS and stored provenance determine whether it committed. |

## Legacy migration gate (unresolved)

The destructive cleanup migration remains an explicit release gate, not an
operator step in this refresh:

`v0.1.30:006_delete_legacy_channel_derived_master_products`

The file and registry entry remain under `scripts/data-migrations/v0.1.30/`,
with `releaseVersion: '0.1.30'`, while the repository `VERSION` is currently
`0.1.31`. This release-train mismatch is unresolved. Do not rename, retag,
apply, or silently reinterpret the migration in this runbook. The release
owner must reconcile the migration identity and release gate separately before
any destructive cutover decision. Existing protected-reference checks remain
prerequisites when that gate is resolved; backups follow the
[data-loss policy](deployment-architecture.md#data-loss-policy).

This runbook never writes the operating database. Do not point disposable QA
commands, schema pushes, or data-migration commands at the Office/operating
database. A source or ABC QA failure is evidence for repair, not permission to
edit production rows or to restore the retired runtime.

## QA isolation and verification

Run provider and PostgreSQL checks only against disposable fixtures or an
explicitly isolated QA stack. Approved browser QA may use an authenticated
Coupang browser session through the existing extension source owner; never call
the Coupang OpenAPI directly or paste cookies/tokens into logs. Do not claim a
browser pass from unit/integration output.

Focused commands that exist in the repository:

```bash
# Ad Ops advertising profitability owner entrypoint
rtk npm run test --workspace=apps/web -- \
  'src/app/(advertising)/ad-ops/components/AdvertisingProfitabilityRefresh.spec.tsx'

# Product Hub source-owner and explicit ABC UI contracts
rtk npm run test --workspace=apps/web -- \
  'src/app/(catalog)/product-hub/components/ProductOperationsFullRefreshAction.spec.tsx' \
  'src/app/(catalog)/product-hub/components/ProductOperationsDataStatusAction.spec.tsx'

# Formula, evidence, source-owner, and Product Hub backend unit contracts
rtk npm exec --workspace=apps/server -- vitest run \
  src/products/domain/master-product-abc.spec.ts \
  src/products/domain/master-product-abc.qa-regression.spec.ts \
  src/products/application/service/master-product-abc.service.spec.ts \
  src/products/application/service/product-operations-data-status.service.spec.ts \
  src/finance/application/service/master-product-profitability-read.service.spec.ts \
  src/advertising/application/service/__tests__/profitability-ad-import.service.spec.ts \
  src/advertising/adapter/out/repository/__tests__/profitability-ad-import.repository.adapter.spec.ts

# Disposable PostgreSQL owner/evidence/publication contracts
rtk npm run test:integration --workspace=apps/server -- \
  src/analytics/sellpia-product-sales/__tests__/sellpia-profitability-source.pg.integration.spec.ts \
  src/advertising/__tests__/profitability-ad-import.repository.pg.integration.spec.ts \
  src/finance/__tests__/profitability-evidence.pg.integration.spec.ts \
  src/products/__tests__/master-product-abc.repository.pg.integration.spec.ts

# Extension owner transport and collection-window contracts
rtk node --test \
  extensions/tests/coupang-ads-scraper/profitability-source-owner.test.mjs \
  extensions/tests/coupang-ads-scraper/collection-window.test.mjs \
  extensions/tests/kiditem-os-service-worker-boot.test.mjs

# Repository script contracts
rtk npm run test:scripts
```

For a release candidate, inherit the repository's existing web/server/shared
build and server-boot gates. Those checks do not authorize operating-database
writes or automatic ABC publication.

## Final report

Record the organization-safe attempt IDs, source states, exact coverage bounds,
actual cutoffs, mapping generation, formula/publication revisions, source
quality evidence, publication outcome, and focused command results. Report
`SOURCE_NOT_READY`, `INPUT_CHANGED`, provider-proof failures, and the unresolved
`v0.1.30:006` release mismatch explicitly. Do not include raw provider rows,
cookies, tokens, generated workbook contents, or extension-private tab IDs.
