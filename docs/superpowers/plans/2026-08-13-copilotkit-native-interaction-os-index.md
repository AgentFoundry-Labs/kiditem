# CopilotKit-Native Interaction OS Execution Index Implementation Plan

Last amended: 2026-08-21 — owner-port execution boundaries, canonical ID
system, AgentOS lane-first/capability-second hexagonal deepening, and zero-data
pre-launch contraction propagated through Plans 1–4.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct KidItem AI interaction around one session-backed
CopilotKit conversation lifecycle, AG-UI, and a policy-owning AgentOS without
retaining a parallel chat system.

**Architecture:** CopilotKit OSS owns the user-visible interaction framework,
while KidItem AgentOS/PostgreSQL owns thread lifecycle, messages, UI activity,
replay, and reconnect state. A separately deployed stateless Interaction
Gateway forwards only Nest-authorized AG-UI runs; the first submitted run
atomically creates `AgentSession`, its root `AgentSessionTask`, context epoch,
policy snapshot, execution, and first conversation event, while later runs
reuse that session. Agent capabilities adapt authorized invocations into
owning-domain input ports; Operations owns durable run envelopes and engine
dispatch and invokes owner ports directly. Shared branded IDs and canonical
resource names carry KidItem identity across those boundaries.

**Tech Stack:** Node.js 22, TypeScript, Next.js App Router, React, NestJS,
Prisma/PostgreSQL, CopilotKit OSS Runtime/React Core `1.67.1`, AG-UI `0.0.57`,
KidItem transactional outbox and live event fan-out, Docker Compose, Vitest,
Testing Library, and Playwright

---

## Global Constraints

- CopilotKit OSS is the only user-visible conversation, streaming,
  generative-UI, and HITL framework.
- AG-UI is the only conversational protocol between CopilotKit and AgentOS;
  provider- and CLI-specific streams never reach the browser.
- AgentOS/PostgreSQL is the canonical thread, message, UI activity, state
  snapshot, and replay store. CopilotKit is not a production persistence
  service.
- Panel open, empty new conversation, history, replay, and reconnect are
  read-only and create no session, task, policy snapshot, execution, or
  Operations run.
- Every visible user, assistant, tool, state, HITL, and terminal event is
  appended to the organization-scoped AgentOS event log before publication;
  transient fan-out is never the replay source of truth.
- Replay uses a server-issued opaque cursor, completes persisted history first,
  and atomically joins the live stream after the last durable sequence.
- The first submitted AG-UI run creates exactly one session, one root task, one
  context epoch, one policy snapshot, one execution, and one user-message event
  in one transaction.
- Every `AgentExecution` has non-null `sessionId` and `sessionTaskId`.
- A later run on the same thread adds one execution to the same session. A new
  thread creates another session only after its first submitted message.
- Session creation is not mutation authority. Every capability comes from a
  server-resolved policy snapshot; business writes, delegation, and external
  side effects keep their policy and HITL gates.
- Session lifecycle changes are explicit. No inactivity clock replaces or
  silently forks a conversation.
- A session owns one immutable primary agent version. Agent changes after first
  submit use delegation or an explicit new conversation.
- The existing purple `QuickActionFab` is the only global floating entry;
  desktop keeps the dashboard visible beside a right panel and narrow layouts
  use a full-screen surface.
- Shared browser context is allowlisted presentation context only. Nest derives
  organization, actor, model, policy, and capabilities from trusted state.
- UI actions are registered, typed, server-minted, click-time authorized, and
  stale-safe. There is no dedicated answer-expansion action.
- Suggested replies belong only to the latest eligible assistant response;
  one click creates exactly one visible user turn and consumes its siblings.
- Frontend code reaches business data only through NestJS APIs and never
  imports Prisma, `pg`, Supabase, or another database client.
- Deterministic synchronous work invokes owning-domain input ports directly;
  deterministic long-running work uses Operations without creating AgentOS
  work. LLM judgment starts in AgentOS and may invoke owner-published
  capabilities. Operations owns lifecycle, not business capabilities.
