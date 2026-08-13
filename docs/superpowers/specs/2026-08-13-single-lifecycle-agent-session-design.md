# KID-25 Single-Lifecycle Agent Session Design

- Date: 2026-08-13
- Status: Approved replacement design; awaiting written-spec review
- Linear issue: KID-25
- Classification: AgentOS platform-boundary reconstruction
- Scope: CopilotKit thread lifecycle, AgentSession creation, execution
  authorization, policy, persistence, and interaction UX
- Declared cross-domain exception: the interaction plane may read
  organization-scoped projections and invoke policy-approved domain
  capabilities, while each business domain retains ownership of its facts and
  mutations

## 1. Decision

KidItem uses one conversation lifecycle.

Every conversation becomes an official `AgentSession` when its first message
is submitted. There is no lightweight pre-session conversation class, idle
expiry rotation, or later promotion into official work.

Opening the panel, browsing history, reconnecting, and preparing an empty new
conversation remain read-only. The first AG-UI run is the write boundary. It
creates the session control root and authorizes the first execution. A later
message appends an execution to the same session. Starting a new conversation
creates another session when that conversation receives its first message.

This design supersedes the dual-lifecycle and promotion decisions in:

- `2026-08-13-ai-chat-interactive-response-design.md`;
- `2026-08-13-interaction-platform-foundation.md`;
- `2026-08-13-quick-ask-vertical-slice.md`;
- `2026-08-13-agentos-official-session-runtime.md`; and
- `2026-08-13-interaction-os-cutover.md`.

Those documents must be reconciled or replaced before implementation is
considered complete. They are not alternate supported architectures.

## 2. Why The Lifecycle Is Unified

The earlier design used two conversation classes: a read-only conversational
thread without an `AgentSession`, followed by explicit promotion when durable
work was required. That split introduced a second binding lifecycle, an idle
TTL, deterministic pending thread identifiers, rotation locks, promotion
records, context-boundary transitions, and two sets of UI semantics.

The split does not provide enough product value to justify that control-plane
complexity. A session is a durable conversation control record, not a promise
that a mutation will occur. Read-only questions can safely live in a session
while capability policy continues to decide what the agent may do.

Unifying the lifecycle gives KidItem one answer to each core question:

- A CopilotKit thread is governed by one AgentSession after first submit.
- Every AG-UI execution belongs to a session and its root task.
- History and reconnect operate on the same identity used for execution.
- Mutation safety comes from capability policy and HITL, not from a separate
  conversation class.
- New-conversation behavior is explicit and never inferred from an idle clock.

## 3. Product Contract

### 3.1 Empty interaction surface

Opening the global panel or `/agent-os` may load:

- the server-authorized agent list;
- the default agent;
- recent accessible sessions;
- a selected existing session; and
- read-only connection state.

It must not create a thread binding, session, task, policy snapshot, execution,
Operations run, or transcript event.

An empty new-conversation composer may hold a CopilotKit-generated opaque
thread identifier in memory. That identifier is not an AgentOS resource until
the first run is authorized.

### 3.2 First submitted message

The first submitted message is the single lifecycle transition:

~~~text
unbound CopilotKit thread
  -> validate actor, organization, agent version, model, and policy
  -> create AgentSession
  -> create root AgentSessionTask
  -> create initial context epoch and policy snapshot
  -> create AgentExecution for the AG-UI run
  -> dispatch through the selected runtime
~~~

The control records are created in one transaction. The transcript remains in
CopilotKit Threads / Enterprise Intelligence.

### 3.3 Continued and new conversations

A later run carrying the same authorized thread identity appends a new
`AgentExecution` to the existing session. It does not create another session or
root task.

The user-facing “new conversation” action creates an empty CopilotKit thread.
It creates a new `AgentSession` only after the first message is sent. Existing
sessions remain available in history and can be resumed when their lifecycle
permits it.

