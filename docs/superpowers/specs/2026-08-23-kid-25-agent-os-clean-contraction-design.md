# KID-25 Single-Node Agent OS Clean Contraction Design

- Date: 2026-08-23
- Status: Approved for implementation
- Tracking issue: KID-25
- Implementation plan: `docs/superpowers/plans/2026-08-23-kid-25-agent-os-clean-contraction.md`
- Operating target: one user on one home-server API instance
- Source baseline: `82a58a1768f29e3517a62903c0203a81e47037ab`
- Classification: Agent OS platform reconstruction across server, Web,
  worker, schema, deployment, and durable documentation
- Data decision: discard every legacy Agent OS row even when discovered; no
  backfill, conversion, compatibility reader, or dual-write
- Release decision: KID-25 proves runtime/admission correctness, one clean
  schema cutover, and basic same-version restart recovery. Multi-instance
  coordination, automatic release drain, compatibility automation, isolated
  restore rehearsal, and measured RPO/RTO are not required.

## 0. Decision Authority

This document is the single design authority for KID-25. It replaces the
broader design previously committed at this same path and fixes the reduced
single-node scope approved on 2026-08-23.

Implementation may select private helper names and local indexes that do not
change the contracts below. It must stop for a design amendment before adding
a durable aggregate, lifecycle state, provider-history dependency, deployable
service, automatic background reasoning path, or multi-instance coordination
mechanism not authorized here.

The following earlier documents are not implementation authority for KID-25:

- `specs/2026-08-13-ai-chat-interactive-response-design.md`;
- `specs/2026-08-21-agent-session-deletion-design.md`;
- `specs/2026-08-23-copilotkit-nest-incoming-adapter-design.md`;
- every earlier `2026-08-13` or `2026-08-23` Interaction OS/Agent session
  implementation plan already marked superseded;
- the broader pre-reduction version of this design; and
- generic AgentRun, provider-session, replay, artifact, cost, policy,
  authority-profile, or gateway contracts found in code or documentation.

The Sourcing capability and deterministic Operations designs remain reference
material only for their owner-domain business behavior. Their AgentRun,
conversation, artifact, cost, HMAC, or provider-runtime assumptions do not
survive this design.

## 1. Selected Approach

### 1.1 Selected: single-node minimum

KidItem runs one authenticated Agent OS inside the existing Nest API. Codex CLI
and Claude CLI are disposable reasoning processes. PostgreSQL stores only work,
exact mutation authorization, approval, and concise references. The existing
worker dispatches durable mutations and deterministic Operations.

```text
Browser
  -> same-origin Nest /api/copilotkit
       -> AgentSession / root AgentTask
       -> immutable AgentAttempt (Codex or Claude CLI)
            -> ephemeral provider-native subagents
            -> Attempt-bound local MCP broker
            -> owner-domain capability input ports
            -> optional explicit child AgentTask delegation

Worker
  -> ready AgentCapabilityInvocation mutations
  -> deterministic Operations
```

### 1.2 Rejected: single node plus enterprise operations guards

PostgreSQL executor locks, automated mutation release drain, compatibility
images, scheduled upgrade PRs, and isolated restore rehearsals provide value
for a multi-user or continuously deployed service. They are disproportionate
for one user operating one home-server instance and are excluded.

### 1.3 Rejected: retain the broad Interaction OS

Conversation replay, provider sessions, background continuation, coordinated
deletion workflows, reusable grants, artifacts, cost ledgers, and generic
AgentRun paths add state without advancing the required single-user workflow.

## 2. Required Outcomes and Non-Goals

### 2.1 Required outcomes

- Correct root, follow-up, delegation, capability, Approval, and mutation
  admission under concurrent requests.
- One live CLI Attempt per Task and an immediate process-local global limit.
- Ephemeral Codex/Claude execution using the service account's existing login.
- Exact owner-domain capability authorization, mutation idempotency, and HITL.
- Basic same-version API/worker restart recovery without provider resume.
- Same-origin CopilotKit live streaming and a durable work projection without
  chat replay.
- A final six-model Agent OS schema with all legacy code/schema removed.
- A destructive cutover that discards legacy Agent OS data while checking that
  unrelated business and Operation data remain.
- One Web/API/worker home-server deployment topology.

### 2.2 Non-goals

