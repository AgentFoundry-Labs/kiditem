---
status: accepted
---

# A snapshot value publishes its withheld count instead of a nullable measure

[ADR-0003](0003-per-listing-profit-reads-ad-coverage.md) made per-listing
`netProfit` nullable, so `common/per-listing-profit` now yields a projection
that omits the listings whose ad coverage it could not measure. Dashboard
inventory counts that projection to produce `minusProducts`, `lowProfitProducts`
and `highAdProducts`. The counts therefore changed without a line of dashboard
code changing, and the cards kept presenting them as complete figures.

The obvious repair is to widen the dashboard's own
`dashboard-inventory.repository.port` to `netProfit: number | null` and let the
bucket comparisons see the gap. **That repair is worse than the bug.** `null < 0`
is `false`, and `null >= 0 && null <= 3` is `false`, so every bucket comparison
keeps excluding the row exactly as it does today — silently, with no compile
error anywhere, and with nothing on the wire saying a listing was omitted. It
reproduces the wrong numbers while looking like a fix.

**The port keeps `netProfit: number`, and the count of unmeasurable members
travels beside the value rather than inside it.** `buildPerListingMetricsCoverage`
returns `{ rows, withheldListings }`; the snapshot basis carries derived
`partial` and `withheldCount`, where `partial = measured && withheldCount > 0`.

## Consequences

- A snapshot value counts a population, so `withheldCount` makes a basis partial
  without ageing it. Freshness and completeness stay separate signals.
- When every member of a non-empty population is withheld, the value is
  `unavailable` — the approved amendment's rule that only an empty computable
  subset displays no data.
- `outOfStockSkus` and `mappingAttentionSkus` measure the whole population.
  They are fixed at `withheldCount: 0` and never go partial; if one of them ever
  can withhold a member, that is a contract change, not a tweak.
- Do not widen the port later "for symmetry" with per-listing profit. The
  asymmetry is deliberate: a per-listing row can be unmeasurable, a count of
  rows cannot — it can only be a count of fewer rows, which is what the
  withheld number says out loud. The reason is recorded at
  `dashboard-inventory.repository.port.ts:67` so the next reader meets it there.
