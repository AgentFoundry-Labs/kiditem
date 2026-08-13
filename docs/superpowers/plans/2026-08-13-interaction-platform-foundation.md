# Interaction Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a supported, exact-pinned CopilotKit/AG-UI platform, canonical thread binding, and dedicated Interaction Gateway that can retain and resume a read-only Operator probe without KidItem transcript storage.

**Architecture:** Enterprise Intelligence owns CopilotKit threads and events in an isolated platform plane. A new stateless `apps/interaction-gateway` workspace exposes CopilotKit Runtime v2 at `/api/copilotkit`, discovers authorized agents from NestJS, and forwards AG-UI to a Nest AgentOS endpoint; Nest derives the principal from the existing opaque session and persists only thread/execution control records. This plan intentionally stops at a read-only probe so it is independently testable before product UI and durable work are added.

**Tech Stack:** Node.js 22, TypeScript, CopilotKit Runtime 1.67.1 candidate, CopilotKit React Core 1.67.1 candidate, AG-UI client/core 0.0.57 candidate, NestJS, Prisma/PostgreSQL, Enterprise Intelligence, Redis, Kubernetes 1.28+, Helm 3.12+, PostgreSQL 14+, Redis 7+, Vitest, Docker Compose

## Global Constraints

- The global constraints and stop conditions in [the execution index](./2026-08-13-copilotkit-native-interaction-os-index.md) apply to every task.
- CopilotKit packages must all resolve to exact `1.67.1` and AG-UI packages to exact `0.0.57` before the candidate train is accepted.
- A support/version proof must clear the documented self-host URL discrepancy before product adoption.
- `apps/interaction-gateway` has no Prisma, `pg`, business-domain, or local-runtime dependency.
- The browser never supplies trusted organization, authority, permissions, agent allowlists, or Enterprise Intelligence identity.
- AgentOS stores external thread IDs and execution correlation only; no message body, assistant response, or transcript event is persisted in KidItem.
- The local opaque-session authentication contract remains authoritative for KidItem users; production Enterprise Intelligence administration uses OIDC.
- The fork is a clean mirror/patch queue and never a branch-based KidItem dependency.
- No legacy API is deleted in this plan; a scanner prevents new usage while the replacement is proven.

---

## File Map

| Path | Responsibility |
|---|---|
| `docs/references/copilotkit-platform-matrix.md` | Supported-version evidence, support answers, fork status, proof results |
| `deploy/interaction-intelligence/platform-lock.json` | Machine-readable exact train and infrastructure floors |
| `scripts/check-copilotkit-train.mjs` | Reject mixed or ranged CopilotKit/AG-UI dependencies |
| `scripts/__tests__/check-copilotkit-train.test.mjs` | Version-lock regression tests |
| `packages/shared/src/agent-interaction/index.ts` | Shared Zod contracts for discovery, binding, context, and AG-UI correlation |
| `prisma/models/agents.prisma` | Thread binding, context epoch, version, policy snapshot, execution foundation |
| `apps/server/src/agent-os/application/port/out/repository/agent-interaction-repository.port.ts` | Persistence boundary for interaction control records |
| `apps/server/src/agent-os/adapter/out/repository/prisma-agent-interaction.repository.ts` | Organization-scoped Prisma implementation |
| `apps/server/src/agent-os/application/service/agent-interaction-identity.service.ts` | Principal and allowed-agent projection |
| `apps/server/src/agent-os/application/service/agent-thread-binding.service.ts` | Quick Ask binding and four-hour rotation transaction |
| `apps/server/src/agent-os/adapter/in/http/agent-interaction-control.controller.ts` | Private principal/discovery/binding endpoints |
| `apps/server/src/agent-os/adapter/in/http/agent-os-agui.controller.ts` | Authorized AG-UI probe endpoint |
| `apps/interaction-gateway/src/*` | Stateless CopilotKit runtime, auth bridge, dynamic agent factory, health |
| `deploy/interaction-intelligence/*` | Helm values, secret contract, smoke and recovery commands |
| `deploy/office/compose.office.yml` | Gateway service in the product release bundle |
| `deploy/office/nginx.conf` | Same-origin `/api/copilotkit` routing |
| `apps/web/next.config.mjs` and `apps/web/src/proxy.ts` | Local same-origin transport route |
| `docs/ARCHITECTURE.md` | Top-level ownership and deployment topology |
| `docs/runbooks/environment-variables.md` | Exact environment contract |
| `docs/runbooks/deployment-architecture.md` | Product-plane/platform-plane deployment boundary |

## Task 1: Prove And Lock The Supported Platform Train

**Files:**
- Create: `deploy/interaction-intelligence/platform-lock.json`
- Create: `docs/references/copilotkit-platform-matrix.md`
- Create: `scripts/check-copilotkit-train.mjs`
- Create: `scripts/__tests__/check-copilotkit-train.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: CopilotKit Enterprise support entitlement; canonical upstream and `AgentFoundry-Labs/CopilotKit` fork.
- Produces: `loadPlatformLock(rootDir): PlatformLock` and `assertCopilotKitTrain(rootDir, lock): void`; every later task consumes the locked package and infrastructure versions.

- [ ] **Step 1: Capture fork ancestry and supported distribution evidence**

Run:

```bash
gh api repos/AgentFoundry-Labs/CopilotKit/compare/CopilotKit:main...main \
  --jq '{status, ahead_by, behind_by, merge_base: .merge_base_commit.sha}'
npm view @copilotkit/runtime@1.67.1 dependencies --json
npm view @copilotkit/react-core@1.67.1 version --json
npm view @ag-ui/client@0.0.57 version --json
```

Expected: the fork has no commits ahead of upstream; runtime `1.67.1` resolves AG-UI `0.0.57`; both registry versions exist. Paste the date, output, Enterprise distribution version, support case URL, license decision, self-host URL proof, and public reconnect/HITL API proof into `docs/references/copilotkit-platform-matrix.md`. If support cannot confirm all proofs, invoke the index stop condition and do not continue.

- [ ] **Step 2: Write the failing train-checker tests**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPackageTrain } from '../check-copilotkit-train.mjs';

const lock = {
  copilotKit: '1.67.1',
  agUi: '0.0.57',
};

test('accepts one exact CopilotKit and AG-UI train', () => {
  assert.doesNotThrow(() => assertPackageTrain({
    '@copilotkit/react-core': '1.67.1',
    '@copilotkit/runtime': '1.67.1',
    '@ag-ui/client': '0.0.57',
    '@ag-ui/core': '0.0.57',
  }, lock));
});

test('rejects ranges and mixed versions', () => {
  assert.throws(
    () => assertPackageTrain({
      '@copilotkit/react-core': '^1.67.1',
      '@copilotkit/runtime': '1.66.2',
      '@ag-ui/client': '0.0.57',
    }, lock),
    /must equal exact locked version/,
  );
});

test('rejects the removed v1 React UI package', () => {
  assert.throws(
    () => assertPackageTrain({ '@copilotkit/react-ui': '1.67.1' }, lock),
    /removed from the v2 train/,
  );
});
```

- [ ] **Step 3: Run the checker test and verify it fails**

Run: `node --test scripts/__tests__/check-copilotkit-train.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/check-copilotkit-train.mjs`.

- [ ] **Step 4: Implement the lock and checker**

`deploy/interaction-intelligence/platform-lock.json`:

```json
{
  "copilotKit": "1.67.1",
  "agUi": "0.0.57",
  "enterpriseChart": "0.10.23",
  "node": ">=22 <23",
  "kubernetes": ">=1.28",
  "helm": ">=3.12",
  "postgresql": ">=14",
  "redis": ">=7",
  "fork": "AgentFoundry-Labs/CopilotKit",
  "upstream": "CopilotKit/CopilotKit"
}
```

`scripts/check-copilotkit-train.mjs`:

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertPackageTrain(dependencies, lock) {
  if (dependencies['@copilotkit/react-ui'] !== undefined) {
    throw new Error('@copilotkit/react-ui is removed from the v2 train');
  }
  const expected = new Map([
    ['@copilotkit/react-core', lock.copilotKit],
    ['@copilotkit/runtime', lock.copilotKit],
    ['@ag-ui/client', lock.agUi],
    ['@ag-ui/core', lock.agUi],
  ]);
  for (const [name, version] of Object.entries(dependencies)) {
    const locked = expected.get(name);
    if (locked && version !== locked) {
      throw new Error(`${name} must equal exact locked version ${locked}; received ${version}`);
    }
  }
}

export function loadPlatformLock(rootDir) {
  return JSON.parse(fs.readFileSync(
    path.join(rootDir, 'deploy/interaction-intelligence/platform-lock.json'),
    'utf8',
  ));
}

