# AgentSession Complete Deletion Design

- Date: 2026-08-21
- Status: Conversation-approved; written review pending
- Tracking issue: KID-25
- Source baseline: `5aeedfe9`
- Classification: Agent OS lifecycle and Operations-platform boundary revision
- Data decision: pre-launch replacement; no compatibility layer, backfill, or
  dual-write
- Release decision: this design must replace Task 1 of
  `2026-08-13-interaction-os-first-deployment.md` before implementation resumes

## 0. Executive decision

AgentSession deletion is a recoverable, asynchronous, complete deletion of
KidItem-owned session data. A deletion is complete only after the active runtime
has been fenced from canonical writes, every KidItem-controlled process or
writer has exited or had its authority irreversibly revoked, every KidItem-owned
runtime credential, handle, filesystem state, and physical artifact has been
removed, the canonical session graph has been deleted, and the ephemeral
deletion operation lineage has purged itself.

The design deliberately removes the unreleased retention, legal-hold, audit
projection, tombstone, shared physical-object, reference-count, and quarantine
model introduced by the earlier Task 1 implementation. KidItem has not operated
KID-25 in production, so there is no production data contract to migrate or
preserve. Development databases may be recreated from the final schema.

The selected control flow is:

```text
authorized DELETE request
  -> AgentSession lifecycle = deleting
  -> ephemeral agent_session_delete OperationRun
  -> canonical runtime write fence
  -> best-effort runtime cancellation
  -> required process/writer authority revocation and runtime-state cleanup
  -> idempotent deletion of session-owned storage objects
  -> atomic session-graph deletion + graph_deleted checkpoint
  -> terminalize and purge the complete deletion OperationRun lineage
```

Within one accepting server lifecycle, ordinary retryable failures use the
same OperationRun's bounded attempts. A process shutdown or replacement never
revives that run. After the new server reaches `ACCEPTING`, a recovery
coordinator creates an immutable successor for the same deletion intent.

## 1. Why the previous design is replaced

The previous Task 1 combined several unrequested concerns:

- a 365-day automatic retention policy;
- legal holds and independently retained audit projections;
- HMAC deletion tombstones;
- physical artifact sharing across sessions;
- a global artifact-object reference counter and retention holds;
- quarantine and repair states for arbitrary persisted storage references;
- a second API-local maintenance lease and retry loop beside Operations; and
- organization-removal scheduling.

That model produced two concrete review failures even though its focused tests
passed:

1. artifact append acquired a physical-object lock before FK parent locks while
   session deletion acquired the session row before the same object lock,
   allowing a PostgreSQL deadlock cycle;
2. an invalid-reference quarantine cleared the raw reference but retained an
   `Organization`-restricted object row with no remediation path, permanently
   blocking organization deletion.

Both failures came from modeling shared physical objects and corrupted legacy
references that the pre-launch product does not need. This design removes those
states instead of adding more recovery machinery.

## 2. Goals and non-goals

### 2.1 Goals

- A session creator may delete their own session.
- An active organization administrator may delete any session in that
  organization.
- A deletion request returns without waiting for runtime or object storage.
- A session in deletion rejects every new canonical event, artifact, approval,
  retry, delegation, and execution mutation.
- Runtime cancellation is best-effort, but a persisted canonical write fence is
  mandatory before cleanup starts.
- KidItem-owned runtime homes, work directories, state files, reconnect
  handles, MCP credentials, and runtime grants are removed before completion.
- Every KidItem-owned artifact is deleted before the canonical DB graph is
  removed.
- A crash at any deletion phase resumes without duplicating a control plane or
  accepting a late write.
- Five failed attempts result in an explicit `delete_failed` state; an
  administrator may start a fresh retry lineage.
- A successful deletion leaves no session tombstone, lifecycle request, legal
  audit projection, artifact cleanup row, or deletion OperationRun lineage.
- Cross-organization and unauthorized requests do not reveal whether a session
  exists.

### 2.2 Non-goals

- automatic age-based session deletion;
- retention periods, legal holds, or independently retained audit records;
- organization deletion orchestration;
- deletion of logs retained independently by OpenAI, Codex, Hermes, or another
  external provider;
- shared physical artifacts across AgentSessions;
- accepting external URLs, provider paths, or arbitrary storage references as
  `AgentSessionArtifact` values;
