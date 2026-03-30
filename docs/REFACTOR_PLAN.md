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
├── 전용 에이전트 (스케줄, 정형 작업)
│   ├── ad_strategy     — 광고 전략 (agent-config/rules/operations.md 규칙)
│   ├── rules_evaluation — 건강도 평가 (agent-config/rules/health-rules.md 규칙)
│   ├── pricing          — 가격 조정 (신규)
│   └── inventory_alert  — 재고 알림 (신규)
│
└── 범용 operator (사용자 요청, 비정형 작업)
    └── operator         — 셀러의 자유 질문/요청 처리

[개발 도구]
└── Claude Code          — 코드 생성, 리뷰, 테스트 (gstack 워크플로우)
```

### 런타임 구분

| 런타임 | 용도 | 관리 |
|--------|------|------|
| Claude CLI (`claude -p`) | 판단/분석 에이전트 | agent-registry (NestJS) |
| Python (asyncpg 폴링) | 생성/처리 에이전트 | runner.py |

### 관리 구조 (Paperclip 패턴 내재화)

- `agent_definitions` 테이블: 에이전트 정의 (프롬프트 템플릿, 권한, 예산, 스케줄)
- `agent-registry` NestJS 모듈: CRUD + spawn + 예산 체크 + 하트비트
- 운영 규칙 문서: `agent-config/rules/operations.md`, `agent-config/rules/health-rules.md` (에이전트가 읽는 규칙)

---

## Phase 1: agent-registry 안정화 (완료)

- [x] Prisma `AgentDefinition` 모델 추가
- [x] `agent-registry` NestJS 모듈 (CRUD + spawn + 하트비트)
- [x] `seed-agents.ts`에 ad_strategy 기본 정의
- [x] `app.module.ts` 등록
- [x] CLAUDE.md 업데이트

## Phase 2: 기존 에이전트 통합

### 2-1. AdAgentService → agent-registry 이전

**현재**: `apps/server/src/ad-agent/ad-agent.service.ts`가 독자적으로 spawn
**목표**: `agent-registry`의 `run()`을 통해 실행

작업:
- [ ] `AdAgentController`의 `run()`이 내부적으로 `AgentRegistryService.run('ad_strategy_def_id', ...)` 호출하도록 변경
- [ ] `AdAgentService.buildPrompt()` 제거 → `seed-agents.ts`의 promptTemplate 사용
- [ ] `AdAgentService.spawnClaudeAgent()` 제거 → `AgentRegistryService`의 범용 spawner 사용
- [ ] `AdAgentService.receiveResults()` → `AgentRegistryService.receiveResults()` 위임
- [ ] 하위 호환: `/api/ad-agent/*` 라우트는 유지 (내부만 위임)

### 2-2. RulesService → agent-registry 이전

**현재**: `apps/server/src/rules/rules.service.ts`가 독자적으로 spawn
**목표**: rules_evaluation 에이전트를 `agent_definitions`에 등록

작업:
- [ ] `seed-agents.ts`에 rules_evaluation 정의 추가 (현재 `buildEvaluationPrompt()` 내용 이전)
- [ ] `RulesService.evaluateAll()`이 `AgentRegistryService.run()` 호출
- [ ] `RulesService.spawnClaudeAgent()` 제거
- [ ] 결과 수신: `receiveResults()`에서 healthScore 업데이트 + alert 생성 로직 유지
- [ ] 하위 호환: `/api/rules/evaluate` 라우트 유지

### 2-3. Python ad_strategy 레거시 정리

- [ ] `agents/src/agents/ad_strategy/` Python 에이전트 제거
- [ ] `runner.py`의 AGENTS에서 `ad_strategy` 삭제
- [ ] 관련 테스트 제거

## Phase 3: 범용 operator 에이전트

### 3-1. operator 에이전트 정의

`seed-agents.ts`에 추가:

```
name: '셀러 운영 어시스턴트'
type: 'operator'
allowedTools: 'Bash(psql:*) Bash(curl:*) Read Browse'
requiresApproval: false
timeoutSeconds: 300
```

### 3-2. operator 프롬프트에 포함할 컨텍스트

| 컨텍스트 | 전달 방식 | 내용 |
|----------|-----------|------|
| DB 스키마 요약 | 프롬프트에 포함 | 주요 테이블 + 컬럼 (products, ads, inventory, orders, profit_loss, reviews) |
| NestJS API 목록 | 프롬프트에 포함 | `apps/server/CLAUDE.md`의 라우팅 테이블 |
| 운영 규칙 | "agent-config/rules/operations.md, agent-config/rules/health-rules.md 읽어라" | 파일 경로만 전달 |
| 셀러 정보 | 프롬프트 변수 `{{company_id}}` | 실행 시 주입 |
| 사용자 요청 | 프롬프트 변수 `{{user_request}}` | "이 상품 왜 안 팔려?" 등 |
| 결과 API | 프롬프트 변수 `{{result_api}}` | 콜백 URL |

### 3-3. operator 실행 API

```
POST /api/agent-registry/operator/ask
Body: { companyId, request: "이 상품 왜 안 팔려?", productId?: "..." }
```

AgentRegistryController에 추가. 내부적으로 operator 정의를 찾아서 run().

### 3-4. Browse 도구 연동

- [ ] `--allowedTools`에 Browse 추가 (쿠팡 대시보드 조작)
- [ ] `CLAUDE_AD_AGENT.md`의 브라우저 네비게이션 가이드를 operator 프롬프트에 통합
- [ ] 세션 만료 감지 로직

## Phase 4: 전용 에이전트 추가

### 4-1. pricing 에이전트

```
type: 'pricing'
규칙 문서: PRICING_agent-config/rules/health-rules.md (신규 작성)
스케줄: '0 10 * * *' (매일 오전 10시)
판단 기준:
  - 마진율 < 30% → 가격 인상 추천
  - 원가율 > 70% → 소싱처 변경 추천
  - 경쟁사 대비 20% 이상 고가 → 가격 인하 추천
```

### 4-2. inventory_alert 에이전트

```
type: 'inventory_alert'
스케줄: '0 */6 * * *' (6시간마다)
판단 기준:
  - 재고 < 안전재고 → 발주 추천
  - 재고 0 + 판매 진행 중 → 긴급 알림
  - 입고 예정일 > 3일 + 재고 부족 → 대체 공급사 추천
