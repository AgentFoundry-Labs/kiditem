Sync local environment (DB schema + Prisma client + shared types).

Run from project root in sequence:

1. `docker ps --filter name=kiditem-postgres --format '{{.Status}}'` — DB 컨테이너 확인. 안 떠있으면 `docker compose up -d` 실행 후 healthy 될 때까지 대기
2. `npx prisma db push` — schema 변경을 로컬 DB에 적용
3. `npx prisma generate` — Prisma client 재생성
4. `npm run build -w packages/shared` — shared 타입 빌드
5. `prisma/init.sql.gz` 존재하면 사용자에게 DB 데이터를 로드할지 확인 (기존 로컬 데이터를 덮어씀). 원하면:
   - `gunzip -k -f prisma/init.sql.gz`
   - `docker exec -i kiditem-postgres psql -U kiditem -c "DO \$\$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations') LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END \$\$;" kiditem` — 기존 데이터 전체 삭제
   - `docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/init.sql` — 새 데이터 로드
   - `rm prisma/init.sql`

각 단계 성공/실패 여부를 보고.
