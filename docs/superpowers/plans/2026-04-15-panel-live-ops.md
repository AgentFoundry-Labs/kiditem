# Panel Live Ops Implementation Plan (v2 — 전면 재작성)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Revision**: v2 of 2026-04-15. Supersedes v1 after `critic` + `plan-eng-review` surfaced 10 CRITICAL codebase-assumption mismatches and 5 engineering-structure gaps. See [Revision Notes](#revision-notes) at bottom.

**Goal**: Agent OS의 async run(workflow/agent/image_edit)과 비즈니스 알림을 live slide-out 패널로 통합. Alert → ActionTask 한 방향 승격 + Action Board 내/팀 필터.

**Architecture**: NestJS `@Sse()` + `EventEmitter2` (기존 `AgentSseService` 패턴 재사용) → `@microsoft/fetch-event-source` → Zustand store → Radix Sheet. 새 테이블 없음(원본 테이블 + adapter 매핑). 단일 인스턴스 전제.

**Tech Stack**: NestJS 11, Next.js 16, Prisma 6 (PostgreSQL 17), rxjs, `@microsoft/fetch-event-source`, Radix UI Sheet, Zustand, Tailwind, Lucide, Zod, Vitest.

**Spec**: `docs/superpowers/specs/2026-04-15-panel-live-ops-design.md`

---

## PR Structure (Strangler Fig)

25-task monolithic PR을 3개 shippable PR로 분리:

| PR | 제목 | 목표 | 범위 | 예상 |
|----|------|------|------|------|
| **PR1** | Foundations + Workflow MVP | SSE 파이프라인 + workflow source 하나로 end-to-end 검증 | Task 1-14 (ADR, Prisma, shared, backend infra, workflow adapter + hook, frontend client+store+Sheet, Sidebar integration, Error Boundary, Header 삭제, integration test) | 1~2일 |
| **PR2** | Additional Sources + My/Team Split | agent, image_edit, alert source 추가 + 내/팀 섹션 렌더링 | Task 15-20 (agent/image/alert adapter, 각 domain hook, my/team UI split) | 1일 |
| **PR3** | Alert Promote + Action Board Filter | Alert → ActionTask 승격 + 내/팀/전체 필터 + claim/unclaim | Task 21-26 (Prisma 추가 migration, promote service/controller, Action Board UI, PromoteToTaskModal) | 1일 |

각 PR은 **standalone shippable** — PR1 merge 후 PR2 전까지 1~2주 dogfood 가능.

---

## PR1 — Foundations + Workflow MVP

### PR1 File Structure

**Shared (packages/shared)**:
- `packages/shared/src/panel/sources.ts` — PANEL_RUN_SOURCES registry (workflow only)
- `packages/shared/src/panel/types.ts` — PanelItem discriminated union, PanelEvent wire type
- `packages/shared/src/panel/index.ts` — re-export

**Backend (apps/server/src/panel/)**:
- `panel.module.ts` — NestJS module (⚠ EventEmitterModule.forRoot() NOT imported — already in app.module)
- `panel.controller.ts` — `@Sse('stream')`, `@Get('backfill')`, `@Get('snapshot')`
- `panel.service.ts` — backfill/snapshot 쿼리
- `events/panel-sse.service.ts` — rxjs Subject, @OnEvent, seq, ring buffer, companyId filter, **companyId strip**
- `events/panel-events.ts` — PANEL_EVENTS 상수 + payload 타입
- `adapters/types.ts` — PanelRunAdapter interface
- `adapters/registry.ts` — panelRunAdapters (workflow only in PR1)
- `adapters/workflow.adapter.ts`
- 각 파일 옆 `__tests__/*.spec.ts`

**Frontend (apps/web/src/components/panel/)**:
- `PanelSheet.tsx` — Radix Sheet container
- `PanelItemRow.tsx` — run 아이템 렌더
- `PanelErrorBoundary.tsx` — React Error Boundary (F1)
- `hooks/usePanelStream.ts` — SSE 생명주기
- `lib/panel-sse-client.ts` — fetch-event-source wrapper
- `lib/panel-store.ts` — Zustand store

**ADR**:
- `.claude/docs/decisions/0010-panel-sse-frontend-exception.md` (실제 번호 — Task 1에서 확인)

**Modified**:
- `prisma/schema.prisma` — WorkflowRun에 `triggeredByUserId` 추가 (F5 해결)
- `apps/server/src/app.module.ts` — PanelModule 등록
- `apps/server/src/workflows/**/*.service.ts` — workflow 상태 전이 지점에 emit 추가
- `apps/web/src/components/layout/Sidebar.tsx` — Bell dropdown → PanelSheet trigger (기존 useQuery/mutation 제거)
- `apps/web/src/components/layout/AppLayout.tsx` — PanelSheet mount + usePanelStream + ErrorBoundary
- `packages/shared/src/index.ts` — panel re-export
- `apps/web/package.json` — `@microsoft/fetch-event-source` 추가

**Deleted**:
- `apps/web/src/components/layout/Header.tsx` (dead code, AppLayout import 없음 확인됨)

---

### Task 1 — ADR 0010: Panel SSE Frontend Exception

**Files:**
- Create: `.claude/docs/decisions/0010-panel-sse-frontend-exception.md`

- [ ] **Step 1: 실제 다음 ADR 번호 확인**

Run: `ls .claude/docs/decisions/ | grep -E '^[0-9]+' | sort | tail -3`

Expected: 최신 번호 확인 후 다음 번호로 파일명 교체 (plan은 `0010`으로 가정).

- [ ] **Step 2: ADR 파일 작성**

Create `.claude/docs/decisions/0010-panel-sse-frontend-exception.md`:

```markdown
# ADR-0010: Panel 도메인 SSE 프론트엔드 예외

**Status:** Accepted
**Date:** 2026-04-15

## Context

`apps/web/src/app/agents/CLAUDE.md:109`, `thumbnails/CLAUDE.md:55` — "EventSource/WebSocket 금지" 규정. 원인은 표준 `EventSource` API가 HTTP 헤더를 못 보내서 dev 인증 헤더(`x-dev-user-id`, ADR-0006 DevAuthMiddleware)와 호환 안 됨. `apps/web/src/lib/api-client.ts:5` 주석에 이유 기록.

## Decision

Panel 도메인(`apps/web/src/components/panel/`) 한정으로 `@microsoft/fetch-event-source` 허용. fetch API 기반이라 모든 HTTP 헤더 지원 + 자동 재연결 + Last-Event-ID.

다른 도메인(agents/thumbnails)은 polling 유지. 신규 도메인이 SSE 원하면 별도 ADR.

## Alternatives Rejected

- 쿠리 파라미터 인증 — prod 인증 정책 충돌
- WebSocket — bidirectional 불필요
- 폴링 전면 — "live 파노라마" 경험 불가

## Consequences

- 1개 dependency 추가 (~5KB gzip)
- Panel 도메인 내부에 격리된 wrapper (`PanelSseClient`)
- 기존 agents/thumbnails 규칙 그대로
```

- [ ] **Step 3: Commit**

```bash
git add .claude/docs/decisions/0010-panel-sse-frontend-exception.md
git commit -m "docs(adr): ADR-0010 Panel SSE frontend exception via fetch-event-source"
```

---

### Task 2 — Prisma Migration: WorkflowRun.triggeredByUserId (F5)

**Rationale**: `WorkflowRun.triggeredBy`는 현재 `String @default("manual")` — "manual"/"schedule" 같은 enum. UUID 아님. Plan의 visibility 필터 `actorUserId === currentUserId`는 UUID 비교라 항상 false → P10 "내 작업" 섹션이 workflow에 대해 동작 안 함. 새 필드 추가로 해결.

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: WorkflowRun에 triggeredByUserId 추가**

Modify `prisma/schema.prisma` — `model WorkflowRun` 내부에 (기존 `triggeredBy` 유지, 새 필드 추가):

```prisma
model WorkflowRun {
  // ...existing fields...
  triggeredBy        String  @default("manual") @map("triggered_by")   // 기존 유지: "manual" | "schedule" | "cron"
  triggeredByUserId  String? @map("triggered_by_user_id") @db.Uuid      // 신규: 수동 trigger 시 유저 UUID
  triggeredByUser    User?   @relation("WorkflowRunTriggeredBy", fields: [triggeredByUserId], references: [id], onDelete: SetNull)
  // ...existing...

  @@index([companyId, triggeredByUserId])
}
```

- [ ] **Step 2: User 모델에 back-relation 추가**

Modify `model User`:

```prisma
model User {
  // ...existing...
  triggeredWorkflowRuns WorkflowRun[] @relation("WorkflowRunTriggeredBy")
}
```

- [ ] **Step 3: Migration 생성 + 적용**

Run: `npx prisma migrate dev --name panel_workflow_triggered_by_user`

Expected: 새 마이그레이션 생성 + dev DB 적용 + `prisma generate`.

- [ ] **Step 4: Workflow controller/service — trigger 시 값 세팅**

Modify `apps/server/src/workflows/workflows.service.ts` (또는 trigger 엔드포인트) — 수동 trigger 시 `triggeredByUserId: currentUserId` 저장. 스케줄은 null.

**참고**: 기존 `triggeredBy` 필드는 유지 (다른 로직이 의존할 수 있음). Panel adapter는 `triggeredByUserId`만 사용.

- [ ] **Step 5: Build verification**

Run:
```bash
npm run build --workspace=@kiditem/shared
```

Expected: 빌드 성공 (Prisma 타입 갱신 전까진 기존 shared가 정상 동작).

- [ ] **Step 6: Commit**

```bash
git add prisma/ apps/server/src/workflows/
git commit -m "feat(prisma,workflows): add WorkflowRun.triggeredByUserId for panel visibility"
```

---

### Task 3 — Shared Panel Types + Sources Registry (workflow-only)

