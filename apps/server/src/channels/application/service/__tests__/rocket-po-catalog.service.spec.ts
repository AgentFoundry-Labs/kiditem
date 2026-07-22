import { describe, expect, it, vi } from 'vitest';
import { RocketPoCatalogService } from '../rocket-po-catalog.service';
import type { RocketPoCatalogRepositoryPort } from '../../port/out/repository/rocket-po-catalog.repository.port';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';

function request(overrides: Record<string, unknown> = {}) {
  return {
    channelAccountId,
    collection: {
      collectionRunId: '44444444-4444-4444-8444-444444444444',
      vendorId: 'VENDOR-1',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: 1,
      failedPoNumbers: [],
    },
    rows: [{
      poLineId: '1001:P-1:8801234567890:1',
      poNumber: '1001',
      vendorId: 'VENDOR-1',
      productNo: 'P-1',
      barcode: '8801234567890',
      productName: 'Rocket item',
      orderQty: 4,
      plannedDeliveryDate: '2026-07-20',
    }],
    editedQuantities: {},
    ...overrides,
  };
}

function repository() {
  return {
    findActiveRocketAccount: vi.fn().mockResolvedValue({ vendorId: 'VENDOR-1' }),
    publish: vi.fn().mockResolvedValue({
      run: {
        id: '55555555-5555-4555-8555-555555555555',
        sourceType: 'coupang_rocket_po_catalog',
        channelAccountId,
        fileName: 'rocket-po-catalog.json',
        fileHash: 'a'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt: '2026-07-16T00:00:00.000Z',
        lastVerifiedAt: null,
        verificationCount: 0,
        lastTrigger: null,
        freshnessGeneration: null,
        manualFreshExportConfirmedAt: null,
        manualFreshExportConfirmedBy: null,
        qualityReport: null,
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:00.000Z',
      },
      duplicate: false,
      changes: {
        createdProductCount: 1,
        updatedProductCount: 0,
        createdSkuCount: 1,
        updatedSkuCount: 0,
      },
      identities: [{ poLineId: '1001:P-1:8801234567890:1', channelSkuId: 'sku-1' }],
    }),
    listSavedPos: vi.fn().mockResolvedValue([]),
    loadSavedCollection: vi.fn().mockResolvedValue(null),
  } satisfies Record<keyof RocketPoCatalogRepositoryPort, ReturnType<typeof vi.fn>>;
}

function recipeAutomation() {
  return {
    applySafeForOptions: vi.fn().mockResolvedValue({
      evaluatedProducts: 1,
      appliedProducts: 1,
      appliedVariants: 1,
      affectedOptions: 1,
      operatorReviewProducts: 0,
      blockedProducts: 0,
      alreadyConfiguredProducts: 0,
      skippedExistingVariants: 0,
    }),
  };
}

function evidencePort() {
  return {
    listActiveForMatching: async () => [],
    findByCodes: async () => [],
    findByNormalizedBarcodes: async () => [],
    findByNormalizedNames: async () => [],
    getActiveCommitmentBySkuIds: async () => ({}),
  };
}

function service(repo = repository(), automation = recipeAutomation(), evidence = evidencePort()) {
  return {
    repo,
    automation,
    service: new RocketPoCatalogService(repo, evidence as never, automation as never),
  };
}

