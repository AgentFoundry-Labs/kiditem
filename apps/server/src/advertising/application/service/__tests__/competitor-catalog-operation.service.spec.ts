import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CompetitorCatalogOperationService } from '../competitor-catalog-operation.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';

const catalog = {
  keyword: '노루잡화점 크런치 슬랑이',
  sellerId: 'A00219251',
  sellerName: '도그블랑',
  sellerStoreUrl: 'https://shop.coupang.com/A00219251',
  totalProductCount: 1,
  collectedProductCount: 1,
  isTruncated: false,
  sort: 'newest' as const,
  capturedAt: '2026-08-14T00:00:30.000Z',
  products: [{
    sourceRank: 1,
    productId: '123',
    itemId: null,
    vendorItemId: '456',
    name: '슬랑이',
    priceKrw: 12_000,
    reviewCount: 4,
    imageUrl: null,
    link: 'https://www.coupang.com/vp/products/123',
  }],
};

function createHarness(operationInput: Record<string, unknown> = {
  target: 'seller_id',
  sellerId: catalog.sellerId,
}) {
  const transaction = { opaque: true };
  const attempt = {
    runId: RUN_ID,
    organizationId: ORGANIZATION_ID,
    operationKey: 'advertising.collect_competitor_catalog',
    input: operationInput,
    requestedByUserId: USER_ID,
    startedAt: new Date('2026-08-14T00:00:00.000Z'),
    leaseExpiresAt: new Date('2026-08-14T00:05:00.000Z'),
    deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
  };
  const verifier = {
    verifyActiveBrowserAttempt: vi.fn(),
    withActiveBrowserAttemptFence: vi.fn(async (_input, operation) =>
      operation(attempt, transaction)),
  };
  const tracking = {
    getSellerTargets: vi.fn(async () => ({
      targets: [{
        sellerId: catalog.sellerId,
        sellerName: catalog.sellerName,
        sellerStoreUrl: catalog.sellerStoreUrl,
        keyword: catalog.keyword,
        priorityScore: 100,
        overlapProductCount: 0,
        matchedOwnProductCount: 0,
      }],
    })),
  };
  const handler = {
    executeSellerCatalogs: vi.fn(async () => ({
      success: true,
      results: [{
        keyword: catalog.keyword,
        sellerId: catalog.sellerId,
        productCount: 1,
        saved: true,
      }],
      ignored: [],
    })),
  };
  const ingestTransaction = {
    runIdempotent: vi.fn(),
    runIdempotentInAttempt: vi.fn(async (_transaction, _input, operation) => ({
      value: await operation(),
      replayed: false,
    })),
  };
  const service = new CompetitorCatalogOperationService(
    verifier as never,
    tracking as never,
    handler as never,
    ingestTransaction as never,
  );
  return { handler, ingestTransaction, service, tracking, transaction, verifier };
}

describe('CompetitorCatalogOperationService', () => {
  it('validates the exact org seller and publishes through one atomic attempt transaction', async () => {
    const harness = createHarness();

    await expect(harness.service.ingest({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { catalogs: [catalog] },
    })).resolves.toEqual({
      captured: 1,
      ignored: 0,
      ignoredReasons: { missingSerpSnapshot: 0, newerCatalogPreserved: 0 },
      replayed: false,
    });

    expect(harness.verifier.verifyActiveBrowserAttempt).not.toHaveBeenCalled();
    expect(harness.verifier.withActiveBrowserAttemptFence).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'advertising.collect_competitor_catalog',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(harness.tracking.getSellerTargets).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      30,
      200,
    );
    expect(harness.ingestTransaction.runIdempotentInAttempt)
      .toHaveBeenCalledWith(harness.transaction, {
        organizationId: ORGANIZATION_ID,
        idempotencyKey: expect.stringMatching(
          new RegExp(`^competitor-catalog-operation:${RUN_ID}:[0-9a-f]{64}$`),
        ),
      }, expect.any(Function));
    expect(harness.handler.executeSellerCatalogs).toHaveBeenCalledWith({
      type: 'competitor_seller_catalog',
      source: 'coupang-seller-shop',
      timestamp: catalog.capturedAt,
      data: [catalog],
    }, ORGANIZATION_ID);
  });

  it('rejects seller, keyword, and owner URL mismatches before Ads publication', async () => {
    for (const changedCatalog of [
      { ...catalog, sellerId: 'outside-seller' },
      { ...catalog, keyword: '다른 키워드' },
      { ...catalog, sellerStoreUrl: 'https://shop.coupang.com/other' },
    ]) {
      const harness = createHarness();
      await expect(harness.service.ingest({
        organizationId: ORGANIZATION_ID,
        operationRunId: RUN_ID,
        attemptToken: ATTEMPT_TOKEN,
        batch: { catalogs: [changedCatalog] },
      })).rejects.toThrow('competitor_catalog_target_mismatch');
      expect(harness.ingestTransaction.runIdempotentInAttempt)
        .not.toHaveBeenCalled();
      expect(harness.handler.executeSellerCatalogs).not.toHaveBeenCalled();
    }
  });

  it('allows the configured target set, rejects extra sellers, and reports replay truthfully', async () => {
    const harness = createHarness({ target: 'configured_watchlist' });
    harness.ingestTransaction.runIdempotentInAttempt.mockImplementationOnce(
      async (_transaction, _input, operation) => ({
        value: await operation(),
        replayed: true,
      }),
    );
    await expect(harness.service.ingest({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { catalogs: [catalog] },
    })).resolves.toEqual({
      captured: 1,
      ignored: 0,
      ignoredReasons: { missingSerpSnapshot: 0, newerCatalogPreserved: 0 },
      replayed: true,
    });

    const wrongExactSeller = createHarness({
      target: 'seller_id',
      sellerId: 'another-seller',
    });
    await expect(wrongExactSeller.service.ingest({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { catalogs: [catalog] },
    })).rejects.toThrow(ConflictException);
  });

  it('propagates wrong token/status/deadline fence loss without owner writes', async () => {
    const harness = createHarness();
    harness.verifier.withActiveBrowserAttemptFence.mockRejectedValueOnce(
      new ConflictException('operation_attempt_fence_lost'),
    );
    await expect(harness.service.ingest({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { catalogs: [catalog] },
    })).rejects.toThrow('operation_attempt_fence_lost');
    expect(harness.tracking.getSellerTargets).not.toHaveBeenCalled();
    expect(harness.handler.executeSellerCatalogs).not.toHaveBeenCalled();
  });

  it('preserves the exact ignored reason instead of translating a missing baseline into provider failure', async () => {
    const harness = createHarness();
    harness.handler.executeSellerCatalogs.mockResolvedValueOnce({
      success: true,
      results: [],
      ignored: [{
        keyword: catalog.keyword,
        sellerId: catalog.sellerId,
        reason: 'serp_snapshot_missing',
      }],
    });

    await expect(harness.service.ingest({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { catalogs: [catalog] },
    })).resolves.toEqual({
      captured: 0,
      ignored: 1,
      ignoredReasons: { missingSerpSnapshot: 1, newerCatalogPreserved: 0 },
      replayed: false,
    });
  });
});