- migration or repair of production KID-25 data;
- a second job table, interval worker, or maintenance lease beside Operations;
- changing InventoryCommitment or an unrelated business domain.

A future organization-deletion design must put the organization into a
non-writable deleting state, invoke complete deletion for every session, remove
all remaining organization-owned data, and delete the organization only after
those operations succeed. This document defines no organization endpoint or
state machine.

## 3. Considered approaches

### 3.1 Selected: ephemeral OperationRun

The code-owned `agent_session_delete` operation reuses Operations leasing,
attempt counters, checkpoints, cancellation, `scheduledFor` claiming, process
shutdown, and worker composition. Its persisted run lineage exists only while
the corresponding session exists or its final purge is pending. It follows the
existing lifecycle contract: a server restart cancels the old row and creates a
distinct successor after `ACCEPTING`; it never reclaims or requeues the
cancelled row.

This avoids another job engine while preserving crash recovery.

### 3.2 Rejected: AgentSessionDeletionJob and interval processor

A dedicated job could be deleted with the session, but it would duplicate the
existing Operations claim, lease, retry, checkpoint, and shutdown contracts.

### 3.3 Rejected: synchronous HTTP deletion

Holding the HTTP request through runtime cancellation, multiple object deletes,
and graph contraction cannot recover cleanly from a timeout or process exit.

### 3.4 Rejected: DB-first deletion with detached cleanup

Deleting the organization or session before physical cleanup would allow the
product to report success while KidItem-owned objects still exist. That
contradicts the complete-deletion contract.

## 4. Hexagonal ownership

```text
HTTP adapter
  -> AgentSessionDeletionPort
    -> AgentSessionDeletionService
      -> AgentSessionDeletionTransactionPort
      -> OperationsDispatchPort

API-root Operations worker
  -> adapter/in/operation/AgentSessionDeletionOperationHandler
    -> AgentSessionDeletionExecutionPort
      -> AgentSessionDeletionExecutionService
        -> AgentSessionRuntimeFencePort
        -> AgentSessionRuntimeControlPort
        -> AgentSessionArtifactStoragePort
        -> AgentSessionDeletionTransactionPort
```

Responsibilities are fixed as follows:

- the HTTP adapter authenticates the request, receives organization scope from
  `@CurrentOrganization()`, and calls only the deletion input port;
- the Agent OS application layer owns authorization policy, session state,
  artifact ownership, runtime fencing, and graph deletion;
- Operations owns the generic run envelope, lease, attempt, checkpoint, retry,
  terminalization, and code-owned ephemeral-purge policy;
- the operation handler is an Agent OS incoming adapter: it translates the
  Operations context and invokes only `AgentSessionDeletionExecutionPort`;
- `AgentSessionDeletionExecutionService` owns the deletion orchestration and
  invokes the narrow outgoing runtime, storage, and transaction ports;
- the composition transaction adapter atomically changes AgentSession state and
  creates or advances the corresponding OperationRun;
- the storage adapter derives an owned key from canonical coordinates and never
  accepts a caller-provided path; and
- worker and MCP process roots do not import the HTTP controller or HTTP-only
  configuration.

No controller imports a concrete application service. No Agent OS application
service imports a Prisma adapter or Operations application service.

## 5. Canonical data model

### 5.1 AgentSession deletion state

The retained `AgentSession` model adds only the state needed while deletion is
in progress:

- lifecycle values `deleting` and `delete_failed`;
- `deletionRequestedAt`;
- `deletionRequestedByUserId`;
- `deletionOperationRunId`, pointing to the current ephemeral deletion run; and
- `deletionFailureCode`, containing a stable allowlisted code or null.

`AgentSessionDeletionOperationBinding` is a narrow, transient association, not
a second job table. It stores only organization, session ID, session creator,
deletion requester, retry generation, OperationRun, immutable predecessor
OperationRun, and creation time. It has no status, payload, claim, lease, or
retry fields. Its session ID is a scoped coordinate rather than an FK because
the binding and `graph_deleted` checkpoint must survive the session graph until
ephemeral finalization succeeds. It retains `onDelete: Restrict` composite FKs
to Organization, its current OperationRun, and its nullable predecessor
OperationRun, uniqueness on the current OperationRun, and no FK to AgentSession
or User. The scalar creator and requester IDs are authorization coordinates
only; active organization membership is still required at read time.
Organization removal therefore remains blocked during finalization.

