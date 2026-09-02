# Agent OS Definition-Owned Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shipped Agent Definition Registry the single source of truth for the Hermes office roster so every environment shows the same seven employees and three attached capabilities while organization-specific database rows control only runtime configuration and activity.

**Architecture:** Add a read-only roster projection that joins code-owned definitions to nullable organization-owned Agent Instances. The registry owns identity, employee/capability classification, display copy, capability ownership, and ordering; the database owns model, adapter, lifecycle, trust, policies, and run history. The frontend consumes this projection directly, uses agent type as stable UI identity, and shows missing runtime installation or model configuration without removing the employee.

**Tech Stack:** NestJS, Prisma v7, Zod, TypeScript, Next.js App Router, React Query, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- Run every shell command through `rtk` in this workspace.
- Keep `AgentInstance` organization-scoped; controllers receive `organizationId` only from `@CurrentOrganization()`.
- Frontend data flows only through NestJS and route-local `agent-os-api.ts`.
- Missing model selection remains an explicit state. Do not add a silent model fallback.
- A GET request must not create or update Agent Instances.
- Do not add a Prisma schema change, data migration, release bump, new dependency, or new background worker.
- Apply Supabase PostgreSQL best practices: use atomic upsert against an existing unique constraint, keep transactions short, and acquire rows in deterministic definition order.
- Preserve organization-owned adapter, model, trust, lifecycle, policy, and prompt overrides.
- Use the existing desktop Agent OS layout. Mobile verification is not required.
- Add tests before each behavioral change and keep the existing `/agents` redirect-only contract.

---

## Source and Supersession

This plan supersedes the display-source decision in:

- `docs/superpowers/plans/2026-07-09-agent-os-employee-taxonomy.md`

That plan made persisted `AgentInstance.role/title` the durable UI classification contract. This plan keeps those columns for runtime compatibility but removes them as the office roster authority. The correction is required because two databases at the same Git commit can contain different rows, labels, and creation order.

## What Already Exists

- `apps/server/src/agent-os/domain/agent-definition.registry.ts`
  - Already owns the ten shipped Agent OS types, runtime kind, delegation role, prompt path, default adapter, model environment, skills, and tool policies.
  - Already classifies definitions with `defaultInstanceRole` and `defaultInstanceTitle`.
- `prisma/models/agents.prisma`
  - Already states that definitions live in backend code and instances are organization-owned runnable subjects.
  - Already enforces `@@unique([organizationId, type])`.
- `apps/server/src/agent-os/application/service/agent-catalog.service.ts`
  - Already reads definitions and organization-scoped instances.
  - Currently returns only persisted rows from `listInstances()`.
- `apps/server/src/agent-os/seed-agent-os.ts`
  - Already creates missing instances idempotently and ensures one runtime-state row per instance.
- `apps/web/src/app/agent-os/lib/agent-unit-taxonomy.ts`
  - Currently duplicates display titles, responsibilities, employee/capability classification, and capability ownership in the frontend.
- `apps/web/src/app/agent-os/lib/agent-office-model.ts`
  - Already aggregates runs, requests, approvals, costs, authorization events, and conversations into the office view model.

## In Scope

- Canonical office metadata on each shipped Agent Definition.
- Shared Zod contracts for a definition-owned roster projection.
- `GET /api/agent-os/roster`, scoped to the active organization.
- Correct `effectiveModel` projection for both roster and legacy instance responses.
- Stable roster ordering independent of `AgentInstance.createdAt`.
- Stable frontend node identity based on Agent Definition type.
- Seven employee nodes and three attached capability units even when the database is empty or partial.
- Explicit `instance_missing` and `model_plan_incomplete` states.
- Removal of the duplicated frontend taxonomy.
- Seed behavior that creates missing instances without overwriting existing runtime settings.
- Desktop browser verification and focused cross-layer tests.

## NOT in Scope

- Custom organization-created Agent Definitions. Shipped definitions remain code-owned.
- Automatic writes during roster reads.
- Adding an Agent Instance setup form to `/agent-os`.
- Changing Hermes prompts, tool policies, playbooks, delegation decisions, or runtime adapters.
- Persisting an Agent Definition version on historical runs. That requires a separate replay/audit design.
- Deleting legacy `AgentInstance.role/title` columns or rewriting existing rows.
- Mobile layout work.

## File Structure

### Shared contract

- Modify `packages/shared/src/schemas/agent-os.ts`
  - Adds roster schemas and makes projected `effectiveModel` nullable.
- Modify `packages/shared/src/schemas/agent-os.spec.ts`
  - Locks ready, missing-instance, and incomplete-model response shapes.

### Backend desired-state projection

- Modify `apps/server/src/agent-os/domain/agent-os.types.ts`
  - Adds responsibility, capability owner, and office order to each definition.
- Modify `apps/server/src/agent-os/domain/agent-definition.registry.ts`
  - Stores the complete canonical roster metadata.
- Modify `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`
  - Locks roster order, unique order values, and valid capability owners.
- Modify `apps/server/src/agent-os/application/service/agent-catalog.service.ts`
  - Projects definitions plus nullable instances without writes.
- Modify `apps/server/src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts`
  - Covers empty, partial, stale, unknown, and missing-model states.
- Modify `apps/server/src/agent-os/adapter/in/http/agent-catalog.controller.ts`
  - Adds the organization-scoped roster route.
- Create `apps/server/src/agent-os/adapter/in/http/__tests__/agent-catalog.controller.spec.ts`
  - Locks GET route metadata, organization forwarding, canonical order, and shared-schema conformance.
- Modify `apps/server/src/agent-os/application/service/agent-conversation.service.ts`
  - Converts a failed Operator root request into an explicit 503 instead of a successful null request.
- Modify `apps/server/src/agent-os/application/service/__tests__/agent-conversation.service.spec.ts`
  - Covers missing Operator instance/model failures for new and existing conversations.

### Frontend roster consumption

- Create `apps/web/src/app/agent-os/test-utils/agent-office-fixtures.ts`
  - Provides typed roster-runtime and office-node builders shared by route-local tests.
- Modify `apps/web/src/app/agent-os/lib/agent-os-api.ts`
  - Replaces the office's instance-list call with `listRoster()`.
- Modify `apps/web/src/app/agent-os/hooks/useAgentOffice.ts`
  - Fetches and refreshes the roster projection.
- Modify `apps/web/src/app/agent-os/hooks/useAgentOffice.spec.tsx`
  - Covers canonical selection and command targeting with roster fixtures.
- Modify `apps/web/src/app/agent-os/lib/agent-office-model.ts`
  - Builds nodes from definitions and overlays nullable runtime state.
- Modify `apps/web/src/app/agent-os/lib/agent-office-model.spec.ts`
  - Covers canonical labels, missing instances, stable IDs, ownership, and activity mapping.
- Delete `apps/web/src/app/agent-os/lib/agent-unit-taxonomy.ts`
  - Removes the second roster authority.
- Delete `apps/web/src/app/agent-os/lib/agent-unit-taxonomy.spec.ts`
  - Removes tests for the retired duplicate contract.
- Modify `apps/web/src/app/agent-os/lib/agent-command-presets.ts`
  - Uses Agent type, not environment-specific instance UUID, in delegation hints.
- Modify `apps/web/src/app/agent-os/lib/agent-command-presets.spec.ts`
  - Locks portable command copy.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeMap.tsx`
  - Resolves activity labels through `instanceId -> definition type`.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx`
  - Covers activity display with stable node IDs.
- Modify `apps/web/src/app/agent-os/components/AgentStaffPanel.tsx`
  - Shows `설정 필요` for non-ready employees.
- Modify `apps/web/src/app/agent-os/components/AgentInspector.tsx`
  - Distinguishes runtime configuration from operational status.
- Modify `apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx`
  - Covers missing-runtime presentation.

### Bootstrap and operations

- Modify `apps/server/src/agent-os/seed-agent-os.ts`
  - Preserves existing runtime overrides while ensuring missing rows.
- Modify `scripts/__tests__/seed-agent-os.spec.ts`
  - Locks the non-overwrite behavior.
- Create `apps/server/src/agent-os/__tests__/agent-os-seed.pg.integration.spec.ts`
  - Proves two concurrent seed executions converge to one instance and runtime-state row per definition.
- Modify `docs/runbooks/agent-os-hermes-runtime.md`
  - Documents desired state, actual state, roster semantics, and seed responsibility.

## Desired-State Data Flow

~~~text
Agent Definition Registry                     Organization database
(desired state, code-owned)                    (actual runtime state)

type                                           AgentInstance.id
display title                                  lifecycleStatus
employee/capability role        +-------------- adapterType
responsibility                  |               modelOverride
capability owner                |               trustLevel
office order                    |               policies / run history
        |                        |
        +---- AgentCatalogService.listRoster() -+
                             |
                             v
              GET /api/agent-os/roster
                             |
                             v
                 buildAgentOfficeModel()
                             |
             +---------------+---------------+
             |                               |
       employee node                    attached capability
       id = definition.type             id = definition.type
       instanceId = UUID|null           instanceId = UUID|null
~~~

## State Contract

~~~text
definition present + instance present + complete model plan
  -> configurationStatus = ready
  -> runtime status derives from lifecycle/runs/requests/approvals

definition present + instance absent
  -> configurationStatus = instance_missing
  -> employee remains visible
  -> status = offline

definition present + instance present + unresolved primary/auxiliary model
  -> configurationStatus = model_plan_incomplete
  -> employee remains visible
  -> status = offline

persisted instance without a registered active definition
  -> omitted from roster
  -> historical rows and run history remain untouched
~~~

---

### Task 1: Define the Canonical Roster Contract

