# KID-25 Provider-Native Conversation and Capability Runtime Design

- Original date: 2026-08-23
- Architecture replacement: 2026-08-25
- Status: Conversation-approved; documented-design review pending
- Tracking issue: KID-25
- Operating target: one authenticated user on one home-server installation
- Office production host: Windows
- Development and primary local QA host: macOS
- Data decision: discard every legacy Agent OS row; no backfill, conversion,
  compatibility reader, dual-write, or provider-history import
- Implementation plan: rewrite
  docs/superpowers/plans/2026-08-23-kid-25-agent-os-clean-contraction.md
  after this documented design is reviewed

## 0. Decision authority

This older design remains authoritative only for compatible KID-25 capability
and owner-domain contracts. It replaces every earlier revision at this path,
including the six-model Session/Task/Attempt design and the disposable
non-persistent CLI Attempt runtime.

The final provider-runtime, MCP transport, Conversation ownership/restart, and
Chat Workspace UX authority lives in the newer
[2026-08-26 workspace design](2026-08-26-agent-os-chat-workspace-ux-design.md),
the user-maintained
[2026-08-26 implementation plan](../plans/2026-08-26-agent-os-global-chat-panel-and-history.md),
and [Architecture](../../ARCHITECTURE.md). When this document differs on those
topics, the newer documents win.

The following older KID-25 assumptions are explicitly superseded:

- KidItem-owned AgentSession, AgentTask, AgentAttempt, and AgentVersion;
- one Task per conversation or one conversation per Task;
- child AgentTask rows for cross-Agent delegation;
- immutable successor Attempts and manual Continue state;
- provider session/history suppression;
- a per-Attempt disposable CLI as the durable reasoning boundary;
- Task-derived waiting, needs_continue, or recovery projections;
- the Operator Agent and agent_os.platform_probe Agent capability; and
- the separate native Host Runner runtime plan as an implementation authority.

Implementation may choose private helper names and local indexes that do not
change the contracts below. It must stop for a design amendment before adding:

- a new PostgreSQL conversation, transcript, Task, Attempt, AgentVersion, grant,
  provider-session, artifact, cost, or runtime-control model;
- automatic model reasoning without an explicit user message;
- a standalone public interaction gateway or LAN-exposed runtime endpoint;
- multi-user RBAC, role-separated approval, organization quotas, or distributed
  runtime coordination; or
- legacy compatibility, backfill, dual-write, or provider-history conversion.

Owner-domain capability contracts and deterministic Operation contracts remain
authoritative for their business behavior. Legacy AgentRun, conversation
replay, HMAC control-plane, credential broker, generic workflow Agent, and
provider-session database assumptions do not survive this design.

## 1. Product model and selected topology

### 1.1 Selected product model

KidItem Agent OS is a ChatGPT Desktop-like conversation UI over locally logged
in Codex and Claude runtimes.

The user creates a top-level conversation, chooses Codex or Claude, chooses a
model and reasoning effort, and sends messages. The selected provider runtime
owns reasoning, provider-native conversation history, and provider-native
subagent orchestration.

KidItem owns only:

- authenticated UI and organization context;
- code-owned optional Agent profiles;
- capability discovery, routing, exact mutation admission, and HITL;
- owner-domain business entities;
- durable Operation execution; and
- a thin native Host Agent Gateway that adapts the Web/Nest control plane to
  the installed provider runtimes.

~~~text
Browser
  -> same-origin Nest /api/copilotkit
       -> authenticated conversation command
       -> in-memory Host Agent Gateway control lane
            -> provider-native top-level conversation
                 -> provider-native subagents
                 -> Nest MCP v2 capability endpoint
                      -> CapabilityDefinition
                      -> owner-domain incoming port
                      -> owner implementation
                           -> optional AI
                           -> optional DB
                           -> optional external provider/browser
                           -> optional OperationRun

Worker
  -> ready CapabilityInvocation mutations
  -> pending CapabilityApproval expiry
  -> deterministic OperationRun execution
~~~

CopilotKit remains an incoming adapter inside Nest. The Host Agent Gateway is a
native installation-local runtime adapter, not a third public Web application
and not a second business authority.

### 1.2 Always-on means Gateway availability, not durable model execution

The Host Agent Gateway starts with the host and remains available. Provider
processes may stay warm or be recreated by their adapter, but process survival
is not a correctness boundary.

Provider-native local conversation/session history is the continuity boundary.
After a process or server restart, the next explicit user message may continue
the same provider conversation. A restart never sends a message, resumes
reasoning in the background, or synthesizes a follow-up turn.

