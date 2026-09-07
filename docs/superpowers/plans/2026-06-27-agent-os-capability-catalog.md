# Agent OS Capability Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/agent-os` read as a KidItem service task board instead of a runtime log by mapping Agent OS requests to code-owned service capabilities.

**Architecture:** Keep Agent definitions and the user-facing capability catalog code-owned. Add a route-local catalog plus projection helper that converts `AgentRunRequestSummary` data into service-facing board tasks while preserving raw runtime metadata only in Developer Trace.

**Tech Stack:** Next.js App Router, React Query, TypeScript, Tailwind CSS, lucide-react, Vitest.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-06-26-agent-os-capability-catalog-design.md`
- Route guidance: `apps/web/AGENTS.md`
- Existing board helper: `apps/web/src/app/agent-os/lib/agent-os-task-board.ts`
- Existing board component: `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx`

## Scope

In scope:

- Code-owned service group and capability catalog for `/agent-os`.
- Frontend projection from raw Agent OS requests to operator-facing board tasks.
- Service group navigation, localized column labels, capability-based task cards, and service-facing drawer copy.
- Developer Trace remains the home for `agentType`, `taskKey`, `source`, resource IDs, run IDs, and graph/canvas.
- Unit tests for catalog matching, fallback behavior, projection, sorting, and filtering.
- Browser verification for readability, no overlap, and no console errors.

Not in scope:

- No Prisma schema change.
- No DB-backed `AgentDefinition`.
- No DB-backed capability override table.
- No backend API change.
- No workflow builder controls on the execution canvas.
- No custom per-organization capability labels.

## Reconstruction Classification

This is a route-level reconstruction inside one business domain: `apps/web/src/app/agent-os/`.

Reason: `AgentOsTaskBoard.tsx` is currently over 900 lines. The implementation must reduce risk by moving catalog/projection logic into pure helpers and keeping new UI behavior focused on the Agent OS route. It must not add backend behavior or cross-domain rewrites.

## File Map

Create:

- `apps/web/src/app/agent-os/lib/agent-capability-catalog.ts`
  - Owns service group definitions, capability catalog entries, matching, fallback, and display labels.
- `apps/web/src/app/agent-os/lib/agent-capability-catalog.spec.ts`
  - Tests exact matching, agent-level matching, fallback, ordering, and duplicate key guard.
- `apps/web/src/app/agent-os/lib/agent-os-task-projection.ts`
  - Converts requests, instances, and definitions into `AgentBoardTask` view models.
- `apps/web/src/app/agent-os/lib/agent-os-task-projection.spec.ts`
  - Tests service filtering, status grouping, sorting, agent display names, and trace preservation.
- `apps/web/src/app/agent-os/components/AgentOsTaskBoardSections.tsx`
  - Owns presentational board sections extracted from the current oversized board component.
- `apps/web/src/app/agent-os/components/AgentOsTaskBoard.spec.tsx`
  - Tests the visible board/drawer surface does not leak raw runtime IDs outside Developer Trace.

Modify:

- `apps/web/src/app/agent-os/lib/agent-os-task-board.ts`
  - Localize column titles/descriptions and make grouping operate on `AgentBoardTask`.
- `apps/web/src/app/agent-os/lib/agent-os-task-board.spec.ts`
  - Keep status mapping tests and update grouped item expectations to board tasks.
- `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx`
  - Becomes the route board container: owns local tab/filter state and passes view-model props into section components.
- `apps/web/src/app/agent-os/page.tsx`
  - Project raw API responses into board tasks and keep selected request behavior stable.

## Data Flow

```text
Nest Agent OS APIs
  -> page.tsx React Query responses
  -> projectAgentOsBoardTasks()
  -> AgentOsTaskBoard service filter
  -> columns/cards/drawer
  -> Developer Trace fetches graph only for selected latestRunId
```

## Service Groups

```ts
export type AgentServiceGroupId =
  | 'all'
  | 'sourcing'
  | 'listing'
  | 'content'
  | 'advertising'
  | 'rules'
  | 'operator';
```

Visible labels:

- `all`: 전체 작업
- `sourcing`: 상품 소싱
- `listing`: 리스팅 준비
- `content`: 콘텐츠/썸네일
- `advertising`: 광고 운영
- `rules`: 운영 룰
- `operator`: 오퍼레이터

## Status Columns

```ts
export const AGENT_OS_TASK_BOARD_COLUMNS = [
  { id: 'backlog', title: '대기', description: '예약됨' },
  { id: 'ready', title: '실행 준비', description: '대기열' },
  { id: 'running', title: '실행 중', description: '작업 중' },
  { id: 'approval', title: '승인 필요', description: '사람 확인' },
  { id: 'done', title: '완료', description: '종료됨' },
  { id: 'failed', title: '문제 발생', description: '중단됨' },
] as const;
```

Status pill labels:

```ts
const STATUS_LABEL: Record<AgentRunRequestStatus, string> = {
  pending: '실행 대기',
  claimed: '실행 중',
  coalesced: '병합됨',
  skipped: '건너뜀',
  requires_approval: '승인 필요',
  succeeded: '완료',
  failed: '실패',
  cancelled: '취소됨',
};
```

---

## Task 1: Add The Capability Catalog

**Files:**

- Create: `apps/web/src/app/agent-os/lib/agent-capability-catalog.ts`
- Create: `apps/web/src/app/agent-os/lib/agent-capability-catalog.spec.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `apps/web/src/app/agent-os/lib/agent-capability-catalog.spec.ts`:

```ts
import type { AgentRunRequestSummary } from '@kiditem/shared/agent-os';
import {
  AGENT_CAPABILITY_CATALOG,
  AGENT_SERVICE_GROUPS,
  getAgentServiceGroup,
  resolveAgentCapability,
} from './agent-capability-catalog';

function request(
  overrides: Partial<AgentRunRequestSummary>,
): AgentRunRequestSummary {
  return {
    id: 'request-1',
    organizationId: 'org-1',
    agentInstanceId: 'instance-1',
    agentType: 'sourcing',
    taskKey: 'default',
    source: 'manual',
    sourceResourceType: null,
    sourceResourceId: null,
    sourceWorkflowRunId: null,
    status: 'pending',
    priority: 50,
    attempts: 0,
    maxAttempts: 3,
    scheduledFor: '2026-06-27T01:00:00.000Z',
    claimedAt: null,
    finishedAt: null,
    latestRunId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: '2026-06-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('agent-capability-catalog', () => {
  it('keeps service groups in visible board order', () => {
    expect(AGENT_SERVICE_GROUPS.map((group) => group.id)).toEqual([
      'all',
      'sourcing',
      'listing',
      'content',
      'advertising',
      'rules',
      'operator',
    ]);
  });

  it('resolves an exact taskKey match before the agent-level default', () => {
    const capability = resolveAgentCapability(
      request({ agentType: 'rules_evaluation', taskKey: 'rules.evaluate' }),
    );

    expect(capability.key).toBe('rules.evaluate');
    expect(capability.serviceGroup).toBe('rules');
    expect(capability.title).toBe('운영 룰 평가');
  });

  it('resolves a code-owned agent type default when taskKey is default', () => {
    const capability = resolveAgentCapability(
      request({ agentType: 'thumbnail_analyst', taskKey: 'default' }),
    );

    expect(capability.key).toBe('content.thumbnail_review');
    expect(capability.serviceGroup).toBe('content');
    expect(capability.needsCatalogMapping).toBe(false);
  });

  it('returns the explicit operator fallback for unknown runtime work', () => {
    const capability = resolveAgentCapability(
      request({ agentType: 'unknown_agent', taskKey: 'private.task' }),
    );

    expect(capability.key).toBe('operator.unknown');
    expect(capability.serviceGroup).toBe('operator');
    expect(capability.needsCatalogMapping).toBe(true);
  });

  it('does not allow duplicate catalog keys', () => {
    const keys = AGENT_CAPABILITY_CATALOG.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns the all-work group for the all id', () => {
    expect(getAgentServiceGroup('all')?.label).toBe('전체 작업');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd apps/web
npx vitest run src/app/agent-os/lib/agent-capability-catalog.spec.ts
```