- HTTP, CLI, Agent, and Operation entrypoints are incoming adapters. Input
  ports are named for owning-domain use cases, never for caller type.
- AgentOS keeps `adapter/application/domain` as its first directory level and
  groups official interaction, session control, session execution, capability,
  and catalog modules beneath those lanes. Incoming adapters inject input-port
  tokens rather than concrete application implementations; lifecycle writes
  use focused transaction ports rather than aggregate-wide repository
  interfaces.
- An Operations handler invokes its owner input port and never dispatches a
  business command through `AgentCapabilityRegistry`. The AgentOS-owned
  durable task operation may resume only the AgentOS task-execution use case.
- The generic non-session `AgentRun` route is transitional only: deterministic
  callers migrate to owner use cases/Operations and judgment callers migrate
  to official AgentSession executions.
- Physical database keys remain owner-private UUIDs; application IDs are
  Zod-branded; HTTP, AG-UI, event, and cross-domain references use canonical
  resource names. External protocol IDs, request IDs, idempotency keys,
  sequences, tokens, and digests remain distinct types.
- Missing model selection or a runtime that lacks required durability
  semantics is an explicit error; no silent model or runtime fallback exists.
- Prisma uses `String` plus DTO/Zod/domain validation instead of native
  PostgreSQL enums. Every repository read and mutation carries organization
  scope and all new cross-record relations are organization-fenced.
- The task model is `AgentSessionTask`; the retired legacy `AgentTask` model is
  not reintroduced.
- CopilotKit and AG-UI packages are exact-pinned as one compatibility train.
- Enterprise Intelligence, Rich Threads, hosted projects, Premium credentials,
  `useThreads`, and the Enterprise chart are excluded dependencies.
- Existing KidItem implementation cost and file/schema churn are not
  architecture-selection constraints. Replace as much legacy code as the OSS
  target requires instead of retaining an inferior structure to reduce scope.
- Legacy chat APIs, polling, transcript models, duplicate renderers, and the
  divergent Chatbot identity are removed only after replacement scanners and
  compatibility gates pass.

## Work Tracking And Delivery Shape

