import { describe, expect, it, vi } from 'vitest';
import type {
  ChannelAvailabilityRepositoryRow,
  ChannelProductMatchingRepositoryPort,
} from '../../port/out/repository/channel-product-matching.repository.port';
import { ChannelSkuAvailabilityService } from '../channel-sku-availability.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const listingId = '00000000-0000-4000-8000-000000000002';
const optionId = '00000000-0000-4000-8000-000000000003';

describe('ChannelSkuAvailabilityService', () => {
  it('hydrates linked variant recipe capacity without mutating links or inventory', async () => {
    const repository = makeRepository([
      row({
        components: [
          component('00000000-0000-4000-8000-000000000010', 12, 1),
          component('00000000-0000-4000-8000-000000000011', 9, 2),
        ],
      }),
    ]);
    const service = new ChannelSkuAvailabilityService(repository);

    const result = await service.list(organizationId, {
      status: 'all',
      page: 1,
      limit: 50,
    });

    expect(result.items[0]).toMatchObject({
      productVariantId: '00000000-0000-4000-8000-000000000020',
      variantCode: 'VAR-1',
      recipeStatus: 'matched',
      sku: { mappingStatus: 'matched', sellableStock: 4 },
    });
    expect(result.items[0]?.components.map((entry) => ({
      capacity: entry.componentCapacity,
      bottleneck: entry.isBottleneck,
    }))).toEqual([
      { capacity: 12, bottleneck: false },
      { capacity: 4, bottleneck: true },
    ]);
    expect(repository.linkProduct).not.toHaveBeenCalled();
    expect(repository.linkOption).not.toHaveBeenCalled();
  });

  it('returns null capacity for unmatched, configuration, and inactive-component rows', async () => {
    const repository = makeRepository([
      row({ variant: null }),
      row({ optionId: '00000000-0000-4000-8000-000000000004', components: [] }),
      row({
        optionId: '00000000-0000-4000-8000-000000000005',
        components: [
          { ...component('00000000-0000-4000-8000-000000000012', 5, 1), isActive: false },
        ],
      }),
    ]);
    const service = new ChannelSkuAvailabilityService(repository);

    const result = await service.list(organizationId, {
      status: 'all',
      page: 1,
      limit: 50,
    });

    expect(result.items.map((item) => ({
      status: item.sku.mappingStatus,
      recipeStatus: item.recipeStatus,
      capacity: item.sku.sellableStock,
      warnings: item.warnings,
    }))).toEqual([
      {
        status: 'unmatched',
        recipeStatus: 'unmatched',
        capacity: null,
        warnings: [],
      },
      {
        status: 'needs_review',
        recipeStatus: 'configuration_required',
        capacity: null,
        warnings: ['configuration_required'],
      },
      {
        status: 'needs_review',
        recipeStatus: 'review_required',
        capacity: null,
        warnings: ['component_inactive'],
      },
    ]);
  });

  it('filters and paginates after deriving statuses while keeping full summary counts', async () => {
    const repository = makeRepository([
      row({ variant: null }),
      row({ optionId: '00000000-0000-4000-8000-000000000004', components: [] }),
      row({
        optionId: '00000000-0000-4000-8000-000000000005',
        components: [component('00000000-0000-4000-8000-000000000012', 0, 1)],
      }),
      row({
        optionId: '00000000-0000-4000-8000-000000000006',
        components: [component('00000000-0000-4000-8000-000000000013', 3, 1)],
      }),
    ]);
    const service = new ChannelSkuAvailabilityService(repository);

    const result = await service.list(organizationId, {
      status: 'needs_review',
      page: 1,
      limit: 1,
    });

    expect(result).toMatchObject({
      total: 1,
      summary: { total: 4, inStock: 1, outOfStock: 1, unmatched: 1, needsReview: 1 },
    });
    expect(result.items).toHaveLength(1);
  });
});

function makeRepository(rows: ChannelAvailabilityRepositoryRow[]) {
  return {
    listQueue: vi.fn(),
    getProductCandidateContext: vi.fn(),
    getVariantCandidateContext: vi.fn(),
    linkProduct: vi.fn(),
    linkOption: vi.fn(),
    listAvailabilityRows: vi.fn().mockResolvedValue(rows),
  } as unknown as {
    [K in keyof ChannelProductMatchingRepositoryPort]: ReturnType<typeof vi.fn>;
  };
}

function row(input: {
  optionId?: string;
  variant?: null;
  components?: ChannelAvailabilityRepositoryRow['variant'] extends infer V
    ? V extends { components: infer C } ? C : never
    : never;
}): ChannelAvailabilityRepositoryRow {
  const variant = input.variant === null ? null : {
    id: '00000000-0000-4000-8000-000000000020',
    masterProductId: '00000000-0000-4000-8000-000000000021',
    code: 'VAR-1',
    name: 'Variant',
    components: input.components ?? [],
  };
  return {
    channelAccount: {
      id: '00000000-0000-4000-8000-000000000030',
      channel: 'coupang',
      name: 'Wing',
    },
    listing: {
      id: listingId,
      externalId: 'P-1',
      channelName: 'Registered',
      displayName: 'Display',
      status: 'active',
      masterProductId: variant?.masterProductId ?? null,
    },
    option: {
      id: input.optionId ?? optionId,
      externalOptionId: input.optionId ?? 'O-1',
      sellerSku: null,
      itemName: 'Large',
      barcode: null,
      modelNumber: null,
      salePrice: 10_000,
      status: 'active',
      updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    },
    variant,
  };
}

function component(id: string, currentStock: number, quantity: number) {
  return {
    sellpiaInventorySkuId: id,
    code: `SP-${id}`,
    name: 'Inventory',
    optionName: null,
    barcode: null,
    currentStock,
    purchasePrice: 1_000,
    isActive: true,
    quantity,
    source: 'manual' as const,
  };
}
