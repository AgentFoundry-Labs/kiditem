import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceArchiveRepositoryAdapter } from '../sourcing-workspace-archive.repository.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVED_AT = new Date('2026-05-15T08:00:00.000Z');

describe('SourcingWorkspaceArchiveRepositoryAdapter', () => {
  it('archives candidate-bound detail-page, content asset, and thumbnail outputs without touching adopted product data', async () => {
    const scope = {
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
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
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
          { detailPageArtifact: { is: { sourceCandidateId: CANDIDATE_ID } } },
        ],
      },
      select: { id: true },
    });
    expect(scope.detailPageArtifact.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        OR: [
          { sourceCandidateId: CANDIDATE_ID },
          { sourceContentGenerationId: { in: ['generation-1', 'generation-2'] } },
        ],
      },
      data: { isDeleted: true, deletedAt: ARCHIVED_AT },
    });
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
      },
      data: { isDeleted: true, deletedAt: ARCHIVED_AT },
    });
  });
});
