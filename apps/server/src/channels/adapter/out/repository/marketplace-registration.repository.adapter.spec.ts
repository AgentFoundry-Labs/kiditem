import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MarketplaceRegistrationRepositoryAdapter } from './marketplace-registration.repository.adapter';

describe('MarketplaceRegistrationRepositoryAdapter preparation registration', () => {
  it('reactivates the account identity and attaches an immutable source candidate without a Master', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
      },
      channelListing: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'listing-1',
            sourceCandidateId: null,
            channelAccountId: 'account-1',
            channelAccount: { channel: 'coupang' },
            externalId: '427011919',
            status: 'inactive',
          })
          .mockResolvedValueOnce({
            id: 'listing-1',
            channelAccountId: 'account-1',
            channelAccount: { channel: 'coupang' },
            externalId: '427011919',
            status: 'active',
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter({} as never);

    await expect(repository.resolveProductRegistration(tx, {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
    })).resolves.toEqual({
      listingId: 'listing-1',
      channel: 'coupang',
      channelAccountId: 'account-1',
      externalId: '427011919',
      status: 'active',
    });
    expect(tx.channelListing.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'listing-1',
        organizationId: 'org-1',
        OR: [
          { sourceCandidateId: null },
          { sourceCandidateId: 'candidate-1' },
        ],
      },
      data: {
        sourceCandidateId: 'candidate-1',
        displayName: 'Kids rain boots',
        status: 'active',
        isActive: true,
      },
    });
  });

  it('rejects reassignment of a listing already sourced from another candidate', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'other-candidate',
        }),
        updateMany: vi.fn(),
      },
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter({} as never);

    await expect(repository.resolveProductRegistration(tx, {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.channelListing.updateMany).not.toHaveBeenCalled();
  });

  it('normalizes exact option identities before enforcing uniqueness', async () => {
    const findVariants = vi.fn().mockResolvedValue([]);
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
      },
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'product-1' }),
      },
      productVariant: { findMany: findVariants },
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter({} as never);

    await expect(repository.resolveProductRegistration(tx, {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      channelAccountId: 'account-1',
      externalListingId: '427011919',
      displayName: 'Kids rain boots',
      masterProductId: 'product-1',
      optionLinks: [
        { externalOptionId: 'OPTION-1', productVariantId: 'variant-1' },
        { externalOptionId: ' OPTION-1 ', productVariantId: 'variant-1' },
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(findVariants).not.toHaveBeenCalled();
  });
});
