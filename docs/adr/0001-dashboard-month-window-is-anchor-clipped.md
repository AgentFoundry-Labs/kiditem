---
status: accepted
---

# The dashboard's month window is the anchor's month, clipped to closed days

Every dashboard month value — sales, advertising, and the Wing traffic behind
`effectivePeriod` — resolves to the **anchor's calendar month clipped forward to
the last closed KST business day**. On the 1st of a month that window is empty
and the affected cards show no data; from the 2nd it covers the 1st, and grows
by a day each day.

Before this, the two read models disagreed. Sales read advertising through a
"closed-day month" — the month containing *yesterday* — while the ad read model
clipped the anchor's month. They coincide on every day except the 1st, when
sales queried all of the previous month and the ad endpoint queried nothing, and
**both labelled the result with the anchor's month**. On 1 September the sales
card showed August's advertising spend under a September heading.

## Considered options

**Clip both to the anchor's month** (chosen). Nothing is shown that belongs to
another period. The cost is a blank month card on the 1st.

**Use the closed-day month for both**, so the 1st shows the just-finished month,
with `effectivePeriod` correcting the label to August. More useful on the 1st,
and the labelling mechanism already exists. Rejected: a card whose heading and
contents disagree with the selected filter is the class of bug this whole
contract exists to remove, and relabelling is a weaker guarantee than never
mixing periods in the first place.

## Consequences

- A blank month card on the 1st is **correct**, not a regression. Do not "fix" it
  by widening the window.
- The rule that revenue, cost and advertising entering profit use identical
  dates now holds on every day of the year, including the boundary.
- `wing_closed_day` as a distinct source class loses its reason to exist for
  month windows; the remaining difference from `ads_preset_clipped` was only
  where the month is anchored.
- **A non-empty window is not the same as a visible number.** From the 2nd the
  window asks for the 1st, but the value appears only once that date has been
  collected and published. Advertising collection is explicitly triggered — the
  hard cutover removed `OperationSchedule` and `apps/server/src/advertising`
  has no scheduler — so the card stays empty until someone runs a collection.
  Automating that is deliberately out of scope here.
