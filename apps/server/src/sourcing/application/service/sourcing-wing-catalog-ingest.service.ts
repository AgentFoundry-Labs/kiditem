import { Injectable } from '@nestjs/common';
import {
  SourcingCoupangObservationCommandSchema,
  type SourcingCoupangObservationCommand,
} from '@kiditem/shared/sourcing';
import {
  hashCollectionRequest,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';
import { SourcingRecommendationService } from './sourcing-recommendation.service';

export type SourcingWingCatalogIngestInput = SourcingCoupangObservationCommand & {
  organizationId: string;
  actorUserId: string;
};

@Injectable()
export class SourcingWingCatalogIngestService {
  constructor(
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
    private readonly recommendations: SourcingRecommendationService,
  ) {}

  async ingest(input: SourcingWingCatalogIngestInput) {
    const command = SourcingCoupangObservationCommandSchema.parse({
      idempotencyKey: input.idempotencyKey,
      items: input.items,
    });
    const requestHash = hashCollectionRequest({ items: command.items });
    const execution = await this.collectionCoordinator.execute(
      {
        organizationId: input.organizationId,
        sourceKey: 'coupang.wing_catalog',
        scopeKey: 'default',
        targetKey: `batch:${command.idempotencyKey}`,
        idempotencyKey: command.idempotencyKey,
        requestHash,
        collectorKey: 'wing-catalog-observation-ingest',
        collectorVersion: '2026-08-10',
        triggerKind: 'manual',
        triggeredByUserId: input.actorUserId,
        leaseDurationMs: 120_000,
      },
      async ({ permit, checkpoint }) => {
        await checkpoint();
        const ingestedAt = new Date();
        const observations = command.items.map((item) => {
          const capturedAt = new Date(item.capturedAt);
          const rawPayload = { ...item };
          return {
            organizationId: input.organizationId,
            ingestionRunId: permit.runId,
            sourceKey: permit.sourceKey,
            platform: 'coupang',
            evidenceFamily: 'wing_catalog',
            signalRole: 'demand' as const,
            granularity: 'exact_own' as const,
            conceptKey: normalizeCollectionTarget(item.sourceKeyword),
            sourceEntityType: 'coupang_product',
            sourceEntityId: item.productId,
            schemaVersion: 'coupang-wing-catalog/v1',
            observationKey: hashCollectionRequest({
              productId: item.productId,
              itemId: item.itemId,
              vendorItemId: item.vendorItemId,
              sourceKeyword: normalizeCollectionTarget(item.sourceKeyword),
              capturedAt: item.capturedAt,
            }),
            revision: 1,
            supportsCandidate: false,
            sourceUrl: null,
            eventAt: capturedAt,
            observedAt: capturedAt,
            availableAt: capturedAt,
            revisionAt: null,
            payloadHash: hashCollectionRequest(rawPayload),
            rawPayload,
            ingestedAt,
          };
        });
        return {
          observations,
          typedRecords: [],
          discoveredCount: observations.length,
          rejectedCount: 0,
          qualityReport: { source: 'coupang-wing-catalog', rowCount: observations.length },
        };
      },
    );
    if (execution.kind === 'committed') {
      await this.recommendations.refresh({ organizationId: input.organizationId, limit: 50 });
    }
    return execution;
  }
}
