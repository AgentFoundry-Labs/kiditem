import { describe, expect, it, vi } from 'vitest';
import { Sourcing1688SearchResultRepositoryAdapter } from '../sourcing-1688-search-result.repository.adapter';

describe('Sourcing1688SearchResultRepositoryAdapter', () => {
  it('resolves only organization-owned terminal Wing targets and preserves match.searchQuery', async () => {
    const findMany = vi.fn().mockResolvedValue([
      wingObservation({
        productId: 'product-1',
        productName: '초등학생 대용량 필통',
        sourceKeyword: '초등 필통',
        imagePath: 'catalog/owner.jpg',
      }),
    ]);
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceObservation: { findMany },
    } as never);

    await expect(repository.resolveImageTargets({
      organizationId: 'org-1',
      targetIds: ['product-1::', 'foreign-product::'],
    })).resolves.toEqual({
      targets: [{
        targetId: 'product-1::',
        imageUrl: 'https://thumbnail10.coupangcdn.com/thumbnails/remote/160x160ex/image/catalog/owner.jpg',
        searchQuery: '儿童笔袋文具盒',
      }],
      missingTargetIds: ['foreign-product::'],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        sourceKey: 'coupang.wing_catalog',
        sourceEntityType: 'coupang_product',
        sourceEntityKey: { in: ['product-1', 'foreign-product'] },
        supersededByObservation: null,
        ingestionRun: { status: { in: ['complete', 'partial'] } },
      }),
      select: { payload: true },
    }));
  });

  it('returns latest typed complete/partial keyword and target observations, including durable empty runs', async () => {
    const ingestionRuns = vi.fn().mockResolvedValue([
      {
        id: 'image-run',
        sourceKey: '1688.image_search',
        collectorKey: 'operation-1688-image-match',
        status: 'partial',
        completedAt: new Date('2026-08-14T00:02:00.000Z'),
        qualityReport: {
          resultSchemaVersion: 'sourcing-1688-search-result/v1',
          keyword: '儿童笔袋文具盒',
          targetId: 'product-1::',
        },
      },
      {
        id: 'keyword-run',
        sourceKey: '1688.hot_product',
        collectorKey: 'operation-1688-keyword-search',
        status: 'complete',
        completedAt: new Date('2026-08-14T00:01:00.000Z'),
        qualityReport: {
          resultSchemaVersion: 'sourcing-1688-search-result/v1',
          keyword: '儿童雨伞',
          targetId: null,
        },
      },
      {
        id: 'empty-run',
        sourceKey: '1688.hot_product',
        collectorKey: 'operation-1688-keyword-search',
        status: 'complete',
        completedAt: new Date('2026-08-14T00:00:00.000Z'),
        qualityReport: {
          resultSchemaVersion: 'sourcing-1688-search-result/v1',
          keyword: '结果为空',
          targetId: null,
        },
      },
    ]);
    const offerRows = vi.fn().mockResolvedValue([
      offerObservation({
        ingestionRunId: 'image-run',
        sourceKeywordNormalized: '儿童笔袋文具盒',
        externalOfferId: 'offer-image',
        rawOffer: {
          score: 93,
          salesText: '120件',
          supplierTags: ['源头工厂'],
          purchaseTags: [],
          minOrderQuantity: 2,
          shippingFulfillmentRate: '98%',
          shippingPickupRate: '96%',
          shipFrom: '义乌',
          serviceScore: 4.8,
          repurchaseRate: '30%',
          tradeScore: 4.8,
        },
      }),
      offerObservation({
        ingestionRunId: 'keyword-run',
        sourceKeywordNormalized: '儿童雨伞',
        externalOfferId: 'offer-keyword',
        rawOffer: { score: 81 },
      }),
    ]);
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findMany: ingestionRuns },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    const snapshot = await repository.findLatest({
      organizationId: 'org-1',
      keywords: ['儿童雨伞', '结果为空'],
      targetIds: ['product-1::'],
    });

    expect(snapshot.generatedAt).toEqual(new Date('2026-08-14T00:02:00.000Z'));
    expect(snapshot.observations).toEqual([
      expect.objectContaining({
        keyword: '儿童笔袋文具盒',
        targetId: 'product-1::',
        items: [expect.objectContaining({
          offerId: 'offer-image',
          score: 93,
          supplierTags: ['源头工厂'],
        })],
      }),
      expect.objectContaining({
        keyword: '儿童雨伞',
        targetId: null,
        items: [expect.objectContaining({ offerId: 'offer-keyword', score: 81 })],
      }),
      expect.objectContaining({
        keyword: '结果为空',
        targetId: null,
        items: [],
      }),
    ]);
    expect(ingestionRuns).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org-1',
        status: { in: ['complete', 'partial'] },
        OR: [
          { sourceKey: '1688.hot_product', collectorKey: 'operation-1688-keyword-search' },
          { sourceKey: '1688.image_search', collectorKey: 'operation-1688-image-match' },
        ],
      },
    }));
    expect(offerRows).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org-1',
        ingestionRunId: { in: ['image-run', 'keyword-run', 'empty-run'] },
      },
    }));
    expect(JSON.stringify(snapshot)).not.toContain('rawOffer');
  });

  it('reads a durable zero result only from the exact completed keyword run', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'current-run',
      status: 'complete',
      completedAt: new Date('2026-08-20T00:01:00.000Z'),
      discoveredCount: 0,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      staleDiscardedCount: 0,
      errorCode: null,
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童餐盘',
        targetId: null,
        operationRunId: 'operation-current',
      },
    });
    const offerRows = vi.fn().mockResolvedValue([]);
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findFirst },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    await expect(repository.findCompletedKeywordRun({
      organizationId: 'org-current',
      runId: 'current-run',
      operationRunId: 'operation-current',
      keyword: '儿童餐盘',
      targetKey: '儿童餐盘',
      idempotencyKey: 'idempotency-current',
      requestHash: 'request-current',
      maxResults: 6,
    })).resolves.toEqual({
      keyword: '儿童餐盘',
      targetId: null,
      capturedAt: new Date('2026-08-20T00:01:00.000Z'),
      items: [],
      terminalStatus: 'complete',
      discoveredCount: 0,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      errorCode: null,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'current-run',
        organizationId: 'org-current',
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        targetKey: '儿童餐盘',
        idempotencyKey: 'idempotency-current',
        requestHash: 'request-current',
        collectorKey: 'operation-1688-keyword-search',
        collectorVersion: 'sourcing-1688-search-result/v1',
        status: { in: ['complete', 'partial'] },
        completedAt: { not: null },
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        discoveredCount: true,
        acceptedCount: true,
        duplicateCount: true,
        rejectedCount: true,
        staleDiscardedCount: true,
        errorCode: true,
        qualityReport: true,
      },
    });
    expect(offerRows).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-current', ingestionRunId: 'current-run' },
    }));
  });

  it('fails closed when the exact run marker belongs to another operation or keyword', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'current-run',
      completedAt: new Date('2026-08-20T00:01:00.000Z'),
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: 'older keyword',
        targetId: null,
        operationRunId: 'operation-older',
      },
    });
    const offerRows = vi.fn();
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findFirst },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    await expect(repository.findCompletedKeywordRun({
      organizationId: 'org-current',
      runId: 'current-run',
      operationRunId: 'operation-current',
      keyword: '儿童餐盘',
      targetKey: '儿童餐盘',
      idempotencyKey: 'idempotency-current',
      requestHash: 'request-current',
    })).resolves.toBeNull();

    expect(offerRows).not.toHaveBeenCalled();
  });

  it('projects a bounded all-rejected outcome from the exact partial run counters', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'current-run',
      status: 'partial',
      completedAt: new Date('2026-08-20T00:01:00.000Z'),
      discoveredCount: 2,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 2,
      staleDiscardedCount: 0,
      errorCode: null,
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童餐盘',
        targetId: null,
        operationRunId: 'operation-current',
      },
    });
    const offerRows = vi.fn().mockResolvedValue([]);
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findFirst },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    await expect(repository.findCompletedKeywordRun({
      organizationId: 'org-current',
      runId: 'current-run',
      operationRunId: 'operation-current',
      keyword: '儿童餐盘',
      targetKey: '儿童餐盘',
      idempotencyKey: 'idempotency-current',
      requestHash: 'request-current',
      maxResults: 6,
    })).resolves.toMatchObject({
      items: [],
      terminalStatus: 'partial',
      discoveredCount: 2,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 2,
      errorCode: 'all_results_rejected',
    });
  });

  it('fails closed when exact run counters exceed the operation maximum', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'current-run',
      status: 'partial',
      completedAt: new Date('2026-08-20T00:01:00.000Z'),
      discoveredCount: 7,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 7,
      staleDiscardedCount: 0,
      errorCode: null,
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童餐盘',
        targetId: null,
        operationRunId: 'operation-current',
      },
    });
    const offerRows = vi.fn();
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findFirst },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    await expect(repository.findCompletedKeywordRun({
      organizationId: 'org-current',
      runId: 'current-run',
      operationRunId: 'operation-current',
      keyword: '儿童餐盘',
      targetKey: '儿童餐盘',
      idempotencyKey: 'idempotency-current',
      requestHash: 'request-current',
      maxResults: 6,
    })).resolves.toBeNull();

    expect(offerRows).not.toHaveBeenCalled();
  });

  it('preserves both bounded duplicate layers for a complete exact run', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'current-run',
      status: 'complete',
      completedAt: new Date('2026-08-20T00:01:00.000Z'),
      discoveredCount: 6,
      acceptedCount: 6,
      duplicateCount: 12,
      rejectedCount: 0,
      staleDiscardedCount: 0,
      errorCode: null,
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童餐盘',
        targetId: null,
        operationRunId: 'operation-current',
      },
    });
    const offerRows = vi.fn().mockResolvedValue([]);
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findFirst },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    await expect(repository.findCompletedKeywordRun({
      organizationId: 'org-current',
      runId: 'current-run',
      operationRunId: 'operation-current',
      keyword: '儿童餐盘',
      targetKey: '儿童餐盘',
      idempotencyKey: 'idempotency-current',
      requestHash: 'request-current',
      maxResults: 6,
    })).resolves.toMatchObject({
      terminalStatus: 'complete',
      discoveredCount: 6,
      acceptedCount: 6,
      duplicateCount: 12,
      rejectedCount: 0,
    });
  });

  it('reads an image result only from the exact completed target run', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'current-image-run',
      status: 'complete',
      completedAt: new Date('2026-08-20T00:02:00.000Z'),
      discoveredCount: 0,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      staleDiscardedCount: 0,
      errorCode: null,
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童笔袋文具盒',
        targetId: 'product-1::',
        operationRunId: 'operation-current',
      },
    });
    const offerRows = vi.fn().mockResolvedValue([]);
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findFirst },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    await expect(repository.findCompletedImageRun({
      organizationId: 'org-current',
      runId: 'current-image-run',
      operationRunId: 'operation-current',
      targetId: 'product-1::',
      keyword: '儿童笔袋文具盒',
      targetKey: 'image-target:current',
      idempotencyKey: 'idempotency-current',
      requestHash: 'request-current',
      maxResults: 18,
    })).resolves.toEqual({
      keyword: '儿童笔袋文具盒',
      targetId: 'product-1::',
      capturedAt: new Date('2026-08-20T00:02:00.000Z'),
      items: [],
      terminalStatus: 'complete',
      discoveredCount: 0,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      errorCode: null,
    });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'current-image-run',
        organizationId: 'org-current',
        sourceKey: '1688.image_search',
        targetKey: 'image-target:current',
        collectorKey: 'operation-1688-image-match',
      }),
    }));
  });

  it('bounds an unfiltered latest read to the typed snapshot maximum', async () => {
    const ingestionRuns = vi.fn().mockResolvedValue(
      Array.from({ length: 31 }, (_, index) => ({
        id: `run-${index}`,
        sourceKey: '1688.hot_product',
        collectorKey: 'operation-1688-keyword-search',
        status: 'complete',
        completedAt: new Date(Date.UTC(2026, 7, 14, 0, 31 - index)),
        qualityReport: {
          resultSchemaVersion: 'sourcing-1688-search-result/v1',
          keyword: `keyword-${index}`,
          targetId: null,
        },
      })),
    );
    const offerRows = vi.fn().mockResolvedValue([]);
    const repository = new Sourcing1688SearchResultRepositoryAdapter({
      sourcingEvidenceIngestionRun: { findMany: ingestionRuns },
      sourcing1688OfferKeywordObservation: { findMany: offerRows },
    } as never);

    const snapshot = await repository.findLatest({ organizationId: 'org-1' });

    expect(snapshot.observations).toHaveLength(30);
    expect(offerRows).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        ingestionRunId: { in: Array.from({ length: 30 }, (_, index) => `run-${index}`) },
      }),
    }));
  });
});

