import { describe, expect, it, vi } from 'vitest';
import { KeywordRankRepositoryAdapter } from '../keyword-rank.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';

describe('KeywordRankRepositoryAdapter', () => {
  it('returns confirmed variants while preserving listing-name precedence over option names', async () => {
    const findMany = vi.fn(async () => [
      {
        externalOptionId: 'V-CHANNEL',
        sellerSku: null,
        itemName: '1개',
        productVariantId: 'variant-channel',
        listing: {
          externalId: 'external-channel',
          channelName: '채널 상품명',
          displayName: '표시 상품명',
          category: '완구',
        },
      },
      {
        externalOptionId: 'V-DISPLAY',
        sellerSku: null,
        itemName: '단품',
        productVariantId: null,
        listing: {
          externalId: 'external-display',
          channelName: null,
          displayName: '표시 상품명',
          category: null,
        },
      },
      {
        externalOptionId: 'V-EXTERNAL',
        sellerSku: null,
        itemName: '세트',
        productVariantId: null,
        listing: {
          externalId: 'external-fallback',
          channelName: null,
          displayName: null,
          category: null,
        },
      },
    ]);
    const adapter = new KeywordRankRepositoryAdapter({
      channelListingOption: { findMany },
    } as unknown as PrismaService);

    const result = await adapter.listOwnVendorItems('organization-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'organization-1' }),
      select: expect.objectContaining({ productVariantId: true }),
    }));
    expect(result).toEqual([
      expect.objectContaining({
        vendorItemId: 'V-CHANNEL',
        productName: '채널 상품명',
        productVariantId: 'variant-channel',
      }),
      expect.objectContaining({
        vendorItemId: 'V-DISPLAY',
        productName: '표시 상품명',
        productVariantId: null,
      }),
      expect.objectContaining({
        vendorItemId: 'V-EXTERNAL',
        productName: 'external-fallback',
        productVariantId: null,
      }),
    ]);
  });

  it('replaces the complete organization, keyword, and business-date scope', async () => {
    type DeleteWhere = {
      organizationId: string;
      keyword: string;
      businessDate: Date;
      vendorItemId?: { in: string[] };
    };
    const businessDate = new Date('2026-07-14T00:00:00.000Z');
    const otherDate = new Date('2026-07-13T00:00:00.000Z');
    const stored = [
      {
        organizationId: 'organization-1',
        keyword: '슬라임',
        vendorItemId: 'V-OLD',
        businessDate,
        capturedAt: new Date('2026-07-14T02:00:00.000Z'),
      },
      {
        organizationId: 'organization-1',
        keyword: '슬라임',
        vendorItemId: 'V-KEEP',
        businessDate: otherDate,
        capturedAt: new Date('2026-07-13T02:00:00.000Z'),
      },
    ];
    const transactionClient = {
      $queryRaw: async () => [{ lock: '' }],
      coupangWingSalesRankDailySnapshot: {
        findFirst: async ({ where }: { where: DeleteWhere }) =>
          stored
            .filter(
              (row) =>
                row.organizationId === where.organizationId &&
                row.keyword === where.keyword &&
                row.businessDate.getTime() === where.businessDate.getTime(),
            )
            .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ?? null,
        deleteMany: async ({ where }: { where: DeleteWhere }) => {
          const before = stored.length;
          for (let index = stored.length - 1; index >= 0; index -= 1) {
            const row = stored[index];
            const matchesScope =
              row.organizationId === where.organizationId &&
              row.keyword === where.keyword &&
              row.businessDate.getTime() === where.businessDate.getTime();
            const matchesVendor =
              !where.vendorItemId || where.vendorItemId.in.includes(row.vendorItemId);
            if (matchesScope && matchesVendor) stored.splice(index, 1);
          }
          return { count: before - stored.length };
        },
        createMany: async ({ data }: { data: typeof stored }) => {
          stored.push(...data);
          return { count: data.length };
        },
      },
    };
    const prisma = {
      $transaction: async (operation: (tx: typeof transactionClient) => Promise<number>) =>
        operation(transactionClient),
    } as unknown as PrismaService;
    const adapter = new KeywordRankRepositoryAdapter(prisma);

    await adapter.replaceWingSalesRankSnapshots([
      {
        organizationId: 'organization-1',
        keyword: '슬라임',
        vendorItemId: 'V-NEW',
        businessDate,
        productId: 'P-NEW',
        itemId: 'I-NEW',
        productName: '새 상품',
        categoryHierarchy: null,
        salesRank: 1,
        salesLast28d: 10,
        viewsLast28d: 100,
        revenueLast28d: 10000,
        conversionRate28d: 0.1,
        salePrice: 1000,
        reviewCount: 3,
        keywordSalesLast28d: 20,
        keywordViewsLast28d: 200,
        keywordConversionRate28d: 0.1,
        pagesScanned: 1,
        collectedCount: 20,
        totalResults: 20,
        capturedAt: new Date('2026-07-14T03:00:00.000Z'),
      },
    ]);
    const staleCount = await adapter.replaceWingSalesRankSnapshots([
      {
        organizationId: 'organization-1',
        keyword: '슬라임',
        vendorItemId: 'V-STALE',
        businessDate,
        productId: null,
        itemId: null,
        productName: '오래된 상품',
        categoryHierarchy: null,
        salesRank: 9,
        salesLast28d: null,
        viewsLast28d: null,
        revenueLast28d: null,
        conversionRate28d: null,
        salePrice: null,
        reviewCount: null,
        keywordSalesLast28d: null,
        keywordViewsLast28d: null,
        keywordConversionRate28d: null,
        pagesScanned: 1,
        collectedCount: 1,
        totalResults: 1,
        capturedAt: new Date('2026-07-14T02:30:00.000Z'),
      },
    ]);

    expect(
      stored
        .filter(
          (row) =>
            row.organizationId === 'organization-1' &&
            row.keyword === '슬라임' &&
            row.businessDate.getTime() === businessDate.getTime(),
        )
        .map((row) => row.vendorItemId),
    ).toEqual(['V-NEW']);
    expect(staleCount).toBe(0);
    expect(stored.some((row) => row.vendorItemId === 'V-KEEP')).toBe(true);
  });

  it('keeps a newer SERP and runs fresh JSON merges against the locked snapshot', async () => {
    const businessDate = new Date('2026-07-14T00:00:00.000Z');
    const stored = {
      id: 'serp-1',
      keyword: '문구',
      businessDate,
      capturedAt: new Date('2026-07-14T04:00:00.000Z'),
      pagesScanned: 2,
      itemCount: 1,
      items: { serpItems: [{ vendorItemId: 'V1' }], sellerCatalogs: [{ sellerId: 'A' }] },
    };
    const transactionClient = {
      $queryRaw: async () => [{ lock: '' }],
      coupangKeywordSerpDailySnapshot: {
        findUnique: async () => ({ ...stored }),
        update: async ({ data }: { data: Partial<typeof stored> }) => {
          Object.assign(stored, data);
          return { id: stored.id };
        },
        create: async () => ({ id: 'created' }),
      },
    };
    const prisma = {
      $transaction: async (operation: (tx: typeof transactionClient) => Promise<{ id: string }>) =>
        operation(transactionClient),
    } as unknown as PrismaService;
    const adapter = new KeywordRankRepositoryAdapter(prisma);
    const staleMerge = vi.fn(() => ({ sellerCatalogs: [{ sellerId: 'STALE' }] }));

    await adapter.upsertSerpSnapshot(
      {
        organizationId: 'organization-1',
        keyword: '문구',
        businessDate,
        items: {},
        itemCount: 0,
        pagesScanned: 0,
        capturedAt: new Date('2026-07-14T03:00:00.000Z'),
      },
      staleMerge,
    );
    await adapter.upsertSerpSnapshot(
      {
        organizationId: 'organization-1',
        keyword: '문구',
        businessDate,
        items: {},
        itemCount: 2,
        pagesScanned: 3,
        capturedAt: new Date('2026-07-14T05:00:00.000Z'),
      },
      (existing) => ({
        ...(existing?.items as Record<string, unknown>),
        sellerCatalogs: [{ sellerId: 'A' }, { sellerId: 'B' }],
      }),
    );

    expect(staleMerge).not.toHaveBeenCalled();
    expect(stored.capturedAt).toEqual(new Date('2026-07-14T05:00:00.000Z'));
    expect(stored.items).toEqual({
      serpItems: [{ vendorItemId: 'V1' }],
      sellerCatalogs: [{ sellerId: 'A' }, { sellerId: 'B' }],
    });
  });
});
