import { describe, expect, it, vi } from 'vitest';
import { SellpiaProductInventoryReader } from './sellpia-product-inventory-reader';

describe('SellpiaProductInventoryReader display-media enrichment', () => {
  it('batches one request per destination channel option and retains the returned image', async () => {
    const skuId = '11111111-1111-4111-8111-111111111111';
    const findDisplayMedia = vi.fn(async () => new Map([['channel-option-1', {
      url: 'https://cdn.example/exact.jpg',
      source: 'channel_catalog' as const,
      channel: 'coupang',
      channelListingId: 'listing-origin',
      externalOptionId: 'option-origin',
    }]]));
    const destinationFindMany = vi.fn(async (_input: unknown) => [{
      sellpiaInventorySkuId: skuId,
      quantity: 1,
      channelListingOption: channelOption(),
    }]);
    const reader = new SellpiaProductInventoryReader({
      sellpiaInventorySku: {
        findMany: vi.fn(async () => [{ id: skuId, code: 'SKU-1', barcode: null, isActive: true }]),
      },
      channelListingOptionInventoryComponent: {
        findMany: destinationFindMany,
      },
    } as never, {
      findBySkuIds: vi.fn(async () => ({
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{ sellpiaInventorySkuId: skuId, currentStock: 10, activeCommitmentQuantity: 0, availableStock: 10, isActive: true, generation: '1' }],
      })),
    } as never, { findDisplayMedia });

    const result = await reader.project('org-1', [{
      key: 'SKU-1',
      evidence: { productCode: 'SKU-1', optionCode: '', barcode: null },
      completeMonthly: [{ yearMonth: '2026-06', orderQty: 1 }],
    }]);

    expect(findDisplayMedia).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requests: [{
        key: 'channel-option-1',
        candidates: [{ channelListingId: 'listing-primary', externalOptionId: 'option-primary' }],
      }],
    });
    expect(result.projection.byProductKey.get('SKU-1')?.inventoryResolution).toMatchObject({
      status: 'matched',
      destinations: [{
        abcGrade: 'B',
        displayImage: { url: 'https://cdn.example/exact.jpg' },
      }],
    });
    expect(destinationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        channelListingOption: expect.objectContaining({
          organizationId: 'org-1',
          isActive: true,
        }),
      }),
    }));
  });

  it('logs media failure and preserves the inventory projection with null images', async () => {
    const skuId = '11111111-1111-4111-8111-111111111111';
    const reader = new SellpiaProductInventoryReader({
      sellpiaInventorySku: { findMany: vi.fn(async () => [{ id: skuId, code: 'SKU-1', barcode: null, isActive: true }]) },
      channelListingOptionInventoryComponent: {
        findMany: vi.fn(async () => [{
          sellpiaInventorySkuId: skuId,
          quantity: 1,
          channelListingOption: channelOption(),
        }]),
      },
    } as never, {
      findBySkuIds: vi.fn(async () => ({
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{ sellpiaInventorySkuId: skuId, currentStock: 10, activeCommitmentQuantity: 0, availableStock: 10, isActive: true, generation: '1' }],
      })),
    } as never, { findDisplayMedia: vi.fn(async () => { throw new Error('unavailable'); }) });
    const warn = vi.spyOn((reader as never as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);

    const result = await reader.project('org-1', [{
      key: 'SKU-1', evidence: { productCode: 'SKU-1', optionCode: '', barcode: null }, completeMonthly: [],
    }]);

    expect(warn).toHaveBeenCalledOnce();
    expect(result.projection.byProductKey.get('SKU-1')?.inventoryResolution).toMatchObject({
      status: 'matched', currentStock: 10, destinations: [{ displayImage: null }],
    });
  });

  it('projects the stored automatic evaluation beside the official nullable grade', async () => {
    const skuId = '11111111-1111-4111-8111-111111111111';
    const row = channelOption();
    row.listing.masterProduct.abcGrade = null;
    row.listing.masterProduct.abcEvaluation = evaluationRow();
    const reader = new SellpiaProductInventoryReader({
      sellpiaInventorySku: { findMany: vi.fn(async () => [{ id: skuId, code: 'SKU-1', barcode: null, isActive: true }]) },
      channelListingOptionInventoryComponent: {
        findMany: vi.fn(async () => [{
          sellpiaInventorySkuId: skuId,
          quantity: 1,
          channelListingOption: row,
        }]),
      },
    } as never, {
      findBySkuIds: vi.fn(async () => ({
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-07-17T00:00:00.000Z' },
        items: [{ sellpiaInventorySkuId: skuId, currentStock: 10, activeCommitmentQuantity: 0, availableStock: 10, isActive: true, generation: '1' }],
      })),
    } as never, { findDisplayMedia: vi.fn(async () => new Map()) });

    const result = await reader.project('org-1', [{
      key: 'SKU-1', evidence: { productCode: 'SKU-1', optionCode: '', barcode: null }, completeMonthly: [],
    }]);

    expect(result.projection.byProductKey.get('SKU-1')?.inventoryResolution).toMatchObject({
      status: 'matched',
      destinations: [{
        abcGrade: null,
        abcEvaluation: {
          calculationStatus: 'INSUFFICIENT_EVIDENCE',
          paidOrderCount: 4,
          sourceFreshness: expect.objectContaining({
            sellpia: expect.objectContaining({ capturedAt: new Date('2026-07-17T00:00:00.000Z') }),
          }),
        },
      }],
    });
  });
});

