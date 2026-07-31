import { describe, expect, it, vi } from 'vitest';
import { SellpiaManualMatchRepositoryAdapter } from './sellpia-manual-match.repository.adapter';

describe('SellpiaManualMatchRepositoryAdapter snapshot replacement', () => {
  it('writes retained alias snapshots in bounded batches', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (
      callback: (tx: {
        sellpiaManualMatchSnapshot: {
          deleteMany: ReturnType<typeof vi.fn>;
          create: ReturnType<typeof vi.fn>;
        };
        sellpiaManualMatchAlias: { createMany: ReturnType<typeof vi.fn> };
      }) => Promise<void>,
    ) => callback({
      sellpiaManualMatchSnapshot: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'snapshot-1' }),
      },
      sellpiaManualMatchAlias: { createMany },
    }));
    const repository = new SellpiaManualMatchRepositoryAdapter({
      $transaction: transaction,
    } as never);

    await repository.replaceCurrent({
      organizationId: 'organization-1',
      status: {
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'snapshot-hash',
        capturedAt: '2026-07-31T00:00:00.000Z',
      },
      rows: Array.from({ length: 5_001 }, (_, index) => ({
        sellpiaInventorySkuId: 'sku-1',
        aliasTitle: `상품 ${index}`,
        normalizedAlias: `상품${index}`,
        itemCount: 12,
        matchedType: 'M' as const,
        evidenceCount: 1,
      })),
    });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls.map(([input]) => input.data.length)).toEqual([5_000, 1]);
  });

  it('returns only current matching-screen name candidates', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      displayName: '현재 상품',
      channelName: '채널 원문',
      options: [{ itemName: '12개입' }, { itemName: null }],
    }]);
    const repository = new SellpiaManualMatchRepositoryAdapter({
      channelListing: { findMany },
    } as never);

    await expect(repository.listCurrentChannelAliasCandidates('organization-1'))
      .resolves.toEqual(['12개입', '현재 상품', '현재 상품:12개입']);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'organization-1', isActive: true }),
    }));
  });
});
