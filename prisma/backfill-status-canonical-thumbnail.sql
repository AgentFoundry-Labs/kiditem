-- ADR-0011 Phase 3: ThumbnailGeneration status canonicalization
-- Pre-condition: Task 1 schema (phase column) deployed.
-- Idempotent: running twice is a no-op.

BEGIN;

-- 1. generating → running
UPDATE thumbnail_generations SET status = 'running'                       WHERE status = 'generating';

-- 2. ready → succeeded + phase='ready'
UPDATE thumbnail_generations SET status = 'succeeded', phase = 'ready'    WHERE status = 'ready';

-- 3. applied → succeeded + phase='applied'
UPDATE thumbnail_generations SET status = 'succeeded', phase = 'applied'  WHERE status = 'applied';

-- 4. skipped → cancelled
UPDATE thumbnail_generations SET status = 'cancelled'                     WHERE status = 'skipped';

-- Sanity checks — both must return 0
SELECT 'legacy-remaining' AS check_name, COUNT(*) AS n FROM thumbnail_generations
  WHERE status IN ('generating', 'ready', 'applied', 'skipped')
UNION ALL
SELECT 'invariant-violation' AS check_name, COUNT(*) AS n FROM thumbnail_generations
  WHERE (status = 'succeeded' AND phase IS NULL)
     OR (status <> 'succeeded' AND phase IS NOT NULL);

COMMIT;
