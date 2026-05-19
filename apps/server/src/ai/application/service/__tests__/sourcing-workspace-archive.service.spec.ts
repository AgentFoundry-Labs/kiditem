import { describe, expect, it, vi } from 'vitest';
import type { SourcingWorkspaceArchiveRepositoryPort } from '../../port/out/repository/sourcing-workspace-archive.repository.port';
import { SourcingWorkspaceArchiveService } from '../sourcing-workspace-archive.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVED_AT = new Date('2026-05-15T08:00:00.000Z');

describe('AI SourcingWorkspaceArchiveService', () => {
  it('delegates candidate AI artifact archival to the archive repository', async () => {
    const scope = {
      contentGeneration: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      detailPageArtifact: {
        updateMany: vi.fn(),
      },
      contentAsset: {
        updateMany: vi.fn(),
      },
      thumbnailGeneration: {
        updateMany: vi.fn(),
      },
    };
    const repository: SourcingWorkspaceArchiveRepositoryPort = {
      archiveSourcingWorkspace: vi.fn().mockResolvedValue({
        archivedContentGenerations: 2,
        archivedDetailPageArtifacts: 1,
        archivedContentAssets: 3,
        archivedThumbnailGenerations: 4,
      }),
    };
    const service = new SourcingWorkspaceArchiveService(repository);

    await expect(
      service.archiveSourcingWorkspace(scope, {
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

    expect(repository.archiveSourcingWorkspace).toHaveBeenCalledWith(scope, {
      organizationId: ORG,
      sourceCandidateId: CANDIDATE_ID,
      archivedAt: ARCHIVED_AT,
    });
  });
});
