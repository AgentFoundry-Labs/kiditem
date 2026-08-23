# AgentSession Complete Deletion Implementation Plan

> Superseded (2026-08-23). Do not resume unchecked tasks or its artifact/runtime
> cleanup graph. A new implementation plan will be derived from the
> [KID-25 Agent OS Clean Contraction Design](../specs/2026-08-23-kid-25-agent-os-clean-contraction-design.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreleased retention/legal-hold lifecycle stack with one asynchronous, recoverable, complete deletion path that removes every KidItem-owned AgentSession process, credential, file, object, canonical row, and ephemeral deletion OperationRun lineage.

**Architecture:** AgentOS owns deletion authorization, canonical session fencing, runtime/storage cleanup, graph contraction, and safe status projection through focused input/output ports. Operations owns the generic lease, attempt, database-time retry, checkpoint, lifecycle-cancellation, and code-owned ephemeral-finalization mechanics; the API composition root connects one AgentOS incoming operation adapter to those generic mechanics. This is a pre-launch replacement with fresh-schema verification only: no compatibility aliases, dual writes, backfill, second deletion worker, retention policy, legal hold, tombstone, audit projection, or shared artifact object remains.

**Tech Stack:** NestJS, TypeScript, Zod, Prisma v7 multi-file schema, PostgreSQL 17 advisory/row locks, Operations worker/checkpoints, AWS S3-compatible `StorageService`, Vitest, Testcontainers, Next.js, Playwright

---

## Source authority and execution protocol

- Design authority: `docs/superpowers/specs/2026-08-21-agent-session-deletion-design.md`.
- This plan replaces Task 1 of `docs/superpowers/plans/2026-08-13-interaction-os-first-deployment.md`; later pre-launch contraction tasks remain authoritative.
- Keep one domain exception: AgentOS deletion composes with the Operations platform and shared/schema/scanner boundaries. Do not touch InventoryCommitment or unrelated business behavior.
- Use a fresh Terra implementation agent per task. Use Sol only for integrated review.
- Review in four grouped milestones, not after every task: Tasks 1–3, Tasks 4–6, Tasks 7–9, and Task 10. A fifth Sol loop is reserved only for concrete P1/P2 fixes; never exceed five implementation/review loops.
- Start each task from a clean worktree, preserve RED evidence, run the listed GREEN gates, and make the exact task commit before the next task.
- Tasks 1–9 are local review checkpoints, not releasable cuts. Do not push,
  open a partial PR, or deploy between them; Task 10 is the first complete live
  composition and the only handoff candidate.
- A 700+ line application/adapter file is an architecture smell requiring a cohesion check, not an automatic failure. Do not compress formatting or split a serial transaction only to satisfy line count.

## Locked file and responsibility map

| Capability | New owner files | Responsibility |
| --- | --- | --- |
| Public deletion contract | `packages/shared/src/agent-interaction/deletion.ts` | Strict safe state/error response only; no retention contract |
| Deletion HTTP input | `application/port/in/session-control/agent-session-deletion.port.ts` + `application/service/session-control/agent-session-deletion.service.ts` | Creator/admin authorization, begin/status/admin retry |
| Deletion operation input | `application/port/in/session-execution/agent-session-deletion-execution.port.ts` + `application/service/session-execution/agent-session-deletion-execution.service.ts` | Ordered runtime/artifact/graph cleanup |
| Deletion persistence | `application/port/out/transaction/session-deletion/*` + `adapter/out/transaction/session-deletion/*` | Atomic fence/run creation, state reads, failure, graph delete, purge/recovery |
| Session-owned Operations | `application/port/out/operation/agent-session-operation-platform.port.ts` + `application/port/out/transaction/session-control/agent-session-owned-operation.transaction.port.ts` | Immutable definition snapshot; atomic run/ownership creation |
| Runtime cleanup | `application/port/out/runtime/agent-session-runtime-cleanup.port.ts` | Exact-handle process/credential/filesystem cleanup proof |
| Artifact writer/storage | `application/port/in/session-execution/agent-session-artifact-writer.port.ts` and focused storage/transaction ports | Derived-key materialization and three-state reconciliation |
| Operations retry/finalization | existing `common/operation-definition.ts`, dispatcher/repository/lifecycle plus focused hook registry | Generic DB-time retry and trusted ephemeral completion |
| API composition | `agent-os-api-execution.module.ts`, `agent-os-http.module.ts`, `operations.module.ts`, `api-application.module.ts` | One API worker/handler/finalizer; worker/MCP exclusion |
| Regression guard | `scripts/check-agent-session-deletion.mjs` | Ban retired model/symbol/path and missing fence/ownership boundaries |

## Locked names and constants

Use these names unchanged in every task:

```typescript
export const AGENT_SESSION_DELETE_OPERATION_KEY = 'agent-os.delete-session' as const;
export const AGENT_SESSION_DELETE_MAX_ATTEMPTS = 5;
export const AGENT_SESSION_DELETE_RETRY_DELAYS_MS = [60_000, 120_000, 240_000, 480_000] as const;
export const MAX_AGENT_SESSION_ARTIFACT_BYTES = 16 * 1024 * 1024;
export const MAX_ACTIVE_AGENT_SESSION_ARTIFACT_PUTS = 128;
export type AgentSessionDeletionState = 'deleting' | 'delete_failed' | 'finalizing';
export type OperationSuccessPersistence = 'retained' | 'ephemeral_on_success';
```

The only physical artifact key function is:

```typescript
export function agentSessionArtifactKey(input: {
  organizationId: string;
  sessionId: string;
  artifactId: string;
}): string {
  return `agent-artifacts/${input.organizationId}/${input.sessionId}/${input.artifactId}`;
}
```

### Task 1: Add the deletion contract and a pre-contraction guard

**Files:**
- Create: `packages/shared/src/agent-interaction/deletion.ts`
- Create: `packages/shared/src/agent-interaction/deletion.spec.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Create: `scripts/check-agent-session-deletion.mjs`
- Create: `scripts/__tests__/check-agent-session-deletion.test.mjs`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `package.json`
- Modify: `scripts/README.md`

- [ ] **Step 1: Write strict shared-contract RED tests**

```typescript
import {
  AgentSessionDeletionStatusSchema,
  AgentSessionDeletionFailureCodeSchema,
} from './deletion';

describe('AgentSession complete deletion contract', () => {
  it.each(['deleting', 'delete_failed', 'finalizing'] as const)(
    'accepts the safe %s state',
    (state) => {
      expect(AgentSessionDeletionStatusSchema.parse({ state, failureCode: null })).toEqual({
        state,
        failureCode: null,
      });
    },
  );

  it('rejects retention, legal-hold, object-key, and provider payload fields', () => {
    expect(() => AgentSessionDeletionStatusSchema.parse({
      state: 'delete_failed',
      failureCode: 'STORAGE_DELETE_UNKNOWN',
      legalHoldAt: null,
      storageReference: 'agent-artifacts/raw',
    })).toThrow();
  });

  it('keeps failure codes content-free and allowlisted', () => {
    expect(AgentSessionDeletionFailureCodeSchema.parse('RUNTIME_CLEANUP_UNKNOWN')).toBe(
      'RUNTIME_CLEANUP_UNKNOWN',
    );
    expect(() => AgentSessionDeletionFailureCodeSchema.parse('s3://secret/path')).toThrow();
  });
});
```

- [ ] **Step 2: Run the shared tests and record RED**

Run:

```bash
npm exec --workspace=packages/shared vitest -- run \
  src/agent-interaction/deletion.spec.ts
```

Expected: FAIL because `deletion.ts` does not exist.

- [ ] **Step 3: Implement and export the new contract**

```typescript
import { z } from 'zod';

export const AgentSessionDeletionStateSchema = z.enum([
  'deleting',
  'delete_failed',
  'finalizing',
]);

export const AgentSessionDeletionFailureCodeSchema = z.enum([
  'RUNTIME_CLEANUP_UNKNOWN',
  'ARTIFACT_WRITER_NOT_FENCED',
  'STORAGE_DELETE_PRESENT',
  'STORAGE_DELETE_UNKNOWN',
  'SESSION_OPERATION_OWNERSHIP_INVALID',
  'SESSION_GRAPH_CHANGED',
  'SESSION_DELETION_INVARIANT',
]);

export const AgentSessionDeletionStatusSchema = z.object({
  state: AgentSessionDeletionStateSchema,
  failureCode: AgentSessionDeletionFailureCodeSchema.nullable(),
}).strict();

export type AgentSessionDeletionState = z.infer<typeof AgentSessionDeletionStateSchema>;
export type AgentSessionDeletionFailureCode = z.infer<
  typeof AgentSessionDeletionFailureCodeSchema
>;
export type AgentSessionDeletionStatus = z.infer<typeof AgentSessionDeletionStatusSchema>;
```

Add explicit exports from `./deletion` to
`packages/shared/src/agent-interaction/index.ts`. Keep the old lifecycle export
only until the runtime/schema contraction in Task 7 so intermediate commits
continue to compile; it is not a compatibility promise and is never shipped.
Do not add an export to `packages/shared/src/index.ts`.

- [ ] **Step 4: Write scanner RED fixtures**

```javascript
it('rejects every retired lifecycle concept', () => {
  const result = runScanner(fixture({
    'prisma/models/agents.prisma': 'model AgentSessionTombstone {}',
  }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AgentSessionTombstone/);
});

it('rejects raw artifact references and a second deletion worker', () => {
  const result = runScanner(fixture({
    'apps/server/src/agent-os/a.ts': 'const storageReference = input.path;',
    'apps/server/src/agent-os/b.ts': 'setInterval(runDeletion, 1000);',
  }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /storageReference/);
  assert.match(result.stderr, /second deletion scheduler/);
});
```

- [ ] **Step 5: Run scanner tests and record RED**

Run: `node --test scripts/__tests__/check-agent-session-deletion.test.mjs`

Expected: FAIL because the scanner does not exist.

- [ ] **Step 6: Implement the scanner and defer the live convention switch**

The scanner must fail on production occurrences of:

```javascript
const RETIRED = [
  'AgentInteractionRetentionPolicy',
  'AgentSessionLifecycleRequest',
  'AgentSessionTombstone',
  'AgentSessionLegalAuditProjection',
  'AgentSessionArtifactObject',
  'AgentSessionArtifactObjectRetentionHold',
  'AgentSessionArtifactObjectTombstone',
  'legalHoldAt',
  'legalHoldReason',
  'retentionDueAt',
  'retentionClass',
  'independentLegalBasisCode',
  'independentRetentionDueAt',
  'INTERACTION_LIFECYCLE_HMAC_KEY',
];

const FORBIDDEN_ARTIFACT_FIELDS = ['storageReference', 'storageObjectId'];
const FORBIDDEN_DELETE_SCHEDULERS = [
  /AgentSessionDeletion(Job|Processor|Scheduler)/,
  /setInterval\([^)]*(delete|retention)/s,
  /@Interval\([^)]*(delete|retention)/s,
];
```

Exclude test fixtures and this scanner's own string tables from production-symbol findings. Also require all session mutation transaction adapters listed in Task 5 to import the canonical lifecycle-lock helper and require every production creation of a session-originated OperationRun to call the owned-run transaction port.

Add `check:agent-session-deletion` to `package.json`, the script inventory, and
`scripts/README.md`. Do not add it to `check:conventions` yet: the live source
must remain RED until the contracted code lands in Task 7. Keep the existing
interaction-lifecycle scanner active during that interval.

- [ ] **Step 7: Verify Task 1 GREEN**

Run:

```bash
npm exec --workspace=packages/shared vitest -- run \
  src/agent-interaction/deletion.spec.ts \
  src/agent-interaction/index.spec.ts
node --test scripts/__tests__/check-agent-session-deletion.test.mjs
npm run check:scripts-inventory
npm run build --workspace=packages/shared
! npm run check:agent-session-deletion
```

Expected: fixture tests, inventory, and shared build PASS. The negated live
scanner command succeeds by observing the intended RED list: retired Task 1
symbols, raw artifact references, missing universal fences, and missing
session-run ownership. Record that list as the contraction baseline.

- [ ] **Step 8: Commit Task 1**

```bash
git add packages/shared/src/agent-interaction scripts package.json
git commit -m "test: add AgentSession deletion contract guard"
```

### Task 2: Add the transient deletion and ownership schema

**Files:**
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/system.prisma`
- Modify: `prisma/models/core.prisma`
- Create: `apps/server/src/agent-os/__tests__/agent-session-deletion-schema.static.spec.ts`
- Modify: `docs/ERD.md`
- Modify: `docs/erd/agentos.md`
- Modify: `docs/erd/system.md`
- Modify: `docs/erd/core.md`

This task is additive so every intermediate commit still compiles. Task 7 performs
one unreleased contraction that removes the old models and converts the artifact
shape; no intermediate schema is deployable or receives a production backfill.

- [ ] **Step 1: Add additive schema-shape RED tests**

```typescript
it('adds exact deletion lineage and session-run ownership', () => {
  const schema = readFileSync(
    resolve(process.cwd(), '../../prisma/models/agents.prisma'),
    'utf8',
  );
  expect(schema).toContain('deletionOperationRunId');
  expect(schema).toContain('model AgentSessionDeletionOperationBinding');
  expect(schema).toContain('model AgentSessionOperationRunOwnership');
  expect(schema).toContain('runtimeStartIntentId');
  expect(schema).toContain('runtimeCredentialGeneration');
  expect(schema).toContain('@@unique([operationRunId, organizationId]');
});
```

- [ ] **Step 2: Run the schema test and record RED**

Run: `npm exec --workspace=apps/server vitest -- run src/agent-os/__tests__/agent-session-deletion-schema.static.spec.ts`

Expected: FAIL because the deletion binding, ownership model, and current-run
fields do not exist.

- [ ] **Step 3: Add AgentSession current-deletion state**

Add these nullable fields and relations to the existing `AgentSession`; do not
remove the old Task 1 fields in this additive task:

```prisma
  deletionRequestedAt       DateTime? @map("deletion_requested_at") @db.Timestamptz
  deletionRequestedByUserId String?   @map("deletion_requested_by_user_id") @db.Uuid
  deletionOperationRunId    String?   @map("deletion_operation_run_id") @db.Uuid
  deletionFailureCode       String?   @map("deletion_failure_code")

  deletionRequester User? @relation(
    "AgentSessionDeletionRequestedBy",
    fields: [deletionRequestedByUserId],
    references: [id],
    onDelete: Restrict
  )
  deletionOperationRun OperationRun? @relation(
    "AgentSessionCurrentDeletionRun",
    fields: [deletionOperationRunId, organizationId],
    references: [id, organizationId],
    onDelete: Restrict
  )
  operationRunOwnerships AgentSessionOperationRunOwnership[] @relation("AgentSessionOperationRunOwnerships")

  @@index([deletionOperationRunId, organizationId])
```

Add two narrow durable authority fields to `AgentExecutionAttempt` without
changing its provider-handle generation:

```prisma
  runtimeStartIntentId         String? @map("runtime_start_intent_id") @db.Uuid
  runtimeCredentialGeneration Int     @default(0) @map("runtime_credential_generation")
```

`runtimeStartIntentId` is persisted before a runtime start side effect in Task
8. `runtimeCredentialGeneration` is a KidItem authorization epoch, separate
from the provider's `runtimeGeneration`; deletion increments it to revoke every
previously issued run-scoped credential without corrupting the stored provider
handle.

- [ ] **Step 4: Add immutable binding and ownership models**

```prisma
model AgentSessionDeletionOperationBinding {
  id                        String   @id @default(uuid()) @db.Uuid
  organizationId            String   @map("organization_id") @db.Uuid
  sessionId                 String   @map("session_id") @db.Uuid
  sessionCreatorUserId      String   @map("session_creator_user_id") @db.Uuid
  deletionRequestedByUserId String   @map("deletion_requested_by_user_id") @db.Uuid
  retryGeneration           Int      @default(1) @map("retry_generation")
  operationRunId            String   @map("operation_run_id") @db.Uuid
  predecessorOperationRunId String?  @map("predecessor_operation_run_id") @db.Uuid
  createdAt                 DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization Organization @relation("AgentSessionDeletionBindingOrganization", fields: [organizationId], references: [id], onDelete: Restrict)
  operationRun OperationRun @relation("AgentSessionDeletionBindingRun", fields: [operationRunId, organizationId], references: [id, organizationId], onDelete: Restrict)
  predecessorOperationRun OperationRun? @relation("AgentSessionDeletionBindingPredecessor", fields: [predecessorOperationRunId, organizationId], references: [id, organizationId], onDelete: Restrict)

  @@unique([operationRunId, organizationId], map: "agent_session_deletion_binding_run_org_key")
  @@index([organizationId, sessionId, retryGeneration, createdAt])
  @@index([predecessorOperationRunId, organizationId])
  @@map("agent_session_deletion_operation_bindings")
}

model AgentSessionOperationRunOwnership {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  sessionId      String   @map("session_id") @db.Uuid
  operationRunId String   @map("operation_run_id") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz

  session AgentSession @relation("AgentSessionOperationRunOwnerships", fields: [sessionId, organizationId], references: [id, organizationId], onDelete: Restrict)
  operationRun OperationRun @relation("AgentSessionOperationRunOwnership", fields: [operationRunId, organizationId], references: [id, organizationId], onDelete: Restrict)

  @@unique([operationRunId, organizationId], map: "agent_session_operation_run_ownership_run_org_key")
  @@index([sessionId, organizationId])
  @@map("agent_session_operation_run_ownerships")
}
```

The binding's session/creator/requester IDs deliberately have no Session/User
FKs. Add named reverse relations on `Organization`, `User`, and `OperationRun`;
retain every pre-existing reverse relation until Task 7 contraction.

- [ ] **Step 5: Regenerate and prove the additive schema**

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run db:push
npm run db:erd
npm run check:schema-artifact-sync
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/agent-session-deletion-schema.static.spec.ts
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
```

Expected: PASS against a disposable PostgreSQL 17 database without destructive
schema output. Reverse unrelated Prisma formatter churn before commit. The new
delete path is still unregistered and the old runtime remains the only compiled
path in this intermediate commit.

- [ ] **Step 6: Commit Task 2**

```bash
git add prisma docs/ERD.md docs/erd \
  apps/server/src/agent-os/__tests__/agent-session-deletion-schema.static.spec.ts
git commit -m "feat: add AgentSession deletion ownership schema"
```

### Task 3: Add generic Operations retry, ephemeral success, and post-acceptance hooks

**Files:**
- Modify: `apps/server/src/common/operation-definition.ts`
- Modify: `apps/server/src/operations/adapter/in/http/operations.controller.ts`
- Modify: `apps/server/src/operations/adapter/in/http/__tests__/operations.controller.spec.ts`
- Modify: `apps/server/src/operations/application/port/in/operation-handler-registry.port.ts`
- Modify: `apps/server/src/operations/application/port/in/operation-runner.port.ts`
- Create: `apps/server/src/operations/application/port/in/operation-exact-run-control.port.ts`
- Create: `apps/server/src/operations/application/port/in/operation-post-accepting-hook-registry.port.ts`
- Create: `apps/server/src/operations/application/service/operation-post-accepting-hook-registry.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-handler-registry.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-run.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-dispatcher.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-attempt-executor.service.ts`
- Modify: `apps/server/src/operations/application/service/operation-server-lifecycle.service.ts`
- Modify: `apps/server/src/operations/application/port/out/repository/operation.repository.port.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation-execution.repository.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-run.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-dispatcher.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/operation-server-lifecycle.service.spec.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/__tests__/operation.repository.adapter.spec.ts`
- Create: `apps/server/src/operations/adapter/out/repository/__tests__/operation-retry.pg.integration.spec.ts`

- [ ] **Step 1: Write Operations contract RED tests**

```typescript
it('requeues a retryable result at database time without terminal success', async () => {
  handler.execute.mockResolvedValue({
    kind: 'retryable',
    code: 'STORAGE_DELETE_UNKNOWN',
    message: 'Deletion storage state is unknown',
    retryAfterMs: 60_000,
  });
  await dispatcher.dispatch(run({ attempts: 1, maxAttempts: 5 }), controls);
  expect(repository.requeueActiveAttemptAfter).toHaveBeenCalledWith(expect.objectContaining({
    delayMs: 60_000,
    errorCode: 'STORAGE_DELETE_UNKNOWN',
  }));
  expect(repository.transitionActiveAttempt).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: 'succeeded' }),
  );
});