### 1.3 Rejected alternatives

The following alternatives are rejected:

- KidItem-owned transcripts or provider session rows;
- a generic AgentTask duplicating domain business state;
- a child Task for every cross-domain responsibility handoff;
- KidItem-owned immutable CLI Attempt chains;
- an always-running model turn or automatic restart continuation;
- a standalone interaction-gateway application;
- container-installed provider CLIs or copied provider credentials; and
- a generic Operator Agent used only as a routing wrapper.

## 2. State ownership

### 2.1 Final ownership table

| Concern | Source of truth |
|---|---|
| Top-level conversation and transcript | Codex or Claude local provider state |
| Unified sidebar descriptor | Host Agent Gateway local metadata |
| Reasoning and native subagents | Codex or Claude runtime |
| Agent business responsibility and prompt | code-owned AgentDefinition |
| Capability contract and routing metadata | owner-domain CapabilityDefinition |
| Read result | live provider turn; no required durable Agent OS row |
| Exact mutation input/hash/admission | CapabilityInvocation |
| Human confirmation | CapabilityApproval |
| Long-running deterministic execution | OperationRun |
| Business lifecycle and result | owner-domain canonical entity |
| Manual action board | existing ActionTask, when that product feature applies |

AgentTask has no remaining unique responsibility and is removed.

### 2.2 Conversation is not business work

A conversation can inspect or modify many business resources. One business
resource or Operation can be discussed in many conversations. Neither side
owns the other.

~~~text
Conversation A
  -> reads Candidate X
  -> creates Review Batch Y
  -> inspects Operation Z

Conversation B
  -> continues discussion of Candidate X
  -> approves Invocation Q
~~~

Deleting or archiving a conversation never deletes a business entity,
CapabilityInvocation, CapabilityApproval, or OperationRun.

### 2.3 No generic AgentTask

Open-ended investigation that ends in an answer remains only a provider
conversation. Durable work is represented directly by the domain entity,
CapabilityInvocation, CapabilityApproval, or OperationRun that owns it.

If a future requirement needs a user-managed generic follow-up that has no
owner-domain entity, it must be designed as an explicit WorkItem product
feature. KID-25 does not retain AgentTask in anticipation of that requirement
and does not repurpose the existing automation ActionTask without a separate
decision.

## 3. Provider-native conversation model

### 3.1 Top-level ConversationDescriptor

The Host Agent Gateway owns a small installation-local conversation catalog so
Nest can present one sidebar across Codex and Claude. It is not stored in
PostgreSQL and is not a business authority.

A descriptor contains only:

- an opaque KidItem conversation ID;
- server-derived `organizationId`, solely as the Gateway's Conversation 404
  access fence for users in that organization;
- provider runtime: codex_cli or claude_cli;
- provider-native local session/thread reference;
- optional Agent key;
- user-visible title;
- created and last-active timestamps; and
- optional last-used model and reasoning-effort UI preference.

It contains no transcript copy, canonical business input, credential, approval,
Operation state, capability grant, chain of thought, subagent history, token
ledger, cost ledger, or business lifecycle.

The descriptor organization is not MCP, user, turn, or execution authority.
It is never a browser-selected field or provider metadata.

Where a provider can enumerate and title its sessions directly, the Gateway
adapts that native index. A small local descriptor store may fill only the
cross-provider fields the provider does not own. It must remain local to the
dedicated runtime account and must never be treated as recoverable business
data.

### 3.2 General and Agent-bound conversations

A top-level conversation has one fixed optional Agent key:

- agentKey absent: general conversation;
- agentKey present: conversation bound to that code-owned Agent profile.

The general conversation is not an Operator AgentDefinition. It may answer
without any KidItem write, invoke reads directly, and delegate mutations to an
explicit responsible Agent.

Opening chat from a domain dashboard creates or opens a top-level conversation
bound to that Agent. One Agent may have any number of top-level conversations.
Changing the bound Agent creates a new conversation rather than mutating the
meaning of existing history.

### 3.3 Runtime, model, and reasoning effort

The provider runtime is selected explicitly when a conversation is created and
is fixed for that conversation. A different runtime requires a new top-level
conversation because provider histories are not portable.

Model and reasoning effort are selected explicitly in the conversation UI for
each next turn. The user may change either between turns when the provider
supports it. Missing or unsupported selection is an explicit error; there is no
silent fallback.

AgentDefinition, CapabilityDefinition, CapabilityInvocation, and KidItem
PostgreSQL store no provider credential, provider session/history, selected
conversation model, or reasoning effort. The Gateway may retain last-used
values only as local UI preference.