While the AgentSession exists, its `deletionOperationRunId` selects the exact
current binding; no latest-row inference is allowed. After graph deletion, the
current OperationRun and binding are the sole temporary status authority and
are deleted together by finalization.

A manual retry or server-lifecycle recovery creates a new immutable successor,
adds its binding, and updates `deletionOperationRunId` in the same transaction.
The bindings form the deletion lineage. No cancelled or failed generic run is
requeued or mutated into a new run envelope. One retry generation has a
cumulative five-attempt budget across every server-lifecycle successor. A
manual administrator retry increments the generation and starts a new budget.

The source tree must not retain the following unreleased Task 1 models or
fields:

- `AgentInteractionRetentionPolicy`;
- `AgentSessionLifecycleRequest`;
- `AgentSessionTombstone`;
- `AgentSessionLegalAuditProjection`;
- `AgentSessionArtifactObject`;
- `AgentSessionArtifactObjectRetentionHold`;
- `AgentSessionArtifactObjectTombstone`;
- session legal-hold and retention-due fields; and
- artifact or usage retention classification fields.

### 5.2 Session-owned artifacts

Each `AgentSessionArtifact` belongs to exactly one organization, session, task,
and execution. It is never referenced by another session.

The physical object key is derived and not persisted:

```text
agent-artifacts/{organizationId}/{sessionId}/{artifactId}
```

`AgentSessionArtifact` stores the artifact UUID, ownership coordinates, type,
SHA-256, metadata, lifecycle, the exact code-owned materialization OperationRun,
and idempotency key. It stores no raw
`storageReference`, storage-object foreign key, reference hash, shared reference
count, erasure lease, or quarantine state.

`materializationOperationRunId` has an organization/run composite FK with
`onDelete: Restrict`, and that run must also have the immutable session-ownership
edge. This prevents a writer envelope from disappearing while its artifact can
still commit.

Artifact-producing runtime adapters must materialize bytes through a KidItem
artifact-writer port before emitting a normalized artifact event. Materializing
an artifact is itself crash-safe:

1. under the session lifecycle lock, the writer creates a session-owned
   `materializing` artifact row, generates `artifactId`, and binds the exact
   session-scoped OperationRun that owns the write;
2. after commit, the code-owned server writer writes bytes to the derived key;
3. it reacquires the session lifecycle lock, verifies that the session is still
   writable and the same operation fence is current, verifies the SHA-256, and
   transitions the row to `active`; and
4. only then does the runtime adapter emit the normalized artifact event.

The writer never gives an external runtime a direct or long-lived upload URL.
It receives or downloads the bytes and owns the bounded storage call. If the
session becomes non-writable after the put, the writer does not publish an
artifact event and issues an idempotent delete for the derived key.

The storage port distinguishes `erased`, `present`, and `unknown`; elapsed time
never converts `unknown` to success. Deletion first fences or terminalizes the
exact materialization OperationRun, then asks the adapter to reconcile and
delete the derived key. The adapter may report `erased` only after its
code-owned writer can no longer commit and provider read-after-delete confirms
absence. An ambiguous or unsupported provider result remains `unknown`, causes
an OperationRun retry, and can ultimately produce `delete_failed`.

If the process exited before or during the put, recovery reconciles the same
derived key and operation fence. Normal reads never expose `materializing`
rows. A storage adapter that cannot provide this fenced reconciliation contract
cannot back `AgentSessionArtifact`; it may expose only a resource reference.

The normalized runtime event carries `artifactId` and safe presentation
metadata, not a storage path. If an adapter cannot copy provider content into
KidItem storage, it emits a resource reference instead of an
`AgentSessionArtifact`.

### 5.3 Ephemeral OperationRun

`agent_session_delete` is a code-owned Operations definition with persistence
policy `ephemeral_on_success`.

- It is always created as an independent platform-control root with no parent,
  child, schedule, or business-result owner.
- Failed runs remain only while the session remains in `delete_failed`, so an
  administrator can inspect the stable failure code and retry.
- An explicit retry or post-restart recovery creates an immutable successor and
  binding linked to the failed or lifecycle-cancelled run.
- Success purges the current run, predecessors in the same deletion lineage,
  their attempt counters, checkpoints, and every deletion binding.
