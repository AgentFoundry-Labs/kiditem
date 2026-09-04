import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CompetitorCatalogSourceAttemptService } from '../competitor-catalog-source-attempt.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

const targets = [
  {
    sellerId: 'seller-a',
    sellerName: '판매자 A',
    sellerStoreUrl: 'https://shop.coupang.com/seller-a',
    keyword: '연필',
    priorityScore: 100,
    overlapProductCount: 1,
    matchedOwnProductCount: 1,
  },
  {
    sellerId: 'seller-b',
    sellerName: '판매자 B',
    sellerStoreUrl: 'https://shop.coupang.com/seller-b',
    keyword: '지우개',
    priorityScore: 90,
    overlapProductCount: 1,
    matchedOwnProductCount: 1,
  },
];

function createHarness(sourceTargets: readonly unknown[] = targets) {
  const tracking = {
    getSellerTargets: vi.fn(async () => ({ targets: sourceTargets })),
  };
  const attempts = {
    beginAttempt: vi.fn(async (input) => ({
      attemptId: '10000000-0000-4000-8000-000000000001',
      attemptToken: '20000000-0000-4000-8000-000000000001',
      state: 'RUNNING' as const,
      expiresAt: '2026-09-04T01:00:00.000Z',
      ...input,
    })),
    readAttemptControl: vi.fn(),
    readSourceStatus: vi.fn(),
    submitAttempt: vi.fn(),
    failAttempt: vi.fn(),
  };
  return {
    attempts,
    service: new CompetitorCatalogSourceAttemptService(
      attempts as never,
      tracking as never,
    ),
    tracking,
  };
}

describe('CompetitorCatalogSourceAttemptService', () => {
  it('freezes the server-selected all-target plan before a browser attempt starts', async () => {
    const { attempts, service, tracking } = createHarness();

    await service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'all-targets',
      input: { target: 'all' },
    });

    expect(tracking.getSellerTargets).toHaveBeenCalledWith(ORGANIZATION_ID, 30, 20);
    expect(attempts.beginAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'all-targets',
      input: { target: 'all' },
      targets: targets.map(({ sellerId, sellerName, sellerStoreUrl, keyword }) => ({
        sellerId,
        sellerName,
        sellerStoreUrl,
        keyword,
      })),
    });
  });

  it('freezes only the requested seller and rejects a seller that the owner did not select', async () => {
    const { attempts, service } = createHarness();

    await service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'one-target',
      input: { target: 'seller_id', sellerId: 'seller-b' },
    });

    expect(attempts.beginAttempt).toHaveBeenLastCalledWith(expect.objectContaining({
      targets: [{
        sellerId: 'seller-b',
        sellerName: '판매자 B',
        sellerStoreUrl: 'https://shop.coupang.com/seller-b',
        keyword: '지우개',
      }],
    }));

    await expect(service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'outside-target',
      input: { target: 'seller_id', sellerId: 'outside-seller' },
    })).rejects.toThrow(new BadRequestException('COMPETITOR_CATALOG_TARGET_NOT_CONFIGURED'));
  });

  it('keeps the historical zero-target no-change baseline explicit, but rejects malformed owner targets', async () => {
    const empty = createHarness([]);
    await empty.service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'zero-target-baseline',
      input: { target: 'all' },
    });
    expect(empty.attempts.beginAttempt).toHaveBeenCalledWith(expect.objectContaining({
      targets: [],
    }));

    const malformed = createHarness([{
      sellerId: 'seller-a',
      sellerName: '판매자 A',
      sellerStoreUrl: 'https://shop.coupang.com/seller-a',
      keyword: '',
    }]);
    await expect(malformed.service.beginAttempt({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'malformed-target',
      input: { target: 'all' },
    })).rejects.toThrow(new BadRequestException('COMPETITOR_CATALOG_TARGET_PLAN_INVALID'));
    expect(malformed.attempts.beginAttempt).not.toHaveBeenCalled();
  });
});