### 3.4 Native subagents

Codex/Claude native subagents are internal execution contexts of the parent
top-level conversation. They:

- do not appear in the KidItem sidebar;
- do not create ConversationDescriptor, AgentTask, or AgentAttempt rows;
- share the parent conversation's active execution boundary;
- remain owned and orchestrated by Codex or Claude; and
- return their result through the parent provider conversation.

Research and same-responsibility delegation stay entirely provider-native.
KidItem applies an Agent boundary only when a mutation responsibility moves to
another Agent.

## 4. Code-owned Agents, domains, and capabilities

### 4.1 Domain catalog

The code-owned domains remain:

~~~text
advertising  agent_os  ai  analytics  automation  channels
finance      inventory orders operations products  rules
sourcing     supply
~~~

Domain assignment is many-to-many default scope, not exclusive ownership. A
domain may be assigned to multiple Agents. A capability may exist in an
unassigned domain. Reads remain directly available, but a mutation in an
unassigned domain is rejected until an Agent is assigned that domain. There is
no domain-to-unique-Agent auto-routing table or capability-grant system.

### 4.2 Final Agent definitions

Keep exactly five code-owned business Agents:

| Agent | Assigned domains |
|---|---|
| Sourcing | sourcing |
| Merchandising | products, ai |
| Supply | supply |
| Channel Operations | channels, orders, inventory |
| Advertising | advertising |

Remove Operator. Domains previously attached only to Operator remain ordinary
catalog domains. Their reads remain available; their mutations require a
current Agent assignment before execution.

AgentDefinition contains only:

- stable key, label, and business responsibility;
- assignedDomains;
- system instruction/profile content; and
- optional presentation metadata.

It contains no runtime, model, reasoning effort, provider credential, provider
session, capability implementation, version row, or historical snapshot.
Historical AgentVersion reproduction is not required.

### 4.3 Capability ownership

The only supported layering is:

~~~text
Agent
  -> CapabilityDefinition
    -> owner-domain incoming port
      -> owner implementation
           -> optional AI call
           -> optional DB/repository work
           -> optional external API/browser
           -> optional OperationRun
~~~

Each owner domain co-locates:

- the Agent-facing CapabilityDefinition;
- strict Zod business input and output schemas;
- its owner-domain incoming port; and
- one production implementation adapter.

Agent OS aggregates and validates definitions and implementations. It does not
define owner business ports, write owner-domain rows, or maintain a central
implementation switch.

CapabilityDefinition contains:

- owner-prefixed key;
- owner domain;
- description;
- strict input and output Zod schemas;
- detailed effects;
- approvalRisk;
- idempotency requirement; and
- owner input-port identity.

Do not restore kind, visibility, old approval, cost effect, provider model,
provider credential, or provider history fields.

Mutation effects are exactly:

~~~text
db_write | external_write | job_enqueue
~~~

Descriptive non-mutation effects such as read, browser, external_io, and llm
remain available. Every mutation requires owner idempotency. A query has
approvalRisk none or low.

AI used by a capability is an owner implementation detail with an explicit
model selected by that implementation. It is unrelated to the user's
conversation model and is not promoted to AgentDefinition or
CapabilityDefinition.

### 4.4 Final Agent-facing catalog

The final catalog contains seventeen capabilities. The ten Sourcing
capabilities remain:

~~~text
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
~~~

The remaining capabilities are:

~~~text
analytics.readOverview
channels.register_confirmed_listing
channels.submit_coupang_listing
channels.submit_wing_thumbnail
products.create_listing_generation_package
supply.create_purchase_order_draft
supply.submit_purchase_order
~~~

Remove agent_os.platform_probe from the Agent-facing catalog. Runtime readiness
is an internal health contract, not an independent business intent.

Sourcing contract details previously approved remain unchanged:

- duplicateCheck is read-only and returns resource references without UI href;
- scrapeProductUrl performs bounded allowlisted supplier investigation and
  writes no candidate;
- ingestCandidate admits only exact server-observed scrape output/hash from the
  same live turn and is owner-idempotent;
- scrapeUrlWorkflow uses sourcing.scrape_url and passes the exact owner key to
  the Operation owner;
- retrieveWorkspaceEvidence returns bounded document text and provenance;
- refreshCollection and collect_shadow_signals remain separate Operations;
- refreshValidation remains a bounded synchronous owner mutation; and
- createReviewBatch retains exact item/version and request-hash fencing.

If the live turn ends before ingestCandidate admission, a later turn must
scrape again. Same-turn scrape evidence is an ephemeral server admission
receipt, not a new persistence model, HMAC, or provider-session field.

