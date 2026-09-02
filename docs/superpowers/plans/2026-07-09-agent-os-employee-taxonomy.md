# Agent OS Employee Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclassify Agent OS runtime instances so `/agents` treats only outcome-owning execution subjects as employees, assigns tool-like agents as employee capabilities, and stores the same meaning in `AgentInstance.role/title`.

**Architecture:** Keep the existing `AgentInstance` table and use `role` plus `title` as the durable classification/display contract. Backend seed and data migrations establish stored defaults; the `/agents` route builds a route-local view model that separates employees, capabilities, and legacy units without adding schema or direct frontend DB access.

**Tech Stack:** NestJS, Prisma v7 multi-file schema, durable TypeScript data migrations, Next.js App Router, React Query, Vitest, Testing Library, Tailwind, lucide-react.

## Global Constraints

- Shell commands must be run with `rtk` in this workspace.
- Frontend code uses NestJS APIs via `apiClient`; no Prisma, `pg`, Supabase client, or direct DB clients in `apps/web`.
- No native PostgreSQL enums. Use `String` plus DTO/Zod/domain validation.
- Persisted data rewrites live under `scripts/data-migrations/v0.1.7/`.
- Current root `VERSION` is `0.1.7`; this plan does not require a schema change or release bump because it normalizes meaning inside existing `AgentInstance.role/title` fields.
- `/agents` must not create Agent OS runs; it remains an Agent OS read/control surface backed by explicit `/api/agent-os/*` endpoints.
- UI copy must stop presenting every LLM/tool wrapper as a human employee.
- Employee definition: “직원은 KidItem 운영에서 하나의 업무 영역을 책임지고, LLM/도구/API/워크플로우를 사용해 판단, 실행, 보고, 에스컬레이션을 수행하는 운영 주체다.”

---

## File Structure

- Modify `apps/server/src/agent-os/domain/agent-os.types.ts`
  - Adds the stored operational role vocabulary and default role/title fields on agent definitions.
- Modify `apps/server/src/agent-os/domain/agent-definition.registry.ts`
  - Assigns default role/title to current code-owned definitions.
- Modify `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`
  - Locks the employee/capability classification at the registry level.
- Modify `apps/server/src/agent-os/application/service/agent-catalog.service.ts`
  - Uses definition defaults when creating new instances without explicit role/title.
- Modify `apps/server/src/agent-os/seed-agent-os.ts`
  - Ensures fresh and existing seeded instances receive the same durable role/title defaults.
- Modify `apps/server/src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts`
  - Covers default role/title creation behavior.
- Create `scripts/data-migrations/v0.1.7/003_classify_agent_os_instances.ts`
  - Normalizes existing `agent_instances` rows.
- Modify `scripts/data-migrations/index.ts`
  - Registers the new migration in sortable release order.
- Modify `scripts/__tests__/run-data-migrations.spec.ts`
  - Locks the migration id and SQL contract.
- Create `apps/web/src/app/(automation)/agents/lib/agent-unit-taxonomy.ts`
  - Route-local taxonomy mapping Agent OS instances to employee/capability/legacy profiles.
- Modify `apps/web/src/app/(automation)/agents/lib/agent-office-model.ts`
  - Produces employees as map nodes and capabilities as attached modules.
- Modify `apps/web/src/app/(automation)/agents/lib/agent-office-model.spec.ts`
  - Covers employee filtering, capability ownership, totals, and status derivation.
- Modify `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.tsx`
  - Replaces “인력 배치” language with employee/capability language.
- Modify `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.tsx`
  - Shows employees as primary workspace actors and capabilities as attached modules.
- Modify `apps/web/src/app/(automation)/agents/components/AgentOfficeNode.tsx`
  - Uses employee job titles and outcome language instead of raw agent labels.
- Modify `apps/web/src/app/(automation)/agents/components/AgentInspector.tsx`
  - Presents selected employee responsibilities and owned capabilities.
- Modify `/agents` component tests under `apps/web/src/app/(automation)/agents/components/`
  - Locks copy and role semantics.
- Modify `apps/web/src/app/(automation)/agents/__tests__/page.spec.tsx`
  - Verifies route-level rendering with employee taxonomy.

---

### Task 1: Backend Definition Defaults

**Files:**
- Modify: `apps/server/src/agent-os/domain/agent-os.types.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-catalog.service.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts`
- Modify: `apps/server/src/agent-os/seed-agent-os.ts`

**Interfaces:**
- Produces: `AgentInstanceOperationalRole = 'employee' | 'capability' | 'legacy'`.
- Produces: `AgentDefinitionRecord.defaultInstanceRole: AgentInstanceOperationalRole`.
- Produces: `AgentDefinitionRecord.defaultInstanceTitle: string`.
- Consumes: existing `AgentInstance.role` and `AgentInstance.title` string fields.

- [ ] **Step 1: Write the failing registry test**

Add this test to `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`:

```ts
  it('classifies code-owned Agent OS definitions as employees or capabilities', () => {
    const definitionsByType = new Map(
      listAgentDefinitions().map((definition) => [definition.type, definition]),
    );

    expect(definitionsByType.get('manager')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '운영 총괄',
    });
    expect(definitionsByType.get('sourcing')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '소싱 담당',
    });
    expect(definitionsByType.get('listing')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '상품 등록 담당',
    });
    expect(definitionsByType.get('order')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '발주 담당',
    });
    expect(definitionsByType.get('channel_registration')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '채널 등록 담당',
    });
    expect(definitionsByType.get('ad_strategy')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '광고 전략 담당',
    });
    expect(definitionsByType.get('chat')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '고객/운영 응대 담당',
    });
    expect(definitionsByType.get('rules_evaluation')).toMatchObject({
      defaultInstanceRole: 'capability',
      defaultInstanceTitle: '룰 평가 능력',
    });
    expect(definitionsByType.get('rules_suggest')).toMatchObject({
      defaultInstanceRole: 'capability',
      defaultInstanceTitle: '임계값 제안 능력',
    });
    expect(definitionsByType.get('thumbnail_analyst')).toMatchObject({
      defaultInstanceRole: 'capability',
      defaultInstanceTitle: '썸네일 분석 능력',
    });
  });
```

- [ ] **Step 2: Run the registry test to verify it fails**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/domain/__tests__/agent-definition.registry.spec.ts
```

Expected: FAIL because `defaultInstanceRole` and `defaultInstanceTitle` do not exist on returned definitions.

- [ ] **Step 3: Add backend type fields**

Modify `apps/server/src/agent-os/domain/agent-os.types.ts` by inserting this block after `AgentDefinitionDelegationRole`:

```ts
export const AGENT_INSTANCE_OPERATIONAL_ROLES = [
  'employee',
  'capability',
  'legacy',
] as const;
export type AgentInstanceOperationalRole =
  (typeof AGENT_INSTANCE_OPERATIONAL_ROLES)[number];
```

Then add these fields to `AgentDefinitionRecord`:

```ts
  defaultInstanceRole: AgentInstanceOperationalRole;
  defaultInstanceTitle: string;
