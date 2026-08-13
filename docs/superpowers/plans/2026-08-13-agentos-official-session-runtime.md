# AgentOS Official Session And Durable Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote a Quick Ask thread into one explicit official AgentOS session and execute durable, interruptible work through Operations and normalized AG-UI runtime adapters.

**Architecture:** A deterministic promotion evaluator creates a short-lived `AgentSessionPromotion` ledger entry and ends the AG-UI run with a standard interrupt. Confirmation revalidates identity/resources under a thread lock, opens a new context epoch on the same CopilotKit thread, and creates exactly one `AgentSession` plus root `AgentSessionTask`; pre-promotion text is not trusted execution context. Official task execution is carried by the existing Operations lease worker with persisted checkpoints and opaque runtime handles, while AgentOS retains goal/authority/task/delegation/approval/artifact state and translates all adapters into one AG-UI event stream.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Operations lease worker, CopilotKit v2 `useInterrupt`, AG-UI standard interrupts, Hermes HTTP/ACP, isolated Codex/Claude CLI processes, MCP, Zod, Vitest, Playwright

## Global Constraints

- The execution index, foundation, and Quick Ask plan outputs are prerequisites.
- Promotion criteria are code-owned and deterministic; the model may describe intent but cannot grant authority or create a session.
- A long/complex/read-only conversation, several read calls, slow latency, or navigation never promotes by itself.
- Promotion is in-place by default, but the official runtime starts a new trusted `AgentContextEpoch` containing only server-validated handoff facts.
- `AgentSessionPromotion` states are exactly `pending`, `accepted`, `session_created`, `rejected`, and `expired`.
- A promotion card expires after ten minutes, is scoped to organization/user/thread/agent version/resource versions, and is protected by one stable idempotency key.
- A thread has at most one official `AgentSession`; a session has one active root task at creation.
- Confirming promotion authorizes session creation only. Every purchase, listing, advertising, payment, external write, and other side effect is separately policy-checked and may require its own approval.
- `AgentSessionTask` is the only new task model name; do not restore the retired `AgentTask` model.
- Operations owns `OperationRun`, lease, attempt, checkpoint, scheduling, dispatch, cancellation envelope, and terminal reconciliation.
- AgentOS owns goal, authority profile version, tasks, delegation, execution policy, approvals, artifacts, cost, and runtime handles.
- Every official execution requires the selected adapter to advertise `detached`, `reconnect`, `cancel`, and `inspect`; required interrupts additionally require `interrupt`.
- No runtime fallback is permitted. An unsupported selected runtime produces `AGENT_RUNTIME_CAPABILITY_MISMATCH`.
- Runtime credentials/config homes are per-run, short-lived, capability-scoped, and never exposed to the web or stored in operation result JSON.
- Hermes never uses `--yolo` or approval-off mode; local CLI runtimes never execute in the web/gateway process.
- Panel/browser closure never cancels official work; explicit cancellation propagates AgentOS → Operations → adapter and is idempotent.
- AG-UI resume validates all open interrupt IDs, payload schemas, actor, expiry, task state, and resource versions before continuing.

---

## File Map

| Path | Responsibility |
|---|---|
| `packages/shared/src/agent-interaction/official-session.ts` | Promotion, session, progress, approval, artifact, cancellation contracts |
| `prisma/models/agents.prisma` | Authority/profile versions, promotion, session/task, attempt/handle, approval/artifact/cost |
| `prisma/models/system.prisma` | Generic Operations checkpoint owned by Operations |
| `apps/server/src/agent-os/application/service/agent-promotion-policy.service.ts` | Deterministic official-work criteria |
| `apps/server/src/agent-os/application/service/agent-session-promotion.service.ts` | Lock/idempotency/revalidation/context epoch/session transaction |
| `apps/server/src/agent-os/application/service/official-agent-run.service.ts` | AG-UI official control and event normalization |
| `apps/server/src/agent-os/adapter/in/operation/agent-session-task.operation-handler.ts` | Operations handler for durable session tasks |
| `apps/server/src/operations/application/port/out/repository/operation-checkpoint.repository.port.ts` | Generic checkpoint ownership |
| `apps/server/src/agent-os/adapter/out/runtime/*` | Hermes and isolated CLI implementations of the stable adapter contract |
| `apps/web/src/components/interaction-os/OfficialInteractionRenderers.tsx` | Promotion, progress, approval, artifact, cancel/resume cards |

## Task 1: Define Official Session And Interrupt Contracts

**Files:**
- Create: `packages/shared/src/agent-interaction/official-session.ts`
- Create: `packages/shared/src/agent-interaction/official-session.spec.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`

**Interfaces:**
- Consumes: `CanonicalResourceRefSchema`, `NavigationActionSchema`, and correlation types.
- Produces: `PromotionProposalSchema`, `PromotionDecisionSchema`, `OfficialProgressEventSchema`, `AgentApprovalCardSchema`, `AgentArtifactCardSchema`, and `CancelOfficialTaskSchema`.

- [ ] **Step 1: Write promotion/approval separation tests**

```typescript
import { describe, expect, it } from 'vitest';
import { PromotionDecisionSchema, PromotionProposalSchema } from './official-session';

describe('official interaction contracts', () => {
  it('requires the downstream-approval disclaimer', () => {
    expect(() => PromotionProposalSchema.parse({
      promotionId: 'promotion-1', goal: '상품 등록 준비', primaryAgent: 'Operator',
      reasonCode: 'domain_write', expectedOutput: '등록 준비 결과', likelyDelegations: [],
      authorityProfileVersionId: 'authority-1', expiresAt: '2026-08-13T09:10:00.000Z',
    })).toThrow();
  });

  it('accepts only one explicit session decision', () => {
    expect(PromotionDecisionSchema.parse({ promotionId: 'promotion-1', decision: 'accept', idempotencyKey: 'promote:thread-1:proposal-1' }).decision).toBe('accept');
    expect(() => PromotionDecisionSchema.parse({ promotionId: 'promotion-1', decision: 'approve_purchase' })).toThrow();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run packages/shared/src/agent-interaction/official-session.spec.ts`

Expected: FAIL because the contract file is missing.

- [ ] **Step 3: Implement strict contracts**

