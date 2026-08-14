# AgentOS Durable Session Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manage immutable Agent definitions and versions, then execute every session task through a policy-derived, durable, resumable runtime without creating another conversation lifecycle or transcript store.

**Architecture:** KidItem keeps deployable Agent definitions in the code-owned registry and publishes an immutable `AgentVersion` manifest that binds model, runtime, prompt, skills, capabilities, delegation limits, and hashes. Every run has separate branded session, task, execution, attempt, and runtime-handle identities and canonical cross-plane resource names. Capabilities are rebuilt from the selected version and policy snapshot for each execution; they are Agent-facing adapters into owner use cases and are never inherited from the browser, parent agent, plugin, or runtime. Operations owns leases/checkpoints/dispatch, while AgentOS owns the task tree, delegation, policy, approval, artifacts, usage, and terminal reconciliation. Operations handlers call owner input ports, never the Agent capability registry.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Operations lease worker, CopilotKit/AG-UI, Hermes HTTP/ACP, isolated Codex and Claude CLI processes, MCP, Zod, Vitest, Testcontainers, Playwright

---

## Prerequisites And Boundaries

- Complete the foundation and AgentSession interaction vertical-slice plans first.
- The first submitted message already creates `AgentSession`, its root
  `AgentSessionTask`, context epoch, policy snapshot, and `AgentExecution`.
  This plan never adds promotion, a lightweight conversation class, idle
  rotation, or a second root binding.
- The Foundation/vertical slice already made AgentOS/PostgreSQL the canonical
  user-visible conversation event, replay, and reconnect store. This plan
  appends runtime progress/HITL/artifact/terminal events through that same
  store and never creates another transcript or memory system.
- `AgentSessionTask` is the task model. Do not restore the retired `AgentTask`.
- Every `AgentExecution` has non-null `sessionId` and `sessionTaskId`.
- Opening a surface, listing sessions, reconnecting, or inspecting status is
  read-only. A new execution is created only for a submitted run, explicit
  retry/resume, scheduled task resume, or delegated child task.
- Session creation grants no mutation authority. Every capability call is
  checked against the execution policy snapshot; elevated calls use their own
  HITL approval.
- Missing model, runtime, handler, runtime capability, prompt, skill, schema,
  or policy configuration is an explicit error. There is no fallback runtime
  and no production no-op path.
- Existing KidItem registries/adapters are evidence and migration inputs, not
  architecture constraints. Retain an implementation only when its semantics
  exactly satisfy this target; otherwise replace it behind the new tests.
- Operations owns `OperationRun`, lease, attempt envelope, checkpoint,
  scheduling, dispatch, and cancellation transport. AgentOS owns task
  semantics and runtime-native handles.
- The AgentOS-owned `agent-os.execute-session-task` Operation resumes the
  AgentOS task-execution input port only. It does not itself invoke a business
  capability. Business capability calls remain inside an authorized official
  execution and enter the owning domain through its Agent incoming adapter.
- A deterministic business operation executes through its owning-domain input
  port and does not require an AgentSession. Its Operation handler must not
  import `AgentCapabilityRegistry` or an AgentOS runtime service.
- Remove the generic non-session AgentRun route. Classify each former caller as
  owner-domain synchronous work, owner-domain durable Operation, or official
  AgentSession judgment; there is no fourth compatibility path.
- Consume Foundation's branded ID/resource-name contract. Internal repository
  ports use branded IDs, cross-plane commands/events use canonical names,
  external runtime handles stay opaque, and Operation/request/idempotency/
  sequence/token identities remain distinct.
- Runtime credentials and config homes are per execution, short-lived, and
  capability-scoped. They are never sent to the browser or stored in an
  `OperationRun.result` JSON object.

## Research-Derived Agent Management Decisions

The implementation review of `/Users/dev125/workspace/claudecode` and the
runtime/process implementation in `/Users/dev125/workspace/gstack` produced
the following concrete decisions. These are translated to a multi-tenant
server; they are not a request to copy either tool's local filesystem format.
Identifier evidence came specifically from Claude Code's branded parsers in
`src/types/ids.ts`, request/cancel correlation in `src/cli/structuredIO.ts`,
session/message parentage in `src/utils/sessionStorage.ts`, agent aliases in
`src/state/AppStateStore.ts`, and internal-only handle prefixes in its task and
remote-agent paths.

