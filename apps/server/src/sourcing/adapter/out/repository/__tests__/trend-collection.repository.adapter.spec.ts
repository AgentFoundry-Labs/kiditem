import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import { TrendCollectionRepositoryAdapter } from '../trend-collection.repository.adapter';

describe('TrendCollectionRepositoryAdapter', () => {
  it('writes Naver keyword snapshots in bounded transactions with an explicit timeout', async () => {
    const upsert = vi.fn(async () => ({}));
    const batchSizes: number[] = [];
    const transaction = vi.fn(async (
      operation: (tx: {
        naverKeywordDailySnapshot: { upsert: typeof upsert };
      }) => Promise<void>,
      options: { maxWait: number; timeout: number },
    ) => {
      const before = upsert.mock.calls.length;
      await operation({ naverKeywordDailySnapshot: { upsert } });
      batchSizes.push(upsert.mock.calls.length - before);
      expect(options).toEqual({ maxWait: 10_000, timeout: 30_000 });
    });
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const adapter = new TrendCollectionRepositoryAdapter(prisma);
    const businessDate = new Date('2026-07-29T00:00:00.000Z');
    const capturedAt = new Date('2026-07-29T02:00:00.000Z');

    const saved = await adapter.upsertNaverKeywordSnapshots(
      Array.from({ length: 25 }, (_, index) => ({
        organizationId: 'organization-1',
        keyword: `키워드-${index + 1}`,
        businessDate,
        monthlyTotalSearchCount: index + 1,
        monthlyPcSearchCount: null,
        monthlyMobileSearchCount: null,
        competitionIndex: null,
        averageAdRank: null,
        trendRatio: null,
        trendDelta: null,
        capturedAt,
      })),
    );

    expect(saved).toBe(25);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(batchSizes).toEqual([10, 10, 5]);
    expect(upsert).toHaveBeenCalledTimes(25);
  });

  it('replaces a complete Naver board-date scope and rejects a stale replacement', async () => {
    const businessDate = new Date('2026-07-14T00:00:00.000Z');
    const stored = [
      {
        organizationId: 'organization-1',
        boardKey: 'stationery',
        boardLabel: '문구',
        cid: '50000008',
        businessDate,
        rank: 1,
        keyword: '지난 키워드',
        linkId: null,
        capturedAt: new Date('2026-07-14T02:00:00.000Z'),
      },
    ];
    const transactionClient = {
      $queryRaw: async () => [{ lock: '' }],
      naverPopularKeywordDailySnapshot: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          stored
            .filter(
              (row) =>
                row.organizationId === where.organizationId &&
                row.boardKey === where.boardKey &&
                row.businessDate.getTime() === (where.businessDate as Date).getTime(),
            )
            .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ?? null,
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          const before = stored.length;
          for (let index = stored.length - 1; index >= 0; index -= 1) {
            const row = stored[index];
            if (
              row.organizationId === where.organizationId &&
              row.boardKey === where.boardKey &&
              row.businessDate.getTime() === (where.businessDate as Date).getTime()
            ) {
              stored.splice(index, 1);
            }
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
    const adapter = new TrendCollectionRepositoryAdapter(prisma);

    const saved = await adapter.replaceNaverPopularKeywordSnapshots([
      {
        organizationId: 'organization-1',
        boardKey: 'stationery',
        boardLabel: '문구',
        cid: '50000008',
        businessDate,
        rank: 1,
        keyword: '새 키워드',
        linkId: 'new-link',
        capturedAt: new Date('2026-07-14T03:00:00.000Z'),
      },
    ]);
    const staleSaved = await adapter.replaceNaverPopularKeywordSnapshots([
      {
        organizationId: 'organization-1',
        boardKey: 'stationery',
        boardLabel: '문구',
        cid: '50000008',
        businessDate,
        rank: 1,
        keyword: '오래된 재시도',
        linkId: null,
        capturedAt: new Date('2026-07-14T02:30:00.000Z'),
      },
    ]);

    expect(saved).toBe(1);
    expect(staleSaved).toBe(0);
    expect(stored.map((row) => row.keyword)).toEqual(['새 키워드']);
  });
});
