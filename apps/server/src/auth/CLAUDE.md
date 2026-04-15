# auth — 인증/권한 인프라 (decorators + guards + middleware)

9 파일. NestJS 전역 보안 레이어. **글로벌 가드 2개 + 데코레이터 4개 + 개발용 미들웨어 1개**. 모든 HTTP 라우트는 기본적으로 인증·회사 컨텍스트가 강제됨.

## Directory

```
auth/
├── decorators/          # 4 — @CurrentUser, @CurrentCompany, @Roles, @SkipAuth
├── guards/              # 2 — CompanyScopeGuard, RolesGuard
├── middleware/          # 1 — DevAuthMiddleware
├── __tests__/           # 4 — guards + decorator + middleware spec
├── auth.module.ts
└── auth.types.ts
```

## AuthUser 타입 (auth.types.ts)

```typescript
interface AuthUser {
  id: string;
  companyId: string | null;  // null = 시스템/미할당 사용자
  role: string;              // ADR-0001: native enum 금지 → string
  type: string;              // User.type from Prisma
  email: string;
}
```

## 데코레이터 카탈로그

### `@CurrentUser()` — `decorators/current-user.decorator.ts`
- 반환: `AuthUser` (request.authUser)
- throws: `UnauthorizedException('auth_required')` if missing
- factory: `currentUserFactory(ctx)` — 테스트 가능

### `@CurrentCompany()` — `decorators/current-company.decorator.ts`
- 반환: `string` (companyId)
- throws: `UnauthorizedException('auth_required')` 또는 `'no_company_context'` if null
- 가드와 이중 방어 — 가드 통과해도 데코레이터가 다시 검증

### `@Roles(...roles)` — `decorators/roles.decorator.ts`
- 메타데이터: `ROLES_METADATA_KEY = 'roles'`
- enum 없음 — string 자유 (`'admin'`, `'owner'`, `'member'` 등)
- 데코레이터 없으면 RolesGuard pass-through

### `@SkipAuth()` — `decorators/skip-auth.decorator.ts`
- 메타데이터: `SKIP_AUTH_KEY = 'skipAuth'`
- 효과: CompanyScopeGuard bypass
- 용도: health check, public endpoint 만

## 가드 카탈로그 (전역 등록)

`app.module.ts:103-104` — execution order: **CompanyScope → Roles → Throttler**

순서 의도 (line 101 코멘트): 비인증 요청은 401로 먼저 탈락 → ThrottlerGuard 카운터 영향 없음.

### CompanyScopeGuard — `guards/company-scope.guard.ts`
1. Non-HTTP context (SSE/WebSocket) → pass
2. `@SkipAuth` 메타데이터 있으면 → pass
3. `req.authUser` 없으면 → 401 `auth_required`
4. `req.authUser.companyId === null` → 401 `no_company_context`
5. 통과

### RolesGuard — `guards/roles.guard.ts`
1. Non-HTTP → pass
2. `@Roles(...)` 메타데이터 없으면 → pass
3. `req.authUser` 없으면 → 401 `auth_required`
4. `required.includes(req.authUser.role)` 실패 → 403 `insufficient_role`
5. 통과 (단일 string 매칭 — array intersection 아님)

## DevAuthMiddleware — `middleware/dev-auth.middleware.ts`

**개발 전용. 프로덕션 안전장치 있음.**

생성자에서 throw (line 20-28):
```typescript
if (NODE_ENV === 'production' && ALLOW_DEV_AUTH_IN_PROD !== 'true') {
  throw new Error('DevAuthMiddleware blocked in production');
}
```

User 해석 우선순위 (line 30-45):
1. `x-dev-user-id` 헤더 (최우선)
2. `?devUserId=...` query param (SSE 용 — EventSource는 커스텀 헤더 못 보냄)
3. `DEV_DEFAULT_USER_ID` env (최후)
4. 없으면 silent pass → 가드가 401

User lookup (line 47-65): `prisma.user.findUnique({ where: { id } })` → `req.authUser` 채움.

## 인증 흐름

```
Request
  → DevAuthMiddleware (req.authUser 채움, dev 만)
  → CompanyScopeGuard (auth + companyId 검증)
  → RolesGuard (메타데이터 있으면 role 검증)
  → ThrottlerGuard (rate limit)
  → @CurrentCompany / @CurrentUser 데코레이터 (request 에서 추출)
  → Service 호출 (companyId 인자 전달)
```

## 사용 패턴 (실 컨트롤러 예)

`agent-registry.controller.ts:35-78` 등:

```typescript
// Public within company (default — guard 자동 적용)
@Get()
list(@CurrentCompany() companyId: string, @Query() query: ListDto) {
  return this.service.list(companyId, query);
}

// Admin only
@Roles('admin')
@Get('cost-analytics')
getCostAnalytics(@CurrentCompany() companyId: string) { ... }

// SSE — admin
@Roles('admin')
@Sse('events')
events(@CurrentCompany() companyId: string): Observable<MessageEvent> { ... }
```

## 새 보호 엔드포인트 추가하기

1. 컨트롤러 메서드에 `@CurrentCompany()` (또는 `@CurrentUser()`) 파라미터 추가
2. 권한 제한 필요 시 `@Roles('admin', ...)` 추가
3. Public 만들려면 `@SkipAuth()` (단, **민감 라우트엔 절대 금지**)
4. Service 에 companyId 전달 — service 내부에서 다시 검증 안 해도 됨 (guard가 보장)

## 금지 (Hard bans)

- ❌ `@UseGuards(RolesGuard)` per-route — guards 는 글로벌(APP_GUARD)
- ❌ 미들웨어 후 `req.authUser` 변형 (immutable로 취급)
- ❌ `AuthUser.role` 을 array 로 변경 (single string 강제, ADR-0001)
- ❌ 데코레이터에서 companyId 캐싱 (항상 fresh `req.authUser` 읽기)
- ❌ 코드 안에서 `DevAuthMiddleware` 직접 인스턴스화
- ❌ 민감/admin 라우트에 `@SkipAuth` (health/public 전용)
- ❌ 서비스 레이어에서 companyId 재검증 (가드 가 이미 보장)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 데코레이터 시그니처 변경 | `decorators/*.decorator.ts` + `__tests__/*.decorator.spec.ts` + 모든 컨트롤러 사용처 |
| 가드 로직 변경 | `guards/*.guard.ts` + `__tests__/*.guard.spec.ts` + `app.module.ts` (등록 순서) |
| `AuthUser` 타입 변경 | `auth.types.ts` + DevAuthMiddleware (enrichment) + 모든 데코레이터/가드 |
| Prod auth 추가 (JWT/세션) | DevAuthMiddleware 외 새 미들웨어 + auth.module.ts + ADR (현재 dev-only 의도) |
| ROLES_METADATA_KEY/SKIP_AUTH_KEY 변경 | 데코레이터 + 가드 둘 다 동시 |
| Throttler 순서 변경 | `app.module.ts:103-104` providers 순서 (코멘트 의도 위배 주의) |

## 에러 코드 레퍼런스

| Code | HTTP | Source |
|---|---|---|
| `auth_required` | 401 | CompanyScopeGuard, RolesGuard, decorators |
| `no_company_context` | 401 | CompanyScopeGuard, @CurrentCompany |
| `insufficient_role` | 403 | RolesGuard |
