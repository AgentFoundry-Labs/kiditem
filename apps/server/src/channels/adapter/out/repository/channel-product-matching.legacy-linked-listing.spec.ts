import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingRepositoryAdapter } from './channel-product-matching.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('channel listings as the matching workspace source', () => {
  it('does not filter persisted channel listings by import-run or snapshot provenance', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: { findMany },
    } as never);

    await repository.listQueue(organizationId, {});

    expect(findMany.mock.calls[0]![0].where).toEqual({ organizationId });
  });

  it('does not reapply catalog provenance when mutating a persisted listing', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      id: '00000000-0000-4000-8000-000000000002',
      masterProductId: '00000000-0000-4000-8000-000000000003',
    }]);
    const transaction = {
      $queryRaw: queryRaw,
      masterProductAbcFormulaState: {
        upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
      },
      channelListing: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      channelListingOptionInventoryComponent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new ChannelProductMatchingRepositoryAdapter({
      $transaction: vi.fn(async (callback) => callback(transaction)),
    } as never);

    await repository.linkProduct({
      organizationId,
      channelListingId: '00000000-0000-4000-8000-000000000002',
      masterProductId: null,
    });

    expect(queryRaw.mock.calls[1]![4]).toBe(false);
  });

  it('uses the active channel-listing state when explicit sale status is absent', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([{
          id: '00000000-0000-4000-8000-000000000002',
          externalId: '12345678',
          displayName: 'Active channel listing',
          status: '승인완료',
          rawJson: null,
          isActive: true,
          masterProductId: null,
          updatedAt: new Date('2026-08-03T00:00:00.000Z'),
          channelAccount: { id: 'account-1', channel: 'coupang', name: 'Wing' },
          masterProduct: null,
          options: [],
        }]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});

    expect(queue.products[0]?.listing.saleStatus).toBe('active');
  });

  it('prefers the latest listing snapshot sale status for the default sale filter', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([{
          id: '00000000-0000-4000-8000-000000000002',
          externalId: '12345678',
          displayName: 'Stopped channel listing',
          status: '승인완료',
          rawJson: null,
          isActive: true,
          masterProductId: null,
          updatedAt: new Date('2026-08-03T00:00:00.000Z'),
          channelAccount: { id: 'account-1', channel: 'coupang', name: 'Wing' },
          masterProduct: null,
          channelListingDailySnapshots: [{ saleStatus: '판매중지' }],
          options: [],
        }]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});

    expect(queue.products[0]?.listing.saleStatus).toBe('판매중지');
  });

  it('keeps an imported non-selling supplier status instead of falling back to record activity', async () => {
    const repository = new ChannelProductMatchingRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([{
          id: '00000000-0000-4000-8000-000000000002',
          externalId: '12345678',
          displayName: 'Stopped Rocket listing',
          status: '비활성',
          rawJson: null,
          isActive: true,
          masterProductId: null,
          updatedAt: new Date('2026-08-03T00:00:00.000Z'),
          channelAccount: { id: 'account-1', channel: 'rocket', name: 'Rocket' },
          masterProduct: null,
          channelListingDailySnapshots: [],
          options: [],
        }]),
      },
    } as never);

    const queue = await repository.listQueue(organizationId, {});

    expect(queue.products[0]?.listing.saleStatus).toBe('비활성');
  });
});