Expected: FAIL because `agent-capability-catalog.ts` does not exist.

- [ ] **Step 3: Add the catalog implementation**

Create `apps/web/src/app/agent-os/lib/agent-capability-catalog.ts`:

```ts
import {
  Bot,
  FileText,
  Image,
  Megaphone,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { AgentRunRequestSummary } from '@kiditem/shared/agent-os';

export type AgentServiceGroupId =
  | 'all'
  | 'sourcing'
  | 'listing'
  | 'content'
  | 'advertising'
  | 'rules'
  | 'operator';

export type AgentServiceGroup = Exclude<AgentServiceGroupId, 'all'>;

export type AgentServiceGroupDefinition = {
  id: AgentServiceGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  order: number;
};

export type AgentCapabilityMatch = {
  taskKey?: string;
  source?: string;
  sourceResourceType?: string;
};

export type AgentCapabilityCatalogItem = {
  key: string;
  agentType: string;
  serviceGroup: AgentServiceGroup;
  title: string;
  description: string;
  icon: LucideIcon;
  order: number;
  match: AgentCapabilityMatch;
  needsCatalogMapping?: false;
};

export type AgentResolvedCapability =
  | AgentCapabilityCatalogItem
  | {
      key: 'operator.unknown';
      agentType: string;
      serviceGroup: 'operator';
      title: '분류되지 않은 Agent 작업';
      description: 'Agent OS 내부 작업입니다. Developer Trace에서 원본 값을 확인하세요.';
      icon: typeof SlidersHorizontal;
      order: 9999;
      match: AgentCapabilityMatch;
      needsCatalogMapping: true;
    };

export const AGENT_SERVICE_GROUPS: readonly AgentServiceGroupDefinition[] = [
  {
    id: 'all',
    label: '전체 작업',
    description: '모든 Agent OS 작업',
    icon: SlidersHorizontal,
    order: 0,
  },
  {
    id: 'sourcing',
    label: '상품 소싱',
    description: '상품 후보 수집과 검토',
    icon: Search,
    order: 10,
  },
  {
    id: 'listing',
    label: '리스팅 준비',
    description: '상품 등록 전 준비',
    icon: FileText,
    order: 20,
  },
  {
    id: 'content',
    label: '콘텐츠/썸네일',
    description: '상세페이지와 썸네일 점검',
    icon: Image,
    order: 30,
  },
  {
    id: 'advertising',
    label: '광고 운영',
    description: '광고 분석과 전략',
    icon: Megaphone,
    order: 40,
  },
  {
    id: 'rules',
    label: '운영 룰',
    description: '정책 평가와 임계값 제안',
    icon: ShieldCheck,
    order: 50,
  },
  {
    id: 'operator',
    label: '오퍼레이터',
    description: '운영 보조와 미분류 작업',
    icon: Bot,
    order: 60,
  },
] as const;

export const AGENT_CAPABILITY_CATALOG: readonly AgentCapabilityCatalogItem[] = [
  {
    key: 'sourcing.collect_candidates',
    agentType: 'sourcing',
    serviceGroup: 'sourcing',
    title: '상품 후보 수집',
    description: '소싱 입력을 읽고 판매 후보 상품 정보를 정리합니다.',
    icon: Search,
    order: 10,
    match: { taskKey: 'default' },
  },
  {
    key: 'listing.prepare',
    agentType: 'listing-writer',
    serviceGroup: 'listing',
    title: '리스팅 초안 준비',
    description: '상품 등록에 필요한 판매 문구와 구조를 준비합니다.',
    icon: FileText,
    order: 20,
    match: { taskKey: 'default' },
  },
  {
    key: 'content.thumbnail_review',
    agentType: 'thumbnail_analyst',
    serviceGroup: 'content',
    title: '썸네일 컴플라이언스 점검',
    description: '썸네일 이미지가 운영 기준을 만족하는지 확인합니다.',
    icon: Image,
    order: 30,
    match: { taskKey: 'default' },
  },
  {
    key: 'advertising.strategy',
    agentType: 'ad_strategy',
    serviceGroup: 'advertising',
    title: '광고 전략 분석',
    description: '광고 성과 데이터를 읽고 다음 운영 판단을 제안합니다.',
    icon: Megaphone,
    order: 40,
    match: { taskKey: 'default' },
  },
  {
    key: 'rules.evaluate',
    agentType: 'rules_evaluation',
    serviceGroup: 'rules',
    title: '운영 룰 평가',
    description: '현재 데이터가 등록된 운영 룰을 위반하는지 평가합니다.',
    icon: ShieldCheck,
    order: 50,
    match: { taskKey: 'rules.evaluate' },
  },
  {
    key: 'rules.evaluate_default',
    agentType: 'rules_evaluation',
    serviceGroup: 'rules',
    title: '운영 룰 평가',
    description: '현재 데이터가 등록된 운영 룰을 위반하는지 평가합니다.',
    icon: ShieldCheck,
    order: 51,
    match: { taskKey: 'default' },
  },
  {
    key: 'rules.suggest_threshold',
    agentType: 'rules_suggest',
    serviceGroup: 'rules',
    title: '운영 룰 임계값 제안',
    description: '데이터 분포를 보고 운영 룰의 기준값을 제안합니다.',
    icon: ShieldCheck,
    order: 52,
    match: { taskKey: 'default' },
  },
  {
    key: 'operator.manager',
    agentType: 'manager',
    serviceGroup: 'operator',
    title: '운영 지휘',
    description: 'Agent OS 작업을 조율하고 다음 실행 단계를 판단합니다.',
    icon: Bot,
    order: 60,
    match: { taskKey: 'default' },
  },
  {
    key: 'operator.chat',
    agentType: 'chat',
    serviceGroup: 'operator',
    title: '운영 문의 응답',
    description: '읽기 전용 운영 문맥을 바탕으로 사용자 질문에 답합니다.',
    icon: Bot,
    order: 61,
    match: { taskKey: 'default' },
  },
] as const;

export const UNKNOWN_AGENT_CAPABILITY: AgentResolvedCapability = {
  key: 'operator.unknown',
  agentType: 'unknown',
  serviceGroup: 'operator',
  title: '분류되지 않은 Agent 작업',
  description: 'Agent OS 내부 작업입니다. Developer Trace에서 원본 값을 확인하세요.',
  icon: SlidersHorizontal,
  order: 9999,
  match: {},
  needsCatalogMapping: true,
};

export function getAgentServiceGroup(
  id: AgentServiceGroupId,
): AgentServiceGroupDefinition | null {
  return AGENT_SERVICE_GROUPS.find((group) => group.id === id) ?? null;
}

export function resolveAgentCapability(
  request: Pick<
    AgentRunRequestSummary,
    'agentType' | 'taskKey' | 'source' | 'sourceResourceType'
  >,
): AgentResolvedCapability {
  const exact = AGENT_CAPABILITY_CATALOG.find((item) =>
    matchesCapability(item, request),
  );

  if (exact) return exact;

  const agentDefault = AGENT_CAPABILITY_CATALOG.find(
    (item) => item.agentType === request.agentType && item.match.taskKey === 'default',
  );

  if (agentDefault) return agentDefault;

  return {
    ...UNKNOWN_AGENT_CAPABILITY,
    agentType: request.agentType,
  };
}

function matchesCapability(
  item: AgentCapabilityCatalogItem,
  request: Pick<
    AgentRunRequestSummary,
    'agentType' | 'taskKey' | 'source' | 'sourceResourceType'
  >,
): boolean {
  if (item.agentType !== request.agentType) return false;
  if (item.match.taskKey && item.match.taskKey !== request.taskKey) return false;
  if (item.match.source && item.match.source !== request.source) return false;
  if (
    item.match.sourceResourceType &&
    item.match.sourceResourceType !== request.sourceResourceType
  ) {
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run the catalog tests**

Run:

```bash
cd apps/web
npx vitest run src/app/agent-os/lib/agent-capability-catalog.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the catalog unit**

Run:

```bash
git add apps/web/src/app/agent-os/lib/agent-capability-catalog.ts \
  apps/web/src/app/agent-os/lib/agent-capability-catalog.spec.ts
git commit -m "feat: add agent os capability catalog"
```

Expected: Commit succeeds with only the two catalog files staged.

---

## Task 2: Add Board Task Projection

**Files:**

- Create: `apps/web/src/app/agent-os/lib/agent-os-task-projection.ts`
- Create: `apps/web/src/app/agent-os/lib/agent-os-task-projection.spec.ts`
- Modify: `apps/web/src/app/agent-os/lib/agent-os-task-board.ts`
- Modify: `apps/web/src/app/agent-os/lib/agent-os-task-board.spec.ts`

- [ ] **Step 1: Write projection tests**

Create `apps/web/src/app/agent-os/lib/agent-os-task-projection.spec.ts`:

```ts
import type {
  AgentDefinitionSummary,
  AgentInstanceSummary,
  AgentRunRequestSummary,
} from '@kiditem/shared/agent-os';
import {
  filterAgentBoardTasksByServiceGroup,
  projectAgentOsBoardTasks,
} from './agent-os-task-projection';

const NOW = new Date('2026-06-27T12:00:00.000Z');

function request(
  overrides: Partial<AgentRunRequestSummary>,
): AgentRunRequestSummary {
  return {
    id: 'request-1',
    organizationId: 'org-1',
    agentInstanceId: 'instance-1',
    agentType: 'sourcing',
    taskKey: 'default',
    source: 'manual',
    sourceResourceType: null,
    sourceResourceId: null,
    sourceWorkflowRunId: null,
    status: 'pending',
    priority: 50,
    attempts: 0,
    maxAttempts: 3,
    scheduledFor: '2026-06-27T11:00:00.000Z',
    claimedAt: null,
    finishedAt: null,
    latestRunId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: '2026-06-27T10:00:00.000Z',
    ...overrides,
  };
}

const instance: AgentInstanceSummary = {
  id: 'instance-1',
  organizationId: 'org-1',
  type: 'sourcing',
  name: 'Sourcing Agent',
  role: 'worker',
  title: '소싱 에이전트',
  icon: null,
  reportsToId: null,
  lifecycleStatus: 'active',
  pauseReason: null,
  trustLevel: 50,
  adapterType: 'claude_local',
  modelOverride: null,
  effectiveModel: 'claude-test',
};

const definition: AgentDefinitionSummary = {
  id: 'definition-sourcing',
  type: 'sourcing',
  name: 'Sourcing',
  description: '소싱 URL 스크래핑/상품 수집 tool-wrapper.',
  promptPath: 'agent-config/prompts/agents/sourcing.md',
  defaultAdapterType: 'claude_local',
  defaultModelEnv: 'AGENT_SOURCING_MODEL',
  defaultRuntimeConfig: {},
  defaultCapabilities: {},
  runtimeKind: 'tool_wrapper',
  catalogStatus: 'available',
  marketplaceId: null,
};

describe('agent-os-task-projection', () => {
  it('projects a raw request into service-facing board fields', () => {
    const [task] = projectAgentOsBoardTasks({
      requests: [request({ id: 'sourcing-1' })],
      instances: [instance],
      definitions: [definition],
      now: NOW,
    });

    expect(task.id).toBe('sourcing-1');
    expect(task.request.taskKey).toBe('default');
    expect(task.capability.title).toBe('상품 후보 수집');
    expect(task.agentDisplayName).toBe('Sourcing Agent');
    expect(task.serviceGroup).toBe('sourcing');
    expect(task.columnId).toBe('ready');
    expect(task.needsCatalogMapping).toBe(false);
  });

  it('keeps raw metadata available for Developer Trace', () => {
    const [task] = projectAgentOsBoardTasks({
      requests: [
        request({
          agentType: 'unknown_agent',
          taskKey: 'private.task',
          source: 'internal',
          latestRunId: 'run-123456789',
        }),
      ],
      instances: [],
      definitions: [],
      now: NOW,
    });

    expect(task.capability.key).toBe('operator.unknown');
    expect(task.needsCatalogMapping).toBe(true);
    expect(task.trace.agentType).toBe('unknown_agent');
    expect(task.trace.taskKey).toBe('private.task');
    expect(task.trace.latestRunId).toBe('run-123456789');
  });

  it('filters by service group while all keeps every task', () => {
    const tasks = projectAgentOsBoardTasks({
      requests: [
        request({ id: 'sourcing-1', agentType: 'sourcing' }),
        request({ id: 'ad-1', agentType: 'ad_strategy' }),
      ],
      instances: [instance],
      definitions: [definition],
      now: NOW,
    });

    expect(filterAgentBoardTasksByServiceGroup(tasks, 'all')).toHaveLength(2);
    expect(filterAgentBoardTasksByServiceGroup(tasks, 'advertising').map((task) => task.id)).toEqual([
      'ad-1',
    ]);
  });
});
```

- [ ] **Step 2: Run the failing projection test**

Run:

```bash
cd apps/web
npx vitest run src/app/agent-os/lib/agent-os-task-projection.spec.ts
```

Expected: FAIL because `agent-os-task-projection.ts` does not exist.

- [ ] **Step 3: Add the projection helper**

Create `apps/web/src/app/agent-os/lib/agent-os-task-projection.ts`:

```ts
import type {
  AgentDefinitionSummary,
  AgentInstanceSummary,
  AgentRunRequestSummary,
} from '@kiditem/shared/agent-os';
import {
  type AgentResolvedCapability,
  type AgentServiceGroup,
  type AgentServiceGroupId,
  resolveAgentCapability,
} from './agent-capability-catalog';
import { getAgentOsTaskColumn, type AgentOsTaskBoardColumnId } from './agent-os-task-board';

export type AgentBoardTaskTrace = Pick<
  AgentRunRequestSummary,
  | 'agentType'
  | 'taskKey'
  | 'source'
  | 'sourceResourceType'
  | 'sourceResourceId'
  | 'sourceWorkflowRunId'
  | 'latestRunId'
>;

export type AgentBoardTask = {
  id: string;
  request: AgentRunRequestSummary;
  instance: AgentInstanceSummary | null;
  definition: AgentDefinitionSummary | null;
  capability: AgentResolvedCapability;
  serviceGroup: AgentServiceGroup;
  columnId: AgentOsTaskBoardColumnId;
  agentDisplayName: string;
  needsCatalogMapping: boolean;
  trace: AgentBoardTaskTrace;
};

export type ProjectAgentOsBoardTasksInput = {
  requests: AgentRunRequestSummary[];
  instances: AgentInstanceSummary[];
  definitions: AgentDefinitionSummary[];
  now?: Date;
};

export function projectAgentOsBoardTasks({
  requests,
  instances,
  definitions,
  now = new Date(),
}: ProjectAgentOsBoardTasksInput): AgentBoardTask[] {
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));
  const definitionByType = new Map(
    definitions.map((definition) => [definition.type, definition]),
  );

  return requests.map((request) => {
    const instance = instanceById.get(request.agentInstanceId) ?? null;
    const definition = definitionByType.get(request.agentType) ?? null;
    const capability = resolveAgentCapability(request);

    return {
      id: request.id,
      request,
      instance,
      definition,
      capability,
      serviceGroup: capability.serviceGroup,
      columnId: getAgentOsTaskColumn(request, now),
      agentDisplayName: instance?.name ?? definition?.name ?? request.agentType,
      needsCatalogMapping: capability.needsCatalogMapping === true,
      trace: {
        agentType: request.agentType,
        taskKey: request.taskKey,
        source: request.source,
        sourceResourceType: request.sourceResourceType,
        sourceResourceId: request.sourceResourceId,
        sourceWorkflowRunId: request.sourceWorkflowRunId,
        latestRunId: request.latestRunId,
      },
    };
  });
}

export function filterAgentBoardTasksByServiceGroup(
  tasks: AgentBoardTask[],
  serviceGroup: AgentServiceGroupId,
): AgentBoardTask[] {
  if (serviceGroup === 'all') return tasks;
  return tasks.filter((task) => task.serviceGroup === serviceGroup);
}
```

