import { readFileSync } from 'node:fs';
import { AppException } from '@kiditem/shared/server-errors';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RocketPurchasePreviewService } from '../rocket-purchase-preview.service';
import type { RocketPoCatalogPort } from '../../../../channels/application/port/in/rocket-po-catalog.port';
import type { ChannelSkuAvailabilityPort } from '../../../../channels/application/port/in/channel-sku-availability.port';
import type { SellpiaInventoryFreshnessGatePort } from '../../../../inventory/application/port/in/stock/sellpia-inventory-freshness-gate.port';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const poLineId = '1001:P-1:8801234567890:1';
const channelSkuId = '44444444-4444-4444-8444-444444444444';
const masterProductId = '55555555-5555-4555-8555-555555555555';
const productVariantId = '77777777-7777-4777-8777-777777777777';
const sellpiaInventorySkuId = '88888888-8888-4888-8888-888888888888';

function request() {
  return {
    channelAccountId,
    collection: {
      collectionRunId: '66666666-6666-4666-8666-666666666666',
      vendorId: 'VENDOR-1',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: 1,
      failedPoNumbers: [],
    },
    rows: [{
      poLineId,
      poNumber: '1001',
      vendorId: 'VENDOR-1',
      productNo: 'P-1',
      barcode: '8801234567890',
      productName: 'Rocket item',
      orderQty: 4,
      plannedDeliveryDate: '2026-07-20',
    }],
    editedQuantities: {},
  };
}

function dependencies() {
  const catalog = {
    publishAndResolve: vi.fn().mockResolvedValue({
      blockingReason: null,
      catalog: { run: { id: 'run-1' }, duplicate: false, changes: {} },
      identities: [{ poLineId, channelSkuId }],
    }),
  } as unknown as RocketPoCatalogPort;
  const availability = {
    findByChannelSkuIds: vi.fn().mockResolvedValue([{
      channelAccount: { id: channelAccountId, channel: 'rocket', name: 'Rocket' },
      product: { id: 'product-1', externalProductId: 'P-1', registeredName: 'Rocket item', displayName: null, status: 'observed' },
      sku: { id: channelSkuId, externalSkuId: 'P-1', sellerSku: 'P-1', optionName: 'Rocket item', barcode: '8801234567890', modelNumber: null, salePrice: null, status: 'observed', mappingStatus: 'matched', sellableStock: 5, updatedAt: '2026-07-16T00:00:00.000Z' },
      masterProductId,
      productVariantId,
      variantCode: 'VAR-1',
      variantName: 'Default',
      recipeStatus: 'matched',
      components: [{ sellpiaInventorySkuId, code: 'SP-1', name: 'Sellpia', optionName: null, barcode: '8801234567890', currentStock: 5, activeCommitmentQuantity: 0, availableStock: 5, purchasePrice: null, isActive: true, quantity: 1, source: 'manual', componentCapacity: 5, isBottleneck: true }],
      warnings: [],
    }]),
  } as unknown as ChannelSkuAvailabilityPort;
  const freshness = {
    assertFreshAndActive: vi.fn().mockResolvedValue({
      fence: '77777777-7777-4777-8777-777777777777',
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T00:10:00.000Z',
    }),
    readFreshCapacity: vi.fn().mockResolvedValue({
      fence: '77777777-7777-4777-8777-777777777777',
      generation: '1',
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T00:10:00.000Z',
      inventorySkus: [{ sellpiaInventorySkuId, currentStock: 5, activeCommitmentQuantity: 0, availableStock: 5, isActive: true }],
    }),
  } as unknown as SellpiaInventoryFreshnessGatePort;
  return { catalog, availability, freshness };
}

function previewService(deps: ReturnType<typeof dependencies>) {
  return new RocketPurchasePreviewService(
    deps.catalog,
    deps.availability,
    deps.freshness,
  );
}

