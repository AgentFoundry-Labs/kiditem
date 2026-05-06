# Runbook — Supabase Auth 셋업

KidItem 로그인을 처음 셋업하는 절차. 인간 prerequisites + 에이전트 액션 + 검증 + 성공 기준.

## 두 가지 셋업 시나리오

| 시나리오 | 절차 |
|---|---|
| **(A) PR 받은 다른 개발자** — Supabase project 와 dev 공용 계정 (`kiditem@naver.com`) 은 이미 존재 | "PR 받는 개발자 빠른 셋업" 섹션으로 점프 |
| **(B) 새 환경에서 처음부터** — Supabase project 부터 본인이 생성 | 아래 "사람만 할 수 있는 prerequisites" 1번부터 진행 |

---

## PR 받는 개발자 빠른 셋업 (A)

PR 작성자가 공유한 .env 키를 받아 셋업한다. dev 공용 계정 `kiditem@naver.com` 을 local DB 에 한 번만 mirror.

```bash
# 1. .env / apps/web/.env.local 에 받은 SUPABASE_* 키 setting (별도 secret 채널)
#    apps/web/.env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#    .env: SUPABASE_URL, SUPABASE_SECRET_KEY

# 2. dev DB 띄우고 schema push (기존 dev 절차)
docker compose up -d postgres
npm run db:push

# 3. dev 공용 user mirror — Supabase 에는 이미 등록되어 있으니 local DB 만 sync
docker exec kiditem-postgres psql -U kiditem -d kiditem -c "SELECT id, name FROM organizations LIMIT 5;"
# 출력의 id 를 사용 (보통 dev seed 의 11111111-1111-4111-8111-111111111111)
npx tsx scripts/sync-supabase-user.ts \
  --email kiditem@naver.com \
  --organizationId 11111111-1111-4111-8111-111111111111 \
  --role admin

# 4. dev:all 로 띄움 + 로그인
npm run dev:all
# 브라우저 → http://localhost:3000 → /login 자동 리다이렉트
# kiditem@naver.com + 비밀번호 (PR 작성자에게 별도 채널로 전달받음)
```

비밀번호를 모르거나 password flow 를 우회하려면:
```bash
node scripts/login-magiclink.mjs kiditem@naver.com
# 출력의 CALLBACK_URL 을 브라우저에서 열면 cookie set + 대시보드 진입
```

---

## 사람만 할 수 있는 prerequisites

1. **Supabase 계정 + 프로젝트** — 브라우저 + 본인 이메일 필요
   - https://supabase.com/dashboard → New Project
   - Region: `Northeast Asia (Seoul)`
   - Pricing: Free tier 충분
   - DB Password: 임의 설정 후 별도 저장

2. **테스트 계정 생성** — Supabase Dashboard 에서 본인 이메일/비번 설정
   - Authentication → Users → Add user → "Create new user"
   - Email + Password
   - **Auto Confirm User: ON** (체크 필수)

3. **키 복사** — Settings → API Keys
   - Project URL
   - publishable key (`sb_publishable_...`)
   - secret key (`sb_secret_...`, 절대 프론트/git 노출 금지)

4. **JWT Signing Keys 확인** — Authentication → JWT Signing Keys
   - asymmetric signing key 를 사용한다.
   - 서버는 `SUPABASE_URL/auth/v1/.well-known/jwks.json` 으로 JWT 를 검증한다.
   - legacy JWT Secret 은 `.env` 에 복사하지 않는다.

5. **`.env` / `.env.local` 작성** — 사용자가 직접 파일에 붙여넣기

`apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
```

루트 `.env` (이미 있는 키들 외에 다음 2개 추가):
```env
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SECRET_KEY=<sb_secret_...>
```

## 에이전트가 자동 실행할 액션

