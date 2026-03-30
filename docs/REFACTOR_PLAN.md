# KIDITEM OS 리팩토링 계획

이 문서는 리팩토링 작업 시 참조하는 가이드.
각 Phase는 독립적으로 실행 가능. 순서대로 진행 권장.

## 배경

KIDITEM은 이커머스 셀러 운영 자동화 플랫폼. 현재 "대시보드"에서 "셀러 운영 OS"로 전환 중.
핵심 변화: Python 백그라운드 워커 중심 → Claude CLI 에이전트 중심으로 판단/분석 레이어 이전.

## 아키텍처 방향

### 에이전트 2-tier 구조

```
[프로덕션 에이전트]
├── specialist (스케줄/정형 작업)
│   ├── ad_strategy        — 광고 전략 판단
│   ├── rules_evaluation   — 건강도 평가
│   ├── rules_suggest      — 임계값 추천
│   ├── pricing            — 가격 조정 (신규)
│   └── inventory_alert    — 재고 알림 (신규)
│
└── manager (사용자 요청/비정형 작업)
    └── manager           — 셀러의 자유 질문/요청 처리, 하위 에이전트 위임

[개발 도구]
└── Claude Code            — 코드 생성, 리뷰, 테스트 (gstack 워크플로우)
```

### 런타임 구분

| 런타임 | 용도 | 관리 |
|--------|------|------|
| Claude CLI (`claude -p`) | 판단/분석 에이전트 | agent-registry (Paperclip 패턴) |
| Python (asyncpg 폴링) | 생성/처리 에이전트 (content, image_edit, sourcing, inventory) | runner.py |

### Agent Platform (Paperclip 패턴)

```
agent-registry/
├── adapters/              — 런타임 추상화 (claude-local, process, http)
├── heartbeat/             — Heartbeat 실행 엔진 + 타이머
├── wakeup/                — Wakeup 요청 큐 (coalescing)
├── skills/                — Skills 주입 관리 (symlink)
├── domains/               — 에이전트별 도메인 후처리
│   └── ad-strategy/       — 광고 전략 콜백
├── __tests__/
├── agent-registry.service.ts — CRUD + run() + completeTask() + receiveResults()
├── agent-registry.controller.ts — REST API (CRUD + run + pause/resume + runs/state)
└── seed-agents.ts         — 기본 에이전트 시드
```

**핵심 개념:**
- **Adapter**: `claude_local` 등 교체 가능한 실행 런타임
- **Heartbeat**: 짧은 실행 윈도우 단위 동작, session resume으로 연속성 보장
- **Wakeup 4종**: `timer` | `assignment` | `on_demand` | `automation` (coalescing)
- **Skills**: `agent-config/skills/` SKILL.md 파일을 런타임에 symlink 주입
- **Hierarchy**: `reportsTo`로 에이전트 간 위임 (manager → specialist)

**DB 테이블:**
- `agent_definitions` — 에이전트 정의 (adapter, hierarchy, skills, permissions, 예산)
- `heartbeat_runs` — 각 실행의 완전한 기록 (stdout, stderr, 토큰, 세션 ID)
- `agent_wakeup_requests` — 실행 요청 큐 (source 4종, coalescing, 감사 추적)
- `agent_runtime_state` — 에이전트별 영속 상태 (sessionId, 누적 토큰/비용)

### 백엔드 모듈 구조 (15개)

```
apps/server/src/
├── agent-registry/    — 에이전트 플랫폼 코어 (adapters, heartbeat, wakeup, skills, domains)
├── products/          — 상품 + 썸네일 + 리뷰 + 광고 (controllers/ + services/)
├── orders/            — 주문 + 반품 + CS (controllers/ + services/)
├── coupang/           — 쿠팡 API + 동기화 + 대시보드 (controllers/ + services/ + client libs)
├── inventory/         — 재고 + 재고이동 + 발주 + 미출고 (controllers/ + services/)
├── rules/             — 건강도 + 알림 + 스케줄러 (controllers/ + services/)
├── workflows/         — 워크플로우 엔진 (executors/ + actions/)
├── ai/                — AI 프록시 (controllers/ + services/)
├── finance/           — 손익 + 매출분석 (controllers/ + services/)
├── companies/         — 회사 + 에이전트 태스크
├── dashboard/         — 대시보드 집계 뷰
├── activity-events/   — 활동 이력 (공유 조회)
├── sourcing/          — 소싱
├── common/            — 유틸리티 (kst, pagination)
└── prisma/            — DB
```

