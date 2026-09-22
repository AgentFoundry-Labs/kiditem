import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RegistrationTargetException } from '../../exception/registration-target.exception';
import { ChannelRegistrationService } from './channel-registration.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';

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

  it('accepts external confirmation only for an active persisted Wing identity', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({
        channel: 'coupang',
        vendorId: ' A00012345 ',
        externalAccountId: null,
      }),
    };
    const service = new ChannelRegistrationService(repository as never, {} as never);

    await expect(service.assertExternalProductRegistrationAccount({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
    })).resolves.toEqual({ channel: 'coupang', vendorId: 'A00012345' });
  });

  it('rejects non-Wing accounts before external confirmation', async () => {
    const repository = {
      assertActiveRegistrationAccount: vi.fn().mockResolvedValue({
        channel: 'rocket',
        vendorId: 'A00012345',
        externalAccountId: 'A00012345',
      }),
    };
    const service = new ChannelRegistrationService(repository as never, {} as never);

    await expect(service.assertExternalProductRegistrationAccount({
      organizationId: 'org-1',
      channelAccountId: 'rocket-account-1',
    })).rejects.toMatchObject({
      name: 'RegistrationTargetException',
      code: 'conflict',
    } satisfies Partial<RegistrationTargetException>);
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
    })).rejects.toThrow('real Sellpia SKU code is required');
    expect(repository.findExistingActiveListingBySellerSku).not.toHaveBeenCalled();
  });

  it('resolves the account-scoped listing inside the caller transaction', async () => {
    const tx = ownerTransaction({ opaque: true } as never);
    const input = {
      organizationId: 'org-1',
      salesProductId: 'draft-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
      masterProductId: '00000000-0000-4000-8000-000000000010',
      optionLinks: [],
    };
    const repository = {
      resolveProductRegistration: vi.fn().mockResolvedValue({
        listingId: 'listing-1',
        channelAccountId: 'account-1',
        channel: 'coupang',
        externalId: '427011919',
        status: 'active',
      }),
    };
    const service = new ChannelRegistrationService(repository as never, {} as never);

    await expect(service.resolveProductRegistration(tx, input)).resolves.toEqual(
      expect.objectContaining({ listingId: 'listing-1' }),
    );
    expect(repository.resolveProductRegistration).toHaveBeenCalledWith(tx, input);
  });

  it('replays the owner receipt through the repository without provider submission', async () => {
    const tx = ownerTransaction({ opaque: true } as never);
    const input = {
      organizationId: 'org-1',
      salesProductId: 'draft-1',
      channelAccountId: 'account-1',
      submissionKey: 'submission-key-1',
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
      ownerCapabilityKey: 'channels.register_confirmed_listing' as const,
      ownerIdempotencyKey: 'capability-invocation:00000000-0000-4000-8000-000000000001',
      ownerRequestHash: 'a'.repeat(64),
    };
    const repository = {
      resolveProductRegistrationWithOwnerReceipt: vi.fn().mockResolvedValue({
        listingId: 'listing-1',
        channelAccountId: 'account-1',
        channel: 'coupang',
        externalId: '427011919',
        status: 'active',
      }),
    };
    const service = new ChannelRegistrationService(repository as never, {} as never);

    await service.resolveProductRegistrationWithOwnerReceipt(tx, input);
    expect(repository.resolveProductRegistrationWithOwnerReceipt).toHaveBeenCalledWith(tx, input);
  });
});
