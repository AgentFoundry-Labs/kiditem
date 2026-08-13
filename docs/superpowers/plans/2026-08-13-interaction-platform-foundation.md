# Interaction Platform Foundation Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the committed KID-25 interaction foundation so every
submitted CopilotKit conversation starts as one KidItem-persisted,
session-backed AgentOS execution while empty surfaces and reconnect remain
read-only.

**Architecture:** Replace the Enterprise-oriented lock with an OSS-only package
train and keep the generic organization fences already committed. Replace the
branch-only pre-session binding schema with `AgentSession` as the thread
control root, create a root task/context/policy/run/first-event graph plus
outbox atomically under a full-scope PostgreSQL advisory lock, and authorize the
separate gateway through a 30-second Nest-signed run intent. Reuse current
uncommitted binding/identity/HTTP work only after tests prove it matches this
contract.

**Tech Stack:** Node.js 22, TypeScript, NestJS, Prisma v7/PostgreSQL 17
Testcontainers, Zod, Vitest, CopilotKit `1.67.1`, AG-UI `0.0.57`

---

## Current Branch Baseline

Already committed and retained or reconstructed as noted:

- reconstruct `deploy/interaction-intelligence/platform-lock.json` as the
  OSS-only `deploy/interaction-gateway/platform-lock.json`;
- retain the OSS-focused `docs/references/copilotkit-platform-matrix.md`;
- `scripts/check-copilotkit-train.mjs` and its tests/inventory wiring;
- the focused `@kiditem/shared/agent-interaction` subpath;
- `AgentVersion`, policy snapshot, execution usage, organization composite-FK,
  terminal-state, and idempotency implementation ideas.

Already committed but reconstructed in this plan:

- `InteractionClassSchema` and all class fields;
- `AgentInteractionThreadBinding`;
- the active lightweight-thread partial unique constraint;
- `idleExpiresAt`, pending target IDs, rotation/archive ordering, and
  `withQuickAskLock`;
- nullable execution session/task ownership; and
- context epochs tied to a pre-session binding.

Current uncommitted binding/identity/HTTP work must not be discarded wholesale.
Classify it as:

- **Retain and adapt:** opaque principal HMAC, active agent-version lookup,
  model/runtime fail-fast, canonical context hashing, 30-second token signing,
  gateway secret guard, DTO whitelist, stable error mapping, health probe, and
  Nest provider wiring.
- **Rewrite:** bootstrap response, preparation claims, run authorization,
  connection authorization, repository transaction, and associated tests.
- **Delete after replacement tests pass:** `AgentThreadBindingService`, thread
  HMAC secret/provider, deterministic pending target logic, expiry/rotation
  tests, and archive-before-authorize behavior.

## File Responsibility Map

### Shared interaction contract

- `packages/shared/src/agent-interaction/index.ts`: bootstrap, session summary,
  run intent, run authorization, connection authorization, correlation, and
  dashboard-context, conversation-event, and replay schemas.
- `packages/shared/src/agent-interaction/index.spec.ts`: strict/strip behavior,
  identity invariants, ISO timestamps, and forbidden retired fields.
- `packages/shared/package.json` and `packages/shared/tsup.config.ts`: retain the
  focused subpath only; do not expand root barrels.

### Session control persistence

- `prisma/models/agents.prisma`: `AgentSession`, `AgentSessionTask`,
  session-owned `AgentContextEpoch`, session-aware `AgentPolicySnapshot`,
  non-null session/task `AgentExecution`, `AgentConversationEvent`, transactional
  outbox, replay projection fields, and existing usage ledger.
- `prisma/models/core.prisma`: Organization/User back-relations for the final
  session models only.
- `apps/server/src/agent-os/application/port/out/repository/agent-interaction-repository.port.ts`:
  exact session/event graph, read-only session/replay lookup, execution
  terminal/usage, and transaction-lock port.
- `apps/server/src/agent-os/adapter/out/repository/prisma-agent-interaction.repository.ts`:
  organization-scoped Prisma implementation and full-scope tagged advisory
  transaction.
- `apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts`:
  isolated PostgreSQL concurrency, FK, event ordering/outbox, idempotency,
  read-only replay, and terminal contract.

### Identity and authorization

- `apps/server/src/agent-os/application/service/agent-interaction.tokens.ts`:
  clock, gateway secret, principal HMAC, run-intent HMAC, and replay-cursor HMAC
  only.
- `apps/server/src/agent-os/application/service/agent-interaction-identity.service.ts`:
  principal, allowed agents, bootstrap, run intent, run authorization,
  read-only connection authorization, and health.
- `apps/server/src/agent-os/application/service/__tests__/agent-interaction-identity.service.spec.ts`:
  pure service contract.
- Delete after replacement: `agent-thread-binding.service.ts` and its spec.

### HTTP and Nest wiring

