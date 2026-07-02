import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingMarketModelService } from '../sourcing-market-model.service';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
  SourcingWorkspaceSnapshotScope,
} from '../../port/out/repository/sourcing-workspace-snapshot.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BUSINESS_DATE = new Date('2026-05-28T00:00:00.000Z');

describe('SourcingMarketModelService', () => {
  let repository: SourcingWorkspaceSnapshotRepositoryPort;
  let service: SourcingMarketModelService;

  beforeEach(() => {
    repository = {
      find: vi.fn(async () => null),
      listRecent: vi.fn(async (input) => sourceRows(input.scope)),
      upsert: vi.fn(async (input) => ({
        id: 'market-model-snapshot',
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        payload: input.payload,
        createdAt: BUSINESS_DATE,
        updatedAt: BUSINESS_DATE,
      })),
    };
    service = new SourcingMarketModelService(repository);
  });

  it('scores market-reactive product candidates from sourcing snapshots', async () => {
    const result = await service.run({
      organizationId: ORGANIZATION_ID,
      days: 7,
      limit: 20,
    });

    expect(result.result.candidates[0]).toEqual(expect.objectContaining({
      productName: '대왕 치즈 슬라임 말랑이',
      decision: 'recommend',
      primaryKeyword: '슬라임',
    }));
    expect(result.result.candidates[0].score).toBeGreaterThanOrEqual(70);
    expect(result.result.stats.recommendedCount).toBeGreaterThan(0);
    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      scope: 'sourcing_market_model',
      payload: expect.objectContaining({
        version: 1,
        input: expect.objectContaining({
          days: 7,
          candidateLimit: 20,
        }),
        result: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              productName: '대왕 치즈 슬라임 말랑이',
            }),
          ]),
        }),
      }),
    }));
  });

  it('reuses a valid same-day market model snapshot when available', async () => {
    repository.find = vi.fn(async () => row('sourcing_market_model', {
      version: 1,
      input: {
        days: 7,
        sourceScopes: ['today_recommendations', 'interest_tracking'],
        candidateLimit: 20,
      },
      result: {
        candidates: [],
        stats: {
          candidateCount: 0,
          sourceSnapshotCount: 0,
          recommendedCount: 0,
          watchCount: 0,
          excludedCount: 0,
          averageScore: 0,
          topKeyword: null,
        },
        model: {
          pipeline: 'coupang_first_market_reaction',
          version: 1,
          generatorVersion: 'sourcing-market-model.coupang-first.v1',
          weights: {},
        },
      },
      meta: meta('sourcing-market-model.coupang-first.v1'),
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
  if (scope === 'today_recommendations') {
    return [row(scope, {
      version: 1,
      input: { keywordText: '슬라임', keywordLimit: 10, maxPages: 1 },
      result: {
        rows: [{
          productId: 'product-1',
          itemId: 'item-1',
          vendorItemId: 'vendor-1',
          productName: '대왕 치즈 슬라임 말랑이',
          imagePath: 'https://example.test/slime.png',
          primaryKeyword: '슬라임',
          keywords: ['슬라임', '말랑이'],
          grade: 'A',
          score: 88,
          marketReactionSignal: 42,
          newEntrySignal: 9.5,
          lowReviewSalesPower: 5.4,
          salesLast3d: 284,
          salesLast28d: 900,
          pvLast3d: 2400,
          ratingCount: 52,
          salePrice: 11900,
          salesDelta: 18,
          reviewDelta: 2,
          reasons: ['3일 판매 반응 좋음'],
          risks: [],
        }, {
          productId: 'product-risk',
          itemId: 'item-risk',
          vendorItemId: 'vendor-risk',
          productName: '캐릭터 정품 초저가 장난감',
          primaryKeyword: '캐릭터',
          keywords: ['캐릭터'],
          grade: 'WATCH',
          score: 32,
          salesLast3d: 1,
          salesLast28d: 10,
          pvLast3d: 8,
          ratingCount: 4000,
          salePrice: 4900,
          reasons: [],
          risks: ['IP/브랜드 리스크'],
        }],
        productSnapshots: [],
      },
      meta: meta(),
    })];
  }

  if (scope === 'interest_tracking') {
    return [row(scope, {
      version: 1,
      input: { trackingWindowDays: 3 },
      result: {
        targets: [{
          id: 'keyword:슬라임',
          type: 'keyword',
          label: '슬라임',
          source: 'manual',
          keyword: '슬라임',
          createdAt: '2026-05-28T01:00:00.000Z',
          updatedAt: '2026-05-28T01:00:00.000Z',
        }],
        observations: [],
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