There is no automatic thread replacement after an idle duration. Completing,
cancelling, archiving, restoring, or starting a new session is explicit.

### 3.4 Agent selection

The user may choose only from the server-authorized agent list before the first
message. Once a session exists, its primary agent version is immutable. Visible
delegation to another agent creates task/delegation records; it does not rewrite
the session's primary identity.

## 4. Source Of Truth

| Concern | Source of truth |
|---|---|
| Thread identity, messages, UI events, replay, reconnect | CopilotKit Threads / Enterprise Intelligence |
| Session ownership and lifecycle | `AgentSession` |
| Root and delegated work | `AgentSessionTask` and delegation records |
| Agent/model/capability selection | AgentOS version and policy records |
| Run authorization and audit | `AgentExecution`, policy snapshot, and usage records |
| Organization and actor identity | KidItem authentication and organization membership |
| Domain facts and mutations | Owning NestJS business domain |
| Generic durable run envelope | Operations |

KidItem does not persist user or assistant message bodies in its AgentOS
control tables. It may persist opaque correlation identifiers, hashes,
normalized task metadata, policy decisions, tool audit data, usage, and
artifacts required for safe execution.

## 5. Control Data Model

### 5.1 AgentSession is the thread authorization root

`AgentSession` directly owns the CopilotKit thread association. The separate
pre-session thread-binding lifecycle is removed.

The session minimally records:

- `id`;
- `organizationId`;
- `createdByUserId`;
- `copilotThreadId`;
- `primaryAgentVersionId`;
- the active authority/profile identity;
- current context epoch;
- lifecycle status; and
- created, updated, completed, and archived timestamps as applicable.

The database enforces organization-scoped thread uniqueness and composite
organization foreign keys. Repository reads and mutations always include
`organizationId`; user-owned session access additionally includes the derived
actor identity.

### 5.2 Every session has one root task

The first-run transaction creates exactly one root `AgentSessionTask`. The root
task is the control root for the conversation, not a copy of the first user
message.

Its initial state is `interpreting`. Its normalized objective may remain null
until the runtime derives structured work metadata. Raw prompt text is never
copied into the task objective merely to satisfy a non-null column. Durable
subtasks, delegation, approvals, artifacts, and Operations runs attach beneath
this root.

The schema and repository enforce one root task per session. A retry returns
the existing root rather than creating a duplicate.

### 5.3 Executions always belong to official control records

`AgentExecution.sessionId` and `AgentExecution.sessionTaskId` become non-null.
The first execution points to the root task. Later conversational runs may also
point to the root; durable delegated work points to its specific task.

Context epochs and policy snapshots reference the session rather than a
pre-session binding. Usage continues to reference the canonical execution and
model identity.

### 5.4 Removed concepts

The final production schema and contracts contain no:

- interaction-class discriminator;
- pre-session thread binding;
- idle expiry timestamp;
- one-active-lightweight-thread constraint;
- idle-rotation advisory lock;
- pending deterministic thread target; or
- conversation-promotion record or transition.

The existing `AgentSessionPromotion` proposal is removed. Approval records for
real capability execution remain; promotion is not an approval type.

## 6. API And Protocol Boundary

### 6.1 Bootstrap

`GET /api/agent-os/interaction/bootstrap` is read-only. Its response contains:

- the opaque principal needed by the interaction gateway;
- allowed active agent versions with exactly one default;
- recent accessible session summaries and their CopilotKit thread IDs; and
- optional selected-session connection metadata.

It does not return a pending lifecycle target, idle deadline, rotation state,
or conversation class.

### 6.2 Run authorization

Immediately before dispatch, the authenticated browser requests a signed run
intent from Nest using the CopilotKit thread ID, selected allowed agent, and
allowlisted dashboard context. Nest derives organization and actor identity,
validates the agent/model/runtime, and returns a canonical token that expires
after 30 seconds. Signing the intent is stateless and performs no database
write.

