import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../adapter/out/repository/trend-collection.repository.adapter';
import { NaverKeywordResearchService } from '../application/service/naver-keyword-research.service';
import type { PrismaClient } from '@prisma/client';

const ORGANIZATION_ID = TEST_ORGANIZATION_ID;
const GENERATED_AT = '2026-09-07T00:00:00.000Z';

describe('Naver keyword analysis Alert identity (disposable PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: NaverKeywordResearchService;
  const searchRelatedKeywords = vi.fn();
  const compareSearchTrends = vi.fn();
  const searchPopularKeywords = vi.fn();
  const searchAutocompleteKeywords = vi.fn();

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const history = new TrendCollectionRepositoryAdapter(prisma as never);
    const attempts = new SourcingBrowserSourceAttemptRepositoryAdapter(
      prisma as never,
      new SourceFailureAlerts(prisma as never), unusedSalesProductDraftPort
    );
    service = new NaverKeywordResearchService(
      { searchRelatedKeywords } as never,
      { compareSearchTrends } as never,
      { searchPopularKeywords } as never,
      { searchAutocompleteKeywords } as never,
      history,
      attempts,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    vi.resetAllMocks();
    searchRelatedKeywords.mockImplementation(async (input: { seedKeywords: string[] }) => ({
      source: 'naver-searchad-keywordstool',
      seedKeywords: input.seedKeywords,
      generatedAt: GENERATED_AT,
      items: [],
    }));
    searchAutocompleteKeywords.mockImplementation(async (input: { keyword: string }) => ({
      source: 'naver-search-autocomplete',
      keyword: input.keyword,
      generatedAt: GENERATED_AT,
      items: [],
    }));
  });

  it('isolates A/B failures, reopens the same A row on retry, and resolves only the completed query', async () => {
    const inputA = { action: 'related', keyword: '연필' };
    const inputB = { action: 'related', keyword: '가위' };

    searchRelatedKeywords
      .mockRejectedValueOnce(new Error('A failed'))
      .mockRejectedValueOnce(new Error('B failed'));
    const failedA = await collect(inputA, 'a-failed');
    const failedB = await collect(inputB, 'b-failed');
    expect(failedA.attempt.state).toBe('FAILED');
    expect(failedB.attempt.state).toBe('FAILED');

    const aDedupeKey = `source:naver.keyword_analysis:${failedA.attempt.targetKey}`;
    const bDedupeKey = `source:naver.keyword_analysis:${failedB.attempt.targetKey}`;
    expect(aDedupeKey).not.toBe(bDedupeKey);
    await expect(alertRows()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ dedupeKey: aDedupeKey, status: 'OPEN', readAt: null }),
      expect.objectContaining({ dedupeKey: bDedupeKey, status: 'OPEN', readAt: null }),
    ]));

    const completedB = await collect(inputB, 'b-complete');
    expect(completedB.attempt.state).toBe('COMPLETE');
    await expect(alertRows()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ dedupeKey: aDedupeKey, status: 'OPEN', readAt: null }),
      expect.objectContaining({ dedupeKey: bDedupeKey, status: 'RESOLVED' }),
    ]));
    await prisma.alert.updateMany({
      where: { organizationId: ORGANIZATION_ID, dedupeKey: aDedupeKey },
      data: { readAt: new Date(GENERATED_AT) },
    });

    searchRelatedKeywords.mockRejectedValueOnce(new Error('A retry failed'));
    const retryFailedA = await collect(inputA, 'a-retry-failed');
    expect(retryFailedA.attempt.state).toBe('FAILED');
    const reopenedA = (await alertRows()).filter((row) => row.dedupeKey === aDedupeKey);
    expect(reopenedA).toHaveLength(1);
    expect(reopenedA[0]).toMatchObject({
      dedupeKey: aDedupeKey,
      attemptId: retryFailedA.attempt.attemptId,
      status: 'OPEN',
      readAt: null,
    });

    const completedA = await collect(inputA, 'a-complete');
    expect(completedA.attempt.state).toBe('COMPLETE');
    const finalA = (await alertRows()).filter((row) => row.dedupeKey === aDedupeKey);
    expect(finalA).toHaveLength(1);
    expect(finalA[0]).toMatchObject({
      dedupeKey: aDedupeKey,
      attemptId: completedA.attempt.attemptId,
      status: 'RESOLVED',
    });
  });

  function collect(input: Record<string, unknown>, idempotencyKey: string) {
    return service.collectAnalysis({
      organizationId: ORGANIZATION_ID,
      input,
      idempotencyKey,
    });
  }

  function alertRows() {
    return prisma.alert.findMany({
      where: { organizationId: ORGANIZATION_ID, type: 'source_failure' },
      orderBy: { dedupeKey: 'asc' },
    });
  }
});