- Linear [KID-25](https://linear.app/kiditem/issue/KID-25/copilotkit-%EA%B8%B0%EB%B0%98-interaction-os%EB%A1%9C-ai-chatagentos-%EB%8C%80%ED%99%94-%EC%9E%AC%EA%B5%AC%EC%B6%95)
  is the sole work item and durable decision record.
- Accountable human: 차영훈 (`yhc125`).
- Use the existing isolated worktree and branch
  `codex/kid-25-copilotkit-interaction-os`; do not create another worktree.
- KID-24 is the required merge predecessor. A KID-25 draft pull request may be
  opened against `develop` with an explicit `Depends on KID-24` marker, but it
  must not become ready or merge until KID-24 is in `develop` and this branch
  has been updated onto that merged baseline.
- Preserve KID-24's process-root contract during that update:
  `AgentOsModule` stays controller-free, interaction HTTP controllers and their
  auth-only secrets live in `AgentOsHttpModule`, Operations-backed official
  submission lives in the API-only controller-free
  `AgentOsApiExecutionModule`, controller-free `OperationsModule` owns lifecycle
  execution, and `OperationsHttpModule` alone owns Operations controllers.
  Worker/MCP roots must not instantiate either HTTP module or require
  interaction HMAC secrets. Plan 4 deletes the generic Agent worker root before
  the first deployment; it does not move official execution into that root.
- KID-24's API-lifecycle ownership remains authoritative for every
  Operations-backed Agent execution. KID-25 may correlate an execution to an
  Operations run, but it must not restore a shared API/worker root, cross-boot
  run resurrection, or a second run lifecycle.
- Use one follow-up pull request targeting `develop`. The four linked plans are
  ordered
  verification checkpoints, not PR boundaries.
- The post-KID-24 AgentOS directory reconstruction is executed as five cohesive
  batches appended to the official-session-runtime plan. It receives one
  integrated review after the complete local acceptance gate, not a separate
  integration review for each file move or micro-step.
- This is the declared platform-boundary exception covering AgentOS,
  Operations, shared contracts, backend, web, schema, and deployment. Exclude
  unrelated cleanup and business-domain rewrites.
- Preserve existing uncommitted Task 4 work until the control reconstruction
  plan classifies each file as retained, rewritten, or deleted.

## Source Design

Implementation must satisfy
[the approved Interaction OS design](../specs/2026-08-13-ai-chat-interactive-response-design.md).
If discovery changes a product decision, stop the affected plan and amend the
design plus this index before implementing around it.

## Locked Platform Evidence

The target machine-readable lock is
`deploy/interaction-gateway/platform-lock.json` and the evidence matrix is
[`docs/references/copilotkit-platform-matrix.md`](../../references/copilotkit-platform-matrix.md).

- CopilotKit Runtime and React Core: `1.67.1` exact.
- AG-UI client/core/encoder: `0.0.57` exact.
- Runtime: Node `>=22 <23`.
- Source lineage: public MIT
  [`AgentFoundry-Labs/CopilotKit`](https://github.com/AgentFoundry-Labs/CopilotKit)
  fork of canonical upstream.
- Only public OSS packages and AG-UI artifacts are part of the runtime train.
- The existing `deploy/interaction-intelligence` lock is reconstructed into the
  gateway lock and loses all chart, entitlement, Kubernetes, Helm, and Redis
  requirements.
- Production acceptance verifies exact published packages, license metadata,
  exported APIs, KidItem persistence, and protocol compatibility.

## Identity And Gateway Boundary

1. The browser authenticates to Nest with the existing KidItem session.
2. Nest derives organization, user, allowed agent version, model, runtime,
   policy hash, thread ID, run ID, and canonical dashboard-context hash.
3. Nest returns a stateless HMAC-signed run intent expiring after 30 seconds.
4. The Interaction Gateway sends that intent to Nest with its dedicated
   service credential.
5. Nest verifies the intent again and atomically authorizes the first or later
   execution.
6. Connection authorization is a separate read-only path.

The gateway never decodes a browser JWT, never connects to the KidItem DB, and
never accepts standalone organization, user, model, policy, session, or
capability claims from the browser.

## Data Ownership

| Record | Owner | Stored content |
|---|---|---|
| `AgentSession` | AgentOS/PostgreSQL | Thread identity, title/lifecycle projection, organization/actor, immutable primary agent, authority |
| `AgentConversationEvent` | AgentOS/PostgreSQL | Versioned messages, tool/UI activity, state, HITL, terminal events, and replay order |
| Conversation outbox/replay cursor | AgentOS/PostgreSQL | Durable publication state and server-signed client cursor |
| `AgentSessionTask` | AgentOS | Root/subtask control state and normalized objective, never copied prompt text |
| `AgentContextEpoch` | AgentOS | Trusted context boundary and validated handoff reference |
| `AgentPolicySnapshot` | AgentOS | Immutable grants and policy hash used by executions |
| `AgentExecution` and usage | AgentOS | AG-UI/runtime/model/policy correlation, terminal state, cost |
| Operation/run/checkpoint envelope | Operations | Dispatch, retry, checkpoint, cancellation, terminal state |
| Business input port and domain policy | Owning business domain | Use-case semantics shared by HTTP, Agent, and Operation adapters |
| Agent capability adapter | Owning business domain, registered by AgentOS | Policy-gated translation from Agent invocation into the owner input port |
| Business facts and mutations | Owning domain | Organization-scoped source of truth |

## Cross-Plan Contract

All four plans use one identifier vocabulary. The implementation lives in the
focused `@kiditem/shared/identifiers` subpath and is consumed by
`@kiditem/shared/agent-interaction`; it is not exported from the shared root
barrel.

### Identifier classes

| Class | Representation | Boundary rule |
|---|---|---|
| Storage key | Prisma `String @default(uuid()) @db.Uuid` | Private to the owner repository adapter; no public UUID-generation promise |
| Logical ID | Zod-branded UUID/string/number | Used inside one owner application/domain; parsed at incoming adapters |
| Resource name | Typed hierarchical string | Required at HTTP, AG-UI, event, and cross-domain boundaries |
| Stable code key | Namespaced validated string | Agent definition, capability, operation, runtime, policy, and schema keys |
| External protocol ID | Bounded opaque string | `copilotThreadId`, `aguiRunId`, `toolCallId`; never parsed as KidItem IDs |
| Request ID | UUIDv4 | Transport correlation only, never a resource or idempotency identity |
| Idempotency key | Bounded scoped key or canonical digest | Command identity; its scope is part of the uniqueness contract |
| Sequence | Server-assigned bigint / canonical decimal string | Aggregate ordering; never inferred from UUID or timestamp order |
| Token | High-entropy opaque bearer value | Short lived; persist only a digest/reference when necessary |
| Digest | Canonical lowercase SHA-256 hex | Content/policy identity only |

Resource names follow [AIP-122](https://google.aip.dev/122); resource types and
patterns follow [AIP-123](https://google.aip.dev/123). They contain no `/api`
prefix or API version and are never authorization by themselves:

```text
organizations/{organization}
users/{user}
agentDefinitions/{agentDefinitionKey}
agentDefinitions/{agentDefinitionKey}/versions/{version}
organizations/{organization}/agentSessions/{session}
organizations/{organization}/agentSessions/{session}/tasks/{task}
organizations/{organization}/agentSessions/{session}/executions/{execution}
organizations/{organization}/agentSessions/{session}/executions/{execution}/attempts/{attempt}
organizations/{organization}/agentSessions/{session}/events/{sequence}
organizations/{organization}/operations/{operation}
organizations/{organization}/operations/{operation}/checkpoints/{sequence}
```

The owner formats names from parent scope plus branded IDs and parses the exact
expected resource type before authorization. It does not persist a redundant
`name` column. Existing UUID rows are not rekeyed. `attempt` and event/checkpoint
segments use their server-assigned ordinal where that ordinal is the logical
identity. A row may still have a private UUID storage key.

### Interaction wire contract

These public field names and nullability are normative. Persistence and
repository records may use branded `...Id` fields internally, but raw database
IDs never substitute for these resource names:

```typescript
type AgentSessionLifecycle =
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'archived';

interface AgentCorrelation {
  copilotThreadId: string;
  aguiRunId: string;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  execution: AgentExecutionName;
  attempt: AgentExecutionAttemptName | null;
  operation: OperationRunName | null;
}

type AgentConversationEventType =
  | 'user_message'
  | 'assistant_message'
  | 'system_notice'
  | 'tool_activity'
  | 'state_snapshot'
  | 'hitl_request'
  | 'hitl_decision'
  | 'run_terminal';

interface AgentConversationEventEnvelope {
  name: AgentConversationEventName;
  session: AgentSessionName;
  execution: AgentExecutionName | null;
  aguiRunId: string | null;
  sequence: string;
  eventType: AgentConversationEventType;
  schemaVersion: 1;
  payload: unknown;
  createdAt: string;
}

interface AgentConversationReplay {
  session: AgentSessionName;
  events: AgentConversationEventEnvelope[];
  nextCursor: string | null;
  lastSequence: string;
}

interface InteractionRunIntentClaims {
  version: 1;
  organization: OrganizationName;
  user: UserName;
  agentVersion: AgentVersionName;
  copilotThreadId: string;
  aguiRunId: string;
  dashboardContextHash: string;
  policyHash: string;
  inputHash: string;
  expiresAtMs: number;
}
```

`copilotThreadId` and `aguiRunId` are external identifiers and are never parsed
as KidItem database IDs. The UI may require a UUID-shaped Copilot thread ID
only when the official CopilotKit API contract requires it.
`attempt` and `operation` are null for an execution that has not entered the
durable runtime; once assigned their resource names never change for that
attempt/run. The existing Prisma fields may remain `attemptId` and
`operationRunId` internally. Shared UI event schemas use `task` for the
canonical `AgentSessionTask` resource name.
Conversation `sequence` is a decimal string on the wire so PostgreSQL bigint
ordering remains lossless in JavaScript. The server signs replay cursors; the
browser never supplies a trusted sequence, organization, or ownership claim.
`aguiRunId` is present exactly when `execution` is present and is required for
terminal events, so persisted replay preserves the original AG-UI run identity.
`requestId` follows [AIP-155](https://google.aip.dev/155) and stays separate
from command idempotency. Operations follow
[AIP-151](https://google.aip.dev/151): the operation resource has metadata and
eventually exactly one typed result or stable error.

## Plan Map And Required Order

### 1. [Interaction Platform Foundation](./2026-08-13-interaction-platform-foundation.md)

Reconstructs the committed Enterprise-oriented lock into an OSS-only platform
lock and reconstructs shared contracts, Prisma control/conversation state,
repository transactions, run intents, authorization, replay access, HTTP
guards, scanners, and Nest wiring around `AgentSession` as the only thread
control root. It also establishes branded logical IDs and canonical resource
names before downstream plans publish wire contracts.

### 2. [Agent Session Interaction Vertical Slice](./2026-08-13-agent-session-interaction-vertical-slice.md)

Consumes Plan 1 and produces the dedicated Interaction Gateway, minimal AG-UI
Operator loop, global panel, session-backed history, safe read capabilities,
typed generative UI, suggested replies, verified navigation, analytics, and
browser acceptance.

### 3. [AgentOS Durable Session Runtime](./2026-08-13-agentos-official-session-runtime.md)

Consumes Plans 1 and 2 and produces task decomposition, Operations-backed
durable execution, runtime adapters, approval/progress/artifact cards,
reconnect, cancellation, and terminal reconciliation beneath the existing
session root. It removes the generic non-session AgentRun branch, keeps Agent
capabilities as owner-domain incoming adapters, and keeps Operations handlers
on owner use-case ports.

### 4. [Pre-Launch Contraction And First Deployment](./2026-08-13-interaction-os-first-deployment.md)

Consumes all earlier plans and produces production-grade KidItem conversation
storage/replay operations, Office release integration, retention/deletion/legal
hold, compatibility canaries, a zero-data preflight, and deletion of every
legacy conversation and generic AgentRun path before the first production
deployment without rekeying retained UUID rows. Because KID-25 has never served
production traffic, Plan 4 has no Freeze/Cutover/Contract deployment sequence
or legacy data migration window. The read-only preflight accepts a wholly absent
unshipped legacy schema or a wholly present schema whose execution/content
boundaries are empty and whose only rows are the exact code-owned
`AgentInstance`/pristine `AgentRuntimeState` seed projection. When those legacy
tables are present, missing or drifted seed rows or user associations block
contraction; a partial schema or any unexpected data always blocks it.

Execute Plans 1–4 in order. A draft PR may exist while KID-24 is active, but
final integration and acceptance require its merged baseline. Within a plan,
parallel work is allowed only for
tasks with disjoint files and explicit contracts already committed by an
earlier task. Pre-launch contraction starts only after the session interaction
and durable runtime acceptance gates pass; an unexpected legacy database row is
a stop condition that requires a design/plan amendment.

## Release-Train Gate

Before the next schema or deployment change, run:

```bash
git branch --show-current
git merge-base --is-ancestor develop HEAD
cat VERSION
git show origin/main:VERSION
git show origin/develop:VERSION
```

Expected for this plan: the current isolated branch, local/develop open train
`0.1.30`, and no request to create another release train. Re-fetch and stop for
plan refresh if remote release state changed. The branch-only control schema
was never deployed, so additive reconstruction uses compatible `db:push`; Plan
4 then uses one explicitly approved `db:push --accept-data-loss` only after the
target-database preflight proves the legacy tables contain no execution data.
Neither step needs a production backfill or version bump.

## Cross-Plan Verification Matrix

| Invariant | Plan 1 | Plan 2 | Plan 3 | Plan 4 |
|---|---:|---:|---:|---:|
| Exact CopilotKit/AG-UI train | guard | build/canary | regression | scheduled canary |
| No browser-trusted organization/authority | service/HTTP | gateway | runtime | scanner |
| One AgentOS conversation store, no legacy/vendor duplicate | schema gate | product test | regression | legacy deletion |
| Empty surface/history/reconnect write nothing | service test | browser test | regression | production smoke |
| First run creates session graph plus first event | real PostgreSQL | AG-UI test | regression | smoke |
| Every execution owns session/task | schema + repository | regression | durable test | scanner |
| Canonical resource names; no raw cross-boundary DB IDs | shared contract + scanner | gateway/UI | runtime/operations | legacy-boundary scanner |
| Owner input ports shared by HTTP/Agent/Operation adapters | architecture contract | initial capability | full dispatch | scanner |
| Operations never dispatch business work through Agent capability registry | service contract | regression | durable test | scanner |
| Same thread in panel/workspace | connection contract | full test | progress test | smoke |
| Mutation remains policy/HITL gated | policy contract | read slice | full matrix | smoke |
| Browser/gateway/API Operations restart recovery | connection test | gateway | durable run | load/DR |
| No dedicated answer expansion | contract | component test | regression | scanner |
| Legacy path absent | coexistence guard | coexistence guard | coexistence guard | deletion |

## Universal Commands

Run focused tests from each task first. Before each plan is accepted, run its
listed gates plus all applicable repository gates:

```bash
npm run build --workspace=packages/shared
npm run build --workspace=apps/interaction-gateway
npm run build --workspace=apps/web
npm run dev:server
npm run check:idor
npm run check:tenant-scope
npm run check:conventions
```

Schema tasks additionally run:

```bash
npm run db:push
npx prisma generate
npm run db:erd
npm run check:schema-artifact-sync
```

Expected: finite commands exit 0 and `dev:server` reaches normal Nest API
readiness with `AgentOsHttpModule` initialized, then is stopped. The
controller-free Agent worker root must boot without interaction HTTP secrets or
an Operations lifecycle owner until Plan 4 removes it; final acceptance instead
proves that no Agent worker entrypoint, package command, or deployment service
exists.

## Global Stop Conditions

Stop instead of adding a compatibility layer when:

- the supported CopilotKit train cannot create, resume, or reconnect the same
  session-backed thread;
- the OSS runtime requires Enterprise Intelligence, a hosted project, Premium
  credentials, or `useThreads` for the selected interaction path;
- Nest-derived organization/user ownership cannot fence thread access;
- first-run concurrency can create duplicate sessions or root tasks;
- HITL resume can duplicate a capability invocation or accept a stale
  decision;
- a selected durable runtime cannot persist and inspect a handle after the
  API-owned Operations lifecycle restarts;
- an HTTP, AG-UI, event, or cross-domain contract requires an untyped raw
  database UUID instead of a canonical resource name;
- deterministic work can run only by creating AgentOS state, or an Operations
  worker must call the Agent capability registry to reach a business use case;
- a legacy non-session AgentRun caller cannot be classified as deterministic
  owner work or official session-based judgment;
- a requirement would create a second user-visible transcript instead of the
  canonical AgentOS event store;
- production would require permanent dual write; or
- the public fork would need long-lived product divergence.

Record the failed proof on KID-25 and amend the design and plans before work
resumes.

## Completion Definition

- [ ] Plan 1 proves atomic/idempotent first-run control plus first-event
  creation, read-only bootstrap/replay behavior, and the identifier/resource-
  name contract.
- [ ] Plan 2 proves global panel, first submit, same-session continuation, new
  conversation, reconnect, and safe read/render behavior.
- [ ] Plan 3 proves policy-gated durable work survives browser, gateway, and
  API-owned Operations lifecycle restarts with approval, retry, and
  cancellation while preserving the capability/use-case/operation dependency
  direction.
- [ ] Plan 4 proves backup/restore, retention/deletion, upgrade canary,
  production ingress, and absence of legacy paths.
- [ ] Architecture, environment, deployment, ownership, SBOM, license, and
  platform matrix documentation match the shipped topology.
- [ ] The final codebase contains one conversation system: CopilotKit OSS +
  AG-UI presentation over KidItem-owned AgentOS/PostgreSQL persistence and
  Operations-backed durable execution.
