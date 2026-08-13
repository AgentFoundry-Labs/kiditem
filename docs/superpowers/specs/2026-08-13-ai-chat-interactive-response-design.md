# KidItem CopilotKit-Native Interaction OS And AgentOS Design

- Date: 2026-08-13
- Status: Approved design direction; canonical rewrite awaiting review
- Classification: greenfield AgentOS platform reconstruction with a shared web
  interaction surface
- Scope: official AgentOS conversations, interactive responses, CopilotKit
  Threads and Enterprise Intelligence, AG-UI integration, durable execution,
  and runtime adapters
- Declared cross-domain exception: the interaction plane may read
  organization-scoped projections from multiple domains, but business domains
  retain ownership of facts and mutations

## 1. Decision

KidItem adopts **CopilotKit as its long-term Interaction OS** rather than using
it as a replaceable chat widget.

CopilotKit owns the user-facing AI interaction plane:

- React conversation UI;
- the global panel opened from the existing purple quick-action button;
- thread and message history;
- streaming, reconnect, replay, and concurrent thread coordination;
- generative UI, response cards, suggested replies, and action rendering;
- human-in-the-loop interaction;
- shared dashboard context;
- agent discovery and conversation entry;
- future web, mobile, and collaboration-channel presentation.

AgentOS becomes the control and reasoning plane behind that interaction:

- agent definitions and versions;
- organization and actor authority;
- capability and model policy;
- official session state;
- task decomposition and delegation;
- approval policy;
- cost, audit, and artifact ownership;
- durable execution coordination;
- runtime selection for Hermes, Codex, Claude, and future agents.

The Operations control plane continues to own generic schedules, run envelopes,
and engine dispatch. Business domains continue to own their facts and
mutations.

The canonical protocol between CopilotKit and AgentOS is **AG-UI**. The
canonical conversation store is **CopilotKit Threads backed by self-hosted
Enterprise Intelligence**. AgentOS does not keep a second transcript store.

This decision intentionally accepts a strong CopilotKit dependency in the
interaction plane. Cost and preservation of the current chat APIs are not
selection constraints.

## 2. Product Contract

The user sees one coherent AI system from anywhere in KidItem:

~~~text
Existing purple quick-action button
  -> AgentOS conversation action
  -> right-side CopilotKit panel
  -> select an allowed agent or use the default Operator
  -> start or resume a CopilotKit Thread
~~~

Every submitted conversation has one lifecycle:

~~~text
empty CopilotKit composer
  -> no AgentOS write
first submitted message
  -> one AgentSession and root AgentSessionTask
  -> one policy snapshot and AgentExecution
later message
  -> another execution in the same session
new conversation + first message
  -> another AgentSession
~~~

Opening the panel, viewing history, preparing an empty conversation, and
reconnecting remain read-only. A session is an audit and lifecycle boundary;
it does not grant blanket mutation authority. Capability policy and HITL remain
the safety boundary for delegation, business writes, and external side effects.

## 3. Goals

1. Make AI reachable from every KidItem screen without replacing the current
   purple floating entry point.
2. Let users ask fast, natural, multi-turn questions in an official session
   without a separate pre-session conversation class.
3. Keep the current dashboard visible while an AgentOS conversation runs.
4. Use CopilotKit's native thread, streaming, generative UI, shared state, and
   HITL capabilities instead of rebuilding them.
5. Give conversational reads and durable work the same interaction language
   while applying different capability policy where required.
6. Make every conversation resumable from either the global panel or a dedicated
   AgentOS workspace without duplicating the conversation.
7. Support local CLI agents and fully autonomous runtimes through stable
   adapters behind AgentOS.
8. Allow the interaction plane to evolve independently from business-domain
   services.

## 4. Non-Goals

- Preserving the existing /api/chat/copilot contract or another legacy chat
  API.
- Preserving the current chat transcript model or polling flow.
- Creating a second KidItem-specific conversation framework beside CopilotKit.
- Creating a separate lightweight conversation lifecycle, idle rotation, or
  promotion path before an official session.
- Letting CopilotKit become the authority for organization access, business
  mutations, idempotency, or domain policy.
- Letting a model emit arbitrary React components, URLs, API endpoints, or
  button safety styles.
- Adding a dedicated 더 자세히 or answer-expansion action. Users ask a
  follow-up or select a concrete suggested reply.
- Making every deterministic workflow an AgentOS run.

## 5. Why This Is The Maximum Practical CopilotKit Adoption

KidItem uses CopilotKit for every capability inside its intended interaction
scope while avoiding parallel implementations.

