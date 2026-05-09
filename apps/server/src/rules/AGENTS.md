# rules — Agent OS Delegation + Bulk SQL Post-Processing

비즈니스 규칙 평가는 **agent 비동기 spawn → result post-processing** 으로 처리.
CRUD 패턴이 아니라 Agent OS 에 위임하는 도메인.

## Owner domain — Business Policy Rules

이 폴더는 비즈니스 정책 룰 도메인이다. 룰 정의, threshold, 평가 결과
post-processing, activity event / critical alert 생성 계약을 소유한다.
Agent 실행은 Agent OS platform (`apps/server/src/agent-os/`) 이 소유하므로
`AGENT_RUNNER_PORT` 만 의존한다.

- `RulesController` 는 `RulesService` 만 의존한다. `AGENT_RUNNER_PORT` 와
  `AgentObservabilityService` 는 `RulesModule.imports = [AgentOsModule]` 으로
  주입되며 서비스 layer 에서만 사용한다.
- evaluation pattern: `AGENT_RUNNER_PORT.runByType('rules_evaluation', ...)`
  으로 `AgentRunRequest` 생성 → `AgentRun` 이 결과를 `resultJson` 에 기록 →
  Agent OS bridging 어댑터가 `RulesService.processEvaluationResult({
  organizationId, runId, products })` 를 invoke 해 healthScore bulk update +
  activity event + critical alert + panel emit 처리. 동기 rules 평가나
  service 내 hardcode 는 여전히 hard-banned.
- legacy `@OnEvent(AGENT_EVENTS.RESULT_READY)` 콜백은 더 이상 사용하지 않는다.
  `agent-registry/events/agent-events` 모듈은 삭제됐다. 결과 흐름은 Agent OS
  run 라이프사이클이 owner.

Alerts HTTP surface (`/api/alerts/*`) 와 `AlertsService` 는 `automation/`
owner domain 으로 이동했다. 새 위치:
`automation/adapter/in/http/alerts.controller.ts` +
`automation/application/service/alerts.service.ts` +
`automation/adapter/in/http/dto/alerts/`. `rules/` 는 더 이상 alerts
컨트롤러/서비스를 보유하지 않는다.

## Schedule routes — removed with the legacy port

`GET/PATCH /api/rules/schedule` 은 Agent OS 마이그레이션과 함께 삭제됐다.
legacy `AgentScheduleControlPort` 도 함께 사라졌고, 프론트 consumer 도 없다.
Agent OS 가 schedule 표면 (`AgentInstance.runtimeConfig` /
`AgentRunRequest.scheduledFor`) 을 도입하면 그 시점에 새 endpoint 로
재공개한다 (별도 plan + scoped instruction 갱신 필수). 임시 503 stub 은
contract drift 위험 때문에 두지 않는다.

## Directory

```
rules/
├── controllers/   # rules (1개)
├── services/      # rules, types (1 service + types)
├── dto/           # 2 DTO (list-rules, update-rule)
├── __tests__/     # rules.service.spec, rules-flow.spec, rules.controller.spec
└── rules.module.ts
```

## Routes

| Route | 책임 |
|---|---|
| `POST /api/rules/evaluate` | Agent OS spawn + return `{ requestId, status }` |
| `GET /api/rules/evaluate/status/:requestId` | `AgentObservabilityService.findRequest` 폴링 |
| `GET /api/rules` | 회사+카테고리별 룰 리스트 |
| `PATCH /api/rules/:id` | 룰 정의 update (tenant-scoped read 후 write) |
| `GET /api/rules/suggest-thresholds` | rules_suggest agent spawn |
| `GET /api/rules/summary` | 회사 healthScore distribution + topCritical |

## 핵심 패턴

### 1. Agent OS delegation

`POST /api/rules/evaluate` →
1. `AGENT_RUNNER_PORT.runByType('rules_evaluation', { organizationId, sourceType: 'rules.evaluation', payload: { organization_id } })` 호출
2. `AgentRunCoordinator` 가 `AgentRunRequest` 생성 → `requestId` 반환
3. 클라이언트는 `/api/rules/evaluate/status/:requestId` 로 `AgentObservabilityService.findRequest` 폴링
4. Agent OS 런타임 (`AgentRunExecutor`) 이 claim 하고 `AgentRun.resultJson` 에 결과 기록 후 `succeeded` 로 finalize
5. Agent OS bridging 어댑터가 `RulesService.processEvaluationResult` invoke
6. service 가 healthScore bulk update + activity event + critical alert + panel emit 수행

