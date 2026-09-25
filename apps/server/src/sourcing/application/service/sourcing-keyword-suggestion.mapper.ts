import {
  SourcingKeywordSuggestionObservationBatchSchema,
  SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
  SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
  type SourcingKeywordSuggestionObservationBatch,
} from '@kiditem/shared/sourcing';
import type { AuthorizedCollectionOutput, SourcingCollectionPermit } from '../port/out/repository/sourcing-collection.repository.port';
import { hashCollectionRequest } from './sourcing-collection-mappers';

/** 쿠팡 추천 키워드 문서 1개 → 관측 1 + typed 사실 1. */
export function buildKeywordSuggestionOutput(input: {
  organizationId: string;
  permit: SourcingCollectionPermit;
  normalizedKeyword: string;
  batch: SourcingKeywordSuggestionObservationBatch;
}): AuthorizedCollectionOutput {
  const capturedAt = new Date(input.batch.capturedAt);
  const payloadHash = hashCollectionRequest(input.batch);
  const observationKey = hashCollectionRequest({
    operationId: input.permit.runId,
    normalizedKeyword: input.normalizedKeyword,
    capturedAt: input.batch.capturedAt,
  });
  return {
    observations: [{
      organizationId: input.organizationId,
      operationId: input.permit.runId,
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      platform: 'coupang',
      evidenceFamily: 'keyword_suggestion',
      signalRole: 'demand',
      granularity: 'inferred_observation',
      conceptKey: input.normalizedKeyword,
      sourceEntityType: 'keyword_suggestion_snapshot',
      sourceEntityId: input.normalizedKeyword,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      observationKey,
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
    typedRecords: [{
      kind: 'keyword_suggestion_snapshot',
      row: {
        organizationId: input.organizationId,
        operationId: input.permit.runId,
        evidenceObservationKey: observationKey,
        evidenceRevision: 1,
        schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
        keywordNormalized: input.normalizedKeyword,
        document: SourcingKeywordSuggestionObservationBatchSchema.parse(input.batch),
        capturedAt,
      },
    }],
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
