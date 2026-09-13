---
status: superseded by ADR-0006
---

# Top-N ranking publishes a measured profit or none, superseding ADR-0003's exemption

> **Superseded by [ADR-0006](0006-a-displayed-number-is-a-measurement-or-nothing.md).**
> The rule below is now one case of that ADR's two rules, and the evidence
> words it names no longer exist on the wire.

[ADR-0003](0003-per-listing-profit-reads-ad-coverage.md) made per-listing profit
coverage-aware and exempted the dashboard's Top-N ranking, which published
`revenue * 0.3`. The exemption rested on one claim: *"it was never claiming to be
the measured figure."* **Top-N is no longer exempt.** It reads the same
`buildPerListingProfit` that `/api/profit-loss` reads, for the same window, and a
row whose profit that helper does not settle publishes no profit at all.

The exemption's claim was never true where it mattered. The ranking's columns are
headed `순이익` and `이익률` — the same two words the settled figures on the same
screen carry. The distinction between a ranking heuristic and a settled figure
existed in this ADR and in a code comment, and nowhere a reader could see it. A
reader comparing one product's 30.0% against the screen's own profit rate was
comparing a measurement to a constant.

What forced the issue was revenue the ranking could not previously see at all.
Coupang Rocket purchase-order lines carry no `listingOptionId`: the direct
importer resolves product identity through Supply's confirmation, so the
ranking's inner join dropped them and a July of 18,945,520원 rendered as "no
product revenue". Including them — they are channel revenue — puts rows in the
ranking that have no listing, no supply cost, and no commission. For those,
`revenue * 0.3` approximates nothing; it is a number with no inputs behind it.

## Consequences

- `TopProduct.netProfit` and `TopProduct.profitRate` are nullable, for the same
  reason `ProfitBreakdown.netProfit` is. Revenue stays non-null: revenue is
  always measured, which is also why it remains the sort key.
- Two screens can no longer disagree about one listing's margin. They did by
  construction before — a flat 30% against the coverage-aware figure.
- The ranking costs one more read than a pure `SUM`. It is skipped when no ranked
  row settles against a listing, because then nothing can consume it.
- ADR-0003's coverage rule is untouched and still governs every reader. Only its
  Top-N exemption is withdrawn.