- More than one Agent-executor API instance.
- PostgreSQL advisory executor locks or distributed admission/signaling.
- Automatic background Tasks or Operation-triggered successor Attempts.
- Stored `continuationMode`, `continuationKey`, queue, capacity-wait, or retry
  eligibility state.
- Automatic mutation drain across application-version upgrades.
- Scheduled CopilotKit/CLI compatibility pipelines or automatic upgrade PRs.
- Isolated full-database restore rehearsal, formal disaster-recovery evidence,
  measured RPO/RTO, or a seven-day rollback archive process.
- Organization quotas, Agent depth/fan-out/cycle rules, RBAC, role-separated
  approvals, or multi-user ownership transfer.
- Provider sessions/history/resume IDs, KidItem-managed provider credentials,
  chat transcript/replay, artifacts, cost accounting, or vector memory.
- Hermes, OpenAI Responses, a standalone gateway, another Agent service, a
  message broker, or a network MCP listener.

## 3. Final Durable Data Model

### 3.1 Target graph

The final Agent OS persistence graph contains exactly six models:

```text
AgentVersion
  <- AgentTask

AgentSession
  -> exactly one root AgentTask
       -> zero or more child AgentTask rows
       -> immutable AgentAttempt rows
            -> AgentCapabilityInvocation rows
                 -> optional AgentCapabilityApproval
```

`resource_ref` and `operation_ref` values are references in Task input and
Attempt/Invocation results. Agent OS does not own the referenced business row
or `OperationRun`.

### 3.2 AgentVersion

`AgentVersion` is immutable and stores:

- code-owned Agent key and definition version;
- assigned domain keys;
- capability keys resolved from those domains at publication;
- reasoning runtime `codex_cli | claude_cli`;
- immutable instruction-profile reference;
- deterministic manifest hash; and
- activation, retirement, and creation timestamps.

It does not store a reasoning model, capability implementation version,
per-tool policy, authority profile, provider credential, or runtime history.
Runtime and owner-capability models come from explicit code/deployment profiles;
missing model selection is an error.

### 3.3 AgentSession

`AgentSession` is only the user-visible work grouping and hard-delete boundary.
It stores ID, organization ID, creating user ID, and timestamps.

It has no lifecycle column. In particular, it has no `deleting` state,
deletion cutoff/generation, retention, legal hold, title/thread replay state,
provider session, cost, or credential reference.

### 3.4 AgentTask

Task owns durable business responsibility and stores:

- Session and optional parent Task;
- selected immutable AgentVersion;
- objective, completion criteria, and input resource references;
- optional `delegatedFromAttemptId`;
- optional delegation idempotency key and canonical request hash;
- status and timestamps.

Its only lifecycle values are:

```text
open | completed | failed | cancelled
```

Task has no Approval-wait, Operation-wait, child-wait, capacity, Continue, or
background state. It has no `continuationMode`. Every Task is interactive. A
user Continue/follow-up creates a successor Attempt on the same Task.

Task status changes only from an explicit validated business outcome or current
user command. Process interruption alone leaves Task `open`. Cancelling a Task
interrupts live reasoning and blocks new Attempts/Invocations, expires pending
Approvals, and preserves already-ready/executing mutations and Operations. A
cancelled Task reopens only through an explicit current-user Reopen command.

### 3.5 AgentAttempt

Attempt represents exactly one Codex or Claude CLI process. It stores:

- Task, AgentVersion, ordinal, and optional predecessor Attempt;
- immutable objective/input/resource references;
- runtime/profile, application `VERSION`, Git SHA, CLI version, and reported
  model when available;
- status, timestamps, concise result envelope, structured error, and optional
  content-free token counts.

Its only lifecycle values are:

```text
starting | running | succeeded | failed | process_interrupted | cancelled
```

Attempt has no waiting, capacity, Approval, Operation, child, or Continue state
and no `continuationKey`. A terminal Attempt is never mutated or resumed.

Every terminal Agent result uses one concise envelope containing outcome,
summary, `resource_ref` values, `operation_ref` values, optional structured
`needs_input` or error data, and optional Agent-specific output validated by
that Agent's schema. It contains no `continuationSources`, transcript,
chain-of-thought, native-subagent history, or artifact payload.

### 3.6 AgentCapabilityInvocation