**동기 평가 절대 금지** — 항상 Agent OS 위임.

### 2. healthScore bulk update — Prisma updateMany + $transaction

healthScore 일괄 갱신은 `prisma.$transaction(products.map(r => prisma.masterProduct.updateMany({ where: { id: r.masterId, organizationId }, data: ... })))` 패턴을 사용한다. 각 update 의 where 절이 `(id, organizationId)` 로 스코프되므로 다른 회사 master 는 절대 갱신되지 않는다. unsafe raw SQL API 는 사용하지 않는다.

### 3. Critical alerts + panel emit batch cap

`PANEL_EMIT_BATCH_CAP = 50`. 51 건 이상이면 SSE flood 회피를 위해 단일
batch_summary item 을 emit. emit throw 는 catch 해 alert 생성 흐름은 깨지지
않는다.

## Rules

- 룰 평가는 **반드시 Agent OS (`AGENT_RUNNER_PORT`)**. 서비스 내 직접 평가 금지
- Critical 위반 → alert 자동 생성, 모든 위반 → activity_event 생성
- 회사 스코프: `@CurrentOrganization()` 데코레이터 필수. service 에서는
  `processEvaluationResult({ organizationId, ... })` argument 가 신뢰 경계
- Bulk update 는 Prisma updateMany + `{ id, organizationId }` where 절로 묶고
  `prisma.$transaction(...)` 으로 감싼다. `$queryRawUnsafe` /
  `$executeRawUnsafe` 는 절대 금지
- Status read 는 항상 `AgentObservabilityService.findRequest` /
  `findRun` 으로 가야 한다. `prisma.agentTask` 는 schema 에서 삭제됐다

## Prohibits

- ❌ 동기 룰 평가 (반드시 `AGENT_RUNNER_PORT.runByType` 호출)
- ❌ 룰 로직 코드에 hardcode (DB의 BusinessRule 테이블 + agent prompt 만)
- ❌ `$queryRawUnsafe` / `$executeRawUnsafe`
- ❌ legacy `agent-registry/*` import (모듈 삭제됨)
- ❌ legacy Prisma model (`AgentTask`, `AgentDefinition`, `HeartbeatRun`,
  `AgentEvent`, `AgentLog`, `AgentWakeupRequest`) 참조
- ❌ `@OnEvent(AGENT_EVENTS.RESULT_READY)` 콜백 (이벤트 자체 폐기)

## Cross-domain deps

- **agent-os** — `AGENT_RUNNER_PORT.runByType('rules_evaluation' | 'rules_suggest', ...)`,
  `AgentObservabilityService.findRequest`. Wired via `AgentOsModule` import in
  `RulesModule`.
- **automation** — `PANEL_EVENTS.UPSERT` (`adapter/out/panel-event/panel-events.ts`),
  `alertPanelMapper.mapToItem` (`mapper/panel-event/alert.mapper.ts`).
- **NestJS @nestjs/event-emitter** — `EventEmitter2.emit(PANEL_EVENTS.UPSERT, ...)`
  for panel SSE projection.

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Agent result 형식 변경 | `agent-config/prompts/agents/rules-evaluation.md` + `services/rules.service.ts` (`processEvaluationResult`) + `__tests__/rules-flow.spec.ts` + Agent OS bridging 어댑터 |
| 새 룰 카테고리 | DB seed (BusinessRule INSERT 마이그레이션) + `rules.service.ts:list filter` + 프론트 카테고리 enum |
| Bulk update 변경 | `services/rules.service.ts` healthScore $transaction 블록 — `(id, organizationId)` 스코프 유지 + unsafe raw SQL 금지 + `__tests__/rules-flow.spec.ts` & `rules.service.spec.ts` 의 $transaction/updateMany 모킹 동기화 |
| Schedule 재도입 | Agent OS schedule 표면 (`AgentInstance.runtimeConfig` / `AgentRunRequest.scheduledFor`) plan 작성 → 새 controller route + service method + DTO + frontend consumer 일괄 추가. 이 PR 에서 503 stub 은 제거됐다. |