**Files:**
- Create: `packages/shared/src/panel/sources.ts`
- Create: `packages/shared/src/panel/types.ts`
- Create: `packages/shared/src/panel/index.ts`
- Create: `packages/shared/src/panel/__tests__/types.spec.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Sources registry (workflow only — PR2에서 확장)**

Create `packages/shared/src/panel/sources.ts`:

```typescript
import { z } from 'zod';

export const PANEL_RUN_SOURCES = {
  workflow: {
    label: '워크플로우',
    iconName: 'Workflow',
    deepLinkPattern: '/workflows/runs/:id',
  },
  // PR2에서 agent, image_edit 추가
} as const;

export type PanelRunSource = keyof typeof PANEL_RUN_SOURCES;
const sourceKeys = Object.keys(PANEL_RUN_SOURCES) as [PanelRunSource, ...PanelRunSource[]];
export const PanelRunSourceSchema = z.enum(sourceKeys);
```

- [ ] **Step 2: Discriminated union types**

Create `packages/shared/src/panel/types.ts`:

```typescript
import { z } from 'zod';
import { PanelRunSourceSchema } from './sources';

const PanelItemBase = z.object({
  id: z.string(),
  // companyId는 서버 내부에서만 사용, 와이어에서는 drop됨
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

// PR2에서 PanelAlertItem 추가
export const PanelItem = z.discriminatedUnion('kind', [PanelRunItem]);
export type PanelItem = z.infer<typeof PanelItem>;
export type PanelRunItem = z.infer<typeof PanelRunItem>;

// Wire events — dismiss는 itemId만 전송 (중요: IMPORTANT #2 해결)
export const PanelUpsertEvent = z.object({
  type: z.literal('upsert'),
  seq: z.number().int(),
  item: PanelItem,
});
export const PanelDismissEvent = z.object({
  type: z.literal('dismiss'),
  seq: z.number().int(),
  itemId: z.string(),
});
export const PanelSnapshotEvent = z.object({
  type: z.literal('snapshot'),
  seq: z.number().int(),
  items: z.array(PanelItem),
  resetClient: z.literal(true), // 클라에게 "store clear + lastSeq=seq" 요청
});
export const PanelEvent = z.discriminatedUnion('type', [PanelUpsertEvent, PanelDismissEvent, PanelSnapshotEvent]);
export type PanelEvent = z.infer<typeof PanelEvent>;
```

**중요 (CRITICAL #9 해결)**: `PanelSnapshotEvent.resetClient: true`는 클라이언트에게 store clear + lastSeq 재초기화 지시. 서버 재시작 시 seq 카운터가 0으로 리셋되므로 반드시 snapshot을 먼저 보내야 함.

- [ ] **Step 3: Index + shared re-export**

Create `packages/shared/src/panel/index.ts`:

```typescript
export * from './sources';
export * from './types';
```

Modify `packages/shared/src/index.ts` — append:

```typescript
export * from './panel';
```

- [ ] **Step 4: Tests**

Create `packages/shared/src/panel/__tests__/types.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PanelItem, PanelEvent, PanelRunSourceSchema } from '..';

const makeRun = (overrides = {}) => ({
  id: 'workflow:abc',
  kind: 'run' as const,
  source: 'workflow' as const,
  sourceId: 'abc',
  seq: 1,
  status: 'running' as const,
  title: 'Test',
  deepLink: '/workflows/runs/abc',
  actorUserId: null,
  visibility: 'company' as const,
  createdAt: '2026-04-15T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('PanelItem', () => {
  it('parses a valid workflow run', () => {
    expect(() => PanelItem.parse(makeRun())).not.toThrow();
  });

  it('rejects unknown source', () => {
    expect(() => PanelItem.parse(makeRun({ source: 'bogus' as any }))).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => PanelItem.parse(makeRun({ status: 'weird' as any }))).toThrow();
  });
});

describe('PanelEvent', () => {
  it('parses upsert', () => {
    expect(() => PanelEvent.parse({ type: 'upsert', seq: 5, item: makeRun() })).not.toThrow();
  });

  it('parses dismiss with itemId only', () => {
    expect(() => PanelEvent.parse({ type: 'dismiss', seq: 6, itemId: 'workflow:abc' })).not.toThrow();
  });

  it('parses snapshot with resetClient flag', () => {
    expect(() => PanelEvent.parse({ type: 'snapshot', seq: 0, items: [], resetClient: true })).not.toThrow();
  });

  it('rejects snapshot without resetClient', () => {
    expect(() => PanelEvent.parse({ type: 'snapshot', seq: 0, items: [] } as any)).toThrow();
  });

  it('PanelRunSourceSchema accepts workflow', () => {
    expect(() => PanelRunSourceSchema.parse('workflow')).not.toThrow();
  });
});
```

- [ ] **Step 5: Run tests + build**

Run:
```bash
npx vitest run packages/shared/src/panel/__tests__/types.spec.ts
npm run build --workspace=@kiditem/shared
```

Expected: 6 tests PASS + 빌드 성공.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/panel/ packages/shared/src/index.ts
git commit -m "feat(shared): Panel discriminated union + sources registry (workflow-only)"
```

---

### Task 4 — PanelSseService with companyId strip (CRITICAL #8 해결)

**Files:**
- Create: `apps/server/src/panel/events/panel-events.ts`
- Create: `apps/server/src/panel/events/panel-sse.service.ts`
- Create: `apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`

- [ ] **Step 1: Event 상수 + internal payload 타입**

Create `apps/server/src/panel/events/panel-events.ts`:

```typescript
import type { PanelItem } from '@kiditem/shared';

export const PANEL_EVENTS = {
  UPSERT: 'panel.item.upsert',
  DISMISS: 'panel.item.dismiss',
} as const;

// 내부 버스 payload — companyId 포함 (라우팅 전용)
// 클라이언트로 나가기 전에 PanelSseService가 strip
export interface PanelUpsertInternal {
  item: Omit<PanelItem, 'seq' | 'updatedAt'>;
  companyId: string;
}

export interface PanelDismissInternal {
  itemId: string;
  companyId: string;
}
```

- [ ] **Step 2: Write failing test**

Create `apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PanelSseService } from '../panel-sse.service';
import { PANEL_EVENTS } from '../panel-events';
import { firstValueFrom, take } from 'rxjs';

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
    kind: 'run' as const,
    source: 'workflow' as const,
    sourceId: 'abc',
    status: 'running' as const,
    title: 'test',
    deepLink: '/x',
    actorUserId: null,
    visibility: 'company' as const,
    createdAt: '2026-04-15T00:00:00Z',
    ...overrides,
  });

  it('emits upsert and filters by companyId', async () => {
    const sub = service.getStream('co-1');
    const next = firstValueFrom(sub.pipe(take(1)));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem(), companyId: 'co-1' });
    const msg = await next;
    expect((msg as any).data).toMatchObject({ type: 'upsert', seq: 1 });
    expect((msg as any).data.item).toMatchObject({ id: 'workflow:abc' });
  });

  it('strips companyId from payload to client (CRITICAL #8)', async () => {
    const sub = service.getStream('co-1');
    const next = firstValueFrom(sub.pipe(take(1)));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem(), companyId: 'co-secret' });
    const msg = await next as any;
    expect(msg.data.item).not.toHaveProperty('companyId');
  });

  it('filters out other company', async () => {
    const sub = service.getStream('co-1');
    const collected: any[] = [];
    const subscription = sub.subscribe((e) => collected.push(e));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'other' }), companyId: 'co-2' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'mine' }), companyId: 'co-1' });
    await new Promise((r) => setTimeout(r, 10));
    subscription.unsubscribe();
    expect(collected).toHaveLength(1);
    expect((collected[0] as any).data.item.id).toBe('mine');
  });

  it('assigns monotonic seq', async () => {
    const sub = service.getStream('co-1');
    const collected: any[] = [];
    const subscription = sub.subscribe((e) => collected.push((e as any).data));
    for (let i = 0; i < 3; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `i-${i}` }), companyId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 10));
    subscription.unsubscribe();
    expect(collected.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('replayAfter returns events from ring buffer', async () => {
    for (let i = 0; i < 5; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `i-${i}` }), companyId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 5));
    const replayed = service.replayAfter('co-1', 2);
    expect(replayed.map((e) => e.seq)).toEqual([3, 4, 5]);
  });

  it('ring buffer caps at 100 per company', async () => {
    for (let i = 0; i < 150; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `i-${i}` }), companyId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 20));
    const all = service.replayAfter('co-1', 0);
    expect(all.length).toBe(100);
  });

  it('dismiss event has itemId only (IMPORTANT #2)', async () => {
    const sub = service.getStream('co-1');
    const next = firstValueFrom(sub.pipe(take(1)));
    emitter.emit(PANEL_EVENTS.DISMISS, { itemId: 'workflow:abc', companyId: 'co-1' });
    const msg = await next as any;
    expect(msg.data.type).toBe('dismiss');
    expect(msg.data.itemId).toBe('workflow:abc');
    expect(msg.data).not.toHaveProperty('item');
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `npx vitest run apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`

Expected: FAIL (module not exists).

- [ ] **Step 3: Implement PanelSseService**

Create `apps/server/src/panel/events/panel-sse.service.ts`:

```typescript
import { Injectable, MessageEvent } from '@nestjs/common';   // ← @nestjs/common (CRITICAL #8)
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { PanelEvent } from '@kiditem/shared';
import {
  PANEL_EVENTS,
  PanelUpsertInternal,
  PanelDismissInternal,
} from './panel-events';

const RING_BUFFER_SIZE = 100;

interface BufferedEvent {
  event: PanelEvent;
  companyId: string;
}

@Injectable()
export class PanelSseService {
  private readonly subject = new Subject<BufferedEvent>();
  private seqCounter = 0;
  private readonly ringBuffer = new Map<string, BufferedEvent[]>();

  @OnEvent(PANEL_EVENTS.UPSERT)
  handleUpsert(payload: PanelUpsertInternal) {
    const seq = ++this.seqCounter;
    const timestamp = new Date().toISOString();
    // companyId는 payload에 있는 internal routing 용도 — item에는 포함 안 됨 (wire schema는 companyId 없음)
    const event: PanelEvent = {
      type: 'upsert',
      seq,
      item: { ...payload.item, seq, updatedAt: timestamp } as any,
    };
    this.push(payload.companyId, event);
  }

