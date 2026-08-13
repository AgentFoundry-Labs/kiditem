import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  SourcingCoupangObservationCommandSchema,
  SourcingWingCatalogBatchInputSchema,
  SourcingWingCatalogFinalizeSchema,
  SourcingWingCatalogKeywordSchema,
  SourcingWingCatalogObservationBatchSchema,
  SourcingWingCatalogSnapshotSchema,
  type SourcingCoupangObservationCommand,
  type SourcingWingCatalogFinalize,
  type SourcingWingCatalogObservation,
  type SourcingWingCatalogObservationBatch,
  type SourcingWingCatalogPurpose,
  type SourcingWingCatalogSnapshot,
} from '@kiditem/shared/sourcing';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../operations/application/port/in/operation-attempt-verifier.port';
import {
  SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT,
  type SourcingRecommendationSourceRepositoryPort,
} from '../port/out/repository/sourcing-recommendation-source.repository.port';
import {
  hashCollectionRequest,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';
import { SourcingRecommendationService } from './sourcing-recommendation.service';

const WING_OPERATION_KEY = 'sourcing.collect_wing_catalog_batch';

export type SourcingWingCatalogIngestInput = SourcingCoupangObservationCommand & {
  organizationId: string;
  actorUserId: string;
};

@Injectable()
export class SourcingWingCatalogIngestService {
  constructor(
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
    private readonly recommendations: SourcingRecommendationService,
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
    @Inject(SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT)
    private readonly sources: SourcingRecommendationSourceRepositoryPort,
  ) {}

  async ingest(input: SourcingWingCatalogIngestInput) {
    const command = SourcingCoupangObservationCommandSchema.parse({
      idempotencyKey: input.idempotencyKey,
      items: input.items,
    });
    const execution = await this.persistBatch({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      idempotencyKey: command.idempotencyKey,
      targetKey: `batch:${command.idempotencyKey}`,
      triggerKind: 'manual',
      schemaVersion: 'coupang-wing-catalog/v1',
      items: command.items.map(toCurrentObservation),
    });
    if (execution.kind === 'committed') {
      await this.recommendations.refresh({ organizationId: input.organizationId, limit: 50 });
    }
    return execution;
  }

  async ingestBrowserBatch(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    batch: SourcingWingCatalogObservationBatch;
  }) {
    const attempt = await this.verifyAttempt(input);
    const operationInput = parseOperationInput(attempt.input);
    const batch = SourcingWingCatalogObservationBatchSchema.parse(input.batch);
    const normalizedKeyword = normalizeCollectionTarget(batch.keyword);
    const expectedKeywords = new Set(
      operationInput.keywords.map(normalizeCollectionTarget),
    );
    if (
      !expectedKeywords.has(normalizedKeyword)
      || batch.maxPages !== operationInput.maxPages
      || batch.purpose !== operationInput.purpose
      || batch.items.some(
        (item) => normalizeCollectionTarget(item.sourceKeyword) !== normalizedKeyword,
      )
    ) {
      throw new ConflictException('wing_catalog_operation_input_mismatch');
    }

    return this.persistBatch({
      organizationId: input.organizationId,
      actorUserId: attempt.requestedByUserId,
      idempotencyKey: keywordIdempotency(input.operationRunId, normalizedKeyword),
      requestHash: hashCollectionRequest({
        operationRunId: input.operationRunId,
        normalizedKeyword,
      }),
      targetKey: `keyword:${normalizedKeyword}`,
      triggerKind: 'extension',
      schemaVersion: 'coupang-wing-catalog/v2',
      items: batch.items,
    });
  }

  async finalizeBrowserOperation(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    finalization: SourcingWingCatalogFinalize;
  }): Promise<{ finalized: true; refreshed: boolean; duplicate: boolean }> {
    const attempt = await this.verifyAttempt(input);
    const operationInput = parseOperationInput(attempt.input);
    const finalization = SourcingWingCatalogFinalizeSchema.parse(
      input.finalization,
    );
    assertExactFinalization(operationInput, finalization);

    const execution = await this.collectionCoordinator.execute(
      {
        organizationId: input.organizationId,
        sourceKey: 'coupang.wing_catalog',
        scopeKey: 'default',
        targetKey: `finalize:${input.operationRunId}`,
        idempotencyKey: `wing-operation:${input.operationRunId}:finalize`,
        requestHash: hashCollectionRequest({
          operationRunId: input.operationRunId,
          purpose: operationInput.purpose,
          kind: 'finalize',
        }),
        collectorKey: 'wing-catalog-operation-finalize',
        collectorVersion: '2026-08-14',
        triggerKind: 'extension',
        triggeredByUserId: attempt.requestedByUserId,
        leaseDurationMs: 120_000,
      },
      async ({ checkpoint }) => {
        await checkpoint();
        return {
          observations: [],
          typedRecords: [],
          discoveredCount: 0,
          rejectedCount: 0,
          qualityReport: {
            source: 'coupang-wing-catalog-finalize',
            purpose: finalization.purpose,
            keywordCount: finalization.keywords.length,
          },
        };
      },
    );
    const shouldRefresh = purposeRequiresRecommendationRefresh(
      finalization.purpose,
    );
    const refreshed = execution.kind === 'committed' && shouldRefresh;
    if (refreshed) {
      await this.recommendations.refresh({
        organizationId: input.organizationId,
        limit: 50,
      });
    }
    return {
      finalized: true,
      refreshed,
      duplicate: execution.kind === 'existing',
    };
  }

  async snapshot(input: {
    organizationId: string;
    keyword: string;
  }): Promise<SourcingWingCatalogSnapshot> {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const normalizedKeyword = normalizeCollectionTarget(keyword);
    const result = await this.sources.listWingCatalogSnapshot({
      organizationId: input.organizationId,
      normalizedKeyword,
      limit: 400,
    });
    const generatedAt = result.items.reduce(
      (latest, item) =>
        Date.parse(item.capturedAt) > Date.parse(latest)
          ? item.capturedAt
          : latest,
      new Date(0).toISOString(),
    );
    return SourcingWingCatalogSnapshotSchema.parse({
      keyword,
      generatedAt:
        result.items.length === 0 ? new Date().toISOString() : generatedAt,
      items: result.items,
      rejectedCount: result.rejectedCount,
    });
  }

  private verifyAttempt(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
  }) {
    return this.attemptVerifier.verifyActiveBrowserAttempt({
      organizationId: input.organizationId,
      runId: input.operationRunId,
      expectedOperationKey: WING_OPERATION_KEY,
      attemptToken: input.attemptToken,
    });
  }

  private persistBatch(input: {
    organizationId: string;
    actorUserId: string | null;
    idempotencyKey: string;
    requestHash?: string;
    targetKey: string;
    triggerKind: 'manual' | 'extension';
    schemaVersion: 'coupang-wing-catalog/v1' | 'coupang-wing-catalog/v2';
    items: SourcingWingCatalogObservation[];
  }) {
    const requestHash =
      input.requestHash ?? hashCollectionRequest({ items: input.items });
    return this.collectionCoordinator.execute(
      {
        organizationId: input.organizationId,
        sourceKey: 'coupang.wing_catalog',
        scopeKey: 'default',
        targetKey: input.targetKey,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        collectorKey: 'wing-catalog-observation-ingest',
        collectorVersion: '2026-08-14',
        triggerKind: input.triggerKind,
        triggeredByUserId: input.actorUserId,
        leaseDurationMs: 120_000,
      },
      async ({ permit, checkpoint }) => {
        await checkpoint();
        const ingestedAt = new Date();
        const observations = input.items.map((item) => {
          const capturedAt = new Date(item.capturedAt);
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
            schemaVersion: input.schemaVersion,
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
            payloadHash: hashCollectionRequest(item),
            rawPayload: item,
            ingestedAt,
          };
        });
        return {
          observations,
          typedRecords: [],
          discoveredCount: observations.length,
          rejectedCount: 0,
          qualityReport: {
            source: 'coupang-wing-catalog',
            rowCount: observations.length,
          },
        };
      },
    );
  }
}