```typescript
import { z } from 'zod';
import { CanonicalResourceRefSchema } from './index';

export const PromotionReasonSchema = z.enum([
  'delegation', 'domain_write', 'external_side_effect', 'user_approval',
  'asynchronous_execution', 'durable_artifact', 'shared_resume',
  'monitoring_or_schedule', 'broader_authority',
]);

export const PromotionProposalSchema = z.object({
  promotionId: z.string().min(1),
  idempotencyKey: z.string().min(20).max(200),
  goal: z.string().min(1).max(500),
  primaryAgent: z.string().min(1).max(100),
  reasonCode: PromotionReasonSchema,
  expectedOutput: z.string().min(1).max(500),
  likelyDelegations: z.array(z.string().min(1).max(100)).max(10),
  authorityProfileVersionId: z.string().min(1),
  resources: z.array(CanonicalResourceRefSchema).max(50),
  downstreamApprovalDisclaimer: z.literal('세션 시작은 이후의 구매·등록·광고·결제 등 비즈니스 실행을 승인하지 않습니다.'),
  expiresAt: z.string().datetime(),
}).strict();

export const PromotionDecisionSchema = z.object({
  promotionId: z.string().min(1),
  decision: z.enum(['accept', 'reject']),
  idempotencyKey: z.string().min(20).max(200),
}).strict();

export const OfficialProgressEventSchema = z.object({
  name: z.literal('kiditem.ui.official_progress.v1'),
  sessionId: z.string().min(1), taskId: z.string().min(1),
  status: z.enum(['queued', 'running', 'waiting_approval', 'paused', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0).max(1).nullable(),
  label: z.string().min(1).max(160), updatedAt: z.string().datetime(),
}).strict();

export const AgentApprovalCardSchema = z.object({
  name: z.literal('kiditem.ui.approval.v1'), approvalId: z.string().min(1),
  sessionId: z.string().min(1), taskId: z.string().min(1), capabilityKey: z.string().min(1),
  summary: z.string().min(1).max(500), resourceVersions: z.array(CanonicalResourceRefSchema).max(50),
  expiresAt: z.string().datetime(),
}).strict();

export const AgentArtifactCardSchema = z.object({
  name: z.literal('kiditem.ui.artifact.v1'), artifactId: z.string().min(1),
  sessionId: z.string().min(1), taskId: z.string().min(1), artifactType: z.string().min(1),
  title: z.string().min(1).max(200), summary: z.string().max(1000).nullable(),
  navigationActionId: z.string().startsWith('nav_').nullable(),
}).strict();

export const CancelOfficialTaskSchema = z.object({
  sessionId: z.string().min(1), taskId: z.string().min(1),
  reason: z.string().trim().min(1).max(500), idempotencyKey: z.string().min(20).max(200),
}).strict();
```

- [ ] **Step 4: Run shared gates**

Run:

```bash
npx vitest run packages/shared/src/agent-interaction/official-session.spec.ts
npm run build --workspace=packages/shared
```

Expected: tests/build pass.

- [ ] **Step 5: Commit official interaction contracts**

```bash
git add packages/shared/src/agent-interaction
git commit -m "feat: define official session interaction contracts"
```

## Task 2: Add The Greenfield Official Control Schema

**Files:**
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/system.prisma`
- Create: `apps/server/src/agent-os/application/port/out/repository/agent-session-repository.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/prisma-agent-session.repository.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-session.repository.spec.ts`
- Create: `apps/server/src/operations/application/port/out/repository/operation-checkpoint.repository.port.ts`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `apps/server/src/operations/operations.module.ts`

**Interfaces:**
- Consumes: foundation binding/execution models and Operations run.
- Produces: `AGENT_SESSION_REPOSITORY`, `OPERATION_CHECKPOINT_REPOSITORY`, one-session-per-thread constraint, promotion ledger, official task graph, runtime attempts/handles, approvals/artifacts/cost, and generic operation checkpoints.

- [ ] **Step 1: Write one-session and checkpoint repository tests**

```typescript
it('returns the winning session for a repeated promotion idempotency key', async () => {
  const first = await repository.createSessionFromPromotion(sessionFixture('promote:thread-1:proposal-1'));
  const second = await repository.createSessionFromPromotion(sessionFixture('promote:thread-1:proposal-1'));
  expect(second.session.id).toBe(first.session.id);
  expect(second.rootTask.id).toBe(first.rootTask.id);
});

