# auth — 인증/권한 인프라 (decorators + guards + middleware + auth controller)

NestJS 전역 보안 레이어. **글로벌 가드 2개 + 데코레이터 4개 + Supabase JWT 미들웨어 1개 + 본인 정보 컨트롤러 1개**. 모든 HTTP 라우트는 기본적으로 인증·Organization 컨텍스트가 강제됨.

## Directory

```
auth/
├── decorators/          # 4 — @CurrentUser, @CurrentOrganization, @Roles, @SkipAuth
├── guards/              # 2 — OrganizationScopeGuard, RolesGuard
├── middleware/          # 1 — SupabaseAuthMiddleware
├── __tests__/           # guards + decorator + middleware + controller spec
├── auth.controller.ts   # GET /api/auth/me
├── auth.module.ts
└── auth.types.ts
```

## AuthUser 타입 (auth.types.ts)

```typescript
interface AuthUser {
  id: string;
  organizationId: string | null;  // active OrganizationMembership.organizationId; null = 시스템/미할당 사용자
  membershipId: string | null;    // active OrganizationMembership.id
  role: string;                   // membership role; native enum 금지 → string
  type: string;                   // User.type from Prisma
  email: string;
}
```

`User` 는 직접 `organizationId` 를 갖지 않는다. 현재 조직과 조직 내 role 은 항상 활성 `OrganizationMembership` 에서 결정한다.

## 데코레이터 카탈로그

### `@CurrentUser()` — `decorators/current-user.decorator.ts`
- 반환: `AuthUser` (request.authUser)
- throws: `UnauthorizedException('auth_required')` if missing
- factory: `currentUserFactory(ctx)` — 테스트 가능

### `@CurrentOrganization()` — `decorators/current-organization.decorator.ts`
- 반환: `string` (organizationId)
- throws: `UnauthorizedException('auth_required')` 또는 `'no_organization_context'` if null
- 가드와 이중 방어 — 가드 통과해도 데코레이터가 다시 검증

### `@Roles(...roles)` — `decorators/roles.decorator.ts`
- 메타데이터: `ROLES_METADATA_KEY = 'roles'`
- enum 없음 — string 자유 (`'admin'`, `'owner'`, `'member'` 등)
- 데코레이터 없으면 RolesGuard pass-through

### `@SkipAuth()` — `decorators/skip-auth.decorator.ts`
- 메타데이터: `SKIP_AUTH_KEY = 'skipAuth'`
- 효과: OrganizationScopeGuard bypass
- 용도: health check, public endpoint, 본인 정보 조회 (`/api/auth/me` — 시스템 사용자도 호출 가능)

## 가드 카탈로그 (전역 등록)

`app.module.ts` providers — execution order: **OrganizationScope → Roles → Throttler**.

순서 의도: 비인증 요청은 401로 먼저 탈락 → ThrottlerGuard 카운터 영향 없음.

### OrganizationScopeGuard — `guards/organization-scope.guard.ts`
1. Non-HTTP context (SSE/WebSocket) → pass
2. `@SkipAuth` 메타데이터 있으면 → pass
3. `req.authUser` 없으면 → 401 `auth_required`
4. `req.authUser.organizationId === null` → 401 `no_organization_context`
5. 통과

### RolesGuard — `guards/roles.guard.ts`
1. Non-HTTP → pass
2. `@Roles(...)` 메타데이터 없으면 → pass
3. `req.authUser` 없으면 → 401 `auth_required`
4. `required.includes(req.authUser.role)` 실패 → 403 `insufficient_role`
5. 통과 (단일 string 매칭 — array intersection 아님)

## SupabaseAuthMiddleware — `middleware/supabase-auth.middleware.ts`

**Supabase 발급 JWT 를 검증하고 `req.authUser` 를 채우는 유일한 인증 진입점.**

토큰 추출 우선순위:
1. `Authorization: Bearer <token>` 헤더 (apiClient → fetch 표준)
2. `sb-access-token` 쿠키 (EventSource SSE 용 — 헤더 못 보냄, `withCredentials: true` 로 자동 전송)

검증:
- `SUPABASE_URL/auth/v1/.well-known/jwks.json` 의 JWKS 로 `jose.jwtVerify` (issuer + audience 검증)
- Supabase Auth 는 asymmetric JWT signing key 를 사용한다. Legacy `JWT Secret` / `SUPABASE_JWT_SECRET`
  env 로 서버 검증을 구성하지 않는다.
- `payload.sub` = Supabase `auth.users.id` 와 동일 UUID 로 local `users` 조회
- 활성 `OrganizationMembership` 1개 자동 선택 (status='active', orderBy `lastSelectedAt desc, joinedAt asc`, take 1)
- `req.authUser` 채움. 멤버십이 없으면 `organizationId=null`, `membershipId=null` → `OrganizationScopeGuard` 가 도메인 라우트 차단.

실패 처리 (모두 silent pass — 가드가 401 처리):
- 토큰 없음
- `SUPABASE_URL` 미설정
- JWKS 도달 실패 / verify 실패
- `payload.sub` 없음
- local `users` row 없음 (Supabase 가입 후 sync 스크립트 미실행 상태)

`jose@6.x` 는 ESM-only 이므로 dynamic import 로 lazy load 하고 첫 호출 시 JWKS 캐시.