```

- [ ] **Step 4: Add registry defaults**

Modify `apps/server/src/agent-os/domain/agent-definition.registry.ts`:

1. Add `defaultInstanceRole` and `defaultInstanceTitle` to every entry in `DEFINITIONS`.
2. Use this exact classification:

```ts
manager: { role: 'employee', title: '운영 총괄' }
sourcing: { role: 'employee', title: '소싱 담당' }
listing: { role: 'employee', title: '상품 등록 담당' }
order: { role: 'employee', title: '발주 담당' }
channel_registration: { role: 'employee', title: '채널 등록 담당' }
ad_strategy: { role: 'employee', title: '광고 전략 담당' }
chat: { role: 'employee', title: '고객/운영 응대 담당' }
rules_evaluation: { role: 'capability', title: '룰 평가 능력' }
rules_suggest: { role: 'capability', title: '임계값 제안 능력' }
thumbnail_analyst: { role: 'capability', title: '썸네일 분석 능력' }
```

Example entry shape:

```ts
  {
    type: 'manager',
    name: 'Operator',
    description:
      'User-facing coordinator agent for Agent OS conversations and cross-domain delegation.',
    promptPath: `${PROMPT_BASE}/manager.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_MANAGER_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '운영 총괄',
    runtimeKind: 'coordinator',
    delegationRole: 'orchestrator',
    defaultToolPolicies: MANAGER_TOOL_POLICIES,
  },
```

- [ ] **Step 5: Make catalog creation consume definition defaults**

In `apps/server/src/agent-os/application/service/agent-catalog.service.ts`, change the `data` creation block inside `createInstance` from:

```ts
      role: input.role ?? 'specialist',
      title: input.title ?? null,
```

to:

```ts
      role: input.role ?? definition.defaultInstanceRole,
      title: input.title ?? definition.defaultInstanceTitle,
```

- [ ] **Step 6: Make seeding consume definition defaults**

In `apps/server/src/agent-os/seed-agent-os.ts`, update the existing-instance update data:

```ts
      data: {
        name: definition.name,
        adapterType: definition.defaultAdapterType,
        role: definition.defaultInstanceRole,
        title: definition.defaultInstanceTitle,
      },
```

Update the create data:

```ts
      data: {
        organization: { connect: { id: organizationId } },
        type: definition.type,
        name: definition.name,
        role: definition.defaultInstanceRole,
        title: definition.defaultInstanceTitle,
        adapterType: definition.defaultAdapterType,
      },
```

- [ ] **Step 7: Write the failing catalog service test**

In `apps/server/src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts`, add a test that creates a listing instance without `role` or `title` and expects defaults:

```ts
  it('uses definition employee defaults when creating an instance without explicit role or title', async () => {
    const repository = {
      listInstances: vi.fn(),
      createInstanceWithRuntimeState: vi.fn(async (input) => ({
        id: 'agent-listing',
        organizationId: input.organizationId,
        type: input.type,
        name: input.name,
        role: input.role,
        title: input.title,
        icon: null,
        reportsToId: null,
        lifecycleStatus: 'active',
        pauseReason: null,
        trustLevel: input.trustLevel ?? 0,
        adapterType: input.adapterType,
        modelOverride: input.modelOverride ?? null,
        adapterConfig: input.adapterConfig ?? {},
        runtimeConfig: input.runtimeConfig ?? {},
        promptPathOverride: input.promptPathOverride ?? null,
      })),
      updateInstance: vi.fn(),
      findInstanceById: vi.fn(),
      findInstanceByType: vi.fn(),
      listInstanceToolPolicies: vi.fn(),
      upsertInstanceToolPolicy: vi.fn(),
    };
    const policy = {
      listEffectiveToolPolicies: vi.fn(),
      upsertInstanceToolPolicy: vi.fn(),
    };
    const service = new AgentCatalogService(repository as never, policy as never);

    const created = await service.createInstance({
      organizationId: 'org-1',
      type: 'listing',
      name: 'Listing Agent',
    });

    expect(repository.createInstanceWithRuntimeState).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'employee',
        title: '상품 등록 담당',
      }),
    );
    expect(created).toMatchObject({
      role: 'employee',
      title: '상품 등록 담당',
    });
  });
```

If the repository mock in this spec already has a helper factory, use that helper and preserve the same expectations.

- [ ] **Step 8: Run backend tests to verify they pass**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/domain/__tests__/agent-definition.registry.spec.ts src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
rtk git add apps/server/src/agent-os/domain/agent-os.types.ts apps/server/src/agent-os/domain/agent-definition.registry.ts apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts apps/server/src/agent-os/application/service/agent-catalog.service.ts apps/server/src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts apps/server/src/agent-os/seed-agent-os.ts
rtk git commit -m "feat: define agent os employee defaults"
```

---

### Task 2: Durable Data Migration for Existing Instances

**Files:**
- Create: `scripts/data-migrations/v0.1.7/003_classify_agent_os_instances.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`

**Interfaces:**
- Consumes: Task 1 role/title definitions.
- Produces: migration id `v0.1.7:003_classify_agent_os_instances`.
- Produces: existing rows normalized to `role in ('employee', 'capability', 'legacy')`.

- [ ] **Step 1: Write the failing migration registry and SQL tests**

Modify `scripts/__tests__/run-data-migrations.spec.ts`:

1. Add this import:

```ts
import {
  classifyAgentOsInstances,
} from '../data-migrations/v0.1.7/003_classify_agent_os_instances';
```

2. Add the new id to the expected `DATA_MIGRATION_IDS` array after `v0.1.7:002_normalize_sellpia_recommended_snapshot_items`:

```ts
      'v0.1.7:003_classify_agent_os_instances',
```

3. Add this test after the Sellpia migration test block:

```ts
describe('Agent OS instance classification migration', () => {
  it('classifies stored Agent OS instances into employees, capabilities, and legacy units', async () => {
    const tx = {
      $executeRaw: vi.fn(async () => 14),
    };

    const result = await classifyAgentOsInstances.run(tx as never);
    const [statement] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    const sql = String.raw(statement);

    expect(sql).toContain('UPDATE agent_instances');
    expect(sql).toContain("WHEN type = 'manager' THEN 'employee'");
    expect(sql).toContain("WHEN type = 'rules_evaluation' THEN 'capability'");
    expect(sql).toContain("WHEN lifecycle_status = 'disabled' THEN 'legacy'");
    expect(sql).toContain("WHEN type = 'listing' THEN '상품 등록 담당'");
    expect(result).toEqual({
      affectedRows: 14,
      details: {
        employees: [
          'manager',
          'sourcing',
          'listing',
          'order',
          'channel_registration',
          'ad_strategy',
          'chat',
        ],
        capabilities: [
          'rules_evaluation',
          'rules_suggest',
          'thumbnail_analyst',
        ],
        legacyRule: 'disabled or unregistered instances retain their name and become legacy when disabled',
      },
    });
  });
});
```

- [ ] **Step 2: Run migration tests to verify failure**

Run:

```bash
rtk npm exec vitest -- run scripts/__tests__/run-data-migrations.spec.ts
```

Expected: FAIL because `003_classify_agent_os_instances` does not exist and the id is not registered.

- [ ] **Step 3: Create migration file**

Create `scripts/data-migrations/v0.1.7/003_classify_agent_os_instances.ts` with this content:

```ts
import type { DataMigration } from '../types';

const EMPLOYEE_TYPES = [
  'manager',
  'sourcing',
  'listing',
  'order',
  'channel_registration',
  'ad_strategy',
  'chat',
] as const;

const CAPABILITY_TYPES = [
  'rules_evaluation',
  'rules_suggest',
  'thumbnail_analyst',
] as const;

export const classifyAgentOsInstances: DataMigration = {
  id: 'v0.1.7:003_classify_agent_os_instances',
  releaseVersion: '0.1.7',
  name: 'Classify Agent OS instances as employees and capabilities',
  async run(tx) {
    const affectedRows = await tx.$executeRaw`
      UPDATE agent_instances
      SET role = CASE
            WHEN type = 'manager' THEN 'employee'
            WHEN type = 'sourcing' THEN 'employee'
            WHEN type = 'listing' THEN 'employee'
            WHEN type = 'order' THEN 'employee'
            WHEN type = 'channel_registration' THEN 'employee'
            WHEN type = 'ad_strategy' THEN 'employee'
            WHEN type = 'chat' THEN 'employee'
            WHEN type = 'rules_evaluation' THEN 'capability'
            WHEN type = 'rules_suggest' THEN 'capability'
            WHEN type = 'thumbnail_analyst' THEN 'capability'
            WHEN lifecycle_status = 'disabled' THEN 'legacy'
            ELSE role
          END,
          title = CASE
            WHEN type = 'manager' THEN '운영 총괄'
            WHEN type = 'sourcing' THEN '소싱 담당'
            WHEN type = 'listing' THEN '상품 등록 담당'
            WHEN type = 'order' THEN '발주 담당'
            WHEN type = 'channel_registration' THEN '채널 등록 담당'
            WHEN type = 'ad_strategy' THEN '광고 전략 담당'
            WHEN type = 'chat' THEN '고객/운영 응대 담당'
            WHEN type = 'rules_evaluation' THEN '룰 평가 능력'
            WHEN type = 'rules_suggest' THEN '임계값 제안 능력'
            WHEN type = 'thumbnail_analyst' THEN '썸네일 분석 능력'
            WHEN lifecycle_status = 'disabled' THEN COALESCE(title, name)
            ELSE title
          END,
          updated_at = NOW()
      WHERE type IN (
            'manager',
            'sourcing',
            'listing',
            'order',
            'channel_registration',
            'ad_strategy',
            'chat',
            'rules_evaluation',
            'rules_suggest',
            'thumbnail_analyst'
          )
         OR lifecycle_status = 'disabled'
    `;

    return {
      affectedRows,
      details: {
        employees: [...EMPLOYEE_TYPES],
        capabilities: [...CAPABILITY_TYPES],
        legacyRule:
          'disabled or unregistered instances retain their name and become legacy when disabled',
      },
    };
  },
};
```

- [ ] **Step 4: Register migration**

Modify `scripts/data-migrations/index.ts`:

1. Add import:

```ts
import { classifyAgentOsInstances } from './v0.1.7/003_classify_agent_os_instances';
```

2. Add `classifyAgentOsInstances` after `normalizeSellpiaRecommendedSnapshotItems` in `dataMigrations`.

- [ ] **Step 5: Run migration tests to verify pass**

Run:

```bash
rtk npm exec vitest -- run scripts/__tests__/run-data-migrations.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run script inventory check**

Run:

```bash
rtk npm run check:scripts-inventory
```

Expected: PASS.

- [ ] **Step 7: Apply migration locally for browser verification**

Run:

```bash
rtk npm run data:migrate -- up --target local --confirm APPLY_DATA_MIGRATIONS
```

Expected: output includes `v0.1.7:003_classify_agent_os_instances` as applied or already applied.

- [ ] **Step 8: Commit Task 2**

```bash
rtk git add scripts/data-migrations/v0.1.7/003_classify_agent_os_instances.ts scripts/data-migrations/index.ts scripts/__tests__/run-data-migrations.spec.ts
rtk git commit -m "chore: classify agent os instance data"
```

---

### Task 3: Frontend Employee and Capability View Model

**Files:**
- Create: `apps/web/src/app/(automation)/agents/lib/agent-unit-taxonomy.ts`
- Create: `apps/web/src/app/(automation)/agents/lib/agent-unit-taxonomy.spec.ts`
- Modify: `apps/web/src/app/(automation)/agents/lib/agent-office-model.ts`
- Modify: `apps/web/src/app/(automation)/agents/lib/agent-office-model.spec.ts`

**Interfaces:**
- Produces: `AgentUnitKind = 'employee' | 'capability' | 'legacy'`.
- Produces: `classifyAgentUnit(instance: AgentInstanceSummary): AgentUnitProfile`.
- Produces: `AgentOfficeViewModel.nodes` containing employee nodes only.
- Produces: `AgentOfficeViewModel.capabilities` attached to owner employees by `ownerAgentType` and `ownerNodeId`.

- [ ] **Step 1: Write failing taxonomy tests**

Create `apps/web/src/app/(automation)/agents/lib/agent-unit-taxonomy.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyAgentUnit } from './agent-unit-taxonomy';
import type { AgentInstanceSummary } from '@kiditem/shared/agent-os';

function instance(
  type: string,
  overrides: Partial<AgentInstanceSummary> = {},
): AgentInstanceSummary {
  return {
    id: `agent-${type}`,
    organizationId: 'org-1',
    type,
    name: type,
    role: 'specialist',
    title: null,
    icon: null,
    reportsToId: null,
    lifecycleStatus: 'active',
    pauseReason: null,
    trustLevel: 0,
    adapterType: 'claude_local',
    modelOverride: null,
    effectiveModel: 'gpt-5.5',
    ...overrides,
  };
}

describe('classifyAgentUnit', () => {
  it('classifies outcome-owning agent instances as employees', () => {
    expect(classifyAgentUnit(instance('manager'))).toMatchObject({
      kind: 'employee',
      displayName: '운영 총괄',
      responsibility: '요청을 해석하고 업무를 배정하며 승인 경계를 판단합니다.',
    });
    expect(classifyAgentUnit(instance('listing'))).toMatchObject({
      kind: 'employee',
      displayName: '상품 등록 담당',
      responsibility: '소싱 후보를 판매 가능한 등록 패키지로 정리합니다.',
    });
    expect(classifyAgentUnit(instance('ad_strategy'))).toMatchObject({
      kind: 'employee',
      displayName: '광고 전략 담당',
    });
  });

  it('classifies tool-like agent instances as owned capabilities', () => {
    expect(classifyAgentUnit(instance('rules_evaluation'))).toMatchObject({
      kind: 'capability',
      displayName: '룰 평가',
      ownerAgentType: 'manager',
    });
    expect(classifyAgentUnit(instance('rules_suggest'))).toMatchObject({
      kind: 'capability',
      displayName: '임계값 제안',
      ownerAgentType: 'manager',
    });
    expect(classifyAgentUnit(instance('thumbnail_analyst'))).toMatchObject({
      kind: 'capability',
      displayName: '썸네일 분석',
      ownerAgentType: 'listing',
    });
  });

  it('classifies disabled and unknown instances as legacy units', () => {
    expect(classifyAgentUnit(instance('image_edit', { lifecycleStatus: 'disabled' }))).toMatchObject({
      kind: 'legacy',
      displayName: 'image_edit',
    });
    expect(classifyAgentUnit(instance('unknown_active'))).toMatchObject({
      kind: 'legacy',
      displayName: 'unknown_active',
    });
  });
});
```

- [ ] **Step 2: Run taxonomy test to verify failure**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents/lib/agent-unit-taxonomy.spec.ts
```

Expected: FAIL because `agent-unit-taxonomy.ts` does not exist.

- [ ] **Step 3: Implement taxonomy helper**

Create `apps/web/src/app/(automation)/agents/lib/agent-unit-taxonomy.ts`:

```ts
import type { AgentInstanceSummary } from '@kiditem/shared/agent-os';

export type AgentUnitKind = 'employee' | 'capability' | 'legacy';

export interface AgentUnitProfile {
  kind: AgentUnitKind;
  displayName: string;
  responsibility: string;
  ownerAgentType: string | null;
}

const EMPLOYEE_PROFILES: Record<
  string,
  Pick<AgentUnitProfile, 'displayName' | 'responsibility'>
> = {
  manager: {
    displayName: '운영 총괄',
    responsibility: '요청을 해석하고 업무를 배정하며 승인 경계를 판단합니다.',
  },
  sourcing: {
    displayName: '소싱 담당',
    responsibility: '상품 후보와 공급처 단서를 수집해 검토 가능한 후보군으로 정리합니다.',
  },
  listing: {
    displayName: '상품 등록 담당',
    responsibility: '소싱 후보를 판매 가능한 등록 패키지로 정리합니다.',
  },
  order: {
    displayName: '발주 담당',
    responsibility: '승인된 후보를 기준으로 발주 초안과 수량 제안을 준비합니다.',
  },
  channel_registration: {
    displayName: '채널 등록 담당',
    responsibility: '외부 마켓 등록 결과를 KidItem 채널 데이터로 반영합니다.',
  },
  ad_strategy: {
    displayName: '광고 전략 담당',
    responsibility: '상품과 채널 데이터를 바탕으로 광고 실험 방향을 제안합니다.',
  },
  chat: {
    displayName: '고객/운영 응대 담당',
    responsibility: '운영자가 묻는 현재 상태와 데이터를 읽고 설명합니다.',
  },
};

const CAPABILITY_PROFILES: Record<
  string,
  Pick<AgentUnitProfile, 'displayName' | 'responsibility' | 'ownerAgentType'>
> = {
  rules_evaluation: {
    displayName: '룰 평가',
    responsibility: '정책과 비즈니스 규칙 통과 여부를 판정합니다.',
    ownerAgentType: 'manager',
  },
  rules_suggest: {
    displayName: '임계값 제안',
    responsibility: '운영 룰 임계값을 데이터 분포 기반으로 제안합니다.',
    ownerAgentType: 'manager',
  },
  thumbnail_analyst: {
    displayName: '썸네일 분석',
    responsibility: '상품 등록 전 썸네일 품질과 컴플라이언스를 검사합니다.',
    ownerAgentType: 'listing',
  },
};

export function classifyAgentUnit(instance: AgentInstanceSummary): AgentUnitProfile {
  const employee = EMPLOYEE_PROFILES[instance.type];
  if (employee && instance.lifecycleStatus !== 'disabled') {
    return {
      kind: 'employee',
      ownerAgentType: null,
      ...employee,
    };
  }

  const capability = CAPABILITY_PROFILES[instance.type];
  if (capability && instance.lifecycleStatus !== 'disabled') {
    return {
      kind: 'capability',
      ...capability,
    };
  }

  return {
    kind: 'legacy',
    displayName: instance.title ?? instance.name,
    responsibility: '현재 운영 캔버스에서 직접 실행 주체로 쓰지 않는 비활성 또는 미분류 유닛입니다.',
    ownerAgentType: null,
  };
}
```

- [ ] **Step 4: Run taxonomy test to verify pass**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents/lib/agent-unit-taxonomy.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing office model test**

Add this test to `apps/web/src/app/(automation)/agents/lib/agent-office-model.spec.ts`:

```ts
  it('keeps employees as map nodes and attaches tool wrappers as capabilities', () => {
    const model = buildAgentOfficeModel({
      instances: [
        {
          id: 'agent-manager',
          organizationId: 'org-1',
          type: 'manager',
          name: 'Operator',
          role: 'employee',
          title: '운영 총괄',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 1,
          adapterType: 'claude_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.5',
        },
        {
          id: 'agent-listing',
          organizationId: 'org-1',
          type: 'listing',
          name: 'Listing Agent',
          role: 'employee',
          title: '상품 등록 담당',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 1,
          adapterType: 'claude_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.5',
        },
        {
          id: 'agent-rules',
          organizationId: 'org-1',
          type: 'rules_evaluation',
          name: 'Rules Evaluation',
          role: 'capability',
          title: '룰 평가 능력',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 0,
          adapterType: 'claude_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.5',
        },
        {
          id: 'agent-thumbnail',
          organizationId: 'org-1',
          type: 'thumbnail_analyst',
          name: 'Thumbnail Analyst',
          role: 'capability',
          title: '썸네일 분석 능력',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 0,
          adapterType: 'claude_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.5',
        },
      ],
      runs: [],
      requests: [],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: '0',
    });

    expect(model.nodes.map((node) => [node.agentType, node.displayName])).toEqual([
      ['manager', '운영 총괄'],
      ['listing', '상품 등록 담당'],
    ]);
    expect(model.capabilities.map((capability) => [
      capability.agentType,
      capability.displayName,
      capability.ownerAgentType,
      capability.ownerNodeId,
    ])).toEqual([
      ['rules_evaluation', '룰 평가', 'manager', 'agent-manager'],
      ['thumbnail_analyst', '썸네일 분석', 'listing', 'agent-listing'],
    ]);
    expect(model.totals).toMatchObject({
      agents: 2,
      capabilities: 2,
    });
  });
```

- [ ] **Step 6: Run office model test to verify failure**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents/lib/agent-office-model.spec.ts
```

Expected: FAIL because `displayName`, `capabilities`, and `totals.capabilities` do not exist.

- [ ] **Step 7: Extend office model types and builder**

Modify `apps/web/src/app/(automation)/agents/lib/agent-office-model.ts`:

1. Import `classifyAgentUnit`.
2. Add fields to `AgentOfficeNode`:

```ts
  displayName: string;
  responsibility: string;
```

3. Add interface:

```ts
export interface AgentOfficeCapability {
  id: string;
  name: string;
  displayName: string;
  agentType: string;
  ownerAgentType: string;
  ownerNodeId: string | null;
  responsibility: string;
  status: AgentOfficeNodeStatus;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
}
```

4. Add `capabilities: AgentOfficeCapability[]` to `AgentOfficeViewModel`.
5. Add `capabilities: number` to `AgentOfficeViewModel.totals`.
6. In `buildAgentOfficeModel`, split instances by `classifyAgentUnit(instance).kind`.
7. Build `nodes` from employees only.
8. Build `capabilities` from capabilities only and attach `ownerNodeId` by matching `ownerAgentType` to an employee node `agentType`.

The resulting node object must include:

```ts
      displayName: profile.displayName,
      responsibility: profile.responsibility,
```

The resulting totals must include:

```ts
      agents: nodes.length,
      capabilities: capabilities.length,
```

- [ ] **Step 8: Run `/agents` model tests to verify pass**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents/lib/agent-unit-taxonomy.spec.ts src/app/'(automation)'/agents/lib/agent-office-model.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
rtk git add apps/web/src/app/'(automation)'/agents/lib/agent-unit-taxonomy.ts apps/web/src/app/'(automation)'/agents/lib/agent-unit-taxonomy.spec.ts apps/web/src/app/'(automation)'/agents/lib/agent-office-model.ts apps/web/src/app/'(automation)'/agents/lib/agent-office-model.spec.ts
rtk git commit -m "feat: model agent os employees and capabilities"
```

---

### Task 4: `/agents` UI Language and Capability Attachment

**Files:**
- Modify: `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.tsx`
- Modify: `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.spec.tsx`
- Modify: `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.tsx`
- Modify: `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.spec.tsx`
- Modify: `apps/web/src/app/(automation)/agents/components/AgentOfficeNode.tsx`
- Modify: `apps/web/src/app/(automation)/agents/components/AgentInspector.tsx`
- Modify: `apps/web/src/app/(automation)/agents/__tests__/page.spec.tsx`

**Interfaces:**
- Consumes: `AgentOfficeViewModel.nodes` employee-only nodes from Task 3.
- Consumes: `AgentOfficeViewModel.capabilities` from Task 3.
- Produces: UI copy that uses `직원`, `능력`, `운영 캔버스`, and `직원 프로필`.

- [ ] **Step 1: Write failing shell/page tests**

Modify `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.spec.tsx`:

1. Update the fixture node with `displayName` and `responsibility`.
2. Add `capabilities` to the fixture model:

```ts
  capabilities: [
    {
      id: 'agent-rules',
      name: 'Rules Evaluation',
      displayName: '룰 평가',
      agentType: 'rules_evaluation',
      ownerAgentType: 'manager',
      ownerNodeId: 'agent-manager',
      responsibility: '정책과 비즈니스 규칙 통과 여부를 판정합니다.',
      status: 'idle',
      activeRunCount: 0,
      pendingApprovalCount: 0,
      lastActivityAt: null,
    },
  ],
```

3. Change the primary shell test expectations to:

```ts
    expect(screen.getByRole('complementary', { name: '직원' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '운영 캔버스' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '직원 프로필' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: '업무 지시' })).toBeInTheDocument();
    expect(screen.getByText('능력 1개')).toBeInTheDocument();
    expect(screen.queryByText('직원 채용')).not.toBeInTheDocument();
    expect(screen.queryByText('게스트 초대')).not.toBeInTheDocument();
```

Modify `apps/web/src/app/(automation)/agents/__tests__/page.spec.tsx` so it expects `직원`, `운영 캔버스`, `직원 프로필`, and no `인력 배치`.

- [ ] **Step 2: Run shell/page tests to verify failure**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents/components/AgentOfficeShell.spec.tsx src/app/'(automation)'/agents/__tests__/page.spec.tsx
```

Expected: FAIL because UI still says `인력 배치`, `가상 사무공간`, `직원 설정`, and still renders fake action buttons.

- [ ] **Step 3: Rename and simplify the left panel**

In `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.tsx`:

1. Rename the panel function from `StaffPanel` to `EmployeePanel`.
2. Change `aria-label="인력 배치"` to `aria-label="직원"`.
3. Change visible heading `인력 배치` to `직원`.
4. Remove `직원 채용` and `게스트 초대` buttons.
5. Add a compact summary row:

```tsx
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-slate-400">직원</div>
          <div className="mt-1 text-base font-semibold text-white">
            {model.totals.agents}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-slate-400">능력</div>
          <div className="mt-1 text-base font-semibold text-white">
            {model.totals.capabilities}
          </div>
        </div>
      </div>
```

6. Render each employee name as `node.displayName`.
7. Render the original agent name as small technical subtitle after the responsibility line:

```tsx
              <span className="block truncate font-semibold">{node.displayName}</span>
              <span className="block truncate text-[11px] text-slate-400">
                {node.responsibility}
              </span>
              <span className="block truncate text-[10px] text-slate-500">
                {node.name}
              </span>
```

- [ ] **Step 4: Change canvas and inspector copy**

In `AgentOfficeShell.tsx`, change the map expectation and props:

```tsx
          <AgentOfficeMap
            className="absolute inset-0 min-h-full"
            nodes={model.nodes}
            capabilities={model.capabilities}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
```

In `AgentOfficeMap.tsx`:

1. Add `capabilities` prop.
2. Change `aria-label="가상 사무공간"` to `aria-label="운영 캔버스"`.
3. Render capability chips beside the office floor:

```tsx
      <div className="absolute bottom-[17%] right-[11%] z-10 grid max-w-[240px] gap-2">
        {capabilities.map((capability) => (
          <div
            key={capability.id}
            className="rounded-md border border-slate-900/10 bg-slate-950/80 px-3 py-2 text-xs text-white shadow-lg backdrop-blur"
          >
            <div className="font-semibold">{capability.displayName}</div>
            <div className="mt-0.5 truncate text-[10px] text-cyan-200">
              {capability.ownerAgentType} 능력
            </div>
          </div>
        ))}
      </div>
```

In `AgentInspector.tsx`:

1. Change `aria-label="직원 설정"` to `aria-label="직원 프로필"`.
2. Change empty state copy to `직원을 선택하세요.`
3. Show `node.displayName`, `node.responsibility`, and technical identity below:

```tsx
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
            직원 프로필
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-white">
            {node.displayName}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {node.responsibility}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            Agent OS: {node.name} · {node.agentType}
          </p>
```

- [ ] **Step 5: Update node rendering**

In `AgentOfficeNode.tsx`:

1. Render `node.displayName` as the primary label.
2. Render `node.name` as the small technical label.
3. Keep `aria-pressed` behavior unchanged.

Use:

```tsx
        <span className="block truncate text-xs font-semibold text-white">{node.displayName}</span>
        <span className="block truncate text-[10px] text-cyan-200">{node.name}</span>
```

- [ ] **Step 6: Update map tests**

In `AgentOfficeMap.spec.tsx`:

1. Add `displayName` and `responsibility` to fixture nodes.
2. Pass `capabilities={[]}` in existing renders.
3. Change region assertion:

```ts
    expect(screen.getByRole('region', { name: '운영 캔버스' })).toBeInTheDocument();
```

4. Add a new capability chip test:

```ts
  it('renders capability modules separately from employee avatars', () => {
    render(
      <AgentOfficeMap
        nodes={nodes}
        capabilities={[
          {
            id: 'agent-rules',
            name: 'Rules Evaluation',
            displayName: '룰 평가',
            agentType: 'rules_evaluation',
            ownerAgentType: 'manager',
            ownerNodeId: 'agent-manager',
            responsibility: '정책과 비즈니스 규칙 통과 여부를 판정합니다.',
            status: 'idle',
            activeRunCount: 0,
            pendingApprovalCount: 0,
            lastActivityAt: null,
          },
        ]}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByText('룰 평가')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Operator/ })).toHaveLength(1);
  });
```

- [ ] **Step 7: Run component tests to verify pass**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents/components/AgentOfficeShell.spec.tsx src/app/'(automation)'/agents/components/AgentOfficeMap.spec.tsx src/app/'(automation)'/agents/__tests__/page.spec.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
rtk git add apps/web/src/app/'(automation)'/agents/components/AgentOfficeShell.tsx apps/web/src/app/'(automation)'/agents/components/AgentOfficeShell.spec.tsx apps/web/src/app/'(automation)'/agents/components/AgentOfficeMap.tsx apps/web/src/app/'(automation)'/agents/components/AgentOfficeMap.spec.tsx apps/web/src/app/'(automation)'/agents/components/AgentOfficeNode.tsx apps/web/src/app/'(automation)'/agents/components/AgentInspector.tsx apps/web/src/app/'(automation)'/agents/__tests__/page.spec.tsx
rtk git commit -m "feat: show agent os employees and capabilities"
```

---

### Task 5: Final Verification and Browser Check

**Files:**
- No source files created.
- Verifies all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: backend defaults, data migration, frontend view model, and UI copy.
- Produces: verified local `/agents` screen showing employees and capabilities.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents
```

Expected: PASS.

- [ ] **Step 3: Run script tests and inventory**

Run:

```bash
rtk npm exec vitest -- run scripts/__tests__/run-data-migrations.spec.ts
rtk npm run check:scripts-inventory
```

Expected: both PASS.

- [ ] **Step 4: Run required frontend build**

Run:

```bash
rtk npm run build --workspace=apps/web
```

Expected: PASS.

- [ ] **Step 5: Boot backend for Nest verification**

Run:

```bash
rtk npm run dev:server
```

Expected: Nest boots and listens on port `4000`. Leave it running for browser verification.

- [ ] **Step 6: Boot web dev server**

Run in a second terminal session:

```bash
rtk env KIDITEM_PROXY_ALL_API=true NEXT_PUBLIC_API_URL= npm run dev:webpack --workspace=apps/web
```

Expected: Next listens on `http://localhost:3000`.

- [ ] **Step 7: Verify `/agents` manually in the browser**

Open:

```text
http://localhost:3000/agents
```

Expected visible state:

- Left panel heading is `직원`, not `인력 배치`.
- Fake actions `직원 채용` and `게스트 초대` are absent.
- Employees shown as primary subjects: `운영 총괄`, `소싱 담당`, `상품 등록 담당`, `발주 담당`, `채널 등록 담당`, `광고 전략 담당`, `고객/운영 응대 담당`.
- Capability modules shown separately: `룰 평가`, `임계값 제안`, `썸네일 분석`.
- `Rules Evaluation`, `Rules Threshold Suggester`, and `Thumbnail Analyst` are not primary employee cards.
- Right panel heading is `직원 프로필`, not `직원 설정`.
- Selected employee shows responsibility copy and the technical identity, for example `Agent OS: Operator · manager`, below it.

- [ ] **Step 8: Check diff hygiene**

Run:

```bash
rtk git diff --check
rtk git status --short --branch
```

Expected: `git diff --check` exits 0. `git status` shows only intentional files from this plan.

- [ ] **Step 9: Commit verification-only changes if any**

If no source changes were made during verification, skip this commit. If verification required test-only fixes, commit them:

```bash
rtk git add apps/server apps/web scripts
rtk git commit -m "test: verify agent os employee taxonomy"
```

---

## Self-Review

**Spec coverage:** Covered the employee definition, employee list, capability ownership, stored `role/title` normalization, `/agents` UI language, and verification gates.

**Placeholder scan:** This plan contains concrete filenames, role/title values, migration id, SQL behavior, expected UI copy, and commands. It does not rely on undefined future decisions.

**Type consistency:** `AgentInstanceOperationalRole`, `defaultInstanceRole`, `defaultInstanceTitle`, `AgentUnitKind`, `AgentOfficeCapability`, `displayName`, and `responsibility` are introduced before later tasks consume them.