The AG-UI request carries that intent plus the CopilotKit thread ID and AG-UI
run ID. The interaction gateway authenticates to Nest with its dedicated
secret and submits the intent for authorization. Nest accepts identity only
from the verified intent and trusted gateway context, never from standalone
organization, user, model, policy, session, or capability fields in the
request DTO. The intent contains no idle or rotation semantics and is not a
second conversation lifecycle.

The run-authorization command has two paths under the same contract:

1. If the thread has no session, validate all prerequisites and atomically
   create the session, root task, epoch, policy snapshot, and execution.
2. If the thread has a session, validate organization, actor, lifecycle,
   primary agent, context, and policy before creating or reusing the execution.

The response contains only the trusted runtime inputs required to dispatch the
AG-UI run. Browser-provided organization IDs, user IDs, model IDs, policy IDs,
session IDs, and capability grants are ignored or rejected.

### 6.3 Connection authorization

Reconnect and replay use a separate read-only connection authorization path.
It may validate access to a session/thread and return connection material. It
must not create or reactivate a session, task, policy snapshot, execution, or
Operations run.

### 6.4 Session APIs

The official session list and detail APIs include every created conversation.
Explicit lifecycle commands cover stop-current-execution, cancel durable work,
archive, restore when allowed, and resume. None of these commands are inferred
from time spent idle.

## 7. Authorization And Mutation Safety

An official session is an audit and lifecycle boundary. It is not blanket
mutation authority.

- The selected immutable agent version provides an explicit model and runtime.
- The policy snapshot contains only server-resolved capability grants.
- Read capabilities may execute when policy permits.
- Business mutations, delegation, external side effects, and elevated data
  access continue to require the applicable policy checks and HITL approval.
- The browser, transcript, model, and CopilotKit metadata cannot grant a
  capability.
- Domain mutations continue to use organization-scoped NestJS services and
  their idempotency rules.

Removing promotion therefore removes a lifecycle ceremony, not a safety
boundary.

## 8. Transactions, Concurrency, And Idempotency

Before the first write, the server validates:

- active organization membership and actor access;
- the selected active agent definition/version pair;
- explicit model and runtime configuration;
- context DTO and safe dashboard context;
- thread/run identifier shape; and
- the applicable authority profile.

First-run creation takes a transaction-scoped lock derived from the full
organization, actor, and Copilot thread scope. Database uniqueness is the final
race guard.

The idempotency identity is the organization-scoped Copilot thread and AG-UI
run ID. An exact retry returns the same session, root task, policy snapshot, and
execution. Reusing the identity with different agent, context epoch, model,
policy, or ownership data returns a stable conflict. Unique-constraint errors
are translated and never exposed as raw Prisma errors.

A different run on an existing thread creates one new execution under the same
session. Concurrent first requests converge on one session and root task.

## 9. Failure And Lifecycle Semantics

- Missing model/runtime, inactive agent, invalid membership, or invalid context
  fails before any control record is written.
- A database error inside first-run creation rolls back the complete control
  graph.
- Runtime dispatch failure marks the execution `failed` with a stable error
  code. The session remains available for retry on the same thread.
- Stop interrupts only the current execution unless an explicit session/task
  cancellation command is issued.
- Reconnect failure never creates a replacement session.
- Thread ownership, organization, user, or primary-agent mismatch is rejected;
  it never silently forks or rebinds the session.
- Archive is explicit. An archived session is history-only until an authorized
  restore transition succeeds.

The UI must show a recoverable failure on the existing session instead of
quietly moving the user to a new conversation.

## 10. Interaction UX

The global purple action remains the single global AI entry. The panel and the
dedicated `/agent-os` workspace render the same CopilotKit thread.

The surface contains:

- agent selection before first submit;
- a new-conversation action;
- session-backed thread history;
- streaming, stop, retry, reconnect, and connection state;
- typed generative UI and suggested replies;
- explicit approvals for policy-gated capabilities; and
- a link to the session workspace after first-run creation.

