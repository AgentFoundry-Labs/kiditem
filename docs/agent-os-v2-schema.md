# Agent OS v2 Schema Design

Status: approved design, pre-implementation
Date: 2026-05-07
Owner platform: `apps/server/src/agent-os`

This document defines the target schema and backend ownership boundary for the
Agent OS complete replacement track. It replaces the legacy
`AgentDefinition + AgentTask + AgentWakeupRequest + HeartbeatRun + AgentEvent`
model with a run-centric Agent OS.

## Why This Exists

The current Agent OS stores too many concerns in the same places:

- `AgentDefinition` mixes catalog definition, organization-owned instance,
  tool policy, budget, hierarchy, and runtime state.
- `AgentTask` is a legacy public task envelope.
- `HeartbeatRun` is the accepted execution record, but trace lookup still goes
  through `AgentTask -> AgentWakeupRequest.legacyTaskId -> HeartbeatRun`.
- `HeartbeatService` coordinates queueing, execution, permissions, safety,
  transcript, runtime state, and legacy task sync in one large service.

The v2 design removes `AgentTask`, `HeartbeatRun`, and legacy task markers as
sources of truth. The central execution unit becomes `AgentRun`.

## References Used

- Dify agent workflow runtime at
  `langgenius/dify@7e6745e105771a87853e1016bc241a2024629639`
  - strategy/provider resolution
  - runtime parameters separate from log-safe parameters
  - tool credential references
- Paperclip agent runtime at
  `paperclipai/paperclip@d0e9cc76f2eb114ed63d398ee0a0185d64bff852`
  - wakeup request separated from accepted run
  - task session key per agent/runtime/task
  - run-local event timeline with `runId + seq`
  - external full-log metadata instead of storing full logs in Postgres
- Supabase/Postgres guidance
  - FK columns need leading indexes
  - worker queue claims use `FOR UPDATE SKIP LOCKED`
  - composite indexes put equality columns before range/sort columns
  - JSONB is for snapshots; query predicates should be columns
  - money/cost should not use float

## Owner Boundary

Agent OS v2 should be a top-level backend owner platform:

```text
apps/server/src/agent-os/
  agent-os.module.ts
  domain/
    model/
    policy/
  application/
    service/
    port/in/
    port/out/
  adapter/
    in/http/
    in/workflow/
    out/repository/
    out/runtime/
    out/log-store/
```

Ownership:

- `agent-os/` owns agent catalog, instances, execution requests, run execution,
  runtime state, tool policy, approvals, authorization audit, cost ledger, run
  events, and log references.
- `automation/workflows` depends on Agent OS through `AgentRunnerPort`.
- `rules`, `sourcing`, `advertising`, and `ai` depend on Agent OS through
  ports, not concrete services.
- `automation/` keeps workflow orchestration, action board, alerts, marketplace
  install/catalog surfaces, and panel projection.
- Legacy `agent-registry/` is a deletion candidate. If a temporary route
  compatibility surface is needed, keep it thin and delegate into `agent-os`.

`apps/server/AGENTS.md` must be updated in the implementation PR so the backend
owner-domain table lists `agent-os` as its own platform owner.

## Model Overview

```text
AgentBlueprint
  └─< AgentBlueprintToolPolicy
  └─< AgentInstance
        ├─1 AgentRuntimeState
        ├─< AgentInstanceToolPolicy
        ├─< AgentTaskSession
        ├─< AgentRunRequest
        │     ├─ self-FK coalescedIntoRequest
        │     ├─< AgentRun
        │     │     ├─< AgentRunEvent
        │     │     └─< AgentCostEvent
        │     ├─< AgentAuthorizationEvent
        │     └─< AgentApprovalRequest
        └─< User(type='agent')
```

State machine:

```text
AgentRunRequest
queued -> claimed -> finished
       -> coalesced
       -> deferred -> queued
       -> skipped
       -> failed

AgentRun
running -> succeeded
        -> failed
        -> timed_out
        -> cancelled
```

Queue state belongs to `AgentRunRequest`. Execution state belongs to `AgentRun`.
`AgentRun` never has a `queued` status.

