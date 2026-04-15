# Graph Report - apps/server/src/rules  (2026-04-14)

## Corpus Check
- Corpus is ~3,278 words - fits in a single context window. You may not need a graph.

## Summary
- 69 nodes · 56 edges · 19 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (12n)|Cluster 0 (12n)]]
- [[_COMMUNITY_Cluster 1 (11n)|Cluster 1 (11n)]]
- [[_COMMUNITY_Cluster 2 (7n)|Cluster 2 (7n)]]
- [[_COMMUNITY_Cluster 3 (7n)|Cluster 3 (7n)]]
- [[_COMMUNITY_Cluster 4 (6n)|Cluster 4 (6n)]]
- [[_COMMUNITY_Cluster 5 (6n)|Cluster 5 (6n)]]
- [[_COMMUNITY_Cluster 6 (3n)|Cluster 6 (3n)]]
- [[_COMMUNITY_Cluster 7 (2n)|Cluster 7 (2n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (2n)|Cluster 11 (2n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]
- [[_COMMUNITY_Cluster 16 (1n)|Cluster 16 (1n)]]
- [[_COMMUNITY_Cluster 17 (1n)|Cluster 17 (1n)]]
- [[_COMMUNITY_Cluster 18 (1n)|Cluster 18 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `RulesService` - 11 edges
2. `RulesController` - 10 edges
3. `AlertsController` - 5 edges
4. `AlertsService` - 5 edges
5. `Event-driven Agent Callback` - 4 edges
6. `Async Task Spawning` - 4 edges
7. `OnModuleInit seed` - 3 edges
8. `services/rules.service.ts` - 3 edges
9. `services/rules.service.ts:36-105 (handler)` - 3 edges
10. `Bulk SQL CASE update` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Event-driven Agent Callback` --rationale_for--> `services/rules.service.ts:36-105 (handler)`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 2 → community 6_
- `Async Task Spawning` --rationale_for--> `services/rules.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 2 → community 3_

## Communities

### Community 0 - "Cluster 0 (12n)"
Cohesion: 0.18
Nodes (1): RulesService

### Community 1 - "Cluster 1 (11n)"
Cohesion: 0.2
Nodes (1): RulesController

### Community 2 - "Cluster 2 (7n)"
Cohesion: 0.33
Nodes (7): agent-registry/heartbeat/heartbeat.service.ts:replaceAgentTimer, controllers/rules.controller.ts, Async Task Spawning, Event-driven Agent Callback, 동기 룰 평가 금지 (반드시 agent + AGENT_EVENTS.RESULT_READY 콜백), 룰 평가는 반드시 agent (서비스 내 직접 평가 금지), Critical 위반 → alert 자동 생성, 모든 위반 → activity_event 생성

### Community 3 - "Cluster 3 (7n)"
Cohesion: 0.29
Nodes (7): services/rules.service.ts, services/rules.service.ts:51-56 (bulk SQL), Bulk SQL CASE update, OnModuleInit seed, 룰 로직 코드 hardcode 금지 (DB rules + agent prompt 만), $executeRawUnsafe 입력값 sanitization (enum 화이트리스트 강제), 스케줄은 agent config(cron)에 저장, rules 테이블 아님

### Community 4 - "Cluster 4 (6n)"
Cohesion: 0.33
Nodes (1): AlertsController

### Community 5 - "Cluster 5 (6n)"
Cohesion: 0.33
Nodes (1): AlertsService

### Community 6 - "Cluster 6 (3n)"
Cohesion: 1.0
Nodes (3): agent-config/prompts/agents/rules-evaluation.md, __tests__/rules-flow.spec.ts, services/rules.service.ts:36-105 (handler)

### Community 7 - "Cluster 7 (2n)"
Cohesion: 1.0
Nodes (1): RulesModule

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (1): UpdateRuleBodyDto

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (1): ListRulesQueryDto

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (1): ListAlertsQueryDto

### Community 11 - "Cluster 11 (2n)"
Cohesion: 1.0
Nodes (1): UpdateScheduleBodyDto

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): 회사 스코프: @CurrentCompany() 데코레이터 필수

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (1): webhook이 아닌 EventEmitter2 in-process (cross-service 결합 없음)

### Community 16 - "Cluster 16 (1n)"
Cohesion: 1.0
Nodes (1): healthScore 일괄 갱신 시 개별 update 루프 대신 CASE 문으로 성능 개선

### Community 17 - "Cluster 17 (1n)"
Cohesion: 1.0
Nodes (1): rules.module.ts

### Community 18 - "Cluster 18 (1n)"
Cohesion: 1.0
Nodes (1): __tests__/rules.service.spec.ts

## Knowledge Gaps
- **15 isolated node(s):** `RulesModule`, `UpdateRuleBodyDto`, `ListRulesQueryDto`, `ListAlertsQueryDto`, `UpdateScheduleBodyDto` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 7 (2n)`** (2 nodes): `RulesModule`, `rules.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `update-rule.dto.ts`, `UpdateRuleBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `list-rules.dto.ts`, `ListRulesQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `list-alerts.dto.ts`, `ListAlertsQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (2n)`** (2 nodes): `update-schedule.dto.ts`, `UpdateScheduleBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `회사 스코프: @CurrentCompany() 데코레이터 필수`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `webhook이 아닌 EventEmitter2 in-process (cross-service 결합 없음)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (1n)`** (1 nodes): `healthScore 일괄 갱신 시 개별 update 루프 대신 CASE 문으로 성능 개선`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (1n)`** (1 nodes): `rules.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (1n)`** (1 nodes): `__tests__/rules.service.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Async Task Spawning` connect `Cluster 2 (7n)` to `Cluster 3 (7n)`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `services/rules.service.ts` connect `Cluster 3 (7n)` to `Cluster 2 (7n)`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `RulesModule`, `UpdateRuleBodyDto`, `ListRulesQueryDto` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._