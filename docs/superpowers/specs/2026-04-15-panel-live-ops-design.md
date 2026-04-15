# Design: Panel — Live Ops Surface for Agent OS

**Date**: 2026-04-15
**Branch**: main (feature branch TBD)
**Author**: yhc125
**Status**: DRAFT — pending spec review
**Mode**: Builder / Intrapreneurship (kiditem internal Agent OS 완성도 높이기)
**Supersedes**: —
**Related**: `.gstack/projects/AgentFoundry-Labs-kiditem/yhc125-dev-design-20260413-135330.md` (Agent OS Phase 3 — 별개 축, 겹침 없음)

---

## Problem

kiditem에는 3개의 장기 실행 async 시스템이 있다 — Workflows, Agents (Claude CLI heartbeat), AI 이미지 편집. 현재 사용자 경험:

1. 작업을 trigger한 뒤 **"지금 진행 중"을 관찰할 방법이 없음**. 해당 페이지를 떠나면 "끝났나?" 확인 못 함.
2. 현재 알림 UI는 **비즈니스 알림(재고 부족, 마진 적자 등) 전용**. async run 추적 기능 없음.
3. Bell dropdown이 **두 군데에 중복 존재** — `apps/web/src/components/layout/Header.tsx`는 import 없음(dead code), `Sidebar.tsx`만 실제 렌더링.
4. `/action-board` 페이지는 **수동 작업(pending→active→done) 관리** 용도라 "시스템이 지금 뭐 돌리고 있나"와 궤가 다름.
5. 다수 운영자가 같이 쓰는 팀 시스템인데, **내가 트리거한 작업과 팀 차원의 이벤트를 구분하는 축이 없음**.

팀 현재 상태: 운영자는 workflow 실행한 뒤 수동으로 Network 탭이나 trace 페이지를 새로고침해서 확인 중. 시간 낭비 + 실패를 몇 분/몇 시간 뒤에야 인지.

## Goal

오른쪽에서 슬라이드 아웃하는 **live ops panel**. Workflow/Agent/Image edit 진행을 실시간으로 추적하고, 비즈니스 알림도 같은 surface에 통합. "힐끗 보면 시스템이 숨쉬는 게 느껴지는" UI. 내가 트리거한 작업(내 작업)과 팀 차원 이벤트(팀) 분리. Alert는 Action Task로 한 방향 승격.

**성공 기준**:
- 운영자가 workflow를 trigger한 뒤 패널을 열어두면 다른 페이지로 이동해도 진행률/완료/실패를 실시간 확인 가능.
- 3개 async 소스가 한 패널에 통합 표시, 새 소스 추가는 registry 한 엔트리 + adapter 파일 한 개로 가능.
- Alert → ActionTask 한 방향 승격이 작동. Action Board에서 내/팀 필터로 본인 할당 작업만 골라봄.
- 기존 Bell dropdown 두 개 중복 제거 (Header dead code 삭제 + Sidebar는 trigger로 재활용).

## Premises (agreed)

1. **Panel ≠ Action Board.** 성격이 다르다. Panel = 관찰 surface (ephemeral, 자동 수명), Action Board = 작업 surface (durable, 명시적 상태머신). 데이터 모델 공유 안 함.

2. **Panel MVP 범위** = WorkflowRun + AgentTask + 이미지 편집 job + AlertItem 네 소스 한 뷰 통합 + Alert → ActionTask 한 방향 승격 + Action Board에 내/팀 필터 추가.

3. **진입점 통일**. Sidebar Bell 하나만 남기고 클릭 시 slide-out 패널 오픈. `Header.tsx`는 dead code 확정 (AppLayout에 import 없음) — 삭제.

4. **아이템별 수명 다름, 통일 강요 안 함**. Run = 자동 전이, 24h 후 자동 제거. Alert = 수동 dismiss 또는 ActionTask 승격. Activity 피드는 MVP 아님.

5. **Role-based 가시성은 MVP 아님**. `User.role`은 'member'/'admin' 유지. Panel은 company-scoped. 세분화 역할(광고/재고 담당)은 Phase 2.

6. **지속성**. Panel 상태(열림/닫힘, 아이템 맵)는 페이지 이동 간 유지 (Zustand 전역 store). 크로스 탭 동기화는 Phase 2 (Web Lock API 기반 리더 선출).

7. **Panel 아이템은 parent/child 관계 가능.** Workflow → Agent → Image job spawn 구조 반영. `parentId` 필드를 스키마에 포함하되 MVP 렌더링은 flat list. 트리 뷰는 Phase 2.

8. **실시간 = SSE. 폴링 아님.** NestJS `@Sse()` + `EventEmitter2` 기존 패턴 재사용 (`AgentSseService`가 레퍼런스). 프론트는 `@microsoft/fetch-event-source` 래퍼로 헤더 인증 호환 + 자동 재연결.

9. **Visibility 축 추가**. `visibility: 'company' | 'user'` 필드로 서버 필터. `user` 스코프 아이템은 `actorUserId === me`인 사용자에게만 전송. Privacy + 노이즈 차단.

10. **UI 섹션 분리**. "내 작업" (actorUserId === me) + "팀" (actorUserId !== me OR null). 내가 트리거한 `company` scope 아이템은 내 작업에 오고 "팀 공유" 뱃지로 표시.

---

## Approaches Considered

### Approach A — SSE Multiplexer (**CHOSEN**)

**핵심**: EventEmitter2 → NestJS `@Sse()` → fetch-event-source client. 새 테이블 없음. 각 도메인 서비스가 상태 전이 지점에 `panel.*` 이벤트 emit. 재접속 시 서버 링 버퍼 + 원본 테이블 backfill.

**장점**: 진짜 "live" 느낌. 기존 `AgentSseService` 패턴 재사용. DB write 증가 없음. Docker 배포라 LB timeout 제어 가능.

