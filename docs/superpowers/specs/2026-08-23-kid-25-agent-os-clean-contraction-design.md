# KID-25 Agent OS Clean Contraction Design

- Date: 2026-08-23
- Status: Approved for implementation planning
- Tracking issue: KID-25
- Source baseline: `82a58a1768f29e3517a62903c0203a81e47037ab`
- Classification: Agent OS platform reconstruction across server, Web,
  Operations, schema, deployment, and durable documentation
- Data decision: pre-launch destructive contraction; no Agent OS legacy data
  migration, compatibility layer, dual-write, or provider-history migration
- Release decision: KID-25 completes code, schema, deployment automation,
  compatibility canaries, and local/production-like disaster-recovery proof.
  The first Office rollout and measured production RPO/RTO remain a separate
  release-operations issue.

## 0. Decision Authority

This document is the single design authority for completing KID-25. It fixes
every decision agreed during the 2026-08-23 reconstruction review. An
implementation plan derived from this document must map every normative rule
to a code change and verification step; it may not silently preserve a
contradictory earlier design.

When another Agent OS document conflicts with this document, this document
wins. Implementation may choose local names, indexes, and adapter shapes that
do not change the contracts below. It must stop for a design amendment before
adding a durable aggregate, lifecycle state, database ownership boundary,
provider-history dependency, or deployable service that this document does
not authorize.

### 0.1 Superseded designs and plans

The following documents must not be used as implementation authority after
this design:

| Document | Supersession |
|---|---|
| `specs/2026-08-13-ai-chat-interactive-response-design.md` | Its Agent OS runtime, gateway, conversation/replay, execution, policy, artifact, analytics, provider, and deployment contracts are replaced. Non-conflicting visual product ideas are reference-only. |
| `specs/2026-08-21-agent-session-deletion-design.md` | Replaced in full by the smaller coordinated hard-deletion contract in this document. |
| `specs/2026-08-23-copilotkit-nest-incoming-adapter-design.md` | Replaced in full. Its Nest adapter conclusion remains, but PostgreSQL conversation replay and the old execution graph do not. |
| `plans/2026-08-13-agent-session-interaction-vertical-slice.md` | Replaced; do not resume unchecked tasks. |
| `plans/2026-08-13-agentos-official-session-runtime.md` | Replaced; do not resume unchecked tasks. |
| `plans/2026-08-13-copilotkit-native-interaction-os-index.md` | Replaced; do not use its completion checklist. |
| `plans/2026-08-13-interaction-os-first-deployment.md` | Replaced for KID-25. Actual Office rollout remains a separate release-operations issue. |
| `plans/2026-08-13-interaction-platform-foundation.md` | Replaced; do not resume unchecked tasks. |
| `plans/2026-08-22-agent-session-complete-deletion.md` | Replaced; do not resume its artifact/runtime cleanup graph. |
| `plans/2026-08-23-copilotkit-nest-incoming-adapter-contraction.md` | Replaced by the implementation plan that will be generated from this document. |
| `plans/2026-08-10-sourcing-agentos-runtime.md` | Superseded as an executable plan for KID-25. Sourcing business requirements may be consulted, but no task is resumed. |
| `plans/2026-08-13-sourcing-long-running-operations.md` | Superseded as an executable KID-25 plan. Its completed deterministic Operations contracts are reference-only. |

The following documents are only partially superseded:

- `specs/2026-08-10-sourcing-agentos-capability-runtime-design.md` retains
  Sourcing-owned business capability requirements, but its AgentRun,
  conversation, artifact, cost, playbook, authority, and provider-runtime
  contracts are replaced here.
- `specs/2026-08-13-sourcing-long-running-operations-design.md` retains
  deterministic Operations behavior and domain-owned long-running work. Its
  generic Agent worker, AgentRun, HMAC capability grant, conversation,
  artifact, and provider-runtime assumptions are replaced here.
- `specs/2026-08-12-codex-skill-profile-management-design.md` remains the
  developer workspace skill-discovery contract. It is not a production Agent
  runtime configuration source and is never mounted into an Attempt unless an
  explicit KidItem runtime profile authorizes exact content.

## 1. Executive Decision

KID-25 will contract the current interaction platform into one small Agent OS
inside Nest. CopilotKit OSS remains the browser/runtime protocol adapter, but
there is no separate Interaction Gateway application or private HTTP control
plane. Codex CLI and Claude CLI are the only reasoning runtimes. Their native
subagent orchestration remains available within one KidItem Attempt, while a
durable KidItem child Task is created only when business responsibility moves
to another explicitly selected Agent.

KidItem durably stores work state, not a provider conversation:

```text
Browser
  -> same-origin Nest /api/copilotkit
  -> one AgentSession and root AgentSessionTask
  -> immutable Codex/Claude AgentAttempt
       -> ephemeral provider-native subagents
       -> typed owner-domain capability calls
       -> explicit child AgentSessionTask delegation
  -> durable capability invocation / approval / Operation references
```

The database keeps objectives, Task structure, Attempts, concise results,
resource references, exact mutation inputs, authorization decisions,
approvals, idempotency, and Operation references. It does not keep chat
messages, model transcripts, provider sessions, replay events, generated
artifacts, provider credentials, or cost accounting.

## 2. Problem Statement

The current branch implements a much larger architecture than the product
requires:

- a standalone `apps/interaction-gateway` and private Nest control plane even
  though Office deployment has no gateway image, service, nginx upstream, or
  independently justified scaling/release boundary;
- `AgentSession -> Task -> Execution -> Attempt` plus policy, authority,
  context, conversation, replay, artifact, cost, and continuation layers;
- multiple internal HMAC credentials introduced only because two processes
  authenticate each other;
- duplicated replay/live projection and differing AG-UI message semantics;
- tool-wrapper Agents and fixed playbooks that compete with native
  Codex/Claude orchestration;
- provider credential and session concepts that are unnecessary when the
  service-account CLI is already logged in; and
- durable transcript and artifact infrastructure even though the desired
  product durability is the work record and resulting business resources.

There is no production KID-25 data contract to preserve. Compatibility layers
would preserve the accidental architecture rather than reduce risk.

## 3. Goals And Non-Goals

### 3.1 Goals

- Make one authenticated Nest request the browser-facing Agent OS boundary.
- Keep CopilotKit OSS and AG-UI for live protocol adaptation only.
- Give a single user a reliable Codex-like work surface with explicit durable
  business delegation.
- Preserve owner-domain input ports and deterministic Operations as business
  execution boundaries.
- Use the local service account's Codex/Claude login without KidItem-managed
  provider credentials.
- Preserve only work metadata needed for task continuity, approval,
  idempotency, audit, and resulting resource navigation.
- Make mutation authorization, approval, dispatch, and retry use one exact
  canonical input and idempotency key.
- Delete unreleased legacy AgentRun and overbuilt Interaction OS code instead
  of retaining fallbacks.
- Prove destructive schema recovery before any real rollout.

### 3.2 Non-goals

- A multi-user RBAC or separation-of-duties model.
- Organization quotas, delegation depth/fan-out limits, or graph cycle rules.
- Provider-native transcript persistence, resume, or session migration.
- A durable chat transcript or AG-UI replay ledger.
- KidItem-managed Codex/Claude API keys, OAuth tokens, or credential rotation.
- Hermes, OpenAI Responses, or another production reasoning runtime.
- A separate gateway, Agent worker, message broker, vector store, or cache.
- Automatic retention, legal hold, audit tombstones, artifact storage, or
  provider-file cleanup.
- Automatic CLI or CopilotKit upgrades.
- Production rollout or measured Office RPO/RTO inside the KID-25 development
  issue.

