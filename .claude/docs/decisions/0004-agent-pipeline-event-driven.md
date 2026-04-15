---
id: 0004
title: Agent pipeline event-driven
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - apps/server/src/agent-registry
  - agents
---

## Context

초기 에이전트 아키텍처는 **매니저 패턴** — 중앙 매니저 에이전트가 하위 전문 에이전트들을 동기 호출하고 결과를 수집·반환하는 구조였다. 문제:

- 매니저가 하위 에이전트 호출을 동기로 기다려 **매니저 프로세스의 실행 시간이 전체 파이프라인 시간과 동치** — 병렬성 손실
- 하위 에이전트 실패 시 매니저 컨텍스트 전체가 실패 — 부분 재시도 어려움
- Python 에이전트 간 직접 import 금지(ADR-0003)로 매니저 → 전문 에이전트 직접 호출이 DB 경유 라운드트립으로 전환되며 매니저 패턴의 이점이 소멸
- 매니저 내 결과 집계 로직이 비대해져 단일 책임 위반 — 매니저는 "오케스트레이션" 만 해야 함
- 마켓플레이스·조직도 도입(에이전트를 동적으로 고용·해고) 과 매니저의 하드코딩된 호출 그래프가 충돌

## Decision

**에이전트 파이프라인을 이벤트 기반으로 전환한다.** 매니저가 하위 에이전트를 직접 호출하지 않는다. 대신:

- 각 전문 에이전트는 **자신이 처리 가능한 `agent_task` 타입** 에 대해 polling / subscription — 매니저는 태스크를 DB 에 등록만 하고 반환
- 에이전트 실행 결과는 `agent_event` 테이블에 기록. 다음 단계 에이전트는 이벤트 구독으로 트리거됨
- `heartbeat_run` 테이블이 각 실행 단위, `agent_wakeup_request` 가 트리거 이력을 담당
- Tool / Agent 분리: 단순 유틸리티는 Tool(동기 함수 호출), 판단·실행 주체는 Agent(DB 태스크 등록)
- DB 는 에이전트 관점에서 **읽기 전용** 이 기본 — 자기 결과만 `agent_event` / `heartbeat_run` 에 기록, 타 에이전트 상태 직접 수정 금지
- 에이전트 선택은 **마켓플레이스 → 고용 → 조직도** 흐름 — `agent_definition` 에 후보 등록, 회사 단위로 "고용" 상태 관리, 조직도에 따라 태스크 라우팅

## Consequences

**긍정**:
- 전문 에이전트들의 **병렬 실행** — 매니저 블록 없음. 파이프라인 전체 시간이 최장 단계 + DB 라운드트립 수준으로 단축.
- 부분 재시도 가능 — 실패한 단계만 `agent_task` 를 재큐잉.
- 새 전문 에이전트 추가가 매니저 코드 변경 없이 가능 — 새 에이전트가 관심 있는 태스크 타입에만 반응.
- 마켓플레이스·고용·조직도 메커니즘과 자연스럽게 맞물림.
- 디버깅·재현이 DB 상태 기반이라 쉬움(ADR-0003 과 정합).

**부정**:
- "태스크가 왜 안 움직였지 / 체인 어디서 끊겼지" 디버깅 난이도 상승 — 이벤트 체인이 흩어져 있어 전역 조회 UI 없이는 추적 어려움. 이게 바로 **트레이스 뷰어**(플랜 Workstream B)의 동기.
- 이벤트 기반이라 end-to-end 레이턴시가 동기 호출보다 길어짐. 실시간성 요구 시 polling 간격 튜닝 필요.
- 매니저 패턴에 익숙한 신규 멤버·에이전트에게 학습 비용.

**뒤따르는 제약**:
- 에이전트 간 통신은 DB 경유(ADR-0003). 직접 import 금지.
- 새 에이전트는 `agent_definition` 등록 + 마켓플레이스 경로로 도입. 매니저 코드에 하드코딩 금지.
- 트레이스/관측성 UI 가 동반돼야 실용 가능.

## Related

- ADR-0003 — Python agents communicate via DB (이 ADR 의 전제)
- ADR-0005 — No silent model fallback (관측성 유지 규칙)
- [플랜 Workstream B](../../../../.claude/plans/atomic-enchanting-willow.md) — 트레이스 뷰어 (이 ADR 의 디버깅 난이도를 상쇄)
- `apps/server/src/agent-registry/CLAUDE.md` — 에이전트 런타임, 프롬프트, 안전장치
