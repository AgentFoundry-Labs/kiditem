# TODOS

## Agent System Engineering Review (2026-03-28)

Source: `/plan-eng-review` on `agents/` directory, `main` branch.

### Immediate (이번 PR)

구현 결정은 완료. 별도 구현 세션에서 작업.

| # | Task | Files | Est (CC) |
|---|------|-------|----------|
| 1 | RenderAgent 삭제 | `agents/src/agents/render/` | ~30초 |
| 2 | agent별 transaction 추가 | `inventory.py`, `sourcing/agent.py`, `content/agent.py` | ~5분 |
| 3 | agent별 timeout (BaseAgent.timeout_seconds) | `base.py`, `runner.py` | ~5분 |
| 4 | 순환 의존성 해소 (callback 주입) | `content/agent.py`, `runner.py` | ~3분 |
| 5 | SourcingAgent 에러 패턴 통일 (raise) | `sourcing/agent.py` | ~2분 |
| 6 | 로깅 structlog 통일 | `runner.py`, `sourcing/agent.py`, `inventory.py` | ~5분 |
| 7 | Matcher1688 pool 메서드 파라미터화 | `sourcing/agent.py`, `matcher_1688.py` | ~2분 |
| 8 | NestJS pg_notify 누락 수정 | `apps/server/src/sourcing/sourcing.service.ts` | ~30초 |
| 9 | InventoryAgent N+1 쿼리 최적화 | `inventory.py` | ~3분 |

### Short-term (다음 PR)

#### TODO-A: 테스트 커버리지 31% → 80%+

**What:** Runner, InventoryAgent, SourcingAgent, ImageEditAgent 테스트 작성
**Why:** ContentAgent만 테스트 있음. 4개 agent + runner 완전 미검증. 리팩토링 안전성 없음.
**Pros:** 회귀 방지, 리팩토링 자신감
**Cons:** ~2시간 CC 소요
**Context:** `agents/tests/conftest.py`에 AsyncMock 픽스처 있음. ContentAgent 테스트 패턴 따라가면 됨.
**Priority:** Runner > InventoryAgent > SourcingAgent > ImageEditAgent
**Depends on:** Immediate 항목 완료 후 (에러 패턴 통일, 트랜잭션 등 반영된 코드 기준으로 작성)

#### TODO-B: Runner 레벨 retry 로직

**What:** process_task()에 retryable error 구분 + exponential backoff retry (max 2회)
**Why:** FAL.AI/TMAPI 일시적 503 → 영구 실패로 기록됨. 사용자 수동 재시도 필요.
**Pros:** 자동 복구, 안정성 향상
**Cons:** retryable/non-retryable 에러 분류 필요 (TimeoutError, ConnectionError = retry, ValueError = no retry)
**Context:** timeout 추가 후에야 의미 있음. `agent_tasks` 테이블에 `retry_count` 컬럼 추가 고려.
**Depends on:** Immediate #3 (타임아웃)

#### TODO-C: Langfuse 트레이싱 확산

**What:** InventoryAgent, SourcingAgent, ImageEditAgent에 @observe 데코레이터 추가
**Why:** Cloud Langfuse 사용 중. ContentAgent만 트레이싱됨. 나머지 agent 비용/성능 미추적.
**Pros:** 전체 agent 모니터링, AI 호출 비용 가시성
**Cons:** 기능에 영향 없음
**Context:** Langfuse SDK v4 설치 완료. `from langfuse import observe` 후 `@observe(name="agent-name")` 추가.
**Depends on:** 없음

### Medium-term

#### TODO-D: 동시 처리 (worker pool)

**What:** drain_pending()을 N개 worker coroutine 패턴으로 변경
**Why:** 순차 처리라 ContentAgent 40초 걸리면 InventoryAgent(0.5초)도 40초 대기.
**Pros:** 스루풋 향상
**Cons:** pool 경합, 로깅 복잡도, 에러 처리 난이도 증가
**Context:** 현재 규모에서는 병목 아님. 태스크 동시 실행량이 늘면 필요.
**Depends on:** Immediate #3 (타임아웃), TODO-B (retry)

#### TODO-E: Graceful shutdown 개선

**What:** handle_shutdown()에서 in-flight 태스크 완료 대기 (drain period)
**Why:** 현재는 running=False만 설정. 실행 중 태스크가 중단될 수 있음.
**Depends on:** TODO-D (worker pool) 구현 시 같이 하는 게 효율적

## Phase 2 리팩토링 후 테스트 (2026-03-31)

Source: `/plan-eng-review` on `feat/ad-strategy-agent` branch.

#### TODO-F: agent-registry + ad-agent + rules 통합 테스트 14개

**What:** agent-registry.run(), receiveResults(), buildPrompt(), ad-agent/rules 위임 레이어 테스트
**Why:** NestJS 에이전트 시스템 테스트 0개. 리팩토링으로 spawn/prompt/callback이 agent-registry에 집중되므로, 여기에 테스트 집중.
**Pros:** 회귀 방지, 향후 Phase 3~4 에이전트 추가 시 안전망
**Cons:** ~15분 CC 소요
**Context:** spawn은 mock (child_process), DB는 PrismaService mock. receiveResults() 도메인 후처리 (healthScore 업데이트, alert 생성) 포함.
**Priority:** agent-registry.run() > receiveResults() 2-stage > rules post-processing > ad-agent post-processing
**Depends on:** Phase 2 완료
