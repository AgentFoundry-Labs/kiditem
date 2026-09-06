# Operation And Automation Hard Cutover Design

**Status:** ACTIVE

- **Date:** 2026-09-03
- **Decision:** Approved; explicit ABC publication review incorporated
- **Delivery PR:** [#493](https://github.com/AgentFoundry-Labs/kiditem/pull/493)
- **Base:** `develop`; Office deployment reference: `release/office`

## Classification

This is a declared platform-seam reconstruction across browser collection,
source ingestion, Operations, Automation, work notifications, and product ABC
publication. It is intentionally larger than one business domain because the
failure is at the shared execution seam: the same source update is given
different persistence and status semantics depending on whether it started
from a domain screen, the global panel, an Operation, or an extension runtime.

The cutover is destructive for the unshipped and operationally untrusted
Operations/Automation implementation. It does not preserve compatibility data,
introduce a V2 path, or run old and new execution models side by side. Actual
commerce ownership such as Channels marketplace registration and
`ChannelAccount` is not part of the deletion.

### Operating assumptions

KidItem is currently a single-home-server MVP used by a small number of
internal operators. Multi-instance coordination, zero-downtime operation,
automatic failover, and a high-availability SLA are not requirements for this
cutover. A user or Agent explicitly starts collection, visible failure is an
acceptable terminal result, and an operator may manually retry with a new
attempt. Product ABC is published only by an explicit user command from the ABC
screen.
These assumptions are why durable owner records and publication fencing are
retained while schedulers, sweepers, generic runners, automatic recalculation,
and recovery state machines are not.

## Problem Statement

The current architecture turns a source collection into several overlapping
state machines:

```text
domain screen / panel / schedule / agent
                  |
                  v
            OperationRun
          /       |        \
 browser lease  child run  WorkflowRun
      |            |           |
 extension      owner Module   executor
      \            |           /
       owner facts + OperationAlert + panel projection
```

Direct manual collection often has fewer failures because it avoids most of
that graph. However, its result may return through the page before the page
saves it, so closing or reloading the page can lose a completed collection.
The Operation path addresses that transport problem by adding another generic
ledger, queue, worker, child-run graph, alert lifecycle, outbox, and panel
projection. This creates new failure modes without changing the fundamental
business transaction: validate one source attempt and publish the owner's
facts.

Observed consequences include:

- historical failed generations being reused by later attempts;
- provider work being rejected globally because some product mappings are
  incomplete;
- status disagreement between domain screens, the panel, owner rows, and
  Operation rows;
- terminal notifications depending on outbox/consumer progress after the
  canonical data transaction already completed;
- high write amplification from checkpoints, heartbeats, progress rows,
  projections, and duplicate lifecycle transitions;
- ABC publication being coupled to child workflow ordering rather than the
  latest complete source snapshots;
- generic Workflow and Marketplace surfaces existing without a proven active
  operating use.

The stable seam is neither “return the result to the page” nor “put every
result into OperationRun.” The extension posts the result through the source
owner's HTTP Adapter, and the source owner Module makes staged facts canonical
by atomically committing its attempt, complete manifest/current pointer, and
notification. It does not invoke or mutate product ABC.

## Goals

1. Give every browser-collected source one durable server-owned ingestion path,
   regardless of which UI starts it.
2. Make a coherent vector of source-owner `COMPLETE` snapshots at one common
   cutoff the only input to downstream calculations, while screens derive
   freshness only from the owner's latest attempt and complete manifest.
3. Remove Operations and unused Automation runtime rather than rebuilding a
   second generic execution framework.
4. Keep one focused Alerts surface for durable human notification, not an
   execution engine.
5. Publish product ABC only on an explicit command, as a deterministic absolute
   evaluation that depends only on one product's facts and one immutable
   formula version.
6. Make partial source failure visible while continuing to display the
   previous complete snapshot and retaining the last normal official grade.
7. Cut over PR 493 onto current `develop` and deploy the resulting exact SHA
   through the Office release process.

## Non-Goals

- No new broker, durable queue, generic execution ledger, or workflow engine.
- No compatibility adapter for Operation, Workflow, Marketplace, or relative
  ABC APIs.
- No relative ABC percentile, cohort quota, population hash, calibration, or
  reliability adjustment.
- No ABC worker or required child workflow.
- No automatic ABC recalculation after source collection or canonical product
  mutation.
- No autonomous browser-collection schedule in this MVP. Users or Agent OS
  explicitly start source-owner attempts.
- No change to actual marketplace/store registration in Channels.
- No preservation of unfinished Operation/Workflow history as product data.
- No direct database access from the web or extension.
- No silent estimate of commission, delivery, return, or other unavailable
  costs.

## Reference Basis

The design uses established patterns only at the narrow seam where they
apply:

- Source-owner invariants and transactions follow
  [hexagonal architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/hexagonal-architectures/overview.html)
  and
  [DDD aggregate](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model)
  guidance.
- Start retries follow
  [idempotent API](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
  semantics: one client request ID and its mutation are recorded together.
- Generation-tagged staged data plus a short metadata-pointer commit follows
  the immutable-snapshot shape described by the
  [Apache Iceberg specification](https://iceberg.apache.org/spec/).
- A monotonic publication revision plus
  [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
  and optimistic CAS make concurrent explicit recalculation calls safe while
  allowing only one publication effect for the selected source vector.

Operation/Saga/Workflow machinery is not justified because source attempts do
not span independent databases, require compensation, or wait on a durable
cross-service event history.

## Selected Architecture

### Canonical domain terms

These names describe responsibilities and do not require a generic shared
database model:

| Term                         | Owner and meaning                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExtensionCollectionSession` | Extension-owned, noncanonical progress and human-attention state for one browser collection.                                                               |
| `SourceImportAttempt`        | Source-owner durable record for one requested generation and its `RUNNING/COMPLETE/FAILED` result. Each owner implements it without legacy lifecycle code. |
| staged generation            | Validated facts tagged with one attempt/generation but still invisible to canonical readers.                                                               |
| complete manifest            | Source-owner proof of included/excluded rows, coverage, checksum, and actual cutoff.                                                                       |
| published snapshot           | The staged generation selected by an atomically committed `COMPLETE` manifest/current pointer.                                                             |
| source vector                | Exact selected source manifests, their generations/cutoffs, and mapping generation captured for one ABC candidate.                                         |
| `Alert`                      | Durable human-action notification; never an execution or freshness ledger.                                                                                 |

`ExtensionCollectionSession` uses the owner-issued `SourceImportAttempt.id` as
its local correlation ID. Transport retries and an extension service-worker
restart may resume that same attempt. A user retry after a terminal result
always creates a new attempt/session; an extension session is never restarted
in place. The two records never mirror state: extension progress is not a
publication fact, and source readiness is never derived from extension-local
state.

The session stores only `attemptId`, producer, bounded progress/attention, and
managed-tab resume metadata. Its web-facing Interface is limited to get/list,
cancel, and open-attention commands. Domain extension Adapters own start and
local progress updates. The shared Interface has no retry counter,
`restartStrategy`, restart/finalize command, or terminal success/failure state;
those outcomes belong only to the source owner attempt.

Cancel asks the domain Adapter to submit a non-actionable `FAILED` result to the
owner and clears local control state only after that terminal write succeeds.
The session itself never terminalizes canonical work.

### One source-owner write path

Every browser-collected source uses the same transport direction without a
shared execution runtime:

```text
UI / Agent OS              source owner Module                  extension
|                                  |                                |
|-- HTTP Adapter -> beginAttempt ->|                                |
|   Idempotency-Key -------------->|                                |
|<-- attemptId + attemptToken -----|                                |
|-- start browser command ----------------------------------------->|
|                                  |<-- upload staged facts --------|
|                                  |<-- finalize/fail --------------|
|<-- poll attempt + source status -|                                |
```

The extension never returns canonical raw data to the page for persistence.
The page starts work and observes it; the source owner validates and stores it.
Closing the page after start cannot lose an already collected result.

Shared code is limited to wire-level helpers:

- authenticated upload client;
- retry/backoff that preserves the caller's idempotency key;
- opaque `attemptId` and `attemptToken` propagation; and
- the minimal upload envelope required for authenticated owner requests.

Each owner exposes the smallest source-specific Interface. A one-shot owner
provides `beginAttempt`, one terminal `submitAttempt(result)`, and `read`. Only
an owner whose measured payload requires chunking adds `uploadChunk` and
`finalize`. This is not a shared controller, DTO family, state machine,
repository, or runtime.

There is no shared runtime Module that owns source progress. Each owner keeps
its own attempt and facts because only that owner can define completeness,
deduplication, payload shape, whether chunking is necessary, cutoff, mapping
exclusions, and atomic publication. A collection session can never fulfill the
durable owner-attempt role. No common start/chunk/complete/fail DTO package,
generic attempt table, or source-attempt runtime is introduced.

Attempt creation, staging, and terminal publication remain one cohesive owner
persistence Implementation. Existing claim and publication ports backed by the
same PostgreSQL Adapter are replaced rather than layered under the new Module.
Tests exercise the incoming owner Interface against PostgreSQL instead of
mocking Prisma call order.

### Ownership map

| Work                                                       | Durable owner record                         | Canonical result                  |
| ---------------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| Sellpia profit/cost collection                             | reshaped `SourceImportRun` without Operation | Sellpia facts + coverage manifest |
| Advertising collection                                     | Advertising-owned import/attempt             | ad facts + coverage manifest      |
| Browser collectors found by the closed preflight inventory | the named domain's ingestion/import record   | owner facts/artifact              |
| Agent judgment                                             | `CapabilityInvocation` / Agent OS records    | owner-approved capability result  |
| Fixed AI generation                                        | `AiDirectJob`                                | AI-owned artifact                 |
| Rules evaluation                                           | Rules-owned evaluation/application           | rule result                       |
| Human notification                                         | `Alert`                                      | open/resolved notification        |

Generic `OperationSchedule` and extension alarms that begin new canonical work
are removed. Extension alarms may only resume or retry transport for an
already-issued attempt, or clean local storage. If operating-data preflight
finds an actively used schedule, the cutover stops for an explicit product
decision; it does not silently retain or rebuild a scheduler.

There is no fallback “other collector” owner. A single checked-in, build-time
ownership manifest maps every production producer to its extension Adapter,
source-owner Interface, or `DELETE` disposition. One table-driven test compares
that manifest with `collectionSessions.start`, `KidItemDomains.register`, web
entrypoints, and server routes; one plain legacy-reference gate rejects removed
symbols. The shared producer enum is derived from the manifest keys. The
manifest is a regression contract, not a runtime dispatcher.

Every manifest entry names a source-specific owner Interface. A shared HTTP
route may multiplex transport, but it cannot own attempt status, completeness,
or payload dispatch. In particular, Advertising's current umbrella
`AdSyncService` payload switch and mixed collection/status/target CRUD are
split into their owning Modules rather than retained behind a generic route.

## Source Attempt Contract

### Minimal lifecycle

Owner attempts use only three durable semantic states:

| State      | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `RUNNING`  | One attempt token may upload validated chunks until `expiresAt`.     |
| `COMPLETE` | The manifest/current-pointer commit made the staged facts canonical. |
| `FAILED`   | The attempt cannot publish; an error code explains why.              |

`LOGIN_REQUIRED`, account mismatch, CAPTCHA, provider errors, mapping warnings,
and validation failures are `errorCode`/warning data, not additional lifecycle
states. Each owner Module's `read` Interface derives that source's `READY`,
`STALE`, or `MISSING` result from its latest attempt, latest complete manifest,
and requested target window. Readiness is not stored as another execution
state.

Advertising evidence keeps the domain values `OBSERVED`, `CONFIRMED_ZERO`, and
`NOT_APPLIED`. Those values prove the meaning of an amount; they are not source
attempt states.

### Start and fencing

`POST /api/<owner>/<source>/attempts` derives `organizationId` from the
authenticated request. The UI generates one random `Idempotency-Key` per
explicit start action and reuses it for transport retries. The owner stores the
key, a normalized request fingerprint, the resulting attempt, and the exact
collection plan atomically.

Within `(organizationId, owner/source, Idempotency-Key)`:

- the same fingerprint returns the original attempt token and collection plan,
  including after the original response was lost;
- a different fingerprint returns `409 Conflict`; and
- a user-requested retry after a terminal failure uses a new key and creates a
  new generation.

Each owner defines its canonical publication scope and permits at most one
unexpired `RUNNING` attempt in that scope. A distinct start while one is active
returns `409 ATTEMPT_IN_PROGRESS` with the current attempt ID; it does not
create or join another execution.

The database enforces that tuple as unique. The fingerprint covers the
normalized requested source/account/scope while the stored server plan is the
response replay authority.

The key and fingerprint have the same retention as their attempt; there is no
second idempotency table or cleanup lifecycle. A client-supplied organization,
generation, date range, provider account, owner key, or collection plan cannot
override the server-owned plan.

The attempt token is a write fence, not authentication. Every upload also
requires the normal authenticated organization context. A stale token cannot
append to, complete, or fail a newer attempt.

Begin does not change the current `COMPLETE` source pointer or invoke product
ABC. The previous complete snapshot and official grade remain valid while a
new attempt is `RUNNING`.

The server does not write heartbeat rows or extend leases. Begin writes one
owner-selected fixed `expiresAt` sized for its collection plan. Upload and
terminal calls reject an expired attempt. `read` is side-effect-free and
reports an expired `RUNNING` attempt as effective `FAILED` with
`ATTEMPT_EXPIRED`, without persisting a fourth state. The next `beginAttempt`
first CAS-transitions that prior attempt to `FAILED` and upserts its Alert,
then creates the new attempt in the same transaction. Neither transition
invokes or mutates product ABC. No bootstrap sweep or orphan-Runner type is
introduced. Retry always creates a new generation and token; it never reuses a
failed generation.

### Staged upload and terminal publication

One-shot upload is the default. A source uses chunks only when its measured
payload requires them. Each accepted upload transaction validates owner
identity and the attempt fence, then writes facts tagged with the attempt ID
and generation. Chunked owners also write an idempotent receipt containing the
monotonic sequence, row count, and content checksum. Replaying the same
sequence/checksum is a no-op; conflicting content is rejected. Staged-row
identity is scoped by attempt/generation so a replay cannot mutate another
generation.

Staged facts are never canonical merely because they exist. Readers select
facts only through the source owner's current pointer to a `COMPLETE`
manifest. A failed or expired attempt cannot move that pointer.

Finalize is a short owner metadata transaction, except for the approved Wing
catalog publication below; other sources never rewrite the staged fact set.
The source owner Module's persistence Implementation owns the
transaction:

```text
validate token, account, requested range, receipts, totals, and checksums
  -> write COMPLETE coverage manifest with actual cutoff
  -> atomically advance the owner's current generation pointer
  -> mark attempt COMPLETE
  -> Alerts.resolveSourceFailure(tx, input)
```

Failure atomically marks the attempt `FAILED` and upserts an Alert only when
operator action is required. It never changes the current generation pointer.
A terminal attempt is immutable and has no ABC side effect.

```text
validate attempt fence and terminal payload
  -> mark attempt FAILED with bounded error data
  -> Alerts.upsertSourceFailure(tx, input) when operator action is required
```

At the source-owner seam, the `AlertsModule` Interface exposes exactly two
concrete persistence commands: `upsertSourceFailure(tx, input)` and
`resolveSourceFailure(tx, input)`. It hides the Alert schema and accepts the
transaction already owned by the source owner Implementation. There is no
general `AlertPort`, event, outbox, or unit-of-work abstraction. If either
command fails, the entire source terminal transaction rolls back and the
attempt remains retryable.

No terminal outbox, Operation projection, or second consumer is required. A
transaction rollback leaves no visible complete manifest and downstream reads
continue using the previous complete generation. Failed and incomplete staged
facts remain invisible and are retained in this cutover; no cleanup subsystem
is added without measured storage pressure.

### Wing catalog full-publication exception — approved 2026-09-06

Channels' Wing product/option catalog keeps uploaded chunks private in its
existing collection storage. Upload never changes current listings, options,
media, absence reconciliation, or mapping generation. The final owner
transaction validates the complete staged snapshot and account/attempt fence,
publishes the entire catalog and media, reconciles absence, advances mapping
provenance, and commits the terminal receipt and Alert together. Any failure
rolls back all canonical changes; the previous complete catalog stays visible.

This measured full-publication transaction replaces metadata-only finalize for
this source alone. Reuse the existing identity/media owners and preserve
product links, recipes, stock, and listing content; do not introduce
generation-aware duplicate read models, another worker, or a compatibility
path. Record statement counts and elapsed transaction time on a representative
disposable PostgreSQL fixture, then verify the request budget on the approved
operating clone before cutover. A timeout increase alone is not acceptance.
The fixed-token/expiry, immutable replay, and terminal/Alert contracts still
apply. Collector inputs and normalized output remain unchanged.

Begin creates the existing `SourceImportRun` as the sole attempt authority.
Its linked `ChannelScrapeRun` is private chunk storage, not another lifecycle;
its status is neither read as terminal authority nor synchronized. The permit
freezes the original collector URLs, server account/vendor identity and current
completed publication revision, including file imports. Final publication
rechecks the active account and that revision under the publication locks.
The browser's current extractor does not prove the logged-in vendor identity;
server account validation must not be reported as provider-account verification.

The attempt has a fixed 24-hour lifetime, without heartbeat or renewal. This
covers the known 1,000-product navigation waits with headroom, not an unbounded
catalog duration guarantee. Expired reads derive FAILED without writing; the
next admission retires the expired attempt and its Alert atomically. Same-key
begin returns the original permit. Explicit USER_CANCELLED is terminal FAILED
but neither creates a failure Alert nor resolves an older source failure.

Browser snapshot equality is not attempt identity. A new collection must
publish even if its content matches an older snapshot (A → B → A); only the
same collection's terminal receipt is an idempotent replay. Browser publication
uses the existing `contentChecksum`, leaving file-upload `fileHash` deduplication
to the file-import path.

### Partial rows and mapping

One product's incomplete mapping must not fail a whole Advertising or Sellpia
generation. Rows that pass identity and validation are published. The manifest
records included, excluded, unmapped, and warning counts, and affected product
identifiers where safe. Only those products become ABC-ineligible. Provider
account mismatch, incomplete provider pagination, checksum/total mismatch, or
an invalid collection range remains a generation-level failure.

Advertising profitability uses one organization-level attempt. Begin freezes
every formula-applicable `ChannelAccount`, provider advertiser identity, and
required date slice in the server-owned plan. The extension visits accounts in
sequence, revalidates the account identity after each switch, and uploads
receipts keyed by account and slice. The generation becomes `COMPLETE` only
when the whole plan is proven complete. One account failure fails the attempt
and leaves the previous complete Advertising snapshot current; no parent run,
child attempt, or account-level snapshot composition is introduced.

## Freshness And Screen State

Every source-domain screen reads one owner Interface for both data and
freshness. The response exposes at least:

- latest attempt state and capture time;
- latest complete generation and its actual `coveredThrough` cutoff;
- derived source status (`READY`, `STALE`, or `MISSING`);
- last error code and bounded operator-safe message;
- included/excluded/warning counts.

The latest failed attempt does not hide the latest complete snapshot. Screens
show both: for example, “latest refresh failed; displaying data complete
through 2026-08-31.” Zero is displayed only when a manifest or source evidence
proves zero. An uncollected value remains missing.

Detailed progress stays on the owning domain screen. The global panel is not a
second progress authority.

### One profitability-evidence Module

The Finance-owned `ProfitabilityEvidence` Module is the only Implementation
that selects compatible Sellpia and Advertising manifests, combines their
readiness, chooses the common cutoff, binds the mapping generation, and
assembles per-product operating-profit facts. Its Interface has one operation:
`load({ organizationId, targetCutoff })`. It returns bounded source status,
selected manifest IDs, mapping generation, common cutoff, and product facts;
it does not expose raw attempts, manifests, FormulaState, or Prisma.
The existing Finance profitability reader is reshaped into this Module; no
parallel display/evidence port is added.

Both the Products ABC Module and Products read Module consume this Interface.
The web-facing Products Interface returns only grade, source/evaluation status,
the actual source cutoff, the official publication cutoff, and display
metrics. It has no pending or refresh-needed ABC state. Revenue, operating
profit, and contribution metrics may reflect the latest complete evidence when
labeled with its actual cutoff, independently of whether ABC has been
republished. The Products Interface never reconstructs source compatibility or
readiness from persistence rows.

## Coherent Source Snapshot

`ProfitabilityEvidence` never mixes facts from different effective periods.
Each load captures the latest selected `COMPLETE` generation for every required
source and computes:

```text
targetCutoff = end of the latest closed KST evaluation month

evaluationCutoff = min(
  targetCutoff,
  Sellpia COMPLETE coveredThrough,
  Advertising COMPLETE coveredThrough
)
```

Sellpia and Advertising are the dated source inputs in formula V1. Mapping is
represented by its generation in the source vector, not by an invented cutoff.
If either dated source has no `COMPLETE` manifest, `evaluationCutoff` is
absent.

When `evaluationCutoff` is present, facts newer than it are excluded from the
candidate. A source manifest, rather than an absent fact row, proves a covered
zero.

An official grade may be recalculated only when every required source is
`READY` for the target evaluation window. If any source is `MISSING` or
`STALE`, the ABC Module does not use an older fallback to synthesize a new grade
and does not overwrite `MasterProductAbcEvaluation`, the grade cache, or grade
history. The explicit recalculation command returns the blocking source status
without writing ABC state. Without a prior normal grade, the official grade
remains absent.

The Products read Module compares the shared evidence result with the last
normal publication. Thus a screen can show the last normal grade beside
“latest refresh failed; displaying data complete through 2026-08-31” without
manufacturing another evaluation row or implementing another readiness rule.

Each candidate captures the complete source vector used to calculate and
fence its result:

```text
Sellpia attempt ID + generation + coveredThrough
Advertising attempt ID + generation + coveredThrough
mapping generation
formula revision
evaluation cutoff
```

The source vector is evidence and a publication fence, not a population hash or
another execution record. Its one current persistence envelope is defined under
Persistence and publication fence.

## Product ABC Absolute Evaluation

### Business value

V1 uses the best currently available operating-profit approximation:

```text
operatingProfit = revenue - orderTimeSupplyCost - advertisingSpend
```

Marketplace commission, delivery/fulfillment, return loss, and other costs are
added to this same subtraction only after authoritative source data exists.
They are not stored as invented zero-valued formula inputs in V1.

### Eligibility

An official grade is calculated only when all conditions hold:

- the master product is currently selling;
- product and option mapping is valid;
- Sellpia profit coverage is complete for the evaluated periods;
- the cost provenance is `ORDER_TIME_SUPPLY_COST`;
- VAT provenance is known;
- advertising evidence is `OBSERVED`, `CONFIRMED_ZERO`, or `NOT_APPLIED`;
- at least 30 valid observation days exist.

Advertising `MISSING` or `STALE` is never treated as zero. Source abnormality
follows the Coherent Source Snapshot contract and never creates another grade
or Evaluation.

Products with fewer than 30 valid days show the UI label `NEW` with the
read-time reason `INSUFFICIENT_EVIDENCE`, create no normal Evaluation row, and
have no official A/B/C. Revenue, operating profit, and separate contribution
metrics still display for the evidence that exists.

Valid observation days count only closed collectible periods where Sellpia,
advertising (including confirmed zero), and mapping evidence are all valid.

### Evaluation period

- Exclude the current in-progress KST month.
- Use at most the most recent 12 complete calendar months.
- Apply exponential time weighting with a 90-day half-life.
- Normalize weighted operating profit to a 30-day velocity.
- Include a no-sales month as a valid zero period only when its collection
  manifest proves coverage.
- Treat an unexplained empty month as `MISSING`/`STALE`, not zero.

For bucket `i`, with midpoint age `ageDays_i`:

```text
weight_i = 2 ^ (-ageDays_i / 90)

operatingProfitVelocity30
  = sum(weight_i * operatingProfit_i)
    / sum(weight_i * coveredDays_i)
    * 30

operatingMargin
  = sum(weight_i * operatingProfit_i)
    / sum(weight_i * revenue_i)

lossPersistence
  = sum(weight_i * lossCoveredDays_i)
    / sum(weight_i * coveredDays_i)
```

The current source is monthly, so loss persistence is a monthly
operating-profit estimate over each bucket's covered days.

### Fixed anchors

Each metric maps independently to 0–100 with linear interpolation between
fixed knots and endpoint clamping. Changing a knot or a cost component requires
a new immutable formula version.

| 30-day operating-profit velocity (KRW) | Score |
| -------------------------------------: | ----: |
|                                      0 |     0 |
|                                100,000 |    20 |
|                                300,000 |    40 |
|                                600,000 |    60 |
|                              1,200,000 |    80 |
|                              2,400,000 |   100 |

| Operating margin | Score |
| ---------------: | ----: |
|               0% |     0 |
|               5% |    20 |
|              10% |    40 |
|              15% |    60 |
|              20% |    80 |
|              30% |   100 |

| Loss persistence | Consistency score |
| ---------------: | ----------------: |
|               0% |               100 |
|              10% |                80 |
|              20% |                60 |
|              30% |                40 |
|              40% |                20 |
|              50% |                 0 |

These are the `PRODUCT_ABC_ABSOLUTE_V1` anchors already implemented on the
reference ABC branch. Current data distribution is used only to validate the
business result; it never changes knots or forces a grade distribution.

### Score and grade

```text
economicScore =
    profitScore      * 0.50
  + marginScore      * 0.30
  + consistencyScore * 0.20
```

There is no observation-count reliability multiplier or score shrinkage.

Hard C applies when any condition holds:

- weighted operating profit is less than or equal to zero;
- operating margin is less than or equal to zero;
- loss persistence is at least 50%.

Missing/stale required data is unevaluated source abnormality, not C.

| Grade | Rule                                                                                |
| ----- | ----------------------------------------------------------------------------------- |
| A     | `economicScore >= 80`, `marginScore >= 60`, `consistencyScore >= 60`, and no Hard C |
| B     | `economicScore >= 50` and no Hard C                                                 |
| C     | every other eligible result                                                         |

Any organization may legitimately have all A, all C, or no currently eligible
products. Adding or deleting another product cannot change a product's grade.

### Separate business contribution

The following cohort-derived values are calculated only for display and
operating decisions and never enter `abcGrade`:

- product revenue / total revenue;
- product operating profit / total operating profit;
- revenue rank and operating-profit rank;
- cumulative revenue and operating-profit share;
- loss impact of loss-making products.

### Persistence and publication fence

The retained ABC persistence surface is deliberately small:

- existing source facts and coverage manifests;
- `MasterProductAbcFormulaVersion` and `MasterProductAbcFormulaState`, with
  FormulaState owning the current publication provenance once per organization;
- `MasterProductAbcEvaluation` for each product's last normal evaluation;
- `MasterProductAbcGradeHistory` for actual grade transitions only;
- the existing master-product grade cache only as a read projection.

FormulaState contains the active formula/version revision,
`publicationRevision`, selected Sellpia and Advertising manifest IDs, mapping
generation, official cutoff, and `publishedAt`. It is the sole current
publication envelope. Evaluation stores only per-product normal calculation
output plus its `publicationRevision`.

At cutover, all pre-existing FormulaState, FormulaVersion, Evaluation,
GradeHistory, and grade-cache data is cleared. The first full successful
publication establishes the baseline current evaluation/cache and writes no
history. Later history rows are written only when the official grade actually
changes.

Calculation reads one coherent database snapshot containing:

- the exact source vector and common `evaluationCutoff`;
- active formula ID and `formulaRevision`;
- current `publicationRevision`; and
- the complete evaluation target set with current selling and mapping evidence.

Immediately before commit, the publication transaction rechecks formula and
publication revisions with CAS and verifies that the full source vector is
still current and required sources remain `READY`. It rejects a candidate whose
source generation or cutoff is older than the official publication and
rechecks the complete evaluation target set inside the transaction, including
newly eligible and newly ineligible products. It also rechecks current selling
and mapping state for every product it will write. No population hash or shared
dirty revision is introduced for this comparison.

A normal publication atomically updates FormulaState's selected manifest IDs,
mapping generation, official cutoff, `publicationRevision`, and `publishedAt`
together with Evaluation rows, the grade cache, and any real grade-change
history. The baseline writes no history. A source-abnormal command writes
nothing to FormulaState, Evaluation, the grade cache, or history. Live source
status remains a read-time derivation. Absolute evaluation has no population
hash.

The same facts and formula version must always produce the same rounded
persisted metrics and grade. Formula V1 retains binary64 arithmetic,
six-decimal persisted scale, half-up persistence rounding, and threshold
comparison against unrounded values.

## Explicit ABC Publication

The Products ABC Module exposes one public calculation Interface,
`abcGradeService.recalculate({ organizationId })`. Its authenticated HTTP
Adapter exposes `POST /api/products/abc/recalculate`; the ABC screen is its only
production caller. No source owner, canonical product mutation, Agent OS
capability, Operation handler, worker, scheduler, or child workflow calls this
Interface.

```text
Sellpia / Advertising / Mapping collection
    -> each owner commits its attempt, facts, manifest/current pointer, and Alert
    -> return; no ABC mutation or call

explicit ABC refresh command
    -> ProfitabilityEvidence.load({ organizationId, targetCutoff })
    -> require every source READY for the target window
    -> calculate the absolute grade candidate
    -> publication CAS
    -> atomically write FormulaState + Evaluation + grade cache + real history
    -> return the committed publication for screen refresh
```

The ABC screen's read is side-effect-free. It shows the last official grade,
publication formula, and publication cutoff alongside live source status,
capture time, and the latest complete source cutoff. The refresh action is
enabled only when the required sources are `READY`. There is no ABC pending or
refresh-needed state, and no owner writes an ABC dirty bit.

“Latest complete” is not permission to publish stale evidence. When any
required source is `MISSING` or `STALE` for the target evaluation window, the
command returns the blocking source status and actual cutoff without an ABC
write. The screen retains the last normal official grade and labels its
publication cutoff. If no baseline exists, the grade remains absent. Revenue,
operating profit, and contribution metrics may still display from the complete
evidence available at their separately labeled cutoff.

One command reads one candidate and makes one publication CAS attempt:

```text
candidate:
  ProfitabilityEvidence.load(...)
  if a required source is MISSING or STALE:
    return SOURCE_NOT_READY with no ABC write
  capture publicationRevision + formulaRevision + source vector + target set
  calculate deterministically

publication transaction:
  require publicationRevision and formulaRevision unchanged
  require selected source vector still current and READY
  require complete target set and current selling/mapping evidence unchanged
  reject a candidate older than the official publication
  publish atomically and increment publicationRevision
```

The single-home-server MVP does not add a single-flight runtime. Concurrent
commands may repeat deterministic calculation, but the publication CAS lets
only one candidate commit against a publication revision. A CAS miss returns
`409 INPUT_CHANGED`; the screen refetches before another explicit attempt. The
command does not loop internally.

If the request fails before commit, the transaction leaves no partial ABC
publication and the user may click again. If the response is lost after commit,
a normal screen refetch reads the committed FormulaState and evaluations. This
requires no invocation ledger, dirty revision, outbox, worker, or recovery
scan. The old `MAX_PUBLICATION_ATTEMPTS`, cancellation checkpoints, and
`withinActiveOperationAttemptFence` contract are deleted with Operations.
`SOURCE_NOT_READY`, `INPUT_CHANGED`, and an unexpected command failure are
request outcomes, not durable lifecycle states or Alerts; the initiating user
receives them directly.

A `RUNNING` attempt does not replace its owner's current complete pointer. If
it becomes `COMPLETE` or `FAILED` before the ABC commit, the transaction's
source-readiness and source-vector recheck rejects an invalid candidate. If it
terminalizes after ABC commits, the screen subsequently shows its new source
status, capture time, and cutoff; nothing calls ABC automatically.

## Alerts After Automation Removal

### Alert

`Alert` is a small durable operator notification owned by a focused
`AlertsModule`. Its web-facing Interface supports list and dismiss only. Source
owner Implementations use the source-owner commands `upsertSourceFailure` and
`resolveSourceFailure` in their terminal transaction. A successful completion
resolves the matching open source Alert; it does not create a durable success
notification.

The schema uses a stable owner-defined `dedupeKey`, unique by
`(organizationId, dedupeKey)`, so one owner-defined failure identity keeps one
Alert row. Replaying the same failed attempt is a no-op. A newer failed attempt
updates that row, sets it back to `OPEN` and unread, and records the latest
attempt ID. A successful source publication sets it to `RESOLVED`; dismissing
only marks the current occurrence read. No Alert history or occurrence table is
added. Operation-specific fields such as `operationKey`, progress, `startedAt`,
`finishedAt`, generic execution metadata, and `ActionTask` linkage are removed.
Before schema work, operating preflight fixes the exact retained fields and
query-backed indexes required by source failures and any surviving Rules
alerts; the migration does not keep unused flexibility.

Because the database Alert is the terminal notification and the web polls it
directly, no outbox or relay is present.

### Deprecated ActionBoard

ActionBoard is not redesigned in this cutover. Its UI entrypoint, controllers,
module wiring, automatic task seeding, cross-domain metric reads, execution,
claim, and mutation paths are removed from the active application. The
`ActionTask` table and existing data remain dormant for a later deletion
decision; no new production code may read or write them. A scanner enforces
that seam.

### Global panel

The global panel directly polls `GET /api/alerts` approximately every ten
seconds, refetches on window focus, and invalidates after dismiss. It has no
`/api/panel` aggregate, server-sent event stream, replay ring buffer, backfill
mapper, or Workflow/Operation projection. Reloading the page reconstructs the
exact state from durable Alerts.

## Hard Deletion Scope

This is the single canonical deletion list. Later sections refer to it instead
of restating it. The implementation deletes, rather than deprecates:

- `OperationRun`, `OperationRunCheckpoint`, and `OperationSchedule` models and
  relations;
- Operation foreign keys in Rules evaluation/application records; operating
  preflight must choose one named Rules-owned identity or delete the
  association before implementation, with no conditional compatibility path;
- Operations catalog, controllers, repositories, ports, runtime leases,
  dispatcher, worker, scheduler, cancellation helper, and
  `OPERATION_RUNNER_PORT`;
- operation-backed extension claim/heartbeat/report logic and the
  `KidItemDomains` operations map/`runOperation` dispatch;
- the shared CollectionSession terminal/restart protocol, including
  `restartCollectionSession`, `finalizeCollectionSession`, retry `attempt`, and
  `restartStrategy`; get/list/cancel/open-attention and domain-Adapter-local
  progress remain;
- web operation hooks, run panels, status overlays, and `/api/operations*`;
- `OperationAlert` lifecycle service/controller/repository/policies and
  browser collection operation IDs;
- the Products ABC Operation handler, automatic source/product/mapping
  recalculation listeners and call sites, `ProductAbcPublicationState`,
  `markDirty`, requested/recalculated revision fields, persisted pending state,
  `MAX_PUBLICATION_ATTEMPTS`, cancellation checkpoints, and
  `withinActiveOperationAttemptFence`;
- backend Panel snapshot/backfill/SSE/ring-buffer/mappers and `/api/panel*`;
- generic `WorkflowTemplate`/`WorkflowRun` controllers, services,
  repositories, ports, DAG executors, and `/api/workflows*`;
- Automation's catalog/install `Marketplace` model, API, shared contracts, and
  UI under `/api/marketplace*`;
- active ActionBoard UI/API/module wiring, task seeding, execution, claim, and
  mutation code, while leaving its table and existing rows dormant;
- unused shared Operation, Workflow, and Automation Marketplace schemas.

“Marketplace” here means only the unused Automation catalog/install feature.
Channels' marketplace definitions, listings, accounts, orders, advertising,
and other commerce models remain.

Implementation is complete only when the ownership and legacy-reference gates
find zero production references to every symbol, route, field, and lifecycle
listed above. The operating code/schema inventory, not a historical plan, is
the authority for migration targets.

Historical design documents may remain for auditability but must be marked
superseded when they otherwise describe a live contract.

## PR 493 Integration

PR 493 remains the delivery PR. Its branch includes current `develop` through
a merge commit; it is not rebased or force-pushed. The existing absolute-ABC
feature branch is a reference implementation only.

Selectively reuse from that reference branch:

- fixed formula payload and anchors;
- coherent source-fact/coverage reads and source-vector fences;
- deterministic absolute score calculation;
- formula/publication CAS;
- atomic evaluation/grade/history publication;
- Products/Dashboard/Product Outflow read-model fields;
- generation-tagged fact writes and verified batch-persistence improvements.

Do not import anything in the canonical Hard Deletion Scope. From the ABC
reference specifically, do not import relative evaluation, calibration,
reliability, population hashes, Orders eligibility, extra lifecycle states,
compatibility DTOs, or legacy grade preservation.

PR 493's original timeout workaround and extension Operation claim path become
obsolete under direct owner upload and must be removed rather than preserved.
Its legacy-master cleanup must be revalidated against the operating database
before the destructive cutover.

## Performance Shape

Correctness does not require per-row lifecycle writes:

- one-shot facts use a measured bounded bulk insert; chunked sources use
  idempotent bounded batches;
- the terminal source transaction performs metadata/current-pointer and one
  Alert mutation only, except for Wing catalog's approved measured full
  publication; no source transaction writes ABC;
- no heartbeat, progress-row, scheduler, bootstrap scan, or panel projection
  writes remain;
- current source reads use the indexed owner current-generation pointer;
- ABC reads one coherent source snapshot and publishes Evaluation/cache/history
  with set-based or bounded bulk statements, never one transaction per product;
- FormulaState stores the shared publication envelope once per organization.

The operating-clone gate records statement counts and `EXPLAIN (ANALYZE,
BUFFERS)` for the source fact read, contribution projection, and ABC
publication shape. It rejects sequential scans or N+1 behavior caused by the
cutover. Wall-clock thresholds are recorded for comparison on the home server,
not embedded as brittle CI timing assertions. Because explicit ABC publication
is synchronous, the gate also records the configured browser/proxy/API request
deadline and requires a full baseline publication to finish within it. A miss
blocks the cutover for query or bulk-write correction; it does not justify an
ABC worker or Operation fallback.

## Operating-Database Preflight

Repository tests cannot prove that unfinished platform tables are unused in
the Office database. Before writing the destructive migration, run read-only
queries against an up-to-date operational clone and record:

- active `WorkflowTemplate` count and definitions;
- any `WorkflowRun`, especially recent/nonterminal rows;
- installed Automation Marketplace workflow/catalog rows;
- active `OperationSchedule` count and schedule settings;
- recent Operation runs grouped by operation key and trigger;
- nonterminal or recently failed Operation runs;
- every registered browser collector, its web/extension entrypoints, and its
  one canonical source owner;
- current Alerts/ActionTasks that refer to deleted runtime identities, the
  exact Alert fields/indexes required by surviving queries, and whether Rules
  needs one named owner identity after Operation foreign keys are removed;
- current ABC formula/evaluation/history/cache counts;
- source attempt idempotency keys, staged generations, manifest gaps, actual
  cutoffs, and failed attempts;
- every code path that mutates a selling predicate or mapping generation, and
  the canonical values or generation that the ABC snapshot and CAS must read;
- active product/listing/mapping counts, including known unmapped Advertising
  rows.

If this finds an unexpected live consumer, the destructive cutover stops until
that consumer is either moved to its owner contract or explicitly retired. It
does not justify silently retaining the generic runtime. A database backup is
kept for rollback only, not queried by a compatibility layer.

## Cutover Sequence

The repository may use reviewable implementation commits, but there is one
deployable path and one coordinated production cutover:

1. Record the operational-clone preflight and the closed collector-to-owner
   mapping.
2. Implement and verify idempotent owner Interfaces, generation-staged facts,
   short metadata finalization, and extension direct upload while old
   production code remains undeployed.
3. Implement `ProfitabilityEvidence`, absolute ABC, last-normal Evaluation,
   the explicit refresh command, and publication/source-vector CAS.
4. Replace Automation with `AlertsModule` and polling UI.
5. Add route/reference scanners, then delete Operations, Workflow, Automation
   Marketplace, Panel projection, and compatibility code.
6. Update `docs/ARCHITECTURE.md`, root/scoped `AGENTS.md`, and affected
   runbooks to reflect the final ownership.
7. Take a production backup and stop API, worker, and scheduler processes.
8. Confirm no old extension collection is active; publish the matching
   extension/API/web exact SHA and apply the destructive schema cutover.
9. Clear legacy ABC formula/state/evaluation/history/cache and publish the new
   immutable formula.
10. Run one full Sellpia and Advertising refresh, then explicitly issue the
    first full ABC baseline publication without history.
11. Verify source cutoffs, stale display derivation, grade counts, Alerts, and
    all three ABC read surfaces.
12. Promote/deploy through `release/office` according to the release train;
    never use `main` as the Office deployment reference.

There is no intermediate deployment where both extension-to-page persistence
and extension-to-owner persistence accept canonical writes.

## Verification Contract

Behavior tests cross the formula, source-owner, `ProfitabilityEvidence`, ABC,
and Products read Interfaces. Source-owner and ABC transaction tests use real
PostgreSQL and assert observable outcomes, not Prisma call order. Replaced
repository mocks, fake-Prisma interaction tests, and wiring-only tests are
deleted instead of layered under the new Interface tests. Unpacked Chrome owns
the extension Adapter journey.

### Source attempts and extension

- retrying a start after response loss with the same idempotency key and
  fingerprint returns the same attempt, token, and plan;
- reusing a start idempotency key with a different fingerprint returns
  `409 Conflict`;
- a distinct start in a scope with an unexpired `RUNNING` attempt returns
  `409 ATTEMPT_IN_PROGRESS` and does not create another attempt;
- idempotency key/fingerprint and attempt creation commit or roll back
  together;
- begin and terminal source writes do not mutate or invoke ABC;
- the owner-issued attempt ID is also the extension session correlation ID,
  and terminal retry creates a new ID instead of restarting a session in place;
- stale attempt token cannot write or terminate a newer generation;
- a one-shot replay or duplicate chunk sequence/checksum does not duplicate
  staged facts, while conflicting replay is rejected;
- staged and incomplete generations are invisible to canonical readers;
- finalize changes only validated metadata/current pointers, except for Wing
  catalog's approved atomic full-publication transaction;
- a fixed expiry rejects late writes, `read` derives effective failure without
  mutation, and the next `beginAttempt` CAS-fails the old attempt and writes its
  Alert before creating the new attempt;
- failed or expired attempts never move the current generation pointer;
- closing/reloading the initiating tab does not lose collected data;
- extension CollectionSession state cannot change source attempt, manifest, or
  freshness state;
- extension get/list/cancel/open-attention survives service-worker restart,
  while terminal/restart fields and commands are absent from its shared
  Interface;
- cancel clears local control state only after the owner records the
  non-actionable terminal failure;
- provider pagination/count/total mismatch fails the generation;
- one Advertising attempt freezes and completes every applicable account and
  slice, including verified account switching;
- partial mapping publishes valid rows and warnings instead of failing all;
- retry after failure creates a new generation;
- source read models show latest failure and prior complete cutoff together;
- attempt/staging/publication behavior is verified through each cohesive owner
  Interface with PostgreSQL, not separate claim/publication mocks;
- the static ownership manifest and scanner prove every registered production
  collector has exactly one named source owner or `DELETE` disposition;
- no extension alarm or server schedule begins new canonical collection work.

### ABC

- exact formula anchor knots, interpolation, clamping, weights, Hard C, and
  thresholds have unit tests;
- one product's grade is unchanged when unrelated products are added/removed;
- no population/rank/contribution metric enters grade calculation;
- fewer than 30 valid days yields no official grade;
- missing/stale advertising never becomes zero or automatic C;
- current month is excluded and at most 12 complete months are used;
- confirmed zero months count while unproven empty months are stale;
- all metrics use one common evaluation cutoff, and FormulaState persists the
  current publication provenance once per organization;
- mismatched source cutoffs never combine newer revenue with older advertising
  spend;
- source completion, source failure, selling changes, and mapping changes do
  not invoke recalculation or persist an ABC pending state;
- only the ABC screen's explicit authenticated user command calls the
  recalculation Interface;
- a production-reference gate permits `recalculate` only in its HTTP Adapter
  and rejects Products ABC imports from source-owner Modules;
- partial source failure uses the prior complete snapshot only for display and
  leaves the last normal Evaluation, grade cache, publication provenance, and
  history unchanged;
- a source-abnormal command writes no ABC state, while the Products read Module
  uses `ProfitabilityEvidence` for live status and actual cutoff;
- a request failure before commit leaves no partial publication, while a lost
  response after commit is recovered by the normal screen refetch;
- stale source vector, source cutoff, formula revision, and publication
  revision CAS are rejected;
- the complete target set and every written product's selling/mapping evidence
  are rechecked inside the publication transaction, including products that
  became newly eligible or ineligible during calculation;
- concurrent explicit commands have one publication effect against a captured
  publication revision;
- one command makes one calculation and one publication CAS attempt without
  Operation cancellation/fence, dirty revision, or internal retry loops;
- command errors are returned to the initiating caller and do not create an ABC
  attempt row, lifecycle state, or Alert;
- baseline publication writes no history;
- only subsequent real grade transitions write history;
- normal grade, evaluation, cache, FormulaState provenance, and history commit
  atomically.

### Alerts and UI

- actionable source failure and Alert upsert commit or roll back together;
- successful source publication and resolution of its matching failure Alert
  commit or roll back together;
- non-actionable and successful outcomes do not create durable Alerts;
- same-attempt replay is a no-op, a newer failed attempt reopens the one
  deduped row as `OPEN` and unread, and a successful attempt resolves it;
- polling plus focus refetch survives page reload and server restart;
- dismiss persists correctly, while source completion alone resolves a source
  failure Alert;
- ActionBoard has no active UI, API, module provider, seed, execution, claim,
  or mutation path, and no production code reads or writes `ActionTask`;
- removed Workflow/Marketplace/Operation routes and menu items return no live
  UI or API surface;
- source collection completion changes source status but does not change a
  grade until the ABC screen's explicit refresh command succeeds;
- the ABC screen shows the last publication formula and cutoff plus current
  source capture time, cutoff, and failure/stale state without another pending
  status;
- after a successful synchronous response, the initiating screen invalidates
  and refetches its ABC queries; other screens read the committed database
  projection on their next normal fetch or focus refresh;
- Dashboard, Product Management, and Product Outflow render the same official
  grade/status and the correct source cutoff.

### Repository and release gates

- scanner assertions prove zero production references in the hard-deletion
  list;
- focused backend, shared-contract, extension, and frontend tests pass;
- a real unpacked-Chrome E2E starts an owner attempt, closes/reloads the page,
  lets the extension upload and finalize directly, and observes the durable
  result and resolved Alert from a fresh page;
- the real Chrome E2E also proves a failed multi-account Advertising attempt
  retains the previous complete snapshot, reopens one Alert, and a new-attempt
  retry resolves it;
- `npm run db:push`, `npx prisma generate`, and the shared package build pass;
- `npm run dev:server` boots the NestJS graph after module deletion;
- `npm run build --workspace=apps/web` passes;
- the operating clone completes a full source refresh and synchronous first
  baseline publication within the measured write/performance and configured
  request-timeout budget;
- the exact Office deployment SHA is recorded and post-deploy smoke checks
  pass.

## Superseded Contracts

This design supersedes the live-contract portions of:

- `docs/superpowers/specs/2026-08-01-automatic-product-profitability-abc-design.md`;
- `docs/superpowers/plans/2026-08-01-automatic-product-profitability-abc.md`;
- `docs/superpowers/plans/2026-08-01-unified-operation-control-plane.md`;
- the Operation-backed execution sections of the 2026-07-14 browser collection
  spec/plan, the 2026-07-15 Sellpia freshness spec/plan, and the 2026-08-13
  Sourcing long-running Operations spec/plan.

Their useful source-domain details remain reference material. Their relative
ABC, reliability/calibration, Operation ledger, child workflow, outbox,
Workflow runtime, and server Panel projection are not implementation
requirements after this cutover.
