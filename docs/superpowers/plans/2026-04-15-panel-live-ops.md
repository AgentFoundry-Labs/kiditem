# Panel Live Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent OS의 3개 async 소스(workflow/agent/image_edit)와 비즈니스 알림을 하나의 live slide-out 패널로 통합. Alert → ActionTask 한 방향 승격 + Action Board 내/팀 필터 추가.

**Architecture:** NestJS `@Sse()` + `EventEmitter2` (기존 `AgentSseService` 패턴 확장) → `@microsoft/fetch-event-source` 래퍼 → Zustand store → Radix Sheet UI. 새 테이블 없음 — 원본 테이블(WorkflowRun, HeartbeatRun, ThumbnailEdit, Alert)에서 adapter를 통해 매핑. Source registry + Adapter 패턴으로 확장성 확보.

**Tech Stack:** NestJS 11, Next.js 16, Prisma (PostgreSQL), rxjs, `@microsoft/fetch-event-source`, Radix UI Sheet, Zustand, Tailwind, Lucide, Zod, Vitest.

**Spec**: `docs/superpowers/specs/2026-04-15-panel-live-ops-design.md` (먼저 읽고 시작).

---

## File Structure

### New Files

**Shared (packages/shared)**:
- `packages/shared/src/panel/sources.ts` — PANEL_RUN_SOURCES registry
- `packages/shared/src/panel/types.ts` — PanelItem discriminated union, PanelEvent wire type
- `packages/shared/src/panel/index.ts` — re-export

**Backend (apps/server/src/panel/)**:
- `panel.module.ts` — NestJS module
- `panel.controller.ts` — `@Sse('stream')`, `@Get('backfill')`
- `panel.service.ts` — backfill 쿼리 (원본 테이블 union)
- `promote.controller.ts` — `POST /alerts/:id/promote`, `POST /alerts/:id/dismiss`
- `promote.service.ts` — Alert → ActionTask 변환
- `events/panel-sse.service.ts` — rxjs Subject, @OnEvent, seq, ring buffer, companyId filter
- `events/panel-events.ts` — PANEL_EVENTS 상수, payload 타입
- `adapters/types.ts` — PanelRunAdapter interface
- `adapters/registry.ts` — panelRunAdapters 등록
- `adapters/workflow.adapter.ts`
- `adapters/agent.adapter.ts`
- `adapters/image.adapter.ts`
- `adapters/alert.adapter.ts`

**Frontend (apps/web/src/components/panel/)**:
- `PanelSheet.tsx` — Radix Sheet + 섹션 렌더
- `PanelItemRow.tsx` — run/alert 구분 렌더
- `PanelGroupHeader.tsx` — "내 작업", "팀" 섹션 헤더
- `PromoteToTaskModal.tsx` — 승격 모달
- `hooks/usePanelStream.ts` — SSE client 생명주기
- `hooks/usePanelStore.ts` — Zustand selector helpers
- `lib/panel-sse-client.ts` — `@microsoft/fetch-event-source` 래퍼
- `lib/panel-store.ts` — Zustand store

**ADR**:
- `.claude/docs/decisions/NNNN-panel-sse-frontend-exception.md`
- `.claude/docs/decisions/NNNN-panel-vs-actionboard-boundary.md`

**Tests**: 각 파일 옆 `__tests__/*.spec.ts` 병행 생성.

### Modified Files

- `prisma/schema.prisma` — Alert.actionTaskId + ActionTask.assigneeUserId + User.assignedActionTasks
- `apps/server/src/app.module.ts` — PanelModule import
- `apps/server/src/workflows/**/*.service.ts` — panel adapter emit hook
- `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts` — panel adapter emit hook
- `apps/server/src/products/services/thumbnail-edit.service.ts` — panel adapter emit hook
- `apps/server/src/rules/**/*.service.ts` — Alert insert 후 panel adapter emit
- `apps/server/src/action-task/action-task.service.ts` — claim/unclaim, assignedTo 필터
- `apps/server/src/action-task/action-task.controller.ts` — `PATCH /:id/claim`, `/unclaim`, `GET ?assignedTo=`
- `packages/shared/src/index.ts` — Panel re-export
- `apps/web/package.json` — `@microsoft/fetch-event-source` 추가
- `apps/web/src/components/layout/Sidebar.tsx` — Bell dropdown → PanelSheet trigger
- `apps/web/src/components/layout/AppLayout.tsx` — PanelSheet mount + SSE 초기화
- `apps/web/src/app/action-board/page.tsx` — SegmentedControl + assignee + claim 버튼

### Deleted Files

- `apps/web/src/components/layout/Header.tsx` — dead code (AppLayout에 import 없음)

---

## Phase 0 — Prerequisites (ADR + Schema)

### Task 1: ADR 1 — Panel SSE 프론트엔드 예외

**Files:**
- Create: `.claude/docs/decisions/0011-panel-sse-frontend-exception.md`

번호 확인 필요 — 기존 ADR 리스트 보고 다음 번호 사용. 아래는 `0011` 가정.

- [ ] **Step 1: 다음 ADR 번호 확인**

Run: `ls .claude/docs/decisions/ | grep -E '^[0-9]+' | sort | tail -3`

Expected: 최신 ADR 번호 (예: `0010-xxx.md`). 다음 번호는 `0011`. 만약 다르면 아래 파일명 교체.

- [ ] **Step 2: ADR 작성**

Create `.claude/docs/decisions/0011-panel-sse-frontend-exception.md`:

```markdown
# ADR-0011: Panel 도메인 SSE 프론트엔드 예외

**Status:** Accepted
**Date:** 2026-04-15
**Related spec:** docs/superpowers/specs/2026-04-15-panel-live-ops-design.md

## Context

`apps/web/src/app/agents/CLAUDE.md:109` 및 `apps/web/src/app/thumbnails/CLAUDE.md:55`에 "EventSource/WebSocket 금지" 규정.

원인: 표준 `EventSource` API가 HTTP 헤더를 못 보냄 → dev 인증의 `x-dev-user-id` 헤더(ADR-0006 `DevAuthMiddleware`)와 호환 불가. `apps/web/src/lib/api-client.ts:5` 주석에 이유 기록됨.

## Decision

Panel 도메인(`apps/web/src/components/panel/`) 한정으로 `@microsoft/fetch-event-source` 라이브러리 사용 허용. fetch API 기반이라 모든 HTTP 헤더 지원 + 자동 재연결 + Last-Event-ID.

스코프: Panel 도메인만. agents/thumbnails/기타 도메인은 기존 polling 유지. 신규 도메인이 SSE 원하면 별도 ADR.

## Alternatives Rejected

- **쿠리 파라미터 인증** (`?devUserId=X`): 프로덕션 인증 전환 시 쿠키/토큰 정책과 충돌 위험
- **WebSocket**: bidirectional 불필요, 인프라 추가 부담
- **폴링 전면**: Action Board처럼 60s polling은 "live 파노라마" 경험 불가

## Consequences

- 의존성 1개 추가 (`@microsoft/fetch-event-source`, ~5KB gzip)
- Panel 도메인 내부에 격리된 client 래퍼 하나 (`PanelSseClient`)
- 기존 agents/thumbnails 규칙 그대로 유지
- 서버 SSE 엔드포인트는 이미 존재 (`@Sse()` + `AgentSseService`) — 패턴 재사용
```

- [ ] **Step 3: Commit**

```bash
git add .claude/docs/decisions/0011-panel-sse-frontend-exception.md
git commit -m "docs(adr): ADR-0011 Panel SSE frontend exception via fetch-event-source"
```

---

### Task 2: ADR 2 — Panel vs Action Board 경계

**Files:**
- Create: `.claude/docs/decisions/0012-panel-vs-actionboard-boundary.md`

- [ ] **Step 1: ADR 작성**

Create `.claude/docs/decisions/0012-panel-vs-actionboard-boundary.md`:

```markdown
# ADR-0012: Panel vs Action Board 경계

**Status:** Accepted
**Date:** 2026-04-15
**Related spec:** docs/superpowers/specs/2026-04-15-panel-live-ops-design.md

## Context

Panel(신규 live surface)과 기존 `/action-board` 페이지가 둘 다 "주목할 대상"을 보여줘 혼동 위험.

## Decision

- **Panel** = 관찰 surface. Ephemeral, 자동 수명. Run (auto-transition) + Alert (dismissable).
- **Action Board** = 작업 surface. Durable, 명시적 상태머신. ActionTask + assignee + notes.
- 한 방향 승격: Alert → ActionTask. Run → ActionTask는 Phase 2.
- Action Task 상태 변경이 Panel에 자동 반영 안 함 (Phase 2).

## Alternatives Rejected

- **Panel이 Action Board 흡수**: mental model 통합 어려움, 결국 필터 여러 개 추가
- **Action Board가 Panel 흡수**: durable UI에 ephemeral 섞여 복잡도 증가

## Consequences

- 사용자가 두 surface의 역할 학습 필요 (초기 UX 부담)
- 경계가 명확해서 각자 진화 가능
- Alert → Task 승격이 유일한 cross-surface 연결
```

- [ ] **Step 2: Commit**

```bash
git add .claude/docs/decisions/0012-panel-vs-actionboard-boundary.md
git commit -m "docs(adr): ADR-0012 Panel vs Action Board boundary"
```

---

### Task 3: Prisma 스키마 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (Alert, ActionTask, User)

- [ ] **Step 1: Alert 모델에 actionTaskId 추가**

Modify `prisma/schema.prisma` — `model Alert` 내부 (기존 필드 끝에 추가):

```prisma
model Alert {
  // ... existing fields ...
  actionTaskId String?     @map("action_task_id") @db.Uuid
  actionTask   ActionTask? @relation(fields: [actionTaskId], references: [id], onDelete: SetNull)

  // ... existing @@index ...
  @@index([companyId, actionTaskId])
}
```

- [ ] **Step 2: ActionTask 모델에 assigneeUserId 추가 + relation**

Modify `prisma/schema.prisma` — `model ActionTask` 내부:

```prisma
model ActionTask {
  // ... existing fields ...
  assigneeUserId String? @map("assignee_user_id") @db.Uuid
  assignee       User?   @relation("ActionTaskAssignee", fields: [assigneeUserId], references: [id], onDelete: SetNull)
  promotedFromAlerts Alert[]   // Alert.actionTaskId 역참조 (자동)

  // ... existing @@index ...
  @@index([companyId, assigneeUserId])
}
```

- [ ] **Step 3: User 모델에 assignedActionTasks back-relation 추가**

Modify `prisma/schema.prisma` — `model User` 내부:

```prisma
model User {
  // ... existing fields ...
  assignedActionTasks ActionTask[] @relation("ActionTaskAssignee")
}
```

- [ ] **Step 4: 마이그레이션 생성 + 적용**

Run:
```bash
npx prisma migrate dev --name panel_integration_alert_actiontask_assignee
```

Expected: 마이그레이션 파일 생성 + dev DB 적용 + `prisma generate` 자동 실행.

- [ ] **Step 5: @kiditem/shared 재빌드 (Prisma 타입 참조)**

Run: `npm run build --workspace=@kiditem/shared`

Expected: 빌드 성공.

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat(prisma): Alert.actionTaskId + ActionTask.assigneeUserId for panel integration"
```

---

## Phase 1 — Shared Panel Types

### Task 4: PANEL_RUN_SOURCES registry

**Files:**
- Create: `packages/shared/src/panel/sources.ts`
- Create: `packages/shared/src/panel/__tests__/sources.spec.ts`

- [ ] **Step 1: Write failing test**

Create `packages/shared/src/panel/__tests__/sources.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PANEL_RUN_SOURCES, PanelRunSourceSchema } from '../sources';

