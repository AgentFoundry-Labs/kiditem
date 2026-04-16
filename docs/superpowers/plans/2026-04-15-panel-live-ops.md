# Panel Live Ops Implementation Plan (v4 — PR3 detail 확장)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Revision**: v4 of 2026-04-16. PR2 (#13) + PR2 hotfix (#14) 머지 후 PR3 section을 PR1 수준 detail로 확장. `critic` + `architect` 재실행으로 4 CRITICAL + 7 MAJOR + 4 MINOR 추가 발견 (taskKey collision, emit inside $tx, PanelAlertItem shared schema 누락, claim atomicity 등). Task 25~33 재작성. See [Revision Notes](#revision-notes) at bottom.

**Goal**: Agent OS의 async run(workflow/agent/image_edit)과 비즈니스 알림을 live slide-out 패널로 통합. Alert → ActionTask 한 방향 승격 + Action Board 내/팀 필터.

**Architecture**: NestJS `@Sse()` + `EventEmitter2` (기존 `AgentSseService` 패턴 재사용) → `@microsoft/fetch-event-source` → Zustand store → Radix Sheet. 새 테이블 없음(원본 테이블 + adapter 매핑). 단일 인스턴스 전제.

**Tech Stack**: NestJS 11, Next.js 16, Prisma 6 (PostgreSQL 17), rxjs, `@microsoft/fetch-event-source`, Radix UI Sheet, Zustand, Tailwind, Lucide, Zod, Vitest.

**Spec**: `docs/superpowers/specs/2026-04-15-panel-live-ops-design.md`

---

## PR Structure (Strangler Fig)

PR을 4개 shippable 단위로 분리 (v3에서 PR2를 PR2a/PR2b로 재분할):

| PR | 제목 | 목표 | 범위 | 예상 |
|----|------|------|------|------|
| **PR1** | Foundations + Workflow MVP | SSE 파이프라인 + workflow source 하나로 end-to-end 검증 | Task 1-14 (ADR, Prisma, shared, backend infra, workflow adapter + hook, frontend client+store+Sheet, Sidebar integration, Error Boundary, Header 삭제, integration test) | 1~2일 |
| **PR2a** | Async Run Sources (agent + image) | ADR-0011 canonical pass-through로 agent/image source 추가 + actor 마이그레이션 | Task 15a-20 (HeartbeatRun/ThumbnailGeneration triggeredByUserId 마이그레이션, PanelRunItem phase/failureType 확장, 두 adapter + 도메인 hook, 통합 테스트) | 1일 |
| **PR2b** | Alert Source + My/Team UI Split | Alert source + 새 PanelAlertItem kind + 내/팀 split UI | Task 21-26 (PanelAlertItem 타입, alert adapter, Rules service `createManyAndReturn` hook, PanelSheet 내/팀 split, AlertRow + PanelItemRow union, 통합 테스트) | 1일 |
| **PR3** | Alert Promote + Action Board Filter | Alert → ActionTask 승격 + 내/팀/전체 필터 + claim/unclaim | Task 27-33 (Prisma 추가 migration, promote service/controller, Action Board UI, PromoteToTaskModal) | 1일 |

각 PR은 **standalone shippable** — PR1 merge 후 PR2a 전까지 dogfood 가능.

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

## PR2a — Async Run Sources (Agent + Image)

### PR2a Overview

PR1 + ADR-0011 Phase 1/2/3 머지 후 진행. **HeartbeatRun / ThumbnailGeneration 모두 canonical status + sub-state(`failureType` / `phase`) 컬럼을 이미 보유한다는 것이 PR2a의 핵심 전제** — adapter는 status를 매핑하지 않고 그대로 통과시키며, sub-state는 별도 필드로 노출한다 (ADR-0011 Rule 4).

추가 범위:
1. **Schema migration** — `triggeredByUserId String? @db.Uuid` 추가 (HeartbeatRun + ThumbnailGeneration). PR1 Task 2 패턴 재사용. my/team split이 workflow 외 source까지 의미 있도록.
2. **PanelRunItem 확장** — `phase?` (image), `failureType?` (heartbeat) 옵셔널 필드 추가. workflow item은 둘 다 null.
3. **agent source** — HeartbeatRun + AgentDefinition.name join. canonical status pass-through.
4. **image source** — ThumbnailGeneration. **`method='generate'`와 `method='edit'` 모두 포함** (사용자 관점에선 동일한 "이미지 작업"). canonical status pass-through, phase는 별도 필드, method는 details에 포함해 row label 차별화.
5. **Integration test** — 3 source(workflow/agent/image) 동시 emit, canonical pass-through 회귀, EventEmitter 와이어링 smoke (duplicate emitter trap 회귀 방지).

### PR2a File Structure

**Prisma (prisma/)**:
- `schema.prisma` — `HeartbeatRun.triggeredByUserId String? @db.Uuid` + `@@index([companyId, triggeredByUserId])`. ThumbnailGeneration 동일.
- `migrations/<timestamp>_panel_actor_user_id/migration.sql`
- `init.sql.gz` 갱신 (prisma/CLAUDE.md 절차)

**Shared (packages/shared/src/panel/)**:
- `types.ts` — `PanelRunItem`에 `phase: z.string().nullable().optional()`, `failureType: z.string().nullable().optional()` 추가 (typed union으로 조이지 말 것 — 도메인별 sub-state 어휘는 owner 도메인 책임)
- `sources.ts` — `PANEL_RUN_SOURCES = ['workflow', 'agent', 'image'] as const`

**Backend (apps/server/src/panel/)**:
- `adapters/agent.adapter.ts` + `__tests__/agent.adapter.spec.ts`
- `adapters/image.adapter.ts` + `__tests__/image.adapter.spec.ts`
- `adapters/registry.ts` — agent + image 등록
- `panel.service.ts` — backfill 쿼리에 agent + image 추가