There is no conversation-class badge, promotion card, expiry countdown, or
automatic rotation loading state. The selected primary agent locks after the
session is created.

## 11. Reconstruction And Data Decision

The dual-lifecycle implementation exists only on the unmerged KID-25 branch and
has not established a production data contract. The branch is reconstructed in
place through additive corrective commits; already shared commit history is not
rewritten.

No production backfill or durable data migration is required for the retired
branch-only models. The final compatible schema change uses the open release
train and records:

~~~text
Release decision: compatible db:push; no backfill; retired lifecycle was never deployed
~~~

Implementation order is contract-first:

1. Add replacement contract and persistence regression tests.
2. Observe failures against the dual-lifecycle implementation.
3. Replace shared contracts and the schema/repository surface.
4. Reconstruct server authorization and HTTP boundaries.
5. Rebuild the CopilotKit UI around session-backed threads.
6. Reconcile active architecture, plans, runbooks, and cutover documentation.
7. Remove superseded tests and implementation only after replacement gates
   protect the single lifecycle.

Generic work already implemented on the branch may be retained when it matches
this design, including opaque principals, gateway-secret validation, safe DTO
parsing, active agent-version lookup, deterministic policy snapshots,
organization fences, execution idempotency, and health probes.

## 12. Verification Contract

### 12.1 Contract and static gates

- Shared schemas expose no conversation-class discriminator.
- Production code, shared contracts, Prisma schema, and active implementation
  plans contain no retired lifecycle identifiers or idle-rotation behavior.
- A durable scanner protects those source scopes. The decision record may name
  retired concepts only to explain their removal.
- Root-barrel and shared-interface naming guards continue to pass.

### 12.2 Real PostgreSQL integration

Tests prove:

1. bootstrap, history, and reconnect perform zero writes;
2. first submit creates exactly one session, root task, context epoch, policy
   snapshot, and execution;
3. exact retry returns the same identifiers;
4. concurrent first requests converge on one control graph;
5. another run on the same thread adds only one execution;
6. a new thread creates a new session;
7. every execution has non-null session and task ownership;
8. cross-organization and cross-user references fail at repository and
   database boundaries;
9. dispatch failure and stop preserve the resumable session;
10. archive and restore are explicit; and
11. usage uses the execution's canonical model identity.

### 12.3 HTTP, UI, and runtime acceptance

Tests prove:

- DTO whitelisting and server-derived identity;
- gateway secret and user-session enforcement;
- stable non-200 error mapping;
- opening the panel creates no server control rows;
- the first message makes the session appear in history;
- reload and reconnect add no execution;
- new conversation plus first send creates a different session;
- retry remains on the same failed session;
- mutation requests still enter the required HITL flow; and
- no second KidItem transcript is written.

### 12.4 Required repository gates

At minimum, implementation completion requires:

- focused shared contract tests and shared build;
- focused real-PostgreSQL repository tests with isolated `db push`;
- focused NestJS service/controller/module tests;
- server and web builds;
- schema artifact sync, IDOR, tenant-scope, shared-import, convention, and
  retired-lifecycle scanners;
- `npx prisma generate`;
- the required `db:push` evidence; and
- successful Nest boot with `AgentOsModule` initialized.

## 13. Acceptance Criteria

The reconstruction is accepted when:

1. every sent conversation is represented by exactly one official
   `AgentSession`;
2. every execution belongs to a session and task;
3. opening or reconnecting never creates official work;
4. the first run is atomic, idempotent, and organization-scoped;
5. all mutation safety remains policy- and approval-driven;
6. no idle TTL, rotation, pending-target, or promotion lifecycle remains in
   production code or active plans;
7. CopilotKit remains the only transcript authority;
8. the same thread resumes in the panel and AgentOS workspace; and
9. all required local gates and independent reviews pass before PR handoff.