Invocation is both the exact capability-authorization audit and, for a
mutation, the durable worker work item. It stores:

- Session, Task, Attempt, AgentVersion, initiating user, capability, and owner
  domain;
- `authorizationKind` of `agent_default_scope`,
  `cross_domain_read_grant`, or `explicit_execution_grant`;
- authorization expiry, exact input hash, and canonical mutation input only;
- snapshotted effects, approval risk, and idempotency requirement;
- required owner idempotency key for every mutation;
- application version, authorizing Git SHA, capability-contract fingerprint,
  runtime, and reported model when available;
- lifecycle, bounded mutation lease/retry data, concise result references,
  structured error, and timestamps.

Its exact lifecycle values are:

```text
authorized | approval_pending | ready | executing | succeeded | failed
```

Reads use `authorized -> executing -> succeeded|failed`, store only the input
hash, execute inline, and are never retried after process loss. Mutations store
canonical input and use `ready` as the initial no-HITL state. The Invocation
row is the only dispatch source; there is no mutation outbox or grant table.

### 3.7 AgentCapabilityApproval

Approval binds one exact mutation Invocation and input hash. Its only values
are:

```text
pending | approved | rejected | expired
```

The decision is immutable and non-reusable. Medium/high mutations create a
pending Approval before emitting UI/CLI notification. A decision and the
Invocation transition occur in one transaction. Approval expires within 24
hours; Task cancellation may expire it earlier. The worker performs a bounded
due-Approval sweep without adding a queue/outbox model.

### 3.8 Database invariants

Use string-backed statuses plus Zod/domain validation, not native PostgreSQL
enums. Required constraints are:

- one root Task per Session where `parent_task_id IS NULL`;
- organization-fenced relations throughout;
- unique `(parentTaskId, delegationIdempotencyKey)` for delegated Tasks;
- one live `starting|running` Attempt per Task;
- unique `(taskId, ordinal)`;
- one Approval per Invocation;
- mutation owner-idempotency uniqueness at its actual owner boundary; and
- indexes for ready work and expired mutation leases.

There is no Task continuation key, Session lifecycle, deletion operation
binding, separate delegation row, grant, replay event, artifact, usage, cost,
provider session, or generic AgentRun model.

## 4. Code-Owned Agents, Domains, and Capabilities

### 4.1 Domain catalog

The code-owned catalog is:

```text
advertising  agent_os  ai  analytics  automation  channels
finance      inventory orders operations products  rules
sourcing     supply
```

A domain may be assigned to multiple Agents. Assignment is default scope, not
exclusive ownership. `finance`, `analytics`, and `rules` are initially
unassigned but their capabilities remain discoverable.

### 4.2 Persistent Agent definitions

Keep exactly these code-owned Agents:

| Agent | Assigned domains |
|---|---|
| Operator | `agent_os`, `automation`, `operations` |
| Sourcing | `sourcing` |
| Merchandising | `products`, `ai` |
| Supply | `supply` |
| Channel Operations | `channels`, `orders`, `inventory` |
| Advertising | `advertising` |

Remove chat/tool-wrapper Agents, fixed playbooks, default tool policy, runtime
kind hierarchies, and domain-to-unique-Agent routing. Delegation always names a
registered target Agent explicitly.

### 4.3 Capability definition and ownership

The only supported layering is:

```text
Agent
  -> CapabilityDefinition
    -> owner input port
      -> owner implementation
           -> optional AI call
           -> optional DB/repository work
           -> optional external API/browser
           -> optional Operation enqueue
```

`CapabilityDefinition` is code-owned and contains stable owner-prefixed key,
owner domain, description, real Zod input/output schemas, detailed effects,
`approvalRisk: none|low|medium|high`, idempotency requirement, and owner input
port identity. Remove `kind`, `visibility`, old manifest `approval`, monetary
`cost` effect, and duplicate handler policy metadata. Do not add a new
requirements taxonomy.

Only these effects classify a mutation:

```typescript
const MUTATION_EFFECTS = new Set([
  'db_write',
  'external_write',
  'job_enqueue',
]);
```

Every mutation requires idempotency. Query capabilities use `none|low`
approval risk. AI behavior belongs to the owner capability and receives an
explicit model; it does not create a wrapper Agent.

