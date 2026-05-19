import { describe, expect, it, vi } from 'vitest';
import { MarketplaceRegistrationRepositoryAdapter as MarketplaceRegistrationService } from '../../../adapter/out/repository/marketplace-registration.repository.adapter';

describe('MarketplaceRegistrationService', () => {
  it('creates a ChannelListing only when confirmed external listing identity exists', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'master-1', name: '마스터 상품' }),
        update: vi.fn().mockResolvedValue({ id: 'master-1' }),
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
      productBarcode: '8806384882841',
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
    expect(tx.masterProduct.update).not.toHaveBeenCalled();
  });

  it('does not revive a soft-deleted listing with the same account and external id', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'master-1', name: '마스터 상품' }),
        update: vi.fn(),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'listing-new' }),
        update: vi.fn(),
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
    });

    expect(tx.channelListing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org-1',
        channelAccountId: 'account-1',
        externalId: '720445',
        isDeleted: false,
      },
    }));
    expect(tx.channelListing.update).not.toHaveBeenCalled();
    expect(tx.channelListing.create).toHaveBeenCalled();
    expect(tx.masterProduct.update).not.toHaveBeenCalled();
  });

  it('does not mutate product barcode from the channels registration adapter', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'master-1', name: '마스터 상품' }),
        update: vi.fn(),
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
      productBarcode: '8806384882841',
    } as never);

    expect(tx.channelListing.create).toHaveBeenCalled();
    expect(tx.masterProduct.update).not.toHaveBeenCalled();
  });
});