**단점**: 재접속/이벤트 손실 로직 필요. 멀티 인스턴스 확장 시 pg LISTEN 또는 Redis 필요 (MVP 단일 인스턴스 전제).

### Approach B — Materialized `panel_event` 테이블

**핵심**: 새 Prisma `panel_event` 모델에 denormalized 이벤트 저장. SSE는 거기서 흐름. seq 기반 deterministic replay.

**장점**: Audit trail. 재접속 시 정확한 replay. 시간 여행 스크러브 미래 기반.

**단점**: DB write 2배. 스키마 마이그레이션 + retention 정책 오너십. JSON payload 디자인 드리프트 위험. MVP 오버엔지니어링.

### Approach C — View-Only Aggregation (폴링)

**핵심**: 네 원본 테이블 UNION 쿼리 → `/api/panel` endpoint. 프론트는 adaptive polling (3s~30s).

**장점**: 최소 변경. 백엔드 코드 가장 적음.

**단점**: "live" 체감 약함. 스트리밍 출력 표현 불가. "파노라마" 야망 축소.

---

## Recommended Approach — A + Mitigations

### 선택 근거

1. 기존 `@Sse()` + EventEmitter2 패턴 있음 (`AgentSseService`가 선례). 새로운 인프라 도입 아니라 기존 확장.
2. Docker 배포(`apps/server/Dockerfile`) — Vercel serverless 아님. Long-lived connection 가능.
3. 사용자가 꽂힌 "파노라마" 경험은 "초단위 업데이트"의 체감이 있어야 유지. 폴링으로는 어색.
4. `panel_event` 테이블 안 만들어 스키마 부담 최소.

### 리스크 미티게이션 매트릭스

| # | 리스크 | MVP 대응 | 담당 | 후순위 |
|---|-------|---------|------|-------|
| M1 | 서버 중복 구현 | 기존 `AgentSseService` 패턴 복사 — rxjs Subject + `@OnEvent` + companyId 필터 + payload에서 companyId drop (ADR-0008 일관) | PanelSseService | — |
| M2 | LB/프록시 타임아웃 | 25초마다 `: ping\n\n` 주석. 응답 헤더 `X-Accel-Buffering: no` + `Cache-Control: no-cache` | PanelController | — |
| M3 | 프론트 EventSource 금지 | `@microsoft/fetch-event-source` 채택 + ADR 작성. Panel 도메인 스코프 예외 | PanelSseClient + ADR 1 | — |
| M4 | 재접속 시 이벤트 손실 | monotonic `seq` + SSE `id:` 필드. Last-Event-ID → `/backfill?afterSeq=N` (원본 테이블 조회) + in-memory 링 버퍼 100개/회사 | PanelSseService + PanelController | — |
| M5 | 멀티탭 중복 toast | MVP 스킵 (탭별 독립 store라 UI 중복 없음, toast만 N번) | — | Phase 2 (Web Lock API) |
| M6 | 수평 스케일링 | MVP 단일 인스턴스 전제. `PanelEventBus` 추상화로 내부 구현 감싸 (현재: EventEmitter2 직결) | Abstraction only | Phase 2 (pg LISTEN 또는 Redis) |
| M7 | Observability | 연결 open/close 로그(companyId, userId, duration). 180s ping 없으면 force close | PanelSseService | Phase 2 (Prometheus) |

---

## Section 1 — 시스템 아키텍처 + 데이터 계약

### 1.1 컴포넌트 다이어그램

```
[Domain Services]                                                [Frontend]
  WorkflowExecutor                                                 
  HeartbeatService         ────panel.*──►  [EventEmitter2]         
  ThumbnailEditService                           │                 
  RulesEngine (Alert)                            ▼                 
                                          [PanelSseService]        
                                          (rxjs Subject +         
                                           @OnEvent +              
                                           companyId filter +      
                                           ring buffer 100)        
                                                 │                 
                                                 ▼                 
                                          [@Sse('stream')          
                                           @Get('backfill')        
                                           @Post('promote')]       
                                                 │                 
                                       ──── HTTP/2 ────            
                                                 │                 
                                          [PanelSseClient]         
                                          (fetch-event-source      
                                           + Last-Event-ID +       
                                           auto reconnect)         
                                                 │                 
                                                 ▼                 
                                          [usePanelStore           
                                           (Zustand)               
                                           byId + seq dedup]       
                                                 │                 
                                                 ▼                 
                                          [PanelSheet              
                                           PanelItemRow            
                                           PromoteToTaskModal]     
```

### 1.2 Shared types — `packages/shared/src/panel/types.ts`

```typescript
import { z } from 'zod';

// ── 공통 필드 ────────────────────────────────────────────
const PanelItemBase = z.object({
  id: z.string(),                    // `${source}:${sourceId}` (예: "workflow:abc123")
  companyId: z.string().uuid(),      // 서버에서만; 와이어에서는 drop
  seq: z.number().int(),             // monotonic, SSE id 필드로 사용
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  parentId: z.string().optional(),   // 예: agent run이 workflow run의 child
  title: z.string(),
  subtitle: z.string().optional(),
  actorUserId: z.string().uuid().nullable(),  // 트리거 주체; null = 시스템
  visibility: z.enum(['company', 'user']),    // privacy 필터
});

// ── Run (workflow/agent/image) ───────────────────────────
export const PanelRunItem = PanelItemBase.extend({
  kind: z.literal('run'),
  source: PanelRunSourceSchema,        // sources.ts 참조
  sourceId: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  progress: z.number().min(0).max(1).optional(),
  etaSeconds: z.number().optional(),
  deepLink: z.string(),
  errorMessage: z.string().optional(),
});

// ── Alert ────────────────────────────────────────────────
export const PanelAlertItem = PanelItemBase.extend({
  kind: z.literal('alert'),
  alertType: z.enum(['minus_product', 'profit_low', 'ad_high', 'stock_low', 'grade_change']),
  severity: z.enum(['info', 'warn', 'critical']),
  message: z.string().optional(),
  dismissedAt: z.string().datetime().optional(),
  actionTaskId: z.string().uuid().optional(),  // 승격됐으면 링크
  deepLink: z.string().optional(),
});

export const PanelItem = z.discriminatedUnion('kind', [PanelRunItem, PanelAlertItem]);
export type PanelItem = z.infer<typeof PanelItem>;

// ── Wire: SSE event ──────────────────────────────────────
export const PanelEvent = z.object({
  type: z.enum(['upsert', 'dismiss', 'snapshot']),
  item: PanelItem.optional(),
  items: z.array(PanelItem).optional(),
  seq: z.number().int(),
});
export type PanelEvent = z.infer<typeof PanelEvent>;
```