**Files:**
- Modify: `packages/shared/src/schemas/agent-os.ts`
- Modify: `packages/shared/src/schemas/agent-os.spec.ts`
- Modify: `apps/server/src/agent-os/domain/agent-os.types.ts`
- Modify: `apps/server/src/agent-os/domain/agent-definition.registry.ts`
- Modify: `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`

**Interfaces:**
- Produces: `AgentRosterConfigurationStatus`.
- Produces: `AgentRosterDefinition`.
- Produces: `AgentRosterRuntime`.
- Produces: `AgentRosterItem`.
- Produces: `AgentRosterResponse`.
- Produces: `AgentDefinitionRecord.officeResponsibility`.
- Produces: `AgentDefinitionRecord.officeOwnerAgentType`.
- Produces: `AgentDefinitionRecord.officeOrder`.

- [ ] **Step 1: Write failing shared-contract tests**

Add these imports and test cases to `packages/shared/src/schemas/agent-os.spec.ts`:

~~~ts
import {
  AgentRosterResponseSchema,
  type AgentRosterResponse,
} from './agent-os';

it('parses a roster with a nullable focused runtime projection', () => {
  const response: AgentRosterResponse = {
    items: [
      {
        definition: {
          type: 'manager',
          name: 'Operator',
          displayName: '운영 총괄',
          operationalRole: 'employee',
          responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
          ownerAgentType: null,
          officeOrder: 100,
        },
        runtime: null,
        configurationStatus: 'instance_missing',
      },
    ],
  };

  expect(AgentRosterResponseSchema.parse(response)).toEqual(response);
});

it('allows an installed runtime whose effective model is unresolved', () => {
  const parsed = AgentRosterResponseSchema.parse({
    items: [
      {
        definition: {
          type: 'sourcing',
          name: 'Sourcing',
          displayName: '소싱 담당',
          operationalRole: 'employee',
          responsibility: '상품 후보와 공급처 신호를 수집하고 기회를 선별한다.',
          ownerAgentType: null,
          officeOrder: 400,
        },
        runtime: {
          instanceId: 'agent-sourcing',
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 0,
          adapterType: 'claude_local',
          modelOverride: null,
          effectiveModel: null,
        },
        configurationStatus: 'model_plan_incomplete',
      },
    ],
  });

  expect(parsed.items[0].runtime?.effectiveModel).toBeNull();
  expect(parsed.items[0].runtime).not.toHaveProperty('title');
  expect(parsed.items[0].runtime).not.toHaveProperty('role');
});
~~~

- [ ] **Step 2: Run the shared test and verify it fails**

Run:

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/agent-os.spec.ts
~~~

Expected: FAIL because the roster schemas do not exist and `effectiveModel` does not accept null.

- [ ] **Step 3: Add the shared roster schemas**

In `packages/shared/src/schemas/agent-os.ts`, change the instance field:

~~~ts
effectiveModel: z.string().nullable(),
~~~

Then add:

~~~ts
export const AgentRosterConfigurationStatusSchema = z.enum([
  'ready',
  'instance_missing',
  'model_plan_incomplete',
]);

export const AgentRosterDefinitionSchema = z.object({
  type: z.string(),
  name: z.string(),
  displayName: z.string(),
  operationalRole: z.enum(['employee', 'capability']),
  responsibility: z.string(),
  ownerAgentType: z.string().nullable(),
  officeOrder: z.number().int().nonnegative(),
});

export const AgentRosterRuntimeSchema = z.object({
  instanceId: z.string(),
  lifecycleStatus: AgentInstanceLifecycleStatusSchema,
  pauseReason: z.string().nullable(),
  trustLevel: z.number().int(),
  adapterType: z.string(),
  modelOverride: z.string().nullable(),
  effectiveModel: z.string().nullable(),
});

export const AgentRosterItemSchema = z.object({
  definition: AgentRosterDefinitionSchema,
  runtime: AgentRosterRuntimeSchema.nullable(),
  configurationStatus: AgentRosterConfigurationStatusSchema,
});

export const AgentRosterResponseSchema = z.object({
  items: z.array(AgentRosterItemSchema),
});
~~~

Export inferred types beside the existing Agent OS type exports:

~~~ts
export type AgentRosterConfigurationStatus = z.infer<
  typeof AgentRosterConfigurationStatusSchema
>;
export type AgentRosterDefinition = z.infer<typeof AgentRosterDefinitionSchema>;
export type AgentRosterRuntime = z.infer<typeof AgentRosterRuntimeSchema>;
export type AgentRosterItem = z.infer<typeof AgentRosterItemSchema>;
export type AgentRosterResponse = z.infer<typeof AgentRosterResponseSchema>;
~~~

- [ ] **Step 4: Write the failing registry invariants test**

Add to `apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts`:

~~~ts
it('owns the complete deterministic office roster', () => {
  const definitions = listAgentDefinitions()
    .filter((definition) => definition.catalogStatus === 'active')
    .sort((left, right) => left.officeOrder - right.officeOrder);

  expect(definitions.map((definition) => definition.type)).toEqual([
    'manager',
    'rules_evaluation',
    'rules_suggest',
    'ad_strategy',
    'chat',
    'sourcing',
    'listing',
    'thumbnail_analyst',
    'order',
    'channel_registration',
  ]);
  expect(new Set(definitions.map((definition) => definition.officeOrder)).size)
    .toBe(definitions.length);

  const definitionsByType = new Map(
    definitions.map((definition) => [definition.type, definition]),
  );
  for (const definition of definitions) {
    if (definition.defaultInstanceRole === 'employee') {
      expect(definition.officeOwnerAgentType).toBeNull();
      continue;
    }
    const owner = definitionsByType.get(definition.officeOwnerAgentType ?? '');
    expect(owner?.defaultInstanceRole).toBe('employee');
  }
});
~~~

- [ ] **Step 5: Add canonical office metadata to backend definitions**

Add these fields to `AgentDefinitionRecord` in `agent-os.types.ts`:

~~~ts
officeResponsibility: string;
officeOwnerAgentType: string | null;
officeOrder: number;
~~~

Put the office fields directly on each matching object in `DEFINITIONS`. Do not
create a second `OFFICE_METADATA` table. Use these exact values:

| Type | `officeResponsibility` | `officeOwnerAgentType` | `officeOrder` |
|---|---|---:|---:|
| `manager` | `운영 우선순위, 위임, 승인 흐름을 총괄한다.` | `null` | `100` |
| `rules_evaluation` | `운영 룰을 데이터에 적용해 통과/보류 판단을 만든다.` | `manager` | `110` |
| `rules_suggest` | `성과 분포를 바탕으로 운영 룰 임계값 후보를 제안한다.` | `manager` | `120` |
| `ad_strategy` | `광고 성과 신호를 분석하고 조정안을 제안한다.` | `null` | `200` |
| `chat` | `운영자가 묻는 내용을 맥락화하고 대화형 응답을 제공한다.` | `null` | `300` |
| `sourcing` | `상품 후보와 공급처 신호를 수집하고 기회를 선별한다.` | `null` | `400` |
| `listing` | `상세페이지, 썸네일, 마켓 등록 초안 패키지를 만든다.` | `null` | `500` |
| `thumbnail_analyst` | `썸네일 품질과 컴플라이언스 리스크를 분석한다.` | `listing` | `510` |
| `order` | `승인된 상품의 발주 초안과 공급 실행 단계를 관리한다.` | `null` | `600` |
| `channel_registration` | `마켓별 상품 등록 상태와 외부 채널 식별자를 관리한다.` | `null` | `700` |

Example for the existing manager definition:

~~~ts
officeResponsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
officeOwnerAgentType: null,
officeOrder: 100,
~~~

- [ ] **Step 6: Run focused contract and registry tests**

Run:

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/agent-os.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/domain/__tests__/agent-definition.registry.spec.ts
~~~

Expected: both suites PASS.

- [ ] **Step 7: Commit Task 1**

~~~bash
rtk git add packages/shared/src/schemas/agent-os.ts packages/shared/src/schemas/agent-os.spec.ts apps/server/src/agent-os/domain/agent-os.types.ts apps/server/src/agent-os/domain/agent-definition.registry.ts apps/server/src/agent-os/domain/__tests__/agent-definition.registry.spec.ts
rtk git commit -m "feat: define canonical agent os roster"
~~~

---

### Task 2: Add the Roster API and Explicit Operator Failure

