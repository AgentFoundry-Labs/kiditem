# Coupang Daily Performance Contract

**Status:** ACTIVE
**Approval:** User approved the nine decisions in the side conversation on
2026-09-08 and explicitly requested implementation in the main task.
**Execution:** `../plans/2026-09-03-operation-automation-hard-cutover-execution.md`
**Tracking:** KID-33 / PR #493

## Scope and authority

This is a correction to the existing Advertising source-owner contract and its
Analytics/Web consumers, not a new collection owner. The existing extension
captures through the logged-in browser; the server owns attempts, receipts,
terminality, complete publication and failure alerts. Preserve fencing, replay,
resume and failed/partial isolation. No downstream ABC recalculation on source
completion. No server Coupang OpenAPI, provider business writes, scheduler,
deployment, merge, unrelated cleanup or QA reset is authorized.

Main Codex owns contract review, integration and QA; Luna/max implements
bounded patches. Keep existing dirty changes and the current worktree/branch.

## Stored grains and reads

Store account daily provider originals separately from option daily originals.
Unmatched options remain source evidence and belong to account-wide coverage;
matched listing scope is a separate projection, never an account-total fallback.
Do not infer account unique visitors or account orders by adding options.

Retain old period evidence with its exact interval and observation timestamp.
It is not a daily fact on its start date, and must not appear in arbitrary
subranges or daily charts. Rolling 28/30-day metrics, itemwinner, price and
purchase-order states remain non-additive interval/point observations.

New daily captures preserve actual dates, source account/filter, option IDs,
provider summary, raw provider ratios and observation time. A complete daily
replacement supersedes the previous complete value for that date, including
explicit zero/empty results; failed or staged replacements do not. Collection
of another interval must not hide complete dates outside that interval.

## Metric semantics

- Views, cart additions, orders, sold units and GMV use account daily sums,
  subject to per-metric comparison with a same-account/date/filter/scope Wing
  period original. Preserve mismatches and block verified-period claims.
- Visitors are daily unique visitors and the average of those daily values
  over the same covered range. Do not expose a sum as period unique visitors,
  add option visitors as account visitors, collect every date combination or
  introduce a new arbitrary-period UV collection feature.
- Wing CVR is orders / views. Compute period ratios from summed verified
  numerators/denominators, never average daily ratios. Preserve provider CVR
  separately; zero denominator is unavailable, not an invented conversion.
- Advertising CVR is report-defined conversion orders / clicks. Keep report
  attribution/date semantics explicit; do not guess equivalence between
  `to1dclk` and `*_14_days_*` fields.
- GMV is not settlement or net profit. Do not infer shipping/discount/VAT,
  add attributed advertising revenue to GMV or label the difference organic.

## Coverage, controls and recollection

Expose selected dates, account vs linked scope, completed/target day counts,
missing days and per-metric reconciliation/availability. Missing is not zero;
an incomplete sum/average must not be presented as a complete period result.
Preserve available daily evidence even when period reconciliation is unknown.

Same-period provider matching is a release QA gate, not a requirement to fetch
a new period original for every date-filter change. For example, complete
September 1–6 daily evidence can serve September 1–3 as a covered daily sum
without another collection. If no exact, current period original exists,
reconciliation is `UNVERIFIED` and the UI discloses that provenance; it must not
call the daily coverage missing. Actual missing dates and known per-metric
`MISMATCH` restrict the affected period metrics.

The service starts/resumes collection only after an explicit user action.
Date changes and page entry are read-only. Remaining popup controls use the
same server execution owner and owner-backed status, not legacy local totals.
Allow explicit recollection of old dates. Recent 30 days is the initial ad
recollection operating recommendation, not Coupang's official finalization
deadline. No automatic schedule is introduced.

## Evidence and release gates

Observed Wing help on 2026-09-08 defines visitors as unique product-page
visitors, views as visits, cart as additions, orders as orders excluding
cancellations/returns, sold units separately, and CVR as orders divided by
views. Same-account September 1–6 UI: 1065 visitors, 1391 views, 170 cart,
58 orders, 173 units, GMV 363200, CVR 4.17%. September 1–3 UI: 495 visitors,
678 views, 76 cart, 31 orders, 92 units, GMV 206770, displayed CVR 4.58%.
The latter display differs from the quotient's ordinary two-decimal rounding;
retain this provenance difference. Main subsequently verified September 4–6
and all six single-day summaries against their real UI and the six-day period
summary; the five additive metrics match in this account/date/filter sample.
See the execution record for exact daily values. This is not proof of all
accounts, registration-type deduplication or historical report semantics.

Source: Wing `/tenants/business-insight/sales-analysis` with the stated dates.
The historical official advertising guide
`https://ads.coupang.com/pdf/Coupang-PA-ManualBidding-KOR-211224.pdf` describes
14-day post-click direct/indirect attribution; it does not prove current
report-field mappings or current tax/cancellation/date semantics.

Required regression coverage: multiple options sharing a listing; unmatched
options; provider-vs-option differences; daily vs period range boundaries;
missing vs explicit zero; per-date replacement and partial isolation; tenant
fences; identical receipt/terminal replay and resume; numerator/denominator
ratios and provenance; no page-entry/date-change collection; explicit UI
start/resume using the same owner.

Run focused shared/server/web/extension tests and their scoped AGENTS gates,
disposable PostgreSQL integration, shared/web builds and isolated Nest boot.
Then verify actual extension -> owner -> complete/failure -> service views,
including daily/period provider reconciliation. A mismatching metric remains
restricted with its evidence; unit test success is not provider verification.
