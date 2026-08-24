# KID-25 Single-Node Agent OS Clean Contraction Design

- Date: 2026-08-23
- Runtime amendment: 2026-08-24
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
broader design previously committed at this same path, fixes the reduced
single-node scope approved on 2026-08-23, and incorporates the approved
2026-08-24 native host Runner amendment. There is no separate runtime design
authority.

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
       -> immutable AgentAttempt admission and authority
            -> Host Runner command long-poll
                 -> native Codex or Claude CLI
                 -> ephemeral provider-native subagents
                 -> Nest MCP v2 Streamable HTTP
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
- Ephemeral host-native Codex/Claude execution using the dedicated Runner
  account's existing login.
- Exact owner-domain capability authorization, mutation idempotency, and HITL.
- Basic same-version API/worker restart recovery without provider resume.
- Same-origin CopilotKit live streaming and a durable work projection without
  chat replay.
- A final six-model Agent OS schema with all legacy code/schema removed.
- A destructive cutover that discards legacy Agent OS data while checking that
  unrelated business and Operation data remain.
- One Web/API/worker container topology plus one native host Runner process.

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
  message broker, a Runner inbound listener, or a LAN-exposed MCP endpoint.

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
share its AgentVersion, workspace, MCP HTTP binding, authority, sandbox,
Runner-owned supervisor tree, and one global slot. They create no KidItem row.

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

### 7.1 Supported platforms and runtimes

The native Runner platforms are exactly `macos | windows`. Node maps `darwin`
to `macos` and `win32` to `windows`; Linux and unknown platforms fail closed.
macOS is the supported development and integration-test platform. Native
Windows is the Office production platform.

Provider runtimes remain a separate axis with exactly
`codex_cli | claude_cli`. Remove Hermes, OpenAI Responses, credential brokers,
runtime-handle codecs, monetary budget flags, and fallback selection. Runtime
and model selection are explicit; a missing selection or incompatible CLI/MCP
train fails admission and readiness.

Every Attempt forces provider history and session persistence off. KidItem
never requests or stores provider resume/session IDs. The dedicated host Runner
account's ordinary Codex and Claude login state is the only persistent provider
state. KidItem never reads, copies into persistence, encrypts, HMAC-signs, or
returns provider credential values.

### 7.2 Runtime topology and ownership

Nest remains the durable authority while a new native `apps/agent-runner`
process owns only disposable host process execution:

```text
Nest API container
  <- HTTP command long-poll   <- Host Runner
  <- idempotent event POST    <- Host Runner
  <- MCP v2 Streamable HTTP   <- Codex/Claude CLI
```

The Runner never exposes an inbound listener. The API container's existing
Nest port is published only on the host loopback as
`127.0.0.1:4000 -> api:4000`; there is no dedicated Runner port. Public API
routes remain under `/api/*`, while Runner/MCP routes are the sibling
`/internal/agent-runtime/*` namespace. Office nginx returns `404` for
`/internal/*` and never exposes it to the LAN. Runner and Attempt
authentication remain mandatory on loopback.

Nest owns Session/Task/Attempt authority, admission, grants, Invocations,
Approvals, owner idempotency, Operations, and the MCP tool implementation. The
Runner owns strict provider command construction, ephemeral directories,
stdin/stdout handling, timeout/interrupt, and complete process-tree cleanup.
The API container neither installs nor spawns Codex/Claude and mounts no
provider login volume. The worker never spawns a provider CLI.

### 7.3 Runner HTTP control protocol

The control protocol uses strict, bounded Zod contracts and rejects unknown
keys. Both control routes are authenticated with the installation Runner
token:

- `POST /internal/agent-runtime/runner/commands:poll` is a long-poll that
  returns at most one bounded command batch;
- `POST /internal/agent-runtime/runner/events` accepts bounded lifecycle,
  output, readiness, acknowledgement, and terminal event batches.

The Runner creates a cryptographically random `runnerInstanceId` on every
process start. Its first poll carries the strict hello/readiness snapshot; Nest
issues one process-memory `leaseId` after validating the complete
platform/runtime/readiness train. Later polls carry that lease. Exactly one
command poll may be open for the lease; a concurrent poll is rejected. Nest
holds an empty poll for at most 20 seconds and returns `204`; the Runner
immediately opens the next poll with a 25-second client deadline. An open
authenticated poll or a new poll within the lease window proves liveness. A
closed/failed poll that is not re-established within 30 seconds expires the
lease.

