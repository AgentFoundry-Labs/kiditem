import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { ChannelSkuMappingRepositoryAdapter } from './channel-sku-mapping.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const ids = Array.from(
  { length: 6 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
);

describe('ChannelSkuMappingRepositoryAdapter status refresh', () => {
  it('groups advisory updates into at most two guarded statements and skips correct statuses', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations));
    const repository = new ChannelSkuMappingRepositoryAdapter({
      channelListingOption: { updateMany },
      $transaction: transaction,
    } as unknown as PrismaService);

    await repository.updateUnmappedStatuses(organizationId, [
      { channelSkuId: ids[0], mappingStatus: 'unmatched' },
      { channelSkuId: ids[1], mappingStatus: 'needs_review' },
      { channelSkuId: ids[2], mappingStatus: 'unmatched' },
      { channelSkuId: ids[3], mappingStatus: 'needs_review' },
      { channelSkuId: ids[4], mappingStatus: 'unmatched' },
      { channelSkuId: ids[5], mappingStatus: 'needs_review' },
    ]);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).toHaveLength(2);
    expect(updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        id: { in: [ids[0], ids[2], ids[4]] },
        mappingStatus: { not: 'unmatched' },
        components: { none: { organizationId } },
        channelAccount: { is: { organizationId } },
        lastImportRun: { is: expect.objectContaining({
          organizationId,
          sourceType: 'coupang_wing_catalog',
          status: 'completed',
        }) },
        listing: { is: expect.objectContaining({ organizationId, isDeleted: false }) },
      }),
      data: { mappingStatus: 'unmatched' },
    }));
    expect(updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        id: { in: [ids[1], ids[3], ids[5]] },
        mappingStatus: { not: 'needs_review' },
        components: { none: { organizationId } },
      }),
      data: { mappingStatus: 'needs_review' },
    }));
  });
});
