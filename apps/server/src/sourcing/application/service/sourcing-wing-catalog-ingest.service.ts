import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  SourcingCoupangObservationCommandSchema,
  SourcingWingCatalogBatchInputSchema,
  SourcingWingCatalogFinalizeSchema,
  SourcingWingCatalogKeywordSchema,
  SourcingWingCatalogObservationBatchSchema,
  SourcingWingCatalogSnapshotSchema,
  sourcingWingCatalogKeywordIdentity,
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
  SOURCING_COLLECTION_REPOSITORY_PORT,
  type AuthorizedCollectionOutput,
  type ClaimAuthorizedRunInput,
  type ClaimAuthorizedRunResult,
  type CommitAuthorizedCollectionResult,
  type SourcingCollectionPermit,
  type SourcingCollectionRepositoryPort,
} from '../port/out/repository/sourcing-collection.repository.port';
import {
  SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT,
  type SourcingRecommendationSourceRepositoryPort,
} from '../port/out/repository/sourcing-recommendation-source.repository.port';
import {
  SOURCING_RECOMMENDATION_REPOSITORY_PORT,
  type SourcingRecommendationRepositoryPort,
} from '../port/out/repository/sourcing-recommendation.repository.port';
import {
  hashCollectionRequest,
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
    @Inject(SOURCING_COLLECTION_REPOSITORY_PORT)
    private readonly collectionRepository: SourcingCollectionRepositoryPort,
    @Inject(SOURCING_RECOMMENDATION_REPOSITORY_PORT)
    private readonly recommendationRuns: SourcingRecommendationRepositoryPort,
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
    const batch = SourcingWingCatalogObservationBatchSchema.parse(input.batch);
    return this.attemptVerifier.withActiveBrowserAttemptFence({
      organizationId: input.organizationId,
      runId: input.operationRunId,
      expectedOperationKey: WING_OPERATION_KEY,
      attemptToken: input.attemptToken,
    }, async (attempt, transaction) => {
      const operationInput = parseOperationInput(attempt.input);
      const normalizedKeyword = sourcingWingCatalogKeywordIdentity(batch.keyword);
      assertExactBatch(operationInput, batch, normalizedKeyword);
      const collectionInput = batchClaimInput({
        organizationId: input.organizationId,
        operationRunId: input.operationRunId,
        normalizedKeyword,
        requestedByUserId: attempt.requestedByUserId,
      });
      const claim = await this.collectionRepository.claimAuthorizedRunInAttempt(
        transaction,
        collectionInput,
      );
      if (claim.kind === 'existing') {
        return { kind: 'existing' as const, runId: claim.permit.runId };
      }
      if (claim.kind !== 'claimed') throw collectionClaimConflict(claim);
      const committed = await this.collectionRepository.commitInAttempt(transaction, {
        permit: claim.permit,
        output: buildBatchOutput({
          organizationId: input.organizationId,
          permit: claim.permit,
          schemaVersion: 'coupang-wing-catalog/v2',
          items: batch.items,
        }),
      });
      return mapBrowserCommit(committed);
    });
  }

  async finalizeBrowserOperation(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    finalization: SourcingWingCatalogFinalize;
  }): Promise<{ finalized: true; refreshed: boolean; duplicate: boolean }> {
    const finalization = SourcingWingCatalogFinalizeSchema.parse(
      input.finalization,
    );
    const shouldRefresh = purposeRequiresRecommendationRefresh(
      finalization.purpose,
    );
    const claim = await this.waitForFinalizeClaim({
      organizationId: input.organizationId,
      operationRunId: input.operationRunId,
      attemptToken: input.attemptToken,
      finalization,
    });
    if (claim.kind === 'completed') {
      return { finalized: true, refreshed: shouldRefresh, duplicate: true };
    }

    let recommendationRunId: string | null = null;
    try {
      if (shouldRefresh) {
        const staged = await this.recommendations.refresh({
          organizationId: input.organizationId,
          limit: 50,
          idempotencyKey: `wing-operation:${input.operationRunId}:recommendation-refresh`,
          deferPublication: true,
        });
        recommendationRunId = staged.data?.runId ?? null;
        if (!recommendationRunId) {
          throw new ConflictException('wing_catalog_recommendation_stage_missing');
        }
      }
      await this.attemptVerifier.withActiveBrowserAttemptFence({
        organizationId: input.organizationId,
        runId: input.operationRunId,
        expectedOperationKey: WING_OPERATION_KEY,
        attemptToken: input.attemptToken,
      }, async (attempt, transaction) => {
        assertExactFinalization(parseOperationInput(attempt.input), finalization);
        const committed = await this.collectionRepository.commitInAttempt(transaction, {
          permit: claim.permit,
          output: finalizeOutput(input.operationRunId, finalization, recommendationRunId),
        });
        if (committed.kind !== 'committed') {
          throw new ConflictException('wing_catalog_finalize_lease_lost');
        }
        if (recommendationRunId) {
          const publication = await this.recommendationRuns.publishStagedRunInAttempt(
            transaction,
            { organizationId: input.organizationId, runId: recommendationRunId },
          );
          if (publication === 'missing') {
            throw new ConflictException('wing_catalog_recommendation_stage_missing');
          }
        }
      });
    } catch (error) {
      if (!recommendationRunId) {
        await this.collectionRepository.fail({
          permit: claim.permit,
          error: {
            code: 'WING_CATALOG_FINALIZE_FAILED',
            message: boundedErrorMessage(error),
            retryable: true,
          },
        });
      }
      throw error;
    }
    return {
      finalized: true,
      refreshed: shouldRefresh,
      duplicate: false,
    };
  }

  private async waitForFinalizeClaim(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    finalization: SourcingWingCatalogFinalize;
  }): Promise<
    | { kind: 'claimed'; permit: SourcingCollectionPermit }
    | { kind: 'completed'; runId: string }
  > {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const claim = await this.attemptVerifier.withActiveBrowserAttemptFence({
        organizationId: input.organizationId,
        runId: input.operationRunId,
        expectedOperationKey: WING_OPERATION_KEY,
        attemptToken: input.attemptToken,
      }, async (activeAttempt, transaction) => {
        const operationInput = parseOperationInput(activeAttempt.input);
        assertExactFinalization(operationInput, input.finalization);
        return this.collectionRepository.claimRecoverableRunInAttempt(
          transaction,
          finalizeClaimInput({
            organizationId: input.organizationId,
            operationRunId: input.operationRunId,
            requestedByUserId: activeAttempt.requestedByUserId,
            purpose: operationInput.purpose,
          }),
        );
      });
      if (claim.kind === 'claimed' || claim.kind === 'completed') return claim;
      if (claim.kind === 'idempotency_conflict') {
        throw new ConflictException('wing_catalog_finalize_idempotency_conflict');
      }
      if (claim.kind === 'denied') {
        throw new ConflictException(claim.reasonCode);
      }
      await delay(Math.min(250, Math.max(10, claim.leaseExpiresAt.getTime() - Date.now())));
    }
    throw new ConflictException('wing_catalog_finalize_in_progress');
  }

  async snapshot(input: {
    organizationId: string;
    keyword: string;
  }): Promise<SourcingWingCatalogSnapshot> {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const normalizedKeyword = sourcingWingCatalogKeywordIdentity(keyword);
    const result = await this.sources.listWingCatalogSnapshot({
      organizationId: input.organizationId,
      normalizedKeyword,
      limit: 400,
    });
    return SourcingWingCatalogSnapshotSchema.parse({
      keyword,
      generatedAt: result.generatedAt?.toISOString() ?? null,
      items: result.items,
      rejectedCount: result.rejectedCount,
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
        return buildBatchOutput({
          organizationId: input.organizationId,
          permit,
          schemaVersion: input.schemaVersion,
          items: input.items,
          ingestedAt,
        });
      },
    );
  }
}