## Prisma Model Draft

The blocks below are intentionally close to Prisma. Exact relation names can be
adjusted during implementation, but ownership, nullability, and indexes are
part of the design.

### AgentBlueprint

Global catalog definition. This replaces the global/template side of
`AgentDefinition`.

```prisma
model AgentBlueprint {
  id                    String   @id @default(uuid()) @db.Uuid
  type                  String   @unique
  name                  String
  description           String?
  promptPath            String   @map("prompt_path")
  defaultAdapterType    String   @map("default_adapter_type")
  defaultModel          String   @map("default_model")
  defaultRuntimeConfig  Json     @default("{}") @map("default_runtime_config") @db.JsonB
  defaultCapabilities   Json     @default("{}") @map("default_capabilities") @db.JsonB
  catalogStatus         String   @default("active") @map("catalog_status")
  marketplaceId         String?  @map("marketplace_id") @db.Uuid
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt             DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  marketplace Marketplace? @relation(fields: [marketplaceId], references: [id], onDelete: SetNull)
  instances   AgentInstance[]
  toolPolicies AgentBlueprintToolPolicy[]

  @@index([catalogStatus])
  @@index([marketplaceId])
  @@map("agent_blueprints")
}
```

Rules:

- `defaultModel` is required. No runtime may silently choose a model when the
  blueprint and instance do not resolve to one.
- Prompt body stays in `agent-config/prompts/`; the database stores paths only.

### AgentInstance

Organization-owned runnable subject. This replaces the tenant-owned side of
`AgentDefinition`.

```prisma
model AgentInstance {
  id                 String    @id @default(uuid()) @db.Uuid
  organizationId     String    @map("organization_id") @db.Uuid
  blueprintId        String    @map("blueprint_id") @db.Uuid
  type               String
  name               String
  role               String    @default("specialist")
  title              String?
  icon               String?
  reportsToId        String?   @map("reports_to_id") @db.Uuid
  lifecycleStatus    String    @default("active") @map("lifecycle_status")
  pauseReason        String?   @map("pause_reason")
  pausedAt           DateTime? @map("paused_at") @db.Timestamptz
  trustLevel         Int       @default(0) @map("trust_level")
  adapterType        String    @map("adapter_type")
  modelOverride      String?   @map("model_override")
  adapterConfig      Json      @default("{}") @map("adapter_config") @db.JsonB
  runtimeConfig      Json      @default("{}") @map("runtime_config") @db.JsonB
  promptPathOverride String?   @map("prompt_path_override")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  blueprint    AgentBlueprint @relation(fields: [blueprintId], references: [id], onDelete: Restrict)
  parent       AgentInstance? @relation("AgentInstanceHierarchy", fields: [reportsToId], references: [id], onDelete: SetNull)
  children     AgentInstance[] @relation("AgentInstanceHierarchy")
  runtimeState AgentRuntimeState?
  requests     AgentRunRequest[]
  runs         AgentRun[]
  sessions     AgentTaskSession[]
  instanceToolPolicies AgentInstanceToolPolicy[]
  agentUsers   User[]

  @@unique([organizationId, type])
  @@index([organizationId])
  @@index([blueprintId])
  @@index([reportsToId])
  @@index([organizationId, lifecycleStatus])
  @@index([organizationId, reportsToId])
  @@map("agent_instances")
}
```

Rules:

- `lifecycleStatus` stores operator-controlled state only:
  `active | paused | disabled`.
- `running` and `idle` are derived from current runs and runtime state.
- Effective model is `modelOverride ?? blueprint.defaultModel`. The fallback is
  explicit catalog configuration, not a hardcoded runtime default.

### AgentRuntimeState

One row per instance for frequently changing runtime state. This replaces
`AgentDefinition.rt_*`.