describe('RocketPoCatalogService', () => {
  it.each([
    { collection: { ...request().collection, truncated: true } },
    { collection: { ...request().collection, failedPoNumbers: ['1001'] } },
    { collection: { ...request().collection, vendorId: '' } },
    { collection: { ...request().collection, detailPoCount: 0 } },
  ])('blocks incomplete collection evidence without publishing identities', async (override) => {
    const { repo, service: catalogService } = service();

    const result = await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request(override),
    });

    expect(result.blockingReason).toBe('collection_incomplete');
    expect(result.catalog).toBeNull();
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it('accepts a complete empty collection without vendor identity or publication', async () => {
    const repo = repository();
    repo.findActiveRocketAccount.mockResolvedValue({ vendorId: null });
    const { service: catalogService, automation } = service(repo);

    const result = await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request({
        collection: {
          ...request().collection,
          vendorId: '',
          detailPoCount: 0,
        },
        rows: [],
      }),
    });

    expect(result.blockingReason).toBeNull();
    expect(result.catalog).toBeNull();
    expect(result.identities).toEqual([]);
    expect(repo.publish).not.toHaveBeenCalled();
    expect(automation.applySafeForOptions).not.toHaveBeenCalled();
  });

  it('uses complete Supplier Hub evidence to claim an unconfigured Rocket vendor once', async () => {
    const repo = repository();
    repo.findActiveRocketAccount.mockResolvedValue({
      vendorId: null,
      sharedCoupangVendorId: 'VENDOR-1',
    });
    const { service: catalogService } = service(repo);

    const result = await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request(),
    });

    expect(result.blockingReason).toBeNull();
    expect(repo.publish).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      channelAccountId,
      vendorId: 'VENDOR-1',
    }));
  });

  it('blocks Supplier Hub evidence that differs from the shared Wing vendor', async () => {
    const repo = repository();
    repo.findActiveRocketAccount.mockResolvedValue({
      vendorId: null,
      sharedCoupangVendorId: 'OTHER-VENDOR',
    });
    const { service: catalogService } = service(repo);

    const result = await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request(),
    });

    expect(result.blockingReason).toBe('vendor_mismatch');
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it('blocks an exact Rocket vendor mismatch before catalog publication', async () => {
    const repo = repository();
    repo.findActiveRocketAccount.mockResolvedValue({ vendorId: 'OTHER-VENDOR' });
    const { service: catalogService } = service(repo);

    const result = await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request(),
    });

    expect(result.blockingReason).toBe('vendor_mismatch');
    expect(repo.publish).not.toHaveBeenCalled();
    expect(repo.findActiveRocketAccount).toHaveBeenCalledWith({
      organizationId,
      channelAccountId,
    });
  });

  it('rejects a missing, inactive, foreign, or non-Rocket account as unavailable', async () => {
    const repo = repository();
    repo.findActiveRocketAccount.mockResolvedValue(null);
    const { service: catalogService } = service(repo);

    await expect(catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request(),
    })).rejects.toThrow(/active Rocket/i);
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it('computes a server canonical hash independent of run ID and row order', async () => {
    const repo = repository();
    const { service: catalogService } = service(repo);
    const second = {
      ...request().rows[0],
      poLineId: '1002:P-2::1',
      poNumber: '1002',
      productNo: 'P-2',
      barcode: '',
    };

    await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request({
        collection: { ...request().collection, detailPoCount: 2 },
        rows: [second, request().rows[0]],
      }),
    });
    await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request({
        collection: {
          ...request().collection,
          collectionRunId: '66666666-6666-4666-8666-666666666666',
          detailPoCount: 2,
        },
        rows: [request().rows[0], second],
      }),
    });

    const firstPublish = repo.publish.mock.calls[0]?.[0];
    const secondPublish = repo.publish.mock.calls[1]?.[0];
    expect(firstPublish.fileName).toBe('rocket-po-catalog.json');
    expect(firstPublish.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(secondPublish.artifactHash).toBe(firstPublish.artifactHash);
    expect(firstPublish).not.toHaveProperty('clientHash');
  });

  it('passes the complete provider collection evidence into durable publication', async () => {
    const repo = repository();
    const { service: catalogService } = service(repo);

    await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request(),
    });

    expect(repo.publish).toHaveBeenCalledWith(expect.objectContaining({
      collection: request().collection,
    }));
  });

  it('applies safe recipes for the newly published Rocket options before returning the catalog', async () => {
    const { service: catalogService, automation } = service();

    const result = await catalogService.publishAndResolve({
      organizationId,
      userId,
      request: request(),
    });

    expect(automation.applySafeForOptions).toHaveBeenCalledWith({
      organizationId,
      channelAccountId,
      channelListingOptionIds: ['sku-1'],
    });
    expect(result.catalog).toEqual(expect.objectContaining({
      recipeAutomation: expect.objectContaining({
        appliedProducts: 1,
        appliedVariants: 1,
      }),
    }));
  });

  it('matchSavedStock: 같은 SKU 공동할당 — 확정수량 합이 availableStock(현재고-약정)을 넘지 않는다', async () => {
    const repo = repository();
    repo.loadSavedCollection = vi.fn().mockResolvedValue({
      channelAccountId,
      collection: {
        collectionRunId: '44444444-4444-4444-8444-444444444444',
        vendorId: 'VENDOR-1', listPagesRead: 1, totalListPages: 1, truncated: false,
        detailPoCount: 2, failedPoNumbers: [],
      },
      rows: [
        { poLineId: 'A:1', poNumber: '1001', vendorId: 'VENDOR-1', productNo: 'P-1', barcode: '8801234567890', productName: 'Rocket item', orderQty: 5, plannedDeliveryDate: '2026-07-20' },
        { poLineId: 'B:1', poNumber: '1002', vendorId: 'VENDOR-1', productNo: 'P-1', barcode: '8801234567890', productName: 'Rocket item', orderQty: 5, plannedDeliveryDate: '2026-07-20' },
      ],
    });
    const evidence = {
      ...evidencePort(),
      findByNormalizedBarcodes: async () => [
        { sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: '셀피아상품', optionName: null, barcode: '8801234567890', currentStock: 10 },
      ],
      getActiveCommitmentBySkuIds: async () => ({ 'sku-1': 4 }), // availableStock = 10 - 4 = 6
    };
    const catalog = new RocketPoCatalogService(repo, evidence as never, recipeAutomation() as never);

    const rows = await catalog.matchSavedStock({ organizationId, channelAccountId, sourceImportRunId: '55555555-5555-4555-8555-555555555555' });
    const byLine = new Map(rows.map((row) => [row.poLineId, row]));

    expect(byLine.get('A:1')).toMatchObject({
      matched: true, matchType: 'barcode', currentStock: 10, activeCommitmentQuantity: 4, availableStock: 6,
    });
    // 공동 할당(poLineId 순): A=5, B=1. 각각 6/10 이 아니라 합이 가용재고 6 이내.
    expect(byLine.get('A:1')!.confirmQuantity).toBe(5);
    expect(byLine.get('B:1')!.confirmQuantity).toBe(1);
    expect(byLine.get('A:1')!.confirmQuantity + byLine.get('B:1')!.confirmQuantity).toBeLessThanOrEqual(6);
  });
});