Correct the known owner-prefix violations as follows:

- `market.collect_shadow_signals` -> `sourcing.collect_shadow_signals`;
- `product_listing.create_generation_package` ->
  `products.create_listing_generation_package`;
- `product_listing.submit_wing_thumbnail` ->
  `channels.submit_wing_thumbnail`.

The current final Agent-facing catalog contains eighteen capabilities. Sourcing
publishes all ten independently useful work intents:

```text
sourcing.duplicateCheck
sourcing.scrapeProductUrl
sourcing.ingestCandidate
sourcing.scrapeUrlWorkflow
sourcing.retrieveWorkspaceEvidence
sourcing.inspectRecommendationRun
sourcing.refreshCollection
sourcing.refreshValidation
sourcing.createReviewBatch
sourcing.collect_shadow_signals
```

`duplicateCheck` is a DB read; `scrapeProductUrl` returns bounded normalized
supplier evidence without writing a candidate; and `ingestCandidate` accepts
only the exact same-Attempt scrape result/hash admitted by the server.
`scrapeUrlWorkflow` is the convenience path over the existing
`sourcing.scrape_url` Operation. `retrieveWorkspaceEvidence` returns bounded
document text and provenance rather than citation IDs alone. Daily trend
collection and market-shadow collection remain distinct Operations and distinct
Agent capabilities.

Every Sourcing mutation carries the exact owner idempotency key through its
incoming port to the final database or Operation owner. Same key and canonical
input replay the same result; a changed input conflicts, and a missing key is
rejected before owner execution. Bounded synchronous validation remains a DB
mutation and is not converted to an Operation without evidence that it is
long-running.

The scanner and boot validation require `key.startsWith(ownerDomain + '.')`,
one definition, and one implementation per key.

## 5. Routing, Delegation, and Admission

### 5.1 Routing rule

Routing remains two-step:

1. Cross-domain read: current Agent invokes directly through an exact
   `cross_domain_read_grant` bound to this Attempt and input hash.
2. Cross-domain mutation: caller explicitly selects a registered target Agent,
   creating a child Task and `explicit_execution_grant` for the exact call.

Own-domain reads and mutations use default scope. Approval is evaluated after
routing, so delegation never bypasses HITL. An unassigned-domain read still
uses an exact read grant. An unassigned-domain mutation requires an explicit
target Agent and execution grant; no hidden owner Agent is inferred.

### 5.2 Native subagents versus KidItem delegation

Codex/Claude native subagents are ephemeral helpers inside one Attempt. They
share its AgentVersion, workspace, MCP broker, authority, sandbox, process
group, and one global slot. They create no KidItem row.

A KidItem child Task is created only when business responsibility moves to an
explicitly selected Agent. It stores the parent Task, delegating live Attempt,
target AgentVersion, objective, completion criteria, resource references,
idempotency key, and canonical request hash.

Repeating a delegation key with the same hash returns the existing child;
another payload returns `delegation_idempotency_conflict`. Same-type Agents may
recur. There is no depth, fan-out, quota, or cycle policy.

The parent may call child `status`, `wait`, `result`, `message`, and live
`interrupt`. A completed child follow-up reopens that same Task and creates a
successor Attempt. Parent failure/cancellation never automatically changes the
child business lifecycle, and child failure never automatically fails parent.

### 5.3 Single-process admission

One API process owns a nonblocking process-local semaphore with default limit
`AGENT_CLI_MAX_CONCURRENCY=4`. There is no database admission lock, distributed
signal, queue, or capacity-wait state. The home deployment runs exactly one API
replica by configuration.

Admission rules are:

- reserve capacity before creating an Attempt;
- on exhaustion return `agent_capacity_exhausted` with Retry-After and create
  no row;
- new Session/root Task/first Attempt are one transaction;
- follow-up/retry/Continue locks Session then Task, validates current user and
  organization, Task status, pinned AgentVersion/runtime, terminal predecessor,
  and no live Attempt, then inserts a successor;
- delegation fast-path returns an existing same-key/same-hash child without a
  slot; otherwise reserve capacity, lock Session then the live parent Task,
  verify the exact delegating Attempt, and atomically create child plus first
  Attempt;
- every failed transaction or uniqueness race releases its provisional slot;
  and
