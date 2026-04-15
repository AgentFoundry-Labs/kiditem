-- prisma/backfill-dev-admin-user.sql
-- 목적: Phase 0.1 DevAuthMiddleware 가 fallback 으로 사용할 dev admin user 1명 보장.
--       companies 가 최소 1개 존재해야 함 (이 스크립트가 company 를 만들지 않음).
--
-- runbook
-- 1. companies 존재 확인:
--      psql "$DATABASE_URL" -c "SELECT id, name FROM companies LIMIT 1;"
-- 2. COMPANY_ID 변수 치환 후 실행:
--      psql "$DATABASE_URL" -v COMPANY_ID="'<uuid>'" \
--        -v ON_ERROR_STOP=1 -f prisma/backfill-dev-admin-user.sql
-- 3. apps/server 의 env 에 DEV_DEFAULT_USER_ID=00000000-0000-0000-0000-00000000d001 설정
-- 4. apps/web 의 env (.env.local) 에 NEXT_PUBLIC_DEV_USER_ID=00000000-0000-0000-0000-00000000d001 설정
-- 5. init.sql.gz 재생성 (PR 템플릿 체크리스트):
--      docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts \
--        --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
--
-- 고정 UUID: 00000000-0000-0000-0000-00000000d001 (dev 전용 판별 쉽게 d001 suffix)
-- 프로덕션에는 이 user 가 존재해선 안 됨. DevAuthMiddleware 자체가 prod 에서 throw.

INSERT INTO users (id, company_id, email, role, type, name, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-00000000d001',
  :COMPANY_ID,
  'admin@dev.local',
  'admin',
  'human',
  'Dev Admin',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  email      = EXCLUDED.email,
  role       = EXCLUDED.role,
  type       = EXCLUDED.type,
  name       = EXCLUDED.name,
  updated_at = now();