## 4. Selected Contraction Approach

### 4.1 Selected: clean in-place contraction

Add the minimal replacement contracts and regression scanners, cut callers to
them, and delete the old layers in the same implementation program. The final
schema and runtime have one source for each fact and no dormant compatibility
path.

### 4.2 Rejected: strangler compatibility shell

Dual routes, dual writes, table adapters, and data backfills add more states
while preserving data that the product explicitly permits deleting. They also
make the old architecture appear supported after cutover.

### 4.3 Rejected: new standalone Agent platform

A new gateway or Agent service recreates deployment, authentication, health,
and failure boundaries for which no independent scale, release cadence, or
fault isolation requirement exists.

## 5. Code-Owned Domain, Agent, And Capability Model

### 5.1 Domain registry

Create a code-owned `DomainDefinition` registry. A domain has a stable key,
name, and description. It formalizes existing backend owner-domain boundaries;
it is not inferred from folders and does not create a second business taxonomy.

Initial cataloged domains are:

```text
advertising  agent_os  ai  analytics  automation  channels
finance      inventory orders operations products  rules
sourcing     supply
```

Capabilities may exist in an unassigned domain. Domain assignment never grants
exclusive ownership and never chooses a target Agent automatically.

### 5.2 Persistent Agent definitions

Keep these code-owned Agents:

| Agent | `assignedDomains` |
|---|---|
| Operator | `agent_os`, `automation`, `operations` |
| Sourcing | `sourcing` |
| Merchandising | `products`, `ai` |
| Supply | `supply` |
| Channel Operations | `channels`, `orders`, `inventory` |
| Advertising | `advertising` |

`finance`, `analytics`, and `rules` remain cataloged but initially unassigned.
One domain may be assigned to multiple Agents later. `assignedDomains` defines
an Agent's default work/capability scope; it is not exclusive ownership.

Remove the legacy `chat` Agent. Operator is the only default user-facing
coordinator. Remove tool-wrapper Agent definitions such as
`rules_evaluation`, `rules_suggest`, `ad_strategy`, and
`thumbnail_analyst`. Their behavior becomes ordinary owner-domain
capabilities whose implementation may use AI.

Move incorrectly owned `product_listing.*` capabilities to the correct owner
input ports. Do not expand an Agent's assigned domains merely to accommodate a
misplaced implementation.

### 5.3 AgentVersion

An `AgentVersion` snapshots:

- Agent key and definition version;
- assigned domain keys;
- all default capability keys resolved from those domains at publication;
- selected reasoning runtime, `codex_cli` or `claude_cli`; and
- the immutable Agent instruction/profile reference needed for the Attempt.

Publishing a new capability does not mutate an existing AgentVersion. A new
AgentVersion must be published before that capability enters an Agent's
default scope. There is no database override for Agent/domain mapping.

New Task/delegation routing resolves the current published AgentVersion, but a
previously published version remains immutable and executable while any
retained Task references it. It may become non-current for new work; it cannot
silently rebind an existing Task or make that Task's runtime unavailable.

AgentVersion does not own capability implementation versions, AI model
configuration, per-tool allowlists, authority profiles, or provider
credentials. The release `VERSION` and Git SHA identify the application code
that implemented a capability invocation.

Reasoning adapters and AI-backed owner capabilities receive explicit model
configuration from their code/deployment-owned runtime profile. Missing model
selection is an error; no `model || default` fallback is permitted. The actual
provider/runtime/model reported by an invocation is recorded when available.

### 5.4 Capability layering

The only supported layering is:

```text
Agent
  -> CapabilityDefinition
    -> owner input port
      -> owner implementation
           -> optional AI call
           -> optional repository/DB access
           -> optional external API/browser
           -> optional Operation enqueue
```

Agent OS owns discovery, routing, exact authorization, approval,
idempotency validation, invocation lifecycle, and audit metadata. It never
owns the capability's business implementation or model configuration.

`CapabilityDefinition` remains code-owned and contains:

- stable key and owner domain;
- description;
- input and output schemas;
- detailed effects metadata;
- canonical `approvalRisk: none | low | medium | high`;
- idempotency requirement; and
- owner entrypoint.

Remove `kind`, `visibility`, the old manifest `approval` value, and the
handler's duplicate approval/effect declarations. There is no separate
`CapabilityVersion` database model.

KID-25 does not introduce a new `requirements` taxonomy. Existing descriptive
metadata such as browser/LLM requirements may remain, but only these effects
classify a mutation:

```typescript
const MUTATION_EFFECTS = new Set([
  'db_write',
  'external_write',
  'job_enqueue',
]);

function isMutation(capability: CapabilityDefinition): boolean {
  return capability.effects.some((effect) => MUTATION_EFFECTS.has(effect));
}

function requiresDomainDelegation(
  currentAgentVersion: AgentVersion,
  capability: CapabilityDefinition,
): boolean {
  return (
    isCrossDomain(currentAgentVersion, capability) &&
    isMutation(capability)
  );
}
```

An own-domain mutation remains direct, while the same mutation discovered
across a domain boundary requires delegation. Approval is evaluated separately
from delegation so that selecting the correct owner Agent cannot bypass HITL.

A browser-backed capability that writes must declare `external_write` in
addition to any browser requirement. CI and boot validation reject every
mutation capability whose idempotency is not `required`. Query capabilities
must declare `approvalRisk` as `none` or `low`.

## 6. Routing And Orchestration

### 6.1 Two-step cross-domain rule

The runtime routing rule is deliberately small:

1. A cross-domain capability with no mutation effect is invoked directly by
   the current Agent through an exact automatic read grant.
2. A cross-domain capability with `db_write`, `external_write`, or
   `job_enqueue` is delegated to an explicitly selected registered Agent.

Capability metadata remains detailed for security, retry, rollback, and
operations decisions, but it does not create additional routing modes.
Capability catalog search returns owner domain, effects, approval risk,
idempotency, schemas, and every currently published Agent whose default scope
contains that domain. It never grants execution authority or selects one of
those Agents automatically.

An unassigned-domain query still follows rule 1: the current Agent invokes it
directly through an exact `cross_domain_read_grant` for that Attempt and input.
An unassigned-domain mutation has no inferred owner Agent, so the caller must
explicitly select a registered target Agent; the server records an exact
`explicit_execution_grant` for the delegated mutation. There is no
domain-to-unique-Agent lookup and no hidden fallback Agent.

### 6.2 Native provider subagents

Codex/Claude native subagents are ephemeral helpers inside one KidItem
Attempt. They:

- share the parent AgentVersion, Attempt, sandbox, MCP configuration, and
  effective capability authority;
- use the provider's native context/orchestration behavior;
- are not KidItem Agents, Tasks, Attempts, grants, or durable audit rows; and
- do not independently consume a KidItem global Attempt slot.

This preserves the convenient subagent behavior of Codex/Claude without
turning implementation-level parallelism into business workflow state.

### 6.3 KidItem Agent delegation

A KidItem delegation is created only when business responsibility changes. It
creates a child `AgentSessionTask` with:

- `parentTaskId`;
- `delegatedFromAttemptId`;
- explicitly selected target Agent key and the exact published `AgentVersion`
  resolved by the server at delegation time;
- objective and completion criteria;
- selected `resource_ref` inputs; and
- a stable delegation idempotency key.

There is no `AgentSessionTaskDelegation` table. The child Task is the delegation
record and lifecycle authority. Delegation uniqueness is scoped to
`(parentTaskId, idempotencyKey)`. The row stores a canonical request hash over
target Agent key, objective, completion criteria, and sorted resource
references. Repeating the key with the same hash returns the existing child;
another payload fails `delegation_idempotency_conflict`. Same-type Agents may
recur in the tree. KID-25 adds no depth, fan-out, organization quota, or
graph-cycle policy.

