# API

The NestJS backend. It owns every canonical business fact, and is the only tier
that reaches the database. Everything else — web, extension, agents — reads and
writes through it.

## Language

### Source evidence

Terms describing how much a source actually told us. Confusing these is how a
missing measurement becomes a fabricated number.

**Measured**:
A source reported a value for a date, and the moment it was observed is
recorded beside it. Zero is a measurement: a product that ran no advertising
while its account was collected has a measured ad cost of zero.
_Avoid_: observed, confirmed zero, collected, present, has data

**Not measured**:
A source reported nothing for a date it was asked about. Never a zero — a value
derived from it is unavailable, not zero.
_Avoid_: missing, null, blank, no data

**Not applied**:
A property of the organization or one of its channel accounts, not of a
measurement: the source or cost does not apply to it at all, so there was
nothing to ask for. An organization with no advertising account has a
not-applied ad cost; a Rocket direct-purchase account has a not-applied sales
commission. Downstream calculations treat it as satisfied at zero.
_Avoid_: N/A, none, not applicable

**Unavailable**:
The state of a derived value whose inputs were not measured. Distinct from zero
and from an error.
_Avoid_: null, empty, unknown

**Ready**:
A source whose latest complete collection reaches the evidence cutoff a reader
needs. A source that never completed carries no coverage end and one behind the
cutoff carries an old one; both are not ready, and both are fixed by
collecting.
_Avoid_: fresh, stale, missing

**Evidence cutoff**:
The latest business date a reader may require a source to have reached. For
most sources it is the closed day. A Coupang advertising report day counts only
once Coupang has reported spend for it: a collection that sees no spend on its
closed day right after a day with spend, or has no day before to compare with,
confirms only through the day before, and a later collection that sees the
spend confirms the day. A zero day after a zero day counts, because the account
was not advertising. Readers of advertising evidence require the closed day
unless every active advertising account's newest complete collection asked for
the closed day and held it back; then they require the earliest confirmed end.
Distinct from a closed day, which only needs the calendar day to have ended.
_Avoid_: yesterday, latest date

### Reporting

**Calculation basis**:
The evidence behind one displayed value: the range asked for, the dates
measured, the dates read and refused, the sources it came from, and whether a
required read failed. Every dashboard value carries one. Every word said about
it — complete, partial, empty, unverified — is derived from those facts by one
shared function and is never stored or sent.
_Avoid_: metadata, provenance, coverage info, status

**Period basis**:
A calculation basis over a date range. Carries the actual measured dates, so an
internal hole stays visible instead of implying a continuous range.

**Snapshot basis**:
A calculation basis for a stored value that has no date range — a current count
or a stored grade. Carries whether it was measured at all, the as-of it reached,
and the as-of the reader needed.

**Alert**:
A durable notification addressed to the operator, which stays until they
dismiss it. One kind: a **source failure**, one per source, replaced rather
than repeated when the same source fails again. An operator's own cancellation
is not one.
_Avoid_: notification, signal, error

**Warning**:
A count of products **currently** in an undesirable state — loss-making, low
margin, over-advertised, out of stock, needing mapping attention. A standing
count, never a tally of events over a period.
_Avoid_: alert, issue, incident

**Contribution ranking**:
An ordering of products by revenue, used to answer "which products matter
most". Revenue is always measured, which is why it is the ordering. A product's
profit is shown beside it only when it was settled; an approximation standing in
for one was indistinguishable from a measurement on the same screen.
_Avoid_: top products, profit ranking

**Confirmed day**:
A business date a source owner has independently verified as complete, and may
therefore publish even when other dates in the same collection failed. Distinct
from the outcome of the collection batch that produced it.

**Confirmed window**:
The dates a collection states it confirmed. A collection declares its own
window; no reader infers it from which dates happen to carry evidence, because
then a half-collected day would be indistinguishable from one the provider never
published. Distinct from the requested window, which is what was asked for.
_Avoid_: covered range, actual period

### Identity

**Organization**:
The tenant boundary. Every canonical row is scoped to one, through
`OrganizationMembership`.
_Avoid_: tenant, workspace, account

**Legal entity**:
Tax and settlement identity.
_Avoid_: company, seller

**Channel account**:
Marketplace or store identity.
_Avoid_: shop, store, seller account

**Source owner**:
The single module that owns one external source's collection attempts,
canonical facts, coverage manifests, current complete snapshot, and terminal
status. Nothing else writes those rows.
_Avoid_: collector, importer, sync service

**Collection start**:
An ask, from any path, that a source owner open a collection attempt: a screen
control, the extension popup or a page timer. A start collects exactly one
source, and its end never starts another collection. It never opens a second
attempt for a source and scope that already has one running; it shows the
running one instead. When it needs a browser resource another collection is
using, it is refused before any attempt opens, naming that collection.
_Avoid_: sync, refresh, trigger

**Transport receipt**:
The immutable record of one consumed directship transport result, including its
original order effects and any Sellpia transmission intent. Multiple collection
attempts may refer to the same receipt without applying its effects again.

**Attempt consumption**:
The link from a directship collection attempt and selected transport to its
transport receipt. It records consumption separately from the collected source.

### Ledgers

**Ledger**:
The one table that holds one kind of measured fact, written only by its source
owner's terminal transaction. A fact has exactly one ledger; a table that
restates another ledger's rows (a rollup, a cache, a status word) is not one.
The canonical list is the [ledger reader manifest](../../scripts/ledger-readers.json).
_Avoid_: snapshot table, fact table, cache, projection

**Reader**:
The one module through which a ledger is read for any purpose other than its
owner's own publication. It carries the ledger's evidence gate, returns facts
(measured dates, sums, the latest observed moment) and never a word derived
from them. A screen composes readers; it does not query a ledger.
_Avoid_: repository, query service, read port, distributor

**Published calculation**:
A result computed from ledgers and stored with the generation and cutoff it
used: an ABC evaluation, a monthly advertising allocation, a sourcing decision
batch. It is published only through its own entrypoint and read only through
its own reader; it is not a ledger.
_Avoid_: cache, rollup, derived table

**Mapping generation**:
An organization's count of changes to how channel options map to products and
Sellpia stock. A source collection or published calculation that began under
an older generation cannot publish.
_Avoid_: mapping version, formula state
