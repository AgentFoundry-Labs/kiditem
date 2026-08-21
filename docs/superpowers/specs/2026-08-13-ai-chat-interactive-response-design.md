# KidItem CopilotKit-Native Interaction OS And AgentOS Design

- Date: 2026-08-13
- Last amended: 2026-08-21 — hexagonal capability/Operation boundary,
  canonical identifier system, and AgentOS lane-first/capability-second
  directory, transaction, and composition-module contracts
- Status: Approved canonical design
- Classification: greenfield AgentOS platform reconstruction with a shared web
  interaction surface
- Scope: official AgentOS conversations, interactive responses, CopilotKit OSS
  and AG-UI integration, KidItem-owned conversation persistence, durable
  execution, and runtime adapters
- Declared cross-domain exception: the interaction plane may read
  organization-scoped projections from multiple domains, but business domains
  retain ownership of facts and mutations

## 1. Decision

KidItem adopts **CopilotKit as its long-term Interaction OS** rather than using
it as a replaceable chat widget.

CopilotKit OSS owns the user-facing AI interaction framework:

- React conversation UI;
- the global panel opened from the existing purple quick-action button;
- chat composition, streaming presentation, and client-side run state;
- rendering of KidItem-owned history, reconnect, and replay data;
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
- canonical thread, message, activity, and replay persistence;
- runtime selection for Hermes, Codex, Claude, and future agents.

The Operations control plane continues to own generic schedules, run envelopes,
and engine dispatch. Business domains continue to own their facts and
mutations. Agent capabilities are incoming adapters to those owner-domain use
cases; Operations handlers call owner input ports and never use the capability
registry as a business API. Deterministic work needs no conversation, while
LLM judgment always uses an official AgentSession execution.

KidItem also adopts one explicit identifier system: native UUID storage keys,
branded application IDs, hierarchical canonical resource names at public and
cross-domain boundaries, and separate external/request/idempotency/sequence/
token/digest identities. Existing UUID rows remain valid and are not rekeyed.

The canonical protocol between CopilotKit and AgentOS is **AG-UI**. The
canonical conversation store is **KidItem AgentOS backed by PostgreSQL**.
CopilotKit Enterprise Intelligence, Rich Threads, hosted projects, and the
Enterprise chart are not KID-25 dependencies.

This decision intentionally accepts a strong CopilotKit dependency in the
interaction plane while keeping production state in KidItem. The amount of
KidItem code that must be rewritten is not a selection constraint. That does
not authorize a Premium or Enterprise CopilotKit dependency: the selected
product boundary is the OSS-distributed framework/SDK plus AG-UI.

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
4. Use CopilotKit's native streaming, generative UI, shared state, and HITL
   interaction primitives instead of rebuilding the presentation layer.
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
- Depending on CopilotKit Enterprise Intelligence, Rich Threads, hosted
  projects, Premium APIs, or the Enterprise Helm chart.
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
| React v2 primitives | The global panel, official workspace conversation, KidItem-backed history, composer, streaming state, and message utilities |
| Client thread/run identity | Stable opaque IDs carried through AG-UI and mapped to every AgentSession and AgentExecution |
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
KidItem Web
  existing purple FAB
    -> CopilotKit OSS UI / AG-UI client
       chat · generative UI · shared state · HITL · history projection
             |
             | same-origin CopilotKit runtime protocol
             v
CopilotKit OSS Interaction Gateway
  stateless protocol edge · agent discovery · auth bridge
             |
             | AG-UI
             v
AgentOS Control Plane
  agents · sessions · tasks · policy · conversation events · replay cursor
       |                         |
       |                         +--> PostgreSQL
       |                              control · events · projections · outbox
       |
       +--> Agent capability incoming adapter
       |       |
       |       v
       |    Owning-domain input port --> domain policy and facts
       |                                 |              |
       |                                 | synchronous  | durable request
       |                                 v              v
       |                              result        Operations
       |
       +--> AgentOS durable task request --> Operations
                                               |
                                               v
                                  AgentOS task-execution input port
                                               |
                                               +--> Hermes adapter
                                               +--> isolated CLI adapter
                                               +--> remote agent adapter
