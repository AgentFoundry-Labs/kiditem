import type { DataMigration } from '../types';

/**
 * The pre-existing shared ABC coverage was Sellpia-derived. Preserve that
 * fact only in the new Sellpia columns; never infer advertising, paid-order,
 * or mapping readiness from legacy metric rows.
 */
export const backfillProfitabilitySourceFreshness: DataMigration = {
  id: 'v0.1.30:002_backfill_profitability_source_freshness',
  releaseVersion: '0.1.30',
  name: 'Backfill independent profitability source freshness',
  async run(tx) {
    const updatedEvaluationCount = await tx.$executeRaw`
      UPDATE master_product_abc_evaluations
      SET
        evaluation_cutoff_date = COALESCE(evaluation_cutoff_date, source_coverage_end_date),
        sellpia_coverage_start_date = COALESCE(sellpia_coverage_start_date, source_coverage_start_date),
        sellpia_coverage_end_date = COALESCE(sellpia_coverage_end_date, source_coverage_end_date)
      WHERE
        evaluation_cutoff_date IS NULL
        OR sellpia_coverage_start_date IS NULL
        OR sellpia_coverage_end_date IS NULL
    `;

    return {
      affectedRows: updatedEvaluationCount,
      details: { updatedEvaluationCount },
    };
  },
};
