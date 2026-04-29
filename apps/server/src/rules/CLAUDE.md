# rules — Event-Driven Agent Callback + Bulk SQL

13 파일. 비즈니스 규칙 평가는 **agent 비동기 spawn → @OnEvent 콜백** 으로 처리. CRUD 패턴이 아니라 event-driven.

## Directory

```
rules/
├── controllers/   # rules, alerts (2개)
├── services/      # rules, alerts, types
├── dto/           # 4 DTO
├── __tests__/     # rules.service.spec, rules-flow.spec
└── rules.module.ts
```

## Routes

| Route | 책임 |
|---|---|
| `POST /api/rules/evaluate` | agent task spawn + return taskId |
| `GET /api/rules/evaluate/status/:taskId` | 폴링 |
| `GET /api/rules` | 회사+카테고리별 룰 리스트 |
| `GET/PATCH /api/rules/schedule` | 평가 cron 스케줄 |
| `PATCH /api/rules/:id` | 룰 정의 update |
| `GET /api/alerts` | alert 리스트 (isRead 필터) |

## 핵심 패턴

### 1. Event-driven Agent Callback (가장 중요)

```typescript
@OnEvent(AGENT_EVENTS.RESULT_READY)
async handleAgentResult(event) {
  // 비동기로 agent 가 완료한 결과를 받아 처리
  // → activity_events + critical alerts 생성
}
```

위치: `rules.service.ts:36-105`. **webhook이 아니라 EventEmitter2 in-process** (cross-service 결합 없음).

### 2. Async Task Spawning

`POST /api/rules/evaluate` →
1. `agentRegistry.run('rules_evaluation', ...)` → taskId 즉시 반환
2. 클라이언트가 `/status/:taskId` 로 폴링
3. Agent 완료 → AGENT_EVENTS.RESULT_READY emit → handler 가 alert 생성

**동기 평가 절대 금지** — 항상 agent 경유.

### 3. healthScore bulk update — Prisma updateMany + $transaction

healthScore 일괄 갱신은 `prisma.$transaction(products.map(r => prisma.masterProduct.updateMany({ where: { id: r.masterId, companyId }, data: ... })))` 패턴을 사용한다. 각 update 의 where 절이 `(id, companyId)` 로 스코프되므로 다른 회사 master 는 절대 갱신되지 않는다. unsafe raw SQL API 는 사용하지 않는다. raw SQL 이 필요할 때만 `prisma.$executeRaw` tagged template + `WHERE company_id = ${companyId}::uuid` 로 작성한다.

### 4. OnModuleInit 시드

`RulesService.onModuleInit()` — 기본 룰 seed.

## Rules

- 룰 평가는 **반드시 agent**. 서비스 내 직접 평가 금지
- Critical 위반 → alert 자동 생성, 모든 위반 → activity_event 생성
- 스케줄은 tenant-owned `rules_evaluation` agent config (cron) 에 저장. rules
  테이블 아님. 글로벌 catalog `AgentDefinition(companyId=null)` 은 모든
  tenant 가 공유하므로 schedule PATCH 로 수정하지 않는다. tenant-owned row
  가 없으면 GET 은 `disabled`, PATCH 는 400 을 반환한다.
- 회사 스코프: `@CurrentCompany()` 데코레이터 필수
- Bulk update 는 Prisma updateMany + `{ id, companyId }` where 절로 묶고 `prisma.$transaction(...)` 으로 감싼다. raw SQL 이 정말 필요하면 tagged template + `company_id = ${companyId}::uuid` bind 만 허용. `$executeRawUnsafe` 는 절대 금지.

## Prohibits

- ❌ 동기 룰 평가 (반드시 agent + AGENT_EVENTS.RESULT_READY 콜백)
- ❌ 룰 로직 코드에 hardcode (DB의 rules 테이블 + agent prompt 만)
- ❌ `$queryRawUnsafe` / `$executeRawUnsafe`

## Cross-domain deps

- **agent-registry** — `AgentRegistry.findByType('rules_evaluation')`, `AgentRegistry.run()`
- **NestJS @nestjs/event-emitter** — `AGENT_EVENTS.RESULT_READY`

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Agent result 형식 변경 | `agent-config/prompts/agents/rules-evaluation.md` + `services/rules.service.ts:36-105` (handler) + `__tests__/rules-flow.spec.ts` |
| 새 룰 카테고리 | DB seed (`onModuleInit`) + `rules.service.ts:list filter` + 프론트 카테고리 enum |
| Bulk update 변경 | `services/rules.service.ts` healthScore $transaction 블록 — `(id, companyId)` 스코프 유지 + unsafe raw SQL 금지 + `__tests__/rules-flow.spec.ts` & `rules.service.spec.ts` 의 $transaction/updateMany 모킹 동기화 |
| 스케줄 cron 변경 | `controllers/rules.controller.ts:schedule` + `agent-registry/heartbeat/heartbeat.service.ts:replaceAgentTimer` |