### 1.3 Source registry — `packages/shared/src/panel/sources.ts`

```typescript
// 새 source 추가는 여기에 한 엔트리 + adapter 파일 + registry 등록
export const PANEL_RUN_SOURCES = {
  workflow: {
    label: '워크플로우',
    iconName: 'Workflow',          // Lucide 아이콘 이름
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

### 1.4 Server adapter pattern — agent-registry의 AdapterModule과 일관

```typescript
// apps/server/src/panel/adapters/types.ts
export interface PanelRunAdapter<TDomainEntity = unknown> {
  source: PanelRunSource;
  mapToItem(entity: TDomainEntity, companyId: string): Omit<PanelRunItem, 'seq' | 'updatedAt'>;
  defaultVisibility(entity: TDomainEntity): 'company' | 'user';
}

// apps/server/src/panel/adapters/registry.ts
export const panelRunAdapters: Record<PanelRunSource, PanelRunAdapter> = {
  workflow: workflowPanelAdapter,
  agent: agentPanelAdapter,
  image_edit: imagePanelAdapter,
};

// apps/server/src/panel/adapters/workflow.adapter.ts (예시)
export const workflowPanelAdapter: PanelRunAdapter<WorkflowRun> = {
  source: 'workflow',
  mapToItem(run, companyId) {
    return {
      id: `workflow:${run.id}`,
      kind: 'run',
      source: 'workflow',
      sourceId: run.id,
      companyId,
      status: run.status as PanelRunItem['status'],
      title: run.workflowName,
      subtitle: `${run.completedSteps}/${run.totalSteps} 단계`,
      progress: run.totalSteps > 0 ? run.completedSteps / run.totalSteps : undefined,
      deepLink: `/workflows/runs/${run.id}`,
      parentId: run.parentRunId ? `workflow:${run.parentRunId}` : undefined,
      actorUserId: run.triggeredBy ?? null,
      visibility: this.defaultVisibility(run),
      createdAt: run.createdAt.toISOString(),
    };
  },
  defaultVisibility(run) {
    // 스케줄 트리거(triggeredBy=null) → 팀 전원 관심. 수동 트리거 → 개인 컨텍스트.
    return run.triggeredBy === null ? 'company' : 'user';
  },
};
```

도메인 서비스 호출 예:

```typescript
// workflows.service.ts — 상태 전이 지점
await this.prisma.workflowRun.update({ where: { id }, data: { status: 'running' } });
const item = panelRunAdapters.workflow.mapToItem(updatedRun, companyId);
this.eventEmitter.emit('panel.run.upsert', { item, companyId });
```

**Alert adapter는 별도 파일** (`adapters/alert.adapter.ts`) — 인터페이스가 다름 (`PanelAlertItem` 반환, `visibility` 항상 `'company'`, `actorUserId` 항상 `null`). Run 레지스트리에 포함 안 함. RulesEngine에서 Alert insert 후 호출:

```typescript
// rules.service.ts — Alert insert 후
const alert = await this.prisma.alert.create({ ... });
const item = alertPanelAdapter.mapToItem(alert, companyId);
this.eventEmitter.emit('panel.alert.upsert', { item, companyId });
```

### 1.5 새 source 추가 5단계 체크리스트

1. `packages/shared/src/panel/sources.ts`의 `PANEL_RUN_SOURCES`에 엔트리 추가 (label, iconName, deepLinkPattern)
2. `apps/server/src/panel/adapters/{source}.adapter.ts` 생성, `PanelRunAdapter<DomainEntity>` 구현
3. `apps/server/src/panel/adapters/registry.ts`의 `panelRunAdapters`에 등록
4. 도메인 서비스의 상태 전이 지점마다 `panelRunAdapters.{source}.mapToItem` + `emit('panel.run.upsert', ...)`
5. Lucide에 해당 iconName 존재 확인 (없으면 CLAUDE.md 규칙상 Lucide만 허용)

### 1.6 프론트엔드 렌더링도 registry 기반

```tsx
// PanelItemRow.tsx
import * as Icons from 'lucide-react';
import { PANEL_RUN_SOURCES } from '@kiditem/shared';

