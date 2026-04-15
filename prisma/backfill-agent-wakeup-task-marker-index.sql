-- prisma/backfill-agent-wakeup-task-marker-index.sql
-- 목적: Trace 뷰어가 JSONB payload->>'_legacy_task_id' 로 task→run 역추적 시
--       풀스캔을 방지하는 GIN 인덱스 추가.
--
-- runbook
-- 1. dev/staging 에서 먼저 실행:
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/backfill-agent-wakeup-task-marker-index.sql
-- 2. 검증: EXPLAIN ANALYZE 로 plan 에 Index Scan using idx_agent_wakeup_requests_task_marker 포함 확인:
--      EXPLAIN ANALYZE SELECT * FROM agent_wakeup_requests
--        WHERE company_id = '<uuid>'::uuid
--          AND payload->>'_legacy_task_id' = '<task-id>';
-- 3. init.sql.gz 재생성 (PR 템플릿 체크리스트):
--      docker exec kiditem-postgres pg_dump -U kiditem --schema-only --no-owner --no-privileges kiditem \
--        | gzip > prisma/init.sql.gz
-- 4. prod 실행은 유지보수 창에 동일 명령으로. CONCURRENTLY 라 DML lock 은 없지만
--    인덱스 빌드 중 write throughput 저하 가능.
--
-- 왜 Prisma migration 이 아닌 backfill 인가:
--   - Prisma 는 CREATE INDEX CONCURRENTLY 를 transactional migration 안에서 실행하지 못함.
--   - 팀 관례 (prisma/backfill-*.sql): 수동 psql 실행 + init.sql.gz 재생성.
--
-- CONCURRENTLY 로 lock 최소화. 이미 있으면 skip.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_wakeup_requests_task_marker
  ON agent_wakeup_requests USING GIN ((payload -> '_legacy_task_id'));