**Files:**
- Modify: `apps/server/src/agent-os/application/service/agent-catalog.service.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/http/agent-catalog.controller.ts`
- Create: `apps/server/src/agent-os/adapter/in/http/__tests__/agent-catalog.controller.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-conversation.service.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-conversation.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `AgentRosterResponse`, `AgentRosterRuntime`, and definition metadata.
- Produces: `AgentCatalogService.listRoster({ organizationId }): Promise<AgentRosterResponse>`.
- Produces: `GET /api/agent-os/roster`.
- Produces: HTTP 503 with code `agent_operator_unavailable` when an Operator request is not created.
- Preserves: `GET /api/agent-os/instances` for runtime/admin consumers.

- [ ] **Step 1: Write failing service tests for empty, partial, and incomplete databases**

Import `AgentRosterResponseSchema` and add these cases to
`agent-catalog.service.spec.ts`:

~~~ts
import { AgentRosterResponseSchema } from '@kiditem/shared/agent-os';

const CANONICAL_TYPES = [
  'manager',
  'rules_evaluation',
  'rules_suggest',
  'ad_strategy',
  'chat',
  'sourcing',
  'listing',
  'thumbnail_analyst',
  'order',
  'channel_registration',
] as const;

it('returns every active definition when the organization has no instances', async () => {
  const repository = { listInstances: vi.fn().mockResolvedValue([]) };
  const service = new AgentCatalogService(repository as never, {} as never);

  const roster = await service.listRoster({ organizationId: ORG });

  expect(repository.listInstances).toHaveBeenCalledWith({ organizationId: ORG });
  expect(roster.items.map((item) => item.definition.type)).toEqual(CANONICAL_TYPES);
  expect(roster.items.filter((item) =>
    item.definition.operationalRole === 'employee',
  )).toHaveLength(7);
  expect(roster.items.filter((item) =>
    item.definition.operationalRole === 'capability',
  )).toHaveLength(3);
  expect(roster.items.every((item) =>
    item.configurationStatus === 'instance_missing' && item.runtime === null,
  )).toBe(true);
  expect(AgentRosterResponseSchema.parse(roster)).toEqual(roster);
});

it('overlays focused runtime state without exposing stale roster fields', async () => {
  vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
  const repository = {
    listInstances: vi.fn().mockResolvedValue([
      {
        ...instance('manager', 'agent-manager'),
        name: 'Legacy CEO',
        role: 'specialist',
        title: '대표실',
        adapterType: 'hermes_local',
      },
      instance('removed_definition', 'agent-removed'),
    ]),
  };
  const service = new AgentCatalogService(repository as never, {} as never);

  const roster = await service.listRoster({ organizationId: ORG });
  const manager = roster.items.find(
    (item) => item.definition.type === 'manager',
  );

  expect(manager).toMatchObject({
    definition: {
      type: 'manager',
      displayName: '운영 총괄',
      operationalRole: 'employee',
      officeOrder: 100,
    },
    runtime: {
      instanceId: 'agent-manager',
      adapterType: 'hermes_local',
      effectiveModel: 'gpt-5.4',
    },
    configurationStatus: 'ready',
  });
  expect(manager?.runtime).not.toHaveProperty('name');
  expect(manager?.runtime).not.toHaveProperty('role');
  expect(manager?.runtime).not.toHaveProperty('title');
  expect(manager?.runtime).not.toHaveProperty('reportsToId');
  expect(roster.items.map((item) => item.definition.type))
    .not.toContain('removed_definition');
});

it('keeps an installed agent visible when its model plan is incomplete', async () => {
  const repository = {
    listInstances: vi.fn().mockResolvedValue([
      {
        ...instance('manager', 'agent-manager'),
        adapterType: 'claude_local',
        modelOverride: null,
      },
    ]),
  };
  const service = new AgentCatalogService(repository as never, {} as never);

  const roster = await service.listRoster({ organizationId: ORG });
  const manager = roster.items.find(
    (item) => item.definition.type === 'manager',
  );

  expect(manager?.runtime?.effectiveModel).toBeNull();
  expect(manager?.configurationStatus).toBe('model_plan_incomplete');
  expect(AgentRosterResponseSchema.safeParse(roster).success).toBe(true);
});
~~~

- [ ] **Step 2: Run the focused catalog suite and verify it fails**

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts
~~~

Expected: FAIL because `listRoster()` and the focused runtime projection do not exist.

- [ ] **Step 3: Add separate legacy and roster runtime projectors**

Import `AgentInstanceSummary`, `AgentRosterResponse`, and `AgentRosterRuntime`
from `@kiditem/shared/agent-os`. Keep the full projector only for the legacy
instances endpoint, and add a structurally narrower roster projector:

~~~ts
function effectiveModelFor(
  instance: AgentInstanceRecord,
  definition: AgentDefinitionRecord,
): string | null {
  return resolveEffectiveModel({
    definitionDefault: resolveDefinitionDefaultModel(definition),
    instanceOverride: instance.modelOverride,
  });
}

function projectInstanceSummary(
  instance: AgentInstanceRecord,
  definition: AgentDefinitionRecord,
): AgentInstanceSummary {
  return {
    id: instance.id,
    organizationId: instance.organizationId,
    type: instance.type,
    name: instance.name,
    role: instance.role,
    title: instance.title,
    icon: instance.icon,
    reportsToId: instance.reportsToId,
    lifecycleStatus: instance.lifecycleStatus,
    pauseReason: instance.pauseReason,
    trustLevel: instance.trustLevel,
    adapterType: instance.adapterType,
    modelOverride: instance.modelOverride,
    effectiveModel: effectiveModelFor(instance, definition),
  } satisfies AgentInstanceSummary;
}

function projectRosterRuntime(
  instance: AgentInstanceRecord,
  definition: AgentDefinitionRecord,
): AgentRosterRuntime {
  return {
    instanceId: instance.id,
    lifecycleStatus: instance.lifecycleStatus,
    pauseReason: instance.pauseReason,
    trustLevel: instance.trustLevel,
    adapterType: instance.adapterType,
    modelOverride: instance.modelOverride,
    effectiveModel: effectiveModelFor(instance, definition),
  } satisfies AgentRosterRuntime;
}
~~~

Change its signature to
`Promise<AgentInstanceSummary[]>`, resolve each registered definition, and
return `projectInstanceSummary(instance, definition)`. This closes the existing
shared-contract mismatch while preserving the legacy endpoint's full shape.

- [ ] **Step 4: Implement the single-query, registry-driven roster join**

Add:

~~~ts
async listRoster(input: {
  organizationId: string;
}): Promise<AgentRosterResponse> {
  const instances = await this.repository.listInstances(input);
  const instancesByType = new Map(
    instances.map((instance) => [instance.type, instance]),
  );
  const definitions = listAgentDefinitions()
    .filter((definition) => definition.catalogStatus === 'active')
    .sort((left, right) => left.officeOrder - right.officeOrder);

  return {
    items: definitions.map((definition) => {
      const instance = instancesByType.get(definition.type) ?? null;
      const runtime = instance
        ? projectRosterRuntime(instance, definition)
        : null;
      const modelPlan = runtime?.effectiveModel
        ? resolveDefinitionModelPlan(definition, runtime.effectiveModel)
        : { modelPlan: null };
      const configurationStatus = runtime === null
        ? 'instance_missing'
        : modelPlan.modelPlan === null
          ? 'model_plan_incomplete'
          : 'ready';

      return {
        definition: {
          type: definition.type,
          name: definition.name,
          displayName: definition.defaultInstanceTitle,
          operationalRole: definition.defaultInstanceRole,
          responsibility: definition.officeResponsibility,
          ownerAgentType: definition.officeOwnerAgentType,
          officeOrder: definition.officeOrder,
        },
        runtime,
        configurationStatus,
      };
    }),
  } satisfies AgentRosterResponse;
}
~~~

This method performs one organization-scoped instance query and one in-memory
join over ten definitions. It must not call `createInstanceWithRuntimeState()`,
`updateInstance()`, or the seed.

- [ ] **Step 5: Write the failing controller/schema contract test**

Create `agent-catalog.controller.spec.ts`:

~~~ts
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AgentRosterResponseSchema } from '@kiditem/shared/agent-os';
import { describe, expect, it, vi } from 'vitest';
import { AgentCatalogService } from '../../../../application/service/agent-catalog.service';
import { AgentCatalogController } from '../agent-catalog.controller';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANONICAL_TYPES = [
  'manager', 'rules_evaluation', 'rules_suggest', 'ad_strategy', 'chat',
  'sourcing', 'listing', 'thumbnail_analyst', 'order', 'channel_registration',
];

it('exposes GET /agent-os/roster and forwards the active organization', async () => {
  expect(Reflect.getMetadata(PATH_METADATA, AgentCatalogController)).toBe('agent-os');
  const handler = Reflect.get(
    AgentCatalogController.prototype,
    'listRoster',
  ) as object;
  expect({
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    path: Reflect.getMetadata(PATH_METADATA, handler),
  }).toEqual({ method: RequestMethod.GET, path: 'roster' });

  const repository = { listInstances: vi.fn().mockResolvedValue([]) };
  const service = new AgentCatalogService(repository as never, {} as never);
  const controller = new AgentCatalogController(service);
  const response = await controller.listRoster(ORG);

  expect(repository.listInstances).toHaveBeenCalledWith({ organizationId: ORG });
  expect(response.items.map((item) => item.definition.type)).toEqual(CANONICAL_TYPES);
  expect(AgentRosterResponseSchema.parse(response)).toEqual(response);
});
~~~

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/in/http/__tests__/agent-catalog.controller.spec.ts
~~~

Expected: FAIL because `AgentCatalogController.listRoster()` is not defined.

- [ ] **Step 6: Expose the organization-scoped HTTP route**

Add to `AgentCatalogController`:

~~~ts
@Get('roster')
listRoster(@CurrentOrganization() organizationId: string) {
  return this.catalog.listRoster({ organizationId });
}
~~~

- [ ] **Step 7: Write failing conversation tests for a missing Operator request**

Import `ServiceUnavailableException` and add both paths to
`agent-conversation.service.spec.ts`:

~~~ts
import { ServiceUnavailableException } from '@nestjs/common';

it('returns 503 when a new conversation cannot enqueue Operator', async () => {
  const repository = {
    createConversation: vi.fn().mockResolvedValue({ id: 'conversation-1' }),
    createMessage: vi.fn().mockResolvedValue({ id: 'message-1' }),
    updateConversationRootRequest: vi.fn(),
  } as unknown as AgentOsRepositoryPort;
  const runner = {
    runByType: vi.fn().mockResolvedValue({
      ok: false,
      agentType: 'manager',
      reason: 'agent_instance_not_found',
    }),
  } as unknown as AgentRunnerPort;
  const service = new AgentConversationService(
    repository,
    runner,
    { delegate: vi.fn() } as unknown as AgentTaskDelegationService,
  );

  const error = await service.startConversation({
    organizationId: 'org-1',
    userId: 'user-1',
    content: '상품 후보를 찾아줘',
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ServiceUnavailableException);
  expect((error as ServiceUnavailableException).getStatus()).toBe(503);
  expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
    code: 'agent_operator_unavailable',
    reason: 'agent_instance_not_found',
  });
  expect(repository.updateConversationRootRequest).not.toHaveBeenCalled();
});

it('returns 503 when an existing conversation cannot enqueue Operator', async () => {
  const repository = {
    findConversationById: vi.fn().mockResolvedValue({ id: 'conversation-1' }),
    createMessage: vi.fn().mockResolvedValue({ id: 'message-2' }),
  } as unknown as AgentOsRepositoryPort;
  const runner = {
    runByType: vi.fn().mockResolvedValue({
      ok: false,
      agentType: 'manager',
      reason: 'agent_instance_paused',
    }),
  } as unknown as AgentRunnerPort;
  const service = new AgentConversationService(
    repository,
    runner,
    { delegate: vi.fn() } as unknown as AgentTaskDelegationService,
  );

  const error = await service.sendMessage({
    organizationId: 'org-1',
    userId: 'user-1',
    conversationId: 'conversation-1',
    content: '계속 진행해줘',
  }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ServiceUnavailableException);
  expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
    code: 'agent_operator_unavailable',
    reason: 'agent_instance_paused',
  });
});
~~~

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/__tests__/agent-conversation.service.spec.ts
~~~

Expected: FAIL because both methods currently return HTTP-success data with
`rootRequestId: null` when `runByType()` fails.

- [ ] **Step 8: Convert failed Operator enqueue results into HTTP 503**

Import `ServiceUnavailableException` and `AgentRunnerResult`, then add:

~~~ts
function requireOperatorRequestId(result: AgentRunnerResult): string {
  if (result.ok && result.requestId) return result.requestId;

  throw new ServiceUnavailableException({
    code: 'agent_operator_unavailable',
    message: 'Operator is not configured for this organization.',
    reason: result.reason ?? 'operator_request_not_created',
  });
}
~~~

In both `startConversation()` and `sendMessage()`, replace nullable handling
with:

~~~ts
const rootRequestId = requireOperatorRequestId(root);
~~~

For `startConversation()`, always call `updateConversationRootRequest()` with
that value. Return `rootRequestId` directly from both methods. A failed start
may leave the already-recorded conversation and user message for audit and
retry, but it must never claim that work was accepted.

- [ ] **Step 9: Run backend tests and organization-scope guards**

Run:

~~~bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/domain/__tests__/agent-definition.registry.spec.ts src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts src/agent-os/adapter/in/http/__tests__/agent-catalog.controller.spec.ts src/agent-os/application/service/__tests__/agent-conversation.service.spec.ts
rtk npm run check:idor
rtk npm run check:tenant-scope
~~~

Expected: all commands PASS; the controller contract proves route metadata,
canonical order, schema conformance, and active-organization forwarding.

- [ ] **Step 10: Commit Task 2**

~~~bash
rtk git add apps/server/src/agent-os/application/service/agent-catalog.service.ts apps/server/src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts apps/server/src/agent-os/adapter/in/http/agent-catalog.controller.ts apps/server/src/agent-os/adapter/in/http/__tests__/agent-catalog.controller.spec.ts apps/server/src/agent-os/application/service/agent-conversation.service.ts apps/server/src/agent-os/application/service/__tests__/agent-conversation.service.spec.ts
rtk git commit -m "feat: expose definition-owned agent roster"
~~~

---

### Task 3: Build the Office Model from Definition Identity

**Files:**
- Create: `apps/web/src/app/agent-os/test-utils/agent-office-fixtures.ts`
- Modify: `apps/web/src/app/agent-os/lib/agent-office-model.ts`
- Modify: `apps/web/src/app/agent-os/lib/agent-office-model.spec.ts`
- Delete: `apps/web/src/app/agent-os/lib/agent-unit-taxonomy.ts`
- Delete: `apps/web/src/app/agent-os/lib/agent-unit-taxonomy.spec.ts`

**Interfaces:**
- Consumes: `BuildAgentOfficeModelInput.roster: AgentRosterItem[]`.
- Produces: `AgentOfficeNode.id = definition.type` and nullable `instanceId`.
- Produces: `resolveAgentOfficeNodeStatus(input): AgentOfficeNodeStatus`.
- Produces: `makeAgentRosterItem()` and `makeAgentOfficeNode()` for route-local tests.

- [ ] **Step 1: Add shared route-local fixture builders**

Create `agent-office-fixtures.ts`:

~~~ts
import type {
  AgentRosterConfigurationStatus,
  AgentRosterDefinition,
  AgentRosterItem,
  AgentRosterRuntime,
} from '@kiditem/shared/agent-os';
import type { AgentOfficeNode } from '../lib/agent-office-model';

interface AgentRosterItemOverrides {
  definition?: Partial<AgentRosterDefinition>;
  runtime?: AgentRosterRuntime | null;
  configurationStatus?: AgentRosterConfigurationStatus;
}

const DEFAULT_RUNTIME: AgentRosterRuntime = {
  instanceId: 'agent-manager',
  lifecycleStatus: 'active',
  pauseReason: null,
  trustLevel: 1,
  adapterType: 'hermes_local',
  modelOverride: null,
  effectiveModel: 'gpt-5.4',
};

export function makeAgentRosterItem(
  overrides: AgentRosterItemOverrides = {},
): AgentRosterItem {
  return {
    definition: {
      type: 'manager',
      name: 'Operator',
      displayName: '운영 총괄',
      operationalRole: 'employee',
      responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
      ownerAgentType: null,
      officeOrder: 100,
      ...overrides.definition,
    },
    runtime: overrides.runtime === undefined
      ? { ...DEFAULT_RUNTIME }
      : overrides.runtime,
    configurationStatus: overrides.configurationStatus ?? 'ready',
  };
}

export function makeAgentOfficeNode(
  overrides: Partial<AgentOfficeNode> = {},
): AgentOfficeNode {
  return {
    id: 'manager',
    instanceId: 'agent-manager',
    name: 'Operator',
    agentType: 'manager',
    displayName: '운영 총괄',
    responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
    configurationStatus: 'ready',
    status: 'idle',
    activeRunCount: 0,
    pendingApprovalCount: 0,
    lastActivityAt: null,
    trustLevel: 1,
    adapterType: 'hermes_local',
    effectiveModel: 'gpt-5.4',
    capabilities: [],
    ...overrides,
  };
}
~~~

- [ ] **Step 2: Write failing model and state-decision tests**

Import `makeAgentRosterItem` and replace local instance factories. Add this
canonical missing-runtime regression:

~~~ts
it('keeps canonical employees visible without runtime instances', () => {
  const model = buildAgentOfficeModel({
    roster: [
      makeAgentRosterItem({
        runtime: null,
        configurationStatus: 'instance_missing',
      }),
      makeAgentRosterItem({
        definition: {
          type: 'sourcing',
          name: 'Sourcing',
          displayName: '소싱 담당',
          responsibility: '상품 후보와 공급처 신호를 수집한다.',
          officeOrder: 400,
        },
        runtime: null,
        configurationStatus: 'instance_missing',
      }),
    ],
    runs: [],
    requests: [],
    approvals: [],
    conversations: [],
    costEvents: [],
    authorizationEvents: [],
    totalCostMicros: '0',
  });

  expect(model.nodes).toMatchObject([
    {
      id: 'manager',
      instanceId: null,
      displayName: '운영 총괄',
      configurationStatus: 'instance_missing',
      status: 'offline',
    },
    {
      id: 'sourcing',
      instanceId: null,
      displayName: '소싱 담당',
      configurationStatus: 'instance_missing',
      status: 'offline',
    },
  ]);
});

it.each([
  ['missing instance', null, 'instance_missing', 1, 1, 1, 'offline'],
  ['incomplete model', { lifecycleStatus: 'active' }, 'model_plan_incomplete', 1, 1, 1, 'offline'],
  ['paused lifecycle', { lifecycleStatus: 'paused' }, 'ready', 1, 1, 1, 'offline'],
  ['pending approval wins', { lifecycleStatus: 'active' }, 'ready', 1, 1, 1, 'blocked'],
  ['running wins over waiting', { lifecycleStatus: 'active' }, 'ready', 1, 1, 0, 'working'],
  ['waiting', { lifecycleStatus: 'active' }, 'ready', 0, 1, 0, 'waiting'],
  ['idle', { lifecycleStatus: 'active' }, 'ready', 0, 0, 0, 'idle'],
] as const)(
  '%s',
  (_label, runtimePatch, configurationStatus, activeRunCount,
    waitingRequestCount, pendingApprovalCount, expected) => {
    const runtime = runtimePatch === null
      ? null
      : { ...makeAgentRosterItem().runtime!, ...runtimePatch };

    expect(resolveAgentOfficeNodeStatus({
      runtime,
      configurationStatus,
      activeRunCount,
      waitingRequestCount,
      pendingApprovalCount,
    })).toBe(expected);
  },
);
~~~

Update the capability test so `thumbnail_analyst` is attached through
`definition.ownerAgentType === 'listing'`; do not set or inspect a persisted
`reportsToId`.

- [ ] **Step 3: Run the model suite and verify it fails**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-model.spec.ts
~~~

Expected: FAIL because the builder still accepts `instances` and imports the frontend taxonomy.

- [ ] **Step 4: Change the office model boundary and status resolver**

Replace the `AgentInstanceSummary` and taxonomy imports with
`AgentRosterConfigurationStatus`, `AgentRosterItem`, and `AgentRosterRuntime`.
Update the model types:

~~~ts
export interface AgentOfficeNode {
  id: string;
  instanceId: string | null;
  name: string;
  agentType: string;
  displayName: string;
  responsibility: string;
  configurationStatus: AgentRosterConfigurationStatus;
  status: AgentOfficeNodeStatus;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
  trustLevel: number | null;
  adapterType: string | null;
  effectiveModel: string | null;
  capabilities: AgentOfficeCapability[];
}

export interface AgentOfficeCapability {
  id: string;
  instanceId: string | null;
  name: string;
  agentType: string;
  displayName: string;
  responsibility: string;
  ownerAgentType: string | null;
  ownerNodeId: string | null;
  configurationStatus: AgentRosterConfigurationStatus;
  status: AgentOfficeNodeStatus;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
}
~~~

Replace `BuildAgentOfficeModelInput.instances` with:

~~~ts
roster: AgentRosterItem[];
~~~

Replace `statusFor()` with the explicit priority function:

~~~ts
export function resolveAgentOfficeNodeStatus(input: {
  runtime: AgentRosterRuntime | null;
  configurationStatus: AgentRosterConfigurationStatus;
  activeRunCount: number;
  waitingRequestCount: number;
  pendingApprovalCount: number;
}): AgentOfficeNodeStatus {
  if (input.runtime === null) return 'offline';
  if (input.configurationStatus !== 'ready') return 'offline';
  if (input.runtime.lifecycleStatus !== 'active') return 'offline';
  if (input.pendingApprovalCount > 0) return 'blocked';
  if (input.activeRunCount > 0) return 'working';
  if (input.waitingRequestCount > 0) return 'waiting';
  return 'idle';
}
~~~

- [ ] **Step 5: Build units from definition identity and focused runtime state**

Sort roster items by `officeOrder`, then build each unit:

~~~ts
const units = [...input.roster]
  .sort((left, right) =>
    left.definition.officeOrder - right.definition.officeOrder,
  )
  .map((item) => {
    const { definition, runtime } = item;
    const instanceId = runtime?.instanceId ?? null;
    const runs = instanceId ? runsByAgent.get(instanceId) ?? [] : [];
    const requests = instanceId ? requestsByAgent.get(instanceId) ?? [] : [];
    const approvals = instanceId ? approvalsByAgent.get(instanceId) ?? [] : [];
    const runningRunCount = runs.filter((run) => run.status === 'running').length;
    const claimedRequestCount = requests.filter(
      (request) => request.status === 'claimed',
    ).length;
    const activeRunCount = runningRunCount > 0
      ? runningRunCount
      : claimedRequestCount;
    const waitingRequestCount = requests.filter(
      (request) => request.status === 'pending',
    ).length;
    const pendingApprovalCount = approvals.filter(
      (approval) => approval.status === 'pending',
    ).length;

    return {
      id: definition.type,
      instanceId,
      name: definition.name,
      agentType: definition.type,
      displayName: definition.displayName,
      responsibility: definition.responsibility,
      role: definition.operationalRole,
      ownerAgentType: definition.ownerAgentType,
      configurationStatus: item.configurationStatus,
      runtime,
      activeRunCount,
      waitingRequestCount,
      pendingApprovalCount,
      lastActivityAt: latestDate([
        ...runs.map((run) => run.finishedAt ?? run.startedAt),
        ...requests.map((request) =>
          request.finishedAt ?? request.claimedAt ??
          request.scheduledFor ?? request.createdAt,
        ),
        ...approvals.map((approval) => approval.updatedAt),
      ]),
      status: resolveAgentOfficeNodeStatus({
        runtime,
        configurationStatus: item.configurationStatus,
        activeRunCount,
        waitingRequestCount,
        pendingApprovalCount,
      }),
    };
  });
~~~

Keep capability ownership keyed by `ownerAgentType -> employee definition.type`.
Populate node runtime fields with `unit.runtime?.trustLevel ?? null`,
`unit.runtime?.adapterType ?? null`, and
`unit.runtime?.effectiveModel ?? null`.

- [ ] **Step 6: Remove the duplicate frontend taxonomy**

Delete:

~~~text
apps/web/src/app/agent-os/lib/agent-unit-taxonomy.ts
apps/web/src/app/agent-os/lib/agent-unit-taxonomy.spec.ts
~~~

Remove all imports of `resolveAgentUnitTaxonomy` and `AgentUnitOperationalRole`. Use `AgentRosterDefinition.operationalRole` directly.

- [ ] **Step 7: Run model and duplicate-authority checks**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-model.spec.ts
rtk rg -n "agent-unit-taxonomy|resolveAgentUnitTaxonomy|AgentUnitOperationalRole" apps/web/src/app/agent-os
~~~

Expected: the Vitest suite PASSes and ripgrep returns no matches.

- [ ] **Step 8: Commit Task 3**

~~~bash
rtk git add apps/web/src/app/agent-os/test-utils/agent-office-fixtures.ts apps/web/src/app/agent-os/lib/agent-office-model.ts apps/web/src/app/agent-os/lib/agent-office-model.spec.ts apps/web/src/app/agent-os/lib/agent-unit-taxonomy.ts apps/web/src/app/agent-os/lib/agent-unit-taxonomy.spec.ts
rtk git commit -m "refactor: derive agent office from roster definitions"
~~~

---

### Task 4: Switch the Office Query and Preserve Interaction Semantics

**Files:**
- Modify: `apps/web/src/app/agent-os/lib/agent-os-api.ts`
- Modify: `apps/web/src/app/agent-os/hooks/useAgentOffice.ts`
- Modify: `apps/web/src/app/agent-os/hooks/useAgentOffice.spec.tsx`
- Modify: `apps/web/src/app/agent-os/lib/agent-command-presets.ts`
- Modify: `apps/web/src/app/agent-os/lib/agent-command-presets.spec.ts`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeMap.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx`

