import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../../domain/sourcing-stable-json';
import { SourcingRecommendationSourceRepositoryAdapter } from '../sourcing-recommendation-source.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const CUTOFF_AT = new Date('2026-08-10T00:00:00.000Z');

function createRepository() {
  const prisma = {
    sourcing1688OfferKeywordObservation: { findMany: vi.fn(async () => []) },
    sourcingEvidenceObservation: { findMany: vi.fn(async () => []) },
    sourcingEvidenceIngestionRun: {
      findMany: vi.fn(async () => []),
    },
  };
  return {
    repository: new SourcingRecommendationSourceRepositoryAdapter(prisma as never),
    prisma,
  };
}

describe('SourcingRecommendationSourceRepositoryAdapter', () => {
  it('reads only terminal, point-in-time admissible 1688 observations', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcing1688OfferKeywordObservation.findMany.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000010',
        evidenceObservationId: '00000000-0000-4000-8000-000000000011',
        ingestionRunId: '00000000-0000-4000-8000-000000000012',
        businessDate: CUTOFF_AT,
        sourceKeywordNormalized: '유아 우산',
        externalOfferId: '607635921546',
        variantKeyNormalized: '',
        sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
        title: '유아 우산',
        supplierName: null,
        imageUrl: null,
        rank: 1,
        priceCny: { toString: () => '8.00' },
        monthlySales: 30,
        rawOffer: {},
        capturedAt: CUTOFF_AT,
      },
    ]);

    const result = await repository.listLatestOfferObservations({
      organizationId: ORGANIZATION_ID,
      cutoffAt: CUTOFF_AT,
      lookbackDays: 30,
      limit: 10,
    });

    expect(result).toMatchObject({
      rejectedCount: 0,
      items: [{ externalOfferId: '607635921546', priceCny: 8 }],
    });
    expect(prisma.sourcing1688OfferKeywordObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          evidenceObservation: expect.objectContaining({
            availableAt: { lte: CUTOFF_AT },
            ingestedAt: { lte: CUTOFF_AT },
            ingestionRun: { status: { in: ['complete', 'partial'] } },
          }),
        }),
      }),
    );
  });

  it('quarantines malformed Wing payloads instead of throwing an org-wide read failure', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcingEvidenceObservation.findMany.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000021',
        payload: { productId: 'missing fields' },
      },
    ]);

    const result = await repository.listLatestCoupangObservations({
      organizationId: ORGANIZATION_ID,
      cutoffAt: CUTOFF_AT,
      lookbackDays: 30,
      limit: 10,
    });

    expect(result).toEqual({ items: [], rejectedCount: 1 });
  });

  it('reads one organization-scoped persisted Wing snapshot and parses bounded owner rows', async () => {
    const { repository, prisma } = createRepository();
    const operationRunId = '10000000-0000-4000-8000-000000000040';
    prisma.sourcingEvidenceIngestionRun.findMany
      .mockResolvedValueOnce([
        snapshotMarker('00000000-0000-4000-8000-000000000040', '2026-08-14T01:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId,
          purpose: 'catalog_search',
          snapshots: [
            {
              keyword: '슬라임',
              batchIdempotencyKey: keywordBatchKey(operationRunId, '슬라임'),
            },
          ],
        }),
      ])
      .mockResolvedValueOnce([
        snapshotBatch('00000000-0000-4000-8000-000000000041', operationRunId, '슬라임'),
      ]);
    prisma.sourcingEvidenceObservation.findMany.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000031',
        payload: {
          productId: '123',
          itemId: null,
          vendorItemId: null,
          productName: '슬라임',
          itemName: null,
          brandName: null,
          manufacture: null,
          categoryHierarchy: null,
          imagePath: null,
          salePriceKrw: null,
          ratingAverage: null,
          ratingCount: null,
          viewsLast28d: null,
          salesLast28d: null,
          estimatedRevenue28d: null,
          conversionRate28d: null,
          deliveryInfo: null,
          sourceKeyword: '슬라임',
          capturedAt: '2026-08-14T00:00:00.000Z',
        },
      },
      { id: 'bad', payload: { productId: 'raw-arbitrary-json' } },
    ]);

    await expect(
      repository.listWingCatalogSnapshot({
        organizationId: ORGANIZATION_ID,
        normalizedKeyword: '슬라임',
        limit: 400,
      }),
    ).resolves.toMatchObject({
      generatedAt: new Date('2026-08-14T01:00:00.000Z'),
      items: [{ productId: '123' }],
      rejectedCount: 1,
    });
    expect(prisma.sourcingEvidenceIngestionRun.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          sourceKey: 'coupang.wing_catalog',
          scopeKey: 'default',
          collectorKey: 'wing-catalog-operation-finalize',
          qualityReport: {
            path: ['snapshots'],
            array_contains: [{ keyword: '슬라임' }],
          },
        }),
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        take: 24,
      }),
    );
    expect(prisma.sourcingEvidenceIngestionRun.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          idempotencyKey: { in: [keywordBatchKey(operationRunId, '슬라임')] },
          status: { in: ['complete', 'partial'] },
        }),
        take: 24,
      }),
    );
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        platform: 'coupang',
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: {
          in: ['coupang-wing-catalog/v1', 'coupang-wing-catalog/v2'],
        },
        ingestionRunId: '00000000-0000-4000-8000-000000000041',
        supersededByObservation: null,
      },
      select: { id: true, payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: 800,
    });
  });

  it('returns a latest persisted empty snapshot without falling back to older rows', async () => {
    const { repository, prisma } = createRepository();
    const operationRunId = '10000000-0000-4000-8000-000000000050';
    prisma.sourcingEvidenceIngestionRun.findMany
      .mockResolvedValueOnce([
        snapshotMarker('00000000-0000-4000-8000-000000000050', '2026-08-14T02:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId,
          purpose: 'catalog_search',
          snapshots: [
            {
              keyword: '슬라임',
              batchIdempotencyKey: keywordBatchKey(operationRunId, '슬라임'),
            },
          ],
        }),
      ])
      .mockResolvedValueOnce([
        snapshotBatch('00000000-0000-4000-8000-000000000051', operationRunId, '슬라임'),
      ]);

    await expect(
      repository.listWingCatalogSnapshot({
        organizationId: ORGANIZATION_ID,
        normalizedKeyword: '슬라임',
        limit: 400,
      }),
    ).resolves.toEqual({
      generatedAt: new Date('2026-08-14T02:00:00.000Z'),
      items: [],
      rejectedCount: 0,
    });
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledTimes(1);
  });

  it('falls back from bounded corrupt and dangling markers to the newest valid publication', async () => {
    const { repository, prisma } = createRepository();
    const keyword = '슬라임';
    const validOperationRunId = '10000000-0000-4000-8000-000000000001';
    const wrongOrgOperationRunId = '10000000-0000-4000-8000-000000000002';
    const collectingOperationRunId = '10000000-0000-4000-8000-000000000003';
    const wrongHashOperationRunId = '10000000-0000-4000-8000-000000000004';
    const wrongKeywordOperationRunId = '10000000-0000-4000-8000-000000000007';
    const validKey = keywordBatchKey(validOperationRunId, keyword);
    const wrongOrgKey = keywordBatchKey(wrongOrgOperationRunId, keyword);
    const collectingKey = keywordBatchKey(collectingOperationRunId, keyword);
    const wrongHashKey = keywordBatchKey(wrongHashOperationRunId, keyword);
    const wrongKeywordKey = keywordBatchKey(wrongKeywordOperationRunId, '다른 키워드');
    prisma.sourcingEvidenceIngestionRun.findMany
      .mockResolvedValueOnce([
        snapshotMarker('00000000-0000-4000-8000-000000000069', '2026-08-14T06:00:00.000Z', {
          source: 'corrupt-finalize-source',
          operationRunId: '10000000-0000-4000-8000-000000000006',
          purpose: 'catalog_search',
          snapshots: [{ keyword, batchIdempotencyKey: 'wing-operation:corrupt' }],
        }),
        snapshotMarker('00000000-0000-4000-8000-000000000068', '2026-08-14T05:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: '10000000-0000-4000-8000-000000000005',
          purpose: 'catalog_search',
          snapshots: [{ keyword, batchIdempotencyKey: 'wing-operation:missing' }],
        }),
        snapshotMarker('00000000-0000-4000-8000-000000000067', '2026-08-14T04:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: wrongOrgOperationRunId,
          purpose: 'catalog_search',
          snapshots: [{ keyword, batchIdempotencyKey: wrongOrgKey }],
        }),
        snapshotMarker('00000000-0000-4000-8000-000000000066', '2026-08-14T03:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: collectingOperationRunId,
          purpose: 'catalog_search',
          snapshots: [{ keyword, batchIdempotencyKey: collectingKey }],
        }),
        snapshotMarker('00000000-0000-4000-8000-000000000065', '2026-08-14T02:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: wrongHashOperationRunId,
          purpose: 'catalog_search',
          snapshots: [{ keyword, batchIdempotencyKey: wrongHashKey }],
        }),
        snapshotMarker('00000000-0000-4000-8000-000000000063', '2026-08-14T01:30:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: wrongKeywordOperationRunId,
          purpose: 'catalog_search',
          snapshots: [{ keyword, batchIdempotencyKey: wrongKeywordKey }],
        }),
        snapshotMarker('00000000-0000-4000-8000-000000000064', '2026-08-14T01:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: validOperationRunId,
          purpose: 'catalog_search',
          snapshots: [{ keyword, batchIdempotencyKey: validKey }],
        }),
      ])
      .mockResolvedValueOnce([
        snapshotBatch('00000000-0000-4000-8000-000000000073', wrongOrgOperationRunId, keyword, {
          organizationId: '00000000-0000-4000-8000-000000000099',
        }),
        snapshotBatch('00000000-0000-4000-8000-000000000072', collectingOperationRunId, keyword, {
          status: 'collecting',
          completedAt: null,
        }),
        snapshotBatch('00000000-0000-4000-8000-000000000071', wrongHashOperationRunId, keyword, {
          requestHash: '0'.repeat(64),
        }),
        snapshotBatch(
          '00000000-0000-4000-8000-000000000069',
          wrongKeywordOperationRunId,
          '다른 키워드',
        ),
        snapshotBatch('00000000-0000-4000-8000-000000000070', validOperationRunId, keyword),
      ]);
    prisma.sourcingEvidenceObservation.findMany.mockResolvedValueOnce([
      { id: 'valid-observation', payload: wingItem('valid-product', keyword) },
    ]);

    await expect(
      repository.listWingCatalogSnapshot({
        organizationId: ORGANIZATION_ID,
        normalizedKeyword: keyword,
        limit: 400,
      }),
    ).resolves.toEqual({
      generatedAt: new Date('2026-08-14T01:00:00.000Z'),
      items: [wingItem('valid-product', keyword)],
      rejectedCount: 0,
    });
    expect(prisma.sourcingEvidenceIngestionRun.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.sourcingEvidenceIngestionRun.findMany).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        qualityReport: {
          path: ['snapshots'],
          array_contains: [{ keyword }],
        },
      }),
      select: {
        id: true,
        organizationId: true,
        scopeKey: true,
        targetKey: true,
        idempotencyKey: true,
        requestHash: true,
        completedAt: true,
        qualityReport: true,
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 24,
    });
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          ingestionRunId: '00000000-0000-4000-8000-000000000070',
        }),
      }),
    );
  });

  it('selects a valid newest empty publication without falling back', async () => {
    const { repository, prisma } = createRepository();
    const keyword = '슬라임';
    const newestRunId = '20000000-0000-4000-8000-000000000001';
    const olderRunId = '20000000-0000-4000-8000-000000000002';
    prisma.sourcingEvidenceIngestionRun.findMany
      .mockResolvedValueOnce([
        snapshotMarker('00000000-0000-4000-8000-000000000082', '2026-08-14T02:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: newestRunId,
          purpose: 'catalog_search',
          snapshots: [
            {
              keyword,
              batchIdempotencyKey: keywordBatchKey(newestRunId, keyword),
            },
          ],
        }),
        snapshotMarker('00000000-0000-4000-8000-000000000081', '2026-08-14T01:00:00.000Z', {
          source: 'coupang-wing-catalog-finalize',
          operationRunId: olderRunId,
          purpose: 'catalog_search',
          snapshots: [
            {
              keyword,
              batchIdempotencyKey: keywordBatchKey(olderRunId, keyword),
            },
          ],
        }),
      ])
      .mockResolvedValueOnce([
        snapshotBatch('00000000-0000-4000-8000-000000000084', newestRunId, keyword),
        snapshotBatch('00000000-0000-4000-8000-000000000083', olderRunId, keyword),
      ]);
    prisma.sourcingEvidenceObservation.findMany.mockResolvedValueOnce([]);

    await expect(
      repository.listWingCatalogSnapshot({
        organizationId: ORGANIZATION_ID,
        normalizedKeyword: keyword,
        limit: 400,
      }),
    ).resolves.toEqual({
      generatedAt: new Date('2026-08-14T02:00:00.000Z'),
      items: [],
      rejectedCount: 0,
    });
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ingestionRunId: '00000000-0000-4000-8000-000000000084',
        }),
      }),
    );
  });
});

