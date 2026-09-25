import { sourcingWingCatalogKeywordIdentity, type SourcingWingCatalogObservation } from '@kiditem/shared/sourcing';
import type { AuthorizedCollectionOutput, SourcingCollectionPermit } from '../port/out/repository/sourcing-collection.repository.port';
import { hashCollectionRequest } from './sourcing-collection-mappers';

/** Wing 검색 결과 상품 행 → 관측 + typed 사실(`coupang-wing-catalog/v2`). 수동 적재와 실행 kind가 같이 쓴다. */
export function buildWingCatalogOutput(input: {
  organizationId: string;
  permit: SourcingCollectionPermit;
  items: SourcingWingCatalogObservation[];
  ingestedAt?: Date;
}): AuthorizedCollectionOutput {
  const ingestedAt = input.ingestedAt ?? new Date();
  const observations = input.items.map((item) => {
    const capturedAt = new Date(item.capturedAt);
    return {
      organizationId: input.organizationId,
      operationId: input.permit.runId,
      sourceKey: input.permit.sourceKey,
      platform: 'coupang',
      evidenceFamily: 'wing_catalog',
      signalRole: 'demand' as const,
      granularity: 'exact_own' as const,
      conceptKey: sourcingWingCatalogKeywordIdentity(item.sourceKeyword),
      sourceEntityType: 'coupang_product',
      sourceEntityId: item.productId,
      schemaVersion: 'coupang-wing-catalog/v2',
      observationKey: hashCollectionRequest({
        attemptId: input.permit.runId,
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
    typedRecords: input.items.map((item, index) => ({
      kind: 'wing_catalog_product' as const,
      row: {
        organizationId: input.organizationId,
        operationId: input.permit.runId,
        evidenceObservationKey: observations[index]!.observationKey,
        evidenceRevision: 1,
        ...item,
      },
    })),
    discoveredCount: observations.length,
    rejectedCount: 0,
    qualityReport: {
      source: 'coupang-wing-catalog',
      rowCount: observations.length,
    },
  };
}