| CopilotKit capability | KidItem use |
|---|---|
| React v2 primitives | The global panel, official workspace conversation, thread history, composer, streaming state, and message utilities |
| Threads | Canonical conversation identity for every AgentSession |
| Enterprise Intelligence | Durable thread events, replay, reconnect, locking, inspection, and enterprise persistence |
| AG-UI | The only conversational event protocol between the interaction layer and AgentOS |
| Generative UI | Metrics, resource lists, comparisons, notices, progress, artifacts, and typed action cards |
| Human in the loop | Approval, clarification, retry, cancel, and user-editable task inputs |
| Shared state | Allowlisted route, selected resource, filter, and dashboard context |
| Multi-agent support | Agent discovery, initial agent selection, visible delegation, and handoff presentation |
| Headless/composable UI | The same thread experience in the global panel and dedicated AgentOS workspace |
| Channels | A later path to Slack, Teams, mobile, or other surfaces without changing AgentOS execution semantics |

“Maximum adoption” does not mean moving business authorization or durable
workflow correctness into a UI framework. Those rules remain server-owned so
the same AgentOS task is safe when started from CopilotKit, a schedule, a local
CLI, or another channel.

## 6. Target Architecture

~~~text
┌──────────────────────────────────────────────────────────────────────┐
│ KidItem Web                                                         │
│ existing purple FAB -> CopilotKit panel / AgentOS workspace         │
│ threads · messages · generative UI · shared state · HITL            │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ CopilotKit protocol
┌───────────────────────────────▼──────────────────────────────────────┐
│ CopilotKit Interaction Gateway                                     │
│ runtime · agent discovery · session authorization · auth bridge     │
└──────────────┬───────────────────────────────────┬───────────────────┘
               │                                   │
┌──────────────▼─────────────────┐   ┌─────────────▼──────────────────┐
│ Enterprise Intelligence        │   │ AG-UI AgentOS Gateway          │
│ Threads · events · replay      │   │ policy · context · run bridge  │
│ realtime · locks · inspection  │   └─────────────┬──────────────────┘
└────────────────────────────────┘                 │
                                      ┌────────────▼──────────────────┐
                                      │ AgentOS Control Plane         │
                                      │ agents · sessions · tasks     │
                                      │ authority · approval · audit  │
                                      └────────────┬──────────────────┘
                                                   │
                                      ┌────────────▼──────────────────┐
                                      │ Durable Execution             │
                                      │ Operations run envelope       │
                                      │ retries · resume · cancel     │
                                      └────────────┬──────────────────┘
                                                   │
                           ┌───────────────────────┼────────────────────┐
                           │                       │                    │
                    ┌──────▼──────┐       ┌────────▼───────┐   ┌──────▼──────┐
                    │ Hermes       │       │ Codex / Claude │   │ Remote agent │
                    │ adapter      │       │ CLI adapters   │   │ adapter      │
                    └──────┬───────┘       └────────┬───────┘   └──────┬──────┘
                           └───────────────────────┼────────────────────┘
                                                   │ scoped MCP/capabilities
                                      ┌────────────▼──────────────────┐
                                      │ NestJS domain services        │
                                      │ facts · deterministic actions │
                                      │ organization-scoped policy    │
                                      └───────────────────────────────┘
~~~

### 6.1 Interaction Gateway deployment

The CopilotKit Interaction Gateway is a separately owned platform deployment,
even if its first implementation shares a repository with KidItem.

- It is exposed through the same-origin KidItem ingress.
- It owns CopilotKit runtime integration and version isolation.
- It accepts only short-lived Nest-signed run intents derived from the current
  KidItem session and authenticates back to Nest with a dedicated service
  secret. Nest remains the organization and actor authority.
- It never connects directly to the KidItem business database.
- It reaches business data only through organization-scoped NestJS
  capabilities mediated by AgentOS.
- A dedicated deployment avoids coupling CopilotKit's runtime dependencies to
  NestJS's HTTP-adapter version.

Exact public endpoint paths follow the selected self-hosted CopilotKit runtime
contract. KidItem must not add a parallel message API beside that contract.

## 7. Source Of Truth And Ownership

| Data or behavior | Source of truth | Explicitly not the owner |
|---|---|---|
| Thread identity, messages, UI tool events, reconnect/replay history | CopilotKit Threads / Enterprise Intelligence | AgentOS database |
| Agent definition, version, prompt package, allowed capabilities | AgentOS | CopilotKit thread metadata |
| Organization and actor access | KidItem auth and AgentOS policy | Browser, model, CopilotKit message text |
| Session lifecycle and thread authorization | AgentOS AgentSession | CopilotKit metadata or browser state |
| Task objective, delegation, authority, approval, and artifact linkage | AgentOS | Chat transcript |
| Generic schedule, run envelope, and engine dispatch | Operations | CopilotKit |
| Runtime-native execution state | Runtime adapter plus Operations envelope | React UI |
| Domain facts and mutations | Owning NestJS domain | AgentOS transcript or CopilotKit state |
| Product analytics | Analytics pipeline | AgentOS audit log |

