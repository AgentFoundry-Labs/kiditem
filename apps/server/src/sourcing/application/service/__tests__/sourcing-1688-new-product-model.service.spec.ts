import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sourcing1688NewProductModelService } from '../sourcing-1688-new-product-model.service';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
  SourcingWorkspaceSnapshotScope,
} from '../../port/out/repository/sourcing-workspace-snapshot.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BUSINESS_DATE = new Date('2026-05-28T00:00:00.000Z');

describe('Sourcing1688NewProductModelService', () => {
  let repository: SourcingWorkspaceSnapshotRepositoryPort;
  let service: Sourcing1688NewProductModelService;

  beforeEach(() => {
    repository = {
      find: vi.fn(async () => null),
      listRecent: vi.fn(async (input) => sourceRows(input.scope)),
      upsert: vi.fn(async (input) => ({
        id: '1688-new-product-model-snapshot',
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        payload: input.payload,
        createdAt: BUSINESS_DATE,
        updatedAt: BUSINESS_DATE,
      })),
    };
    service = new Sourcing1688NewProductModelService(repository);
  });

  it('scores 1688-first new products against Coupang market evidence', async () => {
    const result = await service.run({
      organizationId: ORGANIZATION_ID,
      days: 7,
      limit: 20,
    });

    expect(result.result.model.pipeline).toBe('1688_first_new_product_validation');
    expect(result.result.candidates[0]).toEqual(expect.objectContaining({
      title: '儿童史莱姆捏捏乐解压玩具',
      decision: 'order',
      keyword: '슬라임',
    }));
    expect(result.result.candidates[0].matchedCoupang).toEqual(expect.objectContaining({
      productName: '대왕 치즈 슬라임 말랑이',
    }));
    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      scope: 'sourcing_1688_new_product_model',
      payload: expect.objectContaining({
        version: 1,
        result: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              title: '儿童史莱姆捏捏乐解压玩具',
            }),
          ]),
        }),
      }),
    }));
  });

  it('keeps the best 1688 image match for each Coupang product', async () => {
    repository.listRecent = vi.fn(async (input) => {
      if (input.scope !== '1688_new_products') return [];
      return [row(input.scope, {
        version: 1,
        input: { source: '1688_image_match', keyword: '解压玩具捏捏乐' },
        result: {
          keyword: '解压玩具捏捏乐',
          items: [
            {
              offerId: 'offer-expensive',
              title: '高价史莱姆玩具',
              sourceUrl: 'https://detail.1688.com/offer/999001.html',
              imageUrl: 'https://example.test/expensive.png',
              priceCny: 95,
              salesNum: 40,
              imageMatchScore: 98,
              shippingFulfillmentRate: '82%',
              shippingPickupRate: '81%',
              estimatedProfitKrw: -1200,
              estimatedMarginRate: -8,
              matchedCoupang: directCoupangEvidence(),
            },
            {
              offerId: 'offer-best',
              title: '儿童史莱姆捏捏乐解压玩具源头工厂',
              sourceUrl: 'https://detail.1688.com/offer/999002.html',
              imageUrl: 'https://example.test/best.png',
              priceCny: 12,
              salesNum: 900,
              imageMatchScore: 90,
              shippingFulfillmentRate: '99%',
              shippingPickupRate: '98%',
              supplierName: '义乌玩具源头工厂',
              supplierTags: ['源头工厂'],
              repurchaseRate: '38%',
              estimatedProfitKrw: 5200,
              estimatedMarginRate: 43,
              matchedCoupang: directCoupangEvidence(),
            },
          ],
        },
        meta: meta(),
      })];
    });

    const result = await service.run({
      organizationId: ORGANIZATION_ID,
      days: 7,
      limit: 20,
    });

    expect(result.result.candidates).toHaveLength(1);
    expect(result.result.candidates[0]).toEqual(expect.objectContaining({
      title: '儿童史莱姆捏捏乐解压玩具源头工厂',
      matchMethod: 'image',
      decision: 'order',
      matchedCoupang: expect.objectContaining({
        productId: 'coupang-product-1',
        matchScore: 90,
      }),
      wholesale: expect.objectContaining({
        shippingFulfillmentRate: '99%',
        shippingPickupRate: '98%',
        estimatedProfitKrw: 5200,
        estimatedMarginRate: 43,
      }),
    }));
  });

  it('reuses a same-day 1688-first model snapshot when available', async () => {
    repository.find = vi.fn(async () => row('sourcing_1688_new_product_model', {
      version: 1,
      input: {
        days: 7,
        sourceScopes: ['1688_new_products', 'today_recommendations', 'sourcing_market_model'],
        candidateLimit: 20,
      },
      result: {
        candidates: [],
        stats: {
          candidateCount: 0,
          sourceSnapshotCount: 0,
          orderCount: 0,
          observeCount: 0,
          excludedCount: 0,
          averageScore: 0,
          topKeyword: null,
        },
        model: {
          pipeline: '1688_first_new_product_validation',
          version: 1,
          generatorVersion: 'sourcing-market-model.1688-first.v1',
          weights: {},
        },
      },
      meta: meta('sourcing-market-model.1688-first.v1'),
    }));

    const result = await service.latestOrRun({
      organizationId: ORGANIZATION_ID,
      days: 7,
      limit: 20,
    });

    expect(result.result.candidates).toEqual([]);
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});