## 5. Routing and cross-Agent delegation

### 5.1 Routing rule

Routing remains intentionally simple:

1. Read capability: the current conversation or Agent invokes it directly.
2. Mutation capability in the current Agent's assigned domain: invoke directly.
3. Mutation outside current scope, including every mutation from general chat:
   explicitly select a target Agent and run a provider-native subagent with
   that Agent's profile.

Approval risk is evaluated after routing. Delegation never bypasses HITL.

### 5.2 Delegation without child Task or capability grant

Cross-Agent business delegation uses a provider-native subagent with the target
Agent's code-owned instruction profile. The MCP transport envelope carries
actingAgentKey separately from the capability's strict business input. For a
mutation, Nest validates:

- the current authenticated user and organization lazily resolved from Nest's
  active-turn record for the `conversationId` locator;
- that actingAgentKey resolves to a current AgentDefinition;
- that the capability ownerDomain is included in that Agent's assignedDomains;
- the strict capability input and canonical input hash; and
- owner idempotency and approval policy.

CapabilityInvocation stores executingAgentKey as concise responsibility/audit
provenance. It does not store a provider subagent ID or attempt to prove that a
native subagent process actually ran. The CLI is already a trusted full-access
process in this single-user topology, so a separate capability grant would not
create a meaningful security boundary.

No child AgentTask, child ConversationDescriptor, AgentAttempt, delegation
grant, delegation tree, depth counter, fan-out counter, cycle graph, or
automatic target Agent mapping is created. Native subagent status and nested
reasoning remain provider UI/runtime details.

An unassigned-domain mutation is rejected. Supporting it requires assigning the
domain to an explicit Agent through the code-owned registry; no hidden owner,
temporary override, or capability grant is inferred.

## 6. Durable mutation, approval, and Operation model

### 6.1 Final PostgreSQL graph

Agent OS persistence contains exactly two models:

~~~text
CapabilityInvocation
  -> optional CapabilityApproval

CapabilityInvocation.result
  -> resource_ref values
  -> operation_ref values

OperationRun and owner-domain entities remain independently owned.
~~~

Read capabilities execute live and do not require a durable Invocation row.
Application logs may contain content-free diagnostics, but not canonical input,
credential, transcript, or provider history.

### 6.2 CapabilityInvocation

CapabilityInvocation is the exact mutation-admission receipt and worker work
item. It stores:

- organization and initiating user;
- capability key and owner domain;
- required executing Agent key for responsibility provenance;
- exact canonical input and SHA-256 input hash;
- effects, approval risk, and idempotency requirement;
- required owner idempotency key;
- application version, authorizing Git SHA, and capability contract
  fingerprint;
- status, bounded worker lease/retry fields, concise result references,
  structured error, and timestamps.

It stores no conversation ID, provider-native session ID, AgentVersion,
AgentTask, AgentAttempt, runtime, model, reasoning effort, transcript, prompt,
subagent identity, or provider credential.

Its statuses are:

~~~text
approval_pending | ready | executing | succeeded | failed
~~~

No-approval mutation starts ready. Approval-required mutation starts
approval_pending. The worker is the only owner of ready/executing dispatch.

Mutation admission provides one exact owner idempotency key. Same key and same
canonical input return the same Invocation/result. Same key with changed input
is an idempotency conflict. Missing key is rejected before the owner call. The
same exact key reaches the final database or Operation owner.

### 6.3 CapabilityApproval

CapabilityApproval binds one exact CapabilityInvocation and input hash. It
stores:

- organization and invocation;
- exact input hash;
- pending, approved, rejected, or expired status;
- bounded expiry;
- deciding user, optional reason, and decision timestamps.

The decision is immutable and non-reusable. Medium/high mutations require
approval; none/low do not. This is a single-user confirmation boundary, not
role separation.

If the provider turn is still alive within a bounded wait, it may receive the
approved result and continue. If it has ended, the worker still completes the
already-admitted mutation or Operation. No model turn starts automatically.
The next explicit user message can inspect the Invocation, Approval, Operation,
and business resource through MCP.

### 6.4 OperationRun and domain state

A job_enqueue capability succeeds when OperationRun is durably created and
returns operation_ref immediately. It does not poll and does not start a model
turn on completion.

Owner-domain entities remain the source of truth for business lifecycle.
OperationRun remains the source of truth for long-running deterministic work,
lease recovery, progress, and result. CapabilityInvocation does not duplicate
either lifecycle.

The Agent OS screen's business-work views aggregate owner-domain projections,
pending Approvals, and queued/running Operations. There is no generic Task
status or needs_continue state.