- No other OperationRun type may opt into this purge behavior dynamically.

### 5.4 Session-owned OperationRuns

`AgentSessionOperationRunOwnership` is the immutable ownership edge for every
OperationRun created from a session, whether it executes an Agent attempt or a
deterministic domain capability. It contains organization, session, and run
coordinates and permits exactly one session owner per run.

The edge is inserted in the same transaction that creates the OperationRun.
There is no repair-on-read or optional fallback: failure to create the edge
rolls back the run.

It has an organization/session composite FK with `onDelete: Restrict`, an
organization/run composite FK with `onDelete: Restrict`, and uniqueness on the
run. The final graph transaction must explicitly validate and delete these
edges and their exclusively owned runs before deleting AgentSession. A generic
cascade cannot hide a missed OperationRun.

The transient deletion binding is separate because it must briefly survive
AgentSession deletion while the current deletion run finalizes.

## 6. API and authorization

The HTTP surface exposes:

- `DELETE /agent-os/sessions/:sessionId` for an initial or repeated request;
- `GET /agent-os/sessions/:sessionId/deletion` for scoped deletion status; and
- `POST /agent-os/sessions/:sessionId/deletion/retry` for an
  administrator-only `delete_failed` retry.

Authorization uses the active organization membership from the authenticated
request. While the session exists, the transaction rechecks both organization
scope and one of:

- the requester created the session; or
- the requester has the organization administrator role.

The controller never accepts `organizationId` from the request body or query.
Cross-organization, unauthorized, already-deleted, and unknown session IDs use
the same non-enumerating response. A new or already-running deletion returns
`202`. If the session graph is absent but its exact code-owned deletion
OperationRun has not finished purging, repeated `DELETE` returns
`202 finalizing`, while the status route returns
`200 { state: "finalizing" }`. Only the absence of both the session and that
ephemeral run returns `204`.

During `finalizing`, the transient binding supplies the original session
creator and deletion requester needed for the same creator/admin authorization
check. The status query requires an active membership in the binding's
organization; it never authorizes from a request-path coordinate alone.

The response matrix is exact:

| Route and state | Authorized creator | Authorized administrator | Unknown, cross-org, or unauthorized |
| --- | --- | --- | --- |
| `DELETE`, writable | `202 deleting` | `202 deleting` | non-enumerating `204` |
| `DELETE`, `deleting` | `202 deleting` | `202 deleting` | non-enumerating `204` |
| `DELETE`, `delete_failed` | `202 delete_failed`; no retry | `202 delete_failed`; no implicit retry | non-enumerating `204` |
| `DELETE`, graph gone/binding present | `202 finalizing` | `202 finalizing` | non-enumerating `204` |
| `GET`, any retained state or binding | `200` with allowlisted state | `200` with allowlisted state | non-enumerating `204` |
| `POST retry`, `delete_failed` | `403 DELETION_RETRY_ADMIN_REQUIRED` | `202 deleting` | non-enumerating `204` |
| `POST retry`, any other retained state | `409 DELETION_RETRY_STATE_INVALID` | `409 DELETION_RETRY_STATE_INVALID` | non-enumerating `204` |
| any route, binding purged | `204` | `204` | `204` |

A repeated `DELETE` for a `deleting` or `delete_failed` session returns the
current state and does not create another OperationRun. Only an administrator
may increment the retry generation through the explicit retry route.

## 7. Deletion workflow

### 7.1 Begin deletion

The composition transaction performs this order:

1. acquire the organization/session lifecycle advisory lock;
2. lock the exact organization-scoped AgentSession row `FOR UPDATE`;
3. recheck membership, creator/admin authorization, and current lifecycle;
4. set lifecycle to `deleting` and clear any prior safe failure code;
5. persist the canonical session write fence and invalidate active runtime
   grants or generations;
6. create the ephemeral `agent_session_delete` OperationRun and relation; and
7. commit both the session transition and runnable operation together.

There is no interval that can observe `deleting` without a durable current
binding, and no runnable deletion operation can exist before the session is
fenced.

On server startup, the normal Operations lifecycle first cancels old active or
waiting runs. Only after the new lifecycle is `ACCEPTING` may the deletion
recovery coordinator lock a `deleting` session, bind one immutable successor to
its exact lifecycle-cancelled run, and dispatch it. Concurrent recovery creates
exactly one successor.