CopilotKit events and AgentOS audit records are correlated, not duplicated.
AgentOS may record hashes, identifiers, policy decisions, tool inputs and
outputs required for audit, but it does not reconstruct a second user-visible
message history.

## 8. Single Conversation Lifecycle

### 8.1 Empty interaction surface

Opening the panel or `/agent-os` may load the server-authorized agent list,
recent accessible sessions, a selected existing session, and read-only
connection state. It must not create a session, task, policy snapshot,
execution, Operations run, or transcript event.

An empty new-conversation composer may hold a CopilotKit-generated opaque
thread identifier in memory. That identifier is not an AgentOS resource until
the first run is authorized.

### 8.2 First submitted message

The first AG-UI run is the only transition from an empty conversation into
official AgentOS control state:

~~~text
unbound CopilotKit thread
  -> validate actor, organization, agent version, model, runtime, and policy
  -> create AgentSession
  -> create root AgentSessionTask
  -> create initial context epoch and policy snapshot
  -> create AgentExecution for the AG-UI run
  -> dispatch through the selected runtime
~~~

The control records are created in one transaction. The transcript remains in
CopilotKit Threads / Enterprise Intelligence.

### 8.3 Continued and new conversations

A later run carrying the same authorized thread identity appends one
`AgentExecution` to the existing session. It does not create another session or
root task.

The user-facing “new conversation” action creates an empty CopilotKit thread.
It creates a new `AgentSession` only after the first message is sent. Existing
sessions remain available in history and can be resumed when their lifecycle
permits it.

There is no automatic replacement after an idle duration. Completing,
cancelling, archiving, restoring, or starting a new session is explicit.

### 8.4 Session safety boundary

Every sent conversation is official, but official does not mean unrestricted.
The first session may answer a read-only question without creating an
Operations run. Delegation, business writes, external side effects, and
elevated data access still require the applicable capability policy and HITL
approval.

The same thread is rendered in the global panel and the dedicated AgentOS
workspace. Opening another surface does not copy or fork it.

## 9. Global Panel And Agent Selection

### 9.1 Entry point

KidItem does not add another floating CopilotKit button.

- The existing purple floating button remains the single global entry point.
- Its current three-action expansion remains the container.
- The AI/AgentOS action opens the CopilotKit panel.
- The other existing quick actions are outside this design and remain
  unchanged.

On desktop the panel opens from the right so the current dashboard remains
visible. On narrow screens it becomes a full-screen sheet while preserving the
same thread and components.

### 9.2 Panel states

The header shows:

- selected or primary agent;
- session lifecycle and current root-task state after first submit;
- thread history control;
- connection and execution state;
- open-in-AgentOS-workspace action after the session exists.

The body uses one CopilotKit conversation grammar. Session-backed state adds
task progress, approvals, artifacts, cancel/resume, and delegation events when
they exist.

### 9.3 Agent selection

The default conversational agent is **KidItem Operator**.

- The selector lists only AgentOS agents allowed for the current organization
  and actor.
- Selecting an agent before the first message chooses the immutable primary
  agent version for the session that will be created.
- Changing the selection on an empty composer creates no server state.
- A created session never silently changes its primary agent.
- A change inside an existing session is represented as an explicit AgentOS
  handoff or delegation; choosing another primary agent starts a new
  conversation.
- Agent selection is distinct from model selection. AgentOS resolves the
  model/runtime explicitly and a missing selection is an error.

## 10. Shared Dashboard Context

CopilotKit shared state supplies only allowlisted presentation context:

- route key;
- selected resource references;
- visible filter identifiers;
- selected table rows by canonical resource reference;
- organization-safe dashboard summary;
- locale and timezone.

It does not expose:

- database credentials;
- arbitrary DOM contents;
- hidden fields;
- unvalidated URLs;
- organization scope supplied by the browser;
- permission claims;
- raw secrets or tokens.

Context is advisory. AgentOS re-reads every business fact through the owning
domain before answering or acting.

## 11. Response And Button Model

KidItem uses CopilotKit generative UI and registered renderers instead of a
custom generic AiChatResponseV1 transport.

The interaction vocabulary is intentionally small:

1. assistant text;
2. citations, freshness, and data-gap notices;
3. metric groups;
4. resource lists;
5. compact comparisons;
6. progress and artifact cards;
7. suggested replies;
8. verified navigation;
9. official approval and clarification cards.

