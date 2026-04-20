# Auth Setup — Supabase

Supabase Auth 로 로그인을 처리하고, 데이터는 로컬 Postgres + Prisma 를 계속 사용한다.
`User.companyId` 필터는 기존 `CompanyScopeGuard` 가 그대로 강제한다.

## 1. Supabase 프로젝트 생성

1. https://supabase.com/dashboard → New Project (Region: `Northeast Asia (Seoul)` 권장)
2. Authentication → Providers → **Email** 이 기본 ON 인지 확인
3. Settings → API 에서 아래 4개 값 복사

| 용도 | 키 이름 | 저장 위치 |
|---|---|---|
| 프론트 | `Project URL` | `apps/web/.env.local` `NEXT_PUBLIC_SUPABASE_URL` |
| 프론트 | `anon public` | `apps/web/.env.local` `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| 백엔드/스크립트 | `Project URL` | 루트 `.env` `SUPABASE_URL` |
| 백엔드/스크립트 | `anon public` | 루트 `.env` `SUPABASE_ANON_KEY` |
| **시드 스크립트 전용** | `service_role` | 루트 `.env` `SUPABASE_SERVICE_ROLE_KEY` |
| 백엔드 JWT 검증 | JWT Settings → `JWT Secret` | 루트 `.env` `SUPABASE_JWT_SECRET` |

`service_role` 은 절대 프론트에 넣지 말 것.

## 2. 본인 계정 생성

Supabase 대시보드 → Authentication → Users → **Add user** → `Create new user`
- Email: 본인 이메일
- Password: 임의 설정
- Auto Confirm User: ON

## 3. 로컬 users 테이블로 동기화

```bash
# companyId 는 기존 companies 테이블에서 하나 골라 넘긴다.
psql "$DATABASE_URL" -c "SELECT id, name FROM companies LIMIT 5;"

npx tsx scripts/sync-supabase-user.ts \
  --email you@example.com \
  --companyId <company-uuid> \
  --role admin
```

Supabase `auth.users.id` UUID 를 그대로 `users.id` 로 사용해 FK 충돌 없음.

## 4. 동작 흐름

```
[Browser]  supabase.auth.signInWithPassword({ email, password })
  → sb-access-token / sb-refresh-token 쿠키 자동 세팅
  → @tanstack/react-query useAuth() → GET /api/auth/me
[Next middleware] 세션 쿠키 없으면 /login 으로 리다이렉트 (전역 적용, /login 제외)
[API 요청] apiClient 가 Authorization: Bearer <access_token> 자동 첨부
[NestJS]   SupabaseAuthMiddleware → jwt.verify(SUPABASE_JWT_SECRET)
           → req.authUser = local users 테이블 조회 결과
[Guards]   CompanyScopeGuard → companyId null 이면 401
```

## 5. Dev 헤더 방식 (x-dev-user-id) 은 유지

Supabase 토큰이 없을 때 fallback. 기존 dev 플로우는 그대로 작동한다.
프로덕션에서는 `DevAuthMiddleware` 가 `NODE_ENV=production` 시 throw.

## 6. 로그아웃

Sidebar 하단 로그아웃 버튼 → `supabase.auth.signOut()` → 쿠키 제거 → `/login` 리다이렉트.