describe('RocketPurchasePreviewService', () => {
  it('publishes identities, gates active components, and returns a read-time preview', async () => {
    const deps = dependencies();
    const service = previewService(deps);

    const result = await service.preview({ organizationId, userId, request: request() });

    expect(deps.catalog.publishAndResolve).toHaveBeenCalledWith({
      organizationId,
      userId,
      request: request(),
    });
    expect(deps.availability.findByChannelSkuIds).toHaveBeenCalledWith(
      organizationId,
      [channelSkuId],
    );
    expect((deps.freshness as unknown as {
      readFreshCapacity: ReturnType<typeof vi.fn>;
    }).readFreshCapacity).toHaveBeenCalledWith({
      organizationId,
      sellpiaInventorySkuIds: [sellpiaInventorySkuId],
    });
    expect(result.rows[0]).toMatchObject({
      poLineId,
      plannedDeliveryDate: '2026-07-20',
      recommendedQuantity: 4,
      reason: null,
      masterProductId,
      productVariantId,
      components: [{ sellpiaInventorySkuId }],
    });
    expect(result).not.toHaveProperty('confirmationFile');
    expect(result).not.toHaveProperty('submissionAttempt');
  });

  it.each(['collection_incomplete', 'vendor_mismatch'] as const)(
    'blocks %s before capacity or freshness reads',
    async (blockingReason) => {
      const deps = dependencies();
      vi.mocked(deps.catalog.publishAndResolve).mockResolvedValue({
        blockingReason,
        catalog: null,
        identities: [],
      });
      const service = previewService(deps);

      const result = await service.preview({ organizationId, userId, request: request() });

      expect(result.rows[0]?.reason).toBe(blockingReason);
      expect(result.rows[0]?.plannedDeliveryDate).toBe('2026-07-20');
      expect(deps.availability.findByChannelSkuIds).not.toHaveBeenCalled();
      expect((deps.freshness as unknown as {
        readFreshCapacity: ReturnType<typeof vi.fn>;
      }).readFreshCapacity).not.toHaveBeenCalled();
    },
  );

  it.each(['collection_incomplete', 'vendor_mismatch'] as const)(
    'rejects a positive edited quantity before returning a %s blocked row',
    async (blockingReason) => {
      const deps = dependencies();
      vi.mocked(deps.catalog.publishAndResolve).mockResolvedValue({
        blockingReason,
        catalog: null,
        identities: [],
      });
      const service = previewService(deps);
      const edited = request();
      edited.editedQuantities = { [poLineId]: 1 };

      await expect(service.preview({ organizationId, userId, request: edited }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(deps.availability.findByChannelSkuIds).not.toHaveBeenCalled();
    },
  );

  it.each(['collection_incomplete', 'vendor_mismatch'] as const)(
    'clamps a retained edit to zero for a %s blocked row when explicitly requested',
    async (blockingReason) => {
      const deps = dependencies();
      vi.mocked(deps.catalog.publishAndResolve).mockResolvedValue({
        blockingReason,
        catalog: null,
        identities: [],
      });
      const service = previewService(deps);

      const result = await service.preview({
        organizationId,
        userId,
        request: {
          ...request(),
          editedQuantities: { [poLineId]: 1 },
          clampEditedQuantities: true,
        } as never,
      });

      expect(result.rows[0]).toMatchObject({
        maxQuantity: 0,
        editedQuantity: 0,
        recommendedQuantity: 0,
        reason: blockingReason,
      });
      expect(deps.availability.findByChannelSkuIds).not.toHaveBeenCalled();
    },
  );

  it.each([
    'SELLPIA_SYNC_REQUIRED',
    'SELLPIA_SYNC_IN_PROGRESS',
    'SELLPIA_SYNC_FAILED',
  ])('surfaces %s before returning any capacity recommendation', async (code) => {
    const deps = dependencies();
    vi.mocked((deps.freshness as unknown as {
      readFreshCapacity: ReturnType<typeof vi.fn>;
    }).readFreshCapacity).mockRejectedValue(
      new AppException(409, code, 'fresh snapshot required'),
    );
    const service = previewService(deps);

    await expect(service.preview({ organizationId, userId, request: request() }))
      .rejects.toMatchObject({ code });
  });

  it('allocates from the gated generation when stock refreshes after availability read', async () => {
    const deps = dependencies();
    vi.mocked((deps.freshness as unknown as {
      readFreshCapacity: ReturnType<typeof vi.fn>;
    }).readFreshCapacity).mockResolvedValue({
      fence: '88888888-8888-4888-8888-888888888888',
      generation: '2',
      lastVerifiedAt: '2026-07-16T00:01:00.000Z',
      expiresAt: '2026-07-16T00:11:00.000Z',
      inventorySkus: [{ sellpiaInventorySkuId, currentStock: 0, activeCommitmentQuantity: 0, availableStock: 0, isActive: true }],
    });
    const service = previewService(deps);

    const result = await service.preview({ organizationId, userId, request: request() });

    expect(result.rows[0]).toMatchObject({
      maxQuantity: 0,
      recommendedQuantity: 0,
      reason: 'insufficient_capacity',
    });
  });

  it.each([
    ['configuration_required', 'configuration_required'],
    ['review_required', 'review_required'],
  ] as const)('blocks a %s variant without reading freshness', async (
    recipeStatus,
    reason,
  ) => {
    const deps = dependencies();
    const item = (await deps.availability.findByChannelSkuIds(
      organizationId,
      [channelSkuId],
    ))[0]!;
    vi.mocked(deps.availability.findByChannelSkuIds).mockResolvedValue([{
      ...item,
      recipeStatus,
      sku: { ...item.sku, mappingStatus: 'needs_review', sellableStock: null },
      components: recipeStatus === 'configuration_required' ? [] : item.components,
    }]);
    const service = previewService(deps);

    const result = await service.preview({ organizationId, userId, request: request() });

    expect(result.rows[0]).toMatchObject({ reason, maxQuantity: 0 });
    expect((deps.freshness as unknown as {
      readFreshCapacity: ReturnType<typeof vi.fn>;
    }).readFreshCapacity).not.toHaveBeenCalled();
  });

  it('deduplicates a physical component shared by multiple PO lines before freshness read', async () => {
    const deps = dependencies();
    const secondLineId = '1002:P-1:8801234567890:1';
    vi.mocked(deps.catalog.publishAndResolve).mockResolvedValue({
      blockingReason: null,
      catalog: null,
      identities: [
        { poLineId, channelSkuId },
        { poLineId: secondLineId, channelSkuId },
      ],
    });
    const input = request();
    input.rows.push({
      ...input.rows[0]!,
      poLineId: secondLineId,
      poNumber: '1002',
    });
    const service = previewService(deps);

    await service.preview({ organizationId, userId, request: input });

    expect((deps.freshness as unknown as {
      readFreshCapacity: ReturnType<typeof vi.fn>;
    }).readFreshCapacity).toHaveBeenCalledWith({
      organizationId,
      sellpiaInventorySkuIds: [sellpiaInventorySkuId],
    });
  });

  it('uses the common gated availability without subtracting a Supply aggregate again', async () => {
    const deps = dependencies();
    vi.mocked((deps.freshness as unknown as {
      readFreshCapacity: ReturnType<typeof vi.fn>;
    }).readFreshCapacity).mockResolvedValue({
      fence: '77777777-7777-4777-8777-777777777777',
      generation: '1',
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T00:10:00.000Z',
      inventorySkus: [{
        sellpiaInventorySkuId,
        currentStock: 100,
        activeCommitmentQuantity: 20,
        availableStock: 80,
        isActive: true,
      }],
    });
    const service = previewService(deps);
    const input = request();
    input.rows[0]!.orderQty = 100;

    const result = await service.preview({ organizationId, userId, request: input });

    expect(result).toMatchObject({
      inventoryGeneration: '1',
      rows: [{ maxQuantity: 80, recommendedQuantity: 80 }],
    });
  });

  it('contains no provider, workbook, attempt, or inventory mutation lane', () => {
    const source = readFileSync(
      new URL('../rocket-purchase-preview.service.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(
      /PurchaseOrderSubmissionAttempt|confirmationFile|provider|currentStock\s*=|ROCKET_PURCHASE_COMMITMENT_READ_PORT|findActiveQuantities|committedQuantities/i,
    );
  });
});
