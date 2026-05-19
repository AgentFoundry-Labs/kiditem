import { Injectable } from '@nestjs/common';
import type {
  AiWorkspaceArchiveScope,
  ArchiveSourcingWorkspaceInput,
  ArchiveSourcingWorkspaceResult,
} from '../../../application/port/in/workspace/sourcing-workspace-archive.port';
import type { SourcingWorkspaceArchiveRepositoryPort } from '../../../application/port/out/repository/sourcing-workspace-archive.repository.port';

@Injectable()
export class SourcingWorkspaceArchiveRepositoryAdapter
implements SourcingWorkspaceArchiveRepositoryPort {
  async archiveSourcingWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult> {
    const generationRows = await scope.contentGeneration.findMany({
      where: contentGenerationSourceCandidateWhere(input),
      select: { id: true },
    });
    const generationIds = generationRows.map((row) => row.id);

    const detailPageArtifacts = await scope.detailPageArtifact.updateMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        OR: [
          { sourceCandidateId: input.sourceCandidateId },
          ...(generationIds.length > 0
            ? [{ sourceContentGenerationId: { in: generationIds } }]
            : []),
        ],
      },
      data: archiveData(input.archivedAt),
    });

    const contentAssets = generationIds.length > 0
      ? await scope.contentAsset.updateMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          usages: {
            some: { contentGenerationId: { in: generationIds } },
            none: {
              contentGeneration: {
                organizationId: input.organizationId,
                isDeleted: false,
                id: { notIn: generationIds },
              },
            },
          },
        },
        data: archiveData(input.archivedAt),
      })
      : { count: 0 };

    const contentGenerations = generationIds.length > 0
      ? await scope.contentGeneration.updateMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          id: { in: generationIds },
        },
        data: archiveData(input.archivedAt),
      })
      : { count: 0 };

    const thumbnailGenerations = await scope.thumbnailGeneration.updateMany({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        isDeleted: false,
      },
      data: archiveData(input.archivedAt),
    });

    return {
      archivedContentGenerations: contentGenerations.count,
      archivedDetailPageArtifacts: detailPageArtifacts.count,
      archivedContentAssets: contentAssets.count,
      archivedThumbnailGenerations: thumbnailGenerations.count,
    };
  }
}

function contentGenerationSourceCandidateWhere(input: ArchiveSourcingWorkspaceInput) {
  return {
    organizationId: input.organizationId,
    isDeleted: false,
    OR: [
      { sourceCandidateId: input.sourceCandidateId },
      { sources: { some: { sourceCandidateId: input.sourceCandidateId } } },
      { detailPageArtifact: { is: { sourceCandidateId: input.sourceCandidateId } } },
    ],
  };
}

function archiveData(archivedAt: Date) {
  return { isDeleted: true, deletedAt: archivedAt };
}