### 7.2 Universal mutation fence and lock order

Every application transaction that writes a session child follows the same
order:

```text
organization/session lifecycle advisory lock
  -> exact AgentSession row lock
  -> require a writable lifecycle
  -> mutate event/task/execution/approval/artifact child rows
```

`deleting` and `delete_failed` are non-writable. This applies to live runtime
events, replay joins that can mutate state, artifact materialization, approval,
retry, delegation, and execution creation.

No external runtime or object-storage call occurs while a database transaction
or row lock is open. There is no global physical-object lock because artifacts
are not shared.

### 7.3 Execute deletion

The operation handler:

1. validates the exact organization, session, current OperationRun, and
   deletion lifecycle;
2. confirms the persisted canonical write fence;
3. computes the full OperationRun closure from immutable session-ownership
   edges, execution-attempt bindings, and parent/child edges, then best-effort
   cancels each active runtime and every active run in that closure using the
   exact stored handle or fence;
4. waits for every KidItem-controlled process and writer to exit, or
   irreversibly revokes its filesystem, credential, and callback authority,
   then removes KidItem-owned runtime grants, encrypted reconnect handles, MCP
   credentials, homes, work directories, state files, and adapter checkpoints
   through adapter-specific cleanup ports;
5. reads the bounded session-owned artifact IDs and their exact materialization
   runs;
6. fences or terminalizes each materialization writer and asks the storage
   adapter to reconcile and delete the derived key;
7. proceeds only for a confirmed `erased` result; `present` or `unknown` is a
   retryable failure;
8. revalidates that the exact closure from step 3 is terminal or fenced and has
   not gained a new member;
9. after every object succeeds, enters the final graph transaction; and
10. returns success only after that transaction records `graph_deleted`.

Runtime cancellation failure does not block deletion after the canonical write
fence is durable. A late callback cannot become canonical and cannot recreate an
artifact.

Runtime cleanup is not best-effort. Each code-owned adapter must confirm that
no KidItem-controlled process or writer can recreate state, and that its
KidItem-owned credentials, handles, and filesystem state are gone. A failed
cancel response is acceptable only when the adapter can independently prove
process exit or irreversible authority revocation. Otherwise cleanup retries
and can produce `delete_failed`. A cleanup port may delete only a handle,
credential, or path proven to be exclusively owned by the session; a
cross-owner coordinate is an invariant failure. External-provider telemetry
remains outside this boundary as stated in the non-goals.

### 7.4 Final graph transaction and purge

The final transaction reacquires the lifecycle lock and AgentSession row,
rechecks the exact deletion run and fence, and deletes the organization-scoped
session graph in FK-safe order. The deletion covers at least:

- conversation events and outbox rows;
- approvals and approval continuations;
- artifacts;
- execution usage, execution-attempt OperationRun bindings, and executions;
- every terminal or fenced OperationRun reached only through those attempt
  bindings or session-ownership edges, including its checkpoints and results;
- task delegations, policy snapshots, context epochs, and tasks; and
- the AgentSession row.

The graph transaction deletes ordinary session OperationRun ownership edges but
retains the complete transient deletion binding lineage and every corresponding
deletion run for the ephemeral finalizer. The current binding remains the sole
status pointer and its current run carries the `graph_deleted` checkpoint.

An OperationRun used by more than one canonical owner is an invariant failure;
the deletion fails rather than guessing ownership. The current
`agent_session_delete` run is excluded from graph contraction because the
executor still owns it.

Every OperationRun started from an AgentSession must acquire an immutable
session-ownership edge at creation, including deterministic domain Operations
started through a session capability. The deletion closure begins with those
ownership edges and execution-attempt bindings, then traverses OperationRun
parent and child edges. Every reached run must be exclusively session-owned and
free of a schedule or another canonical owner. Any cross-owner edge fails
deletion. The graph transaction removes the complete validated closure so no
parent result or child checkpoint can retain a session coordinate.

The final transaction recomputes this same closure under the lifecycle lock,
requires every member to match the closure fenced by the handler, and rejects
any newly observed or nonterminal member. The handler and transaction therefore
cannot disagree about deterministic capability runs.