Delegation reserves a global CLI slot before one transaction locks the Session
and parent Task in that order, revalidates `Session.active`, authorization,
idempotency, and the one-live-Attempt invariant, then creates the child Task and
its first Attempt. Any failed revalidation or uniqueness race releases the
slot. Capacity exhaustion creates neither row and returns
`agent_capacity_exhausted`; it never leaves an unqueued open child. A replay of
an already-created delegation returns that Task without reserving another
slot; a concurrent replay that discovers the row inside admission also releases
its provisional slot.

The parent may query status, wait, read the result, send a message, or
interrupt live reasoning. A message to a live child reaches the active
Attempt. A follow-up to a completed child reopens the same child Task and
creates a new immutable Attempt; it never restores a provider process.

The delegated context is explicit: objective, completion criteria, selected
resource references, and the target Agent's independently calculated
authority. No parent transcript or provider session is copied.

### 6.4 Child result envelope

Every Agent result uses a common durable envelope:

- outcome;
- concise summary;
- `resource_ref` values;
- `operation_ref` values;
- optional canonical `continuationSources` selecting the exact Operation
  references whose terminal results may admit one background/user Continue;
- structured `needs_input` or error data; and
- optional Agent-specific output validated by that Agent's schema.

Full model output, chain-of-thought, and native subagent transcripts are not
stored.

## 7. Authorization, Invocation, And HITL

### 7.1 Authorization inputs

Every capability call revalidates:

- the current authenticated user and active organization membership;
- the exact Session, Task, and Attempt scope;
- the target AgentVersion's snapshotted default capabilities;
- the capability definition and current owner input port; and
- the exact canonical input hash.

The product is single-user. Do not add `invokeRoles`, `approveRoles`,
`selfApprovalAllowed`, organization authority profiles, or role-specific
approval rules. HITL confirms risky mutation intent; it does not implement
separation of duties.

A parent never transfers a capability subset to a child. Child authority is
calculated from the target AgentVersion, current authenticated user, and exact
execution request. Unassigned or out-of-scope capabilities require an explicit
execution authorization.

### 7.2 Invocation is the authorization record

There is no `AgentCapabilityGrant` table and no reusable grant token. The
server authorizes an exact call and creates its
`AgentCapabilityInvocation` atomically. The row records:

- Attempt, AgentVersion, capability key, and owner domain;
- `authorizationKind` of `agent_default_scope`,
  `cross_domain_read_grant`, or `explicit_execution_grant`;
- authorization decision and expiry time;
- immutable input hash;
- canonical input for mutations only;
- snapshotted effects, approval risk, and idempotency requirement;
- stable owner idempotency key for every mutation;
- release `VERSION`, authorizing Git SHA, a deterministic capability-contract
  fingerprint, and reported runtime/model metadata;
- lifecycle, lease, retry, result references, and structured failure; and
- optional content-free token counts reported by the provider.

An authorization can admit only its already-created Invocation; it can never
authorize another call or be used by a successor Attempt. An unexecuted read
Invocation expires with its Attempt. A mutation Invocation that was durably
admitted while the Attempt was live remains authorized only for its own exact
canonical input through approval and dispatch, even if the CLI exits. It ends
at its terminal result or Approval expiry. Read invocations retain only the
input hash and status; they do not retain canonical input or full output.
Mutations retain canonical input because approval, stale-input validation,
idempotency, and durable dispatch require it.

### 7.3 Invocation lifecycle and dispatch

The Invocation row is both audit record and durable mutation work item. It is
the only dispatch source; there is no mutation outbox table.

Conceptual transitions are:

```text
read:
  authorized -> executing -> succeeded | failed

mutation without HITL:
  ready -> executing -> succeeded | failed

mutation with HITL:
  approval_pending -> ready -> executing -> succeeded | failed
                     \-> failed (approval_rejected | approval_expired |
                                  task_cancelled)
```

The exact Invocation values are `authorized`, `approval_pending`, `ready`,
`executing`, `succeeded`, and `failed`. Approval owns the exact
approved/rejected/expired decision; Invocation uses a structured terminal error
rather than duplicating those states. A no-HITL mutation is created directly
as `ready`. These values are stored as validated strings under the repository's
Prisma contract. No duplicate lifecycle is stored elsewhere. A worker claims
`ready` work using a bounded lease and retries with the same idempotency key.
The owner capability must make the key stable at the actual
DB/external/Operation boundary.

The capability-contract fingerprint covers its key, owner, schemas, effects,
approval risk, idempotency rule, and owner entrypoint identity. Mutation
dispatch also requires the currently deployed Git SHA to equal the authorizing
SHA. A mismatch performs no business call and terminalizes as
`stale_capability_version`; the user must create a new Invocation and Approval.
Release automation drains `ready`/`executing` work before replacing the worker;
pending approvals from an older SHA become stale instead of executing changed
code.

For external systems, KidItem's exactly-once intent is realized through durable
dispatch plus owner idempotency; transport alone is not claimed to provide
literal exactly-once delivery.

Read Invocations execute inline and are never retried after API/process loss.
On boot and Attempt reconciliation, every nonterminal `authorized` or
`executing` read Invocation whose Attempt is no longer live becomes `failed`
with `process_interrupted`. Canonical read input was not retained, so a
successor Attempt must authorize and issue a fresh read. Mutation Invocations
are not terminalized by this reconciler: `ready` work remains worker-owned and
an expired `executing` worker lease is retried with the same owner idempotency
key.

A `job_enqueue` capability succeeds as soon as the owner atomically creates the
durable Operation and returns its `operation_ref`. The capability invocation
does not hold the CLI call open until the Operation finishes. The Agent may
query or wait on that Operation through an owner-approved status capability.

### 7.4 Approval rule

The canonical rule is:

```typescript
const requiresHumanApproval =
  isMutation(capability) &&
  (capability.approvalRisk === 'medium' ||
    capability.approvalRisk === 'high');
```

This rule applies equally to own-domain and delegated mutations. Delegation
selects business responsibility; `approvalRisk` alone selects user
confirmation. Query capabilities remain `none`/`low` and never enter HITL.

`AgentCapabilityApproval` is a separate durable decision because it has a user
interaction lifecycle. It binds one exact Invocation and canonical input hash.
Its only transitions are:

```text
pending -> approved | rejected | expired
```

The decision cannot be edited, reopened, or reused. Approval expires after at
most 24 hours; Task cancellation may expire it earlier with reason
`task_cancelled`. The approval decision and the Invocation transition from
`approval_pending` to `ready` or `failed` occur in one transaction while
holding the Session and Invocation fences. Immediately before execution, the
worker loads the initiating user/organization recorded on the Invocation and
revalidates current active membership, AgentVersion scope, current capability
contract/SHA, resource version, and owner preconditions; it does not depend on
an expired browser cookie. A resource mismatch fails the Invocation as
`stale_resource`; changed input requires a new Invocation and, if necessary, a
new Approval.

The Invocation, exact canonical mutation input/hash, and pending Approval are
committed before any approval request is emitted to the browser or CLI. The UI
never asks a user to approve state that is not already durably addressable.

A live CLI may wait for approval for at most 10 minutes within its total
Attempt timeout. Approval or rejection received during that window returns to
the same Attempt. If the process has exited, the durable mutation still
continues, but any additional reasoning starts in a successor Attempt.

## 8. Durable Data Model

### 8.1 Target graph