- [ ] **Step 4: Update board grouping to board tasks**

Modify `apps/web/src/app/agent-os/lib/agent-os-task-board.ts`:

```ts
import type { AgentRunRequestSummary } from '@kiditem/shared/agent-os';
import type { AgentBoardTask } from './agent-os-task-projection';

export const AGENT_OS_TASK_BOARD_COLUMNS = [
  {
    id: 'backlog',
    title: '대기',
    description: '예약됨',
  },
  {
    id: 'ready',
    title: '실행 준비',
    description: '대기열',
  },
  {
    id: 'running',
    title: '실행 중',
    description: '작업 중',
  },
  {
    id: 'approval',
    title: '승인 필요',
    description: '사람 확인',
  },
  {
    id: 'done',
    title: '완료',
    description: '종료됨',
  },
  {
    id: 'failed',
    title: '문제 발생',
    description: '중단됨',
  },
] as const;

export type AgentOsTaskBoardColumnId =
  (typeof AGENT_OS_TASK_BOARD_COLUMNS)[number]['id'];

export type AgentOsTaskBoardGroups = Record<
  AgentOsTaskBoardColumnId,
  AgentBoardTask[]
>;

export function getAgentOsTaskColumn(
  request: AgentRunRequestSummary,
  now = new Date(),
): AgentOsTaskBoardColumnId {
  switch (request.status) {
    case 'pending':
      return new Date(request.scheduledFor).getTime() > now.getTime()
        ? 'backlog'
        : 'ready';
    case 'claimed':
      return 'running';
    case 'requires_approval':
      return 'approval';
    case 'succeeded':
    case 'coalesced':
      return 'done';
    case 'failed':
    case 'cancelled':
    case 'skipped':
      return 'failed';
  }
}

export function groupAgentOsBoardTasksByColumn(
  tasks: AgentBoardTask[],
): AgentOsTaskBoardGroups {
  const groups = AGENT_OS_TASK_BOARD_COLUMNS.reduce<AgentOsTaskBoardGroups>(
    (acc, column) => {
      acc[column.id] = [];
      return acc;
    },
    {} as AgentOsTaskBoardGroups,
  );

  for (const task of tasks) {
    groups[task.columnId].push(task);
  }

  for (const column of AGENT_OS_TASK_BOARD_COLUMNS) {
    groups[column.id].sort(compareAgentOsBoardTasks);
  }

  return groups;
}

export function compareAgentOsBoardTasks(
  left: AgentBoardTask,
  right: AgentBoardTask,
): number {
  if (right.request.priority !== left.request.priority) {
    return right.request.priority - left.request.priority;
  }

  return (
    new Date(right.request.createdAt).getTime() -
    new Date(left.request.createdAt).getTime()
  );
}
```

- [ ] **Step 5: Update existing board helper tests**

Modify `apps/web/src/app/agent-os/lib/agent-os-task-board.spec.ts`:

```ts
import type { AgentRunRequestSummary } from '@kiditem/shared/agent-os';
import {
  AGENT_OS_TASK_BOARD_COLUMNS,
  getAgentOsTaskColumn,
  groupAgentOsBoardTasksByColumn,
} from './agent-os-task-board';
import { projectAgentOsBoardTasks } from './agent-os-task-projection';

const NOW = new Date('2026-06-26T12:00:00.000Z');

function createRequest(
  overrides: Partial<AgentRunRequestSummary>,
): AgentRunRequestSummary {
  return {
    id: 'request-1',
    organizationId: 'org-1',
    agentInstanceId: 'agent-1',
    agentType: 'sourcing',
    taskKey: 'default',
    source: 'manual',
    sourceResourceType: null,
    sourceResourceId: null,
    sourceWorkflowRunId: null,
    status: 'pending',
    priority: 50,
    attempts: 0,
    maxAttempts: 3,
    scheduledFor: '2026-06-26T11:00:00.000Z',
    claimedAt: null,
    finishedAt: null,
    latestRunId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: '2026-06-26T10:00:00.000Z',
    ...overrides,
  };
}

function boardTasks(requests: AgentRunRequestSummary[]) {
  return projectAgentOsBoardTasks({
    requests,
    instances: [],
    definitions: [],
    now: NOW,
  });
}

describe('agent-os-task-board', () => {
  it('keeps every declared column initialized', () => {
    const groups = groupAgentOsBoardTasksByColumn([]);

    expect(Object.keys(groups)).toEqual(
      AGENT_OS_TASK_BOARD_COLUMNS.map((column) => column.id),
    );
  });

  it.each([
    ['pending immediate task', createRequest({ status: 'pending' }), 'ready'],
    [
      'pending scheduled task',
      createRequest({
        status: 'pending',
        scheduledFor: '2026-06-26T13:00:00.000Z',
      }),
      'backlog',
    ],
    ['claimed task', createRequest({ status: 'claimed' }), 'running'],
    [
      'approval task',
      createRequest({ status: 'requires_approval' }),
      'approval',
    ],
    ['succeeded task', createRequest({ status: 'succeeded' }), 'done'],
    ['coalesced task', createRequest({ status: 'coalesced' }), 'done'],
    ['failed task', createRequest({ status: 'failed' }), 'failed'],
    ['cancelled task', createRequest({ status: 'cancelled' }), 'failed'],
    ['skipped task', createRequest({ status: 'skipped' }), 'failed'],
  ] as const)('maps %s to %s', (_label, request, expectedColumn) => {
    expect(getAgentOsTaskColumn(request, NOW)).toBe(expectedColumn);
  });

  it('sorts cards by priority and newest creation time inside each column', () => {
    const lowPriority = createRequest({
      id: 'low',
      priority: 10,
      createdAt: '2026-06-26T11:59:00.000Z',
    });
    const olderHighPriority = createRequest({
      id: 'older-high',
      priority: 90,
      createdAt: '2026-06-26T10:00:00.000Z',
    });
    const newerHighPriority = createRequest({
      id: 'newer-high',
      priority: 90,
      createdAt: '2026-06-26T11:00:00.000Z',
    });

    const groups = groupAgentOsBoardTasksByColumn(
      boardTasks([lowPriority, olderHighPriority, newerHighPriority]),
    );

    expect(groups.ready.map((task) => task.id)).toEqual([
      'newer-high',
      'older-high',
      'low',
    ]);
  });
});
```

- [ ] **Step 6: Run projection and grouping tests**

Run:

```bash
cd apps/web
npx vitest run \
  src/app/agent-os/lib/agent-capability-catalog.spec.ts \
  src/app/agent-os/lib/agent-os-task-projection.spec.ts \
  src/app/agent-os/lib/agent-os-task-board.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit projection and grouping**

Run:

```bash
git add apps/web/src/app/agent-os/lib/agent-os-task-projection.ts \
  apps/web/src/app/agent-os/lib/agent-os-task-projection.spec.ts \
  apps/web/src/app/agent-os/lib/agent-os-task-board.ts \
  apps/web/src/app/agent-os/lib/agent-os-task-board.spec.ts
