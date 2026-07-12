import { describe, expect, it, vi } from 'vitest';
import { ThumbnailWingRepositoryAdapter } from '../thumbnail-wing.repository.adapter';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../../common/legacy-family-master-scope';

describe('ThumbnailWingRepositoryAdapter', () => {
  it('keeps staged Sellpia identities out of registrable family lookup', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const repository = new ThumbnailWingRepositoryAdapter(prisma as never);

    await repository.findRegistrableMaster('master-1', 'org-1');

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'master-1',
          organizationId: 'org-1',
          isDeleted: false,
          ...LEGACY_FAMILY_MASTER_SCOPE,
        },
      }),
    );
  });

  it('updates registration attempts with organization and generation scope', async () => {
    const prisma = {
      thumbnailRegistrationAttempt: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new ThumbnailWingRepositoryAdapter(prisma as never);

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
      where: { id: 'attempt-1', organizationId: 'org-1', generationId: 'generation-1' },
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
    const repository = new ThumbnailWingRepositoryAdapter(prisma as never);

    await expect(
      repository.updateRegistrationAttemptOrThrow('attempt-1', 'other-org', { status: 'failed' }),
    ).rejects.toThrow('ThumbnailRegistrationAttempt attempt-1 not found');

    expect(prisma.thumbnailRegistrationAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'attempt-1', organizationId: 'other-org' },
      data: { status: 'failed' },
    });
  });
});