- a message arriving while an Attempt is live uses the in-memory live-control
  channel and never creates another Attempt.

The single-instance deployment assumption is explicit. Starting a second API
executor is unsupported rather than approximated with a new distributed
contract.

## 6. Authorization, HITL, and Mutation Dispatch

Every call revalidates current authenticated user, active organization
membership, exact Session/Task/Attempt, Task-pinned AgentVersion scope,
CapabilityDefinition, owner input port, and exact canonical input hash.

The product is single-user. Do not add invoke/approve roles, self-approval
policy, organization authority profiles, policy snapshots, or grant tokens.

The HITL rule is:

```typescript
const requiresHumanApproval =
  isMutation(capability) &&
  (capability.approvalRisk === 'medium' ||
    capability.approvalRisk === 'high');
```

It applies to own-domain and delegated mutations. A live CLI may wait up to 10
minutes within its 30-minute Attempt timeout. If it exits first, the durable
Approval/Invocation remains. Additional reasoning is always a user-triggered
successor Attempt.

The worker claims `ready` mutations with a bounded lease and retries an expired
lease with the same owner idempotency key. It revalidates current membership,
Task/Session existence, capability contract fingerprint, authorizing Git SHA,
resource version, and owner preconditions immediately before the owner call.
Changed code fails without a business call as `stale_capability_version`;
changed resources fail as `stale_resource`.

A `job_enqueue` capability succeeds after durable Operation creation and
returns `operation_ref` immediately. Operations expose status/wait/cancel but
never start an Agent Attempt.

Automatic release drain is not implemented. For a code upgrade, the operator
waits until no `ready|executing` mutation is shown before stop/start. If this
precondition is ignored, the SHA/fingerprint fence fails changed work safely;
it does not reinterpret it under new code.

## 7. Codex/Claude Runtime and MCP Boundary

### 7.1 Supported runtimes

Only these exact CLI packages are supported:

- Codex CLI `0.149.0`;
- Claude Code `2.1.122`.

Remove Hermes, OpenAI Responses, credential broker, runtime-handle codecs,
fixed playbooks, monetary budget flags, and fallback selection. Runtime and
model selection is explicit; missing selection fails admission/readiness.

Every Attempt forces non-persistent history:

- Codex app-server: an isolated generated configuration plus
  `thread/start.ephemeral=true` and `history.persistence="none"`;
- Claude: `--no-session-persistence`, `--strict-mcp-config`.

Codex does not expose `--ephemeral` or `--ignore-user-config` app-server
flags. The protocol request and isolated `CODEX_HOME` are therefore the
enforced boundary; no service-account `config.toml`, plugin, hook, skill,
memory, or history setting is inherited by an Attempt.

The dedicated OS service account's CLI login home is the only persistent
provider state. KidItem never reads, copies, encrypts, HMAC-signs, stores, or
returns its credential values. Provider resume/session IDs are never requested
or stored.

### 7.2 Attempt process boundary

The Office/home host is Windows, but the supported runtime boundary is the
existing Linux Docker Desktop container for the API. Codex, Claude, the MCP
stdio proxy, and the private Unix socket all run inside that one API container.
There is no native-Windows CLI, named-pipe broker, or host-side process branch.

Each Attempt receives a new empty temporary workspace and private broker
directory. The repository, DB URL, deployment/business secrets, auth files,
and another Attempt's files are not available to model-invoked tools. Built-in
browser/arbitrary network tools are disabled; business facts/actions flow
through scoped MCP capabilities. Native subagents inherit the same boundary.

CLI and MCP children run in one owned non-detached process group. Interrupt,
timeout, shutdown, and restart cleanup target only that group. Attempt maximum
elapsed time is 30 minutes. Workspace/broker directories are removed at
terminalization; the login home remains.

### 7.3 Attempt-bound MCP broker

The MCP child is a small stdio-to-Unix-socket proxy, not a Nest application.
It receives no DB URL, Nest repository, credential, serialized principal, HMAC,
bearer token, or reusable grant.

The API binds the private socket in memory to the live Attempt, AgentVersion,
user, organization, exact scope, and process group. It validates local peer and
process ownership, ignores caller-supplied identity, creates every Invocation
server-side, executes authorized reads inline, and durably admits mutations for
the worker.