**Interfaces:**
- Produces: `agentOsApi.listRoster(): Promise<AgentRosterResponse>`.
- Preserves: command targeting by Agent type.
- Removes: environment-specific instance UUID from operator command text.
- Prevents: create/send API calls when Operator or the selected employee is not ready.

- [ ] **Step 1: Update hook tests to mock a roster**

Rename `listInstancesMock` to `listRosterMock`, mock the user-facing toast, and
import the Task 3 fixture:

~~~ts
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

import { makeAgentRosterItem } from '../test-utils/agent-office-fixtures';

listRosterMock.mockResolvedValue({
  items: [makeAgentRosterItem()],
});
~~~

Change the selection assertion to:

~~~ts
expect(result.current.selectedNodeId).toBe('manager');
~~~

Change the delegation text assertion so it contains the display name and type but no `대상 직원 ID` line.

Add both command guards:

~~~ts
it('does not submit when Operator runtime is missing', async () => {
  listRosterMock.mockResolvedValue({
    items: [makeAgentRosterItem({
      runtime: null,
      configurationStatus: 'instance_missing',
    })],
  });
  const { result } = renderHook(() => useAgentOffice(), { wrapper });
  await waitFor(() => expect(result.current.isPending).toBe(false));

  act(() => result.current.setCommand('운영 현황을 정리해줘'));
  act(() => result.current.submitCommand());

  expect(createConversationMock).not.toHaveBeenCalled();
  expect(sendMessageMock).not.toHaveBeenCalled();
  expect(toastErrorMock).toHaveBeenCalledWith(
    '운영 총괄의 실행 설정이 필요합니다.',
  );
});