export function checkWorkspace(rootDir) {
  const lock = loadPlatformLock(rootDir);
  for (const relativePath of ['package.json', 'apps/web/package.json', 'apps/server/package.json', 'apps/interaction-gateway/package.json']) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    assertPackageTrain({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.overrides }, lock);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkWorkspace(process.cwd());
  console.log('CopilotKit/AG-UI train matches platform lock');
}
```

Add `"check:copilotkit-train": "node scripts/check-copilotkit-train.mjs"` to root `package.json` scripts.

- [ ] **Step 5: Run the focused test**

Run: `node --test scripts/__tests__/check-copilotkit-train.test.mjs`

Expected: 3 tests pass.

- [ ] **Step 6: Commit the proof and lock**

```bash
git add deploy/interaction-intelligence/platform-lock.json docs/references/copilotkit-platform-matrix.md scripts/check-copilotkit-train.mjs scripts/__tests__/check-copilotkit-train.test.mjs package.json
git commit -m "chore: lock interaction platform train"
```

## Task 2: Define Focused Interaction Contracts

**Files:**
- Create: `packages/shared/src/agent-interaction/index.ts`
- Create: `packages/shared/src/agent-interaction/index.spec.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`

**Interfaces:**
- Consumes: exact train from Task 1.
- Produces: `InteractionPrincipalSchema`, `AllowedAgentSchema`, `InteractionThreadTargetSchema`, `InteractionBootstrapSchema`, `InteractionClassSchema`, `ThreadBindingSchema`, `DashboardContextSchema`, `AguiRunPreparationSchema`, `AguiRunAuthorizationSchema`, `AguiConnectionAuthorizationSchema`, and their inferred types through `@kiditem/shared/agent-interaction`.

- [ ] **Step 1: Write contract tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  AguiConnectionAuthorizationSchema,
  AguiRunPreparationSchema,
  AguiRunAuthorizationSchema,
  DashboardContextSchema,
  InteractionBootstrapSchema,
  InteractionPrincipalSchema,
} from './index';

describe('agent interaction contracts', () => {
  it('strips browser authority and rejects raw organization scope', () => {
    const context = DashboardContextSchema.parse({
      routeKey: 'analytics.dashboard',
      resourceRefs: [{ kind: 'product', id: 'product-1', version: '7' }],
      visibleRowIds: ['product-1'],
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      organizationId: 'attacker-org',
      permissions: ['admin'],
    });
    expect(context).not.toHaveProperty('organizationId');
    expect(context).not.toHaveProperty('permissions');
  });

  it('requires server-derived principal and explicit runtime/model', () => {
    expect(InteractionPrincipalSchema.parse({
      principalKey: 'ei_4a8f9', userId: 'user-1', organizationId: 'org-1',
    }).organizationId).toBe('org-1');
    expect(() => AguiRunAuthorizationSchema.parse({ interactionClass: 'quick_ask' })).toThrow();
    expect(() => AguiRunPreparationSchema.parse({ copilotThreadId: 'forged' })).toThrow();
    expect(() => AguiConnectionAuthorizationSchema.parse({
      interactionClass: 'quick_ask', contextEpoch: 1,
    })).toThrow();
  });

  it('requires one server-selected default and a thread target per allowed agent', () => {
    expect(InteractionBootstrapSchema.parse({
      defaultAgentDefinitionKey: 'operator',
      agents: [{
        agentDefinitionKey: 'operator', agentVersionId: 'v1', displayName: 'Operator',
        description: 'KidItem operator', isDefault: true, supportsQuickAsk: true,
      }],
      threadTargets: [{
        agentDefinitionKey: 'operator', agentVersionId: 'v1',
        copilotThreadId: '550e8400-e29b-41d4-a716-446655440000',
        hasExplicitThreadId: false, interactionClass: 'quick_ask', refreshAt: null,
      }],
    }).threadTargets).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npx vitest run packages/shared/src/agent-interaction/index.spec.ts`

Expected: FAIL because `packages/shared/src/agent-interaction/index.ts` does not exist.

- [ ] **Step 3: Implement the schemas**

```typescript
import { z } from 'zod';

export const InteractionClassSchema = z.enum(['quick_ask', 'official_task']);
export type InteractionClass = z.infer<typeof InteractionClassSchema>;

export const InteractionPrincipalSchema = z.object({
  principalKey: z.string().min(8),
  userId: z.string().min(1),
  organizationId: z.string().min(1),
}).strict();

export const AllowedAgentSchema = z.object({
  agentDefinitionKey: z.string().min(1),
  agentVersionId: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  isDefault: z.boolean(),
  supportsQuickAsk: z.boolean(),
}).strict();

export const InteractionThreadTargetSchema = z.object({
  agentDefinitionKey: z.string().min(1),
  agentVersionId: z.string().min(1),
  copilotThreadId: z.string().uuid(),
  hasExplicitThreadId: z.boolean(),
  interactionClass: InteractionClassSchema,
  refreshAt: z.string().datetime().nullable(),
}).strict();

export const InteractionBootstrapSchema = z.object({
  defaultAgentDefinitionKey: z.string().min(1),
  agents: z.array(AllowedAgentSchema).min(1),
  threadTargets: z.array(InteractionThreadTargetSchema).min(1),
}).strict().superRefine((value, context) => {
  const defaults = value.agents.filter((agent) => agent.isDefault);
  if (defaults.length !== 1 || defaults[0].agentDefinitionKey !== value.defaultAgentDefinitionKey) {
    context.addIssue({ code: 'custom', message: 'bootstrap requires exactly one matching default agent' });
  }
  const targetKeys = new Set(value.threadTargets.map((target) => target.agentDefinitionKey));
  if (
    value.threadTargets.length !== value.agents.length
    || targetKeys.size !== value.agents.length
    || value.agents.some((agent) => !targetKeys.has(agent.agentDefinitionKey))
  ) {
    context.addIssue({ code: 'custom', message: 'bootstrap requires exactly one target per allowed agent' });
  }
});

export const CanonicalResourceRefSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
  version: z.string().min(1).nullable(),
}).strict();

export const DashboardContextSchema = z.object({
  routeKey: z.string().min(1),
  resourceRefs: z.array(CanonicalResourceRefSchema).max(50).default([]),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
  visibleRowIds: z.array(z.string().min(1)).max(100).default([]),
  aggregateSummary: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(1).max(64),
});

export const ThreadBindingSchema = z.object({
  id: z.string().min(1),
  copilotThreadId: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  agentVersionId: z.string().min(1),
  interactionClass: InteractionClassSchema,
  lifecycle: z.enum(['active', 'archived', 'deleted', 'legal_hold']),
  idleExpiresAt: z.string().datetime().nullable(),
  contextEpoch: z.number().int().positive(),
}).strict();

export const AgentCorrelationSchema = z.object({
  copilotThreadId: z.string().min(1),
  aguiRunId: z.string().min(1),
  executionId: z.string().min(1),
  sessionId: z.string().min(1).nullable(),
  taskId: z.string().min(1).nullable(),
  operationsRunId: z.string().min(1).nullable(),
}).strict();

export const AguiRunAuthorizationSchema = z.object({
  binding: ThreadBindingSchema,
  interactionClass: InteractionClassSchema,
  modelIdentity: z.string().min(1),
  runtimeType: z.string().min(1),
  policySnapshotId: z.string().min(1),
  dashboardContext: DashboardContextSchema,
}).strict();

export const AguiThreadArchiveCommandSchema = z.object({
  threadId: z.string().uuid(),
  userId: z.string().min(8),
  agentId: z.string().min(1),
}).strict();

export const AguiRunPreparationSchema = z.object({
  preparationToken: z.string().min(32),
  expiresAt: z.string().datetime(),
  copilotThreadId: z.string().uuid(),
  archive: AguiThreadArchiveCommandSchema.nullable(),
}).strict();

export const AguiConnectionAuthorizationSchema = z.object({
  binding: ThreadBindingSchema,
  interactionClass: InteractionClassSchema,
  contextEpoch: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (
    value.binding.interactionClass !== value.interactionClass
    || value.binding.contextEpoch !== value.contextEpoch
  ) {
    context.addIssue({ code: 'custom', message: 'connection authorization must match its binding' });
  }
});

export type InteractionPrincipal = z.infer<typeof InteractionPrincipalSchema>;
export type AllowedAgent = z.infer<typeof AllowedAgentSchema>;
export type InteractionThreadTarget = z.infer<typeof InteractionThreadTargetSchema>;
export type InteractionBootstrap = z.infer<typeof InteractionBootstrapSchema>;
export type ThreadBinding = z.infer<typeof ThreadBindingSchema>;
export type DashboardContext = z.infer<typeof DashboardContextSchema>;
export type AgentCorrelation = z.infer<typeof AgentCorrelationSchema>;
export type AguiRunPreparation = z.infer<typeof AguiRunPreparationSchema>;
export type AguiRunAuthorization = z.infer<typeof AguiRunAuthorizationSchema>;
export type AguiConnectionAuthorization = z.infer<typeof AguiConnectionAuthorizationSchema>;
```

Expose only `./agent-interaction` in `exports`, `typesVersions`, and the matching `tsup` entry; do not add these contracts to `packages/shared/src/index.ts`.

- [ ] **Step 4: Run focused and package gates**

Run:

```bash
npx vitest run packages/shared/src/agent-interaction/index.spec.ts
npm run build --workspace=packages/shared
npm run check:shared-root-imports
```

Expected: focused tests pass, shared build exits 0, and the root-import scanner reports no violation.

- [ ] **Step 5: Commit the focused contract**

```bash
git add packages/shared/src/agent-interaction packages/shared/package.json packages/shared/tsup.config.ts
git commit -m "feat: define agent interaction contracts"
```

## Task 3: Add Transcript-Free AgentOS Control Persistence