```prisma
model AgentRuntimeState {
  id                      String    @id @default(uuid()) @db.Uuid
  organizationId          String    @map("organization_id") @db.Uuid
  agentInstanceId         String    @unique @map("agent_instance_id") @db.Uuid
  lastRunId               String?   @map("last_run_id") @db.Uuid
  lastRunStatus           String?   @map("last_run_status")
  lastError               String?   @map("last_error") @db.Text
  lastHeartbeatAt         DateTime? @map("last_heartbeat_at") @db.Timestamptz
  consecutiveFailureCount Int       @default(0) @map("consecutive_failure_count")
  totalInputTokens        Int       @default(0) @map("total_input_tokens")
  totalOutputTokens       Int       @default(0) @map("total_output_tokens")
  totalCostMicros         BigInt    @default(0) @map("total_cost_micros")
  stateJson               Json      @default("{}") @map("state_json") @db.JsonB
  createdAt               DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt               DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  lastRun       AgentRun?     @relation("AgentRuntimeStateLastRun", fields: [lastRunId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@index([lastRunId])
  @@map("agent_runtime_states")
}
```

Rules:

- `AgentCostEvent` is the source of truth for cost.
- `totalCostMicros` is an aggregate cache and must update in the same
  transaction as cost ledger inserts.

### AgentTaskSession

Per-task runtime session. This replaces single `rtSessionId`.

```prisma
model AgentTaskSession {
  id                String   @id @default(uuid()) @db.Uuid
  organizationId    String   @map("organization_id") @db.Uuid
  agentInstanceId   String   @map("agent_instance_id") @db.Uuid
  adapterType       String   @map("adapter_type")
  taskKey           String   @map("task_key")
  sessionParamsJson Json?    @map("session_params_json") @db.JsonB
  sessionDisplayId  String?  @map("session_display_id")
  lastRunId         String?  @map("last_run_id") @db.Uuid
  lastError         String?  @map("last_error") @db.Text
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  lastRun       AgentRun?     @relation(fields: [lastRunId], references: [id], onDelete: SetNull)

  @@unique([organizationId, agentInstanceId, adapterType, taskKey])
  @@index([organizationId, agentInstanceId, updatedAt])
  @@index([agentInstanceId])
  @@index([lastRunId])
  @@map("agent_task_sessions")
}
```

Rules:

- `taskKey` is non-null. If the caller has no specific key, it must pass the
  explicit semantic key `default`.
- Session parameters must not contain provider credentials.

### AgentRunRequest

Durable request inbox, queue, dedupe, and audit record. This replaces
`AgentWakeupRequest`.

```prisma
model AgentRunRequest {
  id                       String    @id @default(uuid()) @db.Uuid
  organizationId           String    @map("organization_id") @db.Uuid
  agentInstanceId          String    @map("agent_instance_id") @db.Uuid
  source                   String
  triggerDetail            String?   @map("trigger_detail")
  reason                   String?
  idempotencyKey           String?   @map("idempotency_key")
  sourceWorkflowRunId      String?   @map("source_workflow_run_id") @db.Uuid
  sourceWorkflowNodeId     String?   @map("source_workflow_node_id")
  sourceResourceType       String?   @map("source_resource_type")
  sourceResourceId         String?   @map("source_resource_id")
  requestedByActorType     String?   @map("requested_by_actor_type")
  requestedByActorId       String?   @map("requested_by_actor_id")
  payloadSnapshot          Json?     @map("payload_snapshot") @db.JsonB
  status                   String    @default("queued")
  coalescedIntoRequestId   String?   @map("coalesced_into_request_id") @db.Uuid
  requestedAt              DateTime  @default(now()) @map("requested_at") @db.Timestamptz
  claimedAt                DateTime? @map("claimed_at") @db.Timestamptz
  finishedAt               DateTime? @map("finished_at") @db.Timestamptz
  error                    String?   @db.Text
  createdAt                DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  sourceWorkflowRun WorkflowRun? @relation(fields: [sourceWorkflowRunId], references: [id], onDelete: SetNull)
  coalescedIntoRequest AgentRunRequest? @relation("AgentRunRequestCoalescing", fields: [coalescedIntoRequestId], references: [id], onDelete: SetNull)
  coalescedRequests AgentRunRequest[] @relation("AgentRunRequestCoalescing")
  runs AgentRun[]
  authorizationEvents AgentAuthorizationEvent[]
  approvalRequests AgentApprovalRequest[]

  @@index([organizationId, status, requestedAt])
  @@index([organizationId, agentInstanceId, status, requestedAt])
  @@index([agentInstanceId])
  @@index([sourceWorkflowRunId])
  @@index([coalescedIntoRequestId])
  @@unique([organizationId, agentInstanceId, idempotencyKey], where: raw("idempotency_key IS NOT NULL"))
  @@map("agent_run_requests")
}
```

