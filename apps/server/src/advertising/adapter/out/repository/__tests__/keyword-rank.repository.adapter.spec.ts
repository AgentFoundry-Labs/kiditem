import { describe, expect, it } from 'vitest';
import { KeywordRankRepositoryAdapter } from '../keyword-rank.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';

describe('KeywordRankRepositoryAdapter', () => {
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
      },
      {
        organizationId: 'organization-1',
        keyword: '슬라임',
        vendorItemId: 'V-KEEP',
        businessDate: otherDate,
      },
    ];
    const transactionClient = {
      coupangWingSalesRankDailySnapshot: {
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
    expect(stored.some((row) => row.vendorItemId === 'V-KEEP')).toBe(true);
  });
});