**Files:**
- Modify: `prisma/models/agents.prisma`
- Create: `apps/server/src/agent-os/application/port/out/repository/agent-interaction-repository.port.ts`
- Modify: `apps/server/src/agent-os/application/port/out/repository/index.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/prisma-agent-interaction.repository.ts`
- Create: `apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`

**Interfaces:**
- Consumes: `ThreadBinding` and `InteractionClass` from Task 2.
- Produces: `AGENT_INTERACTION_REPOSITORY`, `AgentInteractionRepositoryPort.findActiveQuickAsk`, `createQuickAskBinding`, `archiveBinding`, `createExecution`, and `markExecutionTerminal`.

- [ ] **Step 1: Write repository contract tests**

```typescript
import { describe, expect, it } from 'vitest';
import type { AgentInteractionRepositoryPort } from '../../application/port/out/repository/agent-interaction-repository.port';

function exerciseContract(repository: AgentInteractionRepositoryPort) {
  it('finds an active Quick Ask only inside the full scope', async () => {
    await repository.createQuickAskBinding({
      id: 'binding-1', copilotThreadId: 'thread-external', organizationId: 'org-1',
      userId: 'user-1', agentVersionId: 'version-1', idleExpiresAt: new Date('2026-08-13T08:00:00Z'),
    });
    expect(await repository.findActiveQuickAsk({
      organizationId: 'org-2', userId: 'user-1', agentVersionId: 'version-1',
    })).toBeNull();
  });

  it('does not expose a transcript write method', () => {
    expect(repository).not.toHaveProperty('createMessage');
    expect(repository).not.toHaveProperty('appendEvent');
  });
}

describe('AgentInteractionRepositoryPort', () => exerciseContract(createTestRepository()));
```

Use the repository test harness already used by `agent-os-repository.pg.integration.spec.ts` to supply `createTestRepository`; do not add a second Prisma bootstrap.

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.spec.ts`

Expected: FAIL because the port and adapter are missing.

- [ ] **Step 3: Add the additive schema**

Add immutable version/control models with `String` state fields and mapped indexes:

```prisma
model AgentVersion {
  id                 String   @id @default(uuid()) @db.Uuid
  agentDefinitionKey String
  version            Int
  displayName        String
  description        String
  runtimeType        String
  modelIdentity      String
  capabilityKeys     Json
  policyDocument     Json
  activatedAt        DateTime?
  retiredAt          DateTime?
  createdAt          DateTime @default(now())

  threadBindings AgentInteractionThreadBinding[]
  executions     AgentExecution[]

  @@unique([agentDefinitionKey, version])
  @@index([agentDefinitionKey, activatedAt])
}

model AgentInteractionThreadBinding {
  id               String   @id @default(uuid()) @db.Uuid
  organizationId   String   @db.Uuid
  userId           String   @db.Uuid
  copilotThreadId  String   @unique
  agentVersionId   String   @db.Uuid
  interactionClass String
  lifecycle        String   @default("active")
  contextEpoch     Int      @default(1)
  idleExpiresAt    DateTime?
  archivedAt       DateTime?
  deletedAt        DateTime?
  legalHoldAt      DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  user         User         @relation(fields: [userId], references: [id])
  agentVersion AgentVersion @relation(fields: [agentVersionId], references: [id])
  epochs       AgentContextEpoch[]
  executions   AgentExecution[]

  @@index([organizationId, userId, agentVersionId, interactionClass, lifecycle])
  @@index([organizationId, copilotThreadId])
}

model AgentContextEpoch {
  id                   String   @id @default(uuid()) @db.Uuid
  threadBindingId      String   @db.Uuid
  epoch                Int
  interactionClass     String
  boundaryAguiRunId    String?
  validatedHandoffRef String?
  createdAt            DateTime @default(now())

  threadBinding AgentInteractionThreadBinding @relation(fields: [threadBindingId], references: [id], onDelete: Cascade)

  @@unique([threadBindingId, epoch])
}

model AgentPolicySnapshot {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  agentVersionId String   @db.Uuid
  authorityClass String
  capabilityKeys Json
  policyHash     String
  createdAt      DateTime @default(now())

  @@index([organizationId, agentVersionId, createdAt])
}

model AgentExecution {
  id               String   @id @default(uuid()) @db.Uuid
  organizationId   String   @db.Uuid
  threadBindingId  String   @db.Uuid
  copilotThreadId  String
  aguiRunId         String
  sessionId         String?  @db.Uuid
  sessionTaskId     String?  @db.Uuid
  interactionClass String
  agentVersionId   String   @db.Uuid
  runtimeType       String
  modelIdentity     String
  policySnapshotId String   @db.Uuid
  attempt           Int      @default(1)
  status            String
  startedAt         DateTime @default(now())
  finishedAt        DateTime?
  errorCode         String?

  threadBinding AgentInteractionThreadBinding @relation(fields: [threadBindingId], references: [id])
  agentVersion  AgentVersion                  @relation(fields: [agentVersionId], references: [id])
  usage         AgentExecutionUsage[]

  @@unique([organizationId, copilotThreadId, aguiRunId])
  @@index([organizationId, sessionId, status])
}

model AgentExecutionUsage {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  executionId    String   @db.Uuid
  modelIdentity  String
  provider       String
  inputTokens    Int
  outputTokens   Int
  costMicros     BigInt
  currency       String   @default("USD")
  recordedAt     DateTime @default(now())
  execution      AgentExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([organizationId, executionId, recordedAt])
}
```

Add relation fields to `Organization` and `User` in their owning models with names matching Prisma validation. Create a registered migration through the repository release-train procedure; do not hand-author production SQL outside that procedure.

- [ ] **Step 4: Define and implement the port**

```typescript
export const AGENT_INTERACTION_REPOSITORY = Symbol('AGENT_INTERACTION_REPOSITORY');

export interface AgentInteractionTransactionPort {
  findActiveQuickAsk(scope: {
    organizationId: string; userId: string; agentVersionId: string;
  }): Promise<ThreadBinding | null>;
  createQuickAskBinding(input: {
    id?: string; copilotThreadId: string; organizationId: string; userId: string;
    agentVersionId: string; idleExpiresAt: Date;
  }): Promise<ThreadBinding>;
  archiveBinding(scope: { organizationId: string; id: string; archivedAt: Date }): Promise<void>;
}

export interface AgentInteractionRepositoryPort {
  findActiveQuickAsk(scope: {
    organizationId: string; userId: string; agentVersionId: string;
  }): Promise<ThreadBinding | null>;
  createQuickAskBinding(input: {
    id?: string; copilotThreadId: string; organizationId: string; userId: string;
    agentVersionId: string; idleExpiresAt: Date;
  }): Promise<ThreadBinding>;
  archiveBinding(scope: { organizationId: string; id: string; archivedAt: Date }): Promise<void>;
  withQuickAskLock<T>(
    scope: { organizationId: string; userId: string; agentVersionId: string },
    work: (transaction: AgentInteractionTransactionPort) => Promise<T>,
  ): Promise<T>;
  createExecution(input: {
    organizationId: string; threadBindingId: string; copilotThreadId: string;
    aguiRunId: string; interactionClass: 'quick_ask' | 'official_task';
    agentVersionId: string; runtimeType: string; modelIdentity: string;
    policySnapshotId: string; sessionId: string | null; sessionTaskId: string | null;
  }): Promise<{ id: string }>;
  markExecutionTerminal(scope: {
    organizationId: string; id: string; status: 'completed' | 'failed' | 'cancelled';
    errorCode: string | null; finishedAt: Date;
  }): Promise<void>;
  recordExecutionUsage(input: {
    organizationId: string; executionId: string; modelIdentity: string; provider: string;
    inputTokens: number; outputTokens: number; costMicros: bigint; currency: 'USD';
  }): Promise<void>;
}
```

The adapter must include `organizationId` in every update/read where it is available, map external IDs as opaque strings, and implement `withQuickAskLock` with a transaction-scoped PostgreSQL advisory lock derived from the full organization/user/agent scope. Add an explicit partial unique migration for one `active` `quick_ask` binding per `(organizationId, userId, agentVersionId)` following `prisma/AGENTS.md`; the lock is the normal path and the constraint is the final race guard.

- [ ] **Step 5: Run schema and repository gates**

Run:

```bash
npm run db:push
npx prisma generate
npx vitest run apps/server/src/agent-os/adapter/out/repository/__tests__/prisma-agent-interaction.repository.spec.ts
npm run check:idor
npm run check:tenant-scope
```

Expected: schema/generation exit 0; repository tests pass; tenancy scanners report no new violation.

- [ ] **Step 6: Commit the additive persistence slice**

```bash
git add prisma apps/server/src/agent-os/application/port/out/repository apps/server/src/agent-os/adapter/out/repository apps/server/src/agent-os/agent-os.module.ts
git commit -m "feat: add interaction control persistence"
```

## Task 4: Add The Server-Derived Principal And Thread Binding API

**Files:**
- Create: `apps/server/src/agent-os/application/service/agent-interaction-identity.service.ts`
- Create: `apps/server/src/agent-os/application/service/agent-thread-binding.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-thread-binding.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/dto/agent-interaction.dto.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-interaction-bootstrap.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-interaction-control.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-control.controller.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `docs/runbooks/environment-variables.md`