```text
AgentVersion
  <- AgentSessionTask

AgentSession
  -> exactly one root AgentSessionTask
       -> zero or more child AgentSessionTask rows
       -> immutable AgentAttempt rows
            -> AgentCapabilityInvocation rows
                 -> optional AgentCapabilityApproval
            -> concise result/resource/operation references
```

Structured `resource_ref` and `operation_ref` values are stored in Task input
and Attempt/Invocation result envelopes. They are references, not Agent OS
ownership edges. Business rows and `OperationRun` remain owned by their domain;
deleting a Session removes only the references.

### 8.2 AgentSession

`AgentSession` is the user-visible work and hard-deletion boundary. It owns
organization/user scope, one root Task invariant, timestamps, deletion cutoff
time/generation, and only these lifecycle values:

```text
active | deleting
```

It does not own a thread transcript, provider session, replay cursor, cost
total, retention deadline, legal hold, artifact namespace, or runtime
credential.

### 8.3 AgentSessionTask

Task owns durable business responsibility. It stores objective, completion
criteria, input resource references, selected AgentVersion, parent/delegation
coordinates, stable delegation idempotency, and a server-authorized
`continuationMode: interactive | background`. The mode is immutable after Task
creation, is accepted only from an authenticated Agent OS application
entrypoint, and is never selected or changed by model output, a capability,
an Operation handler, or a deterministic workflow. Interactive is the default
and never auto-starts successor reasoning. It stores only these lifecycle
values:

```text
open | completed | failed | cancelled
```

Task does not duplicate approval, child, Operation, or Attempt waiting states.
Those are calculated by the UI projection from their authoritative rows.

There is exactly one root Task per Session. All other Tasks have a parent. A
user follow-up or explicit retry reopens the same root/child Task and creates a
new Attempt. A child failure does not automatically fail or cancel its parent;
the parent reasons over the child result or asks the user what to do.

At most one Attempt on a Task may be `starting` or `running`. One common
admission service owns root, follow-up, delegation, and background Attempt
creation. It reserves a nonblocking global capacity slot first, then one
transaction locks the existing Session and Task in that order, revalidates
`Session.active`, current user/membership authority, the exact Task-pinned
AgentVersion, and the one-live-Attempt invariant, and only then inserts the
Attempt. A new Session, its root Task, and first Attempt are created atomically
in one transaction after capacity reservation. Any failed transaction,
authorization check, idempotency/uniqueness race, or deletion race returns the
slot. The predecessor must be terminal before a successor is admitted.

A request arriving while an Attempt is live is delivered through the provider
adapter's bounded live-input channel and never creates another Attempt. Runtime
readiness must prove live message delivery for every required runtime; the CI
compatibility matrix separately proves both supported CLIs. A broken channel
fails explicitly without silently starting a successor. No projection infers
a winner from concurrent rows.

Attempt terminalization does not mechanically copy a status onto Task. A
successful Attempt may leave Task `open` when it returns `needs_input` or an
in-progress Operation reference; an interrupted Attempt leaves Task `open`.
Task becomes `completed`, `failed`, or `cancelled` only from an explicit
business outcome. Interrupting a live process cancels the Attempt, not the
Task. An authorized follow-up may reopen a completed or failed Task; only the
current user can explicitly reopen a cancelled Task.

Task transitions are owned by one server-side lifecycle service; model output
is an input to validation, never direct write authority:

| Transition | Required authority and invariant |
|---|---|
| `open -> completed` | Current user or the Task's owning Agent returns a schema-valid completed outcome, completion criteria pass, and no pending Approval, `ready`/`executing` mutation, or required open child remains. An active Operation may remain only when durable enqueue/handoff itself satisfies the completion criteria. |
| `open -> failed` | Current user or owning Agent records an unrecoverable business outcome, with the same pending-work fence as completion. Process interruption alone never qualifies. |
| `open -> cancelled` | The current user explicitly cancels further business responsibility. The service interrupts live reasoning and blocks new work but never undoes approved mutations or Operations; those remain visible in the derived projection. A parent Agent has only the agreed `interrupt` control over a live child, not Task-cancellation authority. |
| `completed | failed -> open` | Explicit user follow-up/retry or parent follow-up on a child. The transaction verifies no live Attempt and reserves capacity before creating a successor. |
| `cancelled -> open` | Explicit current-user reopen only. Background policy and parent Agents cannot reopen a user-cancelled Task. |

A cancelled Task cannot accept a pending Approval decision or new Invocation
until explicitly reopened. Existing approved/ready/executing work keeps its
independent durable lifecycle.

### 8.4 AgentAttempt

Attempt is one actual Codex or Claude CLI process. It stores:

- immutable Task input/objective and selected resource references;
- AgentVersion and explicit runtime profile;
- application `VERSION`, Git SHA, CLI version, and reported model;
- start/end timestamps and terminal result envelope;
- structured process error; and
- optional content-free provider token usage.

Its only lifecycle is:

```text
starting | running | succeeded | failed | process_interrupted | cancelled
```

Approval wait, child wait, Operation wait, capacity wait, and Continue-needed
are not Attempt states. Capacity is acquired before creating an Attempt, so an
Attempt row is never created for work that did not start. Attempt input and
provider identity are immutable after process launch.

A background or user-Continue successor triggered by terminal Operations may
also store an optional immutable `continuationKey`. An Attempt that expects
later reasoning emits a non-empty canonical `continuationSources` array inside
its result envelope, containing the exact `operation_ref` values whose terminal
results must be observed. The key is a deterministic digest of the Task ID and
the sorted set of each source's Operation identity plus terminal
result/version fingerprint; it deliberately excludes predecessor Attempt ID.
A unique `(taskId, continuationKey)` constraint makes the same terminal source
set eligible for at most one successor Attempt, even when a later result names
it again. Both the coordinator and a user Continue shown for that derived
condition must claim the same key. Once claimed, that source set is no longer
projected as `needs_continue`. A Continue caused by input, interruption, or
approval rather than terminal Operations has no continuation key. This is an
admission/idempotency coordinate, not another lifecycle or queue state.

### 8.5 Derived UI state

One read model derives user-facing state from:

- Task lifecycle;
- the newest/current Attempt;
- pending Approval;
- ready/executing Invocation;
- referenced Operation state;
- open/running child Tasks; and
- whether an interrupted/terminal Attempt needs explicit Continue.

For example, after a CLI exits while approval remains pending:

```text
Task       = open
Attempt    = process_interrupted
Approval   = pending
UI         = awaiting approval; Continue may be needed after execution
```

No derived state is written back to Task.

### 8.6 Models removed

Delete the generic AgentRun module, HTTP surface, services, worker, shared
contracts, and Prisma models. Contract the official graph by removing at least:

- `AgentExecution` and any generic Execution abstraction;
- `AgentContextEpoch`;
- `AgentPolicySnapshot`;
- `AgentAuthorityProfile` and versions;
- reasoning dispatch outbox rows;
- conversation/message/event/outbox/replay cursor models and projectors;
- separate delegation and grant rows;
- approval continuation rows;
- usage/cost ledgers and `costMicros` totals;
- AgentSession artifacts, candidates, materialization, provider upload, and
  storage-object models;
- deletion request/binding, retention, legal-hold, tombstone, quarantine, and
  independently retained audit models; and
- provider credential, native session, resume, and handle persistence.

No compatibility view, legacy route, dormant module, fallback worker, or
dual-write remains.

## 9. Runtime And Process Boundaries

### 9.1 Process topology

The supported production topology is:

```text
Web
  -> Nest API
       -> CopilotKit incoming adapter
       -> live Codex/Claude AgentAttempt executor (bounded in process)
       -> per-Attempt MCP child

existing worker
  -> durable AgentCapabilityInvocation mutation dispatch
  -> deterministic Operations execution
```

Remove `apps/interaction-gateway`, the generic AgentRun worker, and
`AGENT_RUNTIME_WORKER_ENABLED`. Retain the worker service because Operations
and approved mutation dispatch are durable deterministic work. Do not add a
third Agent service or queue.

### 9.2 Attempt-bound MCP IPC

The MCP child is a small stdio-to-local-IPC proxy, not another Nest application
context. It receives no database URL, repositories, owner-domain modules,
business credentials, or serialized authorization context.

Before CLI launch, the API creates a per-Attempt Unix-domain socket beneath a
private runtime directory and binds the server side in memory to the exact
Attempt, AgentVersion, user, organization, capability scope, and CLI process
group. The strict MCP config launches only the KidItem stdio proxy with that
socket coordinate. The API validates OS peer credentials/process-group
membership on every connection, ignores caller-supplied identity, and creates
all Invocations server-side before calling owner input ports. Native subagents
may open the same broker because they intentionally share the parent Attempt's
authority.

The API broker executes authorized reads inline. It never executes a mutation
owner port in the CLI process path: it durably creates `approval_pending` or
`ready`, then waits for or returns the existing worker-owned Invocation result
under the bounded live-tool timeout.

The socket is not a reusable grant. It accepts only peers in the live Attempt
process group, closes at Attempt terminalization, and is removed with the
Attempt runtime directory. It cannot reconnect a successor Attempt. The broker
directory is outside tool-readable paths. No HMAC, bearer token, HTTP endpoint,
network listener, or child DB credential is introduced. API loss closes the
channel and interrupts the Attempt; already admitted mutation Invocations
remain durable for the worker.

### 9.3 Supported providers

Only these runtimes are supported:

- `codex_cli`;
- `claude_cli`.

Remove Hermes and OpenAI Responses runtime paths, config, credentials, tests,
and fallback selection. The deployment `requiredRuntimeSet` is the union of
every runtime referenced by a currently published AgentVersion and every
runtime pinned by any retained AgentSessionTask. Deployment readiness checks
that entire set. A provider outside the set may be absent; an old terminal or
cancelled Task keeps its provider required because the current user may reopen
it until its Session is hard-deleted.

Remove `AGENT_RUNTIME_CLAUDE_MAX_BUDGET_USD`, the implicit `0.25` USD default,
and monetary-budget CLI wiring together with the cost ledger. Runtime safety is
bounded by concurrency, elapsed timeout, sandbox, capability authority, and
HITL rather than an Agent OS monetary accounting state.

Every installed production CLI is pinned exactly. The implementation baseline
is Codex CLI `0.149.0` and Claude Code `2.1.122`, subject only to an explicit
canary-backed upgrade PR. The dedicated CI compatibility image installs and
tests both versions even when one provider is unused in Office. Deployment
readiness verifies each configured runtime's pinned binary, version, login
state, required non-persistent options, and one bounded no-op canary.

### 9.4 Authentication and provider persistence

The dedicated OS service account's CLI login home is the only persistent
provider state. KidItem never reads, copies, encrypts, HMAC-signs, stores in
PostgreSQL, or returns the provider's credentials.

Every Attempt forces history non-persistence:

- Codex: `--ephemeral` and `--ignore-user-config`;
- Claude: `--no-session-persistence` and `--strict-mcp-config`.

KidItem supplies exact model/runtime settings, MCP configuration, sandbox, and
instruction inputs for every Attempt. Provider resume/session IDs are neither
requested nor stored as durable or resumable coordinates. While one Attempt is
alive, its provider adapter may keep a process-memory-only
`liveControlHandle` for the already-running CLI transport. The handle may wrap
an app-server connection, stream-json channel, PTY, or direct process-control
object, but it is never written to PostgreSQL, logs, result envelopes, or
provider history; it is destroyed at Attempt terminalization and is useless
after API restart. It only delivers a message or interrupt to that same live
process and never resumes or follows up on a terminal process. If a pinned CLI
cannot provide that behavior without persistent history or a resumable session
contract, its runtime fails readiness. Restart and follow-up always create a
new immutable Attempt from KidItem durable work state.

### 9.5 Attempt sandbox

Each Attempt receives a new empty temporary workspace. Only that directory is
writable. The application repository and server filesystem are not mounted or
exposed. The child receives no database URL, deployment secret, provider
credential value, or ambient business API credential. KidItem facts and
actions are available only through the scoped MCP surface.

The production provider tool policy is MCP-first. Built-in shell/file tools are
disabled unless the pinned CLI can enforce an OS-backed workspace-only read and
write boundary; instruction text is never treated as a security boundary.
Built-in browser and arbitrary network tools are disabled. Native subagents
inherit exactly the same filesystem, network, and MCP restrictions. The CLI
parent may read the provider login files needed to authenticate, but model-
invoked tools and subagents must be unable to read the auth home, broker
directory, server filesystem, process environment, or another Attempt's
workspace.

The persistent authentication home is mounted separately from the temporary
workspace. The workspace and transient MCP state are deleted when the Attempt
becomes terminal. The login home remains.

CLI and MCP children run in one owned, non-detached process group. Interrupt,
timeout, and graceful shutdown use bounded terminate/kill escalation for that
exact group. On boot, the reconciler marks prior live Attempts
`process_interrupted`, fails their abandoned inline reads as
`process_interrupted`, and removes only their derived directories beneath the
dedicated Attempt workspace root. It leaves worker-owned mutation leases to
the mutation dispatcher. It rejects symlinks or paths outside that root and
introduces no durable cleanup state.

The persistent provider home is treated as an authentication store, not a
general configuration/history home. Per-Attempt settings and state locations
are redirected to the temporary workspace where supported, and the canary
fails if an Attempt writes provider history outside the documented login-file
allowlist. KidItem never parses or copies credential values while enforcing
that filesystem boundary.

Readiness deliberately asks a model-invoked tool and native subagent to read a
sentinel beside the auth files, inspect the broker/server paths, and make an
arbitrary egress request. All must fail while a normal provider request and MCP
capability call succeed. The same canary sends a second input through the live
control handle and proves that the same Attempt responds while no provider
session/history artifact is created. If a pinned CLI cannot prove these
properties, that runtime is unavailable; KidItem must not weaken the sandbox
or enable provider persistence to make it ready.

### 9.6 Capacity and timeouts

- Global live CLI Attempt limit: 4 by default.
- Configuration: `AGENT_CLI_MAX_CONCURRENCY`.
- Total Attempt timeout: 30 minutes.
- Maximum live HITL wait inside an Attempt: 10 minutes.
- Maximum durable Approval lifetime: 24 hours.

Capacity is acquired before Attempt creation. If all slots are busy, an
interactive request immediately returns `agent_capacity_exhausted` with
`Retry-After`. There is no Agent OS queue or capacity-wait state. A background
Task remains derivably eligible for continuation, and the singleton Agent OS
continuation coordinator treats capacity exhaustion as transient and retries
admission without creating an Attempt. The owner Operation only exposes its
terminal state and never owns that retry.

Remove `AGENT_RUNTIME_CAPACITY_WAIT_MS`, `AGENT_RUNTIME_CONCURRENCY`, and the
45-second `AGENT_RUNTIME_EXECUTION_TIMEOUT_MS` contract. Only
`AGENT_CLI_MAX_CONCURRENCY` remains operator-adjustable in KID-25; the 30-minute
Attempt, 10-minute live HITL wait, and 24-hour Approval lifetime are code-owned
policy constants.

