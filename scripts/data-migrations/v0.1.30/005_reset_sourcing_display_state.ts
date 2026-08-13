import type { DataMigration } from "../types";

/**
 * New normalized recommendation/validation/review projections start empty.
 * Existing workspace cache rows, typed daily history, offer-keyword
 * observations, collection seeds, and operator-managed settings remain
 * canonical inputs: they are not display caches, and some sources cannot
 * backfill prior dates.
 *
 * Evidence, supplier offers, launch candidates, and decisions are outside this
 * reset because supply or another domain can reference them. Pre-cutover
 * evidence has an empty source key after the schema change, so the new static
 * allowlist excludes it from collection and recommendation inputs.
 *
 * `sourcing_1688_hot_product_daily_snapshots` is intentionally absent from
 * this post-schema data migration. The drop happens during reviewed Prisma
 * schema application, not through a delete operation here. It is the only
 * intentional legacy storage removal in this cutover.
 */
export const resetSourcingDisplayState: DataMigration = {
  id: "v0.1.30:005_reset_sourcing_display_state",
  releaseVersion: "0.1.30",
  name: "Reset derived sourcing display projections for normalized sourcing",
  phase: "post-schema",
  async run(tx) {
    // Delete dependency leaves before recommendation headers. These are all
    // sourcing-owned display and review projections; none initiate procurement.
    const deletedReviewBatchItems =
      await tx.sourcingReviewBatchItem.deleteMany();
    const deletedReviewBatches = await tx.sourcingReviewBatch.deleteMany();
    const deletedReviewSelections =
      await tx.sourcingReviewSelection.deleteMany();
    const deletedValidationCheckEvidence =
      await tx.sourcingValidationCheckEvidence.deleteMany();
    const deletedValidationChecks =
      await tx.sourcingValidationCheck.deleteMany();
    const deletedValidationEpisodes =
      await tx.sourcingValidationEpisode.deleteMany();
    const deletedRecommendationEvidence =
      await tx.sourcingRecommendationItemEvidence.deleteMany();
    const deletedRecommendationItems =
      await tx.sourcingRecommendationItem.deleteMany();
    const deletedRecommendationRuns =
      await tx.sourcingRecommendationRun.deleteMany();
    const counts = {
      reviewBatchItems: deletedReviewBatchItems.count,
      reviewBatches: deletedReviewBatches.count,
      reviewSelections: deletedReviewSelections.count,
      validationCheckEvidence: deletedValidationCheckEvidence.count,
      validationChecks: deletedValidationChecks.count,
      validationEpisodes: deletedValidationEpisodes.count,
      recommendationEvidence: deletedRecommendationEvidence.count,
      recommendationItems: deletedRecommendationItems.count,
      recommendationRuns: deletedRecommendationRuns.count,
    };

    return {
      affectedRows: Object.values(counts).reduce(
        (total, count) => total + count,
        0,
      ),
      details: {
        ...counts,
        retainedCanonicalInputs: [
          "sourcing_workspace_snapshots",
          "trend_seed_keywords",
          "naver_keyword_daily_snapshots",
          "naver_popular_keyword_daily_snapshots",
          "shorts_trend_daily_snapshots",
          "live_commerce_broadcast_daily_snapshots",
          "live_commerce_product_daily_snapshots",
          "tiktok_creative_trend_daily_snapshots",
          "sourcing_1688_offer_keyword_observations",
        ],
        retainedProvenance: [
          "sourcing_candidates",
          "sourcing_candidate_images",
          "sourcing_evidence_ingestion_runs",
          "sourcing_evidence_observations",
          "supplier_offer_sku_snapshots",
          "supplier_offer_price_tiers",
          "sourcing_launch_candidates",
          "sourcing_decision_batches",
          "sourcing_decision_batch_items",
          "sourcing_decision_evidence",
          "procurement_test_intents",
          "purchase_orders",
        ],
        removedLegacyStorage: [
          "sourcing_1688_hot_product_daily_snapshots",
        ],
      },
    };
  },
};