~~~

`Capability` and `Operation` are not competing execution abstractions. A
capability is an AgentOS-facing incoming adapter to an owning-domain use case.
An operation is a durable control resource for scheduling, leasing,
checkpointing, retry, cancellation, and result reconciliation. An Operations
handler invokes the owning use-case input port; it never routes a business
command back through `AgentCapabilityRegistry`. AgentOS's own durable task
operation may resume the AgentOS task-execution use case, but the operation
handler itself does not become an Agent or dispatch arbitrary capabilities.

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

The gateway exposes the exact same-origin endpoint required by the locked OSS
CopilotKit runtime and translates only AG-UI. KidItem history/lifecycle APIs
are server-owned projections behind the same interaction surface; they do not
introduce a second browser-to-agent message protocol.

## 7. Source Of Truth And Ownership

| Data or behavior | Source of truth | Explicitly not the owner |
|---|---|---|
| Thread identity and lifecycle | AgentOS `AgentSession` | Browser state or a CopilotKit service |
| Messages, UI activity, state snapshots, and replay cursor | AgentOS versioned conversation event log | CopilotKit service or a legacy transcript table |
| Agent definition, version, prompt package, allowed capabilities | AgentOS | CopilotKit thread metadata |
| Organization and actor access | KidItem auth and AgentOS policy | Browser, model, CopilotKit message text |
| Session lifecycle and thread authorization | AgentOS AgentSession | CopilotKit metadata or browser state |
| Task objective, delegation, authority, approval, and artifact linkage | AgentOS | Chat transcript |
| Generic schedule, run envelope, and engine dispatch | Operations | CopilotKit OSS |
| Business use case and capability contract | Owning NestJS domain | AgentOS or Operations |
| Agent-facing capability registration | Owning-domain incoming adapter plus AgentOS registry | Operations worker |
| Runtime-native execution state | Runtime adapter plus Operations envelope | React UI |
| Domain facts and mutations | Owning NestJS domain | AgentOS transcript or CopilotKit state |
| Product analytics | Analytics pipeline | AgentOS audit log |

The AgentOS conversation event log is the one user-visible history store.
Audit records remain a separate, purpose-limited projection containing hashes,
identifiers, policy decisions, and tool evidence; they do not copy message
history. CopilotKit OSS renders and emits the canonical KidItem records but is
not another store.

### 7.1 Identifier And Resource-Name System

KidItem does not use one undifferentiated UUID string for every identity. The
identity contract separates storage, logical, public, correlation, ordering,
and security concerns:

| Kind | Contract | Example / rule |
|---|---|---|
| Storage key | Native PostgreSQL UUID, private to the owning persistence adapter | Prisma keeps `String @default(uuid()) @db.Uuid`; UUID generation is not an API promise |
| Logical ID | Zod-branded value owned by one domain | `AgentSessionId`, `OperationRunId`; parse at adapter boundaries and never use unchecked casts |
| Canonical resource name | Stable hierarchical cross-boundary reference | `organizations/{organization}/agentSessions/{session}` |
| Human-stable key | Namespaced code-owned identifier | Agent definition, capability, operation, and policy keys |
| External protocol ID | Opaque value owned by another protocol | `copilotThreadId`, `aguiRunId`, `toolCallId`; never parse as a KidItem ID |
| Request ID | Transport correlation only | UUIDv4 `requestId`; never reuse as a resource ID or idempotency key |
| Idempotency key | Command identity scoped by owner and operation | Canonical digest or caller key plus explicit scope; not validated as a UUID |
| Sequence | Server-assigned aggregate order | PostgreSQL `bigint`, decimal string on the wire; UUID/timestamp order is never canonical event order |
| Token | Short-lived bearer proof | High-entropy opaque value; persist only a digest/reference when required |
| Digest | Immutable content or policy identity | SHA-256 canonical hash; never treat as a resource ID |