it('appends immutable operation checkpoints by sequence', async () => {
  await checkpoints.append({ organizationId: 'org-1', operationRunId: 'run-1', sequence: 1, kind: 'runtime_started', state: { handleRef: 'handle-1' } });
  await expect(checkpoints.append({ organizationId: 'org-1', operationRunId: 'run-1', sequence: 1, kind: 'duplicate', state: {} })).rejects.toThrow();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-session.repository.spec.ts`

Expected: FAIL because the new ports/models are absent.

- [ ] **Step 3: Add AgentOS control models**

Add these model shapes and matching relations/indexes, using `String` state fields:

```prisma
model AgentAuthorityProfileVersion {
  id               String   @id @default(uuid()) @db.Uuid
  profileKey       String
  version          Int
  name             String
  capabilityGrants Json     @db.JsonB
  policyDocument   Json     @db.JsonB
  policyHash       String
  createdAt        DateTime @default(now())
  retiredAt        DateTime?
  @@unique([profileKey, version])
}

model AgentSessionPromotion {
  id                        String   @id @default(uuid()) @db.Uuid
  organizationId            String   @db.Uuid
  userId                    String   @db.Uuid
  threadBindingId           String   @db.Uuid
  copilotThreadId           String
  agentVersionId            String   @db.Uuid
  authorityProfileVersionId String   @db.Uuid
  proposalHash              String
  idempotencyKey            String
  goal                      String   @db.Text
  reasonCode                String
  expectedOutput            String   @db.Text
  likelyDelegations         Json     @db.JsonB
  resourceSnapshot          Json     @db.JsonB
  boundaryAguiRunId         String
  status                    String
  expiresAt                 DateTime @db.Timestamptz
  decidedAt                 DateTime? @db.Timestamptz
  sessionId                 String?  @db.Uuid
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  @@unique([organizationId, copilotThreadId, idempotencyKey])
  @@index([organizationId, userId, status, expiresAt])
}

model AgentSession {
  id                        String   @id @default(uuid()) @db.Uuid
  organizationId            String   @db.Uuid
  threadBindingId           String   @unique @db.Uuid
  copilotThreadId           String   @unique
  primaryAgentVersionId     String   @db.Uuid
  authorityProfileVersionId String   @db.Uuid
  goal                      String   @db.Text
  status                    String
  createdByUserId           String   @db.Uuid
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  completedAt               DateTime?
  tasks                     AgentSessionTask[]
  @@index([organizationId, status, updatedAt])
}

model AgentSessionTask {
  id                     String   @id @default(uuid()) @db.Uuid
  organizationId         String   @db.Uuid
  sessionId              String   @db.Uuid
  parentTaskId           String?  @db.Uuid
  assignedAgentVersionId String   @db.Uuid
  objective              String   @db.Text
  status                 String
  operationsRunId        String?  @db.Uuid
  idempotencyKey         String
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  finishedAt             DateTime?
  session                AgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  parent                 AgentSessionTask? @relation("AgentSessionTaskTree", fields: [parentTaskId], references: [id])
  children               AgentSessionTask[] @relation("AgentSessionTaskTree")
  @@unique([sessionId, idempotencyKey])
  @@index([organizationId, sessionId, status])
}

model AgentSessionTaskDelegation {
  id                     String   @id @default(uuid()) @db.Uuid
  organizationId         String   @db.Uuid
  sessionId              String   @db.Uuid
  parentTaskId           String   @db.Uuid
  childTaskId            String   @unique @db.Uuid
  fromAgentVersionId     String   @db.Uuid
  toAgentVersionId       String   @db.Uuid
  objective              String   @db.Text
  authorityProfileVersionId String @db.Uuid
  status                 String
  idempotencyKey         String
  createdAt              DateTime @default(now())
  finishedAt             DateTime?
  @@unique([sessionId, idempotencyKey])
  @@index([organizationId, sessionId, status])
}

model AgentExecutionAttempt {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  executionId    String   @db.Uuid
  attempt        Int
  runtimeType    String
  externalRunId String?
  handleRef      String?
  status         String
  startedAt      DateTime @default(now())
  finishedAt     DateTime?
  errorCode      String?
  @@unique([executionId, attempt])
  @@index([organizationId, status, startedAt])
}

model AgentSessionApproval {
  id                   String   @id @default(uuid()) @db.Uuid
  organizationId       String   @db.Uuid
  sessionId             String   @db.Uuid
  sessionTaskId         String   @db.Uuid
  capabilityKey        String
  argumentsHash        String
  resourceSnapshot     Json     @db.JsonB
  requestedByExecutionId String @db.Uuid
  status               String
  expiresAt            DateTime @db.Timestamptz
  decidedByUserId      String?  @db.Uuid
  decidedAt            DateTime?
  idempotencyKey       String
  @@unique([organizationId, idempotencyKey])
  @@index([organizationId, sessionId, status])
}

model AgentSessionArtifact {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  sessionId      String   @db.Uuid
  sessionTaskId  String   @db.Uuid
  artifactType   String
  storageRef     String
  sha256         String
  metadata       Json     @db.JsonB
  status         String
  createdAt      DateTime @default(now())
  @@index([organizationId, sessionId, createdAt])
}
```

Reuse the foundation's `AgentExecutionUsage` ledger for official attempts, adding nullable `executionAttemptId` when attempt-level attribution is required. Add nullable `operationsRunId` to `AgentExecution` with an organization-scoped index. Do not add any transcript/message field.

- [ ] **Step 4: Add Operations checkpoint model**

```prisma
model OperationRunCheckpoint {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @db.Uuid
  operationRunId  String   @db.Uuid
  sequence        Int
  kind            String
  state           Json     @db.JsonB
  createdAt       DateTime @default(now()) @db.Timestamptz
  operationRun    OperationRun @relation(fields: [operationRunId], references: [id], onDelete: Cascade)
  @@unique([operationRunId, sequence])
  @@index([organizationId, operationRunId, createdAt])
}
```

`state` may contain opaque handle references, progress, and last normalized event sequence; it must reject credentials, cookies, tokens, raw provider responses, and message bodies using the existing safe-operation-result rules extended for checkpoints.

- [ ] **Step 5: Implement repository transactions and run gates**

`createSessionFromPromotion` executes in one serializable transaction: select pending promotion in organization scope, lock the binding using tagged raw SQL, re-read session by thread, create epoch+session+root task, update binding class/epoch, mark promotion `session_created`, and return the winner on unique conflict. The repository never reads by bare ID.

Run:

```bash
npm run db:push
npx prisma generate
npx vitest run apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-session.repository.spec.ts
npm run check:idor
npm run check:tenant-scope
```

Expected: schema/tests/scanners pass; concurrent repository calls create one session/root task/epoch.

- [ ] **Step 6: Commit additive official persistence**

```bash
git add prisma apps/server/src/agent-os apps/server/src/operations
git commit -m "feat: add official agent session control models"
```

## Task 3: Evaluate Promotion Criteria And Emit A Standard Interrupt

**Files:**
- Create: `apps/server/src/agent-os/application/service/agent-promotion-policy.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-promotion-policy.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-promotion.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-promotion.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/quick-ask-run.service.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-agui-run.service.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

**Interfaces:**
- Consumes: normalized tool/intent request, current Quick Ask policy, principal, resource refs, thread binding.
- Produces: `PromotionRequirement`, pending promotion ledger, and AG-UI `RUN_FINISHED` interrupt with reason `official_session_promotion`.

- [ ] **Step 1: Write deterministic policy tests**

```typescript
describe('AgentPromotionPolicyService', () => {
  it.each([
    ['delegate_agent', 'delegation'], ['db_write', 'domain_write'],
    ['external_write', 'external_side_effect'], ['approval_required', 'user_approval'],
    ['detached', 'asynchronous_execution'], ['artifact', 'durable_artifact'],
    ['shared_resume', 'shared_resume'], ['schedule', 'monitoring_or_schedule'],
    ['broader_authority', 'broader_authority'],
  ])('promotes %s as %s', (signal, reasonCode) => {
    expect(service.evaluate(intent({ signal }))).toMatchObject({ required: true, reasonCode });
  });

  it.each(['long_answer', 'complex_question', 'many_reads', 'follow_up', 'slow_latency', 'navigation'])
    ('does not promote %s', (signal) => expect(service.evaluate(intent({ signal }))).toEqual({ required: false }));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-promotion-policy.service.spec.ts`

Expected: FAIL because the policy service is missing.

- [ ] **Step 3: Implement code-owned criteria**

```typescript
const REASONS = new Map<PromotionSignal, PromotionReason>([
  ['delegate_agent', 'delegation'], ['db_write', 'domain_write'],
  ['external_write', 'external_side_effect'], ['approval_required', 'user_approval'],
  ['detached', 'asynchronous_execution'], ['artifact', 'durable_artifact'],
  ['shared_resume', 'shared_resume'], ['schedule', 'monitoring_or_schedule'],
  ['broader_authority', 'broader_authority'],
]);

evaluate(intent: AgentIntent): PromotionRequirement {
  for (const signal of intent.signals) {
    const reasonCode = REASONS.get(signal);
    if (reasonCode) return { required: true, reasonCode };
  }
  return { required: false };
}
```

Signals must come from requested capability metadata and explicit runtime/task requirements, not free-form model prose. Model-proposed goal/output/delegations are treated as untrusted candidates and normalized/limited before persistence.

- [ ] **Step 4: Persist proposal and emit standard interrupt**

Create the proposal with a stable key `sha256(organizationId|threadId|agentVersionId|normalizedGoal|reasonCode|resourceVersionSet)`, ten-minute expiry, and current boundary `aguiRunId`. Emit `StateSnapshot` and `MessagesSnapshot` before:

```typescript
{
  type: EventType.RUN_FINISHED,
  threadId,
  runId,
  outcome: {
    type: 'interrupt',
    interrupts: [{
      id: promotion.id,
      reason: 'official_session_promotion',
      message: proposal.goal,
      expiresAt: promotion.expiresAt.toISOString(),
      responseSchema: zodToJsonSchema(PromotionDecisionSchema),
      metadata: PromotionProposalSchema.parse(proposal),
    }],
  },
}
```

The Quick Ask execution terminal state becomes `interrupted`; it remains `sessionId: null`. It does not invoke the requested mutation/delegation.

- [ ] **Step 5: Run policy and interrupt conformance tests**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-promotion-policy.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-session-promotion.service.spec.ts apps/server/src/agent-os/application/service/__tests__/quick-ask-run.service.spec.ts
```

Expected: tests pass; snapshots precede one interrupt terminal event; read-only exclusions do not produce a proposal.

- [ ] **Step 6: Commit promotion proposal flow**

```bash
git add apps/server/src/agent-os
git commit -m "feat: propose official agent sessions"
```

## Task 4: Confirm Promotion Under Lock And Start A Trusted Context Epoch

**Files:**
- Modify: `apps/server/src/agent-os/application/service/agent-session-promotion.service.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-session-promotion.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-context-handoff.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-context-handoff.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/agent-os-agui.controller.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-thread-binding.service.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/agent-interaction-bootstrap.controller.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts`

**Interfaces:**
- Consumes: standard AG-UI resume payload covering every open interrupt.
- Produces: `confirm(input): PromotionResult`, immutable validated handoff storage reference, epoch `N+1`, one official session/root task, updated bootstrap target, or explicit branch decision.

- [ ] **Step 1: Write stale and concurrent confirmation tests**

```typescript
it('rejects stale resources before session creation', async () => {
  const service = createPromotionService({ currentResourceVersion: '8', proposedVersion: '7' });
  await expect(service.confirm(confirmInput())).rejects.toMatchObject({ code: 'PROMOTION_RESOURCE_STALE' });
  expect(service.repository.createSessionFromPromotion).not.toHaveBeenCalled();
});

it('creates one session under concurrent acceptance', async () => {
  const [left, right] = await Promise.all([service.confirm(confirmInput()), service.confirm(confirmInput())]);
  expect(left.sessionId).toBe(right.sessionId);
  expect(await countSessionsForThread('thread-1')).toBe(1);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-session-promotion.service.spec.ts`

Expected: stale/concurrency assertions fail before confirmation is implemented.

- [ ] **Step 3: Implement resume validation**

Reject when any of these differs from the pending row: organization, user, thread, agent version, promotion ID, idempotency key, open interrupt set, expiry, proposal hash, resource version, or current membership/agent permission. `reject` changes only promotion state and returns the thread to Quick Ask. `accept` sets `accepted` inside the locked transaction before creating the session and finally sets `session_created`.

- [ ] **Step 4: Build a server-validated handoff**

```typescript
export interface ValidatedContextHandoff {
  promotionId: string;
  goal: string;
  reasonCode: PromotionReason;
  resourceRefs: CanonicalResourceRef[];
  requestedCapabilityKey: string | null;
  primaryAgentVersionId: string;
  authorityProfileVersionId: string;
  confirmedByUserId: string;
  confirmedAt: string;
}
```

Store the JSON in the approved artifact/control object store, hash it, and persist only `validatedHandoffRef` plus hash in `AgentContextEpoch`. Do not include transcript text, assistant claims, browser permissions, or copied domain facts. The official runtime re-reads resources through capabilities.

In the default in-place transaction, update the existing binding to `interactionClass='official_task'`, clear `idleExpiresAt`, set `contextEpoch=N+1`, and attach the new session ID before commit. `resolveTarget` must check an active official binding before Quick Ask expiry logic and return its same thread with `hasExplicitThreadId: true` and `refreshAt: null`. The bootstrap endpoint therefore immediately changes its header/selector semantics after the successful resume refetch; it never invents a second Quick Ask thread for the primary official agent.

Branch only when `excludeCasualContext=true`, principal/organization changed, or the authority policy requires clean separation. Create the branch through the supported Enterprise Intelligence thread API, bind the new thread to the same session transaction, and attach the same validated handoff reference; never copy transcript messages. A branch response replaces the bootstrap target only after the session transaction succeeds.

- [ ] **Step 5: Run promotion transaction and tenancy gates**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-session-promotion.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-context-handoff.service.spec.ts apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts
npm run check:idor
npm run check:tenant-scope
```

Expected: tests/scanners pass; replayed/stale/cross-org decisions fail; concurrent accept returns one session.

- [ ] **Step 6: Commit promotion transaction**

```bash
git add apps/server/src/agent-os
git commit -m "feat: promote thread into official session"
```

## Task 5: Render Promotion As CopilotKit Standard HITL

**Files:**
- Create: `apps/web/src/components/interaction-os/PromotionInterruptRenderer.tsx`
- Create: `apps/web/src/components/interaction-os/PromotionCard.tsx`
- Create: `apps/web/src/components/interaction-os/__tests__/PromotionCard.spec.tsx`
- Modify: `apps/web/src/components/interaction-os/InteractionRenderers.tsx`
- Modify: `apps/web/src/components/interaction-os/InteractionSurface.tsx`
- Modify: `apps/web/src/components/interaction-os/InteractionHeader.tsx`

**Interfaces:**
- Consumes: AG-UI standard interrupt and `PromotionProposalSchema`; CopilotKit v2 `useInterrupt`.
- Produces: exactly-once `resolve(PromotionDecision)`/`cancel()` response and official surface state after session creation.

- [ ] **Step 1: Write explicit confirmation tests**

```tsx
it('states the authority boundary and resolves once', async () => {
  const resolve = vi.fn();
  render(<PromotionCard proposal={proposal()} onAccept={() => resolve(decision('accept'))} onReject={() => resolve(decision('reject'))} />);
  expect(screen.getByText('세션 시작은 이후의 구매·등록·광고·결제 등 비즈니스 실행을 승인하지 않습니다.')).toBeVisible();
  await userEvent.dblClick(screen.getByRole('button', { name: 'AgentOS 작업 시작' }));
  expect(resolve).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace=apps/web -- src/components/interaction-os/__tests__/PromotionCard.spec.tsx`

Expected: FAIL because promotion components are absent.

- [ ] **Step 3: Register the interrupt renderer**

```tsx
useInterrupt({
  agentId,
  enabled: ({ value }) => value?.reason === 'official_session_promotion',
  renderInChat: true,
  render: ({ interrupt, resolve, cancel }) => {
    const proposal = PromotionProposalSchema.parse(interrupt.metadata);
    return (
      <PromotionCard
        proposal={proposal}
        onAccept={() => resolve({ promotionId: proposal.promotionId, decision: 'accept', idempotencyKey: proposal.idempotencyKey })}
        onReject={() => resolve({ promotionId: proposal.promotionId, decision: 'reject', idempotencyKey: proposal.idempotencyKey })}
        onExpired={cancel}
      />
    );
  },
});
```

The renderer uses only the server-provided stable idempotency key in proposal metadata. Disable buttons after first click and at expiry. After `resolve` reports `session_created`, invalidate `GET /api/agent-os/interaction/bootstrap`; the returned target keeps the same thread ID, changes to `official_task`, becomes explicit, and locks the primary agent selector. Do not render an approval label for promotion.

- [ ] **Step 4: Run promotion UI/build gates**

Run:

```bash
npm test --workspace=apps/web -- src/components/interaction-os/__tests__/PromotionCard.spec.tsx
npm run build --workspace=apps/web
```

Expected: tests/build pass; standard interrupt resume is used and session start has one primary action.

- [ ] **Step 5: Commit promotion HITL**

```bash
git add apps/web/src/components/interaction-os
git commit -m "feat: render official session promotion interrupt"
```

## Task 6: Add Operations-Owned Durable Task Dispatch And Checkpoints

**Files:**
- Create: `apps/server/src/agent-os/domain/operation/agent-os.operations.ts`
- Create: `apps/server/src/agent-os/adapter/in/operation/agent-session-task.operation-handler.ts`
- Create: `apps/server/src/agent-os/adapter/in/operation/__tests__/agent-session-task.operation-handler.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-task-dispatch.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-task-dispatch.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-delegation.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-delegation.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-task-schedule.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-task-schedule.service.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `packages/shared/src/schemas/operations.ts`
- Modify: `prisma/models/system.prisma`
- Create: `apps/server/src/operations/application/port/in/operation-scheduler.port.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/operations/application/service/operation-run-worker.service.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run-worker.service.spec.ts`

**Interfaces:**
- Consumes: `OPERATION_RUNNER_PORT`, handler registry, checkpoint repository, root `AgentSessionTask`.
- Produces: code-owned operations `agent-os.execute-session-task` v1 and `agent-os.resume-session-task` v1 with engine `agent_os`; task ↔ `OperationRun` correlation, resumable checkpoint protocol, child-task delegation, and task-keyed schedules.

- [ ] **Step 1: Write operation definition/dispatch tests**

```typescript
it('registers one unscheduled AgentOS execution operation', () => {
  expect(AGENT_OS_OPERATIONS).toContainEqual(expect.objectContaining({
    key: 'agent-os.execute-session-task', version: 1, ownerDomain: 'agent-os',
    engineType: 'agent_os', allowedTriggers: ['agent'], scheduleSupported: false,
  }));
});

it('uses task identity as the operation idempotency key', async () => {
  const first = await service.dispatch(taskInput());
  const second = await service.dispatch(taskInput());
  expect(second.operationsRunId).toBe(first.operationsRunId);
});

it('delegates once to an allowed immutable agent version', async () => {
  const first = await delegation.delegate(delegationInput({ toAgentVersionId: 'agent-version-2' }));
  const second = await delegation.delegate(delegationInput({ toAgentVersionId: 'agent-version-2' }));
  expect(second.childTaskId).toBe(first.childTaskId);
  expect(second.operationsRunId).toBe(first.operationsRunId);
});

it('keys a scheduled resume by task without creating a new session', async () => {
  await schedules.upsert({ organizationId: 'org-1', sessionId: 'session-1', taskId: 'task-1', cronExpression: '0 9 * * 1', timeZone: 'Asia/Seoul' });
  expect(operations.upsertSchedule).toHaveBeenCalledWith(expect.objectContaining({
    operationKey: 'agent-os.resume-session-task', scheduleKey: 'task-1',
  }));
  expect(sessionRepository.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/adapter/in/operation/__tests__/agent-session-task.operation-handler.spec.ts`

Expected: FAIL because the operation definition/handler are missing.

- [ ] **Step 3: Define and register the operation**

```typescript
export const AGENT_OS_OPERATIONS = [{
  key: 'agent-os.execute-session-task', version: 1,
  title: 'AgentOS 공식 작업 실행', ownerDomain: 'agent-os', engineType: 'agent_os',
  allowedTriggers: ['agent'], scheduleSupported: false, maxAttempts: 5,
  inputSchema: z.object({ sessionId: z.string().uuid(), taskId: z.string().uuid(), executionId: z.string().uuid() }).strict(),
}, {
  key: 'agent-os.resume-session-task', version: 1,
  title: 'AgentOS 공식 작업 예약 재개', ownerDomain: 'agent-os', engineType: 'agent_os',
  allowedTriggers: ['agent', 'schedule'], scheduleSupported: true, maxAttempts: 5,
  inputSchema: z.object({ sessionId: z.string().uuid(), taskId: z.string().uuid(), executionId: z.string().uuid() }).strict(),
}] as const satisfies readonly OperationDefinition[];
```

The handler registers on module init, loads task/session/execution with organization scope, reads the last `OperationRunCheckpoint`, calls official execution start or reconnect, writes a checkpoint after runtime start, every validated interrupt/artifact boundary, every 100 normalized events, and terminal state, then returns the appropriate `OperationHandlerResult`.

Extend `OperationSchedule` with required `scheduleKey String` and change its uniqueness to `(organizationId, operationKey, scheduleKey)` so multiple official tasks can schedule independent follow-ups. Existing schedules backfill `scheduleKey = 'default'` in the expand migration. `AgentSessionTaskScheduleService` uses `scheduleKey = taskId`; a schedule resumes an existing task and never creates a session from deterministic automation.

Expose an `OPERATION_SCHEDULER_PORT` with `upsert(input: { organizationId; operationKey; scheduleKey; cronExpression; timeZone; input; createdByUserId }): Promise<{ id: string }>` and `disable(input: { organizationId; operationKey; scheduleKey }): Promise<void>` from `OperationsModule`; AgentOS never imports the Operations repository.

`AgentSessionDelegationService.delegate` validates the parent task/session, target active `AgentVersion`, requested child authority as a subset of the session authority profile, depth/count policy, and stable idempotency key. In one organization-scoped transaction it creates the child `AgentSessionTask` and `AgentSessionTaskDelegation`; after commit it dispatches exactly one child OperationRun. The parent becomes `waiting_dependency` and resumes only after all child tasks terminalize.

- [ ] **Step 4: Make lease recovery checkpoint-aware**

When a worker lease expires, `claimNextRun` increments attempts but preserves checkpoints. The handler calls `adapter.inspect` on the stored handle: running → reconnect, completed → reconcile terminal output, cancelled → cancel task, unknown/missing → fail `AGENT_RUNTIME_HANDLE_LOST` without starting a duplicate external run. Heartbeat/lease renewal is driven from event progress and a timer shorter than half the lease.

- [ ] **Step 5: Run Operations and handler gates**

Run:

```bash
npx vitest run apps/server/src/agent-os/adapter/in/operation/__tests__/agent-session-task.operation-handler.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-session-task-dispatch.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-session-delegation.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-session-task-schedule.service.spec.ts apps/server/src/operations/application/service/__tests__/operation-run-worker.service.spec.ts
npm run check:directory-architecture
```

Expected: tests pass; Operations owns checkpoint/lease and AgentOS owns task semantics; duplicate dispatch yields one OperationRun.

- [ ] **Step 6: Commit durable dispatch**

```bash
git add apps/server/src/agent-os apps/server/src/operations
git commit -m "feat: dispatch official agent tasks durably"
```

## Task 7: Enforce Runtime Capability Matrices And Implement Hermes

**Files:**
- Modify: `apps/server/src/agent-os/application/service/agent-runtime-adapter.registry.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-runtime-adapter.registry.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/hermes-http-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/hermes-acp-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/runtime-credential-broker.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/run-scoped-mcp-config.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `docs/runbooks/environment-variables.md`

**Interfaces:**
- Consumes: stable `AgentRuntimeAdapter`, task requirements, approved capability grants.
- Produces: `requireCompatible(runtimeType, requirements)` and Hermes HTTP/ACP adapters with opaque reconnectable handles.

- [ ] **Step 1: Write no-fallback capability tests**

```typescript
it('rejects selected runtime when required durability is absent', () => {
  registry.register(adapter('openai_responses', { detached: false, reconnect: false, interrupt: false, cancel: true, inspect: true }));
  expect(() => registry.requireCompatible('openai_responses', {
    detached: true, reconnect: true, interrupt: false, cancel: true, inspect: true,
  })).toThrow(/AGENT_RUNTIME_CAPABILITY_MISMATCH/);
  expect(registry.resolveFallback).toBeUndefined();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-runtime-adapter.registry.spec.ts`

Expected: FAIL because compatibility enforcement is missing.

- [ ] **Step 3: Implement exact compatibility matching**

```typescript
requireCompatible(runtimeType: string, required: RuntimeCapabilities): AgentRuntimeAdapter {
  const adapter = this.adapters.get(runtimeType);
  if (!adapter) throw new AgentOsError('AGENT_RUNTIME_NOT_CONFIGURED');
  const missing = (Object.keys(required) as Array<keyof RuntimeCapabilities>)
    .filter((key) => required[key] && !adapter.capabilities[key]);
  if (missing.length) throw new AgentOsError('AGENT_RUNTIME_CAPABILITY_MISMATCH', { runtimeType, missing });
  return adapter;
}
```

- [ ] **Step 4: Implement Hermes adapters**

Hermes HTTP is the default detached automation adapter. Its handle contains only `runtimeType`, Hermes run ID, and a reference to encrypted reconnect material. `connect` converts Hermes stream items to `NormalizedRuntimeEvent`; `interrupt` maps decisions to Hermes approval/input; `cancel` is idempotent; `inspect` maps exact remote status.

Hermes ACP is selected only for interactive requirements proven in the platform matrix. Both adapters receive a generated run directory, a run-scoped MCP JSON containing only policy-granted KidItem tools, and short-lived credentials from `RuntimeCredentialBroker`. Reject command/config containing `--yolo`, approval-off flags, shared home paths, unscoped MCP servers, or user-supplied executable paths.

- [ ] **Step 5: Run Hermes and credential isolation tests**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-runtime-adapter.registry.spec.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts
```

Expected: tests pass; reconnect after adapter object recreation uses the persisted handle; disallowed flags/tool grants fail.

- [ ] **Step 6: Commit Hermes adapters**

```bash
git add apps/server/src/agent-os docs/runbooks/environment-variables.md
git commit -m "feat: add durable hermes runtime adapters"
```

## Task 8: Implement Isolated Codex And Claude CLI Adapters

**Files:**
- Create: `apps/server/src/agent-os/adapter/out/runtime/isolated-cli-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/codex-cli-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/claude-cli-runtime.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/__tests__/isolated-cli-runtime.adapter.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/routing-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `docs/runbooks/environment-variables.md`

**Interfaces:**
- Consumes: runtime contract/capability registry and run-scoped MCP/credential broker from Task 7.
- Produces: `codex_cli` and `claude_cli` adapters executing in the configured isolated worker/sandbox with durable handle/status files.

- [ ] **Step 1: Write process isolation and handle tests**

```typescript
it('uses a unique run home and never inherits broad credentials', async () => {
  const adapter = createCodexAdapter({ workerRoot: '/var/lib/kiditem-agent-runs' });
  const handle = await adapter.start(runtimeInput({ executionId: 'execution-1' }));
  expect(spawn).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({
    cwd: '/var/lib/kiditem-agent-runs/execution-1/work',
    env: expect.not.objectContaining({ HOME: expect.any(String), AWS_SECRET_ACCESS_KEY: expect.any(String) }),
  }));
  expect(handle.externalRunId).toBeTruthy();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/adapter/out/runtime/__tests__/isolated-cli-runtime.adapter.spec.ts`

Expected: FAIL because isolated adapters are missing.

- [ ] **Step 3: Implement the shared isolated supervisor**

The supervisor validates an explicit executable allowlist and version, creates `/var/lib/kiditem-agent-runs/<executionId>/{home,work,state}`, writes config with owner-only permissions, supplies `HOME` only to the child (never repurposes shell `$HOME` in scripts), strips ambient cloud/model credentials, injects brokered run credentials, persists PID/runtime-native session ID plus state reference, and normalizes stdout/stderr through adapter-specific parsers. The web and Interaction Gateway images do not contain these executables.

`inspect` checks native session status first and PID only as supporting evidence. After worker restart, reconnect uses the native session/handle; when a CLI cannot reconnect by supported API, its matrix must set `reconnect: false`, causing official selection to fail rather than start it.

- [ ] **Step 4: Implement Codex/Claude specializations**

Each specialization supplies an exact command builder, version probe, native resume/cancel mechanism, event parser, allowed environment keys, and approval mapping. Route all KidItem business access through the run-scoped MCP server. Do not permit arbitrary shell, filesystem roots, direct database credentials, or broad local config import.

- [ ] **Step 5: Run adapter and server gates**

Run:

```bash
npx vitest run apps/server/src/agent-os/adapter/out/runtime/__tests__/isolated-cli-runtime.adapter.spec.ts
npm run dev:server
```

Expected: adapter tests pass; server registers only configured adapters and logs capability matrices without secrets or fallback. Stop the watch process.

- [ ] **Step 6: Commit isolated adapters**

```bash
git add apps/server/src/agent-os docs/runbooks/environment-variables.md
git commit -m "feat: isolate official cli runtimes"
```

## Task 9: Add Official Progress, Approval, Artifact, Resume, And Cancel

**Files:**
- Create: `apps/server/src/agent-os/application/service/official-agent-run.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/official-agent-run.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-approval.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-approval.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/agent-session-cancellation.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-session-cancellation.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-session.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-session.controller.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-agui-run.service.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

**Interfaces:**
- Consumes: official session/task/execution, Operations run/checkpoints, runtime normalized events.
- Produces: official AG-UI replay/progress/interrupt stream; `GET /api/agent-os/sessions`, `GET /api/agent-os/sessions/:sessionId`, scoped approval decision, and cancellation endpoints. Session list queries only `AgentSession`, so Quick Ask bindings never appear.

- [ ] **Step 1: Write approval and cancellation tests**

```typescript
it('binds approval to task, arguments, resources, actor and expiry', async () => {
  const approval = await approvals.request(approvalInput());
  await expect(approvals.decide({ ...decisionInput(approval.id), argumentsHash: 'different' }))
    .rejects.toMatchObject({ code: 'APPROVAL_CONTEXT_CHANGED' });
});

it('propagates cancellation once through every layer', async () => {
  await Promise.all([cancellation.cancel(cancelInput()), cancellation.cancel(cancelInput())]);
  expect(operations.cancel).toHaveBeenCalledOnce();
  expect(runtime.cancel).toHaveBeenCalledOnce();
  expect(await taskStatus()).toBe('cancelled');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-session-approval.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-session-cancellation.service.spec.ts`

Expected: FAIL because the official services are missing.

- [ ] **Step 3: Implement official event handling**

On `text_delta`, stream normal AG-UI text. On task progress, emit `kiditem.ui.official_progress.v1`. On `approval_request`, persist `AgentSessionApproval`, checkpoint it, emit snapshots plus a standard interrupt, and do not call the capability until a valid approval resume. On artifact, validate storage reference/hash/ownership, persist `AgentSessionArtifact`, and emit `kiditem.ui.artifact.v1`. On completion/failure/cancel, reconcile adapter → AgentExecutionAttempt → AgentExecution → AgentSessionTask → OperationRun in that order with idempotent conditional updates.

- [ ] **Step 4: Implement approval resume and cancel endpoints**

Approval resume validates every open interrupt, authenticated actor, membership, task/approval status, expiry, capability/arguments hash, and current resource versions. `approve` grants only that invocation; `reject` returns a normalized denial to the runtime. Session promotion is never accepted as an approval ID.

`POST /api/agent-os/sessions/:sessionId/tasks/:taskId/cancel` derives organization/user from decorators, parses `CancelOfficialTaskSchema`, marks cancellation requested, cancels Operations, calls adapter cancel using the latest handle, and finalizes idempotently. Panel close and disconnect call neither endpoint.

- [ ] **Step 5: Run official control gates**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/official-agent-run.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-session-approval.service.spec.ts apps/server/src/agent-os/application/service/__tests__/agent-session-cancellation.service.spec.ts apps/server/src/agent-os/adapter/in/http/__tests__/agent-session.controller.spec.ts
npm run check:idor
npm run check:tenant-scope
```

Expected: tests/scanners pass; stale/replayed approvals fail; cancellation is exactly-once and organization-scoped.

- [ ] **Step 6: Commit official controls**

```bash
git add apps/server/src/agent-os
git commit -m "feat: control durable official agent work"
```

## Task 10: Render Official State In The Shared Surface

**Files:**
- Create: `apps/web/src/components/interaction-os/OfficialInteractionRenderers.tsx`
- Create: `apps/web/src/components/interaction-os/OfficialProgressCard.tsx`
- Create: `apps/web/src/components/interaction-os/AgentApprovalCard.tsx`
- Create: `apps/web/src/components/interaction-os/AgentArtifactCard.tsx`
- Create: `apps/web/src/components/interaction-os/__tests__/OfficialInteractionRenderers.spec.tsx`
- Modify: `apps/web/src/components/interaction-os/InteractionRenderers.tsx`
- Modify: `apps/web/src/components/interaction-os/InteractionSurface.tsx`
- Modify: `apps/web/src/app/agent-os/components/ExecutionCanvas.tsx`

**Interfaces:**
- Consumes: official schemas and standard interrupts; session/task control API.
- Produces: progress, approval, artifact, retry/resume/cancel UI shared by global panel and workspace.

- [ ] **Step 1: Write surface consistency and close semantics tests**

```tsx
it('shows the same task and does not cancel when panel closes', async () => {
  const { rerender } = render(<InteractionSurface surface="global_panel" />);
  expect(screen.getByTestId('official-task-task-1')).toHaveTextContent('실행 중');
  rerender(<div />);
  expect(mockCancelTask).not.toHaveBeenCalled();
  render(<InteractionSurface surface="agentos_workspace" />);
  expect(screen.getByTestId('official-task-task-1')).toHaveTextContent('실행 중');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace=apps/web -- src/components/interaction-os/__tests__/OfficialInteractionRenderers.spec.tsx`

Expected: FAIL because official renderers are missing.

- [ ] **Step 3: Register official renderers and interrupts**

Use `useRenderTool` for progress/artifact. Use `useInterrupt` gated by reason `agent_capability_approval` for approvals; the card displays capability, exact summary, resource versions, expiry, and separate Approve/Reject actions. Parse all payloads client-side and let the server validate again on resume. A progress card provides Cancel only for cancellable task states; Retry appears only after server control API reports an allowed retry.

The `/agent-os` execution canvas subscribes to the same session/task API and correlation IDs; it does not read Copilot messages or create another chat model. `InteractionHeader` changes its class label to `Official session`, displays current connection/execution state, and shows the verified open-in-AgentOS-workspace action for the session. When the current thread is official, `AgentSelector` renders the primary immutable agent version as locked context; selecting another agent offers a new Quick Ask entry and never silently rewrites the official session's agent.

- [ ] **Step 4: Run UI/build gates**

Run:

```bash
npm test --workspace=apps/web -- src/components/interaction-os/__tests__/OfficialInteractionRenderers.spec.tsx
npm run build --workspace=apps/web
```

Expected: tests/build pass; panel/workspace show identical official state and panel unmount sends no cancel.

- [ ] **Step 5: Commit official UI**

```bash
git add apps/web/src/components/interaction-os apps/web/src/app/agent-os/components/ExecutionCanvas.tsx
git commit -m "feat: render official agent work in copilotkit"
```

## Task 11: Prove Restart, Resume, Approval, Retry, And Cancellation

**Files:**
- Create: `apps/server/src/agent-os/__tests__/official-session.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts`
- Create: `apps/web/e2e/interaction-os/official-session.spec.ts`
- Create: `deploy/interaction-intelligence/smoke-official-recovery.mjs`
- Modify: `docs/runbooks/interaction-platform.md`

**Interfaces:**
- Consumes: Tasks 1–10.
- Produces: end-to-end durability/correlation evidence and operator recovery procedure.

- [ ] **Step 1: Add promotion transaction integration coverage**

The database test must create one Quick Ask thread, request a write, capture the promotion interrupt, race two accepts, and assert:

```typescript
expect(await prisma.agentSession.count({ where: { organizationId, copilotThreadId } })).toBe(1);
expect(await prisma.agentSessionTask.count({ where: { organizationId, session: { copilotThreadId } } })).toBe(1);
expect(await prisma.agentContextEpoch.count({ where: { threadBinding: { copilotThreadId } } })).toBe(2);
expect((await prisma.agentContextEpoch.findFirstOrThrow({ where: { threadBinding: { copilotThreadId }, epoch: 2 } })).validatedHandoffRef).toBeTruthy();
```

Assert there is still one Enterprise thread and no new KidItem transcript row. Add stale/expired/cross-org/rejected branches.

- [ ] **Step 2: Add runtime recovery integration coverage**

Use a deterministic fake detached runtime that persists a handle outside process memory. Start an official task, checkpoint after three events, destroy/recreate the handler/adapter objects, reclaim the expired lease, reconnect, emit an approval, approve it, finish, and assert one external run ID, monotonic checkpoint sequence, one capability invocation, one terminal OperationRun/task/execution.

Repeat with cancellation during reconnect and with an adapter whose `reconnect` capability is false; the latter must fail before runtime start.

- [ ] **Step 3: Add browser acceptance flow**

Playwright verifies explicit promotion card/disclaimer, one session under double-click, same thread in global/workspace surfaces, progress after panel/browser closure, approval as a separate card, artifact navigation, explicit cancel, stale approval rejection, and no mutation before its own approval.

- [ ] **Step 4: Add isolated environment restart smoke**

`smoke-official-recovery.mjs` refuses production, starts a task against the approved Hermes test agent, restarts the Interaction Gateway and one Operations worker pod, reconnects to the same Copilot thread, resolves a test approval, waits for terminal state, and asserts all six correlation IDs: `copilotThreadId`, `aguiRunId`, `sessionId`, `taskId`, `executionId`, `operationsRunId`.

- [ ] **Step 5: Run complete official gates**

Run:

```bash
npm run test:integration --workspace=apps/server -- src/agent-os/__tests__/official-session.pg.integration.spec.ts src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts
npx playwright test apps/web/e2e/interaction-os/official-session.spec.ts
node deploy/interaction-intelligence/smoke-official-recovery.mjs
npm run check:conversation-boundary
npm run check:copilotkit-train
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/web
npm run dev:server
```

Expected: all finite gates pass; restart smoke finishes one official task without duplicate run/tool call; server boots. Stop the watch process.

- [ ] **Step 6: Commit durability evidence**

```bash
git add apps/server/src/agent-os/__tests__ apps/web/e2e/interaction-os/official-session.spec.ts deploy/interaction-intelligence/smoke-official-recovery.mjs docs/runbooks/interaction-platform.md
git commit -m "test: prove official agent runtime recovery"
```

## Plan Acceptance Evidence

- [ ] Every promotion reason maps to a code-owned criterion and non-criteria never promote alone.
- [ ] Promotion uses a standard AG-UI interrupt, ten-minute expiry, full open-interrupt validation, and one idempotent session transaction.
- [ ] The same CopilotKit thread remains canonical unless an explicit clean-boundary rule branches it.
- [ ] Official context starts at epoch 2 with a validated handoff reference and does not trust casual transcript/model claims as authority.
- [ ] Exactly one `AgentSession` and root `AgentSessionTask` exist for the official thread.
- [ ] Starting the session performs no purchase/listing/advertising/payment/external write and approves none.
- [ ] Operations owns run/lease/checkpoint/dispatch/cancel envelope; AgentOS owns goal/task/authority/approval/artifact/runtime policy.
- [ ] Runtime selection fails when required durability is missing and never falls back.
- [ ] Hermes and supported CLI work use isolated run-scoped MCP/credentials and reconnectable handles.
- [ ] Progress, approval, artifact, retry, resume, and cancel render identically in global panel and AgentOS workspace.
- [ ] Browser, panel, gateway, and worker restarts do not duplicate an external run or capability invocation.
- [ ] Cancellation propagates and terminal state reconciles across AgentOS, Operations, runtime, and AG-UI.
