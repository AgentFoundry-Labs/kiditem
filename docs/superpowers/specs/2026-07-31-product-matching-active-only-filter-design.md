# Product Matching Active-Only Filter

## Goal

Let operators restrict `/product-hub/matching` to channel listings that are
currently on sale. The filter applies to Coupang Wing and Rocket
`ChannelListing` rows returned by the existing product-mapping queue. It does
not inspect KidItem `MasterProduct` activity or Sellpia inventory activity.

## User Experience

Add a `판매중 상품만` checkbox beside the existing search and matching-status
filters. It is checked on first entry. While checked, only rows whose provider
sale status explicitly represents an on-sale listing appear. `승인완료` and
`APPROVED` are approval states, not sale states, and must not make a listing
pass this filter. Accepted on-sale values are the sale-state forms such as
`판매중`, `판매 중`, `ON_SALE`, `selling`, `sale`, `active`, and `true`.
Unchecking it includes listings in all statuses.

The checkbox combines with account, search, and matching-status filters before
pagination. Changing it resets the page to 1. `필터 초기화` restores the checked
default.

## URL And Data Flow

The mapping response exposes `listing.saleStatus` separately from
`listing.status`. Browser catalog discovery preserves the visible Wing row sale
status and catalog publication stores it in the listing raw payload. Matching
queue reads prefer that explicit sale status. `listing.status` remains the
provider approval/listing lifecycle status and is not used by the active-only
filter.

The default checked state is represented by the absence of a query parameter.
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
Vitest suite. Shared, server, and extension tests cover preserving discovery
`saleStatus`, carrying it through catalog publication, and refusing to confuse
approval-only statuses with on-sale statuses.

## Scope

The product-matching route, its progress display, the matching queue contract,
Wing browser catalog discovery, catalog publication, and durable tests change.
No matching decision, recipe automation mutation, or manual identity-link
behavior changes. Existing catalog rows collected before `saleStatus` was
preserved may need a fresh Wing catalog collection before the checked filter can
show the true current selling count.
