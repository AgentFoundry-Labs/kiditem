-- ADR-0011 Phase 2 rollback
-- WARNING: Valid ONLY immediately after migration, BEFORE prisma schema rollback.
--   failure_type column must still exist. Post-migration non-timeout 'failed' rows unaffected.
--   agent_definitions.rt_last_run_status cannot be reliably reversed — leave untouched (next run overwrites).

BEGIN;

-- heartbeat_runs: failed + failureType='timeout' → 'timed_out'
UPDATE heartbeat_runs
  SET status = 'timed_out', failure_type = NULL
  WHERE status = 'failed' AND failure_type = 'timeout';

-- 'queued' restoration skipped — 'pending' is superset semantically.

COMMIT;