function wingObservation(overrides: Record<string, unknown>) {
  return {
    payload: {
      productId: 'product-1',
      itemId: null,
      vendorItemId: null,
      productName: '상품',
      itemName: null,
      brandName: null,
      manufacture: null,
      categoryHierarchy: null,
      imagePath: 'catalog/default.jpg',
      salePriceKrw: 15_900,
      ratingAverage: 4.5,
      ratingCount: 10,
      viewsLast28d: 100,
      salesLast28d: 20,
      estimatedRevenue28d: 318_000,
      conversionRate28d: 0.2,
      deliveryInfo: null,
      sourceKeyword: '키워드',
      capturedAt: '2026-08-14T00:00:00.000Z',
      ...overrides,
    },
  };
}

function offerObservation(overrides: Record<string, unknown>) {
  return {
    ingestionRunId: 'keyword-run',
    sourceKeywordNormalized: '儿童雨伞',
    externalOfferId: 'offer-1',
    title: '1688 상품',
    priceCny: 12.5,
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    imageUrl: 'https://cbu01.alicdn.com/example.jpg',
    rank: 1,
    monthlySales: 120,
    supplierName: '示例工厂',
    capturedAt: new Date('2026-08-14T00:00:30.000Z'),
    rawOffer: {},
    ...overrides,
  };
}