| Observed implementation pattern | KidItem decision |
|---|---|
| Agent definition and spawned Agent identity are separate (`agentType` versus per-spawn `agentId`/task/transcript metadata). | Keep the stable definition key, immutable version identity, session/task/execution/attempt resource names, and opaque runtime handle as distinct required identities. |
| Claude Code brands/parses `SessionId` and `AgentId` instead of passing arbitrary strings. | Use the focused shared Zod identifier package and parse only at adapters; no generic `Id` alias or unchecked cast. |
| Structured I/O carries `request_id` separately for request, cancellation, and response correlation. | Keep UUIDv4 request IDs separate from resources and scoped command idempotency keys. |
| Local task/agent handles may be prefixed, while public remote IDs remain raw protocol values. | Prefixes are optional for ephemeral developer handles only; durable public KidItem references use hierarchical resource names. |
| A worker's tools are rebuilt from its own Agent policy; parent approvals do not leak into the child. | Build every execution capability set only from `AgentVersion` plus `AgentPolicySnapshot`; delegation passes a subset request, never an inherited tool array. |
| Third-party plugin Agents cannot silently add permission mode, hooks, or MCP servers. | Runtime adapters and future extension packages may declare transport capabilities only. Agent authority, hooks, capability handlers, and MCP exposure remain code-owned Nest registries. |
| Agent definitions bind prompt, model, tools, skills, limits, isolation, and memory policy; invalid definitions are filtered or rejected. | Publish a strict, hashed runtime manifest and fail deployment readiness on any invalid active definition. Do not load production Agents from user/project markdown. |
| Resume uses persisted Agent metadata and sidechain identity rather than creating an unrelated worker. | Persist attempt and opaque handle metadata, inspect before reconnect, and never start a replacement external run when a handle exists but cannot be reconciled. |
| Concurrent in-process workers use isolated identity context, and team members have an explicit parent session. | Pass correlation IDs explicitly through ports and use `AsyncLocalStorage` only for logging convenience, never as authorization or persistence authority. |
| Teams keep a flat, explicit roster and block uncontrolled nested spawning. | Only versions with `delegationRole='orchestrator'` may delegate; target allowlists, maximum depth, maximum children, and idempotency are server-owned. |
| Read-only Agents remove write tools in code, not merely in prompt prose. | `sideEffects=['read']` and approval policy are enforced by the capability router. Prompts are guidance, never the security boundary. |
| Persistent free-form memory has explicit user/project/local scopes. | KID-25 adds no free-form Agent memory. Conversation history remains in the canonical AgentOS event log; runtime memory is limited to structured task, checkpoint, approval, artifact, and validated handoff state. |
| gstack isolates its PTY Agent in a separate process, uses a stable session ID plus one-use attach tokens, and generation-fences stale reconnect requests. | Isolate CLI runtimes from gateway/web, keep stable execution/attempt identity separate from short-lived connect credentials, and reject stale handle generations after supervisor restart. |
| gstack records `{pid, gen, startedAt}` and kills by verified identity rather than process-name matching. | Persist process start identity with the opaque runtime handle; never use `pkill -f`, command substrings, or PID alone as cancellation authority. |
| gstack dynamically discovers skills but CI checks validity, generated-file freshness, host portability, collisions, and size budgets. | Keep runtime skills code-owned, hash them into `AgentVersion`, validate every active definition at seed/readiness, and add inventory/collision/freshness gates before publication. |
| gstack's developer profile is personal preference state, separate from executable skills and terminal Agent sessions. | Do not mix user preference/personalization with Agent identity or authority; any future preferences are presentation inputs, never `AgentVersion` or policy grants. |

## File Map

| Path | Responsibility |
|---|---|
| `apps/server/src/agent-os/domain/agent-runtime-manifest.ts` | Strict code-owned Agent manifest and canonical hash |
| `apps/server/src/agent-os/domain/agent-definition.registry.ts` | Shipped definitions and delegation policy |
| `apps/server/src/agent-os/application/service/agent-version-publisher.service.ts` | Idempotent immutable version publication/activation |
| `packages/shared/src/agent-interaction/durable-runtime.ts` | Progress, approval, artifact, retry, resume, and cancel wire contracts |
| `prisma/models/agents.prisma` | Authority profile, task delegation, attempt/handle, approval, artifact, and immutable version manifest |
| `prisma/models/system.prisma` | Operations-owned checkpoints and task-keyed schedules |
| `apps/server/src/agent-os/application/service/agent-execution-context-builder.service.ts` | Policy-derived execution context and capability set |
| `apps/server/src/agent-os/application/port/in/agent-capability-invocation.port.ts` | Official session execution capability-invocation use case only |
| `apps/server/src/agent-os/application/service/agent-session-capability-invocation.service.ts` | Exact version/policy/registry recheck and owner Agent-adapter dispatch; no legacy AgentRun branch |
| `apps/server/src/agent-os/application/service/agent-session-delegation.service.ts` | Bounded, idempotent task delegation |
| `apps/server/src/agent-os/application/service/agent-runtime-adapter.registry.ts` | Exact runtime lookup and capability matching |
| `apps/server/src/agent-os/adapter/in/operation/agent-session-task.operation-handler.ts` | Durable task dispatch/recovery bridge |
| `apps/server/src/agent-os/adapter/out/runtime/` | Hermes and isolated CLI runtime adapters |
| `apps/server/src/agent-os/application/service/agent-session-approval.service.ts` | Invocation-scoped HITL decisions |
| `apps/web/src/components/agent-interaction/OfficialInteractionRenderers.tsx` | Shared task/progress/approval/artifact controls |

## Task 1: Publish Strict Immutable Agent Versions

**Files:**