Commands are delivered at least once and contain a unique `commandId`, exact
`attemptId`, deadline, and canonical command hash. The allowed command kinds
are `attempt.start`, `attempt.input`, and `attempt.interrupt`; there is no raw
shell command. The Runner acknowledges commands through the event route.
`attempt.start` replay uses the Attempt ID and canonical launch hash: the same
command returns the existing process state, changed input conflicts, and a
terminal Attempt cannot be relaunched. Input and interrupt are also
idempotent.

Every event batch contains `runnerInstanceId`, `leaseId`, a strictly increasing
`eventSeq`, and bounded events. Nest deduplicates repeated sequence numbers and
rejects gaps, stale leases, unknown Attempts, and invalid lifecycle
transitions. The Runner serializes uploads with at most one event batch in
flight and retries that exact batch until acknowledged. Live output may be
coalesced into small bounded batches and is not made durable; terminal state is
written through the existing AgentAttempt lifecycle.

No new command/event/lease database model is introduced. Control replay and
deduplication are process-memory safeguards. Durable Attempt authority and boot
reconciliation remain the recovery boundary.

### 7.4 Runner and Attempt identity

Each installation has one cryptographically random Runner bearer token with at
least 256 bits of entropy. Windows stores it in a file readable only by the
dedicated Runner account and SYSTEM; macOS uses a mode-`0600` file. Nest
receives the matching value as a Docker secret. Rotation is an explicit short
outage that replaces both protected copies and reruns readiness. Neither side
logs the token or Authorization header.

Nest generates a separate cryptographically random opaque bearer token for
each Attempt. It is bound to one immutable Attempt MCP coordinate, expires at
the earlier of the Attempt deadline and 30 minutes, cannot be refreshed, and
is invalidated immediately on terminalization, cancellation, interrupt,
timeout, Runner loss, or API restart. Nest keeps only its SHA-256 digest and
binding in the Attempt-token registry. The raw token exists only in the
unacknowledged in-memory `attempt.start` command so at-least-once delivery can
retry that exact command without minting a second identity; command
acknowledgement immediately discards that raw command payload. The Runner
passes the same token to the CLI through a generated environment reference. It
is never reconstructed, logged, or persisted.

### 7.5 Strict launch and host process boundary

Nest sends only a business-neutral `AttemptLaunchSpec` containing the protocol
identity, Attempt ID, `codex_cli | claude_cli`, explicit model, bounded prompt,
`empty_ephemeral_v1` workspace policy, timeout, loopback MCP URL, Attempt
token, and exact MCP revision `2026-07-28`. It cannot send an executable, shell
name, raw argument list, arbitrary environment variable, host path, provider
credential, or business authority field.

The Runner owns code-defined provider command builders. It creates an empty,
private per-Attempt workspace and generated provider/MCP configuration beneath
its configured root. The verified provider authentication artifact remains in
the persistent host login root and is exposed to the isolated provider home
only through a validated same-volume OS reference supported by the selected
CLI train; readiness fails instead of copying credential bytes or silently
using the complete persistent provider home.

Windows launches every Attempt in a Job Object with kill-on-close. macOS uses
an exact process group plus a parent-death control-pipe watchdog so an abrupt
Runner exit also kills the complete group. Native provider subagents stay
inside that same Attempt, concurrency slot, token lifetime, and cleanup
boundary. Interrupt, timeout, Runner loss, API restart, and Runner shutdown
kill the complete tree. Attempt directories are removed after terminalization;
the host login remains.

### 7.6 Attempt-bound MCP v2 HTTP adapter

Codex and Claude call Nest directly using MCP v2 Streamable HTTP revision
`2026-07-28`. There is no stdio MCP child, Unix socket, named pipe, byte bridge,
custom relay, transport session persistence, or legacy fallback.

Generated Codex configuration uses the loopback URL plus
`bearer_token_env_var`; generated Claude HTTP MCP configuration uses an
environment-expanded Authorization header. The configuration contains only
KidItem's Attempt endpoint and the selected train's explicit non-persistent
controls. The Attempt token is excluded from model-invoked shell environments
and model-visible output.

Codex also receives `features.mcp_2026_07_28=true` and
`CODEX_MCP_PROTOCOL_VERSION=2026-07-28`. Claude receives
`MCP_SDK_GENERATION=v2` and `MCP_PROTOCOL_NEGOTIATION=auto`. Claude's `auto`
does not authorize legacy fallback: Nest rejects the legacy era and readiness
must observe revision `2026-07-28`.

