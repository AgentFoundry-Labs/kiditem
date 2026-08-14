import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  SourcingKeywordSuggestionInputSchema,
  SourcingKeywordSuggestionObservationBatchSchema,
  SourcingKeywordSuggestionSnapshotSchema,
  SourcingWingCatalogKeywordSchema,
  SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
  SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
  sourcingWingCatalogKeywordIdentity,
  type SourcingKeywordSuggestionObservationBatch,
  type SourcingKeywordSuggestionSnapshot,
} from '@kiditem/shared/sourcing';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../operations/application/port/in/operation-attempt-verifier.port';
import {
  SOURCING_COLLECTION_REPOSITORY_PORT,
  type AuthorizedCollectionOutput,
  type ClaimAuthorizedRunResult,
  type SourcingCollectionPermit,
  type SourcingCollectionRepositoryPort,
} from '../port/out/repository/sourcing-collection.repository.port';
import {
  SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT,
  type SourcingKeywordSuggestionRepositoryPort,
} from '../port/out/repository/sourcing-keyword-suggestion.repository.port';
import { hashCollectionRequest } from './sourcing-collection-mappers';

const OPERATION_KEY = 'sourcing.collect_keyword_suggestions';
const COLLECTOR_KEY = 'coupang-keyword-suggestion-operation';

@Injectable()
export class SourcingKeywordSuggestionService {
  constructor(
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
    @Inject(SOURCING_COLLECTION_REPOSITORY_PORT)
    private readonly collectionRepository: SourcingCollectionRepositoryPort,
    @Inject(SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT)
    private readonly snapshots: SourcingKeywordSuggestionRepositoryPort,
  ) {}

  async ingestBrowserBatch(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    batch: SourcingKeywordSuggestionObservationBatch;
  }): Promise<{ published: true; acceptedCount: number; duplicate: boolean }> {
    const batch = SourcingKeywordSuggestionObservationBatchSchema.parse(
      input.batch,
    );
    return this.attemptVerifier.withActiveBrowserAttemptFence(
      {
        organizationId: input.organizationId,
        runId: input.operationRunId,
        expectedOperationKey: OPERATION_KEY,
        attemptToken: input.attemptToken,
      },
      async (attempt, transaction) => {
        const operationInput = SourcingKeywordSuggestionInputSchema.safeParse(
          attempt.input,
        );
        const normalizedKeyword = sourcingWingCatalogKeywordIdentity(
          batch.keyword,
        );
        if (
          !operationInput.success ||
          sourcingWingCatalogKeywordIdentity(operationInput.data.keyword) !==
            normalizedKeyword ||
          batch.items.length > operationInput.data.maxResults ||
          batch.productNameTokens.length > operationInput.data.maxResults ||
          batch.items.some((item) => item.rank > operationInput.data.maxResults)
        ) {
          throw new ConflictException(
            'keyword_suggestion_operation_input_mismatch',
          );
        }
        const claim = await this.collectionRepository.claimAuthorizedRunInAttempt(
          transaction,
          {
            organizationId: input.organizationId,
            sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
            scopeKey: 'default',
            targetKey: `keyword:${normalizedKeyword}`,
            idempotencyKey: `keyword-suggestion-operation:${input.operationRunId}`,
            requestHash: hashCollectionRequest({
              operationRunId: input.operationRunId,
              normalizedKeyword,
              maxResults: operationInput.data.maxResults,
            }),
            collectorKey: COLLECTOR_KEY,
            collectorVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
            triggerKind: 'extension',
            triggeredByUserId: attempt.requestedByUserId,
            leaseDurationMs: 120_000,
          },
        );
        if (claim.kind === 'existing') {
          return { published: true, acceptedCount: 0, duplicate: true };
        }
        if (claim.kind !== 'claimed') throw claimConflict(claim);
        const committed = await this.collectionRepository.commitInAttempt(
          transaction,
          {
            permit: claim.permit,
            output: buildOutput({
              organizationId: input.organizationId,
              permit: claim.permit,
              normalizedKeyword,
              batch,
            }),
          },
        );
        if (committed.kind !== 'committed') {
          throw new ConflictException(
            committed.kind === 'source_denied'
              ? committed.reasonCode
              : `keyword_suggestion_ingest_${committed.kind}`,
          );
        }
        return {
          published: true,
          acceptedCount: committed.acceptedCount,
          duplicate: committed.duplicateCount > 0,
        };
      },
    );
  }

  async snapshot(input: {
    organizationId: string;
    keyword: string;
  }): Promise<SourcingKeywordSuggestionSnapshot> {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const normalizedKeyword = sourcingWingCatalogKeywordIdentity(keyword);
    const latest = await this.snapshots.findLatest({
      organizationId: input.organizationId,
      normalizedKeyword,
    });
    return SourcingKeywordSuggestionSnapshotSchema.parse({
      keyword,
      generatedAt: latest?.capturedAt.toISOString() ?? null,
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      items: latest?.items ?? [],
      productNameTokens: latest?.productNameTokens ?? [],
    });
  }
}

function buildOutput(input: {
  organizationId: string;
  permit: SourcingCollectionPermit;
  normalizedKeyword: string;
  batch: SourcingKeywordSuggestionObservationBatch;
}): AuthorizedCollectionOutput {
  const capturedAt = new Date(input.batch.capturedAt);
  const payloadHash = hashCollectionRequest(input.batch);
  return {
    observations: [{
      organizationId: input.organizationId,
      ingestionRunId: input.permit.runId,
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      platform: 'coupang',
      evidenceFamily: 'keyword_suggestion',
      signalRole: 'demand',
      granularity: 'inferred_observation',
      conceptKey: input.normalizedKeyword,
      sourceEntityType: 'keyword_suggestion_snapshot',
      sourceEntityId: input.normalizedKeyword,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      observationKey: hashCollectionRequest({
        ingestionRunId: input.permit.runId,
        normalizedKeyword: input.normalizedKeyword,
        capturedAt: input.batch.capturedAt,
      }),
      revision: 1,
      supportsCandidate: false,
      sourceUrl: null,
      eventAt: capturedAt,
      observedAt: capturedAt,
      availableAt: capturedAt,
      revisionAt: null,
      payloadHash,
      rawPayload: input.batch,
      ingestedAt: capturedAt,
    }],
    typedRecords: [],
    discoveredCount: input.batch.items.length,
    rejectedCount: 0,
    qualityReport: {
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      keyword: input.normalizedKeyword,
      suggestionCount: input.batch.items.length,
      productNameTokenCount: input.batch.productNameTokens.length,
    },
  };
}

function claimConflict(
  claim: Exclude<ClaimAuthorizedRunResult, { kind: 'claimed' | 'existing' }>,
): ConflictException {
  return new ConflictException(
    claim.kind === 'denied'
      ? claim.reasonCode
      : 'keyword_suggestion_ingest_idempotency_conflict',
  );
}