### 11.1 Rendering contract

- AgentOS emits validated AG-UI events and typed tool results.
- The web app maps allowlisted tool/result schemas to registered CopilotKit
  components.
- The model may propose content and resource references returned by tools.
- The model cannot name a component, choose arbitrary styling, mint an action
  ID, or supply a raw route.
- The server derives action availability, emphasis, expiry, and disabled
  reason.
- Every response remains understandable as text without clicking a control.

### 11.2 Suggested replies

A suggested reply is single-use conversational input.

- Clicking creates a visible user turn.
- It is available only on the latest eligible assistant response.
- Any selected or free-form reply consumes its siblings.
- At most three are displayed.
- It cannot invoke a hidden elevated capability.

Examples:

- 쿠팡 주문만 보기
- 지연 원인 묻기
- 상품별로 비교하기

### 11.3 Navigation

A navigation action carries a canonical resource reference and route key, not a
raw URL.

- Click-time authorization is revalidated.
- Navigation does not create an agent run.
- A stale or inaccessible target is disabled with a visible reason.
- It never mutates business data.

### 11.4 Session creation and approval

- The first submitted message creates the session automatically; there is no
  promotion card or second confirmation ceremony.
- Session creation uses the first AG-UI run's stable idempotency identity.
- Approval cards appear only when a policy-gated capability requires a
  decision.
- Starting a session is not approval for a later purchase, listing,
  advertising, payment, or other side effect.

### 11.5 Message utilities

Copy, feedback, retry, and stop are client-owned CopilotKit utilities. They are
not model-authored business actions.

## 12. AgentOS Control Model

The target control schema contains references rather than copied transcripts.
Names are conceptual until the schema implementation plan is approved.

~~~typescript
interface AgentSession {
  id: string;
  organizationId: string;
  copilotThreadId: string;
  primaryAgentVersionId: string;
  authorityProfileVersionId: string;
  contextEpoch: number;
  status: 'active' | 'completed' | 'cancelled' | 'archived';
  createdByUserId: string;
}

interface AgentSessionTask {
  id: string;
  sessionId: string;
  parentTaskId: string | null;
  assignedAgentVersionId: string;
  objective: string | null;
  isRoot: boolean;
  operationsRunId: string | null;
  status: string;
}

interface AgentExecution {
  id: string;
  organizationId: string;
  copilotThreadId: string;
  sessionId: string;
  sessionTaskId: string;
  aguiRunId: string;
  runtimeType: string;
  modelIdentity: string;
  policySnapshotId: string;
  attempt: number;
  status: string;
}
~~~

Additional control records cover:

- AgentDefinition and immutable AgentVersion;
- AuthorityProfile and capability grants;
- context epochs and immutable policy snapshots;
- approval requests and decisions;
- artifact metadata and storage references;
- token and cost ledger entries;
- policy decisions;
- runtime attempts;
- audit events.

The first-run transaction creates exactly one root task in `interpreting`
state. Its objective remains null until the runtime derives normalized work
metadata; KidItem does not copy the first message into a task field. Database
and repository invariants enforce one root task per session.

`AgentSession` directly owns the organization-scoped CopilotKit thread
association. There is no separate pre-session binding. Context epochs and
policy snapshots reference the session, and every execution has non-null
session and task ownership.

copilotThreadId, aguiRunId, sessionId, sessionTaskId, and executionId form the
cross-plane correlation set.

## 13. AG-UI AgentOS Gateway

AgentOS is implemented as an AG-UI-compatible agent backend.

The gateway owns:

- authenticated thread-to-session authorization;
- agent discovery projection;
- explicit model and runtime resolution;
- authority profile selection;
- allowlisted dashboard context normalization;
- conversion between AG-UI runs and AgentOS executions;
- tool-call policy and organization scoping;
- HITL interruption and resume mapping;
- cancellation propagation;
- runtime event normalization;
- terminal-state reconciliation.

All runtime output is normalized into AG-UI events before reaching CopilotKit.
The browser never consumes Hermes-, Codex-, Claude-, or provider-specific
streams.

Immediately before dispatch, the authenticated browser requests a signed run
intent from Nest using the CopilotKit thread ID, prospective AG-UI run ID,
selected allowed agent, and allowlisted dashboard context. Nest derives
organization and actor identity, validates the agent, model, runtime, and
policy, and returns a canonical token that expires after 30 seconds. Signing
the intent is stateless and performs no database write.

The AG-UI request carries that intent with its thread and run IDs. The
Interaction Gateway authenticates to Nest with a dedicated secret. Nest accepts
identity only from the verified intent and trusted gateway context, never from
standalone organization, user, model, policy, session, or capability fields in
the request DTO.

