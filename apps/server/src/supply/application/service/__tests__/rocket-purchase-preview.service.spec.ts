import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { RocketPurchasePreviewService } from '../rocket-purchase-preview.service';
import type { RocketPoCatalogPort } from '../../../../orders/application/port/in/rocket-po-catalog.port';
import type { ChannelSkuAvailabilityPort } from '../../../../channels/application/port/in/channel-sku-availability.port';
import type { ProductCollectionFreshnessGatePort } from '../../../../products/application/port/in/product-collection-freshness-gate.port';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const inventoryAttemptId = '99999999-9999-4999-8999-999999999999';
const poLineId = '1001:P-1:8801234567890:1';
const channelSkuId = '44444444-4444-4444-8444-444444444444';
const masterProductId = '55555555-5555-4555-8555-555555555555';
const componentMasterProductId = '88888888-8888-4888-8888-888888888888';

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

function reference(source: ReturnType<typeof request> & { previewScope?: 'confirmation_requested'; clampEditedQuantities?: boolean }) {
  return { channelAccountId, inventoryAttemptId, rocketPoOperationId: '66666666-6666-4666-8666-666666666666',
    editedQuantities: source.editedQuantities, ...(source.previewScope && { previewScope: source.previewScope }),
    ...(source.clampEditedQuantities !== undefined && { clampEditedQuantities: source.clampEditedQuantities }) };
}
function publication() {
  return { rocketPoOperationId: '66666666-6666-4666-8666-666666666666', channelAccountId, actualCutoffAt: '2026-07-16T00:00:00.000Z', rowCount: 1 };
}
function dependencies() {
  const catalog = {
    readComplete: vi.fn().mockResolvedValue({
      ...request(), rocketPoOperationId: '66666666-6666-4666-8666-666666666666',
      catalog: publication(),
      identities: [{ poLineId, channelSkuId }],
    }),
  } as unknown as RocketPoCatalogPort;
  const availability = {
    findByChannelSkuIds: vi.fn().mockResolvedValue([{
      channelAccount: { id: channelAccountId, channel: 'rocket', name: 'Rocket' },
      product: { id: 'product-1', externalProductId: 'P-1', registeredName: 'Rocket item', displayName: null, status: 'observed' },
      sku: { id: channelSkuId, externalSkuId: 'P-1', sellerSku: 'P-1', optionName: 'Rocket item', barcode: '8801234567890', modelNumber: null, salePrice: null, status: 'observed', mappingStatus: 'matched', sellableStock: 5, updatedAt: '2026-07-16T00:00:00.000Z' },
      masterProductId,
      recipeStatus: 'matched',
      components: [{ masterProductId: componentMasterProductId, code: 'SP-1', name: 'Sellpia', optionName: null, barcode: '8801234567890', currentStock: 5, purchasePrice: null, quantity: 1, source: 'manual', componentCapacity: 5, isBottleneck: true }],
      warnings: [],
    }]),
  } as unknown as ChannelSkuAvailabilityPort;
  const freshness = {
    requireCollectedStock: vi.fn().mockResolvedValue({
      status: 'fresh',
      fence: '77777777-7777-4777-8777-777777777777',
      generation: '1',
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T00:10:00.000Z',
      products: [{ masterProductId: componentMasterProductId, currentStock: 5 }],
    }),
  } as unknown as ProductCollectionFreshnessGatePort;
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
  it('reads complete identities, gates active components, and returns a read-time preview', async () => {
    const deps = dependencies();
    const service = previewService(deps);

    const result = await service.preview({
      organizationId,
      userId,
      request: reference(request()),
    });

    expect(deps.catalog.readComplete).toHaveBeenCalledWith({
      organizationId,
      channelAccountId,
      rocketPoOperationId: '66666666-6666-4666-8666-666666666666',
    });
    expect(deps.availability.findByChannelSkuIds).toHaveBeenCalledWith(
      organizationId,
      [channelSkuId],
    );
    expect((deps.freshness as unknown as {
      requireCollectedStock: ReturnType<typeof vi.fn>;
    }).requireCollectedStock).toHaveBeenCalledWith({
      organizationId,
      attemptId: inventoryAttemptId,
      masterProductIds: [componentMasterProductId],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready preview');
    expect(result.rows[0]).toMatchObject({
      poLineId,
      plannedDeliveryDate: '2026-07-20',
      recommendedQuantity: 4,
      reason: null,
      masterProductId,
      channelListingOptionId: channelSkuId,
      components: [{
        masterProductId: componentMasterProductId,
        code: 'SP-1',
        name: 'Sellpia',
        optionName: null,
      }],
    });
    expect(result).not.toHaveProperty('confirmationFile');
    expect(result).not.toHaveProperty('submissionAttempt');
  });

  it('rejects a missing collection reference before reading or calculating', async () => {
    const deps = dependencies();
    const { inventoryAttemptId: _omitted, ...withoutCollection } = reference(request());
    await expect(previewService(deps).preview({
      organizationId, userId, request: withoutCollection as ReturnType<typeof reference>,
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'ROCKET_PREVIEW_REQUEST_INVALID' } });
    expect(deps.catalog.readComplete).not.toHaveBeenCalled();
  });

  it('preserves the channel option while withholding an unconfirmed MasterProduct link', async () => {
    const deps = dependencies();
    const [linked] = await deps.availability.findByChannelSkuIds(
      organizationId,
      [channelSkuId],
    );
    vi.mocked(deps.availability.findByChannelSkuIds).mockResolvedValue([{
      ...linked!,
      masterProductId: null,
      recipeStatus: 'unmatched',
      components: [],
      sku: {
        ...linked!.sku,
        mappingStatus: 'unmatched',
        sellableStock: null,
      },
    }]);
    const service = previewService(deps);

    const result = await service.preview({
      organizationId,
      userId,
      request: reference(request()),
    });

    if (result.status !== 'ready') throw new Error('Expected ready preview');
    expect(result.rows[0]).toMatchObject({
      reason: 'mapping_required',
      masterProductId: null,
      channelListingOptionId: channelSkuId,
    });
  });

  it('reads the full monthly archive but previews only confirmation-requested rows', async () => {
    const deps = dependencies();
    const completedLineId = '1002:P-2:8801234567891:1';
    vi.mocked(deps.catalog.readComplete).mockResolvedValue({
      ...request(), rocketPoOperationId: '66666666-6666-4666-8666-666666666666',
      catalog: publication(),
      identities: [
        { poLineId, channelSkuId },
        { poLineId: completedLineId, channelSkuId },
      ],
    });
    const input = {
      ...request(),
      previewScope: 'confirmation_requested' as const,
      collection: { ...request().collection, detailPoCount: 2 },
      rows: [
        { ...request().rows[0]!, poStatusCode: 'RI' },
        {
          ...request().rows[0]!,
          poLineId: completedLineId,
          poNumber: '1002',
          productNo: 'P-2',
          barcode: '8801234567891',
          poStatusCode: 'CI',
        },
      ],
    };
    vi.mocked(deps.catalog.readComplete).mockResolvedValue({ ...input, rocketPoOperationId: reference(input).rocketPoOperationId, catalog: publication(), identities: input.rows.map(row => ({ poLineId: row.poLineId, channelSkuId })) });
    const service = previewService(deps);

    const result = await service.preview({
      organizationId,
      userId,
      request: reference(input),
    });

    if (result.status !== 'ready') throw new Error('Expected ready preview');
    expect(deps.catalog.readComplete).toHaveBeenCalledWith({
      organizationId,
      channelAccountId,
      rocketPoOperationId: '66666666-6666-4666-8666-666666666666',
    });
    expect(result.rows.map(({ poLineId: resultLineId }) => resultLineId)).toEqual([poLineId]);
  });

  it('refuses a strict edit above the line capacity with the quantity code and the line in details', async () => {
    const deps = dependencies();
    const source = { ...request(), editedQuantities: { [poLineId]: 5 } };

    await expect(previewService(deps).preview({
      organizationId, userId, request: reference(source),
    })).rejects.toMatchObject({
      code: 'SUPPLY_ROCKET_QUANTITY_EXCEEDED',
      details: { poLineId, editedQuantity: 5, maxQuantity: 4 },
    });
  });

  it('does not return calculations when collection is running, failed or cancelled', async () => {
    const deps = dependencies();
    vi.mocked(deps.freshness.requireCollectedStock).mockRejectedValue(new Error('Collection incomplete'));
    await expect(previewService(deps).preview({
      organizationId, userId, request: reference(request()),
    })).rejects.toThrow('Collection incomplete');
  });

  it('allocates from the gated generation when stock refreshes after availability read', async () => {
    const deps = dependencies();
    vi.mocked((deps.freshness as unknown as {
      requireCollectedStock: ReturnType<typeof vi.fn>;
    }).requireCollectedStock).mockResolvedValue({
      status: 'fresh',
      fence: '88888888-8888-4888-8888-888888888888',
      generation: '2',
      lastVerifiedAt: '2026-07-16T00:01:00.000Z',
      expiresAt: '2026-07-16T00:11:00.000Z',
      products: [{ masterProductId: componentMasterProductId, currentStock: 0 }],
    });
    const service = previewService(deps);

    const result = await service.preview({
      organizationId,
      userId,
      request: reference(request()),
    });

    if (result.status !== 'ready') throw new Error('Expected ready preview');
    expect(result.rows[0]).toMatchObject({
      maxQuantity: 0,
      recommendedQuantity: 0,
      reason: 'insufficient_capacity',
    });
  });

  it.each([
    ['configuration_required', 'configuration_required'],
    ['review_required', 'review_required'],
  ] as const)('blocks a %s variant after confirming collection', async (
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

    const result = await service.preview({
      organizationId,
      userId,
      request: reference(request()),
    });

    if (result.status !== 'ready') throw new Error('Expected ready preview');
    expect(result.rows[0]).toMatchObject({ reason, maxQuantity: 0 });
    expect((deps.freshness as unknown as {
      requireCollectedStock: ReturnType<typeof vi.fn>;
    }).requireCollectedStock).toHaveBeenCalledWith({ organizationId, attemptId: inventoryAttemptId, masterProductIds: [] });
  });

  it('deduplicates a physical component shared by multiple PO lines before freshness read', async () => {
    const deps = dependencies();
    const secondLineId = '1002:P-1:8801234567890:1';
    vi.mocked(deps.catalog.readComplete).mockResolvedValue({
      ...request(), rocketPoOperationId: '66666666-6666-4666-8666-666666666666',
      catalog: publication(),
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
    vi.mocked(deps.catalog.readComplete).mockResolvedValue({ ...input, rocketPoOperationId: reference(input).rocketPoOperationId, catalog: publication(), identities: input.rows.map(row => ({ poLineId: row.poLineId, channelSkuId })) });
    const service = previewService(deps);

    await service.preview({
      organizationId,
      userId,
      request: reference(input),
    });

    expect((deps.freshness as unknown as {
      requireCollectedStock: ReturnType<typeof vi.fn>;
    }).requireCollectedStock).toHaveBeenCalledWith({
      organizationId,
      attemptId: inventoryAttemptId,
      masterProductIds: [componentMasterProductId],
    });
  });

  it('uses the gated physical current stock', async () => {
    const deps = dependencies();
    vi.mocked((deps.freshness as unknown as {
      requireCollectedStock: ReturnType<typeof vi.fn>;
    }).requireCollectedStock).mockResolvedValue({
      status: 'fresh',
      fence: '77777777-7777-4777-8777-777777777777',
      generation: '1',
      lastVerifiedAt: '2026-07-16T00:00:00.000Z',
      expiresAt: '2026-07-16T00:10:00.000Z',
      products: [{
        masterProductId: componentMasterProductId,
        currentStock: 100,
      }],
    });
    const service = previewService(deps);
    const input = request();
    input.rows[0]!.orderQty = 100;
    vi.mocked(deps.catalog.readComplete).mockResolvedValue({ ...input, rocketPoOperationId: reference(input).rocketPoOperationId, catalog: publication(), identities: [{ poLineId, channelSkuId }] });

    const result = await service.preview({
      organizationId,
      userId,
      request: reference(input),
    });

    if (result.status !== 'ready') throw new Error('Expected ready preview');
    expect(result).toMatchObject({
      status: 'ready',
      inventoryGeneration: '1',
      rows: [{
        maxQuantity: 100,
        recommendedQuantity: 100,
        components: [{
          masterProductId: componentMasterProductId,
          currentStock: 100,
        }],
      }],
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