Canonical resource names follow Google [AIP-122](https://google.aip.dev/122),
with resource types documented according to
[AIP-123](https://google.aip.dev/123). They are identifiers, not URLs, and
contain neither `/api` nor an API version. Initial patterns are:

| Resource type | Canonical name pattern |
|---|---|
| `iam.kiditem.com/Organization` | `organizations/{organization}` |
| `iam.kiditem.com/User` | `users/{user}` |
| `agentos.kiditem.com/AgentDefinition` | `agentDefinitions/{agentDefinitionKey}` |
| `agentos.kiditem.com/AgentVersion` | `agentDefinitions/{agentDefinitionKey}/versions/{version}` |
| `agentos.kiditem.com/AgentSession` | `organizations/{organization}/agentSessions/{session}` |
| `agentos.kiditem.com/AgentSessionTask` | `organizations/{organization}/agentSessions/{session}/tasks/{task}` |
| `agentos.kiditem.com/AgentExecution` | `organizations/{organization}/agentSessions/{session}/executions/{execution}` |
| `agentos.kiditem.com/AgentExecutionAttempt` | `organizations/{organization}/agentSessions/{session}/executions/{execution}/attempts/{attempt}` |
| `agentos.kiditem.com/AgentConversationEvent` | `organizations/{organization}/agentSessions/{session}/events/{sequence}` |
| `operations.kiditem.com/OperationRun` | `organizations/{organization}/operations/{operation}` |
| `operations.kiditem.com/OperationCheckpoint` | `organizations/{organization}/operations/{operation}/checkpoints/{sequence}` |

The database does not store a redundant `name` column. Owner projections build
names from branded IDs and parent scope; incoming adapters parse the expected
pattern and then reauthorize organization and parent-child relationships.
Possessing a syntactically valid resource name grants no access. Resource IDs
remain server-generated unless a create contract explicitly supports a
caller-chosen stable ID as described by [AIP-133](https://google.aip.dev/133).
Request identification follows [AIP-155](https://google.aip.dev/155), and an
Operation remains a named long-running resource with metadata plus exactly one
result or error as described by [AIP-151](https://google.aip.dev/151).

This also follows the useful separation observed in the local Claude Code
implementation: stable agent type, spawned agent/session identity, request
correlation, transcript parentage, and short-lived attach handles are distinct
types. KidItem adopts that separation, not Claude Code's local filesystem or
prefix format. Type prefixes are allowed for ephemeral developer handles, but
canonical persistent references use resource names.

## 8. Single Conversation Lifecycle

### 8.1 Empty interaction surface

Opening the panel or `/agent-os` may load the server-authorized agent list,
recent accessible sessions, a selected existing session, and read-only
connection state. It must not create a session, task, policy snapshot,
execution, Operations run, or transcript event.

An empty new-conversation composer may hold a locally generated opaque thread
identifier in memory. That identifier is not an AgentOS resource until the
first run is authorized.

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
  -> append the first user conversation event
  -> dispatch through the selected runtime
~~~

The control records and first user event are created in one transaction. Later
validated user, assistant, tool, state, HITL, and terminal events append to the
same versioned event stream before they are exposed as replayable history.

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

The target control graph links durable control records to one canonical,
append-only conversation event stream. Message content appears only in that
stream; task, audit, policy, usage, and analytics records keep references or
content-free evidence instead of copied transcripts. The `name` fields below
are computed API projections; persistence keeps only branded UUID keys and
parent relations.

~~~typescript
interface AgentSession {
  id: AgentSessionId;
  name: AgentSessionName;
  organizationId: OrganizationId;
  copilotThreadId: string;
  primaryAgentVersionId: AgentVersionId;
  authorityProfileVersionId: AuthorityProfileVersionId;
  contextEpoch: number;
  status: 'active' | 'completed' | 'cancelled' | 'archived';
  createdByUserId: string;
}

interface AgentSessionTask {
  id: AgentSessionTaskId;
  name: AgentSessionTaskName;
  sessionId: AgentSessionId;
  parentTaskId: AgentSessionTaskId | null;
  assignedAgentVersionId: AgentVersionId;
  objective: string | null;
  isRoot: boolean;
  operationRunId: OperationRunId | null;
  status: string;
}

interface AgentExecution {
  id: AgentExecutionId;
  name: AgentExecutionName;
  organizationId: OrganizationId;
  copilotThreadId: string;
  sessionId: AgentSessionId;
  sessionTaskId: AgentSessionTaskId;
  aguiRunId: string;
  runtimeType: string;
  modelIdentity: string;
  policySnapshotId: AgentPolicySnapshotId;
  attempt: number;
  status: string;
}

interface AgentConversationEvent {
  id: AgentConversationEventId;
  name: AgentConversationEventName;
  organizationId: OrganizationId;
  sessionId: AgentSessionId;
  executionId: AgentExecutionId | null;
  sequence: bigint;
  eventType: string;
  schemaVersion: number;
  payload: unknown;
  createdAt: Date;
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
- append-only conversation events and replay checkpoints;
- audit events.

The first-run transaction creates exactly one root task in `interpreting`
state and one canonical user-message event. The task objective remains null
until the runtime derives normalized work metadata; KidItem does not copy the
first message into a task field or audit record. Database and repository
invariants enforce one root task per session and one monotonic event sequence.

`AgentSession` directly owns the organization-scoped AG-UI thread association.
There is no separate pre-session binding. Context epochs, conversation events,
and policy snapshots reference the session, and every execution has non-null
session and task ownership.

The public cross-plane correlation set is `copilotThreadId`, `aguiRunId`, and
the canonical `session`, `task`, `execution`, optional `attempt`, and optional
`operation` resource names. Repository ports may carry branded logical IDs,
but raw database IDs do not escape as interchangeable strings.

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

All runtime output is normalized into a versioned KidItem conversation event,
durably appended, and then translated into AG-UI before reaching CopilotKit.
The browser never consumes Hermes-, Codex-, Claude-, or provider-specific
streams. Live text deltas use the same ordered event identity as replay, so a
disconnect can resume after the last acknowledged sequence without duplicating
a visible message or tool invocation.

The browser's prior message array is never model-context authority. AgentOS
loads the canonical session event stream, verifies the newly submitted event
against the signed input hash, and builds a bounded model conversation view.
When history exceeds the active AgentVersion context policy, the runtime writes
a versioned summary snapshot covering an exact source-sequence range and then
uses that immutable snapshot plus later turns. Raw retained history remains
available for user replay and legal lifecycle; a summary does not replace or
delete it.

Immediately before dispatch, the authenticated browser requests a signed run
intent from Nest using the CopilotKit thread ID, prospective AG-UI run ID,
selected allowed agent, allowlisted dashboard context, and canonical hash of
the normalized user event. Nest derives organization and actor identity,
validates the agent, model, runtime, event envelope, and policy, and returns a
canonical token that expires after 30 seconds. Signing the intent is stateless
and performs no database write.

The AG-UI request carries that intent with its thread and run IDs. The
Interaction Gateway authenticates to Nest with a dedicated secret. Nest accepts
identity only from the verified intent and trusted gateway context, never from
standalone organization, user, model, policy, session, or capability fields in
the request DTO.

Run authorization follows one command contract:

1. A thread without a session atomically creates the session, root task,
   context epoch, policy snapshot, execution, and first user-message event.
2. A thread with a session validates organization, actor, lifecycle, primary
   agent, context, and policy before creating or reusing the execution and
   appending the idempotent user-message event.

First-run creation takes a transaction-scoped lock derived from organization,
actor, and Copilot thread. The organization-scoped thread and AG-UI run ID are
the idempotency identity. Exact retries return the same control graph;
mismatched reuse returns a stable conflict rather than a raw database error.

Reconnect and replay use a separate read-only connection authorization path.
The server reads the latest projection plus events after the client's opaque
cursor, completes replay, and then joins the live execution stream. It must not
create or reactivate a session, task, policy snapshot, execution, conversation
event, or Operations run.

Failure semantics are explicit:

- Missing model/runtime, inactive agent, invalid membership, or invalid context
  fails before any control record is written.
- A database error inside first-run creation rolls back the complete control
  graph and first message event.
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
- snapshot-plus-cursor replay followed by an atomic live-stream join.

## 14. Durable Execution

Official AgentOS tasks may outlive a browser connection or server process.

- AgentOS owns goal, authority, task, delegation, and approval state.
- Operations owns the generic run envelope, scheduling, engine dispatch, and
  cancellation contract.
- A durable workflow implementation persists checkpoints and resumes after
  worker failure.
- CopilotKit receives progress and interrupts through AG-UI; KidItem replays
  persisted conversation events and reconnects the client to the same run.
- A closed panel does not cancel work.
- Stopping an interactive run ends only its current execution.
- Cancellation of an official task propagates through AgentOS, Operations, and
  the runtime adapter.

The workflow engine is selected for durable semantics, not UI integration.
AgentOS adapters keep the workflow choice invisible to CopilotKit.

### 14.1 Capability, Use Case, And Operation Boundary

The normative invocation flows are:

~~~text
HTTP / CLI / Agent capability adapter
  -> owning-domain input port
     -> domain policy
        -> synchronous result
        OR -> Operations request -> owner operation handler -> same input port

Operations schedule / retry / worker
  -> owner operation handler
     -> owning-domain input port

AgentOS durable task operation
  -> AgentOS task-execution input port
     -> runtime adapter
        -> policy-approved Agent capability adapter
           -> owning-domain input port
~~~

An input port is named for the business use case, never for HTTP, AgentOS, or
Operations. Those callers are incoming adapters. Output ports represent what
the application needs from repositories, providers, runtimes, event sinks, or
other owner domains. This matches the practical Controller → Input Port →
Domain → Output Port flow described in Kakao Style's
[domain-driven hexagonal example](https://devblog.kakaostyle.com/ko/2025-03-21-1-domain-driven-hexagonal-architecture-by-example/).

Deterministic work does not need a conversation. A synchronous deterministic
request invokes the owner use case directly; a long-running deterministic
request creates an Operation and is handled outside AgentOS. Work requiring
LLM judgment starts as an official AgentSession execution. The former generic
non-session `AgentRun` route is therefore not a permanent compatibility lane:
each caller migrates to an owner-domain use case/Operation or to the official
session execution path.

### 14.2 AgentOS Hexagonal Directory And Module Contract

AgentOS is one platform-owner hexagon. It keeps the repository-wide
`adapter/application/domain` direction as the first directory level and uses
owner capability as the second level. It does not create a separate top-level
hexagon for interaction, session control, or task execution, and it does not
leave those capabilities flat inside `application/service` or a single Prisma
adapter.

~~~text
apps/server/src/agent-os/
  adapter/
    in/
      http/{interaction,session-control,catalog}/
      operation/session-execution/
      {agent,mcp}/capability/
    out/
      repository/{interaction,session-control,catalog}/
      transaction/{interaction,session-control}/
      runtime/{agui,durable,local-cli,mcp}/
      event/interaction/
      cross-domain/
  application/
    port/
      in/{interaction,session-control,session-execution,capability}/
      out/{repository,transaction,runtime,event,cross-domain}/
    service/{interaction,session-control,session-execution,capability,catalog}/
  domain/{session,execution,approval,capability,catalog}/
~~~

The dependency path is always:

~~~text
incoming adapter
  -> capability-named input port
     -> application use case
        -> pure domain policy
        -> output port
           -> outgoing adapter
~~~

- HTTP controllers, Operation handlers, Agent adapters, MCP adapters, and CLI
  adapters inject input-port tokens. They do not import a concrete
  `application/service` implementation.
- An Operation handler translates the Operations envelope into an AgentOS
  command and delegates to the session-execution input port. Runtime start,
  reconnect, checkpoint, approval, artifact, and terminal reconciliation live
  behind that use-case interface rather than in the incoming adapter.
- Output repository ports represent focused reads. Atomic authorization,
  event append, delegation, approval continuation, attempt binding, and
  lifecycle transitions use transaction ports and Prisma transaction adapters.
  The implementation is not split into table-shaped CRUD adapters when that
  would break one lifecycle transaction.
- `domain/` owns status transitions, parent/child consistency, approval
  validity, and other pure invariants. It imports neither NestJS, Prisma,
  Operations, provider runtimes, nor event infrastructure.
- The transitional generic non-session `AgentRun` implementation may be
  quarantined under `legacy-run` during migration, but the Phase 5 exit removes
  it instead of retaining a permanent compatibility module.

Nest composition reflects process ownership without creating a universal
`BaseDomainModule`:

- `AgentOsCatalogModule` owns code-defined catalog/version/manifest providers.
- `AgentOsCapabilityModule` owns capability registry and invocation seams.
- `AgentOsSessionModule` owns official session, execution, interaction, and
  their outgoing adapters.
- `AgentOsModule` is the controller-free core facade over those modules.
- `AgentOsHttpModule` alone composes HTTP, interaction secrets, and
  Operations-backed session controls.
- `AgentOsWorkerModule` remains isolated from HTTP providers and is deleted
  with the generic `AgentRun` worker when the cutover completes.

Other backend owners use the same hexagonal dependency direction and standard
lane names, but they add only the adapters and ports justified by real IO or a
real second caller. Simple CRUD owners remain flat until a provider, runtime,
cross-domain mutation, row-lock transaction, shared use case, meaningful pure
policy, or large-file pressure creates a real seam.

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

## 17. KidItem-Owned Conversation Persistence

KidItem production PostgreSQL is the canonical store for every AgentSession
and its conversation history. There is no CopilotKit-hosted or self-hosted
Enterprise Intelligence data plane.

The persistence design includes:

- an append-only, organization-scoped `AgentConversationEvent` stream with a
  unique `(sessionId, sequence)` order and idempotent external event identity;
- versioned payload schemas for user/assistant messages, tool activity,
  generative UI data, state snapshots, HITL requests/decisions, and terminal
  events;
- a compact session projection for title, lifecycle, last event sequence,
  unread state, and pagination without scanning the full event log;
- server-issued opaque replay cursors that bind organization, actor, session,
  and last acknowledged sequence;
- transactional event append and outbox publication so an event becomes live
  only after it is durable;
- a replaceable ephemeral fan-out layer for multi-replica delivery that never
  becomes the replay source of truth;
- legal hold, retention, archive, deletion, backup, restore, and disaster
  recovery using KidItem's organization-aware data controls;
- object storage references for large attachments and artifacts rather than
  embedding unbounded blobs in event payloads; and
- metrics, traces, logs, alerts, capacity tests, and reconnect-storm tests keyed
  only by non-content correlation identifiers.

The stored model is KidItem-owned and versioned independently from the AG-UI
wire version. Gateway translators can upgrade old event payloads into the
locked AG-UI train during replay. Audit tables do not duplicate message text,
and ephemeral realtime infrastructure is reconstructable from PostgreSQL plus
active Operations state.

## 18. Dependency And Repository Policy

Production dependencies are limited to canonical maintained surfaces:

- [CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) for the
  React/runtime packages;
- [AgentFoundry-Labs/CopilotKit](https://github.com/AgentFoundry-Labs/CopilotKit)
  as the verified public source-lineage and patch-review fork;
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
- Run KidItem history replay, reconnect, HITL, duplicate-tool-call, and runtime
  cancellation tests against every candidate.
- Keep an SBOM, package/license snapshot, and internal architecture decision
  record for every production release.
- Do not maintain a permanent fork by default; use a short patch queue only
  when an upstream fix cannot land before KidItem's release.
- Do not install, configure, or call Enterprise Intelligence, Rich Threads,
  hosted projects, Premium endpoints, project API keys, `useThreads`, or the
  `copilot-intelligence` Helm chart.
- The amount of existing KidItem code or schema that must be replaced is not a
  constraint. Rewrite legacy chat persistence, gateway, frontend, and AgentOS
  control models when that produces the target structure.
- Before production deployment, verify the exact OSS package licenses,
  transitive dependencies, published artifacts, and AG-UI compatibility. A
  documentation/license discrepancy blocks that package train until resolved;
  it never justifies silently introducing an Enterprise service dependency.

## 19. APIs To Keep And Remove

### 19.1 Canonical surfaces

- CopilotKit OSS runtime endpoints for connect, run, stop, and AG-UI stream.
- AG-UI agent endpoint from CopilotKit OSS to AgentOS.
- AgentOS endpoints for agent discovery, session list/lifecycle, conversation
  history/replay, policies, tasks, approvals, artifacts, and audit.
- NestJS domain capability endpoints/ports for scoped facts and mutations.
- Operations endpoints/ports for run envelopes and engine dispatch.
- Canonical resource-name parsing/formatting at HTTP, AG-UI, event, and
  cross-domain boundaries; branded IDs inside owner application ports.

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
- a compatibility Chatbot agent identity that diverges from Operator;
- a generic non-session `AgentRun` execution route or an Operations worker that
  dispatches through `AgentCapabilityRegistry`; and
- raw UUID strings as an interchangeable public ID type.

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

- Verify the public fork, exact OSS package train, exported runtime APIs,
  licenses, and AG-UI contract.
- Snapshot package licenses and resolve documentation/package discrepancies
  before production approval.
- Prove organization binding, KidItem-owned event persistence, reconnect,
  replay, locking, HITL, and AG-UI conformance in an isolated environment.
- Prove a dedicated Interaction Gateway deployment through KidItem ingress.
- Load-test long streams, reconnect storms, and concurrent thread ownership.
- Record the supported-version matrix for CopilotKit OSS, AG-UI, React, Node,
  and PostgreSQL.

Exit: KidItem can persist and resume an AG-UI conversation without legacy chat
storage or any Enterprise Intelligence service.

### Phase 1 — CopilotKit interaction foundation

- Install one exact CopilotKit v2 package train.
- Build the Interaction Gateway.
- Add the canonical AgentOS conversation event log, replay cursor, and history
  projection.
- Implement the AG-UI AgentOS gateway with a minimal policy-safe Operator.
- Replace any CopilotKit-owned floating trigger with the existing purple
  quick-action entry.
- Render the same thread in a right-side panel and a dedicated AgentOS test
  workspace.
- Add allowlisted shared dashboard context.
- Publish branded logical-ID schemas and canonical resource-name contracts;
  keep physical UUID keys private to persistence adapters.

Exit: a user can open, close, reload, and resume a streamed KidItem-owned
conversation rendered by CopilotKit OSS while keeping the dashboard visible.

### Phase 2 — single-lifecycle session vertical slice

- Add agent discovery and pre-submit selection with Operator as default.
- Add the stateless 30-second run intent.
- Atomically create `AgentSession`, its root task, the initial context epoch,
  policy snapshot, execution, and first user event on the first AG-UI run.
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
- Route Agent capabilities into owning-domain input ports. Route deterministic
  long-running work into Operations without creating an AgentSession.

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
- Remove the generic non-session AgentRun path after deterministic callers use
  owner-domain Operations and judgment callers use official sessions.
- Deepen AgentOS into the lane-first/capability-second directory contract;
  incoming adapters call capability input ports, official execution logic no
  longer lives in the Operation adapter, and lifecycle writes no longer share
  two aggregate-wide repository interfaces.
- Split controller-free catalog, capability, and official-session composition
  modules while preserving the KID-24 API/worker/MCP process-root contract.
- Replace raw cross-boundary database IDs with canonical resource names without
  rekeying existing UUID rows.
- Update docs/ARCHITECTURE.md, environment documentation, deployment contracts,
  and ownership maps in the same implementation train.
- Run reconstruction and release-contract guards before deletion.

Exit: no production conversational path bypasses CopilotKit or AG-UI.

### Phase 6 — additional channels

- Evaluate CopilotKit Channels for Slack, Teams, mobile, and notifications.
- Reuse the same thread, AgentOS policy, HITL, and runtime contracts.
- Define channel-specific authority and privacy rules before enabling actions.

## 21. Verification Strategy

### CopilotKit OSS and conversation tests

- opening an empty composer, history, and reconnect perform zero AgentOS writes;
- first submit creates one session/root-task/policy/execution control graph and
  one canonical user event;
- create, resume, archive, restore, and reconnect session-backed threads;
- recover after Interaction Gateway and browser restarts;
- reject duplicate/out-of-order events;
- enforce thread ownership and organization binding;
- verify snapshot-plus-cursor replay, atomic live join, and concurrent-tab
  locking;
- verify the same session thread in the panel and workspace;
- verify package-version canaries before upgrade.

### Control persistence tests

- run against isolated real PostgreSQL after a clean schema push;
- prove first submit creates exactly one session, root task, context epoch,
  policy snapshot, execution, and first conversation event;
- prove exact retry returns the same identifiers and mismatched reuse conflicts;
- prove concurrent first requests converge on one control graph;
- prove a later run adds only an execution and a new thread adds a new session;
- enforce non-null execution session/task ownership;
- reject cross-organization and cross-user references at repository and
  database boundaries; and
- derive usage from the execution's canonical model identity;
- round-trip every canonical resource name and reject wrong resource types or
  mismatched parent scope; and
- prove that a syntactically valid resource name never bypasses organization
  authorization.

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
- restore tests rebuild history from PostgreSQL and correlate thread, session,
  task, execution, and Operations run.

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

- CopilotKit OSS is the canonical UI, streaming, generative-UI, shared-state,
  and HITL framework for KidItem AI.
- KidItem AgentOS/PostgreSQL is the canonical thread, message, activity,
  snapshot, and replay store.
- AG-UI is the only CopilotKit-to-AgentOS conversational protocol.
- There is one KidItem-owned user-visible conversation store; legacy transcript
  tables and any vendor-side duplicate are absent.
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
- Owner input ports express business use cases; HTTP, Agent, and Operation
  adapters call them without caller-specific port variants.
- Capabilities never own durable execution and Operations never dispatch
  business work through the Agent capability registry.
- Deterministic synchronous work uses owner input ports, deterministic
  long-running work uses Operations, and LLM judgment uses official
  AgentSession execution; no generic non-session AgentRun lane remains.
- Physical UUID keys stay persistence-private, application IDs are branded,
  cross-boundary references are canonical resource names, external protocol
  IDs remain opaque, and request/idempotency/sequence/token/digest identities
  are not conflated.
- Legacy chat APIs, polling, duplicate storage, and divergent renderers are
  removed after guarded cutover.
- CopilotKit and AG-UI upgrades are exact-pinned, canaried, observable, and
  recoverable.
- No runtime path requires Enterprise Intelligence, Rich Threads, hosted
  projects, Premium credentials, or the Enterprise chart.

## 23. Rejected Alternatives

### CopilotKit OSS as a decorative widget over the legacy chat stack

Rejected because KidItem would keep the legacy message protocol, polling,
cards, and HITL while using only CopilotKit's visual shell. KidItem does own
durable conversation state, but that state is designed directly behind AG-UI
and CopilotKit OSS rather than preserving the old chat contract.

### A parallel browser conversation protocol beside AG-UI

Rejected because it creates two interaction protocols and makes replay,
idempotency, and upgrades harder. KidItem history and lifecycle endpoints are
projections of the same AgentOS event store, not another agent-run protocol.

### Enterprise Intelligence as required persistence

Rejected because KID-25 deliberately targets CopilotKit's OSS framework and
AG-UI. Durable sessions, history, replay, reconnect, locking, retention, and
observability are KidItem platform responsibilities.

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

### One universal UUID or prefixed ID string

Rejected because storage locality, public resource identity, request
correlation, idempotency, event order, and bearer security have different
semantics. Prefixing every UUID does not encode parent scope or authorization.
KidItem keeps native UUID storage keys, branded logical types, hierarchical
resource names, and separate protocol/security identifiers.

### Treating Operations as an Agent capability runner

Rejected because it reverses the hexagonal dependency and makes deterministic
workers depend on AgentOS policy/routing infrastructure. Capabilities are
Agent-facing adapters to owner use cases; Operations provides durable lifecycle
and invokes owner input ports.
