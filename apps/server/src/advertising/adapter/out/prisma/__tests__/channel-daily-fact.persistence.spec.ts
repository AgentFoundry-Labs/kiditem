import { describe, expect, it, vi } from 'vitest';
import { upsertChannelListingDaily } from '../channel-daily-fact.persistence';

describe('upsertChannelListingDaily — namespaced metaJson merge', () => {
  it('merges namespaced metaJson with an atomic jsonb update instead of read-spread-write', async () => {
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

    await upsertChannelListingDaily(prisma, {
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

    // Atomic jsonb merge contract:
    //   - upsert lands the create/update row exactly once
    //   - findUnique is NOT called (no read-spread-write race window)
    //   - $executeRaw fires the `meta_json = COALESCE(meta_json,'{}') || patch`
    //     update so concurrent payloads with different `source` keys
    //     preserve each other's audit data.
    expect(tx.channelListingDailySnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(tx.channelListingDailySnapshot.findUnique).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
