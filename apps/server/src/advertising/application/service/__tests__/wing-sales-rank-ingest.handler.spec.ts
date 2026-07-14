import { beforeEach, describe, expect, it } from 'vitest';
import type { ExtensionSyncDto } from '../../../adapter/in/http/dto';
import type { KeywordRankRepositoryPort } from '../../port/out/repository/keyword-rank.repository.port';
import {
  buildMockKeywordRankRepo,
  type MockKeywordRankRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';
import { WingSalesRankIngestHandler } from '../wing-sales-rank-ingest.handler';

describe('WingSalesRankIngestHandler', () => {
  let repo: MockKeywordRankRepo;
  let handler: WingSalesRankIngestHandler;

  beforeEach(() => {
    repo = buildMockKeywordRankRepo();
    handler = new WingSalesRankIngestHandler(
      repo as unknown as KeywordRankRepositoryPort,
    );
    repo.listRepresentativeKeywordOverrides.mockResolvedValue([]);
    repo.findWingSalesRankSnapshots.mockResolvedValue([]);
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: 'V-OWN',
        skuId: 'wing:V-OWN',
        productName: '키드아이템 투명 슬라임 6개',
        category: '완구 > 촉감완구 > 슬라임',
      },
      {
        vendorItemId: 'V-MISS',
        skuId: 'wing:V-MISS',
        productName: '치즈 슬라임 4개',
        category: '완구 > 촉감완구 > 슬라임',
      },
    ]);
    repo.replaceWingSalesRankSnapshots.mockResolvedValue(2);
  });

  it('persists a sales rank hit and an out-of-range row for every matching own product', async () => {
    const payload: ExtensionSyncDto = {
      type: 'wing_sales_rank',
      source: 'wing-pre-matching',
      timestamp: '2026-07-13T03:00:00.000Z',
      data: [
        {
          keyword: '슬라임',
          capturedAt: '2026-07-13T03:00:00.000Z',
          pagesScanned: 5,
          collectedCount: 100,
          totalResults: 340,
          items: [
            {
              salesRank: 7,
              productId: 'P1',
              itemId: 'I1',
              vendorItemId: 'V-OWN',
              productName: 'Wing 투명 슬라임',
              categoryHierarchy: '완구 > 촉감완구 > 슬라임',
              salePrice: 10000,
              salesLast28d: 120,
              pvLast28Day: 1000,
              estimatedRevenue28d: 1200000,
              conversionRate28d: 0.12,
              ratingCount: 45,
            },
          ],
        },
      ],
    };

    const result = await handler.execute(payload, 'organization-1');

    const rows = repo.replaceWingSalesRankSnapshots.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      organizationId: 'organization-1',
      keyword: '슬라임',
      vendorItemId: 'V-OWN',
      salesRank: 7,
      salesLast28d: 120,
      viewsLast28d: 1000,
      revenueLast28d: 1200000,
      categoryHierarchy: '완구 > 촉감완구 > 슬라임',
      keywordSalesLast28d: 120,
      keywordViewsLast28d: 1000,
      keywordConversionRate28d: 0.12,
    });
    expect(rows[1]).toMatchObject({
      vendorItemId: 'V-MISS',
      salesRank: null,
      productName: '치즈 슬라임 4개',
    });
    expect(result.results[0]).toMatchObject({
      productCount: 2,
      rankedCount: 1,
      outOfRangeCount: 1,
    });
  });
});