## 7. Host Agent Gateway and provider adapters

### 7.1 Supported runtime axes

Host platforms are:

~~~text
macos | windows
~~~

Provider runtimes are:

~~~text
codex_cli | claude_cli
~~~

Windows is the Office production target. macOS is sufficient for current
implementation and local QA. Windows-specific Task Scheduler, ACL, Job Object,
quoting, and packaging tests remain release milestone QA rather than blocking
current architecture work until the Windows environment is stabilized.

The Gateway uses the host account's existing Codex/Claude login state. KidItem
does not read, copy, encrypt, HMAC-sign, persist, or return credential bytes.
Claude live model conversation cannot be a local acceptance gate while the
development account lacks a paid subscription; deterministic adapter and
readiness contracts remain required and the limitation is reported.

### 7.2 Provider adapter behavior

The Gateway exposes one common conversation/turn interface while using
provider-native mechanisms:

- create, list, open, title, and delete/archive top-level conversations;
- start one explicit user turn with selected model and reasoning effort;
- stream bounded assistant/tool/status events;
- send live user input when supported;
- interrupt an active turn; and
- expose provider-native conversation history for UI rendering.

Codex may use its app-server/thread interface. Claude may use its supported
streaming conversation/session interface. Provider-native process and session
details stay behind each adapter.

There is no raw shell command API. Nest sends structured conversation and turn
commands only. Provider command builders, executable resolution, supported
arguments, local workspace, environment allowlist, and full-access flags are
Gateway-owned code.

The CLI runs non-interactively with full-access permissions under the dedicated
non-administrator runtime account. This is a trusted single-user boundary, not
hostile-process containment. The account must not contain DB, Nest,
business-provider, or unrelated host credentials.

### 7.3 Control and network topology

The final network topology is:

~~~text
Browser
  -> nginx -> Nest public /api routes

Host Agent Gateway
  -> outbound authenticated command long-poll to
     /internal/agent-runtime/gateway/commands:poll
  -> idempotent event POST to
     /internal/agent-runtime/gateway/events

Codex/Claude
  -> MCP v2 Streamable HTTP at
     /internal/agent-runtime/mcp
~~~

Nest port 4000 is loopback/private only. Office nginx returns 404 for
/internal paths. There is no port 4401, Gateway inbound listener, LAN-exposed
MCP endpoint, WebSocket requirement, standalone interaction service, stdio
bridge, UDS, named pipe, or custom byte relay.

The installation Runner/Gateway bearer remains one random 256-bit token,
protected by Windows ACL or macOS mode 0600 and supplied to Nest as a Docker
secret. It is rotatable and never logged.

When the Gateway process starts, it creates and registers one opaque
process-scoped MCP transport token. Codex and Claude provider Conversations
keep their configured MCP connection and token across ordinary turns; the token
remains valid only until that Gateway process ends and is never logged,
persisted, renewed, or rotated per turn.

`conversationId` is a routing locator, never business authority. At turn start
Nest records `activeTurns[conversationId]` with the initiating organization,
user, turn ID, and a fresh execution ID. A business MCP tool call lazily reads
that live record to derive authority and fails closed when no matching active
turn exists. The Gateway descriptor's `organizationId` remains only the
Conversation access fence, not MCP authority. Only an exact matching provider
terminal clears that record; a stale terminal or interrupt acknowledgement
cannot clear a newer turn. There is no binding TTL, renewal, or persistence.

### 7.4 MCP v2 boundary

Codex/Claude call the Nest-owned MCP v2 Streamable HTTP adapter using protocol
revision 2026-07-28. The adapter authenticates the process-scoped transport
token. It retains no transcript or durable transport session; business tool
calls lazily resolve the static `conversationId` locator against Nest's current
active-turn record.

It exposes:

- internal transport tools for catalog, invoke, delegation, Invocation status,
  Approval status, Operation status, and readiness as required; and
- all seventeen Agent-facing CapabilityDefinitions.

Read calls validate strict schemas and execute through the owner port. Mutation
calls validate actingAgentKey against the current Agent/domain assignment,
canonicalize input, durably admit
CapabilityInvocation/CapabilityApproval, and return a concise reference.

MCP v2 Task records do not replace OperationRun. No MCP transport session,
provider session, or conversation transcript is written to PostgreSQL. Legacy
protocol fallback fails readiness rather than silently downgrading.

At implementation start, resolve the latest mutually compatible Codex CLI,
Claude CLI, MCP SDK v2, and schema packages, then commit the exact resolved
versions and lockfile together. Do not use a floating latest dependency at
runtime.