The Nest HTTP adapter validates the bearer token, path Attempt ID, TTL,
terminal state, and immutable in-memory binding before constructing the
request-scoped MCP server. It then revalidates the durable
Session/Task/Attempt/AgentVersion/user/organization coordinate for every tool
call, creates Invocations server-side, executes authorized reads inline, and
durably admits mutations for the worker. It exposes the exact existing 11 MCP
transport tools and all 18 domain CapabilityDefinitions, including the ten
Sourcing capabilities.

### 7.7 Live control and readiness

Live user input and interrupt are ordinary long-poll commands to the same
running Attempt. They are never persisted as a provider handle or used to
resume a terminal process. Losing the Runner lease kills the Attempt rather
than reconnecting to its provider process.

Readiness requires one authenticated Runner lease, supported platform, exact
control contract, compatible Codex/Claude and MCP train, both provider login
checks, enforced non-persistent settings, strict modern MCP discovery/list/call,
runtime-specific terminal-result parsing, token redaction/revocation, and
process-tree/workspace cleanup. Only Claude requires a live second input;
Codex returns its strict envelope immediately after its direct probe. Readiness
is an in-memory projection, not a new database state. Admission checks it and
the Task-pinned runtime for every new Attempt.

Codex does not make readiness depend on stochastic model tool selection. For a
`readiness_canary` launch, the shared launch contract carries only an ephemeral
UUID nonce (required if and only if that scope is selected); it cannot carry a
server name, tool name, or arbitrary arguments. After exact app-server
`thread/start`, Runner creates an ephemeral MCP-enabled probe thread and calls
the supported `mcpServer/tool/call` control-plane RPC with the fixed
`kiditem_attempt` / `readiness_probe` coordinate and exact nonce. It validates
the strict structured result, then creates a second fresh ephemeral provider
thread in the same app-server process and Attempt configuration. The only
thread override is Runner-owned
`mcp_servers.kiditem_attempt.enabled=false`; both thread responses must return
the `:workspace` permission profile. Runner assigns only the second thread as
live, so there is no resume, history, or persistence bridge from probe to
provider turn. The provider readiness turn is intentionally tool-free; its
prompt is the minimal structured reachability contract: `Return only a valid
AgentResultEnvelope JSON object. Do not call any MCP tool.` The direct probe
carries readiness semantics separately, and Codex never synthesizes a live
input command. Claude retains its model-selected scoped readiness probe and
live second input during the live turn.

The readiness contract is therefore four correlated proofs: a real provider
structured result (Codex immediate after its direct probe; Claude after its
live input); a local exact bundled app-server control-plane regression proving
modern `tools/list` plus `tools/call` on the probe thread; a deterministic
local fake Responses-provider regression proving an MCP-enabled Codex thread
exposes the `mcp__kiditem_attempt` namespace child with `tool_choice: auto`
while the fresh readiness provider thread omits that namespace; and a
deterministic session-level Codex `turn/start` / `turn/steer` /
completion-decode gate. The local gates do not substitute for provider-turn
coverage, the model-visible metadata proof does not claim a live model selected
the tool, and the session-level gate does not claim a fake provider completed a
full live turn.

## 8. Basic Restart Recovery

Basic recovery means restart with the same deployed application version/SHA:

1. API shutdown or loss closes/fails the Runner's outstanding command poll.
   The Runner terminates every live macOS process group or Windows Job Object
   before it reconnects.
2. API boot has no prior Runner lease or Attempt-token digest. It marks every
   prior `starting|running` Attempt `process_interrupted` and rejects stale
   events from the old `runnerInstanceId`/`leaseId`.
3. Its nonterminal inline read Invocations become
   `failed/process_interrupted`; they are not reconstructed or retried.
4. Task remains `open` unless it already has an explicit business terminal
   status.
5. Pending Approvals remain durable until decision, cancellation, or expiry.
6. `ready` mutations remain worker work; an expired `executing` lease is
   retried with the same owner idempotency key.
7. The Runner removes only validated stale Attempt directories beneath its
   configured private root after process-tree termination.
8. Web reloads the durable Task projection and shows **Continue** when more
   reasoning is needed.
9. Continue creates a new immutable Attempt from current durable Task,
   Invocation, Approval, Operation, and resource state. It never restores a
   provider session.

Runner crash, host reboot, a poll lease that cannot be renewed within 30
seconds, or an Attempt-token failure uses the same fail-closed path. Browser
disconnect ends only the live stream and does not cancel the CLI. Worker
restart uses the same mutation lease/idempotency rules. Cross-version rolling
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

1. add the final logical `AgentVersion`, `AgentSession`, and `AgentTask`
   symbols mapped to `agent_work_versions`, `agent_work_sessions`, and
   `agent_work_tasks`;
