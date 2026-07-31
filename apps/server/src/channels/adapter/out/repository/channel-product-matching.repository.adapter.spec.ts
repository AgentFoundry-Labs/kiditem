import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingRepositoryAdapter } from './channel-product-matching.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('ChannelProductMatchingRepositoryAdapter candidate search', () => {
  it('pushes product manual search into an ordered uncapped Prisma query', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          externalId: 'P-1',
          masterProductId: null,
          displayName: 'Registered',
          channelName: null,
          rawJson: null,
        }),
      },
      masterProduct: { findMany },
    } as never);

    await repository.getProductCandidateContext(organizationId, 'listing-1', 'needle');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        OR: expect.arrayContaining([
          { code: { contains: 'needle', mode: 'insensitive' } },
          { name: { contains: 'needle', mode: 'insensitive' } },
        ]),
      }),
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    }));
    expect(findMany.mock.calls[0]![0]).not.toHaveProperty('take');
  });

  it('pushes option manual search into the confirmed product variant query', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListingOption: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'option-1',
          externalOptionId: 'O-1',
          productVariantId: null,
          sellerSku: null,
          barcode: null,
          itemName: 'Large',
          rawJson: null,
          listing: { masterProductId: 'product-1' },
        }),
      },
      productVariant: { findMany },
    } as never);

    await repository.getVariantCandidateContext(organizationId, 'option-1', 'large');

    expect((repository as unknown as { prisma: {
      channelListingOption: { findFirst: ReturnType<typeof vi.fn> };
    } }).prisma.channelListingOption.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        masterProductId: 'product-1',
        OR: expect.arrayContaining([
          { code: { contains: 'large', mode: 'insensitive' } },
          { optionLabel: { contains: 'large', mode: 'insensitive' } },
        ]),
      }),
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    }));
    expect(findMany.mock.calls[0]![0]).not.toHaveProperty('take');
  });
});

describe('ChannelProductMatchingRepositoryAdapter matching counts', () => {
  it('does not use record lifecycle state to omit channel products or options from the matching queue', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: { findMany },
    } as never);

    await repository.listQueue(organizationId, {});

    const query = findMany.mock.calls[0]![0];
    expect(query.where).not.toHaveProperty('isActive');
    expect(JSON.stringify(query.where)).not.toContain('"isActive":true');
    expect(query.include.options).not.toHaveProperty('where');
  });

  it('counts direct links independently from linked-variant recipe readiness', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          listing({ masterProductId: null, masterProduct: null, options: [unlinkedOption()] }),
          listing({
            masterProductId: 'product-1',
            masterProduct: {
              id: 'product-1',
              code: 'KI-1',
              name: 'Linked product',
              imageUrls: ['https://cdn.example.com/operator.jpg'],
            },
            options: [
              linkedOption({ productVariant: variant([]) }),
              linkedOption({ productVariant: variant([component({ isActive: false })]) }),
              linkedOption({ productVariant: variant([component({ currentStock: 8, quantity: 2 })]) }),
            ],
          }),
        ]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});

    expect(queue).toMatchObject({
      counts: {
        products: { all: 2, linked: 1, unlinked: 1 },
        options: {
          all: 4,
          linked: 3,
          unlinked: 1,
          recipeConfirmed: 1,
          configurationRequired: 1,
          reviewRequired: 1,
        },
      },
    });
    expect(queue.products[1]).toMatchObject({
      listing: { channelImageUrl: null, saleStatus: null },
      linkedProduct: { displayImageUrl: 'https://cdn.example.com/operator.jpg' },
    });
  });

  it('exposes explicit marketplace sale status separately from approval status', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          listing({
            masterProductId: null,
            masterProduct: null,
            status: '승인완료',
            rawJson: {},
            options: [unlinkedOption({ status: 'NEW' })],
          }),
          listing({
            masterProductId: null,
            masterProduct: null,
            externalId: 'external-sale',
            status: '승인완료',
            rawJson: { saleStatus: '판매중' },
            options: [unlinkedOption({ status: 'NEW' })],
          }),
          listing({
            masterProductId: null,
            masterProduct: null,
            externalId: 'external-workbook-sale',
            status: '승인완료',
            rawJson: {},
            options: [unlinkedOption({ status: '판매중' })],
          }),
        ]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});

    expect(queue.products.map((row) => ({
      externalId: row.listing.externalId,
      status: row.listing.status,
      saleStatus: row.listing.saleStatus,
    }))).toEqual([
      { externalId: 'external-unlinked', status: '승인완료', saleStatus: null },
      { externalId: 'external-sale', status: '승인완료', saleStatus: '판매중' },
      { externalId: 'external-workbook-sale', status: '승인완료', saleStatus: '판매중' },
    ]);
  });
});

function listing({
  masterProductId,
  masterProduct,
  options,
  externalId,
  rawJson,
  status,
}: {
  masterProductId: string | null;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    imageUrls: string[];
  } | null;
  options: OptionFixture[];
  externalId?: string;
  rawJson?: Record<string, unknown>;
  status?: string | null;
}) {
  return {
    id: `listing-${masterProductId ?? 'unlinked'}`,
    externalId: externalId ?? `external-${masterProductId ?? 'unlinked'}`,
    displayName: 'Channel listing',
    status: status ?? 'active',
    rawJson: rawJson ?? null,
    masterProductId,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    channelAccount: { id: 'account-1', channel: 'coupang', name: 'Wing' },
    masterProduct,
    options,
  };
}

function unlinkedOption(overrides: { status?: string | null } = {}) {
  return {
    id: 'option-unlinked',
    externalOptionId: 'option-unlinked',
    itemName: 'Unlinked option',
    sellerSku: null,
    barcode: null,
    status: overrides.status ?? null,
    productVariantId: null,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    productVariant: null,
  };
}

function linkedOption({ productVariant }: { productVariant: ReturnType<typeof variant> }) {
  return {
    ...unlinkedOption(),
    id: `option-${productVariant.components.length}-${productVariant.components[0]?.sellpiaInventorySku.isActive ?? 'empty'}`,
    externalOptionId: `option-${productVariant.components.length}-${productVariant.components[0]?.sellpiaInventorySku.isActive ?? 'empty'}`,
    productVariantId: productVariant.id,
    productVariant,
  };
}

function variant(components: ReturnType<typeof component>[]) {
  return {
    id: `variant-${components.length}-${components[0]?.sellpiaInventorySku.isActive ?? 'empty'}`,
    masterProductId: 'product-1',
    code: 'KI-1-OPTION',
    name: 'Linked option',
    optionLabel: null,
    isActive: true,
    components,
  };
}

function component({
  currentStock = 0,
  isActive = true,
  quantity = 1,
}: {
  currentStock?: number;
  isActive?: boolean;
  quantity?: number;
} = {}) {
  return {
    sellpiaInventorySkuId: 'inventory-1',
    quantity,
    sellpiaInventorySku: { currentStock, isActive },
  };
}

type OptionFixture = ReturnType<typeof unlinkedOption> | ReturnType<typeof linkedOption>;
