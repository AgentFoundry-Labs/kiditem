import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceSnapshotService } from '../sourcing-workspace-snapshot.service';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
} from '../../port/out/repository/sourcing-workspace-snapshot.repository.port';

describe('SourcingWorkspaceSnapshotService', () => {
  let repository: SourcingWorkspaceSnapshotRepositoryPort;
  let service: SourcingWorkspaceSnapshotService;

  beforeEach(() => {
    repository = {
      find: vi.fn(async () => null),
      listRecent: vi.fn(async (input) => [{
        id: 'snapshot-1',
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.toBusinessDate,
        payload: {},
        createdAt: new Date('2026-05-27T00:00:00.000Z'),
        updatedAt: new Date('2026-05-27T00:00:00.000Z'),
      } satisfies SourcingWorkspaceSnapshotRow]),
      upsert: vi.fn(async (input) => ({
        id: 'snapshot-1',
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        payload: input.payload,
        createdAt: new Date('2026-05-27T00:00:00.000Z'),
        updatedAt: new Date('2026-05-27T00:00:00.000Z'),
      } satisfies SourcingWorkspaceSnapshotRow)),
    };
    service = new SourcingWorkspaceSnapshotService(repository);
  });

  it('accepts versioned today recommendation result snapshots', async () => {
    const payload = {
      version: 1,
      input: {
        keywordText: '유아 퍼즐',
        keywordLimit: 10,
        maxPages: 1,
      },
      result: {
        rows: [],
        productSnapshots: [],
      },
      meta: {
        generatedAt: '2026-05-27T01:00:00.000Z',
        generationSource: 'manual',
        generatorVersion: 'sourcing-workspace-snapshot.v1',
      },
    };

    await service.saveToday('00000000-0000-4000-8000-000000000001', 'today_recommendations', payload);

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({ payload }));
  });

  it('accepts interest tracking snapshots for three day watchlists', async () => {
    const payload = {
      version: 1,
      input: {
        trackingWindowDays: 3,
      },
      result: {
        targets: [{
          id: 'keyword:레고',
          type: 'keyword',
          label: '레고',
          source: 'keyword_analysis',
          createdAt: '2026-05-27T01:00:00.000Z',
          updatedAt: '2026-05-27T01:00:00.000Z',
        }],
        observations: [{
          targetId: 'keyword:레고',
          observedAt: '2026-05-27T01:00:00.000Z',
          source: 'keyword_analysis',
          metrics: {
            monthlySearchCount: 321800,
          },
        }],
      },
      meta: {
        generatedAt: '2026-05-27T01:00:00.000Z',
        generationSource: 'manual',
        generatorVersion: 'sourcing-workspace-snapshot.v1',
      },
    };

    await service.saveToday('00000000-0000-4000-8000-000000000001', 'interest_tracking', payload);

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'interest_tracking',
      payload,
    }));
  });

  it('loads recent snapshots with a bounded business-date window', async () => {
    await service.getRecent('00000000-0000-4000-8000-000000000001', 'interest_tracking', 3);

    expect(repository.listRecent).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'interest_tracking',
      limit: 3,
    }));
  });

  it('accepts sourcing agent RAG index snapshots', async () => {
    const payload = {
      version: 1,
      input: {
        days: 7,
        sourceScopes: ['keyword_analysis', 'today_recommendations', 'interest_tracking'],
        documentLimit: 1,
      },
      result: {
        documents: [{
          id: 'doc-1',
          sourceScope: 'today_recommendations',
          sourceSnapshotId: 'snapshot-1',
          sourceDate: '2026-05-27',
          kind: 'recommendation',
          title: '슬라임 후보',
          text: '슬라임 후보 상품 점수 88점',
          tags: ['슬라임'],
          metadata: {},
        }],
        stats: {
          documentCount: 1,
          sourceSnapshotCount: 1,
          sourceScopes: ['today_recommendations'],
        },
      },
      meta: {
        generatedAt: '2026-05-27T01:00:00.000Z',
        generationSource: 'scheduled',
        generatorVersion: 'sourcing-agent-rag.v1',
      },
    };

    await service.saveToday('00000000-0000-4000-8000-000000000001', 'sourcing_agent_rag', payload);

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'sourcing_agent_rag',
      payload,
    }));
  });

  it('accepts sourcing market model snapshots', async () => {
    const payload = {
      version: 1,
      input: {
        days: 7,
        sourceScopes: ['today_recommendations', 'interest_tracking'],
        candidateLimit: 24,
      },
      result: {
        candidates: [{
          id: 'product-1:item-1',
          rank: 1,
          productId: 'product-1',
          itemId: 'item-1',
          vendorItemId: 'vendor-1',
          productName: '슬라임 후보',
          imagePath: null,
          primaryKeyword: '슬라임',
          keywords: ['슬라임'],
          score: 82,
          grade: 'A',
          decision: 'recommend',
          components: {},
          metrics: {},
          reasons: ['시장 반응 강함'],
          risks: [],
          modelTags: ['decision:recommend'],
          sourceSnapshotId: 'snapshot-1',
          sourceDate: '2026-05-27',
        }],
        stats: {
          candidateCount: 1,
          sourceSnapshotCount: 2,
          recommendedCount: 1,
          watchCount: 0,
          excludedCount: 0,
          averageScore: 82,
          topKeyword: '슬라임',
        },
        model: {
          pipeline: 'coupang_first_market_reaction',
          version: 1,
          generatorVersion: 'sourcing-market-model.coupang-first.v1',
          weights: {},
        },
      },
      meta: {
        generatedAt: '2026-05-27T01:00:00.000Z',
        generationSource: 'scheduled',
        generatorVersion: 'sourcing-market-model.coupang-first.v1',
      },
    };

    await service.saveToday('00000000-0000-4000-8000-000000000001', 'sourcing_market_model', payload);

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'sourcing_market_model',
      payload,
    }));
  });

  it('accepts 1688 new product snapshots and 1688-first model snapshots', async () => {
    const sourcePayload = {
      version: 1,
      input: {
        source: '1688_keyword',
        keyword: '슬라임',
      },
      result: {
        items: [{
          offerId: 'offer-1',
          title: '儿童史莱姆捏捏乐解压玩具',
          sourceUrl: 'https://detail.1688.com/offer/123456.html',
          priceCny: 12,
        }],
      },
      meta: {
        generatedAt: '2026-05-27T01:00:00.000Z',
        generationSource: 'manual',
        generatorVersion: 'sourcing-workspace-snapshot.v1',
      },
    };
    const modelPayload = {
      version: 1,
      input: {
        days: 7,
        sourceScopes: ['1688_new_products', 'today_recommendations', 'sourcing_market_model'],
        candidateLimit: 24,
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
      meta: {
        generatedAt: '2026-05-27T01:00:00.000Z',
        generationSource: 'scheduled',
        generatorVersion: 'sourcing-market-model.1688-first.v1',
      },
    };

    await service.saveToday('00000000-0000-4000-8000-000000000001', '1688_new_products', sourcePayload);
    await service.saveToday('00000000-0000-4000-8000-000000000001', 'sourcing_1688_new_product_model', modelPayload);

    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      scope: '1688_new_products',
      payload: sourcePayload,
    }));
    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'sourcing_1688_new_product_model',
      payload: modelPayload,
    }));
  });

  it('rejects the old flat today recommendation payload shape', async () => {
    await expect(service.saveToday(
      '00000000-0000-4000-8000-000000000001',
      'today_recommendations',
      {
        version: 1,
        rows: [],
        productSnapshots: [],
        savedIds: [],
        keywordText: '유아 퍼즐',
        keywordLimit: 10,
        maxPages: 1,
        updatedAt: '2026-05-27T01:00:00.000Z',
      },
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