The same transaction persists a `graph_deleted` checkpoint on the current
OperationRun. This cross-domain checkpoint is required so recovery can
distinguish a completed graph contraction from an unknown missing session.

After the handler returns, the Operations executor terminalizes the run and
deletes the complete deletion lineage in one code-owned ephemeral-finalization
transaction. If terminalization or purge fails, that transaction rolls back and
the claimed executor retries finalization while the same server lifecycle still
owns the attempt; it never exposes a durable succeeded row.

If the process exits after `graph_deleted` but before purge, startup does not
revive the old run. After `ACCEPTING`, a bounded ephemeral-finalization recovery
scans only code-owned deletion runs carrying that checkpoint and purges their
lineages directly. It does not create a session or execute deletion again.

While this transient run exists, the status query finds its exact transient
binding by organization/session deletion identity and returns
`200 { state: "finalizing" }` after rechecking membership and creator/admin
authorization; a repeated `DELETE` returns `202 finalizing`. The finalization
transaction deletes deletion bindings before their OperationRun rows. After it
removes the complete binding and run lineage, either route returns `204`. No
permanent receipt is required.

## 8. Failure and retry policy

One deletion retry generation has at most five cumulative execution attempts
across every server-lifecycle successor:

1. initial attempt;
2. retry after one minute;
3. retry after two additional minutes;
4. retry after four additional minutes; and
5. retry after eight additional minutes.

These delays are an `agent_session_delete` policy, not a pre-existing generic
Operations backoff. The execution input port returns an allowlisted retry
disposition with the next delay. The Operations failure transition persists the
database-time due instant in the existing OperationRun `scheduledFor` field.
Claiming must reject the run before that instant. The delays are one, two, four,
and eight minutes after the preceding failed attempt.

Under the session lifecycle lock, recovery computes consumed attempts as the
sum of the persisted `OperationRun.attempts` counters on the immutable run
identities referenced by every binding in the exact
organization/session/retry generation. A lifecycle-cancelled run with no claim
contributes zero; a claimed execution contributes one even if shutdown later
cancels it. The successor's `maxAttempts` is exactly
`5 - consumedAttempts`.

Storage errors are allowlisted and content-free. Object keys, provider payloads,
message content, prompts, and credentials never appear in OperationRun results,
logs, or API errors.

If all five attempts fail:

- a fenced composition transaction terminalizes the current run and moves the
  exact bound session to `delete_failed` with the same allowlisted failure code;
- normal session surfaces remain unavailable;
- the current failed lineage remains for bounded operational inspection;
- an administrator may create a fresh five-attempt successor lineage; and
- successful retry purges both the new and prior lineages.

Server shutdown or replacement terminally cancels the current run regardless
of its remaining attempt budget. Lifecycle cancellation without a dispatched
execution does not consume an attempt. Post-startup recovery creates a
successor with only the generation's remaining budget; it never changes the
cancelled predecessor. If no attempts remain, recovery atomically moves the
session to `delete_failed`. Only an explicit administrator retry increments the
retry generation and starts a fresh five-attempt budget.

Partial object deletion is safe. The DB graph remains, subsequent attempts
repeat every derived delete, and an object confirmed absent after its writer is
terminal succeeds. OperationRun terminal state alone is not storage proof: the
adapter must also establish that the underlying put invocation is terminal and
can no longer commit, then confirm provider absence. A timeout, abandoned
promise, or an absence read racing an unresolved put remains `unknown`. The
product does not report deletion completion until all storage deletes and graph
contraction succeed.

An invariant, scope, or FK failure also results in `delete_failed`; it does not
create a quarantine state or silently discard a row.

## 9. Process composition

- The API process root owns the deletion HTTP controller, Operations command
  creation, the existing in-process Operations worker lifecycle,
  composition of `AgentSessionDeletionOperationHandler`, and composition of the
  Operations-owned ephemeral finalizer. The handler remains an Agent OS
  incoming adapter; the API root does not own its domain logic.
- The HTTP request does not execute storage deletion inline; the API process's
  claimed Operations attempt does.
- The separate Agent OS worker root does not claim Operations runs and does not
  import the deletion handler or finalizer.
- The MCP root exposes no lifecycle deletion endpoint and owns no deletion
  worker.
- No dedicated lifecycle HMAC key, retention scheduler, or maintenance timer is
  introduced.

## 10. Verification contract