`req.cookies['sb-access-token']` 을 읽으려면 `main.ts` 가 `cookie-parser` 미들웨어를 등록해야 한다.

## AuthController — `auth.controller.ts`

| Route | Method | Body | Response | Notes |
|---|---|---|---|---|
| `/api/auth/me` | GET | — | `AuthUserPublic` | `@SkipAuth()` — 시스템/미할당 사용자도 본인 정보 조회 가능. `@CurrentUser()` 가 미인증 시 401. |

`AuthUserPublic` 은 `@kiditem/shared/auth` 의 `AuthUserPublicSchema` 와 일치 (`satisfies` 패턴).
로그인 자체는 클라이언트 SDK (`supabase.auth.signInWithPassword`) 가 직접 Supabase 를 호출하므로 백엔드에 별도 `/api/auth/login` 라우트 없음.

## 인증 흐름

```
Request
  → cookie-parser (main.ts global middleware)
  → SupabaseAuthMiddleware (JWT verify → req.authUser 채움)
  → OrganizationScopeGuard (auth + organizationId 검증; @SkipAuth 시 bypass)
  → RolesGuard (메타데이터 있으면 role 검증)
  → ThrottlerGuard (rate limit)
  → @CurrentOrganization / @CurrentUser 데코레이터 (request 에서 추출)
  → Service 호출 (organizationId 인자 전달)
```

## 사용 패턴 (실 컨트롤러 예)

`agent-registry.controller.ts:35-78` 등:

```typescript
// Public within organization (default — guard 자동 적용)
@Get()
list(@CurrentOrganization() organizationId: string, @Query() query: ListDto) {
  return this.service.list(organizationId, query);
}

// Admin only
@Roles('admin')
@Get('cost-analytics')
getCostAnalytics(@CurrentOrganization() organizationId: string) { ... }

// SSE — admin
@Roles('admin')
@Sse('events')
events(@CurrentOrganization() organizationId: string): Observable<MessageEvent> { ... }
```

## 새 보호 엔드포인트 추가하기

1. 컨트롤러 메서드에 `@CurrentOrganization()` (또는 `@CurrentUser()`) 파라미터 추가
2. 권한 제한 필요 시 `@Roles('admin', ...)` 추가
3. Public 만들려면 `@SkipAuth()` (단, **민감 라우트엔 절대 금지**)
4. Service 에 organizationId 전달 — service 내부에서 다시 검증 안 해도 됨 (guard가 보장)

## 금지 (Hard bans)

- ❌ `@UseGuards(RolesGuard)` per-route — guards 는 글로벌(APP_GUARD)
- ❌ 미들웨어 후 `req.authUser` 변형 (immutable로 취급)
- ❌ `AuthUser.role` 을 array 로 변경 (single string 강제)
- ❌ `User.organizationId` 재도입 — 조직 소속은 `OrganizationMembership` 이 source of truth
- ❌ 데코레이터에서 organizationId 캐싱 (항상 fresh `req.authUser` 읽기)
- ❌ 민감/admin 라우트에 `@SkipAuth` (health/public/본인정보 전용)
- ❌ 서비스 레이어에서 organizationId 재검증 (가드 가 이미 보장)
- ❌ `x-dev-user-id` 헤더 / `?devUserId=` query / `NEXT_PUBLIC_DEV_USER_ID` env — header impersonation 패턴 (주체 위변조 가능). Supabase 세션을 통한 정상 로그인 흐름만 허용.
- ❌ `DevAuthMiddleware`, `ALLOW_DEV_AUTH_IN_PROD` — 폐기. 새로 도입 금지.

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 데코레이터 시그니처 변경 | `decorators/*.decorator.ts` + `__tests__/*.decorator.spec.ts` + 모든 컨트롤러 사용처 |
| 가드 로직 변경 | `guards/*.guard.ts` + `__tests__/*.guard.spec.ts` + `app.module.ts` (등록 순서) |
| `AuthUser` 타입 변경 | `auth.types.ts` + SupabaseAuthMiddleware (enrichment) + 모든 데코레이터/가드 + AuthController |
| `AuthUserPublic` 타입 변경 | `packages/shared/src/schemas/auth.ts` + 빌드 + `auth.controller.ts` `satisfies` |
| Supabase 검증 로직 | `middleware/supabase-auth.middleware.ts` + `__tests__/supabase-auth.middleware.spec.ts` + `docs/runbooks/auth-supabase.md` |
| 새 인증 진입점 추가 | scoped plan → `auth.module.ts` 에 미들웨어 추가 → `app.module.ts` `configure()` 등록 순서 명시 |
| ROLES_METADATA_KEY/SKIP_AUTH_KEY 변경 | 데코레이터 + 가드 둘 다 동시 |
| Throttler 순서 변경 | `app.module.ts` providers 순서 (코멘트 의도 위배 주의) |

## 에러 코드 레퍼런스

| Code | HTTP | Source |
|---|---|---|
| `auth_required` | 401 | OrganizationScopeGuard, RolesGuard, decorators |
| `no_organization_context` | 401 | OrganizationScopeGuard, @CurrentOrganization |
| `insufficient_role` | 403 | RolesGuard |
| `user_not_found` | 404 | AuthController.me — local mirror 누락 (sync 스크립트 미실행) |
