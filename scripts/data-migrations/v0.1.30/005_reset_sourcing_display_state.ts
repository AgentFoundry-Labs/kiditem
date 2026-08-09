import type { DataMigration } from "../types";

/**
 * The sourcing screens now read normalized commands and versioned server
 * projections. The prior display caches are neither compatible inputs nor
 * durable provenance, so start them empty rather than translating their JSON
 * payloads into the new contracts.
 *
 * Evidence, supplier offers, launch candidates, and decisions are outside this
 * reset because supply or another domain can reference them. Pre-cutover
 * evidence has an empty source key after the schema change, so the new static
 * allowlist excludes it from collection and recommendation inputs.
 */
export const resetSourcingDisplayState: DataMigration = {
  id: "v0.1.30:005_reset_sourcing_display_state",
  releaseVersion: "0.1.30",
  name: "Reset legacy sourcing display projections for normalized sourcing",
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
    const deletedOfferKeywordObservations =
      await tx.sourcing1688OfferKeywordObservation.deleteMany();

    const [
      deletedWorkspaceSnapshots,
      deletedInterestTargets,
      deletedSourceControls,
      deletedTrendSeeds,
      deletedNaverKeywordSnapshots,
      deletedNaverPopularSnapshots,
      deleted1688HotProductSnapshots,
      deletedShortsSnapshots,
      deletedLiveBroadcastSnapshots,
      deletedLiveProductSnapshots,
      deletedTiktokSnapshots,
    ] = await Promise.all([
      tx.sourcingWorkspaceSnapshot.deleteMany(),
      tx.sourcingInterestTarget.deleteMany(),
      tx.sourcingCollectionSourceControl.deleteMany(),
      tx.trendSeedKeyword.deleteMany(),
      tx.naverKeywordDailySnapshot.deleteMany(),
      tx.naverPopularKeywordDailySnapshot.deleteMany(),
      tx.sourcing1688HotProductDailySnapshot.deleteMany(),
      tx.shortsTrendDailySnapshot.deleteMany(),
      tx.liveCommerceBroadcastDailySnapshot.deleteMany(),
      tx.liveCommerceProductDailySnapshot.deleteMany(),
      tx.tiktokCreativeTrendDailySnapshot.deleteMany(),
    ]);

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
      offerKeywordObservations: deletedOfferKeywordObservations.count,
      workspaceSnapshots: deletedWorkspaceSnapshots.count,
      interestTargets: deletedInterestTargets.count,
      sourceControls: deletedSourceControls.count,
      trendSeeds: deletedTrendSeeds.count,
      naverKeywordSnapshots: deletedNaverKeywordSnapshots.count,
      naverPopularSnapshots: deletedNaverPopularSnapshots.count,
      hotProductSnapshots: deleted1688HotProductSnapshots.count,
      shortsSnapshots: deletedShortsSnapshots.count,
      liveBroadcastSnapshots: deletedLiveBroadcastSnapshots.count,
      liveProductSnapshots: deletedLiveProductSnapshots.count,
      tiktokSnapshots: deletedTiktokSnapshots.count,
    };

    return {
      affectedRows: Object.values(counts).reduce(
        (total, count) => total + count,
        0,
      ),
      details: {
        ...counts,
        retainedProvenance: [
          "sourcing_candidates",
          "sourcing_candidate_images",
          "sourcing_evidence_ingestion_runs",
          "sourcing_evidence_observations",
          "supplier_offer_sku_snapshots",
          "sourcing_launch_candidates",
          "sourcing_decision_batches",
          "procurement_test_intents",
        ],
      },
    };
  },
};