git commit -m "feat: project agent os requests for service board"
```

Expected: Commit succeeds with only the four listed files staged.

---

## Task 3: Wire Projected Tasks Into The Page

**Files:**

- Modify: `apps/web/src/app/agent-os/page.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx`

- [ ] **Step 1: Project tasks in the page**

Modify `apps/web/src/app/agent-os/page.tsx` imports:

```ts
import {
  projectAgentOsBoardTasks,
  type AgentBoardTask,
} from './lib/agent-os-task-projection';
```

Add projected tasks after `definitions`:

```ts
const boardTasks = useMemo(
  () =>
    projectAgentOsBoardTasks({
      requests,
      instances,
      definitions,
    }),
  [requests, instances, definitions],
);
```

Replace selected request lookup:

```ts
const selectedTask = useMemo(
  () => boardTasks.find((task) => task.id === selectedRequestId) ?? null,
  [boardTasks, selectedRequestId],
);
const selectedRequest = selectedTask?.request ?? null;
```

Replace the auto-selection request scan with task scan:

```ts
useEffect(() => {
  if (boardTasks.length === 0) {
    setSelectedRequestId(null);
    setSelectionDismissed(false);
    return;
  }

  if (
    selectedRequestId &&
    boardTasks.some((task: AgentBoardTask) => task.id === selectedRequestId)
  ) {
    return;
  }

  if (selectionDismissed) {
    return;
  }

  const firstActionable =
    boardTasks.find((task) => task.request.status === 'requires_approval') ??
    boardTasks.find((task) => task.request.status === 'claimed') ??
    boardTasks.find((task) => task.request.status === 'pending') ??
    boardTasks[0];
  setSelectedRequestId(firstActionable?.id ?? null);
}, [boardTasks, selectedRequestId, selectionDismissed]);
```

Pass `tasks` instead of `requests`:

```tsx
<AgentOsTaskBoard
  tasks={boardTasks}
  selectedRequestId={selectedRequestId}
  onSelectRequest={(requestId) => {
    setSelectionDismissed(false);
    setSelectedRequestId(requestId);
  }}
  onCloseRequest={() => {
    setSelectionDismissed(true);
    setSelectedRequestId(null);
  }}
  onRefresh={refreshAgentOs}
  onRunNext={() => runNextMutation.mutate()}
  isLoading={requestsQuery.isPending}
  isRefreshing={
    requestsQuery.isFetching ||
    instancesQuery.isFetching ||
    runningRunsQuery.isFetching
  }
  isRunningNext={runNextMutation.isPending}
  runningRunCount={runningRunsQuery.data?.items.length ?? 0}
  executionCanvasGraph={executionCanvasGraph}
  selectedExecutionNode={selectedExecutionNode}
  selectedExecutionNodeId={selectedNodeId}
  onSelectExecutionNode={(nodeId) =>
    setSelectedNodeId((current) => (current === nodeId ? null : nodeId))
  }
  isTraceLoading={Boolean(traceRunId) && selectedRunGraphQuery.isPending}
  isTraceRefreshing={selectedRunGraphQuery.isFetching && !selectedRunGraphQuery.isPending}
  isTraceError={selectedRunGraphQuery.isError}
/>
```

- [ ] **Step 2: Replace board props**

Modify `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx` imports:

```ts
import {
  AGENT_SERVICE_GROUPS,
  type AgentServiceGroupId,
} from '../lib/agent-capability-catalog';
import {
  filterAgentBoardTasksByServiceGroup,
  type AgentBoardTask,
} from '../lib/agent-os-task-projection';
import {
  AGENT_OS_TASK_BOARD_COLUMNS,
  groupAgentOsBoardTasksByColumn,
  type AgentOsTaskBoardColumnId,
} from '../lib/agent-os-task-board';
```

Replace board props:

```ts
type AgentOsTaskBoardProps = {
  tasks: AgentBoardTask[];
  selectedRequestId: string | null;
  onSelectRequest: (requestId: string) => void;
  onCloseRequest: () => void;
  onRefresh: () => void;
  onRunNext: () => void;
  isLoading: boolean;
  isRefreshing: boolean;
  isRunningNext: boolean;
  runningRunCount: number;
  executionCanvasGraph: ExecutionCanvasGraph;
  selectedExecutionNode: ExecutionCanvasNode | null;
  selectedExecutionNodeId: string | null;
  onSelectExecutionNode: (nodeId: string) => void;
  isTraceLoading: boolean;
  isTraceRefreshing: boolean;
  isTraceError: boolean;
};
```

Inside `AgentOsTaskBoard`, replace request-derived maps with task projection state:

```ts
const [selectedServiceGroup, setSelectedServiceGroup] =
  useState<AgentServiceGroupId>('all');
const visibleTasks = useMemo(
  () => filterAgentBoardTasksByServiceGroup(tasks, selectedServiceGroup),
  [tasks, selectedServiceGroup],
);
const groups = useMemo(
  () => groupAgentOsBoardTasksByColumn(visibleTasks),
  [visibleTasks],
);
const selectedTask = useMemo(
  () => tasks.find((task) => task.id === selectedRequestId) ?? null,
  [tasks, selectedRequestId],
);
const approvalCount = tasks.filter(
  (task) => task.request.status === 'requires_approval',
).length;
const failedCount = tasks.filter((task) =>
  ['failed', 'cancelled', 'skipped'].includes(task.request.status),
).length;
const serviceCounts = useMemo(() => {
  const counts = new Map<AgentServiceGroupId, number>([['all', tasks.length]]);
  for (const task of tasks) {
    counts.set(task.serviceGroup, (counts.get(task.serviceGroup) ?? 0) + 1);
  }
  return counts;
}, [tasks]);
```

Replace the column and drawer call sites:

```tsx
{AGENT_OS_TASK_BOARD_COLUMNS.map((column) => (
  <TaskColumn
    key={column.id}
    column={column}
    tasks={groups[column.id]}
    selectedRequestId={selectedRequestId}
    onSelectRequest={onSelectRequest}
    isLoading={isLoading}
  />
))}

<TaskDrawer
  task={selectedTask}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  onClose={onCloseRequest}
  onRefresh={onRefresh}
  onRunNext={onRunNext}
  isRunningNext={isRunningNext}
  executionCanvasGraph={executionCanvasGraph}
  selectedExecutionNode={selectedExecutionNode}
  selectedExecutionNodeId={selectedExecutionNodeId}
  onSelectExecutionNode={onSelectExecutionNode}
  isTraceLoading={isTraceLoading}
  isTraceRefreshing={isTraceRefreshing}
  isTraceError={isTraceError}
/>
```

- [ ] **Step 3: Run typecheck via build**

Run:

```bash
npm run build --workspace=apps/web
```

Expected: Build reaches Next.js compilation without TypeScript prop errors for `AgentOsTaskBoard`.

- [ ] **Step 4: Commit page wiring**

Run:

```bash
git add apps/web/src/app/agent-os/page.tsx \
  apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx
git commit -m "feat: wire agent os board projection"
```

Expected: Commit succeeds with only the page and board component staged.

---

## Task 4: Make The Board Service-First

**Files:**

- Modify: `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx`
- Create: `apps/web/src/app/agent-os/components/AgentOsTaskBoardSections.tsx`
- Create: `apps/web/src/app/agent-os/components/AgentOsTaskBoard.spec.tsx`

- [ ] **Step 1: Extract board sections before adding service behavior**

Create `apps/web/src/app/agent-os/components/AgentOsTaskBoardSections.tsx` by moving these presentational functions out of `AgentOsTaskBoard.tsx`:

```text
TaskColumn
TaskCard
TaskDrawer
OverviewTab
ControlsTab
ActivityTab
TraceTab
StatusPill
PriorityPill
MetaBlock
DetailRow
ActivityItem
EmptyTrace
ColumnLoading
controlCopy
```

Export these component entry points:

```ts
export { TaskColumn, TaskDrawer };
export type { DrawerTab };
```

Keep `AgentOsTaskBoard.tsx` as the container with this responsibility only:

```text
AgentOsTaskBoard
  -> computes selected service group
  -> computes visible tasks and grouped columns
  -> computes service counts
  -> renders header, service sidebar, TaskColumn list, TaskDrawer