it('does not submit to an unconfigured selected employee', async () => {
  listRosterMock.mockResolvedValue({
    items: [
      makeAgentRosterItem(),
      makeAgentRosterItem({
        definition: {
          type: 'sourcing',
          name: 'Sourcing',
          displayName: '소싱 담당',
          responsibility: '상품 후보를 선별한다.',
          officeOrder: 400,
        },
        runtime: null,
        configurationStatus: 'instance_missing',
      }),
    ],
  });
  const { result } = renderHook(() => useAgentOffice(), { wrapper });
  await waitFor(() => expect(result.current.isPending).toBe(false));

  act(() => {
    result.current.setSelectedNodeId('sourcing');
    result.current.setCommand('신규 상품 후보를 정리해줘');
  });
  act(() => result.current.submitCommand());

  expect(createConversationMock).not.toHaveBeenCalled();
  expect(sendMessageMock).not.toHaveBeenCalled();
  expect(toastErrorMock).toHaveBeenCalledWith(
    '소싱 담당의 실행 설정이 필요합니다.',
  );
});

it('surfaces a roster request failure through the hook error contract', async () => {
  listRosterMock.mockRejectedValue(new Error('roster unavailable'));
  const { result } = renderHook(() => useAgentOffice(), { wrapper });

  await waitFor(() => {
    expect(result.current.error).toMatchObject({
      message: 'roster unavailable',
    });
  });
});
~~~

- [ ] **Step 2: Run hook and command tests to verify they fail**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/hooks/useAgentOffice.spec.tsx src/app/agent-os/lib/agent-command-presets.spec.ts
~~~

Expected: FAIL because the API and model still use instance arrays, UUID
command hints remain, and unconfigured employees still submit mutations.

- [ ] **Step 3: Add the roster API and hook query**

Import `AgentRosterResponse` in `agent-os-api.ts`, then add:

~~~ts
listRoster: () =>
  apiClient.get<AgentRosterResponse>('/api/agent-os/roster'),
~~~

Remove `listInstances()` from this route-local API after confirming no remaining consumer:

~~~bash
rtk rg -n "listInstances\(" apps/web/src
~~~

In `useAgentOffice.ts`, replace `instancesQuery` with:

~~~ts
const rosterQuery = useQuery({
  queryKey: [...queryKeys.agents.hq(), 'roster'],
  queryFn: () => agentOsApi.listRoster(),
  staleTime: 60_000,
});
~~~