Run authorization follows one command contract:

1. A thread without a session atomically creates the session, root task,
   context epoch, policy snapshot, and execution.
2. A thread with a session validates organization, actor, lifecycle, primary
   agent, context, and policy before creating or reusing the execution.

First-run creation takes a transaction-scoped lock derived from organization,
actor, and Copilot thread. The organization-scoped thread and AG-UI run ID are
the idempotency identity. Exact retries return the same control graph;
mismatched reuse returns a stable conflict rather than a raw database error.

Reconnect and replay use a separate read-only connection authorization path.
They must not create or reactivate a session, task, policy snapshot, execution,
or Operations run.

Failure semantics are explicit:

- Missing model/runtime, inactive agent, invalid membership, or invalid context
  fails before any control record is written.
- A database error inside first-run creation rolls back the complete control
  graph.
- Runtime dispatch failure marks only the execution `failed` with a stable
  error code; the session remains available for retry on the same thread.
- Stop interrupts only the current execution unless an explicit task or
  session cancellation command is issued.
- Ownership, organization, primary-agent, or lifecycle mismatch is rejected;
  it never silently forks or rebinds a session.
- Archive is explicit. An archived session is history-only until an authorized
  restore transition succeeds.

The gateway must preserve AG-UI semantics for:

- run identity;
- ordered events;
- idempotent reconnect;
- partial text and tool output;
- interrupt/resume;
- stop/cancel;
- terminal success and failure;
- duplicate-event rejection.

## 14. Durable Execution

Official AgentOS tasks may outlive a browser connection or server process.

- AgentOS owns goal, authority, task, delegation, and approval state.
- Operations owns the generic run envelope, scheduling, engine dispatch, and
  cancellation contract.
- A durable workflow implementation persists checkpoints and resumes after
  worker failure.
- CopilotKit receives progress and interrupts through AG-UI and can reconnect
  to the same run.
- A closed panel does not cancel work.
- Stopping an interactive run ends only its current execution.
- Cancellation of an official task propagates through AgentOS, Operations, and
  the runtime adapter.

The workflow engine is selected for durable semantics, not UI integration.
AgentOS adapters keep the workflow choice invisible to CopilotKit.

## 15. Runtime Adapter Contract

Hermes, Codex, Claude, local CLIs, and remote agents are execution adapters,
not separate conversation systems.

Each adapter implements:

~~~typescript
interface AgentRuntimeAdapter {
  start(input: RuntimeStartInput): Promise<RuntimeHandle>;
  connect(handle: RuntimeHandle): AsyncIterable<NormalizedRuntimeEvent>;
  interrupt(handle: RuntimeHandle, decision: RuntimeDecision): Promise<void>;
  cancel(handle: RuntimeHandle): Promise<void>;
  inspect(handle: RuntimeHandle): Promise<RuntimeStatus>;
}
~~~

The execution layer translates NormalizedRuntimeEvent into AG-UI.

### 15.1 Hermes

- Prefer Hermes HTTP runs for detached server automation.
- Use the TUI gateway or ACP adapter when richer interactive semantics are
  required.
- Supply only a run-scoped KidItem MCP configuration.
- Use an isolated home/config directory and credentials per run.
- Map Hermes approval requests to AgentOS approval records and CopilotKit HITL.
- Never use --yolo or an approval-off mode in KidItem.

### 15.2 Local CLI runtimes

- Run in an isolated worker or sandbox, never in the web process.
- Persist a runtime handle so Operations can reconnect after process failure.
- Route all business tools through organization-scoped AgentOS capabilities.
- Stream normalized events through the same AG-UI gateway as remote agents.
- Apply the same authority, approval, cost, and audit policy as server agents.

Within an approved authority profile, an adapter may run fully autonomously.
CopilotKit remains the observation and interruption surface; it does not need
to keep a browser connection open.

## 16. Security Boundary

- The browser never supplies trusted organizationId, actor scope, or
  authority.
- Nest derives identity from the current KidItem session, signs the run intent,
  and verifies it again when the service-authenticated gateway authorizes the
  run.
- CopilotKit thread ownership is not proof of business authorization.
- Session creation does not grant mutation authority; every capability comes
  from the server-resolved policy snapshot.
- Every resource access uses organization-scoped domain services.
- Every mutation is reauthorized at execution time.
- Approval is bound to task, capability, arguments, resource versions, actor,
  and expiry.
- Model text cannot grant authority or prove an action completed.
- Tool and runtime output is untrusted until validated.
- External content is treated as data, never policy instructions.
- Runtime credentials are short-lived and capability-scoped.
- Thread metadata cannot override AgentOS policy.

## 17. Enterprise Intelligence Deployment

