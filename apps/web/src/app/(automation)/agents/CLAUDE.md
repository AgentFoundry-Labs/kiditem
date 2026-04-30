# web/agents — Agent Lifecycle / Trace / Org / Cost UI

49 파일. 가장 큰 frontend 도메인. **6 서브라우트 + 조건부 polling + trace timeline + org tree + cost analytics**. SSE 사용 안 함 — `refetchInterval` 기반 polling.

## Subroute Map

| Route | 책임 | Polling |
|---|---|---|
| `costs/` | 비용 분석 dashboard (period 선택 + KPI + 차트) | none |
| `tasks/` | Agent task 리스트 (status/agent/dateRange 필터, pagination) | 30s |
| `tasks/[id]/trace/` | 실행 trace timeline + event detail modal | **15s if running, else off** |
| `activity/` | 글로벌 activity feed (feed/timeline view 토글) | 30s |
| `org/` | 조직도 트리 (manager/CEO 역할별, EmptySlot) | none |
| `[id]/` | Agent detail (6 tab: Dashboard/Config/Instructions/Skills/Runs/Budget) | 15s on agent/runs/runtimeState |
| `skills/` | Skill directory + agent 매핑 | none |

## 핵심 패턴

### 1. 조건부 Polling — refetchInterval 함수

**이 도메인은 SSE 안 씀** — React Query `refetchInterval` 만으로 실시간성 구현.

`tasks/[id]/trace/TraceView.tsx:33-34`:
```typescript
refetchInterval: (query) =>
  isRunningStatus(query.state.data?.task.status) ? 15_000 : false
```

- Running status 일 때만 15s polling, 완료/실패는 polling off
- `RUNNING_STATUSES` 정의: `tasks/lib/trace-utils.ts:34`

다른 곳: detail page `15s`, tasks list `30s`, activity `30s`. **상황에 맞게 구분**.

### 2. Page Composition — Thin Compositor

모든 `page.tsx` 동일 구조:
1. Hooks/State (useQuery + useState for filters/pagination)
2. useMemo computation (filters, ranges, grouping)
3. Loading: `<PageSkeleton variant="dashboard|table|detail|cards" />`
4. Error: red alert box + `isApiError` 분기
5. Empty: 중앙 아이콘 + 메시지
6. Children: 구체적 UI 컴포넌트 inject

페이지는 **얇은 합성기** — 로직은 components/ 와 hooks/ 에.

### 3. Trace Timeline (tasks/[id]/trace/)

`TraceTimeline.tsx`:
- 입력: `heartbeatRuns[]`, `events[]`, `wakeupRequests[]`
- Memoized: `eventsByRun: Map<runId, events[]>`, `wakeupByRun: Map<runId, wakeup>`
- **Pending wakeups** (runId 없는 것) → 위쪽 dashed card
- **Run cards** (흰색): 헤더(status/duration/exitCode), 인라인 error, 중첩 events `<ul>`, fallback `PythonFallbackBox` (events 없을 때 stdout/stderr)
- **Danger event**: type ∈ `{permission.denied, action_cap.violated, auto.paused, validation.retry, dry_run.forced}` → 빨간 배경 (`isDangerEvent` in `trace-utils.ts:42-52`)
- Event 클릭 → `onEventClick(event)` → 부모 `<EventDetailModal>` 표시

### 4. Org Tree (org/)

`OrgTree.tsx` — **재귀 컴포넌트**:
- 입력: `OrgNode[]` (`{id, role, reports: OrgNode[], hired}`)
- 자식 0: `EmptySlot` 버튼 (role=manager/ceo 일 때만)
- 자식 1: 수직 라인 + 단일 자식 재귀
- 자식 N: 수직 라인 → 수평 cross-bar (`width = N * 9rem`) → 각 자식에서 수직 connector 내리기
- 카드 클릭: hired → `/agents/{id}`, else → `/agents?tab=marketplace`