  @OnEvent(PANEL_EVENTS.DISMISS)
  handleDismiss(payload: PanelDismissInternal) {
    const seq = ++this.seqCounter;
    const event: PanelEvent = {
      type: 'dismiss',
      seq,
      itemId: payload.itemId,
    };
    this.push(payload.companyId, event);
  }

  private push(companyId: string, event: PanelEvent) {
    const buffered: BufferedEvent = { event, companyId };
    this.subject.next(buffered);
    const arr = this.ringBuffer.get(companyId) ?? [];
    arr.push(buffered);
    if (arr.length > RING_BUFFER_SIZE) arr.shift();
    this.ringBuffer.set(companyId, arr);
  }

  /**
   * 구독자의 companyId와 일치하는 이벤트만 통과. 
   * MessageEvent는 @nestjs/common (NOT DOM MessageEvent).
   * 현재 seqCounter를 getter로 노출 (controller가 snapshot resetClient 판단 시 사용).
   */
  getStream(subscriberCompanyId: string): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      filter((b) => b.companyId === subscriberCompanyId),
      map((b) => ({ data: b.event, id: String(b.event.seq) })),
    );
  }

  replayAfter(companyId: string, afterSeq: number): PanelEvent[] {
    const arr = this.ringBuffer.get(companyId) ?? [];
    return arr.filter((b) => b.event.seq > afterSeq).map((b) => b.event);
  }

  get currentSeq(): number {
    return this.seqCounter;
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run apps/server/src/panel/events/__tests__/panel-sse.service.spec.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/panel/events/
git commit -m "feat(panel): PanelSseService with companyId filter, strip, ring buffer, dismiss wire shape"
```

---

### Task 5 — Panel Workflow Adapter

**Files:**
- Create: `apps/server/src/panel/adapters/types.ts`
- Create: `apps/server/src/panel/adapters/registry.ts`
- Create: `apps/server/src/panel/adapters/workflow.adapter.ts`
- Create: `apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`

- [ ] **Step 1: Adapter types**

Create `apps/server/src/panel/adapters/types.ts`:

```typescript
import type { PanelRunItem, PanelRunSource } from '@kiditem/shared';

export interface PanelRunAdapter<TInput = unknown> {
  source: PanelRunSource;
  mapToItem(input: TInput, companyId: string): Omit<PanelRunItem, 'seq' | 'updatedAt'>;
  defaultVisibility(input: TInput): 'company' | 'user';
}
```

- [ ] **Step 2: Workflow adapter test**

Create `apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { workflowPanelAdapter, WorkflowRunInput } from '../workflow.adapter';

const input: WorkflowRunInput = {
  id: 'run-uuid',
  status: 'running',
  templateName: '소싱 파이프라인',
  steps: [{ id: 's1', status: 'succeeded' }, { id: 's2', status: 'running' }, { id: 's3', status: 'pending' }],
  parentRunId: null,
  triggeredByUserId: 'user-uuid',
  createdAt: new Date('2026-04-15T00:00:00Z'),
};

describe('workflowPanelAdapter', () => {
  it('maps to PanelRunItem with derived progress', () => {
    const item = workflowPanelAdapter.mapToItem(input, 'co-1');
    expect(item).toMatchObject({
      id: 'workflow:run-uuid',
      kind: 'run',
      source: 'workflow',
      sourceId: 'run-uuid',
      status: 'running',
      title: '소싱 파이프라인',
      subtitle: '1/3 단계',
      progress: 1 / 3,
      deepLink: '/workflows/runs/run-uuid',
      actorUserId: 'user-uuid',
      visibility: 'user',
    });
  });

  it('visibility=company when triggeredByUserId=null (scheduled)', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, triggeredByUserId: null },
      'co-1',
    );
    expect(item.visibility).toBe('company');
    expect(item.actorUserId).toBeNull();
  });

  it('progress undefined when no steps', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, steps: [] },
      'co-1',
    );
    expect(item.progress).toBeUndefined();
    expect(item.subtitle).toBe('0/0 단계');
  });

  it('parentId set from parentRunId', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, parentRunId: 'parent-uuid' },
      'co-1',
    );
    expect(item.parentId).toBe('workflow:parent-uuid');
  });

  it('falls back to "워크플로우" if templateName missing', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, templateName: undefined as any },
      'co-1',
    );
    expect(item.title).toBe('워크플로우');
  });
});
```

- [ ] **Step 3: Run test — expect fail**

Run: `npx vitest run apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implement workflow adapter with CORRECT Prisma fields (CRITICAL #1 해결)**

Create `apps/server/src/panel/adapters/workflow.adapter.ts`:

```typescript
import type { PanelRunAdapter } from './types';

/**
 * Service layer가 WorkflowRun + WorkflowTemplate join 결과를 이 shape으로 넘김.
 * Prisma model 직접 사용 안 함 — steps JSON을 이미 해석한 뒤 전달.
 * 
 * service 호출 예 (workflows.service.ts):
 *   const run = await prisma.workflowRun.findUnique({ 
 *     where: { id }, include: { template: { select: { name: true } } }
 *   });
 *   const steps = Array.isArray(run.steps) ? run.steps : [];
 *   const input: WorkflowRunInput = {
 *     id: run.id, status: run.status,
 *     templateName: run.template.name,
 *     steps,
 *     parentRunId: null,  // WorkflowRun schema엔 parentRunId 없음 — PR2+에서 추가 가능
 *     triggeredByUserId: run.triggeredByUserId,
 *     createdAt: run.createdAt,
 *   };
 *   const item = workflowPanelAdapter.mapToItem(input, companyId);
 */
export interface WorkflowRunInput {
  id: string;
  status: string;
  templateName: string;
  steps: Array<{ status: string }>;   // workflow_runs.steps JSON; element shape은 workflow 도메인 소유
  parentRunId?: string | null;
  triggeredByUserId: string | null;
  createdAt: Date;
}

const VALID_STATUS = new Set(['pending', 'running', 'succeeded', 'failed', 'cancelled']);

export const workflowPanelAdapter: PanelRunAdapter<WorkflowRunInput> = {
  source: 'workflow',
  mapToItem(input, companyId) {
    const total = input.steps.length;
    const completed = input.steps.filter((s) => s.status === 'succeeded').length;
    const status = VALID_STATUS.has(input.status) ? input.status : 'pending';

    return {
      id: `workflow:${input.id}`,
      kind: 'run',
      source: 'workflow',
      sourceId: input.id,
      status: status as any,
      title: input.templateName || '워크플로우',
      subtitle: `${completed}/${total} 단계`,
      progress: total > 0 ? completed / total : undefined,
      deepLink: `/workflows/runs/${input.id}`,
      parentId: input.parentRunId ? `workflow:${input.parentRunId}` : undefined,
      actorUserId: input.triggeredByUserId,
      visibility: workflowPanelAdapter.defaultVisibility(input),
      createdAt: input.createdAt.toISOString(),
    };
  },
  defaultVisibility(input) {
    return input.triggeredByUserId == null ? 'company' : 'user';
  },
};
```

- [ ] **Step 5: Registry (PR1: workflow only)**

Create `apps/server/src/panel/adapters/registry.ts`:

```typescript
import type { PanelRunAdapter } from './types';
import type { PanelRunSource } from '@kiditem/shared';
import { workflowPanelAdapter } from './workflow.adapter';

// PR2에서 agent, image_edit 추가
export const panelRunAdapters: Record<PanelRunSource, PanelRunAdapter> = {
  workflow: workflowPanelAdapter as PanelRunAdapter,
};
```

- [ ] **Step 6: Run tests + Commit**

Run: `npx vitest run apps/server/src/panel/adapters/__tests__/workflow.adapter.spec.ts`
Expected: 5 tests PASS.

```bash
git add apps/server/src/panel/adapters/
git commit -m "feat(panel): workflow adapter + registry (maps WorkflowRun+template to PanelRunItem)"
```

---

### Task 6 — PanelService (backfill/snapshot with CORRECT model query)

**Files:**
- Create: `apps/server/src/panel/panel.service.ts`
- Create: `apps/server/src/panel/__tests__/panel.service.spec.ts`

- [ ] **Step 1: Service test**

Create `apps/server/src/panel/__tests__/panel.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { PanelService } from '../panel.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PanelService', () => {
  let service: PanelService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workflowRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PanelService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(PanelService);
  });

  it('snapshot filters by companyId and visibility', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([
      {
        id: 'r1', status: 'running', templateId: 't1',
        template: { name: 'Run A' },
        steps: [],
        triggeredByUserId: 'user-a',
        createdAt: new Date(),
      },
      {
        id: 'r2', status: 'succeeded', templateId: 't2',
        template: { name: 'Run B' },
        steps: [],
        triggeredByUserId: null,
        createdAt: new Date(),
      },
    ]);

    const items = await service.snapshot('co-1', 'user-a');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'workflow:r1', visibility: 'user', actorUserId: 'user-a' });
    expect(items[1]).toMatchObject({ id: 'workflow:r2', visibility: 'company' });
  });

  it('snapshot filters out other users user-scoped items', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([
      { id: 'r1', status: 'running', template: { name: 'Mine' }, steps: [], triggeredByUserId: 'user-a', createdAt: new Date() },
      { id: 'r2', status: 'running', template: { name: 'Others' }, steps: [], triggeredByUserId: 'user-b', createdAt: new Date() },
    ]);
    const items = await service.snapshot('co-1', 'user-a');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('workflow:r1');
  });
});
```

- [ ] **Step 2: Implement service**

Create `apps/server/src/panel/panel.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared';
import { workflowPanelAdapter } from './adapters/workflow.adapter';

@Injectable()
export class PanelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 현재 Panel에 표시되어야 할 아이템 전체. 
   * - 진행 중 run (pending/running)
   * - 최근 24h terminal run
   * PR1: workflow source만. PR2에서 agent, image_edit, alert 추가.
   */
  async snapshot(companyId: string, currentUserId: string): Promise<Array<Omit<PanelItem, 'seq' | 'updatedAt'>>> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000);

    const workflowRuns = await this.prisma.workflowRun.findMany({
      where: {
        companyId,
        OR: [
          { status: { in: ['pending', 'running'] } },
          { updatedAt: { gte: twentyFourHoursAgo } },
        ],
      },
      include: { template: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const items: Array<Omit<PanelItem, 'seq' | 'updatedAt'>> = [];

    for (const run of workflowRuns) {
      const steps = Array.isArray(run.steps) ? (run.steps as any[]).map((s) => ({ status: s?.status ?? 'pending' })) : [];
      items.push(workflowPanelAdapter.mapToItem({
        id: run.id,
        status: run.status,
        templateName: run.template?.name ?? '',
        steps,
        parentRunId: null,
        triggeredByUserId: run.triggeredByUserId,
        createdAt: run.createdAt,
      }, companyId));
    }

    // Visibility 필터: company OR (user AND actorUserId === currentUserId)
    return items.filter((item) =>
      item.visibility === 'company' ||
      (item.visibility === 'user' && item.actorUserId === currentUserId)
    );
  }

  /**
   * Backfill — 클라가 세 가지 상황에서 호출: 
   *   (a) SSE 초기 연결 (snapshot 대신 호출할 수도 있음)
   *   (b) SSE 재접속 실패 후 polling fallback
   *   (c) Server 재시작 감지 후 리셋
   * PR1에선 snapshot과 동일 구현. seq는 클라가 서버 stream seq로 override.
   */
  async backfill(companyId: string, _afterSeq: number, currentUserId: string) {
    return this.snapshot(companyId, currentUserId);
  }
}
```

- [ ] **Step 3: Run tests + Commit**

Run: `npx vitest run apps/server/src/panel/__tests__/panel.service.spec.ts`
Expected: 2 tests PASS.

```bash
git add apps/server/src/panel/panel.service.ts apps/server/src/panel/__tests__/panel.service.spec.ts
git commit -m "feat(panel): PanelService snapshot/backfill with visibility filter"
```

---

### Task 7 — PanelController (@Sse + @CurrentUser 올바른 사용) + AppModule 등록

**Files:**
- Create: `apps/server/src/panel/panel.controller.ts`
- Create: `apps/server/src/panel/panel.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: EventEmitterModule 현재 위치 확인 (CRITICAL #7)**

Run: `grep -rn "EventEmitterModule.forRoot" apps/server/src/ | head`

Expected: `agent-registry/agent-registry.module.ts:30:    EventEmitterModule.forRoot(),` 가 존재한다면, `PanelModule`에서 재등록하면 안 됨 (duplicate emitter 문제).

만약 `app.module.ts`에 global `EventEmitterModule.forRoot({ global: true })`가 있다면 PanelModule은 그냥 import만. 없으면 AppModule에 global 추가.

**결정**: AppModule에 global로 등록해서 모든 모듈이 공유.

- [ ] **Step 2: AppModule에 EventEmitterModule 글로벌 등록 확인/추가**

Modify `apps/server/src/app.module.ts` — `imports` 배열에 (이미 있으면 스킵):

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';
// ...
imports: [
  EventEmitterModule.forRoot(),   // 전역 — agent-registry/panel 등 모든 모듈 공유
  // ...existing
  PanelModule,
]
```

`agent-registry.module.ts`의 `EventEmitterModule.forRoot()`는 그대로 둬도 일반적으로 문제 없음 (NestJS가 singleton으로 처리). 단, PanelModule에서는 **import 안 함**.

- [ ] **Step 3: PanelController — @CurrentUser 올바른 사용 (CRITICAL #3)**

Create `apps/server/src/panel/panel.controller.ts`:

```typescript
import { Controller, Get, Sse, Query, Headers, MessageEvent } from '@nestjs/common';
import { Observable, from, concat } from 'rxjs';
import { map } from 'rxjs/operators';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';
import { PanelSseService } from './events/panel-sse.service';
import { PanelService } from './panel.service';
import type { PanelEvent } from '@kiditem/shared';

@Controller('panel')
export class PanelController {
  constructor(
    private readonly sseService: PanelSseService,
    private readonly panelService: PanelService,
  ) {}

  /**
   * SSE stream. 
   * - Last-Event-ID 있으면 ring buffer에서 replay 후 live
   * - Ring buffer miss(또는 Last-Event-ID 없음): snapshot 먼저 전송 (resetClient=true로 클라 store reset 지시) 후 live
   * 
   * CRITICAL #9 해결: 서버 재시작 시 seqCounter=0이 되므로 snapshot 반드시 선행.
   */
  @Sse('stream')
  async stream(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,   // ← @CurrentUser() user (CRITICAL #3)
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<MessageEvent>> {
    const afterSeq = lastEventId ? parseInt(lastEventId, 10) : 0;
    const replayed = this.sseService.replayAfter(companyId, afterSeq);

    let initial$: Observable<MessageEvent>;

    if (replayed.length > 0) {
      // Ring buffer hit — 순서대로 replay
      initial$ = from(replayed).pipe(
        map((event) => ({ data: event, id: String(event.seq) })),
      );
    } else {
      // Buffer miss or fresh connect — snapshot 보내서 클라 store reset 유도
      const items = await this.panelService.snapshot(companyId, user.id);
      const snapshotEvent: PanelEvent = {
        type: 'snapshot',
        seq: this.sseService.currentSeq,
        items: items.map((item) => ({
          ...item,
          seq: this.sseService.currentSeq,
          updatedAt: new Date().toISOString(),
        } as any)),
        resetClient: true,
      };
      initial$ = from([{ data: snapshotEvent, id: String(this.sseService.currentSeq) } as MessageEvent]);
    }

    const live$ = this.sseService.getStream(companyId);
    return concat(initial$, live$);
  }

  @Get('backfill')
  async backfill(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Query('afterSeq') afterSeqStr?: string,
  ) {
    const afterSeq = afterSeqStr ? parseInt(afterSeqStr, 10) : 0;
    return this.panelService.backfill(companyId, afterSeq, user.id);
  }

  @Get('snapshot')
  async snapshot(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.panelService.snapshot(companyId, user.id);
  }
}
```

**핵심**:
- `@CurrentUser() user: AuthUser` + `user.id` 사용 (critic CRITICAL #3)
- `MessageEvent` from `@nestjs/common` (CRITICAL #8)
- 초기 연결 시 replay 없으면 snapshot으로 클라 reset (CRITICAL #9)

- [ ] **Step 4: PanelModule — EventEmitterModule 재등록 안 함**

Create `apps/server/src/panel/panel.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';
import { PanelSseService } from './events/panel-sse.service';

@Module({
  // ⚠ EventEmitterModule.forRoot()는 AppModule에서만 — CRITICAL #7
  controllers: [PanelController],
  providers: [PanelService, PanelSseService],
  exports: [PanelSseService], // domain service가 주입 (직접 emit 대신 emitter 쓰므로 실제로는 필요없지만 future-proof)
})
export class PanelModule {}
```

- [ ] **Step 5: AppModule에 PanelModule 등록**

Modify `apps/server/src/app.module.ts`:

```typescript
import { PanelModule } from './panel/panel.module';
// imports에 추가: PanelModule
```

- [ ] **Step 6: Boot verification**

Run: `npm run dev:server`

Expected: 에러 없음. 로그에 `[RouterExplorer] Mapped {/api/panel/stream, GET}`, `{/api/panel/backfill, GET}`, `{/api/panel/snapshot, GET}` 확인.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/panel/panel.controller.ts apps/server/src/panel/panel.module.ts apps/server/src/app.module.ts
git commit -m "feat(panel): controller with @Sse + @CurrentUser + snapshot reset on fresh connect"
```

---

### Task 8 — Workflow Domain Hook (status transition → panel emit)

**Files:**
- Modify: `apps/server/src/workflows/workflows.service.ts` (또는 실제 서비스 파일)

- [ ] **Step 1: Workflow 서비스 상태 전이 지점 찾기**

Run:
```bash
grep -rn "workflowRun.update\|workflowRun.create\|status.*:.*'running'\|status.*:.*'succeeded'\|status.*:.*'failed'" apps/server/src/workflows/ | head -20
```

Expected: status 업데이트 지점 리스트. Subagent는 이 grep 결과를 바탕으로 hook 삽입 위치 결정.

- [ ] **Step 2: 각 status 전이 지점에 emit 추가**

각 `workflowRun.update` 또는 `workflowRun.create` 직후:

```typescript
// 임포트 (파일 상단)
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PANEL_EVENTS } from '../panel/events/panel-events';
import { workflowPanelAdapter } from '../panel/adapters/workflow.adapter';

// 서비스 생성자에 EventEmitter2 주입 (없으면 추가)
constructor(
  // ...existing
  private readonly eventEmitter: EventEmitter2,
) {}

// 각 status 전이 지점 (pending 생성 / running 시작 / succeeded 완료 / failed 실패 / cancelled 취소):
const run = await this.prisma.workflowRun.update({
  where: { id },
  data: { status: 'running' },  // 또는 해당 상태
  include: { template: { select: { name: true } } },
});

const steps = Array.isArray(run.steps) ? (run.steps as any[]).map((s) => ({ status: s?.status ?? 'pending' })) : [];
const panelItem = workflowPanelAdapter.mapToItem({
  id: run.id,
  status: run.status,
  templateName: run.template?.name ?? '',
  steps,
  parentRunId: null,
  triggeredByUserId: run.triggeredByUserId,
  createdAt: run.createdAt,
}, run.companyId!);  // companyId는 WorkflowRun에 있음 (nullable이지만 실제론 있음)

this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item: panelItem, companyId: run.companyId });
```

**반드시 감싸야 할 지점**: create (pending 시작), update to 'running', update to 'succeeded', update to 'failed', update to 'cancelled'.

- [ ] **Step 3: 헬퍼로 중복 제거**

파일 중복 줄이기 위해 서비스 내부에 private helper 추가:

```typescript
private async emitPanelUpsert(runId: string) {
  const run = await this.prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { template: { select: { name: true } } },
  });
  if (!run || !run.companyId) return;
  const steps = Array.isArray(run.steps) ? (run.steps as any[]).map((s) => ({ status: s?.status ?? 'pending' })) : [];
  const panelItem = workflowPanelAdapter.mapToItem({
    id: run.id,
    status: run.status,
    templateName: run.template?.name ?? '',
    steps,
    parentRunId: null,
    triggeredByUserId: run.triggeredByUserId,
    createdAt: run.createdAt,
  }, run.companyId);
  this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item: panelItem, companyId: run.companyId });
}
```

그리고 각 status 전이 직후 `await this.emitPanelUpsert(run.id)` 한 줄.

- [ ] **Step 4: Manual verification**

Run: Dev 환경에서 workflow trigger → 서버 로그에 PanelSseService handleUpsert 호출 확인.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/workflows/
git commit -m "feat(workflows): emit panel.item.upsert on status transitions (via helper)"
```