const meta = PANEL_RUN_SOURCES[item.source];
const Icon = Icons[meta.iconName as keyof typeof Icons];
// 새 source 추가 시 UI 코드 수정 0줄
```

### 1.7 Alert 타입은 closed enum 유지

`minus_product | profit_low | ad_high | stock_low | grade_change` 다섯 개는 Header.tsx(삭제 예정) / Sidebar.tsx에 switch로 박혀 있음. 새 alert 타입 추가는 드물고, 추가 시 아이콘·라우팅·룰엔진 모두 손봐야 함 → closed enum이 더 정직 (과도한 추상화 피함).

---

## Section 2 — UI 디자인

### 2.1 전체 구조

- **슬라이드 아웃 패널**: 오른쪽에서, width 384px (Tailwind `w-96`)
- **Radix Sheet** 기반 (kiditem DESIGN.md의 Primitives 중 하나)
- **트리거**: Sidebar Bell (기존 위치 유지), 클릭 시 기존 dropdown JSX 대신 Sheet 오픈
- **뒤 페이지 상호작용 가능** (modal 아님 — 비차단)
- **라우트 이동 간 유지** (전역 Zustand `usePanelStore`, open 상태는 localStorage)

**SSE 구독 생명주기**: 인증된 사용자 세션 전체 동안 유지 (AppLayout mount 시 연결, 로그아웃 / 탭 종료 시 해제). Sheet 열림/닫힘과 무관 — Bell 뱃지가 실시간 반영되려면 백그라운드 구독 필수. Panel이 안 열려있어도 `usePanelStore`는 이벤트 받아 `byId`/`unreadCount` 업데이트.

**Bell 뱃지 count 의미**:
- **"N 신규"** (red 뱃지) = `kind === 'alert' && isRead === false`인 아이템 수. Alert만 카운트.
- **"N 진행"** (purple pulsing 뱃지) = `kind === 'run' && (status === 'pending' || status === 'running')`인 아이템 수. Run 전용.
- Terminal state run (succeeded/failed/cancelled)은 둘 다 해당 안 됨 (정보성이라 attention 아님).

### 2.2 헤더

- Bell 아이콘 + "알림" 타이틀 (Sidebar Bell과 일관)
- 두 뱃지: **N 진행** (purple, pulsing) + **N 신규** (red, unread count)
- 우측 액션 아이콘 (MVP: 검색/필터는 placeholder, 닫기만 작동)
- 그 아래 "모두 읽음으로 표시" 한 줄 액션 (기존 Bell dropdown 패턴 보존)

### 2.3 섹션 분리 (visibility + actorUserId 축)

**내 작업 섹션 (purple accent)**:
- 조건: `actorUserId === currentUserId`
- 포함: 내가 수동 trigger한 workflow/agent, 내 이미지 편집, 내가 manual 실행한 agent
- 정렬: 진행중 먼저 → 최근 완료
- `visibility === 'company'`인 내 아이템은 "팀 공유" 뱃지 (info only)

**팀 섹션 (blue accent)**:
- 조건: `actorUserId !== currentUserId` OR `actorUserId === null`
- 포함: 스케줄 agent 실행, 팀원이 트리거한 company-scoped 작업, 비즈니스 alert
- 정렬: critical alert 먼저 → warn → 완료/기타 → 시간순
- 타인 아바타(한 글자) 또는 "스케줄" 라벨로 트리거 주체 표시

### 2.4 아이템 렌더

```
[icon 28×28] [title              time]     ← font-weight 500, 13px
             [status-dot subtitle]          ← 12px
             [progress bar (0~1 있을 때만)]  ← 3px height
             [hover: dismiss (alert만) / 할일로 만들기 (alert만)]