---

## Phase 1: agent-registry 안정화 ✅

- [x] Prisma `AgentDefinition` 모델 추가
- [x] `agent-registry` NestJS 모듈 (CRUD + spawn + 하트비트)
- [x] `seed-agents.ts`에 ad_strategy 기본 정의
- [x] `app.module.ts` 등록
- [x] CLAUDE.md 업데이트

## Phase 2: 기존 에이전트 통합 ✅

### 2-1. AdAgentService → agent-registry 이전 ✅

- [x] `AgentRegistryService.run()` 호출하도록 위임
- [x] `buildPrompt()`, `spawnClaudeAgent()`, `parseClaudeOutput()`, `failTask()` 제거
- [x] `receiveResults()` → 2-stage callback (completeTask + 도메인 후처리 with try/catch)
- [x] 하위 호환: `/api/ad-agent/*` 라우트 유지
- [x] ad-agent/ → agent-registry/domains/ad-strategy/ 흡수

### 2-2. RulesService → agent-registry 이전 ✅

- [x] `seed-agents.ts`에 rules_evaluation, rules_suggest 정의 추가
- [x] `RulesService.evaluateAll()`이 `AgentRegistryService.run()` 호출
- [x] `spawnClaudeAgent()` 제거
- [x] `receiveResults()` 도메인 후처리 유지 (healthScore bulk update + alert 생성)
- [x] `suggestThresholds()`도 agent-registry 경유
- [x] 하위 호환: `/api/rules/*` 라우트 유지

### 2-3. Python ad_strategy 레거시 정리 ✅

- [x] `agents/src/agents/ad_strategy/` 삭제
- [x] `runner.py`의 AGENTS에서 `ad_strategy` 삭제
- [x] 관련 테스트 삭제

## Phase 2+: Paperclip 패턴 전면 적용 + 모듈 통합 ✅

### Agent Platform 구축 ✅

- [x] Adapter 추상화: `AdapterModule` 인터페이스 + `claude-local` adapter
- [x] Heartbeat 서비스: 4종 wakeup + session resume + timer 스케줄러
- [x] Wakeup Queue: coalescing + 감사 추적
- [x] Skills 시스템: `agent-config/skills/` SKILL.md → symlink 주입
- [x] DB 스키마 확장: AgentDefinition +14 fields + 3 new tables
- [x] Agent hierarchy: reportsTo, role, permissions
- [x] pause/resume, resetSession, runHistory API

### 백엔드 모듈 통합 (30→15) ✅

- [x] products/ ← thumbnails + reviews + ads
- [x] orders/ ← returns + cs
- [x] coupang/ ← coupang-sync + coupang-dashboard
- [x] inventory/ ← stock-movement + purchase-orders + unshipped
- [x] ai/ ← text-ai + image-ai + render-image
- [x] finance/ ← profit-loss + sales-analysis
- [x] rules/ ← alerts
- [x] companies/ ← agent-tasks
- [x] ad-agent/ → agent-registry/domains/ad-strategy/
- [x] 6개 핵심 모듈 controllers/ + services/ 하위 구조화

### 디렉토리 정리 ✅

- [x] agent-config/ → apps/server/agent-config/
- [x] OPERATIONS.md, RULES.md → agent-config/rules/
- [x] REFACTOR_PLAN.md, ARCHITECTURE.md, TODOS.md → docs/
- [x] 불필요 파일 삭제 (.claude-flow/, .swarm/, .mcp.json, openclaw/)
- [x] .gitignore 업데이트

### 테스트 ✅

- [x] Unit tests: 32개 (agent-registry, heartbeat, wakeup, ad-strategy, rules)
- [x] E2E: ad-agent 콜백, rules 콜백, pause/resume API
- [x] TSC: 0 errors

