# TODOS

Cross-cutting deferred work. Each item has Context (why), Depends on (blockers), and Acceptance (what "done" looks like).

---

## prod 인증 이행 — PanelSseClient 헤더 주입 교체

**Context**: 현재 `apps/web/src/components/panel/lib/panel-sse-client.ts` 는 `x-dev-user-id` 헤더로 DevAuthMiddleware(ADR-0006) 와 통신. 프로덕션 인증이 도입되면 이 헤더는 무효화되고 `Authorization: Bearer <jwt>` 또는 동등 메커니즘으로 교체 필요. ADR-0010 Consequences 에도 "프로덕션 인증 레이어 교체 시 헤더 주입 로직 갱신" 이 예고되어 있으나 구체 체크리스트 부재.

**Depends on / blocked by**:
- ADR-0006 후속 (Phase 0.4 또는 별도 PR) 에서 JWT 발급/검증 레이어 도입이 선행
- `apps/server/src/auth/` 에 JwtAuthGuard 또는 동등 교체 선행
- `apps/web/src/lib/api-client.ts` 의 일반 API 호출도 동일 헤더로 전환 조율

**Acceptance (완료 조건)**:
- [ ] `PanelSseClient.connect()` 에서 `x-dev-user-id` 헤더 주입 제거
- [ ] 발급된 토큰(세션 저장소에서 조회) 을 `Authorization: Bearer <token>` 으로 주입
- [ ] 토큰 만료 시 재발급 경로 (refresh token 또는 재로그인) 와 SSE 재연결 연동
- [ ] ADR-0010 을 supersede 하는 새 ADR 작성 (또는 본 ADR 갱신) — prod 인증 방식 결정 기록
- [ ] 쿠키 기반 전환을 선택했다면 `apps/server/src/main.ts` 의 `enableCors` 에 `credentials: true` 동시 추가 + 클라이언트 `credentials: 'include'` 재도입
- [ ] `apps/web/src/components/panel/lib/__tests__/panel-sse-client.spec.ts` 의 `x-dev-user-id` 단언 → 새 auth 방식 단언으로 교체

**Refs**: ADR-0006, ADR-0010, `apps/web/src/components/panel/lib/panel-sse-client.ts`

---

## useProductImages — error state 반환 + 3 consumer 적용

**Context**: `apps/web/src/hooks/useProductImages.ts:22-24` 는 fetch 실패 시 `catch(() => setImages([]))` 로 silent fallback. "이미지 0장 (정상)" 과 "fetch 실패" 를 호출자가 구분 불가. `/image-hub`, `/generate`, 신규 `HubImagePickerModal` 모두 같은 hook 사용, 공통 이슈.

**Depends on / blocked by**:
- 선행 의존성 없음. 독립적 PR 가능.
- 2026-04-16 thumbnail-editor hub-import PR 이후에 착수 권장 (모달 mount 테스트 케이스 확보 후).

**Acceptance (완료 조건)**:
- [ ] `useProductImages` 에 `error: Error | null` 반환 추가. 기본값 null, fetch 실패 시 error 객체 보관.
- [ ] `/image-hub` page — error 시 "이미지 로드 실패 · 다시 시도" 버튼 표시 (기존 loading 영역 확장).
- [ ] `/generate` page — error 시 같은 패턴 재사용.
- [ ] `HubImagePickerModal` — error 시 empty state 대신 에러 배너 + retry 버튼.
- [ ] `refetch()` 함수 hook 에서 export (수동 재시도용).
- [ ] `apps/web/src/hooks/__tests__/useProductImages.test.ts` 에 error path 케이스 추가.

**Refs**: `apps/web/src/hooks/useProductImages.ts`, `apps/web/src/app/image-hub/page.tsx`, `apps/web/src/app/generate/page.tsx`, `docs/superpowers/specs/2026-04-16-thumbnail-editor-hub-import-design.md` (이 PR 에서 모달 silent fallback 감지)