KID-25 adds no organization quota, delegation depth/fan-out limit, or Agent
cycle restriction. Native provider subagents do not create additional KidItem
Attempt slots. Exact duplicate delegations are blocked by idempotency.

KID-25 supports exactly one Agent-executor-enabled API replica. The API acquires
a PostgreSQL advisory singleton lock before accepting Agent requests and fails
readiness if another executor holds it. Compose, deployment workflow, and smoke
tests assert one API replica. The four-slot limit and live message/interrupt
routing are therefore server-global without a distributed broker.
Multi-replica Agent execution requires a later design with distributed
admission and signaling; it must not be approximated by independent
process-local semaphores.

## 10. MCP Tool Surface

Use a hybrid surface:

- typed tools for the AgentVersion's default capabilities;
- a global capability catalog search tool;
- one generic exact-input invoke tool for discovered cross-domain queries or
  explicitly authorized out-of-scope calls made by the selected target Agent;
- one explicit delegate tool that names the target Agent; the server resolves
  and stores its current published AgentVersion; and
- child Task `status`, `wait`, `result`, `message`, and `interrupt` tools.

Owner-approved Operation status/wait/cancel capabilities remain ordinary typed
capabilities; enqueueing an Operation does not turn it into a child Agent Task.

Provider-native subagent tools remain untouched. There is no workflow-only
visibility, capability `kind`, fixed AgentPlaybook, or tool-policy allowlist.
The catalog reports metadata but never changes authority.

## 11. CopilotKit, AG-UI, And Web Contract

### 11.1 Nest incoming adapter

The browser continues to call same-origin `/api/copilotkit`. A focused Nest
incoming adapter authenticates the current user and active organization,
creates or continues the Session's one root Task, starts an Attempt, and
streams live AG-UI output.

The adapter is composed only in the API root. It calls Agent OS application
ports in process. It owns no session, authority, active-process map, replay
cursor, or business write. Worker and MCP roots must not import the HTTP
adapter.

### 11.2 No durable conversation replay

Messages, token chunks, tool UI events, and provider-native history are
ephemeral. There is no `AgentConversationEvent`, replay projector, replay
cursor, live-join token, or PostgreSQL conversation outbox.

On reconnect or refresh, Web loads the durable Session projection containing:

- root and child Task tree;
- current/terminal Attempt state;
- pending approvals;
- relevant Operation state;
- concise result summaries; and
- resource/operation references.

It then subscribes only to future live events. Past chat bubbles are not
reconstructed. A final durable summary remains visible even though the live
transcript is gone. Browser disconnect closes only the stream and never
cancels the CLI process.

### 11.3 Follow-up behavior

- A first user prompt creates the Session and its root Task. Operator is the
  default; an explicitly Agent-scoped surface may select another registered
  Agent, whose current published AgentVersion is resolved and stored by the
  server.
- A follow-up on the same objective creates a successor Attempt on that Task.
- A completed or failed Task is explicitly reopened by follow-up/retry.
- A cancelled Task is never reopened by an ordinary message, background policy,
  or parent Agent. Web exposes an explicit current-user Reopen action; only
  that authenticated application command may transition it back to `open`.
- Unrelated work starts a new Session.
- If reasoning was interrupted after durable mutation/approval progress, UI
  presents Continue; Continue starts a successor Attempt from current Task,
  Invocation, Approval, Operation, and resource state.

No provider-native session is restored for any of these flows.

Web and the authenticated Agent OS application surface expose `cancel_task` as
a user command, not as an MCP child-control tool. The command takes the Task
and Session fences, changes an `open` Task to `cancelled`, interrupts its live
Attempt, prevents pending Approvals from being decided, and rejects new
Invocations or Attempts. Pending Approval rows expire with structured reason
`task_cancelled`; their Invocations fail with the same reason. Already
approved, `ready`, or `executing` mutations and existing Operations keep their
durable lifecycle. Cancellation does not implicitly cancel child Tasks or
Operations; the current user may cancel those exact Tasks or Operations through
their own application contracts. The parent MCP surface remains exactly
`status`, `wait`, `result`, `message`, and live `interrupt`.

## 12. Failure, Interrupt, And Recovery Semantics

- Browser disconnect: live stream ends; Attempt continues.
- Explicit `interrupt_task`: only the live CLI/MCP process is stopped and its
  Attempt becomes `cancelled`; committed mutations and Operations continue.
- API/CLI crash or restart: active Attempt becomes `process_interrupted`.
- Attempt interruption or API restart terminalizes its nonterminal inline read
  Invocations as `failed/process_interrupted`; reads are reissued only by a new
  successor Attempt, while durable mutation dispatch keeps its own lease/retry
  lifecycle.
- Approval timeout while CLI is alive: CLI exits without invalidating the
  durable Approval/Invocation.
- Approved mutation: worker continues with the same input and idempotency key
  after CLI/API interruption.
- Additional interactive reasoning: user explicitly starts Continue.
- Initial background reasoning: an authenticated Agent OS application
  entrypoint creates the `background` Task and its first Attempt. A capability,
  Operation handler, deterministic workflow, and model output cannot create or
  change that responsibility.
- Additional background reasoning: an Operation only exposes its terminal
  state. The projection derives `needs_continue` when an `open` background Task
  has no live Attempt, its predecessor result names a non-empty canonical
  `continuationSources` set, every named Operation is terminal, and that exact
  terminal source set has no claimed `continuationKey`. The singleton Agent OS
  continuation coordinator computes the key, reserves a global slot, and uses
  the common admission transaction to lock Session then Task and revalidate
  `Session.active`, the initiating user's current active membership, exact
  Task-pinned executable AgentVersion and capability scope, runtime readiness,
  source fingerprints, unclaimed key, and one-live-Attempt invariant before it
  creates one immutable successor. It never silently switches AgentVersion.
  Authorization or uniqueness failure releases the slot and creates no
  Attempt; authorization failure exposes an explicit user-action requirement.
  Capacity exhaustion leaves no Attempt and is retried by the coordinator from
  the same derived condition. User Continue for that Operation result uses the
  identical admission path and key, so the unique constraint closes the race.
  No continuation queue or wait status is stored. The Operation handler never
  calls an Agent start port, and a deterministic business workflow never
  independently creates Agent reasoning.
- Operation cancellation: uses the owner domain's separate
  `cancel_operation` contract; Agent interrupt never implies it.
- Child Task failure: parent remains authoritative and does not automatically
  fail.

Stable public errors include at least authentication/context denial,
`agent_capacity_exhausted`, `attempt_already_running`,
`delegation_idempotency_conflict`, `process_interrupted`, `stale_resource`,
`stale_capability_version`, approval rejection/expiry, capability not
authorized, capability unavailable, `task_cancelled`, and owner execution
failure. Cross-user and cross-organization denials remain non-enumerating.

## 13. Coordinated Hard Deletion

Deletion is explicit only. There is no age-based retention, legal hold,
tombstone, audit projection, artifact cleanup graph, or organization-removal
scheduler.

An authorized deletion:

1. atomically changes the Session from `active` to `deleting`;
2. rejects new Attempts, approvals, delegations, and Invocations;
3. interrupts live CLI/MCP reasoning;
4. prevents every still-pending, unapproved mutation from becoming ready;
5. allows mutation work already approved, ready, or executing at the deletion
   cutoff to reach a terminal result with its existing idempotency key;
6. does not cancel or delete existing Operations or resulting business rows;
7. hard-deletes Session-owned Task, Attempt, Invocation, Approval, result, and
   reference data after the safe cutoff work is terminal; and