Rules:

- Every request gets its own row.
- Coalesced requests point at the representative request via
  `coalescedIntoRequestId`; their source and payload are not lost.
- Claiming a queued request must use a Prisma tagged raw SQL statement with
  `FOR UPDATE SKIP LOCKED` and an `organization_id` predicate.
- `AgentRunRequest 1:N AgentRun`. Retries create additional runs under the same
  request.

### AgentRun

Accepted execution attempt. This replaces `HeartbeatRun` and the execution side
of `AgentTask`.

```prisma
model AgentRun {
  id                     String    @id @default(uuid()) @db.Uuid
  organizationId         String    @map("organization_id") @db.Uuid
  agentInstanceId        String    @map("agent_instance_id") @db.Uuid
  requestId              String    @map("request_id") @db.Uuid
  retryOfRunId           String?   @map("retry_of_run_id") @db.Uuid
  status                 String    @default("running")
  invocationSource       String    @map("invocation_source")
  adapterType            String    @map("adapter_type")
  model                  String
  taskKey                String?   @map("task_key")
  sessionDisplayIdBefore String?   @map("session_display_id_before")
  sessionDisplayIdAfter  String?   @map("session_display_id_after")
  startedAt              DateTime  @default(now()) @map("started_at") @db.Timestamptz
  finishedAt             DateTime? @map("finished_at") @db.Timestamptz
  heartbeatAt            DateTime? @map("heartbeat_at") @db.Timestamptz
  exitCode               Int?      @map("exit_code")
  signal                 String?
  errorCode              String?   @map("error_code")
  error                  String?   @db.Text
  usageJson              Json?     @map("usage_json") @db.JsonB
  resultJson             Json?     @map("result_json") @db.JsonB
  logStore               String?   @map("log_store")
  logRef                 String?   @map("log_ref")
  logSha256              String?   @map("log_sha256")
  logBytes               BigInt?   @map("log_bytes")
  logCompressed          Boolean   @default(false) @map("log_compressed")
  stdoutExcerpt          String?   @map("stdout_excerpt") @db.Text
  stderrExcerpt          String?   @map("stderr_excerpt") @db.Text
  lastEventSeq           Int       @default(0) @map("last_event_seq")
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt              DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  request       AgentRunRequest @relation(fields: [requestId], references: [id], onDelete: Restrict)
  retryOfRun    AgentRun? @relation("AgentRunRetry", fields: [retryOfRunId], references: [id], onDelete: SetNull)
  retries       AgentRun[] @relation("AgentRunRetry")
  events        AgentRunEvent[]
  costEvents    AgentCostEvent[]
  authorizationEvents AgentAuthorizationEvent[]
  approvalRequests AgentApprovalRequest[]
  runtimeStateLastRun AgentRuntimeState[] @relation("AgentRuntimeStateLastRun")

  @@index([organizationId, agentInstanceId, startedAt])
  @@index([organizationId, status, startedAt])
  @@index([requestId])
  @@index([agentInstanceId])
  @@index([retryOfRunId])
  @@map("agent_runs")
}
```

Rules:

- `requestId` is non-null.
- `status` starts at `running`; queueing is represented by `AgentRunRequest`.
- Full stdout/stderr does not live in Postgres. Use log refs plus excerpts.
- Event append must increment `lastEventSeq` transactionally before inserting
  `AgentRunEvent`.

### AgentRunEvent

Run-local structured timeline.

