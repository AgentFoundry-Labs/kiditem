import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceArchiveRepositoryAdapter } from '../sourcing-workspace-archive.repository.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVED_AT = new Date('2026-05-15T08:00:00.000Z');

describe('SourcingWorkspaceArchiveRepositoryAdapter', () => {
  it('archives candidate-bound detail-page, content asset, and thumbnail outputs without touching adopted product data', async () => {
    const scope = {
      contentWorkspace: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentWorkspaceThumbnailSelection: {
        deleteMany: vi.fn(),
      },
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'generation-1' },
          { id: 'generation-2' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      detailPageArtifact: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: 'asset-1' }, { id: 'asset-2' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'asset-1' }, { id: 'asset-2' }]),
      thumbnailGeneration: {
        updateMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
    };
    const repository = new SourcingWorkspaceArchiveRepositoryAdapter();

    await expect(
      repository.archiveSourcingWorkspace(scope, {
        organizationId: ORG,
        sourceCandidateId: CANDIDATE_ID,
        archivedAt: ARCHIVED_AT,
      }),
    ).resolves.toEqual({
      archivedContentGenerations: 2,
      archivedDetailPageArtifacts: 1,
      archivedContentAssets: 3,
      archivedThumbnailGenerations: 4,
    });

    expect(scope.contentGeneration.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        OR: [
          { sourceCandidateId: CANDIDATE_ID },
          { sources: { some: { sourceCandidateId: CANDIDATE_ID } } },
          { contentWorkspace: { sourceCandidateId: CANDIDATE_ID } },
        ],
      },
      select: { id: true },
    });
    expect(scope.contentWorkspace.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        sourceCandidateId: CANDIDATE_ID,
        status: 'active',
        isDeleted: false,
      },
      data: {
        status: 'archived',
        currentThumbnailSelectionId: null,
        isDeleted: true,
        deletedAt: ARCHIVED_AT,
      },
    });
    expect(scope.contentWorkspaceThumbnailSelection.deleteMany).not.toHaveBeenCalled();
    expect(scope.detailPageArtifact.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        OR: [
          { contentWorkspace: { sourceCandidateId: CANDIDATE_ID } },
          { sourceContentGenerationId: { in: ['generation-1', 'generation-2'] } },
        ],
      },
      data: { isDeleted: true, deletedAt: ARCHIVED_AT },
    });
    expect(scope.contentAsset.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['asset-1', 'asset-2'] },
        organizationId: ORG,
        isDeleted: false,
        usages: {
          some: { contentGenerationId: { in: ['generation-1', 'generation-2'] } },
          none: {
            contentGeneration: {
              organizationId: ORG,
              isDeleted: false,
              id: { notIn: ['generation-1', 'generation-2'] },
            },
          },
        },
        thumbnailSelections: {
          none: {
            currentForWorkspace: {
              is: {
                organizationId: ORG,
                status: 'active',
                isDeleted: false,
              },
            },
          },
        },
      },
      data: { isDeleted: true, deletedAt: ARCHIVED_AT },
    });
    expect(scope.$queryRaw).toHaveBeenCalledTimes(4);
    expect(scope.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      scope.contentWorkspace.updateMany.mock.invocationCallOrder[0],
    );
    expect(scope.contentWorkspace.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      scope.$queryRaw.mock.invocationCallOrder[1],
    );
    expect(scope.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(
      scope.contentAsset.updateMany.mock.invocationCallOrder[0],
    );
    expect(scope.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        id: { in: ['generation-1', 'generation-2'] },
      },
      data: { isDeleted: true, deletedAt: ARCHIVED_AT },
    });
    expect(scope.thumbnailGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        sourceCandidateId: CANDIDATE_ID,
        isDeleted: false,
        thumbnailSelections: { none: {} },
      },
      data: { isDeleted: true, deletedAt: ARCHIVED_AT },
    });
  });
});