2. add `AgentAttempt`, `AgentCapabilityInvocation`, and
   `AgentCapabilityApproval` against that physical graph;
3. cut application callers to only those tables without dual write;
4. remove every legacy caller/model; and
5. drop the old physical Agent OS tables with the repository's approved
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
- active credentials or secrets introduced into Agent OS runtime persistence or
  passed across the Runner launch/control boundary;
- fixed playbooks, tool-wrapper Agents, capability `kind`, `visibility`, old
  approval metadata, or duplicate handler policy;
- background continuation/coordinator/Operation-to-Agent hooks,
  `continuationMode`, or `continuationKey`;
- advisory executor lock, distributed admission, release drain, or capacity
  queue;
- coordinated Session deletion state/Operation/bindings; and
- legacy Agent OS shared exports and old Web Agent console/routes.

The scanner must allow the required process-memory-only Runner lease,
command/event replay guards, Attempt-token digest bindings, and process handles,
and must distinguish them from forbidden persistence/codec paths. It enforces
two final security invariants: active credential/secret material is never
persisted or admitted as raw launch input, and ephemeral Runner control state
never becomes durable. It does not maintain special predicates for retired
HMAC names or fixtures that can no longer re-enter the final architecture; a
value such as `signingSecret` is rejected by the generic secret rule, while a
non-secret hash or digest remains valid protocol metadata.

## 13. Home-Server Deployment

Deploy the existing Web, API, and worker containers plus one native host
`apps/agent-runner` process. API owns CopilotKit, durable Agent OS authority,
Runner admission, and MCP HTTP. Runner owns only native CLI process execution;
worker owns mutation dispatch and Operations. There is no gateway, Runner
inbound listener, or independently deployed Agent service.

Compose/configuration declares exactly one API replica. Process-local maximum
concurrency is controlled only by:

```text
AGENT_CLI_MAX_CONCURRENCY=4
```

Attempt 30 minutes, live Approval wait 10 minutes, and Approval lifetime 24
hours remain code constants. Remove generic Agent worker enablement, old
runtime concurrency/wait/budget values, retired internal credential/signing
settings, and gateway URLs.

The existing GitHub Actions Office release remains the only deployment
entrypoint. Its immutable bundle includes a versioned Runner artifact and
runtime-contract manifest. Office installs and runs the Runner through Task
Scheduler under a dedicated Windows account; macOS starts the development
Runner explicitly. The release transaction stops the scheduled Runner,
atomically replaces it, verifies its definition, and restarts it.

The Runner installation token is protected by Windows ACL or macOS mode
`0600`; Nest receives the matching value through a Docker secret. The Nest
internal runtime route is published only on host loopback and explicitly
denied by Office nginx. No Windows Firewall LAN rule is added. Codex/Claude and
their login profile are removed from the API image and Compose volumes.

KID-25 adds focused Runner/MCP/runtime tests and readiness for the runtime
selected by a published AgentVersion. It does not add a scheduled compatibility
workflow, compatibility image, automatic dependency update, advisory singleton
lock, automatic release drain, or durable Runner inventory.

The interrupted MCP v2 worktree diff is reconciled in place. Reuse its modern
runtime contract, strict Zod wire schemas, bounded result envelope, Nest-owned
11-tool factory, and transport-independent scanner assertions. Replace and
remove its stdio-to-UDS bridge, Unix socket server, Linux `/proc` peer verifier,
custom proxy/relay, API-owned provider process registry, container CLI packages,
login volume, and Docker-image CLI assertions. The replacement surface is
`apps/agent-runner`, shared command/event schemas, Nest Runner admission,
platform supervisors, the in-memory Attempt-token registry, direct MCP HTTP,
loopback deployment wiring, and matching readiness tests. This cutover does not
change the 18 capability definitions, owner-domain ports, lifecycle schema, or
Web state.

Code upgrade is stop/start. The operator first confirms no `ready|executing`
mutation, stops Attempt admission and the Runner, deploys the matching
API/worker/Runner train, and requires full readiness before admitting work.
Crash restart with the same SHA follows Section 8.

## 14. Implementation Order

Use substantial integrated Terra work units, not file-sized microtasks. Use one
integrated Sol review over the complete implementation and fix every concrete
P1/P2 finding before completion.

The exact Host Runner/control/MCP/deployment file sequence and TDD gates are
owned by
`docs/superpowers/plans/2026-08-24-kid-25-mcp-v2-runtime-train.md`. That plan
supersedes every earlier container CLI, stdio, UDS, or API-local provider
process instruction without changing this design's capability/schema/Web
scope.