The tool surface contains typed default capabilities, capability catalog
search, exact-input invoke, explicit target-Agent delegation, and child Task
controls. Task cancellation/reopen/deletion remain authenticated user
application commands, not MCP child authority.

### 7.4 Live control

The provider adapter may keep one process-memory-only `liveControlHandle` for
the same running Attempt. It may deliver a second message or interrupt, but is
never persisted, logged, serialized, or used to resume a terminal process. API
restart destroys it.

Runtime readiness checks the exact selected CLI binary/version, login state,
required non-persistent flags, strict MCP configuration, one bounded request,
one scoped MCP call, a live second input, and process cleanup. Admission checks
the Task-pinned runtime on every new Attempt. There is no dynamic deployment
inventory gate or scheduled compatibility service.

## 8. Basic Restart Recovery

Basic recovery means restart with the same deployed application version/SHA:

1. API boot marks every prior `starting|running` Attempt
   `process_interrupted`.
2. Its nonterminal inline read Invocations become
   `failed/process_interrupted`; they are not reconstructed or retried.
3. Task remains `open` unless it already has an explicit business terminal
   status.
4. Pending Approvals remain durable until decision, cancellation, or expiry.
5. `ready` mutations remain worker work; an expired `executing` lease is
   retried with the same owner idempotency key.
6. Boot removes only validated stale Attempt workspaces/broker sockets beneath
   the configured runtime root and terminates owned orphan process groups when
   present.
7. Web reloads the durable Task projection and shows **Continue** when more
   reasoning is needed.
8. Continue creates a new immutable Attempt from current durable Task,
   Invocation, Approval, Operation, and resource state. It never restores a
   provider session.

Browser disconnect ends only the live stream and does not cancel the CLI.
Worker restart uses the same lease/idempotency rules. Cross-version rolling
upgrade recovery and automatic background reasoning are outside scope.

## 9. Task Projection, CopilotKit, and Web

The browser calls same-origin `/api/copilotkit`. A focused authenticated Nest
incoming adapter calls Agent OS application ports in process and streams future
AG-UI events. It is composed only in the API root; worker and MCP roots cannot
import it.

There is no durable chat, conversation event, replay cursor, live-join token,
or provider history. On refresh, Web loads:

- root/child Task tree;
- current/latest Attempt states;
- pending Approvals and ready/executing mutations;
- referenced Operation state;
- concise result summary and resource/operation references; and
- derived `running`, `awaiting_approval`, `awaiting_operation`,
  `awaiting_child`, `needs_input`, `needs_continue`, terminal, and error UI.

Projection precedence is pending Approval, active mutation/Operation, open
child, structured `needs_input`, then `needs_continue`. `needs_continue` means
the Task is `open`, has no live Attempt, and the current durable work still
allows a user follow-up. It is never a stored status, source set, or automatic
trigger. Web then subscribes only to future live events. Past chat bubbles are
not rebuilt.

Authenticated application commands cover Approval decision, user Continue,
Task cancel/reopen, live interrupt, and terminal-only Session deletion.

## 10. Terminal-Only Session Hard Delete

There is no Session deletion lifecycle or deletion Operation. A current-user
delete command uses one transaction:

1. lock the organization-fenced Session row;
2. lock/read its Tasks, Attempts, Invocations, and Approvals;
3. reject with `session_busy` if any Attempt or Invocation is nonterminal or any
   Approval is pending;
4. hard-delete the Session-owned graph by cascade when all work is terminal.

The admission transaction also locks Session then Task. Therefore either an
admission commits first and deletion sees busy work, or deletion commits first
and admission sees no Session. No `deleting` state, cutoff, generation,
tombstone, retention, cleanup graph, or binding row is needed.

Operations and business rows are not deleted. Only their references disappear.
A user who wants to delete active work first cancels/interrupts it and waits for
already-admitted mutations to terminalize.

## 11. Clean Schema Cutover

Legacy data is intentionally discarded even when found. Do not write a
backfill, conversion, export, or compatibility reader.

To avoid nullable hardening against populated legacy tables:

1. add compile-time replacement Prisma symbols `AgentWorkVersion`,
   `AgentWorkSession`, and `AgentWorkTask` mapped to new physical tables
   `agent_work_versions`, `agent_work_sessions`, and `agent_work_tasks`;