```

**Source별 색상 팔레트**:
| Source / Kind | bg | fg | dot |
|--------------|-----|-----|-----|
| workflow | #ddd6fe | #6d28d9 | purple pulse |
| agent | #dbeafe | #1d4ed8 | purple pulse |
| image_edit | #fce7f3 | #be185d | purple pulse |
| succeeded | #d1fae5 | #047857 | green |
| failed | #fee2e2 | #b91c1c | red |
| cancelled | #f1f5f9 | #64748b | slate (opacity 0.7) |
| alert warn | #fef3c7 | #b45309 | amber |
| alert critical | #fee2e2 | #b91c1c | red |
| alert info | #ffedd5 | #c2410c | orange |

**시간 포맷**:
- 진행 중: 경과 시간 `02:34` (분:초 또는 시:분)
- 완료/실패: 절대 시간 `09:12` 또는 "어제", "N일 전" (기존 `timeAgoShort` util 재사용)

**상태 인디케이터**:
- 진행 중: pulse dot (1.5s CSS keyframes)
- 완료: 초록 check dot
- 실패: 빨간 X dot + "재시도 가능" 힌트
- Alert: severity 색 dot
- 취소: slate dot + 항목 전체 opacity 0.7

### 2.5 Alert → Task 승격 UI

**Alert 아이템 hover 시** subtitle 우측 영역에 두 액션 노출:
- "할일로 만들기" 버튼 (primary)
- "dismiss" 링크 (secondary)

**클릭 시 PromoteToTaskModal 오픈**:
```
┌─────────────────────────────────────────────┐
│ 할일로 만들기                          × │
├─────────────────────────────────────────────┤
│ 제목: [마진 적자 상품 8개 광고 조정         ] │
│ 우선순위: [● 긴급 ○ 높음 ○ 보통]              │
│ 역할: [광고] (자동 추론, 변경 가능)            │
│ 메모 (선택):                                  │
│ [                                           ] │
│                                               │
│           [취소]  [할일 생성]  │
└─────────────────────────────────────────────┘
```

**Priority/Role auto-mapping**:
- severity `critical` → priority `urgent`
- severity `warn` → priority `high`
- severity `info` → priority `medium`
- alertType `minus_product/stock_low` → role `inventory`
- alertType `profit_low/grade_change` → role `finance`
- alertType `ad_high` → role `ad`

**Shift+Click quick promote**: 모달 생략, 기본값으로 즉시 생성, sonner toast "할일로 추가됨" + 되돌리기 링크 (3초 동안).

**승격 후 alert 상태**: subtitle에 "→ 할일 생성됨 (ad 담당 · 홍길동)" 뱃지. 자동 dismiss 안 함. 사용자가 수동 dismiss 또는 해당 ActionTask가 done 되면 backend에서 자동 dismiss (Phase 2).

### 2.6 Action Board 변경

`apps/web/src/app/action-board/page.tsx` 수정:

**상단에 새 SegmentedControl**:
```
[내 (N)] [팀 (N)] [전체 (N)]     ← 기본: 전체
```

**각 카드에 assignee 표시**:
- 할당됨: 작은 아바타 + 이름 (예: `[지] 지훈`)
- 미할당: "할당 안됨" 회색 텍스트 + "내가 맡기" 버튼

**내 카드에 unclaim 옵션**: 오버플로우 메뉴에 "할당 해제".

**Promoted task 카드에 "← from alert" 뱃지**: 서버가 `Alert.findFirst({ where: { actionTaskId: task.id } })` 로 원본 조회해서 같이 반환 (task GET response에 `sourceAlert` 필드). 클릭 시 alert 상세 모달 (dismiss됐으면 "원본: {alertTitle} · dismissed at {time}").

---

## Section 3 — 수명 · 장애 처리 · 테스트

### 3.1 Panel 아이템 수명

**Run 아이템**:
| 상태 | Panel 위치 | 수명 규칙 |
|------|-----------|----------|
| `pending` | 진행 중 섹션 (연하게) | — |
| `running` | 진행 중 섹션 (pulsing) | terminal까지 |
| `succeeded` | 최근 섹션 (check) | terminal 후 **24h** |
| `failed` | 최근 섹션 (red X) | terminal 후 **24h** or 수동 dismiss |
| `cancelled` | 최근 섹션 (opacity 0.7) | terminal 후 **24h** or 수동 dismiss |

24h 이후 Panel UI에서 자동 제거 — 원본 테이블 데이터는 유지 (백필 가능하지만 Panel 표시 안 됨).

**Alert 아이템**:
- 생성 → unread로 표시
- 수동 dismiss → DB `isRead=true` + `dismissedAt`, Panel 즉시 제거
- ActionTask 승격 → "linked" 상태 (actionTaskId 세팅), 자동 dismiss 안 함 (사용자 수동 또는 task 완료 시까지)
- Re-trigger: 같은 `type + productId`가 이미 unread로 DB에 있으면 RulesEngine이 중복 생성 안 함 (기존 규칙). `updatedAt`만 갱신 → Panel에 "N분 전 업데이트"

### 3.2 SSE 재연결 + 이벤트 손실

**서버 엔드포인트**:
```
GET /api/panel/stream       (@Sse)
  - Last-Event-ID 헤더 처리
  - 링 버퍼 히트: seq > N인 이벤트만 재전송 후 live
  - 링 버퍼 미스 또는 Last-Event-ID 없음: snapshot 전송 (현재 상태 전체)
  - 25s마다 `: ping\n\n` (프록시 keepalive)
  - 응답 헤더 `X-Accel-Buffering: no`, `Cache-Control: no-cache`

GET /api/panel/backfill?afterSeq=N
  - 원본 테이블 스캔 (WorkflowRun, HeartbeatRun, ThumbnailEdit, Alert)
  - companyId + visibility 필터 + seq > N 조건
  - adapters.mapToItem으로 PanelItem[] 반환

POST /api/panel/alerts/:alertId/promote
  - body: { title?, priority?, role?, notes? }
  - ActionTask 생성, Alert.actionTaskId 업데이트, 멱등 검증 (이미 승격됐으면 409)
  - 생성된 ActionTask 반환

POST /api/panel/alerts/:alertId/dismiss
  - Alert.isRead = true, dismissedAt = now
  - emit 'panel.alert.dismiss' → 클라이언트 store에서 항목 제거

PATCH /api/action-tasks/:id/claim     — assigneeUserId = currentUser
PATCH /api/action-tasks/:id/unclaim   — assigneeUserId = null
GET   /api/action-tasks?assignedTo=me|team|all  — 필터
```

**클라이언트 merge 로직** (`usePanelStore`):
```typescript
upsertItem(item: PanelItem) {
  const existing = state.byId[item.id];
  if (!existing || item.seq > existing.seq) {
    state.byId[item.id] = item;
    state.lastSeq = Math.max(state.lastSeq, item.seq);
  }
  // else: 오래된 이벤트, 무시
}

handleSnapshot(items: PanelItem[]) {
  state.byId = {};
  items.forEach(upsertItem);
  state.lastSeq = Math.max(...items.map(i => i.seq));
}

dismissItem(id: string) {
  delete state.byId[id];
}
```

**재접속 시나리오**:
| 상황 | 복구 |
|------|------|
| <10s 네트워크 끊김 | fetch-event-source 자동 재시도 |
| 서버 재시작 | Last-Event-ID mismatch → snapshot 받고 store reset |
| 장시간 끊김 | backfill?afterSeq=N 호출 |
| 5회 재접속 실패 | 15s polling fallback (`/backfill?afterSeq=lastSeq`) + 배너 표시 |
| 탭 백그라운드 오래 | `visibilitychange` on visible → force reconnect |

### 3.3 에러 처리 매트릭스

| 위치 | 에러 | 응답 |
|------|-----|------|
| SSE 연결 | CORS/401/500 | 1s~30s exponential backoff, 배너 |
| 이벤트 Zod 파싱 | validation 실패 | 이벤트 drop, POST `/panel/client-error` (비차단) |
| localStorage 저장 | quota | 조용히 무시 (메모리 상태만) |
| 승격 API | 409 중복 | toast "이미 할일로 만들어졌어요" + Panel refresh |
| 승격 API | 500 생성 실패 | toast "할일 생성 실패. 다시 시도" |
| Claim | 409 race | toast + refresh (첫 요청만 성공) |
| 백필 | timeout | 재시도 또는 snapshot fallback |

**서버 zombie cleanup** (cron 매 분):
```
for conn in activeConnections:
  if now - conn.lastPingAt > 180s:
    conn.close()
    log('zombie closed', { companyId, userId, duration })
