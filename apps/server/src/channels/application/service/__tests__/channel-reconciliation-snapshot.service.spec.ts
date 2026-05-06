import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelReconciliationSnapshotService } from '../channel-reconciliation-snapshot.service';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ChannelReconciliationService } from '../channel-reconciliation.service';
import type { ReconciliationRow } from '@kiditem/shared/channel-reconciliation';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeService(snapshots: unknown[]) {
  const prisma = {
    channelScrapeSnapshot: {
      findMany: vi.fn(async () => snapshots),
    },
  } as unknown as PrismaService;

  const reconciliation = {
    scanFromRows: vi.fn(async (_organizationId, rows: ReconciliationRow[]) => ({
      runId: '33333333-3333-4333-8333-333333333333',
      totalCount: rows.length,
      alreadyLinkedCount: 0,
      autoLinkedCount: rows.length,
      needsReviewCount: 0,
      conflictCount: 0,
      errorCount: 0,
    })),
  } as unknown as ChannelReconciliationService;

  return {
    service: new ChannelReconciliationSnapshotService(prisma, reconciliation),
    prisma,
    reconciliation,
  };
}

describe('ChannelReconciliationSnapshotService', () => {
  it('replays latest unmatched Coupang snapshots through the reconciliation rules', async () => {
    const olderDuplicate = {
      pageType: 'wing_inventory',
      externalId: '1001',
      externalOptionId: 'V1',
      rawJson: {
        productId: '1001',
        vendorItemId: 'V1',
        productName: 'Old name',
      },
      normalizedJson: null,
    };
    const latest = {
      pageType: 'wing_inventory',
      externalId: '1001',
      externalOptionId: 'V1',
      rawJson: {
        productId: '1001',
        vendorItemId: 'V1',
        productName: '카피바라 비눗방울',
        itemName: '1개',
        legacyCode: 'LEG-1',
        productUrl: 'https://wing.coupang.com/products/1001',
        imageUrl: 'https://cdn.example.com/e1.jpg',
        saleStatus: 'ON_SALE',
      },
      normalizedJson: {
        productName: '정규화 상품명',
        optionName: '정규화 옵션명',
      },
    };
    const listingOnly = {
      pageType: 'seller_products',
      externalId: '2002',
      externalOptionId: null,
      rawJson: { sellerProductId: '2002', sellerProductName: '등록상품' },
      normalizedJson: null,
    };
    const compositeExternalIdWithCanonicalProductId = {
      pageType: 'product',
      externalId: 'product::::키워드 보기::3003::상품 ID: 3003',
      externalOptionId: 'V3',
      rawJson: { productId: '3003', vendorItemId: 'V3', productName: '광고 상품' },
      normalizedJson: null,
    };
    const adProductWithoutCanonicalProductId = {
      pageType: 'product',
      externalId: 'product::::키워드 보기::V-ignored::광고 화면 row',
      externalOptionId: 'V-ignored',
      rawJson: { productName: '광고 화면 row' },
      normalizedJson: {
        pageType: 'product',
        itemId: 'V-ignored',
        productName: '광고 화면 row',
      },
    };
    const campaignSummary = {
      pageType: 'campaign',
      externalId: 'campaign::쿠팡윙 집중광고::::::',
      externalOptionId: null,
      rawJson: { campaignName: '쿠팡윙 집중광고' },
      normalizedJson: { pageType: 'campaign' },
    };
    const noExternalId = {
      pageType: 'wing_inventory',
      externalId: null,
      externalOptionId: 'V-ignored',
      rawJson: { productName: '식별 불가' },
      normalizedJson: null,
    };
    const { service, prisma, reconciliation } = makeService([
      latest,
      olderDuplicate,
      listingOnly,
      compositeExternalIdWithCanonicalProductId,
      adProductWithoutCanonicalProductId,
      campaignSummary,
      noExternalId,
    ]);

    const result = await service.syncFromSnapshots(ORG);

    expect(prisma.channelScrapeSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        channel: 'coupang',
        matchStatus: 'unmatched',
        externalId: { not: null },
      },
      orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
      take: 5_000,
      select: {
        pageType: true,
        externalId: true,
        externalOptionId: true,
        rawJson: true,
        normalizedJson: true,
      },
    });
    expect(reconciliation.scanFromRows).toHaveBeenCalledWith(
      ORG,
      [
        {
          externalId: '1001',
          externalOptionId: 'V1',
          legacyCode: 'LEG-1',
          channelProductName: '정규화 상품명',
          channelOptionName: '정규화 옵션명',
          channelImageUrl: 'https://cdn.example.com/e1.jpg',
          channelUrl: 'https://wing.coupang.com/products/1001',
          channelStatus: 'ON_SALE',
        },
        {
          externalId: '2002',
          externalOptionId: null,
          legacyCode: null,
          channelProductName: '등록상품',
          channelOptionName: null,
          channelImageUrl: null,
          channelUrl: null,
          channelStatus: null,
        },
        {
          externalId: '3003',
          externalOptionId: 'V3',
          legacyCode: null,
          channelProductName: '광고 상품',
          channelOptionName: null,
          channelImageUrl: null,
          channelUrl: null,
          channelStatus: null,
        },
      ],
      'wing_inventory',
    );
    expect(result.totalCount).toBe(3);
  });

  it('fails clearly when there are no unmatched snapshots to replay', async () => {
    const { service, reconciliation } = makeService([]);

    await expect(service.syncFromSnapshots(ORG)).rejects.toBeInstanceOf(BadRequestException);
    expect(reconciliation.scanFromRows).not.toHaveBeenCalled();
  });
});
