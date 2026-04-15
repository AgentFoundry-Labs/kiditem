---
id: 0003
title: Python agents communicate via DB
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - agents
---

## Context

`agents/` 디렉터리의 Python 3.11+ 에이전트들은 초기엔 서로 직접 import 해서 기능을 공유했다. 결과:

- **순환 import** — 에이전트 A 가 에이전트 B 의 유틸을, B 가 다시 A 의 타입을 import 하면서 Python 모듈 로드 순서에 따라 `ImportError` / `AttributeError` 발생
- **import 순서 민감성** — 한 에이전트의 top-level import 가 다른 에이전트의 초기화를 유발, 그 에이전트가 아직 준비 안 된 리소스(예: DB 연결)를 참조하는 사고
- 테스트·핫리로드 시 재현되지 않는 간헐적 실패

## Decision

**Python 에이전트 간 직접 import 금지.** 에이전트 간 통신은 **DB 상태만** 경유한다.

- 각 에이전트는 자신의 `agents/<agent_name>/` 폴더 안에서 완결. 타 에이전트 모듈을 `from agents.other_agent import ...` 형태로 참조 금지
- 공유 인프라(DB 클라이언트, 로깅, 설정, 타입)는 `agents/src/core/` 또는 `agents/src/shared/` 에 격리 — 에이전트들은 이 공유 레이어만 import
- 에이전트 간 결과 전달은 DB 테이블(`agent_task`, `agent_event`, `heartbeat_run`, `agent_wakeup_request`) 을 통해 비동기적으로. 직접 함수 호출 금지
- 필요하면 NestJS 서버 API 를 경유(Python → HTTP → NestJS → DB)

## Consequences

**긍정**:
- 순환 import 원천 차단. 각 에이전트는 독립 모듈.
- 에이전트 배포·스케일을 개별적으로 가능 — 한 에이전트 재시작이 타 에이전트에 영향 없음.
- DB 상태가 소스 오브 트루스 — 디버깅·재현이 쉬움.
- 에이전트 결과 처리를 이벤트 기반 파이프라인(ADR-0004)으로 자연스럽게 연결.

**부정**:
- 직접 함수 호출보다 레이턴시 높음(DB round-trip). 실시간성이 중요한 파이프라인은 설계 단계에서 수용.
- "에이전트가 다른 에이전트의 로직을 그냥 호출하면 안 되나?" 에 대한 반복 질문 발생 — 이 ADR 이 답.
- 공유 유틸을 `core/` 에 격리하는 디자인 비용. 기능을 에이전트별로 복제하면 또 다른 DRY 위반.

**뒤따르는 제약**:
- `agents/CLAUDE.md` 에 이 규칙이 반영돼야 함.
- PR 리뷰에서 `from agents.another_agent import` 패턴은 reject.
- 에이전트 결과 처리는 `agent_event`/`heartbeat_run` 기반 이벤트 파이프라인(ADR-0004).

## Related

- [`.claude/docs/lessons.md`](../lessons.md) — "Python Agent Circular Import" 엔트리(축약된 포인터)
- ADR-0004 — Agent pipeline event-driven (이 ADR 의 파생, 이벤트 기반 결과 전달이 이 정책의 필연적 귀결)
- `agents/CLAUDE.md` — Python 에이전트 런타임 규칙
