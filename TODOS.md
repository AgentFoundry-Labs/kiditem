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

---

## Agent/Workflow 재설계 — 제품 액션 계약 (post product-contract-rewire)

**Context**: `docs/superpowers/plans/2026-04-24-product-contract-rewire.md` 가 product read path 만 배달하면서 복잡 write 경로의 **backend 연결**을 제거함. 상태:

- 프론트 `apps/web/src/app/products/[id]/hooks/useProductActions.ts` 의 4 액션 (adjust_price / stop_ads / discontinue / change_grade) — UI 버튼 + 확인 모달은 그대로 유지됨. Hook 의 `product.*` 브랜치는 legacy `PATCH /api/products/:id` 호출을 제거하고 "기능 준비 중" 토스트만 남김. 본 TODO 는 canonical 계약 확정 후 이 hook 에 `/api/products/masters/:id` + `/api/products/options/:optionId` write 배선 복구가 목표.
- 백엔드는 compile-only 로 남겨둠: `apps/server/src/workflows/actions/catalog.ts:27,37,47,62` 의 액션 템플릿은 legacy URL 문자열 그대로라 런타임 404 발생 (accepted breakage)
- `apps/server/src/action-task/action-task.service.ts:411,419,435,453` 의 write-like `/api/products/*` 호출도 동 위

스펙 §6.1 write-path matrix 가 캐노니컬 계약 확정 — 이걸 구현체로 옮기고 + multi-option picker UX + workflow/agent action 체계 재설계 함께 진행.

**Depends on / blocked by**:
- Product contract rewire PR 선착 (공유 타입/카탈로그 엔드포인트/GET alias 존재 전제)
- Agent 자율성 레벨 (feedback_agent_autonomy_levels memory: 챗봇 = HITL, 매니저 = 자율) 기반으로 workflow action trigger 신뢰모델 재검토

**Acceptance (완료 조건)**:
- [ ] Master/Option 레벨 PATCH 를 분기하는 UI hook (`useProductActions` 부활 or 대체) — spec §6.1 write-path matrix 준수
- [ ] Multi-option master 의 sell price 쓰기 — option picker UI (단일옵션이면 자동 선택, 그 외에는 명시적 선택)
- [ ] `stop_ads` 의 `adTier: 'off'` vs `null` 결단 + 서버 count 정합
- [ ] `workflows/actions/catalog.ts` 액션 템플릿 재작성 — `/api/products/masters/:id` + `/api/products/options/:optionId` 직접 호출로
- [ ] `action-task.service.ts` 의 `/api/products/*` write 호출 재작성 (필요시 `/calculate-grades` POST 재도입 결정 포함)
- [ ] Legacy alias 컨트롤러에서 PATCH/PUT 안 열고 이전 PR 의 GET-only 상태 유지 (write 는 모두 canonical 경로)
- [ ] `AddProductModal` 옵션 생성 flow — master 생성 후 옵션 추가 wizard/모달 (현재는 master-only)
- [ ] Activity feed subscription 이 `/api/products/masters/:id` + `/options/:optionId` 쓰기에 반응하는지 검증

**Refs**:
- `docs/superpowers/specs/2026-04-24-product-contract-rewire-design.md` §6.1 write-path matrix
- `docs/superpowers/plans/2026-04-24-product-contract-rewire.md` §Deferred Work
- `apps/server/src/workflows/actions/catalog.ts`
- `apps/server/src/action-task/action-task.service.ts`

---

## ProductImageItem phantom import 정리 — image-hub / thumbnail-editor

**Context**: product-contract-rewire PR 이 `@kiditem/shared` 의 `ProductImageItem` 을 실제 존재하는 `MasterImageItem` 으로 교체. product 도메인 내부 소비자는 정리했으나, 도메인 경계 밖 4 파일이 여전히 phantom import 를 사용:

- `apps/web/src/app/image-hub/page.tsx:12`
- `apps/web/src/app/image-hub/components/ImageGrid.tsx:5`
- `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx:8`
- `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx:9`

각 도메인 자체 plan 에서 처리해야 함 (product-contract PR 의 ADR-0019 세션 경계 밖).

**Depends on / blocked by**:
- Product contract rewire PR 선착 (`MasterImageItem` export 확보)

**Acceptance (완료 조건)**:
- [ ] image-hub 2 파일 → `MasterImageItem` import 로 교체 + 필드 참조 확인
- [ ] thumbnail-editor 2 파일 → 동 위
- [ ] 빌드 통과 + 해당 페이지 image 로드 스모크 테스트

**Refs**: `packages/shared/src/schemas/product.ts` (MasterImageItem), product-contract rewire PR

---

## ProductCatalogService.counts — groupBy 최적화

**Context**: product-contract-rewire 에서 도입된 `apps/server/src/products/services/product-catalog.service.ts` 의 `counts()` 메서드가 `findMany` 로 매칭 master 전수를 메모리 로드 후 카운트. 현재 kiditem 규모 (<5k 상품) 에선 수용 가능하지만 10k+ 로 커지면 O(N) 메모리/네트워크 낭비.

**Depends on / blocked by**: 독립. 로우 카운트 모니터링 후 착수.

**Acceptance (완료 조건)**:
- [ ] `counts()` 을 `prisma.masterProduct.groupBy` 로 재작성 (abcGrade, adTier, pipelineStep, isTemporary 축별 SQL 집계)
- [ ] 기존 테스트 유지 (계약 불변)
- [ ] `pipeline-stats` alias 경로도 동일 최적화 혜택

**Refs**: `apps/server/src/products/services/product-catalog.service.ts:977`

---

## originalImageBase64 SSRF allowlist

**Context**: `apps/server/src/products/services/masters.service.ts` 의 `originalImageBase64` 가 `MasterProduct.imageUrl`/`thumbnailUrl`/`images[0].url` 에 대해 검증 없는 `fetch(url)` 호출. URL 출처가 1688/Alibaba 스크래핑이라 완전 신뢰 불가. SSRF 인접 리스크. product-contract-rewire 이전부터 있던 동작.

**Depends on / blocked by**: 독립.

**Acceptance (완료 조건)**:
- [ ] CDN 도메인 allowlist 설정 (환경변수 또는 configuration, `*.alicdn.com`, `*.cdn.example.com` 등)
- [ ] `originalImageBase64` 에서 URL 파싱 후 allowlist 체크, 불일치 시 `BadRequestException`
- [ ] 동일 allowlist 를 `MasterSchema.images.url` write 검증에 재사용 (선택)

**Refs**: `apps/server/src/products/services/masters.service.ts` originalImageBase64 method