## Phase 3: 범용 manager 에이전트

### 3-1. manager 에이전트 정의

`seed-agents.ts`에 추가:

```typescript
{
  name: '셀러 운영 어시스턴트',
  type: 'manager',
  role: 'manager',
  adapterType: 'claude_local',
  skills: ['db-query', 'kiditem-api', 'data-analysis', 'result-callback'],
  permissions: { canSpawnSubAgents: true, canAccessBrowser: true },
  reportsTo: null,  // 최상위
  requiresApproval: false,
  timeoutSeconds: 300,
}
```

### 3-2. 하위 에이전트 위임

manager가 specialist를 wakeup으로 트리거:

```
POST /api/agent-registry/{ad_strategy_id}/run  (manager가 curl로 호출)
```

### 3-3. Skills 추가

- [ ] `agent-config/skills/kiditem-api/SKILL.md` — KidItem 내부 API 사용법
- [ ] `agent-config/skills/data-analysis/SKILL.md` — 데이터 분석 패턴
- [ ] `agent-config/skills/coupang-browse/SKILL.md` — 쿠팡 대시보드 브라우저 조작

### 3-4. manager 실행 API

```
POST /api/agent-registry/manager/ask
Body: { companyId, request: "이 상품 왜 안 팔려?", productId?: "..." }
```

## Phase 4: 프론트엔드 에이전트 관리 UI

API 준비 완료 — 프론트 구현만 필요:

- [ ] 에이전트 목록 (`GET /api/agent-registry`)
- [ ] 에이전트 상세 + 실행 이력 (`GET /api/agent-registry/:id/runs`)
- [ ] 런타임 상태 모니터링 (`GET /api/agent-registry/:id/runtime-state`)
- [ ] Pause/Resume 토글 (`POST /api/agent-registry/:id/pause`, `/resume`)
- [ ] 세션 리셋 (`POST /api/agent-registry/:id/reset-session`)
- [ ] 수동 실행 트리거 (`POST /api/agent-registry/:id/run`)
- [ ] 실시간 로그 스트리밍 (SSE)

## Phase 5: 전용 에이전트 추가

### 5-1. pricing 에이전트

```
type: 'pricing', role: 'specialist'
규칙: agent-config/rules/pricing.md (신규)
스케줄: '0 10 * * *'
```

### 5-2. inventory_alert 에이전트

```
type: 'inventory_alert', role: 'specialist'
스케줄: '0 */6 * * *'
```

### 5-3. review_monitor 에이전트

```
type: 'review_monitor', role: 'specialist'
스케줄: '0 9 * * *'
```

## Phase 6: SaaS 대비 (장기)

- [ ] Tier 1 규칙 엔진: 정형 판단을 코드 로직으로 (비용 $0)
- [ ] Tier 2 배치 AI: 규칙 벗어나는 케이스만 AI 배치 분석
- [ ] Tier 3 Claude CLI: 사용자 요청/브라우저 조작만
- [ ] 셀러별 `monthlyTokenBudget` 과금 체계
- [ ] `agent_definitions`를 셀러가 직접 커스텀

---

## 규칙 (작업 시 반드시 준수)

1. **기존 API 하위 호환 유지** — 라우트 삭제 금지, 내부만 위임
2. **도메인 모듈 패턴** — 큰 모듈은 controllers/ + services/ 하위 구조
3. **Native PG enum 금지** → String + validation
4. **Python 에이전트 (content, image_edit, sourcing, inventory) 건드리지 않음**
5. **agent_definitions.type은 unique** — 중복 타입 등록 금지
6. **프롬프트 템플릿에 DB URL 하드코딩 금지** → `{{db_url}}` 변수 사용
7. **도메인 후처리 예외 시 try/catch + logging** — silent failure 방지
8. **새 에이전트 추가 = seed-agents.ts + skills + 도메인 콜백(필요 시)**

## Review History

| Review | Trigger | Runs | Status | Findings |
|--------|---------|------|--------|----------|
| Eng Review | `/plan-eng-review` | 1 | CLEARED | 3 issues resolved, 1 critical gap fixed |
