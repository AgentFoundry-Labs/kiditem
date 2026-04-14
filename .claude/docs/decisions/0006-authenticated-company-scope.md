---
id: 0006
title: Authenticated company scope
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - apps/server
---

## Context

Phase 0 이전 서버는 `companyId` 를 세 가지 경로로 받았다:

1. `@Query('companyId')` — 클라이언트가 URL 쿼리에 직접 지정
2. `body.companyId` — POST/PATCH body 에 클라이언트가 실어 보냄
3. `CompanyResolverService.resolve()` — Prisma `company.findFirst()` 로 "첫 회사" 를 반환

세 경로 모두 심각한 문제:

- (1)/(2) — 클라이언트 입력을 그대로 신뢰 → IDOR (Insecure Direct Object Reference). B 회사 사용자가 A 회사의 `companyId` 를 임의로 넣어 타 회사 데이터 조회·변경 가능. 단일 테넌트 prototype 환경이라 사고가 드러나지 않았을 뿐, SaaS 멀티테넌트 전환 직전 이 경로는 **근본적으로 폐기되어야** 한다.
- (3) — `findFirst()` 는 DB 에 존재하는 아무 회사 1개를 반환. 회사가 1개뿐인 dev 환경에서는 우연히 동작하지만, 회사가 2개 이상 생기는 순간 **조용히 엉뚱한 회사 데이터로 실행**. "첫" 의 기준도 없음.

security-reviewer 가 Phase 0 선결조건으로 지적: 트레이스 뷰어(Workstream B) 가 DB 에서 run/event 를 읽어 올 때 companyId 격리가 반드시 먼저 있어야 한다. 격리 없이 뷰어를 여는 순간 A 회사 사용자가 B 회사 실행 로그를 본다.

## Decision

**모든 API 엔드포인트의 `companyId` 는 요청 컨텍스트의 인증된 `authUser.companyId` 에서만 주입한다.** 클라이언트 입력은 영구 금지.

구체 구현:

- **데코레이터 `@CurrentCompany()`** — `req.authUser.companyId` 를 파라미터로 주입. 인증 없거나 null 이면 401.
- **가드 `CompanyScopeGuard`** — APP_GUARD 로 전역 등록. 인증 필수 + `companyId` 존재 검증. `@SkipAuth()` 데코레이터로 예외 처리 (SSE 등).
- **가드 `RolesGuard`** — `@Roles('admin','member')` 기반 세분화. 현재 허용 set: `'owner' | 'admin' | 'member'`. 운영 역할(ops) 은 별 Phase.
- **DTO** — `companyId` 필드 **영구 제거** (A안). cross-check 로직 도입 안 함. `ValidationPipe` `whitelist: true` 기본값이 DTO 에 없는 필드를 drop 하므로 구 클라이언트도 200/201 로 정상 동작 (값은 무시).
- **CompanyResolverService 는 파일 삭제**. `CommonModule` 은 빈 모듈로 유지 (향후 common util 등록 대비).

인증 레이어는 현재 **dev 임시**: `DevAuthMiddleware` 가 `x-dev-user-id` 헤더로 `User` row 를 조회해 `req.authUser` 세팅. 프로덕션 보장:
- 생성자에서 `NODE_ENV === 'production'` 이면서 `ALLOW_DEV_AUTH_IN_PROD !== 'true'` 이면 throw → 프로덕션 부트 실패.
- 실제 인증 레이어(JWT / Session / OIDC) 는 **외부 유저 1명 생성** OR **서로 다른 `companyId` 2개 row 생성** — 둘 중 먼저 발생하는 시점에 교체. 두 조건 모두 dev 내부 사용자만 있을 때는 어떤 사용자로 로그인해도 companyId 가 동일해 격리 문제가 발현되지 않으므로 교체 긴급도가 낮다. 그러나 외부/다중 테넌트가 되는 즉시 dev 미들웨어로는 안전 보장 불가.

## Consequences

**긍정**:
- IDOR 제거. 클라이언트가 companyId 를 속일 방법이 구조적으로 없음 — 요청 컨텍스트에 없으면 401.
- `CompanyResolverService.findFirst()` 식 조용한 fallback 제거. 모든 company scope 실행이 명시적.
- Workstream B (트레이스 뷰어) 가 안전한 전제 위에서 출발 — DB 조회 시 `where: { companyId: ctx.companyId }` 누락해도 guard 가 인증 단계에서 차단.
- DTO 에서 companyId 필드 제거 → 컨트롤러·서비스 시그니처가 더 깔끔해지고, "누가 companyId 를 넘겨야 하는가" 질문이 사라짐 (항상 auth context).

**부정**:
- 코드 변경 규모 큼 — 컨트롤러 20개 + 서비스 cascade + e2e + DTO 전수 개편 (Phase 0.1.a + 0.1.b 합쳐 약 50 파일).
- 프런트엔드가 기존에 `?companyId=...` 로 보내던 모든 호출이 여전히 200 이지만 서버가 query 를 **무시** — 테스트로 명시하지 않으면 "동작하지만 뜻이 다른" 상태. 프런트 측 API 클라이언트에서 해당 파라미터 제거 필요 (후속 PR).
- DevAuthMiddleware 가 dev 전용이라는 제약이 **부트 레벨** 에 생김. 프로덕션 부트 전에 실제 인증 레이어 교체 필수 → 교체 전 배포 시 서버가 throw 하며 올라가지 않음 (의도된 안전장치).

**뒤따르는 제약**:
- 새 엔드포인트는 반드시 `@CurrentCompany()` 사용. `@Query('companyId')` / `body.companyId` 패턴은 PR 리뷰 reject 대상.
- 서비스 시그니처 규약: company scope 가 필요한 메서드는 `method(companyId: string, dto?: ...)` 형태. DTO 에 companyId 를 넣어 시그니처 하나로 받는 패턴 금지.
- CompanyResolverService 는 **되살리지 않는다**. 유사 편의 유틸이 필요하면 별 ADR 로 재검토.
- 프로덕션 인증 레이어 교체 시점에 DevAuthMiddleware 삭제 + 이 ADR 본문 유지(결정 자체는 불변) + superseding ADR 로 실제 인증 구현 결정 기록.

## Related

- Root `CLAUDE.md` Cross-Domain Rules — "No direct DB access from frontend" 와 정신 동일 (신뢰 경계를 서버에만 둔다)
- [ADR-0001](0001-no-pg-native-enum.md) — role/type 을 String 으로 두는 이유. `AuthUser.role/type` 동일 패턴
- [ADR-0002](0002-class-validator-over-zod-for-dto.md) — DTO 유효성 검사 스택. whitelist 동작이 이 ADR 의 A안 채택 근거
- [ADR-0005](0005-no-silent-model-fallback.md) — 관측 가능성 정신 공유. `CompanyResolverService.findFirst()` 는 "silent company fallback" 이었음
- Phase 0.2 (예정) — Secret Scrub. 비슷한 성격의 SaaS 선결조건
- Phase 0.3 (예정) — Observability Hardening. 이 ADR 이 깔린 위에서 트레이스 뷰어(Workstream B) 구현
- 세션 브랜치: `feat/phase-0-1-auth` — 0.1.a (read path, 커밋 afcbf18) + 0.1.b (write path, DTO 정리, Resolver 제거)
