---
status: accepted
---

# Per-listing profit reads ad coverage, and Top-N ranking is exempt

`ChannelListingDailySnapshot` already records `adCoverageStatus`
(`OBSERVED` / `CONFIRMED_ZERO`) and `adObservedAt` per listing per business
date. Two readers of that table disagree about whether to use it:
Advertising's `master-product-ad-spend-read` filters on both columns, while
`common/per-listing-profit` sums `adSpend` with no filter at all and then
applies `?? 0` to a map miss. Since `adSpend` is `Int @default(0)`, an
uncollected day and a genuinely zero-spend day are indistinguishable in that
sum.

**Per-listing profit reads the coverage the same way Advertising does.** A
listing whose ad coverage is incomplete for the requested window yields an
unavailable net profit rather than one computed from a partial sum. This makes
per-listing `netProfit` nullable, and that nullability propagates to ABC scoring
and `/api/profit-loss`.

**Top-N ranking is exempt.** It is documented as a 30% margin approximation, not
precise profit — precise per-listing math lives in `/api/profit-loss`. An
approximation does not become unavailable because a contributing day is missing;
it was never claiming to be the measured figure. Ranking therefore keeps using
the unfiltered aggregate.

## Consequences

- Do not "fix" Top-N by making it respect coverage. The exemption is the point:
  a ranking heuristic and a settled profit figure are different claims, and only
  the second one can be unavailable.
- ABC already withholds a grade when advertising evidence is not ready, so a
  nullable per-listing profit is not a new concept there — it is the same rule
  reaching one layer further down.
- The two readers of `ChannelListingDailySnapshot` stop disagreeing. If a third
  appears, the filtered read is the one to copy.