function channelOption(): {
  id: string;
  externalOptionId: string;
  itemName: string;
  listing: ReturnType<typeof listing>;
} {
  return {
    id: 'channel-option-1',
    externalOptionId: 'option-primary',
    itemName: 'Variant',
    listing: listing(),
  };
}

function listing() {
  return {
    id: 'listing-primary',
    externalId: 'LISTING-1',
    masterProduct: {
      id: 'master-1', code: 'MASTER-1', name: 'Master', abcGrade: 'B',
      abcEvaluation: null,
    },
    channelAccount: { channel: 'coupang', isPrimary: true },
  };
}

function evaluationRow() {
  return {
    calculationStatus: 'INSUFFICIENT_EVIDENCE',
    rawScore: null,
    adjustedScore: null,
    reliability: null,
    weightedRevenue: null,
    weightedOrderTimeCogs: null,
    weightedAdSpend: null,
    weightedContributionProfit: null,
    profitVelocity30: null,
    weightedContributionMargin: null,
    lossRecurrence: null,
    paidOrderCount: 4,
    observationDays: 11,
    firstValidPaidSaleAt: new Date('2026-07-08T00:00:00.000Z'),
    sourceCoverageStartDate: new Date('2025-06-15T00:00:00.000Z'),
    sourceCoverageEndDate: new Date('2026-07-17T00:00:00.000Z'),
    sellpiaCoverageStartDate: new Date('2025-06-15T00:00:00.000Z'),
    sellpiaCoverageEndDate: new Date('2026-07-17T00:00:00.000Z'),
    sellpiaSourceStatus: 'READY',
    sellpiaSourceCapturedAt: new Date('2026-07-17T00:00:00.000Z'),
    advertisingCoverageStartDate: new Date('2025-06-15T00:00:00.000Z'),
    advertisingCoverageEndDate: new Date('2026-07-17T00:00:00.000Z'),
    advertisingSourceStatus: 'CONFIRMED_ZERO',
    advertisingSourceCapturedAt: new Date('2026-07-17T00:00:00.000Z'),
    ordersSourceStatus: 'NOT_APPLIED',
    ordersCoverageStartDate: null,
    ordersCoverageEndDate: null,
    ordersSourceCapturedAt: null,
    mappingSourceStatus: 'READY',
    mappingInventoryGeneration: 1n,
    mappingVerifiedAt: new Date('2026-07-17T00:00:00.000Z'),
    costComponentsJson: {
      recognizedRevenue: { amount: 0, status: 'OBSERVED' },
      orderTimeCogs: { amount: 0, status: 'OBSERVED' },
      advertisingSpend: { amount: 0, status: 'CONFIRMED_ZERO' },
      marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
      outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
      returnLoss: { amount: 0, status: 'NOT_APPLIED' },
      otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
    },
    statusDetail: '최초 유효 유료 판매 후 30일 또는 유효 유료 주문 20건이 필요합니다.',
    calculatedAt: new Date('2026-07-18T00:00:00.000Z'),
    formulaVersion: null,
  };
}