### 10.1 Unit and contract tests

- creator deletion, administrator deletion, ordinary-user denial, and
  cross-organization non-enumeration;
- strict repeated-`DELETE` `202 deleting`/`202 finalizing`, status-`GET` `200`,
  absent `204`, and administrator retry contracts;
- code-owned `ephemeral_on_success` registration and rejection for other
  operation types;
- runtime adapter artifact materialization with no raw storage reference in the
  normalized event;
- materialization reconciliation that never treats an unknown put as erased;
- adapter-specific runtime home, state, handle, and credential cleanup that
  refuses success while a controlled process can recreate them;
- runtime cancellation timeout after a durable write fence; and
- five-attempt exhaustion and safe failure-code projection.

### 10.2 Real PostgreSQL tests

- session transition and OperationRun creation commit or roll back together;
- two concurrent DELETE requests create one current deletion run;
- append versus begin-delete uses two independent connections and a barrier:
  append commits first and is included in deletion, or deletion commits first
  and append is rejected, with no deadlock or timeout;
- a paused and then ambiguous storage put versus deletion proves that cleanup
  cannot convert `unknown` or an unfenced writer into success and leaves no late
  object;
- a timed-out put that resolves after the caller deadline cannot commit after
  deletion has reported success;
- every mutation family rejects a fenced session;
- cross-organization and non-owner controls cannot affect the session;
- crash recovery after fence, after runtime cancel, after a partial artifact
  delete, and after `graph_deleted` but before ephemeral purge, with the old run
  remaining immutable and any executing successor created only after
  `ACCEPTING`;
- multiple server restarts cannot exceed five cumulative attempts in one retry
  generation;
- `scheduledFor` prevents claims before each database-time 1/2/4/8-minute due
  instant;
- five storage failures produce `delete_failed`, and an administrator retry
  succeeds;
- successful deletion leaves zero session graph rows and zero deletion
  OperationRun lineage rows;
- deterministic capability and Agent-attempt OperationRuns created from the
  session are both reached through immutable ownership and fully removed, while
  a cross-owner edge fails closed;
- all KidItem-owned runtime directories, state, credentials, handles, and
  storage objects are absent before the API can return `204`;
- unrelated OperationRuns and other organizations remain unchanged.

### 10.3 Process and browser acceptance

A deterministic fake runtime and fake KidItem storage are used; no external
Hermes, Codex, Claude, OpenAI, or production database is contacted.

Acceptance proves:

- API request returns `202` without waiting for deletion;
- the session disappears from ordinary UI surfaces while deleting;
- late runtime events cannot reappear after fencing;
- failure is visible only as a stable deletion status;
- administrator retry completes; and
- final UI/API reads return the non-enumerating absent response.

API, Agent OS worker, and MCP roots are booted separately. The API-root
Operations worker proves deletion execution. Agent OS worker and MCP prove the
deletion handler, finalizer, Operations claimer, and HTTP provider are absent.

### 10.4 Static and schema gates

Regression gates reject:

- retention, legal-hold, audit-projection, tombstone, shared-artifact-object,
  reference-count, and quarantine production symbols;
- raw `storageReference` in AgentSessionArtifact persistence and normalized
  runtime artifact events;
- a session-originated OperationRun without an immutable session-ownership
  edge;
- a second deletion job table, interval processor, or lease implementation;
- mutation code that bypasses the session lifecycle lock; and
- concrete-service imports from HTTP adapters, or outgoing-port imports from
  the Operations incoming adapter.

Schema verification uses a fresh disposable PostgreSQL database, `db:push`,
Prisma generation, ERD synchronization, and shared/server builds. Because the
feature is unreleased, no production backfill or compatibility migration is
created.

## 11. Supersession and implementation gate

This design supersedes only the session lifecycle, retention, legal-hold,
tombstone, artifact-erasure, and organization-removal content in Task 1 and the
related global constraints of
`2026-08-13-interaction-os-first-deployment.md`. It does not change the later
pre-launch contraction sequence or authorize implementation by itself.

After written approval:

1. amend the authoritative first-deployment plan so it contains no stale
   retention or legal language;
2. write a replacement TDD execution plan for this bounded deletion design;
3. revert or replace the unreleased Task 1 implementation without compatibility
   aliases; and
4. resume implementation only from the approved plan.
