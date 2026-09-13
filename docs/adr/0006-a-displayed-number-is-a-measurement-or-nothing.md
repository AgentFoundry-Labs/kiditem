---
status: accepted
---

# A displayed number is a measurement or nothing, and evidence travels as facts

[ADR-0003](0003-per-listing-profit-reads-ad-coverage.md), [ADR-0004](0004-top-n-ranking-publishes-measured-profit-or-none.md)
and the reader-side half of [ADR-0005](0005-a-wing-traffic-window-confirms-the-days-the-provider-published.md)
each answered one screen's version of the same question — what may be shown
when the evidence behind a number is short — and each answered it with a word:
`OBSERVED` / `CONFIRMED_ZERO` / `MISSING` / `NOT_APPLIED` on an ad publication,
`READY` / `STALE` / `MISSING` on twenty-one source statuses, `complete` /
`partial` / `empty` / `unverified` on a period basis, `NEW` on an ABC read. An
inventory of every reader found that almost none of those words changed what a
screen showed or an operator did; each was computed from facts the same object
already carried, stored or sent beside them, and then re-checked by hand at
every reader, which is how four readers came to sum `adSpend` without the gate
the word was meant to enforce.

**Two rules replace the case-by-case answers.** A measured value is shown with
the count of days behind it; a value derived from something not measured is
unavailable, never zero. A difference of two measurements — profit is revenue
minus cost — is shown only when both cover the same dates, because a short cost
overstates profit in the direction that misleads. **Evidence travels as facts,
not words.** A listing-day ad value is a measurement if and only if the
campaign sweep published a row for that target-day; a listing-day traffic
value, if and only if its observation timestamp is set. A source is ready or not, and whether it ever
completed is the null-ness of the coverage it already carries. A basis carries
the range asked for, the dates measured, the dates refused, the sources and any
failed read; the status word is a function of those, exported once from
`@kiditem/shared/dashboard`, and no producer, consumer or fixture may compute a
second one.

## Consequences

- ADR-0003 and ADR-0004 are superseded in full. ADR-0005's owner-side
  invariants stand — the plan's date vector is never narrowed, the confirmed
  window is declared, not inferred — and only its reader-side consequence,
  "a read model publishes the days a window measured and says how many", is
  absorbed here.
- Advertising's target-day ledger remains canonical. The concrete reader
  location, scanner, and deletion sequencing originally specified here are
  superseded by [ADR-0009](0009-one-ledger-one-reader.md). This ADR's measurement
  and evidence rules remain accepted.
- The wire carries no derived word: no `status` on a source status object, no
  `status` / `includedDays` / `missingDates` on a period basis, no `status` /
  `partial` on a snapshot basis, no evidence word on an ad publication or an
  ABC fact. A screen that wants the word calls the shared derivation.
- The original reader stayed in `common/` to avoid a Products → Finance →
  Advertising NestJS import cycle. ADR-0009 replaces that placement workaround
  with owner reader functions that do not participate in the DI graph.

## Alternatives rejected

**A `Measurement<T>` type that fuses value and evidence.** It would have
preserved the words as a type. The words carried no information the facts did
not, so the type would have guarded a vocabulary that should not exist.

**Keep the words on the wire as a convenience.** Two encodings of one fact
drift; the period basis already shipped `partial` beside `status === 'partial'`.
