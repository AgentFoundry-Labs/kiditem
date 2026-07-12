import { describe, expect, it, vi } from 'vitest';
import { ContentArchiveRepositoryAdapter } from '../content-archive.repository.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';

describe('ContentArchiveRepositoryAdapter', () => {
  it('lists archive workspace generations with organization and non-deleted scope', async () => {
    const prisma = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ContentArchiveRepositoryAdapter(prisma as never);

    await repository.listWorkspaceGenerations({
      organizationId: ORG,
      query: {},
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, isDeleted: false },
        include: expect.objectContaining({
          assetUsages: expect.any(Object),
        }),
      }),
    );
  });

  it('keeps product workspace queries scoped to the requested product id', async () => {
    const prisma = {
      contentGeneration: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ContentArchiveRepositoryAdapter(prisma as never);

    await repository.listProductWorkspaceGenerations({
      organizationId: ORG,
      productId: PRODUCT_ID,
      query: {},
      page: 1,
      limit: 24,
    });

    expect(prisma.contentGeneration.count).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        generationGroup: { targetMasterId: PRODUCT_ID },
      },
    });
    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          isDeleted: false,
          generationGroup: { targetMasterId: PRODUCT_ID },
        },
      }),
    );
  });

  it('links sourcing candidate generations through direct, source, and artifact references', async () => {
    const prisma = {
      contentGeneration: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ContentArchiveRepositoryAdapter(prisma as never);

    await repository.listSourcingCandidateGenerations({
      organizationId: ORG,
      candidateId: CANDIDATE_ID,
      query: {},
      page: 1,
      limit: 24,
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          OR: [
            { sourceCandidateId: CANDIDATE_ID },
            { sources: { some: { sourceCandidateId: CANDIDATE_ID } } },
            { detailPageArtifact: { is: { sourceCandidateId: CANDIDATE_ID, isDeleted: false } } },
          ],
          isDeleted: false,
        },
      }),
    );
  });

  it('soft-deletes a product workspace without deleting the MasterProduct row', async () => {
    const tx = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'generation-product-1', generationGroupId: GROUP_ID },
          { id: 'generation-product-2', generationGroupId: GROUP_ID },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      contentAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (txArg: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ContentArchiveRepositoryAdapter(prisma as never);

    await expect(repository.deleteProductWorkspace({
      organizationId: ORG,
      productId: PRODUCT_ID,
    })).resolves.toEqual({
      status: 'deleted',
      deletedGenerations: 2,
      deletedAssets: 0,
    });

    expect(tx.contentGeneration.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, isDeleted: false, generationGroup: { targetMasterId: PRODUCT_ID } },
      select: { id: true, generationGroupId: true },
    });
    expect(tx.contentAsset.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['asset-1'] },
        organizationId: ORG,
        isDeleted: false,
        usages: {
          some: { contentGenerationId: { in: ['generation-product-1', 'generation-product-2'] } },
          none: {
            contentGeneration: {
              organizationId: ORG,
              isDeleted: false,
              id: { notIn: ['generation-product-1', 'generation-product-2'] },
            },
          },
        },
        thumbnailSelections: { none: {} },
      },
      data: expect.objectContaining({ isDeleted: true }),
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contentAsset.updateMany.mock.invocationCallOrder[0],
    );
    expect(tx.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        id: { in: ['generation-product-1', 'generation-product-2'] },
      },
      data: expect.objectContaining({ isDeleted: true }),
    });
  });
});