- Create: `apps/server/src/agent-os/domain/agent-runtime-manifest.ts`
- Create: `apps/server/src/agent-os/domain/__tests__/agent-runtime-manifest.spec.ts`
- Modify: `apps/server/src/agent-os/domain/agent-os.types.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`
- Modify: `apps/server/src/agent-os/domain/agent-skill.registry.ts`
- Create: `apps/server/src/agent-os/application/port/out/repository/agent-version.repository.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/prisma-agent-version.repository.ts`
- Create: `apps/server/src/agent-os/application/service/agent-version-publisher.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-version-publisher.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-runtime-catalog-startup-validator.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-runtime-catalog-startup-validator.service.spec.ts`
- Modify: `apps/server/src/agent-os/seed-agent-os.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `prisma/models/agents.prisma`

- [ ] **Step 1: Write manifest and publication RED tests**

Cover all of these cases:

```typescript
it('hashes model, runtime, policy, delegation, prompt, skills, and schema', () => {
  const first = compileManifest(operatorFixture());
  const changed = compileManifest(operatorFixture({ maxTurns: 41 }));
  expect(first.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  expect(changed.manifestHash).not.toBe(first.manifestHash);
});

it('publishes the same manifest idempotently and versions a changed manifest', async () => {
  const v1 = await publisher.publishAndActivate(operatorFixture());
  expect((await publisher.publishAndActivate(operatorFixture())).id).toBe(v1.id);
  const v2 = await publisher.publishAndActivate(operatorFixture({ maxTurns: 41 }));
  expect(v2.version).toBe(v1.version + 1);
  expect(repository.activeFor('operator')).toEqual(v2);
});
```

Also reject a missing model/runtime, unknown or development-only skill, unknown
capability, duplicate definition key, leaf Agent with delegation targets,
orchestrator with an unknown target, zero/negative limits, mutable prompt path
outside `agent-config/`, and runtime-supplied hooks/MCP/tool grants.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/domain/__tests__/agent-runtime-manifest.spec.ts \
  src/agent-os/application/service/__tests__/agent-version-publisher.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-runtime-catalog-startup-validator.service.spec.ts
```

Expected: FAIL because the manifest compiler/publisher do not exist.

- [ ] **Step 3: Define the code-owned manifest**

Use a strict server-side type with this minimum shape:

```typescript
export const AgentRuntimeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  agentDefinitionKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
  runtimeKind: z.enum(['coordinator', 'agent', 'tool_wrapper']),
  runtimeType: z.string().min(1),
  modelIdentity: z.string().min(1),
  capabilityKeys: z.array(z.string().min(1)).max(100),
  policyDocument: z.record(z.string(), z.unknown()),
  delegation: z.object({
    role: z.enum(['orchestrator', 'leaf']),
    allowedAgentDefinitionKeys: z.array(z.string()).max(20),
    maxDepth: z.number().int().min(0).max(3),
    maxChildrenPerTask: z.number().int().min(0).max(20),
  }).strict(),
  limits: z.object({
    maxTurns: z.number().int().min(1).max(200),
    maxContextTokens: z.number().int().min(1_024),
    summaryTargetTokens: z.number().int().min(256),
  }).strict(),
  assets: z.object({
    prompt: z.object({ path: z.string(), sha256: z.string().length(64) }).strict(),
    summaryPrompt: z.object({ path: z.string(), sha256: z.string().length(64) }).strict(),
    skills: z.array(z.object({ key: z.string(), version: z.string(), sha256: z.string().length(64) }).strict()),
    outputSchema: z.object({ path: z.string(), version: z.string(), sha256: z.string().length(64) }).strict().nullable(),
  }).strict(),
}).strict();
```

Canonicalize sorted keys and sorted capability/skill/target arrays before
SHA-256. The manifest contains no secrets, executable path, inline MCP server,
hook command, or browser/user override.

- [ ] **Step 4: Bind the manifest to `AgentVersion`**

Add `manifestHash String @map("manifest_hash")` and
`runtimeManifest Json @map("runtime_manifest") @db.JsonB` to `AgentVersion`.
Add a partial unique constraint for one active row per
`agentDefinitionKey` (`activated_at IS NOT NULL AND retired_at IS NULL`).
`publishAndActivate` takes an organization-independent advisory transaction
lock for the definition key, reuses an equal hash, otherwise creates version
`max(version)+1`, activates it, and retires the former active row atomically.
It never updates the content of an existing version.

- [ ] **Step 5: Wire publication into the existing seed**

`seedAgentOs` resolves prompt/skill/schema assets, explicit model, runtime,
capability handlers, and delegation targets, then publishes each manifest
before ensuring organization instances. A failed manifest makes the seed and
server readiness fail. Do not introduce `.claude/agents`, `.agents`, user-home,
or plugin discovery into production Agent resolution.

`AgentRuntimeCatalogStartupValidator` performs the same compile-only pass on
application bootstrap and rejects duplicate definition/skill keys, missing or
unreadable assets, development-only runtime skills, hash collisions, unknown
capabilities/targets/runtimes, and a database active manifest whose hash does
not match code. Publication remains an explicit seed/release action; ordinary
server boot validates but never silently creates or activates a version.

- [ ] **Step 6: Reach GREEN and run schema gates**

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/kiditem npx prisma format
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/kiditem npx prisma generate
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/domain/__tests__/agent-runtime-manifest.spec.ts \
  src/agent-os/domain/__tests__/agent-definition.registry.spec.ts \
  src/agent-os/application/service/__tests__/agent-version-publisher.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-runtime-catalog-startup-validator.service.spec.ts
npm run build --workspace=apps/server
npm run db:erd
npm run check:schema-artifact-sync
```

Expected: all PASS; repeated publication is idempotent and a changed artifact
creates a new immutable version.

- [ ] **Step 7: Commit version management**

```bash
git add apps/server/src/agent-os prisma/models/agents.prisma docs/ERD.md docs/erd
git commit -m "feat: publish immutable agent runtime manifests"
```

## Task 2: Add Durable Work And Control Contracts

**Files:**

- Create: `packages/shared/src/agent-interaction/durable-runtime.ts`
- Create: `packages/shared/src/agent-interaction/durable-runtime.spec.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Create: `apps/server/src/agent-os/application/port/out/repository/agent-session-control.repository.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/prisma-agent-session-control.repository.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-session-control.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

- [ ] **Step 1: Write shared and PostgreSQL RED tests**

```typescript
expect(AgentProgressEventSchema.parse({
  schema: 'kiditem.ui.agent_progress.v1', session: SESSION_NAME,
  task: TASK_NAME, status: 'running', progress: 0.4,
  label: '상품 근거 확인 중', updatedAt: NOW,
}).status).toBe('running');

expect(() => AgentApprovalCardSchema.parse({
  schema: 'kiditem.ui.agent_approval.v1', approval: APPROVAL_NAME,
  session: SESSION_NAME, task: TASK_NAME, capabilityKey: 'supply.submit',
  summary: '발주 제출', resourceVersions: [], expiresAt: NOW,
  arbitraryEndpoint: '/api/private',
})).toThrow();
```

The PostgreSQL suite proves organization-composite FKs, one idempotent child
task/delegation, immutable attempt sequence, invocation-scoped approval,
artifact hash ownership, and terminal one-way transitions.

- [ ] **Step 2: Run and record RED**

```bash
npx vitest run packages/shared/src/agent-interaction/durable-runtime.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/repository/__tests__/prisma-agent-session-control.repository.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: missing contract/repository failures after the isolated database is
created.

- [ ] **Step 3: Define strict wire contracts**

Export strict schemas for:

- `AgentProgressEventSchema` with queued/running/waiting_dependency/
  waiting_approval/paused/completed/failed/cancelled;
- `AgentApprovalCardSchema` and `AgentApprovalDecisionSchema`;
- `AgentArtifactCardSchema` using opaque registered navigation action refs,
  never URLs or raw database IDs;
- `RetryAgentTaskSchema`, `ResumeAgentTaskSchema`, and
  `CancelAgentTaskSchema` with stable idempotency keys;
- `AgentDelegationEventSchema` containing parent/child task resource names and immutable
  from/to Agent version summaries.

All schemas require canonical session/task/execution/attempt resource-name
correlation, use bounded strings/arrays, contain no standalone organization/
user authority fields, and reject unknown keys. Persistence adapters parse
these names into branded IDs and recheck their complete parent scope.

- [ ] **Step 4: Add the durable control graph**

Add these models with organization-composite relations and indexes:

- `AgentAuthorityProfileVersion` (immutable grants, policy document/hash);
- `AgentSessionTaskDelegation` (parent, child, from/to versions, authority
  subset, depth, idempotency, state);
- `AgentExecutionAttempt` (execution, attempt number, runtime type, external
  run ID, encrypted handle reference, state, timestamps/error);
- `AgentSessionApproval` (task/execution/attempt, capability, arguments hash,
  resource snapshot, actor/expiry/decision/idempotency);
- `AgentSessionArtifact` (task/execution, type, storage reference, SHA-256,
  metadata, lifecycle).

Change foundation `AgentSession.authorityProfileVersionId` from an opaque
string to its organization-safe relation. Keep transcript/message columns out
of these durable-control models; conversation content remains exclusively in
the canonical `AgentConversationEvent` table introduced by Foundation.

- [ ] **Step 5: Implement the narrow repository**

The port exposes task/delegation creation, attempt start/terminal, approval
request/decision, artifact append, task/session transition, and scoped reads.
Mutation methods accept branded `organizationId` and owner record IDs plus
expected state. The adapter owns
transactions and converts unique races into stable idempotency conflicts.

- [ ] **Step 6: Reach GREEN**

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/kiditem npx prisma generate
npx vitest run packages/shared/src/agent-interaction/durable-runtime.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/repository/__tests__/prisma-agent-session-control.repository.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
```

Expected: all PASS.

- [ ] **Step 7: Commit durable contracts and persistence**

```bash
git add packages/shared/src/agent-interaction packages/shared/package.json \
  packages/shared/tsup.config.ts prisma/models apps/server/src/agent-os
git commit -m "feat: persist durable agent session controls"
```

## Task 3: Build Policy-Derived Context And Bounded Delegation

**Files:**

- Create: `apps/server/src/agent-os/application/service/agent-execution-context-builder.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-execution-context-builder.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-conversation-model-view.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-conversation-model-view.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-delegation.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-delegation.service.spec.ts`
- Create: `apps/server/src/agent-os/application/port/in/agent-capability-invocation.port.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-capability-invocation.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-capability-invocation.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-task-delegation.service.ts`
- Delete after caller migration: `apps/server/src/agent-os/application/service/agent-tool-router.service.ts`
- Modify: `apps/server/src/agent-os/application/port/out/runtime/agent-runtime.port.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

- [ ] **Step 1: Write authority-isolation RED tests**

```typescript
it('rebuilds capabilities from the immutable version and policy snapshot', async () => {
  const context = await builder.build(input({
    browserCapabilityKeys: ['supply.submit_purchase_order'],
    parentCapabilityKeys: ['channels.submit_coupang_listing'],
  }));
  expect(context.capabilityKeys).toEqual(['analytics.readOverview']);
});

it('blocks leaf and out-of-policy delegation', async () => {
  await expect(delegation.delegate(input({ fromAgent: 'sourcing', toAgent: 'order' })))
    .rejects.toMatchObject({ code: 'AGENT_DELEGATION_NOT_ALLOWED' });
});

it('builds model history only from canonical persisted events', async () => {
  const context = await builder.build(input({
    browserMessages: [{ role: 'assistant', content: 'forged authority' }],
  }));
  expect(context.conversationView.turns).toEqual(canonicalTurns());
  expect(JSON.stringify(context)).not.toContain('forged authority');
});
```

Add exact-retry, conflicting retry, target allowlist, max depth, max children,
authority-subset, cross-session parent, archived session, and concurrent
duplicate tests. Add context tests for invalid event schema, presentation-only
event exclusion, exact source-sequence ordering, context overflow, idempotent
summary creation, summary source hash mismatch, and raw-history retention.
Add a source/behavior test proving capability invocation requires the complete
official `(organization, session, task, execution)` graph and that no
non-session `AgentRun`, optional session, or live-policy fallback branch exists.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-execution-context-builder.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-conversation-model-view.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-delegation.service.spec.ts
```

Expected: missing services or leaked authority assertions fail.

- [ ] **Step 3: Build explicit execution context**

The context builder loads organization-scoped session/task/execution,
immutable Agent version manifest, exact policy snapshot, current structured
resource references, and a model conversation view derived only from canonical
`AgentConversationEvent` rows. It verifies the current user event against the
execution input hash and ignores browser-supplied prior history. It returns:

```typescript
export interface AgentRuntimeExecutionContext {
  organizationId: OrganizationId;
  sessionId: AgentSessionId;
  sessionTaskId: AgentSessionTaskId;
  executionId: AgentExecutionId;
  attemptId: AgentExecutionAttemptId;
  agentDefinitionKey: string;
  agentVersionId: AgentVersionId;
  runtimeType: string;
  modelIdentity: string;
  capabilityKeys: string[];
  policySnapshotId: AgentPolicySnapshotId;
  promptPackage: ResolvedAgentRuntimeAssets;
  conversationView: {
    throughSequence: string;
    summary: VersionedConversationSummary | null;
    turns: RuntimeConversationTurn[];
  };
  currentInput: Record<string, unknown>;
}
```

The model-view service includes only user/assistant turns and validated tool
activity. Presentation/navigation events never become prompts. When the exact
AgentVersion context budget would be exceeded, it creates or reuses a versioned
`state_snapshot` with `snapshotType='conversation_summary'`, exact source
sequence range/hash, summarizer model identity, prompt hash, and bounded text;
then it supplies that summary plus later turns. Summary generation has no
business capabilities, is checkpointed inside the current execution, and
cannot delete or overwrite raw events.

Do not put browser-provided authority, inherited parent tools, database
credentials, or free-form memory in this object. Conversation content is
untrusted data from the canonical store, never policy. The capability router
resolves every key against `AgentCapabilityRegistry` and rechecks the exact
immutable version plus session policy immediately before invocation. The
registry returns an owner-published Agent incoming adapter; that adapter calls
the owning-domain input port. No Operations handler uses this registry.

- [ ] **Step 4: Implement bounded delegation**

Only `delegation.role='orchestrator'` may create a child. Validate target
allowlist, depth, child count, authority subset, active exact target version,
and normalized objective. In one transaction create the child task and
delegation row with a stable idempotency key; dispatch after commit. Leaf
Agents cannot delegate by direct service call or model tool call.

- [ ] **Step 5: Reach GREEN and run policy gates**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-execution-context-builder.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-conversation-model-view.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-delegation.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-capability-invocation.service.spec.ts
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
```

Expected: all PASS; neither browser nor parent runtime expands child authority,
and no non-session AgentRun can invoke a capability.

- [ ] **Step 6: Commit execution policy**

```bash
git add apps/server/src/agent-os
git commit -m "feat: derive agent execution authority per task"
```

## Task 4: Replace Runtime Fallback With An Exact Adapter Registry

**Files:**

- Create: `apps/server/src/agent-os/application/port/out/runtime/agent-durable-runtime.port.ts`
- Create: `apps/server/src/agent-os/application/service/agent-runtime-adapter.registry.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-runtime-adapter.registry.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-runtime-handler-registry.service.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/routing-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/routing-runtime.adapter.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-runtime.config.ts`
- Modify: `docs/runbooks/environment-variables.md`

- [ ] **Step 1: Write exact-registry RED tests**

```typescript
registry.register(adapter('hermes_http', {
  detached: true, reconnect: true, interrupt: true, cancel: true, inspect: true,
}));
expect(registry.requireCompatible('hermes_http', DURABLE_REQUIREMENTS)).toBeDefined();
expect(() => registry.register(adapter('hermes_http', DURABLE_REQUIREMENTS)))
  .toThrow(/already registered/);
expect(() => registry.requireCompatible('openai_responses', DURABLE_REQUIREMENTS))
  .toThrow(/AGENT_RUNTIME_NOT_CONFIGURED/);
expect(registry).not.toHaveProperty('resolveFallback');
```

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-runtime-adapter.registry.spec.ts \
  src/agent-os/adapter/out/runtime/__tests__/routing-runtime.adapter.spec.ts
```

Expected: registry missing and current no-op/fallback behavior fails assertions.

- [ ] **Step 3: Define the durable adapter contract**

```typescript
export interface AgentDurableRuntimeAdapter {
  readonly runtimeType: string;
  readonly capabilities: {
    detached: boolean; reconnect: boolean; interrupt: boolean;
    cancel: boolean; inspect: boolean;
  };
  start(context: AgentRuntimeExecutionContext): Promise<RuntimeHandle>;
  connect(handle: RuntimeHandle): AsyncIterable<NormalizedRuntimeEvent>;
  inspect(handle: RuntimeHandle): Promise<RuntimeInspection>;
  interrupt(handle: RuntimeHandle, input: RuntimeInterruptInput): Promise<void>;
  cancel(handle: RuntimeHandle): Promise<void>;
}
```

The registry keys adapters by exact `runtimeType`, rejects duplicate
registration, and reports missing capability names. Keep logical per-Agent
handlers separate from transport adapters. Remove production use and
documentation of `AGENT_RUNTIME_ALLOW_NOOP`; tests inject a fake adapter.

- [ ] **Step 4: Harden correlation and lifecycle**

Every adapter call receives execution/attempt identity. Persist the returned
opaque handle before consuming events. `connect` may be repeated; `start` may
not. Normalize provider events at the adapter boundary. Duplicate terminal
events are ignored by conditional repository transitions.

- [ ] **Step 5: Reach GREEN**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-runtime-adapter.registry.spec.ts \
  src/agent-os/adapter/out/runtime/__tests__/routing-runtime.adapter.spec.ts
npm run build --workspace=apps/server
```

Expected: all PASS and no fallback/no-op production path remains.

- [ ] **Step 6: Commit the runtime boundary**

```bash
git add apps/server/src/agent-os docs/runbooks/environment-variables.md
git commit -m "refactor: require exact durable agent runtimes"
```

## Task 5: Dispatch Session Tasks Through Operations Checkpoints

**Files:**

- Create: `apps/server/src/agent-os/domain/operation/agent-os.operations.ts`
- Create: `apps/server/src/agent-os/adapter/in/operation/agent-session-task.operation-handler.ts`
- Create: `apps/server/src/agent-os/adapter/in/operation/__tests__/agent-session-task.operation-handler.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-task-dispatch.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-task-dispatch.service.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `packages/shared/src/schemas/operations.ts`
- Modify: `prisma/models/system.prisma`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Create: `apps/server/src/operations/application/port/out/repository/operation-checkpoint.repository.port.ts`
- Modify: `apps/server/src/operations/application/service/operation-run-worker.service.ts`
- Create: `apps/server/src/operations/application/service/__tests__/operation-run-worker.service.spec.ts`

- [ ] **Step 1: Write dispatch/recovery RED tests**

Prove one `OperationRun` per task/execution idempotency key, monotonic immutable
checkpoints, lease reclaim, reconnect instead of duplicate start, unknown
handle failure, terminal reconciliation, and absence of any
`AgentCapabilityRegistry` dependency in the Operations handler.

```typescript
const first = await dispatch.dispatch(taskInput());
expect((await dispatch.dispatch(taskInput())).operation).toBe(first.operation);

await handler.handle(expiredLeaseInput({ checkpoint: runtimeStarted(handle) }));
expect(runtime.inspect).toHaveBeenCalledWith(handle);
expect(runtime.start).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/operation/__tests__/agent-session-task.operation-handler.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-task-dispatch.service.spec.ts \
  src/operations/application/service/__tests__/operation-run-worker.service.spec.ts
```

Expected: missing operation/checkpoint behavior.

- [ ] **Step 3: Register one code-owned operation**

```typescript
export const AGENT_OS_OPERATIONS = [{
  key: 'agent-os.execute-session-task', version: 1,
  title: 'AgentOS session task execution', ownerDomain: 'agent-os',
  engineType: 'agent_os', allowedTriggers: ['system', 'schedule'],
  scheduleSupported: true, maxAttempts: 5,
  inputSchema: z.object({
    session: AgentSessionNameSchema,
    task: AgentSessionTaskNameSchema,
    execution: AgentExecutionNameSchema,
  }).strict(),
}] as const satisfies readonly OperationDefinition[];
```

Use `operationKey + task + execution` as the scoped idempotency boundary. The
handler parses the canonical names, proves they share organization/session
parents, and calls `AgentSessionExecutionPort`; it never invokes a business
capability itself. A schedule resumes an existing task and never creates a
session. A business domain that needs its own durable deterministic work
registers an owner Operation whose handler calls that domain's input port,
without passing through AgentOS.

- [ ] **Step 4: Add Operations-owned checkpoints**

`OperationRunCheckpoint` has branded organization/run IDs, a canonical
Operation/Checkpoint name at boundaries, monotonic sequence, kind, structured
state, and timestamp with unique `(operationRunId, sequence)`.
The handler checkpoints before/after runtime start, handle persistence,
validated interrupt/artifact boundaries, every 100 normalized events, and
terminal state. Handle secrets live behind an encrypted reference.

- [ ] **Step 5: Implement lease recovery**

On reclaim, load the last checkpoint and call `inspect`:

- running → reconnect;
- completed → reconcile output;
- cancelled → finalize cancellation;
- unknown/missing → fail `AGENT_RUNTIME_HANDLE_LOST`;
- no handle checkpoint → start once and persist the handle before event read.

Heartbeat at less than half the lease duration. Preserve checkpoints across
attempts and never infer external completion from PID alone.

- [ ] **Step 6: Reach GREEN**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/operation/__tests__/agent-session-task.operation-handler.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-task-dispatch.service.spec.ts \
  src/operations/application/service/__tests__/operation-run-worker.service.spec.ts
npm run build --workspace=apps/server
npm run check:directory-architecture
```

Expected: all PASS; one external start survives worker recovery, the internal
AgentOS Operation enters only the session-execution port, and no Operations
source imports `AgentCapabilityRegistry`.

- [ ] **Step 7: Commit durable dispatch**

```bash
git add apps/server/src/agent-os apps/server/src/operations \
  packages/shared/src/schemas/operations.ts prisma/models/system.prisma
git commit -m "feat: checkpoint durable agent task execution"
```

## Task 6: Implement Hermes With Run-Scoped Credentials And MCP

**Files:**

- Create: `apps/server/src/agent-os/adapter/out/runtime/hermes-http-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/hermes-acp-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runtime-credential-broker.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/run-scoped-mcp-config.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `docs/runbooks/environment-variables.md`

- [ ] **Step 1: Write transport and trust-boundary RED tests**

Test start/connect/inspect/interrupt/cancel, adapter recreation with the same
handle, credential expiry, exact capability exposure, and rejection of
`--yolo`, approval-off flags, arbitrary executable paths, shared config homes,
inline MCP servers, or a tool absent from the policy snapshot.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts
```

Expected: missing adapter failures.

- [ ] **Step 3: Implement the broker and generated MCP config**

The credential broker issues short-lived execution/attempt-bound credentials.
The MCP config contains only server-registered capability tools allowed by the
policy snapshot. Runtime response metadata cannot add tools, hooks, servers,
permission mode, or authority. Log IDs and capability keys only, never tokens
or config contents.

- [ ] **Step 4: Implement Hermes HTTP and ACP**

Hermes HTTP is the default detached adapter. Hermes ACP is selectable only
when its compatibility matrix proves required interactive semantics. Both
store only runtime type, external run ID, and encrypted reconnect reference in
the handle. Map provider items to `NormalizedRuntimeEvent` and make cancel
idempotent.

- [ ] **Step 5: Reach GREEN and boot**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts
npm run build --workspace=apps/server
npm run dev:server
```

Expected: tests/build pass and Nest boots with only configured exact runtime
types. Stop the watch process after the boot line.

- [ ] **Step 6: Commit Hermes adapters**

```bash
git add apps/server/src/agent-os docs/runbooks/environment-variables.md
git commit -m "feat: add policy-scoped hermes runtimes"
```

## Task 7: Implement Isolated Codex And Claude CLI Runtimes

**Files:**

- Create: `apps/server/src/agent-os/adapter/out/runtime/isolated-cli-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/codex-cli-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/claude-cli-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/__tests__/isolated-cli-runtime.adapter.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `docs/runbooks/environment-variables.md`

- [ ] **Step 1: Write isolation/identity RED tests**

```typescript
const handle = await adapter.start(context({ executionId: EXECUTION_ID, attemptId: ATTEMPT_ID }));
expect(spawn).toHaveBeenCalledWith(allowlistedBinary, expect.any(Array), expect.objectContaining({
  cwd: `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/work`,
  env: expect.not.objectContaining({
    DATABASE_URL: expect.any(String), AWS_SECRET_ACCESS_KEY: expect.any(String),
  }),
}));
expect(handle.externalRunId).toBeTruthy();
```

Also prove distinct run homes, owner-only files, exact version probe, native
resume, cancel, PID-reuse defense, and explicit incompatibility when the CLI
cannot reconnect.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/runtime/__tests__/isolated-cli-runtime.adapter.spec.ts
```

Expected: missing supervisor/adapters.

- [ ] **Step 3: Implement the isolated supervisor**

Create `/var/lib/kiditem-agent-runs/<execution>/<attempt>/{home,work,state}`;
write owner-only config; set child `HOME` without altering the shell's `$HOME`;
strip ambient database/cloud/model credentials; inject only brokered runtime
and MCP credentials; persist executable version, native session ID, PID,
process start identity, and encrypted handle reference. The gateway/web images
must not contain these executables.

- [ ] **Step 4: Implement exact specializations**

Each adapter owns an allowlisted command builder, version probe, supported
resume/cancel commands, event parser, allowed environment keys, and approval
mapping. If the installed CLI/version cannot satisfy the declared matrix,
registration fails readiness; it never falls back to another runtime.

- [ ] **Step 5: Reach GREEN and boot**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/runtime/__tests__/isolated-cli-runtime.adapter.spec.ts
npm run build --workspace=apps/server
npm run dev:server
```

Expected: tests/build/boot pass. Stop the watch process.

- [ ] **Step 6: Commit CLI adapters**

```bash
git add apps/server/src/agent-os docs/runbooks/environment-variables.md
git commit -m "feat: isolate codex and claude agent runtimes"
```

## Task 8: Add Progress, HITL, Artifacts, Retry, Resume, And Cancel

**Files:**

- Create: `apps/server/src/agent-os/application/service/agent-session-runtime-control.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-runtime-control.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-approval.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-approval.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-cancellation.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-cancellation.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-session.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-session.controller.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-session-execution.service.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

- [ ] **Step 1: Write control RED tests**

```typescript
const approval = await approvals.request(approvalInput());
await expect(approvals.decide({
  ...decisionInput(approval.id), argumentsHash: 'changed',
})).rejects.toMatchObject({ code: 'APPROVAL_CONTEXT_CHANGED' });

await Promise.all([cancel.cancel(cancelInput()), cancel.cancel(cancelInput())]);
expect(operations.cancel).toHaveBeenCalledOnce();
expect(runtime.cancel).toHaveBeenCalledOnce();
```

Add stale actor, expiry, resource-version change, replay, cross-org, rejected
approval, disconnect-without-cancel, exact retry, forbidden retry, and multiple
open-interrupt tests.

- [ ] **Step 2: Run and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-session-runtime-control.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-approval.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-cancellation.service.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-session.controller.spec.ts
```

Expected: missing control services.

- [ ] **Step 3: Normalize runtime events**

Stream text as standard AG-UI events. Convert progress, delegation, approval,
and artifact events to the shared registered schemas, append every normalized
event through `appendExecutionEvent`, and publish only after the append commits.
On approval request, persist both control state and its conversation event and
checkpoint before emitting the standard interrupt; invoke no capability until
valid resume. Reconcile terminal state in this order:
runtime handle → attempt → execution → task → OperationRun. Conditional
updates make duplicate events harmless.

- [ ] **Step 4: Implement explicit HTTP controls**

Expose organization-scoped session/task inspection plus approval decision,
retry/resume, and cancel endpoints. Derive actor/organization from auth, never
DTOs. Panel close and gateway disconnect do not call cancel. Reconnect reads
existing state; retry/resume creates a new execution/attempt only when the
server state machine allows it.

- [ ] **Step 5: Reach GREEN and run scanners**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-session-runtime-control.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-approval.service.spec.ts \
  src/agent-os/application/service/__tests__/agent-session-cancellation.service.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-session.controller.spec.ts
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
```

Expected: all PASS.

- [ ] **Step 6: Commit durable controls**

```bash
git add apps/server/src/agent-os
git commit -m "feat: control durable agent session work"
```

## Task 9: Render Durable State In Both Interaction Surfaces

**Files:**

- Create: `apps/web/src/components/agent-interaction/OfficialInteractionRenderers.tsx`
- Create: `apps/web/src/components/agent-interaction/AgentProgressCard.tsx`
- Create: `apps/web/src/components/agent-interaction/AgentApprovalCard.tsx`
- Create: `apps/web/src/components/agent-interaction/AgentArtifactCard.tsx`
- Create: `apps/web/src/components/agent-interaction/AgentDelegationCard.tsx`
- Create: `apps/web/src/components/agent-interaction/__tests__/OfficialInteractionRenderers.spec.tsx`
- Modify: `apps/web/src/components/agent-interaction/renderers.tsx`
- Modify: `apps/web/src/components/agent-interaction/AgentInteractionSurface.tsx`
- Modify: `apps/web/src/app/agent-os/components/ExecutionCanvas.tsx`

- [ ] **Step 1: Write shared-surface RED tests**

```tsx
const { unmount } = render(<AgentInteractionSurface surface="global_panel" />);
expect(screen.getByTestId(`agent-task-${TASK_ID}`)).toHaveTextContent('실행 중');
unmount();
expect(mockCancelTask).not.toHaveBeenCalled();
render(<AgentInteractionSurface surface="agentos_workspace" />);
expect(screen.getByTestId(`agent-task-${TASK_ID}`)).toHaveTextContent('실행 중');
```

Also test approval expiry/disable, artifact navigation registry, retry/resume
visibility from server state, delegation lineage, invalid payload text
fallback, and locked immutable primary Agent version.

- [ ] **Step 2: Run and record RED**

```bash
npm test --workspace=apps/web -- \
  src/components/agent-interaction/__tests__/OfficialInteractionRenderers.spec.tsx
```

Expected: missing renderer failures.

- [ ] **Step 3: Register safe renderers and interrupts**

Use registered generative UI for progress/delegation/artifact and standard
CopilotKit interrupt handling for approvals. Render capability, bounded
summary, resource versions, actor-visible expiry, and separate approve/reject
buttons. The client parses payloads; the server revalidates all authority.
Cancel/retry/resume buttons call explicit control endpoints only.

- [ ] **Step 4: Reuse the same state in `/agent-os`**

The workspace consumes the same session/task correlation, canonical event
stream, and control API; it does not copy messages or create a second
conversation model. Panel
unmount, route change, browser sleep, and opening the workspace do not mutate
task state.

- [ ] **Step 5: Reach GREEN**

```bash
npm test --workspace=apps/web -- \
  src/components/agent-interaction/__tests__/OfficialInteractionRenderers.spec.tsx
npm run build --workspace=apps/web
```

Expected: tests/build pass.

- [ ] **Step 6: Commit durable UI**

```bash
git add apps/web/src/components/agent-interaction \
  apps/web/src/app/agent-os/components/ExecutionCanvas.tsx
git commit -m "feat: render durable agent session controls"
```

## Task 10: Prove Versioning, Recovery, Delegation, And Approval End To End

**Files:**

- Create: `apps/server/src/agent-os/__tests__/agent-version-publication.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/session-delegation.pg.integration.spec.ts`
- Create: `apps/web/e2e/interaction-os/durable-session.spec.ts`
- Create: `deploy/interaction-gateway/smoke-official-recovery.mjs`
- Modify: `docs/runbooks/interaction-platform.md`

- [ ] **Step 1: Add real-PostgreSQL publication/delegation tests**

Publish the same Operator manifest twice, then a changed prompt fixture. Assert
one active version, immutable old row, sequential version number, exact hashes,
and existing sessions still pointing to the old version. Race identical child
delegations and assert one child task/delegation/OperationRun. Prove direct
cross-org inserts fail.

- [ ] **Step 2: Add restart/reconnect integration coverage**

Use a deterministic detached fake runtime whose handle survives object
recreation. Start, checkpoint three events, recreate handler/adapter, reclaim
the lease, reconnect, request approval, approve, finish, and assert one
external run, monotonic checkpoints, one capability invocation, and one
terminal attempt/execution/task/OperationRun. Repeat cancellation while
detached and handle-lost behavior.

- [ ] **Step 3: Add browser acceptance**

Playwright verifies first-send session creation, continued messages reusing
the session, new conversation creating another session only on submit,
delegation lineage, progress after panel close, separate approval, artifact
navigation, explicit cancel, stale approval rejection, and identical state in
the global panel and workspace.

- [ ] **Step 4: Add isolated restart smoke**

The smoke refuses production, starts a task against the approved test runtime,
restarts the Interaction Gateway and Operations worker, reconnects the same
Copilot thread, resolves a test approval, and asserts the two opaque external
IDs (`copilotThreadId`, `aguiRunId`) remain correlated with canonical
`session`, `task`, `execution`, `attempt`, and `operation` resource names.
Also assert request IDs and runtime handles are not accepted in any of those
resource fields.

- [ ] **Step 5: Run the complete runtime gates**

```bash
npm run test:integration --workspace=apps/server -- \
  src/agent-os/__tests__/agent-version-publication.pg.integration.spec.ts \
  src/agent-os/__tests__/session-delegation.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts
npx playwright test apps/web/e2e/interaction-os/durable-session.spec.ts
node deploy/interaction-gateway/smoke-official-recovery.mjs
npm run check:agent-interaction-lifecycle
npm run check:copilotkit-train
npm run check:idor
npm run check:tenant-scope
npm run check:identifier-contracts
npm run check:conventions
npm run build --workspace=packages/shared
npm run build --workspace=apps/web
npm run dev:server
```

Expected: finite gates pass; restart produces no duplicate external run or
capability call; Nest boots. Stop the watch process.

- [ ] **Step 6: Commit recovery evidence**

```bash
git add apps/server/src/agent-os/__tests__ \
  apps/web/e2e/interaction-os/durable-session.spec.ts \
  deploy/interaction-gateway/smoke-official-recovery.mjs \
  docs/runbooks/interaction-platform.md
git commit -m "test: prove durable agent runtime recovery"
```

## Plan Acceptance Evidence

- [ ] Production Agent definitions come only from the code-owned registry and
  immutable active `AgentVersion`; user/project/plugin markdown cannot alter
  authority.
- [ ] A version hash binds runtime, model, policy, delegation, prompt, skills,
  output schema, and limits; changed content publishes a new immutable row.
- [ ] Session, task, execution, attempt, and Operation use canonical resource
  names across planes; branded storage IDs, external thread/run IDs, request
  IDs, idempotency keys, sequences, tokens, digests, and runtime handles remain
  separate and fully correlated.
- [ ] Every execution rebuilds its capability set from the exact Agent version
  and policy snapshot; browser and parent authority never leak.
- [ ] Only configured orchestrators delegate to allowlisted targets within
  depth/child/authority limits; retry creates one child task and OperationRun.
- [ ] No free-form Agent memory, legacy transcript, or second conversation
  store is added; runtime events use `AgentConversationEvent`.
- [ ] Operations owns leases/checkpoints/dispatch; AgentOS owns task,
  delegation, approval, artifacts, runtime policy, and reconciliation.
- [ ] Agent capability adapters call owning-domain input ports. Deterministic
  business Operations call those owner ports directly, the AgentOS task
  Operation calls only the session-execution port, and no Operations handler
  imports `AgentCapabilityRegistry`.
- [ ] No generic non-session AgentRun execution path remains; every former
  caller is classified as owner synchronous work, owner durable Operation, or
  official AgentSession judgment.
- [ ] Exact runtime selection fails on missing adapter/capability and never
  falls back or no-ops.
- [ ] Hermes and supported CLIs use isolated execution homes, scoped MCP, and
  short-lived credentials.
- [ ] Reconnect inspects a persisted handle before action and never duplicates
  a known external run.
- [ ] Approval binds actor, task, attempt, capability, arguments, resources,
  and expiry; session creation itself approves nothing.
- [ ] Panel close/reconnect remains read-only; explicit cancel/retry/resume is
  idempotent and visible in both interaction surfaces.