**Interfaces:**
- Consumes: `AGENT_INTERACTION_REPOSITORY`, `@CurrentUser()`, `@CurrentOrganization()`, agent definition registry, Task 2 schemas.
- Produces: browser-safe `GET /api/agent-os/interaction/bootstrap`; private `GET /api/agent-os/interaction/principal`, `GET /api/agent-os/interaction/agents`, `POST /api/agent-os/interaction/runs/prepare`, `POST /api/agent-os/interaction/runs/authorize`, and `POST /api/agent-os/interaction/connections/authorize`. Private calls require both the user session and `X-KidItem-Interaction-Gateway` credential.

- [ ] **Step 1: Write lazy-target and four-hour rotation tests**

```typescript
import { describe, expect, it } from 'vitest';

describe('AgentThreadBindingService', () => {
  it('returns the same unpersisted pending target to concurrent tabs', async () => {
    const repository = createRepositoryDouble(null);
    const service = createService(repository, new Date('2026-08-13T08:00:01Z'));
    const input = {
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      agentDefinitionKey: 'operator',
      agentVersionId: '00000000-0000-4000-8000-000000000003',
    };
    const [left, right] = await Promise.all([
      service.resolveTarget(input),
      service.resolveTarget(input),
    ]);
    expect(left).toEqual(right);
    expect(left.hasExplicitThreadId).toBe(false);
    expect(repository.createQuickAskBinding).not.toHaveBeenCalled();
  });

  it('archives an expired binding and creates the supplied Enterprise thread', async () => {
    const repository = createRepositoryDouble({
      id: '00000000-0000-4000-8000-000000000004',
      copilotThreadId: '00000000-0000-4000-8000-000000000005', lifecycle: 'active',
      idleExpiresAt: '2026-08-13T04:00:00.000Z',
    });
    const service = createService(repository, new Date('2026-08-13T08:00:01Z'));
    const target = await service.resolveTarget({
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      agentDefinitionKey: 'operator',
      agentVersionId: '00000000-0000-4000-8000-000000000003',
    });
    const result = await service.bindQuickAsk({
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      agentDefinitionKey: 'operator',
      agentVersionId: '00000000-0000-4000-8000-000000000003',
      copilotThreadId: target.copilotThreadId,
    });
    expect(repository.archiveBinding).toHaveBeenCalledWith(expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000004',
    }));
    expect(result.binding.copilotThreadId).toBe(target.copilotThreadId);
    expect(result.archivedCopilotThreadId).toBe('00000000-0000-4000-8000-000000000005');
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-thread-binding.service.spec.ts`

Expected: FAIL because `AgentThreadBindingService` is missing.

- [ ] **Step 3: Implement principal projection and binding transaction**

```typescript
const QUICK_ASK_IDLE_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class AgentThreadBindingService {
  constructor(
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly repository: AgentInteractionRepositoryPort,
    @Inject(INTERACTION_CLOCK) private readonly now: () => Date,
    @Inject(INTERACTION_THREAD_ID_HMAC_KEY) private readonly threadIdHmacKey: Buffer,
  ) {}

  async resolveTarget(input: QuickAskTargetInput): Promise<InteractionThreadTarget> {
    const active = await this.repository.findActiveQuickAsk(input);
    if (active?.idleExpiresAt && new Date(active.idleExpiresAt) > this.now()) {
      return {
        agentDefinitionKey: input.agentDefinitionKey,
        agentVersionId: active.agentVersionId,
        copilotThreadId: active.copilotThreadId,
        hasExplicitThreadId: true,
        interactionClass: active.interactionClass,
        refreshAt: active.idleExpiresAt,
      };
    }
    return {
      agentDefinitionKey: input.agentDefinitionKey,
      agentVersionId: input.agentVersionId,
      copilotThreadId: hmacUuid(
        this.threadIdHmacKey,
        `${input.organizationId}:${input.userId}:${input.agentVersionId}:${active?.id ?? 'initial'}`,
      ),
      hasExplicitThreadId: false,
      interactionClass: 'quick_ask',
      refreshAt: null,
    };
  }

  async bindQuickAsk(input: BindQuickAskInput): Promise<BindQuickAskResult> {
    return this.repository.withQuickAskLock(input, async (transaction) => {
      const now = this.now();
      const active = await transaction.findActiveQuickAsk(input);
      if (active?.idleExpiresAt && new Date(active.idleExpiresAt) > now) {
        if (active.copilotThreadId !== input.copilotThreadId) {
          throw new ConflictException('ACTIVE_QUICK_ASK_THREAD_MISMATCH');
        }
        return { binding: active, archivedCopilotThreadId: null };
      }
      const expectedThreadId = hmacUuid(
        this.threadIdHmacKey,
        `${input.organizationId}:${input.userId}:${input.agentVersionId}:${active?.id ?? 'initial'}`,
      );
      if (input.copilotThreadId !== expectedThreadId) {
        throw new ConflictException('STALE_QUICK_ASK_THREAD_TARGET');
      }
      if (active) {
        await transaction.archiveBinding({ organizationId: input.organizationId, id: active.id, archivedAt: now });
      }
      const binding = await transaction.createQuickAskBinding({
        ...input,
        idleExpiresAt: new Date(now.getTime() + QUICK_ASK_IDLE_MS),
      });
      return { binding, archivedCopilotThreadId: active?.copilotThreadId ?? null };
    });
  }
}
```

`hmacUuid` takes the first 16 bytes of HMAC-SHA256, applies RFC 4122 version/variant bits, and formats a UUID without persisting anything. This makes the pre-first-message target stable across tabs while Enterprise Intelligence still creates no thread until the run. An active Quick Ask target returns `refreshAt=idleExpiresAt`; pending and official targets return `null`. The web disables its composer at that server timestamp until bootstrap refetch returns the next deterministic target, preventing a panel left open across expiry from submitting to the archived thread. `AgentInteractionIdentityService` computes `principalKey` as `ei_` plus base64url HMAC-SHA256 over `${organizationId}:${userId}` using `INTERACTION_PRINCIPAL_HMAC_KEY`, returns only active allowed `AgentVersion` rows, makes Operator the single `isDefault: true` row, and throws `AGENT_MODEL_NOT_CONFIGURED` when its explicit model identity is absent. `INTERACTION_THREAD_ID_HMAC_KEY` is a separate required secret.

- [ ] **Step 4: Add browser bootstrap and guarded private control**

```typescript
@Controller('agent-os/interaction')
export class AgentInteractionBootstrapController {
  @Get('bootstrap')
  async bootstrap(@CurrentUser() user: AuthUser, @CurrentOrganization() organizationId: string) {
    const agents = await this.identity.listAllowedAgents({ userId: user.id, organizationId });
    const threadTargets = await Promise.all(agents.map((agent) => this.bindings.resolveTarget({
      userId: user.id,
      organizationId,
      agentDefinitionKey: agent.agentDefinitionKey,
      agentVersionId: agent.agentVersionId,
    })));
    return InteractionBootstrapSchema.parse({
      defaultAgentDefinitionKey: agents.find((agent) => agent.isDefault)?.agentDefinitionKey,
      agents,
      threadTargets,
    });
  }
}

@Controller('agent-os/interaction')
@UseGuards(InteractionGatewayGuard)
export class AgentInteractionControlController {
  @Get('principal')
  principal(@CurrentUser() user: AuthUser, @CurrentOrganization() organizationId: string) {
    return this.identity.resolvePrincipal({ userId: user.id, organizationId });
  }

  @Get('agents')
  agents(@CurrentUser() user: AuthUser, @CurrentOrganization() organizationId: string) {
    return this.identity.listAllowedAgents({ userId: user.id, organizationId });
  }

  @Post('runs/prepare')
  async prepareRun(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() dto: PrepareInteractionRunDto,
  ) {
    return this.identity.prepareRun({
      userId: user.id,
      organizationId,
      agentDefinitionKey: dto.agentDefinitionKey,
      copilotThreadId: dto.copilotThreadId,
      aguiRunId: dto.aguiRunId,
      dashboardContext: DashboardContextSchema.parse(dto.dashboardContext),
    });
  }

  @Post('runs/authorize')
  async authorizeRun(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() dto: AuthorizeInteractionRunDto,
  ) {
    return this.identity.authorizeRun({
      userId: user.id,
      organizationId,
      preparationToken: dto.preparationToken,
      agentDefinitionKey: dto.agentDefinitionKey,
      copilotThreadId: dto.copilotThreadId,
      aguiRunId: dto.aguiRunId,
      dashboardContext: DashboardContextSchema.parse(dto.dashboardContext),
    });
  }

  @Post('connections/authorize')
  async authorizeConnection(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() dto: AuthorizeInteractionConnectionDto,
  ) {
    return this.identity.authorizeConnection({
      userId: user.id,
      organizationId,
      agentDefinitionKey: dto.agentDefinitionKey,
      copilotThreadId: dto.copilotThreadId,
    });
  }
}
```

`prepareRun` is read-only. It resolves the server-authorized principal and version, validates the normalized dashboard-context hash and pending/current thread target, and returns a 30-second HMAC-signed preparation token. The token binds `organizationId`, `userId`, `agentDefinitionKey`, `agentVersionId`, `copilotThreadId`, `aguiRunId`, the canonical dashboard-context hash, the observed predecessor binding ID, and expiry. When the predecessor is expired it also returns an Enterprise Intelligence archive command `{ threadId, userId: principalKey, agentId: agentDefinitionKey }`. The gateway must execute that command before calling `authorizeRun`.