2. add `AgentAttempt`, `AgentCapabilityInvocation`, and
   `AgentCapabilityApproval` against that physical graph;
3. cut replacement application callers to only those tables without dual
   write;
4. remove every legacy caller/model;
5. rename only the temporary Prisma symbols to final logical
   legacy `AgentVersion`, `AgentSession`, and `AgentSessionTask`, retaining the new
   physical table names; and
6. drop the old physical Agent OS tables with the repository's approved
   `db:push -- --accept-data-loss` path.

Before applying the destructive cutover to the home-server database:

- stop API and worker writers;
- create a PostgreSQL custom-format backup;
- verify `pg_restore --list` succeeds;
- record a SHA-256 checksum and the exact database/VERSION/Git SHA;
- capture content-free counts/identities for unrelated core business and
  Operation rows.

After `db:push`, regenerate Prisma/ERD/shared artifacts, boot API and worker,
seed the six AgentVersions, run the interaction smoke, and compare the unrelated
row checks. If any step fails, keep the service stopped and use the backup for
manual full-database restore. KID-25 does not automate or rehearse that restore
and records no RPO/RTO claim.

No archive contents, credentials, prompts, mutation inputs, or row data enter
CI logs or the repository.

## 12. Removed Production Surface

The final source/schema scanner reports zero production findings for:

- standalone Interaction Gateway/private Nest control plane/gateway URL;
- generic AgentInstance/AgentRun/AgentRunRequest and legacy HTTP/worker paths;
- AgentExecution/context epoch/policy snapshot/authority profile/grant/outbox;
- conversation/message/event/replay/summarizer/live-join state;
- artifact/materialization/provider upload/storage ownership;
- usage/cost ledgers and monetary budgets;
- Hermes/OpenAI Responses/provider credential/session/handle persistence;
- full-Nest MCP child and `KIDITEM_MCP_EXECUTION_CONTEXT`;
- HMAC credentials introduced for internal process boundaries;
- fixed playbooks, tool-wrapper Agents, capability `kind`, `visibility`, old
  approval metadata, or duplicate handler policy;
- background continuation/coordinator/Operation-to-Agent hooks,
  `continuationMode`, or `continuationKey`;
- advisory executor lock, distributed admission, release drain, or capacity
  queue;
- coordinated Session deletion state/Operation/bindings; and
- legacy Agent OS shared exports and old Web Agent console/routes.

The scanner must allow the required process-memory-only `liveControlHandle` and
must distinguish it from forbidden persistence/codec paths.

## 13. Home-Server Deployment

Deploy only existing Web, API, and worker processes. API owns CopilotKit and
live CLI execution; worker owns mutation dispatch and Operations. Nginx keeps
the existing `/api` route. There is no gateway or fourth service.

Compose/configuration declares exactly one API replica. Process-local maximum
concurrency is controlled only by:

```text
AGENT_CLI_MAX_CONCURRENCY=4
```

Attempt 30 minutes, live Approval wait 10 minutes, and Approval lifetime 24
hours remain code constants. Remove generic Agent worker enablement, old
runtime concurrency/wait/budget values, provider credential/HMAC settings, and
gateway URLs.

Codex/Claude packages stay exactly pinned. KID-25 adds focused adapter/runtime
tests and readiness for the runtime selected by a published AgentVersion. It
does not add a scheduled compatibility workflow, compatibility image, automatic
dependency update, advisory singleton lock, or automatic release drain.

Code upgrade is stop/start. The operator first confirms no `ready|executing`
mutation. Crash restart with the same SHA follows Section 8.

## 14. Implementation Order

Use substantial integrated Terra work units, not file-sized microtasks. Use one
integrated Sol review over the complete implementation and fix every concrete
P1/P2 finding before completion.

1. Add final registries, routing/HITL/idempotency validators, replacement
   physical schema/shared contracts, and fail-first legacy scanners.
2. Implement one admission/lifecycle/Invocation/Approval/delegation boundary
   against the replacement graph.
3. Move capability implementations to owner input ports and implement
   ephemeral Codex/Claude Attempt execution plus local MCP broker.
4. Implement worker mutation dispatch, Approval expiry, and same-SHA API/worker
   restart reconciliation.
5. Cut Nest CopilotKit/Web to durable work projection plus future live events,
   switch all callers, then delete the entire legacy code/schema in one clean
   contraction.
