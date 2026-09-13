---
status: accepted
---

# A measured fact has one ledger and one reader

Duplicated rollups and direct queries let screens disagree about the same
measurement: an absent advertising day can become zero cost, an unfinished
collection can look current, and a cached grade can disagree with its filter.
Each kind of measured fact has one canonical ledger, and all consumption goes
through one reader module that owns its evidence gate. Normalized aggregates
may contain several declared tables; they do not duplicate the same fact.

The source owner retains its attempts, terminal publication transaction,
coverage manifest, and current complete generation. Its publication code may
read the rows it validates or writes. Other reads, including reads by another
service in the same domain, use the ledger's reader. Readers are exported pure
functions under the owner's `read/` directory, take a Prisma transaction
client, and return facts and provenance without writes or NestJS DI. The
calling service owns the transaction that combines readers.

A reader applies organization scope, the source's complete-generation and
current-row rules, the requested business-date window, and declared coverage.
Missing evidence remains absent or `null`; a completed source's explicitly
observed empty window can establish zero. A newer RUNNING or FAILED attempt
does not invalidate an independently usable COMPLETE snapshot. Consumers keep
the required cutoff distinct from the cutoff actually available.

Screen services compose those facts and their basis. Shared functions derive
display words such as ready, stale, and partial from that basis; the server,
web, and extension use the same derivation. Owner-controlled attempt and
workflow states remain canonical facts. This decision removes duplicate
descriptions of state, not the owner's state machine.

ABC evaluations, monthly advertising allocations, and sourcing decision
batches are published calculations, not duplicate ledgers. They retain their
own explicit publication entrypoint and reader, with generation and as-of
provenance. Collecting a source does not publish a calculation. A calculation
retained by its owner keeps its own provenance rather than acquiring the
dates of a later collection or calculation attempt.

The ledger-reader manifest registers the canonical reader, exact owner
publication files, and explicitly temporary consumers. `check:ledger-readers`
rejects other access and consumer mutations. Removing a duplicate ledger or
derived cache follows migration of its readers and writers, evidence that no
production access remains, and the existing schema cutover contract.

## Considered options

- **Keep derived columns and rollups.** This makes individual reads short, but
  introduces more writers and invalidation rules. Persisted calculations with
  explicit publication provenance are the justified exception; copying raw
  facts or display words is not.
- **Let each screen query the tables.** This avoids a shared module but repeats
  organization, generation, coverage, and cutoff decisions. A regression in
  one screen leaves other screens apparently correct and hides the mismatch.
- **Use injectable reader ports.** Existing application ports can keep a public
  service boundary, but a separate DI graph for ledger reads adds wiring and
  circular-import pressure without changing the evidence policy. A pure reader
  accepts the caller's transaction directly and can be tested against PostgreSQL.

## Consequences

Advertising totals and per-listing costs read the target-day ledger and the
campaign sweep's coverage. A separate account-day KPI collection and the
listing-day advertising rollup are not independent evidence for those totals.
This replaces the concrete access paths in
[ADR-0003](0003-per-listing-profit-reads-ad-coverage.md) and the reader-location
and scanner consequences of
[ADR-0006](0006-a-displayed-number-is-a-measurement-or-nothing.md). ADR-0006's
measurement and evidence rules, including the profit coverage requirement,
still apply. Pure transaction-client readers replace its `common/` placement
workaround without introducing a NestJS module dependency.

Boundary tests publish owner facts into PostgreSQL and assert reader or screen
service output, including incomplete coverage, measured empty windows, and
organization isolation. Scanner tests plant forbidden consumers and require
failure. The manifest records migration exceptions; their presence is not
evidence that migration or schema deletion is complete.