`AgentInteractionIdentityService.authorizeRun` verifies the token and resubmitted canonical fields, then reacquires the scoped advisory lock. Under that lock it accepts either the token's same expired predecessor or the exact target already activated by a concurrent request, calls `bindQuickAsk` idempotently, and creates one policy/execution authorization per `(organizationId, copilotThreadId, aguiRunId)`. A crash after Enterprise Intelligence archive but before database binding is safe: archive is idempotent, bootstrap continues to derive the same target, and the next prepare repeats the same archive command. No capability or model call may begin before authorization completes.

`authorizeConnection` is a separate read-only path. It accepts only an existing, active, non-expired binding owned by the server-derived principal and returns `AguiConnectionAuthorization`; it does not create or rotate a binding, policy snapshot, `AgentExecution`, model call, or Operations run. A pending target is not connectable until its first run binds it. Consequently opening the panel, reading thread history, reconnecting, and replaying an active thread remain control-plane reads.

Add `GET /api/agent-os/interaction/health`, decorated with the repository's `@SkipAuth()` and guarded by `InteractionGatewayGuard`, returning only `{ status: 'ok' }` after the AgentOS version registry and database respond. `InteractionGatewayGuard` compares the header to `INTERACTION_GATEWAY_SHARED_SECRET` with `timingSafeEqual`, rejects missing user session on principal, agent, prepare, run-authorization, and connection-authorization routes, and never accepts organization or permissions in the body/header. The bootstrap controller relies on the existing global `OrganizationScopeGuard` and accepts no organization input. Document `INTERACTION_GATEWAY_SHARED_SECRET`, `INTERACTION_PRINCIPAL_HMAC_KEY`, `INTERACTION_THREAD_ID_HMAC_KEY`, and the separate `INTERACTION_PREPARATION_HMAC_KEY` as required production secrets with no defaults.

- [ ] **Step 5: Run controller, binding, and security gates**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-thread-binding.service.spec.ts apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-bootstrap.controller.spec.ts apps/server/src/agent-os/adapter/in/http/__tests__/agent-interaction-control.controller.spec.ts
npm run check:idor
npm run check:tenant-scope
```

Expected: tests pass; prepare is read-only; connection authorization creates no binding/execution/policy row; cross-organization/body-supplied scope cases return 403 or ignore the body field; and scanners exit 0.

- [ ] **Step 6: Commit the identity bridge**

```bash
git add apps/server/src/agent-os docs/runbooks/environment-variables.md
git commit -m "feat: derive interaction identity on server"
```

## Task 5: Build The Dedicated CopilotKit Interaction Gateway

**Files:**
- Create: `apps/interaction-gateway/AGENTS.md`
- Create: `apps/interaction-gateway/package.json`
- Create: `apps/interaction-gateway/tsconfig.json`
- Create: `apps/interaction-gateway/tsconfig.build.json`
- Create: `apps/interaction-gateway/Dockerfile`
- Create: `apps/interaction-gateway/src/config.ts`
- Create: `apps/interaction-gateway/src/nest-control-client.ts`
- Create: `apps/interaction-gateway/src/authorized-agent-os-http-agent.ts`
- Create: `apps/interaction-gateway/src/runtime.ts`
- Create: `apps/interaction-gateway/src/server.ts`
- Create: `apps/interaction-gateway/src/__tests__/runtime.spec.ts`
- Modify: `package-lock.json`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/server/package.json`

**Interfaces:**
- Consumes: Task 4 prepare/run/connection control APIs, CopilotKit Runtime v2, Enterprise Intelligence thread archival, and AG-UI `RunAgentInput`.
- Produces: same-origin CopilotKit runtime under `/api/copilotkit`, `GET /health/live`, `GET /health/ready`, and `AuthorizedAgentOsHttpAgent` that archives an expired predecessor before authorizing a run while keeping reconnect read-only.

- [ ] **Step 1: Write authorization, archive-order, and reconnect tests**

```typescript
import { HttpAgent } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { lastValueFrom, type Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizedAgentOsHttpAgent } from '../authorized-agent-os-http-agent';
import { resolveAuthorizedAgents } from '../runtime';

describe('interaction gateway runtime', () => {
  it('advertises only server-authorized agents and forwards no browser scope headers', async () => {
    const control = createControlClientDouble({
      principal: { principalKey: 'ei_4a8f9f21', userId: 'user-1', organizationId: 'org-1' },
      agents: [{ agentDefinitionKey: 'operator', agentVersionId: 'v1', displayName: 'Operator', description: 'KidItem operator', isDefault: true, supportsQuickAsk: true }],
    });
    const agents = await resolveAuthorizedAgents(new Request('http://gateway/api/copilotkit/info', {
      headers: { cookie: 'kiditem_session=opaque', 'x-organization-id': 'attacker-org' },
    }), {
      control,
      intelligence: createIntelligenceDouble(),
      agentOsBaseUrl: 'http://api:3001/api/agent-os/ag-ui',
      licenseToken: 'test-license-token',
    });
    expect(Object.keys(agents)).toEqual(['operator']);
    expect(control.lastHeaders()).toEqual({ cookie: 'kiditem_session=opaque' });
  });

  it('archives the expired Enterprise thread before run authorization and AG-UI dispatch', async () => {
    const calls: string[] = [];
    const control = createControlClientDouble({
      prepareRun: async () => {
        calls.push('prepare');
        return {
          preparationToken: 'p'.repeat(32),
          expiresAt: '2026-08-13T08:00:30.000Z',
          copilotThreadId: '550e8400-e29b-41d4-a716-446655440001',
          archive: {
            threadId: '550e8400-e29b-41d4-a716-446655440000',
            userId: 'ei_4a8f9f21',
            agentId: 'operator',
          },
        };
      },
      authorizeRun: async () => {
        calls.push('authorize-run');
        return quickAskAuthorization();
      },
    });
    const intelligence = createIntelligenceDouble({
      archiveThread: async () => { calls.push('archive-enterprise-thread'); },
    });
    vi.spyOn(HttpAgent.prototype, 'run').mockImplementation(() => {
      calls.push('dispatch-agui-run');
      return of({ type: 'RUN_FINISHED' } as BaseEvent);
    });
    const agent = createAuthorizedAgent({ control, intelligence });

    await lastValueFrom(agent.run(runInput()));

    expect(calls).toEqual([
      'prepare',
      'archive-enterprise-thread',
      'authorize-run',
      'dispatch-agui-run',
    ]);
  });

  it('reconnects through read-only connection authorization', async () => {
    const control = createControlClientDouble({
      authorizeConnection: vi.fn(async () => activeConnectionAuthorization()),
      prepareRun: vi.fn(),
      authorizeRun: vi.fn(),
    });
    const httpAgentPrototype = HttpAgent.prototype as unknown as {
      connect(input: RunAgentInput): Observable<BaseEvent>;
    };
    vi.spyOn(httpAgentPrototype, 'connect').mockImplementation(
      () => of({ type: 'RUN_FINISHED' } as BaseEvent),
    );
    const agent = createAuthorizedAgent({ control, intelligence: createIntelligenceDouble() });

    await lastValueFrom((
      agent as unknown as { connect(input: RunAgentInput): Observable<BaseEvent> }
    ).connect(runInput()));

    expect(control.authorizeConnection).toHaveBeenCalledOnce();
    expect(control.prepareRun).not.toHaveBeenCalled();
    expect(control.authorizeRun).not.toHaveBeenCalled();
  });
});
```

Keep `createAuthorizedAgent`, `runInput`, and the control/Intelligence doubles in this spec file. They instantiate the real adapter with valid UUIDs and schema-valid authorization objects; no production-only alternate dispatch path is added.

- [ ] **Step 2: Run the gateway test and verify failure**

Run: `npm test --workspace=apps/interaction-gateway -- src/__tests__/runtime.spec.ts`

Expected: npm reports that workspace `apps/interaction-gateway` does not exist.

- [ ] **Step 3: Scaffold the exact-pinned workspace**

`apps/interaction-gateway/package.json`:

```json
{
  "name": "@kiditem/interaction-gateway",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@ag-ui/client": "0.0.57",
    "@ag-ui/core": "0.0.57",
    "@copilotkit/runtime": "1.67.1",
    "@kiditem/shared": "*",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^4.1.2"
  }
}
```

Pin `@copilotkit/react-core` to `1.67.1` in web, remove `@copilotkit/react-ui`, move runtime ownership out of server by removing `@copilotkit/runtime` there after Task 6 migrates the probe route, add exact root overrides for the two CopilotKit and two AG-UI packages, then run `npm install`. The lockfile must contain one version for each train.

- [ ] **Step 4: Implement the control client and dynamic agents**