8. leaves no soft-deleted Session record or retained Agent OS tombstone.

Every Attempt admission on an existing Session, including follow-up,
delegation, and background/user continuation, locks Session then Task and
revalidates `Session.active` in the same lifecycle fence used by deletion. New
Session/root/first-Attempt creation is one atomic transaction. Invocation
admission, no-HITL creation as `ready`, Approval decision, and every transition
into `ready` also take the Session-row fence. The deletion transaction records
its cutoff only after acquiring that fence. Consequently no post-cutoff Attempt
or child Task can be created, and every Invocation is unambiguously either
pre-cutoff `ready`/`executing` work allowed to finish or post-cutoff work
rejected before admission; `approved + approval_pending` and a stranded
no-HITL `authorized` mutation are impossible states.

Use the existing deterministic Operations engine for crash-recoverable deletion
coordination. Do not add a deletion job table or binding aggregate. The
Operation references an exact Session/deletion generation as input; it is not
owned by the Session and may terminalize after the Session graph is gone. A
failed deletion Operation leaves the Session non-writable in `deleting`; an
explicit retry creates an idempotent successor Operation.

## 14. Removed Gateway, Secret, And Analytics Surface

Delete the standalone gateway workspace, its Node HTTP bridge, Nest control
client, active map, health proxy, request reparsing, AsyncLocalStorage glue,
Docker/deployment assumptions, Web gateway URL, and private endpoints.

Replace the controller-free full-Nest MCP child and serialized
`KIDITEM_MCP_EXECUTION_CONTEXT` with the Attempt-bound stdio proxy. Identity and
authority exist only in the API broker binding and are never accepted from the
proxy environment or JSON-RPC payload.

Remove all internal-process credentials introduced for that boundary,
including:

- gateway shared secret;
- principal HMAC;
- run-intent HMAC;
- replay-cursor HMAC;
- interaction analytics HMAC; and
- any Agent API HMAC capability-grant token replaced by exact in-process
  authorization and Invocation records.

Remove the unused interaction product-analytics emitter/adapter. Retain only
content-free operational telemetry such as status, duration, retry count,
release/SHA, CLI version, capacity, error code, and optional provider-reported
token counts. Do not log prompts, canonical mutation inputs, outputs,
credentials, or model transcripts.

## 15. Deployment And Compatibility

### 15.1 Office topology

Office deploys the existing Web, API, and worker images only. API owns the
CopilotKit route and live CLI executor. Worker owns deterministic mutation and
Operation processing. Nginx routes the existing `/api` boundary to Nest. No
gateway image, service, upstream, port, health endpoint, or URL is added.

The persistent service-account CLI auth home and one-off CLI login procedure
remain. Remove Agent gateway/provider credential setup and the generic Agent
worker enable flag from Compose, workflows, environment docs, smoke tests, and
configuration validation.

GitHub Actions remains the only supported release entrypoint. Images are built
and deployed by immutable digest under the repository's release contracts.

### 15.2 CopilotKit compatibility

Keep CopilotKit OSS with an exact npm package train pin. Do not auto-upgrade and
do not maintain a production fork. An upstream fork may remain reference-only.
A scheduled compatibility canary tests the pinned package and opens an explicit
upgrade PR only after review; it never mutates production dependencies by
itself.

The canary covers runtime handler construction, authenticated same-origin
request handling, live AG-UI streaming, approval delivery, disconnect behavior,
and the absence of a replay dependency.

### 15.3 CLI compatibility

The CI and scheduled compatibility matrix verifies both supported pinned CLIs'
binary, version, non-persistent flags, strict MCP configuration, isolated
workspace, login state, live-input channel, bounded execution, native
subagents, and process cleanup in a dedicated canary environment. Production
deployment readiness checks the `requiredRuntimeSet` formed from current
published AgentVersions plus all retained Task-pinned AgentVersions. A release
fails closed if any required runtime no longer supports every property; a
runtime outside that set does not block that deployment.

## 16. Destructive Schema Cutover And Recovery

Legacy Agent OS rows are discarded even if found. Do not write a backfill,
conversion, export, or compatibility reader for AgentRun, conversation,
artifact, execution, authority, policy, replay, usage, or provider-session
data.

Before a destructive schema contraction against any shared or Office-like
database:

1. enter a controlled maintenance window and quiesce writers;
2. create a full PostgreSQL custom-format backup;
3. verify the archive with `pg_restore --list`;
4. record a SHA-256 digest and exact database/release coordinates;
5. prove restore into an isolated production-like database;
6. apply the final schema contraction with the repository's approved
   `db:push`/release path; and
7. reopen writers only after schema, boot, smoke, and data-integrity gates pass.

If the contraction, application boot, or verification fails, keep writers
stopped, restore the complete database from the verified archive, verify the
restored application baseline, and only then reopen traffic. Partial table
restore is not the rollback contract.

The archive and isolated restore may contain the legacy session, artifact,
credential-reference, or provider-history data being removed. They therefore
use encrypted-at-rest, least-privilege backup storage; never appear in command
output, CI artifacts, or general logs; and are retained only for the rollback
window. The maximum rollback window is seven days and ends earlier when the
release is accepted. The archive and restored test database are then destroyed,
and the acceptance record retains only digest, timestamps, release/database
coordinates, restore result, and destruction evidence.

KID-25 must supply the automation, runbook, and local/production-like recovery
evidence. The real Office rollout, observed backup/restore duration, and
measured RPO/RTO are recorded in the separate release-operations issue after
merge.

## 17. Implementation Order

The implementation plan must preserve a working replacement boundary before
deletion and use durable tests as contracts:

1. Add failing target-state tests, final code registries,
   routing/approval/idempotency validators, and scanners that name every legacy
   path to be removed.
2. Add the minimal replacement Prisma models and shared contracts alongside the
   still-compiling legacy schema. Do not backfill, dual-write, route production
   traffic to both graphs, or call this temporary source coexistence a
   compatibility contract.
3. Implement Session/Task/Attempt/Invocation/Approval services, task
   projection, mutation dispatcher, coordinated deletion, and the exact
   Attempt-bound MCP broker against only the replacement graph.
4. Move owner-domain capabilities behind correct input ports, publish the six
   Agent definitions/versions, and implement Codex/Claude ephemeral executors,
   native subagent compatibility, capacity, timeout, sandbox, readiness, and
   canaries.
5. Move CopilotKit into the Nest incoming adapter, update Web to durable
   projection plus future live events only, and cut every caller/test to the
   replacement ports. No live request writes both graphs.
6. Prove the backup/restore path, then in one contraction task delete gateway,
   Hermes/OpenAI runtime paths, generic AgentRun, old official services and
   shared contracts, and their execution/replay/artifact/authority/policy/cost
   schema. Regenerate Prisma only after no retained source imports a deleted
   model, and require the source-absence scanners to pass in the same change.
7. Remove obsolete HMACs, analytics, config, deployment paths, and fallback
   tests; update architecture, environment, deployment, deletion, recovery,
   and operator documentation; then run all final gates.

Implementation uses substantial, integrated Terra subagent work units rather
than file-sized microtasks. A Sol model performs one integrated review over the
complete change at planned milestones and at final completion. Concrete Sol
P1/P2 findings are fixed and re-reviewed before completion.

## 18. Verification And Acceptance

### 18.1 Static and registry gates

- Domain, Agent, AgentVersion snapshot, and capability registries validate at
  boot and in CI.
- Mutation effects require idempotency; cross-domain mutations require an
  explicitly selected target Agent and delegation.
