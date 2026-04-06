-- 에이전트용 읽기 전용 PostgreSQL 역할 생성
-- 실행: psql "$DATABASE_URL" -f scripts/init-agent-reader.sql
-- 한 번만 실행하면 됨 (IF NOT EXISTS로 중복 방지)

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agent_reader') THEN
    CREATE ROLE agent_reader WITH LOGIN PASSWORD 'agent_readonly';
  END IF;
END $$;

GRANT CONNECT ON DATABASE kiditem TO agent_reader;
GRANT USAGE ON SCHEMA public TO agent_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_reader;

-- 이후 생성되는 테이블에도 자동 SELECT 권한 부여
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_reader;