function sourceRows(scope: SourcingWorkspaceSnapshotScope): SourcingWorkspaceSnapshotRow[] {
  if (scope === '1688_new_products') {
    return [row(scope, {
      version: 1,
      input: { source: '1688_keyword', keyword: '슬라임' },
      result: {
        keyword: '슬라임',
        items: [{
          offerId: 'offer-1',
          title: '儿童史莱姆捏捏乐解压玩具',
          sourceUrl: 'https://detail.1688.com/offer/123456.html',
          imageUrl: 'https://example.test/1688-slime.png',
          priceCny: 12,
          monthlySales: 860,
          tradeScore: 72,
          repurchaseRate: '36%',
          supplierName: '义乌玩具厂',
          createdAt: '2026-05-24T00:00:00.000Z',
        }],
      },
      meta: meta(),
    })];
  }

  if (scope === 'sourcing_market_model') {
    return [row(scope, {
      version: 1,
      input: {
        days: 7,
        sourceScopes: ['today_recommendations', 'interest_tracking'],
        candidateLimit: 20,
      },
      result: {
        candidates: [{
          productId: 'product-1',
          productName: '대왕 치즈 슬라임 말랑이',
          primaryKeyword: '슬라임',
          keywords: ['슬라임', '말랑이', '史莱姆', '解压'],
          score: 88,
          grade: 'A',
          salePrice: 11900,
          components: {
            marketReaction: 96,
            newProductReaction: 100,
          },
          metrics: {
            salesLast3d: 284,
            salesLast28d: 900,
            reviews: 52,
            salePrice: 11900,
          },
        }],
        stats: {},
        model: {
          pipeline: 'coupang_first_market_reaction',
          version: 1,
          generatorVersion: 'sourcing-market-model.coupang-first.v1',
          weights: {},
        },
      },
      meta: meta('sourcing-market-model.coupang-first.v1'),
    })];
  }

  if (scope === 'today_recommendations') {
    return [row(scope, {
      version: 1,
      input: { keywordText: '슬라임', keywordLimit: 10, maxPages: 1 },
      result: {
        rows: [],
        productSnapshots: [],
      },
      meta: meta(),
    })];
  }

  return [];
}

function row(scope: SourcingWorkspaceSnapshotScope, payload: Record<string, unknown>): SourcingWorkspaceSnapshotRow {
  return {
    id: `${scope}-snapshot`,
    organizationId: ORGANIZATION_ID,
    scope,
    businessDate: BUSINESS_DATE,
    payload,
    createdAt: BUSINESS_DATE,
    updatedAt: BUSINESS_DATE,
  };
}

function meta(generatorVersion = 'sourcing-workspace-snapshot.v1') {
  return {
    generatedAt: '2026-05-28T01:00:00.000Z',
    generationSource: 'manual',
    generatorVersion,
  };
}

function directCoupangEvidence() {
  return {
    productId: 'coupang-product-1',
    productName: '대왕 치즈 슬라임 말랑이',
    primaryKeyword: '슬라임',
    keywords: ['슬라임', '말랑이'],
    score: 88,
    grade: 'A',
    salePrice: 11900,
    salesLast3d: 284,
    salesLast28d: 900,
    reviews: 52,
    marketReaction: 96,
    threeDayValidation: 100,
  };
}