```prisma
model AgentRunEvent {
  id              BigInt   @id @default(autoincrement())
  organizationId  String   @map("organization_id") @db.Uuid
  runId           String   @map("run_id") @db.Uuid
  agentInstanceId String   @map("agent_instance_id") @db.Uuid
  seq             Int
  eventType       String   @map("event_type")
  level           String?
  stream          String?
  message         String?  @db.Text
  payload         Json?    @db.JsonB
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  run           AgentRun      @relation(fields: [runId], references: [id], onDelete: Cascade)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)

  @@unique([runId, seq])
  @@index([organizationId, runId, seq])
  @@index([organizationId, createdAt])
  @@index([agentInstanceId])
  @@map("agent_run_events")
}
```

Rules:

- Use for status, stdout/stderr excerpts, tool call, model, thought, safety, and
  fallback events.
- Do not store bulk logs here.
- Default retention target: detailed events for 30 days, terminal summary on
  `AgentRun` retained longer.

### AgentCostEvent

Billing ledger. This is the source of truth for costs.

```prisma
model AgentCostEvent {
  id                String   @id @default(uuid()) @db.Uuid
  organizationId    String   @map("organization_id") @db.Uuid
  requestId         String   @map("request_id") @db.Uuid
  runId             String   @map("run_id") @db.Uuid
  agentInstanceId   String   @map("agent_instance_id") @db.Uuid
  provider          String?
  model             String
  biller            String?
  billingType       String?  @map("billing_type")
  inputTokens       Int      @default(0) @map("input_tokens")
  outputTokens      Int      @default(0) @map("output_tokens")
  cachedInputTokens Int      @default(0) @map("cached_input_tokens")
  costMicros        BigInt   @default(0) @map("cost_micros")
  metadata          Json?    @db.JsonB
  occurredAt        DateTime @default(now()) @map("occurred_at") @db.Timestamptz
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  request       AgentRunRequest @relation(fields: [requestId], references: [id], onDelete: Restrict)
  run           AgentRun      @relation(fields: [runId], references: [id], onDelete: Cascade)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)

  @@index([organizationId, occurredAt])
  @@index([organizationId, agentInstanceId, occurredAt])
  @@index([requestId])
  @@index([runId])
  @@index([agentInstanceId])
  @@map("agent_cost_events")
}
```

Rules:

- Never use float for costs.
- Insert cost events and update `AgentRuntimeState.total*` in the same
  transaction.

### Tool Policy

KidItem uses a safe business-tool catalog, not a generic arbitrary HTTP/DB tool
marketplace.

```prisma
model AgentToolDefinition {
  id              String   @id @default(uuid()) @db.Uuid
  key             String   @unique
  name            String
  description     String?
  riskLevel       String   @map("risk_level")
  credentialKind  String   @default("none") @map("credential_kind")
  inputSchemaJson Json?    @map("input_schema_json") @db.JsonB
  outputSchemaJson Json?   @map("output_schema_json") @db.JsonB
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  blueprintPolicies AgentBlueprintToolPolicy[]
  instancePolicies  AgentInstanceToolPolicy[]
  authorizationEvents AgentAuthorizationEvent[]

  @@index([riskLevel])
  @@index([isActive])
  @@map("agent_tool_definitions")
}

model AgentBlueprintToolPolicy {
  id              String   @id @default(uuid()) @db.Uuid
  blueprintId     String   @map("blueprint_id") @db.Uuid
  toolId          String   @map("tool_id") @db.Uuid
  effect          String
  approvalMode    String   @default("none") @map("approval_mode")
  dryRunMode      String   @default("optional") @map("dry_run_mode")
  constraintsJson Json?    @map("constraints_json") @db.JsonB
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  blueprint AgentBlueprint @relation(fields: [blueprintId], references: [id], onDelete: Cascade)
  tool      AgentToolDefinition @relation(fields: [toolId], references: [id], onDelete: Cascade)

  @@unique([blueprintId, toolId])
  @@index([toolId])
  @@map("agent_blueprint_tool_policies")
}

model AgentInstanceToolPolicy {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  agentInstanceId String   @map("agent_instance_id") @db.Uuid
  toolId          String   @map("tool_id") @db.Uuid
  effect          String
  approvalMode    String   @default("none") @map("approval_mode")
  dryRunMode      String   @default("optional") @map("dry_run_mode")
  constraintsJson Json?    @map("constraints_json") @db.JsonB
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  tool          AgentToolDefinition @relation(fields: [toolId], references: [id], onDelete: Cascade)

  @@unique([organizationId, agentInstanceId, toolId])
  @@index([agentInstanceId])
  @@index([toolId])
  @@map("agent_instance_tool_policies")
}
```

