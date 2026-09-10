---
status: accepted
---

# Per-listing profit is told the account answer rather than given a per-listing verdict

`common/per-listing-profit` could not tell an organization that runs no ads
from one whose ad collection failed for the whole window. Both produced an ad
cost of zero and a computed net profit. The distinguishing fact is
account-level, and Advertising already publishes it as
`AdAccountDailyKpiPublishedEvidence`: `OBSERVED`, `CONFIRMED_ZERO`, `MISSING`,
`NOT_APPLIED`. The dashboard's period path already consumed it; the per-listing
path was the only reader that never received it.

The alternative on the table was for Advertising to publish a **per-listing**
coverage verdict that `common/` would read. It is rejected.
[ADR-0002](0002-products-owns-abc-display-status.md) exists because a status
derived in four places gave four answers, and
[ADR-0003](0003-per-listing-profit-reads-ad-coverage.md) already settled that
this module reads `ChannelListingDailySnapshot` with the filter Advertising's
own reader uses. A second per-listing verdict would be one more derivation of
the same fact, which is the failure those two ADRs were written to stop.

**The callers read the account-level answer from Advertising's existing in-port
and pass it in; `common/` stays a pure helper with no dependency on a domain
owner.** Several callers asking the owner the same question for the same window
is correct. Several callers computing it themselves is not, so the translation
from a profit window to the owner's business dates lives in one exported helper
rather than in each call site.

**An account-level `CONFIRMED_ZERO` is a measurement only when it covers every
date in the window.** The owner decides that word over whatever rows fall in
the requested range and says so explicitly — the schema notes it "does not claim
the rows cover every date the caller asked for" — so all-zero rows for three of
thirty days earn the same word as a fully covered month. Coverage is what
upgrades the word to proof.

## Consequences

- An organization with an advertising account that ran no campaigns keeps a
  computed profit at zero ad cost, because the owner proved the zero. Before
  this change it got the same answer by accident; now it gets it for a reason.
- An organization whose ad collection failed for the window has its per-listing
  profit withheld, and the dashboard warning cards report that withholding
  through the count from
  [ADR-0004](0004-snapshot-publishes-withheld-count.md) rather than blanking
  silently or reporting zero. This is visible: cards will blank when collection
  has not run.
- Owner-read failures propagate rather than degrading to "no ads". A caller that
  wants to degrade needs somewhere to publish the error, the way
  `profit-calculation.repository.adapter` publishes `adEvidenceError`. None of
  these callers has that, so failing is the honest option until one does.
- An empty listing-level ad calendar is no longer satisfied by an empty
  per-listing coverage count. `flushListingAdMetrics` writes no listing rows for
  an empty report, so `0 === 0` was reading a total collection failure as a
  measured zero.
