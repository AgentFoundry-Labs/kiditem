import { describe, expect, it } from 'vitest';
import { assembleFullDetailsSnapshot, type CatalogCollectionChunk } from './catalog-chunk-snapshot';

/** 목록 단계 기준 없이 지목한 상품만 받는 상세 계획(다시 받기). 발견 청크가 없어도 된다. */
const refetchPlan = (targets: string[]) => ({
  collectorVersion: 'wing-inventory-v1',
  stage: 'details' as const,
  listUrl: 'https://wing.coupang.com/list',
  detailUrl: 'https://wing.coupang.com/detail',
  channelAccountId: '00000000-0000-4000-8000-000000000001',
  vendorId: 'V1',
  publicationRevision: '0',
  detailTargetProductIds: targets,
  absentProductIds: [],
});

function detailChunk(ordinal: number, externalProductId: string): CatalogCollectionChunk {
  return {
    id: `details-${ordinal}`,
    kind: 'full_details',
    sequence: ordinal + 1,
    checksum: 'd'.repeat(64),
    itemCount: 1,
    payload: {
      version: 1,
      kind: 'full_details',
      startOrdinal: ordinal,
      products: [{
        ordinal,
        product: {
          externalProductId,
          options: [{ externalOptionId: `${externalProductId}-O`, documentIds: [] }],
          documents: [],
          media: [],
          raw: {},
        },
      }],
    },
  };
}

describe('assembleFullDetailsSnapshot', () => {
  it('names the missing detail targets with a registered code (KID-348)', () => {
    expect(() => assembleFullDetailsSnapshot([detailChunk(0, 'P1')], refetchPlan(['P1', 'P2']))).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: { reason: 'CATALOG_DETAILS_INCOMPLETE', missingProductIds: ['P2'] },
      }),
    );
  });

  it('rejects a detail product outside the planned targets with a registered code', () => {
    expect(() => assembleFullDetailsSnapshot([detailChunk(0, 'P9')], refetchPlan(['P1']))).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: { reason: 'CATALOG_DETAIL_NOT_PLANNED', externalProductId: 'P9', ordinal: 0 },
      }),
    );
  });

  it('assembles the planned targets', () => {
    expect(assembleFullDetailsSnapshot([detailChunk(0, 'P1')], refetchPlan(['P1'])).products)
      .toHaveLength(1);
  });
});
