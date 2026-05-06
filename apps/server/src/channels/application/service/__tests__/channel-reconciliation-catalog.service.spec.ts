import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelReconciliationCatalogService } from '../channel-reconciliation-catalog.service';
import type { PrismaService } from '../../../../prisma/prisma.service';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeOption(overrides: Record<string, unknown> = {}) {
  return {
    id: 'option-missing',
    sku: 'SKU-MISSING',
    legacyCode: 'LC-MISSING',
    optionName: '기본',
    availableStock: 3,
    inventory: {
      currentStock: 3,
      reservedStock: 0,
      safetyStock: 1,
    },
    master: {
      id: 'master-missing',
      name: '미매칭 상품',
      code: 'MP-0002',
      legacyCode: 'LC-MISSING',
      thumbnailUrl: null,
      imageUrl: null,
      listings: [],
    },
    ...overrides,
  };
}

describe('ChannelReconciliationCatalogService', () => {
  let prisma: {
    channelReconciliationRun: {
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    productOption: {
      findMany: ReturnType<typeof vi.fn>;
    };
    channelReconciliationItem: {
      findFirst: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      channelReconciliationRun: {
        create: vi.fn(async ({ data }) => ({ id: 'run-1', ...data })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      productOption: {
        findMany: vi.fn(async () => [
          makeOption({
            id: 'option-linked',
            sku: 'SKU-LINKED',
            legacyCode: 'LC-LINKED',
            optionName: '레드',
            master: {
              id: 'master-linked',
              name: '연결된 상품',
              code: 'MP-0001',
              legacyCode: 'LC-LINKED',
              thumbnailUrl: null,
              imageUrl: null,
              listings: [
                {
                  id: 'listing-1',
                  externalId: 'seller-1',
                  channelName: '쿠팡 연결 상품',
                  options: [
                    {
                      id: 'listing-option-1',
                      externalOptionId: 'vendor-1',
                      optionId: 'option-linked',
                      itemName: '쿠팡 레드',
                    },
                  ],
                },
              ],
            },
          }),
          makeOption(),
        ]),
      },
      channelReconciliationItem: {
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }) => ({ id: `item-${create.itemKey}`, ...create })),
        update: vi.fn(async ({ data }) => data),
      },
    };
  });

  it('creates catalog rows for linked and missing product options', async () => {
    const service = new ChannelReconciliationCatalogService(
      prisma as unknown as PrismaService,
    );

    const result = await service.syncCatalogCoverage(ORG);

    expect(prisma.productOption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          isDeleted: false,
          isActive: true,
          master: { isDeleted: false, pipelineStep: null },
        },
      }),
    );
    expect(prisma.channelReconciliationItem.upsert).toHaveBeenCalledTimes(2);

    const linkedCreate = prisma.channelReconciliationItem.upsert.mock.calls[0][0].create;
    expect(linkedCreate).toMatchObject({
      organizationId: ORG,
      channel: 'coupang',
      source: 'catalog_inventory',
      itemType: 'kiditem_option',
      itemKey: 'kiditem_option:option-linked',
      status: 'linked',
      externalId: 'seller-1',
      externalOptionId: 'vendor-1',
      linkedListingId: 'listing-1',
      linkedListingOptionId: 'listing-option-1',
      linkedMasterProductId: 'master-linked',
      linkedProductOptionId: 'option-linked',
      matchReason: 'external_id',
      resolutionSource: 'existing_external_id',
      confidence: 100,
    });

    const missingCreate = prisma.channelReconciliationItem.upsert.mock.calls[1][0].create;
    expect(missingCreate).toMatchObject({
      organizationId: ORG,
      channel: 'coupang',
      source: 'catalog_inventory',
      itemType: 'kiditem_option',
      itemKey: 'kiditem_option:option-missing',
      status: 'needs_review',
      externalId: null,
      externalOptionId: null,
      linkedListingId: null,
      linkedListingOptionId: null,
      linkedMasterProductId: 'master-missing',
      linkedProductOptionId: 'option-missing',
      matchReason: 'none',
      resolutionSource: null,
      confidence: null,
    });

    expect(result).toEqual({
      runId: 'run-1',
      totalCount: 2,
      alreadyLinkedCount: 1,
      autoLinkedCount: 0,
      needsReviewCount: 1,
      conflictCount: 0,
      errorCount: 0,
    });
    expect(prisma.channelReconciliationRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1', organizationId: ORG },
        data: expect.objectContaining({
          status: 'completed',
          totalCount: 2,
          alreadyLinkedCount: 1,
          needsReviewCount: 1,
          ignoredCount: 0,
        }),
      }),
    );
  });

  it('preserves ignored catalog rows on resync', async () => {
    prisma.productOption.findMany.mockResolvedValueOnce([makeOption()]);
    prisma.channelReconciliationItem.findFirst.mockResolvedValueOnce({
      id: 'ignored-item',
      status: 'ignored',
    });
    const service = new ChannelReconciliationCatalogService(
      prisma as unknown as PrismaService,
    );

    const result = await service.syncCatalogCoverage(ORG);

    expect(prisma.channelReconciliationItem.upsert).not.toHaveBeenCalled();
    expect(prisma.channelReconciliationItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_channel_source_itemKey: {
            organizationId: ORG,
            channel: 'coupang',
            source: 'catalog_inventory',
            itemKey: 'kiditem_option:option-missing',
          },
        },
        data: expect.objectContaining({
          lastSeenRunId: 'run-1',
          linkedMasterProductId: 'master-missing',
          linkedProductOptionId: 'option-missing',
        }),
      }),
    );
    expect(result).toEqual({
      runId: 'run-1',
      totalCount: 1,
      alreadyLinkedCount: 0,
      autoLinkedCount: 0,
      needsReviewCount: 0,
      conflictCount: 0,
      errorCount: 0,
    });
    expect(prisma.channelReconciliationRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1', organizationId: ORG },
        data: expect.objectContaining({ ignoredCount: 1 }),
      }),
    );
  });
});