Call the builder with:

~~~ts
roster: rosterQuery.data?.items ?? [],
~~~

Use `rosterQuery` consistently in pending, fetching, error, refresh, and memo dependency lists.

- [ ] **Step 4: Make delegation hints environment-independent**

Change `AgentCommandTarget` to:

~~~ts
export interface AgentCommandTarget {
  agentType: string;
  displayName: string;
}
~~~

Return only these fields from `commandTargetFromNode()`. Build the delegation command as:

~~~ts
return [
  '[Agent OS 업무 배정 요청]',
  `대상 직원: ${input.target.displayName}`,
  `대상 직원 유형: ${input.target.agentType}`,
  `업무: ${content}`,
].join('\n');
~~~

This preserves the orchestration key used by Hermes while removing a UUID that differs by organization and environment.

- [ ] **Step 5: Guard command submission by roster readiness**

Import `toast` from `sonner`. After building non-empty command content, resolve
the Operator and enforce both readiness checks before calling a mutation:

~~~ts
const operator = model.nodes.find((node) => node.agentType === 'manager') ?? null;

if (!operator || operator.configurationStatus !== 'ready') {
  toast.error('운영 총괄의 실행 설정이 필요합니다.');
  return;
}

if (selectedNode && selectedNode.configurationStatus !== 'ready') {
  toast.error(`${selectedNode.displayName}의 실행 설정이 필요합니다.`);
  return;
}
~~~

Keep the existing create-versus-send branch after these guards. The selected
node's stable definition type remains the delegation target; runtime UUID is
used only for joining activity data.

- [ ] **Step 6: Map activity labels through runtime instance IDs**

In `AgentOfficeMap.tsx`, create a lookup from installed runtime IDs to stable node IDs:

~~~ts
const nodeIdByInstanceId = new Map(
  model.nodes.flatMap((node) =>
    node.instanceId ? [[node.instanceId, node.id] as const] : [],
  ),
);
~~~

When processing activities, resolve `activity.agentInstanceId` through this map before assigning a label. Add a component test where:

~~~ts
node.id === 'manager'
node.instanceId === 'agent-manager'
activity.agentInstanceId === 'agent-manager'
~~~

and assert that the manager avatar receives the latest activity label.

- [ ] **Step 7: Run focused interaction tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/hooks/useAgentOffice.spec.tsx src/app/agent-os/lib/agent-command-presets.spec.ts src/app/agent-os/components/AgentOfficeMap.spec.tsx
~~~

Expected: all suites PASS.

- [ ] **Step 8: Commit Task 4**

~~~bash
rtk git add apps/web/src/app/agent-os/lib/agent-os-api.ts apps/web/src/app/agent-os/hooks/useAgentOffice.ts apps/web/src/app/agent-os/hooks/useAgentOffice.spec.tsx apps/web/src/app/agent-os/lib/agent-command-presets.ts apps/web/src/app/agent-os/lib/agent-command-presets.spec.ts apps/web/src/app/agent-os/components/AgentOfficeMap.tsx apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx
rtk git commit -m "feat: consume the canonical agent roster"
~~~

---

### Task 5: Present Missing Runtime Configuration Clearly

**Files:**
- Modify: `apps/web/src/app/agent-os/components/AgentStaffPanel.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentInspector.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeAvatar.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx`
- Modify: `apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts`
- Modify: `apps/web/src/app/agent-os/__tests__/page.spec.tsx`

**Interfaces:**
- Consumes: `AgentOfficeNode.configurationStatus`.
- Produces: visible `설정 필요` state without removing the employee.

- [ ] **Step 1: Write the failing panel test**

Import the Task 3 fixture and add to `AgentOfficePanels.spec.tsx`:

~~~ts
import { makeAgentOfficeNode } from '../test-utils/agent-office-fixtures';

it('keeps an uninstalled employee visible and labels the missing setup', () => {
  const uninstalled = makeAgentOfficeNode({
    id: 'sourcing',
    instanceId: null,
    name: 'Sourcing',
    agentType: 'sourcing',
    displayName: '소싱 담당',
    responsibility: '상품 후보와 공급처 신호를 수집한다.',
    configurationStatus: 'instance_missing',
    status: 'offline',
    trustLevel: null,
    adapterType: null,
    effectiveModel: null,
  });

  render(
    <>
      <AgentStaffPanel
        model={{
          nodes: [uninstalled],
          capabilities: [],
          activities: [],
          totals: { ...totals, working: 0 },
        }}
        selectedNodeId="sourcing"
        onSelectNode={vi.fn()}
      />
      <AgentInspector node={uninstalled} />
    </>,
  );

  expect(screen.getAllByText('설정 필요').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('소싱 담당')).toBeInTheDocument();
  expect(screen.getAllByText('미지정').length).toBeGreaterThanOrEqual(2);
});
~~~

- [ ] **Step 2: Run the panel test and verify it fails**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficePanels.spec.tsx
~~~

Expected: FAIL because the panels only expose the generic offline status.

- [ ] **Step 3: Render configuration status separately from work status**

In `AgentStaffPanel`, replace the numeric trailing badge for non-ready nodes:

~~~tsx
{node.configurationStatus === 'ready' ? (
  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
    {node.activeRunCount + node.pendingApprovalCount}
  </span>
) : (
  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
    설정 필요
  </span>
)}
~~~

In `AgentInspector`, calculate:

~~~ts
const profileStatus =
  node.configurationStatus === 'ready'
    ? STATUS_LABEL[node.status]
    : '설정 필요';
~~~

Use `profileStatus` in the profile badge. Render nullable trust, adapter, and model values as `미지정`.

Replace retired node literals in the listed component/layout/page specs with
`makeAgentOfficeNode()`. Preserve each test's behavior-specific overrides, but
remove `title` and include the new `instanceId` and `configurationStatus`
through the shared builder.

- [ ] **Step 4: Run the panel and route component tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficePanels.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/components/AgentOfficeAvatar.spec.tsx src/app/agent-os/components/AgentOfficeFloor.spec.tsx src/app/agent-os/components/AgentCommandDock.spec.tsx src/app/agent-os/lib/agent-office-layout.spec.ts src/app/agent-os/__tests__/page.spec.tsx
~~~

Expected: all suites PASS.

- [ ] **Step 5: Commit Task 5**

~~~bash
rtk git add apps/web/src/app/agent-os/components/AgentStaffPanel.tsx apps/web/src/app/agent-os/components/AgentInspector.tsx apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeAvatar.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts apps/web/src/app/agent-os/__tests__/page.spec.tsx
rtk git commit -m "feat: show agent runtime setup state"
~~~

---

### Task 6: Harden Bootstrap Without Overwriting Organization Runtime State

**Files:**
- Modify: `apps/server/src/agent-os/seed-agent-os.ts`
- Modify: `scripts/__tests__/seed-agent-os.spec.ts`
- Create: `apps/server/src/agent-os/__tests__/agent-os-seed.pg.integration.spec.ts`
- Modify: `docs/runbooks/agent-os-hermes-runtime.md`

**Interfaces:**
- Preserves: `seedAgentOs(prisma): Promise<AgentOsSeedResult>`.
- Guarantees: missing `AgentInstance` and `AgentRuntimeState` rows are created.
- Guarantees: existing adapter/model/runtime/trust/role/title overrides are not rewritten.
- Guarantees: concurrent seed processes converge through database uniqueness.

- [ ] **Step 1: Replace the overwrite-oriented seed test**

Replace `preserves existing instance-owned role and title when refreshing seed rows` with:

~~~ts
it('uses compound upserts without updating existing runtime configuration', async () => {
  vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
  const instanceUpsert = vi.fn(async () => ({ id: 'agent-existing' }));
  const runtimeUpsert = vi.fn(async () => ({}));
  const tx = {
    agentInstance: { upsert: instanceUpsert },
    agentRuntimeState: { upsert: runtimeUpsert },
  };
  const prisma = {
    organization: {
      findMany: vi.fn(async () => [{ id: 'org-1' }]),
    },
    $transaction: vi.fn(async (operation) => operation(tx)),
  };

  await seedAgentOs(prisma as never);

  expect(instanceUpsert).toHaveBeenCalledTimes(listAgentDefinitions().length);
  expect(instanceUpsert).toHaveBeenCalledWith({
    where: {
      organizationId_type: {
        organizationId: 'org-1',
        type: 'manager',
      },
    },
    update: {},
    create: {
      organizationId: 'org-1',
      type: 'manager',
      name: 'Operator',
      role: 'employee',
      title: '운영 총괄',
      adapterType: 'claude_local',
    },
    select: { id: true },
  });
  expect(runtimeUpsert).toHaveBeenCalledTimes(listAgentDefinitions().length);
  expect(runtimeUpsert).toHaveBeenCalledWith({
    where: { agentInstanceId: 'agent-existing' },
    create: {
      organizationId: 'org-1',
      agentInstanceId: 'agent-existing',
    },
    update: {},
  });
});
~~~

The empty `update` branches are the non-overwrite contract. The `create`
assertion proves new rows still receive definition defaults.

- [ ] **Step 2: Run the seed test and verify it fails**

Run:

~~~bash
rtk npx vitest run --config scripts/vitest.config.ts scripts/__tests__/seed-agent-os.spec.ts
~~~

Expected: FAIL because the seed still performs `findFirst()`, then either
`update()` or `create()`.

- [ ] **Step 3: Replace check-then-create with one transactional compound upsert**

Replace `ensureInstance()` with:

~~~ts
async function ensureInstance(
  prisma: PrismaClient,
  organizationId: string,
  definition: AgentDefinitionRecord,
) {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.agentInstance.upsert({
      where: {
        organizationId_type: {
          organizationId,
          type: definition.type,
        },
      },
      update: {},
      create: {
        organizationId,
        type: definition.type,
        name: definition.name,
        role: definition.defaultInstanceRole,
        title: definition.defaultInstanceTitle,
        adapterType: definition.defaultAdapterType,
      },
      select: { id: true },
    });

    await tx.agentRuntimeState.upsert({
      where: { agentInstanceId: instance.id },
      create: {
        organizationId,
        agentInstanceId: instance.id,
      },
      update: {},
    });

    return instance;
  });
}
~~~

Do not update `name`, `role`, `title`, `adapterType`, `modelOverride`,
`adapterConfig`, `runtimeConfig`, `promptPathOverride`, lifecycle, or trust on
the compound-key conflict path. The existing
`@@unique([organizationId, type])` is the conflict arbiter; no new index or
schema migration is needed. Model-plan validation stays before the seed loop,
so each transaction contains only the instance upsert and runtime-state upsert
with no filesystem, network, or environment work. Iterate definitions in the
registry's deterministic order to keep lock acquisition consistent across
concurrent seed processes.

- [ ] **Step 4: Write the PostgreSQL concurrency regression**

Create `agent-os-seed.pg.integration.spec.ts`:

~~~ts
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { listAgentDefinitions } from '../domain/agent-definition.registry';
import { seedAgentOs } from '../seed-agent-os';

describe('Agent OS seed concurrency (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    vi.stubEnv('AGENT_SEED_ORG_IDS', TEST_ORGANIZATION_ID);
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('converges when two seed processes start together', async () => {
    await Promise.all([seedAgentOs(prisma), seedAgentOs(prisma)]);

    const definitions = listAgentDefinitions();
    const instances = await prisma.agentInstance.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { id: true, type: true },
    });
    const runtimeStates = await prisma.agentRuntimeState.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { agentInstanceId: true },
    });

    expect(instances).toHaveLength(definitions.length);
    expect(new Set(instances.map((item) => item.type))).toEqual(
      new Set(definitions.map((definition) => definition.type)),
    );
    expect(runtimeStates).toHaveLength(definitions.length);
    expect(new Set(runtimeStates.map((item) => item.agentInstanceId))).toEqual(
      new Set(instances.map((item) => item.id)),
    );
  });
});
~~~

Run:

~~~bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk npm run test:integration -- --run src/agent-os/__tests__/agent-os-seed.pg.integration.spec.ts
~~~

Expected: PASS against the real PostgreSQL unique constraints on
`(organizationId, type)` and `agentInstanceId`.

- [ ] **Step 5: Document desired state versus actual state**

Add this contract to `docs/runbooks/agent-os-hermes-runtime.md`:

~~~markdown
## Roster and Runtime State

- The Agent Definition Registry is the shipped Hermes organization roster.
- `GET /api/agent-os/roster` always returns every active definition in canonical order.
- `AgentInstance` is organization-owned runtime state and may be absent or unconfigured.
- Missing instances remain visible as `instance_missing`; unresolved models remain visible as `model_plan_incomplete`.
- `npm run seed:agent-os` creates missing runtime rows with compound upserts but never overwrites existing organization runtime settings.
- Git pull and `db:push` do not install runtime instances. Run the seed explicitly when a runnable local environment is required.
~~~

- [ ] **Step 6: Run seed and runbook contract tests**

Run:

~~~bash
rtk npx vitest run --config scripts/vitest.config.ts scripts/__tests__/seed-agent-os.spec.ts
rtk npm run test:scripts
~~~

Expected: both commands PASS.

- [ ] **Step 7: Commit Task 6**

~~~bash
rtk git add apps/server/src/agent-os/seed-agent-os.ts scripts/__tests__/seed-agent-os.spec.ts apps/server/src/agent-os/__tests__/agent-os-seed.pg.integration.spec.ts docs/runbooks/agent-os-hermes-runtime.md
rtk git commit -m "fix: make agent os seed concurrency-safe"
~~~

---

### Task 7: Cross-Layer Verification

**Files:**
- Verify only; no new source file is expected.

**Interfaces:**
- Verifies all prior task contracts together.

- [ ] **Step 1: Run shared, backend, script, and frontend focused suites**

~~~bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/agent-os.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/domain/__tests__/agent-definition.registry.spec.ts src/agent-os/application/service/__tests__/agent-catalog.service.spec.ts src/agent-os/adapter/in/http/__tests__/agent-catalog.controller.spec.ts src/agent-os/application/service/__tests__/agent-conversation.service.spec.ts
rtk npx vitest run --config scripts/vitest.config.ts scripts/__tests__/seed-agent-os.spec.ts
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-model.spec.ts src/app/agent-os/hooks/useAgentOffice.spec.tsx src/app/agent-os/lib/agent-command-presets.spec.ts src/app/agent-os/components/AgentOfficeMap.spec.tsx src/app/agent-os/components/AgentOfficePanels.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/__tests__/page.spec.tsx
~~~

Expected: all suites PASS.

- [ ] **Step 2: Run the real PostgreSQL concurrency test**

~~~bash
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk npm run test:integration -- --run src/agent-os/__tests__/agent-os-seed.pg.integration.spec.ts
~~~

Expected: PASS with exactly one instance and one runtime-state row per
definition after concurrent seeds.

- [ ] **Step 3: Run package and application builds**

~~~bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
~~~

Expected: all builds exit 0 with no TypeScript contract errors.

- [ ] **Step 4: Boot the backend**

Run:

~~~bash
rtk npm run dev:server
~~~

Expected: NestJS boots on port 4000 without dependency-injection or route errors. Keep the process running for browser verification.

- [ ] **Step 5: Verify the authenticated roster response**

Using the existing authenticated development session, inspect `GET /api/agent-os/roster` and assert:

~~~text
items.length = 10
employee definitions = 7
capability definitions = 3
first employee = manager / 운영 총괄
manager capability owners = rules_evaluation, rules_suggest
listing capability owner = thumbnail_analyst
no unknown persisted type appears
runtime contains instanceId/lifecycle/pause/trust/adapter/model fields only
runtime does not contain name, role, title, or reportsToId
definition does not contain runtimeKind or delegationRole
~~~

Repeat against an organization with a partial instance set, or use the service test fixture as the deterministic substitute when no safe local organization can be altered. Do not delete production-like data to create the partial state.

- [ ] **Step 6: Verify the desktop Agent OS UI**

Open `http://localhost:3000/agent-os` at a desktop viewport of at least 1440x900 and assert:

~~~text
left staffing list shows the same seven employees in canonical order
three capabilities appear only under their owners
missing runtime setup shows 설정 필요 instead of removing a person
selection remains stable after refresh because node identity is agent type
activity labels still attach to installed employee avatars
no raw runtime UUID appears in delegated command text
missing Operator or selected employee setup prevents create/send requests
the blocked command shows a 설정 필요 toast
no overlap, clipped employee labels, console errors, or failed roster request
~~~

Mobile verification is intentionally omitted.

- [ ] **Step 7: Run final repository guards**

~~~bash
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run test:scripts
rtk git diff --check
rtk git status --short
~~~

Expected: all checks PASS and status contains only intentional implementation changes.

## Rollback

- The new endpoint is additive.
- The legacy `GET /api/agent-os/instances` route remains available.
- If the frontend rollout must be reverted, restore `useAgentOffice` to `listInstances()`; no persisted data rollback is required.
- Seed hardening is reversible without data repair because it removes writes rather than adding them.

## Success Criteria

- Every environment at the same commit receives the same ten-item active roster.
- The office always presents seven employees and three capabilities regardless of database completeness.
- Database `role`, `title`, and `createdAt` cannot alter office classification, labels, ownership, or ordering.
- Organization-specific model, adapter, lifecycle, trust, and policy values remain visible and preserved.
- Missing runtime setup is explicit and does not silently fall back to another model.
- Hermes delegation hints use stable Agent type identity.
- Existing instance/admin APIs, run history, approvals, costs, and conversations continue to work.

## Engineering Review Decisions

All decisions below were approved during `/plan-eng-review` and are folded into
the tasks above:

| Decision | Adopted design |
|---|---|
| Scope | Keep the complete cross-layer plan: shared contract, backend projection, frontend model, interaction guard, bootstrap, and verification. |
| Roster authority | Store office metadata directly on each code-owned definition; do not add a second metadata map or trust persisted role/title. |
| Runtime response | Return focused `AgentRosterRuntime`; exclude persisted `name`, `role`, `title`, `reportsToId`, adapter config, runtime config, and prompt overrides structurally. |
| Definition response | Keep `runtimeKind` and `delegationRole` on `/definitions`; omit both from the office roster because the UI does not consume them. |
| Command failure | Block the frontend mutation when Operator or the selected employee is unconfigured; convert a failed backend Operator enqueue into HTTP 503. |
| Seed concurrency | Use compound upsert on `(organizationId, type)` and runtime-state upsert in one short transaction; prove convergence against PostgreSQL. |
| Test ergonomics | Add route-local `makeAgentRosterItem()` and `makeAgentOfficeNode()` builders instead of duplicating wide literals. |
| Contract tests | Lock controller metadata, organization forwarding, exact ten-item order, Zod conformance, and the full status-priority matrix. |
| Definition history | Definition-version persistence remains outside this plan and is not added to `TODOS.md`; it needs a separate replay/audit design when required. |

The seed design follows the referenced Supabase PostgreSQL guidance: replace
check-then-insert with atomic upsert, use an existing unique constraint as the
conflict arbiter, keep transactions short, and acquire records in deterministic
order.

