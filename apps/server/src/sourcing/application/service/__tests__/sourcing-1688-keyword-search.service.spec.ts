import { describe, expect, it, vi } from 'vitest';
import type { Search1688KeywordSession } from '../../port/out/provider/1688-keyword-search.port';
import type { Sourcing1688SearchResultRepositoryPort } from '../../port/out/repository/sourcing-1688-search-result.repository.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import { Sourcing1688KeywordSearchService } from '../sourcing-1688-keyword-search.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

function permit() {
  return {
    runId: 'collection-run',
    organizationId,
    sourceKey: '1688.hot_product',
    scopeKey: 'default',
    targetKey: '儿童餐盘',
    leaseToken: 'lease-token',
    generation: 1,
    leaseExpiresAt: new Date('2026-08-20T01:02:00.000Z'),
  };
}

describe('Sourcing1688KeywordSearchService', () => {
  it('persists at most six session offers through the operation fence after provider IO', async () => {
    const events: string[] = [];
    const session: Search1688KeywordSession = {
      searchKeyword: vi.fn(async ({ keyword }) => {
        events.push(`provider:${keyword}`);
        return Array.from({ length: 7 }, (_, index) => ({
          offerId: `offer-${index + 1}`,
          title: `plate-${index + 1}`,
          priceCny: 3,
          sourceUrl: `https://detail.1688.com/offer/${index + 1}.html`,
          imageUrl: null,
          monthlySales: 10,
          tradeScore: null,
          repurchaseRate: null,
          supplierName: null,
          score: 88,
        }));
      }),
      close: vi.fn(),
    };
    let collectedOutput: unknown;
    const collection = {
      execute: vi.fn(async (input, collector) => {
        expect(input).toMatchObject({
          organizationId,
          sourceKey: '1688.hot_product',
          collectorKey: 'operation-1688-keyword-search',
          operationCheckpoint: expect.any(Function),
          commitWithinActiveOperationAttempt: expect.any(Function),
        });
        collectedOutput = await collector({ permit: permit(), checkpoint: vi.fn(async () => undefined) });
        events.push('commit');
        return {
          kind: 'committed' as const,
          runId: 'collection-run',
          acceptedCount: 6,
          duplicateCount: 0,
          staleDiscardedCount: 0,
        };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const searchResults = { findLatest: vi.fn() } as unknown as Sourcing1688SearchResultRepositoryPort;
    const service = new Sourcing1688KeywordSearchService(collection, searchResults);
    const signal = new AbortController().signal;
    const operationCheckpoint = vi.fn(async () => events.push('checkpoint'));
    const commitWithinActiveOperationAttempt = vi.fn(async (commit) => commit({ opaque: true }));

    await expect(service.searchForOperation({
      organizationId,
      operationRunId: 'operation-run',
      actorUserId: 'user-1',
      keyword: ' 儿童餐盘 ',
      session,
      signal,
      operationCheckpoint,
      commitWithinActiveOperationAttempt,
    })).resolves.toEqual({
      keyword: '儿童餐盘',
      targetId: null,
      outcome: 'complete',
      discovered: 6,
      accepted: 6,
      duplicate: 0,
      failed: 0,
    });

    expect(session.searchKeyword).toHaveBeenCalledWith({ keyword: '儿童餐盘', signal });
    expect(events).toEqual([
      'checkpoint',
      'provider:儿童餐盘',
      'checkpoint',
      'commit',
    ]);
    expect(collectedOutput).toMatchObject({
      discoveredCount: 6,
      rejectedCount: 0,
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童餐盘',
        targetId: null,
        operationRunId: 'operation-run',
      },
    });
    expect((collectedOutput as { typedRecords: unknown[] }).typedRecords).toHaveLength(6);
    expect((collectedOutput as { typedRecords: unknown[] }).typedRecords[0]).toMatchObject({
      row: { sourceKeyword: '儿童餐盘', searchMetadata: { score: 88 } },
    });
  });

  it('replays an existing keyword snapshot without asking the session to navigate', async () => {
    const session: Search1688KeywordSession = {
      searchKeyword: vi.fn(),
      close: vi.fn(),
    };
    const collection = {
      execute: vi.fn(async () => ({ kind: 'existing' as const, runId: 'collection-run' })),
    } as unknown as SourcingCollectionCoordinator;
    const searchResults = {
      findLatest: vi.fn(async () => ({
        generatedAt: new Date(),
        observations: [{
          keyword: '儿童餐盘',
          targetId: null,
          capturedAt: new Date(),
          items: [{ offerId: 'offer-1' }],
        }],
      })),
    } as unknown as Sourcing1688SearchResultRepositoryPort;
    const service = new Sourcing1688KeywordSearchService(collection, searchResults);

    await expect(service.searchForOperation({
      organizationId,
      operationRunId: 'operation-run',
      actorUserId: null,
      keyword: '儿童餐盘',
      session,
      signal: new AbortController().signal,
      operationCheckpoint: vi.fn(),
      commitWithinActiveOperationAttempt: vi.fn(),
    })).resolves.toMatchObject({
      outcome: 'complete',
      accepted: 0,
      duplicate: 1,
    });

    expect(session.searchKeyword).not.toHaveBeenCalled();
    expect(searchResults.findLatest).toHaveBeenCalledWith({ organizationId, keywords: ['儿童餐盘'] });
  });
});
