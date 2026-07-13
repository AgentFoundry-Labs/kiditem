import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../common/legacy-family-master-scope';
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
            channel: 'coupang',
            channelAccountId: 'account-1',
            externalId: '427011919',
            status: 'inactive',
          })
          .mockResolvedValueOnce({
            id: 'listing-1',
            channel: 'coupang',
            channelAccountId: 'account-1',
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
        isDeleted: false,
        deletedAt: null,
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

  it('accepts confirmed listings only for legacy-family Masters, not staged Sellpia identities', async () => {
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'master-1', name: 'Family product' }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'listing-1',
          masterId: 'master-1',
          channel: 'coupang',
          channelAccountId: 'account-1',
          externalId: '427011919',
          channelName: 'Family product',
          channelPrice: null,
          status: 'active',
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter(prisma as never);

    await repository.registerConfirmedListing('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      externalId: '427011919',
    });

    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'master-1',
        organizationId: 'org-1',
        isDeleted: false,
        ...LEGACY_FAMILY_MASTER_SCOPE,
      },
      select: { id: true, name: true },
    });
  });
});