it('runs post-accepting hooks before starting intake', async () => {
  await lifecycle.onApplicationBootstrap();
  expect(order).toEqual(['cancel-old', 'advance-schedules', 'open', 'recover-finalizers', 'recover-deletions', 'scheduler', 'worker']);
});

it('keeps ephemeral definitions out of the public Operations catalog', () => {
  expect(controller.listDefinitions().items).not.toContainEqual(
    expect.objectContaining({ key: AGENT_SESSION_DELETE_OPERATION_KEY }),
  );
});

it('makes an ephemeral run non-enumerating on every public runner surface', async () => {
  await expect(runner.start(publicDeletionStart())).rejects.toBeInstanceOf(NotFoundException);
  await expect(runner.get(organizationId, deletionRunId)).rejects.toBeInstanceOf(NotFoundException);
  await expect(runner.cancel(publicDeletionCancel())).rejects.toBeInstanceOf(NotFoundException);
  await expect(runner.findReconnectable(publicDeletionReconnect())).resolves.toBeNull();
  await expect(runner.list({ organizationId })).resolves.not.toContainEqual(
    expect.objectContaining({ id: deletionRunId }),
  );
  expect(await repository.findRunById({ organizationId, runId: deletionRunId }))
    .toMatchObject({ status: 'queued' });
});
```

- [ ] **Step 2: Run focused Operations tests and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/operations/adapter/in/http/__tests__/operations.controller.spec.ts \
  src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts \
  src/operations/application/service/__tests__/operation-run.service.spec.ts \
  src/operations/application/service/__tests__/operation-dispatcher.service.spec.ts \
  src/operations/application/service/__tests__/operation-server-lifecycle.service.spec.ts
```

Expected: FAIL because retryable results, ephemeral policy/public quarantine,
repository delay, and post-accepting hooks do not exist.

- [ ] **Step 3: Extend the code-owned Operation contracts**

```typescript
export interface OperationDefinition {
  key: string;
  version: number;
  title: string;
  ownerDomain: string;
  engineType: OperationEngineType;
  allowedTriggers: readonly OperationTriggerSource[];
  scheduleSupported: boolean;
  maxAttempts: number;
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
  inputSchema: z.ZodType<Record<string, unknown>>;
  successPersistence?: 'retained' | 'ephemeral_on_success';
}

export type OperationHandlerResult =
  | { kind: 'completed'; result: Record<string, unknown> }
  | { kind: 'delegated'; nativeRunType: string; nativeRunId: string }
  | { kind: 'waiting_runtime' }
  | { kind: 'waiting_dependency'; child: StartChildOperation }
  | { kind: 'waiting_dependencies'; children: StartChildOperation[] }
  | { kind: 'attention_required'; reason: string; result: Record<string, unknown> }
  | { kind: 'cancelled'; result: Record<string, unknown> }
  | { kind: 'failed'; code: string; message: string }
  | {
      kind: 'retryable';
      code: string;
      message: string;
      retryAfterMs: number;
    };

export interface OperationHandlerContext {
  runId: string;
  organizationId: string;
  operationKey: string;
  triggerSource: OperationTriggerSource;
  input: Record<string, unknown>;
  requestedByUserId: string | null;
  scheduleId: string | null;
  parentRunId: string | null;
  attemptToken: string;
  signal: AbortSignal;
  attempts: number;
  maxAttempts: number;
  checkpoint(update?: {
    stage?: string;
    progressCurrent?: number;
    progressTotal?: number;
  }): Promise<void>;
  enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
}

export interface OperationDispatchControls {
  signal: AbortSignal;
  checkpoint(update?: {
    stage?: string;
    progressCurrent?: number;
    progressTotal?: number;
  }): Promise<void>;
  enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
}

export interface OperationHandler {
  execute(context: OperationHandlerContext): Promise<OperationHandlerResult>;
  cancel?(context: OperationCancelContext): Promise<void>;
  fenceExternalAuthority?(
    context: OperationCancelContext,
  ): Promise<'fenced' | 'unknown'>;
  finalizeEphemeralSuccess?(
    context: OperationHandlerContext,
    result: Record<string, unknown>,
  ): Promise<void>;
  exhaustRetry?(
    context: OperationHandlerContext,
    failure: { code: string; message: string },
  ): Promise<void>;
}
```

Registry normalization sets `successPersistence: 'retained'` when omitted.
Registration rejects an `ephemeral_on_success` definition unless
`scheduleSupported` is `false`, `allowedTriggers` is exactly `['system']`, and
the handler supplies both `finalizeEphemeralSuccess` and `exhaustRetry`. The
dispatcher additionally rejects an ephemeral definition when `parentRunId` or
`scheduleId` is non-null or the persisted trigger is not `system`. Add a scanner
assertion in Task 1 proving only `AGENT_SESSION_DELETE_OPERATION_KEY` uses the
ephemeral literal.

`successPersistence` is also the public Operations visibility boundary. The
generic `OperationRunnerPort` is retained-operation-only: `start()` rejects an
ephemeral definition before idempotency lookup or row creation; `list()` omits
ephemeral rows; and `get()`, `findReconnectable()`, and `cancel()` return the
same non-enumerating absent result they use for an unknown run. The HTTP
controller filters ephemeral definitions from the catalog and delegates only
to that guarded runner. Browser runtime, schedules, CLI/MCP, and any other
generic runner consumer inherit the same prohibition. Internal lifecycle
repository transitions and `OPERATION_EXACT_RUN_CONTROL_PORT` remain allowed to
control an already bound deletion run. The only creation authority for an
ephemeral deletion run is Task 6's scoped session fence/run/binding transaction;
the `system` trigger literal is classification, never authorization.

Add one generic, code-only Operations control seam:

```typescript
export const OPERATION_EXACT_RUN_CONTROL_PORT = Symbol(
  'OPERATION_EXACT_RUN_CONTROL_PORT',
);

export interface OperationExactRunControlPort {
  fenceAndCancel(input: {
    signal: AbortSignal;
    organizationId: string;
    runs: ReadonlyArray<{
      runId: string;
      operationKey: string;
      expectedAttemptToken: string | null;
    }>;
    reason: string;
  }): Promise<ReadonlyArray<{
    runId: string;
    state: 'terminal' | 'fenced' | 'unknown';
    nativeRunType: string | null;
    nativeRunId: string | null;
  }>>;
}
```

`OperationRunService` implements this port. It snapshots only the exact scoped
IDs and terminal-fences every matching queued/waiting/running row with exact
token CAS before external control. It then invokes each definition handler's
bounded cancellation hook. A run with persisted `nativeRunType/nativeRunId`
must also implement `fenceExternalAuthority()` and return `fenced` only after
its browser/process lease exited or was irrevocably revoked; missing proof or a
cancel timeout returns `unknown`. Missing, token-drifted, or newly linked runs
fail closed. Export the token from controller-free `OperationsModule`; it is
never exposed as a public HTTP command.

- [ ] **Step 4: Add database-time delayed retry**

Add this repository contract:

```typescript
requeueActiveAttemptAfter(input: {
  organizationId: string;
  runId: string;
  expectedAttemptToken: string;
  delayMs: number;
  errorCode: string;
  errorMessage: string;
}): Promise<OperationRunRecord | null>;
```

Implement it with one tagged SQL update using PostgreSQL time:

```typescript
scheduled_for = clock_timestamp() + (${input.delayMs}::bigint * interval '1 millisecond'),
status = 'queued',
claimed_by = NULL,
attempt_token = NULL,
claimed_at = NULL,
lease_expires_at = NULL
```

Require `status = 'running'` and the exact attempt token. Do not pass a process `Date` into this method.

Change the claim SQL in `operation-execution.repository.ts` at the same time:

```sql
AND (scheduled_for IS NULL OR scheduled_for <= clock_timestamp())
```

Remove the process `Date` argument from scheduled eligibility and derive claim,
lease, and deadline timestamps from the same transaction's PostgreSQL clock.
Add a PG regression that advances the process clock far into the future while
the database clock remains before `scheduled_for`; the run must stay
unclaimable until the database due instant.

- [ ] **Step 5: Implement dispatcher exhaustion and ephemeral finalization**

```typescript
case 'retryable': {
  if (run.attempts >= run.maxAttempts) {
    if (!handler.exhaustRetry) throw new Error('operation_retry_exhaustion_handler_missing');
    await handler.exhaustRetry(context, { code: result.code, message: result.message });
    return;
  }
  await this.repository.requeueActiveAttemptAfter({
    organizationId: run.organizationId,
    runId: run.id,
    expectedAttemptToken: attemptToken,
    delayMs: result.retryAfterMs,
    errorCode: result.code,
    errorMessage: result.message,
  });
  return;
}

case 'completed': {
  if (definition.successPersistence === 'ephemeral_on_success') {
    if (!handler.finalizeEphemeralSuccess) {
      throw new Error('operation_ephemeral_finalizer_missing');
    }
    const finalization = await controls.enterEphemeralFinalization();
    while (!finalization.signal.aborted) {
      try {
        await handler.finalizeEphemeralSuccess(context, result.result);
        return;
      } catch {
        await controls.checkpoint({ stage: 'ephemeral_finalizing' });
        await abortableDelay(250, finalization.signal);
      }
    }
    return;
  }
  await this.repository.transitionActiveAttempt({
    organizationId: run.organizationId,
    runId: run.id,
    expectedStatuses: ['running'],
    expectedAttemptToken: attemptToken,
    status: 'succeeded',
    result: result.result,
    progress: 1,
    finishedAt: new Date(),
    claimedBy: null,
    attemptToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
  });
  return;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
```

Read the normalized definition before execution, pass persisted `attempts/maxAttempts` into context, and never write a durable `succeeded` state for ephemeral operations.

`OperationAttemptExecutorService.enterEphemeralFinalization()` is idempotent and
available through both the handler context and dispatcher controls only for a
trusted `ephemeral_on_success` definition. On its first call it clears the
ordinary execution-deadline timer but keeps the exact attempt lease heartbeat,
fence-loss abort, and server-lifecycle shutdown signal; later calls return the
same lifecycle-scoped signal. The deletion handler must enter this phase before
its irreversible graph transaction, and the dispatcher reuses it before purge.
Thus graph commit/finalization is not cut off by the 15-minute business
execution deadline, but it still stops promptly on lifecycle cancellation. Add
a test that advances past the execution deadline during graph commit and
repeated purge failure and proves same-lifecycle finalization continues until
success. Calling the method from any retained operation is a hard error.

- [ ] **Step 6: Add the post-accepting hook registry**

```typescript
export interface OperationPostAcceptingHook {
  key: string;
  priority: number;
  run(signal: AbortSignal): Promise<void>;
}

export interface OperationPostAcceptingHookRegistryPort {
  register(hook: OperationPostAcceptingHook): void;
}
```