```typescript
import { HttpAgent, type HttpAgentConfig } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { CopilotKitIntelligence, CopilotRuntime } from '@copilotkit/runtime/v2';
import { defer, type Observable, switchMap } from 'rxjs';
import {
  AguiConnectionAuthorizationSchema,
  AguiRunPreparationSchema,
  AguiRunAuthorizationSchema,
  AllowedAgentSchema,
  DashboardContextSchema,
  InteractionPrincipalSchema,
  type AguiConnectionAuthorization,
  type AguiRunPreparation,
  type AguiRunAuthorization,
  type AllowedAgent,
  type DashboardContext,
  type InteractionPrincipal,
} from '@kiditem/shared/agent-interaction';

export class NestControlClient {
  private observedHeaders: Record<string, string> = {};
  constructor(private readonly baseUrl: string, private readonly serviceSecret: string) {}

  private headers(request: Request): Headers {
    const headers = new Headers({ 'x-kiditem-interaction-gateway': this.serviceSecret });
    const cookie = request.headers.get('cookie');
    if (cookie) headers.set('cookie', cookie);
    this.observedHeaders = Object.fromEntries([...headers].filter(([key]) => key !== 'x-kiditem-interaction-gateway'));
    return headers;
  }

  async principal(request: Request): Promise<InteractionPrincipal> {
    const response = await fetch(`${this.baseUrl}/api/agent-os/interaction/principal`, { headers: this.headers(request) });
    if (!response.ok) throw new Error(`INTERACTION_PRINCIPAL_FAILED:${response.status}`);
    return InteractionPrincipalSchema.parse(await response.json());
  }

  async agents(request: Request): Promise<AllowedAgent[]> {
    const response = await fetch(`${this.baseUrl}/api/agent-os/interaction/agents`, { headers: this.headers(request) });
    if (!response.ok) throw new Error(`AGENT_DISCOVERY_FAILED:${response.status}`);
    return AllowedAgentSchema.array().parse(await response.json());
  }

  async prepareRun(request: Request, input: {
    agentDefinitionKey: string; copilotThreadId: string; aguiRunId: string;
    dashboardContext: DashboardContext;
  }): Promise<AguiRunPreparation> {
    const response = await fetch(`${this.baseUrl}/api/agent-os/interaction/runs/prepare`, {
      method: 'POST',
      headers: new Headers({ ...Object.fromEntries(this.headers(request)), 'content-type': 'application/json' }),
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`AGENT_RUN_PREPARATION_FAILED:${response.status}`);
    return AguiRunPreparationSchema.parse(await response.json());
  }

  async authorizeRun(request: Request, input: {
    preparationToken: string; agentDefinitionKey: string; copilotThreadId: string;
    aguiRunId: string; dashboardContext: DashboardContext;
  }): Promise<AguiRunAuthorization> {
    const response = await fetch(`${this.baseUrl}/api/agent-os/interaction/runs/authorize`, {
      method: 'POST',
      headers: new Headers({ ...Object.fromEntries(this.headers(request)), 'content-type': 'application/json' }),
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`AGENT_RUN_AUTHORIZATION_FAILED:${response.status}`);
    return AguiRunAuthorizationSchema.parse(await response.json());
  }

  async authorizeConnection(request: Request, input: {
    agentDefinitionKey: string; copilotThreadId: string;
  }): Promise<AguiConnectionAuthorization> {
    const response = await fetch(`${this.baseUrl}/api/agent-os/interaction/connections/authorize`, {
      method: 'POST',
      headers: new Headers({ ...Object.fromEntries(this.headers(request)), 'content-type': 'application/json' }),
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`AGENT_CONNECTION_AUTHORIZATION_FAILED:${response.status}`);
    return AguiConnectionAuthorizationSchema.parse(await response.json());
  }

  lastHeaders() { return this.observedHeaders; }
}

const SAFE_RECONNECT_CONTEXT: DashboardContext = {
  routeKey: 'unknown',
  resourceRefs: [],
  filters: {},
  visibleRowIds: [],
  aggregateSummary: {},
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
};

function dashboardContext(input: RunAgentInput): DashboardContext {
  const state = input.state && typeof input.state === 'object'
    ? input.state as Record<string, unknown>
    : {};
  const candidate = state.kiditemDashboardContext;
  return DashboardContextSchema.parse(
    candidate && typeof candidate === 'object'
      ? { ...SAFE_RECONNECT_CONTEXT, ...candidate }
      : SAFE_RECONNECT_CONTEXT,
  );
}

type AuthorizedAgentConfig = HttpAgentConfig & {
  request: Request;
  control: NestControlClient;
  intelligence: CopilotKitIntelligence;
  agentDefinitionKey: string;
};

export class AuthorizedAgentOsHttpAgent extends HttpAgent {
  constructor(private readonly authorized: AuthorizedAgentConfig) {
    const {
      request: _request,
      control: _control,
      intelligence: _intelligence,
      agentDefinitionKey: _key,
      ...httpConfig
    } = authorized;
    super(httpConfig);
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    const runRequest = {
      agentDefinitionKey: this.authorized.agentDefinitionKey,
      copilotThreadId: input.threadId,
      aguiRunId: input.runId,
      dashboardContext: dashboardContext(input),
    };
    return defer(async () => {
      const preparation = await this.authorized.control.prepareRun(
        this.authorized.request,
        runRequest,
      );
      if (preparation.copilotThreadId !== input.threadId) {
        throw new Error('PREPARED_THREAD_MISMATCH');
      }
      if (preparation.archive) {
        await this.authorized.intelligence.archiveThread(preparation.archive);
      }
      return this.authorized.control.authorizeRun(this.authorized.request, {
        ...runRequest,
        preparationToken: preparation.preparationToken,
      });
    }).pipe(switchMap((authorization) => super.run({
      ...input,
      forwardedProps: { ...input.forwardedProps, kiditemAuthorization: authorization },
    })));
  }

  protected connect(input: RunAgentInput): Observable<BaseEvent> {
    return defer(() => this.authorized.control.authorizeConnection(this.authorized.request, {
      agentDefinitionKey: this.authorized.agentDefinitionKey,
      copilotThreadId: input.threadId,
    })).pipe(switchMap((authorization) => super.connect({
      ...input,
      forwardedProps: { ...input.forwardedProps, kiditemConnectionAuthorization: authorization },
    })));
  }
}

export type GatewayDependencies = {
  control: NestControlClient;
  intelligence: CopilotKitIntelligence;
  agentOsBaseUrl: string;
  licenseToken: string;
};

export async function resolveAuthorizedAgents(request: Request, deps: GatewayDependencies) {
  const allowed = await deps.control.agents(request);
  if (allowed.length === 0) throw new Error('NO_AUTHORIZED_AGENT');
  return Object.fromEntries(
    allowed.map((agent) => [
      agent.agentDefinitionKey,
      new AuthorizedAgentOsHttpAgent({
        agentId: agent.agentDefinitionKey,
        description: agent.description,
        url: `${deps.agentOsBaseUrl}/${encodeURIComponent(agent.agentDefinitionKey)}`,
        request,
        control: deps.control,
        intelligence: deps.intelligence,
        agentDefinitionKey: agent.agentDefinitionKey,
      }),
    ]),
  );
}

export function createGatewayRuntime(deps: GatewayDependencies) {
  return new CopilotRuntime({
    agents: async ({ request }) => resolveAuthorizedAgents(request, deps),
    intelligence: deps.intelligence,
    licenseToken: deps.licenseToken,
    generateThreadNames: false,
    identifyUser: async (request) => {
      const principal = await deps.control.principal(request);
      return { id: principal.principalKey, name: principal.principalKey };
    },
  });
}
```

`GatewayDependencies` includes the control client, AgentOS AG-UI base URL, one required `CopilotKitIntelligence` instance built from the three non-defaulted Enterprise values `enterpriseApiUrl`, `enterpriseWsUrl`, and `enterpriseApiKey`, and the signed self-hosted `licenseToken`. The same Intelligence instance owns both transcript transport and `archiveThread`. Construct control-plane headers from only the opaque KidItem session cookie plus the private service credential. `CopilotKitIntelligence` is always present, `generateThreadNames` is disabled to avoid an undeclared model call, and `identifyUser` uses only the HMAC-derived `principalKey`; SSE/in-memory runtime mode is forbidden outside isolated unit tests.

The run path is strictly prepare → optional Enterprise archive → authorize → AG-UI dispatch. The reconnect path invokes only `connections/authorize` → `super.connect`, so panel open/reconnect cannot create `AgentExecution` or rotate a binding. Archive failure stops before Nest authorization and model dispatch. The adapter uses only the public `HttpAgent.run`/`connect` extension points and public `CopilotKitIntelligence.archiveThread` proved in the platform matrix. Do not copy the browser's authorization, `x-organization-id`, role, permission, model, or runtime headers. If exact `1.67.1` does not expose these supported extension points, stop under the platform-proof condition instead of patching private internals.

- [ ] **Step 5: Implement the Node listener and health contract**

Use the approved CopilotKit Node/Fetch adapter so the runtime natively serves `/info`, `/agent/:id/run`, `/connect`, and `/stop/:threadId` beneath `/api/copilotkit`. `GET /health/ready` must call the service-only Nest health endpoint and Enterprise Intelligence readiness; it returns 503 if either dependency is unavailable.

```typescript
const server = createServer(async (request, response) => {
  if (request.url === '/health/live') return sendJson(response, 200, { status: 'ok' });
  if (request.url === '/health/ready') return readiness.handle(response);
  return copilotHandler(request, response);
});

server.listen(config.port, config.host, () => {
  logger.info({ port: config.port }, 'interaction gateway ready');
});
```

