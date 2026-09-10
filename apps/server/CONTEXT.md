# API

The NestJS backend. It owns every canonical business fact, and is the only tier
that reaches the database. Everything else — web, extension, agents — reads and
writes through it.

## Language

### Source evidence

Terms describing how much a source actually told us. Confusing these is how a
missing measurement becomes a fabricated number.

**Observed**:
A source reported a value for a date, and the value was non-zero.
_Avoid_: collected, present, has data

**Confirmed zero**:
A source reported a value for a date, and the value was zero. This is a
measurement, and is as trustworthy as any other. A product that ran no
advertising while its account was collected completely has a confirmed-zero ad
cost.
_Avoid_: no data, empty, zero

**Missing**:
A source reported nothing for a date it was asked about. Never a zero — a value
derived from it is unavailable, not zero.
_Avoid_: null, blank, no data

**Not applied**:
The source does not apply to this organization at all, so there was nothing to
ask for. An organization with no advertising account has a not-applied ad cost,
which downstream calculations may treat as satisfied.
_Avoid_: N/A, none, not applicable

**Unavailable**:
The state of a derived value whose inputs were missing. Distinct from zero and
from an error.
_Avoid_: null, empty, unknown

### Reporting

**Calculation basis**:
The evidence behind one displayed value: which dates entered it, which were
missing or invalid, which sources it came from, and whether the result is
complete or partial. Every dashboard value carries one.
_Avoid_: metadata, provenance, coverage info

**Period basis**:
A calculation basis over a date range. Carries the actual included dates, so an
internal hole stays visible instead of implying a continuous range.

**Snapshot basis**:
A calculation basis for a stored value that has no date range — a current count
or a stored grade. Carries an as-of date and a validity status.

**Warning**:
A count of products **currently** in an undesirable state — loss-making, low
margin, over-advertised, out of stock, needing mapping attention. A standing
count, never a tally of events over a period.
_Avoid_: alert, issue, incident

**Contribution ranking**:
An ordering of products by an explicitly approximate margin, used to answer
"which products matter most". Distinct from settled profit: an approximation
does not become unavailable when a contributing day is missing.
_Avoid_: top products, profit ranking

**Confirmed day**:
A business date a source owner has independently verified as complete, and may
therefore publish even when other dates in the same collection failed. Distinct
from the outcome of the collection batch that produced it.

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