The registry rejects duplicate keys and executes a frozen snapshot sorted by
`priority`, then `key`. At the beginning of
`OperationServerLifecycleService.onApplicationBootstrap()`, create one signal
using the existing 30-second `startupTimeoutMs` and the lifecycle signal. Pass
that same deadline through the cancellation/schedule sweep, `gate.open()`, and
every post-accepting hook; the hook registry must not start a fresh timeout.
Only after the hooks finish may scheduler and worker intake start. A failed or
timed-out sweep/hook fails API bootstrap; it is not skipped. Add a fake-clock
test where the sweep consumes 20 seconds and hooks receive at most the remaining
10 seconds, proving total startup never expands to 60 seconds.

- [ ] **Step 7: Verify unit and real-PostgreSQL GREEN**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts \
  src/operations/application/service/__tests__/operation-run.service.spec.ts \
  src/operations/application/service/__tests__/operation-dispatcher.service.spec.ts \
  src/operations/application/service/__tests__/operation-attempt-executor.service.spec.ts \
  src/operations/application/service/__tests__/operation-server-lifecycle.service.spec.ts \
  src/operations/adapter/out/repository/__tests__/operation.repository.adapter.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/operations/adapter/out/repository/__tests__/operation-retry.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run build --workspace=apps/server
```

Expected: unit tests PASS; no public Operations endpoint/runner can enumerate,
create, reconnect, or cancel an ephemeral run; PostgreSQL proves exact-token CAS
and no claim before the database-time due instant.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/server/src/common apps/server/src/operations
git commit -m "feat: add ephemeral Operation completion policy"
```

### Milestone review 1

Run a read-only Sol review over Tasks 1–3. Accept only concrete P1/P2 findings about public contracts, schema integrity, generic Operations regressions, or process lifecycle. Fix those findings before Task 4; this is review loop 1 of at most 5.

### Task 4: Make every session-originated OperationRun atomically owned

**Files:**
- Create: `apps/server/src/agent-os/application/port/in/session-control/agent-session-owned-operation.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/operation/agent-session-operation-platform.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/session-control/agent-session-owned-operation.transaction.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/operation/operation-definition-snapshot.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-owned-operation.transaction.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/agent-session-owned-operation.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/__tests__/agent-session-owned-operation.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/session-control/agent-session-task-dispatch.service.ts`
- Modify: `apps/server/src/agent-os/application/service/session-control/__tests__/agent-session-task-dispatch.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/session-control/agent-session-operation-continuation.service.ts`
- Modify: `apps/server/src/agent-os/application/service/session-control/__tests__/agent-session-operation-continuation.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/internal/continue-operation-attempt.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts`
- Modify: `apps/server/src/agent-os/application/port/out/transaction/session-control/agent-attempt-operation.transaction.port.ts`
- Modify: `apps/server/src/operations/application/service/composite-operation-coordinator.service.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts`
- Modify: `apps/server/src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts`
- Modify: `apps/server/src/operations/adapter/out/repository/__tests__/operation-composite.repository.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/agent-os-api-execution.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts`

- [ ] **Step 1: Write atomic-ownership RED tests**

```typescript
it('creates the run, ownership, attempt, and attempt binding in one transaction', async () => {
  const result = await ownedOperations.startExecution({
    organizationId: TEST_ORGANIZATION_ID,
    sessionId,
    taskId,
    executionId,
    operationKey: AGENT_SESSION_TASK_OPERATION_KEY,
    requestedByUserId: TEST_USER_ID,
    idempotencyKey: `session-execution:${executionId}`,
  });

  await expect(prisma.agentSessionOperationRunOwnership.findUnique({
    where: { operationRunId_organizationId: {
      operationRunId: result.operationRunId,
      organizationId: TEST_ORGANIZATION_ID,
    } },
  })).resolves.toMatchObject({ sessionId });
  await expect(prisma.agentExecutionAttemptOperationBinding.count({
    where: { operationRunId: result.operationRunId },
  })).resolves.toBe(1);
});

it('rolls back every row when ownership insertion fails', async () => {
  await expect(startWithForeignSession()).rejects.toMatchObject({
    code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID',
  });
  await expect(prisma.operationRun.count({ where: { idempotencyKey } })).resolves.toBe(0);
});

it('composes Operations-dependent session dispatch only in the API root', async () => {
  const allowedConsumer = await compile(OwnedOperationPortConsumerModule);
  const owned = allowedConsumer.get(OwnedOperationPortConsumer).owned;
  expect(owned.startExecution).toBeTypeOf('function');
  expect(owned.startCapability).toBeTypeOf('function');
  await expect(compile(PlatformPortConsumerModule)).rejects.toThrow(
    /AGENT_SESSION_OPERATION_PLATFORM_PORT/,
  );
  await expectNotReachable(AgentWorkerApplicationModule, AgentSessionOwnedOperationService);
  await expectNotReachable(AgentMcpApplicationModule, OperationDefinitionSnapshotAdapter);
});
```

The wiring spec defines two small Nest probe modules. Both import
`AgentOsApiExecutionModule`; `OwnedOperationPortConsumerModule` injects the
exported `AGENT_SESSION_OWNED_OPERATION_PORT`, while
`PlatformPortConsumerModule` injects the private
`AGENT_SESSION_OPERATION_PLATFORM_PORT`. The first must compile and exercise
both input methods; the second must fail with Nest's unknown-dependency error.
Do not use non-strict `TestingModule.get()` on the root graph as an export
privacy oracle.

- [ ] **Step 2: Run focused and PostgreSQL tests and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-control/__tests__/agent-session-owned-operation.service.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: FAIL because the platform snapshot and atomic owned-run transaction do not exist; the current dispatch creates an OperationRun before reserving the attempt.

- [ ] **Step 3: Define a narrow Operations platform snapshot port**

```typescript
export const AGENT_SESSION_OPERATION_PLATFORM_PORT = Symbol(
  'AGENT_SESSION_OPERATION_PLATFORM_PORT',
);

export interface AgentSessionOperationDefinitionSnapshot {
  key: string;
  version: number;
  title: string;
  ownerDomain: string;
  engineType: OperationEngineType;
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
  maxAttempts: number;
  successPersistence: 'retained' | 'ephemeral_on_success';
}

export interface AgentSessionOperationPlatformPort {
  resolveAccepting(input: {
    operationKey: string;
    triggerSource: OperationTriggerSource;
    input: Record<string, unknown>;
  }): { definition: AgentSessionOperationDefinitionSnapshot; parsedInput: Record<string, unknown>; signal: AbortSignal };
}
```

`OperationDefinitionSnapshotAdapter` injects the Operations registry and lifecycle gate, calls `assertAccepting()`, verifies the trigger and schedule policy, parses the input, and returns a copied immutable snapshot plus the current lifecycle signal. AgentOS application services do not import `OperationRunService` or a concrete Operations repository.

Keep the Prisma ownership transaction in controller-free
`AgentOsSessionModule`, which binds and exports only its narrow transaction
token. Create controller-free `AgentOsApiExecutionModule` importing
`AgentOsSessionModule` and `OperationsModule`; it owns
`OperationDefinitionSnapshotAdapter`, `AgentSessionOwnedOperationService`, and
their `AGENT_SESSION_OPERATION_PLATFORM_PORT` /
`AGENT_SESSION_OWNED_OPERATION_PORT` bindings. It exports only
`AGENT_SESSION_OWNED_OPERATION_PORT`; the platform adapter/token and concrete
service remain private. `AgentOsHttpModule` imports that API-only module for its
existing dispatch/control providers. Neither
`AgentWorkerApplicationModule` nor `AgentMcpApplicationModule` imports it, so
they cannot resolve the Operations-dependent adapter/service. Task 7 extends
this same API composition module with storage/materialization; it does not
create a second composition root.

- [ ] **Step 4: Define and implement the owned-run transaction**

```typescript
export interface AgentSessionOwnedOperationTransactionPort {
  createExecutionRun(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
  }): Promise<{ operationRunId: string; attemptId: string }>;

  createCapabilityRun(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
  }): Promise<{ operationRunId: string }>;
}
```

In one Prisma transaction, take the session lifecycle advisory lock, lock the scoped session row, require a writable lifecycle, resolve idempotency, create the OperationRun from the snapshot, insert `AgentSessionOperationRunOwnership`, and for execution runs create the queued attempt plus `AgentExecutionAttemptOperationBinding`. Return an exact replay only when every immutable field and owner matches.

- [ ] **Step 5: Migrate initial dispatch and continuation**

Replace the two-step `operations.start()` plus `reserveAttemptForOperation()` in
`AgentSessionTaskDispatchService` by injecting
`AGENT_SESSION_OWNED_OPERATION_PORT` and calling `startExecution()`. The dispatch
service never injects the concrete `AgentSessionOwnedOperationService` across
the module boundary.

Inside `continueOperationAttemptInTransaction`, insert the successor `AgentSessionOperationRunOwnership` immediately after creating the successor run:

```typescript
await tx.agentSessionOperationRunOwnership.create({
  data: {
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    operationRunId: operationRun.id,
  },
});
```

Keep the predecessor immutable. Delete `reserveAttemptForOperation` only after all callers use the new transaction; retain attempt activation, handle persistence, terminalization, and continuation methods.

When generic Operations creates a composite child, its transaction first reads
the exact parent ownership edge. An unowned parent keeps the ordinary generic
path. A session-owned parent must take the same organization/session lifecycle
advisory lock and row lock, require writable state, create the child, and insert
the identical session ownership edge in that transaction. A conflicting or
cross-session parent fails closed. Add a real-PG parent/delete barrier proving a
child either commits before the deletion fence with ownership or is rejected
after it; an unowned child can never appear.

- [ ] **Step 6: Expose the only deterministic session Operation dispatch path**

Define the one exported API input port explicitly:

```typescript
export const AGENT_SESSION_OWNED_OPERATION_PORT = Symbol(
  'AGENT_SESSION_OWNED_OPERATION_PORT',
);

export interface AgentSessionOwnedOperationPort {
  startExecution(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    operationKey: string;
    requestedByUserId: string | null;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; attemptId: string }>;

  startCapability(input: {
    organizationId: string;
    sessionId: string;
    operationKey: string;
    requestedByUserId: string | null;
    input: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string }>;
}
```

`AgentSessionOwnedOperationService` implements both methods through the private
platform snapshot port and the two focused transaction methods. Any future
capability that starts an Operation receives this same input port through an
owner-local cross-domain adapter; it must not inject `OPERATION_RUNNER_PORT`.
Keep the current read-only capabilities unchanged.

The session deletion scanner must reject `OPERATION_RUNNER_PORT` imports under AgentOS application/capability code and reject direct `tx.operationRun.create` outside the owned-run/deletion/continuation transaction owners.

- [ ] **Step 7: Verify Task 4 GREEN**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-control/__tests__/agent-session-owned-operation.service.spec.ts \
  src/agent-os/application/service/session-control/__tests__/agent-session-task-dispatch.service.spec.ts \
  src/agent-os/application/service/session-control/__tests__/agent-session-operation-continuation.service.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts \
  src/operations/application/service/__tests__/composite-operation-coordinator.service.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  src/operations/adapter/out/repository/__tests__/operation-composite.repository.pg.integration.spec.ts \
  --config vitest.config.integration.ts
! npm run check:agent-session-deletion
npm run build --workspace=apps/server
```

Expected: all tests/builds PASS; equal idempotency replays one owned run,
foreign/cross-owner insertion rolls back, and no unowned session-originated run
remains. The negated live scanner still reports only the not-yet-contracted old
lifecycle/artifact paths.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/server/src/agent-os apps/server/src/operations
git commit -m "refactor: atomically own AgentSession operations"
```

### Task 5: Enforce one lifecycle lock and write fence on every session mutation

**Files:**
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-control/internal/lock-writable-agent-session.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-control/internal/__tests__/lock-writable-agent-session.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/repository/interaction/prisma-agent-session-query.repository.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts`

- [ ] **Step 1: Add universal-fence RED cases**

Add a table-driven real-PG test that places the same scoped session in `deleting` and invokes each mutation family:

```typescript
it.each([
  ['event', () => events.appendEvent(eventInput())],
  ['authorization', () => authorization.authorize(runInput())],
  ['usage', () => usage.recordExecutionUsage(usageInput())],
  ['delegation', () => delegation.createDelegatedTask(delegationInput())],
  ['approval', () => approvals.requestApproval(approvalInput())],
  ['attempt', () => attempts.startAttempt(attemptInput())],
  ['artifact', () => transitions.prepareArtifact(artifactInput())],
  ['retry', () => transitions.createRetryExecution(retryInput())],
])('rejects %s after the deletion fence', async (_kind, mutate) => {
  await markDeleting();
  await expect(mutate()).rejects.toMatchObject({
    code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT',
  });
});
```

Add a two-connection barrier test: one connection pauses after the common session lock, while the other begins deletion. Assert a bounded completion with exactly one legal ordering and no PostgreSQL deadlock.

- [ ] **Step 2: Run the PG suites and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: FAIL because several mutation paths do not yet share the same lock/helper or accept the new lifecycle values.

- [ ] **Step 3: Implement the canonical lock helper**

```typescript
export async function lockWritableAgentSession(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sessionId: string },
): Promise<{
  id: string;
  createdByUserId: string;
  lifecycle: string;
  deletionOperationRunId: string | null;
  deletionFailureCode: AgentSessionDeletionFailureCode | null;
}> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(
      ${`agent-session-lifecycle:${input.organizationId}:${input.sessionId}`}, 0
    ))`,
  );
  const rows = await tx.$queryRaw<Array<{
    id: string;
    created_by_user_id: string;
    lifecycle: string;
    deletion_operation_run_id: string | null;
    deletion_failure_code: AgentSessionDeletionFailureCode | null;
  }>>(Prisma.sql`
    SELECT id, created_by_user_id, lifecycle,
           deletion_operation_run_id, deletion_failure_code
    FROM agent_sessions
    WHERE id = ${input.sessionId}::uuid
      AND organization_id = ${input.organizationId}::uuid
    FOR UPDATE
  `);
  const session = rows[0];
  if (!session) throw sessionScopeError();
  if (session.lifecycle === 'deleting' || session.lifecycle === 'delete_failed') {
    throw sessionStateError();
  }
  return {
    id: session.id,
    createdByUserId: session.created_by_user_id,
    lifecycle: session.lifecycle,
    deletionOperationRunId: session.deletion_operation_run_id,
    deletionFailureCode: session.deletion_failure_code,
  };
}
```

Also export `lockAgentSessionForDeletion()` from the same file with return type
`Promise<LockedAgentSession | null>`. It takes the identical advisory/row locks,
allows the deletion application to inspect non-writable states, and returns
`null`—rather than throwing—for an absent or cross-organization row. Typed
scope errors remain correct for ordinary mutation callers through
`lockWritableAgentSession()`. No storage/runtime/network call is allowed while
either lock is held.

- [ ] **Step 4: Route every mutation through the helper**

Each listed transaction adapter, including execution usage, must call
`lockWritableAgentSession()` before its first child read or mutation. Preserve
its existing capability-specific advisory lock only after the session row lock.
Remove private copies of session lifecycle locking.

Change `PrismaAgentSessionQueryRepository.listSessions()` and bootstrap/history queries to filter:

```typescript
lifecycle: { notIn: ['deleting', 'delete_failed'] }
```

Direct deletion status uses the new deletion query port from Task 6 and does not reuse the ordinary session list.

- [ ] **Step 5: Verify lock order and query hiding GREEN**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/internal/__tests__/lock-writable-agent-session.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run check:idor
npm run check:tenant-scope
! npm run check:agent-session-deletion
npm run build --workspace=apps/server
```

Expected: tests, scope scanners, and build PASS; append-before-delete is
included, delete-before-append rejects, and both complete within the test
deadline without deadlock. The negated deletion scanner retains only the old
lifecycle/artifact contraction findings.

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/server/src/agent-os
git commit -m "fix: fence every AgentSession mutation"
```

### Task 6: Implement begin, status, and administrator retry APIs

