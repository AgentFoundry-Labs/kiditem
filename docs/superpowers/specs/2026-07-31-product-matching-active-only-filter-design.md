# Product Matching Active-Only Filter

## Goal

Let operators restrict `/product-hub/matching` to channel listings that are
currently on sale. The filter applies to Coupang Wing and Rocket
`ChannelListing` rows returned by the existing product-mapping queue. It does
not inspect KidItem `MasterProduct` activity or Sellpia inventory activity.

## User Experience

Add a `판매중 상품만` checkbox beside the existing search and matching-status
filters. It is checked on first entry. While checked, only rows whose provider
status represents an on-sale listing appear. The accepted values cover the
normalized API state (`active`, `APPROVED`, `ON_SALE`) and imported Korean
catalog states (`승인완료`, `활성`, `판매중`). Unchecking it includes listings in
all statuses.

The checkbox combines with account, search, and matching-status filters before
pagination. Changing it resets the page to 1. `필터 초기화` restores the checked
default.

## URL And Data Flow

The existing mapping response already includes `listing.status`, so filtering
is performed in the route without a backend or shared-contract change. The
default checked state is represented by the absence of a query parameter.
Unchecking writes `activeOnly=false`; loading that URL restores the unchecked
state. Back/forward navigation updates the checkbox and visible rows.

Account card counts continue to describe each account's loaded catalog. The
checkbox affects the matching table, its result pagination, the three `매칭 작업
현황` counts, and whether `필터 초기화` is shown. The matching progress panel
uses the same included listing IDs as the table, so status normalization cannot
make the two views disagree.

## Verification

Route tests cover the checked default, exclusion of non-active listings,
unchecked inclusion, URL restoration, page reset, and filter reset. Run the
focused product-hub test suite followed by the required frontend build and full
Vitest suite.

## Scope

Only the product-matching route, its progress display, and durable tests change.
No channel import, matching decision, recipe automation mutation, API, or
persistence behavior changes.
