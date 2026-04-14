---
id: 0005
title: No silent model fallback
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - apps/server/src/agent-registry
  - agents
---

## Context

에이전트·서비스 코드에서 LLM 모델을 선택할 때 흔한 패턴:

```python
def run_agent(model: str | None = None):
    model = model or DEFAULT_MODEL
    ...
```

```typescript
function runAgent(model?: string) {
  const m = model ?? DEFAULT_MODEL;
  ...
}
```

이 패턴의 문제:
- 호출자가 model 을 지정했다고 착각하는데 실제로 기본값으로 실행 — **silent fallback**
- 어느 실행이 의도된 model 이었고 어느 실행이 fallback 이었는지 **관측 불가** — `agent_event` 로그에 기록된 model 이 실제 실행 model 인지, 호출자 의도와 일치하는지 구분 안 됨
- 특정 태스크에 비싼 model 이 필요한데 호출자가 오타 등으로 `None` 을 넘기면 조용히 싼 기본 model 로 실행 → 품질 저하를 알아채기까지 지연
- 비용 증가도 반대 방향에서 가능 — 싼 model 의도한 호출이 기본값(비싼 것)으로 실행되는 경우

이벤트 기반 파이프라인(ADR-0004)과 결합하면, model 선택이 조용히 바뀌었을 때 전체 체인에서 원인 추적이 극도로 어려움.

## Decision

**Silent model fallback 패턴 금지.** `model = model or default` / `model ?? default` 형태의 암묵적 기본값 적용을 하지 않는다. 대신:

- **Explicit 요구** — 모든 LLM 호출 지점에서 model 을 **필수 인자**로 받음. 호출자가 명시해야 함.
- 기본값이 필요한 고수준 API 엔트리포인트(예: 에이전트 정의 로딩 시점)에서는 기본값을 **명시적으로 표기**하고 로그에 "defaulted from None to X" 경고 기록 — silent 금지.
- 기본값이 적용된 호출은 `agent_event` / `heartbeat_run` 에 `model_source: 'explicit' | 'default'` 같은 메타데이터로 기록 — 추적 가능하게.
- 재시도·fallback (예: model A 실패 시 model B 로 재실행) 이 필요한 경우도 명시적 설계 — 실패 로깅 + 이유 + 재시도 model 을 이벤트에 기록.

## Consequences

**긍정**:
- Model 선택이 투명해짐 — `agent_event` 조회로 어느 호출이 어느 model 을 사용했는지 정확히 확인 가능.
- 비용·품질 이상 감지 속도 향상 — 의도와 다른 model 사용이 즉시 드러남.
- 이벤트 기반 파이프라인 디버깅의 핵심 단서 확보 (ADR-0004 와 결합).

**부정**:
- 호출자 코드가 장황해짐 — 매 호출 지점에서 model 명시 필요.
- 기존 코드 마이그레이션 부채 — `model or default` 패턴을 grep 으로 찾아 정리해야 함.
- "기본값 하나만 합리적으로 잡으면 될 걸 왜" 라는 반복 질문 발생.

**뒤따르는 제약**:
- 새 LLM 호출 코드는 model 을 필수 인자로. PR 리뷰에서 `model or default` / `model ?? default` 패턴은 reject.
- 기본값이 불가피한 구성 엔트리포인트는 로그 + 이벤트 메타데이터로 명시 표시.
- 트레이스 뷰어(플랜 Workstream B) 는 `model_source` 메타데이터를 UI 에 노출해야 이 정책이 실효 가짐.

## Related

- Root `CLAUDE.md` Cross-Domain Rules — "No silent model fallback"
- ADR-0004 — Agent pipeline event-driven (이 ADR 이 관측성의 기초)
- `apps/server/src/agent-registry/CLAUDE.md` — 에이전트 런타임, 프롬프트, 안전장치
- `agents/CLAUDE.md` — Python 에이전트 LLM 호출 규칙
