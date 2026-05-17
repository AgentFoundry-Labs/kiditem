import { describe, expect, it, vi } from 'vitest';
import { MarketplaceRegistrationService } from '../marketplace-registration.service';

describe('MarketplaceRegistrationService', () => {
  it('creates a ChannelListing only when confirmed external listing identity exists', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'master-1', name: '마스터 상품' }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'listing-1' }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new MarketplaceRegistrationService(prisma as never);

    await service.registerConfirmedListing('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      externalId: '720445',
      channelName: '쿠팡 판매명',
      channelPrice: 12900,
    });

    expect(tx.channelListing.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org-1',
        masterId: 'master-1',
        channelAccountId: 'account-1',
        channel: 'coupang',
        externalId: '720445',
        channelName: '쿠팡 판매명',
        channelPrice: 12900,
      }),
    }));
  });
});