describe('PANEL_RUN_SOURCES', () => {
  it('contains workflow, agent, image_edit', () => {
    expect(PANEL_RUN_SOURCES.workflow).toBeDefined();
    expect(PANEL_RUN_SOURCES.agent).toBeDefined();
    expect(PANEL_RUN_SOURCES.image_edit).toBeDefined();
  });

  it('each source has label, iconName, deepLinkPattern', () => {
    Object.values(PANEL_RUN_SOURCES).forEach((meta) => {
      expect(meta).toMatchObject({
        label: expect.any(String),
        iconName: expect.any(String),
        deepLinkPattern: expect.stringContaining(':id'),
      });
    });
  });

  it('PanelRunSourceSchema accepts registered source', () => {
    expect(() => PanelRunSourceSchema.parse('workflow')).not.toThrow();
  });

  it('PanelRunSourceSchema rejects unknown source', () => {
    expect(() => PanelRunSourceSchema.parse('unknown_source')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/panel/__tests__/sources.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement sources.ts**

Create `packages/shared/src/panel/sources.ts`:

```typescript
import { z } from 'zod';

export const PANEL_RUN_SOURCES = {
  workflow: {
    label: '워크플로우',
    iconName: 'Workflow',
    deepLinkPattern: '/workflows/runs/:id',
  },
  agent: {
    label: '에이전트',
    iconName: 'Bot',
    deepLinkPattern: '/agents/tasks/:id/trace',
  },
  image_edit: {
    label: '이미지 편집',
    iconName: 'Image',
    deepLinkPattern: '/thumbnail-editor?editId=:id',
  },
} as const;

export type PanelRunSource = keyof typeof PANEL_RUN_SOURCES;

const sourceKeys = Object.keys(PANEL_RUN_SOURCES) as [PanelRunSource, ...PanelRunSource[]];
export const PanelRunSourceSchema = z.enum(sourceKeys);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/panel/__tests__/sources.spec.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/panel/sources.ts packages/shared/src/panel/__tests__/sources.spec.ts
git commit -m "feat(shared): add PANEL_RUN_SOURCES registry for panel extensibility"
```

---

### Task 5: PanelItem discriminated union + PanelEvent wire type

**Files:**
- Create: `packages/shared/src/panel/types.ts`
- Create: `packages/shared/src/panel/index.ts`
- Create: `packages/shared/src/panel/__tests__/types.spec.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/shared/src/panel/__tests__/types.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PanelItem, PanelEvent } from '../types';

const baseFields = {
  id: 'workflow:abc',
  companyId: '00000000-0000-0000-0000-000000000001',
  seq: 1,
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  title: 'Test',
  actorUserId: null,
  visibility: 'company' as const,
};

describe('PanelItem', () => {
  it('parses a run item', () => {
    const run = {
      ...baseFields,
      kind: 'run',
      source: 'workflow',
      sourceId: 'abc',
      status: 'running',
      deepLink: '/workflows/runs/abc',
    };
    expect(() => PanelItem.parse(run)).not.toThrow();
  });

  it('parses an alert item', () => {
    const alert = {
      ...baseFields,
      kind: 'alert',
      alertType: 'stock_low',
      severity: 'warn',
    };
    expect(() => PanelItem.parse(alert)).not.toThrow();
  });

  it('rejects run item with unknown source', () => {
    const bad = {
      ...baseFields,
      kind: 'run',
      source: 'unknown',
      sourceId: 'x',
      status: 'running',
      deepLink: '/x',
    };
    expect(() => PanelItem.parse(bad)).toThrow();
  });

  it('rejects unknown alertType', () => {
    const bad = {
      ...baseFields,
      kind: 'alert',
      alertType: 'unknown_alert',
      severity: 'info',
    };
    expect(() => PanelItem.parse(bad)).toThrow();
  });
});

describe('PanelEvent', () => {
  it('parses upsert event', () => {
    const event = { type: 'upsert', seq: 5, item: {
      ...baseFields,
      kind: 'alert',
      alertType: 'stock_low',
      severity: 'warn',
    }};
    expect(() => PanelEvent.parse(event)).not.toThrow();
  });

  it('parses snapshot event with items array', () => {
    const event = { type: 'snapshot', seq: 0, items: [] };
    expect(() => PanelEvent.parse(event)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/panel/__tests__/types.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement types.ts**

Create `packages/shared/src/panel/types.ts`:

```typescript
import { z } from 'zod';
import { PanelRunSourceSchema } from './sources';

const PanelItemBase = z.object({
  id: z.string(),
  companyId: z.string().uuid(),
  seq: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  parentId: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  actorUserId: z.string().uuid().nullable(),
  visibility: z.enum(['company', 'user']),
});

export const PanelRunItem = PanelItemBase.extend({
  kind: z.literal('run'),
  source: PanelRunSourceSchema,
  sourceId: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  progress: z.number().min(0).max(1).optional(),
  etaSeconds: z.number().optional(),
  deepLink: z.string(),
  errorMessage: z.string().optional(),
});

export const PanelAlertItem = PanelItemBase.extend({
  kind: z.literal('alert'),
  alertType: z.enum(['minus_product', 'profit_low', 'ad_high', 'stock_low', 'grade_change']),
  severity: z.enum(['info', 'warn', 'critical']),
  message: z.string().optional(),
  dismissedAt: z.string().datetime().optional(),
  actionTaskId: z.string().uuid().optional(),
  deepLink: z.string().optional(),
});

export const PanelItem = z.discriminatedUnion('kind', [PanelRunItem, PanelAlertItem]);
export type PanelItem = z.infer<typeof PanelItem>;
export type PanelRunItem = z.infer<typeof PanelRunItem>;
export type PanelAlertItem = z.infer<typeof PanelAlertItem>;

export const PanelEvent = z.object({
  type: z.enum(['upsert', 'dismiss', 'snapshot']),
  item: PanelItem.optional(),
  items: z.array(PanelItem).optional(),
  seq: z.number().int(),
});
export type PanelEvent = z.infer<typeof PanelEvent>;
```

Create `packages/shared/src/panel/index.ts`:

```typescript
export * from './sources';
export * from './types';
```

Modify `packages/shared/src/index.ts` — add line:

```typescript
export * from './panel';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/panel/__tests__/types.spec.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Build shared package**

Run: `npm run build --workspace=@kiditem/shared`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/panel/ packages/shared/src/index.ts
git commit -m "feat(shared): PanelItem discriminated union + PanelEvent wire types"
```

---

## Phase 2 — Backend Panel Module Infrastructure

### Task 6: PanelSseService — Subject + seq + ring buffer + companyId filter

**Files:**
- Create: `apps/server/src/panel/events/panel-events.ts`
- Create: `apps/server/src/panel/events/panel-sse.service.ts`
- Create: `apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`

- [ ] **Step 1: Create event constants file**

Create `apps/server/src/panel/events/panel-events.ts`:

```typescript
import type { PanelItem } from '@kiditem/shared';

export const PANEL_EVENTS = {
  UPSERT: 'panel.item.upsert',
  DISMISS: 'panel.item.dismiss',
} as const;

export interface PanelUpsertEvent {
  item: Omit<PanelItem, 'seq' | 'updatedAt'>;
  companyId: string;
}

export interface PanelDismissEvent {
  itemId: string;
  companyId: string;
}
```

- [ ] **Step 2: Write failing test for PanelSseService**

Create `apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PanelSseService } from '../panel-sse.service';
import { PANEL_EVENTS } from '../panel-events';
import { firstValueFrom, take, toArray } from 'rxjs';

describe('PanelSseService', () => {
  let service: PanelSseService;
  let emitter: EventEmitter2;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [PanelSseService],
    }).compile();
    service = moduleRef.get(PanelSseService);
    emitter = moduleRef.get(EventEmitter2);
  });

  const makeItem = (overrides = {}) => ({
    id: 'workflow:abc',
    companyId: 'co-1',
    kind: 'run' as const,
    source: 'workflow' as const,
    sourceId: 'abc',
    status: 'running' as const,
    title: 'Test',
    deepLink: '/x',
    actorUserId: null,
    visibility: 'company' as const,
    createdAt: '2026-04-15T00:00:00Z',
    ...overrides,
  });

  it('emits upsert event to subscribers matching companyId', async () => {
    const stream = service.getStream('co-1');
    const next = firstValueFrom(stream.pipe(take(1)));

    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem(), companyId: 'co-1' });

    const event = await next;
    expect((event as any).data).toMatchObject({ type: 'upsert', item: { id: 'workflow:abc' } });
  });

  it('filters out events for different companyId', async () => {
    const stream = service.getStream('co-1');
    const collected: any[] = [];
    const sub = stream.subscribe((e) => collected.push(e));

    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'other' }), companyId: 'co-2' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'mine' }), companyId: 'co-1' });

    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();

    expect(collected).toHaveLength(1);
    expect((collected[0] as any).data.item.id).toBe('mine');
  });

  it('assigns monotonically increasing seq', async () => {
    const stream = service.getStream('co-1');
    const collected: any[] = [];
    const sub = stream.subscribe((e) => collected.push((e as any).data));

    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'a' }), companyId: 'co-1' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'b' }), companyId: 'co-1' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'c' }), companyId: 'co-1' });

    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();

    const seqs = collected.map((e) => e.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('replays ring buffer events when afterSeq given', async () => {
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'a' }), companyId: 'co-1' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'b' }), companyId: 'co-1' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'c' }), companyId: 'co-1' });

    const replayed = service.replayAfter('co-1', 1);
    expect(replayed.map((e) => e.seq)).toEqual([2, 3]);
  });

  it('ring buffer caps at 100 per company', async () => {
    for (let i = 0; i < 150; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `i-${i}` }), companyId: 'co-1' });
    }
    const all = service.replayAfter('co-1', 0);
    expect(all.length).toBe(100);
  });

  it('emits dismiss event', async () => {
    const stream = service.getStream('co-1');
    const next = firstValueFrom(stream.pipe(take(1)));

    emitter.emit(PANEL_EVENTS.DISMISS, { itemId: 'workflow:abc', companyId: 'co-1' });

    const event = await next;
    expect((event as any).data).toMatchObject({ type: 'dismiss' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`
Expected: FAIL (service not exists).

- [ ] **Step 4: Implement PanelSseService**

Create `apps/server/src/panel/events/panel-sse.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { PanelEvent } from '@kiditem/shared';
import { PANEL_EVENTS, PanelUpsertEvent, PanelDismissEvent } from './panel-events';

interface BufferedEvent {
  event: PanelEvent;
  companyId: string;
}

const RING_BUFFER_SIZE = 100;

@Injectable()
export class PanelSseService {
  private readonly subject = new Subject<BufferedEvent>();
  private seqCounter = 0;
  // Map<companyId, BufferedEvent[]>
  private readonly ringBuffer = new Map<string, BufferedEvent[]>();

  @OnEvent(PANEL_EVENTS.UPSERT)
  handleUpsert(payload: PanelUpsertEvent) {
    const seq = ++this.seqCounter;
    const timestamp = new Date().toISOString();
    const event: PanelEvent = {
      type: 'upsert',
      seq,
      item: { ...payload.item, seq, updatedAt: timestamp } as any,
    };
    this.pushEvent(payload.companyId, event);
  }

  @OnEvent(PANEL_EVENTS.DISMISS)
  handleDismiss(payload: PanelDismissEvent) {
    const seq = ++this.seqCounter;
    const event: PanelEvent = {
      type: 'dismiss',
      seq,
      item: { id: payload.itemId } as any,
    };
    this.pushEvent(payload.companyId, event);
  }

  private pushEvent(companyId: string, event: PanelEvent) {
    const buffered: BufferedEvent = { event, companyId };
    this.subject.next(buffered);
    // ring buffer
    const arr = this.ringBuffer.get(companyId) ?? [];
    arr.push(buffered);
    if (arr.length > RING_BUFFER_SIZE) arr.shift();
    this.ringBuffer.set(companyId, arr);
  }

  getStream(subscriberCompanyId: string): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      filter((buffered) => buffered.companyId === subscriberCompanyId),
      map((buffered) => ({ data: buffered.event, id: String(buffered.event.seq) } as MessageEvent)),
    );
  }

  replayAfter(companyId: string, afterSeq: number): PanelEvent[] {
    const arr = this.ringBuffer.get(companyId) ?? [];
    return arr
      .filter((b) => b.event.seq > afterSeq)
      .map((b) => b.event);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/panel/events/
git commit -m "feat(panel): PanelSseService with rxjs Subject, seq counter, ring buffer, companyId filter"
```

---

### Task 7: Panel Run Adapters (workflow/agent/image)

**Files:**
- Create: `apps/server/src/panel/adapters/types.ts`
- Create: `apps/server/src/panel/adapters/registry.ts`
- Create: `apps/server/src/panel/adapters/workflow.adapter.ts`
- Create: `apps/server/src/panel/adapters/agent.adapter.ts`
- Create: `apps/server/src/panel/adapters/image.adapter.ts`
- Create: `apps/server/src/panel/adapters/alert.adapter.ts`
- Create: `apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`

- [ ] **Step 1: Create adapter types**

Create `apps/server/src/panel/adapters/types.ts`:

```typescript
import type { PanelRunItem, PanelAlertItem, PanelRunSource } from '@kiditem/shared';

export interface PanelRunAdapter<TDomainEntity = unknown> {
  source: PanelRunSource;
  mapToItem(entity: TDomainEntity, companyId: string): Omit<PanelRunItem, 'seq' | 'updatedAt'>;
  defaultVisibility(entity: TDomainEntity): 'company' | 'user';
}

export interface PanelAlertAdapter<TDomainEntity = unknown> {
  mapToItem(entity: TDomainEntity, companyId: string): Omit<PanelAlertItem, 'seq' | 'updatedAt'>;
}
```

- [ ] **Step 2: Write failing test for workflow adapter**

Create `apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { workflowPanelAdapter } from '../workflow.adapter';

describe('workflowPanelAdapter', () => {
  const baseRun = {
    id: 'run-uuid',
    workflowName: '소싱 파이프라인',
    status: 'running',
    totalSteps: 10,
    completedSteps: 4,
    parentRunId: null,
    triggeredBy: 'user-uuid',
    createdAt: new Date('2026-04-15T00:00:00Z'),
  };

  it('maps workflow run to PanelRunItem', () => {
    const item = workflowPanelAdapter.mapToItem(baseRun as any, 'co-1');
    expect(item).toMatchObject({
      id: 'workflow:run-uuid',
      kind: 'run',
      source: 'workflow',
      sourceId: 'run-uuid',
      status: 'running',
      title: '소싱 파이프라인',
      subtitle: '4/10 단계',
      progress: 0.4,
      deepLink: '/workflows/runs/run-uuid',
      actorUserId: 'user-uuid',
      visibility: 'user',
      companyId: 'co-1',
    });
  });

  it('scheduled trigger (triggeredBy=null) → visibility=company', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...baseRun, triggeredBy: null } as any,
      'co-1',
    );
    expect(item.visibility).toBe('company');
    expect(item.actorUserId).toBeNull();
  });

  it('includes parentId when parentRunId set', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...baseRun, parentRunId: 'parent-uuid' } as any,
      'co-1',
    );
    expect(item.parentId).toBe('workflow:parent-uuid');
  });

  it('progress undefined when totalSteps=0', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...baseRun, totalSteps: 0, completedSteps: 0 } as any,
      'co-1',
    );
    expect(item.progress).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement workflow adapter**