`readiness.handle` calls the private Nest `GET /api/agent-os/interaction/health` endpoint with the service credential and the supported Enterprise Intelligence readiness endpoint. Validate required environment values at startup: `INTERACTION_GATEWAY_PORT`, `KIDITEM_API_INTERNAL_URL`, `INTERACTION_GATEWAY_SHARED_SECRET`, `COPILOTKIT_ENTERPRISE_API_URL`, `COPILOTKIT_ENTERPRISE_WS_URL`, `COPILOTKIT_ENTERPRISE_API_KEY`, `COPILOTKIT_LICENSE_TOKEN`, and `COPILOTKIT_TELEMETRY_DISABLED=1`. Missing values, an HTTP/WSS scheme mismatch, or any other telemetry value terminates startup with an enumerated error; no URL, token, or in-memory fallback is permitted outside the test config factory.

- [ ] **Step 6: Run gateway package and dependency gates**

Run:

```bash
npm test --workspace=apps/interaction-gateway -- src/__tests__/runtime.spec.ts
npm run build --workspace=apps/interaction-gateway
npm run check:copilotkit-train
npm ls @copilotkit/runtime @copilotkit/react-core @ag-ui/client @ag-ui/core
```

Expected: tests/build/checker pass; `npm ls` shows only CopilotKit `1.67.1` and AG-UI `0.0.57`, with no ranged workspace declaration.

- [ ] **Step 7: Commit the gateway**

```bash
git add apps/interaction-gateway apps/web/package.json apps/server/package.json package.json package-lock.json
git commit -m "feat: add dedicated interaction gateway"
```

## Task 6: Add A Read-Only AG-UI AgentOS Probe

**Files:**
- Create: `apps/server/src/agent-os/application/port/in/agent-agui-runner.port.ts`
- Create: `apps/server/src/agent-os/application/service/agent-agui-run.service.ts`
- Create: `apps/server/src/agent-os/application/service/__tests__/agent-agui-run.service.spec.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/agent-os-agui.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-os-agui.controller.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/src/app.module.ts`

**Interfaces:**
- Consumes: gateway-authorized `RunAgentInput`, Task 3 execution repository, Task 4 principal, explicit Operator version/model/runtime.
- Produces: `POST /api/agent-os/ag-ui/:agentDefinitionKey` streaming AG-UI; foundation supports only `quick_ask` and the single read-only capability `agent_os.platform_probe`.

- [ ] **Step 1: Write the fail-closed run test**

```typescript
describe('AgentAguiRunService', () => {
  it('rejects missing model and never creates a session', async () => {
    const service = createService({ modelIdentity: null });
    await expect(service.start(probeRunInput())).rejects.toMatchObject({ code: 'AGENT_MODEL_NOT_CONFIGURED' });
    expect(service.executionRepository.createExecution).not.toHaveBeenCalled();
  });

  it('normalizes probe output as ordered AG-UI events', async () => {
    const events = await collect(createService().start(probeRunInput()));
    expect(events.map((event) => event.type)).toEqual([
      'RUN_STARTED', 'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', 'RUN_FINISHED',
    ]);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-agui-run.service.spec.ts`

Expected: FAIL because `AgentAguiRunService` does not exist.

- [ ] **Step 3: Implement the probe execution**

```typescript
export interface AgentAguiRunInput {
  principal: InteractionPrincipal;
  authorization: AguiRunAuthorization;
  threadId: string;
  runId: string;
  agentDefinitionKey: string;
}

@Injectable()
export class AgentAguiRunService {
  async *start(input: AgentAguiRunInput): AsyncIterable<BaseEvent> {
    this.assertQuickAskProbe(input.authorization);
    const execution = await this.executions.createExecution({
      organizationId: input.principal.organizationId,
      threadBindingId: input.authorization.binding.id,
      copilotThreadId: input.threadId,
      aguiRunId: input.runId,
      interactionClass: 'quick_ask',
      agentVersionId: input.authorization.binding.agentVersionId,
      runtimeType: input.authorization.runtimeType,
      modelIdentity: input.authorization.modelIdentity,
      policySnapshotId: input.authorization.policySnapshotId,
      sessionId: null,
      sessionTaskId: null,
    });
    yield { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId };
    yield* this.probePresenter.present(execution.id, 'Operator 연결 및 읽기 전용 정책을 확인했습니다.');
    await this.executions.markExecutionTerminal({
      organizationId: input.principal.organizationId,
      id: execution.id,
      status: 'completed', errorCode: null, finishedAt: new Date(),
    });
    yield { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId };
  }
}
```

The controller must stream `text/event-stream`, abort the iterator on Quick Ask stop, normalize exceptions to `RUN_ERROR`, and never serialize a runtime/provider-specific event. Reject official-task input, mutation capability keys, mismatched thread IDs, and mismatched agent versions.

- [ ] **Step 4: Remove the raw CopilotKit handler from Nest**

Delete only the `/api/chat/copilot` Express pre-handler and `@copilotkit/runtime` construction from `apps/server/src/main.ts`. Keep `ChatModule` and `/api/chat` temporarily because Plan 4 owns guarded deletion. Verify Nest has no runtime route collision and server still boots.

- [ ] **Step 5: Run focused tests and boot**

Run:

```bash
npx vitest run apps/server/src/agent-os/application/service/__tests__/agent-agui-run.service.spec.ts apps/server/src/agent-os/adapter/in/http/__tests__/agent-os-agui.controller.spec.ts
npm run dev:server
```

Expected: tests pass; Nest reaches the normal ready log with `/api/agent-os/ag-ui/:agentDefinitionKey` registered once and no `/api/chat/copilot` raw handler. Stop the watch process after confirmation.

- [ ] **Step 6: Commit the AG-UI probe**

```bash
git add apps/server/src/agent-os apps/server/src/main.ts apps/server/src/app.module.ts apps/server/package.json
git commit -m "feat: expose read-only agentos ag-ui probe"
```

## Task 7: Deploy Enterprise Intelligence And Route Same-Origin Traffic