```

### 3.4 테스트 전략

**Backend** (`apps/server/src/panel/__tests__/`, `apps/server/src/action-task/__tests__/`):
- `panel-sse.service.spec.ts` — Subject.next 경로, companyId 필터, seq monotonic, 링 버퍼 크기
- `panel.controller.spec.ts` — `@Sse` Observable 구독, `@Get backfill` 쿼리
- `adapters/*.adapter.spec.ts` — 각 adapter의 mapToItem 필드 매핑
- `promote.service.spec.ts` — 승격, 멱등성(409), IDOR 방어(다른 회사 alert)
- `action-task.service.spec.ts` — claim/unclaim, assignedTo=me|team|all 필터

**Frontend** (`apps/web/src/components/panel/__tests__/`, `apps/web/src/app/action-board/__tests__/`):
- `usePanelStore.spec.ts` — upsert dedup, snapshot reset, 내/팀 selector
- `PanelSseClient.spec.ts` — fetch-event-source mock, Last-Event-ID, reconnect
- `PanelItemRow.spec.tsx` — run 상태별 렌더, alert hover 액션, linked 상태
- `PanelSheet.spec.tsx` — 섹션 분리 렌더, mark-all-read, dismiss
- `ActionBoard.filter.spec.tsx` — 내/팀/전체 토글
- `ActionTaskCard.claim.spec.tsx` — claim/unclaim 버튼

**원칙** (apps/server/CLAUDE.md 인용):
- "Behavior verification only — no implementation detail tests"
- EventEmitter2 모킹 최소화 (실제 emitter 사용, subscriber만 검증)
- Prisma: 기존 test DB 패턴 유지

---

## Section 4 — 마이그레이션 · 기존 코드 · ADR

### 4.1 Prisma 스키마 변경

```prisma
model Alert {
  // ...existing...
  actionTaskId String?     @map("action_task_id") @db.Uuid
  actionTask   ActionTask? @relation(fields: [actionTaskId], references: [id], onDelete: SetNull)

  @@index([companyId, actionTaskId])
}

model ActionTask {
  // ...existing...
  assigneeUserId String? @map("assignee_user_id") @db.Uuid
  assignee       User?   @relation("ActionTaskAssignee", fields: [assigneeUserId], references: [id], onDelete: SetNull)
  promotedFromAlerts Alert[]  // Alert.actionTaskId 의 역참조 (자동)

  @@index([companyId, assigneeUserId])
}

model User {
  // ...existing...
  assignedActionTasks ActionTask[] @relation("ActionTaskAssignee")
}
```

**단방향 관계 선택 이유**: Alert→Task 링크를 `Alert.actionTaskId` 한 쪽에만 저장. Action Board 카드에서 "← from alert" 표시할 때는 `Alert.findFirst({ where: { actionTaskId: task.id } })` lookup — hot path 아니라 성능 문제 없음. 양방향 explicit relation(named `@relation`) 쓰면 Prisma 복잡도만 증가.

명령어:
```bash
npx prisma migrate dev --name panel_integration_alert_actiontask_assignee
npx prisma generate
npm run build --workspace=@kiditem/shared
```

**Backfill 불필요** — 모든 신규 필드 nullable.

### 4.2 영향 받는 기존 파일

| 파일 | 변경 |
|------|------|
| `apps/web/src/components/layout/Sidebar.tsx` | line 430-483 dropdown JSX → PanelSheet 트리거. Bell 아이콘/뱃지 유지 (뱃지 값은 `usePanelStore.unreadCount`). alert 관련 useQuery/mutation 제거. |
| `apps/web/src/components/layout/Header.tsx` | **삭제** (dead code, import 없음 확인됨) |
| `apps/web/src/app/action-board/page.tsx` | SegmentedControl "내/팀/전체" 추가, 카드에 assignee + claim 버튼, `?assignedTo=` 파라미터 |
| `apps/server/src/app.module.ts` | `PanelModule` 등록 |
| `apps/server/src/workflows/*.service.ts` | 상태 전이 지점 5~10줄 추가 (adapter 호출 + emit) |
| `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts` | 동일. 기존 `AGENT_EVENTS.*`는 유지 (AgentSseService 용). |
| `apps/server/src/products/services/thumbnail-edit.service.ts` | 동일 (image adapter) |
| `apps/server/src/rules/*.service.ts` | Alert DB insert 직후 `panel.alert.upsert` emit |
| `apps/server/src/action-task/action-task.service.ts` | `assigneeUserId` 지원. `claim`, `unclaim`. `list({ assignedTo })` 확장. `getSourceAlert(taskId)` 헬퍼 (Alert.actionTaskId 역lookup) |
| `apps/server/src/action-task/action-task.controller.ts` | `PATCH /:id/claim`, `/unclaim`. `GET ?assignedTo=` |
| `packages/shared/src/panel/` | **신설** — types.ts, sources.ts, index.ts |
| `packages/shared/src/index.ts` | Panel types re-export |
| `prisma/schema.prisma` | Alert + ActionTask + User 필드 추가 |
| `apps/web/package.json` | `@microsoft/fetch-event-source` 추가 |

### 4.3 신규 파일

```
apps/server/src/panel/
  panel.module.ts
  panel.controller.ts          — @Sse('stream'), @Get('backfill')
  panel.service.ts             — backfill 쿼리 (원본 테이블 스캔)
  promote.controller.ts        — POST /alerts/:id/promote
  promote.service.ts           — Alert → ActionTask 생성 로직
  events/
    panel-sse.service.ts       — rxjs Subject + @OnEvent + 링 버퍼 + companyId 필터
    panel-events.ts            — PANEL_EVENTS, emit 헬퍼, event 타입들
  adapters/
    types.ts                   — PanelRunAdapter interface
    registry.ts                — panelRunAdapters Map
    workflow.adapter.ts
    agent.adapter.ts
    image.adapter.ts
    alert.adapter.ts
  __tests__/
    panel-sse.service.spec.ts
    panel.controller.spec.ts
    promote.service.spec.ts
    adapters/*.spec.ts

apps/web/src/components/panel/
  PanelSheet.tsx               — Radix Sheet + 섹션 렌더
  PanelItemRow.tsx             — run/alert 구분 렌더, source icon lookup
  PanelGroupHeader.tsx         — "내 작업", "팀" 섹션 헤더
  PromoteToTaskModal.tsx       — 승격 모달
  hooks/
    usePanelStream.ts          — PanelSseClient 생명주기
    usePanelStore.ts           — Zustand selector helpers
  lib/
    panel-sse-client.ts        — @microsoft/fetch-event-source 래퍼
    panel-store.ts             — Zustand store (byId, seq, merge)
  __tests__/
    usePanelStore.spec.ts
    PanelSseClient.spec.ts
    PanelItemRow.spec.tsx
    PanelSheet.spec.tsx

.claude/docs/decisions/
  NNNN-panel-sse-frontend-exception.md     (ADR 1)
  NNNN-panel-vs-actionboard-boundary.md    (ADR 2, 선택)
```

### 4.4 ADR 1 — Panel 도메인 SSE 프론트엔드 예외

**Context**: `apps/web/src/app/agents/CLAUDE.md:109` 및 `thumbnails/CLAUDE.md:55`에 "EventSource/WebSocket 금지" 규정. 이유: standard `EventSource` API가 HTTP 헤더 못 보내서 dev auth(`x-dev-user-id`) 헤더 호환 불가. `apps/web/src/lib/api-client.ts:5` 주석이 원인 기록.

**Decision**: Panel 도메인 한정으로 `@microsoft/fetch-event-source` 라이브러리 사용 허용. fetch API 기반이라 모든 HTTP 헤더 지원 + 자동 재연결 + Last-Event-ID 지원.

**Scope**: Panel 도메인만. agents/thumbnails/기타 도메인은 기존 polling 유지. 신규 도메인에서 SSE 원하면 별도 ADR.

**Alternatives considered**:
- 쿠리 파라미터 인증 (`?devUserId=`) — 프로덕션 인증 정책과 충돌, 쿠키 세션 아닐 때 재검토 필요
- WebSocket — bidirectional 불필요, 인프라 부담 증가
- 폴링 전면 — "live 파노라마" 경험 달성 불가, 사용자 요구사항 미충족

**Consequences**:
- 1개 dependency 추가 (~5KB gzip)
- Panel 도메인 내부에 격리된 client 래퍼 하나 (`PanelSseClient`)
- 기존 domain 규칙은 변경 없음

### 4.5 ADR 2 — Panel vs Action Board 경계 (선택)

**Context**: 두 surface가 비슷해 보여 혼동 위험. 단일 매니저가 두 UI를 동시 유지 관리 시 경계 흐려짐.

**Decision**: 
- Panel = 관찰 surface. Ephemeral. 자동 수명. Run + Alert (dismissable).
- Action Board = 작업 surface. Durable. 명시적 상태머신. ActionTask + assignee + notes.
- 한 방향 승격: Alert → ActionTask. Run → ActionTask도 가능 (Phase 2).
- Action Task 상태 변경이 Panel에 자동 반영 안 함 (Phase 2).

**Alternatives rejected**:
- Panel이 Action Board 흡수 — mental model 통합 어려움, 결국 필터 여러 개 추가
- Action Board가 Panel 흡수 — durable UI에 ephemeral 섞여 복잡도 증가

**Consequences**:
- 사용자가 두 surface의 역할 학습 필요 (초기 UX 부담)
- 경계가 명확해서 각자 진화 가능 (e.g., Action Board는 Jira스럽게 확장, Panel은 실시간 observability로 확장)

### 4.6 배포 순서

```
PR1 (또는 단일 PR의 commit chain):
  1. ADR 1, 2 작성 → .claude/docs/decisions/
  2. Prisma migration + schema 변경
  3. packages/shared: Panel types + sources registry
  4. Backend: PanelModule (adapters + SSE service + controller + promote)
  5. Backend: ActionTaskService 확장 (claim, assignee, sourceAlertId)
  6. Frontend: PanelSseClient + usePanelStore + PanelSheet + PromoteToTaskModal
  7. Frontend: Sidebar Bell 교체 + Action Board 필터 + claim 버튼
  8. Header.tsx 삭제
  9. 도메인 서비스 adapter 호출 삽입 (workflow, agent, image, alert)
  10. Verification: dev 환경에서 workflow 수동 트리거 → Panel에 뜨는지, alert → task 승격 동작, Action Board 필터 검증
```

### 4.7 Rollout

- **Feature gate 불필요**: 기존 AgentSseService처럼 서버에 열려있어도 클라가 안 쓰면 노이즈 0.
- **Phased**: dev 환경 1주 → staging → production
- **Rollback**: PanelSheet 컴포넌트를 제거하고 Sidebar Bell dropdown JSX 복원. SSE 엔드포인트는 남겨도 무해.

### 4.8 기존 `/api/alerts` 엔드포인트의 운명

현재 Sidebar Bell이 쓰는 `GET /api/alerts`, `PATCH /api/alerts/:id/read`, `PATCH /api/alerts/read-all`:

- **MVP 배포 직후**: 삭제하지 않음. Panel은 `/api/panel/backfill`에서 Alert도 조회 (같은 DB 테이블 `alerts`). Sidebar 교체 후엔 frontend에서 호출 안 함.
- **Rollback 대비**: 엔드포인트 유지 (Sidebar Bell dropdown 복원 가능)
- **Phase 2 cleanup**: Panel이 2~4주 안정 운영되면 deprecation 공지 후 엔드포인트 제거. `isRead`, `dismissedAt`은 Panel의 dismiss API (`POST /api/panel/alerts/:id/dismiss`, 신설 필요) 로 대체.
- **신설 필요 endpoint**: `POST /api/panel/alerts/:id/dismiss` (Panel dismiss 버튼 용). MVP 포함.

---

## Follow-ups (Phase 2+)

이번 MVP에서 의도적으로 제외 — 사용자 피드백 쌓이면 개별 ADR로 다시 결정.

1. **Tree view**: `parentId` 활용한 run 계층 렌더 (workflow → agent → image 링크 시각화). DOM 기반, SVG edge 아님.
2. **크로스 탭 동기화**: Web Lock API로 리더 탭만 SSE 구독, 나머지 탭은 BroadcastChannel로 이벤트 전파. Toast 중복 방지.
3. **Time-travel scrub**: 5s 간격 상태 스냅샷 + 상단 타임라인 드래그. 이벤트에 이미 `seq` 있음.
4. **Live token streaming**: Run 아이템 클릭 시 해당 run의 Claude CLI stdout 토큰을 in-panel 스트리밍. 별도 스코프 SSE 연결.
5. **Multi-instance scaling**: `PanelEventBus` 추상화 뒤에 pg LISTEN/NOTIFY 또는 Redis pub/sub. 단일 인스턴스 전제 탈피.
6. **ActionTask 상태 → Panel reflect**: "나한테 할당된 task가 active로 바뀜" 같은 이벤트를 Panel에 notification으로 노출.
7. **Run → ActionTask 승격**: 실패한 run을 "수동 조사 필요"로 ActionTask 생성 (현재는 Alert만 승격 가능).
8. **Role-based visibility**: User에 workDomain(ad/inventory/finance/data) 필드 추가. Panel/Action Board 기본 필터로 활용.
9. **Observability 확장**: Prometheus 메트릭 (active SSE connections, events emitted by source, promote success rate).
10. **Agent trace 통합**: `/agents/tasks/:id/trace` 페이지 polling을 SSE로 대체 (ADR 1 스코프 확장 시).

---

## Success Criteria

- **기능적**:
  - 운영자가 workflow trigger 후 다른 페이지로 이동해도 Panel에서 실시간 진행률 확인 가능 (5초 이내 반영)
  - 4개 소스(workflow/agent/image_edit/alert)가 한 패널에 통합 표시
  - Alert의 "할일로 만들기" → ActionTask 생성 + 링크 역추적 동작
  - Action Board 내/팀 필터가 정확히 필터링 (assigneeUserId 기준)
  - SSE 연결 끊김 후 재접속 시 이벤트 손실 없음 (seq 기반 검증)
  - Header.tsx 삭제 후 빌드 통과 + 참조 오류 없음

- **비기능적**:
  - `docker-compose + NestJS local`에서 15분 장시간 연결 시 프록시 timeout 없음 (25s ping 확인)
  - 단일 인스턴스 기준 회사당 동시 SSE 연결 10개에서 latency < 100ms (emit → 클라 render)
  - 신규 source 추가가 registry 한 엔트리 + adapter 한 파일 + 도메인 서비스 호출 5줄 이내

- **프로세스**:
  - ADR 1 작성 + 팀 리뷰 통과
  - 기존 `AgentSseService` 패턴과 일관성 유지 (코드 리뷰에서 확인)
  - 각 도메인 CLAUDE.md에 영향 기록 (new source 추가 체크리스트 문서화)

## Dependencies

- Prisma 마이그레이션 수행 가능한 상태 (dev DB 접근 OK)
- `packages/shared` 빌드 파이프라인 정상
- `@microsoft/fetch-event-source` 패키지 설치 (`npm install --workspace=apps/web @microsoft/fetch-event-source`)
- 기존 `AgentSseService` 패턴 이해 (참고 파일 필수)
- docker-compose 스택 dev 환경 가동 가능

## The Assignment

**Next concrete action**: Prisma 마이그레이션 1개부터 생성하고 `packages/shared/src/panel/types.ts` + `sources.ts` 두 파일 커밋. 이 두 개가 스키마 계약의 원천이라 나머지는 거기서 파생.

---

## Appendix — Brainstorming Trace

세션 중 내린 주요 결정 순서 (중복 논의 방지 목적):

1. Mode: Learning/Refactoring (Builder) — Agent OS 완성도
2. Wow factor: 하나로 통합 (workflow + agent + image) 파노라마
3. Scope: 모든 주목 대상 (activity + run + 알림 + 세션 상태) — 이후 MVP에서 core 4개로 축소
4. Reference: 커스텀 — Action Board 정보 통합 + 멀티유저/역할 기반
5. Panel vs Action Board: ∩ 역할 분리 (각자 습관)
6. Trigger: Sidebar Bell 유지 + slide-out 교체
7. SSE 우려 → mitigation 계획 수립 → 기존 `AgentSseService` 있음 확인
8. SSE 프론트 허용 정책: 경로 2 (`fetch-event-source` + ADR + Panel 스코프 예외)
9. Section 1 source registry: 확장성 위해 Strategy 패턴 채택 (agent-registry와 일관)
10. UI: v3 "내 작업 / 팀" 분리 채택 (visibility + actorUserId 축)
11. Action Board 경계: MVP에 Alert → Task 승격 포함 + Action Board 필터 추가

세션 시간: ~60분. Claude subagent second opinion 1회 (Approach A 추천 확증).