Policy resolution:

```text
effective policy =
  AgentBlueprintToolPolicy
  overridden by AgentInstanceToolPolicy

instance overrides may narrow by default.
instance widening requires an admin-only action and AgentAuthorizationEvent.
deny wins unless the widening path explicitly allows otherwise.
```

### AgentAuthorizationEvent

Security and policy decision audit. This is separate from `AgentRunEvent`
because authorization can happen before a run exists.

```prisma
model AgentAuthorizationEvent {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  requestId       String?  @map("request_id") @db.Uuid
  runId           String?  @map("run_id") @db.Uuid
  agentInstanceId String   @map("agent_instance_id") @db.Uuid
  actorType       String?  @map("actor_type")
  actorId         String?  @map("actor_id")
  action          String
  decision        String
  reasonCode      String?  @map("reason_code")
  toolId          String?  @map("tool_id") @db.Uuid
  resourceType    String?  @map("resource_type")
  resourceId      String?  @map("resource_id")
  policySnapshot  Json?    @map("policy_snapshot") @db.JsonB
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization  Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  request       AgentRunRequest? @relation(fields: [requestId], references: [id], onDelete: SetNull)
  run           AgentRun?     @relation(fields: [runId], references: [id], onDelete: SetNull)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  tool          AgentToolDefinition? @relation(fields: [toolId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([organizationId, agentInstanceId, createdAt])
  @@index([requestId])
  @@index([runId])
  @@index([toolId])
  @@map("agent_authorization_events")
}
```

Rules:

- Runtime authorization events should include `requestId`.
- Non-runtime admin actions, such as an explicit policy widening, may have no
  `requestId` and must still write an authorization event.

### AgentApprovalRequest

Human approval state.

```prisma
model AgentApprovalRequest {
  id                     String    @id @default(uuid()) @db.Uuid
  organizationId         String    @map("organization_id") @db.Uuid
  requestId              String    @map("request_id") @db.Uuid
  runId                  String?   @map("run_id") @db.Uuid
  agentInstanceId        String    @map("agent_instance_id") @db.Uuid
  requestedByActorType   String?   @map("requested_by_actor_type")
  requestedByActorId     String?   @map("requested_by_actor_id")
  approverUserId         String?   @map("approver_user_id") @db.Uuid
  status                 String    @default("pending")
  reasonCode             String?   @map("reason_code")
  prompt                 String?   @db.Text
  actionSnapshot         Json?     @map("action_snapshot") @db.JsonB
  expiresAt              DateTime? @map("expires_at") @db.Timestamptz
  decidedAt              DateTime? @map("decided_at") @db.Timestamptz
  decisionReason         String?   @map("decision_reason") @db.Text
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt              DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  request       AgentRunRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  run           AgentRun?    @relation(fields: [runId], references: [id], onDelete: SetNull)
  agentInstance AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  approver      User?       @relation(fields: [approverUserId], references: [id], onDelete: SetNull)

  @@index([organizationId, status, createdAt])
  @@index([organizationId, approverUserId, status])
  @@index([requestId])
  @@index([runId])
  @@index([agentInstanceId])
  @@index([approverUserId])
  @@map("agent_approval_requests")
}
```

Rules:

- `AgentRunRequest.status = deferred` while approval is pending.
- Approval can move the same request back to `queued`; rejection moves it to
  `skipped` or `failed` with an authorization event.

## Legacy Replacement Mapping