- Query capabilities cannot carry medium/high approval risk.
- No production source references removed AgentRun, Execution, authority,
  policy, conversation/replay, artifact, gateway, Hermes/OpenAI runtime,
  provider credential, HMAC, cost, visibility, kind, or fixed-playbook paths.
- The existing Agent OS architecture scanner reports zero findings; current
  findings cannot be waived as known false positives.

### 18.2 State and persistence gates

- One Session has exactly one root Task and a valid child tree.
- Follow-up/retry creates a new Attempt and never mutates a terminal Attempt or
  resumes a provider session.
- Task/Attempt states never duplicate derived wait state.
- Exact delegation idempotency returns one child Task.
- Authorization and Invocation creation are atomic without a grant row.
- Reads retain only input hashes; mutations retain exact canonical inputs.
- Approval is exact, immutable, expires within 24 hours, and fails stale input.
- The mutation routing/HITL matrix is tested for both own-domain and delegated
  calls: `none`/`low` enters `ready`, `medium`/`high` enters
  `approval_pending`, and no medium/high owner port executes before the exact
  Approval transitions its Invocation to `ready`.
- Approval decision and Invocation readiness share one transaction and the
  Session deletion fence.
- Mutation dispatch rejects a changed authorizing SHA/capability contract as
  `stale_capability_version`.
- Worker retry uses one owner idempotency key and cannot duplicate a committed
  mutation or Operation enqueue.
- Reconciliation fails abandoned inline reads without retry or canonical-input
  reconstruction and leaves durable mutation work to the worker lease path.
- One Task has at most one live Attempt; delegation key reuse compares the
  complete canonical payload hash and capacity failure creates no child.
- Background continuation uses one deterministic continuation key, revalidates
  membership and the exact Task-pinned AgentVersion, uses the same key for user
  Continue and coordinator admission, suppresses an already-claimed source
  set, and creates no Attempt on authorization or capacity failure.
- User Task cancellation expires pending approvals, blocks new work, preserves
  already-admitted durable work, and only an explicit current-user command can
  reopen it.
- Session deletion blocks late work and removes only Agent OS-owned records.
- A concurrent Session-deletion versus root follow-up, child delegation, and
  background/user-continuation admission matrix proves no post-cutoff Task or
  Attempt commit and no leaked capacity slot; new Session/root/first-Attempt
  creation is separately proven atomic.

### 18.3 Runtime and failure gates

- Codex and Claude run with required non-persistent flags and a clean temporary
  workspace while preserving only login state.
- Live message/interrupt uses only a process-memory control handle for the same
  Attempt; terminalization or restart destroys it, and the canary finds no
  provider session/history artifact.
- The repository, DB URL, provider credential values, and ambient business
  secrets are absent from the child environment.
- The MCP stdio proxy reaches owner capabilities only through its
  Attempt-bound local IPC broker and has no Nest/DB authority of its own.
- Tool and native-subagent attempts to read the auth home/broker/server paths
  or use arbitrary egress fail in readiness canaries.
- Deployment runtime inventory includes a provider referenced only by an old
  completed or cancelled retained Task and may omit a provider only after no
  current AgentVersion or retained Task references it.
- Native subagents work inside one Attempt without durable child rows.
- KidItem delegation creates an explicit child Task and exposes all five child
  control operations.
- Four live Attempts run; the fifth is rejected before Attempt creation with
  Retry-After.
- Browser disconnect does not cancel the CLI.
- API/CLI restart yields `process_interrupted`; approval/mutation work
  continues and Continue creates a successor Attempt.
- A terminal Operation can trigger exactly one authorized background successor
  through the Agent OS coordinator, never from the Operation handler.
- Attempt, HITL-wait, Approval, and Operation time boundaries match this
  document.

### 18.4 HTTP, Web, and composition gates

- Same-origin `/api/copilotkit` is served by the authenticated Nest API root.
- Exactly one API replica holds the Agent executor advisory lock; a second
  executor fails readiness.
- Worker and MCP roots cannot resolve/import the HTTP adapter.
- Refresh renders durable Task state and result references without replaying
  chat events.
- Approval, Continue, delegation tree, capacity, failure, and deletion UX use
  the derived projection.
- Web exposes authenticated Task Cancel/Reopen commands; an ordinary message or
  parent Agent cannot reopen a cancelled Task.
- `apps/interaction-gateway` and its service/deployment/configuration surface
  are absent.
- Office process audit shows Web/API/worker only.

### 18.5 Release and recovery gates

- Required backend, Web, shared, Prisma, scanner, and production-image builds
  pass from one SHA.
- CopilotKit and the CI compatibility matrix for both exact pinned CLIs pass;
  deployment acceptance additionally proves the full `requiredRuntimeSet` from
  current published AgentVersions and retained Task pins, without requiring a
  provider outside that set to be present.
- Custom-format backup, list verification, SHA-256, isolated restore,
  destructive contraction, and full rollback rehearsal produce an acceptance
  record without exposing archive contents.
- Encrypted rollback archives and isolated restores are destroyed within the
  seven-day maximum window and leave destruction evidence.
- `docs/ARCHITECTURE.md`, testing guidance, environment variables, deployment
  architecture, deletion/recovery runbooks, and PR release/data decisions
  describe only the final topology.

KID-25 is complete only when all retained behavior passes through the minimal
graph in this document, all superseded production paths and schema are absent,
the destructive recovery proof is recorded, and no required work remains in a
superseded plan.

## 19. Locked Decision Ledger

The implementation plan must treat these as fixed constraints:

- CopilotKit stays; Interaction Gateway does not.
- Codex CLI and Claude CLI stay; Hermes and OpenAI Responses do not.
- Service-account login persists; provider history and KidItem credentials do
  not.
- Native provider subagents are ephemeral; responsibility transfer creates a
  durable child Task.
- Domains and Agents are many-to-many; delegation names a target Agent.
- AgentVersion snapshots domain-derived capability keys, not models or
  per-tool policies.
- AI-backed behavior belongs to owner capabilities, not wrapper Agents.
- Capability metadata stays detailed, while routing is read versus mutation.
- `kind`, `visibility`, fixed playbooks, duplicate approval fields, and
  handler policy declarations are removed.
- No RBAC, organization authority profile, quota, depth, fan-out, or cycle
  policy is added.
- Invocation contains its exact authorization; no grant or mutation-outbox
  table exists.
- Task owns business lifecycle; Attempt owns CLI process lifecycle; waits are
  derived.
- Task continuation mode is immutable and server-authorized; only Agent OS may
  admit initial or successor background reasoning.
- Session has one root Task; follow-up creates a successor Attempt.
- Work records persist; transcript, replay, artifacts, cost, and provider
  sessions do not.
- Mutations are durable and idempotent; reasoning processes are disposable.
- Reasoning runs in API; deterministic mutation/Operation work runs in the
  existing worker.
- The MCP child is an Attempt-bound local IPC proxy; it never receives Nest,
  DB, credential, or reusable grant authority.
- Live CLI control is process-memory-only and never becomes provider resume or
  durable session state.
- Approved mutation semantics are fenced to the authorizing capability
  fingerprint and Git SHA.
- Capacity is global and immediate-reject, with no Agent queue.
- KID-25 runs exactly one Agent-executor API replica and one live Attempt per
  Task.
- Operations expose state but never create an Agent Attempt; Agent OS owns
  every initial and successor reasoning decision.
- Task cancellation is a current-user application command, not parent Agent
  authority or another stored wait state.
- Session deletion is explicit coordinated hard deletion with no retention.
- Legacy Agent OS data is discarded only after verified full-database backup
  and restore proof.
- KID-25 ends at merge-ready code and release automation; actual Office rollout
  and measured RPO/RTO are separate operations work.