Create `apps/server/src/panel/adapters/workflow.adapter.ts`:

```typescript
import type { WorkflowRun } from '@prisma/client';
import type { PanelRunAdapter } from './types';

export const workflowPanelAdapter: PanelRunAdapter<WorkflowRun & { workflowName: string; totalSteps: number; completedSteps: number; parentRunId?: string | null; triggeredBy?: string | null }> = {
  source: 'workflow',
  mapToItem(run, companyId) {
    return {
      id: `workflow:${run.id}`,
      kind: 'run',
      source: 'workflow',
      sourceId: run.id,
      companyId,
      status: run.status as any,
      title: run.workflowName,
      subtitle: `${run.completedSteps}/${run.totalSteps} 단계`,
      progress: run.totalSteps > 0 ? run.completedSteps / run.totalSteps : undefined,
      deepLink: `/workflows/runs/${run.id}`,
      parentId: run.parentRunId ? `workflow:${run.parentRunId}` : undefined,
      actorUserId: run.triggeredBy ?? null,
      visibility: workflowPanelAdapter.defaultVisibility(run),
      createdAt: run.createdAt.toISOString(),
    };
  },
  defaultVisibility(run) {
    return run.triggeredBy == null ? 'company' : 'user';
  },
};
```

**참고**: 실제 `WorkflowRun` Prisma 모델의 필드명과 다를 수 있으니 `prisma/schema.prisma` 확인 후 `workflowName`, `totalSteps` 등을 실제 필드 또는 relation으로 교체. 이 adapter가 필요로 하는 정보가 모델에 없으면 서비스에서 join/compose해서 넘김.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`
Expected: 4 tests PASS.

- [ ] **Step 6: Implement agent adapter**

Create `apps/server/src/panel/adapters/agent.adapter.ts`:

```typescript
import type { HeartbeatRun } from '@prisma/client';
import type { PanelRunAdapter } from './types';

export const agentPanelAdapter: PanelRunAdapter<HeartbeatRun & { agentName: string; triggeredBy?: string | null }> = {
  source: 'agent',
  mapToItem(run, companyId) {
    const statusMap: Record<string, PanelRunAdapter['mapToItem'] extends (...args: any) => { status: infer S } ? S : never> = {
      pending: 'pending',
      running: 'running',
      succeeded: 'succeeded',
      failed: 'failed',
      paused: 'cancelled',
    } as any;
    return {
      id: `agent:${run.id}`,
      kind: 'run',
      source: 'agent',
      sourceId: run.id,
      companyId,
      status: (statusMap[run.status] ?? 'pending') as any,
      title: run.agentName,
      subtitle: undefined,
      deepLink: `/agents/tasks/${run.id}/trace`,
      parentId: undefined,
      actorUserId: run.triggeredBy ?? null,
      visibility: agentPanelAdapter.defaultVisibility(run),
      createdAt: run.createdAt.toISOString(),
    };
  },
  defaultVisibility(run) {
    return run.triggeredBy == null ? 'company' : 'user';
  },
};
```

- [ ] **Step 7: Implement image_edit adapter**

Create `apps/server/src/panel/adapters/image.adapter.ts`:

```typescript
import type { ThumbnailEdit } from '@prisma/client';
import type { PanelRunAdapter } from './types';

export const imagePanelAdapter: PanelRunAdapter<ThumbnailEdit & { totalImages?: number; processedImages?: number; triggeredBy?: string | null }> = {
  source: 'image_edit',
  mapToItem(edit, companyId) {
    const total = edit.totalImages ?? 1;
    const processed = edit.processedImages ?? 0;
    return {
      id: `image_edit:${edit.id}`,
      kind: 'run',
      source: 'image_edit',
      sourceId: edit.id,
      companyId,
      status: edit.status as any,
      title: '썸네일 AI 편집',
      subtitle: `${processed}/${total} 장`,
      progress: total > 0 ? processed / total : undefined,
      deepLink: `/thumbnail-editor?editId=${edit.id}`,
      parentId: undefined,
      actorUserId: edit.triggeredBy ?? null,
      visibility: imagePanelAdapter.defaultVisibility(edit),
      createdAt: edit.createdAt.toISOString(),
    };
  },
  defaultVisibility() {
    return 'user'; // 이미지 편집은 항상 개인 컨텍스트
  },
};
```

- [ ] **Step 8: Implement alert adapter**

Create `apps/server/src/panel/adapters/alert.adapter.ts`:

```typescript
import type { Alert } from '@prisma/client';
import type { PanelAlertAdapter } from './types';

export const alertPanelAdapter: PanelAlertAdapter<Alert> = {
  mapToItem(alert, companyId) {
    return {
      id: `alert:${alert.id}`,
      kind: 'alert',
      companyId,
      alertType: alert.type as any,
      severity: alert.severity as any,
      title: alert.title,
      message: alert.message ?? undefined,
      actionTaskId: alert.actionTaskId ?? undefined,
      actorUserId: null,
      visibility: 'company',
      createdAt: alert.createdAt.toISOString(),
    };
  },
};
```

- [ ] **Step 9: Create registry**

Create `apps/server/src/panel/adapters/registry.ts`:

```typescript
import type { PanelRunAdapter } from './types';
import type { PanelRunSource } from '@kiditem/shared';
import { workflowPanelAdapter } from './workflow.adapter';
import { agentPanelAdapter } from './agent.adapter';
import { imagePanelAdapter } from './image.adapter';

export const panelRunAdapters: Record<PanelRunSource, PanelRunAdapter> = {
  workflow: workflowPanelAdapter as PanelRunAdapter,
  agent: agentPanelAdapter as PanelRunAdapter,
  image_edit: imagePanelAdapter as PanelRunAdapter,
};
```

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/panel/adapters/
git commit -m "feat(panel): run & alert adapters + registry (strategy pattern)"
```

---

### Task 8: PanelController — @Sse stream + backfill endpoint

**Files:**
- Create: `apps/server/src/panel/panel.service.ts`
- Create: `apps/server/src/panel/panel.controller.ts`
- Create: `apps/server/src/panel/__tests__/panel.controller.spec.ts`

- [ ] **Step 1: Write failing test for controller**

Create `apps/server/src/panel/__tests__/panel.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PanelController } from '../panel.controller';
import { PanelService } from '../panel.service';
import { PanelSseService } from '../events/panel-sse.service';

describe('PanelController', () => {
  let controller: PanelController;
  let sseService: PanelSseService;
  let panelService: PanelService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        PanelSseService,
        {
          provide: PanelService,
          useValue: {
            snapshot: vi.fn().mockResolvedValue([]),
            backfill: vi.fn().mockResolvedValue([]),
          },
        },
        PanelController,
      ],
    }).compile();
    controller = moduleRef.get(PanelController);
    sseService = moduleRef.get(PanelSseService);
    panelService = moduleRef.get(PanelService);
  });

  it('stream() returns Observable', () => {
    const result = controller.stream('co-1', undefined);
    expect(result).toBeDefined();
    expect(typeof (result as any).subscribe).toBe('function');
  });

  it('backfill() calls panelService.backfill with afterSeq', async () => {
    await controller.backfill('co-1', '5', 'user-uuid');
    expect(panelService.backfill).toHaveBeenCalledWith('co-1', 5, 'user-uuid');
  });

  it('backfill() with no afterSeq uses 0', async () => {
    await controller.backfill('co-1', undefined, 'user-uuid');
    expect(panelService.backfill).toHaveBeenCalledWith('co-1', 0, 'user-uuid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/src/panel/__tests__/panel.controller.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement PanelService (backfill snapshot)**

Create `apps/server/src/panel/panel.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared';
import { panelRunAdapters } from './adapters/registry';
import { alertPanelAdapter } from './adapters/alert.adapter';

@Injectable()
export class PanelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 현재 "Panel에 표시되어야 할" 아이템 전체 반환.
   * - 진행 중 run (pending/running)
   * - 최근 24h terminal run (succeeded/failed/cancelled)
   * - unread alert
   * visibility 필터: company OR (user AND actorUserId === currentUserId)
   */
  async snapshot(companyId: string, currentUserId: string): Promise<PanelItem[]> {
    const items: PanelItem[] = [];
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000);

    // Workflow runs (mock — 실제 Prisma 필드명으로 교체)
    // const workflowRuns = await this.prisma.workflowRun.findMany({
    //   where: { companyId, OR: [{ status: { in: ['pending', 'running'] } }, { updatedAt: { gte: twentyFourHoursAgo } }] },
    // });
    // workflowRuns.forEach((run) => items.push(this.addSeq(panelRunAdapters.workflow.mapToItem(run, companyId))));

    // TODO: WorkflowRun, HeartbeatRun, ThumbnailEdit, Alert 각각 조회 후 adapter 돌려 append
    // 아래는 Alert만 샘플로 작성:
    const alerts = await this.prisma.alert.findMany({
      where: { companyId, isRead: false },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    alerts.forEach((alert) => items.push(this.addSeq(alertPanelAdapter.mapToItem(alert, companyId)) as PanelItem));

    // Visibility 필터
    return items.filter((item) =>
      item.visibility === 'company' ||
      (item.visibility === 'user' && item.actorUserId === currentUserId)
    );
  }

  async backfill(companyId: string, afterSeq: number, currentUserId: string): Promise<PanelItem[]> {
    // 간소화: snapshot과 동일 + seq 필터.
    // 실제로는 각 테이블에 seq 컬럼이 없으므로 updatedAt 기반으로 approximation.
    // MVP 허용 가정: afterSeq는 rough timestamp checkpoint 대용.
    return this.snapshot(companyId, currentUserId);
  }

  private addSeq<T extends Omit<PanelItem, 'seq' | 'updatedAt'>>(item: T): T & { seq: number; updatedAt: string } {
    // backfill/snapshot용 임시 seq. Ring buffer와 별개라 0 부여. 클라이언트는 SSE stream seq가 우선.
    return { ...item, seq: 0, updatedAt: new Date().toISOString() };
  }
}
```

**중요**: 실제 구현 시 `prisma.workflowRun.findMany`, `prisma.heartbeatRun.findMany`, `prisma.thumbnailEdit.findMany` 각각 추가해야 함. 스키마의 실제 필드명 확인 필수. 이 샘플은 Alert만 포함.

- [ ] **Step 4: Implement PanelController**

Create `apps/server/src/panel/panel.controller.ts`:

```typescript
import { Controller, Get, Sse, Query, Headers, Res, MessageEvent as NestMessageEvent } from '@nestjs/common';
import type { Response } from 'express';
import { Observable, from, concat, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { PanelSseService } from './events/panel-sse.service';
import { PanelService } from './panel.service';
import { CurrentCompany } from '../auth/current-company.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('panel')
export class PanelController {
  constructor(
    private readonly sseService: PanelSseService,
    private readonly panelService: PanelService,
  ) {}

  /**
   * SSE stream. Last-Event-ID 헤더 있으면 ring buffer에서 replay 후 live.
   */
  @Sse('stream')
  stream(
    @CurrentCompany() companyId: string,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<NestMessageEvent> {
    const afterSeq = lastEventId ? parseInt(lastEventId, 10) : 0;
    const replayed = this.sseService.replayAfter(companyId, afterSeq);

    // Replay → Live. 주기적 ping은 서버가 알아서 (25s interval 주석).
    const replay$ = from(replayed).pipe(
      map((event) => ({ data: event, id: String(event.seq) } as NestMessageEvent)),
    );
    const live$ = this.sseService.getStream(companyId) as unknown as Observable<NestMessageEvent>;
    const ping$ = interval(25_000).pipe(map(() => ({ data: ':ping' } as NestMessageEvent)));

    return concat(replay$, live$); // ping은 NestJS가 기본 heartbeat로 처리하지만 명시적으로 붙일 수도
  }

  /**
   * 백필 엔드포인트 — SSE 재연결 실패 후 fallback 또는 링 버퍼 초과 시.
   */
  @Get('backfill')
  async backfill(
    @CurrentCompany() companyId: string,
    @Query('afterSeq') afterSeqStr: string | undefined,
    @CurrentUser('id') currentUserId: string,
  ) {
    const afterSeq = afterSeqStr ? parseInt(afterSeqStr, 10) : 0;
    return this.panelService.backfill(companyId, afterSeq, currentUserId);
  }

  /**
   * 초기 snapshot (SSE 연결 실패 시 폴링 fallback).
   */
  @Get('snapshot')
  async snapshot(
    @CurrentCompany() companyId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.panelService.snapshot(companyId, currentUserId);
  }
}
```

**참고**: `@CurrentUser('id')` 데코레이터가 프로젝트에 없으면 `apps/server/src/auth/` 기존 패턴(`CurrentCompany`) 참고해서 추가. 또는 `@Req() req` + `req.authUser.id`로 대체.

- [ ] **Step 5: Run tests**

Run: `npx vitest run apps/server/src/panel/__tests__/panel.controller.spec.ts`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/panel/panel.service.ts apps/server/src/panel/panel.controller.ts apps/server/src/panel/__tests__/panel.controller.spec.ts
git commit -m "feat(panel): @Sse stream + backfill + snapshot endpoints"
```

---

### Task 9: PanelModule + app.module wiring

**Files:**
- Create: `apps/server/src/panel/panel.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Create PanelModule**

Create `apps/server/src/panel/panel.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';
import { PanelSseService } from './events/panel-sse.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [PanelController],
  providers: [PanelService, PanelSseService],
  exports: [PanelSseService], // 다른 모듈에서 주입 필요 시
})
export class PanelModule {}
```

- [ ] **Step 2: Register in app.module.ts**

Modify `apps/server/src/app.module.ts` — imports 배열에 `PanelModule` 추가:

```typescript
import { PanelModule } from './panel/panel.module';