Self-hosted CopilotKit Enterprise Intelligence is the target from the first
production release.

The platform deployment includes:

- a supported Kubernetes cluster;
- highly available PostgreSQL for CopilotKit thread/event persistence;
- highly available Redis for realtime coordination and locks;
- KidItem OIDC integration;
- encryption in transit and at rest;
- backup, restore, and disaster-recovery tests;
- organization-aware retention and deletion;
- regional and data-residency policy;
- metrics, traces, logs, and alerting;
- capacity and reconnect testing.

CopilotKit data stores are isolated from KidItem's business database. They may
store conversation content and CopilotKit event state, but they never become a
business-data read path.

Vendor telemetry is disabled in self-hosted production unless explicitly
approved. KidItem emits its own observability with the cross-plane correlation
IDs.

## 18. Dependency And Repository Policy

Production dependencies are limited to canonical maintained surfaces:

- [CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) for the
  React/runtime packages;
- [AgentFoundry-Labs/CopilotKit](https://github.com/AgentFoundry-Labs/CopilotKit)
  as the verified public MIT source lineage and self-hosting evidence fork;
- [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui) for protocol
  contracts;
- [CopilotKit/aimock](https://github.com/CopilotKit/aimock) as a test and chaos
  reference/tool where useful.

Demo, example, archived, and experimental repositories are research inputs, not
runtime dependencies. Channels SDK and OpenTag are evaluated only when their
corresponding rollout begins.

Management rules:

- Pin all CopilotKit workspace packages to one exact version.
- Pin AG-UI explicitly and upgrade it through the same compatibility train.
- Do not mix independent CopilotKit minor versions.
- Maintain a weekly upstream review and a scheduled compatibility canary.
- Read release notes and diff protocol/schema changes before upgrade.
- Run thread reconnect, HITL, duplicate-tool-call, and runtime cancellation
  tests against every candidate.
- Keep an SBOM, package/license snapshot, and internal architecture decision
  record for every production release.
- Do not maintain a permanent fork by default; use a short patch queue only
  when an upstream fix cannot land before KidItem's release.
- Implementation and contract verification use the public packages, public
  source, registry metadata, and no-cost Developer path. They require no paid
  Team or Enterprise purchase and do not provision an external service.
- Production self-hosting remains a later deployment acceptance gate. If the
  released artifact, license, or target topology requires a contract or cost,
  stop and obtain explicit owner approval before purchase or provisioning.

## 19. APIs To Keep And Remove

### 19.1 Canonical surfaces

- CopilotKit runtime and thread endpoints for conversation discovery, connect,
  run, stop, resume, stream, and history.
- AG-UI agent endpoint from CopilotKit to AgentOS.
- AgentOS control endpoints for agents, policies, sessions, tasks, approvals,
  artifacts, and audit.
- NestJS domain capability endpoints/ports for scoped facts and mutations.
- Operations endpoints/ports for run envelopes and engine dispatch.

### 19.2 Removed target concepts

- a KidItem-specific generic chat message API;
- duplicate transcript tables;
- a pre-session conversation class or interaction-class discriminator;
- idle expiry, automatic thread rotation, and deterministic pending targets;
- a conversation-promotion ledger or transition;
- a separate thread-binding control root beside `AgentSession`;
- polling-based chat completion;
- frontend calls to individual model/CLI runtimes;
- separate AgentOS and AI Chat message renderers;
- a custom response envelope that duplicates AG-UI events;
- direct business-data access from CopilotKit;
- a compatibility Chatbot agent identity that diverges from Operator.

Legacy components may exist during cutover only. No new feature is added to
them, and no permanent dual write is allowed.

## 20. Delivery Plan

The retired dual-lifecycle implementation exists only on the unmerged KID-25
branch and has not established a production data contract. Reconstruct it in
place through additive corrective commits; do not rewrite already shared
history. No production backfill or durable migration is required for the
branch-only models.

The schema decision for this reconstruction is:

~~~text
Release decision: compatible db:push; no backfill; retired lifecycle was never deployed
~~~

Add replacement contracts and regression gates before deleting superseded
code. Generic completed work may be retained when it matches this design,
including opaque principals, gateway-secret validation, safe DTO parsing,
active agent-version lookup, deterministic policy snapshots, organization
fences, execution idempotency, and health probes.

### Phase 0 — contract and platform proof

- Verify the public fork, public package train, chart metadata, and no-cost
  Developer path without procurement or external provisioning.
- Snapshot package licenses and resolve documentation/package discrepancies
  before production approval.
- Prove OIDC, organization binding, Threads, reconnect, replay, locking, HITL,
  and AG-UI conformance in an isolated environment.
- Prove a dedicated Interaction Gateway deployment through KidItem ingress.
- Load-test long streams, reconnect storms, and concurrent thread ownership.
- Record the supported-version matrix for CopilotKit, AG-UI, React, Node,
  PostgreSQL, Redis, and Kubernetes.

Exit: the platform can retain and resume a thread without KidItem legacy chat
storage.

### Phase 1 — CopilotKit interaction foundation

- Install one exact CopilotKit v2 package train.
- Deploy Enterprise Intelligence.
- Build the Interaction Gateway.
- Implement the AG-UI AgentOS gateway with a minimal policy-safe Operator.
- Replace any CopilotKit-owned floating trigger with the existing purple
  quick-action entry.
- Render the same thread in a right-side panel and a dedicated AgentOS test
  workspace.
- Add allowlisted shared dashboard context.

Exit: a user can open, close, reload, and resume a streamed CopilotKit thread
while keeping the dashboard visible.

### Phase 2 — single-lifecycle session vertical slice

- Add agent discovery and pre-submit selection with Operator as default.
- Add the stateless 30-second run intent.
- Atomically create `AgentSession`, its root task, the initial context epoch,
  policy snapshot, and execution on the first AG-UI run.
- Add read-only organization-scoped capability access without granting
  mutation authority merely because the session exists.
- Register text, citation, notice, metric, resource, comparison, suggestion,
  and navigation renderers.
- Add model, cost, policy, execution, and product analytics without storing
  message text.

Exit: panel open and reconnect write nothing; the first submitted message
creates exactly one resumable official session.

### Phase 3 — policy-gated durable work and HITL

- Add task decomposition, delegation, and Operations dispatch beneath the root
  session task.
- Add approval, artifact, progress, cancel, restore, and resume cards.
- Keep mutations and external side effects behind capability policy and HITL.
- Render the same session thread in the global panel and AgentOS workspace.
- Add explicit new-session behavior where a clean authority boundary is
  required.

Exit: every sent conversation has one canonical session and all elevated work
retains explicit policy and approval boundaries.

### Phase 4 — durable runtimes

- Connect AgentOS tasks to Operations-owned run envelopes.
- Add durable checkpoint, retry, reconnect, cancel, and terminal-state
  reconciliation.
- Implement Hermes HTTP and interactive gateway adapters.
- Implement isolated Codex/Claude/local CLI adapters.
- Add run-scoped MCP and approval mapping.
- Verify autonomous execution continues after the panel and browser close.

Exit: local and remote agents use the same AgentOS policy and AG-UI interaction
path.

### Phase 5 — cutover and deletion

- Add contract scanners that detect new legacy chat API or transcript-store
  use.
- Cut the global entry and AgentOS workspace to CopilotKit.
- Migrate only official records with continuing business value; do not preserve
  obsolete transient chats merely for compatibility.
- Remove legacy chat APIs, polling, duplicate stores, renderers, and the
  divergent Chatbot identity.
- Update docs/ARCHITECTURE.md, environment documentation, deployment contracts,
  and ownership maps in the same implementation train.
- Run reconstruction and release-contract guards before deletion.

Exit: no production conversational path bypasses CopilotKit or AG-UI.

### Phase 6 — additional channels

- Evaluate CopilotKit Channels for Slack, Teams, mobile, and notifications.
- Reuse the same thread, AgentOS policy, HITL, and runtime contracts.
- Define channel-specific authority and privacy rules before enabling actions.

## 21. Verification Strategy

### CopilotKit and thread tests

- opening an empty composer, history, and reconnect perform zero AgentOS writes;
- first submit creates one session/root-task/policy/execution control graph;
- create, resume, archive, restore, and reconnect session-backed threads;
- recover after Interaction Gateway and browser restarts;
- reject duplicate/out-of-order events;
- enforce thread ownership and organization binding;
- verify concurrent-tab locking and replay;
- verify the same session thread in the panel and workspace;
- verify package-version canaries before upgrade.

### Control persistence tests

- run against isolated real PostgreSQL after a clean schema push;
- prove first submit creates exactly one session, root task, context epoch,
  policy snapshot, and execution;
- prove exact retry returns the same identifiers and mismatched reuse conflicts;
- prove concurrent first requests converge on one control graph;
- prove a later run adds only an execution and a new thread adds a new session;
- enforce non-null execution session/task ownership;
- reject cross-organization and cross-user references at repository and
  database boundaries; and
- derive usage from the execution's canonical model identity.

### AG-UI conformance tests

- ordered text and tool streaming;
- stable run identity across reconnect;
- interrupt, resume, stop, and cancel;
- terminal success/failure reconciliation;
- no duplicate tool call after retry;
- adapter failure normalized without provider-specific browser code.

### Product interaction tests

- the existing purple button remains the only global floating entry;
- selecting an agent before first submit creates no server state and binds the
  correct immutable AgentOS identity on submit;
- suggested replies create exactly one visible user turn;
- navigation validates the exact resource without creating an agent task;
- session creation never approves a downstream mutation or delegation;
- policy-gated actions render explicit HITL;
- panel close does not stop durable work;
- new conversation plus first submit creates a different session;
- no dedicated answer-expansion button is rendered.

### Authorization tests

- cross-organization threads, resources, and actions fail closed;
- browser-supplied scope and authority are ignored or rejected;
- stale approval cards and run intents cannot be replayed;
- thread metadata cannot broaden capability policy;
- model text cannot trigger a business mutation;
- runtime adapters receive only run-scoped tools and credentials.

### Durability and operations tests

- worker/process failure resumes from a persisted checkpoint;
- long-running Hermes/local CLI work survives browser disconnect;
- cancellation propagates through every layer;
- retries preserve idempotency;
- artifacts remain addressable after runtime teardown;
- restore tests correlate thread, session, task, execution, and Operations run.

### Implementation gates

Each implementation slice runs focused tests first and then inherits the
applicable repository gates:

- shared contracts and schema: focused tests,
  `npm run build --workspace=packages/shared`, `npm run db:push`, and
  `npx prisma generate`;
- backend or gateway integration: focused real-PostgreSQL and Nest tests plus
  `npm run dev:server` with confirmed `AgentOsModule` boot;
- frontend: `npm run build --workspace=apps/web`;
- organization-sensitive endpoints: `npm run check:idor` and
  `npm run check:tenant-scope`;
- static ownership: schema-artifact, shared-import, convention, and retired
  lifecycle scanners; and
- architecture cutover: reconstruction and release-contract guards against the
  intended base.

## 22. Acceptance Criteria

- CopilotKit is the canonical UI, thread, message, stream, reconnect,
  generative-UI, and HITL framework for KidItem AI.
- Enterprise Intelligence is the canonical conversation/event store.
- AG-UI is the only CopilotKit-to-AgentOS conversational protocol.
- AgentOS contains no duplicate user-visible transcript store.
- The existing purple floating button is the only global AI entry.
- The dashboard remains visible beside desktop conversations.
- Users can select an allowed agent, with Operator as the default.
- Opening, history, empty new conversation, and reconnect create no AgentOS
  control records.
- The first submitted message atomically and idempotently creates one
  `AgentSession`, one root task, one context epoch, one policy snapshot, and one
  execution.
- Every execution has non-null session and task ownership.
- A later run appends to the same session; a submitted new conversation creates
  a different session.
- Session creation does not grant mutation authority; capability policy and
  HITL remain mandatory where applicable.
- No interaction-class, idle-rotation, pending-target, or conversation-promotion
  lifecycle remains.
- The same session thread renders in the global panel and AgentOS workspace.
- Generative UI buttons are typed, allowlisted, authorized, and stale-safe.
- There is no dedicated answer-expansion action.
- Hermes, Codex, Claude, and local CLI runtimes integrate through AgentOS
  adapters and emit normalized AG-UI events.
- Durable work survives browser and worker restarts and supports resume,
  approval, retry, and cancel.
- Business authorization, domain facts, and mutations remain outside
  CopilotKit.
- Legacy chat APIs, polling, duplicate storage, and divergent renderers are
  removed after guarded cutover.
- CopilotKit and AG-UI upgrades are exact-pinned, canaried, observable, and
  recoverable.

## 23. Rejected Alternatives

### CopilotKit as a chat widget only

Rejected because KidItem would continue maintaining its own threads, message
protocol, reconnect logic, cards, and HITL while receiving only a small part of
CopilotKit's value.

### A KidItem-specific conversation API beside CopilotKit

Rejected because it creates two sources of truth and makes replay,
idempotency, and upgrades harder.

### A pre-session thread followed by official-session promotion

Rejected because it duplicates binding, TTL, rotation, locking, policy
transition, persistence, and UI semantics. A session is a control and audit
record, not implicit mutation authority; policy and HITL provide the actual
safety boundary.

### AgentOS business authority stored in CopilotKit

Rejected because CopilotKit threads can be entered through several surfaces,
whereas organization scope, mutation policy, approval, and idempotency must be
enforced consistently at execution time.

### Separate lightweight and durable conversation experiences

Rejected because it forces users to learn two interaction grammars and makes
durable work feel like leaving the current conversation.

### Preserving legacy APIs as a design constraint

Rejected. The target is built independently, cut over behind contract guards,
and obsolete paths are deleted.
