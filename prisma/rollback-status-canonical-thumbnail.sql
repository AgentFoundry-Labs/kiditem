-- ADR-0011 Phase 3 rollback.
-- DANGEROUS: safe ONLY immediately after Phase 3 deploy, BEFORE any new canonical
-- writes land that were never legacy values. Post-deploy rollback requires forward-fix
-- PR (revert writer + drop phase column) instead of this SQL — running it after new
-- writes collapses legitimate canonical rows into arbitrary legacy values.

BEGIN;

UPDATE thumbnail_generations SET status = 'generating', phase = NULL WHERE status = 'running';
UPDATE thumbnail_generations SET status = 'ready',      phase = NULL WHERE status = 'succeeded' AND phase = 'ready';
UPDATE thumbnail_generations SET status = 'applied',    phase = NULL WHERE status = 'succeeded' AND phase = 'applied';
UPDATE thumbnail_generations SET status = 'skipped',    phase = NULL WHERE status = 'cancelled';

COMMIT;
