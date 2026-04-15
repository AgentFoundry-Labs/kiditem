-- ADR-0011 Phase 2: HeartbeatRun 'timed_out' canonical migration
-- Pre-condition: Task 1 (schema) + Task 3 (writer) deployed (commits d11ed0b, 55cd3ff).
-- Idempotent: running twice = no-op.

BEGIN;

-- 1. heartbeat_runs: 'timed_out' → failed + failureType=timeout
UPDATE heartbeat_runs
  SET status = 'failed', failure_type = 'timeout'
  WHERE status = 'timed_out';

-- 2. heartbeat_runs: legacy 'queued' → 'pending' (new default is 'pending')
UPDATE heartbeat_runs SET status = 'pending' WHERE status = 'queued';

-- 3. agent_definitions.rt_last_run_status: 'timed_out' → 'failed'
--    (rtLastRunStatus is written by heartbeat.service.ts:465 — post-Task-3 writes canonical, but legacy rows exist)
UPDATE agent_definitions SET rt_last_run_status = 'failed' WHERE rt_last_run_status = 'timed_out';

-- 4. Sanity check — all three should return 0
SELECT 'heartbeat timed_out' AS scope, COUNT(*) AS remaining FROM heartbeat_runs WHERE status = 'timed_out'
UNION ALL SELECT 'heartbeat queued', COUNT(*) FROM heartbeat_runs WHERE status = 'queued'
UNION ALL SELECT 'agent_defs timed_out', COUNT(*) FROM agent_definitions WHERE rt_last_run_status = 'timed_out';

COMMIT;