**Files:**
- Create: `apps/server/src/agent-os/application/port/in/session-control/agent-session-deletion.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/session-deletion/agent-session-deletion-command.transaction.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/repository/session-deletion/agent-session-deletion-query.port.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/agent-session-deletion.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/__tests__/agent-session-deletion.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-deletion/prisma-agent-session-deletion-command.transaction.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/session-deletion/prisma-agent-session-deletion-query.repository.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/session-control/agent-session-deletion.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/session-control/__tests__/agent-session-deletion.controller.spec.ts`
- Create: `apps/server/src/agent-os/domain/operation/agent-session-deletion.operations.ts`
- Create: `apps/server/src/agent-os/domain/operation/__tests__/agent-session-deletion.operations.spec.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts`

- [ ] **Step 1: Write the exact response-matrix RED tests**

```typescript
it.each([
  ['creator', 'active', 'delete', 202, 'deleting'],
  ['admin', 'active', 'delete', 202, 'deleting'],
  ['creator', 'deleting', 'delete', 202, 'deleting'],
  ['creator', 'delete_failed', 'delete', 202, 'delete_failed'],
  ['creator', 'finalizing', 'delete', 202, 'finalizing'],
  ['creator', 'finalizing', 'status', 200, 'finalizing'],
  ['creator', 'absent', 'status', 204, undefined],
  ['ordinary', 'active', 'delete', 204, undefined],
  ['creator', 'delete_failed', 'retry', 403, 'DELETION_RETRY_ADMIN_REQUIRED'],
  ['admin', 'delete_failed', 'retry', 202, 'deleting'],
  ['admin', 'deleting', 'retry', 409, 'DELETION_RETRY_STATE_INVALID'],
  ['creator', 'active', 'retry', 409, 'DELETION_RETRY_STATE_INVALID'],
  ['foreign', 'active', 'status', 204, undefined],
] as const)('%s %s %s', async (actor, lifecycle, action, status, body) => {
  const response = await invokeController({ actor, lifecycle, action });
  expect(response.statusCode).toBe(status);
  expect(response.body?.state ?? response.body?.code).toBe(body);
});

it('replays finalizing after the graph is gone but before lineage purge', async () => {
  await commitGraphDeletedWithoutPurging();
  await expect(service.request(creatorScope())).resolves.toEqual({
    state: 'finalizing',
    failureCode: null,
  });
  await expect(service.request(foreignScope())).resolves.toBeNull();
});

it('creates deletion only through the scoped canonical DELETE transaction', async () => {
  await expect(publicOperations.start(publicDeletionStart()))
    .rejects.toBeInstanceOf(NotFoundException);
  await expect(service.request(creatorScope())).resolves.toMatchObject({
    state: 'deleting',
  });
  await expect(deletionRuns()).resolves.toHaveLength(1);
  await expect(deletionBindings()).resolves.toEqual([
    expect.objectContaining({ sessionId, operationRunId: deletionRunId }),
  ]);
});
```

- [ ] **Step 2: Run service/controller tests and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-control/__tests__/agent-session-deletion.service.spec.ts \
  src/agent-os/adapter/in/http/session-control/__tests__/agent-session-deletion.controller.spec.ts \
  src/agent-os/domain/operation/__tests__/agent-session-deletion.operations.spec.ts \
  src/__tests__/application-roots.architecture.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: FAIL because the port, service, controller, definition, and atomic
deletion run/binding transaction do not exist. The PostgreSQL RED proves a
public start creates zero rows while canonical DELETE must create exactly one
bound run.

- [ ] **Step 3: Define the HTTP-facing input port and operation**

```typescript
export const AGENT_SESSION_DELETION_PORT = Symbol('AGENT_SESSION_DELETION_PORT');

export interface ScopedDeletionActor {
  organizationId: string;
  actorUserId: string;
  session: AgentSessionName;
}

export interface AgentSessionDeletionPort {
  request(input: ScopedDeletionActor): Promise<AgentSessionDeletionStatus | null>;
  status(input: ScopedDeletionActor): Promise<AgentSessionDeletionStatus | null>;
  retry(input: ScopedDeletionActor): Promise<AgentSessionDeletionStatus | null>;
}

export const AgentSessionDeleteOperationInputSchema = z.object({
  session: AgentSessionNameSchema,
  retryGeneration: z.number().int().positive(),
}).strict();

export const AGENT_SESSION_DELETE_OPERATION: OperationDefinition = {
  key: AGENT_SESSION_DELETE_OPERATION_KEY,
  version: 1,
  title: 'Delete AgentOS session',
  ownerDomain: 'agent-os',
  engineType: 'agent_os',
  allowedTriggers: ['system'],
  scheduleSupported: false,
  maxAttempts: AGENT_SESSION_DELETE_MAX_ATTEMPTS,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  successPersistence: 'ephemeral_on_success',
  inputSchema: AgentSessionDeleteOperationInputSchema,
};
```

- [ ] **Step 4: Implement begin/replay in one transaction**

The command port is:

```typescript
export interface AgentSessionDeletionCommandTransactionPort {
  begin(input: ScopedDeletionActor & {
    signal: AbortSignal;
    definition: AgentSessionOperationDefinitionSnapshot;
    parsedInput: Record<string, unknown>;
  }): Promise<AgentSessionDeletionStatus | null>;
  retry(input: ScopedDeletionActor & {
    signal: AbortSignal;
    definition: AgentSessionOperationDefinitionSnapshot;
  }): Promise<AgentSessionDeletionStatus | null>;
}
```

`begin()` performs exactly this transaction:

```typescript
const { session: sessionId } = parseAgentSessionName(
  scope.session,
  formatOrganizationName(OrganizationIdSchema.parse(scope.organizationId)),
);
const session = await lockAgentSessionForDeletion(tx, {
  organizationId: scope.organizationId,
  sessionId,
});
if (!session) return null;
const membership = await tx.organizationMembership.findFirst({
  where: {
    organizationId: scope.organizationId,
    userId: scope.actorUserId,
    status: 'active',
  },
  select: { role: true },
});
const isAdministrator = membership?.role === 'owner' || membership?.role === 'admin';
if (!membership || (session.createdByUserId !== scope.actorUserId && !isAdministrator)) {
  return null;
}
if (session.lifecycle === 'deleting' || session.lifecycle === 'delete_failed') {
  return {
    state: session.lifecycle,
    failureCode: session.deletionFailureCode,
  };
}
const run = await tx.operationRun.create({
  data: {
    organizationId: scope.organizationId,
    operationKey: definition.key,
    definitionVersion: definition.version,
    ownerDomain: definition.ownerDomain,
    title: definition.title,
    engineType: definition.engineType,
    resourceClass: definition.resourceClass,
    executionTimeoutMs: definition.executionTimeoutMs,
    triggerSource: 'system',
    requestedByUserId: scope.actorUserId,
    input: parsedInput as Prisma.InputJsonValue,
    maxAttempts: definition.maxAttempts,
    idempotencyKey: `agent-session-delete:${session.id}:generation:1`,
  },
});
await tx.agentSessionDeletionOperationBinding.create({
  data: {
    organizationId: scope.organizationId,
    sessionId: session.id,
    sessionCreatorUserId: session.createdByUserId,
    deletionRequestedByUserId: scope.actorUserId,
    retryGeneration: 1,
    operationRunId: run.id,
    predecessorOperationRunId: null,
  },
});
await tx.agentSession.update({
  where: { id: session.id },
  data: {
    lifecycle: 'deleting',
    deletionRequestedAt: new Date(),
    deletionRequestedByUserId: scope.actorUserId,
    deletionOperationRunId: run.id,
    deletionFailureCode: null,
  },
});
await tx.agentExecutionAttempt.updateMany({
  where: {
    organizationId: scope.organizationId,
    sessionId: session.id,
  },
  data: { runtimeCredentialGeneration: { increment: 1 } },
});
return { state: 'deleting', failureCode: null };
```

Run creation, binding, lifecycle fence, durable credential-generation
invalidation for every attempt, and
commit are atomic. Equal concurrent DELETE calls replay the same run. Add
the public-runner rejection versus canonical-DELETE creation case to the real
PostgreSQL suite so an unbound ephemeral row can never appear. Add
real-PostgreSQL unknown-ID and cross-organization cases proving `begin()` and
`retry()` return `null` and the HTTP adapter emits the identical empty `204`;
neither may leak the typed mutation scope error.

- [ ] **Step 5: Implement status and explicit admin retry**

The query repository first reads a scoped AgentSession. If absent, it may return `finalizing` only from an exact binding whose current run has a `graph_deleted` checkpoint. It rechecks active membership and creator/admin authorization using the binding's scalar creator/requester coordinates. It never chooses a row from the URL coordinate without organization scope.

`AgentSessionDeletionService.request()` first calls the atomic `begin()`. When
that returns `null`, it must call this same scoped query and return only an
authorized exact `finalizing` result; every other absent, foreign, or
unauthorized outcome remains `null`. This is how repeated DELETE preserves
`202 finalizing` after graph contraction without turning a path coordinate into
authority.

`retry()` requires a scoped `delete_failed` session and an active administrator membership. Under the same lifecycle lock it sums `OperationRun.attempts` only for the current generation, increments the generation, creates one successor with `maxAttempts: 5`, inserts a binding with the exact predecessor, points `deletionOperationRunId` at the successor, clears the safe failure, and returns `deleting`. Creator-but-not-admin returns `DELETION_RETRY_ADMIN_REQUIRED`; authenticated authorized users in any non-failed state receive `DELETION_RETRY_STATE_INVALID`; foreign/unknown remains absent.

- [ ] **Step 6: Implement the thin HTTP controller**

```typescript
@Controller('agent-os/sessions')
export class AgentSessionDeletionController {
  constructor(
    @Inject(AGENT_SESSION_DELETION_PORT)
    private readonly deletion: AgentSessionDeletionPort,
  ) {}

  @Delete(':sessionId')
  async requestDelete(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(organizationId),
      AgentSessionIdSchema.parse(sessionId),
    );
    const result = await this.deletion.request({
      organizationId,
      actorUserId: user.id,
      session,
    });
    response.status(result ? 202 : 204);
    return result ?? undefined;
  }

  @Get(':sessionId/deletion')
  async status(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(organizationId),
      AgentSessionIdSchema.parse(sessionId),
    );
    const result = await this.deletion.status({
      organizationId,
      actorUserId: user.id,
      session,
    });
    response.status(result ? 200 : 204);
    return result ?? undefined;
  }

  @Post(':sessionId/deletion/retry')
  async retry(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = formatAgentSessionName(
      OrganizationIdSchema.parse(organizationId),
      AgentSessionIdSchema.parse(sessionId),
    );
    const result = await this.deletion.retry({
      organizationId,
      actorUserId: user.id,
      session,
    });
    response.status(result ? 202 : 204);
    return result ?? undefined;
  }
}
```

The URL keeps the existing UUID path-segment convention, but the controller
immediately validates it and passes only the canonical `AgentSessionName`
through the application port. It accepts no organization, role, failure code,
or idempotency key from body/query and imports no concrete service.

Do not add the controller, deletion port, command/query adapters, operation
definition, or handler to any live Nest module in this task. Construct them only
in focused unit/PG fixtures. The old Task 1 endpoint remains the only composed
lifecycle surface until Task 7 removes it, and the new DELETE route must remain
unreachable until Task 10 composes the complete executor and recovery path.

- [ ] **Step 7: Verify API and atomic PG behavior GREEN**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-control/__tests__/agent-session-deletion.service.spec.ts \
  src/agent-os/adapter/in/http/session-control/__tests__/agent-session-deletion.controller.spec.ts \
  src/agent-os/domain/operation/__tests__/agent-session-deletion.operations.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run check:idor