```

After the extraction, `AgentOsTaskBoard.tsx` should not contain raw card/drawer markup. It should import `TaskColumn` and `TaskDrawer` from `./AgentOsTaskBoardSections`.

- [ ] **Step 2: Replace the current sidebar tabs with service group navigation**

Replace the sidebar nav block:

```tsx
<nav className="space-y-1 px-3 py-4">
  {AGENT_SERVICE_GROUPS.map((group) => {
    const Icon = group.icon;
    const active = selectedServiceGroup === group.id;
    const count = serviceCounts.get(group.id) ?? 0;

    return (
      <button
        key={group.id}
        type="button"
        onClick={() => setSelectedServiceGroup(group.id)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold',
          active
            ? 'bg-slate-100 text-slate-950'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{group.label}</span>
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
          {count}
        </span>
      </button>
    );
  })}
</nav>
```

Replace the page subtitle:

```tsx
<p className="mt-1 text-sm text-slate-500">
  {visibleTasks.length} shown · {tasks.length} total · {approvalCount} approvals · {failedCount} issues
</p>
```

- [ ] **Step 3: Localize request status labels**

Replace `STATUS_LABEL` in `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx`:

```ts
const STATUS_LABEL: Record<AgentRunRequestStatus, string> = {
  pending: '실행 대기',
  claimed: '실행 중',
  coalesced: '병합됨',
  skipped: '건너뜀',
  requires_approval: '승인 필요',
  succeeded: '완료',
  failed: '실패',
  cancelled: '취소됨',
};
```

- [ ] **Step 4: Render task cards from capability data**

Replace `TaskColumn` item type from raw request to board task:

```ts
function TaskColumn({
  column,
  tasks,
  selectedRequestId,
  onSelectRequest,
  isLoading,
}: {
  column: (typeof AGENT_OS_TASK_BOARD_COLUMNS)[number];
  tasks: AgentBoardTask[];
  selectedRequestId: string | null;
  onSelectRequest: (requestId: string) => void;
  isLoading: boolean;
}) {
  return (
    <div className={cn('flex w-[272px] shrink-0 flex-col rounded-md border', COLUMN_TONE[column.id])}>
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-white/70 px-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">{column.title}</h2>
          <p className="truncate text-xs text-slate-500">{column.description}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
          {tasks.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {isLoading ? (
          <ColumnLoading />
        ) : tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={task.id === selectedRequestId}
              onSelect={() => onSelectRequest(task.id)}
            />
          ))
        ) : (
          <div className="flex min-h-[108px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-white/65 text-xs font-medium text-slate-400">
            비어 있음
          </div>
        )}
      </div>
    </div>
  );
}
```

Replace `TaskCard`:

```tsx
function TaskCard({
  task,
  selected,
  onSelect,
}: {
  task: AgentBoardTask;
  selected: boolean;
  onSelect: () => void;
}) {
  const request = task.request;
  const StatusIcon = STATUS_ICON[request.status];
  const CapabilityIcon = task.capability.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'block min-h-[178px] w-full rounded-md border bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md',
        selected ? 'border-slate-950 ring-2 ring-slate-950/10' : 'border-slate-200',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-600">
          <CapabilityIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
            {task.capability.title}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {task.capability.description}
          </p>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusPill status={request.status} />
        <PriorityPill priority={request.priority} />
        {task.needsCatalogMapping ? (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            분류 확인
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <MetaBlock label="Agent" value={task.agentDisplayName} />
        <MetaBlock label="Attempts" value={`${request.attempts}/${request.maxAttempts}`} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
        <span className="truncate">{formatDateTime(request.createdAt)}</span>
        <span className="shrink-0">
          {request.status === 'requires_approval' ? '승인 대기' : STATUS_LABEL[request.status]}
        </span>
      </div>

      <StatusIcon className="sr-only" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 5: Use board task in the drawer**

Change `TaskDrawer` props from request/instance/definition to `task`:

```ts
function TaskDrawer({
  task,
  activeTab,
  onTabChange,
  onClose,
  onRefresh,
  onRunNext,
  isRunningNext,
  executionCanvasGraph,
  selectedExecutionNode,
  selectedExecutionNodeId,
  onSelectExecutionNode,
  isTraceLoading,
  isTraceRefreshing,
  isTraceError,
}: {
  task: AgentBoardTask | null;
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  onRefresh: () => void;
  onRunNext: () => void;
  isRunningNext: boolean;
  executionCanvasGraph: ExecutionCanvasGraph;
  selectedExecutionNode: ExecutionCanvasNode | null;
  selectedExecutionNodeId: string | null;
  onSelectExecutionNode: (nodeId: string) => void;
  isTraceLoading: boolean;
  isTraceRefreshing: boolean;
  isTraceError: boolean;
}) {
  if (!task) {
    return (
      <aside className="hidden w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white xl:flex">
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <SlidersHorizontal className="mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-700">작업을 선택하세요</p>
          <p className="mt-1 max-w-64 text-sm leading-6 text-slate-500">
            작업 개요, 컨트롤, 활동, Developer Trace가 여기에 표시됩니다.
          </p>
        </div>
      </aside>
    );
  }

  const request = task.request;
  const CapabilityIcon = task.capability.icon;
```

Replace drawer header copy:

```tsx
<div className="min-w-0">
  <div className="flex flex-wrap items-center gap-2">
    <StatusPill status={request.status} />
    {task.needsCatalogMapping ? (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        분류 확인 필요
      </span>
    ) : null}
    {isTraceRefreshing ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        syncing
      </span>
    ) : null}
  </div>
  <div className="mt-3 flex items-start gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-600">
      <CapabilityIcon className="h-5 w-5" aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <h2 className="line-clamp-2 text-base font-semibold leading-6 text-slate-950">
        {task.capability.title}
      </h2>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
        {task.capability.description}
      </p>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Make Overview and Activity service-facing**

Replace `OverviewTab` signature:

```ts
function OverviewTab({ task }: { task: AgentBoardTask }) {
  const request = task.request;
  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">작업 개요</h3>
        <div className="mt-3 space-y-3">
          <DetailRow label="서비스" value={task.capability.title} />
          <DetailRow label="Agent" value={task.agentDisplayName} />
          <DetailRow label="상태" value={STATUS_LABEL[request.status]} />
          <DetailRow label="우선순위" value={String(request.priority)} />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">실행 시간</h3>
        <div className="mt-3 space-y-3">
          <DetailRow label="생성" value={formatDateTime(request.createdAt)} />
          <DetailRow label="예약" value={formatDateTime(request.scheduledFor)} />
          <DetailRow label="시작" value={request.claimedAt ? formatDateTime(request.claimedAt) : '아직 시작 전'} />
          <DetailRow label="종료" value={request.finishedAt ? formatDateTime(request.finishedAt) : '아직 종료 전'} />
        </div>
      </section>
    </div>
  );
}
```

Update `ActivityTab` visible copy:

```tsx
<ActivityItem icon={Clock3} title="작업 생성" value={formatDateTime(request.createdAt)} />
{request.claimedAt ? (
  <ActivityItem icon={Play} title="Agent 실행 시작" value={formatDateTime(request.claimedAt)} />
) : null}
{request.finishedAt ? (
  <ActivityItem icon={CheckCircle2} title="작업 종료" value={formatDateTime(request.finishedAt)} />
) : null}
{request.lastErrorMessage ? (
  <ActivityItem
    icon={AlertCircle}
    title="문제 발생"
    value={request.lastErrorMessage}
    danger
  />
) : null}
```

- [ ] **Step 7: Keep raw runtime metadata in Developer Trace**

Add this block at the top of `TraceTab` success state before the canvas:

```tsx
<section className="rounded-md border border-slate-200 bg-slate-50 p-4">
  <h3 className="text-sm font-semibold text-slate-900">Runtime metadata</h3>
  <div className="mt-3 space-y-3">
    <DetailRow label="agentType" value={request.agentType} mono />
    <DetailRow label="taskKey" value={request.taskKey} mono />
    <DetailRow label="source" value={request.source} mono />
    <DetailRow label="resource" value={request.sourceResourceType ?? 'none'} mono />
    <DetailRow label="run" value={request.latestRunId ?? 'none'} mono />
  </div>
</section>
```

Do not render `taskKey`, `source`, or run IDs in `TaskCard`, column headers, board header, or `OverviewTab`.

- [ ] **Step 8: Add a board surface regression test**

Create `apps/web/src/app/agent-os/components/AgentOsTaskBoard.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import type { AgentRunRequestSummary } from '@kiditem/shared/agent-os';
import { vi } from 'vitest';
import { AgentOsTaskBoard } from './AgentOsTaskBoard';
import type { AgentBoardTask } from '../lib/agent-os-task-projection';
import type { ExecutionCanvasGraph } from '../lib/execution-canvas-graph';

vi.mock('./ExecutionCanvas', () => ({
  default: () => <div data-testid="execution-canvas" />,
}));

vi.mock('./ExecutionNodeDetail', () => ({
  default: () => <div data-testid="execution-node-detail" />,
}));

function request(): AgentRunRequestSummary {
  return {
    id: 'request-1',
    organizationId: 'org-1',
    agentInstanceId: 'instance-1',
    agentType: 'sourcing',
    taskKey: 'raw.internal.task',
    source: 'manual',
    sourceResourceType: 'collected-product',
    sourceResourceId: 'resource-123',
    sourceWorkflowRunId: null,
    status: 'pending',
    priority: 50,
    attempts: 1,
    maxAttempts: 3,
    scheduledFor: '2026-06-27T11:00:00.000Z',
    claimedAt: null,
    finishedAt: null,
    latestRunId: 'run-123456789',
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: '2026-06-27T10:00:00.000Z',
  };
}

function task(): AgentBoardTask {
  const rawRequest = request();
  return {
    id: rawRequest.id,
    request: rawRequest,
    instance: null,
    definition: null,
    capability: {
      key: 'sourcing.collect_candidates',
      agentType: 'sourcing',
      serviceGroup: 'sourcing',
      title: '상품 후보 수집',
      description: '소싱 입력을 읽고 판매 후보 상품 정보를 정리합니다.',
      icon: Search,
      order: 10,
      match: { taskKey: 'default' },
    },
    serviceGroup: 'sourcing',
    columnId: 'ready',
    agentDisplayName: 'Sourcing Agent',
    needsCatalogMapping: false,
    trace: {
      agentType: rawRequest.agentType,
      taskKey: rawRequest.taskKey,
      source: rawRequest.source,
      sourceResourceType: rawRequest.sourceResourceType,
      sourceResourceId: rawRequest.sourceResourceId,
      sourceWorkflowRunId: rawRequest.sourceWorkflowRunId,
      latestRunId: rawRequest.latestRunId,
    },
  };
}

function graph(): ExecutionCanvasGraph {
  return {
    rootRunId: 'run-123456789',
    nodes: [],
    edges: [],
    summary: {
      totalNodes: 0,
      totalEdges: 0,
      failedNodes: 0,
      approvalNodes: 0,
      runningNodes: 0,
    },
  };
}

describe('AgentOsTaskBoard', () => {
  it('keeps raw runtime identifiers out of the default operator surface', () => {
    render(
      <AgentOsTaskBoard
        tasks={[task()]}
        selectedRequestId="request-1"
        onSelectRequest={vi.fn()}
        onCloseRequest={vi.fn()}
        onRefresh={vi.fn()}
        onRunNext={vi.fn()}
        isLoading={false}
        isRefreshing={false}
        isRunningNext={false}
        runningRunCount={0}
        executionCanvasGraph={graph()}
        selectedExecutionNode={null}
        selectedExecutionNodeId={null}
        onSelectExecutionNode={vi.fn()}
        isTraceLoading={false}
        isTraceRefreshing={false}
        isTraceError={false}
      />,
    );

    expect(screen.getAllByText('상품 후보 수집').length).toBeGreaterThan(0);
    expect(screen.queryByText('raw.internal.task')).not.toBeInTheDocument();
    expect(screen.queryByText('manual')).not.toBeInTheDocument();
    expect(screen.queryByText('run-123456789')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Developer Trace' }));

    expect(screen.getByText('raw.internal.task')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.getByText('run-123456789')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run the focused test set**

Run:

```bash
cd apps/web
npx vitest run \
  src/app/agent-os/lib/agent-capability-catalog.spec.ts \
  src/app/agent-os/lib/agent-os-task-projection.spec.ts \
  src/app/agent-os/lib/agent-os-task-board.spec.ts \
  src/app/agent-os/components/AgentOsTaskBoard.spec.tsx \
  src/app/agent-os/components/ExecutionCanvas.spec.tsx \
  src/app/agent-os/components/ExecutionNodeDetail.spec.tsx
```

Expected: PASS.

- [ ] **Step 10: Build the frontend**

Run:

```bash
npm run build --workspace=apps/web
```

Expected: PASS.

- [ ] **Step 11: Commit service-first board UI**

Run:

```bash
git add apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx \
  apps/web/src/app/agent-os/components/AgentOsTaskBoardSections.tsx \
  apps/web/src/app/agent-os/components/AgentOsTaskBoard.spec.tsx
git commit -m "feat: show agent os work by service"
```

Expected: Commit succeeds with only the board component, extracted sections file, and board component spec staged.

---

## Task 5: Browser QA The Operator Surface

**Files:**

- Verify: `apps/web/src/app/agent-os/page.tsx`
- Verify: `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx`

- [ ] **Step 1: Confirm the dev server is available**

Run:

```bash
curl -I http://localhost:3000/agent-os
```

Expected: HTTP response is reachable. If the server is not running, start it with the existing project command used for the current session and keep it running.

- [ ] **Step 2: Open `/agent-os` in the browser**

Use the in-app browser at:

```text
http://localhost:3000/agent-os
```

Expected:

- Left nav shows service groups, not the current `Task Board`, `Agents`, and `Trace` tabs.
- Cards show capability titles such as `상품 후보 수집`, `광고 전략 분석`, or `운영 룰 평가`.
- Cards do not show `taskKey`, `source`, conversation IDs, or run IDs.
- Status columns use Korean operator labels.
- No visible overlap at desktop width.

- [ ] **Step 3: Check service filtering**

Click each service group:

```text
전체 작업
상품 소싱
리스팅 준비
콘텐츠/썸네일
광고 운영
운영 룰
오퍼레이터
```

Expected:

- The board count updates with the selected service group.
- Empty service groups show `비어 있음`.
- Selection does not crash if the currently selected task belongs to another service group.

- [ ] **Step 4: Check drawer tabs**

Open a task and inspect:

```text
Overview
Controls
Activity
Developer Trace
```

Expected:

- Overview shows service-facing task, agent, status, priority, and timing.
- Controls still exposes `Run next queued task` and `Refresh task state`.
- Activity uses operator-facing lifecycle copy.
- Developer Trace shows raw runtime metadata and the execution canvas.

- [ ] **Step 5: Check browser console**

Expected:

- No React hydration errors.
- No uncaught exceptions.
- No missing key warnings.
- No console errors from the Agent OS page.

---

## Task 6: Final Verification

**Files:**

- Verify all changed files from Tasks 1-4.

- [ ] **Step 1: Run focused Agent OS tests**

Run:

```bash
cd apps/web
npx vitest run \
  src/app/agent-os/lib/agent-capability-catalog.spec.ts \
  src/app/agent-os/lib/agent-os-task-projection.spec.ts \
  src/app/agent-os/lib/agent-os-task-board.spec.ts \
  src/app/agent-os/lib/execution-canvas-graph.spec.ts \
  src/app/agent-os/components/AgentOsTaskBoard.spec.tsx \
  src/app/agent-os/components/ExecutionCanvas.spec.tsx \
  src/app/agent-os/components/ExecutionNodeDetail.spec.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the frontend build gate**

Run:

```bash
npm run build --workspace=apps/web
```

Expected: PASS.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff -- apps/web/src/app/agent-os
```

Expected:

- The diff stays within the Agent OS route.
- No backend, Prisma, or shared schema changes appear for this feature.
- Raw runtime metadata is still available in Developer Trace.
- User-facing cards and overview no longer use raw runtime identifiers as primary labels.

- [ ] **Step 5: Final commit**

Run:

```bash
git add apps/web/src/app/agent-os/lib/agent-capability-catalog.ts \
  apps/web/src/app/agent-os/lib/agent-capability-catalog.spec.ts \
  apps/web/src/app/agent-os/lib/agent-os-task-projection.ts \
  apps/web/src/app/agent-os/lib/agent-os-task-projection.spec.ts \
  apps/web/src/app/agent-os/lib/agent-os-task-board.ts \
  apps/web/src/app/agent-os/lib/agent-os-task-board.spec.ts \
  apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx \
  apps/web/src/app/agent-os/components/AgentOsTaskBoardSections.tsx \
  apps/web/src/app/agent-os/components/AgentOsTaskBoard.spec.tsx \
  apps/web/src/app/agent-os/page.tsx
git commit -m "feat: organize agent os board by service"
```

Expected: Commit succeeds after all verification gates pass.

## Acceptance Checklist

- The first screen is a service task board, not an execution canvas.
- A non-developer can understand visible cards without reading `taskKey` or run IDs.
- Service groups are the primary navigation model.
- Unknown runtime work falls back to `분류되지 않은 Agent 작업` under `오퍼레이터`.
- Runtime metadata remains available in Developer Trace.
- The implementation does not add or restore DB `AgentDefinition`.
- `npm run build --workspace=apps/web` passes.
- Focused Agent OS Vitest tests pass.
- Browser QA confirms no visible overlap and no console errors.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | Not run | Prior design was approved by user before this plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | Not run | Not requested for this plan review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues found, 0 critical gaps, all resolved in plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | Not run | UI direction already narrowed to service board plus Developer Trace |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | Not run | No new local workflow or developer onboarding path |

### Step 0 Scope Challenge

- Scope status: accepted as-is after review.
- Complexity trigger: the plan now touches 10 files. This is intentional because `AgentOsTaskBoard.tsx` is over 900 lines and `apps/web/AGENTS.md` says not to add substantial behavior to 700+ line components.
- Minimum complete change: catalog helper, projection helper, board grouping, service-first UI, one UI regression test, page wiring, browser QA.
- Search check: no new framework, infrastructure, storage, or concurrency pattern is introduced. This stays on Layer 1: existing React, React Query, Tailwind, lucide-react, and Vitest.
- TODOS.md: not present. No deferred TODO is needed for this phase.
- Distribution check: no new artifact type is introduced.

### What Already Exists

- `apps/server/src/agent-os/domain/agent-definition.registry.ts` already owns runtime Agent definitions in code. The plan reuses that boundary and does not add DB `AgentDefinition`.
- `apps/web/src/app/agent-os/page.tsx` already fetches definitions, instances, requests, running runs, and selected run graph data. The plan reuses the existing APIs.
- `apps/web/src/app/agent-os/lib/agent-os-task-board.ts` already maps request status to board columns. The plan keeps that status mapping and changes grouped items from raw requests to board tasks.
- `apps/web/src/app/agent-os/components/ExecutionCanvas.tsx` and `ExecutionNodeDetail.tsx` already provide read-only Developer Trace. The plan keeps graph/canvas UI secondary.
- Existing gstack learning applied: `agent-os-taskkey-not-idempotency` confirms `taskKey` is runtime identity, not user-facing copy.

### Review Findings

1. [P1] (confidence: 9/10) `docs/superpowers/plans/2026-06-27-agent-os-capability-catalog.md:587` — Projection test fixtures used old `AgentDefinitionSummary` and `AgentInstanceSummary` shapes. Fixed by matching `packages/shared/src/schemas/agent-os.ts`.
2. [P1] (confidence: 8/10) `apps/web/src/app/agent-os/components/AgentOsTaskBoard.tsx` — The plan originally added behavior to a 923-line component. Fixed by adding `AgentOsTaskBoardSections.tsx` extraction before service UI changes.
3. [P2] (confidence: 8/10) `docs/superpowers/plans/2026-06-27-agent-os-capability-catalog.md:1425` — Drawer conversion needed a null selected-task guard. Fixed with an explicit empty drawer return.
4. [P2] (confidence: 8/10) `docs/superpowers/plans/2026-06-27-agent-os-capability-catalog.md:1647` — Raw runtime ID hiding was only covered by browser QA. Fixed by adding `AgentOsTaskBoard.spec.tsx`.

### Test Coverage Diagram

```text
CODE PATHS                                                     USER FLOWS
[+] agent-capability-catalog.ts                                [+] /agent-os board load
  ├── [★★★ PLANNED] service group order                          ├── [★★★ PLANNED] service nav visible
  ├── [★★★ PLANNED] exact taskKey match                           ├── [★★★ PLANNED] capability titles visible
  ├── [★★★ PLANNED] agent-type default fallback                   ├── [★★★ PLANNED] raw IDs hidden from cards/Overview
  └── [★★★ PLANNED] unknown operator fallback                     └── [★★  PLANNED] browser no-overlap/no-console-errors

[+] agent-os-task-projection.ts                                [+] Service filtering
  ├── [★★★ PLANNED] request -> board task                         ├── [★★★ PLANNED] All keeps every task
  ├── [★★★ PLANNED] instance/definition display name              ├── [★★★ PLANNED] service group filters tasks
  ├── [★★★ PLANNED] raw trace preservation                         └── [★★  PLANNED] empty service group displays empty state
  └── [★★★ PLANNED] service group filter

[+] agent-os-task-board.ts                                     [+] Drawer inspection
  ├── [★★★ PLANNED] pending scheduled -> backlog                  ├── [★★★ PLANNED] Overview is service-facing
  ├── [★★★ PLANNED] pending immediate -> ready                    ├── [★★  PLANNED] Controls remain usable
  ├── [★★★ PLANNED] claimed -> running                            ├── [★★  PLANNED] Activity is operator-facing
  ├── [★★★ PLANNED] approval -> approval                          └── [★★★ PLANNED] Developer Trace shows raw metadata
  ├── [★★★ PLANNED] success/coalesced -> done
  ├── [★★★ PLANNED] failed/cancelled/skipped -> failed
  └── [★★★ PLANNED] priority/newest sorting

[+] AgentOsTaskBoard.tsx / AgentOsTaskBoardSections.tsx
  ├── [★★★ PLANNED] service sidebar counts
  ├── [★★★ PLANNED] card capability title/description
  ├── [★★★ PLANNED] selected task drawer guard
  ├── [★★★ PLANNED] raw metadata isolated to Developer Trace
  └── [★★  PLANNED] browser visual QA

COVERAGE AFTER IMPLEMENTATION: 26/26 planned paths covered
QUALITY: ★★★:23 ★★:3 ★:0
GAPS AFTER REVIEW: 0
```

### Failure Modes

- Unknown catalog mapping: covered by catalog fallback test; user sees `분류되지 않은 Agent 작업`, not a crash.
- Empty request list or empty service group: covered by initialized grouping and browser QA; user sees an empty state.
- Selected task disappears after polling: covered by page selection logic and drawer null guard; user sees the empty drawer state.
- Raw runtime metadata leaks into default board: covered by `AgentOsTaskBoard.spec.tsx`; user only sees raw fields in Developer Trace.
- Selected run graph fails to load: existing Trace tab error state remains; user still sees task state from the board.

Critical gaps: 0.

### NOT In Scope

- DB `AgentDefinition`: deferred because runtime definitions remain code-owned.
- DB capability override model: deferred until operators need no-deploy label edits, per-organization aliases, entitlement, or billing controls.
- Backend API change: deferred because existing Agent OS APIs already provide the needed data.
- Workflow builder controls: deferred because `/agent-os` is task control plus read-only trace, not a workflow editor.
- Custom organization-specific labels: deferred because the catalog is the official KidItem service surface for this phase.

### Diagrams

- The plan includes a data-flow diagram at the top and a coverage diagram in this review report.
- No inline ASCII code comment is required for the catalog or projection helpers; the functions are small and covered by focused unit tests.
- If `AgentOsTaskBoardSections.tsx` grows past 500 lines during implementation, add a short component dependency diagram in that file before merge.

### Worktree Parallelization

Sequential implementation, no parallelization opportunity.

Reason: every task touches the same route module, and UI work depends on catalog/projection types. A parallel split would create merge conflicts in `apps/web/src/app/agent-os/components/` and `apps/web/src/app/agent-os/lib/`.

### Completion Summary

- Step 0: Scope Challenge — scope accepted as-is after resolving the large-component concern.
- Architecture Review: 1 issue found, 1 resolved.
- Code Quality Review: 2 issues found, 2 resolved.
- Test Review: diagram produced, 1 gap identified, 1 resolved.
- Performance Review: 0 issues found.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 items proposed.
- Failure modes: 0 critical gaps flagged.
- Outside voice: skipped.
- Parallelization: sequential, 0 parallel lanes.
- Lake Score: 4/4 recommendations chose the complete option.

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement.