### 7.5 Concurrency and live control

The Gateway limits active provider turns installation-wide. The initial default
is four. Capacity is process-local, immediate, and non-durable; there is no
PostgreSQL queue, quota, delegation depth, or fan-out state.

Conversation sessions may remain available while idle and do not consume an
active-turn slot. Native subagents execute within the parent turn's provider
runtime and slot.

Live input and interrupt are control commands for the current provider turn.
They do not create durable Attempts or Continue state.

## 8. Restart and failure semantics

### 8.1 API or Gateway restart

On API or Gateway restart:

1. API-side active-turn and Gateway-registration memory is lost; live provider
   turns end under the existing control lifecycle, without prompt replay or
   automatic continuation;
2. an API restart is repaired by the Gateway's next protected poll, which
   re-registers that Gateway process and its existing process-scoped MCP token;
3. only an exact `registration-missing` response permits one fresh protected
   poll followed by one retry of the same bounded event; all other event or
   transport uncertainty fails closed;
4. a Gateway process end also ends its MCP token; a replacement process creates
   and registers its own token;
5. provider-native local conversation history remains owned by the provider,
   and the next explicit user message may continue that same conversation;
6. a read call that did not complete has no durable replay obligation;
7. a mutation admitted before failure remains CapabilityInvocation worker work;
8. pending Approval remains actionable;
9. OperationRun continues under its existing durable lease/idempotency rules;
   and
10. a mutation not durably admitted is treated as never started.

There is no AgentAttempt process_interrupted state, successor Attempt,
needs_continue projection, provider-session reconstruction in PostgreSQL, or
automatic reasoning recovery.

### 8.2 Provider process failure

A provider process failure ends only the active turn. The Gateway reports a
bounded error and preserves the provider-local conversation when the provider
supports it. The user may retry by sending another explicit message.

Transport retry can deduplicate the same in-memory turn/tool coordinate. After
durable mutation admission, CapabilityInvocation and owner idempotency are the
only replay authorities.

### 8.3 Worker restart

Worker restart retries expired executing mutation leases with the same exact
canonical input and owner idempotency key. It must not duplicate a committed
domain write or OperationRun. Approval expiry and a concurrent user decision
have one transactional winner.

## 9. CopilotKit and Web UX

### 9.1 Agent OS screen

The Agent OS screen follows the ChatGPT Desktop interaction model:

- sidebar: top-level provider conversations only;
- new chat: general conversation with no Agent;
- domain dashboard chat: conversation bound to that domain Agent;
- header/composer: explicit runtime at creation plus per-turn model and
  reasoning-effort selectors;
- main stream: provider-native conversation history and future live events;
- inline cards: resource refs, mutation Invocation, Approval, and Operation
  status/actions.

Provider-native subagents are not sidebar conversations. Their nested progress
may be displayed only if the provider exposes it as part of the parent turn.

There is no AgentTask list/tree, Attempt list, Continue button/state,
needs_continue, awaiting_child, or reconstructed KidItem transcript.

### 9.2 Data access

The browser calls only authenticated same-origin Nest APIs. Nest proxies
conversation list/history/commands to the Host Agent Gateway and does not
persist them.

When the Gateway is unavailable, the UI reports runtime unavailability rather
than showing a stale KidItem conversation copy. Durable business cards continue
to load from their owner-domain, Approval, Invocation, and Operation APIs.

### 9.3 Conversation deletion

Conversation deletion is a provider/Gateway-local operation. It removes or
archives the local descriptor and asks the provider to apply its supported
history deletion behavior. It never cascades into PostgreSQL business records,
Invocations, Approvals, or Operations.

## 10. Clean schema and code cutover

### 10.1 Removed Prisma models

Drop these models and physical tables:

~~~text
AgentVersion
AgentSession
AgentTask
AgentAttempt
~~~

Drop the current Agent-prefixed Invocation/Approval graph and create the clean
two-model graph:

~~~text
CapabilityInvocation
CapabilityApproval
~~~

The clean models must not retain nullable sessionId, taskId, attemptId,
agentVersionId, runtimeType, reportedModel, authorization expiry, or provider
history compatibility fields.

All existing Agent OS rows may be discarded. Do not backfill, export, map,
dual-write, or retain compatibility views.

### 10.2 Required database invariants

Use string-backed statuses plus Zod/domain validation. Require:

- organization-fenced relations;
- one Approval per Invocation;
- unique required owner idempotency coordinate for mutations;
- ready/executing lease indexes;
- exact input-hash binding for Approval; and
- no native PostgreSQL enum.