Branch history shows the office camera was introduced and then deliberately
replaced by the current scroll viewport (`2dadc927`, `333dc177`). This plan does
not reintroduce zoom, pan, or camera state; it changes roster ownership and
command safety inside the accepted desktop layout.

## Test Coverage Diagram

~~~text
PLANNED CODE PATHS                                      PLANNED USER FLOWS

[+] Definition registry                                [+] Open /agent-os
    [★★★] exact 10 types + order + owner invariants        [★★★] 7 employees + 3 capabilities
    [★★★] metadata lives on each definition                [★★★] empty/partial DB remains visible

[+] AgentCatalogService.listRoster()                   [+] Select and inspect employee
    [★★★] empty organization                               [★★★] stable type identity after refresh
    [★★★] partial rows + stale role/title                  [★★★] missing runtime shows 설정 필요
    [★★★] unknown persisted type omitted                    [★★★] nullable model/adapter/trust copy
    [★★★] incomplete model plan
    [★★★] one org-scoped query + shared schema parse    [+] Submit Operator command
                                                           [★★★] ready Operator + ready target
[+] AgentCatalogController                                [★★★] Operator missing -> no request + toast
    [★★★] GET metadata + organization forwarding           [★★★] target missing -> no request + toast
    [★★★] canonical order + Zod response                    [★★★] UUID absent from command copy

[+] AgentConversationService                          [+] Observe activity
    [★★★] new conversation enqueue failure -> 503           [★★★] runtime UUID maps to stable node ID
    [★★★] existing conversation enqueue failure -> 503
                                                        [→E2E] Desktop 1440x900 visual/console/network QA
[+] Agent OS seed
    [★★★] create defaults
    [★★★] preserve every existing override
    [★★★] two concurrent PostgreSQL seeds converge

[+] Office state resolver
    [★★★] missing, incomplete, paused, approval,
          running, waiting, idle, and priority order

PLANNED COVERAGE: 20/20 paths (100%)
AUTOMATED: 19 paths  |  DESKTOP QA: 1 path  |  PROMPT/LLM EVAL: not applicable
~~~

Legend: `★★★` behavior + edge + error; `[→E2E]` desktop browser verification.

## Failure Modes

| Production failure | Test coverage | Error handling | User visibility |
|---|---|---|---|
| Organization has no Agent Instances | Catalog and office-model empty-runtime tests | Roster projects all definitions as `instance_missing` | Employees remain visible with `설정 필요` |
| Instance exists but required model plan is incomplete | Catalog missing-model and state-matrix tests | `model_plan_incomplete`; no fallback model | Employee remains visible and command is blocked |
| Persisted role/title is stale or another environment has different rows | Focused-runtime shape and partial-roster tests | Definition metadata overrides persisted display data | Canonical staff list stays identical |
| Persisted type no longer has an active definition | Catalog unknown-type test | Row is omitted from roster without deletion | No obsolete employee is shown |
| Operator is missing, paused, or otherwise cannot create a request | Hook guard plus both conversation-service failure tests | Frontend blocks; backend returns 503 `agent_operator_unavailable` | Toast before request or explicit API error |
| Selected employee is not configured | Hook target-readiness test | Mutation is not called | Employee-specific setup toast |
| Roster HTTP request fails | Hook roster-error test | Existing page error branch renders the query error | Explicit load-failure panel |
| Two seed processes start simultaneously | Real PostgreSQL integration test | Unique-key instance upsert and runtime-state upsert converge | Seed succeeds without duplicate-key failure |
| Lifecycle is paused while work counters are nonzero | Status-priority table | Lifecycle/configuration checks precede activity aggregation | Employee displays offline/setup state, not working |
| Operator enqueue fails after conversation/message audit rows are written | Conversation-service 503 tests | Records remain auditable; no root request is claimed | Request is reported as unavailable, never as accepted |

Critical silent gaps: **0**.

## Parallelization Strategy

| Workstream | Modules touched | Depends on |
|---|---|---|
| Task 1: canonical contract | `packages/shared/schemas`, `agent-os/domain` | - |
| Task 2: roster API and Operator failure | `agent-os/application`, `agent-os/adapter/in/http` | Task 1 |
| Task 3: office model and fixtures | `web/agent-os/lib`, `web/agent-os/test-utils` | Task 1 |
| Task 4: query and command semantics | `web/agent-os/hooks`, `web/agent-os/lib`, `web/agent-os/components` | Tasks 2 and 3 |
| Task 5: setup-state presentation | `web/agent-os/components` | Task 3 |
| Task 6: concurrency-safe bootstrap | `agent-os/seed`, `scripts/tests`, `docs/runbooks` | Task 1 |
| Task 7: cross-layer verification | all changed modules | Tasks 2-6 |

Parallel lanes:

~~~text
Gate 1: Task 1
          |
          +--> Lane A: Task 2 ------------------+
          +--> Lane B: Task 3 -> Task 5 --------+--> Task 4 --> Task 7
          +--> Lane C: Task 6 ------------------+
~~~

After Task 1 lands, launch Lanes A, B, and C in parallel worktrees. Merge all
three before Task 4 because the hook needs both the backend contract and the
frontend model. Keep Tasks 3 and 5 in one lane because they share route-local
model and component fixtures. Task 4 and Task 7 are sequential integration
gates. No parallel lanes modify the same primary file set after Task 1.

## Implementation Tasks

Synthesized from the engineering review findings. The detailed TDD steps above
remain the execution authority.

- [ ] **T1 (P1, human: ~2h / CC: ~20min)** — Command path — reject commands when Operator or the selected employee is not runnable.
  - Surfaced by: Architecture Review — silent HTTP success with `rootRequestId: null` and unguarded frontend mutations.
  - Files: `agent-conversation.service.ts`, its spec, `useAgentOffice.ts`, and its spec.
  - Verify: focused conversation and hook Vitest suites.
- [ ] **T2 (P1, human: ~2h / CC: ~20min)** — Bootstrap — replace check-then-create with short compound upsert transactions.
  - Surfaced by: Architecture Review — concurrent seeds can race on the compound unique key.
  - Files: `seed-agent-os.ts`, script unit spec, PostgreSQL integration spec, runtime runbook.
  - Verify: script Vitest plus real PostgreSQL concurrent-seed test.
- [ ] **T3 (P1, human: ~90min / CC: ~15min)** — Roster contract — separate code-owned definition data from focused organization runtime data.
  - Surfaced by: Architecture Review — returning full instance summaries lets stale persisted labels leak back into the roster.
  - Files: shared Agent OS schema, catalog service, catalog service spec.
  - Verify: shared schema and catalog service suites.
- [ ] **T4 (P2, human: ~45min / CC: ~8min)** — Test infrastructure — add typed route-local roster and office-node fixture builders.
  - Surfaced by: Code Quality Review — wide duplicate fixtures make contract changes noisy and inconsistent.
  - Files: `agent-office-fixtures.ts` and route-local specs.
  - Verify: all Agent OS frontend focused suites compile and pass.
- [ ] **T5 (P2, human: ~30min / CC: ~5min)** — Contract scope — remove unused runtime/delegation metadata from the roster DTO.
  - Surfaced by: Code Quality Review — fields unused by the office broaden the API without value.
  - Files: shared Agent OS schema, catalog projection, fixtures.
  - Verify: Zod schema parse and exact-shape assertions.
- [ ] **T6 (P2, human: ~45min / CC: ~8min)** — Registry — colocate office metadata on every definition object.
  - Surfaced by: Code Quality Review — a secondary metadata map would create another synchronization point.
  - Files: Agent OS domain types, definition registry, registry spec.
  - Verify: exact roster order, unique order, and owner invariants.
- [ ] **T7 (P1, human: ~45min / CC: ~8min)** — HTTP contract — lock route metadata, organization forwarding, canonical order, and Zod conformance.
  - Surfaced by: Test Review — service tests alone do not prove the controller contract.
  - Files: `agent-catalog.controller.spec.ts`.
  - Verify: focused controller Vitest suite plus IDOR and tenant-scope guards.
- [ ] **T8 (P1, human: ~45min / CC: ~8min)** — Office state — lock every status branch and priority in one table-driven test.
  - Surfaced by: Test Review — overlapping paused/approval/run/wait counters need deterministic precedence.
  - Files: office model and model spec.
  - Verify: focused office-model Vitest suite.

_No new tasks from Performance Review; the roster uses one organization query
and an in-memory join over ten definitions._

## Review Completion Summary

- Step 0 Scope Challenge: scope accepted as-is.
- Architecture Review: 3 issues found; all approved fixes are in Tasks 2 and 6.
- Code Quality Review: 3 issues found; all approved fixes are in Tasks 1 and 3.
- Test Review: coverage diagram produced; 2 gaps identified and closed in the plan.
- Performance Review: 0 issues; one organization query plus a ten-definition in-memory join.
- NOT in scope: written, including definition-version persistence and schema deletion.
- What already exists: written and reused; no parallel roster system is introduced.
- `TODOS.md` updates: 0 items; the user chose not to record definition versioning as a follow-up.
- Failure modes: 0 critical silent gaps.
- Outside voice: skipped because the local Claude CLI was not authenticated.
- Parallelization: 3 lanes after the shared-contract gate, followed by 2 sequential integration gates.
- Lake Score: 8/8 review recommendations chose the complete option.
- Review artifacts: QA test plan and 8-task engineering JSONL written under `~/.gstack/projects/AgentFoundry-Labs-kiditem/`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Not run for this plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues, 0 critical gaps, all folded into plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | Existing accepted desktop layout preserved |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not run |

**VERDICT:** ENG CLEARED - ready to implement.

NO UNRESOLVED DECISIONS
