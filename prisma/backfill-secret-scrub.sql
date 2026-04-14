-- prisma/backfill-secret-scrub.sql
-- 목적: 기존 row 의 민감 문자열을 [REDACTED] 로 스크러빙 (retroactive)
-- 실행 시점: Phase 0.2 write-time scrub 배포 직후
--
-- runbook
-- 1. staging 없음 — dev DB 에서 dry-run (scrub_progress 로 재시도 안전)
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/backfill-secret-scrub.sql
-- 2. 검증: SELECT count(*) FROM heartbeat_runs
--      WHERE stderr_excerpt ~ 'sk-[A-Za-z0-9]{20}|Bearer |AKIA|AIza|eyJ' → 0
-- 3. prod 실행 (유지보수 창): 동일 명령. 실패 시 scrub_progress.last_id 기반 재실행 안전
-- 4. 완료 후 init.sql.gz 재생성 (PR 템플릿 체크리스트):
--      docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts \
--        --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
--
-- IMPORTANT: 아래 정규식은 packages/shared/src/security/patterns.ts 의 수동 포트.
-- 패턴 추가/수정 시 양쪽 동시 업데이트 필수.

SET lock_timeout = '5s';
SET statement_timeout = '0';

-- 진행 상황 추적 (재시도 안전)
CREATE TABLE IF NOT EXISTS scrub_progress (
  table_name text PRIMARY KEY,
  last_id    text,
  updated_at timestamptz DEFAULT now()
);

-- TEXT 스크러빙 — 8개 패턴 체인
CREATE OR REPLACE FUNCTION scrub_secrets_text(input text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN input IS NULL THEN NULL ELSE
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(input,
                    -- mirror: patterns.ts openai_api_key
                    'sk-[A-Za-z0-9_\-]{20,}', '[REDACTED]', 'g'),
                    -- mirror: patterns.ts bearer_token — leading whitespace 보존
                    '(^|\s)Bearer\s+[A-Za-z0-9_\-\.]+', '\1[REDACTED]', 'gi'),
                    -- mirror: aws_access_key
                    'AKIA[0-9A-Z]{16}', '[REDACTED]', 'g'),
                    -- mirror: gemini_api_key
                    'AIza[0-9A-Za-z_\-]{35}', '[REDACTED]', 'g'),
                    -- mirror: jwt
                    'eyJ[A-Za-z0-9_\-]+?\.eyJ[A-Za-z0-9_\-]+?\.[A-Za-z0-9_\-]+', '[REDACTED]', 'g'),
                    -- mirror: pem_block
                    '-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----', '[REDACTED]', 'g'),
                    -- mirror: wing_cookie
                    'WING[A-Z_]*SESSION[A-Za-z0-9_=\-]*', '[REDACTED]', 'gi'),
                    -- mirror: basic_auth
                    'Basic\s+[A-Za-z0-9+/=]{20,}', '[REDACTED]', 'gi')
  END
$$;

-- JSONB 재귀 — 민감키 전체 치환 + 문자열 leaf scrub
CREATE OR REPLACE FUNCTION scrub_secrets_jsonb(input jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result jsonb;
  k text;
  v jsonb;
  sensitive_keys text[] := ARRAY[
    'password','api_key','apikey','secret','token','authorization','cookie',
    'access_token','accesstoken','refresh_token','refreshtoken',
    'private_key','privatekey','client_secret','clientsecret'
  ];
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(input)
    WHEN 'string' THEN RETURN to_jsonb(scrub_secrets_text(input #>> '{}'));
    WHEN 'array' THEN
      SELECT jsonb_agg(scrub_secrets_jsonb(el)) INTO result FROM jsonb_array_elements(input) el;
      RETURN COALESCE(result, '[]'::jsonb);
    WHEN 'object' THEN
      result := '{}'::jsonb;
      FOR k, v IN SELECT * FROM jsonb_each(input) LOOP
        IF lower(k) = ANY(sensitive_keys) THEN
          result := result || jsonb_build_object(k, '[REDACTED]');
        ELSE
          result := result || jsonb_build_object(k, scrub_secrets_jsonb(v));
        END IF;
      END LOOP;
      RETURN result;
    ELSE RETURN input;
  END CASE;
END $$;

-- 테이블별 UPDATE (Planner 확정 22컬럼/10테이블).
-- 50k row 이상 테이블은 WHERE id BETWEEN 배치 권장 (runbook 참고).

-- heartbeat_runs.{stderr_excerpt, stdout_excerpt, error, summary, result_json, usage_json}
UPDATE heartbeat_runs SET
  stderr_excerpt = scrub_secrets_text(stderr_excerpt),
  stdout_excerpt = scrub_secrets_text(stdout_excerpt),
  error          = scrub_secrets_text(error),
  summary        = scrub_secrets_text(summary),
  result_json    = scrub_secrets_jsonb(result_json),
  usage_json     = scrub_secrets_jsonb(usage_json)
WHERE stderr_excerpt IS NOT NULL OR stdout_excerpt IS NOT NULL
   OR error IS NOT NULL OR summary IS NOT NULL
   OR result_json IS NOT NULL OR usage_json IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('heartbeat_runs', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- agent_definitions.rt_last_error
UPDATE agent_definitions SET rt_last_error = scrub_secrets_text(rt_last_error)
  WHERE rt_last_error IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('agent_definitions', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- agent_tasks.{error, input, output}
UPDATE agent_tasks SET
  error  = scrub_secrets_text(error),
  input  = scrub_secrets_jsonb(input),
  output = scrub_secrets_jsonb(output)
WHERE error IS NOT NULL OR input IS NOT NULL OR output IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('agent_tasks', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- agent_wakeup_requests.{payload, error}
UPDATE agent_wakeup_requests SET
  payload = scrub_secrets_jsonb(payload),
  error   = scrub_secrets_text(error)
WHERE payload IS NOT NULL OR error IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('agent_wakeup_requests', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- agent_events.{value_before, value_after, detail}
UPDATE agent_events SET
  value_before = scrub_secrets_jsonb(value_before),
  value_after  = scrub_secrets_jsonb(value_after),
  detail       = scrub_secrets_text(detail)
WHERE value_before IS NOT NULL OR value_after IS NOT NULL OR detail IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('agent_events', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- agent_logs.{message, data}
UPDATE agent_logs SET
  message = scrub_secrets_text(message),
  data    = scrub_secrets_jsonb(data)
WHERE message IS NOT NULL OR data IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('agent_logs', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- workflow_runs.{context_data, steps, error}
UPDATE workflow_runs SET
  context_data = scrub_secrets_jsonb(context_data),
  steps        = scrub_secrets_jsonb(steps),
  error        = scrub_secrets_text(error)
WHERE context_data IS NOT NULL OR steps IS NOT NULL OR error IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('workflow_runs', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- content_generations.error_message
UPDATE content_generations SET error_message = scrub_secrets_text(error_message)
  WHERE error_message IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('content_generations', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();

-- ad_actions.error_message
UPDATE ad_actions SET error_message = scrub_secrets_text(error_message)
  WHERE error_message IS NOT NULL;
INSERT INTO scrub_progress(table_name, last_id) VALUES ('ad_actions', 'done')
  ON CONFLICT (table_name) DO UPDATE SET last_id = 'done', updated_at = now();
