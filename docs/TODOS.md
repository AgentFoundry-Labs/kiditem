# TODOS

## Agent System Engineering Review (2026-03-28)

Source: `/plan-eng-review` on `agents/` directory, `main` branch.

### Immediate — 전체 완료 또는 폐기 (2026-04-06 정리)

| # | Task | Status | 비고 |
|---|------|--------|------|
| 1 | ~~RenderAgent 삭제~~ | ✅ 완료 | |
| 2 | ~~agent별 transaction~~ | ✅ 정상 설계 | processing→작업→커밋은 long-running 표준 패턴 |
| 3 | ~~agent별 timeout~~ | ✅ 완료 | BaseAgent.timeout_seconds |
| 4 | ~~순환 의존성 해소~~ | ✅ 완료 | runner.py → server.py 전환 |
| 5 | ~~SourcingAgent 에러 패턴~~ | — 폐기 | sourcing 서버 미등록 (비활성 코드) |
| 6 | ~~structlog 통일~~ | — 폐기 | 활성 에이전트 이미 structlog 사용 |
| 7 | ~~Matcher1688 파라미터화~~ | — 폐기 | sourcing 서버 미등록 |
| 8 | ~~pg_notify 수정~~ | ✅ 완료 | legacy fallback 분기 전체 삭제 (2026-04-06) |
| 9 | ~~InventoryAgent N+1~~ | — 폐기 | InventoryAgent 서버 미등록 |

### Short-term — 전체 폐기 (2026-04-06 정리)

| TODO | Status | 비고 |
|------|--------|------|
| A: 테스트 31%→80% | 폐기 | 대상 4개 중 3개 비활성 (Runner 삭제, Inventory/Sourcing 미등록). 현재 22 files/116 tests가 프로젝트 철학에 적합 |
| B: Runner retry | 폐기 | runner.py 삭제됨. HTTP 모델에서는 HeartbeatService가 retry 담당 |
| C: Langfuse 확산 | 폐기 | 대상 에이전트 비활성. ImageEdit은 stateless |
| F: agent-registry 통합 테스트 14개 | 이미 충족 | 12개 테스트 파일, 116 tests. run/safety/delegation 커버됨 |

### Medium-term — 전체 폐기 (2026-04-06 정리)

| TODO | Status | 비고 |
|------|--------|------|
| D: worker pool | 폐기 | runner.py 삭제됨. HTTP 모델은 요청별 독립 처리 |
| E: Graceful shutdown | 폐기 | runner.py 삭제됨. FastAPI/uvicorn이 관리 |