```bash
# 1. 본인이 어느 조직에 속할지 organizationId 선택
psql "$DATABASE_URL" -c "SELECT id, name FROM organizations LIMIT 5;"

# 2. local users + OrganizationMembership 미러
npx tsx scripts/sync-supabase-user.ts \
  --email you@example.com \
  --organizationId <organization-uuid> \
  --role admin
```

성공 시 stdout:
```
synced: user=<uuid> (you@example.com), organization=<uuid> (조직명), membership=<uuid> role=admin
```

## 환경 변수 / 파일 / 디렉토리

- 루트 `.env` — backend (NestJS) 가 읽음
- `apps/web/.env.local` — Next.js 가 읽음 (build 시 inline)
- `scripts/sync-supabase-user.ts` — sync 진입점
- `apps/server/src/auth/middleware/supabase-auth.middleware.ts` — JWT verify
- `apps/web/src/proxy.ts` — `getClaims()` 기반 `/login` 리다이렉트 가드
- `apps/web/src/app/login/page.tsx` — 로그인 페이지

## 검증

각 단계마다 통과해야 다음 단계 진행.

### 빌드 게이트

```bash
# Shared
npm run build --workspace=packages/shared

# Backend
npx vitest run apps/server/src/auth

# Frontend
npm run build --workspace=apps/web
```

성공 기준:
- shared build → exit 0
- auth vitest → 모든 spec PASS
- web build → exit 0, `/login` 라우트 prerendered

### 부팅 게이트

```bash
npm run dev:all
```

성공 기준:
- backend log: `Nest application successfully started` (port 4000)
- frontend log: `Ready in <ms>` (port 3000)
- backend log 에 `SupabaseAuthMiddleware` 관련 fatal 없음

### Login Happy Path

브라우저:
1. `http://localhost:3000` 접근 → `/login?next=/` 리다이렉트
2. 이메일 + 비밀번호 입력 → 제출
3. `/` (대시보드) 로 리다이렉트 성공
4. DevTools → Application → Cookies: `sb-access-token`, `sb-refresh-token` 존재
5. DevTools → Network: `GET /api/auth/me` 200 + `{ id, email, name, role, organizationId, membershipId }` 반환

성공 기준: 5단계 전부 통과.

### Edge Cases (선택)

- 잘못된 비밀번호 → sonner 에러 토스트, 리다이렉트 없음
- "이메일 기억하기" 체크 → 로그아웃 후 재방문 시 email prefill (`localStorage.kiditem.login.rememberedEmail`)
- `?next=/products` 쿼리 → 로그인 후 `/products` 도달
- 로그인 상태에서 `/login` 직접 접근 → `/` 리다이렉트
- Sidebar 하단 로그아웃 버튼 → 쿠키 제거 → `/login` 리다이렉트

## Blocker 기준

다음 중 하나라도 발생하면 셋업 중단 후 사용자에게 보고:

- `npm run build --workspace=packages/shared` 가 auth 관련 에러로 실패
- `auth` vitest 가 `req.authUser` 채움 케이스 FAIL
- `Nest application` 부팅 안 됨 (fatal log)
- `GET /api/auth/me` 가 401 외 5xx 반환
- 브라우저에서 `/login` 페이지 자체가 안 뜸 (white screen)

## 최종 보고 포맷

```
Supabase Auth 셋업 완료.
- Backend: dev:server boot OK (Nest started, port 4000)
- Frontend: build OK + /login 페이지 정상 렌더
- Sync 스크립트: user <uuid> + membership <uuid> mirrored
- Login flow: cookies set + /api/auth/me 200
```

## 보안 경고

- `SUPABASE_SECRET_KEY` 는 sync 스크립트 전용. 절대 프론트/git/PR description 에 노출 금지.
- `x-dev-user-id` 헤더 / `?devUserId=` query / `NEXT_PUBLIC_DEV_USER_ID` env 는 폐기. 새로 도입 금지.
- 운영 환경은 Supabase 키만 셋업하면 충분 — escape hatch 없음.