| Legacy | v2 |
|---|---|
| `AgentDefinition` global template fields | `AgentBlueprint` |
| `AgentDefinition` tenant-owned instance fields | `AgentInstance` |
| `AgentDefinition.rt_*` | `AgentRuntimeState` + `AgentTaskSession` |
| `AgentTask` | removed |
| `AgentWakeupRequest` | `AgentRunRequest` |
| `HeartbeatRun` | `AgentRun` |
| `AgentEvent` | `AgentRunEvent` or `AgentAuthorizationEvent` |
| `AgentLog` | external log store + `AgentRun` excerpts/log ref |
| `User.agentDefinitionId` | `User.agentInstanceId` |
| `Marketplace.installedAgents` | `AgentBlueprint.marketplaceId` and/or marketplace install records |

## Application Services

Keep application services cohesive. Do not create one service per table.

```text
AgentCatalogService
  Blueprint, instance, hierarchy, and tool policy management.

AgentRunCoordinator
  Request creation, idempotency, coalescing, approval/defer, and queue claim.

AgentRunExecutor
  Accepted run creation, adapter execution, retry, timeout, and terminal state.

AgentPolicyService
  RBAC/ABAC/ReBAC-shaped decisions, effective tool policy resolution, approval
  requirement, force dry run, budget block, and authorization events.

AgentObservabilityService
  Run event append, external log refs, cost ledger, runtime state aggregates,
  and read models for run history/timeline.
```

Ports:

```text
AgentRunnerPort
AgentOsRepositoryPort
AgentRuntimeAdapterPort
AgentLogStorePort
```

## Queue Claim Pattern

Use Postgres as the durable queue. Do not add Redis/SQS/Kafka for v2.

Claim should be one tagged raw SQL statement, scoped by organization when the
worker has an organization scope and otherwise carefully bounded by worker
selection policy:

```sql
UPDATE agent_run_requests
SET status = 'claimed', claimed_at = now(), updated_at = now()
WHERE id = (
  SELECT id
  FROM agent_run_requests
  WHERE status = 'queued'
  ORDER BY requested_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

Production code must use Prisma tagged templates, not unsafe raw SQL.

## Test Plan

First implementation PR should include:

- Schema tests and generation gates.
- Pure unit tests for policy resolution.
- Integration tests for:
  - idempotency partial unique
  - concurrent `FOR UPDATE SKIP LOCKED` claim
  - concurrent `AgentRunEvent` append sequence
  - cost ledger insert plus runtime aggregate transaction
  - request approval/defer persistence

Runtime adapter execution tests can land in a later PR after the service
implementation exists.

Required gates:

```bash
npm run db:push
npx prisma generate
npm run graphify:schema
npm run check:idor
npm run check:tenant-scope
npm run dev:server
```

Schema changes also require `packages/shared` contract updates and
`npm run build --workspace=apps/web` once frontend consumers are rewired.

## Performance Rules

- FK columns must have leading indexes.
- Expected composite indexes are part of the first implementation, not a
  follow-up.
- List endpoints use cursor pagination.
- JSONB is for payload/result/context snapshots only.
- Query predicates such as status, source, workflow run id, resource type/id,
  model, and agent instance id are columns.
- Bulk logs live outside Postgres. Postgres stores excerpts and log refs.
- Cost ledger is exact integer micros, not floating point.

## Not In Scope

- Redis/SQS/Kafka queue infrastructure.
- Dify-style generic plugin marketplace.
- Generic HTTP/DB tools exposed to agents.
- OPA/Cedar/SpiceDB policy engine.
- PostgreSQL RLS.
- Legacy `AgentTask` API compatibility.

## Implementation Order

1. Update instruction/architecture docs for `agent-os` owner boundary.
2. Replace Prisma Agent OS models.
3. Run `db:push`, `prisma generate`, ERD/Graphify regeneration.
4. Add shared subpath contracts for Agent OS v2.
5. Implement `agent-os` module, repository adapter, and five application services.
6. Rewire workflow and business-domain ports to the new `AgentRunnerPort`.
7. Remove legacy `agent-registry`, `AgentTask`, `HeartbeatRun`, and trace path.
8. Rebuild web admin/run trace UI against run-centric contracts.
