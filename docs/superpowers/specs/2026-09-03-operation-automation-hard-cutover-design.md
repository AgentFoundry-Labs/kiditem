# Operation And Automation Hard Cutover Design

**Date:** 2026-09-03  
**Status:** Approved in conversation; written specification pending user review  
**Delivery PR:** [#493](https://github.com/AgentFoundry-Labs/kiditem/pull/493)  
**Base:** `develop`; Office deployment reference: `release/office`

## Classification

This is a declared platform-boundary reconstruction across browser collection,
source ingestion, Operations, Automation, work notifications, and product ABC
publication. It is intentionally larger than one business domain because the
failure is at the shared execution boundary: the same source update is given
different persistence and status semantics depending on whether it started
from a domain screen, the global panel, an Operation, or an extension runtime.

The cutover is destructive for the unshipped and operationally untrusted
Operations/Automation implementation. It does not preserve compatibility data,
introduce a V2 path, or run old and new execution models side by side. Actual
commerce ownership such as Channels marketplace registration and
`ChannelAccount` is not part of the deletion.

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
 extension     owner service   executor
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

The stable boundary is neither “return the result to the page” nor “put every
result into OperationRun.” The stable boundary is: the extension posts the
result directly to the server API owned by the source, and that owner makes
staged facts canonical by atomically committing its attempt, complete
manifest/current pointer, downstream revision, and notification.

## Goals

1. Give every browser-collected source one durable server-owned ingestion path,
   regardless of which UI starts it.
2. Make a coherent vector of source-owner `COMPLETE` snapshots at one common
   cutoff the only input to downstream calculations and screen freshness.
3. Remove Operations and unused Automation runtime rather than rebuilding a
   second generic execution framework.
4. Keep Alerts and ActionTasks as small human-work surfaces, not execution
   engines.
5. Publish product ABC as a deterministic absolute evaluation that depends
   only on one product's facts and one immutable formula version.
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
- No change to actual marketplace/store registration in Channels.
- No preservation of unfinished Operation/Workflow history as product data.
- No direct database access from the web or extension.
- No silent estimate of commission, delivery, return, or other unavailable
  costs.

## Reference Basis

The design uses established patterns only at the narrow boundary where they
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
- Requested and handled revisions follow
  [Kubernetes controller reconciliation](https://kubernetes.io/docs/concepts/architecture/controller/)
  semantics. Calls may repeat; one revision has one publication effect.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
  and optimistic CAS provide the publication fence inside the existing
  database.
- A transactional outbox is unnecessary while a database `Alert` is the
  terminal notification. An outbox is introduced only at a future external
  delivery seam such as email, Slack, push, or another database, following the
  [transactional outbox](https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos)
  pattern.

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
| source vector                | Exact source attempt IDs, generations, cutoffs, mapping generation, formula revision, and requested revision used by one ABC evaluation.                   |
| `Alert`                      | Durable human-action notification; never an execution or freshness ledger.                                                                                 |

`ExtensionCollectionSession` and `SourceImportAttempt` may share the
owner-issued attempt ID for correlation, but they never mirror each other's
state. Extension progress is not a publication fact, and source readiness is
never derived from extension-local state.

### One source-owner write path

Every browser-collected source uses the same transport direction without a
shared execution runtime:

```text
UI                           source-owner API                    extension
|                                  |                                |
|-- POST /attempts                 |                                |
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

Each owner exposes the five conceptual capabilities `begin`, `upload`,
`finalize`, `fail`, and `read`. This is a behavioral contract, not a
shared controller, DTO family, state machine, repository, or runtime.

There is no shared runtime service that owns source progress. Each owner keeps
its own attempt and facts because only that owner can define completeness,
deduplication, payload shape, whether chunking is necessary, cutoff, mapping
exclusions, and atomic publication. A collection session can never fulfill the
durable owner-attempt role. No common start/chunk/complete/fail DTO package,
generic attempt table, or source-attempt runtime is introduced.

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
| Human follow-up work                                       | `ActionTask`                                 | assignee/state/note               |

An active schedule is retained only when operating-data preflight proves a real
consumer. Its settings move to that source owner. The execution result remains
the owner's attempt; a schedule never creates another generic run row.
There is no fallback “other collector” owner: every production collector is
named in the preflight record and either mapped to one domain or deleted.

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
states. Source readiness such as `READY`, `STALE`, and `MISSING` is derived from
complete manifests at read time and is not stored as another execution state.

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

The server does not write periodic database heartbeat rows. Start writes
`expiresAt`; accepted chunks are already durable evidence of activity and may
extend it when needed. A still-`RUNNING` expired attempt is CAS-transitioned to
`FAILED` at server bootstrap or when the next attempt starts. Retry always
creates a new generation and token; it never reuses a failed generation.

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

Finalize is a short owner metadata transaction; it never rewrites the staged
fact set:

```text
validate token, account, requested range, receipts, totals, and checksums
  -> write COMPLETE coverage manifest with actual cutoff
  -> atomically advance the owner's current generation pointer
  -> advance requested downstream revision when applicable
  -> resolve an existing actionable source Alert
  -> mark attempt COMPLETE
```

Failure atomically marks the attempt `FAILED` and upserts an Alert only when
operator action is required. It never changes the current generation pointer.
For an ABC-input source, failure also advances the downstream requested
revision so stale status is reconciled. A terminal attempt is immutable.

No terminal outbox, Operation projection, or second consumer is required. A
transaction rollback leaves no visible complete manifest and downstream reads
continue using the previous complete generation. Noncanonical staged
generations follow the source owner's data-retention policy and never
participate in reads or publication.

### Partial rows and mapping

One product's incomplete mapping must not fail a whole Advertising or Sellpia
generation. Rows that pass identity and validation are published. The manifest
records included, excluded, unmapped, and warning counts, and affected product
identifiers where safe. Only those products become ABC-ineligible. Provider
account mismatch, incomplete provider pagination, checksum/total mismatch, or
an invalid collection range remains a generation-level failure.

## Freshness And Screen State

Every domain screen reads one owner endpoint for both data and freshness. The
response exposes at least:

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

## Coherent Source Snapshot

ABC never mixes facts from different effective periods. Each calculation
captures the latest selected `COMPLETE` generation for every required source
and computes:

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
`STALE`, the service does not use an older fallback to synthesize a new
grade. It publishes a status-only evaluation that retains the last normal
official grade and metrics, records the stale reason and actual
`evaluationCutoff`, and writes no grade history. Without a prior normal
grade, the official grade remains absent.

Every evaluation stores the complete source vector used to explain its result:

```text
Sellpia attempt ID + generation + coveredThrough
Advertising attempt ID + generation + coveredThrough
mapping generation
formula revision
requested revision
evaluation cutoff
```

The source vector is evidence and a publication fence, not a population hash
or another execution record.

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

Advertising `MISSING` or `STALE` is never treated as zero. If a product already
has a normal official grade, a source abnormality retains that grade and last
normal metrics while updating the evaluation source status and actual cutoff.
If there is no prior normal grade, official grade is absent.

Products with fewer than 30 valid days show the UI label `NEW`, store the
evaluation reason `INSUFFICIENT_EVIDENCE`, and have no official A/B/C. Revenue,
operating profit, and separate contribution metrics still display for the
evidence that exists.
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
- `MasterProductAbcFormulaVersion` and `MasterProductAbcFormulaState`;
- `MasterProductAbcEvaluation` for current evaluation/status;
- `MasterProductAbcGradeHistory` for actual grade transitions only;
- the existing master-product grade cache only as a read projection.

At cutover, all pre-existing FormulaState, FormulaVersion, Evaluation,
GradeHistory, and grade-cache data is cleared. The first full successful
publication establishes the baseline current evaluation/cache and writes no
history. Later history rows are written only when the official grade actually
changes.

Calculation reads one coherent database snapshot containing:

- the exact source vector and common `evaluationCutoff`;
- active formula ID and `formulaRevision`;
- current `requestedRevision`, `recalculatedRevision`, and
  `publicationRevision`; and
- current selling and mapping evidence.

Immediately before commit, the publication transaction rechecks formula and
publication revisions with CAS and verifies that the captured requested
revision and full source vector are still current. It rejects a candidate whose
source generation or cutoff is older than the official publication and
rechecks current selling and mapping state for every changed product inside
the transaction. Grade, evaluation, grade cache, publication state, and any
real grade-change history are published atomically. A status-only source
abnormality publication updates evaluation/source status and
`recalculatedRevision` while retaining the last normal grade/cache and
writing no history. Both grade and status-only publication advance
`publicationRevision`. Absolute evaluation has no population hash.

The same facts and formula version must always produce the same rounded
persisted metrics and grade. Formula V1 retains binary64 arithmetic,
six-decimal persisted scale, half-up persistence rounding, and threshold
comparison against unrounded values.

## Recalculation Trigger

ABC is a direct server service call, not an Operation handler, worker, or
required child workflow. Method invocation is at-least-once; deterministic
calculation may repeat, while publication has one effect for a handled
requested revision.

```text
ABC-input source owner commits COMPLETE or FAILED
    -> requestedRevision += 1 in the owner transaction
    -> after commit, call abcGradeService.recalculate(organizationId, reason)
```

For an integrated profitability refresh, the UI creates all required Sellpia
and Advertising attempts before dispatching extension work. It awaits every
attempt with `Promise.allSettled` and makes an additional
`POST /api/products/abc/recalculate` call after all attempts terminate. A
source-terminal server call that observes another required attempt still
`RUNNING` returns `DEFERRED` without advancing
`recalculatedRevision`. This coalesces the integrated refresh without a batch
run, coordinator, queue, or child workflow.

Once every required attempt is terminal, success can publish a new coherent
grade and source failure can publish only the stale/status result described
above. The previous complete snapshot remains available for data display, but
is not used to manufacture a new official grade. A standalone source terminal
uses the same direct server call. Server-internal selling or mapping mutations
increment the revision in their own transaction and request recalculation
after commit.

Lost and duplicate calls converge through the monotonic revisions in existing
FormulaState:

```text
owner transaction:
  requestedRevision += 1

candidate:
  handledRevision = requestedRevision observed
  if a required source attempt is RUNNING:
    return DEFERRED and leave the revision dirty
  read one coherent source vector and calculate deterministically

publication transaction:
  require requestedRevision == handledRevision
  require recalculatedRevision < handledRevision
  require formula/publication/source-vector CAS
  publish once and set recalculatedRevision = handledRevision

server bootstrap or ABC read:
  if requestedRevision > recalculatedRevision, invoke bounded reconciliation
```

This is a dirty-bit/revision guard, not a queue. It has no per-product job,
checkpoint, heartbeat, worker, or retry graph. Concurrent calls coalesce via
the publication CAS; a revision that changes during calculation rejects the
stale candidate, and a later invocation handles the newest revision.

## Work Management After Automation Removal

### Alert

`Alert` is a small durable operator notification owned by a focused
WorkManagement module. It supports list/read, dismiss, resolve, and promotion
to an ActionTask. An owner upserts an Alert in the same failure transaction
only when operator action is required. A successful completion resolves the
matching open source Alert in its metadata-publication transaction; it does
not create a durable success notification.

The schema uses a stable owner-defined `dedupeKey`, unique by
`(organizationId, dedupeKey)`, so retries update one alert instead of creating
duplicates. Operation-specific fields such as `operationKey`, progress,
`startedAt`, and `finishedAt` are removed. An alert may retain a source record
link and safe structured details, but it is not a progress ledger.

Because the database Alert is the terminal notification and the web polls it
directly, no outbox or relay is present. If email, Slack, mobile push, a broker,
or another database later becomes a required delivery target, an outbox is
added only at that external delivery seam.

### ActionTask

`ActionTask` remains human work only: list, claim, unclaim, state update, and
notes. Generic `apiCall`, automatic execution, and result payload fields are
removed. Code that needs deterministic execution calls its owner service; code
that needs model judgment enters Agent OS.

### Global panel

The global panel directly polls `GET /api/alerts` approximately every ten
seconds, refetches on window focus, and invalidates after dismiss/resolve/task
mutations. It has no `/api/panel` aggregate, server-sent event stream, replay
ring buffer, backfill mapper, or Workflow/Operation projection. Reloading the
page reconstructs the exact state from durable Alerts.

## Hard Deletion Scope

The implementation deletes, rather than deprecates:

- `OperationRun`, `OperationRunCheckpoint`,
  `OperationRunTerminalOutbox`, and `OperationSchedule` models and relations;
- `SourceImportRun.operationRunId`, its relation, and index;
- Operation foreign keys in Rules evaluation/application records, replacing
  them with a rules-owned identity only if a real consumer requires it;
- Operations catalog, controllers, repositories, ports, runtime leases,
  dispatcher, worker, scheduler, cancellation helper, and
  `OPERATION_RUNNER_PORT`;
- operation-backed extension claim/heartbeat/report logic;
- web operation hooks, run panels, status overlays, and `/api/operations*`;
- `OperationAlert` lifecycle service/controller/repository/policies and
  browser collection operation IDs;
- terminal outbox consumers;
- backend Panel snapshot/backfill/SSE/ring-buffer/mappers and `/api/panel*`;
- generic Workflow templates/runs/controllers/services/repositories/ports/DAG
  executors and `/api/workflows*`;
- Automation's catalog/install `Marketplace` model, API, shared contracts, and
  UI under `/api/marketplace*`;
- generic ActionTask execute API and automatic execution fields;
- unused shared Operation, Workflow, and Automation Marketplace schemas.

“Marketplace” here means only the unused Automation catalog/install feature.
Channels' marketplace definitions, listings, accounts, orders, advertising,
and other commerce models remain.

Implementation is complete only when production references are zero for:

```text
OperationRun
OperationSchedule
OperationRunCheckpoint
OperationRunTerminalOutbox
OperationAlert
OPERATION_RUNNER_PORT
WorkflowTemplate
WorkflowRun
/api/operations
/api/operation-alerts
/api/workflows
/api/marketplace
```

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

Do not import:

- Operation/Outbox/composite child workflow code;
- relative evaluation, calibration, reliability, population hashes, or Orders
  eligibility;
- extra lifecycle states or compatibility DTOs;
- current generic CollectionSession/Operation state synchronization;
- server Panel projections;
- legacy grade data preservation.

PR 493's original timeout workaround and extension Operation claim path become
obsolete under direct owner upload and must be removed rather than preserved.
Its legacy-master cleanup must be revalidated against the operating database
before the destructive cutover.

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
- current Alerts/ActionTasks that refer to deleted runtime identities;
- current ABC formula/evaluation/history/cache counts;
- source attempt idempotency keys, staged generations, manifest gaps, actual
  cutoffs, and failed attempts;
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
2. Implement and verify idempotent owner attempt APIs, generation-staged facts,
   short metadata finalization, and extension direct upload while old
   production code remains undeployed.
3. Implement the absolute ABC service with coherent source vectors,
   status-only stale publication, direct at-least-once triggers, and
   revision/CAS reconciliation.
4. Replace Automation with WorkManagement Alerts/ActionTasks and polling UI.
5. Add route/reference scanners, then delete Operations, Workflow, Automation
   Marketplace, Panel projection, and compatibility code.
6. Update `docs/ARCHITECTURE.md`, root/scoped `AGENTS.md`, and affected
   runbooks to reflect the final ownership.
7. Take a production backup and stop API, worker, and scheduler processes.
8. Confirm no old extension collection is active; publish the matching
   extension/API/web exact SHA and apply the destructive schema cutover.
9. Clear legacy ABC formula/state/evaluation/history/cache and publish the new
   immutable formula.
10. Run one full Sellpia and Advertising refresh, then the first full ABC
    baseline publication without history.
11. Verify source cutoffs, stale display fallbacks, grade counts, Alerts,
    ActionTasks, and all three ABC read surfaces.
12. Promote/deploy through `release/office` according to the release train;
    never use `main` as the Office deployment reference.

There is no intermediate deployment where both extension-to-page persistence
and extension-to-owner persistence accept canonical writes.

## Verification Contract

### Source attempts and extension

- retrying a start after response loss with the same idempotency key and
  fingerprint returns the same attempt, token, and plan;
- reusing a start idempotency key with a different fingerprint returns
  `409 Conflict`;
- idempotency key/fingerprint and attempt creation commit or roll back
  together;
- stale attempt token cannot write or terminate a newer generation;
- a one-shot replay or duplicate chunk sequence/checksum does not duplicate
  staged facts, while conflicting replay is rejected;
- staged and incomplete generations are invisible to canonical readers;
- finalize changes only validated metadata/current pointers and never rewrites
  the staged fact set;
- failed or expired attempts never move the current generation pointer;
- closing/reloading the initiating tab does not lose collected data;
- extension CollectionSession state cannot change source attempt, manifest, or
  freshness state;
- provider pagination/count/total mismatch fails the generation;
- partial mapping publishes valid rows and warnings instead of failing all;
- retry after failure creates a new generation;
- source read models show latest failure and prior complete cutoff together;
- every registered production collector has exactly one named source owner and
  no generic fallback owner.

### ABC

- exact formula anchor knots, interpolation, clamping, weights, Hard C, and
  thresholds have unit tests;
- one product's grade is unchanged when unrelated products are added/removed;
- no population/rank/contribution metric enters grade calculation;
- fewer than 30 valid days yields no official grade;
- missing/stale advertising never becomes zero or automatic C;
- current month is excluded and at most 12 complete months are used;
- confirmed zero months count while unproven empty months are stale;
- all metrics use one common evaluation cutoff and persist the exact source
  vector;
- mismatched source cutoffs never combine newer revenue with older advertising
  spend;
- an invocation observed while another required source is `RUNNING` defers
  publication and leaves the requested revision dirty;
- integrated and standalone triggers may call recalculation repeatedly, but
  concurrent calls have one publication effect for the handled revision;
- partial source failure uses the prior complete snapshot only for display,
  retains the last normal grade, and publishes stale status without history;
- a lost requested revision is recovered on server bootstrap or ABC read
  without a worker;
- stale requested revision, source vector, source cutoff, formula revision,
  and publication revision CAS are rejected;
- selling/mapping changes are rechecked inside publication transaction;
- baseline publication writes no history;
- only subsequent real grade transitions write history;
- grade, evaluation, cache, state, and history commit atomically.

### Alerts, tasks, and UI

- actionable source failure and Alert upsert commit or roll back together;
- successful source publication and resolution of its matching failure Alert
  commit or roll back together;
- non-actionable and successful outcomes do not create durable Alerts, and
  dedupe prevents duplicate actionable Alerts across retries;
- polling plus focus refetch survives page reload and server restart;
- dismiss/resolve/promote/claim/unclaim/state/note flows persist correctly;
- removed Workflow/Marketplace/Operation routes and menu items return no live
  UI or API surface;
- Dashboard, Product Management, and Product Outflow render the same official
  grade/status and the correct source cutoff.

### Repository and release gates

- scanner assertions prove zero production references in the hard-deletion
  list;
- focused backend, shared-contract, extension, and frontend tests pass;
- `npm run db:push`, `npx prisma generate`, and the shared package build pass;
- `npm run dev:server` boots the NestJS graph after module deletion;
- `npm run build --workspace=apps/web` passes;
- the operating clone completes a full source refresh and first baseline
  publication within the measured write/performance budget;
- the exact Office deployment SHA is recorded and post-deploy smoke checks
  pass.

## Superseded Contracts

This design supersedes the live-contract portions of:

- `docs/superpowers/specs/2026-08-01-automatic-product-profitability-abc-design.md`;
- `docs/superpowers/plans/2026-08-01-automatic-product-profitability-abc.md`;
- `docs/superpowers/plans/2026-08-01-unified-operation-control-plane.md`;
- Operation-backed sections of browser collection, Sellpia freshness, and
  panel designs.

Their useful source-domain details remain reference material. Their relative
ABC, reliability/calibration, Operation ledger, child workflow, outbox,
Workflow runtime, and server Panel projection are not implementation
requirements after this cutover.

## Acceptance Decision

The cutover is accepted only when one owner attempt can explain each collected
fact and each screen freshness state, one coherent source vector and one
deterministic formula publication can explain every ABC grade, retries cannot
duplicate an attempt or publication effect, and no generic Operation/Workflow
runtime remains in the production dependency graph. Fewer persisted states
and fewer write paths are part of the correctness contract, not an optional
cleanup phase.
