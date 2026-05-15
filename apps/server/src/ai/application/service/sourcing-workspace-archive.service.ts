import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AiWorkspaceArchivePort,
  ArchiveSourcingWorkspaceInput,
  ArchiveSourcingWorkspaceResult,
} from '../port/in/sourcing-workspace-archive.port';

@Injectable()
export class SourcingWorkspaceArchiveService implements AiWorkspaceArchivePort {
  async archiveSourcingWorkspace(
    tx: Prisma.TransactionClient,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult> {
    const generationWhere = contentGenerationSourceCandidateWhere(input);
    const generationRows = await tx.contentGeneration.findMany({
      where: generationWhere,
      select: { id: true },
    });
    const generationIds = generationRows.map((row) => row.id);

    const detailPageArtifacts = await tx.detailPageArtifact.updateMany({
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
      ? await tx.contentAsset.updateMany({
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
      ? await tx.contentGeneration.updateMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          id: { in: generationIds },
        },
        data: archiveData(input.archivedAt),
      })
      : { count: 0 };

    const thumbnailGenerations = await tx.thumbnailGeneration.updateMany({
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

function contentGenerationSourceCandidateWhere(
  input: ArchiveSourcingWorkspaceInput,
): Prisma.ContentGenerationWhereInput {
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