```

### 4-3. review_monitor 에이전트

```
type: 'review_monitor'
스케줄: '0 9 * * *' (매일 오전 9시)
판단 기준:
  - 평점 < 3.5 → 리스팅 개선 추천
  - 최근 1주 악성 리뷰 급증 → 긴급 알림
  - 키워드 분석 → 개선 포인트 추출
```

## Phase 5: CLAUDE.md 최종 정리

Phase 2~4 완료 후 전체 문서 동기화:

- [ ] 루트 `CLAUDE.md` — 에이전트 아키텍처 최종 반영
- [ ] `apps/server/CLAUDE.md` — agent-registry 라우트 완성
- [ ] `agents/CLAUDE.md` — Python 에이전트만 남은 상태 반영
- [ ] `prisma/CLAUDE.md` — 모델 목록 업데이트
- [ ] `CLAUDE_AD_AGENT.md` — 삭제 또는 operator 프롬프트 가이드로 통합
- [ ] `agent-config/rules/operations.md` — pricing, inventory 규칙 추가
- [ ] `agent-config/rules/health-rules.md` — 현행 유지

## Phase 6: SaaS 대비 (장기)

- [ ] Tier 1 규칙 엔진: 정형 판단을 코드 로직으로 (비용 $0)
- [ ] Tier 2 배치 AI: 규칙 벗어나는 케이스만 AI 배치 분석
- [ ] Tier 3 Claude CLI: 사용자 요청/브라우저 조작만
- [ ] 셀러별 `monthlyTokenBudget` 과금 체계
- [ ] `agent_definitions`를 셀러가 직접 커스텀 (프롬프트 수정, 규칙 추가)

---

## 규칙 (작업 시 반드시 준수)

1. **기존 API 하위 호환 유지** — 라우트 삭제 금지, 내부만 위임
2. **NestJS 도메인 모듈 패턴 준수** — Controller + Service + Module 한 폴더
3. **Native PG enum 금지** → String + validation
4. **Python 에이전트 (content, image_edit, sourcing) 건드리지 않음** — 별도 런타임
5. **agent_definitions.type은 unique** — 중복 타입 등록 금지
6. **프롬프트 템플릿에 DB URL 하드코딩 금지** → `{{db_url}}` 변수 사용
7. **CLAUDE.md 변경 시 해당 Phase 완료 후에만** — 중간 상태로 문서 수정 금지

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 3 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**ENG REVIEW FINDINGS (Phase 2):**
- Issue 1: receiveResults() 후처리 → 2단계 콜백 (agent-registry 공통 + 도메인 후처리) ✅
- Issue 2: promptTemplate 정본 → seed-agents.ts ✅ (ad-agent buildPrompt() 제거)
- Issue 3: rules-scheduler → 유지하되 실행만 agent-registry.run() 위임 ✅
- Critical gap: 도메인 후처리 예외 시 silent failure → try/catch + logging 필수

**VERDICT:** ENG CLEARED — ready to implement Phase 2.
