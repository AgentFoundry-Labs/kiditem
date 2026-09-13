---
status: accepted
---

# A Wing traffic window confirms the days the provider published, not the days requested

Coupang publishes Wing traffic and Wing sales at different times — its own screen
labels them separately — and traffic runs a day behind. A window requested
"through yesterday" therefore ends, nearly always, on a day the provider has not
published. Collection used to be all-or-nothing against the requested window, so
that one unpublished day refused the whole collection: 492,428 listing-day rows
carried no traffic coverage at all.

**A collection confirms the dates the provider published, declares that window,
and every reader downstream measures against the declaration rather than against
the request.** Refusal is left for the one case that earns it — nothing in the
window confirmed.

This is the same rule the approved source-units amendment already states for a
date verifiable on its own: it is confirmed "even when other dates in the
collection fail". Discarding a measured day because a different day was not ready
is the mirror image of inventing a zero, and the glossary's **Confirmed day**
exists precisely to name the difference.

## Two invariants that look incidental and are not

**The plan's date vector is never narrowed.** Receipt sequences are numbered off
it as `dateIndex * 100 + pageIndex - 1`, and the period summary sits at
`periodDays * 100`, just above every daily slot. Narrowing the plan renumbers the
dates that remain and collides with receipts an earlier attempt already accepted;
numbering the summary off the confirmed window instead lands it on day
`confirmedDays`'s own first page. The confirmed set is a subset of the plan, and
a later attempt fills in the rest over the same sequence space.

**The window is declared, not inferred from which dates have receipts.** Inferred,
a half-collected day becomes an absent one instead of an incomplete one — and an
incomplete day is exactly what must not pass. Declaring it means pages outside the
declared window are refused, and every date inside it must still be complete.

## Consequences

- The rule holds at one seam and is re-stated at each gate that sits on the path:
  the page reader narrows and declares; the content script hands over the declared
  set; the browser owner's receipt shape, ACK shape and coverage gate admit a
  contiguous interval inside the plan; the server validates the same interval and
  records it as the run's coverage. A gate that keeps the old rule does not fail
  loudly — it moves the refusal one step later, which is how four of them survived
  the first implementation and were only found by running a real collection.
- `source_import_runs.coverage_*` and the run's quality report carry the confirmed
  window; the requested window is kept beside it as `requestedStartDate` /
  `requestedEndDate` so a reader can tell a short collection from a short request.
- A read model publishes the days a window measured and says how many, rather than
  withholding all of them. *This consequence is now stated by
  [ADR-0006](0006-a-displayed-number-is-a-measurement-or-nothing.md); the
  owner-side invariants above are untouched.* Substituting a partial window for a period total is a
  different question and keeps its own stricter gate — a partial window is still
  not the month's revenue.
- A daily average divides by the days covered, not the days requested.
- Retrying for the missing day is an ordinary new attempt. There is no separate
  backfill path and no state that remembers a window was short.

## Alternatives rejected

**Ask for a window that ends on the last published day.** The dashboard's window
is the operator's selection, not the collector's; narrowing it at the request
would silently change what "this month" means on the screen.

**Infer the confirmed set from the receipts that arrived.** Cheaper, and it makes
an incomplete day indistinguishable from one the provider never published. That
distinction is the whole point.