- `apps/server/src/agent-os/adapter/in/http/dto/agent-interaction.dto.ts`:
  whitelisted browser and gateway DTOs with no trusted scope fields.
- `apps/server/src/agent-os/adapter/in/http/interaction-gateway.guard.ts`:
  timing-safe service credential plus KidItem session requirement; health-only
  `SkipAuth` exception.
- `apps/server/src/agent-os/adapter/in/http/agent-interaction-bootstrap.controller.ts`:
  browser-authenticated read-only bootstrap and run-intent endpoint.
- `apps/server/src/agent-os/adapter/in/http/agent-interaction-control.controller.ts`:
  service-authenticated run/connection authorization and health.
- Controller specs and `agent-os.module.wiring.spec.ts`: route, forwarding,
  stable errors, and exact provider/controller registration.

### Durable guard

- Create `scripts/check-agent-interaction-lifecycle.mjs`: reject retired
  lifecycle identifiers and nullable execution ownership in active source,
  schema, and active plans while excluding the approved spec's rejected-
  alternative discussion.
- Create `scripts/__tests__/check-agent-interaction-lifecycle.test.mjs`.
- Modify root `package.json`, `scripts/README.md`, and
  `scripts/check-script-inventory.mjs` for the new entrypoint.

## Task 1: Replace The Enterprise Lock With An OSS-Only Train

**Files:**

- Move: `deploy/interaction-intelligence/platform-lock.json` to
  `deploy/interaction-gateway/platform-lock.json`
- Modify: `scripts/check-copilotkit-train.mjs`
- Modify: `scripts/__tests__/check-copilotkit-train.test.mjs`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `package.json`
- Modify: `apps/server/package.json`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Verify: `docs/references/copilotkit-platform-matrix.md`

- [ ] **Step 1: Write the failing OSS-boundary tests**

Assert the target lock is exactly:

```json
{
  "copilotKit": "1.67.1",
  "agUi": "0.0.57",
  "node": ">=22 <23",
  "fork": "AgentFoundry-Labs/CopilotKit",
  "upstream": "CopilotKit/CopilotKit"
}
```

Add source assertions that production manifests and the lock contain none of
`enterpriseChart`, `copilot-intelligence`, `intelligenceApiKey`,
`COPILOTKIT_PUBLIC_API_KEY`, `useThreads`, Kubernetes/Helm requirements, or a
CopilotKit-managed thread endpoint. Keep PostgreSQL out of this vendor lock;
it is a KidItem persistence dependency governed by the repository train.

- [ ] **Step 2: Run the guard suite and record RED**

```bash
node --test scripts/__tests__/check-copilotkit-train.test.mjs
npm run check:copilotkit-train
```

Expected: FAIL because the committed lock still contains the Enterprise chart
and infrastructure requirements at the old path.

- [ ] **Step 3: Move and reduce the lock**

Move the file, remove Enterprise/chart/Kubernetes/Helm/Redis fields, and update
the guard and inventory to read the new exact path. Normalize every direct
CopilotKit dependency in root/server/web manifests to exact `1.67.1` and every
direct AG-UI dependency to exact `0.0.57`; regenerate the lockfile. Keep
`@copilotkit/react-ui` only until Plan 2 replaces the legacy component, but pin
it exactly. The guard validates the one CopilotKit/AG-UI package train and
rejects new Premium/Enterprise production configuration or imports. It does
not reject transitive dependency names or documentation that explains the
excluded boundary.

- [ ] **Step 4: Reach GREEN and verify license evidence**

```bash
node --test scripts/__tests__/check-copilotkit-train.test.mjs
npm run check:copilotkit-train
npm run check:scripts-inventory
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

Expected: tests, guards, and builds PASS after dependency normalization.
Capture exact tarball LICENSE files and package
metadata for `1.67.1`/`0.0.57`; stop if the discrepancy recorded in the matrix
cannot be resolved for distribution.

- [ ] **Step 5: Commit the OSS train reconstruction**

```bash
git add deploy/interaction-gateway/platform-lock.json \
  deploy/interaction-intelligence/platform-lock.json \
  scripts/check-copilotkit-train.mjs \
  scripts/__tests__/check-copilotkit-train.test.mjs \
  scripts/check-script-inventory.mjs package.json apps/server/package.json \
  apps/web/package.json package-lock.json
git commit -m "refactor: lock the CopilotKit OSS train"
```

## Task 2: Replace Shared Dual-Lifecycle Contracts

**Files:**

- Modify: `packages/shared/src/agent-interaction/index.spec.ts`
- Modify: `packages/shared/src/agent-interaction/index.ts`
- Verify: `packages/shared/package.json`
- Verify: `packages/shared/tsup.config.ts`

- [ ] **Step 1: Write the failing single-lifecycle contract tests**

Replace class/target/binding fixtures with this contract shape:

```typescript
const agent = {
  agentDefinitionKey: 'operator',
  agentVersionId: 'version-1',
  displayName: 'KidItem Operator',
  description: 'KidItem operations agent',
  isDefault: true,
};