### 5. Activity Feed (activity/)

`ActivityFeed.tsx` + `TimelineView.tsx`:
- Fetch: `fetchAllActivity()` → 모든 agent 의 runs 병렬 → flatten → date DESC 정렬
- Filter: agentFilter / statusFilter / timeRange (client-side)
- Group: `groupLabel(date)` — 오늘/어제/날짜
- Paginate: `PAGE_SIZE = 20`
- View toggle: feed (List icon) ↔ timeline (BarChart3 icon)

### 6. Cost Analytics (costs/)

`costs/page.tsx`:
- Period 선택: `'이번 달' | '최근 7일' | '최근 30일' | '전체'`
- `periodRange(period)` → `{ from, to }` ISO → `useAgentCostAnalytics(range)`
- 4-card grid (총 비용/입력 토큰/출력 토큰/run 수)
- `CostTrendChart` — dynamic import + `ssr: false`
- `BudgetGauge` — agent별 budget 가시화
- `CostBreakdownTable` — 정렬 가능

### 7. queryKeys — 일관된 hierarchy

`@/lib/query-keys.ts` 의 `queryKeys.agents`:
```
all              → ['agents']
list()           → [...all, 'list']
detail(id)       → [...all, 'detail', id]
runs(id)         → [...all, 'runs', id]
runtimeState(id) → [...all, 'runtimeState', id]
org()            → [...all, 'org']
trace(taskId)    → [...all, 'trace', taskId]
costAnalytics(p) → [...all, 'costAnalytics', p]
tasksList(p)     → [...all, 'tasksList', p]
```

Mutation 후: `queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(id) })` 등.

### 8. Hook & API 분리

- **Hooks**: `agents/hooks/useAgents.ts` — 14 export (useAgentList, useAgentDetail, useAgentRuns, useAgentTrace, useAgentCostAnalytics 등)
- **API**: `agents/lib/agent-api.ts` — 10 메서드 (apiClient + Zod 스키마 검증)
- **Types**: `@kiditem/shared` (Agent, HeartbeatRun, AgentTrace 등)

## 금지 (Hard bans)

- ❌ EventSource / 직접 streaming (이 도메인은 polling)
- ❌ `useState + useEffect + fetch` 패턴 (useQuery 만)
- ❌ raw `fetch()` (apiClient.* 만)
- ❌ `Intl.DateTimeFormat` 직접 호출 (formatDateTime util 만)
- ❌ Lucide 외 아이콘
- ❌ `className={`...${cond}...`}` 템플릿 리터럴 조건부 (cn() 사용)
- ❌ Component Props export (inline 또는 file-local)
- ❌ trace polling 을 무조건 활성화 (running 상태 확인 후 조건부)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Trace event 종류 추가 | `tasks/lib/trace-utils.ts:42` (isDangerEvent) + `TraceTimeline.tsx` (rendering) + `EventDetailModal.tsx` |
| Polling interval 변경 | `TraceView.tsx:33` + `tasks/page.tsx:69` + `[id]/page.tsx:53` (모두 일관성) |
| Agent detail tab 추가/변경 | `[id]/page.tsx` + `[id]/components/{Tab}.tsx` + queryKeys.agents.* |
| OrgTree 노드 type 변경 | `org/components/OrgTree.tsx` + `AgentCard.tsx` + `OrgLegend.tsx` + `OrgNode` type (`@kiditem/shared`) |
| Activity 필터 추가 | `activity/page.tsx` + `ActivityFilters.tsx` + `activity-utils.ts` (groupLabel 등) |
| API 응답 shape 변경 | `agents/lib/agent-api.ts` + Zod schema + `agents/hooks/useAgents.ts` + 타입 (`@kiditem/shared`) |
| Cost period 추가 | `costs/page.tsx` (Period 타입) + `periodRange()` util |
| 새 mutation | `useAgents.ts` (useMutation) + invalidation key 추가 |
