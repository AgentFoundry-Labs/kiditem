---
id: 0010
title: Panel 도메인 SSE 프론트엔드 예외
status: Accepted
date: 2026-04-15
supersedes: []
superseded-by: null
affects:
  - apps/web
---

## Context

`apps/web/src/app/agents/CLAUDE.md:109` 에는 EventSource 및 직접 스트리밍 금지 규정(`❌ EventSource / 직접 streaming`) 이, `apps/web/src/app/thumbnails/CLAUDE.md:55` 에는 EventSource·WebSocket 금지 규정(`❌ EventSource / WebSocket`) 이 있다. 금지 이유는 브라우저 표준 `EventSource` API 가 HTTP 헤더를 지정할 수 없기 때문이다. KidItem 서버는 `DevAuthMiddleware` (ADR-0006) 를 통해 `x-dev-user-id` 헤더로 사용자를 식별하는데, 헤더 없이 연결을 열면 인증 컨텍스트를 얻지 못해 401 이 반환된다. `apps/web/src/lib/api-client.ts:5` 주석에 동일한 이유가 기록되어 있다.

Panel Live Ops 기능은 실시간 "live 파노라마" 경험을 요구한다: 작업 상태·알림·Action Board 항목이 변경될 때 브라우저가 즉시 반응해야 한다. 폴링(polling) 으로 이 경험을 구현하면 1초 미만 대기 시간을 위해 과도한 HTTP 요청이 발생하고, 서버 측에서 SSE 멀티플렉스 채널을 설계한 이점이 사라진다.

`@microsoft/fetch-event-source` 는 Fetch API 기반 SSE 구현체로, 헤더 포함·자동 재연결·`Last-Event-ID` 재개를 지원한다. 기존 `EventSource` 금지 규정이 막는 문제(헤더 불가) 를 기술적으로 해소하면서 단방향 스트리밍(SSE) 에 한정된다.

## Decision

**Panel 도메인(`apps/web/src/components/panel/`) 한정으로 `@microsoft/fetch-event-source` 를 허용한다.**

- fetch 기반이므로 `x-dev-user-id` 등 임의 헤더 전송 가능 → DevAuthMiddleware 호환.
- 자동 재연결 + `Last-Event-ID` 헤더 전송으로 연결 끊김 시 메시지 재개 지원.
- Panel 내부에서만 사용하는 래퍼 `PanelSseClient` 로 격리. 직접 `fetchEventSource()` 호출을 컴포넌트에 분산하지 않는다.
- 다른 도메인(agents, thumbnails) 은 기존 폴링 방식을 유지한다. SSE 가 필요한 신규 도메인은 별도 ADR 을 발행해 사례별로 검토한다.

## Alternatives Rejected

| 대안 | 기각 이유 |
|---|---|
| 쿼리 파라미터 인증(`?token=...`) | 프로덕션 인증 정책 충돌. URL 로그·프록시 캐시에 토큰 노출 위험. ADR-0006 의 "클라이언트 입력 신뢰 금지" 정신과 배치됨 |
| WebSocket | Panel Live Ops 는 서버→클라이언트 단방향 스트림. 양방향 채널 불필요. 연결 관리 복잡도가 SSE 대비 높음 |
| 전면 폴링 유지 | 1초 미만 반응성 목표 달성 불가. 서버 측 SSE 멀티플렉스 설계 이점 소멸. Panel 이 "live 파노라마" 가 아닌 일반 조회 페이지로 전락 |
| 표준 `EventSource` | 헤더 전송 불가 → DevAuthMiddleware 미인식 → 401. 금지 규정의 근본 원인과 동일 |

## Consequences

**긍정**:
- Panel 도메인에서 실시간 반응성 확보. 작업 상태·알림·Action Board 변경이 폴링 대기 없이 즉시 반영.
- `PanelSseClient` 래퍼로 격리. 다른 도메인은 기존 규칙에 영향 없음.
- 번들 크기 영향 최소 — `@microsoft/fetch-event-source` ~5 KB (gzip) 추가.
- `Last-Event-ID` 지원으로 네트워크 단절 후 재연결 시 누락 이벤트 복구 가능.

**부정·트레이드오프**:
- npm 의존성 1개 추가. 패키지 유지보수 상태 주기적 확인 필요.
- SSE 연결이 활성화된 상태에서 브라우저 탭을 오래 열어두면 서버 측 커넥션 누적 가능. 서버 SSE 핸들러에서 연결 수 모니터링 필요.

**뒤따르는 제약**:
- `fetchEventSource` 직접 호출은 `apps/web/src/components/panel/` 내부의 `PanelSseClient` 에만 허용. 다른 경로에서 호출 시 PR 리뷰 reject 대상.
- agents, thumbnails 도메인은 이 ADR 적용 대상이 아님. 해당 도메인 CLAUDE.md 의 금지 규정 그대로 유지.
- 신규 도메인이 SSE 를 원할 경우 동일 라이브러리를 단순히 참조하지 않고 별도 ADR 발행 후 채택 여부 결정.
- 프로덕션 인증 레이어 교체 시(ADR-0006 후속) `PanelSseClient` 의 헤더 주입 로직도 함께 갱신.
- `credentials: 'include'` 사용 금지. 현 dev auth(`x-dev-user-id`) 는 헤더 기반이라 쿠키 전송 불필요. 서버 CORS(`apps/server/src/main.ts`) 도 `credentials: true` 미설정 상태이므로 클라이언트가 `include` 를 보내면 브라우저가 fetch 를 reject → 전역 "Failed to fetch". 프로덕션 인증이 세션 쿠키 방식으로 전환될 경우 본 ADR 을 supersede 하는 후속 ADR 에서 서버 CORS `credentials: true` 와 함께 재도입.

## Related

- [ADR-0006](0006-authenticated-company-scope.md) — DevAuthMiddleware(`x-dev-user-id`) 설계. 이 ADR 의 헤더 필요성 근거
- `apps/web/src/app/agents/CLAUDE.md:109` — `❌ EventSource / 직접 streaming` 규정 (agents 도메인)
- `apps/web/src/app/thumbnails/CLAUDE.md:55` — `❌ EventSource / WebSocket` 규정 (thumbnails 도메인)
- `apps/web/src/lib/api-client.ts:5` — 금지 이유 주석
- 설계 문서: `docs/superpowers/specs/2026-04-15-panel-live-ops-design.md` (Panel Live Ops design — SSE multiplex + Alert→Task + Action Board)
- 세션 브랜치: `feat/panel-live-ops`