function toCurrentObservation(
  item: SourcingCoupangObservationCommand['items'][number],
): SourcingWingCatalogObservation {
  return {
    ...item,
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
    deliveryInfo: null,
  };
}

function parseOperationInput(input: Record<string, unknown>) {
  const parsed = SourcingWingCatalogBatchInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConflictException('wing_catalog_operation_input_invalid');
  }
  return parsed.data;
}

function keywordIdempotency(runId: string, normalizedKeyword: string): string {
  return `wing-operation:${runId}:${hashCollectionRequest(normalizedKeyword)}`;
}

function assertExactFinalization(
  operationInput: ReturnType<typeof parseOperationInput>,
  finalization: SourcingWingCatalogFinalize,
): void {
  const expected = operationInput.keywords.map(normalizeCollectionTarget).sort();
  const actual = finalization.keywords
    .map((item) => normalizeCollectionTarget(item.keyword))
    .sort();
  if (
    finalization.purpose !== operationInput.purpose
    || actual.length !== expected.length
    || new Set(actual).size !== actual.length
    || actual.some((keyword, index) => keyword !== expected[index])
  ) {
    throw new ConflictException('wing_catalog_operation_input_mismatch');
  }
}

function purposeRequiresRecommendationRefresh(
  purpose: SourcingWingCatalogPurpose,
): boolean {
  return purpose === 'recommendation_validation';
}