Business input schemas cannot accept organization, user, conversation, Agent,
runtime, model, provider session, active-turn state, or other server authority
fields.

### 10.3 Removed production code

Remove, without compatibility facades:

- AgentVersion publication/seed/history;
- AgentSession/AgentTask/AgentAttempt repositories and services;
- root/follow-up/Continue/reopen/cancel/delegation Task admission;
- Attempt capacity, launch, reconciliation, token, and process-state code;
- Task facts/projection/tree and terminal Session deletion APIs;
- AgentTask-based MCP authority and child status/wait/result/message tools;
- Operator Agent prompt/publication/readiness and agent_os.platform_probe;
- disposable empty-home/non-persistent provider enforcement;
- automatic successor and restart recovery tests;
- stale Task/Attempt Web state and routes; and
- scanners or fixtures that preserve those retired names only for legacy
  compatibility.

Retain and simplify:

- owner-local CapabilityDefinition composition;
- strict capability schemas and owner idempotency;
- CapabilityInvocation/Approval worker dispatch;
- OperationRun execution and recovery;
- MCP v2 modern-only adapter;
- installation bearer, process-scoped MCP transport, and active-turn authority
  security;
- native provider command/process adapters;
- same-origin CopilotKit incoming adapter; and
- secret/control-state persistence scanners expressed as current general
  invariants.

## 11. Home-server deployment

The Office deployment remains:

~~~text
Windows host
  -> nginx / Web / one Nest API container / worker container
  -> one Task Scheduler-managed native Host Agent Gateway
       -> host-installed Codex and Claude runtimes
       -> provider-local login and conversation history
~~~

GitHub Actions remains the only Office release entrypoint. Task Scheduler
registration is needed only for first install, task-definition changes, or
Windows account/password changes. Normal deploy/rollback replaces the versioned
Gateway runtime and restarts the existing task.

Runner/Gateway bearer rotation is independent of the Windows account and
provider login. Provider authentication is the dedicated Windows user's
existing CLI login state.

The API image does not install or launch Codex/Claude and mounts no provider
login directory. The worker never launches a provider runtime. Internal routes
are loopback/private and blocked by nginx.

Windows execution verification is deferred until the Windows QA environment is
stable. macOS must prove the common Gateway/provider contract, process control,
MCP v2, capability routing, mutation admission, and Web flow. Windows-specific
verification remains a declared release milestone, not a hidden claim.

## 12. Implementation order

After this documented design is reviewed, replace the existing implementation
plan with substantial integrated units:

1. fail-first contract and schema tests for the two-model persistence graph,
   five Agents, seventeen capabilities, no Operator, and no Task/Attempt;
2. simplify CapabilityInvocation/Approval admission and worker recovery;
3. replace Attempt/Task MCP authority and child delegation with the
   process-scoped MCP transport, Nest active-turn lookup, actingAgentKey, and
   provider-native Agent delegation;
4. refactor the native Runner into the always-on Host Agent Gateway with
   provider-local conversation adapters;
5. replace the Web Task view with the provider conversation sidebar/stream and
   model/effort controls;
6. delete the four retired models and all legacy lifecycle code, align
   deployment/docs/scanners, and run the complete QA matrix.

Task boundaries are review aids, not compatibility boundaries. Preserve
focused TDD tests, do not spend work on temporary legacy compatibility, and
delete old surfaces as soon as their replacement is integrated.

Implementation subagents use Terra with max reasoning. Use selective Sol max
review only for material authority, mutation, transport, or process boundaries.
Final completion is QA-driven; use a final Sol max integrated review only when
executable QA cannot resolve an important ambiguity.

## 13. Verification and acceptance

### 13.1 Conversation and provider runtime

- General and Agent-bound top-level conversations create distinct provider
  sessions without PostgreSQL rows.
- One Agent can own multiple top-level conversations.
- Runtime is fixed per conversation; model/effort are explicit per turn and
  have no silent fallback.
- Sidebar and history reload from the Gateway/provider local source.
- Native subagents create no top-level conversation or database row.
- Restart creates no automatic model turn; the next user message can continue
  provider-local history.
- Active-turn concurrency rejects excess work without a database row or queue.

### 13.2 Agent and capability catalog

- Exactly fourteen domains and five Agents validate at boot.
- Operator and agent_os.platform_probe have zero production/publication/MCP
  catalog findings.
- Exactly seventeen Agent-facing definitions have one strict schema, one exact
  owner input port, and one implementation.
- Sourcing exposes exactly its ten approved capabilities.
- Domain assignment is many-to-many.
- Cross-domain reads run directly; cross-domain mutations require an explicit
  target Agent whose current assignedDomains contains the owner domain.
