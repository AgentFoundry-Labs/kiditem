import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { describe, expect, it, vi } from 'vitest';
import { RegistrationContentWorkspaceRepositoryAdapter } from './registration-content-workspace.repository.adapter';

function makeRepository(prisma: unknown = {}) {
  return new RegistrationContentWorkspaceRepositoryAdapter(prisma as never, {
    lockActiveOwner: vi.fn().mockResolvedValue({
      id: 'listing-1',
      accountId: 'account-1',
    }),
  } as never);
}

describe('RegistrationContentWorkspaceRepositoryAdapter', () => {
  // 선택 해석 · 검증 · 워크스페이스 보장 · 상세 가져오기는 registration-content-workspace.pg.integration.spec.ts 가 실제 PostgreSQL 로 본다.
  it('attaches the listing to the draft workspace instead of cloning a second one', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'draft-workspace-1', channelListingId: null }]),
      contentWorkspace: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
      detailPageArtifact: { create: vi.fn() },
      contentWorkspaceThumbnailSelection: { create: vi.fn() },
    };
    const repository = makeRepository();

    await expect(repository.attachToListing(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      listingId: 'listing-1',
    })).resolves.toEqual({ workspaceId: 'draft-workspace-1' });

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
    expect(tx.detailPageArtifact.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspaceThumbnailSelection.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspace.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'draft-workspace-1',
        organizationId: 'org-1',
        channelListingId: null,
        status: 'active',
        isDeleted: false,
      },
      data: { channelListingId: 'listing-1' },
    });
  });

  it('fails the attach when the workspace changed between the lock and the update', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'draft-workspace-1', channelListingId: null }]),
      contentWorkspace: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const repository = makeRepository();

    await expect(repository.attachToListing(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      listingId: 'listing-1',
    })).rejects.toThrow('Content workspace changed while the listing was being attached.');
  });
});