---

### Task 9 — Frontend: PanelSseClient (fetch-event-source 래퍼)

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/panel/lib/panel-sse-client.ts`
- Create: `apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`

- [ ] **Step 1: Install dependency**

Run: `npm install --workspace=apps/web @microsoft/fetch-event-source`

- [ ] **Step 2: Client test**

Create `apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PanelSseClient } from '../panel-sse-client';

vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }));

describe('PanelSseClient', () => {
  let fetchEventSource: any;

  beforeEach(async () => {
    fetchEventSource = (await import('@microsoft/fetch-event-source')).fetchEventSource;
    vi.clearAllMocks();
  });

  it('includes x-dev-user-id header when env set', async () => {
    process.env.NEXT_PUBLIC_DEV_USER_ID = 'dev-user-uuid';
    const client = new PanelSseClient({ onMessage: vi.fn() });
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchEventSource).toHaveBeenCalledWith(
      expect.stringContaining('/api/panel/stream'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-dev-user-id': 'dev-user-uuid' }),
      }),
    );
  });

  it('includes Last-Event-ID on reconnect', async () => {
    const client = new PanelSseClient({ onMessage: vi.fn() });
    // 강제로 lastEventId 주입
    (client as any).lastEventId = '42';
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchEventSource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'last-event-id': '42' }),
      }),
    );
  });

  it('parses valid JSON and calls onMessage', async () => {
    const onMessage = vi.fn();
    const client = new PanelSseClient({ onMessage });
    let config: any;
    fetchEventSource.mockImplementation((_url: string, cfg: any) => {
      config = cfg;
      return Promise.resolve();
    });
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    config.onmessage({ id: '1', data: JSON.stringify({ type: 'upsert', seq: 1, item: { id: 'x' } }) });
    expect(onMessage).toHaveBeenCalled();
  });

  it('disconnect aborts', () => {
    const client = new PanelSseClient({ onMessage: vi.fn() });
    client.connect();
    client.disconnect();
    expect((client as any).controller.signal.aborted).toBe(true);
  });
});
```

- [ ] **Step 3: Implement client**

Create `apps/web/src/components/panel/lib/panel-sse-client.ts`:

```typescript
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { PanelEvent } from '@kiditem/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID;

