import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRegistrationService } from './channel-registration.service';

describe('ChannelRegistrationService browser registration boundary', () => {
  it('finds one existing active Wing listing from synced channel data without Open API IO', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({
        channel: 'coupang',
        vendorId: 'A00012345',
        externalAccountId: 'A00012345',
      }),
      findExistingActiveListingBySellerSku: vi.fn().mockResolvedValue({
        externalListingId: '427011919',
        displayName: '꿀사과슬랑이',
        status: 'APPROVED',
      }),
    };
    const service = new ChannelRegistrationService(repository as never, {} as never);

    await expect(service.findExistingExternalProductRegistration({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      externalVendorSku: '10451-1',
    })).resolves.toEqual({
      externalListingId: '427011919',
      displayName: '꿀사과슬랑이',
      status: 'APPROVED',
    });
    expect(repository.findExistingActiveListingBySellerSku).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      sellerSku: '10451-1',
    });
  });

  it('propagates ambiguity found in synced channel data without a provider fallback', async () => {
    const ambiguity = new ConflictException(
      "Sellpia SKU '10451-1' resolved to multiple active channel listings.",
    );
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({
        channel: 'coupang',
        vendorId: 'A00012345',
      }),
      findExistingActiveListingBySellerSku: vi.fn().mockRejectedValue(ambiguity),
    };
    const service = new ChannelRegistrationService(repository as never, {} as never);

    await expect(service.findExistingExternalProductRegistration({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      externalVendorSku: '10451-1',
    })).rejects.toBe(ambiguity);
  });

  it('requires a real Sellpia SKU before querying synced listing identity', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({
        channel: 'coupang',
        vendorId: 'A00012345',
      }),
      findExistingActiveListingBySellerSku: vi.fn(),
    };
    const service = new ChannelRegistrationService(repository as never, {} as never);

    await expect(service.findExistingExternalProductRegistration({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      externalVendorSku: '  ',
    })).rejects.toMatchObject({ code: 'CHANNELS_SELLPIA_MATCH_REQUIRED', details: { reason: 'SELLPIA_SKU_REQUIRED' } });
    expect(repository.findExistingActiveListingBySellerSku).not.toHaveBeenCalled();
  });

  it('asks for a whole deduction quantity when the operator picked a Sellpia product', async () => {
    const recipes = { resolveSelectedRegistrationSku: vi.fn().mockResolvedValue({ masterProductId: 'mp-1', code: 'SP-1', name: '셀피아' }) };
    const service = new ChannelRegistrationService({} as never, recipes as never);

    await expect(service.preflightExternalProductRegistration({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      channelListingOptionId: 'candidate-1',
      listingName: '상품',
      itemName: null,
      selectedSellpiaInventorySkuId: 'mp-1',
      selectedQuantity: 0,
    } as never)).rejects.toMatchObject({ code: 'CHANNELS_SELLPIA_DEDUCTION_REQUIRED', kind: 'validation' });
  });
});
