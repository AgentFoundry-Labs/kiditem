Sync local environment (DB schema + Prisma client + shared types).

Run from project root in sequence:

1. `docker ps --filter name=kiditem-postgres --format '{{.Status}}'` — DB 컨테이너 확인. 안 떠있으면 `docker compose up -d` 실행 후 healthy 될 때까지 대기
2. `npx prisma db push` — schema 변경을 로컬 DB에 적용
3. `npx prisma generate` — Prisma client 재생성
4. `npm run db:3layer-setup` — partial unique indexes + 7 RLS policies + 3 CHECK constraints 재적용. `prisma db push` 가 덮어쓰거나 누락시키므로 **push 직후 반드시 실행** (idempotent, 반복 실행 안전)
5. `npm run build -w packages/shared` — shared 타입 빌드
6. `prisma/init.sql.gz` 존재하면 사용자에게 DB 데이터를 로드할지 확인 (기존 로컬 데이터를 덮어씀). 원하면:
   - `gunzip -k -f prisma/init.sql.gz`
   - `docker exec -i kiditem-postgres psql -U kiditem -c "SET session_replication_role = 'replica'; DO \$\$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations') LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END \$\$; SET session_replication_role = 'origin';" kiditem` — FK 트리거 비활성화 후 전체 삭제
   - `docker exec -i kiditem-postgres psql -U kiditem -c "SET session_replication_role = 'replica';" -f - kiditem < prisma/init.sql` — FK 무시하고 데이터 로드
   - `rm prisma/init.sql`

DB 덤프 생성 시 (PR 올리는 쪽):
`docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz`

각 단계 성공/실패 여부를 보고.