**Backend domain hooks (writer 사이트별 emit 추가)**:
- `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts` — Phase 2 머지 시 식별된 transition site
- `apps/server/src/agent-registry/wakeup/...` — wakeup-claim writer (impl 시 grep으로 정확한 파일 확정)
- `apps/server/src/products/thumbnails/thumbnail-generation.service.ts` — Phase 3 머지 시 5 sites
- `apps/server/src/products/thumbnails/thumbnail-edit.service.ts` — Phase 3 머지 시 8 sites + apply-path

### PR2a Task list

- **Task 15a — Prisma migration: triggeredByUserId on HeartbeatRun + ThumbnailGeneration**
  - 두 모델에 `triggeredByUserId String? @db.Uuid`, User back-relation 옵셔널 (PR1 Task 2 패턴), `@@index([companyId, triggeredByUserId])`.
  - Backfill: 기존 행은 NULL 허용. 신규 writer가 `@CurrentUser`에서 채움 (없으면 NULL).
  - Writer call site 갱신: 두 도메인 service의 create 지점 모두 (PR2a Task 17/19에서 이어짐).
  - 검증: `prisma migrate dev`, `prisma generate`, shared `npm run build`, `dev:server` boot 성공.
  - init.sql.gz 갱신.

- **Task 15b — Shared PanelRunItem 확장 + sources 등록**
  - `PanelRunItemSchema`에 `phase: z.string().nullable().optional()` + `failureType: z.string().nullable().optional()` 추가.
  - `PANEL_RUN_SOURCES`에 `'agent'`, `'image'` 추가.
  - **z.enum으로 sub-state 조이지 말 것** — 도메인별 어휘는 owner가 책임 (ADR-0011 Rule 3).
  - workflow adapter regression: 두 필드 모두 undefined로 통과해도 type/test 모두 OK 검증.

- **Task 16 — agent.adapter.ts (canonical pass-through)**
  - 입력 shape: `{ run: HeartbeatRun, agent: { id: string; name: string } }` (service가 join 해서 넘김).
  - 출력 `PanelRunItem`: `kind:'run'`, `source:'agent'`, **`status: run.status`** (그대로), `failureType: run.failureType`, `phase: null`, `title: agent.name`, `triggeredByUserId: run.triggeredByUserId`, companyId는 envelope 책임.
  - **Status 매핑 테이블 금지** (ADR-0011 Rule 4). 알 수 없는 status는 throw — drift detector 역할.
  - Test:
    - 5 canonical statuses(`pending|running|succeeded|failed|cancelled`) 각각 통과.
    - `failureType: 'timeout'` payload 통과.
    - `status: 'queued'` 같은 비-canonical 입력 시 throw.
  - registry 등록.