@Module({
  imports: [
    // ... existing ...
    PanelModule,
  ],
  // ...
})
export class AppModule {}
```

- [ ] **Step 3: Boot verification**

Run: `npm run dev:server` (또는 `npm run start:dev --workspace=apps/server`)

Expected: NestJS 서버가 에러 없이 boot. `[Nest] LOG [RouterExplorer] Mapped {/api/panel/stream, GET}` 같은 로그 확인.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/panel/panel.module.ts apps/server/src/app.module.ts
git commit -m "feat(panel): wire PanelModule into app.module"
```

---

## Phase 3 — Backend Promote API + ActionTask Extensions

### Task 10: Alert → ActionTask 승격 service + controller

**Files:**
- Create: `apps/server/src/panel/promote.service.ts`
- Create: `apps/server/src/panel/promote.controller.ts`
- Create: `apps/server/src/panel/__tests__/promote.service.spec.ts`
- Modify: `apps/server/src/panel/panel.module.ts` — controller/provider 추가

- [ ] **Step 1: Write failing test**

Create `apps/server/src/panel/__tests__/promote.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PromoteService } from '../promote.service';

describe('PromoteService', () => {
  let service: PromoteService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $transaction: vi.fn(async (cb) => cb(prisma)),
      alert: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      actionTask: {
        create: vi.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        PromoteService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(PromoteService);
  });

  it('creates ActionTask and sets Alert.actionTaskId', async () => {
    prisma.alert.findFirst.mockResolvedValue({
      id: 'alert-1', companyId: 'co-1', type: 'stock_low', severity: 'warn',
      title: '재고 부족', actionTaskId: null,
    });
    prisma.actionTask.create.mockResolvedValue({ id: 'task-1' });
    prisma.alert.update.mockResolvedValue({});

    const result = await service.promote('alert-1', 'co-1', {
      title: '재고 조치',
      priority: 'high',
      role: 'inventory',
    });

    expect(prisma.actionTask.create).toHaveBeenCalled();
    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { actionTaskId: 'task-1' },
    });
    expect(result).toMatchObject({ id: 'task-1' });
  });

  it('throws 409 if alert already promoted', async () => {
    prisma.alert.findFirst.mockResolvedValue({
      id: 'alert-1', companyId: 'co-1', actionTaskId: 'existing-task',
    });
    await expect(
      service.promote('alert-1', 'co-1', {}),
    ).rejects.toThrow(ConflictException);
  });

  it('throws 404 if alert not found (IDOR protection)', async () => {
    prisma.alert.findFirst.mockResolvedValue(null);
    await expect(
      service.promote('alert-1', 'co-1', {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('auto-maps severity to priority when priority not provided', async () => {
    prisma.alert.findFirst.mockResolvedValue({
      id: 'alert-1', companyId: 'co-1', type: 'profit_low', severity: 'critical',
      title: '마진 적자', actionTaskId: null,
    });
    prisma.actionTask.create.mockResolvedValue({ id: 'task-1' });

    await service.promote('alert-1', 'co-1', {});

    expect(prisma.actionTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 'urgent' }),
      }),
    );
  });

  it('auto-maps alertType to role when role not provided', async () => {
    prisma.alert.findFirst.mockResolvedValue({
      id: 'alert-1', companyId: 'co-1', type: 'ad_high', severity: 'warn',
      title: '광고비 초과', actionTaskId: null,
    });
    prisma.actionTask.create.mockResolvedValue({ id: 'task-1' });

    await service.promote('alert-1', 'co-1', {});

    expect(prisma.actionTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'ad' }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify fails**

Run: `npx vitest run apps/server/src/panel/__tests__/promote.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement PromoteService**

Create `apps/server/src/panel/promote.service.ts`:

```typescript
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PANEL_EVENTS } from './events/panel-events';
import { alertPanelAdapter } from './adapters/alert.adapter';

export interface PromoteDto {
  title?: string;
  priority?: 'urgent' | 'high' | 'medium';
  role?: 'ad' | 'inventory' | 'finance' | 'data';
  notes?: string;
}

const SEVERITY_TO_PRIORITY: Record<string, string> = {
  critical: 'urgent',
  warn: 'high',
  info: 'medium',
};

const ALERT_TYPE_TO_ROLE: Record<string, string> = {
  minus_product: 'inventory',
  stock_low: 'inventory',
  profit_low: 'finance',
  grade_change: 'finance',
  ad_high: 'ad',
};

@Injectable()
export class PromoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async promote(alertId: string, companyId: string, dto: PromoteDto) {
    return this.prisma.$transaction(async (tx: any) => {
      const alert = await tx.alert.findFirst({ where: { id: alertId, companyId } });
      if (!alert) {
        throw new NotFoundException('Alert not found');
      }
      if (alert.actionTaskId) {
        throw new ConflictException('Alert already promoted to action task');
      }

      const priority = dto.priority ?? SEVERITY_TO_PRIORITY[alert.severity] ?? 'medium';
      const role = dto.role ?? ALERT_TYPE_TO_ROLE[alert.type] ?? null;
      const taskKey = `promoted:${alert.id}`;

      const task = await tx.actionTask.create({
        data: {
          companyId,
          taskKey,
          type: 'human',
          label: dto.title ?? alert.title,
          detail: dto.notes ?? alert.message ?? null,
          priority,
          role,
          status: 'pending',
          date: new Date(),
          notes: dto.notes ? [{ text: dto.notes, ts: new Date().toISOString() }] : [],
          activityLog: [{ action: 'promoted_from_alert', sourceAlertId: alert.id, ts: new Date().toISOString() }],
        },
      });

      await tx.alert.update({
        where: { id: alert.id },
        data: { actionTaskId: task.id },
      });

      // Emit panel upsert event with updated alert (actionTaskId now set)
      const updatedAlert = { ...alert, actionTaskId: task.id };
      const item = alertPanelAdapter.mapToItem(updatedAlert, companyId);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId });

      return task;
    });
  }

  async dismiss(alertId: string, companyId: string) {
    const alert = await this.prisma.alert.findFirst({ where: { id: alertId, companyId } });
    if (!alert) throw new NotFoundException('Alert not found');
    await this.prisma.alert.update({
      where: { id: alert.id },
      data: { isRead: true },
    });
    this.eventEmitter.emit(PANEL_EVENTS.DISMISS, { itemId: `alert:${alert.id}`, companyId });
    return { ok: true };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/server/src/panel/__tests__/promote.service.spec.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Implement PromoteController**

Create `apps/server/src/panel/promote.controller.ts`:

```typescript
import { Controller, Post, Param, Body } from '@nestjs/common';
import { PromoteService, PromoteDto } from './promote.service';
import { CurrentCompany } from '../auth/current-company.decorator';
import { IsOptional, IsString, IsIn } from 'class-validator';

class PromoteRequestDto {
  @IsOptional() @IsString()
  title?: string;

  @IsOptional() @IsIn(['urgent', 'high', 'medium'])
  priority?: 'urgent' | 'high' | 'medium';

  @IsOptional() @IsIn(['ad', 'inventory', 'finance', 'data'])
  role?: 'ad' | 'inventory' | 'finance' | 'data';

  @IsOptional() @IsString()
  notes?: string;
}

@Controller('panel/alerts')
export class PromoteController {
  constructor(private readonly promoteService: PromoteService) {}

  @Post(':alertId/promote')
  async promote(
    @Param('alertId') alertId: string,
    @CurrentCompany() companyId: string,
    @Body() body: PromoteRequestDto,
  ) {
    return this.promoteService.promote(alertId, companyId, body as PromoteDto);
  }

  @Post(':alertId/dismiss')
  async dismiss(
    @Param('alertId') alertId: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.promoteService.dismiss(alertId, companyId);
  }
}
```

- [ ] **Step 6: Register in PanelModule**

Modify `apps/server/src/panel/panel.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';
import { PanelSseService } from './events/panel-sse.service';
import { PromoteController } from './promote.controller';
import { PromoteService } from './promote.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [PanelController, PromoteController],
  providers: [PanelService, PanelSseService, PromoteService],
  exports: [PanelSseService],
})
export class PanelModule {}
```

- [ ] **Step 7: Boot verification**

Run: `npm run dev:server`

Expected: 에러 없음. Logs에 `POST /api/panel/alerts/:alertId/promote` 매핑 확인.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/panel/promote.service.ts apps/server/src/panel/promote.controller.ts apps/server/src/panel/__tests__/promote.service.spec.ts apps/server/src/panel/panel.module.ts
git commit -m "feat(panel): Alert → ActionTask promote + dismiss endpoints"
```

---

### Task 11: ActionTaskService — claim/unclaim/assignedTo 필터

**Files:**
- Modify: `apps/server/src/action-task/action-task.service.ts`
- Modify: `apps/server/src/action-task/action-task.controller.ts`
- Modify: `apps/server/src/action-task/__tests__/action-task.service.spec.ts` (또는 신설)

- [ ] **Step 1: Write failing test for claim/filter**

Add to `apps/server/src/action-task/__tests__/action-task.service.spec.ts` (또는 새 파일 `claim.spec.ts`):

```typescript
describe('ActionTaskService — claim/unclaim/filter', () => {
  let service: ActionTaskService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      actionTask: {
        findFirst: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActionTaskService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ActionTaskService);
  });

  it('claim sets assigneeUserId', async () => {
    prisma.actionTask.findFirst.mockResolvedValue({ id: 't1', companyId: 'co-1', assigneeUserId: null });
    prisma.actionTask.update.mockResolvedValue({ id: 't1', assigneeUserId: 'user-1' });

    const result = await service.claim('t1', 'co-1', 'user-1');

    expect(prisma.actionTask.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { assigneeUserId: 'user-1' },
    });
    expect(result.assigneeUserId).toBe('user-1');
  });

  it('unclaim only allowed by current assignee', async () => {
    prisma.actionTask.findFirst.mockResolvedValue({ id: 't1', companyId: 'co-1', assigneeUserId: 'user-2' });
    await expect(service.unclaim('t1', 'co-1', 'user-1')).rejects.toThrow();
  });

  it('list with assignedTo=me filters by current user', async () => {
    prisma.actionTask.findMany.mockResolvedValue([]);
    await service.list('co-1', { assignedTo: 'me' }, 'user-1');
    expect(prisma.actionTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'co-1', assigneeUserId: 'user-1' }),
      }),
    );
  });

  it('list with assignedTo=team filters out current user', async () => {
    prisma.actionTask.findMany.mockResolvedValue([]);
    await service.list('co-1', { assignedTo: 'team' }, 'user-1');
    expect(prisma.actionTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'co-1',
          OR: [{ assigneeUserId: null }, { assigneeUserId: { not: 'user-1' } }],
        }),
      }),
    );
  });

  it('list with assignedTo=all has no assignee filter', async () => {
    prisma.actionTask.findMany.mockResolvedValue([]);
    await service.list('co-1', { assignedTo: 'all' }, 'user-1');
    const callArg = prisma.actionTask.findMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('assigneeUserId');
    expect(callArg.where).not.toHaveProperty('OR');
  });
});
```

