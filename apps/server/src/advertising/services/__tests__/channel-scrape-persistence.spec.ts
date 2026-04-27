import { describe, expect, it, vi } from 'vitest';
import { ChannelScrapePersistenceService } from '../channel-scrape-persistence.service';

describe('ChannelScrapePersistenceService', () => {
  it('upsertListingDaily merges namespaced metaJson with an atomic jsonb update instead of read-spread-write', async () => {
    const tx: any = {
      channelListingDailySnapshot: {
        findUnique: vi.fn().mockResolvedValue({
          metaJson: { existing: { value: true } },
        }),
        upsert: vi.fn().mockResolvedValue({ id: 'daily-1' }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma: any = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ChannelScrapePersistenceService(prisma);

    await service.upsertListingDaily({
      companyId: 'company-1',
      listingId: 'listing-1',
      channel: 'coupang',
      externalId: 'EXT-1',
      businessDate: new Date('2026-04-14T00:00:00.000Z'),
      metaJson: {
        source: 'wing.traffic',
        data: { providerConversionRate: 2.5 },
      },
    });

    expect(tx.channelListingDailySnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(tx.channelListingDailySnapshot.findUnique).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