function batchClaimInput(input: {
  organizationId: string;
  operationRunId: string;
  normalizedKeyword: string;
  requestedByUserId: string | null;
}): ClaimAuthorizedRunInput {
  return {
    organizationId: input.organizationId,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `keyword:${input.normalizedKeyword}`,
    idempotencyKey: keywordIdempotency(
      input.operationRunId,
      input.normalizedKeyword,
    ),
    requestHash: hashCollectionRequest({
      operationRunId: input.operationRunId,
      normalizedKeyword: input.normalizedKeyword,
    }),
    collectorKey: 'wing-catalog-observation-ingest',
    collectorVersion: '2026-08-14',
    triggerKind: 'extension',
    triggeredByUserId: input.requestedByUserId,
    leaseDurationMs: 120_000,
  };
}

function buildBatchOutput(input: {
  organizationId: string;
  permit: SourcingCollectionPermit;
  schemaVersion: 'coupang-wing-catalog/v1' | 'coupang-wing-catalog/v2';
  items: SourcingWingCatalogObservation[];
  ingestedAt?: Date;
}): AuthorizedCollectionOutput {
  const ingestedAt = input.ingestedAt ?? new Date();
  const observations = input.items.map((item) => {
    const capturedAt = new Date(item.capturedAt);
    return {
      organizationId: input.organizationId,
      ingestionRunId: input.permit.runId,
      sourceKey: input.permit.sourceKey,
      platform: 'coupang',
      evidenceFamily: 'wing_catalog',
      signalRole: 'demand' as const,
      granularity: 'exact_own' as const,
      conceptKey: sourcingWingCatalogKeywordIdentity(item.sourceKeyword),
      sourceEntityType: 'coupang_product',
      sourceEntityId: item.productId,
      schemaVersion: input.schemaVersion,
      observationKey: hashCollectionRequest({
        productId: item.productId,
        itemId: item.itemId,
        vendorItemId: item.vendorItemId,
        sourceKeyword: sourcingWingCatalogKeywordIdentity(item.sourceKeyword),
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
}

function assertExactBatch(
  operationInput: ReturnType<typeof parseOperationInput>,
  batch: SourcingWingCatalogObservationBatch,
  normalizedKeyword: string,
): void {
  const expectedKeywords = new Set(
    operationInput.keywords.map(sourcingWingCatalogKeywordIdentity),
  );
  if (
    !expectedKeywords.has(normalizedKeyword)
    || batch.maxPages !== operationInput.maxPages
    || batch.purpose !== operationInput.purpose
    || batch.items.some(
      (item) => sourcingWingCatalogKeywordIdentity(item.sourceKeyword) !== normalizedKeyword,
    )
  ) {
    throw new ConflictException('wing_catalog_operation_input_mismatch');
  }
}

function collectionClaimConflict(
  claim: Exclude<ClaimAuthorizedRunResult, { kind: 'claimed' | 'existing' }>,
): ConflictException {
  return new ConflictException(
    claim.kind === 'denied'
      ? claim.reasonCode
      : 'wing_catalog_ingest_idempotency_conflict',
  );
}

function mapBrowserCommit(result: CommitAuthorizedCollectionResult) {
  if (result.kind === 'committed') return result;
  throw new ConflictException(
    result.kind === 'source_denied'
      ? result.reasonCode
      : `wing_catalog_ingest_${result.kind}`,
  );
}

function finalizeOutput(
  operationRunId: string,
  finalization: SourcingWingCatalogFinalize,
  recommendationRunId: string | null,
): AuthorizedCollectionOutput {
  return {
    observations: [],
    typedRecords: [],
    discoveredCount: 0,
    rejectedCount: 0,
    qualityReport: {
      source: 'coupang-wing-catalog-finalize',
      operationRunId,
      purpose: finalization.purpose,
      recommendationRunId,
      snapshots: finalization.keywords
        .filter((keyword) => keyword.outcome !== 'failed')
        .map((keyword) => {
          const normalizedKeyword = sourcingWingCatalogKeywordIdentity(keyword.keyword);
          return {
            keyword: normalizedKeyword,
            batchIdempotencyKey: keywordIdempotency(
              operationRunId,
              normalizedKeyword,
            ),
          };
        }),
    },
  };
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

function finalizeClaimInput(input: {
  organizationId: string;
  operationRunId: string;
  requestedByUserId: string | null;
  purpose: SourcingWingCatalogPurpose;
}): ClaimAuthorizedRunInput {
  return {
    organizationId: input.organizationId,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `finalize:${input.operationRunId}`,
    idempotencyKey: `wing-operation:${input.operationRunId}:finalize`,
    requestHash: hashCollectionRequest({
      operationRunId: input.operationRunId,
      purpose: input.purpose,
      kind: 'finalize',
    }),
    collectorKey: 'wing-catalog-operation-finalize',
    collectorVersion: '2026-08-14',
    triggerKind: 'extension',
    triggeredByUserId: input.requestedByUserId,
    leaseDurationMs: 120_000,
  };
}

function boundedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertExactFinalization(
  operationInput: ReturnType<typeof parseOperationInput>,
  finalization: SourcingWingCatalogFinalize,
): void {
  const expected = operationInput.keywords.map(sourcingWingCatalogKeywordIdentity);
  const actual = finalization.keywords
    .map((item) => sourcingWingCatalogKeywordIdentity(item.keyword));
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