const session = {
  sessionId: 'session-1',
  copilotThreadId: 'thread-1',
  primaryAgentDefinitionKey: 'operator',
  primaryAgentVersionId: 'version-1',
  lifecycle: 'active',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

expect(InteractionBootstrapSchema.parse({
  defaultAgentDefinitionKey: 'operator',
  agents: [agent],
  sessions: [session],
})).toEqual(expect.objectContaining({ sessions: [session] }));

expect(() => InteractionBootstrapSchema.parse({
  defaultAgentDefinitionKey: 'operator',
  agents: [agent],
  sessions: [],
  threadTargets: [],
})).toThrow();
```

Add assertions that authorization requires non-null session/root task:

```typescript
expect(() => AguiRunAuthorizationSchema.parse({
  session,
  sessionTaskId: null,
  executionId: 'execution-1',
  modelIdentity: 'gpt-5',
  runtimeType: 'ag_ui',
  policySnapshotId: 'policy-1',
  contextEpoch: 1,
  dashboardContext,
})).toThrow();

expect(AgentCorrelationSchema.parse({
  copilotThreadId: 'thread-1',
  aguiRunId: 'run-1',
  executionId: 'execution-1',
  sessionId: 'session-1',
  sessionTaskId: 'task-1',
  operationsRunId: null,
})).toBeTruthy();

expect(AgentConversationEventEnvelopeSchema.parse({
  eventId: 'event-1',
  sessionId: 'session-1',
  executionId: 'execution-1',
  sequence: '1',
  eventType: 'user_message',
  schemaVersion: 1,
  payload: { messageId: 'message-1', content: '재고 현황 알려줘' },
  createdAt: '2026-08-13T00:00:00.000Z',
})).toBeTruthy();
```

Add a static source assertion rejecting production exports named
`InteractionClass`, `ThreadBinding`, `idleExpiresAt`, or archive commands. Add
negative cases for numeric/negative sequences, unknown event types, invalid
payloads, and a replay cursor supplied as a trusted decoded sequence.

- [ ] **Step 2: Run the focused suite and record RED**

Run:

```bash
npm exec --workspace=packages/shared vitest -- run src/agent-interaction/index.spec.ts
```

Expected: FAIL because bootstrap still requires `threadTargets`, correlation
permits null session/task, and retired exports remain.

- [ ] **Step 3: Implement the minimal replacement schemas**

Define and infer only these public values:

```typescript
export const AllowedAgentSchema = z.object({
  agentDefinitionKey: z.string().min(1),
  agentVersionId: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  isDefault: z.boolean(),
}).strict();

export const AgentSessionSummarySchema = z.object({
  sessionId: z.string().min(1),
  copilotThreadId: z.string().min(1),
  primaryAgentDefinitionKey: z.string().min(1),
  primaryAgentVersionId: z.string().min(1),
  lifecycle: z.enum(['active', 'completed', 'cancelled', 'archived']),
  updatedAt: z.string().datetime(),
}).strict();

export const InteractionBootstrapSchema = z.object({
  defaultAgentDefinitionKey: z.string().min(1),
  agents: z.array(AllowedAgentSchema).min(1),
  sessions: z.array(AgentSessionSummarySchema),
}).strict().superRefine(requireOneMatchingDefault);
```

Keep `DashboardContextSchema`, but expose `AguiRunIntentSchema` with
`runIntent`, `expiresAt`, `copilotThreadId`, and `aguiRunId`. Define
`AguiRunAuthorizationSchema` with `session`, non-null `sessionTaskId`,
`executionId`, model/runtime/policy IDs, positive `contextEpoch`, and parsed
dashboard context. Define version-1 discriminated conversation event payloads
and a replay response whose bigint `sequence`/`lastSequence` values are decimal
strings and whose `nextCursor` is opaque. Define read-only connection
authorization with `session`, `contextEpoch`, replay cursor metadata, and no
execution fields.

Remove `InteractionClassSchema`, `InteractionThreadTargetSchema`,
`ThreadBindingSchema`, and `AguiThreadArchiveCommandSchema` instead of keeping
one-value or compatibility aliases.

- [ ] **Step 4: Run focused and package gates**

Run:

```bash
npm exec --workspace=packages/shared vitest -- run src/agent-interaction/index.spec.ts
npm run build --workspace=packages/shared
npm run check:shared-root-imports
npm run check:shared-interface-names
```

Expected: focused tests and all gates PASS; public ESM/CJS import of
`@kiditem/shared/agent-interaction` succeeds.

- [ ] **Step 5: Commit the contract replacement**

```bash
git add packages/shared/src/agent-interaction/index.ts \
  packages/shared/src/agent-interaction/index.spec.ts
git commit -m "refactor: unify interaction session contracts"
```

## Task 3: Replace Thread Binding With Atomic Session And Conversation Persistence

**Files:**

- Modify: `prisma/models/agents.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `apps/server/src/agent-os/application/port/out/repository/agent-interaction-repository.port.ts`
- Modify: `apps/server/src/agent-os/adapter/out/repository/prisma-agent-interaction.repository.ts`
- Modify: `apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts`

- [ ] **Step 1: Write real-PostgreSQL RED tests for the session graph**

Replace binding tests with this repository behavior:

```typescript
const first = await repository.authorizeExecution(firstRunInput({
  copilotThreadId: 'thread-1',
  aguiRunId: 'run-1',
}));

expect(first).toMatchObject({
  createdSession: true,
  session: { copilotThreadId: 'thread-1', lifecycle: 'active' },
  rootTask: { status: 'interpreting', objective: null },
  contextEpoch: 1,
  userEvent: {
    externalEventId: 'message-1',
    sequence: 1n,
    eventType: 'user_message',
  },
});

const retry = await repository.authorizeExecution(firstRunInput({
  copilotThreadId: 'thread-1',
  aguiRunId: 'run-1',
}));
expect(retry.session.id).toBe(first.session.id);
expect(retry.rootTask.id).toBe(first.rootTask.id);
expect(retry.execution.id).toBe(first.execution.id);
expect(retry.userEvent.id).toBe(first.userEvent.id);
```

Add cases for:

```typescript
await Promise.all([
  repository.authorizeExecution(firstRunInput({ copilotThreadId: 'thread-race', aguiRunId: 'run-race' })),
  repository.authorizeExecution(firstRunInput({ copilotThreadId: 'thread-race', aguiRunId: 'run-race' })),
]);

expect(await prisma.agentSession.count({ where: { copilotThreadId: 'thread-race' } })).toBe(1);
expect(await prisma.agentSessionTask.count({ where: { session: { copilotThreadId: 'thread-race' }, isRoot: true } })).toBe(1);
expect(await prisma.agentConversationEvent.count({ where: { session: { copilotThreadId: 'thread-race' } } })).toBe(1);
expect(await prisma.agentConversationOutbox.count({ where: { event: { session: { copilotThreadId: 'thread-race' } } } })).toBe(1);
```

Also prove later `run-2` adds only one execution; another thread adds another
session; each accepted run appends exactly one idempotent user event; exact
retry with changed content hash or payload conflicts; event sequences remain
monotonic under concurrent appends; cross-org direct FK inserts fail; session
and replay lookup are organization/user fenced; connection/replay lookup
creates zero rows; terminal transitions are one-way; and usage rejects a
noncanonical model.

- [ ] **Step 2: Run the isolated PostgreSQL suite and record RED**

Run from the server workspace so the filter resolves correctly:

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: isolated `prisma db push` succeeds, then tests FAIL because the
repository and models still expose pre-session binding operations.

- [ ] **Step 3: Define the final Prisma control graph**

Replace `AgentInteractionThreadBinding` with these conceptual models and
organization-composite relations:

```prisma
model AgentSession {
  id                        String    @id @default(uuid()) @db.Uuid
  organizationId            String    @map("organization_id") @db.Uuid
  createdByUserId           String    @map("created_by_user_id") @db.Uuid
  copilotThreadId           String    @map("copilot_thread_id")
  primaryAgentVersionId     String    @map("primary_agent_version_id") @db.Uuid
  authorityProfileVersionId String    @map("authority_profile_version_id")
  contextEpoch              Int       @default(1) @map("context_epoch")
  title                     String?
  lastEventSequence         BigInt    @default(0) @map("last_event_sequence")
  lifecycle                 String    @default("active")
  completedAt               DateTime? @map("completed_at") @db.Timestamptz
  cancelledAt               DateTime? @map("cancelled_at") @db.Timestamptz
  archivedAt                DateTime? @map("archived_at") @db.Timestamptz
  createdAt                 DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                 DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([organizationId, copilotThreadId])
  @@unique([id, organizationId])
  @@index([organizationId, createdByUserId, lifecycle, updatedAt])
}

model AgentSessionTask {
  id                     String    @id @default(uuid()) @db.Uuid
  organizationId         String    @map("organization_id") @db.Uuid
  sessionId              String    @map("session_id") @db.Uuid
  parentTaskId           String?   @map("parent_task_id") @db.Uuid
  assignedAgentVersionId String    @map("assigned_agent_version_id") @db.Uuid
  objective              String?   @db.Text
  isRoot                 Boolean   @default(false) @map("is_root")
  status                 String
  idempotencyKey         String    @map("idempotency_key")
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt              DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  finishedAt             DateTime? @map("finished_at") @db.Timestamptz

  @@unique([sessionId, idempotencyKey])
  @@unique([sessionId], where: raw("is_root = true"))
  @@unique([id, organizationId])
  @@index([organizationId, sessionId, status])
}

model AgentConversationEvent {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  sessionId       String   @map("session_id") @db.Uuid
  executionId     String?  @map("execution_id") @db.Uuid
  externalEventId String   @map("external_event_id")
  sequence        BigInt
  eventType       String   @map("event_type")
  schemaVersion   Int      @map("schema_version")
  payload         Json
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@unique([sessionId, sequence])
  @@unique([organizationId, externalEventId])
  @@unique([id, organizationId])
  @@index([organizationId, sessionId, createdAt])
}

model AgentConversationOutbox {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  eventId        String    @unique @map("event_id") @db.Uuid
  attemptCount   Int       @default(0) @map("attempt_count")
  publishedAt    DateTime? @map("published_at") @db.Timestamptz
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz

  @@unique([id, organizationId])
  @@index([publishedAt, createdAt])
}
```

Use explicit Prisma relation names and composite `[id, organizationId]`
references for session→task, task→execution, session→epoch,
session→policy-snapshot, session→conversation-event,
execution→conversation-event, event→outbox, and execution→usage.
`AgentExecution.sessionId` and `sessionTaskId` are required. Remove
`threadBindingId` and `interactionClass`. `AgentContextEpoch` stores
`sessionId`, epoch, optional boundary run ID, and validated handoff ref; it has
no class field. Outbox rows carry no copied payload; consumers load the
canonical event by composite organization relation.

Keep authority-profile identity as a string in this foundation; do not add the
full durable authority-profile model until the runtime plan requires it.

- [ ] **Step 4: Define the narrow repository port**

Use these central methods:

```typescript
export interface AuthorizeAgentExecutionInput {
  organizationId: string;
  userId: string;
  copilotThreadId: string;
  aguiRunId: string;
  agentVersionId: string;
  runtimeType: string;
  modelIdentity: string;
  authorityProfileVersionId: string;
  capabilityKeys: string[];
  policyHash: string;
  inputHash: string;
  userEvent: {
    externalEventId: string;
    schemaVersion: 1;
    payload: AgentUserMessageEventPayload;
  };
}

export interface AgentInteractionRepositoryPort {
  listActiveAgentVersions(): Promise<ActiveAgentVersionRecord[]>;
  findActiveAgentVersion(input: FindActiveAgentVersionInput): Promise<ActiveAgentVersionRecord | null>;
  listSessions(input: { organizationId: string; userId: string; limit: number }): Promise<AgentSessionRecord[]>;
  findAccessibleSession(input: { organizationId: string; userId: string; copilotThreadId: string }): Promise<AgentSessionRecord | null>;
  readConversationEvents(input: ReadConversationEventsInput): Promise<ConversationEventPage>;
  authorizeExecution(input: AuthorizeAgentExecutionInput): Promise<AuthorizedExecutionRecord>;
  appendExecutionEvent(input: AppendExecutionEventInput): Promise<AgentConversationEventRecord>;
  markExecutionTerminal(input: MarkAgentExecutionTerminalInput): Promise<void>;
  recordExecutionUsage(input: RecordAgentExecutionUsageInput): Promise<void>;
  probeHealth(): Promise<void>;
}
```

`authorizeExecution` owns the transaction and lock; no service receives a
transaction object or can accidentally perform writes outside it.
`appendExecutionEvent` owns sequence allocation, idempotent external event
comparison, event/outbox creation, and optional terminal reconciliation in one
transaction; callers never calculate the next sequence.

- [ ] **Step 5: Implement the transaction and idempotency rules**

Inside one Prisma transaction:

1. Acquire a transaction-scoped PostgreSQL advisory lock using a tagged query
   and domain-separated hash of serialized
   `[organizationId,userId,copilotThreadId]`.
2. Read the session by organization/thread and validate `createdByUserId`,
   lifecycle, and primary agent.
3. For a missing session, create session, root task (`isRoot=true`,
   `status='interpreting'`, `objective=null`), epoch 1, deterministic policy
   snapshot, execution, first user event at sequence 1, and its outbox row.
4. For an existing session, reuse its root task and create only the new policy
   snapshot/execution required by the run, increment `lastEventSequence`, and
   append the idempotent user event plus outbox row.
5. On exact `(organizationId,copilotThreadId,aguiRunId)` retry, compare all
   immutable inputs, including `inputHash`, external event ID, schema version,
   and canonical payload hash, and return the winner.
6. Translate any unique-race mismatch to `INTERACTION_RUN_CONFLICT`.

`readConversationEvents` validates organization/user/session ownership, reads
strictly after a decoded server-side cursor boundary, returns decimal-string
sequences in ascending order, and performs no writes. Cursor signing/decoding
stays in the application service so the repository never trusts browser
sequence input.

Never accept model identity from usage input as authority; compare it to the
execution and persist the execution's value.

- [ ] **Step 6: Format/generate and reach GREEN**

Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/kiditem \
  npx prisma format
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/kiditem \
  npx prisma generate
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: Prisma format/generate PASS and the real-PostgreSQL suite is GREEN.
Inspect schema formatting and revert unrelated formatter churn with a focused
patch rather than resetting user work.

- [ ] **Step 7: Run schema and compile gates**

```bash
npm run build --workspace=apps/server
npm run build --workspace=packages/shared
npm run db:erd
npm run check:schema-artifact-sync
npm run check:idor
npm run check:tenant-scope
```

Expected: all PASS; generated ERD changes only where the session graph changed.

- [ ] **Step 8: Commit the persistence reconstruction**

```bash
git add prisma/models/agents.prisma prisma/models/core.prisma \
  apps/server/src/agent-os/application/port/out/repository/agent-interaction-repository.port.ts \
  apps/server/src/agent-os/adapter/out/repository/prisma-agent-interaction.repository.ts \
  apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts \
  docs/ERD.md docs/erd
git commit -m "refactor: make interaction sessions canonical"
```

## Task 4: Reconstruct Signed Intent And Session Authorization

**Files:**

- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-interaction-identity.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-interaction-identity.service.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-interaction.tokens.ts`
- Delete: `apps/server/src/agent-os/application/service/__tests__/agent-thread-binding.service.spec.ts`
- Delete: `apps/server/src/agent-os/application/service/agent-thread-binding.service.ts`

- [ ] **Step 1: Write service RED tests before deleting binding code**

Add tests proving:

```typescript
expect(await service.bootstrap(identity)).toEqual({
  defaultAgentDefinitionKey: 'operator',
  agents: [expect.objectContaining({ agentDefinitionKey: 'operator', isDefault: true })],
  sessions: [],
});
expect(repository.authorizeExecution).not.toHaveBeenCalled();

const intent = await service.prepareRunIntent({
  ...identity,
  agentDefinitionKey: 'operator',
  copilotThreadId: 'thread-1',
  aguiRunId: 'run-1',
  dashboardContext,
  userEvent: {
    externalEventId: 'message-1',
    schemaVersion: 1,
    payload: { messageId: 'message-1', content: '재고 현황 알려줘' },
  },
});
expect(intent.expiresAt).toBe('2026-08-13T00:00:30.000Z');
expect(repository.authorizeExecution).not.toHaveBeenCalled();

const authorization = await service.authorizeRun({
  runIntent: intent.runIntent,
  copilotThreadId: 'thread-1',
  aguiRunId: 'run-1',
  dashboardContext,
  userEvent: {
    externalEventId: 'message-1',
    schemaVersion: 1,
    payload: { messageId: 'message-1', content: '재고 현황 알려줘' },
  },
});
expect(authorization.session.sessionId).toBe('session-1');
expect(authorization.sessionTaskId).toBe('task-1');
```

Add tamper, expiry, wrong thread/run/context, changed event ID/content/input
hash, policy/model change, inactive agent, missing/ambiguous default, wrong
user, archived session, read-only replay/connection, and health cases. The
gateway authorization input must not accept organization/user/agent/model/
policy as standalone trusted fields.

- [ ] **Step 2: Run the focused suite and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-interaction-identity.service.spec.ts
```

Expected: FAIL because the current service resolves pending/expired binding
targets and authorizes runs with null session/task IDs.

- [ ] **Step 3: Reduce tokens and implement canonical signing**

Retain:

```typescript
export const INTERACTION_CLOCK = Symbol('INTERACTION_CLOCK');
export const INTERACTION_GATEWAY_SHARED_SECRET = Symbol('INTERACTION_GATEWAY_SHARED_SECRET');
export const INTERACTION_PRINCIPAL_HMAC_KEY = Symbol('INTERACTION_PRINCIPAL_HMAC_KEY');
export const INTERACTION_RUN_INTENT_HMAC_KEY = Symbol('INTERACTION_RUN_INTENT_HMAC_KEY');
export const INTERACTION_REPLAY_CURSOR_HMAC_KEY = Symbol('INTERACTION_REPLAY_CURSOR_HMAC_KEY');
```

Delete the thread-ID HMAC provider. Rename preparation HMAC to run-intent HMAC
in code and environment documentation; do not keep an alias.

Canonical JSON claims contain version, organization/user, agent definition and
version, thread/run IDs, dashboard-context hash, policy hash, normalized user
event `inputHash`, and `expiresAtMs`. Sign with HMAC-SHA256 and verify signature
length before
`timingSafeEqual`. Reject expiry at `<= now`.

Replay cursors use a separate domain/key and canonical claims containing
version, organization ID, user ID, session ID, decimal `afterSequence`, and a
15-minute expiry. Connection authorization returns a separately domain-tagged
15-second live-join token bound to the same scope and replay
`lastSequence`. Both tokens are opaque, signed, repeatable only within their
short expiry, and cause no server write when verified.

- [ ] **Step 4: Implement bootstrap, prepare, authorize, connect**

- `bootstrap`: return one validated default agent and read-only recent session
  summaries from the repository; no target derivation and no write.
- `prepareRunIntent`: validate active allowed agent, explicit model/runtime,
  context, event envelope, and policy; hash canonical normalized input; return
  a 30-second token; no write.
- `authorizeRun`: verify/resubmit thread, run, context, event ID, schema, and
  canonical input hash; resolve the exact allowed version and policy; call
  `authorizeExecution`; return non-null session/task/execution authorization.
- `authorizeConnection`: call only `findAccessibleSession` and
  `readConversationEvents`, require active or allowed resumable lifecycle,
  verify/decode the opaque replay cursor, and return no execution or writes.
- `health`: verify registry and repository connectivity only.

Delete `AgentThreadBindingService` only after this focused suite is GREEN.

- [ ] **Step 5: Run focused tests and server build**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-interaction-identity.service.spec.ts
npm run build --workspace=apps/server
```

Expected: all tests PASS and no reference to the deleted binding service
remains.

- [ ] **Step 6: Commit identity reconstruction**

```bash
git add apps/server/src/agent-os/application/service
git commit -m "refactor: authorize session-backed interactions"
```

## Task 5: Align HTTP Boundaries And Nest Wiring

**Files:**

- Modify: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-control.controller.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/agent-interaction-bootstrap.controller.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/agent-interaction-control.controller.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/dto/agent-interaction.dto.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/interaction-gateway.guard.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `apps/server/vitest.config.ts`
- Modify: `apps/server/vitest.config.integration.ts`
- Modify: `docs/runbooks/environment-variables.md`

- [ ] **Step 1: Write HTTP and wiring RED tests**

Browser controller tests:

```typescript
expect(await bootstrapController.bootstrap(user, organizationId)).toEqual(
  expect.objectContaining({ agents: expect.any(Array), sessions: expect.any(Array) }),
);
expect(identity.bootstrap).toHaveBeenCalledWith({ organizationId, userId: user.id });

await bootstrapController.prepareRunIntent(user, organizationId, prepareDto);
expect(identity.prepareRunIntent).toHaveBeenCalledWith(expect.objectContaining({
  organizationId,
  userId: user.id,
}));
```

Gateway controller tests call `runs/authorize` with only run intent, thread/run
IDs, dashboard context, and the normalized user event; call
`connections/authorize` with thread ID plus optional opaque replay cursor; and
verify stable 400/401/403/409/503 mappings. Assert DTO whitelist strips or
rejects `organizationId`, `userId`, `modelIdentity`, `policySnapshotId`,
`sessionId`, and `capabilityKeys`.

Wiring tests assert exact controllers/providers and absence of
`AgentThreadBindingService` and `INTERACTION_THREAD_ID_HMAC_KEY`.

- [ ] **Step 2: Run controller/module suites and record RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-control.controller.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts
```

Expected: FAIL against the current thread-target and binding wiring.

- [ ] **Step 3: Implement the split HTTP authority**

- Browser-authenticated controller owns `GET bootstrap` and
  `POST runs/intent`.
- Service-authenticated controller owns `POST runs/authorize`,
  `POST connections/authorize` (including a bounded replay page), and health.
- The guard validates the dedicated secret in constant time. User-session
  presence is required where the request path actually carries the browser
  session; health is the only `SkipAuth` route.
- The controller derives organization/user only from decorators or verified
  run intent. Never accept them in DTOs.
- Zod errors map to `INTERACTION_REQUEST_INVALID`; token invalid/expired to
  401; ownership to 403; immutable mismatch/race to 409; configuration or
  repository failure to 503.

If the separate gateway does not forward a user cookie to authorization, the
control controller must derive actor solely from the verified token inside the
service, and its guard must require only the service credential. Encode that
choice in the tests; do not require both incompatible identity mechanisms.

- [ ] **Step 4: Align providers and environment names**

Register the identity service, repository adapter, guard, clock, gateway
secret, principal HMAC, run-intent HMAC, and replay-cursor HMAC exactly once.
Remove binding and thread-ID HMAC providers. Document:

```text
INTERACTION_GATEWAY_SHARED_SECRET
INTERACTION_PRINCIPAL_HMAC_KEY
INTERACTION_RUN_INTENT_HMAC_KEY
INTERACTION_REPLAY_CURSOR_HMAC_KEY
```

Each secret is at least 32 bytes; no default is permitted outside tests.

- [ ] **Step 5: Reach focused GREEN and compile**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-control.controller.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
```

Expected: all PASS.

- [ ] **Step 6: Commit HTTP and module wiring**

```bash
git add apps/server/src/agent-os/adapter/in/http \
  apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts \
  apps/server/src/agent-os/agent-os.module.ts \
  apps/server/vitest.config.ts apps/server/vitest.config.integration.ts \
  docs/runbooks/environment-variables.md
git commit -m "feat: expose session interaction control"
```

## Task 6: Add The Retired-Lifecycle Regression Gate

**Files:**

- Create: `scripts/check-agent-interaction-lifecycle.mjs`
- Create: `scripts/__tests__/check-agent-interaction-lifecycle.test.mjs`
- Modify: `package.json`
- Modify: `scripts/README.md`
- Modify: `scripts/check-script-inventory.mjs`

- [ ] **Step 1: Write scanner inventory and fixture RED tests**

Use temporary fixture roots to prove failures for each exact retired source
identifier and success for ordinary prose:

```javascript
for (const forbidden of [
  "'quick_ask'",
  'QuickAskScope',
  'AgentInteractionThreadBinding',
  'idleExpiresAt',
  'withQuickAskLock',
  'AgentSessionPromotion',
  'interactionClass:',
]) {
  await expectScannerFailure(forbidden);
}
await expectScannerSuccess('session creation requires capability policy');
```

Add the script to the inventory expectations before creating the script so
the first inventory run fails.

- [ ] **Step 2: Run and record RED**

```bash
npm run test:scripts -- --runInBand
npm run check:scripts-inventory
```

Expected: FAIL because the scanner entrypoint is absent.

- [ ] **Step 3: Implement the scanner**

Scan active production source, shared contracts, Prisma schema, and tests that
encode current contracts. Exclude:

- documentation and plans, which intentionally name retired concepts while
  explaining their removal;
- Git history and generated dependency directories; and
- archived evidence explicitly listed by exact path.

Also parse `prisma/models/agents.prisma` and fail when `AgentExecution`
declares nullable `sessionId` or `sessionTaskId`.

- [ ] **Step 4: Run scanner gates**

```bash
npm run test:scripts
npm run check:scripts-inventory
npm run check:agent-interaction-lifecycle
npm run check:conventions
```

Expected: all PASS.

- [ ] **Step 5: Commit the durable guard**

```bash
git add package.json scripts/check-agent-interaction-lifecycle.mjs \
  scripts/__tests__/check-agent-interaction-lifecycle.test.mjs \
  scripts/README.md scripts/check-script-inventory.mjs
git commit -m "chore: guard single interaction lifecycle"
```

## Task 7: Foundation Acceptance And Boot

**Files:**

- Modify if generated: `docs/ERD.md`
- Modify if generated: `docs/erd/**`
- Verify all Task 1–6 files

- [ ] **Step 1: Run the complete focused test set**

```bash
npm exec --workspace=packages/shared vitest -- run src/agent-interaction/index.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/application/service/__tests__/agent-interaction-identity.service.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts \
  src/agent-os/adapter/in/http/__tests__/agent-interaction-control.controller.spec.ts \
  src/agent-os/__tests__/agent-os.module.wiring.spec.ts
npm exec --workspace=apps/server vitest -- run \
  src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.pg.integration.spec.ts \
  --config vitest.config.integration.ts
```

Expected: all PASS with a real isolated PostgreSQL schema push.

- [ ] **Step 2: Run finite repository gates**

```bash
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
npm run build --workspace=packages/templates
npx prisma generate
npm run db:erd
npm run check:schema-artifact-sync
npm run check:shared-root-imports
npm run check:shared-interface-names
npm run check:copilotkit-train
npm run check:idor
npm run check:tenant-scope
npm run check:agent-interaction-lifecycle
npm run check:conventions
```

Expected: every command exits 0.

- [ ] **Step 3: Apply the schema to a disposable database and boot Nest**

Start a disposable PostgreSQL 17 container, export its explicit
`DATABASE_URL`, run:

```bash
npm run db:push
PORT=4013 WEB_ORIGIN=http://localhost:3000 npm run dev:server
```

Expected: schema push exits 0; Nest reports zero TypeScript errors,
`AgentOsModule dependencies initialized`, `Nest application successfully
started`, and `Server running on http://localhost:4013`. Stop the server and
remove the disposable container.

- [ ] **Step 4: Self-review scope and release decision**

```bash
git diff --check
git status --short
git diff --stat 9a87dd273f573fcc046052b1eeb73c76e0444abd..HEAD
rg -n "quick_ask|QuickAsk|idleExpiresAt|withQuickAskLock|AgentSessionPromotion|interactionClass" \
  packages/shared/src/agent-interaction prisma/models/agents.prisma \
  apps/server/src/agent-os scripts
```

Expected: no retired lifecycle match in active implementation, no unrelated
work, and release decision remains compatible `db:push`, no backfill, VERSION
`0.1.30`.

- [ ] **Step 5: Commit only generated acceptance artifacts if needed**

```bash
git add docs/ERD.md docs/erd
git diff --cached --quiet || git commit -m "docs: sync interaction session schema"
```

Do not create an empty commit. Plan 1 is complete only after the worktree
contains no unclassified pre-plan implementation files.