export interface PanelSseClientOptions {
  onMessage: (event: PanelEvent) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onGiveUp?: () => void;   // 5회 재시도 실패 → polling fallback 전환 시그널
}

const MAX_RETRIES = 5;

export class PanelSseClient {
  private controller = new AbortController();
  private lastEventId?: string;
  private retryCount = 0;

  constructor(private readonly options: PanelSseClientOptions) {}

  connect() {
    this.controller = new AbortController();
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (DEV_USER_ID) headers['x-dev-user-id'] = DEV_USER_ID;
    if (this.lastEventId) headers['last-event-id'] = this.lastEventId;

    fetchEventSource(`${API_BASE}/api/panel/stream`, {
      signal: this.controller.signal,
      headers,
      credentials: 'include',
      openWhenHidden: false,   // visibility 변경 시 재연결 유도 (IMPORTANT #7)
      onmessage: (msg) => {
        if (msg.id) this.lastEventId = msg.id;
        if (!msg.data || msg.data === '') return;  // ping
        try {
          const parsed = PanelEvent.parse(JSON.parse(msg.data));
          this.options.onMessage(parsed);
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
        if (this.retryCount > MAX_RETRIES) {
          this.options.onGiveUp?.();
          throw err;  // fetch-event-source가 재시도 중단
        }
        return Math.min(1000 * 2 ** this.retryCount, 30_000);
      },
      onclose: () => this.options.onClose?.(),
    });
  }

  disconnect() {
    this.controller.abort();
  }
}
```

- [ ] **Step 4: Run tests + Commit**

Run: `npx vitest run apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts`
Expected: 4 tests PASS.

```bash
git add apps/web/package.json apps/web/src/components/panel/lib/
git commit -m "feat(web/panel): PanelSseClient wrapper (fetch-event-source + reconnect + visibility)"
```

---

### Task 10 — Frontend: Zustand store with seq reset handling (CRITICAL #9)

**Files:**
- Create: `apps/web/src/components/panel/lib/panel-store.ts`
- Create: `apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`

- [ ] **Step 1: Store test**

Create `apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createPanelStore } from '../panel-store';