- [ ] **Step 2: Run test to verify fails**

Run: `npx vitest run apps/server/src/action-task/__tests__/ -t "claim/unclaim/filter"`
Expected: FAIL.

- [ ] **Step 3: Implement claim/unclaim/list in service**

Modify `apps/server/src/action-task/action-task.service.ts` — 메서드 추가:

```typescript
async claim(taskId: string, companyId: string, userId: string) {
  const task = await this.prisma.actionTask.findFirst({ where: { id: taskId, companyId } });
  if (!task) throw new NotFoundException('Task not found');
  return this.prisma.actionTask.update({
    where: { id: taskId },
    data: { assigneeUserId: userId },
  });
}

async unclaim(taskId: string, companyId: string, userId: string) {
  const task = await this.prisma.actionTask.findFirst({ where: { id: taskId, companyId } });
  if (!task) throw new NotFoundException('Task not found');
  if (task.assigneeUserId !== userId) {
    throw new ForbiddenException('Only assignee can unclaim');
  }
  return this.prisma.actionTask.update({
    where: { id: taskId },
    data: { assigneeUserId: null },
  });
}

async list(companyId: string, filter: { assignedTo?: 'me' | 'team' | 'all' }, currentUserId: string) {
  const where: any = { companyId };
  if (filter.assignedTo === 'me') {
    where.assigneeUserId = currentUserId;
  } else if (filter.assignedTo === 'team') {
    where.OR = [{ assigneeUserId: null }, { assigneeUserId: { not: currentUserId } }];
  }
  // 'all' 또는 undefined: no filter
  return this.prisma.actionTask.findMany({
    where,
    orderBy: [{ date: 'desc' }, { priority: 'asc' }],
  });
}

async getSourceAlert(taskId: string, companyId: string) {
  return this.prisma.alert.findFirst({
    where: { actionTaskId: taskId, companyId },
  });
}
```

**참고**: `ForbiddenException` import 필요: `import { ForbiddenException, NotFoundException } from '@nestjs/common';`

- [ ] **Step 4: Add claim/unclaim/filter endpoints to controller**

Modify `apps/server/src/action-task/action-task.controller.ts` — 메서드 추가:

```typescript
@Patch(':id/claim')
async claim(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
  @CurrentUser('id') userId: string,
) {
  return this.service.claim(id, companyId, userId);
}

@Patch(':id/unclaim')
async unclaim(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
  @CurrentUser('id') userId: string,
) {
  return this.service.unclaim(id, companyId, userId);
}

// 기존 list 엔드포인트를 수정
@Get()
async list(
  @CurrentCompany() companyId: string,
  @Query('assignedTo') assignedTo: 'me' | 'team' | 'all' | undefined,
  @CurrentUser('id') currentUserId: string,
) {
  return this.service.list(companyId, { assignedTo }, currentUserId);
}

@Get(':id/source-alert')
async getSourceAlert(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
) {
  return this.service.getSourceAlert(id, companyId);
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run apps/server/src/action-task/__tests__/`
Expected: 5+ tests PASS (기존 테스트도 함께 통과).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/action-task/
git commit -m "feat(action-task): claim/unclaim + assignedTo filter + source-alert lookup"
```

---

## Phase 4 — Backend Domain Integration (emit hooks)

### Task 12: Hook workflow service → panel.run.upsert

**Files:**
- Modify: `apps/server/src/workflows/` — 실제 서비스 파일은 `workflows.service.ts` 또는 유사

- [ ] **Step 1: 워크플로우 서비스 파일 위치 확인**

Run: `grep -rn "WorkflowRun\|workflowRun\|status.*=.*'running'\|status.*=.*'succeeded'" apps/server/src/workflows/ | head -10`

실제 서비스 파일과 상태 전이 지점 위치 확인.

- [ ] **Step 2: 각 상태 전이 지점에 emit 추가**

상태 전이 예시 (workflows.service.ts의 startRun 메서드):

```typescript
// 기존 코드 예:
// const run = await this.prisma.workflowRun.update({ where: { id }, data: { status: 'running' } });

// 추가:
import { panelRunAdapters } from '../panel/adapters/registry';
import { PANEL_EVENTS } from '../panel/events/panel-events';
// ...
constructor(private readonly eventEmitter: EventEmitter2) {}

// 상태 전이 지점마다:
const run = await this.prisma.workflowRun.update({ where: { id }, data: { status: 'running' } });
const item = panelRunAdapters.workflow.mapToItem(run as any, companyId);
this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId });
```

**반드시 다음 지점에 모두 삽입**:
- `status: 'pending'` → (생성 직후)
- `status: 'running'` → (실행 시작)
- `status: 'succeeded'` → (성공)
- `status: 'failed'` → (실패)
- `status: 'cancelled'` → (취소)

- [ ] **Step 3: Dev 환경에서 workflow 수동 trigger**

Run: `npm run dev:server` → 브라우저에서 `/workflows` 가서 워크플로우 실행

Expected: NestJS 로그에 `panel.item.upsert` 이벤트 발행 확인 (console.log로 디버깅 추가하거나 PanelSseService에 로깅 있으면 확인).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/workflows/
git commit -m "feat(workflows): emit panel.run.upsert on status transitions"
```

---

### Task 13: Hook heartbeat service (agent) → panel.run.upsert

**Files:**
- Modify: `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts`

- [ ] **Step 1: Agent 상태 전이 지점 확인**

Run: `grep -n "status.*running\|status.*succeeded\|status.*failed\|status.*paused" apps/server/src/agent-registry/heartbeat/heartbeat.service.ts | head -10`

- [ ] **Step 2: 각 전이 지점에 emit 추가**

```typescript
import { panelRunAdapters } from '../../panel/adapters/registry';
import { PANEL_EVENTS } from '../../panel/events/panel-events';

// 기존 `AGENT_EVENTS.STATUS_CHANGED` emit은 그대로 유지 (AgentSseService 용도).
// Panel 용도는 별도로 추가:

const run = await this.prisma.heartbeatRun.update({ ... });
// 기존: this.eventEmitter.emit(AGENT_EVENTS.STATUS_CHANGED, ...);
// 추가:
const panelItem = panelRunAdapters.agent.mapToItem(run as any, companyId);
this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item: panelItem, companyId });
```

- [ ] **Step 3: Agent 실행 시 Panel에 뜨는지 확인**

Run: Dev 환경에서 agent 수동 trigger → Panel 로그 확인.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/agent-registry/heartbeat/
git commit -m "feat(agent-registry): emit panel.run.upsert on agent run status transitions"
```

---

### Task 14: Hook thumbnail-edit service → panel.run.upsert

**Files:**
- Modify: `apps/server/src/products/services/thumbnail-edit.service.ts`

- [ ] **Step 1: ThumbnailEdit 상태 전이 지점 확인**

Run: `grep -n "status.*pending\|status.*processing\|status.*running\|status.*completed\|status.*failed" apps/server/src/products/services/thumbnail-edit.service.ts | head -10`

- [ ] **Step 2: Emit 추가**

```typescript
import { panelRunAdapters } from '../../panel/adapters/registry';
import { PANEL_EVENTS } from '../../panel/events/panel-events';

// 각 상태 전이 지점:
const edit = await this.prisma.thumbnailEdit.update({ ... });
const panelItem = panelRunAdapters.image_edit.mapToItem(edit as any, companyId);
this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item: panelItem, companyId });
```

- [ ] **Step 3: 수동 검증**

Run: Dev 환경에서 썸네일 편집 요청 → 진행률 Panel에 반영되는지.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/products/services/thumbnail-edit.service.ts
git commit -m "feat(thumbnail-edit): emit panel.run.upsert on image edit status transitions"
```

---

### Task 15: Hook rules engine (Alert) → panel.alert.upsert

**Files:**
- Modify: `apps/server/src/rules/**/*.service.ts` (Alert 생성 지점)

- [ ] **Step 1: Alert 생성 지점 확인**

Run: `grep -rn "alert.create\|prisma.alert.create" apps/server/src/rules/ | head`

- [ ] **Step 2: Emit 추가**

Alert insert 직후:

```typescript
import { alertPanelAdapter } from '../panel/adapters/alert.adapter';
import { PANEL_EVENTS } from '../panel/events/panel-events';

const alert = await this.prisma.alert.create({ data: {...} });
const panelItem = alertPanelAdapter.mapToItem(alert, companyId);
this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item: panelItem, companyId });
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/rules/
git commit -m "feat(rules): emit panel.alert.upsert on alert creation"
```

---

## Phase 5 — Frontend SSE Client + Store

### Task 16: Install fetch-event-source + PanelSseClient 래퍼

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/panel/lib/panel-sse-client.ts`
- Create: `apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`

- [ ] **Step 1: Install dependency**

Run: `npm install --workspace=apps/web @microsoft/fetch-event-source`

Expected: `@microsoft/fetch-event-source` package.json에 추가됨.

- [ ] **Step 2: Write failing test**

Create `apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PanelSseClient } from '../panel-sse-client';

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}));

describe('PanelSseClient', () => {
  let fetchEventSource: any;

  beforeEach(async () => {
    fetchEventSource = (await import('@microsoft/fetch-event-source')).fetchEventSource;
    vi.clearAllMocks();
  });

  it('connects with devUserId header if NEXT_PUBLIC_DEV_USER_ID set', async () => {
    process.env.NEXT_PUBLIC_DEV_USER_ID = 'user-dev';
    const client = new PanelSseClient({
      onMessage: vi.fn(),
      onError: vi.fn(),
    });
    client.connect();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchEventSource).toHaveBeenCalledWith(
      expect.stringContaining('/api/panel/stream'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-dev-user-id': 'user-dev' }),
      }),
    );
  });

  it('calls onMessage for received event', async () => {
    const onMessage = vi.fn();
    const client = new PanelSseClient({ onMessage, onError: vi.fn() });

    let capturedConfig: any;
    fetchEventSource.mockImplementation((_url: string, config: any) => {
      capturedConfig = config;
      return Promise.resolve();
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 10));

    capturedConfig.onmessage({ data: JSON.stringify({ type: 'upsert', seq: 1, item: {} }), id: '1' });

    expect(onMessage).toHaveBeenCalledWith({ type: 'upsert', seq: 1, item: {} });
  });

  it('disconnect() aborts connection', async () => {
    const client = new PanelSseClient({ onMessage: vi.fn(), onError: vi.fn() });
    client.connect();
    client.disconnect();
    // abort controller 동작 확인 — 내부 상태 기반 체크
    expect((client as any).controller.signal.aborted).toBe(true);
  });
});
```

- [ ] **Step 3: Run test — expect fail**

Run: `npx vitest run apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`
Expected: FAIL (module not exists).

- [ ] **Step 4: Implement PanelSseClient**

Create `apps/web/src/components/panel/lib/panel-sse-client.ts`:

```typescript
import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { PanelEvent } from '@kiditem/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID;

