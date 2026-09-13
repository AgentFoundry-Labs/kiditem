import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CompetitorCatalogSourceController } from '../competitor-catalog-source.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';
const ATTEMPT_TOKEN = '20000000-0000-4000-8000-000000000001';

function createHarness() {
  const service = {
    beginAttempt: vi.fn(),
    readAttemptControl: vi.fn(),
    readSourceStatus: vi.fn(),
    submitAttempt: vi.fn(),
    failAttempt: vi.fn(),
  };
  return { controller: new CompetitorCatalogSourceController(service as never), service };
}

describe('CompetitorCatalogSourceController', () => {
  it('accepts only the direct all or seller_id start scope and derives organization scope', async () => {
    const { controller, service } = createHarness();

    await controller.beginAttempt(
      { target: 'seller_id', sellerId: 'seller_123' },
      'retry-key',
      ORGANIZATION_ID,
    );

    expect(service.beginAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'retry-key',
      input: { target: 'seller_id', sellerId: 'seller_123' },
    });
    expect(() => controller.beginAttempt(
      { target: 'unsupported' },
      'retry-key',
      ORGANIZATION_ID,
    )).toThrow(new BadRequestException('INVALID_COMPETITOR_CATALOG_SCOPE'));
  });

  it('accepts an owner-issued token only on terminal direct routes', async () => {
    const { controller, service } = createHarness();
    const body = {
      catalogs: [{
        keyword: '연필',
        sellerId: 'seller_123',
        sellerName: '판매자 A',
        sellerStoreUrl: 'https://shop.coupang.com/seller_123',
        totalProductCount: 1,
        collectedProductCount: 1,
        isTruncated: false,
        sort: 'newest',
        capturedAt: '2026-09-04T00:00:00.000Z',
        products: [{
          sourceRank: 1,
          productId: 'product-1',
          itemId: null,
          vendorItemId: null,
          name: '연필',
          priceKrw: 1_000,
          reviewCount: 1,
          imageUrl: null,
          link: null,
        }],
      }],
    };

    await controller.submitAttempt(ATTEMPT_ID, ATTEMPT_TOKEN, body, ORGANIZATION_ID);
    expect(service.submitAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
    }));
    expect(() => controller.failAttempt(
      ATTEMPT_ID,
      'not-a-token',
      { code: 'COLLECTION_CANCELLED', message: 'cancelled' },
      ORGANIZATION_ID,
    )).toThrow(new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN'));
  });
});