const makeItem = (overrides = {}) => ({
  id: 'workflow:abc', kind: 'run' as const, source: 'workflow' as const, sourceId: 'abc',
  seq: 1, status: 'running' as const, title: 't', deepLink: '/x',
  actorUserId: null, visibility: 'company' as const,
  createdAt: '2026-04-15T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

describe('panel-store', () => {
  let store: ReturnType<typeof createPanelStore>;
  beforeEach(() => { store = createPanelStore(); });

  it('upsertItem adds new', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    expect(store.getState().byId['a']).toBeDefined();
    expect(store.getState().lastSeq).toBe(1);
  });

  it('upsertItem replaces if seq is newer', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1, title: 'old' }));
    store.getState().upsertItem(makeItem({ id: 'a', seq: 2, title: 'new' }));
    expect(store.getState().byId['a'].title).toBe('new');
  });

  it('upsertItem ignores stale seq', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 5 }));
    store.getState().upsertItem(makeItem({ id: 'a', seq: 3 }));
    expect(store.getState().byId['a'].seq).toBe(5);
  });

  it('handleSnapshot clears store on resetClient', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 100 }));
    store.getState().handleSnapshot([makeItem({ id: 'b', seq: 1 })], true);
    expect(store.getState().byId['a']).toBeUndefined();
    expect(store.getState().byId['b']).toBeDefined();
    expect(store.getState().lastSeq).toBe(1);
  });

  it('dismissItem removes', () => {
    store.getState().upsertItem(makeItem({ id: 'a', seq: 1 }));
    store.getState().dismissItem('a');
    expect(store.getState().byId['a']).toBeUndefined();
  });

  it('runningCount counts pending+running', () => {
    store.getState().upsertItem(makeItem({ id: '1', seq: 1, status: 'pending' }));
    store.getState().upsertItem(makeItem({ id: '2', seq: 2, status: 'running' }));
    store.getState().upsertItem(makeItem({ id: '3', seq: 3, status: 'succeeded' }));
    expect(store.getState().runningCount()).toBe(2);
  });

  it('applyEvent dispatches by type', () => {
    store.getState().applyEvent({ type: 'upsert', seq: 1, item: makeItem({ id: 'a', seq: 1 }) });
    expect(store.getState().byId['a']).toBeDefined();
    store.getState().applyEvent({ type: 'dismiss', seq: 2, itemId: 'a' });
    expect(store.getState().byId['a']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement store**

Create `apps/web/src/components/panel/lib/panel-store.ts`:

```typescript
import { create } from 'zustand';
import type { PanelItem, PanelEvent } from '@kiditem/shared';

interface PanelStoreState {
  byId: Record<string, PanelItem>;
  lastSeq: number;
  isOpen: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'polling_fallback';

  upsertItem: (item: PanelItem) => void;
  dismissItem: (id: string) => void;
  handleSnapshot: (items: PanelItem[], resetClient: boolean) => void;
  applyEvent: (event: PanelEvent) => void;
  setOpen: (open: boolean) => void;
  setConnectionStatus: (s: PanelStoreState['connectionStatus']) => void;

  runningCount: () => number;
  itemsArray: () => PanelItem[];
}

export const createPanelStore = () => create<PanelStoreState>((set, get) => ({
  byId: {},
  lastSeq: 0,
  isOpen: false,
  connectionStatus: 'disconnected',

  upsertItem: (item) => set((state) => {
    const existing = state.byId[item.id];
    if (existing && existing.seq >= item.seq) return state;
    return { byId: { ...state.byId, [item.id]: item }, lastSeq: Math.max(state.lastSeq, item.seq) };
  }),

  dismissItem: (id) => set((state) => {
    const { [id]: _, ...rest } = state.byId;
    return { byId: rest };
  }),

  handleSnapshot: (items, resetClient) => set(() => {
    const byId: Record<string, PanelItem> = {};
    let maxSeq = 0;
    items.forEach((item) => { byId[item.id] = item; if (item.seq > maxSeq) maxSeq = item.seq; });
    // CRITICAL #9: resetClient=true면 store 전체 clear, lastSeq = snapshot의 seq로
    return { byId, lastSeq: maxSeq };
  }),

  applyEvent: (event) => {
    const state = get();
    switch (event.type) {
      case 'upsert': state.upsertItem(event.item); break;
      case 'dismiss': state.dismissItem(event.itemId); break;
      case 'snapshot': state.handleSnapshot(event.items, event.resetClient); break;
    }
  },

  setOpen: (open) => {
    set({ isOpen: open });
    try { localStorage.setItem('kiditem.panel.open', String(open)); } catch {}
  },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  runningCount: () =>
    Object.values(get().byId).filter((i) => i.kind === 'run' && (i.status === 'pending' || i.status === 'running')).length,

  itemsArray: () => Object.values(get().byId),
}));

export const usePanelStore = createPanelStore();
```

- [ ] **Step 3: Run tests + Commit**

Run: `npx vitest run apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts`
Expected: 7 tests PASS.

```bash
git add apps/web/src/components/panel/lib/panel-store.ts apps/web/src/components/panel/lib/__tests__/panel-store.spec.ts
git commit -m "feat(web/panel): Zustand store with seq dedup and snapshot resetClient"
```

---

### Task 11 — Frontend: usePanelStream hook

**Files:**
- Create: `apps/web/src/components/panel/hooks/usePanelStream.ts`

- [ ] **Step 1: Implement**

```typescript
'use client';

import { useEffect } from 'react';
import { PanelSseClient } from '../lib/panel-sse-client';
import { usePanelStore } from '../lib/panel-store';

export function usePanelStream() {
  useEffect(() => {
    usePanelStore.getState().setConnectionStatus('connecting');

    const client = new PanelSseClient({
      onMessage: (event) => usePanelStore.getState().applyEvent(event),
      onOpen: () => usePanelStore.getState().setConnectionStatus('connected'),
      onError: () => usePanelStore.getState().setConnectionStatus('disconnected'),
      onClose: () => usePanelStore.getState().setConnectionStatus('disconnected'),
      onGiveUp: () => {
        // 5회 재시도 실패 → polling fallback 시그널
        usePanelStore.getState().setConnectionStatus('polling_fallback');
        // 실제 폴링 로직은 선택적 (Phase 2) — MVP는 상태만 표시
      },
    });

    client.connect();
    return () => client.disconnect();
  }, []);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/panel/hooks/usePanelStream.ts
git commit -m "feat(web/panel): usePanelStream hook orchestrates SSE lifecycle"
```

---

### Task 12 — Frontend: PanelItemRow + PanelSheet + Error Boundary (F1)

**Files:**
- Create: `apps/web/src/components/panel/PanelItemRow.tsx`
- Create: `apps/web/src/components/panel/PanelSheet.tsx`
- Create: `apps/web/src/components/panel/PanelErrorBoundary.tsx`

- [ ] **Step 1: Error Boundary (F1)**

Create `apps/web/src/components/panel/PanelErrorBoundary.tsx`:

```tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[Panel] crashed', error);
    // 선택: 서버에 report (POST /api/panel/client-error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 text-sm text-slate-500">
          알림 패널을 불러올 수 없어요. 새로고침을 시도해주세요.
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: PanelItemRow**

Create `apps/web/src/components/panel/PanelItemRow.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { PANEL_RUN_SOURCES, type PanelItem, type PanelRunItem } from '@kiditem/shared';
import { cn } from '@/lib/utils';

export function PanelItemRow({ item }: { item: PanelItem }) {
  if (item.kind === 'run') return <RunRow item={item} />;
  return null; // PR2에서 AlertRow 추가
}

function RunRow({ item }: { item: PanelRunItem }) {
  const router = useRouter();
  const meta = PANEL_RUN_SOURCES[item.source];
  const Icon = ((Icons as any)[meta.iconName] ?? Icons.Box) as any;

  return (
    <button
      onClick={() => router.push(item.deepLink)}
      className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50"
    >
      <div className={cn(
        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
        item.status === 'succeeded' && 'bg-emerald-100 text-emerald-700',
        item.status === 'failed' && 'bg-red-100 text-red-700',
        item.status === 'cancelled' && 'bg-slate-100 text-slate-500',
        (item.status === 'pending' || item.status === 'running') && 'bg-violet-100 text-violet-700',
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 text-sm font-medium text-slate-900">
          <span className="truncate">{item.title}</span>
        </div>
        {item.subtitle && (
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              (item.status === 'pending' || item.status === 'running') && 'bg-violet-400 animate-pulse',
              item.status === 'succeeded' && 'bg-emerald-500',
              item.status === 'failed' && 'bg-red-500',
              item.status === 'cancelled' && 'bg-slate-400',
            )} />
            {item.subtitle}
          </div>
        )}
        {item.progress !== undefined && (
          <div className="h-0.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
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
```

- [ ] **Step 3: PanelSheet (PR1 단순 구조 — PR2에서 내/팀 split 추가)**

Create `apps/web/src/components/panel/PanelSheet.tsx`:

```tsx
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Bell, X } from 'lucide-react';
import { usePanelStore } from './lib/panel-store';
import { PanelItemRow } from './PanelItemRow';
import type { PanelItem } from '@kiditem/shared';

export function PanelSheet() {
  const isOpen = usePanelStore((s) => s.isOpen);
  const setOpen = usePanelStore((s) => s.setOpen);
  const items = usePanelStore((s) => s.itemsArray());
  const runningCount = usePanelStore((s) => s.runningCount());
  const connectionStatus = usePanelStore((s) => s.connectionStatus);

  const { active, recent } = partitionByStatus(items);

  return (
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
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {connectionStatus !== 'connected' && (
            <div className="px-4 py-1.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
              {connectionStatus === 'connecting' && '연결 중...'}
              {connectionStatus === 'disconnected' && '연결 끊김 — 재시도 중'}
              {connectionStatus === 'polling_fallback' && '폴링 모드'}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {active.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                  진행 중 ({active.length})
                </div>
                {active.map((i) => <PanelItemRow key={i.id} item={i} />)}
              </>
            )}
            {recent.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                  최근 ({recent.length})
                </div>
                {recent.map((i) => <PanelItemRow key={i.id} item={i} />)}
              </>
            )}
            {active.length === 0 && recent.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-slate-400">
                현재 주목할 항목이 없어요
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function partitionByStatus(items: PanelItem[]) {
  const active: PanelItem[] = [];
  const recent: PanelItem[] = [];
  for (const item of items) {
    const isActive = item.kind === 'run' && (item.status === 'pending' || item.status === 'running');
    if (isActive) active.push(item); else recent.push(item);
  }
  // 시간 역순
  active.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { active, recent };
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/panel/PanelErrorBoundary.tsx apps/web/src/components/panel/PanelItemRow.tsx apps/web/src/components/panel/PanelSheet.tsx
git commit -m "feat(web/panel): PanelSheet + ItemRow + ErrorBoundary (workflow-only sections)"
```

---

### Task 13 — AppLayout integration + Sidebar Bell trigger + Header.tsx 삭제

**Files:**
- Modify: `apps/web/src/components/layout/AppLayout.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Delete: `apps/web/src/components/layout/Header.tsx`

- [ ] **Step 1: AppLayout에 PanelSheet + usePanelStream + ErrorBoundary mount**

Modify `apps/web/src/components/layout/AppLayout.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import { PanelSheet } from '@/components/panel/PanelSheet';
import { PanelErrorBoundary } from '@/components/panel/PanelErrorBoundary';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';

const CopilotChat = dynamic(() => import('./CopilotChat'), { ssr: false });

function PanelMount() {
  usePanelStream();   // 인증 세션 전체 동안 SSE 유지
  return <PanelSheet />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);

  const toggleChat = useCallback(() => {
    const btn = document.querySelector('.copilotKitButton') as HTMLButtonElement | null;
    if (btn) btn.click();
  }, []);

  if (pathname.includes('/editor')) return <>{children}</>;

  const content = (
    <div className="min-h-screen bg-slate-50">
      <Sidebar onChatToggle={toggleChat} chatOpen={chatOpen} />
      <div className={cn('transition-all duration-300', sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]')}>
        <main className="p-6">{children}</main>
      </div>
      <PanelErrorBoundary>
        <PanelMount />
      </PanelErrorBoundary>
    </div>
  );

  return (
    <CopilotChat onChatOpenChange={setChatOpen}>
      {content}
    </CopilotChat>
  );
}
```

**중요**: `usePanelStream()` 훅은 인증된 사용자면 **Panel open 여부와 무관하게** SSE 유지 → Bell 뱃지 실시간 반영. ErrorBoundary가 Panel 전체를 감싸 크래시 시에도 앱 나머지는 정상.

- [ ] **Step 2: Sidebar.tsx Bell dropdown 영역 교체 (IMPORTANT #3)**

Modify `apps/web/src/components/layout/Sidebar.tsx`:

삭제할 것들:
- Line 3 `useRef` import 중 `useRef` 사용처 삭제 후 정리
- Line 6 `useQuery, useMutation, useQueryClient` — Panel이 대체하므로 삭제 (단, 다른 용도 있으면 유지)
- Line 10 `AlertItem` 타입 import — 사용 안 함
- Line 169-178 `alertTypeIcon` 함수 — Panel에서 다룸
- Line 195-221 `alertOpen` state, `dropdownRef`, useQuery, mutations, useEffect — Panel이 대체
- Line 429-510 부근 Bell dropdown JSX — 아래 버튼으로 교체

교체 JSX (Bell 버튼 유지, dropdown 제거):

```tsx
import { usePanelStore } from '@/components/panel/lib/panel-store';

// 컴포넌트 내부:
const setPanelOpen = usePanelStore((s) => s.setOpen);
const unreadAlertCount = usePanelStore((s) => Object.values(s.byId).filter((i) => i.kind === 'alert').length);
const runningCount = usePanelStore((s) => s.runningCount());
// PR1에서는 alert 없으므로 unreadAlertCount = 0. PR2에서 의미 가짐.

// 기존 알림 섹션 (line 429~510 부근)을 통째로:
<button
  onClick={() => setPanelOpen(true)}
  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 group"
  title={!sidebarOpen ? '알림' : undefined}
>
  <div className="relative shrink-0">
    <Bell size={18} strokeWidth={1.5} className="text-slate-400 group-hover:text-slate-500 transition-colors" />
    {unreadAlertCount > 0 && (
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
        {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
      </span>
    )}
    {runningCount > 0 && (
      <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
    )}
  </div>
  {sidebarOpen && <span className="font-medium">알림</span>}
</button>
```

Import 정리:
- `Bell`은 유지
- 쓰지 않게 된 아이콘(`MinusCircle`, `Megaphone`, `Truck`, `TrendingDown`, `AlertTriangle` 중 Panel 대체분) — 다른 섹션이 쓰지 않으면 제거

- [ ] **Step 3: Header.tsx 삭제**

Run: `rm apps/web/src/components/layout/Header.tsx`

- [ ] **Step 4: 빌드 확인**

Run:
```bash
npm run build --workspace=apps/web
```

Expected: TypeScript 에러 없이 성공.

- [ ] **Step 5: Dev smoke test**

Run: `npm run dev:server` + `npm run dev --workspace=apps/web`

브라우저에서 Sidebar Bell 클릭 → Sheet 슬라이드 아웃. Workflow trigger (있다면) → 진행 섹션에 아이템 뜸.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/layout/AppLayout.tsx apps/web/src/components/layout/Sidebar.tsx
git rm apps/web/src/components/layout/Header.tsx
git commit -m "feat(web): mount PanelSheet in AppLayout + Sidebar trigger + delete dead Header.tsx"
```

---

### Task 14 — Integration Test (F4 — deterministic, not manual)

**Files:**
- Create: `apps/server/src/panel/__tests__/integration.spec.ts`

- [ ] **Step 1: 통합 테스트 작성**

Create `apps/server/src/panel/__tests__/integration.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { PanelController } from '../panel.controller';
import { PanelService } from '../panel.service';
import { PanelSseService } from '../events/panel-sse.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PANEL_EVENTS } from '../events/panel-events';
import { firstValueFrom, take, toArray } from 'rxjs';

describe('Panel integration', () => {
  let controller: PanelController;
  let sseService: PanelSseService;
  let emitter: EventEmitter2;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workflowRun: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        PanelService,
        PanelSseService,
        PanelController,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    controller = moduleRef.get(PanelController);
    sseService = moduleRef.get(PanelSseService);
    emitter = moduleRef.get(EventEmitter2);
  });

  const makeItem = (overrides = {}) => ({
    id: 'workflow:abc',
    kind: 'run' as const,
    source: 'workflow' as const,
    sourceId: 'abc',
    status: 'running' as const,
    title: 't',
    deepLink: '/x',
    actorUserId: null,
    visibility: 'company' as const,
    createdAt: '2026-04-15T00:00:00Z',
    ...overrides,
  });

  it('initial connect without replay sends snapshot event with resetClient', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([]);
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, undefined);
    const first = await firstValueFrom(stream$.pipe(take(1)));
    const event = (first as any).data;
    expect(event.type).toBe('snapshot');
    expect(event.resetClient).toBe(true);
  });

  it('upsert event flows from emitter to stream', async () => {
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, undefined);
    const collected: any[] = [];
    const sub = stream$.subscribe((e) => collected.push((e as any).data));
    // 첫 snapshot 소비 후
    await new Promise((r) => setTimeout(r, 10));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem(), companyId: 'co-1' });
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();
    const upsert = collected.find((e) => e.type === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert.item.id).toBe('workflow:abc');
    expect(upsert.item).not.toHaveProperty('companyId'); // stripped
  });

  it('other company events are filtered', async () => {
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, undefined);
    const collected: any[] = [];
    const sub = stream$.subscribe((e) => collected.push((e as any).data));
    await new Promise((r) => setTimeout(r, 10));
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'other' }), companyId: 'co-2' });
    emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: 'mine' }), companyId: 'co-1' });
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();
    const upserts = collected.filter((e) => e.type === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].item.id).toBe('mine');
  });

  it('visibility filter hides other users user-scoped items', async () => {
    prisma.workflowRun.findMany.mockResolvedValue([
      { id: 'r1', status: 'running', template: { name: 'Mine' }, steps: [], triggeredByUserId: 'user-a', createdAt: new Date() },
      { id: 'r2', status: 'running', template: { name: 'Others' }, steps: [], triggeredByUserId: 'user-b', createdAt: new Date() },
    ]);
    const snapshot = await controller.snapshot('co-1', { id: 'user-a' } as any);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe('workflow:r1');
  });

  it('Last-Event-ID triggers ring buffer replay without snapshot', async () => {
    // 먼저 3개 이벤트 쌓기
    for (let i = 0; i < 3; i++) {
      emitter.emit(PANEL_EVENTS.UPSERT, { item: makeItem({ id: `r-${i}` }), companyId: 'co-1' });
    }
    await new Promise((r) => setTimeout(r, 10));
    // Last-Event-ID=1 로 재접속
    const stream$ = await controller.stream('co-1', { id: 'user-1' } as any, '1');
    const collected: any[] = [];
    const sub = stream$.subscribe((e) => collected.push((e as any).data));
    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();
    // seq 2, 3만 replay되어야 함 (snapshot 아님)
    expect(collected.filter((e) => e.type === 'snapshot')).toHaveLength(0);
    const replayed = collected.filter((e) => e.type === 'upsert');
    expect(replayed.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run apps/server/src/panel/__tests__/integration.spec.ts`
Expected: 5 tests PASS.

- [ ] **Step 3: 전체 백엔드/프론트 빌드 + 테스트 스모크**

Run:
```bash
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npx vitest run
```

Expected: 전체 PASS.

- [ ] **Step 4: PR1 PR 생성**

```bash
git push -u origin feat/panel-live-ops
gh pr create --title "feat(panel): live ops panel — PR1 foundations + workflow source" --body "$(cat <<'EOF'
## Summary
- Panel SSE 파이프라인 (Sse + EventEmitter2 + ring buffer + companyId filter + snapshot/resetClient)
- Workflow source만 end-to-end (registry + adapter + domain hook)
- Sidebar Bell trigger로 전환 + Header.tsx 삭제 + Error Boundary
- WorkflowRun.triggeredByUserId 추가 (visibility 필터용)

Spec: docs/superpowers/specs/2026-04-15-panel-live-ops-design.md
Plan: docs/superpowers/plans/2026-04-15-panel-live-ops.md

## Test plan
- [ ] npx vitest run (unit + integration)
- [ ] Dev 환경에서 workflow trigger → Panel 진행 섹션 반영 확인
- [ ] SSE 연결 끊김 후 재접속 → 상태 복원 확인
- [ ] Sidebar Bell 클릭 → Sheet 슬라이드 아웃

## Checklist
- [x] ADR-0010 written
- [x] Prisma migration included (WorkflowRun.triggeredByUserId)
- [x] Integration test deterministic (not manual)
- [x] companyId stripped from wire payload
- [x] @CurrentUser() usage verified
- [x] Error Boundary wraps Panel
EOF
)"
```

---

## PR2 — Additional Sources + My/Team UI Split

### PR2 Overview

PR1 검증(2주 dogfood) 후 진행. 추가 범위:

1. **agent source** — `HeartbeatRun` + `AgentDefinition` join으로 `agentName` 획득. 상태 매핑 `queued|running|succeeded|failed|paused` → `pending|running|succeeded|failed|cancelled`.
2. **image_edit source** — **실제 모델은 `ThumbnailGeneration`** (CRITICAL #2), `method='edit'` 필터. 상태 매핑 `pending|generating|ready|applied` → `pending|running|succeeded|succeeded`.
3. **alert source** — `Alert` 모델. `createMany` 패턴이므로 insert 후 **re-query** 로 Panel emit (CRITICAL #5).
4. **PanelAlertItem** 타입 추가 (shared).
5. **내 작업 / 팀** 섹션 UI split (PanelSheet).

### PR2 Task list

- **Task 15**: `PanelAlertItem` 추가 + `PanelItem` 유니언 확장 + 테스트
- **Task 16**: `agent.adapter.ts` — HeartbeatRun + AgentDefinition.name join shape (service가 join 해서 adapter에 전달). 상태 매핑 테이블 명시 (`queued → pending`, `paused → cancelled`). registry 등록.
- **Task 17**: Heartbeat 서비스 hook — 각 status 전이 지점에 emit. `triggeredByUserId` 없으면 company visibility.
- **Task 18**: `image.adapter.ts` — `ThumbnailGeneration` 모델 사용. `method='edit'` 필터. 상태 매핑 (`generating → running`, `ready → succeeded`, `applied → succeeded`).
- **Task 19**: ThumbnailGeneration 서비스 hook — insert/status update 지점 emit.
- **Task 20**: `alert.adapter.ts` — Alert 모델 → PanelAlertItem. severity/alertType 통과.
- **Task 21**: Rules 서비스 hook — **CRITICAL #5 해결**: `createMany` 후 **re-query** (`findMany` with `createdAt >= now - 10s` AND just-inserted IDs) 해서 emit. 또는 일괄 `createMany` → 바로 뒤 `findMany` with exact title+companyId+createdAt 기준.
- **Task 22**: PanelSheet 내/팀 split UI — `actorUserId === currentUserId` 기준. UI v3 mockup 따라 섹션 분리 + "팀 공유" 뱃지.
- **Task 23**: AlertRow 컴포넌트 (severity별 색상) + PanelItemRow에 discriminated union 분기.
- **Task 24**: PR2 integration test 확장 — 4 소스 각자 emit → 1 스트림 수신 확인 + my/team split 검증.

### PR2 각 task 공통 패턴

TDD 순서 PR1과 동일. 핵심 주의사항:

- **Prisma 모델명 확인**: `ThumbnailGeneration` (not `ThumbnailEdit`). `HeartbeatRun` + join `AgentDefinition.name`.
- **상태 매핑 테이블**: 각 adapter에 명시 + 테스트로 모든 상태값 커버.
- **triggeredByUserId**: HeartbeatRun / ThumbnailGeneration 에 해당 필드 있는지 확인. 없으면 Prisma migration 추가 task 선행 (PR2 내).
- **createMany 후 re-query**: RulesEngine 패턴. 한 트랜잭션 안에서 insert + findMany(createdAt >= cutoff) 해서 각 row에 emit.

---

## PR3 — Alert Promote + Action Board Filter

### PR3 Overview

PR1, PR2 검증 후 진행.

1. **Prisma**: `Alert.actionTaskId` 추가 (single-direction), `ActionTask.assigneeUserId` 추가.
2. **Promote service** — atomic updateMany로 race 방지 (CRITICAL #4).
3. **Promote controller** — POST `/api/panel/alerts/:id/promote`, POST `/api/panel/alerts/:id/dismiss`.
4. **PromoteToTaskModal** — UX.
5. **ActionTask claim/unclaim** service + controller.
6. **Action Board UI** — SegmentedControl "내/팀/전체" + assignee 표시 + "내가 맡기" 버튼 + "← from alert" 뱃지.

### PR3 Task list

- **Task 25**: Prisma migration — Alert.actionTaskId + ActionTask.assigneeUserId + User back-relation.
- **Task 26**: Promote service — **CRITICAL #4 해결**: `updateMany({ where: { id, companyId, actionTaskId: null }, data: {...} })` → count=0면 409. 그 후 ActionTask 생성 분리.

실제 atomic 패턴 (concurrency-safe):

```typescript
async promote(alertId, companyId, dto, currentUserId) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Alert lookup + 스냅샷
    const alert = await tx.alert.findFirst({ where: { id: alertId, companyId }});
    if (!alert) throw new NotFoundException();
    if (alert.actionTaskId) throw new ConflictException('Already promoted');
    
    // 2. ActionTask 생성
    const task = await tx.actionTask.create({ data: { ..derived.., taskKey: `promoted:${alert.id}` }});
    
    // 3. Alert 업데이트 — atomic guard (actionTaskId가 여전히 null일 때만)
    const { count } = await tx.alert.updateMany({
      where: { id: alertId, actionTaskId: null },
      data: { actionTaskId: task.id },
    });
    
    if (count === 0) {
      // 동시 promote 시 다른 request가 먼저 세팅 — 방금 만든 task 삭제
      await tx.actionTask.delete({ where: { id: task.id }});
      throw new ConflictException('Already promoted (race)');
    }
    
    // 4. Panel에 updated alert emit
    const updatedAlert = { ...alert, actionTaskId: task.id };
    const item = alertPanelAdapter.mapToItem(updatedAlert, companyId);
    this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId });
    
    return task;
  });
}
```

- **Task 27**: Promote + Dismiss controllers — `POST /api/panel/alerts/:id/promote`, `POST /:id/dismiss`.
- **Task 28**: PromoteToTaskModal — Radix Dialog + useMutation + auto-mapping (severity→priority, alertType→role).
- **Task 29**: PanelItemRow AlertRow에 hover action ("할일로 만들기" 버튼) 추가. Linked state 렌더.
- **Task 30**: ActionTask.service — `claim(taskId, companyId, userId)`, `unclaim(taskId, companyId, userId)`, `list({ assignedTo })`, `getSourceAlert(taskId)` (Alert.actionTaskId 역lookup).
- **Task 31**: ActionTaskController — `PATCH /:id/claim`, `/unclaim`, `GET ?assignedTo=me|team|all`. `@CurrentUser() user: AuthUser` + `user.id` 사용.
- **Task 32**: Action Board UI — SegmentedControl + assignee 카드 표시 + claim/unclaim 버튼 + "← from alert" 뱃지.
- **Task 33**: PR3 통합 테스트 — promote 동시성 race 테스트, claim/unclaim, 필터 동작.

---

## Self-Review

### Spec coverage
- P1 (Panel ≠ Action Board): PR3 Task 27~33 (Panel은 관찰, Board는 durable work) — 유지
- P2 (MVP scope): PR1(workflow) + PR2(추가 소스) + PR3(promote/filter) = 스펙의 전체 범위
- P3 (Sidebar Bell 단일): PR1 Task 13
- P4 (수명 분리): PanelSheet partitionByStatus (PR1) + alert lifecycle (PR2)
- P5 (role MVP 아님): 모든 PR
- P6 (지속성): AppLayout 상시 mount (PR1 Task 13)
- P7 (parentId): shared 스키마에 존재 (PR1 Task 3)
- P8 (SSE): PR1 Task 4~7
- P9 (visibility 축): PR1 Task 6 PanelService 필터 + WorkflowRun.triggeredByUserId
- P10 (내/팀 UI): PR2 Task 22

### Critic CRITICALs 반영
| # | Critical | Fix 위치 |
|---|----------|---------|
| 1 | Prisma 필드 fiction | PR1 Task 5, PR2 Task 16/18 (실제 모델명 + join) |
| 2 | ThumbnailEdit → ThumbnailGeneration | PR2 Task 18 |
| 3 | `@CurrentUser('id')` invalid | PR1 Task 7 (controller), PR3 Task 31 |
| 4 | Promote race | PR3 Task 26 (atomic updateMany) |
| 5 | createMany 패턴 | PR2 Task 21 (re-query 후 emit) |
| 6 | /api/users/me 부재 | PR1 Task 13 — useCurrentUserId 훅은 **AppLayout에서 필요 없음** (usePanelStream만 쓰고 server에서 @CurrentUser로 주입) |
| 7 | EventEmitterModule 중복 | PR1 Task 7 — PanelModule에서 import 제외, AppModule 글로벌 |
| 8 | MessageEvent 타입 + companyId 누수 | PR1 Task 4 (service가 companyId strip), Task 7 (@nestjs/common MessageEvent) |
| 9 | Seq reset 핸드셰이크 | PR1 Task 3 (PanelSnapshotEvent.resetClient), Task 7 (controller snapshot 선행), Task 10 (store handleSnapshot) |
| 10 | triggeredBy UUID mismatch | PR1 Task 2 (triggeredByUserId 필드 추가) |

### Eng findings 반영
| # | Finding | Fix 위치 |
|---|---------|---------|
| F1 | Error Boundary | PR1 Task 12 PanelErrorBoundary, Task 13 AppLayout wrap |
| F2 | Innovation tokens 절제 | PR 분리가 완화책 — 한 번에 모든 novelty 아니라 단계별 |
| F3 | Incremental PR | **3 PR 구조** 전체 |
| F4 | Integration test | PR1 Task 14 (deterministic Test.createTestingModule 기반) |
| F5 | triggeredBy 데이터 현실 | PR1 Task 2 (triggeredByUserId 마이그레이션) |

### IMPORTANT 반영
| # | Important | Fix 위치 |
|---|-----------|---------|
| 1 | Partial index alert.actionTaskId | PR3 Task 25 (Prisma 마이그레이션 시 `@@index([companyId, actionTaskId])` — Prisma는 partial index 제한적, 전체 인덱스로) |
| 2 | Dismiss wire shape | PR1 Task 3 (PanelDismissEvent.itemId) |
| 3 | Sidebar exact lines | PR1 Task 13 — "line 429~510 부근 전체 교체" 명시 |
| 4 | Integration test hand-wavy | F4와 동일 → PR1 Task 14 |
| 5 | status enum per adapter | PR1 Task 5 (workflow VALID_STATUS set), PR2 Task 16/18 (agent/image 매핑 테이블) |
| 6 | sortItems grouping | PR1 Task 12 partitionByStatus |
| 7 | openWhenHidden vs visibilitychange | PR1 Task 9 — `openWhenHidden: false` 하나로 통일 |
| 8 | backfill seq | PR1 Task 6 — MVP에선 backfill이 snapshot과 동일. 실제 seq는 stream이 담당 |

### Type consistency
- `PanelRunSource`, `PanelItem`, `PanelEvent` — PR1~PR3 일관
- `PANEL_EVENTS.UPSERT / DISMISS` — 일관
- `@CurrentUser() user: AuthUser` + `user.id` — 모든 신규 controller 일관

### Placeholder scan
- "TBD" 1개 (PR Structure의 branch) — 의도적
- 각 task에 "grep 결과 확인 후" 지시: 필수 코드베이스 확인. subagent가 실제 파일 검증 필요.

---

## Revision Notes

**v1 → v2 전환 이유**: 
- `critic` subagent가 10 CRITICAL 이슈 발견: Prisma 모델/필드 fiction, `@CurrentUser` 잘못된 사용, EventEmitterModule 중복, 등
- `plan-eng-review` 가 5 엔지니어링 구조 이슈 발견: blast radius (error boundary 부재), PR 쪼개기, 통합 테스트 부실

**v1 에서 잘못된 가정들**:
- `WorkflowRun.workflowName/totalSteps/completedSteps/parentRunId` 필드 있다고 가정 (실제 없음)
- `HeartbeatRun.agentName` 필드 있다고 가정 (실제 없음)
- `ThumbnailEdit` 모델 존재 가정 (실제 `ThumbnailGeneration`)
- `@CurrentUser('id')` 로 id만 주입 가능 가정 (실제 data 인자 ignored)
- `EventEmitterModule.forRoot()` PanelModule에서 호출 OK 가정 (실제 duplicate emitter 문제)

**v2 수정 요점**:
- 3 PR 구조로 incremental delivery
- adapter 입력 shape을 Prisma 모델에서 분리 (service가 join/compose해서 넘김)
- `@CurrentUser() user: AuthUser` + `user.id` 일관 사용
- PanelModule에서 EventEmitterModule 제외 (AppModule 전역)
- `PanelSnapshotEvent.resetClient` 필드로 server 재시작 간 seq reset 처리
- `WorkflowRun.triggeredByUserId` 추가 마이그레이션 포함
- Error Boundary로 Panel 격리
- Deterministic 통합 테스트 (manual 검증 아닌 Test.createTestingModule 기반)

---

## Execution Handoff

PR1만 이 세션에서 작성 완료. PR2, PR3는 PR1 dogfood 후 별도 세션.

**Subagent-driven development** 모드로 PR1 Task 1~14 실행 예정. 각 task 당 implementer → spec reviewer → code quality reviewer 2단계 리뷰.