The numbered sequence is an execution and review aid, not a requirement to
keep legacy code compatible between commits. Replacement wiring and legacy
deletion may be combined or moved earlier when that produces a smaller,
coherent cutover. The fixed final topology, state ownership, security
invariants, and acceptance gates remain authoritative.

1. Add final registries, routing/HITL/idempotency validators, replacement
   physical schema/shared contracts, and fail-first legacy scanners.
2. Implement one admission/lifecycle/Invocation/Approval/delegation boundary
   against the replacement graph.
3. Move capability implementations to owner input ports, preserve the reusable
   modern MCP v2 server work, and implement the native Host Runner, strict HTTP
   control contracts, direct MCP Streamable HTTP, and platform supervisors.
4. Implement worker mutation dispatch, Approval expiry, and same-SHA API/worker
   restart reconciliation.
5. Cut Nest CopilotKit/Web to durable work projection plus future live events,
   switch all callers, then delete the entire legacy code/schema in one clean
   contraction.
6. Remove container CLI/UDS/stdio assumptions, align the single-node
   Compose/Runner artifact/config/docs, perform the basic backup/cutover check,
   run macOS and Windows gates, obtain one Sol review, push the existing branch,
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

- Platforms are exactly `macos | windows`; runtimes are exactly
  `codex_cli | claude_cli`; Linux Runner admission fails.
- Codex/Claude command tests prove exact non-persistent settings and reject raw
  shell, executable, arbitrary argument/env, and host-path input from Nest.
- The API image neither installs nor spawns provider CLIs and mounts no provider
  login volume.
- Runner control uses one authenticated command long-poll and idempotent event
  POSTs; duplicate commands/events do not duplicate processes or transitions.
- One outstanding poll, 20-second empty response, 25-second client deadline,
  and 30-second lease expiry are enforced.
- CLI children receive no DB/Nest/business/provider credential values.
- Attempt workspace, Windows Job Object/macOS process group and parent-death
  watchdog, and generated configuration are isolated and cleaned.
- Native subagents remain inside one Attempt/slot/authority.
- Live second message and interrupt use only the long-poll control lane.
- Runner-token rotation, Attempt-token binding/TTL/revocation, and log
  redaction pass.
- Direct MCP v2 Streamable HTTP exposes exactly 11 tools and 18 capabilities;
  stdio/UDS/custom relay and legacy fallback have zero production findings.
- Browser disconnect does not stop the Attempt.
- Runner crash, control lease loss, and same-SHA API restart kill the complete
  host process tree, mark live Attempts/read Invocations interrupted, leave
  Tasks open, preserve Approvals/mutations, and expose manual Continue.
- Same-SHA worker restart retries expired mutation leases with one idempotency
  key and does not duplicate a committed mutation/Operation.
- No provider session/history is created or resumed.
- macOS real process/loopback integration and Windows Job Object, ACL, quoting,
  Task Scheduler, and no-LAN-listener CI gates pass.

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
- Windows Office/home process audit shows Web/API/worker, one Linux API
  container replica, and one dedicated native Runner. Codex/Claude children
  stay inside Runner-owned Job Objects and reach only loopback Nest MCP HTTP.

## 16. Locked Decision Ledger

- One user, one Windows home server, one Linux-container Agent authority API,
  and one dedicated native Windows Runner process.
- CopilotKit stays inside Nest; Interaction Gateway does not.
- Codex/Claude CLI stay; Hermes/OpenAI Responses do not.
- Host Runner account login persists; provider history/session IDs and
  credential bytes do not enter KidItem persistence.
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
- Runner control is outbound HTTP command long-poll plus idempotent event POST;
  there is no WebSocket, inbound Runner listener, or durable control queue.
- Codex/Claude call Nest directly through loopback MCP v2 Streamable HTTP
  `2026-07-28`; there is no stdio bridge, UDS, named pipe, or custom relay.
- Runner installation identity and per-Attempt bearer identity are distinct,
  process-memory admitted, rotatable/revocable, and never logged.
- Mutations are durable/idempotent; reasoning processes are disposable.
- Same-SHA restart recovery is required; cross-version automatic drain is not.
- Session has no lifecycle and deletes only when all owned work is terminal.
- Work records persist; transcript/replay/artifact/cost/provider sessions do
  not.
- Legacy Agent OS data is discarded in a clean six-model cutover.
- Cutover requires a basic custom backup/list/checksum, not restore rehearsal or
  RPO/RTO evidence.
- Final delivery uses substantial Terra units and one integrated Sol review.