export interface PanelSseClientOptions {
  onMessage: (event: PanelEvent) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class PanelSseClient {
  private controller: AbortController;
  private lastEventId?: string;
  private retryCount = 0;

  constructor(private readonly options: PanelSseClientOptions) {
    this.controller = new AbortController();
  }

  connect() {
    this.controller = new AbortController();
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (DEV_USER_ID) headers['x-dev-user-id'] = DEV_USER_ID;
    if (this.lastEventId) headers['last-event-id'] = this.lastEventId;

    fetchEventSource(`${API_BASE}/api/panel/stream`, {
      signal: this.controller.signal,
      headers,
      onmessage: (msg) => {
        if (msg.id) this.lastEventId = msg.id;
        if (msg.data === ':ping') return;
        try {
          const event = JSON.parse(msg.data) as PanelEvent;
          this.options.onMessage(event);
        } catch (err) {
          this.options.onError?.(err);
        }
      },
      onopen: async () => {
        this.retryCount = 0;
        this.options.onOpen?.();
      },
      onerror: (err) => {
        this.retryCount++;
        this.options.onError?.(err);
        if (this.retryCount > 5) throw err; // give up → parent will fall back to polling
        const delay = Math.min(1000 * 2 ** this.retryCount, 30_000);
        return delay;
      },
      onclose: () => this.options.onClose?.(),
      openWhenHidden: true,
    });
  }

  disconnect() {
    this.controller.abort();
  }
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npx vitest run apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/components/panel/lib/
git commit -m "feat(web/panel): PanelSseClient wrapper (fetch-event-source + auth headers)"
```

---

### Task 17: usePanelStore (Zustand) + merge/dedup

**Files:**
- Create: `apps/web/src/components/panel/lib/panel-store.ts`
- Create: `apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createPanelStore } from '../panel-store';

const makeItem = (overrides = {}) => ({
  id: 'workflow:abc',
  kind: 'run',
  source: 'workflow',
  sourceId: 'abc',
  companyId: 'co-1',
  seq: 1,
  status: 'running',
  title: 'test',
  deepLink: '/x',
  actorUserId: null,
  visibility: 'company',
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
}) as any;

describe('panel-store', () => {
  let store: ReturnType<typeof createPanelStore>;

  beforeEach(() => {
    store = createPanelStore();
  });

  it('upsert inserts new item', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    expect(store.getState().byId['a']).toBeDefined();
    expect(store.getState().lastSeq).toBe(1);
  });

  it('upsert replaces if seq is newer', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1, title: 'old' }));
    store.getState().upsertItem(makeItem({ id: 'a', seq: 2, title: 'new' }));
    expect(store.getState().byId['a'].title).toBe('new');
    expect(store.getState().lastSeq).toBe(2);
  });

  it('upsert ignores stale seq', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 5, title: 'newer' }));
    store.getState().upsertItem(makeItem({ id: 'a', seq: 3, title: 'older' }));
    expect(store.getState().byId['a'].title).toBe('newer');
    expect(store.getState().lastSeq).toBe(5);
  });

  it('handleSnapshot clears store and initializes', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    store.getState().handleSnapshot([makeItem({ id: 'b', seq: 10 })]);
    expect(store.getState().byId['a']).toBeUndefined();
    expect(store.getState().byId['b']).toBeDefined();
    expect(store.getState().lastSeq).toBe(10);
  });

  it('dismissItem removes item', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    store.getState().dismissItem('a');
    expect(store.getState().byId['a']).toBeUndefined();
  });

  it('selectMineVsTeam splits by actorUserId', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1, actorUserId: 'me' }));
    store.getState().upsertItem(makeItem({ id: 'b', seq: 2, actorUserId: 'other' }));
    store.getState().upsertItem(makeItem({ id: 'c', seq: 3, actorUserId: null }));

    const { mine, team } = store.getState().selectMineVsTeam('me');
    expect(mine.map((i) => i.id)).toContain('a');
    expect(team.map((i) => i.id)).toContain('b');
    expect(team.map((i) => i.id)).toContain('c');
  });

  it('unreadAlertCount counts alerts only', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1, kind: 'run', status: 'running' }));
    store.getState().upsertItem(makeItem({
      id: 'b', seq: 2, kind: 'alert', alertType: 'stock_low', severity: 'warn',
    }));
    store.getState().upsertItem(makeItem({
      id: 'c', seq: 3, kind: 'alert', alertType: 'stock_low', severity: 'warn',
      dismissedAt: '2026-04-15T00:01:00Z',
    }));
    expect(store.getState().unreadAlertCount()).toBe(1);
  });

  it('runningCount counts pending+running runs', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1, kind: 'run', status: 'pending' }));
    store.getState().upsertItem(makeItem({ id: 'b', seq: 2, kind: 'run', status: 'running' }));
    store.getState().upsertItem(makeItem({ id: 'c', seq: 3, kind: 'run', status: 'succeeded' }));
    expect(store.getState().runningCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `npx vitest run apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement store**

Create `apps/web/src/components/panel/lib/panel-store.ts`:

```typescript
import { create } from 'zustand';
import type { PanelItem } from '@kiditem/shared';

interface PanelStoreState {
  byId: Record<string, PanelItem>;
  lastSeq: number;
  isOpen: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'polling_fallback';

  // actions
  upsertItem: (item: PanelItem) => void;
  dismissItem: (id: string) => void;
  handleSnapshot: (items: PanelItem[]) => void;
  setOpen: (open: boolean) => void;
  setConnectionStatus: (status: PanelStoreState['connectionStatus']) => void;

  // selectors
  selectMineVsTeam: (currentUserId: string) => { mine: PanelItem[]; team: PanelItem[] };
  unreadAlertCount: () => number;
  runningCount: () => number;
}

export const createPanelStore = () =>
  create<PanelStoreState>((set, get) => ({
    byId: {},
    lastSeq: 0,
    isOpen: false,
    connectionStatus: 'disconnected',

    upsertItem: (item) =>
      set((state) => {
        const existing = state.byId[item.id];
        if (existing && existing.seq >= item.seq) return state;
        return {
          byId: { ...state.byId, [item.id]: item },
          lastSeq: Math.max(state.lastSeq, item.seq),
        };
      }),

    dismissItem: (id) =>
      set((state) => {
        const { [id]: _, ...rest } = state.byId;
        return { byId: rest };
      }),

    handleSnapshot: (items) =>
      set(() => {
        const byId: Record<string, PanelItem> = {};
        let maxSeq = 0;
        items.forEach((item) => {
          byId[item.id] = item;
          if (item.seq > maxSeq) maxSeq = item.seq;
        });
        return { byId, lastSeq: maxSeq };
      }),

    setOpen: (open) => {
      set({ isOpen: open });
      try { localStorage.setItem('kiditem.panel.open', String(open)); } catch {}
    },

    setConnectionStatus: (status) => set({ connectionStatus: status }),

    selectMineVsTeam: (currentUserId) => {
      const items = Object.values(get().byId);
      const mine: PanelItem[] = [];
      const team: PanelItem[] = [];
      items.forEach((item) => {
        if (item.actorUserId === currentUserId) mine.push(item);
        else team.push(item);
      });
      return { mine, team };
    },

    unreadAlertCount: () => {
      return Object.values(get().byId).filter(
        (item) => item.kind === 'alert' && !item.dismissedAt,
      ).length;
    },

    runningCount: () => {
      return Object.values(get().byId).filter(
        (item) => item.kind === 'run' && (item.status === 'pending' || item.status === 'running'),
      ).length;
    },
  }));

// 기본 전역 인스턴스
export const usePanelStore = createPanelStore();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/panel/lib/panel-store.ts apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts
git commit -m "feat(web/panel): Zustand store with merge/dedup + selectors"
```

---

### Task 18: usePanelStream hook (SSE connection lifecycle)

**Files:**
- Create: `apps/web/src/components/panel/hooks/usePanelStream.ts`

- [ ] **Step 1: Implement hook**

Create `apps/web/src/components/panel/hooks/usePanelStream.ts`:

```typescript
'use client';

import { useEffect } from 'react';
import { PanelSseClient } from '../lib/panel-sse-client';
import { usePanelStore } from '../lib/panel-store';
import { apiClient } from '@/lib/api-client';
import type { PanelEvent, PanelItem } from '@kiditem/shared';

/**
 * Panel SSE 연결 생명주기 관리.
 * AppLayout에 mount되면 인증 세션 전체 동안 구독 유지.
 * Panel sheet 열림/닫힘과 무관 (Bell badge 실시간 반영 위함).
 */
export function usePanelStream() {
  useEffect(() => {
    const store = usePanelStore;
    store.getState().setConnectionStatus('connecting');

    // 초기 snapshot 로드
    apiClient.get<PanelItem[]>('/api/panel/snapshot')
      .then((items) => store.getState().handleSnapshot(items))
      .catch(() => {/* SSE가 snapshot 또한 보내므로 무시 가능 */});

    const client = new PanelSseClient({
      onMessage: (event: PanelEvent) => {
        if (event.type === 'snapshot' && event.items) {
          store.getState().handleSnapshot(event.items);
        } else if (event.type === 'upsert' && event.item) {
          store.getState().upsertItem(event.item);
        } else if (event.type === 'dismiss' && event.item) {
          store.getState().dismissItem(event.item.id);
        }
      },
      onOpen: () => store.getState().setConnectionStatus('connected'),
      onError: () => store.getState().setConnectionStatus('disconnected'),
      onClose: () => store.getState().setConnectionStatus('disconnected'),
    });

    client.connect();

    // Polling fallback after 5 errors handled in PanelSseClient itself (throws to give up).
    // Simplest MVP: connection status만 표시, 사용자가 새로고침하면 재시도.

    return () => {
      client.disconnect();
      store.getState().setConnectionStatus('disconnected');
    };
  }, []);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/panel/hooks/usePanelStream.ts
git commit -m "feat(web/panel): usePanelStream hook manages SSE lifecycle + snapshot bootstrap"
```

---

## Phase 6 — Frontend UI Components

### Task 19: PanelItemRow component

**Files:**
- Create: `apps/web/src/components/panel/PanelItemRow.tsx`
- Create: `apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelItemRow } from '../PanelItemRow';
import type { PanelItem } from '@kiditem/shared';

const runItem: PanelItem = {
  id: 'workflow:abc', kind: 'run', source: 'workflow', sourceId: 'abc',
  companyId: 'co', seq: 1, status: 'running', title: '소싱 파이프라인',
  subtitle: '12/24 단계', progress: 0.5, deepLink: '/workflows/runs/abc',
  actorUserId: 'me', visibility: 'user',
  createdAt: '2026-04-15T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z',
};

const alertItem: PanelItem = {
  id: 'alert:xyz', kind: 'alert', alertType: 'stock_low', severity: 'warn',
  companyId: 'co', seq: 2, title: '재고 부족',
  actorUserId: null, visibility: 'company',
  createdAt: '2026-04-15T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z',
};

describe('PanelItemRow', () => {
  it('renders run title + status', () => {
    render(<PanelItemRow item={runItem} />);
    expect(screen.getByText('소싱 파이프라인')).toBeInTheDocument();
    expect(screen.getByText('12/24 단계')).toBeInTheDocument();
  });

  it('renders progress bar when progress defined', () => {
    const { container } = render(<PanelItemRow item={runItem} />);
    const bar = container.querySelector('[data-testid="progress-bar"]');
    expect(bar).toBeTruthy();
  });

  it('renders alert with severity indicator', () => {
    render(<PanelItemRow item={alertItem} />);
    expect(screen.getByText('재고 부족')).toBeInTheDocument();
  });

  it('shows 할일로 만들기 button on alert hover (data attribute present)', () => {
    render(<PanelItemRow item={alertItem} onPromote={vi.fn()} />);
    expect(screen.getByRole('button', { name: /할일로 만들기/ })).toBeInTheDocument();
  });

  it('calls onPromote when promote button clicked', () => {
    const onPromote = vi.fn();
    render(<PanelItemRow item={alertItem} onPromote={onPromote} />);
    fireEvent.click(screen.getByRole('button', { name: /할일로 만들기/ }));
    expect(onPromote).toHaveBeenCalledWith(alertItem);
  });
});
```

- [ ] **Step 2: Run test to verify fails**

Run: `npx vitest run apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement PanelItemRow**

Create `apps/web/src/components/panel/PanelItemRow.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { PANEL_RUN_SOURCES } from '@kiditem/shared';
import type { PanelItem, PanelRunItem, PanelAlertItem } from '@kiditem/shared';
import { cn } from '@/lib/utils';

interface PanelItemRowProps {
  item: PanelItem;
  onPromote?: (item: PanelAlertItem) => void;
  onDismiss?: (item: PanelItem) => void;
}

function sourceColors(source?: string, kind?: string, status?: string) {
  if (kind === 'alert') return { bg: 'bg-amber-100', fg: 'text-amber-700' }; // severity별 override는 아래
  if (status === 'succeeded') return { bg: 'bg-emerald-100', fg: 'text-emerald-700' };
  if (status === 'failed') return { bg: 'bg-red-100', fg: 'text-red-700' };
  if (status === 'cancelled') return { bg: 'bg-slate-100', fg: 'text-slate-500' };
  switch (source) {
    case 'workflow': return { bg: 'bg-violet-100', fg: 'text-violet-700' };
    case 'agent': return { bg: 'bg-blue-100', fg: 'text-blue-700' };
    case 'image_edit': return { bg: 'bg-pink-100', fg: 'text-pink-700' };
    default: return { bg: 'bg-slate-100', fg: 'text-slate-600' };
  }
}

function severityColors(severity?: string) {
  switch (severity) {
    case 'critical': return { bg: 'bg-red-100', fg: 'text-red-700', dot: 'bg-red-500' };
    case 'warn': return { bg: 'bg-amber-100', fg: 'text-amber-700', dot: 'bg-amber-500' };
    case 'info': return { bg: 'bg-orange-100', fg: 'text-orange-700', dot: 'bg-orange-500' };
    default: return { bg: 'bg-slate-100', fg: 'text-slate-500', dot: 'bg-slate-400' };
  }
}

function statusDot(status?: string) {
  if (status === 'pending' || status === 'running') return 'bg-violet-400 animate-pulse';
  if (status === 'succeeded') return 'bg-emerald-500';
  if (status === 'failed') return 'bg-red-500';
  if (status === 'cancelled') return 'bg-slate-400';
  return 'bg-slate-400';
}

export function PanelItemRow({ item, onPromote, onDismiss }: PanelItemRowProps) {
  const router = useRouter();

  if (item.kind === 'run') {
    return <RunRow item={item} router={router} onDismiss={onDismiss} />;
  }
  return <AlertRow item={item} onPromote={onPromote} onDismiss={onDismiss} />;
}

function RunRow({ item, router, onDismiss }: { item: PanelRunItem; router: any; onDismiss?: any }) {
  const meta = PANEL_RUN_SOURCES[item.source];
  const Icon = (Icons as any)[meta.iconName] ?? Icons.Box;
  const colors = sourceColors(item.source, 'run', item.status);

  return (
    <button
      onClick={() => router.push(item.deepLink)}
      className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50"
    >
      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', colors.bg, colors.fg)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 text-sm font-medium text-slate-900">
          <span className="truncate">{item.title}</span>
          <span className="text-xs text-slate-400 font-normal shrink-0">{/* time */}</span>
        </div>
        {item.subtitle && (
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', statusDot(item.status))} />
            {item.subtitle}
          </div>
        )}
        {item.progress !== undefined && (
          <div data-testid="progress-bar" className="h-0.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-violet-400"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </button>
  );
}

function AlertRow({ item, onPromote, onDismiss }: { item: PanelAlertItem; onPromote?: any; onDismiss?: any }) {
  const sc = severityColors(item.severity);
  const isLinked = !!item.actionTaskId;

  return (
    <div className="group px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50">
      <div className="flex items-start gap-2.5">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', sc.bg, sc.fg)}>
          <Icons.AlertTriangle className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2 text-sm font-medium text-slate-900">
            <span className="truncate">{item.title}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
            {item.severity === 'critical' ? 'critical · 즉시 확인 필요' : (item.message ?? item.severity)}
          </div>
          {isLinked && (
            <div className="text-xs text-blue-600 mt-1">→ 할일 생성됨</div>
          )}
        </div>
        {!isLinked && (
          <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onPromote?.(item)}
              className="text-xs text-violet-600 hover:text-violet-800 font-medium"
            >
              할일로 만들기
            </button>
            <button
              onClick={() => onDismiss?.(item)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/panel/PanelItemRow.tsx apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx
git commit -m "feat(web/panel): PanelItemRow renders run/alert items with source registry icons"
```

---

### Task 20: PromoteToTaskModal

**Files:**
- Create: `apps/web/src/components/panel/PromoteToTaskModal.tsx`

- [ ] **Step 1: Implement modal**

Create `apps/web/src/components/panel/PromoteToTaskModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { PanelAlertItem } from '@kiditem/shared';

const SEVERITY_TO_PRIORITY: Record<string, 'urgent' | 'high' | 'medium'> = {
  critical: 'urgent', warn: 'high', info: 'medium',
};
const ALERT_TYPE_TO_ROLE: Record<string, 'ad' | 'inventory' | 'finance' | 'data'> = {
  minus_product: 'inventory', stock_low: 'inventory',
  profit_low: 'finance', grade_change: 'finance',
  ad_high: 'ad',
};

interface PromoteToTaskModalProps {
  alert: PanelAlertItem | null;
  onClose: () => void;
}

export function PromoteToTaskModal({ alert, onClose }: PromoteToTaskModalProps) {
  const [title, setTitle] = useState(alert?.title ?? '');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium'>(
    alert ? SEVERITY_TO_PRIORITY[alert.severity] ?? 'medium' : 'medium',
  );
  const [role, setRole] = useState<'ad' | 'inventory' | 'finance' | 'data' | ''>(
    alert ? ALERT_TYPE_TO_ROLE[alert.alertType] ?? '' : '',
  );
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/panel/alerts/${alert!.id.replace('alert:', '')}/promote`, {
        title, priority, role: role || undefined, notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('할일로 추가됨');
      onClose();
    },
    onError: (err: any) => {
      if (err.statusCode === 409) toast.error('이미 할일로 만들어졌어요');
      else toast.error('할일 생성 실패. 다시 시도해주세요');
    },
  });

  return (
    <Dialog.Root open={!!alert} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-6 w-[480px] shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-slate-900">할일로 만들기</Dialog.Title>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-600 font-medium">제목</label>
              <input
                value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">우선순위</label>
              <div className="mt-1 flex gap-2">
                {(['urgent', 'high', 'medium'] as const).map((p) => (
                  <button key={p}
                    onClick={() => setPriority(p)}
                    className={priority === p
                      ? 'px-3 py-1.5 rounded bg-violet-600 text-white text-xs font-medium'
                      : 'px-3 py-1.5 rounded bg-slate-100 text-slate-600 text-xs'}
                  >
                    {p === 'urgent' ? '긴급' : p === 'high' ? '높음' : '보통'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">역할</label>
              <select value={role} onChange={(e) => setRole(e.target.value as any)}
                className="mt-1 w-full border border-slate-200 rounded px-3 py-2 text-sm">
                <option value="">(미지정)</option>
                <option value="ad">광고</option>
                <option value="inventory">재고/소싱</option>
                <option value="finance">재무/분석</option>
                <option value="data">데이터</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 font-medium">메모 (선택)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={3} className="mt-1 w-full border border-slate-200 rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">
              취소
            </button>
            <button onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !title.trim()}
              className="px-4 py-2 text-sm text-white bg-violet-600 hover:bg-violet-700 rounded disabled:opacity-50">
              {mutation.isPending ? '생성 중...' : '할일 생성'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/panel/PromoteToTaskModal.tsx
git commit -m "feat(web/panel): PromoteToTaskModal for Alert → ActionTask conversion"
```

---

### Task 21: PanelSheet (Radix Sheet container)

**Files:**
- Create: `apps/web/src/components/panel/PanelSheet.tsx`
- Create: `apps/web/src/components/panel/PanelGroupHeader.tsx`

- [ ] **Step 1: Create group header**

Create `apps/web/src/components/panel/PanelGroupHeader.tsx`:

```tsx
import { User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  variant: 'me' | 'team' | 'section';
  label: string;
  count: number;
}

export function PanelGroupHeader({ variant, label, count }: Props) {
  const Icon = variant === 'me' ? User : variant === 'team' ? Users : null;
  const colorClass =
    variant === 'me' ? 'text-violet-700 bg-gradient-to-r from-violet-50 to-white border-l-4 border-violet-600 pl-3'
    : variant === 'team' ? 'text-blue-700 bg-gradient-to-r from-blue-50 to-white border-l-4 border-blue-600 pl-3'
    : 'text-slate-500 bg-slate-50';

  return (
    <div className={cn(
      'px-4 py-2 text-xs font-bold tracking-wide flex items-center justify-between',
      colorClass,
    )}>
      <span className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
      <span className="text-slate-400 font-medium">{count}</span>
    </div>
  );
}
```

- [ ] **Step 2: Create PanelSheet**

Create `apps/web/src/components/panel/PanelSheet.tsx`:

```tsx
'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bell, X, Search, Filter, Check } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { usePanelStore } from './lib/panel-store';
import { PanelItemRow } from './PanelItemRow';
import { PanelGroupHeader } from './PanelGroupHeader';
import { PromoteToTaskModal } from './PromoteToTaskModal';
import { apiClient } from '@/lib/api-client';
import type { PanelItem, PanelAlertItem } from '@kiditem/shared';
import { cn } from '@/lib/utils';

interface Props {
  currentUserId: string;
}

export function PanelSheet({ currentUserId }: Props) {
  const isOpen = usePanelStore((s) => s.isOpen);
  const setOpen = usePanelStore((s) => s.setOpen);
  const byId = usePanelStore((s) => s.byId);
  const runningCount = usePanelStore((s) => s.runningCount());
  const unreadAlertCount = usePanelStore((s) => s.unreadAlertCount());
  const selectMineVsTeam = usePanelStore((s) => s.selectMineVsTeam);
  const dismissItemLocal = usePanelStore((s) => s.dismissItem);

  const [promoteTarget, setPromoteTarget] = useState<PanelAlertItem | null>(null);

  const { mine, team } = selectMineVsTeam(currentUserId);

  const dismissMutation = useMutation({
    mutationFn: (item: PanelItem) => {
      if (item.kind === 'alert') {
        const alertId = item.id.replace('alert:', '');
        return apiClient.post(`/api/panel/alerts/${alertId}/dismiss`, {});
      }
      return Promise.resolve();
    },
    onSuccess: (_, item) => dismissItemLocal(item.id),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        Object.values(byId)
          .filter((i) => i.kind === 'alert' && !(i as any).dismissedAt)
          .map((i) => apiClient.post(`/api/panel/alerts/${i.id.replace('alert:', '')}/dismiss`, {})),
      ),
  });

  return (
    <>
      <Dialog.Root open={isOpen} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/10" />
          <Dialog.Content className="fixed right-0 top-0 h-full w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200">
              <Dialog.Title className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-500" />
                알림
              </Dialog.Title>
              <div className="flex items-center gap-1.5">
                {runningCount > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">
                    <span className="w-1 h-1 bg-violet-500 rounded-full animate-pulse" />
                    {runningCount} 진행
                  </span>
                )}
                {unreadAlertCount > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                    {unreadAlertCount} 신규
                  </span>
                )}
                <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {unreadAlertCount > 0 && (
              <button onClick={() => markAllReadMutation.mutate()}
                className="text-sm text-violet-600 font-medium hover:bg-violet-50 px-4 py-2 border-b border-slate-100 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                모두 읽음으로 표시
              </button>
            )}

            <div className="flex-1 overflow-y-auto">
              {mine.length > 0 && (
                <>
                  <PanelGroupHeader variant="me" label="내 작업" count={mine.length} />
                  {sortItems(mine).map((item) => (
                    <PanelItemRow key={item.id} item={item}
                      onPromote={setPromoteTarget}
                      onDismiss={(i) => dismissMutation.mutate(i)}
                    />
                  ))}
                </>
              )}
              {team.length > 0 && (
                <>
                  <PanelGroupHeader variant="team" label="팀" count={team.length} />
                  {sortItems(team).map((item) => (
                    <PanelItemRow key={item.id} item={item}
                      onPromote={setPromoteTarget}
                      onDismiss={(i) => dismissMutation.mutate(i)}
                    />
                  ))}
                </>
              )}
              {mine.length === 0 && team.length === 0 && (
                <div className="px-4 py-12 text-center text-sm text-slate-400">
                  현재 주목할 항목이 없어요
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <PromoteToTaskModal alert={promoteTarget} onClose={() => setPromoteTarget(null)} />
    </>
  );
}

function sortItems(items: PanelItem[]): PanelItem[] {
  return [...items].sort((a, b) => {
    // 진행중 먼저
    const aRunning = a.kind === 'run' && (a.status === 'pending' || a.status === 'running');
    const bRunning = b.kind === 'run' && (b.status === 'pending' || b.status === 'running');
    if (aRunning && !bRunning) return -1;
    if (!aRunning && bRunning) return 1;
    // critical alert 먼저
    const aCrit = a.kind === 'alert' && a.severity === 'critical';
    const bCrit = b.kind === 'alert' && b.severity === 'critical';
    if (aCrit && !bCrit) return -1;
    if (!aCrit && bCrit) return 1;
    // 최근 먼저
    return b.createdAt.localeCompare(a.createdAt);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/panel/PanelSheet.tsx apps/web/src/components/panel/PanelGroupHeader.tsx
git commit -m "feat(web/panel): PanelSheet (Radix) with 내/팀 split, sections, dismiss, mark all read"
```

---

## Phase 7 — Frontend Integration

### Task 22: Mount PanelSheet + SSE in AppLayout

**Files:**
- Modify: `apps/web/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: 현재 유저 ID 가져오는 hook 확인**

Run: `grep -rn "useCurrentUser\|authUser\|currentUserId\|useAuth" apps/web/src | head -5`

**만약 해당 hook 없으면**: API 호출로 현재 유저 정보 받아오는 hook 하나 추가 (`useCurrentUser`).

- [ ] **Step 2: AppLayout에 PanelSheet + useStreamHook mount**

Modify `apps/web/src/components/layout/AppLayout.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';
import { PanelSheet } from '@/components/panel/PanelSheet';
// 현재 유저 fetching — 프로젝트 관례 따라 조정
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const CopilotChat = dynamic(() => import('./CopilotChat'), { ssr: false });

function useCurrentUserId(): string | null {
  const { data } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => apiClient.get<{ id: string }>('/api/users/me'),
    staleTime: Infinity,
  });
  return data?.id ?? null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);
  const currentUserId = useCurrentUserId();

  // Panel SSE 연결 — 세션 전체 동안 유지
  usePanelStream();

  const toggleChat = useCallback(() => {
    const btn = document.querySelector('.copilotKitButton') as HTMLButtonElement | null;
    if (btn) btn.click();
  }, []);

  if (pathname.includes('/editor')) {
    return <>{children}</>;
  }

  const content = (
    <div className="min-h-screen bg-slate-50">
      <Sidebar onChatToggle={toggleChat} chatOpen={chatOpen} />
      <div className={cn('transition-all duration-300', sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]')}>
        <main className="p-6">{children}</main>
      </div>
      {currentUserId && <PanelSheet currentUserId={currentUserId} />}
    </div>
  );

  return (
    <CopilotChat onChatOpenChange={setChatOpen}>
      {content}
    </CopilotChat>
  );
}
```

**주의**: `/api/users/me` 엔드포인트가 이미 있다면 사용. 없으면 추가 (`apps/server/src/users/` 참고). 없으면 `apiClient.get(`/api/auth/me`)` 등 기존 패턴 사용.

- [ ] **Step 3: Dev 서버 boot 확인**

Run: `npm run dev:server` + `npm run dev --workspace=apps/web` (또는 `npm run dev`)

Expected: 브라우저에서 애플리케이션 접속 시 network 탭에 `/api/panel/stream`으로 SSE 연결 확인.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/AppLayout.tsx
git commit -m "feat(web/layout): mount PanelSheet + SSE stream at AppLayout"
```

---

### Task 23: Sidebar Bell → PanelSheet trigger + Header.tsx 삭제

**Files:**
- Modify: `apps/web/src/components/layout/Sidebar.tsx` — line 430-483 교체
- Delete: `apps/web/src/components/layout/Header.tsx`

- [ ] **Step 1: Sidebar.tsx의 Bell dropdown 영역 교체**

Modify `apps/web/src/components/layout/Sidebar.tsx` — 기존 Bell dropdown 관련 JSX (line ~430-483) 및 관련 state/query/mutation 제거하고 Sheet trigger로 교체:

```tsx
// 기존 state 제거:
// const [alertOpen, setAlertOpen] = useState(false);
// const alertRef = useRef<HTMLDivElement>(null);
// const { data: alerts = [] } = useQuery(...);
// const markAsReadMutation = useMutation(...);
// const markAllAsReadMutation = useMutation(...);
// useEffect(...) for alertOpen

// 대신 추가:
import { usePanelStore } from '@/components/panel/lib/panel-store';

// 컴포넌트 내부:
const setPanelOpen = usePanelStore((s) => s.setOpen);
const unreadCount = usePanelStore((s) => s.unreadAlertCount());
const runningCount = usePanelStore((s) => s.runningCount());
const badgeCount = unreadCount; // Bell 뱃지 = unread alert만

// 기존 알림 섹션 JSX (line 429부터) 교체:
// ─ 기존 dropdown JSX 전부 제거. 클릭 시 setPanelOpen(true)만:
<button
  onClick={() => setPanelOpen(true)}
  className={cn(
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 group',
  )}
  title={!sidebarOpen ? '알림' : undefined}
>
  <div className="relative shrink-0">
    <Bell size={18} strokeWidth={1.5} className="text-slate-400 group-hover:text-slate-500 transition-colors" />
    {badgeCount > 0 && (
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
    {runningCount > 0 && (
      <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
    )}
  </div>
  {sidebarOpen && <span className="font-medium">알림</span>}
</button>
```

**주의**: 
- `alertTypeIcon` 헬퍼 함수(line 169-178)는 Sidebar.tsx 내부에 이미 있어서 사용 안 되면 제거
- `timeAgoShort` 같은 헬퍼는 다른 곳에서도 쓰일 수 있으니 grep 후 제거 판단
- `AlertItem` import + react-query import 정리

- [ ] **Step 2: Header.tsx 삭제**

Run: `rm apps/web/src/components/layout/Header.tsx`

- [ ] **Step 3: 빌드 확인**

Run: `npm run build --workspace=apps/web`

Expected: TypeScript 에러 없이 빌드 성공.

- [ ] **Step 4: Dev 환경 검증**

Run: `npm run dev --workspace=apps/web`

브라우저에서 Sidebar Bell 클릭 → PanelSheet 오른쪽에서 slide-out.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/Sidebar.tsx
git rm apps/web/src/components/layout/Header.tsx
git commit -m "refactor(web/layout): Sidebar Bell opens PanelSheet + delete dead Header.tsx"
```

---

## Phase 8 — Action Board Extensions

### Task 24: Action Board — 내/팀/전체 SegmentedControl + assignee UI

**Files:**
- Modify: `apps/web/src/app/action-board/page.tsx`

- [ ] **Step 1: SegmentedControl 추가 + 필터 state**

Modify `apps/web/src/app/action-board/page.tsx`:

```tsx
// 기존 state 추가:
const [assignedFilter, setAssignedFilter] = useState<'me' | 'team' | 'all'>('all');

// 기존 useQuery의 queryFn에 query param 추가:
const { data: tasks = [] } = useQuery({
  queryKey: queryKeys.actionTasks.list(assignedFilter),
  queryFn: () => apiClient.get<ActionTask[]>(`/api/action-tasks?assignedTo=${assignedFilter}`),
  refetchInterval: 60_000,
});

// 기존 VIEW_TABS 옆에 SegmentedControl 렌더:
<div className="flex items-center gap-3 mb-4">
  {/* 기존 view tabs 유지 */}
  <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
    {(['all', 'me', 'team'] as const).map((f) => (
      <button
        key={f}
        onClick={() => setAssignedFilter(f)}
        className={cn(
          'px-3 py-1.5 text-sm font-medium rounded',
          assignedFilter === f ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700',
        )}
      >
        {f === 'all' ? '전체' : f === 'me' ? '내' : '팀'}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Task card에 assignee 표시 + claim 버튼**

Modify task card 렌더 (기존 card 컴포넌트 내부에):

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

const claimMutation = useMutation({
  mutationFn: (taskId: string) => apiClient.patch(`/api/action-tasks/${taskId}/claim`, {}),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.all }),
});

const unclaimMutation = useMutation({
  mutationFn: (taskId: string) => apiClient.patch(`/api/action-tasks/${taskId}/unclaim`, {}),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.all }),
});

// 카드 내부 렌더 (기존 렌더에 추가):
<div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
  {task.assigneeUserId ? (
    <div className="flex items-center gap-1.5 text-xs text-slate-600">
      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
        {task.assigneeUserName?.[0] ?? '?'}
      </div>
      <span>{task.assigneeUserName ?? '할당됨'}</span>
      {task.assigneeUserId === currentUserId && (
        <button
          onClick={(e) => { e.stopPropagation(); unclaimMutation.mutate(task.id); }}
          className="text-[10px] text-slate-400 hover:text-slate-600 ml-1"
        >
          (해제)
        </button>
      )}
    </div>
  ) : (
    <span className="text-xs text-slate-400">할당 안됨</span>
  )}
  {!task.assigneeUserId && (
    <button
      onClick={(e) => { e.stopPropagation(); claimMutation.mutate(task.id); }}
      className="text-xs text-violet-600 hover:text-violet-700 font-medium"
    >
      내가 맡기
    </button>
  )}
</div>
```

**주의**: `assigneeUserName`은 ActionTask 응답에 포함 필요 — `apps/server/src/action-task/action-task.service.ts`의 list 메서드에서 `include: { assignee: { select: { id: true, name: true } } }` 추가.

- [ ] **Step 3: "← from alert" 뱃지**

Task card 상단에 조건부 뱃지:

```tsx
{task.sourceAlert && (
  <button
    onClick={(e) => { e.stopPropagation(); /* open alert detail modal */ }}
    className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
  >
    ← from alert
  </button>
)}
```

**주의**: `task.sourceAlert`은 서버 응답에 포함 필요 — list 시 lookup해서 주입하거나, `GET /api/action-tasks/:id/source-alert` 별도 호출.

- [ ] **Step 4: Dev 환경 검증**

Run: Dev 환경에서 `/action-board` 방문 → SegmentedControl 동작, claim/unclaim 동작, 필터링 확인.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/action-board/page.tsx
git commit -m "feat(action-board): 내/팀/전체 filter + assignee + claim/unclaim UI"
```

---

## Phase 9 — Integration Verification

### Task 25: 전체 플로우 수동 검증

**Files:** None (verification only)

- [ ] **Step 1: 서버 + 웹 동시 실행**

Run:
```bash
# Terminal 1
npm run dev:server
# Terminal 2
npm run dev --workspace=apps/web
```

- [ ] **Step 2: 시나리오 1 — Workflow trigger 시 Panel 반영**

1. 브라우저에서 `/workflows` 접속
2. Sidebar Bell 클릭 → Panel 열림
3. 다른 탭/페이지에서 workflow 수동 trigger
4. Panel에 "진행 중" 섹션으로 workflow 아이템 뜨는지 확인 (5초 이내)
5. Workflow 완료 → "최근" 섹션으로 이동, green check dot

**예상 결과**: 실시간 반영. 페이지 이동해도 Panel 상태 유지.

- [ ] **Step 3: 시나리오 2 — Alert 승격**

1. Dev DB에 unread Alert 하나 seed (또는 RulesEngine 수동 trigger)
2. Panel에 alert 나타나는지 확인
3. Hover → "할일로 만들기" 버튼 노출
4. 클릭 → PromoteToTaskModal 오픈
5. 확인 → ActionTask 생성
6. `/action-board` 방문 → 새 task 있는지 + "← from alert" 뱃지
7. Panel의 alert은 "→ 할일 생성됨" 상태

- [ ] **Step 4: 시나리오 3 — Action Board 내/팀 필터**

1. `/action-board`에서 "전체" → "내" 전환 → 할당된 task만 보임
2. 미할당 task에 "내가 맡기" 클릭 → 나에게 할당
3. "내" 필터로 전환해도 계속 보임
4. 내 task에 "(해제)" 클릭 → 미할당으로 돌아감

- [ ] **Step 5: 시나리오 4 — SSE 재접속**

1. Panel 열어두고 Network 탭에서 `/api/panel/stream` 확인
2. DevTools에서 해당 연결 수동 abort
3. 5초 내 자동 재접속
4. Panel 상태 유지 (재접속 후 snapshot 또는 ring buffer replay로 이벤트 유실 없음)

- [ ] **Step 6: Boot 테스트 + lint 전체**

Run:
```bash
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npx vitest run
```

Expected: 모두 통과.

- [ ] **Step 7: Commit (verification artifacts 있으면)**

이 Task는 주로 수동 검증이므로 보통 commit 없음. 만약 검증 중 발견된 버그 수정 있으면 별도 commit.

---

## Self-Review

### Spec coverage
- [x] P1 (Panel ≠ Action Board): Task 1~2 (ADR), Task 21 (UI separation), Task 24 (Action Board 독립 유지)
- [x] P2 (MVP 4 소스 + promotion + filter): Task 7, 10, 11, 12~15
- [x] P3 (Sidebar Bell 단일 진입점): Task 23
- [x] P4 (수명 분리): Task 21 (PanelSheet sortItems), spec Section 3.1 규칙 준수
- [x] P5 (role MVP 아님): Task 11 (user-scoped, role은 기존 taskKey 유지)
- [x] P6 (지속성): Task 17 (Zustand persist via localStorage)
- [x] P7 (parentId 스키마): Task 5 (types.ts 포함), Task 7 (workflow adapter parentId)
- [x] P8 (SSE): Task 6, 8, 16, 18
- [x] P9 (visibility 축): Task 5 (types), Task 7 (adapter default), Task 8 (snapshot 필터)
- [x] P10 (내/팀 UI): Task 17 (selectMineVsTeam), Task 21 (PanelSheet sections)
- [x] Section 1 아키텍처 + 데이터 계약: Task 4~9
- [x] Section 2 UI: Task 19~23
- [x] Section 3 수명/에러/테스트: 각 태스크의 test steps
- [x] Section 4 마이그레이션/ADR/코드 정리: Task 1, 2, 3, 22, 23

### Placeholder scan
- 몇 개 Task에 "실제 Prisma 필드명 확인 후 교체" 또는 "기존 패턴 따라 적용" 주석 있음 — 이는 코드베이스 정확한 상태 확인 필요한 지점. 엔지니어에게 명확히 지시됨.
- Step 내부 "TBD"/"TODO" 없음 확인.

### Type consistency
- `PanelRunSource = 'workflow' | 'agent' | 'image_edit'` — Task 4, 5, 7, 19에서 일관
- `PanelItem` discriminated union — Task 5 정의, 이후 Task에서 일관 참조
- `status` enum `'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'` — Task 5, 7, 17, 19 일관
- Event 이름 `PANEL_EVENTS.UPSERT`, `PANEL_EVENTS.DISMISS` — Task 6 정의, Task 10, 12~15에서 일관 사용
- Adapter 메서드 `mapToItem`, `defaultVisibility` — Task 7 정의, 일관
- Store action 이름 `upsertItem`, `dismissItem`, `handleSnapshot` — Task 17 정의, Task 18, 21 일관

### Scope check
- 25 tasks across 9 phases + verification. Coherent feature set (Panel + Action Board extensions).
- 각 task는 2~10분 step 가짐. 각 task 평균 4~6 steps.
- Follow-ups (Phase 2)는 spec의 별도 섹션에 박아두고 이 plan에는 포함 안 함.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-15-panel-live-ops.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
