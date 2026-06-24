import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingAgentRagService } from '../sourcing-agent-rag.service';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
  SourcingWorkspaceSnapshotScope,
} from '../../port/out/repository/sourcing-workspace-snapshot.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const BUSINESS_DATE = new Date('2026-05-28T00:00:00.000Z');

describe('SourcingAgentRagService', () => {
  let repository: SourcingWorkspaceSnapshotRepositoryPort;
  let service: SourcingAgentRagService;

  beforeEach(() => {
    repository = {
      find: vi.fn(async () => null),
      listRecent: vi.fn(async (input) => sourceRows(input.scope)),
      upsert: vi.fn(async (input) => ({
        id: 'rag-snapshot',
        organizationId: input.organizationId,
        scope: input.scope,
        businessDate: input.businessDate,
        payload: input.payload,
        createdAt: BUSINESS_DATE,
        updatedAt: BUSINESS_DATE,
      })),
    };
    service = new SourcingAgentRagService(repository);
  });

  it('rebuilds a retrieval index from sourcing workspace snapshots', async () => {
    const result = await service.rebuild(ORGANIZATION_ID, 7);

    expect(result.documentCount).toBeGreaterThanOrEqual(3);
    expect(result.sourceSnapshotCount).toBe(3);
    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      scope: 'sourcing_agent_rag',
      payload: expect.objectContaining({
        version: 1,
        result: expect.objectContaining({
          documents: expect.arrayContaining([
            expect.objectContaining({ title: expect.stringContaining('슬라임') }),
          ]),
        }),
      }),
    }));
  });

  it('answers with contexts and a filter hint from the rebuilt index', async () => {
    const result = await service.query({
      organizationId: ORGANIZATION_ID,
      message: '잘 팔리는 슬라임 후보만 보여줘',
      topK: 4,
      days: 7,
    });

    expect(result.suggestedFilter).toBe('selling');
    expect(result.contexts.length).toBeGreaterThan(0);
    expect(result.answer).toContain('판매 반응');
    expect(result.contexts[0].document.title).toContain('슬라임');
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
          primaryKeyword: '슬라임',
          keywords: ['슬라임', '말랑이'],
          grade: 'A',
          score: 88,
          salesLast3d: 284,
          salesLast28d: 900,
          ratingCount: 52,
          salePrice: 11900,
          reasons: ['3일 판매 반응 좋음'],
          risks: [],
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
        observations: [{
          targetId: 'keyword:슬라임',
          observedAt: '2026-05-28T01:00:00.000Z',
          source: 'manual',
          metrics: { monthlySearchCount: 12000 },
        }],
      },
      meta: meta(),
    })];
  }

  if (scope === 'keyword_analysis') {
    return [row(scope, {
      version: 1,
      input: {
        filters: {
          timeUnit: 'date',
          gender: 'all',
          age: 'all',
          device: 'all',
          selectedBoardKey: 'birth_kids',
          rankLimit: '20',
          focusMode: 'kids',
        },
        keywordQuery: '슬라임',
        trendText: '슬라임',
      },
      result: {
        boards: [{
          title: '완구',
          ranks: [{ keyword: '슬라임', rank: 1, score: 95 }],
        }],
        trendItems: [{ keyword: '슬라임', latestRatio: 87, trendDelta: 12 }],
        searchAdRelatedItems: [],
        relatedSearchItems: [],
        autocompleteItems: [],
        coupangKeywordItems: [],
        coupangProductNameTokens: [],
        relatedSearchSeed: null,
        trendAgentResult: null,
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

function meta() {
  return {
    generatedAt: '2026-05-28T01:00:00.000Z',
    generationSource: 'manual',
    generatorVersion: 'sourcing-workspace-snapshot.v1',
  };
}
