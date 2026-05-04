# Auth Setup — Supabase

Supabase Auth 로 로그인을 처리하고, 데이터는 로컬 Postgres + Prisma 를 그대로 사용한다.
Organization 스코프는 활성 `OrganizationMembership` 으로 결정 — 자세한 가드/데코레이터 카탈로그는 [`apps/server/src/auth/AGENTS.md`](../apps/server/src/auth/AGENTS.md) 참고.

## 1. Supabase 프로젝트 생성

1. https://supabase.com/dashboard → **New Project** (Region: `Northeast Asia (Seoul)` 권장)
2. Authentication → Providers → **Email** ON 확인
3. Settings → API 에서 다음 4개 값 복사

| 용도 | 키 이름 | 저장 위치 |
|---|---|---|
| 프론트 | `Project URL` | `apps/web/.env.local` `NEXT_PUBLIC_SUPABASE_URL` |
| 프론트 | `anon public` | `apps/web/.env.local` `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| 백엔드 JWT 검증 | Project URL | 루트 `.env` `SUPABASE_URL` |
| 백엔드 JWT 검증 | `anon public` | 루트 `.env` `SUPABASE_ANON_KEY` |
| **시드 스크립트 전용** | `service_role` | 루트 `.env` `SUPABASE_SERVICE_ROLE_KEY` |
| 백엔드 JWT 검증 | JWT Settings → `JWT Secret` | 루트 `.env` `SUPABASE_JWT_SECRET` |

`service_role` 은 **절대 프론트/git 에 노출하지 말 것**. 시드 스크립트만 사용.

## 2. 본인 계정 생성

Supabase 대시보드 → Authentication → Users → **Add user** → "Create new user"
- Email: 본인 이메일
- Password: 임의
- **Auto Confirm User: ON** ← 체크 필수 (이메일 confirm 안 거치게)

## 3. 로컬 DB 미러 (User + Membership)

```bash
# 어느 조직에 붙일지 organizationId 선택
psql "$DATABASE_URL" -c "SELECT id, name FROM organizations LIMIT 5;"

npx tsx scripts/sync-supabase-user.ts \
  --email you@example.com \
  --organizationId <organization-uuid> \
  --role admin
```

스크립트가:
- Supabase auth.users 에서 이메일로 user 찾음
- local `users` 테이블에 id = auth.users.id 로 upsert
- `OrganizationMembership` 을 (organizationId, userId) 유니크로 upsert (status='active')

## 4. 동작 흐름

```
[Browser]  supabase.auth.signInWithPassword({ email, password })
  → sb-access-token / sb-refresh-token 쿠키 자동 세팅 (1h, refresh token 으로 자동 갱신)
  → @tanstack/react-query useAuth() → GET /api/auth/me
[Next middleware] 세션 쿠키 없으면 /login 으로 리다이렉트 (전역, /login 제외)
[API 요청] apiClient → Authorization: Bearer <access_token> + credentials: include
[NestJS]   SupabaseAuthMiddleware → JWKS verify
           → req.authUser = { id, organizationId, membershipId, role, type, email }
[Guards]   OrganizationScopeGuard → organizationId null 이면 401
```

## 5. 로그아웃

Sidebar 하단 로그아웃 버튼 → `supabase.auth.signOut()` → 쿠키 제거 → `/login` 리다이렉트.

## 6. 한 번 로그인 후 며칠 사용 (Refresh)

`@supabase/supabase-js` 가 background 에서 access token (1h 만료) 를 refresh token 으로 자동 갱신.
즉 첫 셋업 후 몇 주 동안 재로그인 불필요.

## 7. 보안 메모

- `SUPABASE_SERVICE_ROLE_KEY` 는 절대 프론트 환경변수에 두지 말 것 (`NEXT_PUBLIC_` prefix 금지).
- 헤더 기반 user impersonation 패턴 (`x-dev-user-id` / `?devUserId=`) 는 폐기됨 — 도입 금지.
- SSE 인증은 Supabase 의 `sb-access-token` 쿠키 + `credentials: 'include'` 로 통과 (URL query 토큰 첨부 금지).