6. Align the single-node Compose/config/docs, perform the basic backup/cutover
   check, run all required QA, obtain one Sol review, push the existing branch,
   and update PR/Linear.

## 15. Verification and Acceptance

### 15.1 Registry and capability

- Exactly 14 domains and six Agents validate at boot.
- Domain assignment is many-to-many and never auto-selects delegation target.
- Every capability key is owner-prefixed with one definition/implementation.
- Mutation effects require idempotency; query risk is `none|low`.
- Own/cross-domain read/mutation and HITL matrices pass.

### 15.2 Admission and persistence

- One Session has one root Task and a valid child tree.
- Root/follow-up/Continue/delegation races create exactly one intended Attempt.
- Live-parent delegation works while a same-Task successor is rejected.
- Four Attempts run and the fifth is rejected before row creation.
- Capacity and transaction failures release process-local slots.
- Exact delegation idempotency returns one child or conflict.
- Read Invocation stores hash only; mutation stores canonical input/key.
- Medium/high mutation cannot execute before exact immutable Approval.
- Decision/expiry/cancel races have one terminal winner.
- One Task has at most one live Attempt.
- Terminal-only Session deletion races safely with admission.
- Final Prisma schema has exactly six Agent OS models and no continuation or
  deletion-lifecycle fields.

### 15.3 Runtime and restart

- Codex/Claude command tests prove exact non-persistent flags and pins.
- Children receive no DB/Nest/business/provider credential values.
- Attempt workspace/socket/process group is isolated and cleaned.
- Native subagents remain inside one Attempt/slot/authority.
- Live second message and interrupt use only the in-memory handle.
- Browser disconnect does not stop the Attempt.
- Same-SHA API restart marks live Attempts/read Invocations interrupted, leaves
  Tasks open, preserves Approvals/mutations, and exposes manual Continue.
- Same-SHA worker restart retries expired mutation leases with one idempotency
  key and does not duplicate a committed mutation/Operation.
- No provider session/history is created or resumed.

### 15.4 HTTP/Web and cutover

- Authenticated same-origin `/api/copilotkit` streams live events.
- Refresh renders durable Task/result/Approval/Operation state without replay.
- Continue creates a new Attempt; no automatic successor exists.
- Web exposes current-user cancel/reopen/delete and exact Approval actions.
- Source scanner has zero legacy/background/multi-instance findings.
- Basic custom backup/list/checksum completes before destructive push.
- Destructive push drops only approved legacy Agent OS objects.
- Prisma generation, shared/server/Web builds, Nest boot, worker boot, ERD,
  smoke, and unrelated-row checks pass on the cutover database.
- Windows Office/home process audit shows Web/API/worker and one Linux API
  container replica only; CLI/MCP children stay inside that container.

## 16. Locked Decision Ledger

- One user, one Windows home server, one Linux-container Agent-executor API
  process.
- CopilotKit stays inside Nest; Interaction Gateway does not.
- Codex/Claude CLI stay; Hermes/OpenAI Responses do not.
- Service-account login persists; provider history/credentials do not.
- Native subagents are ephemeral; business delegation creates a child Task.
- Domains/Agents are many-to-many; mutation delegation names a target Agent.
- AgentVersion snapshots domains/capability keys/runtime/profile, not models or
  per-tool policy.
- Capability metadata stays detailed; routing is read versus mutation.
- Invocation is exact authorization and mutation work item; no grant/outbox.
- Task owns business lifecycle; Attempt owns process lifecycle; waits derive.
- There is no background mode, automatic continuation, continuation field, or
  Operation-to-Agent trigger.
- Process-local admission max is four; no queue, advisory lock, quota, or
  distributed signaling.
- Mutations are durable/idempotent; reasoning processes are disposable.
- Same-SHA restart recovery is required; cross-version automatic drain is not.
- Session has no lifecycle and deletes only when all owned work is terminal.
- Work records persist; transcript/replay/artifact/cost/provider sessions do
  not.
- Legacy Agent OS data is discarded in a clean six-model cutover.
- Cutover requires a basic custom backup/list/checksum, not restore rehearsal or
  RPO/RTO evidence.
- Final delivery uses substantial Terra units and one integrated Sol review.
