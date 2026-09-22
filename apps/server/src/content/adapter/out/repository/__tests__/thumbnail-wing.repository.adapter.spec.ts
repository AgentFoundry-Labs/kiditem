import { describe, expect, it, vi } from 'vitest';
import { ownerTransactionClient } from '../../../../../prisma/owner-transaction';
import { ThumbnailWingRepositoryAdapter } from '../thumbnail-wing.repository.adapter';

describe('ThumbnailWingRepositoryAdapter', () => {
  it('resolves an active Coupang listing through the owner port in the workspace transaction', async () => {
    const transaction = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          displayName: 'Workspace product',
          channelListingId: 'listing-1',
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)),
    };
    const channelListings = {
      readCatalogFacts: vi.fn().mockResolvedValue([{
        id: 'listing-1',
        channelName: 'Wing name',
      }]),
    };
    const repository = new ThumbnailWingRepositoryAdapter(prisma as never, channelListings as never);

    await expect(repository.findRegistrableWorkspace('workspace-1', 'org-1')).resolves.toEqual({
      displayName: 'Workspace product',
      channelListing: { channelName: 'Wing name' },
    });

    expect(transaction.contentWorkspace.findFirst).toHaveBeenCalledWith({
      where: {
          id: 'workspace-1',
          organizationId: 'org-1',
          isDeleted: false,
          status: 'active',
      },
      select: { displayName: true, channelListingId: true },
    });
    const [ownerTx, query] = channelListings.readCatalogFacts.mock.calls[0];
    expect(ownerTransactionClient(ownerTx as never)).toBe(transaction);
    expect(query).toEqual({
      organizationId: 'org-1',
      listingIds: ['listing-1'],
      channels: ['coupang'],
      activeOnly: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'RepeatableRead' },
    );
  });

  it('does not return the workspace when the Channels owner cannot resolve an active Coupang listing', async () => {
    const transaction = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({ displayName: 'Workspace product', channelListingId: 'listing-1' }),
      },
    };
    const channelListings = { readCatalogFacts: vi.fn().mockResolvedValue([]) };
    const repository = new ThumbnailWingRepositoryAdapter({
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)),
    } as never, channelListings as never);

    await expect(repository.findRegistrableWorkspace('workspace-1', 'org-1')).resolves.toBeNull();
    expect(channelListings.readCatalogFacts).toHaveBeenCalledTimes(1);
  });

  it('updates registration attempts with organization and generation scope', async () => {
    const prisma = {
      thumbnailRegistrationAttempt: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new ThumbnailWingRepositoryAdapter(prisma as never, { readCatalogFacts: vi.fn() } as never);

    await repository.updateRegistrationAttemptOrThrow(
      'attempt-1',
      'org-1',
      {
        status: 'uploaded',
        errorMessage: null,
        screenshotUrl: 'chrome-extension://capture/attempt-1.png',
        finishedAt: new Date('2026-05-19T00:00:00.000Z'),
      },
      'generation-1',
    );

    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'attempt-1',
        organizationId: 'org-1',
        generationId: 'generation-1',
      },
      data: expect.objectContaining({
        status: 'uploaded',
        errorMessage: null,
        screenshotUrl: 'chrome-extension://capture/attempt-1.png',
      }),
    });
  });

  it('throws when a scoped registration attempt update does not match a row', async () => {
    const prisma = {
      thumbnailRegistrationAttempt: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const repository = new ThumbnailWingRepositoryAdapter(prisma as never, { readCatalogFacts: vi.fn() } as never);

    await expect(
      repository.updateRegistrationAttemptOrThrow('attempt-1', 'other-org', {
        status: 'failed',
      }),
    ).rejects.toThrow('ThumbnailRegistrationAttempt attempt-1 not found');

    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', organizationId: 'other-org' },
      data: { status: 'failed' },
    });
  });
});