- Every mutation requires actingAgentKey; unknown Agent and owner-domain
  mismatch fail before CapabilityInvocation admission.
- No read, mutation, delegation, or capability grant model exists.
- Provider-native delegation creates no child Task or child conversation.

### 13.3 Mutation, Approval, and Operation

- Reads create no CapabilityInvocation row.
- Every mutation stores exact canonical input/hash and owner key before owner
  execution.
- Same key/input replays; same key/drift conflicts; missing key fails before
  owner call.
- Medium/high mutation cannot execute before exact immutable Approval.
- Worker restart does not duplicate a committed domain write or OperationRun.
- Operation-backed capability returns operation_ref immediately and never
  starts a model turn on completion.
- Scrape evidence is same-turn bounded and fabricated/unbound ingest fails.

### 13.4 Security and transport

- Gateway API accepts no raw shell, executable, argument array, environment map,
  host path, provider credential, or business authority input.
- Installation bearer and one Gateway-process MCP token are authenticated,
  redacted, non-persistent, and end with that process; provider MCP
  configuration remains stable across ordinary turns.
- A business MCP tool call derives organization, initiating user, exact turn,
  and fresh execution ID only from the matching Nest active-turn record.
  `conversationId` and descriptor organization alone grant no MCP authority.
- Only an exact provider terminal clears a matching active turn; stale terminal
  events and interrupt acknowledgements cannot clear a newer turn. There is no
  active-turn TTL, renewal, or persistence.
- An API restart re-registers on the next protected poll; only exact
  `registration-missing` permits one poll plus same-event retry.
- Provider login/history stay only under the dedicated host account.
- API/worker containers neither install nor spawn provider CLIs.
- MCP v2 2026-07-28 is modern-only and legacy fallback fails readiness.
- Internal routes are loopback/private and nginx-blocked.
- Common macOS process/runtime tests pass; Windows-specific release QA remains
  explicitly pending until its environment is stable.

### 13.5 Schema, Web, and cutover

- Final Agent OS persistence has exactly CapabilityInvocation and
  CapabilityApproval.
- AgentVersion, AgentSession, AgentTask, AgentAttempt, and their production
  callers have zero findings.
- No conversation/transcript/provider session/model/effort enters PostgreSQL.
- Web has no Task tree, Attempt view, Continue state, or needs_continue.
- Conversation deletion does not delete durable business work.
- Clean destructive push, Prisma generation, shared/server/Web/Gateway builds,
  Nest boot, worker boot, scanners, focused PostgreSQL races, and browser QA
  pass against an explicit isolated database.

## 14. Locked decision ledger

- KidItem is a remote ChatGPT Desktop-like UI for local Codex/Claude runtimes.
- Host Agent Gateway is always available; a model turn is never automatic.
- Provider local state owns top-level conversations and transcripts.
- Gateway local metadata owns only a minimal cross-provider sidebar descriptor.
- PostgreSQL stores no conversation, transcript, Agent Task, Attempt,
  AgentVersion, provider session, model, or reasoning effort.
- General chat has no AgentDefinition; Operator is removed.
- Five code-owned business Agents remain.
- Runtime is selected when creating a conversation; model and effort are
  explicit per next turn.
- Native subagents remain inside the parent top-level conversation.
- Cross-Agent mutation delegation uses provider-native subagents plus an
  actingAgentKey transport coordinate, never a capability grant or child Task.
- AgentTask has no unique owner responsibility and is removed.
- Owner-domain entities own business lifecycle.
- CapabilityInvocation owns only exact durable mutation admission and worker
  execution.
- CapabilityApproval owns exact single-user confirmation.
- OperationRun owns long-running deterministic execution and restart recovery.
- Reads are live and need no durable Invocation.
- Capability catalog contains seventeen entries, including all ten Sourcing
  entries and excluding agent_os.platform_probe.
- CapabilityDefinition and owner ports stay owner-local; Agent OS aggregates.
- Provider credentials and history remain under the host OS account.
- CLI runs trusted full-access/non-interactive under the dedicated
  non-administrator account.
- MCP is v2 Streamable HTTP revision 2026-07-28 with no legacy fallback.
- One Gateway process owns one stable MCP transport token; Nest derives business
  authority lazily from its exact active-turn record, never from a descriptor.
- Office is Windows; macOS is the current implementation and local QA platform.
- Legacy Agent OS data is discarded in a clean two-model cutover.
- No background reasoning, generic Task lifecycle, compatibility layer, or
  multi-user enterprise policy is added.