function snapshotMarker(id: string, completedAt: string, qualityReport: Record<string, unknown>) {
  const operationRunId =
    typeof qualityReport.operationRunId === 'string'
      ? qualityReport.operationRunId
      : '10000000-0000-4000-8000-000000000099';
  const purpose =
    typeof qualityReport.purpose === 'string' ? qualityReport.purpose : 'catalog_search';
  return {
    id,
    organizationId: ORGANIZATION_ID,
    scopeKey: 'default',
    targetKey: `finalize:${operationRunId}`,
    idempotencyKey: `wing-operation:${operationRunId}:finalize`,
    requestHash: collectionHash({ operationRunId, purpose, kind: 'finalize' }),
    completedAt: new Date(completedAt),
    qualityReport,
  };
}

function snapshotBatch(
  id: string,
  operationRunId: string,
  keyword: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `keyword:${keyword}`,
    idempotencyKey: keywordBatchKey(operationRunId, keyword),
    requestHash: collectionHash({ operationRunId, normalizedKeyword: keyword }),
    collectorKey: 'wing-catalog-observation-ingest',
    status: 'complete',
    completedAt: new Date('2026-08-14T00:30:00.000Z'),
    ...overrides,
  };
}

function keywordBatchKey(operationRunId: string, keyword: string): string {
  return `wing-operation:${operationRunId}:${collectionHash(keyword)}`;
}

function collectionHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function wingItem(productId: string, sourceKeyword: string) {
  return {
    productId,
    itemId: null,
    vendorItemId: null,
    productName: productId,
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    salePriceKrw: null,
    ratingAverage: null,
    ratingCount: null,
    viewsLast28d: null,
    salesLast28d: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
    deliveryInfo: null,
    sourceKeyword,
    capturedAt: '2026-08-14T00:00:00.000Z',
  };
}