npm run check:tenant-scope
! npm run check:agent-session-deletion
npm run build --workspace=apps/server
```

Expected: focused tests/build PASS; two concurrent requests create one runnable
run, a forced binding error rolls back the fence, and the complete response
matrix is exact. The negated live scanner still observes the intentional
pre-contraction Task 1 surface. A module-graph assertion proves the new
controller/operation are not reachable from API, worker, or MCP roots yet.

- [ ] **Step 8: Commit Task 6**

```bash
git add apps/server/src/agent-os
git commit -m "feat: expose AgentSession deletion control"
```

### Milestone review 2

Run a read-only Sol review over Tasks 4–6. Require evidence for one-transaction
Operation ownership, identical lifecycle lock order, creator/admin
non-enumeration, an input-port-only HTTP adapter, and non-reachability of the
incomplete deletion path from every live process root. Fix only concrete P1/P2
findings before Task 7; this is review loop 2 of at most 5.

### Task 7: Contract Task 1 and replace raw artifacts with a fenced KidItem writer

**Files:**
- Modify: `apps/server/src/agent-os/application/port/out/runtime/agent-durable-runtime.port.ts`
- Create: `apps/server/src/agent-os/application/port/in/session-execution/agent-session-artifact-writer.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/session-control/agent-session-artifact-materialization.transaction.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/storage/agent-session-artifact-storage.port.ts`
- Create: `apps/server/src/agent-os/domain/session/agent-session-artifact-key.ts`
- Create: `apps/server/src/agent-os/domain/session/__tests__/agent-session-artifact-key.spec.ts`
- Create: `apps/server/src/agent-os/application/service/session-execution/agent-session-artifact-writer.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-execution/__tests__/agent-session-artifact-writer.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-artifact-materialization.transaction.ts`
- Create: `apps/server/src/agent-os/adapter/out/storage/storage-agent-session-artifact.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/storage/__tests__/storage-agent-session-artifact.adapter.spec.ts`
- Modify: `apps/server/src/common/storage/storage.service.ts`
- Modify: `apps/server/src/agent-os/application/service/session-execution/agent-session-task-execution.service.ts`
- Modify: `apps/server/src/agent-os/application/service/session-execution/__tests__/agent-session-task-execution.behavior.spec.ts`
- Modify: `apps/server/src/agent-os/application/port/out/transaction/session-control/agent-session-transition.transaction.port.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/hermes-http-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-api-execution.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Delete: `packages/shared/src/agent-interaction/lifecycle.ts`
- Delete: `packages/shared/src/agent-interaction/lifecycle.spec.ts`
- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/system.prisma`
- Modify: `apps/server/src/agent-os/__tests__/agent-session-deletion-schema.static.spec.ts`
- Modify: `docs/ERD.md`
- Modify: `docs/erd/agentos.md`
- Modify: `docs/erd/core.md`
- Modify: `docs/erd/system.md`
- Modify: `package.json`
- Modify: `scripts/README.md`
- Modify: `scripts/check-script-inventory.mjs`
- Delete: `scripts/check-agent-interaction-lifecycle.mjs`
- Delete: `scripts/__tests__/check-agent-interaction-lifecycle.test.mjs`
- Delete: `apps/server/src/agent-os/adapter/in/http/interaction/agent-interaction-session-lifecycle.controller.ts`
- Delete: `apps/server/src/agent-os/adapter/in/http/interaction/__tests__/agent-interaction-session-lifecycle.controller.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/in/http/interaction/agent-session-lifecycle-maintenance.processor.ts`
- Delete: `apps/server/src/agent-os/adapter/in/http/interaction/__tests__/agent-session-lifecycle-maintenance.processor.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/in/http/interaction/interaction-lifecycle.config.ts`
- Delete: `apps/server/src/agent-os/application/port/in/interaction/agent-interaction-session-lifecycle.port.ts`
- Delete: `apps/server/src/agent-os/application/port/in/interaction/agent-session-lifecycle-maintenance.port.ts`
- Delete: `apps/server/src/agent-os/application/port/out/transaction/interaction/agent-session-lifecycle.transaction.port.ts`
- Delete: `apps/server/src/agent-os/application/port/out/transaction/interaction/agent-session-lifecycle-maintenance.transaction.port.ts`
- Delete: `apps/server/src/agent-os/application/port/out/crypto/agent-session-tombstone-hasher.port.ts`
- Delete: `apps/server/src/agent-os/application/port/out/storage/agent-session-artifact-eraser.port.ts`
- Delete: `apps/server/src/agent-os/application/service/interaction/agent-interaction-session-lifecycle.service.ts`
- Delete: `apps/server/src/agent-os/application/service/interaction/__tests__/agent-interaction-session-lifecycle.service.spec.ts`
- Delete: `apps/server/src/agent-os/application/service/interaction/agent-session-lifecycle-maintenance.service.ts`
- Delete: `apps/server/src/agent-os/application/service/interaction/__tests__/agent-session-lifecycle-maintenance.service.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-session-lifecycle.transaction.ts`
- Delete: `apps/server/src/agent-os/adapter/out/transaction/interaction/prisma-agent-session-lifecycle-maintenance.transaction.ts`
- Delete: `apps/server/src/agent-os/adapter/out/crypto/hmac-agent-session-tombstone-hasher.adapter.ts`
- Delete: `apps/server/src/agent-os/adapter/out/crypto/__tests__/hmac-agent-session-tombstone-hasher.adapter.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/storage/storage-agent-session-artifact-eraser.adapter.ts`
- Delete: `apps/server/src/agent-os/adapter/out/storage/__tests__/storage-agent-session-artifact-eraser.adapter.spec.ts`
- Delete: `apps/server/src/agent-os/domain/session/agent-session-retention.policy.ts`
- Delete: `apps/server/src/agent-os/domain/session/__tests__/agent-session-retention.policy.spec.ts`
- Delete: `apps/server/src/agent-os/domain/session/agent-session-retention-audit.policy.ts`
- Delete: `apps/server/src/agent-os/domain/session/__tests__/agent-session-retention-audit.policy.spec.ts`
- Delete: `apps/server/src/agent-os/domain/session/agent-session-artifact-reference.policy.ts`
- Delete: `apps/server/src/agent-os/domain/session/__tests__/agent-session-artifact-reference.policy.spec.ts`

- [ ] **Step 1: Write artifact materialization RED tests**

```typescript
it('publishes only an artifact id after active materialization', async () => {
  const event = await writer.materialize({
    organizationId,
    sessionId,
    taskId,
    executionId,
    operationRunId,
    attemptToken,
    externalArtifactId: 'runtime-artifact-1',
    artifactType: 'report',
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'application/octet-stream',
    sha256: SHA256,
    label: 'Result report',
    navigationActionId,
    metadata: {},
  });
  expect(event).toEqual({
    kind: 'artifact',
    artifactId: expect.any(String),
    payload: { artifactType: 'report', label: 'Result report', sha256: SHA256, navigationActionId },
  });
  expect(JSON.stringify(event)).not.toMatch(/storageReference|agent-artifacts\//);
});

it('never reports erased while an aborted put promise is unresolved', async () => {
  storage.openMultipart.mockResolvedValue({ uploadId: 'upload-1' });
  storage.uploadAndComplete.mockReturnValue(neverSettles());
  const materialize = writer.materialize(materializeInput());
  await expect(materializationRow()).resolves.toMatchObject({
    providerUploadId: 'upload-1',
  });
  await writer.beginFence({ organizationId, sessionId, operationRunIds: [operationRunId] });
  await expect(writer.confirmFenced({ organizationId, sessionId, operationRunIds: [operationRunId] }))
    .resolves.toEqual({ state: 'unknown', code: 'ARTIFACT_WRITER_NOT_FENCED' });
  expect(await promiseState(materialize)).toBe('pending');
});

it('discovers an upload opened before its durable ID binding', async () => {
  storage.openMultipart.mockResolvedValue({ uploadId: 'orphan-upload' });
  transactions.bindUpload.mockRejectedValueOnce(PROCESS_CRASH);
  await expect(writer.materialize(materializeInput())).rejects.toBe(PROCESS_CRASH);
  await expect(materializationRow()).resolves.toMatchObject({
    providerUploadId: null,
  });

  const recreated = createStorageAdapter({
    multipartUploads: [{ key: derivedKey, uploadId: 'orphan-upload' }],
  });
  await expect(recreated.abortEraseAndConfirm({
    key: derivedKey,
    uploadId: null,
    signal: AbortSignal.timeout(1_000),
  })).resolves.toEqual({ state: 'erased' });
  await expect(recreated.listExactMultipartUploads(derivedKey)).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run focused tests and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/domain/session/__tests__/agent-session-artifact-key.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-session-artifact-writer.service.spec.ts \
  src/agent-os/adapter/out/storage/__tests__/storage-agent-session-artifact.adapter.spec.ts
```

Expected: FAIL because the derived-key, writer, storage, and materialization transaction ports do not exist.

- [ ] **Step 3: Split adapter events from normalized events**

Replace the artifact variant received from runtime adapters with a bounded candidate:

```typescript
export type DurableRuntimeAdapterEvent =
  | { kind: 'text_start' }
  | { kind: 'text_delta'; content: string }
  | { kind: 'text_end' }
  | { kind: 'progress'; progress: number; label: string }
  | { kind: 'interrupt'; interruptId: string; payload: Record<string, unknown> }
  | { kind: 'delegation'; payload: Record<string, unknown> }
  | {
      kind: 'terminal';
      status: 'completed' | 'failed' | 'cancelled';
      output?: Record<string, unknown>;
      errorCode?: string;
    }
  | {
      kind: 'artifact_candidate';
      externalArtifactId: string;
      artifactType: string;
      label: string;
      bytes: Uint8Array;
      mimeType: string;
      sha256: string;
      navigationActionId: string;
      metadata: Record<string, unknown>;
    }
  | { kind: 'resource_ref'; resource: CanonicalResourceRef };

export type NormalizedRuntimeEvent =
  | { kind: 'text_start' }
  | { kind: 'text_delta'; content: string }
  | { kind: 'text_end' }
  | { kind: 'progress'; progress: number; label: string }
  | { kind: 'interrupt'; interruptId: string; payload: Record<string, unknown> }
  | { kind: 'delegation'; payload: Record<string, unknown> }
  | { kind: 'resource_ref'; resource: CanonicalResourceRef }
  | {
      kind: 'terminal';
      status: 'completed' | 'failed' | 'cancelled';
      output?: Record<string, unknown>;
      errorCode?: string;
    }
  | {
      kind: 'artifact';
      artifactId: string;
      payload: {
        artifactType: string;
        label: string;
        sha256: string;
        navigationActionId: string;
      };
    };
```

Change `AgentDurableRuntimeAdapter.connect()` to return
`AsyncIterable<DurableRuntimeAdapterEvent>`. Hermes accepts a bounded base64
content field, decodes it before yielding, and rejects raw path/reference
fields. Isolated/provider adapters that cannot supply bytes yield
`resource_ref`; they do not create `AgentSessionArtifact`.

Use this strict Hermes artifact envelope before decoding:

```typescript
const HermesArtifactCandidateSchema = z.object({
  kind: z.literal('artifact_candidate'),
  externalArtifactId: z.string().min(1).max(256),
  artifactType: z.string().min(1).max(128),
  label: z.string().min(1).max(500),
  contentBase64: z.string().base64().max(22_369_624),
  mimeType: z.string().min(1).max(128),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  navigationActionId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

const bytes = Buffer.from(parsed.contentBase64, 'base64');
if (bytes.byteLength > MAX_AGENT_SESSION_ARTIFACT_BYTES) {
  throw new Error('agent_session_artifact_too_large');
}
```

- [ ] **Step 4: Define the writer and storage contracts**

```typescript
export interface AgentSessionArtifactWriterPort {
  materialize(input: AgentSessionArtifactMaterializationInput): Promise<
    Extract<NormalizedRuntimeEvent, { kind: 'artifact' }>
  >;
  beginFence(input: {
    organizationId: string;
    sessionId: string;
    operationRunIds: readonly string[];
  }): Promise<void>;
  confirmFenced(input: {
    organizationId: string;
    sessionId: string;
    operationRunIds: readonly string[];
  }): Promise<{ state: 'fenced' } | { state: 'unknown'; code: 'ARTIFACT_WRITER_NOT_FENCED' }>;
}

export interface AgentSessionArtifactMaterializationInput {
  signal: AbortSignal;
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  operationRunId: string;
  attemptToken: string;
  externalArtifactId: string;
  artifactType: string;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
  label: string;
  navigationActionId: string;
  metadata: Record<string, unknown>;
}

export interface AgentSessionArtifactStoragePort {
  openMultipart(input: {
    key: string;
    mimeType: string;
    signal: AbortSignal;
  }): Promise<{ uploadId: string }>;
  uploadAndComplete(input: {
    key: string;
    uploadId: string;
    bytes: Uint8Array;
    signal: AbortSignal;
  }): Promise<void>;
  abortEraseAndConfirm(input: {
    key: string;
    uploadId: string | null;
    signal: AbortSignal;
  }): Promise<
    | { state: 'erased' }
    | { state: 'present' }
    | { state: 'unknown' }
  >;
  inspect(input: { key: string; signal: AbortSignal }): Promise<'present' | 'erased' | 'unknown'>;
}
```

`StorageService` gains abort-signal-aware owned multipart open/upload/complete,
exact-key multipart enumeration/abort, `head`, and `delete` methods; existing
image APIs retain their current signatures. `abortEraseAndConfirm()` always
aborts the stored upload ID when present, enumerates every remaining multipart
upload whose key equals the one derived key, aborts those IDs, repeats the
exact-key list until empty, deletes the completed object, and confirms absence.
A null stored upload ID therefore means “discover and abort every invocation
for this exact derived key”, not “there is nothing to abort”. Any ambiguous
list/abort/head result is `unknown`. The AgentOS adapter derives the key
internally and never accepts a key from an HTTP/runtime caller. Only an adapter
that can prove exact-key multipart enumeration, abort/completion ordering, and
strong read-after-delete absence may implement this port.

- [ ] **Step 5: Implement prepare/activate transactions**

```typescript
export interface AgentSessionArtifactMaterializationTransactionPort {
  prepare(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    operationRunId: string;
    attemptToken: string;
    externalArtifactId: string;
    artifactType: string;
    sha256: string;
  }): Promise<{ artifactId: string }>;
  bindUpload(input: {
    organizationId: string;
    sessionId: string;
    artifactId: string;
    operationRunId: string;
    attemptToken: string;
    uploadId: string;
  }): Promise<void>;
  activate(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    artifactId: string;
    operationRunId: string;
    attemptToken: string;
    sha256: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}
```

All three methods take `lockWritableAgentSession()`. `prepare()` verifies the
exact active Operation attempt and its `AgentSessionOperationRunOwnership`, then
creates/replays one `materializing` row plus a transient materialization row.
The writer calls `openMultipart()`, persists the opaque upload ID with
`bindUpload()`, and sends no bytes before that commit. `activate()` repeats the
checks, verifies the provider object SHA-256, changes only that artifact to
`active`, and deletes the materialization row. A fence/state mismatch after
multipart completion aborts the invocation, erases the derived key, and returns
no artifact event. If the process dies after `openMultipart()` succeeds but
before `bindUpload()` commits, the nullable materialization row deliberately
survives; deletion/recovery treats it as an orphan-discovery request and uses
the exact-key multipart enumeration above before it can report `erased`.

- [ ] **Step 6: Implement active-put tracking and safe normalization**

`AgentSessionArtifactWriterService` owns a map capped at
`MAX_ACTIVE_AGENT_SESSION_ARTIFACT_PUTS`, keyed by
`organizationId/sessionId/operationRunId/artifactId`. It rejects the 129th
concurrent put with a retryable capacity code before creating a row, registers
the exact open/upload/complete promise before calling storage, removes it only after settlement,
and aborts matching controllers in `beginFence()`. `confirmFenced()` returns
`fenced` only when no matching promise remains; elapsed time alone returns
`unknown`.

Update `AgentSessionTaskExecutionService.persistArtifact()` to accept `artifact_candidate`, call the writer with the current OperationRun/attempt token, and record/publish only the returned normalized event. Remove `appendArtifact(storageReference)` from the session transition port and Prisma adapter after all callers migrate.

`AgentOsSessionModule` binds and exports only the controller-free
materialization transaction port. Extend the API-process-only, controller-free
`AgentOsApiExecutionModule` created in Task 4: add `StorageModule`, the writer
service, and the S3-compatible storage adapter, exporting only the writer
input-port token in addition to its existing owned-operation input port.
`AgentOsHttpModule` imports that module so its existing task-execution provider
can inject the writer. Do not register the deletion Operation, execution
service, recovery hooks, or controller yet.

- [ ] **Step 7: Add real-PG and late-put race coverage**

Add tests proving:

```typescript
// barrier A: prepare materializing row
// barrier B: begin deletion and fence the writer
// recreate the adapter/process, abort the persisted upload ID, then release the
// old CompleteMultipart invocation after delete/head
// required result: old completion cannot recreate the object, activate is
// rejected, erase is repeated, inspect is erased,
// and no normalized artifact event is appended.
```

Also prove normal reads exclude `materializing`, no upload part is sent before
the upload ID is persisted, a foreign OperationRun cannot materialize, and
idempotent replay returns the same artifact ID. Add a separate crash barrier at
`openMultipart()` success before `bindUpload()`: recreate the adapter with
`providerUploadId = null`, enumerate the provider's exact-key upload, abort it,
confirm the multipart list and object head are empty, and assert graph deletion
cannot complete until that proof succeeds.

- [ ] **Step 8: Perform the one unreleased schema/runtime contraction**

In the same task that migrates the last artifact caller, remove the old Task 1
lifecycle stack listed above and its module providers. Delete the old shared
`lifecycle` export and replace the old lifecycle scanner command in
`check:conventions` with `check:agent-session-deletion`; do not retain aliases,
deprecated exports, an inactive maintenance processor, or both scanners.
Before deleting `check-agent-interaction-lifecycle`, copy its still-valid
execution session/task ownership and retired-identifier assertions into the new
scanner and its fixtures; only the superseded retention/lifecycle assertions
are removed.
Remove `INTERACTION_LIFECYCLE_HMAC_KEY` from module wiring fixtures, environment
readers, smoke/release-contract fixtures, and Office deploy requirements in the
same contraction; no replacement deletion secret is introduced.

Contract the additive Task 2 schema in one change:

- remove `legalHoldAt`, `legalHoldReason`, `retentionDueAt`, retention claim
  fields, and the lifecycle-request reverse relation/index from `AgentSession`;
- drop `AgentInteractionRetentionPolicy`, `AgentSessionLifecycleRequest`,
  `AgentSessionTombstone`, `AgentSessionLegalAuditProjection`,
  `AgentSessionArtifactObject`, `AgentSessionArtifactObjectRetentionHold`, and
  `AgentSessionArtifactObjectTombstone`, plus their Organization/User reverse
  relations;
- remove `retentionClass`, `independentLegalBasisCode`, and
  `independentRetentionDueAt` from both `AgentExecutionUsage` and
  `AgentSessionArtifact`;
- replace `AgentSessionArtifact.storageObjectId/storageObject` with required
  `materializationOperationRunId` and a restrictive composite
  `(materializationOperationRunId, organizationId)` FK to `OperationRun`;
- add one transient one-to-one `AgentSessionArtifactMaterialization` row with
  only artifact/session/organization/materialization-run coordinates, nullable
  opaque `providerUploadId`, and timestamps; it cascades with the artifact,
  has no job/lease/retry/object-key field, and is deleted on activation;
- keep only the deletion binding/ownership models and reverse relations added
  in Task 2.

Update `agent-session-deletion-schema.static.spec.ts` from its additive shape
check to the exact final contract: required deletion/ownership/materialization
relations present and every retired model/field absent.

Regenerate Prisma and ERDs, then apply the destructive change only to a fresh
disposable PostgreSQL database:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run db:push -- --accept-data-loss
npm run db:erd
npm run check:schema-artifact-sync
npm run build --workspace=packages/shared
```

This is a pre-launch contraction: add no compatibility table, data migration,
backfill, dual write, or `VERSION` change. After it commits, neither the old
lifecycle endpoint nor the new deletion endpoint is composed; Task 10 is the
single live cutover.

- [ ] **Step 9: Verify Task 7 GREEN**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/domain/session/__tests__/agent-session-artifact-key.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-session-artifact-writer.service.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-session-task-execution.behavior.spec.ts \
  src/agent-os/adapter/out/storage/__tests__/storage-agent-session-artifact.adapter.spec.ts \
  src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts \
  src/agent-os/__tests__/agent-session-deletion-schema.static.spec.ts
npm exec --workspace=packages/shared vitest -- run \
  src/agent-interaction/deletion.spec.ts \
  src/agent-interaction/index.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run check:agent-session-deletion
npm run check:conventions
npm run build --workspace=apps/server
```

Expected: PASS; the new scanner is now live and GREEN, no retired Task 1
contract remains, no production `storageReference` remains in official session
artifact/event paths, and an unresolved put can never be interpreted as
deletion success.

- [ ] **Step 10: Commit Task 7**

```bash
git add apps/server/src/agent-os apps/server/src/common/storage packages/shared \
  prisma scripts docs/ERD.md docs/erd package.json
git commit -m "refactor: contract AgentSession deletion storage"
```

### Task 8: Implement runtime and artifact cleanup preparation

**Files:**
- Create: `apps/server/src/agent-os/application/port/in/session-execution/agent-session-deletion-execution.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/operation/agent-session-owned-operation-control.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/runtime/agent-session-runtime-cleanup.port.ts`
- Create: `apps/server/src/agent-os/application/port/in/session-execution/agent-runtime-credential-verification.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/repository/session-execution/agent-runtime-credential-authority.repository.port.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/session-deletion/agent-session-deletion-execution.transaction.port.ts`
- Create: `apps/server/src/agent-os/application/service/session-execution/agent-runtime-credential-verification.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-execution/__tests__/agent-runtime-credential-verification.service.spec.ts`
- Create: `apps/server/src/agent-os/application/service/session-execution/agent-session-deletion-execution.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-execution/__tests__/agent-session-deletion-execution.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/agent-session-runtime-cleanup.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/__tests__/agent-session-runtime-cleanup.adapter.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/operation/operations-agent-session-owned-operation-control.adapter.ts`
- Create: `apps/server/src/agent-os/adapter/out/operation/__tests__/operations-agent-session-owned-operation-control.adapter.spec.ts`
- Modify: `apps/server/src/agent-os/application/port/out/runtime/agent-durable-runtime.port.ts`
- Modify: `apps/server/src/agent-os/application/port/out/transaction/session-control/agent-attempt-operation.transaction.port.ts`
- Modify: `apps/server/src/agent-os/application/service/session-execution/agent-session-task-execution.service.ts`
- Modify: `apps/server/src/agent-os/application/service/session-execution/__tests__/agent-session-task-execution.behavior.spec.ts`
- Create: `apps/server/src/agent-os/application/port/out/runtime/isolated-cli-filesystem.port.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-runtime-adapter.registry.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/hermes-http-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/runtime-credential-broker.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/session-execution/prisma-agent-runtime-credential-authority.repository.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/isolated-cli-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/openai-responses-agui-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts`
- Modify: `apps/server/src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-deletion/prisma-agent-session-deletion-execution.transaction.ts`
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts`

- [ ] **Step 1: Write runtime-cleanup RED tests**

```typescript
it.each(['hermes_http', 'codex_cli', 'claude_cli', 'copilotkit_agui'])(
  'requires complete %s cleanup proof',
  async (runtimeType) => {
    const result = await cleanup.cleanup(runtimeCleanupInput(runtimeType));
    expect(result).toMatchObject({
      state: 'clean',
      executionAuthority: expect.stringMatching(/^(process_exited|irrevocably_revoked)$/),
      credentials: expect.stringMatching(/^(removed|irrevocably_revoked|not_owned)$/),
      handle: 'removed',
      filesystem: expect.stringMatching(/^(removed|not_owned)$/),
    });
  },
);

it('returns a safe retry disposition when runtime cleanup is unknown', async () => {
  runtimeCleanup.cleanup.mockResolvedValue({
    state: 'unknown',
    code: 'RUNTIME_CLEANUP_UNKNOWN',
  });
  await expect(execution.execute(executionInput())).resolves.toEqual({
    kind: 'retryable',
    code: 'RUNTIME_CLEANUP_UNKNOWN',
    consumedAttempts: 1,
  });
});

it('rejects a pre-fence credential in a recreated verifier', async () => {
  const token = await credentials.issue(activeAttemptAuthority());
  await beginDeletionAndIncrementCredentialGeneration();
  const recreated = createCredentialVerifier({ broker: newBroker(), prisma });
  await expect(recreated.verify({ token })).rejects.toMatchObject({
    code: 'RUNTIME_CREDENTIAL_REVOKED',
  });
});

it('classifies an owned queued attempt with no start intent as never started', async () => {
  const result = await execution.execute(executionInputWithQueuedAttempt());
  expect(runtimeCleanup.cleanup).not.toHaveBeenCalled();
  expect(result.kind).toBe('ready_for_graph_delete');
});

it('persists one exact start intent before runtime side effects', async () => {
  const first = await attempts.persistRuntimeStartIntent(startIntentInput());
  const replay = await attempts.persistRuntimeStartIntent(startIntentInput());
  expect(replay).toEqual(first);
  await expect(
    attempts.persistRuntimeStartIntent({
      ...startIntentInput(),
      startIntentId: anotherUuid,
    }),
  ).rejects.toMatchObject({ code: 'AGENT_RUNTIME_START_INTENT_CONFLICT' });
  expect(first).toMatchObject({ runtimeCredentialGeneration: 0 });
});

it('reuses the persisted start intent after start-before-handle crash', async () => {
  await fixture.crashAfterRuntimeStartBeforeHandlePersist();
  await fixture.recreateExecutionService();
  await fixture.replayCurrentOperation();
  expect(fakeRuntime.startIntentIds()).toEqual([persistedStartIntentId]);
  expect(fakeRuntime.remoteRunCount()).toBe(1);
});
```

- [ ] **Step 2: Run focused tests and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-execution/__tests__/agent-session-deletion-execution.service.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-runtime-credential-verification.service.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-session-task-execution.behavior.spec.ts \
  src/agent-os/adapter/out/runtime/__tests__/agent-session-runtime-cleanup.adapter.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: FAIL because the execution/cleanup ports, durable start-intent
transaction, replay behavior, and persisted credential authority do not exist.

- [ ] **Step 3: Define exact runtime cleanup proof**

```typescript
export type AgentSessionRuntimeCleanupResult =
  | {
      state: 'clean';
      executionAuthority: 'process_exited' | 'irrevocably_revoked';
      credentials: 'removed' | 'irrevocably_revoked' | 'not_owned';
      handle: 'removed';
      filesystem: 'removed' | 'not_owned';
    }
  | { state: 'unknown'; code: 'RUNTIME_CLEANUP_UNKNOWN' };

export interface AgentSessionRuntimeCleanupPort {
  cleanup(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    runtimeType: string;
    executionId: string;
    attemptId: string;
    startIntentId: string;
    handle: RuntimeHandle | null;
  }): Promise<AgentSessionRuntimeCleanupResult>;
}
```

The adapter registry resolves only the exact persisted `runtimeType`. Every
attempt is a cleanup coordinate even when no handle was persisted. A
cross-execution/attempt/session handle or start intent is an invariant error,
not cleanup success.

`RuntimeCredentialBroker` remains the bounded HMAC codec, but signature/expiry
verification alone is never authorization. Its strict claims include
`organizationId`, `sessionId`, `executionId`, `attemptId`, `startIntentId`, and
`runtimeCredentialGeneration`. A new
`AgentRuntimeCredentialVerificationService` parses the claims, then uses the
focused authority repository to read that exact attempt and parent session. It
authorizes only when the persisted start intent and credential generation are
equal and the session is still writable. Any KidItem MCP/capability boundary
that consumes the token calls this input port; a scanner rejects direct use of
the broker's signature verifier outside this service and tests. Because Task 6
increments the persisted credential generation under the deletion lifecycle
lock, an old token is rejected immediately by a newly constructed broker,
verifier, API, or MCP process even while its TTL remains. No revocation list,
timer, or in-memory authority is introduced.

- [ ] **Step 4: Implement adapter-specific cleanup**

Extend `AgentAttemptOperationTransactionPort` with
`persistRuntimeStartIntent()`. Its Prisma implementation takes the writable
session lock and verifies the exact organization/session/execution/attempt,
owned OperationRun, current attempt token, and runtime type. In one transaction
it persists a caller-generated UUID `startIntentId` on the attempt and returns
that same ID plus the current `runtimeCredentialGeneration`. An equal replay is
idempotent; a different UUID, generation drift, cross-owner run, stale attempt
token, or non-writable session fails closed. The real-PG adapter suite proves
same-intent replay, conflicting-intent rejection, and a crash immediately after
this transaction without any runtime side effect.

```typescript
interface PersistRuntimeStartIntentInput {
  organizationId: string;
  sessionId: string;
  executionId: string;
  attemptId: string;
  operationRunId: string;
  attemptToken: string;
  runtimeType: string;
  startIntentId: string;
}

interface PersistedRuntimeStartAuthority {
  startIntentId: string;
  runtimeCredentialGeneration: number;
}

interface AgentDurableRuntimeExecutionContext {
  // existing canonical execution context fields remain
  startIntentId: string;
  runtimeCredentialGeneration: number;
}
```

For an attempt with no persisted start intent,
`AgentSessionTaskExecutionService` generates one UUID and calls that transaction.
It then writes the existing `runtime_starting` Operation checkpoint with the
persisted start intent, runtime type, execution, and attempt. Only after both
durable writes succeed may it call `runtime.start()`. On re-entry it must read
and reuse the exact attempt/checkpoint intent; it never generates a replacement
or overwrites the original. Extend `AgentDurableRuntimeExecutionContext` with
the exact `startIntentId` and `runtimeCredentialGeneration` returned by the
transaction. The start intent is the adapter's idempotency/correlation
coordinate until a full handle is checkpointed and persisted. Cleanup supports
both forms:

- Hermes: start and control transport use the exact start intent as an
  idempotency/correlation key. With a handle, best-effort cancel it; without a
  handle, inspect/cancel the exact start intent. In both cases revoke the exact
  broker credential/reconnect authority (the DB credential generation is the
  durable revocation authority) and prove the remote run is terminal
  or irreversibly unauthorized. Credential issuance consumes only that strict
  durable runtime context and signs all six authority claims; it may not derive
  or default the generation inside the adapter.
- Codex/Claude isolated CLI: persist an owner-only start-intent marker before
  spawn and key the supervisor launch by it. With or without a completed
  handle, find/terminate only that supervised start intent, revoke its MCP
  credential, remove only
  `<runRoot>/<executionId>/<attemptId>/{home,work,state}`, and prove both the
  supervisor entry and attempt directory are absent.
- CopilotKit AG-UI: invalidate the persisted runtime generation/callback grant,
  best-effort stop by exact handle or execution/attempt start intent, and remove
  any persisted handle; filesystem/credential flags are `not_owned` only after
  grant invalidation.

An adapter that cannot find and clean a handle-less start intent must return
`RUNTIME_CLEANUP_UNKNOWN`; absence of a handle is never treated as absence of a
process, credential, or filesystem.

Extend the isolated filesystem port with scoped `removeTree()` and `exists()`; validate path components before deletion. Never accept an arbitrary path from persisted JSON.

- [ ] **Step 5: Define the deletion execution snapshot and result**

```typescript
export interface AgentSessionDeletionExecutionPort {
  execute(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    operationRunId: string;
    attemptToken: string;
  }): Promise<
    | { kind: 'ready_for_graph_delete'; fencedClosureDigest: string }
    | { kind: 'retryable'; code: AgentSessionDeletionFailureCode; consumedAttempts: number }
  >;
}

export interface ScopedDeletionAttempt {
  signal: AbortSignal;
  organizationId: string;
  sessionId: string;
  operationRunId: string;
  attemptToken: string;
}

export type RuntimeCleanupCoordinate =
  | {
      state: 'never_started';
      organizationId: string;
      sessionId: string;
      runtimeType: string;
      executionId: string;
      attemptId: string;
      startIntentId: null;
      handle: null;
    }
  | {
      state: 'started';
      organizationId: string;
      sessionId: string;
      runtimeType: string;
      executionId: string;
      attemptId: string;
      startIntentId: string;
      handle: RuntimeHandle | null;
    };

export interface OwnedOperationCleanupCoordinate {
  runId: string;
  operationKey: string;
  status: OperationStatus;
  expectedAttemptToken: string | null;
  nativeRunType: string | null;
  nativeRunId: string | null;
}

export interface AgentSessionOwnedOperationControlPort {
  fenceAndCancel(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    runs: readonly OwnedOperationCleanupCoordinate[];
  }): Promise<'fenced' | 'unknown'>;
}

export interface AgentSessionDeletionExecutionTransactionPort {
  loadFencedSnapshot(input: ScopedDeletionAttempt): Promise<
    | {
        kind: 'ready';
        snapshot: {
          retryGeneration: number;
          consumedAttempts: number;
          runtimeAttempts: RuntimeCleanupCoordinate[];
          operationRuns: OwnedOperationCleanupCoordinate[];
          artifacts: Array<{
            artifactId: string;
            materializationOperationRunId: string;
            providerUploadId: string | null;
          }>;
          operationRunIds: string[];
          closureDigest: string;
        };
      }
    | {
        kind: 'retryable';
        code: AgentSessionDeletionFailureCode;
        consumedAttempts: number;
      }
  >;
  terminalizeOwnedRun(input: ScopedDeletionAttempt & { ownedOperationRunId: string }): Promise<void>;
}
```

The Prisma adapter takes the lifecycle lock, verifies `deleting`, the exact current deletion run/binding and attempt token, and computes the full owned OperationRun closure from ownership edges, attempt bindings, and parent/child edges. It loads every execution attempt, including a `runtime_starting` checkpoint whose handle is still null, plus every member's status/native coordinates and every session artifact lifecycle, including `materializing`, so a crash before handle persistence or artifact activation cannot hide controlled state from cleanup. An attempt with no persisted start intent, no `runtime_starting` checkpoint, and no handle may be classified as `never_started`; because start-intent persistence precedes every runtime side effect, it has no runtime authority to clean. The execution service may skip that coordinate only after `fenceAndCancel()` has terminal-fenced the complete owned OperationRun closure. Any evidence of start with a missing intent is an invariant failure. The adapter also rejects schedules, another canonical owner, or a run owned by another session. Expected graph/ownership drift is returned as an allowlisted `retryable` result with the persisted consumed-attempt count; it is never thrown as an unclassified dispatcher failure.

- [ ] **Step 6: Implement ordered cleanup without open DB locks**

`AgentSessionDeletionExecutionService.execute()` performs:

```typescript
const scope = {
  organizationId: input.organizationId,
  sessionId: input.sessionId,
};
const loaded = await transactions.loadFencedSnapshot(input);
if (loaded.kind === 'retryable') return loaded;
const snapshot = loaded.snapshot;
try {
  const operationFence = await operationControl.fenceAndCancel({
    signal: input.signal,
    ...scope,
    runs: snapshot.operationRuns,
  });
  if (operationFence !== 'fenced') {
    return retry('SESSION_OPERATION_OWNERSHIP_INVALID', snapshot.consumedAttempts);
  }
  await artifactWriter.beginFence({ ...scope, operationRunIds: snapshot.operationRunIds });
  for (const attempt of snapshot.runtimeAttempts) {
    if (attempt.state === 'never_started') continue;
    const proof = await runtimeCleanup.cleanup({ ...attempt, signal: input.signal });
    if (proof.state !== 'clean') return retry('RUNTIME_CLEANUP_UNKNOWN', snapshot.consumedAttempts);
  }
  const writerProof = await artifactWriter.confirmFenced({
    ...scope,
    operationRunIds: snapshot.operationRunIds,
  });
  if (writerProof.state !== 'fenced') {
    return retry('ARTIFACT_WRITER_NOT_FENCED', snapshot.consumedAttempts);
  }
  for (const artifact of snapshot.artifacts) {
    await transactions.terminalizeOwnedRun({ ...input, ownedOperationRunId: artifact.materializationOperationRunId });
    const erased = await storage.abortEraseAndConfirm({
      key: agentSessionArtifactKey({ ...scope, artifactId: artifact.artifactId }),
      uploadId: artifact.providerUploadId,
      signal: input.signal,
    });
    if (erased.state !== 'erased') {
      return retry(
        erased.state === 'present' ? 'STORAGE_DELETE_PRESENT' : 'STORAGE_DELETE_UNKNOWN',
        snapshot.consumedAttempts,
      );
    }
  }
  return { kind: 'ready_for_graph_delete', fencedClosureDigest: snapshot.closureDigest };
} catch (error) {
  if (input.signal.aborted) throw input.signal.reason;
  return retry(classifyDeletionFailure(error), snapshot.consumedAttempts);
}

function retry(
  code: AgentSessionDeletionFailureCode,
  consumedAttempts: number,
) {
  return { kind: 'retryable' as const, code, consumedAttempts };
}

function classifyDeletionFailure(error: unknown): AgentSessionDeletionFailureCode {
  const candidate =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  const parsed = AgentSessionDeletionFailureCodeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : 'SESSION_DELETION_INVARIANT';
}
```

The AgentOS outgoing operation-control adapter rechecks that all requested runs
are from the already validated session closure and delegates only to
`OPERATION_EXACT_RUN_CONTROL_PORT`. The Operations control absorbs individual
native cancellation errors; terminal DB fencing plus the subsequent
adapter-specific cleanup proof are authoritative. No external call runs inside a Prisma transaction. Safe errors contain no key,
provider payload, prompt, credential, or content. Add tests for a thrown storage
error, runtime adapter invariant, transaction-reported ownership drift, and an
active deterministic browser/composite run; each
must become an allowlisted retry result rather than generic Operation failure.
Add a real-PG/process-recreation barrier that stops immediately after the fake
runtime creates its process/filesystem/credential but before the returned
handle is checkpointed. The recreated cleanup adapter receives the persisted
runtime type and start intent with `handle: null`, removes/revokes that exact
state, and deletion cannot reach graph contraction until the absence proof is
GREEN. A fake adapter without handle-less cleanup support must instead produce
`RUNTIME_CLEANUP_UNKNOWN`.

- [ ] **Step 7: Keep cleanup preparation non-runnable until graph deletion exists**

Do not register `AGENT_SESSION_DELETE_OPERATION` in Task 8. The execution
service returns `ready_for_graph_delete` only to its focused tests; Task 9 adds
the atomic graph transaction, changes the final execution result to
`completed`, and creates the incoming Operation adapter. This prevents a
partially implemented deletion from being claimable between commits.

- [ ] **Step 8: Verify Task 8 GREEN**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-execution/__tests__/agent-session-deletion-execution.service.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-session-task-execution.behavior.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-runtime-credential-verification.service.spec.ts \
  src/agent-os/adapter/out/runtime/__tests__/agent-session-runtime-cleanup.adapter.spec.ts \
  src/agent-os/adapter/out/operation/__tests__/operations-agent-session-owned-operation-control.adapter.spec.ts \
  src/agent-os/adapter/out/runtime/__tests__/hermes-runtime.adapter.spec.ts \
  src/agent-os/adapter/out/runtime/__tests__/isolated-cli-runtime.adapter.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run check:agent-session-deletion
npm run build --workspace=apps/server
```

Expected: PASS; every adapter removes only exact owned coordinates, unknown cleanup retries, and no external Hermes/Codex/Claude/OpenAI call occurs.

- [ ] **Step 9: Commit Task 8**

```bash
git add apps/server/src/agent-os
git commit -m "feat: clean AgentSession runtime ownership"
```

### Task 9: Delete the graph atomically, purge ephemeral lineage, and recover after restart

**Files:**
- Create: `apps/server/src/agent-os/adapter/in/operation/agent-session-deletion.operation-handler.ts`
- Create: `apps/server/src/agent-os/adapter/in/operation/__tests__/agent-session-deletion.operation-handler.spec.ts`
- Create: `apps/server/src/agent-os/application/port/out/transaction/session-deletion/agent-session-deletion-finalization.transaction.port.ts`
- Create: `apps/server/src/agent-os/adapter/out/transaction/session-deletion/prisma-agent-session-deletion-finalization.transaction.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/agent-session-deletion-recovery.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/agent-session-deletion-finalizer-recovery.service.ts`
- Create: `apps/server/src/agent-os/application/service/session-control/__tests__/agent-session-deletion-recovery.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/session-execution/agent-session-deletion-execution.service.ts`
- Modify: `apps/server/src/agent-os/application/service/session-execution/__tests__/agent-session-deletion-execution.service.spec.ts`
- Modify: `apps/server/src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/agent-session-deletion.pg.integration.spec.ts`

- [ ] **Step 1: Write crash, exhaustion, and purge RED tests**

```typescript
it('recovers graph_deleted by purging without recreating the session', async () => {
  await fixture.crashAfterGraphDeleted();
  await lifecycle.startNewAcceptingServer();
  await finalizerRecovery.run(lifecycle.signal);
  await expect(prisma.agentSession.findUnique({ where: { id: sessionId } })).resolves.toBeNull();
  await expect(prisma.agentSessionDeletionOperationBinding.count({ where: { sessionId } })).resolves.toBe(0);
  await expect(prisma.operationRun.count({ where: { id: { in: deletionLineageIds } } })).resolves.toBe(0);
});

it('never exceeds five cumulative attempts across lifecycle successors', async () => {
  for (let restart = 0; restart < 7; restart += 1) await fixture.failAndRestart();
  expect(await fixture.sumDeletionAttempts(1)).toBe(5);
  await expect(fixture.session()).resolves.toMatchObject({
    lifecycle: 'delete_failed',
    deletionFailureCode: 'STORAGE_DELETE_UNKNOWN',
  });
});

it('aborts a persisted multipart invocation after process recreation', async () => {
  await fixture.crashWithCompleteMultipartInFlight();
  await lifecycle.startNewAcceptingServer();
  await fixture.releaseOldCompleteAfterDeleteAndHead();
  await fixture.drainDeletion();
  await expect(fixture.artifactObjectState()).resolves.toBe('erased');
  await expect(fixture.multipartInvocationCount()).resolves.toBe(0);
});

it('purges in the same lifecycle after graph commit acknowledgement is lost', async () => {
  await fixture.commitGraphDeletedThenLoseAck({ failReconcileQueries: 1 });
  fixture.fireOrdinaryExecutionDeadline();
  await fixture.keepCurrentServerAliveAndDrainAttempt();
  await expect(fixture.session()).resolves.toBeNull();
  await expect(fixture.deletionLineageCount()).resolves.toBe(0);
  expect(fixture.graphCheckpointReconcileAttempts()).toBe(2);
  expect(fixture.serverRestartCount()).toBe(0);
});
```

- [ ] **Step 2: Run the deletion PG suite and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/agent-session-deletion.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: FAIL because graph deletion, ephemeral finalization, and post-acceptance deletion recovery are not implemented.

- [ ] **Step 3: Add atomic graph deletion plus checkpoint**

Extend the execution transaction with:

```typescript
deleteGraphAndCheckpoint(input: ScopedDeletionAttempt & {
  fencedClosureDigest: string;
}): Promise<void>;
hasGraphDeletedCheckpoint(input: ScopedDeletionAttempt & {
  fencedClosureDigest: string;
}): Promise<boolean>;
markDeleteFailed(input: ScopedDeletionAttempt & {
  failureCode: AgentSessionDeletionFailureCode;
}): Promise<void>;
```

`deleteGraphAndCheckpoint()` reacquires the lifecycle lock, verifies the exact current binding/run/attempt token and closure digest, recomputes the closure, and requires every member terminal/fenced. In FK-safe order it removes conversation outbox/events, approval continuations/approvals, artifact materialization invocations, artifacts, usage, attempt-operation bindings, task delegations, the immutable session-owned OperationRun ownership edges, owned-run checkpoints/results, owned runs in child-before-parent order, execution attempts, executions, policy snapshots, context epochs, tasks in deepest-child-before-parent order with the root last, and finally the AgentSession. The ownership edges are always removed before their `OperationRun` rows, executions before their policy snapshots, and task children before the restrictive self-FK parent, so restrictive composite FKs cannot be bypassed. It excludes the current deletion lineage and writes this checkpoint on the still-running current deletion run in the same transaction:

```typescript
{
  kind: 'graph_deleted',
  state: {
    sessionId,
    retryGeneration,
    closureDigest: fencedClosureDigest,
  },
}
```

No message, title, object key, user content, or credential enters the checkpoint.

- [ ] **Step 4: Complete the execution service and add the incoming adapter**

Replace the temporary `ready_for_graph_delete` result with the final execution
contract:

```typescript
export interface AgentSessionDeletionExecutionPort {
  execute(input: ScopedDeletionAttempt & {
    enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
  }): Promise<
    | { kind: 'completed' }
    | {
        kind: 'retryable';
        code: AgentSessionDeletionFailureCode;
        consumedAttempts: number;
      }
  >;
}
```

At the end of `AgentSessionDeletionExecutionService.execute()`, call
`enterEphemeralFinalization()` before the irreversible graph transaction. Use
its lifecycle-scoped signal for `deleteGraphAndCheckpoint()`. If the commit
promise throws, query `hasGraphDeletedCheckpoint()` by the exact
organization/session/current run/attempt token/digest. A successful query that
finds the matching checkpoint is committed success; a successful query that
returns false is confirmed absence and takes the allowlisted retry path. A
query exception is not absence and must never requeue a possibly committed
deletion. Repeat the exact query in the same attempt under the lifecycle-scoped
signal, using abortable exponential delays capped at one second, until a query
returns true/false or lifecycle shutdown/fence loss aborts. On that abort,
propagate the signal reason unchanged so post-`ACCEPTING` recovery can decide
checkpoint present versus absent; do not classify it as a deletion failure.
Return `completed` only after the commit or that exact acknowledgement-loss
reconciliation. The ordinary execution deadline cannot fire after phase entry;
fence loss or lifecycle shutdown still aborts and is recovered after the next
`ACCEPTING` boundary.

`enterEphemeralFinalization()` cancels only the deadline source attached to the
existing handler-context signal; the returned signal is that same context
signal with lifecycle/fence abort sources still active. Therefore the incoming
adapter's `context.signal.aborted` branch rethrows lifecycle interruption rather
than converting it to `SESSION_DELETION_INVARIANT`. Add the real-PG barrier
shown in Step 1: commit `graph_deleted`, lose the commit acknowledgement, fail
the first reconcile query, then let the second find the checkpoint and prove
same-lifecycle purge with no OperationRun requeue or server restart.

The incoming handler parses `AgentSessionDeleteOperationInputSchema`, verifies
the canonical session parent, and calls only
`AgentSessionDeletionExecutionPort`. It imports no Prisma, storage, runtime
outgoing port, or concrete application service:

```typescript
const SAFE_DELETION_FAILURE_MESSAGES: Record<
  AgentSessionDeletionFailureCode,
  string
> = {
  RUNTIME_CLEANUP_UNKNOWN: 'AgentSession deletion could not confirm runtime cleanup',
  ARTIFACT_WRITER_NOT_FENCED: 'AgentSession deletion could not fence an artifact writer',
  STORAGE_DELETE_PRESENT: 'AgentSession deletion found a remaining artifact',
  STORAGE_DELETE_UNKNOWN: 'AgentSession deletion could not confirm artifact absence',
  SESSION_OPERATION_OWNERSHIP_INVALID: 'AgentSession deletion found invalid operation ownership',
  SESSION_GRAPH_CHANGED: 'AgentSession deletion graph changed during cleanup',
  SESSION_DELETION_INVARIANT: 'AgentSession deletion invariant failed',
};

function safeDeletionFailureMessage(code: AgentSessionDeletionFailureCode): string {
  return SAFE_DELETION_FAILURE_MESSAGES[code];
}

let result: Awaited<ReturnType<AgentSessionDeletionExecutionPort['execute']>>;
try {
  result = await this.execution.execute({
    signal: context.signal,
    organizationId: context.organizationId,
    sessionId: parseAgentSessionName(input.session).sessionId,
    operationRunId: context.runId,
    attemptToken: context.attemptToken,
    enterEphemeralFinalization: () => context.enterEphemeralFinalization(),
  });
} catch (error) {
  if (context.signal.aborted) throw context.signal.reason;
  result = {
    kind: 'retryable',
    code: 'SESSION_DELETION_INVARIANT',
    consumedAttempts:
      (AGENT_SESSION_DELETE_MAX_ATTEMPTS - context.maxAttempts) +
      context.attempts,
  };
}
if (result.kind === 'completed') return { kind: 'completed', result: {} };
const retryAfterMs = AGENT_SESSION_DELETE_RETRY_DELAYS_MS[result.consumedAttempts - 1];
if (retryAfterMs === undefined && context.attempts < context.maxAttempts) {
  throw new Error('agent_session_deletion_retry_budget_invalid');
}
return {
  kind: 'retryable',
  code: result.code,
  message: safeDeletionFailureMessage(result.code),
  retryAfterMs: retryAfterMs ?? 0,
};
```

The fifth failure reaches the exhaustion hook; the adapter never invents a
sixth delay. Add a regression where snapshot loading throws an unexpected
Prisma/provider error: it must still take this safe retry/exhaustion path and
eventually set the Session to `delete_failed`, never leave only a failed
OperationRun beside a permanently `deleting` Session.

Replace Task 8's temporary `ready_for_graph_delete` expectations in
`agent-session-deletion-execution.service.spec.ts` with the final
phase-entry/graph-transaction call and `completed` result. Keep the Task 8
cleanup cases, assert the graph transaction is never called for any retryable
cleanup result, and simulate commit-with-lost-ack plus the old business deadline
to prove exact checkpoint reconciliation still reaches same-lifecycle purge.

- [ ] **Step 5: Implement terminal failure and ephemeral finalization hooks**

`AgentSessionDeletionOperationHandler.exhaustRetry()` calls `markDeleteFailed()`, which atomically verifies the active attempt, transitions the current OperationRun to `failed`, sets Session lifecycle `delete_failed`, and persists only the allowlisted failure code.

`finalizeEphemeralSuccess()` calls:

```typescript
export interface AgentSessionDeletionFinalizationTransactionPort {
  purgeGraphDeletedLineage(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    currentOperationRunId: string;
    expectedAttemptToken: string | null;
  }): Promise<void>;
  listGraphDeletedFinalizers(input: { limit: number }): Promise<DeletionFinalizerCandidate[]>;
  listInterruptedDeletions(input: { limit: number }): Promise<InterruptedDeletionCandidate[]>;
  continueInterruptedDeletion(input: InterruptedDeletionCandidate): Promise<'continued' | 'failed'>;
}

export interface DeletionFinalizerCandidate {
  organizationId: string;
  sessionId: string;
  currentOperationRunId: string;
}

export interface InterruptedDeletionCandidate {
  organizationId: string;
  sessionId: string;
  currentOperationRunId: string;
  retryGeneration: number;
  consumedAttempts: number;
}
```

The purge transaction locks the lineage, requires `graph_deleted`, deletes deletion bindings first, then checkpoints/OperationRun rows from newest to oldest. It never writes `succeeded`; absence of both binding and run is idempotent success.

- [ ] **Step 6: Implement ordered post-acceptance recovery services**

The two services expose bounded `run(signal)` methods. In a focused test-local
hook registry, register them in this order:

```typescript
hooks.register({
  key: 'agent-session-deletion-finalizers',
  priority: 10,
  run: (signal) => finalizerRecovery.run(signal),
});
hooks.register({
  key: 'agent-session-deletions',
  priority: 20,
  run: (signal) => deletionRecovery.run(signal),
});
```

Finalizer recovery directly purges bounded `graph_deleted` candidates. Deletion recovery locks `deleting` sessions whose exact current run is lifecycle-cancelled, sums attempts across bindings in the current generation, and atomically either:

- creates one immutable successor with `maxAttempts = 5 - consumedAttempts`, new binding, and current pointer; or
- moves the session to `delete_failed` when no attempts remain.

Concurrent API starts/recovery calls create exactly one successor. Neither service owns a timer, interval, lease loop, or Nest worker lifecycle.
Do not add these registrations or the incoming handler to a live Nest module in
Task 9. Task 10 performs their one API-root composition after all focused and PG
behavior is GREEN.

Each `run(signal)` drains deterministic batches of 100 until the next query is
empty. It tracks progress by exact candidate identity and throws on a repeated
non-progressing batch. The hook registry receives only the remaining portion of
the lifecycle service's single 30-second startup signal; timeout or any
remaining candidate fails API bootstrap
rather than starting intake with incomplete recovery. Add more than 100
finalizers and interrupted deletions to the focused/PG fixtures and prove every
batch drains; also prove one permanent purge error fails bootstrap.

- [ ] **Step 7: Add full graph and ownership assertions**

The real-PG suite must seed conversation events/outbox, approvals/outbox, a
three-level delegated task hierarchy, execution/attempt/checkpoints, an Agent
attempt OperationRun, a synthetic deterministic capability OperationRun,
artifacts, policy/context rows, and unrelated organization data. Assert the
nested tasks delete child-before-parent without an FK error and successful
deletion leaves:

```typescript
expect(await countSessionGraph(sessionId)).toEqual({
  sessions: 0,
  tasks: 0,
  executions: 0,
  attempts: 0,
  events: 0,
  approvals: 0,
  artifacts: 0,
  artifactMaterializations: 0,
  ownerships: 0,
  deletionBindings: 0,
  deletionRuns: 0,
});
expect(await countUnrelatedGraph()).toEqual(before);
```

Seed one cross-owner run and assert deletion fails closed without removing either owner.

- [ ] **Step 8: Verify restart/finalization GREEN**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/session-control/__tests__/agent-session-deletion-recovery.service.spec.ts \
  src/agent-os/application/service/session-execution/__tests__/agent-session-deletion-execution.service.spec.ts \
  src/agent-os/adapter/in/operation/__tests__/agent-session-deletion.operation-handler.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/agent-session-deletion.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run check:agent-session-deletion
npm run build --workspace=apps/server
```

Expected: PASS for crash after fence/runtime cancel/partial object delete/graph delete, cumulative five-attempt budget, DB-time delays, admin fresh generation, exact purge, and unrelated data preservation.

- [ ] **Step 9: Commit Task 9**

```bash
git add apps/server/src/agent-os
git commit -m "feat: recover complete AgentSession deletion"
```

### Milestone review 3

Run a read-only Sol review over Tasks 7–9. Require proof that a timed-out put cannot commit after success, runtime cleanup removes every KidItem-owned authority, graph deletion/checkpoint is atomic, lifecycle successors preserve a cumulative five-attempt budget, and purge leaves no lineage. Fix only concrete P1/P2 findings before Task 10; this is review loop 3 of at most 5.

### Task 10: Compose API-only execution and prove the full product flow

**Files:**
- Modify: `apps/server/src/agent-os/agent-os-session.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-api-execution.module.ts`
- Modify: `apps/server/src/agent-os/agent-os-http.module.ts`
- Modify: `apps/server/src/operations/operations.module.ts`
- Modify: `apps/server/src/api-application.module.ts`
- Modify: `apps/server/src/__tests__/application-roots.architecture.spec.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/__tests__/agent-worker-application.pg.integration.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts`
- Modify: `apps/web/e2e/fixtures/agent-interaction-harness.ts`
- Modify: `apps/web/e2e/agent-session-interaction.spec.ts`
- Modify: `deploy/interaction-gateway/smoke-official-recovery.mjs`
- Create: `scripts/verify-agent-session-deletion-process-roots.mjs`
- Modify: `scripts/README.md`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/interaction-platform.md`
- Modify: `apps/server/src/agent-os/AGENTS.md`
- Modify: `apps/server/src/operations/AGENTS.md`

- [ ] **Step 1: Write composition-root RED tests**

```typescript
it('composes deletion execution only in the API root', async () => {
  const api = await compile(ApiApplicationModule);
  expect(api.get(AgentSessionDeletionOperationHandler)).toBeDefined();
  expect(api.get(OperationRunWorkerService)).toBeDefined();

  await expectNotReachable(AgentWorkerApplicationModule, AgentSessionDeletionOperationHandler);
  await expectNotReachable(AgentWorkerApplicationModule, AgentSessionDeletionFinalizerRecoveryService);
  await expectNotReachable(AgentMcpApplicationModule, AgentSessionDeletionController);
  await expectNotReachable(AgentMcpApplicationModule, OperationRunWorkerService);
});
```

- [ ] **Step 2: Run wiring tests and record RED**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/__tests__/application-roots.architecture.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts
```

Expected: FAIL until the controller, operation handler, and recovery/finalizer
hooks are registered exactly once in API composition.

- [ ] **Step 3: Compose exactly one handler and recovery owner**

`AgentOsSessionModule` remains controller-free and exports deletion
command/query/execution transaction tokens. Extend the API-only
`AgentOsApiExecutionModule` created in Task 4 and extended in Task 7: it already imports
`AgentOsSessionModule`, `OperationsModule`, and `StorageModule` and owns the
writer/storage adapter; now it also owns the deletion execution service,
registers `AGENT_SESSION_DELETE_OPERATION` with one
`AgentSessionDeletionOperationHandler`, and registers the two post-accepting
recovery hooks. `AgentOsHttpModule` imports it and owns only the deletion
controller. `ApiApplicationModule` imports the HTTP/API modules once. This is
the first task in which the new DELETE/status/retry routes or deletion Operation
are reachable from a live process root.

Do not import deletion HTTP/config/handler/finalizer from `AgentWorkerApplicationModule` or `AgentMcpApplicationModule`. Do not add a second worker process or a new env secret.

- [ ] **Step 4: Add deterministic browser acceptance**

Extend the existing harness with:

```typescript
interface DeletionHarnessControl {
  setStorageResult(result: 'erased' | 'present' | 'unknown'): void;
  releaseLateRuntimeEvent(): Promise<void>;
  makeCurrentDeletionDue(): Promise<void>;
  drainOneOperationAttempt(): Promise<void>;
  countSessionGraph(sessionId: string): Promise<Record<string, number>>;
}
```

Use only disposable PostgreSQL, real Nest/API/Operations/gateway/Next boundaries, and deterministic fake runtime/storage. The test performs:

```typescript
await expect(browserDeleteAsCreator()).resolves.toMatchObject({ status: 202, state: 'deleting' });
await expect(statusAsCreator()).resolves.toMatchObject({ status: 200, state: 'deleting' });
await expect(sessionHistory()).not.toContain(sessionId);
await control.releaseLateRuntimeEvent();
await expect(canonicalEventCount()).resolves.toBe(eventCountAtFence);

control.setStorageResult('unknown');
for (let attempt = 0; attempt < 5; attempt += 1) {
  await control.makeCurrentDeletionDue();
  await control.drainOneOperationAttempt();
}
await expect(statusAsCreator()).resolves.toMatchObject({
  status: 200,
  state: 'delete_failed',
  failureCode: 'STORAGE_DELETE_UNKNOWN',
});
await expect(retryAsCreator()).resolves.toMatchObject({ status: 403 });

control.setStorageResult('erased');
await expect(retryAsAdministrator()).resolves.toMatchObject({ status: 202, state: 'deleting' });
await control.drainOneOperationAttempt();
await expect(statusAsAdministrator()).resolves.toMatchObject({ status: 204 });
await expect(control.countSessionGraph(sessionId)).resolves.toEqual({
  sessions: 0,
  tasks: 0,
  executions: 0,
  attempts: 0,
  events: 0,
  approvals: 0,
  artifacts: 0,
  artifactMaterializations: 0,
  ownerships: 0,
  deletionBindings: 0,
  deletionRuns: 0,
});
```

For deletion specifically, retain the interaction-only deterministic runtime
fixture but boot a separate real `ApiApplicationModule` against the same
disposable database. Seed persisted `AuthSession` credentials and exercise the
registered controller/handler/Operations worker through that root. Do not
assemble a deletion controller/handler graph manually or bind
`AGENT_SESSION_DELETION_PORT` with `useValue`. A deletion fake may control
erase confirmation only; it must not expose a materialization capability.

The harness advances only disposable DB `scheduledFor` rows between attempts; production code still uses PostgreSQL time. Assert cross-organization and ordinary-user requests are non-enumerating `204`.

- [ ] **Step 5: Update durable architecture and runbooks**

Document:

- complete deletion ownership and exact hexagonal path;
- API-root Operations execution and worker/MCP exclusions;
- derived session artifact keys and no raw references;
- five cumulative attempts plus admin retry generation;
- no retention/legal hold/audit/tombstone/shared object/organization removal behavior;
- pre-launch `db:push --accept-data-loss`, no backfill/migration, and unchanged release train `VERSION`;
- provider telemetry is a non-goal; only KidItem-owned state is deleted.

Confirm all lifecycle-HMAC and automatic-retention setup instructions were
removed in Task 7. Update AgentOS/Operations AGENTS ownership maps without
duplicating the design spec.

- [ ] **Step 6: Run focused, PG, browser, and process-root gates**

Run:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/__tests__/application-roots.architecture.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts \
  src/agent-os/adapter/in/http/session-control/__tests__/agent-session-deletion.controller.spec.ts \
  src/agent-os/adapter/in/operation/__tests__/agent-session-deletion.operation-handler.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/__tests__/agent-session-deletion.pg.integration.spec.ts \
  src/agent-os/__tests__/official-runtime-recovery.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/session-control/__tests__/prisma-agent-session-control.pg.integration.spec.ts \
  src/agent-os/adapter/out/transaction/interaction/__tests__/prisma-agent-interaction.pg.integration.spec.ts \
  --config vitest.config.integration.ts
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
npm run build --workspace=apps/interaction-gateway
npm run build --workspace=apps/web
npx playwright test apps/web/e2e/agent-session-interaction.spec.ts \
  --config playwright.config.ts
node deploy/interaction-gateway/smoke-official-recovery.mjs
```

Patch the official smoke script so its Playwright leg explicitly includes the
extended deletion scenario; the direct command above prevents a smoke wiring
mistake from collecting zero relevant tests. Expected: all focused/PG/build
commands PASS; both direct Playwright and smoke report the durable browser
scenario and recovery suites GREEN with no external model/provider calls.

- [ ] **Step 7: Prove finite API, worker, and MCP composition**

Implement `verify-agent-session-deletion-process-roots.mjs` as a bounded
try/finally harness. It owns one disposable PostgreSQL 17 database, seeds normal
AgentOS manifests, spawns each root with exact env, waits for its readiness
probe/log (30 seconds maximum), asserts provider reachability/exclusion, sends
SIGTERM and waits for exit before moving to the next root, and force-stops only
its recorded child PIDs/container on failure. Run:

```bash
node scripts/verify-agent-session-deletion-process-roots.mjs
```

Expected:

- API reaches `Server running` with deletion controller, Operations worker, handler, and hooks initialized.
- Agent worker reaches ready with all deletion HTTP providers/handler/finalizer absent.
- MCP answers JSON-RPC `initialize` with deletion HTTP providers/handler/finalizer absent.
- A credential issued before the deletion fence is rejected after destroying
  and recreating both API and MCP credential-verifier application contexts;
  MCP owns verification only, never the deletion handler or worker.
- All owned processes, listeners, Testcontainers, and generated `test-results` are removed after the proof.

- [ ] **Step 8: Run the complete static/schema/repository gates**

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run db:push -- --accept-data-loss
npm run db:erd
npm run check:schema-artifact-sync
npm run check:agent-session-deletion
npm run check:agent-os-hexagonal
npm run check:idor
npm run check:tenant-scope
npm run check:agents-hygiene
npm run check:scripts-inventory
npm run check:conventions
git diff --check
```

Run final absence probes:

```bash
rg -n 'AgentInteractionRetentionPolicy|AgentSessionLifecycleRequest|AgentSessionTombstone|AgentSessionLegalAuditProjection|AgentSessionArtifactObject|INTERACTION_LIFECYCLE_HMAC_KEY' \
  apps packages prisma deploy docs/runbooks
rg -n 'storageReference|storageObjectId' \
  apps/server/src/agent-os/application \
  apps/server/src/agent-os/adapter/out/transaction/session-control \
  packages/shared/src/agent-interaction
```

Expected: gates PASS; both absence probes return no production contract hit (documentation explaining removed concepts may use prose outside the searched runbook paths only when necessary). Confirm no data-migration file was added and `VERSION` did not change.

- [ ] **Step 9: Commit Task 10**

```bash
git add apps/server apps/web deploy packages prisma scripts docs package.json
git commit -m "feat: complete AgentSession deletion"
```

### Milestone review 4 and completion rule

Run one final read-only Sol integrated review over the complete range. It must inspect the exact diff, schema/FKs, every process root, Operation retry/finalization, runtime/artifact cleanup proof, API response matrix, PG crash barriers, browser acceptance, and absence scanners. This is review loop 4. Use loop 5 only if that review returns a concrete P1/P2; after fixing it, rerun the affected RED/GREEN tests plus the final gates and request one last Sol confirmation. Do not start a sixth loop.

## Final acceptance checklist

- [ ] A new/repeated authorized DELETE is atomic and returns `202`; unknown/foreign/unauthorized returns `204`.
- [ ] Creator/admin deletion and admin-only retry match the exact response matrix.
- [ ] `deleting` and `delete_failed` sessions are hidden and reject every mutation family.
- [ ] Every session-originated OperationRun has one immutable ownership edge from its creation transaction.
- [ ] Runtime process/writer authority, credentials, handles, MCP state, homes/work/state files, artifacts, and transient multipart invocations are absent before graph deletion completes.
- [ ] `present` or `unknown` storage never becomes success through timeout or elapsed time.
- [ ] Graph deletion and `graph_deleted` checkpoint commit atomically.
- [ ] Success leaves zero canonical session rows and zero deletion lineage; failed deletion retains only the bounded safe status lineage.
- [ ] Lifecycle replacement creates immutable successors and never exceeds five cumulative attempts per retry generation.
- [ ] API owns the one Operations deletion executor/finalizer; Agent worker and MCP own none.
- [ ] No Task 1 retention/legal-hold/audit/tombstone/shared-object compatibility surface remains.
- [ ] No production backfill/migration or `VERSION` change was introduced.
- [ ] Disposable PostgreSQL, browser, finite process-root, scanner, build, and diff gates are all fresh and GREEN.