**Files:**
- Create: `deploy/interaction-intelligence/README.md`
- Create: `deploy/interaction-intelligence/values-local.yaml`
- Create: `deploy/interaction-intelligence/values-office.yaml`
- Create: `deploy/interaction-intelligence/smoke-thread.mjs`
- Create: `deploy/interaction-intelligence/__tests__/values.spec.mjs`
- Modify: `deploy/office/compose.office.yml`
- Modify: `deploy/office/nginx.conf`
- Modify: `deploy/office/office.env.example`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/src/proxy.ts`
- Modify: `docs/runbooks/deployment-architecture.md`

**Interfaces:**
- Consumes: supported Enterprise Intelligence chart from Task 1; gateway image/health from Task 5.
- Produces: `/api/copilotkit/*` same-origin route; isolated EI Helm release; restart/replay smoke proof.

- [ ] **Step 1: Write deploy contract tests**

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'yaml';

test('production values require external HA stores and OIDC', () => {
  const values = yaml.parse(fs.readFileSync('deploy/interaction-intelligence/values-office.yaml', 'utf8'));
  assert.equal(values.postgresql.enabled, false);
  assert.equal(values['redis-subchart'].enabled, false);
  assert.equal(values.migrations.enabled, true);
  assert.equal(values.auth.existingSecret, 'cpki-auth');
  assert.match(values.auth.issuer, /^https:\/\//);
  assert.equal(values.appFrontend.telemetry.enabled, false);
  assert.deepEqual(
    values.appApi.env.find(({ name }) => name === 'COPILOTKIT_TELEMETRY_DISABLED'),
    { name: 'COPILOTKIT_TELEMETRY_DISABLED', value: '1' },
  );
  assert.equal(
    values.appApi.env.find(({ name }) => name === 'COPILOTKIT_LICENSE_TOKEN').valueFrom.secretKeyRef.name,
    'cpki-license',
  );
});

test('office ingress sends only CopilotKit transport to the gateway', () => {
  const nginx = fs.readFileSync('deploy/office/nginx.conf', 'utf8');
  assert.match(nginx, /location \/api\/copilotkit\/.*interaction-gateway/);
  assert.doesNotMatch(nginx, /location \/api\/agent-os.*interaction-gateway/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test deploy/interaction-intelligence/__tests__/values.spec.mjs`

Expected: FAIL because the values and test paths do not exist.

- [ ] **Step 3: Add supported Helm values**

`values-office.yaml` must configure the exact supported chart version recorded in the matrix, external PostgreSQL and Redis secret references, migrations enabled, three API and realtime replicas, pod disruption budgets, topology spread, resource requests/limits, OIDC issuer/client secret references, TLS ingress, network policy, persistent backup integration, and telemetry disabled. Secret values must appear only as Kubernetes secret key references.

The minimum enforced shape is:

```yaml
postgresql:
  enabled: false
database:
  host: postgres.internal.kiditem.kr
  port: 5432
  name: intelligence
  existingSecret: cpki-db
redis:
  host: redis.internal.kiditem.kr
  port: 6379
  tls: true
  existingSecret: cpki-redis
redis-subchart:
  enabled: false
migrations:
  enabled: true
auth:
  deploymentMode: hosted
  issuer: https://identity.kiditem.kr/application/o/copilotkit/
  existingSecret: cpki-auth
appApi:
  replicaCount: 3
  env:
    - name: COPILOTKIT_TELEMETRY_DISABLED
      value: '1'
    - name: COPILOTKIT_LICENSE_TOKEN
      valueFrom:
        secretKeyRef:
          name: cpki-license
          key: license-token
appFrontend:
  telemetry:
    enabled: false
realtimeGateway:
  enabled: true
  replicaCount: 3
ingress:
  enabled: true
  ui:
    host: intelligence.kiditem.kr
  api:
    host: intelligence-api.kiditem.kr
  realtimePlane:
    host: intelligence-realtime.kiditem.kr
  websocket:
    enabled: true
  tls:
    - secretName: kiditem-intelligence-tls
      hosts:
        - intelligence.kiditem.kr
        - intelligence-api.kiditem.kr
        - intelligence-realtime.kiditem.kr
```

`values-local.yaml` may use single replicas and evaluation-only dependencies, but must be labeled non-production in `README.md`. Never promote bundled evaluation Keycloak credentials to Office.

- [ ] **Step 4: Add gateway service and same-origin routes**

Add `interaction-gateway` to `compose.office.yml` with immutable `${INTERACTION_GATEWAY_IMAGE}@${INTERACTION_GATEWAY_DIGEST}`, `COPILOTKIT_TELEMETRY_DISABLED=1`, secret-backed `COPILOTKIT_LICENSE_TOKEN`, read-only filesystem, non-root user, private API network, health check `/health/ready`, and no direct database network. Route `/api/copilotkit/` in nginx to the gateway with buffering disabled and SSE-safe timeouts; all other `/api/` traffic remains on Nest. Record the telemetry flag, secret input, and build-time `NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY` in the appropriate environment examples; gateway startup fails when telemetry is not exactly `1` in every non-test environment, and web build fails when the public license key is absent.

For local Next development replace the old `/api/chat/copilot` rewrite/bypass with `/api/copilotkit`; proxy middleware must bypass only that transport prefix and must not make `/api/agent-os` public without normal auth.

- [ ] **Step 5: Implement restart/replay smoke**

`smoke-thread.mjs` must:

1. authenticate with `INTERACTION_SMOKE_SESSION_COOKIE`;
2. load bootstrap and `/api/copilotkit/info` without sending a message, then assert zero bindings, executions, sessions, Operations runs, and transcript rows;
3. start the foundation probe through `/api/copilotkit` and record thread/run IDs;
4. invoke the documented test-environment gateway rollout restart command supplied as `INTERACTION_GATEWAY_RESTART_COMMAND` only in the isolated environment;
5. reconnect to the same thread and assert the execution count does not change;
6. advance the isolated clock past four hours, submit to the next deterministic target, and assert Enterprise Intelligence archive occurs before the replacement execution authorization;
7. assert ordered events, one `RUN_FINISHED` per submitted run, the expected thread rotation, and no dispatch when archive is forced to fail;
8. query the test database control endpoint and assert no `AgentSession` and no message row was created.

The script must refuse to run unless `INTERACTION_SMOKE_ENVIRONMENT=isolated` and the base URL is not a production hostname.

- [ ] **Step 6: Run deployment tests and isolated smoke**

Run:

```bash
node --test deploy/interaction-intelligence/__tests__/values.spec.mjs
helm template kiditem-ei oci://ghcr.io/copilotkit/charts/intelligence \
  --version "$(node -p "require('./deploy/interaction-intelligence/platform-lock.json').enterpriseChart")" \
  -f deploy/interaction-intelligence/values-office.yaml >/dev/null
node deploy/interaction-intelligence/smoke-thread.mjs
```

Expected: chart `0.10.23` from the locked candidate renders successfully after support approval; tests/template/smoke exit 0; replay contains one ordered terminal run and the KidItem transcript/session count remains zero. If support does not approve that exact chart with the locked package train, invoke the global stop condition and refresh the plan instead of changing one version in isolation.

- [ ] **Step 7: Commit deployment foundation**

```bash
git add deploy/interaction-intelligence deploy/office/compose.office.yml deploy/office/nginx.conf deploy/office/office.env.example apps/web/next.config.mjs apps/web/src/proxy.ts docs/runbooks/deployment-architecture.md
git commit -m "feat: deploy interaction intelligence foundation"
```

## Task 8: Document Ownership And Accept The Foundation

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/runbooks/deployment-architecture.md`
- Create: `docs/runbooks/interaction-platform.md`
- Modify: `apps/interaction-gateway/AGENTS.md`
- Create: `scripts/check-conversation-boundary.mjs`
- Create: `scripts/__tests__/check-conversation-boundary.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: durable ownership documentation and `npm run check:conversation-boundary`, initially blocking new transcript/API dependencies while grandfathering exact legacy paths for Plan 4 removal.

- [ ] **Step 1: Write scanner tests**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { findConversationBoundaryViolations } from '../check-conversation-boundary.mjs';

test('rejects a new KidItem transcript model and browser provider stream', () => {
  const violations = findConversationBoundaryViolations([
    { path: 'prisma/models/new.prisma', text: 'model QuickAskMessage {' },
    { path: 'apps/web/src/new.ts', text: "fetch('/api/providers/openai')" },
  ]);
  assert.deepEqual(violations.map((entry) => entry.code), [
    'DUPLICATE_TRANSCRIPT_MODEL', 'DIRECT_PROVIDER_STREAM',
  ]);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test scripts/__tests__/check-conversation-boundary.test.mjs`

Expected: FAIL because the scanner does not exist.

- [ ] **Step 3: Implement the scanner and allowlist**

The scanner must inspect tracked source files and report:

```javascript
const rules = [
  ['DUPLICATE_TRANSCRIPT_MODEL', /model\s+(QuickAskMessage|InteractionMessage|CopilotMessage)\b/],
  ['LEGACY_CHAT_ROUTE', /['"`]\/api\/chat(?:\/copilot)?/],
  ['DIRECT_PROVIDER_STREAM', /fetch\([^\n]*(openai|anthropic|claude|codex|hermes)/i],
  ['WEB_DATABASE_CLIENT', /from\s+['"](?:@prisma\/client|pg|@supabase\/supabase-js)['"]/],
];
```

The temporary allowlist contains only the exact pre-existing Plan 4 deletion targets: `apps/server/src/chat/**`, `apps/web/src/components/layout/CopilotChat.tsx`, `apps/web/src/components/chat/ChatBot.tsx`, `apps/web/src/app/agent-os/lib/agent-os-chat-api.ts`, and current legacy Prisma conversation/message blocks. New lines in allowlisted files are still violations unless they delete or mechanically redirect legacy behavior. Add the command to root `check:conventions`.

- [ ] **Step 4: Update architecture and runbook ownership**

Document the two deployment planes, endpoint matrix, identity sequence, data ownership, correlation IDs, on-call ownership, required secrets, readiness semantics, replay smoke, fork policy, upgrade gate, and the prohibition on browser/direct DB/provider access. `apps/interaction-gateway/AGENTS.md` must state that it owns transport/auth bridging only and cannot acquire business rules or Prisma.

- [ ] **Step 5: Run complete foundation acceptance**

Run:

```bash
node --test scripts/__tests__/check-conversation-boundary.test.mjs
npm run check:conversation-boundary
npm run check:copilotkit-train
npm run build --workspace=packages/shared
npm run build --workspace=apps/interaction-gateway
npm run build --workspace=apps/web
npm run check:idor
npm run check:tenant-scope
npm run check:agents-hygiene
npm run dev:server
```

Expected: all non-watch commands exit 0; server reaches ready; panel open and reconnect create no execution/control work; the isolated probe can reopen the same Enterprise Intelligence thread after browser and gateway restart; expired rotation archives the old Enterprise thread before replacement authorization; KidItem contains binding/execution references but zero new message/transcript records.

- [ ] **Step 6: Commit foundation acceptance**

```bash
git add docs apps/interaction-gateway/AGENTS.md scripts/check-conversation-boundary.mjs scripts/__tests__/check-conversation-boundary.test.mjs package.json
git commit -m "docs: establish interaction platform ownership"
```

## Plan Acceptance Evidence

- [ ] Supported Enterprise distribution, chart, React/runtime, AG-UI, Node, PostgreSQL, Redis, and Kubernetes versions are recorded and exact-pinned.
- [ ] Fork `main` is zero commits ahead of upstream and KidItem has no Git-based CopilotKit dependency.
- [ ] Enterprise Intelligence retains/replays a thread through browser and gateway restart.
- [ ] Nest derives organization/user/agent authority from the opaque session; attacker-supplied scope is rejected or ignored.
- [ ] Opening the panel, loading history, and reconnecting call only read-only connection authorization and create zero bindings, policy snapshots, `AgentExecution` rows, model calls, or Operations runs.
- [ ] Expired Quick Ask rotation completes Enterprise Intelligence archive before Nest creates the replacement execution; archive failure prevents authorization and AG-UI dispatch.
- [ ] AgentOS records external binding and execution references but no transcript/message content.
- [ ] Quick Ask probe has `sessionId: null` and cannot invoke a mutation capability.
- [ ] Production values use external HA PostgreSQL/Redis, OIDC, TLS, migrations, telemetry opt-out, backups, and multiple replicas.
- [ ] Same-origin ingress sends only CopilotKit transport to the gateway and keeps AgentOS control APIs behind normal authentication.
- [ ] Architecture, environment, deployment, and ownership docs match the running topology.