- **Task 17 — Heartbeat service hook (모든 writer 사이트 emit)**
  - **Writer 사이트 식별 (impl 시점 grep + 결과 명시)**:
    1. `heartbeat.service.ts` — start/finish/timeout 전이 (Phase 2 ADR-0011 commit `5ed570d`에서 식별된 라인 333/395/456 부근)
    2. wakeup claim → pending → running 전이
    3. result-cleanup / compressor — failure 후처리 사이트
  - 각 writer가 status 변경 후: `eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId })` 호출.
  - **`EventEmitter2` global inject (AppModule)** — agent-registry module이 `EventEmitterModule.forRoot()` 로컬 import 안 하는지 확인 (CRITICAL — duplicate emitter trap, PR1 CRITICAL #7 재현 방지).
  - companyId는 envelope에만, item에서 strip은 PR1 PanelSseService 책임 (재확인).
  - Emit 빈도 정책: terminal transition(`succeeded|failed|cancelled`)만 emit (chatty agent로 ring buffer flush 방지). running 진입은 emit O, running 유지 중간 update는 emit X.
  - Test: 각 transition 별 spec, `eventEmitter.emit` 호출 횟수 + payload shape assertion.

- **Task 18 — image.adapter.ts (canonical + phase pass-through)**
  - 입력 shape: `{ generation: ThumbnailGeneration, product: { id: string; title: string } }` (service가 product까지 join).
  - 출력: `kind:'run'`, `source:'image'`, **`status: generation.status`**, **`phase: generation.phase`** (별도 필드), `failureType: null`, `title: product.title`, `triggeredByUserId: generation.triggeredByUserId`, `details: { method: generation.method }`.
  - **method='generate'와 'edit' 모두 in-scope** (이유: 사용자 관점 동일 작업, UI는 method 라벨로 차별화). 정책 결정은 plan에 명시 — silent filter 금지.
  - **Status 매핑 금지** (ADR-0011 Rule 4). Phase는 sub-state 컬럼 그대로.
  - Test:
    - 5 canonical statuses + 3 phase 값(`generating|ready|applied`) + null phase.
    - method 두 종류 fixture (generate/edit) 모두 emit 확인.
  - registry 등록.

- **Task 19 — ThumbnailGeneration service hook (모든 writer 사이트 emit)**
  - **Writer 사이트 (impl 시점 grep, Phase 3 ADR-0011 commit `83b9641` 기준 참조)**:
    1. `thumbnail-generation.service.ts` — generate-path (5 sites)
    2. `thumbnail-edit.service.ts` — edit-path (8 sites)
    3. `markApplied` (apply-path, saveEditorResult 등)
  - Emit policy: **status 변화 OR phase 변화 시 emit**. status `running` 유지하면서 phase `generating → ready` 전이도 panel update.
  - 동일하게 `EventEmitter2` global inject. products module의 EventEmitter scoping 점검.
  - Test:
    - phase-only change emit 검증.
    - status + phase 동시 변화 시 단일 emit (중복 안 되는지).

- **Task 20 — PR2a integration test**
  - `Test.createTestingModule` 베이스 (PR1 Task 14 패턴 재사용).
  - 시나리오:
    1. **3 source 동시 emit** — WorkflowRun + HeartbeatRun + ThumbnailGeneration 각각 emit → 1 stream에 모두 도달, seq 단조 증가.
    2. **Canonical status pass-through 회귀** — adapter가 status 그대로 흘리는지 (mapping 부활 방지). status `succeeded` 들어오면 stream에도 `succeeded`로 도달.
    3. **EventEmitter wiring smoke** — agent-registry / products module에서 emit한 이벤트가 Panel stream 컨슈머에 도달 (duplicate emitter trap 회귀 방지).
    4. **Actor-null fallback** — `triggeredByUserId: null`인 row → envelope에서 actor 식별 불가 → my/team split에서 '팀'으로 분류 (PR2b에서 검증).
    5. **Phase change emit** — image source에서 status 안 바뀌고 phase만 바뀐 emit 도달.
    6. **Subscriber leak 카운트** — `Test.createTestingModule` cycle 반복 시 listener count 증가 없음 (PR1 AbortController leak lesson).

### PR2a 검증

- `prisma migrate dev` + `prisma generate` 성공
- shared `npm run build` 성공
- `npm run dev:server` boot 성공 (DI 검증 — NestJS DI 에러는 tsc/vitest로 안 잡힘)
- Vitest pass + Task 20 integration test pass
- init.sql.gz 갱신 완료

---

## PR2b — Alert Source + My/Team UI Split

### PR2b Overview

PR2a 검증 후 진행. Alert는 새로운 `PanelItem` kind이고 my/team UI split이 동시에 추가되므로 별도 PR로 분리해서 blast radius 축소. PR2a로 actor 마이그레이션이 끝났기에 my/team split이 workflow + agent + image 3 source에서 의미 있음. Alert는 actor 컬럼 자체가 없어 항상 '팀'(설계상).

추가 범위:
1. **PanelAlertItem 타입** — shared 신규, 필드 enumeration + Prisma `Alert` `satisfies` 패턴.
2. **alert source** — Alert 모델 → PanelAlertItem.
3. **Rules service hook** — `createManyAndReturn` (Prisma 7.5+) 사용. 시간창 race-prone 패턴 명시적 폐기.
4. **PanelSheet 내/팀 split UI** — `actorUserId === currentUserId ? '내' : '팀'`. 4 source 모두 처리.
5. **AlertRow + PanelItemRow** — discriminated union 분기.

### PR2b File Structure

**Shared**:
- `packages/shared/src/panel/types.ts` — `PanelAlertItemSchema` + `PanelItem = PanelRunItem | PanelAlertItem` + `PANEL_ITEM_KINDS = ['run', 'alert'] as const`

**Backend (apps/server/src/panel/)**:
- `adapters/alert.adapter.ts` + spec
- `adapters/registry.ts` — alert adapter는 별도 alert registry로 분리 (run-source registry와 의미 다름)
- `panel.service.ts` — backfill에 alert 쿼리 추가

**Backend domain hooks**:
- alert 생성 위치 (impl 시점 grep — `apps/server/src/alerts/` 또는 `apps/server/src/products/services/rules*.service.ts` 등 RulesEngine 위치 확정)

**Frontend (apps/web/src/components/panel/)**:
- `PanelAlertRow.tsx` + spec
- `PanelItemRow.tsx` — discriminated union 분기
- `PanelSheet.tsx` — partition by actor (내 작업 / 팀 sections)

### PR2b Task list

- **Task 21 — Shared PanelAlertItem schema (필드 명시 + drift detection)**
  - 필드 enumeration:
    ```typescript
    export const PanelAlertItemSchema = z.object({
      kind: z.literal('alert'),
      id: z.string().uuid(),
      severity: z.string(),     // Alert.severity 실제 값 set은 impl 시점 grep — 평면 string 유지
      type: z.string(),         // 평면 string. 'internal:rules' 같은 namespacing 미스코프(future ADR)
      title: z.string(),
      message: z.string().nullable(),
      productId: z.string().uuid().nullable(),
      isRead: z.boolean(),
      actorUserId: z.string().uuid().nullable(),  // Alert는 actor 컬럼 없음 → 항상 null (PR2b 한정)
      createdAt: z.string().datetime(),
    });
    export type PanelAlertItem = z.infer<typeof PanelAlertItemSchema>;
    ```
  - **`satisfies` drift detection** — Prisma `Alert` 필드와 PanelAlertItem 필드 매핑이 컴파일 타임 보장 (packages/shared/CLAUDE.md 패턴).
  - `PanelItem = PanelRunItem | PanelAlertItem` discriminated union.
  - Test: 필드 valid/invalid + drift assertion (Prisma 필드 누락 시 컴파일 에러).

- **Task 22 — alert.adapter.ts**
  - 입력: `Alert` (Prisma 그대로)
  - 출력: `PanelAlertItem` (severity/type/title/message/productId/isRead/createdAt 통과, `actorUserId: null`)
  - 별도 alert registry 등록 (`alertPanelAdapters`).
  - Test: 모든 severity 값(impl 시점 Alert.severity 분포 grep 후 fixture) + null productId.

- **Task 23 — Rules service hook (`createManyAndReturn` 사용)**
  - **`createMany` + 시간창 패턴 명시적 폐기 이유**: race-prone — 동시 실행 rules eval 간 cross-batch contamination, clock skew, slow insert 시 cutoff 누락.
  - **Prisma 7.5+ `createManyAndReturn`** 사용 (apps/server prisma `^7.5.0`).
  - Pseudocode:
    ```typescript
    const inserted = await this.prisma.alert.createManyAndReturn({ data: payloads });
    for (const alert of inserted) {
      const item = alertAdapter.mapToItem(alert);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId: alert.companyId });
    }
    ```
  - **Per-batch cap** — 50개 초과 시 단일 summary alert(`title: '${count}건의 새 알림'`)로 응축 emit. SSE flood + ring buffer flush 방지 (PR1 lesson).
  - **EventEmitter2 global inject** + 모듈 scoping 재점검.
  - Test:
    1. 정상 batch — N rows insert → N emit (또는 cap 초과 시 1 summary emit).
    2. **Concurrent rules eval no-contamination** — 두 rules eval 동시 실행 시 각자의 IDs만 emit.
    3. **Partial-emit failure** — emit 중 throw해도 alert insert는 commit 유지 (transactional consistency 명시).

- **Task 24 — PanelSheet 내/팀 split UI**
  - Section header: "내 작업" / "팀"
  - Partition rule:
    - workflow + agent + image: `actorUserId === currentUserId ? '내' : '팀'`. null이면 '팀'.
    - alert: 항상 '팀' (설계상 actor 없음).
  - "팀 공유" 뱃지: actorUserId가 다른 사용자이면서 현재 사용자가 follower 컨텍스트일 때 (UI v3 mockup 따름).
  - 빈 섹션 처리: '내 작업' 0건일 때 placeholder ("진행 중인 내 작업이 없습니다").
  - Test (react-testing-library):
    1. workflow 내 + agent 팀 + alert 팀 — 섹션 분기 정확.
    2. actor null인 workflow row → '팀'.
    3. 모두 0건 → empty state.

- **Task 25 — AlertRow + PanelItemRow union 분기**
  - `PanelAlertRow.tsx` — severity별 색상 (DESIGN.md Tailwind palette 따름). info/warning/error/critical 단계.
  - `PanelItemRow.tsx`:
    ```tsx
    if (item.kind === 'run') return <PanelRunRow item={item} />;
    if (item.kind === 'alert') return <PanelAlertRow item={item} />;
    return null; // exhaustive check (TS never assertion)
    ```
  - hover action(promote 버튼)는 PR3에서 — PR2b는 read-only.

- **Task 26 — PR2b integration test**
  - 4 source(workflow/agent/image/alert) 동시 emit → 단일 stream 도달.
  - **My/team split 정확성** — actor 매칭/null/alert 각각.
  - **Concurrent rules eval no-contamination** (Task 23 검증 재차).
  - **Partial-emit failure** semantics 확인.
  - Subscriber leak 카운트 회귀 확인.

### PR2b 검증

- shared build + dev:server boot
- 4-source integration test pass
- React component test pass
- DESIGN.md 색상/스페이싱 준수 (Tailwind class)

### PR2 (a + b) 공통 주의사항

- **ADR-0011 Rule 4 — 매핑 테이블 금지**: Adapter는 source canonical status를 그대로 통과시킨다. Sub-state는 별도 필드(`failureType`/`phase`).
- **EventEmitter scoping**: 모든 신규 도메인 모듈이 `EventEmitterModule.forRoot()`를 로컬 import하지 않는지 확인 (AppModule 전역 1회). PR1 CRITICAL #7 재현 방지.
- **NestJS DI boot 검증**: 모듈/서비스 추가 후 `npm run dev:server`로 boot 확인 (tsc/vitest로 DI 에러 안 잡힘).
- **No follow-up issues**: writer 사이트 모두 instrument. 1 site 누락 = panel 무시 버그 (PR1 lesson).
- **CLAUDE.md 도메인 규칙 준수**: 각 task dispatch 시 해당 도메인의 CLAUDE.md를 subagent에게 명시 (apps/server/src/agent-registry/CLAUDE.md 등).

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

- **Task 27 — Prisma migration + PanelAlertItem shared 확장**

  Schema (`prisma/schema.prisma`):
  ```prisma
  model Alert {
    // ... 기존 필드 유지
    actionTaskId String?     @map("action_task_id") @db.Uuid
    actionTask   ActionTask? @relation("AlertPromotedTo", fields: [actionTaskId], references: [id], onDelete: SetNull)
    @@index([companyId, actionTaskId])  // reverse lookup + partial-ish
  }

  model ActionTask {
    // ... 기존 필드 유지
    assigneeUserId String?  @map("assignee_user_id") @db.Uuid
    assigneeUser   User?    @relation("ActionTaskAssignee", fields: [assigneeUserId], references: [id], onDelete: SetNull)
    sourceAlerts   Alert[]  @relation("AlertPromotedTo")  // back-relation for getSourceAlert
    @@index([companyId, assigneeUserId])  // me/team list query
  }

  model User {
    // ... 기존 back-relations (triggeredWorkflowRuns 등)
    assignedActionTasks ActionTask[] @relation("ActionTaskAssignee")  // verb-first convention
  }
  ```

  **중요 — taskKey 충돌 해결 (CRITICAL #1)**: `ActionTask @@unique([companyId, taskKey, date])` 기존 제약. `taskKey: 'promoted:${alert.id}'` 형식으로 두면 같은 alert 같은 날 동시 promote 시 `create`가 P2002 unique violation throw (plan 원래 race guard 전에). 해결: `taskKey: 'promoted:${alert.id}'` 유지하되 Task 26에서 P2002 catch (아래 참조). `@@unique`는 그대로 두 번째 방어선 역할.

  **ADR-0011 scope 명시**: `ActionTask.status` 어휘(`pending | active | done`)는 **business-task vocab으로 ADR-0011 governed 아님**. 건드리지 않음.

  Shared (`packages/shared/src/panel/types.ts`):
  - `PanelAlertItemSchema`에 `actionTaskId: z.string().uuid().nullable()` 필드 추가.
  - Backward-compat: adapter는 `alert.actionTaskId ?? null` pass-through.

  Adapter (`apps/server/src/panel/adapters/alert.adapter.ts`):
  - `alertPanelAdapter.mapToItem`: `actionTaskId: alert.actionTaskId ?? null` 추가.

  Steps:
  - [ ] schema.prisma 수정 + `npm run db:push` + `npx prisma generate`
  - [ ] init.sql.gz 갱신 (prisma/CLAUDE.md 절차)
  - [ ] shared build (ESM + CJS + DTS)
  - [ ] PanelAlertItemSchema tests 확장 (actionTaskId null/uuid 양쪽)
  - [ ] alert.adapter.spec 업데이트 (actionTaskId surface 확인)
  - [ ] `dev:server` boot 검증

  Commit: `feat(db,shared): add Alert.actionTaskId + ActionTask.assigneeUserId + PanelAlertItem.actionTaskId (Task 27)`.

- **Task 28 — Promote service (atomic, emit OUTSIDE $transaction)**

  파일: `apps/server/src/alerts/alerts.service.ts` 또는 `apps/server/src/panel/promote.service.ts` (도메인 주인 판단 — impl 시 grep으로 현재 alert 관리 위치 확인).

  ```typescript
  async promote(
    alertId: string,
    companyId: string,
    dto: PromoteDto,
    currentUserId: string,
  ): Promise<{ task: ActionTask; updatedAlert: Alert }> {
    // $tx 안에서는 DB 작업만. emit은 밖으로.
    const result = await this.prisma.$transaction(async (tx) => {
      const alert = await tx.alert.findFirst({ where: { id: alertId, companyId } });
      if (!alert) throw new NotFoundException('Alert not found');
      if (alert.actionTaskId) throw new ConflictException('Already promoted');

      // P2002 catch — @@unique([companyId, taskKey, date]) 위반 시 race로 번역
      let task: ActionTask;
      try {
        task = await tx.actionTask.create({
          data: {
            companyId,
            taskKey: `promoted:${alert.id}`,
            type: 'human',
            label: alert.title,
            detail: alert.message ?? null,
            priority: dto.priorityOverride ?? mapSeverityToPriority(alert.severity),
            role: dto.roleOverride ?? mapAlertTypeToRole(alert.type),
            status: 'pending',
            date: kstDayStart(new Date()),
            assigneeUserId: null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Already promoted (race)');
        }
        throw err;
      }

      // atomic guard — companyId scope 포함 (멀티테넌트 IDOR 방지)
      const { count } = await tx.alert.updateMany({
        where: { id: alertId, companyId, actionTaskId: null },
        data: { actionTaskId: task.id },
      });
      if (count === 0) {
        // 극단 race: P2002 안 터지고 updateMany만 실패한 경우
        await tx.actionTask.delete({ where: { id: task.id } });
        throw new ConflictException('Already promoted (race)');
      }

      return { task, updatedAlert: { ...alert, actionTaskId: task.id } };
    });

    // emit은 $transaction 밖 — commit 후 subscriber가 일관된 상태 관찰
    try {
      const item = alertPanelAdapter.mapToItem(result.updatedAlert);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId });
    } catch (err) {
      this.logger.warn('Panel emit failed', err);
    }

    return result;
  }
  ```

  Helpers (같은 파일 또는 `apps/server/src/alerts/mappers.ts`):
  ```typescript
  const SEVERITY_TO_PRIORITY: Record<string, 'urgent' | 'high' | 'medium'> = {
    critical: 'urgent',
    error: 'high',
    warning: 'medium',
    info: 'medium',
  };
  function mapSeverityToPriority(sev: string): 'urgent' | 'high' | 'medium' {
    return SEVERITY_TO_PRIORITY[sev] ?? 'medium';
  }

  // alertType → role: null 폴백 (ActionTask.role nullable)
  const ALERT_TYPE_TO_ROLE: Record<string, string> = {
    // impl 시점에 grep으로 Alert.type 분포 확인 후 채움
    // 예: 'low_ctr' → 'ad', 'inventory_low' → 'inventory'
  };
  function mapAlertTypeToRole(type: string): string | null {
    return ALERT_TYPE_TO_ROLE[type] ?? null;
  }
  ```

  Tests (race):
  - `Promise.all([promote(alertId, ...), promote(alertId, ...)])` — exactly 1 resolves, 1 rejects with `ConflictException`.
  - **실제 Postgres 테스트 DB 사용** (SQLite in-memory는 단일 connection으로 serialized되어 race 재현 안 됨).
  - Emit이 commit 후에만 발생 — transaction rollback 시 emit 안 됨 assertion.

  Commit: `feat(panel): alert promote service with atomic race guard + severity/role mapping (Task 28)`.

- **Task 29 — Promote + Dismiss controllers**

  파일: `apps/server/src/alerts/alerts.controller.ts` (또는 panel.controller 확장 — 현재 controller 위치 grep).

  ```typescript
  @Controller('panel/alerts')  // 또는 기존 AlertsController 확장
  export class AlertsController {
    // POST /api/panel/alerts/:id/promote
    @Post(':id/promote')
    async promote(
      @Param('id') id: string,
      @CurrentCompany() companyId: string,
      @CurrentUser() user: AuthUser,
      @Body() dto: PromoteDto,
    ) {
      const { task } = await this.alerts.promote(id, companyId, dto, user.id);
      return { task };
    }

    // POST /api/panel/alerts/:id/dismiss
    @Post(':id/dismiss')
    async dismiss(
      @Param('id') id: string,
      @CurrentCompany() companyId: string,
    ) {
      // isRead=true + PANEL_EVENTS.DISMISS emit (not REMOVE — 24h window 내에선 계속 보임)
      await this.alerts.markRead(id, companyId);
      return { ok: true };
    }
  }
  ```

  PromoteDto (class-validator — apps/server/CLAUDE.md 규칙):
  ```typescript
  export class PromoteDto {
    @IsOptional() @IsIn(['urgent', 'high', 'medium']) priorityOverride?: string;
    @IsOptional() @IsString() roleOverride?: string;
    @IsOptional() @IsString() @MaxLength(500) note?: string;
  }
  ```

  Dismiss semantics: `isRead=true` DB update + **`PANEL_EVENTS.DISMISS` emit** (PR1 Task 3에서 이미 wire shape `{itemId}` 정의됨, IMPORTANT #2). Client는 DISMISS 받으면 store에서 제거.

  Commit: `feat(panel): promote + dismiss controllers with companyId scope (Task 29)`.

- **Task 30 — PromoteToTaskModal (frontend)**

  파일: `apps/web/src/components/panel/PromoteToTaskModal.tsx`.

  - Radix `<Dialog>` (apps/web/CLAUDE.md Radix 사용 규약).
  - Props: `alert: PanelAlertItem`, `open: boolean`, `onClose: () => void`.
  - Form: priorityOverride (select, 기본값 = `mapSeverityToPriority(alert.severity)` 표시), roleOverride (input, optional), note (textarea, optional, maxLen 500).
  - `useMutation`: `apiClient.post('/panel/alerts/${alert.id}/promote', dto)`.
  - onSuccess:
    - `queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.all })` (Action Board reload)
    - Panel은 SSE로 자동 upsert (actionTaskId 붙은 alert re-emit)
    - `toast.success('할 일 목록에 추가했습니다')`
    - `onClose()`
  - onError (409):
    - `toast.error('이미 할 일로 등록된 알림입니다')`
    - `onClose()` — state 이미 서버와 일치

  Commit: `feat(panel): PromoteToTaskModal with Radix Dialog + useMutation (Task 30)`.

- **Task 31 — PanelAlertRow hover action + linked state**

  파일: `apps/web/src/components/panel/PanelAlertRow.tsx` (PR2b에서 read-only로 생성됨 — 확장).

  - Wrapper에 `group` 클래스 추가.
  - 버튼 슬롯: `className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition"` — **hover뿐 아니라 keyboard focus에서도 노출** (a11y, 리뷰어 지적 MAJOR #9).
  - 조건부 렌더:
    - `alert.actionTaskId == null` → "할일로 만들기" 버튼 (클릭 → PromoteToTaskModal 열기, stopPropagation).
    - `alert.actionTaskId != null` → "← 할 일 목록에 있음" 뱃지 (linked state, non-clickable 또는 링크로 Action Board로).
  - `aria-label="할 일로 만들기"` 버튼에 부여.
  - 테스트: actionTaskId null/string 양쪽 렌더 + 클릭 시 onPromote 호출 (mock) + linked state 뱃지 렌더 확인.

  Commit: `feat(panel): PanelAlertRow hover action + linked state with focus-within a11y (Task 31)`.

- **Task 32 — ActionTask service 확장 (claim/unclaim atomic + list + getSourceAlert batch)**

  파일: `apps/server/src/action-task/action-task.service.ts` (기존 확장).

  ```typescript
  async claim(taskId: string, companyId: string, userId: string) {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, companyId, assigneeUserId: null },
      data: { assigneeUserId: userId },
    });
    if (count === 0) throw new ConflictException('Already claimed or task not found');
    return this.prisma.actionTask.findFirstOrThrow({ where: { id: taskId, companyId } });
  }

  async unclaim(taskId: string, companyId: string, userId: string) {
    // 본인 것만 해제 가능 — B가 A 것 해제 못 함
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, companyId, assigneeUserId: userId },
      data: { assigneeUserId: null },
    });
    if (count === 0) throw new ConflictException('Not assigned to you or task not found');
    return this.prisma.actionTask.findFirstOrThrow({ where: { id: taskId, companyId } });
  }
  ```

  List filter semantics:
  ```typescript
  async list(
    companyId: string,
    currentUserId: string,
    assignedTo: 'me' | 'team' | 'all',
  ) {
    const where: Prisma.ActionTaskWhereInput = { companyId };
    if (assignedTo === 'me') {
      where.assigneeUserId = currentUserId;
    } else if (assignedTo === 'team') {
      // 누군가 담당하되 내가 아닌 경우
      where.AND = [
        { assigneeUserId: { not: null } },
        { assigneeUserId: { not: currentUserId } },
      ];
    }
    // 'all' = filter 없음

    const tasks = await this.prisma.actionTask.findMany({
      where,
      include: { assigneeUser: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { date: 'desc' }],
    });

    // getSourceAlert batch-load (N+1 방지)
    const taskIds = tasks.map((t) => t.id);
    const sourceAlerts = await this.prisma.alert.findMany({
      where: { companyId, actionTaskId: { in: taskIds } },
      select: { id: true, actionTaskId: true, severity: true, type: true, title: true },
    });
    const alertByTaskId = new Map(sourceAlerts.map((a) => [a.actionTaskId!, a]));

    return tasks.map((t) => ({
      ...t,
      sourceAlert: alertByTaskId.get(t.id) ?? null,
    }));
  }
  ```

  Tests:
  - claim race: `Promise.all([claim(taskId, A), claim(taskId, B)])` — exactly 1 succeeds.
  - unclaim authorization: A claim → B unclaim → 409.
  - list `me|team|all` 분기 검증 + batch-load (N+1 없음 assertion via spy).

  Commit: `feat(action-task): claim/unclaim atomic + me/team/all list + sourceAlert batch-load (Task 32)`.

- **Task 33 — ActionTaskController 확장**

  파일: `apps/server/src/action-task/action-task.controller.ts` (기존 `@Controller('action-tasks')` 확장 — 새 controller 아님).

  ```typescript
  // PATCH /api/action-tasks/:id/claim
  @Patch(':id/claim')
  async claim(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) { return this.service.claim(id, companyId, user.id); }

  @Patch(':id/unclaim')
  async unclaim(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
  ) { return this.service.unclaim(id, companyId, user.id); }

  // GET /api/action-tasks?assignedTo=me|team|all
  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListActionTasksDto,
  ) { return this.service.list(companyId, user.id, query.assignedTo ?? 'all'); }
  ```

  ListActionTasksDto:
  ```typescript
  export class ListActionTasksDto {
    @IsOptional() @IsIn(['me', 'team', 'all']) assignedTo?: 'me' | 'team' | 'all';
  }
  ```

  Commit: `feat(action-task): claim/unclaim endpoints + assignedTo filter (Task 33)`.

- **Task 34 — Action Board UI 확장 (기존 페이지 수정)**

  파일: `apps/web/src/app/action-board/page.tsx` (기존 존재 — 새 생성 아님).

  - **URL param `?scope=me|team|all`** — Next.js `useSearchParams` 훅으로 읽음. 기본값 `all`.
  - SegmentedControl: `@radix-ui/react-tabs` 사용 (DESIGN.md primitive 따름, 이미 package.json에 있음). 기존 `VIEW_TABS` (status/role/priority) 패턴 재사용 — **cross-cutting filter로 컨트롤 바 별도 row에 배치** (view axis 아님).
  - 카드에 assignee 표시: `task.assigneeUser?.name ?? '(미담당)'` + "내가 맡기" / "해제" 버튼 (assigneeUserId === currentUserId면 해제, 아니면 맡기).
  - "← from alert" 뱃지: `task.sourceAlert != null`이면 severity별 색상으로 뱃지 렌더 (PanelAlertRow severity 색 재사용).
  - claim/unclaim `useMutation` → `invalidateQueries(queryKeys.actionTasks.all)`.

  Shared types 업데이트 (`packages/shared/src/schemas/action-task.ts` 존재 시 확장, 없으면 신규):
  - `assigneeUserId: string | null`
  - `assigneeUser?: { id: string; name: string } | null`
  - `sourceAlert?: { id: string; severity: string; type: string; title: string } | null`

  Commit: `feat(action-board): scope filter + assignee display + from-alert badge (Task 34)`.

- **Task 35 — PR3 integration test**

  파일: `apps/server/src/panel/__tests__/panel-pr3.integration.spec.ts`.

  Real `EventEmitter2` + `PanelSseService` + mocked Prisma (또는 test Postgres for race tests). 시나리오:

  1. **Promote emit** — `promote(alertId, co, dto, uid)` 호출 → PanelSseService stream에 UPSERT 이벤트 도달, `item.actionTaskId` 값이 새 task.id와 일치.
  2. **Promote race** — `Promise.all([promote, promote])` → exactly 1 resolves, 1 rejects `ConflictException`. DB state 검증: alert에 actionTaskId 단 1번만 세팅, ActionTask도 단 1건.
  3. **Dismiss emit** — `dismiss(alertId, co)` → `PANEL_EVENTS.DISMISS` emit with `{itemId: alertId}`.
  4. **Claim atomic** — claim race 동일 패턴.
  5. **list(me|team|all)** filter 분기 + sourceAlert join.
  6. **No N+1** — `list()` 호출 시 `prisma.alert.findMany` 호출 횟수 ≤ 1 (vi.spyOn).

  Real Postgres 필수: SQLite memory는 단일 connection serialized로 race 재현 불가.

  Commit: `test(panel): PR3 integration test — promote/claim race + list filter + dismiss (Task 35)`.

### PR3 공통 주의사항

- **모든 mutation where clause에 `companyId` 포함** — apps/server/CLAUDE.md IDOR 방지 규칙.
- **EventEmitter2 global inject** — PR2a Task 17 수정으로 `agent-registry.module.ts`의 로컬 `forRoot()` 제거됨. alerts module도 `EventEmitterModule.forRoot()` 로컬 import 없이 inject (AppModule 전역 1회).
- **emit은 $transaction commit 후**. PR1 regression class 패턴 재발 방지.
- **No follow-up issues** — writer 사이트 모두 instrument 완료 확인. 빈 사이트 = bug.
- **CLAUDE.md 도메인 규칙 준수** — subagent dispatch 시 명시 (apps/server/src/action-task/ 경로 전체 CLAUDE.md 없을 가능성, 있으면 필독).
- **`dev:server` boot 검증** — 새 service/controller 추가마다. NestJS DI 에러는 tsc/vitest로 안 잡힘.
- **prisma/init.sql.gz 갱신** — Task 27 schema 변경 시 필수 (prisma/CLAUDE.md 절차).

### PR3 numbering note

v4에서 PR2b가 Task 21~26까지 썼기 때문에 PR3는 Task **27~35** (9 tasks) 로 재번호. 기존 plan이 25~33이었던 건 v2 시절 overlap. 본 섹션 번호를 정본으로.

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
- P10 (내/팀 UI): PR2a Task 15a (HeartbeatRun/ThumbnailGeneration actor 마이그레이션) + PR2b Task 24 (PanelSheet split UI). Alert는 설계상 actor 없음 → 항상 '팀'

### Critic CRITICALs 반영
| # | Critical | Fix 위치 |
|---|----------|---------|
| 1 | Prisma 필드 fiction | PR1 Task 5, PR2a Task 16/18 (실제 모델명 + join) |
| 2 | ThumbnailEdit → ThumbnailGeneration | PR2a Task 18 |
| 3 | `@CurrentUser('id')` invalid | PR1 Task 7 (controller), PR3 Task 31 |
| 4 | Promote race | **v4 supersede**: PR3 Task 28 — atomic updateMany + **P2002 catch**(`@@unique([companyId, taskKey, date])` 위반 번역) + emit **$transaction 밖**으로 이동. 원래 plan은 emit을 $tx 안에 넣어 uncommitted broadcast 위험. |
| 5 | createMany 패턴 | **v3 supersede**: PR2b Task 23 — `createManyAndReturn` (Prisma 7.5+) 사용. 시간창 re-query 패턴 폐기 (race-prone) |
| 6 | /api/users/me 부재 | PR1 Task 13 — useCurrentUserId 훅은 **AppLayout에서 필요 없음** (usePanelStream만 쓰고 server에서 @CurrentUser로 주입) |
| 7 | EventEmitterModule 중복 | PR1 Task 7 + PR2a Task 17/19, PR2b Task 23 — 모든 도메인 모듈 local forRoot import 금지, AppModule 전역 |
| 8 | MessageEvent 타입 + companyId 누수 | PR1 Task 4 (service가 companyId strip), Task 7 (@nestjs/common MessageEvent) |
| 9 | Seq reset 핸드셰이크 | PR1 Task 3 (PanelSnapshotEvent.resetClient), Task 7 (controller snapshot 선행), Task 10 (store handleSnapshot) |
| 10 | triggeredBy UUID mismatch | PR1 Task 2 (WorkflowRun.triggeredByUserId) + **v3 추가**: PR2a Task 15a (HeartbeatRun / ThumbnailGeneration.triggeredByUserId) |

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
| 1 | Partial index alert.actionTaskId | PR3 Task 27 — `@@index([companyId, actionTaskId])` on Alert + `@@index([companyId, assigneeUserId])` on ActionTask (me/team list query용). Prisma partial index 제한 대안으로 전체 인덱스. |
| 2 | Dismiss wire shape | PR1 Task 3 (PanelDismissEvent.itemId) |
| 3 | Sidebar exact lines | PR1 Task 13 — "line 429~510 부근 전체 교체" 명시 |
| 4 | Integration test hand-wavy | F4와 동일 → PR1 Task 14 |
| 5 | status enum per adapter | PR1 Task 5 (workflow VALID_STATUS set). **v3 supersede**: PR2a Task 16/18은 매핑 테이블 금지 — ADR-0011 Phase 2/3 머지로 source status가 이미 canonical. Adapter는 pass-through + 미지의 값은 throw (drift detector) |
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

**v2 → v3 전환 이유** (2026-04-16):
- PR1 머지 후 ADR-0011 Status Canonical Phase 1/2/3 **모두 머지됨** (`4e56289`/`5ed570d`/`83b9641`). HeartbeatRun / ThumbnailGeneration 모두 canonical status + sub-state(`failureType` / `phase`) 컬럼 보유. **v2 PR2 Task 16/18 매핑 테이블은 ADR-0011 Rule 4 직접 위반** — 삭제 필수.
- `critic` + `architect` (plan-eng-review 대체) 재실행 → 4 CRITICAL + 6 MAJOR 추가 발견. 주요 항목:
  - Task 22 `actorUserId === currentUserId` split이 4 source 중 3 source에 actor 필드 없어 75%가 무조건 '팀'. 마이그레이션이 사이드노트로 숨음.
  - Task 21 `createMany` + 시간창 re-query — race-prone + Prisma `createMany`는 ID 반환 안 해 "just-inserted IDs" 구현 불가능.
  - Task 18 `method='edit'` 필터가 default `'generate'` 행을 silent drop. Policy 미정.
  - PR2 section이 PR1 대비 detail 1/50 수준 — subagent가 writer 사이트 fabricate 우려.

**v3 수정 요점**:
- PR2 → **PR2a(async run sources) / PR2b(alert + my/team UI)** 로 재분할. Alert + 새 item kind + UI 변경이 동시에 landing하지 않도록 blast radius 축소.
- PR2a Task 15a: **HeartbeatRun + ThumbnailGeneration.triggeredByUserId 마이그레이션을 first-class task로 승격** (PR1 Task 2 패턴).
- PR2a Task 15b: `PanelRunItem`에 `phase?` / `failureType?` 옵셔널 필드 추가 (sub-state 노출).
- Task 16/18: **매핑 테이블 전면 삭제**. Canonical status pass-through + 미지의 값 throw (drift detector).
- Task 18: **`method='generate'` 포함 결정** — 사용자 관점 동일 작업. UI는 method 라벨로 차별화.
- Task 23 (PR2b): `createMany` → **`createManyAndReturn`** (Prisma 7.5+ 지원). 시간창 폐기 + per-batch cap(50) 명시.
- Task 17/19: Writer 사이트 명시적 enumeration (PR1 "companyId 미populate" 재현 방지). 각 site별 EventEmitter2 global inject + 모듈 scoping 점검.
- Task 21 (PR2b PanelAlertItem): 필드 enumeration + `satisfies` drift detection. Alert subType namespacing은 future ADR로 out-of-scope 명시.
- Task 24 (PR2b my/team split): Alert는 설계상 항상 '팀' (actor 컬럼 없음) 명시. 4 source 분기 규칙 enumerate.
- Task 20 (PR2a) / Task 26 (PR2b) 통합 테스트: canonical pass-through 회귀, EventEmitter wiring smoke, phase-only change, subscriber leak 카운트 회귀 추가.
- 공통 주의사항 섹션 추가 — ADR-0011 Rule 4, EventEmitter scoping, NestJS DI boot 검증, CLAUDE.md subagent 명시.

---

**v3 → v4 전환 이유** (2026-04-16, PR2 + hotfix 머지 후):
- PR3 section이 v3에서 PR1 수준 detail로 확장되지 않은 상태. subagent dispatch 시 fabricate 위험 (PR2b backfill gap 같은 패턴 재발).
- `critic` + `architect` 재실행 → 4 CRITICAL + 7 MAJOR + 4 MINOR 추가 발견:
  - **CRITICAL #1**: `ActionTask @@unique([companyId, taskKey, date])` vs plan의 `taskKey: 'promoted:${alert.id}'` — concurrent promote 시 P2002가 atomic guard보다 먼저. 원래 plan은 500 반환.
  - **CRITICAL #2**: `eventEmitter.emit`을 `$transaction` 콜백 **안**에서 호출 — commit 전 broadcast. PR1 class와 동일.
  - **CRITICAL #3**: `tx.actionTask.create` P2002 unhandled → 500.
  - **CRITICAL #4**: `PanelAlertItem` shared schema에 `actionTaskId` 필드 누락 — UI linked state 렌더 불가.
  - MAJOR: User back-relation 미명시, dismiss 시맨틱 미명시, list(team) 불명확, claim/unclaim atomicity 미스펙, severity→priority mapping 없음, Action Board 기존 페이지 green-field 가정 오류.

**v4 수정 요점**:
- Task 27~35 전체 재작성, 각 task가 PR1 수준 detail (schema block, code snippet, test spec, commit message).
- CRITICAL #1~3: P2002 catch + emit $transaction 밖.
- CRITICAL #4: Task 27 bundle에 `PanelAlertItemSchema` + `alertPanelAdapter` 패치 포함.
- MAJOR 전부: back-relation 이름 명시, dismiss = isRead+DISMISS emit, list(team) = `IS NOT NULL AND != currentUserId`, claim/unclaim atomic, severity→priority mapping table, Action Board 기존 페이지 확장 명시.
- Task 32 — `getSourceAlert` batch-load (N+1 방지).
- Task 35 — real Postgres 테스트 DB 필수.

---

## Execution Handoff

PR1 merged 2026-04-15. PR2 merged 2026-04-16 (#13 + hotfix #14).

**Subagent-driven development** 모드로 PR3 Task 27~35 순차 실행. 각 task 당 implementer → spec reviewer → code quality reviewer 2단계 리뷰. graphify query로 해당 도메인 CLAUDE.md 룰 주입.

진행 브랜치: `feat/panel-live-ops-pr3` (`origin/main` 기반).
